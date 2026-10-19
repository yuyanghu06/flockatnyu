import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createApp} from '../server/app.js';
import {readConfig} from '../server/config.js';
import {createProvider} from '../server/providers/index.js';
import {createAuditLogger} from '../server/model-audit.js';
import {createAutomationHandler} from '../server/automation/handler.js';
import {createAutomationRuntime} from '../server/automation/cli.js';
import {readAutomationConfig} from '../server/automation/config.js';
import {startAuditMaintenance} from '../server/audit-lifecycle.js';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

// All credentials and source contents are inert sentinels. No external I/O.
const env={NODE_ENV:'production',MODEL_AUDIT_ENABLED:'false',LLM_PROVIDER:'openai-compatible',LLM_MODEL:'gpt-6-luna',LLM_API_KEY:'synthetic-provider-private',SUPABASE_URL:'https://database.example.test',SUPABASE_SERVICE_ROLE_KEY:'synthetic-service-private',SITE_ACCESS_PASSWORD:'synthetic-site-private'};
const config=readConfig(env);
const principal={id:'synthetic-reader',allowedSourceIds:[]};
const usage={prompt_tokens:1000,completion_tokens:200,prompt_tokens_details:{cached_tokens:500},completion_tokens_details:{reasoning_tokens:30}};
const generatedCall=(name,args,id='call_1')=>({id,type:'function',function:{name,arguments:JSON.stringify(args)}});
const completion=(calls=[],text='Synthetic generated output',extra={})=>Response.json({id:'completion_id',service_tier:'default',usage,choices:[{index:0,finish_reason:calls.length?'tool_calls':'stop',message:{role:'assistant',content:text,tool_calls:calls}}],...extra},{headers:{'x-request-id':'fixture_request_id'}});
const sse=(text='Synthetic answer')=>new Response(`data: ${JSON.stringify({id:'stream_id',choices:[{index:0,delta:{content:text},finish_reason:'stop'}]})}\n\ndata: ${JSON.stringify({choices:[],usage,service_tier:'default'})}\n\ndata: [DONE]\n\n`,{headers:{'content-type':'text/event-stream'}});
const toolDefinition={name:'read_discord_window',description:'Synthetic reader',parameters:{type:'object',properties:{},additionalProperties:false}};
function fixture(modelResponse,options={}){
 const rows=[],diagnostics=[],dispatches=[];
 const audit=createAuditLogger({env:{...env,...options.env},fetchImpl:async(url,init)=>{rows.push({rpc:url.split('/').at(-1),payload:JSON.parse(init.body).p_payload});return options.auditResponse?.(url,init)??Response.json({status:'ready'});},writeDiagnostic:x=>diagnostics.push(x)});
 const provider=createProvider(config,{audit,fetchImpl:async(url,init)=>{const body=JSON.parse(init.body);dispatches.push(body);return modelResponse(body,init);}});
 return {audit,provider,rows,diagnostics,dispatches,starts:()=>rows.filter(x=>x.rpc==='agent_audit_start_model').map(x=>x.payload),finishes:()=>rows.filter(x=>x.rpc==='agent_audit_finish_model').map(x=>x.payload),events:()=>rows.filter(x=>x.rpc==='agent_audit_record_event').map(x=>x.payload)};
}
const post=(app,messages=[{role:'user',content:'PRIVATE_USER_INPUT'}],extra={})=>app.request('/api/chat',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({messages}),...extra});
const records=async response=>(await response.text()).trim().split('\n').map(JSON.parse);
function assertPrivate(f){
 const serialized=JSON.stringify(f.rows);
 for(const sentinel of ['PRIVATE_USER_INPUT','PRIVATE_RAW_SOURCE','PRIVATE_UPLOAD_BYTES','PRIVATE_TOOL_RESULT','PRIVATE_EXCEPTION','synthetic-provider-private','synthetic-service-private','synthetic-site-private'])assert.equal(serialized.includes(sentinel),false,sentinel);
}

