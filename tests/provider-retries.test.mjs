import test from 'node:test';
import assert from 'node:assert/strict';
import {setTimeout as pause} from 'node:timers/promises';
import {createProvider} from '../server/providers/index.js';

const operations=['toolTurn','planTools','stream'];
const request={messages:[{role:'user',content:'PRIVATE_PROMPT'}],system:'PRIVATE_SYSTEM',tools:[],auditContext:{agent:'planner',runId:'4c25d070-515b-4d98-8d3e-ccf7f98f712f',round:2}};
const encode=frames=>frames.map(frame=>`data: ${typeof frame==='string'?frame:JSON.stringify(frame)}\n\n`).join('');
const stream=frames=>new Response(encode(frames),{headers:{'content-type':'text/event-stream'}});
function success(operation,anthropic=false){
 if(operation==='stream')return stream(anthropic?[
  {type:'message_start',message:{id:'reply',usage:{input_tokens:5}}},
  {type:'content_block_delta',delta:{type:'text_delta',text:'Answer'}},
  {type:'message_delta',delta:{stop_reason:'end_turn'},usage:{output_tokens:2}},{type:'message_stop'},
 ]:[{id:'reply',choices:[{index:0,delta:{content:'Answer'},finish_reason:'stop'}],usage:{prompt_tokens:5,completion_tokens:2}},'[DONE]']);
 return Response.json(anthropic?{id:'reply',stop_reason:'end_turn',content:[{type:'text',text:'Answer'}],usage:{input_tokens:5,output_tokens:2}}:{id:'reply',choices:[{finish_reason:'stop',message:{role:'assistant',content:'Answer'}}],usage:{prompt_tokens:5,completion_tokens:2}});
}
async function run(provider,operation,args=request){if(operation!=='stream')return provider[operation](args);let value='';for await(const chunk of provider.stream(args))value+=chunk;return value;}
function fixture(operation,{responses,provider='openai-compatible',timeoutMs=30000,retrySleep,startModel,finishModel}={}){
 const state={starts:[],finishes:[],fetches:[],waits:[],order:[]};
 const audit={required:true,async startModel(row){state.starts.push(structuredClone(row));state.order.push('start');return startModel?startModel(row,state):{status:'ready'};},async finishModel(row){state.finishes.push(structuredClone(row));state.order.push('finish');return finishModel?finishModel(row,state):{status:'ready'};}};
 state.provider=createProvider({configured:true,provider,model:'fixture',apiKey:'PRIVATE_KEY',baseUrl:'https://model.invalid/v1',timeoutMs},{audit,
  fetchImpl:async(url,init)=>{state.order.push('fetch');state.fetches.push(init);const response=responses?.[state.fetches.length-1];return typeof response==='function'?response(init,state):response||success(operation,provider==='anthropic');},
  retrySleep:async(ms,signal)=>{state.order.push('wait');state.waits.push(ms);if(retrySleep)await retrySleep(ms,signal,state);},
 });return state;
}
function assertAudits(state,statuses){
 assert.equal(state.fetches.length,statuses.length);assert.equal(state.starts.length,statuses.length);assert.equal(state.finishes.length,statuses.length);
 assert.equal(new Set(state.starts.map(row=>row.callId)).size,statuses.length);
 assert.deepEqual(state.finishes.map(row=>row.status),statuses);
 for(let i=0;i<statuses.length;i++){assert.equal(state.starts[i].callId,state.finishes[i].callId);assert.deepEqual(state.starts[i].context,request.auditContext);}
 assert(!JSON.stringify([state.starts,state.finishes]).includes('PRIVATE_'));
}
const rejected=status=>()=>new Response('PRIVATE_ERROR_BODY',{status,headers:{'x-request-id':`attempt-${status}`}});
for(const operation of operations){
 test(`${operation}: two transient failures recover with bounded backoff and independently durable attempts`,async()=>{
  const state=fixture(operation,{responses:[rejected(429),rejected(503)]});await run(state.provider,operation);
  assert.deepEqual(state.waits,[1000,3000]);assertAudits(state,['failed','failed','succeeded']);
  assert.deepEqual(state.order,['start','fetch','finish','wait','start','fetch','finish','wait','start','fetch','finish']);
  assert.equal(new Set(state.fetches.map(value=>value.signal)).size,1);assert.equal(new Set(state.fetches.map(value=>value.body)).size,1);
  assert.deepEqual(state.finishes.slice(0,2).map(row=>row.httpStatus),[429,503]);assert.equal(state.finishes[2].usage.inputTokens,5);
 });
 test(`${operation}: every explicit transient HTTP status retries, with Anthropic-only529`,async()=>{
  for(const status of [408,429,500,502,503,504]){const state=fixture(operation,{responses:[rejected(status)]});await run(state.provider,operation);assertAudits(state,['failed','succeeded']);}
  const state=fixture(operation,{provider:'anthropic',responses:[rejected(529)]});await run(state.provider,operation);assertAudits(state,['failed','succeeded']);
 });
 test(`${operation}: permanent HTTP errors and unknown server statuses do not retry`,async()=>{
  for(const status of [400,401,403,404,422,501,505,529]){const state=fixture(operation,{responses:[rejected(status)]});await assert.rejects(run(state.provider,operation));assertAudits(state,['failed']);assert.deepEqual(state.waits,[]);}
 });
 test(`${operation}: persistent temporary failure stops after exactly three fetches`,async()=>{
  const state=fixture(operation,{responses:[rejected(503),rejected(503),rejected(503),()=>{throw Error('fourth fetch forbidden');}]});
  await assert.rejects(run(state.provider,operation),{code:'provider_unavailable'});assertAudits(state,['failed','failed','failed']);assert.deepEqual(state.waits,[1000,3000]);
 });
 test(`${operation}: transport retry is restricted to recognized fetch failures`,async()=>{
  for(const error of [Object.assign(new Error('PRIVATE_NETWORK'),{code:'ECONNRESET'}),new TypeError('PRIVATE_NETWORK',{cause:{code:'UND_ERR_SOCKET'}})]){
   const state=fixture(operation,{responses:[()=>{throw error;}]});await run(state.provider,operation);assertAudits(state,['failed','succeeded']);
  }
  for(const error of [new TypeError('PRIVATE_NETWORK'),Object.assign(new Error('PRIVATE_NETWORK'),{code:'EACCES'}),new Error('PRIVATE_NETWORK',{cause:{code:'CERT_HAS_EXPIRED'}}),Object.assign(new Error('PRIVATE_NETWORK'),{name:'AbortError',code:'ECONNRESET'})]){
   const state=fixture(operation,{responses:[()=>{throw error;}]});await assert.rejects(run(state.provider,operation));assertAudits(state,['failed']);
  }
 });
 test(`${operation}: insufficient original budget avoids both wait and retry`,async()=>{
  const state=fixture(operation,{timeoutMs:500,responses:[rejected(429)]});await assert.rejects(run(state.provider,operation));assertAudits(state,['failed']);assert.deepEqual(state.waits,[]);
 });
 test(`${operation}: Retry-After seconds override backoff and cannot overrun remaining budget`,async()=>{
  const state=fixture(operation,{responses:[()=>new Response('',{status:429,headers:{'Retry-After':'6'}})]});await run(state.provider,operation);assert.deepEqual(state.waits,[6000]);
  const short=fixture(operation,{timeoutMs:5000,responses:[()=>new Response('',{status:429,headers:{'Retry-After':'6'}})]});await assert.rejects(run(short.provider,operation));assert.equal(short.fetches.length,1);assert.deepEqual(short.waits,[]);
 });
 test(`${operation}: parent cancellation during backoff prevents another paid call`,async()=>{
  const controller=new AbortController();const state=fixture(operation,{responses:[rejected(503)],retrySleep:()=>{controller.abort();}});
  await assert.rejects(run(state.provider,operation,{...request,signal:controller.signal}),{code:'aborted'});assert.equal(state.fetches.length,1);assert.equal(state.starts.length,1);assert.equal(state.finishes.length,1);
 });
 test(`${operation}: failed durable retry start blocks dispatch without losing first terminal audit`,async()=>{
  const state=fixture(operation,{responses:[rejected(503)],startModel:(_,s)=>({status:s.starts.length===1?'ready':'unavailable'})});
  await assert.rejects(run(state.provider,operation),{code:'audit_unavailable'});assert.equal(state.starts.length,2);assert.equal(state.fetches.length,1);assert.equal(state.finishes.length,1);assert.equal(state.finishes[0].status,'failed');
 });
 test(`${operation}: successful HTTP body errors cannot replay generation`,async()=>{
  const cases=operation==='stream'?[()=>new Response('not SSE'),()=>stream(['invalid json']),()=>stream([{type:'error',error:{message:'PRIVATE_BODY'}}])]:[()=>new Response('{broken'),()=>Response.json({error:{message:'PRIVATE_BODY'}}),()=>new Response(new ReadableStream({start(c){c.error(new Error('PRIVATE_BODY',{cause:{code:'ECONNRESET'}}));}}))];
  for(const response of cases){const state=fixture(operation,{responses:[response]});await assert.rejects(run(state.provider,operation));assertAudits(state,['failed']);assert.deepEqual(state.waits,[]);}
 });
 test(`${operation}: original operation deadline cancels an uncooperative fetch`,async()=>{
  const state=fixture(operation,{timeoutMs:20,responses:[()=>new Promise(()=>{})]});
  // AbortSignal.timeout is unref'd; retain a bounded watchdog so a hung implementation fails explicitly.
  const controller=new AbortController();const watchdog=pause(500,null,{signal:controller.signal}).then(()=>{throw Error('provider did not honor deadline');},()=>{});
  try{await assert.rejects(Promise.race([run(state.provider,operation),watchdog]),{code:'provider_unavailable'});assertAudits(state,['failed']);}finally{controller.abort();}
 });
}

