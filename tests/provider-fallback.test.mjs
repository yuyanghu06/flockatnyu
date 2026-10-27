import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {setTimeout as pause} from 'node:timers/promises';
import {readConfig} from '../server/shared/config.js';
import {createProvider} from '../server/providers/index.js';
import {createAuditLogger} from '../server/audit/model-audit.js';
import {createAutomationHandler} from '../server/automation/handler.js';
import {readAutomationConfig} from '../server/automation/config.js';

const entries=[
 {baseUrl:'https://first.example.test/v1',apiKey:'PRIVATE_FIRST_FALLBACK_KEY',model:'first-model',provider:'openai-compatible'},
 {baseUrl:'https://second.example.test/v1',apiKey:'PRIVATE_SECOND_FALLBACK_KEY',model:'second-model',provider:'openai-compatible'},
 {baseUrl:'https://third.example.test/v1',apiKey:'PRIVATE_THIRD_FALLBACK_KEY',model:'third-model',provider:'anthropic'},
];
const legacy={LLM_PROVIDER:'openai-compatible',LLM_MODEL:'inherited-model',LLM_API_KEY:'PRIVATE_LEGACY_KEY',LLM_BASE_URL:'https://legacy.example.test/v1',LLM_TIMEOUT_MS:'30000'};
const environment=(chain=entries,extra={})=>({...legacy,LLM_PROVIDERS_JSON:JSON.stringify(chain),...extra});
const request={system:'PRIVATE_SYSTEM_INPUT',messages:[{role:'user',content:'PRIVATE_USER_INPUT'}],tools:[],auditContext:{agent:'planner',runId:randomUUID(),round:2}};
const frames=rows=>rows.map(row=>`data: ${typeof row==='string'?row:JSON.stringify(row)}\n\n`).join('');
function success(operation,anthropic=false,text='Answer'){
 if(operation==='stream')return new Response(frames(anthropic?[
  {type:'message_start',message:{id:'response_third',usage:{input_tokens:9}}},
  {type:'content_block_delta',delta:{type:'text_delta',text}},
  {type:'message_delta',delta:{stop_reason:'end_turn'},usage:{output_tokens:2}},{type:'message_stop'},
 ]:[{id:'response_openai',choices:[{index:0,delta:{content:text},finish_reason:'stop'}],usage:{prompt_tokens:9,completion_tokens:2}},'[DONE]']),{headers:{'content-type':'text/event-stream','x-request-id':'synthetic-response'}});
 return Response.json(anthropic?{id:'response_third',stop_reason:'end_turn',content:[{type:'text',text}],usage:{input_tokens:9,output_tokens:2}}:
  {id:'response_openai',choices:[{finish_reason:'stop',message:{role:'assistant',content:text}}],usage:{prompt_tokens:9,completion_tokens:2}},{headers:{'x-request-id':'synthetic-response'}});
}
const reject=status=>Response.json({error:{message:'PRIVATE_FAILED_RESPONSE_BODY'}},{status});
const quota=()=>Response.json({error:{code:'credit_balance_exhausted',type:'insufficient_quota',message:'PRIVATE_FAILED_RESPONSE_BODY'}},{status:429});
const transport=()=>{throw new TypeError('PRIVATE_TRANSPORT_ERROR',{cause:{code:'ECONNRESET'}});};
async function run(provider,operation,args=request){
 if(operation!=='stream')return provider[operation](args);
 let text='';for await(const part of provider.stream(args))text+=part;return text;
}
function fixture(operation,{chain=entries,env=environment(chain),fetchResponse,startModel,retrySleep,timeoutMs,audit:providedAudit}={}){
 const state={starts:[],finishes:[],fetches:[],waits:[],logs:[],order:[]};
 const audit=providedAudit??{required:true,startModel:async row=>{state.starts.push(structuredClone(row));state.order.push('start:'+row.providerBaseHost);return startModel?startModel(row,state):{status:'ready'};},finishModel:async row=>{state.finishes.push(structuredClone(row));state.order.push('finish');return {status:'ready'};}};
 state.audit=audit;
 const config=readConfig(env);
 state.provider=createProvider(timeoutMs?{...config,timeoutMs}:config,{audit,fetchImpl:async(url,init)=>{
  const parsed=new URL(url),body=JSON.parse(init.body),row={url,host:parsed.hostname,headers:{...init.headers},body,signal:init.signal};
  assert(parsed.hostname.endsWith('.example.test'),'Synthetic tests must not request a live inference endpoint');
  state.fetches.push(row);state.order.push('fetch:'+parsed.hostname);
  return fetchResponse?fetchResponse(row,state):success(operation,parsed.hostname==='third.example.test');
 },retrySleep:async(ms,signal)=>{state.waits.push(ms);if(retrySleep)await retrySleep(ms,signal,state);},writeDiagnostic:row=>state.logs.push(row)});
 return state;
}
function assertNoPrivate(value){
 const text=JSON.stringify(value);
 for(const marker of ['PRIVATE_FIRST_FALLBACK_KEY','PRIVATE_SECOND_FALLBACK_KEY','PRIVATE_THIRD_FALLBACK_KEY','PRIVATE_LEGACY_KEY','PRIVATE_FAILED_RESPONSE_BODY','PRIVATE_TRANSPORT_ERROR','PRIVATE_SYSTEM_INPUT','PRIVATE_USER_INPUT'])assert(!text.includes(marker),marker);
}
function assertAttempts(state,statuses,context=request.auditContext){
 assert.equal(state.starts.length,state.fetches.length);assert.equal(state.finishes.length,state.fetches.length);
 assert.equal(new Set(state.starts.map(row=>row.callId)).size,state.starts.length);
 assert.deepEqual(state.finishes.map(row=>row.status),statuses);
 for(const [i,start]of state.starts.entries()){
  assert.equal(start.callId,state.finishes[i].callId);assert.equal(start.providerBaseHost,state.fetches[i].host);assert.equal(start.model,state.fetches[i].body.model);
  assert.equal(start.operation,state.starts[0].operation);assert.deepEqual(start.context,context);
  assert.deepEqual(state.order.slice(i*3,i*3+3),['start:'+start.providerBaseHost,'fetch:'+start.providerBaseHost,'finish']);
 }
 assertNoPrivate([state.starts,state.finishes,state.logs]);
}

