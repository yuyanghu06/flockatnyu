import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {createAutomationStore} from '../server/automation/store.js';
import {createAutomationHandler} from '../server/automation/handler.js';
import {readAutomationConfig} from '../server/automation/config.js';
const allowed=randomUUID(),second=randomUUID(),denied=randomUUID();
const scope=[allowed,second],config=readAutomationConfig({AGENT_AUTOMATION_ENABLED:'true'});
const args={p_allowed_source_ids:scope,p_min_events:30,p_max_age_seconds:1800,p_cooldown_seconds:60,p_lease_seconds:120,p_max_inputs:20,p_max_bytes:65536};
async function rpc(db,name,args={}){const names=Object.keys(args);return (await db.query(`select public.${name}(${names.map((n,i)=>`${n}=>$${i+1}`).join(',')}) result`,Object.values(args).map(v=>v&&typeof v==='object'&&!Array.isArray(v)?JSON.stringify(v):v))).rows[0].result;}
const claim=(db,patch={})=>rpc(db,'agent_automation_claim_scoped',{...args,...patch});
const envelope=(id,sourceId=allowed)=>({source:'discord',source_id:sourceId,event_type:'message_created',event_id:String(id),revision:'1',received_at:new Date().toISOString(),payload:{id:String(id),guild_id:'100',channel_id:'200',content:'Synthetic original'}});
async function enqueue(db,id,sourceId=allowed){const uuid=randomUUID();await rpc(db,'agent_automation_enqueue',{p_input_id:uuid,p_envelope:envelope(id,sourceId)});return uuid;}
async function reset(db){await db.exec("reset role;truncate public.agent_input_cache,public.agent_automation_state;insert into public.agent_automation_state values('runner','{}');set role service_role;");}
async function expireRunner(db){await db.exec("update public.agent_automation_state set data=jsonb_build_object('last_started',clock_timestamp()-interval '61 seconds','lease_until',clock_timestamp()-interval '1 second') where key='runner'");}
const migration=name=>readFile(new URL(`../supabase/migrations/${name}`,import.meta.url),'utf8');

