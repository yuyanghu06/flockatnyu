import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {vector} from '@electric-sql/pglite-pgvector';
import {eventUuid} from '../server/automation/events.js';
import {readAutomationConfig} from '../server/automation/config.js';
import {createAutomationStore} from '../server/automation/store.js';

async function migration(number){const dir=new URL('../supabase/migrations/',import.meta.url);const file=(await readdir(dir)).find(f=>f.endsWith('.sql')&&Number(f.slice(8,12))===number);assert(file);return readFile(new URL(file,dir),'utf8');}
async function rpc(db,name,args={}){const keys=Object.keys(args);return(await db.query(`select public.${name}(${keys.map((key,i)=>key+' => $'+(i+1)).join(',')}) result`,keys.map(key=>args[key]!==null&&typeof args[key]==='object'&&!Array.isArray(args[key])?JSON.stringify(args[key]):args[key]))).rows[0].result;}
// Historical migration fixtures keep explicit limits; current defaults are exercised below.
const claimArgs={p_min_events:5,p_max_age_seconds:300,p_cooldown_seconds:60,p_lease_seconds:120,p_max_inputs:20,p_max_bytes:65536};
const claim=(db,overrides={})=>rpc(db,'agent_automation_claim',{...claimArgs,...overrides});
const envelope=(n,revision='r1')=>({source:'discord',source_id:'channel:123',event_type:'message_updated',event_id:'event'+n,revision,received_at:'1900-01-01T00:00:00Z',payload:{content:'Original raw body '+n,nested:{keep:true}}});
const inputId=e=>eventUuid({source:e.source,sourceId:e.source_id,eventType:e.event_type,eventId:e.event_id,revision:e.revision});
const enqueue=(db,n,revision='r1')=>{const e=envelope(n,revision);return rpc(db,'agent_automation_enqueue',{p_input_id:inputId(e),p_envelope:e});};
async function reset(db){await db.exec("reset role;truncate public.agent_input_cache,public.agent_automation_state;insert into public.agent_automation_state values('runner','{}');set role service_role;");}
async function ageInputs(db){await db.exec("update public.agent_automation_state set data=jsonb_set(data,'{received_at}',to_jsonb(clock_timestamp()-interval '301 seconds')) where key like 'input:%'");}
async function ageRunner(db){await db.exec("update public.agent_automation_state set data=data||jsonb_build_object('lease_until',clock_timestamp()-interval '1 second','last_started',clock_timestamp()-interval '61 seconds') where key='runner'");}
async function ageDeferred(db){await db.exec("update public.agent_automation_state set data=jsonb_set(data,'{next_attempt_at}',to_jsonb(clock_timestamp()-interval '1 second')) where key like 'input:%' and data ? 'next_attempt_at'");}