test('chat actual provider+logger correlates planning, answer and tools and excludes prompts/uploads/source results',async()=>{
 let round=0;
 const f=fixture(body=>body.stream?sse():completion(round++===0?[generatedCall('read_discord_window',{})]:[]));
 const app=createApp({config,audit:f.audit,provider:f.provider,auth:()=>principal,liveDiscordTools:{tools:[toolDefinition],execute:async()=>({status:'ready',private:'PRIVATE_TOOL_RESULT',sources:[{id:'synthetic',title:'Synthetic source',url:'https://source.example.test/item',excerpt:'PRIVATE_RAW_SOURCE'}]})}});
 const response=await post(app,[{role:'user',content:'PRIVATE_USER_INPUT',attachments:[{name:'fixture.txt',mimeType:'text/plain',data:Buffer.from('PRIVATE_UPLOAD_BYTES').toString('base64')}]}]);
 assert.ok((await records(response)).some(x=>x.type==='done'));
 assert.equal(f.starts().length,3);assert.equal(f.finishes().length,3);
 assert.deepEqual(f.starts().map(x=>x.operation),['planTools','planTools','stream']);
 assert.deepEqual(f.starts().slice(0,2).map(x=>x.round),[1,2]);
 const run=f.starts()[0].runId;assert.equal(new Set(f.starts().map(x=>x.runId)).size,1);
 assert.ok(f.rows.every(x=>x.payload.runId===run));assert.equal(new Set(f.starts().map(x=>x.callId)).size,3);
 const toolEvents=f.events().filter(x=>x.kind.startsWith('tool_'));assert.deepEqual(toolEvents.map(x=>x.status),['started','ready']);
 assert.equal(toolEvents[0].round,1);assert.equal(toolEvents[1].round,1);
 assert.deepEqual(f.events().filter(x=>x.kind.startsWith('run_')).map(x=>x.status),['started','succeeded']);
 assert.equal(f.finishes()[0].estimatedCostUsd,0.000155);assert.equal(f.finishes()[2].output.value.text,'Synthetic answer');assertPrivate(f);
});

test('concurrent chats use disjoint run/call identities and preserve model output attribution',async()=>{
 const f=fixture(body=>sse(body.messages.at(-1).content==='PRIVATE_USER_INPUT A'?'answer_A':'answer_B'));
 const app=createApp({config,audit:f.audit,provider:f.provider,auth:()=>principal});
 await Promise.all(['A','B'].map(async name=>records(await post(app,[{role:'user',content:`PRIVATE_USER_INPUT ${name}`}]))));
 assert.equal(new Set(f.starts().map(x=>x.runId)).size,2);assert.equal(new Set(f.starts().map(x=>x.callId)).size,2);
 assert.deepEqual(f.finishes().map(x=>x.output.value.text).sort(),['answer_A','answer_B']);
 for(const start of f.starts()){assert.equal(f.finishes().find(x=>x.callId===start.callId).runId,start.runId);assert.equal(f.events().filter(x=>x.runId===start.runId).length,2);}
 assertPrivate(f);
});

test('chat direct memory read and provider failure retain private run/tool outcomes',async()=>{
 const f=fixture(()=>new Response('PRIVATE_EXCEPTION',{status:503}));
 const app=createApp({config,audit:f.audit,provider:f.provider,auth:()=>principal,memoryTools:{read:async()=>({status:'ready',memory:{content:'PRIVATE_RAW_SOURCE'}})}});
 const output=await records(await post(app));assert.ok(output.some(x=>x.type==='error'));
 assert.deepEqual(f.events().filter(x=>x.kind.startsWith('tool_')).map(x=>[x.tool,x.status]),[['read_memory','started'],['read_memory','ready']]);
 assert.equal(f.finishes()[0].status,'failed');assert.equal(f.events().at(-1).status,'failed');assertPrivate(f);
});

test('chat abort records terminal tool outcome even when source adapter does not settle',async()=>{
 const controller=new AbortController();let began;
 const started=new Promise(resolve=>{began=resolve;});
 const f=fixture(()=>completion([generatedCall('read_discord_window',{})]));
 const app=createApp({config,audit:f.audit,provider:f.provider,auth:()=>principal,liveDiscordTools:{tools:[toolDefinition],execute:()=>{began();return new Promise(()=>{});}}});
 const response=await post(app,undefined,{signal:controller.signal});await started;controller.abort();await response.body.cancel();
 await new Promise(resolve=>setTimeout(resolve,15));
 assert.equal(f.events().find(x=>x.kind==='tool_finished')?.status,'aborted');
 assert.equal(f.events().find(x=>x.kind==='run_finished')?.status,'aborted');assertPrivate(f);
});

