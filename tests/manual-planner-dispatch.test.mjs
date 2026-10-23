import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {createManualRunStore,validateManualRunInput} from '../server/automation/manual-runs.js';
import {createManualRunDispatcher} from '../server/automation/manual-worker.js';
import {createAutomationStore} from '../server/automation/store.js';
import {createAutomationHandler} from '../server/automation/handler.js';
import {readAutomationConfig} from '../server/automation/config.js';
import {createApp} from '../server/app.js';
import {createWebsite} from '../server/web.js';
import {createSiteAuth,readSiteAuthConfig} from '../server/site-auth.js';
import {readConfig} from '../server/config.js';
import {createManualPlannerAuth} from '../server/automation/manual-auth.js';

const source=randomUUID(),other=randomUUID(),env={SUPABASE_URL:'https://db.synthetic.test',SUPABASE_SERVICE_ROLE_KEY:'synthetic-private-key'};
const claimArgs={p_allowed_source_ids:[source],p_min_events:30,p_max_age_seconds:1800,p_cooldown_seconds:60,p_lease_seconds:120,p_max_inputs:2,p_max_bytes:65536};
async function rpc(db,name,args={}){const keys=Object.keys(args);return (await db.query(`select public.${name}(${keys.map((k,i)=>`${k}=>$${i+1}`).join(',')}) result`,Object.values(args).map(v=>v&&typeof v==='object'&&!Array.isArray(v)?JSON.stringify(v):v))).rows[0].result;}
async function database(){const db=new PGlite();await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create role manual_public_probe;');for(const file of ['202610170018_agent_input_cache.sql','202610170019_agent_automation_state.sql','202610180032_scoped_agent_claim.sql','202610210036_agent_retry_quarantine.sql','202610220038_agent_empty_scope_maintenance.sql','202610220042_agent_manual_runs.sql'])await db.exec(await readFile(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));return db;}
async function reset(db){await db.exec("reset role;truncate public.agent_input_cache,public.agent_manual_runs,public.agent_automation_state;insert into public.agent_automation_state values('runner','{}');set role service_role;");}
async function enqueue(db,id=source,content='Synthetic queued input'){const inputId=randomUUID();await rpc(db,'agent_automation_enqueue',{p_input_id:inputId,p_envelope:{source:'discord',source_id:id,event_type:'message_created',event_id:'300',revision:'1',payload:{guild_id:'100',channel_id:'200',author:{id:'400'},timestamp:new Date().toISOString(),content}}});return inputId;}
const forced=(db,patch={})=>rpc(db,'agent_automation_claim_forced',{...claimArgs,...patch});
const normal=(db,patch={})=>rpc(db,'agent_automation_claim_scoped',{...claimArgs,...patch});

test('042 actual SQL forced queue claims and durable dispatch preserve processing boundaries',async t=>{
 const db=await database();try{
  await t.test('FORCE RLS and service-only RPCs deny direct writes and client execution',async()=>{
   assert.deepEqual((await db.query("select relrowsecurity,relforcerowsecurity from pg_class where oid='public.agent_manual_runs'::regclass")).rows[0],{relrowsecurity:true,relforcerowsecurity:true});
   const names=['agent_manual_run_start(text[])','agent_manual_run_read(uuid)','agent_manual_run_claim()','agent_manual_run_finish(uuid,uuid,jsonb)','agent_manual_run_requeue(uuid,uuid)','agent_automation_claim_forced(uuid[],integer,integer,integer,integer,integer,integer)'];
   for(const role of ['anon','authenticated','manual_public_probe','service_role']){
    for(const name of names)assert.equal((await db.query("select has_function_privilege($1,$2,'EXECUTE') allowed",[role,'public.'+name])).rows[0].allowed,role==='service_role');
    for(const privilege of ['SELECT','INSERT','UPDATE','DELETE'])assert.equal((await db.query('select has_table_privilege($1,$2,$3) allowed',[role,'public.agent_manual_runs',privilege])).rows[0].allowed,false);
   }
  });
  await t.test('manual bypasses waiting threshold and recent cooldown; ordinary claim does neither',async()=>{
   await reset(db);await enqueue(db);assert.equal((await normal(db)).status,'waiting');const c=await forced(db);assert.equal(c.status,'ready');assert.equal(c.inputs.length,1);
   assert.equal((await forced(db)).status,'busy');assert.equal((await normal(db)).status,'busy');
   assert.equal(await rpc(db,'agent_automation_finish',{p_token:c.leaseToken,p_handled_ids:c.inputs.map(i=>i.uuid)}),true);
   await enqueue(db);assert.equal((await normal(db)).status,'cooldown');assert.equal((await forced(db)).status,'ready');
  });
  await t.test('one bounded selected batch leaves all siblings and excess queued originals untouched',async()=>{
   await reset(db);const excluded=await enqueue(db,other);for(let i=0;i<4;i++)await enqueue(db);
   const c=await forced(db);assert.equal(c.inputs.length,2);assert(c.inputs.every(i=>i.raw_response.source_id===source));
   assert.equal(await rpc(db,'agent_automation_finish',{p_token:c.leaseToken,p_handled_ids:c.inputs.map(i=>i.uuid)}),true);
   const left=(await db.query('select uuid from public.agent_input_cache')).rows;assert.equal(left.length,3);assert(left.some(r=>r.uuid===excluded));
  });
  await t.test('retry backoff, quarantine and oversized originals are never forced into model inputs',async()=>{
   await reset(db);await enqueue(db);const c=await forced(db);assert.equal(await rpc(db,'agent_automation_release',{p_token:c.leaseToken}),true);assert.equal((await forced(db)).status,'empty');
   await db.exec("reset role;update public.agent_automation_state set data=data-'next_attempt_at' where key like 'input:%';set role service_role;");assert.equal((await forced(db)).status,'ready');
   await reset(db);const id=await enqueue(db);await db.query("update public.agent_automation_state set data=data||jsonb_build_object('status','quarantined','quarantine_until',clock_timestamp()+interval '1 hour') where key=$1",['input:'+id]);assert.equal((await forced(db)).status,'empty');
   await reset(db);await enqueue(db,source,'x'.repeat(5000));assert.equal((await forced(db,{p_max_bytes:1024})).status,'input_too_large');
  });
  await t.test('manual-versus-normal active lease and changed snapshot cannot be acknowledged by stale owners',async()=>{
   await reset(db);const id=await enqueue(db);const c=await normal(db,{p_min_events:1});assert.equal(c.status,'ready');assert.equal((await forced(db)).status,'busy');
   await db.query("update public.agent_input_cache set raw_response=jsonb_set(raw_response,'{revision}','\"2\"') where uuid=$1",[id]);assert.equal(await rpc(db,'agent_automation_finish',{p_token:c.leaseToken,p_handled_ids:[id]}),false);
   assert.equal(await rpc(db,'agent_automation_finish',{p_token:randomUUID(),p_handled_ids:[id]}),false);
   await db.exec("update public.agent_automation_state set data=data||jsonb_build_object('lease_until',clock_timestamp()-interval '1 second') where key='runner'");
   await forced(db);assert.equal(await rpc(db,'agent_automation_finish',{p_token:c.leaseToken,p_handled_ids:[id]}),false);
  });
  await t.test('overlapping manual and ordinary claims share exactly one winner; invalid channel requests cannot reserve work',async()=>{
   await reset(db);await enqueue(db);
   const outcomes=await Promise.all([forced(db),normal(db,{p_min_events:1})]);assert.deepEqual(outcomes.map(r=>r.status).sort(),['busy','ready']);
   for(const p_channel_ids of [null,['200','200'],[null],['200\n'],['1'.repeat(21)],Array.from({length:31},(_,i)=>String(i+1))])assert.equal((await rpc(db,'agent_manual_run_start',{p_channel_ids})).status,'invalid_request');
   await db.exec('reset role');assert.equal((await db.query('select count(*)::int n from public.agent_manual_runs')).rows[0].n,0);await db.exec('set role service_role');
  });
  await t.test('durable request reservation is exclusive, status is content-free, and requeue uses exact token',async()=>{
   await reset(db);const started=await rpc(db,'agent_manual_run_start',{p_channel_ids:['200']});assert.equal(started.status,'queued');
   const c=await rpc(db,'agent_manual_run_claim');assert.equal(c.status,'ready');assert.equal(c.runId,started.runId);assert.deepEqual(c.channelIds,['200']);assert.equal((await rpc(db,'agent_manual_run_claim')).status,'busy');
   const read=await rpc(db,'agent_manual_run_read',{p_run_id:c.runId});assert.equal(read.run.state,'running');assert(!Object.hasOwn(read.run,'channelIds'));assert(!Object.hasOwn(read.run,'requestToken'));
   assert.equal((await rpc(db,'agent_manual_run_requeue',{p_run_id:c.runId,p_token:randomUUID()})).status,'stale');
   assert.equal((await rpc(db,'agent_manual_run_requeue',{p_run_id:c.runId,p_token:c.requestToken})).status,'ready');assert.equal((await rpc(db,'agent_manual_run_claim')).status,'empty');
   await db.exec("reset role;update public.agent_manual_runs set next_attempt_at=clock_timestamp()-interval '1 second';set role service_role;");const newer=await rpc(db,'agent_manual_run_claim');assert.notEqual(newer.requestToken,c.requestToken);
   assert.equal((await rpc(db,'agent_manual_run_finish',{p_run_id:c.runId,p_token:c.requestToken,p_result:{status:'completed'}})).status,'stale');
   assert.equal((await rpc(db,'agent_manual_run_finish',{p_run_id:c.runId,p_token:newer.requestToken,p_result:{status:'completed',sourceBody:'PRIVATE'}})).status,'invalid_request');
   assert.equal((await rpc(db,'agent_manual_run_finish',{p_run_id:c.runId,p_token:newer.requestToken,p_result:{status:'completed',handled:2,calls:3}})).status,'ready');
   assert.deepEqual((await rpc(db,'agent_manual_run_read',{p_run_id:c.runId})).run.result,{status:'completed',handled:2,calls:3});
  });
  await t.test('expired reservation recovers with new token; retention and active-capacity remain bounded',async()=>{
   await reset(db);const started=await rpc(db,'agent_manual_run_start',{p_channel_ids:[]}),c=await rpc(db,'agent_manual_run_claim');
   await db.exec("reset role;update public.agent_manual_runs set lease_until=clock_timestamp()-interval '1 second';set role service_role;");const newer=await rpc(db,'agent_manual_run_claim');assert.equal(newer.runId,started.runId);assert.notEqual(newer.requestToken,c.requestToken);
   assert.equal((await rpc(db,'agent_manual_run_finish',{p_run_id:c.runId,p_token:c.requestToken,p_result:{status:'empty'}})).status,'stale');
   for(let i=0;i<19;i++)assert.equal((await rpc(db,'agent_manual_run_start',{p_channel_ids:[]})).status,'queued');assert.equal((await rpc(db,'agent_manual_run_start',{p_channel_ids:[]})).status,'capacity');
   await db.exec("reset role;update public.agent_manual_runs set created_at=clock_timestamp()-interval '25 hours',expires_at=clock_timestamp()-interval '1 hour';set role service_role;");assert.equal((await rpc(db,'agent_manual_run_read',{p_run_id:c.runId})).status,'not_found');assert.equal((await rpc(db,'agent_manual_run_claim')).status,'empty');
   await db.exec('reset role');await db.exec('reset role');assert.equal((await db.query('select count(*)::int n from public.agent_manual_runs')).rows[0].n,0);await db.exec('set role service_role');
  });
  await t.test('actual Node manual store serializes RPCs and strips untrusted status/provider content',async()=>{
   await reset(db);const calls=[],store=createManualRunStore({env,fetchImpl:async(url,options)=>{const name=new URL(url).pathname.split('/').at(-1);calls.push(name);assert.equal(options.redirect,'error');return Response.json(await rpc(db,name,JSON.parse(options.body)));}});
   const queued=await store.start({channelIds:['200']});assert.equal(queued.status,'queued');const c=await store.claim();assert.equal(c.status,'ready');
   assert.equal((await store.finish({...c,result:{status:'completed',handled:1,modelText:'PRIVATE',leaseToken:randomUUID()}})).status,'ready');
   const read=await store.read({runId:c.runId});assert.deepEqual(read.run.result,{status:'completed',handled:1});assert(!JSON.stringify(read).includes('PRIVATE'));assert.equal(calls.length,4);
  });
 }finally{await db.close();}
});

test('actual forced store + handler executes only queued selected originals and no model when empty',async()=>{
 const db=await database();try{
  await reset(db);await enqueue(db,other);const id=await enqueue(db);let models=0;
  const requests=[],baseStore=createAutomationStore({env,fetchImpl:async(url,options)=>{const name=new URL(url).pathname.split('/').at(-1);requests.push(name);return Response.json(await rpc(db,name,JSON.parse(options.body)));}});
  const store={...baseStore,claim:baseStore.claimForced};
  const config=readAutomationConfig({AGENT_AUTOMATION_ENABLED:'true',AGENT_AUTOMATION_MAX_INPUTS:'2'}),principal={id:'update-agent',allowedSourceIds:[source]};
  const handler=createAutomationHandler({config,store,principal,authorizeEvents:async()=>true,tools:[{name:'inert_read',description:'Inert verification tool',readOnly:true,parameters:{type:'object',properties:{},additionalProperties:false},execute:async()=>({status:'ready'})}],provider:{toolTurn:async()=>{models++;return {stopReason:'tool_calls',toolCalls:[{id:'finish',name:'finish_batch',arguments:{handledInputIds:[id]}}]};}}});
  assert.equal((await handler.tick()).status,'completed');assert.equal(models,1);assert(requests.includes('agent_automation_claim_forced'));assert.equal((await handler.tick()).status,'empty');assert.equal(models,1);assert.equal((await db.query('select count(*)::int n from public.agent_input_cache')).rows[0].n,1);
 }finally{await db.close();}
});

test('manual dispatcher constructs one standard forced runtime; busy/abort requeue, failures finish without bodies',async()=>{
 const calls=[],request={status:'ready',runId:randomUUID(),requestToken:randomUUID(),channelIds:['200']};let outcome={status:'completed',handled:1,sourceBody:'PRIVATE'};
 const store={claim:async()=>request,finish:async args=>{calls.push({finish:args});return {status:'ready'};},requeue:async args=>{calls.push({requeue:args});return {status:'ready'};}};
 const dispatcher=createManualRunDispatcher({store,createRuntime:async options=>{calls.push({options});return {status:'ready',handler:{tick:async()=>outcome}};}});
 assert.equal((await dispatcher.tick()).status,'manual_finished');assert.deepEqual(calls[0].options.manual,{channelIds:['200'],force:true});assert.deepEqual(calls[1].finish.result,{status:'completed',handled:1});
 for(const status of ['busy','aborted']){outcome={status};assert.equal((await dispatcher.tick()).status,'manual_requeued');assert(calls.at(-1).requeue);}
 outcome={status:'forbidden',message:'PRIVATE'};assert.equal((await dispatcher.tick()).status,'manual_finished');assert.deepEqual(calls.at(-1).finish.result,{status:'forbidden'});
});

test('API-key HTTP -> actual durable SQL job -> worker dispatcher -> forced queued staged cycle -> content-free status',async()=>{
 const db=await database();try{
  await reset(db);const selected=await enqueue(db),unselected=await enqueue(db,other),order=[];
  const transport=async(url,options)=>Response.json(await rpc(db,new URL(url).pathname.split('/').at(-1),JSON.parse(options.body)));
  const jobs=createManualRunStore({env,fetchImpl:transport}),ordinary=createAutomationStore({env,fetchImpl:transport});
  const siteEnv={NODE_ENV:'production',PUBLIC_ORIGIN:'https://planner.example',SITE_ACCESS_PASSWORD:'synthetic-planner-password',SITE_SESSION_SECRET:'synthetic-long-planner-session-key'},apiConfig=readConfig(siteEnv),siteAuth=createSiteAuth({config:readSiteAuthConfig(siteEnv),apiConfig});
  const apiKey='synthetic-integration-api-key-12345678901234567890';
  const app=createWebsite({siteAuth,apiApp:createApp({config:apiConfig,auth:siteAuth.auth,plannerRuns:jobs,plannerAuth:createManualPlannerAuth({env:{PLANNER_API_KEY:apiKey}})})});
  const response=await app.fetch(new Request(siteEnv.PUBLIC_ORIGIN+'/api/planner/runs',{method:'POST',headers:{authorization:'Bearer '+apiKey,'content-type':'application/json'},body:JSON.stringify({channelIds:['200']})}));assert.equal(response.status,202);const accepted=await response.json();
  let model=0;const taskId=randomUUID();
  const dispatcher=createManualRunDispatcher({store:jobs,createRuntime:async({manual})=>{
   assert.deepEqual(manual,{channelIds:['200'],force:true});const store={...ordinary,claim:async args=>{order.push('forced-claim');return ordinary.claimForced(args);}};
   const pipeline={beginCycle:async()=>order.push('begin'),afterInitial:async()=>{order.push('calendar-api');return {status:'ready',inputIds:[taskId],context:{status:'ready'}};},finishCycle:async()=>{order.push('task-checkpoint');return {status:'ready'};},recordExecution:async()=>{}};
   const handler=createAutomationHandler({config:readAutomationConfig({AGENT_AUTOMATION_ENABLED:'true'}),store,principal:{id:'update-agent',allowedSourceIds:[source]},authorizeEvents:async({events})=>events.every(e=>e.source_id===source),pipeline,
    tools:[{name:'inert_read',description:'Inert source fixture',readOnly:true,parameters:{type:'object',properties:{},additionalProperties:false},execute:async()=>({status:'ready'})}],
    provider:{toolTurn:async()=>{order.push(model?'followup-model':'initial-model');const handled=model++?[]:[selected];return {stopReason:'tool_calls',toolCalls:[{id:'finish_'+model,name:'finish_batch',arguments:{handledInputIds:handled}}]};}}});
   return {status:'ready',handler};
  }});
  const result=await dispatcher.tick();assert.equal(result.status,'manual_finished');assert.equal(result.result.status,'completed');assert.equal(model,2);assert.deepEqual(order,['forced-claim','begin','initial-model','calendar-api','followup-model','task-checkpoint']);
  const status=await app.fetch(new Request(siteEnv.PUBLIC_ORIGIN+accepted.statusUrl,{headers:{authorization:'Bearer '+apiKey}}));assert.equal(status.status,200);const body=await status.json();assert.equal(body.run.state,'completed');assert.equal(body.run.result.handled,1);assert(!JSON.stringify(body).includes('Synthetic queued input'));assert(!JSON.stringify(body).includes(source));
  assert.deepEqual((await db.query('select uuid from public.agent_input_cache')).rows.map(r=>r.uuid),[unselected]);
 }finally{await db.close();}
});

test('manual input validator rejects malformed ids and never accepts a history-fetch parameter',()=>{
 for(const value of [null,[],{channelIds:null},{channelIds:['200','200']},{channelIds:['200\n']},{channelIds:[null]},{channelIds:[2]},{channelIds:['1'.repeat(21)]},{channelIds:[],history:true}])assert.equal(validateManualRunInput(value),null);
 assert.deepEqual(validateManualRunInput({}),{channelIds:[]});assert.deepEqual(validateManualRunInput({channelIds:['200']}),{channelIds:['200']});
});