test('partial streaming text is yielded once and never replayed after transport interruption',async()=>{
 let reads=0;const response=new Response(new ReadableStream({pull(controller){if(reads++===0)controller.enqueue(new TextEncoder().encode(encode([{choices:[{index:0,delta:{content:'Partial'},finish_reason:null}]}])));else controller.error(new Error('PRIVATE_BODY',{cause:{code:'ECONNRESET'}}));}}),{headers:{'content-type':'text/event-stream'}});
 const state=fixture('stream',{responses:[response]});const iterator=state.provider.stream(request);assert.equal((await iterator.next()).value,'Partial');await assert.rejects(iterator.next());assertAudits(state,['failed']);assert.equal(state.finishes[0].output.text,'Partial');assert.deepEqual(state.waits,[]);
});

test('successful native tool proposals return once and are not automatically executed or retried',async()=>{
 const response=()=>Response.json({choices:[{finish_reason:'tool_calls',message:{role:'assistant',content:'',tool_calls:[{id:'write1',type:'function',function:{name:'write_event',arguments:'{"eventId":"fixture"}'}}]}}]});
 const state=fixture('toolTurn',{responses:[rejected(503),response]});const result=await run(state.provider,'toolTurn');assert.deepEqual(result.toolCalls,[{id:'write1',name:'write_event',arguments:{eventId:'fixture'}}]);assert.equal(state.fetches.length,2);assertAudits(state,['failed','succeeded']);
});