test('all shared operations recover through quota, exhausted transport retries and a third provider with the correct protocol and audit identity',async t=>{
 for(const operation of ['toolTurn','planTools','stream'])await t.test(operation,async()=>{
  const state=fixture(operation,{fetchResponse:row=>row.host==='first.example.test'?quota():row.host==='second.example.test'?transport():success(operation,true)});
  const result=await run(state.provider,operation);
  if(operation==='stream')assert.equal(result,'Answer');else if(operation==='toolTurn')assert.equal(result.text,'Answer');else assert.deepEqual(result,[]);
  assert.deepEqual(state.fetches.map(row=>row.host),['first.example.test','second.example.test','second.example.test','second.example.test','third.example.test']);
  assert.deepEqual(state.waits,[1000,3000]);assertAttempts(state,['failed','failed','failed','failed','succeeded']);
  for(const row of state.fetches){
   const selected=entries.find(entry=>new URL(entry.baseUrl).hostname===row.host);
   assert.equal(row.body.model,selected.model);
   if(selected.provider==='anthropic'){
    assert.equal(row.url,selected.baseUrl+'/messages');assert.equal(row.headers['x-api-key'],selected.apiKey);assert(!row.headers.authorization);assert.equal(row.body.system,request.system);
   }else{assert.equal(row.url,selected.baseUrl+'/chat/completions');assert.equal(row.headers.authorization,'Bearer '+selected.apiKey);assert(!row.headers['x-api-key']);}
  }
  assert.deepEqual(state.starts.map(row=>row.provider),['openai-compatible','openai-compatible','openai-compatible','openai-compatible','anthropic']);
 });
});

test('cross-protocol native tool history is rebuilt and returned proposals preserve the caller selected limit',async()=>{
 const old={id:'old_call',name:'read_map_events',arguments:{}},messages=[request.messages[0],{role:'assistant',content:'',toolCalls:[old]},{role:'tool',toolCallId:old.id,content:'{"status":"ready"}'},{role:'user',content:'Continue'}];
 const chain=[entries[0],entries[2]],state=fixture('toolTurn',{chain,fetchResponse:row=>row.host==='first.example.test'?reject(401):Response.json({id:'anthropic_proposals',stop_reason:'tool_use',content:Array.from({length:16},(_,i)=>({type:'tool_use',id:'new_'+i,name:'read_map_events',input:{index:i}}))})});
 const result=await run(state.provider,'toolTurn',{...request,messages,maxToolCalls:16});assert.equal(result.toolCalls.length,16);assert.equal(state.fetches.length,2);
 const body=state.fetches[1].body;assert(body.messages.some(row=>row.role==='assistant'&&row.content.some(block=>block.type==='tool_use'&&block.id===old.id)));
 assert(body.messages.some(row=>row.role==='user'&&Array.isArray(row.content)&&row.content.some(block=>block.type==='tool_result'&&block.tool_use_id===old.id)));
 assert.deepEqual(result.toolCalls[15],{id:'new_15',name:'read_map_events',arguments:{index:15}});
});