test('032 real SQL filters source scope before trigger counting, oldest age and candidate limit',async t=>{
 const db=new PGlite();try{
  await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create role scoped_public_probe;');
  await db.exec(await migration('202610170018_agent_input_cache.sql'));await db.exec(await migration('202610170019_agent_automation_state.sql'));
  const original=(await db.query("select oid::regprocedure::text signature,pg_get_functiondef(oid) body,proacl::text acl from pg_proc where pronamespace='public'::regnamespace order by 1")).rows;
  await db.exec(await migration('202610180032_scoped_agent_claim.sql'));
  await t.test('old RPCs and ACLs unchanged; new service-only invoker has exact signature',async()=>{
   assert.deepEqual((await db.query("select oid::regprocedure::text signature,pg_get_functiondef(oid) body,proacl::text acl from pg_proc where pronamespace='public'::regnamespace and proname<>'agent_automation_claim_scoped' order by 1")).rows,original);
   const found=(await db.query("select oid::regprocedure::text signature,prosecdef,proconfig from pg_proc where pronamespace='public'::regnamespace and proname='agent_automation_claim_scoped'")).rows;assert.equal(found.length,1);assert.equal(found[0].prosecdef,false);assert.deepEqual(found[0].proconfig,['search_path=""']);
   for(const role of ['anon','authenticated','scoped_public_probe','service_role']){
    assert.equal((await db.query("select has_function_privilege($1,$2,'EXECUTE') allowed",[role,found[0].signature])).rows[0].allowed,role==='service_role');
    if(role!=='service_role'){await db.exec(`set role ${role}`);await assert.rejects(claim(db),e=>e.code==='42501');await db.exec('reset role');}
   }
  });
  await t.test('54 older unauthorized inputs cannot occupy candidate limit or block100 authorized inputs',async()=>{
   await reset(db);for(let i=0;i<54;i++)await enqueue(db,i,denied);
   await db.exec("update public.agent_automation_state set data=jsonb_set(data,'{received_at}',to_jsonb(clock_timestamp()-interval '2 hours')) where key like 'input:%'");
   for(let i=54;i<154;i++)await enqueue(db,i,i%2?allowed:second);
   const before=(await db.query('select uuid,raw_response from public.agent_input_cache order by uuid')).rows;
   const c=await claim(db);assert.equal(c.status,'ready');assert.equal(c.inputs.length,20);assert(c.inputs.every(r=>scope.includes(r.raw_response.source_id)));
   assert.deepEqual((await db.query('select uuid,raw_response from public.agent_input_cache order by uuid')).rows,before,'Claim neither deletes nor changes source content');
   const deniedIds=before.filter(r=>r.raw_response.source_id===denied).map(r=>r.uuid);
   assert.equal(await rpc(db,'agent_automation_finish',{p_token:c.leaseToken,p_handled_ids:[deniedIds[0]]}),false,'Cannot finish an unclaimed unauthorized input');
   assert.equal(await rpc(db,'agent_automation_finish',{p_token:c.leaseToken,p_handled_ids:c.inputs.map(i=>i.uuid)}),true);
   assert.equal((await db.query('select count(*)::int n from public.agent_input_cache')).rows[0].n,134);
   assert.equal((await db.query("select count(*)::int n from public.agent_input_cache where raw_response->>'source_id'=$1",[denied])).rows[0].n,54);
   assert.equal((await claim(db)).status,'cooldown');await expireRunner(db);assert.equal((await claim(db)).status,'ready');
  });
  await t.test('unauthorized counts and old timestamps do not trigger29 fresh authorized inputs',async()=>{
   await reset(db);for(let i=0;i<54;i++)await enqueue(db,i,denied);
   await db.exec("update public.agent_automation_state set data=jsonb_set(data,'{received_at}',to_jsonb(clock_timestamp()-interval '2 hours')) where key like 'input:%'");
   for(let i=54;i<83;i++)await enqueue(db,i);assert.equal((await claim(db)).status,'waiting');
   await enqueue(db,83);assert.equal((await claim(db)).status,'ready');
   await reset(db);await enqueue(db,1,denied);assert.equal((await claim(db)).status,'empty');
   const id=await enqueue(db,2);assert.equal((await claim(db)).status,'waiting');
   await db.query("update public.agent_automation_state set data=jsonb_set(data,'{received_at}',to_jsonb(clock_timestamp()-interval '1801 seconds')) where key=$1",['input:'+id]);
   const aged=await claim(db);assert.equal(aged.status,'ready');assert.deepEqual(aged.inputs.map(i=>i.uuid),[id]);
  });
  await t.test('scope change, deferred retry, lease ownership and optimistic snapshot fences remain intact',async()=>{
   await reset(db);const id=await enqueue(db,1);
   const c=await claim(db,{p_min_events:1});assert.equal(c.status,'ready');assert.equal((await claim(db,{p_min_events:1})).status,'busy');
   assert.equal(await rpc(db,'agent_automation_renew',{p_token:c.leaseToken,p_lease_seconds:120}),true);
   assert.equal(await rpc(db,'agent_automation_renew',{p_token:randomUUID(),p_lease_seconds:120}),false);
   assert.equal(await rpc(db,'agent_automation_release',{p_token:c.leaseToken}),true);await expireRunner(db);
   assert.equal((await claim(db,{p_min_events:1})).status,'empty','Released snapshot waits existing five-minute backoff');
   await db.exec("update public.agent_automation_state set data=data-'next_attempt_at' where key like 'input:%'");
   assert.equal((await claim(db,{p_min_events:1,p_allowed_source_ids:[second]})).status,'empty','Narrowed scope cannot read a previously eligible source');
   const fresh=await claim(db,{p_min_events:1});assert.equal(fresh.status,'ready');assert.notEqual(fresh.leaseToken,c.leaseToken);
   assert.equal(await rpc(db,'agent_automation_finish',{p_token:c.leaseToken,p_handled_ids:[id]}),false);
   await db.query("update public.agent_input_cache set raw_response=jsonb_set(raw_response,'{payload}','{\"changed\":true}') where uuid=$1",[id]);
   assert.equal(await rpc(db,'agent_automation_finish',{p_token:fresh.leaseToken,p_handled_ids:[id]}),false,'Changed body cannot be acknowledged from old snapshot');
   assert.equal((await db.query('select count(*)::int n from public.agent_input_cache')).rows[0].n,1);
  });
  await t.test('invalid scope/limits and metadata/body source mismatch fail closed',async()=>{
   await reset(db);await enqueue(db,1);
   for(const p_allowed_source_ids of [null,[],[allowed,null],[allowed,allowed],Array.from({length:501},()=>randomUUID())])await assert.rejects(claim(db,{p_allowed_source_ids}),e=>e.code==='23514');
   for(const patch of [{p_max_inputs:21},{p_min_events:null},{p_cooldown_seconds:59},{p_max_bytes:1023}])await assert.rejects(claim(db,patch),e=>e.code==='23514');
   const fiveHundred=Array.from({length:500},()=>randomUUID());assert.equal((await claim(db,{p_allowed_source_ids:fiveHundred,p_min_events:1})).status,'empty');
   await db.query("update public.agent_input_cache set raw_response=jsonb_set(raw_response,'{source_id}',to_jsonb($1::text))",[second]);
   assert.equal((await claim(db,{p_min_events:1})).status,'empty','Mismatched metadata cannot bind a body to another allowed source');
   assert.equal((await db.query('select count(*)::int n from public.agent_input_cache')).rows[0].n,1);
  });
  await t.test('actual Node store and handler wire trusted scope to migrated SQL without legacy fallback',async()=>{
   await reset(db);for(let i=0;i<54;i++)await enqueue(db,i,denied);for(let i=54;i<84;i++)await enqueue(db,i);
   const requests=[],store=createAutomationStore({env:{SUPABASE_URL:'https://db.fixture.test',SUPABASE_SERVICE_ROLE_KEY:'synthetic-secret'},fetchImpl:async(url,init)=>{
    const name=new URL(url).pathname.split('/').at(-1),body=JSON.parse(init.body);requests.push(name);assert.equal(init.redirect,'error');
    if(name==='agent_automation_claim_scoped')assert.deepEqual(body.p_allowed_source_ids,scope);
    return Response.json(await rpc(db,name,body));
   }});
   assert.equal(store.requiresScopedClaims,true);
   const principal={id:'fixture',allowedSourceIds:scope},tools=[{name:'inert_read',description:'inert read',readOnly:true,parameters:{type:'object',properties:{},additionalProperties:false},execute:async()=>({status:'ready'})}];
   let model=0,auths=0;
   const handler=createAutomationHandler({config,store,principal,tools,authorizeEvents:async({events})=>{auths++;assert(events.every(e=>scope.includes(e.source_id)));return true;},provider:{toolTurn:async({messages})=>{
    model++;const queued=JSON.parse(messages[0].content).inputs;assert.equal(queued.length,20);assert(queued.every(r=>r.raw_response.source_id===allowed));
    return {stopReason:'tool_calls',toolCalls:[{id:'finish',name:'finish_batch',arguments:{handledInputIds:queued.map(r=>r.uuid)}}]};
   }}});
   assert.equal((await handler.tick()).status,'completed');assert.equal(model,1);assert.equal(auths,3);assert.equal(requests[0],'agent_automation_claim_scoped');assert(!requests.includes('agent_automation_claim'));
   assert.equal((await db.query('select count(*)::int n from public.agent_input_cache')).rows[0].n,64);
  });
 }finally{await db.close();}
});

test('real store refuses empty/malformed scope before HTTP; handler refuses missing production principal scope',async()=>{
 let requests=0;
 const store=createAutomationStore({env:{SUPABASE_URL:'https://db.fixture.test',SUPABASE_SERVICE_ROLE_KEY:'synthetic'},fetchImpl:async()=>{requests++;return new Response(null,{status:404});}});
 for(const allowedSourceIds of [undefined,[],['channel:123'],[allowed,allowed],Array.from({length:501},()=>randomUUID()),[null]])assert.equal((await store.claim({config,allowedSourceIds})).status,'not_configured');
 assert.equal(requests,0);assert.equal((await store.claim({config,allowedSourceIds:scope})).status,'unavailable');assert.equal(requests,1);
 for(const principal of [undefined,{}, {allowedSourceIds:[]},{allowedSourceIds:['invalid']}]){
  const handler=createAutomationHandler({config,store,principal,tools:[{name:'inert',description:'inert read',readOnly:true,parameters:{type:'object',properties:{}},execute:async()=>({status:'ready'})}],authorizeEvent:async()=>true,provider:{toolTurn:async()=>{throw Error('No model allowed');}}});
  assert.equal((await handler.tick()).status,'not_configured');
 }
 assert.equal(requests,1);
});