for(const operation of operations){
 test(`${operation}: rejected response cleanup cannot outlive operation deadline`,async()=>{
  const response=new Response(new ReadableStream({cancel(){return new Promise(()=>{});}}),{status:503});
  const state=fixture(operation,{timeoutMs:20,responses:[response]});const controller=new AbortController();
  const watchdog=pause(300,null,{signal:controller.signal}).then(()=>{throw Error('error-body cancellation exceeded deadline');},()=>{});
  try{await assert.rejects(Promise.race([run(state.provider,operation),watchdog]),{code:'provider_unavailable'});assertAudits(state,['failed']);}finally{controller.abort();}
 });
 test(`${operation}: cancellation interrupts uncooperative backoff immediately`,async()=>{
  const controller=new AbortController();const state=fixture(operation,{responses:[rejected(503)],retrySleep:()=>{queueMicrotask(()=>controller.abort());return new Promise(()=>{});}});
  const watchdogController=new AbortController();const watchdog=pause(300,null,{signal:watchdogController.signal}).then(()=>{throw Error('sleep ignored cancellation');},()=>{});
  try{await assert.rejects(Promise.race([run(state.provider,operation,{...request,signal:controller.signal}),watchdog]),{code:'aborted'});assert.equal(state.starts.length,1);assert.equal(state.fetches.length,1);}finally{watchdogController.abort();}
 });
}

test('HTTP-date Retry-After is honored and malformed header falls back to normal delay',async()=>{
 const then=Date.now()+10000;const state=fixture('toolTurn',{responses:[()=>new Response('',{status:429,headers:{'retry-after':new Date(then).toUTCString()}})]});await run(state.provider,'toolTurn');assert(state.waits[0]>=8500&&state.waits[0]<=10000);
 for(const value of ['garbage','-1','0','1.5']){const s=fixture('toolTurn',{responses:[()=>new Response('',{status:429,headers:{'retry-after':value}})]});await run(s.provider,'toolTurn');assert.deepEqual(s.waits,[1000]);}
});

test('fallback audit run identity remains stable across retry while call identities are unique',async()=>{
 const state=fixture('toolTurn',{responses:[rejected(503)]});await run(state.provider,'toolTurn',{...request,auditContext:undefined});assert.equal(state.starts[0].context.runId,state.starts[1].context.runId);assert.notEqual(state.starts[0].callId,state.starts[1].callId);
});