test('authentication, missing endpoints and other server errors advance without adding same-provider retries',async()=>{
 for(const status of [401,402,403,404,501,505]){
  const state=fixture('toolTurn',{chain:entries.slice(0,2),fetchResponse:row=>row.host==='first.example.test'?reject(status):success('toolTurn')});
  assert.equal((await run(state.provider,'toolTurn')).text,'Answer');assert.deepEqual(state.fetches.map(row=>row.host),['first.example.test','second.example.test']);assert.deepEqual(state.waits,[]);
  assertAttempts(state,['failed','succeeded']);
 }
});

test('ordinary temporary rate limits retain bounded retries before advancing, while every confirmed quota code skips them',async()=>{
 const temporary=fixture('toolTurn',{chain:entries.slice(0,2),fetchResponse:row=>row.host==='first.example.test'?Response.json({error:{code:'rate_limit_exceeded'}},{status:429}):success('toolTurn')});
 await run(temporary.provider,'toolTurn');assert.deepEqual(temporary.fetches.map(row=>row.host),['first.example.test','first.example.test','first.example.test','second.example.test']);assert.deepEqual(temporary.waits,[1000,3000]);
 for(const body of [{error:{code:'credit_balance_exhausted'}},{error:{type:'insufficient_quota'}},{code:'insufficient_quota'},{type:'credit_balance_exhausted'}]){
  const state=fixture('toolTurn',{chain:entries.slice(0,2),fetchResponse:row=>row.host==='first.example.test'?Response.json(body,{status:429}):success('toolTurn')});
  await run(state.provider,'toolTurn');assert.equal(state.fetches.length,2);assert.deepEqual(state.waits,[]);
 }
 const messageOnly=fixture('toolTurn',{chain:entries.slice(0,2),fetchResponse:row=>row.host==='first.example.test'?Response.json({error:{message:'insufficient_quota words without an approved machine code'}},{status:429}):success('toolTurn')});
 await run(messageOnly.provider,'toolTurn');assert.equal(messageOnly.fetches.length,4);assert.deepEqual(messageOnly.waits,[1000,3000]);
 const legacyQuota=fixture('toolTurn',{env:legacy,fetchResponse:quota});await assert.rejects(run(legacyQuota.provider,'toolTurn'),{code:'provider_unavailable'});assert.equal(legacyQuota.fetches.length,1);assert.equal(legacyQuota.finishes[0].errorCode,'credit_balance_exhausted');assert.deepEqual(legacyQuota.waits,[]);
});

test('an exhausted chain returns a safe failure and never visits an entry twice after moving past it',async()=>{
 const state=fixture('toolTurn',{fetchResponse:row=>row.host==='first.example.test'?reject(401):row.host==='second.example.test'?transport():reject(503)});
 await assert.rejects(run(state.provider,'toolTurn'),error=>{assertNoPrivate({message:error.message,code:error.code,diagnostics:error.diagnostics});return error.code==='provider_unavailable';});
 assert.deepEqual(state.fetches.map(row=>row.host),['first.example.test',...Array(3).fill('second.example.test'),...Array(3).fill('third.example.test')]);
 assertAttempts(state,Array(7).fill('failed'));assert.deepEqual(state.waits,[1000,3000,1000,3000]);
});

test('default audit context is one new chat run shared across entries and explicit planner context survives unchanged',async()=>{
 for(const auditContext of [undefined,request.auditContext]){
  const state=fixture('planTools',{chain:entries.slice(0,2),fetchResponse:row=>row.host==='first.example.test'?reject(403):success('planTools')});
  await run(state.provider,'planTools',{...request,auditContext});assert.equal(state.starts.length,2);assert.equal(new Set(state.starts.map(row=>row.context.runId)).size,1);
  if(auditContext)assert.deepEqual(state.starts[0].context,auditContext);else{assert.equal(state.starts[0].context.agent,'chat');assert.match(state.starts[0].context.runId,/^[0-9a-f-]{36}$/);}
 }
});