test('chat tool denial, thrown failure and abort retain operational status without raw results',async()=>{
 for(const status of ['permission_denied','throws','aborted']){
  const controller=new AbortController();let n=0,toolBegan;
  const began=new Promise(resolve=>{toolBegan=resolve;});
  const f=fixture(body=>body.stream?sse():completion(n++===0?[generatedCall('read_discord_window',{})]:[]));
  const app=createApp({config,audit:f.audit,provider:f.provider,auth:()=>principal,liveDiscordTools:{tools:[toolDefinition],execute:async()=>{toolBegan();if(status==='aborted'){controller.abort();return {status:'ready',raw:'PRIVATE_RAW_SOURCE'};}if(status==='throws')throw Error('PRIVATE_EXCEPTION');return {status,sources:[],raw:'PRIVATE_RAW_SOURCE'};}}});
  const response=await post(app,undefined,{signal:controller.signal});
  if(status==='aborted'){await began;await response.body.cancel();}else await records(response);
  // An aborted response body intentionally stays disconnected; only private records matter.
  await new Promise(resolve=>setTimeout(resolve,10));
  assert.equal(f.events().find(x=>x.kind==='tool_finished')?.status,status==='throws'?'unavailable':status);
  assert.equal(f.events().find(x=>x.kind==='run_finished')?.status,status==='aborted'?'aborted':'succeeded');assertPrivate(f);
 }
});

function worker(f,{execute=async()=>({status:'ready',private:'PRIVATE_TOOL_RESULT'}),authorizeEvent=async()=>true,signal,prepareBatch,validateCompletion}={}){
 const inputId=randomUUID(),leaseToken=randomUUID();let completed=false;
 const input={uuid:inputId,raw_response:{source:'discord',source_id:'channel:123',event_type:'message_created',event_id:'message:123',revision:'1',received_at:'2026-10-19T12:00:00Z',payload:{content:'PRIVATE_RAW_SOURCE'}}};
 const store={configured:true,claim:async()=>({status:'ready',leaseToken,inputs:[input]}),renew:async()=>({status:'ready'}),finish:async()=>{completed=true;return {status:'ready'};},release:async()=>({status:'ready'})};
 const handler=createAutomationHandler({audit:f.audit,provider:f.provider,store,principal,config:readAutomationConfig({AGENT_AUTOMATION_ENABLED:'true'}),authorizeEvent,prepareBatch,validateCompletion,tools:[{name:'read_fixture',description:'Read fixture',readOnly:true,parameters:{type:'object',properties:{},additionalProperties:false},execute}]});
 return {inputId,tick:()=>handler.tick({signal}),completed:()=>completed};
}

test('worker actual toolTurn connects runs, model rounds, source-only inputs and tool completion',async()=>{
 let w,n=0;const f=fixture(()=>completion(n++===0?[generatedCall('read_fixture',{inputIds:[w.inputId],arguments:{}},'read_1')]:[generatedCall('finish_batch',{handledInputIds:[w.inputId]},'finish_1')]));w=worker(f);
 assert.equal((await w.tick()).status,'completed');assert.equal(w.completed(),true);
 assert.deepEqual(f.starts().map(x=>[x.agent,x.round]),[['planner',1],['planner',2]]);
 const run=f.starts()[0].runId;assert.ok(f.rows.every(x=>x.payload.runId===run));
 assert.deepEqual(f.events().filter(x=>x.kind==='tool_finished').map(x=>[x.tool,x.round,x.status]),[['read_fixture',1,'ready'],['finish_batch',2,'completed']]);
 assert.equal(f.events().at(-1).status,'completed');assertPrivate(f);
});

test('planner preflight and deferred Miro outcome retain counts without context or board data',async()=>{
 let w;const f=fixture(()=>completion([generatedCall('finish_batch',{handledInputIds:[w.inputId]})]));
 w=worker(f,{prepareBatch:async()=>({status:'ready',private:'PRIVATE_RAW_SOURCE'}),validateCompletion:async()=>({status:'ready',miroReconciliation:{status:'deferred',syncComplete:false,boardIds:['PRIVATE_BOARD_1','PRIVATE_BOARD_2']}})});
 assert.equal((await w.tick()).status,'completed');
 assert.deepEqual(f.events().filter(x=>x.tool==='prepare_batch').map(x=>x.status),['started','ready']);
 assert.equal(f.events().at(-1).counts.miroDeferred,1);
 assert.equal(f.events().at(-1).counts.miroDeferredBoards,2);
 assert.equal(JSON.stringify(f.rows).includes('PRIVATE_BOARD_'),false);assertPrivate(f);
});

