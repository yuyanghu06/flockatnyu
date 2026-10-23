import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {setImmediate} from 'node:timers/promises';
import {createAutomationHandler} from '../server/automation/handler.js';
import {readAutomationConfig} from '../server/automation/config.js';
import {main} from '../server/automation/cli.js';
const canary='PRIVATE_SOURCE_ARGUMENT_RESULT_PROVIDER_CANARY',sourceId=randomUUID(),inputId=randomUUID();
const input={uuid:inputId,raw_response:{source:'discord',source_id:sourceId,event_type:'message_created',event_id:'300',revision:'1',received_at:'2026-10-18T16:00:00Z',payload:{content:canary,url:'https://private.fixture.test/source'}}};
const config=()=>readAutomationConfig({AGENT_AUTOMATION_ENABLED:'true'});
const toolCall=(name='read_context',args={query:canary},id='read_1')=>({id,name,arguments:{inputIds:[inputId],arguments:args}});
const finishCall=(ids=[inputId])=>({id:'finish',name:'finish_batch',arguments:{handledInputIds:ids}});
const turn=(...toolCalls)=>({stopReason:'tool_calls',toolCalls,text:canary});
function fixture({onProgress,prepare=true,prepareBatch,turns=[turn(toolCall()),turn(finishCall())],execute,authorize=async()=>true,configPatch={}}={}) {
 const state={finish:0,release:0,execute:0,model:0,auth:0},events=[];let next=0;
 const store={configured:true,claim:async()=>({status:'ready',leaseToken:randomUUID(),inputs:[structuredClone(input)]}),renew:async()=>({status:'ready'}),release:async()=>{state.release++;return {status:'ready'};},finish:async()=>{state.finish++;return {status:'ready'};}};
 const tools=[{name:'read_context',description:'Read fixture context',readOnly:true,parameters:{type:'object',properties:{query:{type:'string'}},required:['query'],additionalProperties:false},execute:async(...args)=>{state.execute++;return execute?execute(...args):{status:'ready',body:canary,sources:[{sourceId,url:'https://private.fixture.test/source'}]};}}];
 const handler=createAutomationHandler({store,tools,principal:{id:'fixture'},config:{...config(),...configPatch},authorizeEvent:async(...args)=>{state.auth++;return authorize(...args);},
  ...(prepare?{prepareBatch:prepareBatch||(async()=>({status:'ready',context:canary}))}:{}),provider:{toolTurn:async request=>{state.model++;const step=turns[next++];return typeof step==='function'?step(request):step;}},
  onProgress:onProgress===undefined?event=>events.push(event):onProgress});
 return {handler,state,events};
}
const phases=new Set(['prepare_start','prepare_done','model_start','model_done','tool_start','tool_done']);
const statuses=new Set(['started','ready','pending','completed','aborted','forbidden','failed','already_succeeded','invalid_request']);
function safe(events){
 assert(events.length<=320);assert(!JSON.stringify(events).includes(canary));assert(!JSON.stringify(events).includes(sourceId));assert(!JSON.stringify(events).includes(inputId));assert(!JSON.stringify(events).includes('https://'));
 for(const event of events){assert(phases.has(event.phase));assert(statuses.has(event.status));assert.deepEqual(Object.keys(event).sort(),['calls','elapsedMs','phase','round','status',...(event.tool?['tool']:[])].sort());assert(Number.isInteger(event.round)&&event.round>=0&&event.round<=16);assert(Number.isInteger(event.calls)&&event.calls>=0&&event.calls<=80);assert(Number.isInteger(event.elapsedMs)&&event.elapsedMs>=0&&event.elapsedMs<=900000);if(event.tool)assert(['read_context','finish_batch'].includes(event.tool));}
}
test('handler progress identifies preparation/model/registered tools with metadata only',async()=>{
 const f=fixture();assert.equal((await f.handler.tick()).status,'completed');safe(f.events);
 assert.deepEqual(f.events.map(e=>e.phase),['prepare_start','prepare_done','model_start','model_done','tool_start','tool_done','model_start','model_done','tool_start','tool_done']);
 assert.deepEqual(f.events.filter(e=>e.phase==='tool_start').map(e=>e.tool),['read_context','finish_batch']);assert.equal(f.events.at(-1).status,'completed');assert.equal(f.events.at(-1).round,2);assert.equal(f.events.at(-1).calls,2);
 assert.equal(f.state.finish,1);assert.equal(f.state.execute,1);assert(f.events.every(Object.isFrozen));
});
test('throwing, rejecting or mutating diagnostic callbacks cannot change execution',async()=>{
 for(const onProgress of [()=>{throw Error(canary);},()=>Promise.reject(Error(canary)),event=>{event.arguments=canary;},()=>new Promise(()=>{})]){
  const f=fixture({onProgress});assert.equal((await f.handler.tick()).status,'completed');assert.equal(f.state.finish,1);assert.equal(f.state.execute,1);await setImmediate();
 }
 const f=fixture({onProgress:null});assert.equal((await f.handler.tick()).status,'completed');
});
test('prepare/model/tool errors and aborts emit fixed safe statuses without private errors',async()=>{
 const cases=[{prepareBatch:async()=>{throw Error(canary);},phase:'prepare_done',status:'failed'},
  {turns:[()=>{throw Error(canary);}],phase:'model_done',status:'failed'},
  {execute:async()=>{throw Error(canary);},phase:'tool_done',status:'failed',continues:true},
  {execute:async()=>({status:canary,body:canary}),phase:'tool_done',status:'failed',continues:true},
  {turns:[turn(toolCall(canary))],phase:'model_done',status:'failed'}];
 for(const {phase,status,continues=false,...options}of cases){
  if(continues)options.turns=[turn(toolCall()),request=>{const reply=request.messages.at(-1);assert.equal(reply.toolCallId,'read_1');assert.equal(JSON.parse(reply.content).status,'tool_error');assert(!reply.content.includes(canary));return turn(finishCall());}];
  const f=fixture(options),result=await f.handler.tick();safe(f.events);
  if(continues){assert.equal(result.status,'completed');assert(f.events.some(event=>event.phase===phase&&event.status===status));assert.equal(f.events.at(-1).status,'completed');assert.equal(f.state.model,2);}
  else {assert.notEqual(result.status,'completed');assert.equal(f.events.at(-1).phase,phase);assert.equal(f.events.at(-1).status,status);}
  assert.equal(f.state.finish,continues?1:0);
 }
 const controller=new AbortController(),f=fixture({turns:[()=>new Promise(()=>{})]});const running=f.handler.tick({signal:controller.signal});setTimeout(()=>controller.abort(),5);assert.equal((await running).status,'aborted');safe(f.events);assert.equal(f.events.at(-1).phase,'model_done');assert.equal(f.events.at(-1).status,'aborted');assert.equal(f.state.execute,0);
 const denied=fixture({authorize:async()=>false});assert.equal((await denied.handler.tick()).status,'forbidden');assert.deepEqual(denied.events,[]);
});
test('completion repair uses pending status and event cap stays320 under oversized injected limits',async()=>{
 const f=fixture({turns:[turn(finishCall([])),turn({...finishCall(),id:'finish2'})]});assert.equal((await f.handler.tick()).status,'completed');safe(f.events);assert(f.events.some(e=>e.phase==='tool_done'&&e.tool==='finish_batch'&&e.status==='pending'));
 const turns=Array.from({length:100},(_,i)=>turn(toolCall('read_context',{query:canary},`read_${i}`)));turns.push(turn(finishCall()));
 const large=fixture({turns,configPatch:{maxRounds:101,maxCalls:101}});assert.equal((await large.handler.tick()).status,'completed');safe(large.events);assert.equal(large.events.length,320);assert.equal(large.state.execute,100);
});