test('the production planner executes a recovered proposal once and keeps fallback attempts within the original run and tool budget',async()=>{
 const inputId=randomUUID(),sourceId=randomUUID(),leaseToken=randomUUID(),events=[],receipts=new Set();let writes=0,backupTurns=0,acknowledged=false;
 const state=fixture('toolTurn',{chain:entries.slice(0,2),fetchResponse:row=>{
  if(row.host==='first.example.test')return quota();
  const name=backupTurns++===0?'upsert_calendar_event':'finish_batch',args=name==='finish_batch'?{handledInputIds:[inputId]}:{inputIds:[inputId],arguments:{title:'Synthetic event'}};
  return Response.json({choices:[{finish_reason:'tool_calls',message:{role:'assistant',content:'',tool_calls:[{id:'proposal_'+backupTurns,type:'function',function:{name,arguments:JSON.stringify(args)}}]}}]});
 }});
 state.audit.recordEvent=async row=>{events.push(structuredClone(row));return {status:'ready'};};
 const store={configured:true,claim:async()=>({status:'ready',leaseToken,inputs:[{uuid:inputId,raw_response:{source:'discord',source_id:sourceId,event_type:'message_created',event_id:'300',revision:'1',received_at:'2026-10-24T13:00:00Z',payload:{content:'Synthetic scheduling request'}}}]}),renew:async()=>({status:'ready'}),release:async()=>{},fail:async()=>{},finish:async()=>{acknowledged=true;return {status:'ready'};},action:async({actionKey,complete})=>{if(complete){receipts.add(actionKey);return {status:'completed'};}return {status:receipts.has(actionKey)?'completed':'execute'};}};
 const tool={name:'upsert_calendar_event',description:'Synthetic business operation',idempotent:true,parameters:{type:'object',properties:{title:{type:'string'}},required:['title'],additionalProperties:false},execute:async args=>{writes++;assert.equal(args.title,'Synthetic event');return {status:'ready',eventId:'synthetic_event'};}};
 const handler=createAutomationHandler({provider:state.provider,audit:state.audit,store,tools:[tool],principal:{id:'synthetic-worker',allowedSourceIds:[sourceId]},authorizeEvent:async()=>true,config:readAutomationConfig({AGENT_AUTOMATION_ENABLED:'true'})});
 const result=await handler.tick();assert.equal(result.status,'completed');assert.equal(result.calls,2);assert.equal(writes,1);assert.equal(receipts.size,1);assert.equal(acknowledged,true);
 assert.equal(state.starts.length,4);assert.equal(new Set(state.starts.map(row=>row.context.runId)).size,1);assert(state.starts.every(row=>row.context.agent==='planner'));assert.deepEqual(state.starts.map(row=>row.context.round),[1,1,2,2]);
 assert(events.every(row=>row.context.runId===state.starts[0].context.runId));assertNoPrivate([state.starts,state.finishes,state.logs]);
});

test('caller abort and required audit failure prevent later provider dispatch',async()=>{
 const controller=new AbortController(),aborted=fixture('toolTurn',{fetchResponse:()=>{controller.abort();return reject(503);}});
 await assert.rejects(run(aborted.provider,'toolTurn',{...request,signal:controller.signal}),{code:'aborted'});assert.equal(aborted.fetches.length,1);
 for(const failureAt of [1,2]){
  const state=fixture('toolTurn',{fetchResponse:()=>quota(),startModel:(_row,s)=>({status:s.starts.length===failureAt?'unavailable':'ready'})});
  await assert.rejects(run(state.provider,'toolTurn'),{code:'audit_unavailable'});assert.equal(state.fetches.length,failureAt-1);assert.equal(state.finishes.length,failureAt-1);
 }
});