test('production worker bootstrap shares its actual logger across queue, tools, provider and pruning',async()=>{
 const inputId=randomUUID(),sourceId=randomUUID(),rows=[];let dispatches=0;
 const input={uuid:inputId,raw_response:{source:'discord',source_id:sourceId,event_type:'message_created',event_id:'message:123',revision:'1',received_at:'2026-10-19T12:00:00Z',payload:{content:'PRIVATE_RAW_SOURCE'}}};
 const runtime=await createAutomationRuntime({env:{...env,AGENT_AUTOMATION_ENABLED:'true',AGENT_AUTOMATION_ADAPTER_MODULE:'./inert-fixture.mjs'},loadModule:async()=>({createAutomationAdapters:async()=>({principal:{id:'synthetic-worker',allowedSourceIds:[sourceId]},authorizeEvent:async()=>true,tools:[{name:'read_fixture',description:'Read fixture',readOnly:true,parameters:{type:'object',properties:{}},execute:async()=>({status:'ready'})}]})}),fetchImpl:async(url,init)=>{
  const name=new URL(url).pathname.split('/').at(-1);
  if(name.startsWith('agent_audit_')){rows.push({rpc:name,payload:JSON.parse(init.body).p_payload});return Response.json({status:'ready'});}
  if(name==='agent_automation_claim_scoped')return Response.json({status:'ready',leaseToken:randomUUID(),inputs:[input]});
  if(['agent_automation_renew','agent_automation_finish','agent_automation_release'].includes(name))return Response.json(true);
  if(url==='https://api.openai.com/v1/chat/completions'){dispatches++;return completion([generatedCall('finish_batch',{handledInputIds:[inputId]})]);}
  throw Error('Unexpected inert request');
 }});
 assert.equal(runtime.status,'ready');assert.equal(runtime.audit.required,true);assert.equal((await runtime.handler.tick()).status,'completed');assert.equal(dispatches,1);
 assert.ok(rows.some(x=>x.rpc==='agent_audit_prune'));assert.equal(rows.filter(x=>x.rpc==='agent_audit_start_model').length,1);assert.equal(rows.filter(x=>x.rpc==='agent_audit_finish_model').length,1);
 const correlated=rows.filter(x=>x.rpc!=='agent_audit_prune');assert.equal(new Set(correlated.map(x=>x.payload.runId)).size,1);assert.ok(correlated.every(x=>x.payload.agent==='planner'));
 assertPrivate({rows});
});

test('worker denied, failed model, failed tool and aborted tool receive distinct terminal records',async()=>{
 for(const scenario of ['denied','model_failed','tool_failed','aborted']){
  let w;const controller=new AbortController();
  const f=fixture(()=>scenario==='model_failed'?new Response('PRIVATE_EXCEPTION',{status:503}):completion([generatedCall('read_fixture',{inputIds:[w.inputId],arguments:{}})]));
  w=worker(f,{signal:controller.signal,authorizeEvent:async()=>scenario!=='denied',execute:async()=>{if(scenario==='aborted'){controller.abort();throw Error('PRIVATE_EXCEPTION');}return {status:'unavailable',raw:'PRIVATE_RAW_SOURCE'};}});
  const result=await w.tick();assert.equal(result.status,{denied:'forbidden',model_failed:'unavailable',tool_failed:'tool_failed',aborted:'aborted'}[scenario]);
  assert.equal(w.completed(),false);assert.equal(f.events().at(-1).status,result.status);
  if(scenario==='denied')assert.equal(f.dispatches.length,0);
  if(scenario==='model_failed')assert.equal(f.finishes()[0].status,'failed');
  if(scenario==='aborted')assert.equal(f.events().find(x=>x.kind==='tool_finished').status,'aborted');
  if(scenario==='tool_failed')assert.equal(f.events().find(x=>x.kind==='tool_finished').status,'unavailable');assertPrivate(f);
 }
});

test('production with audit disabled still fails closed at every dispatch when durable start is unavailable',async()=>{
 for(const operation of ['toolTurn','planTools','stream']){
  const f=fixture(()=>{throw Error('Provider must not be fetched');},{auditResponse:()=>new Response('PRIVATE_EXCEPTION',{status:503})});
  assert.equal(f.audit.required,true);assert.equal(f.audit.configured,true);
  const request={messages:[{role:'user',content:'PRIVATE_USER_INPUT'}],system:'PRIVATE_USER_INPUT',tools:[],auditContext:{agent:'planner',runId:randomUUID(),round:1}};
  await assert.rejects(async()=>{if(operation==='stream')for await(const _ of f.provider.stream(request)){}else await f.provider[operation](request);},{code:'audit_unavailable'});
  assert.equal(f.dispatches.length,0);assert.equal(f.starts().length,1);assert.equal(f.finishes().length,0);assertPrivate(f);
 }
});