function cliFixture(){
 const output=[],env={AGENT_AUTOMATION_ENABLED:'true',AGENT_AUTOMATION_ADAPTER_MODULE:'./fixture-progress.mjs',SUPABASE_URL:'https://db.fixture.test',SUPABASE_SERVICE_ROLE_KEY:'synthetic-key',LLM_PROVIDER:'openai-compatible',LLM_MODEL:'fixture-model',LLM_API_KEY:'synthetic-model-key'};
 const adapters={principal:{id:'fixture',allowedSourceIds:[sourceId]},authorizeEvent:async()=>true,prepareBatch:async()=>({status:'ready',privateContext:canary}),tools:[{name:'read_context',description:'Read fixture',readOnly:true,parameters:{type:'object',properties:{}},execute:async()=>({status:'ready'})}]};
 const fetchImpl=async(url,init)=>{
  const name=new URL(url).pathname.split('/').at(-1);
  if(name==='agent_automation_claim_scoped')return Response.json({status:'ready',leaseToken:randomUUID(),inputs:[input]});
  if(['agent_automation_renew','agent_automation_finish','agent_automation_release'].includes(name))return Response.json(true);
  if(new URL(url).hostname==='api.openai.com')return Response.json({choices:[{finish_reason:'tool_calls',message:{role:'assistant',content:canary,tool_calls:[{id:'finish',type:'function',function:{name:'finish_batch',arguments:JSON.stringify({handledInputIds:[inputId]})}}]}}]});
  throw Error('No other HTTP fixture allowed');
 };
 return {output,run:patch=>main({args:['once'],env:{...env,...patch},write:event=>output.push(event),fetchImpl,loadModule:async()=>({createAutomationAdapters:async()=>adapters})})};
}
test('CLI keeps final-only output by default; exacttrue opt-in emits safe progress before final status',async()=>{
 for(const flag of [undefined,'false','1']){const f=cliFixture();assert.equal(await f.run(flag?{AGENT_AUTOMATION_LOG_PROGRESS:flag}:{}),0);assert.deepEqual(f.output,[{status:'completed',handled:1,remaining:0,calls:1}]);}
 const f=cliFixture();assert.equal(await f.run({AGENT_AUTOMATION_LOG_PROGRESS:'true'}),0);assert.equal(f.output.at(-1).status,'completed');const progress=f.output.slice(0,-1);assert.equal(progress.length,6);assert(progress.every(e=>e.kind==='agent_progress'));safe(progress.map(({kind,...event})=>event));
});