test('one operation deadline covers earlier provider time and does not reset on fallback',async()=>{
 const state=fixture('toolTurn',{chain:entries.slice(0,2),timeoutMs:100,fetchResponse:async row=>{await pause(65);return row.host==='first.example.test'?reject(401):success('toolTurn');}});
 const keepAlive=setTimeout(()=>{},500);
 try{await assert.rejects(run(state.provider,'toolTurn'),{code:'provider_unavailable'});assert.equal(state.fetches.length,2);assert.equal(state.starts.length,2);}finally{clearTimeout(keepAlive);}
 const exhausted=fixture('toolTurn',{timeoutMs:50,fetchResponse:async()=>{await pause(80);return reject(401);}});
 const another=setTimeout(()=>{},500);
 try{await assert.rejects(run(exhausted.provider,'toolTurn'),error=>error.code==='provider_unavailable'&&error.code!=='aborted');assert.equal(exhausted.fetches.length,1);}finally{clearTimeout(another);}
});

test('unknown transport and local request or unsupported attachment errors never route to a later entry',async()=>{
 const unknown=fixture('toolTurn',{fetchResponse:()=>{throw new TypeError('PRIVATE_TRANSPORT_ERROR',{cause:{code:'CERT_HAS_EXPIRED'}});}});
 await assert.rejects(run(unknown.provider,'toolTurn'),{code:'provider_unavailable'});assert.equal(unknown.fetches.length,1);assert.deepEqual(unknown.waits,[]);
 const invalid=fixture('toolTurn');await assert.rejects(run(invalid.provider,'toolTurn',{...request,messages:[{role:'tool',toolCallId:'unknown',content:'not a valid history'}]}),{code:'invalid_provider_request'});assert.equal(invalid.fetches.length,0);assert.equal(invalid.starts.length,0);
 for(const operation of ['planTools','stream']){
  const state=fixture(operation,{chain:[entries[2],entries[0]]});
  await assert.rejects(run(state.provider,operation,{...request,messages:[{role:'user',content:'Read this',attachments:[{name:'source.txt',mimeType:'text/plain',data:Buffer.from('Synthetic attachment').toString('base64')}]}]}),{code:'attachments_provider_unsupported'});
  assert.equal(state.fetches.length,0);assert.equal(state.starts.length,0);
 }
});

test('HTTP success commits to that entry even when JSON, tool validation or the first stream frame fails',async()=>{
 const cases=[
  ['toolTurn',()=>new Response('{broken')],
  ['toolTurn',()=>Response.json({error:{code:'insufficient_quota',message:'PRIVATE_FAILED_RESPONSE_BODY'}})],
  ['toolTurn',()=>Response.json({choices:[{finish_reason:'tool_calls',message:{role:'assistant',content:'',tool_calls:[{id:'broken',type:'function',function:{name:'read_map_events',arguments:'{broken'}}]}}]})],
  ['planTools',()=>new Response('{broken')],
  ['toolTurn',()=>new Response(null,{status:204})],
  ['stream',()=>new Response(frames(['not JSON']),{headers:{'content-type':'text/event-stream'}})],
  ['stream',()=>new Response(new ReadableStream({start(c){c.error(new Error('PRIVATE_TRANSPORT_ERROR',{cause:{code:'ECONNRESET'}}));}}),{headers:{'content-type':'text/event-stream'}})],
 ];
 for(const [operation,response]of cases){const state=fixture(operation,{fetchResponse:response});await assert.rejects(run(state.provider,operation));assert.equal(state.fetches.length,1);assert.equal(state.finishes.length,1);assert.deepEqual(state.waits,[]);assertNoPrivate(state.logs);}
});

test('partial accepted text is yielded once and a later transport break cannot replay the generation',async()=>{
 let pulls=0;
 const body=new ReadableStream({pull(controller){if(pulls++===0)controller.enqueue(new TextEncoder().encode(frames([{choices:[{index:0,delta:{content:'Partial'},finish_reason:null}]}])));else controller.error(new Error('PRIVATE_TRANSPORT_ERROR',{cause:{code:'ECONNRESET'}}));}});
 const state=fixture('stream',{fetchResponse:()=>new Response(body,{headers:{'content-type':'text/event-stream'}})}),iterator=state.provider.stream(request);
 assert.equal((await iterator.next()).value,'Partial');await assert.rejects(iterator.next());assert.equal(state.fetches.length,1);assert.equal(state.finishes.length,1);assert.equal(state.finishes[0].output.text,'Partial');assertNoPrivate(state.logs);
});