test('generated JSON-string arguments and nested JSON redact secrets independently of configured values',async()=>{
 const args={nested:{password:'UNCONFIGURED_PASSWORD_SENTINEL',authorization:'UNCONFIGURED_AUTHORIZATION_SENTINEL',api_key:'UNCONFIGURED_API_SENTINEL'},encoded:JSON.stringify({authorization:'ENCODED_AUTHORIZATION_SENTINEL',cookie:'ENCODED_COOKIE_SENTINEL',private_key:'ENCODED_KEY_SENTINEL'}),safe:'ordinary generated argument',configured:env.SITE_ACCESS_PASSWORD};
 const f=fixture(()=>completion([generatedCall('read_discord_window',args)]));
 await f.provider.planTools({messages:[{role:'user',content:'PRIVATE_USER_INPUT'}],system:'PRIVATE_USER_INPUT',tools:[toolDefinition],auditContext:{agent:'chat',runId:randomUUID(),round:1}});
 const serialized=JSON.stringify(f.rows);for(const secret of ['UNCONFIGURED_PASSWORD_SENTINEL','UNCONFIGURED_AUTHORIZATION_SENTINEL','UNCONFIGURED_API_SENTINEL','ENCODED_AUTHORIZATION_SENTINEL','ENCODED_COOKIE_SENTINEL','ENCODED_KEY_SENTINEL'])assert.equal(serialized.includes(secret),false,secret);
 assert.ok(serialized.includes('ordinary generated argument'));assertPrivate(f);
});

test('unknown usage remains null and priority/proxy prices are not presented as standard known costs',async()=>{
 for(const extra of [{usage:undefined},{service_tier:'priority'}]){
  const f=fixture(()=>completion([],undefined,extra));await f.provider.planTools({messages:[],system:'',tools:[]});
  assert.equal(f.finishes()[0].estimatedCostUsd,null);if(!extra.usage&&!extra.service_tier)assert.ok(Object.values(f.finishes()[0].usage).every(x=>x===null));
 }
});

test('audit lifecycle prunes immediately, periodically and stops without propagating failures',async()=>{
 let calls=0;const stop=startAuditMaintenance({configured:true,prune:async()=>{calls++;throw Error('PRIVATE_EXCEPTION');}},{intervalMs:5});
 await new Promise(resolve=>setTimeout(resolve,18));stop();assert.ok(calls>=2);const before=calls;await new Promise(resolve=>setTimeout(resolve,12));assert.equal(calls,before);
});

test('actual chat-to-provider-to-logger payloads persist through service-role migration RPCs',async()=>{
 const db=new PGlite();
 try{
  await db.exec('create role anon;create role authenticated;create role service_role bypassrls;');
  await db.exec(await readFile(new URL('../supabase/migrations/202610190033_agent_model_audit.sql',import.meta.url),'utf8'));
  await db.exec('set role service_role');
  const audit=createAuditLogger({env,writeDiagnostic:()=>{},fetchImpl:async(url,init)=>{
   const name=new URL(url).pathname.split('/').at(-1);assert.match(name,/^agent_audit_(start_model|finish_model|record_event|prune)$/);
   const result=await db.query(`select public.${name}($1::jsonb) result`,[JSON.stringify(JSON.parse(init.body).p_payload)]);return Response.json(result.rows[0].result);
  }});
  const provider=createProvider(config,{audit,fetchImpl:async()=>sse('Persisted synthetic answer')});
  const app=createApp({config,audit,provider,auth:()=>principal});assert.ok((await records(await post(app))).some(x=>x.type==='done'));
  const calls=(await db.query('select agent,run_id,status,usage,estimated_cost_usd,output from public.agent_model_calls')).rows;
  assert.equal(calls.length,1);assert.equal(calls[0].agent,'chat');assert.equal(calls[0].status,'succeeded');assert.equal(Number(calls[0].estimated_cost_usd),0.000155);assert.equal(calls[0].output.value.text,'Persisted synthetic answer');
  const events=(await db.query('select run_id,kind,status from public.agent_audit_events order by created_at')).rows;
  assert.deepEqual(events.map(x=>x.status),['started','succeeded']);assert.ok(events.every(x=>x.run_id===calls[0].run_id));assert.equal(JSON.stringify(calls).includes('PRIVATE_USER_INPUT'),false);
 }finally{await db.close();}
});