test('019 real SQL: durable hybrid trigger, lease fences, receipts and subscription checkpoints',async t=>{
 const db=new PGlite({extensions:{vector}});
 try{
  await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create role automation_public_probe;');
  for(let n=1;n<=18;n++)await db.exec(await migration(n));
  await db.exec("insert into public.knowledge_sources(kind,external_id,title,status) values('manual','m34-retain','Retained source','active');insert into public.discord_view_policies(guild_id) values('1203562091500404776');select public.miro_sync_register(p_board_id=>'m34-retained-board');");
  const oldNames=(await db.query("select relname from pg_class where relnamespace='public'::regnamespace and relkind='r' order by relname")).rows.map(r=>r.relname);
  const before={};for(const name of oldNames)before[name]=(await db.query(`select to_jsonb(t) row from public.${name} t order by to_jsonb(t)::text`)).rows;
  await db.exec(await migration(19));
  const config=readAutomationConfig({AGENT_AUTOMATION_ENABLED:'true'});
  const store=createAutomationStore({env:{SUPABASE_URL:'https://db.example.test',SUPABASE_SERVICE_ROLE_KEY:'synthetic-key'},fetchImpl:async(url,options)=>{
   const name=new URL(url).pathname.split('/').at(-1);
   assert.equal(name,'agent_automation_claim');
   return Response.json(await rpc(db,name,JSON.parse(options.body)));
  }});
  const defaultClaim=()=>store.claim({config});

  await t.test('019 adds only metadata state;018 remains two columns and existing populated rows survive',async()=>{
   const names=(await db.query("select relname from pg_class where relnamespace='public'::regnamespace and relkind='r' order by relname")).rows.map(r=>r.relname);
   assert.deepEqual(names,[...oldNames,'agent_automation_state'].sort());
   for(const name of oldNames)assert.deepEqual((await db.query(`select to_jsonb(t) row from public.${name} t order by to_jsonb(t)::text`)).rows,before[name]);
   assert.deepEqual((await db.query("select column_name from information_schema.columns where table_schema='public' and table_name='agent_input_cache' order by ordinal_position")).rows.map(r=>r.column_name),['uuid','raw_response']);
   assert.deepEqual((await db.query("select relrowsecurity,relforcerowsecurity from pg_class where oid='public.agent_automation_state'::regclass")).rows,[{relrowsecurity:true,relforcerowsecurity:true}]);
  });

  await t.test('state table and all automation/subscription RPCs are service-only invokers',async()=>{
   const funcs=(await db.query("select oid::regprocedure::text signature,prosecdef from pg_proc where pronamespace='public'::regnamespace and (proname like 'agent_automation_%' or proname like 'agent_subscription_%') order by proname")).rows;
   assert.equal(funcs.length,8);
   for(const f of funcs){assert.equal(f.prosecdef,false);for(const role of ['anon','authenticated','automation_public_probe','service_role'])assert.equal((await db.query('select has_function_privilege($1,$2,\'EXECUTE\') allowed',[role,f.signature])).rows[0].allowed,role==='service_role');}
   for(const role of ['anon','authenticated','automation_public_probe']){
    await db.exec('set role '+role);
    try{await assert.rejects(db.query('select * from public.agent_automation_state'),e=>e.code==='42501');await assert.rejects(rpc(db,'agent_subscription_get_state',{p_key:'subscription:gmail'}),e=>e.code==='42501');}
    finally{await db.exec('reset role');}
   }
   for(const priv of ['TRUNCATE','REFERENCES','TRIGGER'])assert.equal((await db.query("select has_table_privilege('service_role','public.agent_automation_state',$1) allowed",[priv])).rows[0].allowed,false);
   await db.exec('grant select,insert,update,delete on public.agent_automation_state to anon');await db.exec('set role anon');
   try{assert.deepEqual((await db.query('select * from public.agent_automation_state')).rows,[]);await assert.rejects(db.query("insert into public.agent_automation_state values('tamper','{}')"),e=>e.code==='42501');assert.deepEqual((await db.query("update public.agent_automation_state set data='{}' returning key")).rows,[]);assert.deepEqual((await db.query('delete from public.agent_automation_state returning key')).rows,[]);}
   finally{await db.exec('reset role;revoke all on public.agent_automation_state from anon');}
  });

  await t.test('five distinct updates trigger; duplicates do not count and source receipt times are authoritative',async()=>{
   await reset(db);assert.equal((await claim(db)).status,'empty');
   for(let n=0;n<4;n++)assert.equal((await enqueue(db,n)).status,'queued');
   assert.equal((await enqueue(db,0)).status,'duplicate');assert.equal((await claim(db)).status,'waiting');
   const received=(await db.query("select raw_response->>'received_at' value from public.agent_input_cache limit 1")).rows[0].value;
   assert(Date.parse(received)>Date.parse('2026-01-01'),'1900 payload timestamp cannot force an early run');
   await enqueue(db,4);const c=await claim(db);assert.equal(c.status,'ready');assert.equal(c.inputs.length,5);
   const metadata=(await db.query("select data from public.agent_automation_state where key like 'input:%'")).rows;
   for(const {data} of metadata)assert(!Object.hasOwn(data,'payload'),'No raw message bodies duplicated into metadata');
  });

  await t.test('current defaults combine Discord and Gmail:29 fresh inputs wait, duplicate waits,30th triggers a bounded20-input claim',async()=>{
   await reset(db);assert.equal((await defaultClaim()).status,'empty');
   const inputs=Array.from({length:30},(_,n)=>n<15?envelope(n):{...envelope(n),source:'gmail',source_id:'club@example.test',event_type:'email_received'});
   for(const e of inputs.slice(0,29))assert.equal((await rpc(db,'agent_automation_enqueue',{p_input_id:inputId(e),p_envelope:e})).status,'queued');
   assert.equal((await defaultClaim()).status,'waiting','Both sources combined remain below30');
   const duplicate=inputs[15];
   assert.equal((await rpc(db,'agent_automation_enqueue',{p_input_id:inputId(duplicate),p_envelope:duplicate})).status,'duplicate');
   assert.equal((await defaultClaim()).status,'waiting','Email redelivery cannot become the30th input');
   const last=inputs[29];await rpc(db,'agent_automation_enqueue',{p_input_id:inputId(last),p_envelope:last});
   const c=await defaultClaim();assert.equal(c.status,'ready');assert.equal(c.inputs.length,20);
   assert.deepEqual([...new Set(c.inputs.map(i=>i.raw_response.source))].sort(),['discord','gmail']);
   assert.equal(await rpc(db,'agent_automation_finish',{p_token:c.leaseToken,p_handled_ids:c.inputs.map(i=>i.uuid)}),true);
   assert.equal((await db.query('select count(*)::int n from public.agent_input_cache')).rows[0].n,10,'Trigger threshold does not enlarge or discard the unclaimed remainder');
   assert.equal((await defaultClaim()).status,'cooldown');await ageRunner(db);
   assert.equal((await defaultClaim()).status,'waiting','Remaining10 fresh inputs await the next threshold or age limit');
  });

  await t.test('current defaults wait until the oldest eligible input reaches30minutes',async()=>{
   await reset(db);await enqueue(db,0);assert.equal((await defaultClaim()).status,'waiting');
   await db.exec("update public.agent_automation_state set data=jsonb_set(data,'{received_at}',to_jsonb(clock_timestamp()-interval '1790 seconds')) where key like 'input:%'");
   assert.equal((await defaultClaim()).status,'waiting','An input younger than30minutes cannot trigger');
   await db.exec("update public.agent_automation_state set data=jsonb_set(data,'{received_at}',to_jsonb(clock_timestamp()-interval '1801 seconds')) where key like 'input:%'");
   const c=await defaultClaim();assert.equal(c.status,'ready');assert.equal(c.inputs.length,1,'Age trigger does not require30 inputs');
  });

  await t.test('current defaults keep the one-minute cooldown even with30 fresh pending inputs',async()=>{
   await reset(db);await enqueue(db,0);
   await db.exec("update public.agent_automation_state set data=jsonb_set(data,'{received_at}',to_jsonb(clock_timestamp()-interval '1801 seconds')) where key like 'input:%'");
   const first=await defaultClaim();assert.equal(first.status,'ready');
   assert.equal(await rpc(db,'agent_automation_finish',{p_token:first.leaseToken,p_handled_ids:first.inputs.map(i=>i.uuid)}),true);
   for(let n=1;n<=30;n++)await enqueue(db,n);
   await db.exec("update public.agent_automation_state set data=jsonb_build_object('last_started',clock_timestamp()-interval '50 seconds') where key='runner'");
   assert.equal((await defaultClaim()).status,'cooldown','A full queue cannot bypass the60second gap');
   await ageRunner(db);const next=await defaultClaim();assert.equal(next.status,'ready');assert.equal(next.inputs.length,20);
  });

  await t.test('one old update triggers at five minutes; another worker cannot claim while lease active',async()=>{
   await reset(db);await enqueue(db,0);assert.equal((await claim(db)).status,'waiting');await ageInputs(db);
   const [a,b]=await Promise.all([claim(db),claim(db)]);
   assert.deepEqual([a.status,b.status].sort(),['busy','ready']);
   const active=a.status==='ready'?a:b;
   assert.equal(await rpc(db,'agent_automation_renew',{p_token:active.leaseToken,p_lease_seconds:120}),true);
   assert.equal(await rpc(db,'agent_automation_renew',{p_token:randomUUID(),p_lease_seconds:120}),false);
  });

  await t.test('release retains/defer inputs five minutes; durable cooldown blocks fresh events before restart',async()=>{
   await reset(db);await enqueue(db,0);await ageInputs(db);const c=await claim(db);
   assert.equal(await rpc(db,'agent_automation_release',{p_token:randomUUID()}),false);
   assert.equal(await rpc(db,'agent_automation_release',{p_token:c.leaseToken}),true);
   assert.equal((await claim(db)).status,'empty','Deferred failed inputs cannot trigger a hot loop');
   assert.equal((await db.query('select count(*)::int n from public.agent_input_cache')).rows[0].n,1);
   const retry=(await db.query("select (data->>'next_attempt_at')::timestamptz>clock_timestamp()+interval '290 seconds' deferred from public.agent_automation_state where key like 'input:%'")).rows[0];assert.equal(retry.deferred,true);
   for(let n=1;n<=5;n++)await enqueue(db,n);assert.equal((await claim(db)).status,'cooldown');
   await ageRunner(db);const fresh=await claim(db);assert.equal(fresh.status,'ready');assert.equal(fresh.inputs.length,5);assert(!fresh.inputs.some(i=>i.uuid===inputId(envelope(0))));
   await rpc(db,'agent_automation_release',{p_token:fresh.leaseToken});await ageRunner(db);await ageDeferred(db);assert.equal((await claim(db)).inputs.length,6,'Deferred evidence becomes eligible again after backoff');
  });

  await t.test('expired lease cannot renew/finish/act; replacement token fences old worker',async()=>{
   await reset(db);await enqueue(db,0);await ageInputs(db);const a=await claim(db);await ageRunner(db);
   assert.equal(await rpc(db,'agent_automation_renew',{p_token:a.leaseToken,p_lease_seconds:120}),false);
   assert.equal(await rpc(db,'agent_automation_finish',{p_token:a.leaseToken,p_handled_ids:a.inputs.map(i=>i.uuid)}),false);
   assert.equal((await rpc(db,'agent_automation_action',{p_token:a.leaseToken,p_action_key:'a'.repeat(64),p_complete:false})).status,'stale');
   const b=await claim(db);assert.equal(b.status,'ready');assert.notEqual(a.leaseToken,b.leaseToken);
   assert.equal(await rpc(db,'agent_automation_release',{p_token:a.leaseToken}),false);
   assert.equal(await rpc(db,'agent_automation_finish',{p_token:a.leaseToken,p_handled_ids:a.inputs.map(i=>i.uuid)}),false);
   assert.equal(await rpc(db,'agent_automation_finish',{p_token:b.leaseToken,p_handled_ids:b.inputs.map(i=>i.uuid)}),true);
  });

  await t.test('finish rejects changed/unclaimed/empty/duplicate input IDs and exact subset preserves arrivals/failures',async()=>{
   await reset(db);await enqueue(db,0);await enqueue(db,1);await ageInputs(db);const c=await claim(db);await enqueue(db,2);
   const [first,second]=c.inputs;
   for(const ids of [[],[randomUUID()],[first.uuid,first.uuid]])assert.equal(await rpc(db,'agent_automation_finish',{p_token:c.leaseToken,p_handled_ids:ids}),false);
   const changed={...second.raw_response,payload:{changed:true}};await db.query('update public.agent_input_cache set raw_response=$2::jsonb where uuid=$1',[second.uuid,JSON.stringify(changed)]);
   assert.equal(await rpc(db,'agent_automation_finish',{p_token:c.leaseToken,p_handled_ids:[first.uuid,second.uuid]}),false);
   assert.equal((await db.query('select count(*)::int n from public.agent_input_cache')).rows[0].n,3,'Failed finish deletes nothing');
   assert.equal(await rpc(db,'agent_automation_finish',{p_token:c.leaseToken,p_handled_ids:[first.uuid]}),true);
   const remaining=(await db.query('select uuid from public.agent_input_cache')).rows.map(r=>r.uuid);
   assert.equal(remaining.length,2);assert(remaining.includes(second.uuid));assert(remaining.includes(inputId(envelope(2))));
   const deferred=(await db.query("select data->>'next_attempt_at' retry from public.agent_automation_state where key=$1",['input:'+second.uuid])).rows[0];assert(Date.parse(deferred.retry)>Date.now());
   await ageRunner(db);const next=await claim(db,{p_min_events:1});assert.equal(next.status,'ready');assert.deepEqual(next.inputs.map(i=>i.uuid),[inputId(envelope(2))],'Unhandled snapshot input defers while new arrival remains eligible');
   assert.equal((await rpc(db,'agent_automation_enqueue',{p_input_id:first.uuid,p_envelope:first.raw_response})).status,'duplicate','Processed identity receipt survives body deletion');
  });

  await t.test('completed action receipts prevent replay across release/restart and revisions stay distinct',async()=>{
   await reset(db);await enqueue(db,0);await enqueue(db,0,'r2');await ageInputs(db);const a=await claim(db),key='b'.repeat(64);
   assert.equal(a.inputs.length,2);
   assert.equal((await rpc(db,'agent_automation_action',{p_token:a.leaseToken,p_action_key:key,p_complete:true})).status,'stale');
   assert.equal((await rpc(db,'agent_automation_action',{p_token:a.leaseToken,p_action_key:key,p_complete:false})).status,'execute');
   assert.equal((await rpc(db,'agent_automation_action',{p_token:a.leaseToken,p_action_key:key,p_complete:true})).status,'completed');
   await rpc(db,'agent_automation_release',{p_token:a.leaseToken});await ageRunner(db);await ageDeferred(db);const b=await claim(db);
   assert.equal((await rpc(db,'agent_automation_action',{p_token:b.leaseToken,p_action_key:key,p_complete:false})).status,'completed');
  });

  await t.test('bounded claim input count/bytes and invalid limits retain source evidence',async()=>{
   await reset(db);for(let n=0;n<5;n++)await enqueue(db,n);
   const c=await claim(db,{p_max_inputs:2});assert.equal(c.status,'ready');assert.equal(c.inputs.length,2);
   await rpc(db,'agent_automation_release',{p_token:c.leaseToken});await ageRunner(db);await ageDeferred(db);
   const huge=envelope(9);huge.payload.content='x'.repeat(5000);await rpc(db,'agent_automation_enqueue',{p_input_id:inputId(huge),p_envelope:huge});
   assert.equal((await claim(db,{p_max_bytes:1024})).status,'ready','Smaller inputs remain processable');
   await ageRunner(db);
   for(const overrides of [{p_min_events:null},{p_max_inputs:21},{p_lease_seconds:119},{p_cooldown_seconds:59}])await assert.rejects(claim(db,overrides),e=>e.code==='23514');
   assert.equal((await db.query('select count(*)::int n from public.agent_input_cache')).rows[0].n,6);
  });

  await t.test('subscription CAS rejects stale cursor writers and protected runner/receipt namespaces',async()=>{
   await reset(db);const key='subscription:gmail:club@example.test';
   assert.equal(await rpc(db,'agent_subscription_get_state',{p_key:key}),null);
   const original={historyId:'90071992547409931234',watchExpiration:'1792300000000'};
   assert.equal(await rpc(db,'agent_subscription_cas_state',{p_key:key,p_expected:null,p_next:original}),true);
   const next={...original,historyId:'90071992547409931235'};
   const results=await Promise.all([rpc(db,'agent_subscription_cas_state',{p_key:key,p_expected:original,p_next:next}),rpc(db,'agent_subscription_cas_state',{p_key:key,p_expected:original,p_next:{...original,historyId:'90071992547409931236'}})]);
   assert.deepEqual(results.sort(),[false,true]);assert.deepEqual(await rpc(db,'agent_subscription_get_state',{p_key:key}),next);
   for(const bad of ['runner','action:'+'a'.repeat(64),'input:'+randomUUID(),'subscription:bad?'])await assert.rejects(rpc(db,'agent_subscription_cas_state',{p_key:bad,p_expected:null,p_next:{}}),e=>e.code==='23514');
   await assert.rejects(rpc(db,'agent_subscription_cas_state',{p_key:key,p_expected:next,p_next:JSON.stringify('invalid object')}),e=>e.code==='23514');
  });
 }finally{await db.close();}
});