test('invalid nonblank provider lists fail closed and inherited values and blank legacy configuration work through the public API',async()=>{
 const inherited=[{baseUrl:entries[0].baseUrl,apiKey:entries[0].apiKey}],valid=fixture('toolTurn',{chain:inherited});
 assert.equal((await run(valid.provider,'toolTurn')).text,'Answer');assert.equal(valid.fetches[0].body.model,legacy.LLM_MODEL);assert.equal(valid.fetches[0].headers.authorization,'Bearer '+entries[0].apiKey);
 const invalidLists=['{broken','null','{}','[]',JSON.stringify(Array(9).fill(entries[0])),JSON.stringify([entries[0],null]),JSON.stringify([{baseUrl:entries[0].baseUrl,apiKey:''}]),JSON.stringify([{baseUrl:entries[0].baseUrl}]),JSON.stringify([{apiKey:entries[0].apiKey}]),JSON.stringify([{...entries[0],apiKey:' \t '}]),JSON.stringify([{...entries[0],apiKey:'key\r\nvalue'}]),JSON.stringify([{...entries[0],provider:'unknown'}]),JSON.stringify([{...entries[0],model:' '}]),JSON.stringify([{...entries[0],unknown:'value'}]),JSON.stringify([{...entries[0],baseUrl:'https://user:password@first.example.test/v1'}]),JSON.stringify([{...entries[0],baseUrl:'https://first.example.test/v1?private=value'}]),JSON.stringify([{...entries[0],baseUrl:'ftp://first.example.test/v1'}])];
 for(const value of invalidLists){const state=fixture('toolTurn',{env:environment(entries,{LLM_PROVIDERS_JSON:value})});await assert.rejects(run(state.provider,'toolTurn'),{code:'not_configured'});assert.equal(state.fetches.length,0);assert.equal(state.starts.length,0);}
 for(const value of [undefined,'',' \n\t ']){
  const state=fixture('toolTurn',{env:{...legacy,...(value===undefined?{}:{LLM_PROVIDERS_JSON:value})},fetchResponse:()=>success('toolTurn')});await run(state.provider,'toolTurn');assert.equal(state.fetches[0].host,'legacy.example.test');assert.equal(state.fetches[0].body.model,legacy.LLM_MODEL);
 }
 const standalone=fixture('toolTurn',{env:{LLM_PROVIDERS_JSON:JSON.stringify([entries[0]])}});assert.equal((await run(standalone.provider,'toolTurn')).text,'Answer');assert.equal(standalone.fetches[0].body.model,entries[0].model);
});

test('real audit loggers redact every JSON-list key echoed as bare text for chat and planner, while recording actual entry metadata',async()=>{
 for(const agent of ['chat','planner']){
  const rows=[],diagnostics=[],env={...environment(),NODE_ENV:'production',SUPABASE_URL:'https://audit.example.test',SUPABASE_SERVICE_ROLE_KEY:'PRIVATE_AUDIT_SERVICE_KEY'};
  const audit=createAuditLogger({env,fetchImpl:async(url,init)=>{rows.push({rpc:new URL(url).pathname.split('/').at(-1),payload:JSON.parse(init.body).p_payload});return Response.json({status:'ready'});},writeDiagnostic:row=>diagnostics.push(row)});
  const echo=entries.map(row=>row.apiKey).join(' / '),operation=agent==='planner'?'toolTurn':'stream';
  const state=fixture(operation,{env,audit,fetchResponse:row=>row.host==='first.example.test'?quota():row.host==='second.example.test'?reject(403):success(operation,true,echo)});
  await run(state.provider,operation,{...request,auditContext:{agent,runId:randomUUID(),round:3}});
  const starts=rows.filter(row=>row.rpc==='agent_audit_start_model').map(row=>row.payload),finishes=rows.filter(row=>row.rpc==='agent_audit_finish_model').map(row=>row.payload);
  assert.equal(starts.length,3);assert.equal(finishes.length,3);assert.equal(new Set(starts.map(row=>row.runId)).size,1);assert(starts.every(row=>row.agent===agent));
  assert.deepEqual(starts.map(row=>[row.provider,row.model,row.providerBaseHost]),entries.map(row=>[row.provider,row.model,new URL(row.baseUrl).hostname]));
  assert(finishes.at(-1).output.value.text.includes('[REDACTED]'));assertNoPrivate([rows,diagnostics,state.logs]);
  assert(!JSON.stringify([rows,diagnostics,state.logs]).includes('PRIVATE_AUDIT_SERVICE_KEY'));assert(!JSON.stringify(rows).includes('LLM_PROVIDERS_JSON'));
 }
});
