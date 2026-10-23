import {attachTaskReads} from './fixtures/planner-followup.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createProvider} from '../server/providers/index.js';
import {createAutomationHandler} from '../server/automation/handler.js';
import {readAutomationConfig} from '../server/automation/config.js';
import {createStagedPipeline} from '../server/automation/staged-pipeline.js';
import {createBoundedResults} from '../server/automation/bounded-result.js';
import {DIAGNOSTIC_CODES} from '../server/tool-diagnostics.js';

const inputId=randomUUID(),leaseToken=randomUUID(),sourceId=randomUUID(),stamp='2026-10-22T18:00:00Z';
const secret='PRIVATE_FAILED_TOOL_BODY_AND_CREDENTIAL';
const input={uuid:inputId,raw_response:{source:'discord',source_id:sourceId,event_type:'message_created',event_id:'300',revision:'1',received_at:stamp,payload:{content:'Synthetic queued request'}}};
const call=(name,id,args={},ids=[inputId])=>({id,name,arguments:name==='finish_batch'?{handledInputIds:args}:{inputIds:ids,arguments:args}});
const turn=(...toolCalls)=>({stopReason:'tool_calls',text:'Synthetic proposal',toolCalls});
const finish=(id='finish',ids=[inputId])=>turn(call('finish_batch',id,ids));
const tool=(name,execute,readOnly=true)=>({name,description:'Synthetic action',...(readOnly?{readOnly:true}:{idempotent:true}),parameters:{type:'object',properties:{key:{type:'string'}},additionalProperties:false},execute});
function harness({tools,turns,config={},authorizeEvent,renew,action,pipeline,principal,providedProvider}={}) {
  const events=[],requests=[],progress=[],audits=[],receipts=new Set(),providerErrors=[];let index=0,pending=true,valid=true,leaseValid=true;
  const store={configured:true,claim:async()=>({status:'ready',leaseToken,inputs:[structuredClone(input)]}),
    renew:async()=>{events.push({kind:'renew'});return renew?renew():{status:leaseValid?'ready':'stale'};},
    action:async args=>{events.push({kind:'action',...args,signal:undefined});if(action)return action(args);if(receipts.has(args.actionKey))return {status:'completed'};if(args.complete){receipts.add(args.actionKey);return {status:'completed'};}return {status:'execute'};},
    finish:async()=>{events.push({kind:'finish'});pending=false;return {status:'ready'};},release:async()=>{events.push({kind:'release'});},fail:async args=>{events.push({kind:'fail',outcome:args.outcome});},
  };
  const provider=providedProvider??{toolTurn:async request=>{requests.push(structuredClone({...request,signal:undefined}));try{const next=turns[index++];assert(next,`Unexpected provider round ${index}`);return typeof next==='function'?await next(request):next;}catch(error){providerErrors.push(error);throw error;}}};
  const handler=createAutomationHandler({store,provider,tools,authorizeEvent:authorizeEvent??(async()=>valid),principal:principal??{id:'synthetic-worker',allowedSourceIds:[sourceId]},config:{...readAutomationConfig({AGENT_AUTOMATION_ENABLED:'true'}),...config},pipeline,
    onProgress:event=>progress.push(event),audit:{recordEvent:async event=>audits.push(event)},now:()=>new Date(stamp)});
  return {events,requests,progress,audits,receipts,pending:()=>pending,revoke:()=>{valid=false;},loseLease:()=>{leaseValid=false;},
    run:async(signal)=>{const result=await handler.tick({signal});if(providerErrors.length)throw providerErrors[0];return result;}};
}
function feedback(request,id){const row=request.messages.findLast(message=>message.role==='tool'&&message.toolCallId===id);assert(row,`Missing response for ${id}`);const value=JSON.parse(row.content);assert.equal(value.status,'tool_error');assert(Object.hasOwn(DIAGNOSTIC_CODES.reason,value.reason));assert(Buffer.byteLength(row.content)<1024);assert(!row.content.includes(secret));assert(!Object.hasOwn(value,'sources'));return value;}

for(const status of ['permission_denied','forbidden_source','not_found','conflict','unavailable','invalid_request','aborted','stale','invented_upstream_status'])test(`returned ${status} reaches the model safely and allows a later independent action`,async()=>{
  let writes=0;const h=harness({tools:[tool('read_discord_messages',async()=>({status,sources:[{excerpt:secret}],private:secret})),tool('upsert_map_event',async()=>{writes++;return {status:'ready'};},false)],turns:[
    turn(call('read_discord_messages','failed_read')),
    request=>{const result=feedback(request,'failed_read');assert.equal(result.reason,status==='invented_upstream_status'?'tool_failed':status);return turn(call('upsert_map_event','save'));},finish(),
  ]});
  assert.equal((await h.run()).status,'completed');assert.equal(writes,1);assert.equal(h.receipts.size,1);assert(!h.pending());
  const failed=h.audits.find(event=>event.kind==='tool_finished'&&event.tool==='read_discord_messages');assert(failed);assert.notEqual(failed.diagnostics.outcome,'success');assert(!JSON.stringify(h.audits).includes(secret));
});

test('failed write gets no success receipt and the same action key can succeed on retry',async()=>{
  let writes=0;const keys=[];const h=harness({tools:[tool('upsert_map_event',async(_args,context)=>{keys.push(context.idempotencyKey);return ++writes===1?{status:'conflict',private:secret}:{status:'ready',saved:true};},false)],turns:[
    turn(call('upsert_map_event','first',{key:'same-action'})),
    request=>{feedback(request,'first');assert.equal(h.receipts.size,0);assert.equal(h.events.filter(event=>event.kind==='action'&&event.complete).length,0);return turn(call('upsert_map_event','retry',{key:'same-action'}));},
    request=>{assert.equal(JSON.parse(request.messages.at(-1).content).status,'ready');return finish();},
  ]});
  assert.equal((await h.run()).status,'completed');assert.equal(writes,2);assert.equal(new Set(keys).size,1);assert.equal(h.receipts.size,1);assert.equal(h.events.filter(event=>event.kind==='action'&&event.complete).length,1);
});

test('successful siblings before and after a failed call execute and each receives its own paired response',async()=>{
  const executed=[];const h=harness({tools:[tool('upsert_map_event',async args=>{executed.push(args.key);return args.key==='bad'?{status:'unavailable',body:secret}:{status:'ready',saved:args.key};},false)],turns:[
    turn(call('upsert_map_event','before',{key:'before'}),call('upsert_map_event','bad',{key:'bad'}),call('upsert_map_event','after',{key:'after'})),
    request=>{const replies=request.messages.filter(message=>message.role==='tool');assert.deepEqual(replies.map(row=>row.toolCallId),['before','bad','after']);assert.equal(JSON.parse(replies[0].content).saved,'before');feedback(request,'bad');assert.equal(JSON.parse(replies[2].content).saved,'after');return finish();},
  ]});
  assert.equal((await h.run()).status,'completed');assert.deepEqual(executed,['before','bad','after']);assert.equal(h.receipts.size,2);assert.equal(h.events.filter(event=>event.kind==='action'&&event.complete).length,2);
});

const malformed=[
  ['null',()=>null,'invalid_result'],['undefined',()=>undefined,'invalid_result'],['array',()=>[],'invalid_result'],['number',()=>17,'invalid_result'],['missing status',()=>({body:secret}),'invalid_result'],
  ['cyclic',()=>{const value={status:'ready',body:secret};value.self=value;return value;},'invalid_result'],
  ['invalid numeric field',()=>({status:'ready',value:NaN,body:secret}),'invalid_result'],
  ['nested undefined',()=>({status:'ready',nested:{value:undefined},body:secret}),'invalid_result'],
  ['nested function',()=>({status:'ready',nested:{value:()=>secret},body:secret}),'invalid_result'],
  ['bigint',()=>({status:'ready',value:1n,body:secret}),'invalid_result'],
  ['oversized',()=>({status:'ready',body:secret+'界'.repeat(17000)}),'result_too_large'],
  ['exception',()=>{throw Error(secret);},'exception'],
];
for(const [label,value,reason] of malformed)test(`${label} tool result is replaced with bounded feedback and creates no successful receipt`,async()=>{
  const h=harness({tools:[tool('upsert_map_event',async()=>value(),false)],turns:[turn(call('upsert_map_event','malformed')),request=>{assert.equal(feedback(request,'malformed').reason,reason);return finish();}]});
  assert.equal((await h.run()).status,'completed');assert.equal(h.receipts.size,0);assert.equal(h.events.filter(event=>event.kind==='action'&&event.complete).length,0);assert(!JSON.stringify(h.audits).includes(secret));
  const failed=h.audits.find(event=>event.kind==='tool_finished'&&event.tool==='upsert_map_event');assert(failed);assert.notEqual(failed.diagnostics.outcome,'success');assert.equal(failed.diagnostics.reason,reason);
});

test('a failed action followed by no valid completion keeps originals queued',async()=>{
  const h=harness({tools:[tool('upsert_map_event',async()=>({status:'unavailable'}),false)],turns:[turn(call('upsert_map_event','failed')),request=>{feedback(request,'failed');return {stopReason:'stop',text:'I could not finish',toolCalls:[]};}]});
  assert.equal((await h.run()).status,'incomplete_batch');assert(h.pending());assert.equal(h.receipts.size,0);assert(!h.events.some(event=>event.kind==='finish'));
});

for(const failure of ['permission','lease','action receipt'])test(`actual ${failure} loss outside the tool stops later siblings and completion`,async()=>{
  let h,writes=0;h=harness({tools:[tool('read_discord_messages',async()=>{if(failure==='permission')h.revoke();if(failure==='lease')h.loseLease();return {status:'unavailable'};}),tool('upsert_map_event',async()=>{writes++;return {status:'ready'};},false)],
    ...(failure==='action receipt'?{action:async()=>({status:'stale'})}:{}),turns:[turn(call('read_discord_messages','read'),call('upsert_map_event','write')),finish()]});
  assert.equal((await h.run()).status,failure==='permission'?'forbidden':'stale');assert.equal(writes,0);assert.equal(h.receipts.size,0);assert(h.pending());assert(!h.events.some(event=>event.kind==='finish'));
});

for(const failure of ['caller abort','overall deadline'])test(`${failure} during a tool remains a hard stop even when the tool ignores cancellation`,async()=>{
  const controller=new AbortController();let began;const started=new Promise(resolve=>{began=resolve;});
  const h=harness({config:failure==='overall deadline'?{maxRunMs:20}:{},tools:[tool('read_discord_messages',async()=>{began();return new Promise(()=>{});})],turns:[turn(call('read_discord_messages','read')),finish()]});
  // Keep the process alive while the handler's deliberately unref'd deadline runs.
  const keeper=setTimeout(()=>{},1000);try{const pending=h.run(controller.signal);await started;if(failure==='caller abort')controller.abort();assert.equal((await pending).status,'aborted');}finally{clearTimeout(keeper);}
  assert(h.pending());assert.equal(h.requests.length,1);assert(!h.events.some(event=>event.kind==='finish'));assert.equal(h.events.some(event=>event.kind==='release'),failure==='caller abort');if(failure==='overall deadline')assert(h.events.some(event=>event.kind==='fail'&&event.outcome==='timeout'));
});

for(const status of ['audit_unavailable'])test(`reserved ${status} control failure does not become a recoverable tool error`,async()=>{
  const h=harness({tools:[tool('upsert_map_event',async()=>({status}),false)],turns:[turn(call('upsert_map_event','write')),finish()]});
  assert.equal((await h.run()).status,status);assert(h.pending());assert.equal(h.requests.length,1);assert.equal(h.receipts.size,0);assert(!h.events.some(event=>event.kind==='finish'));
});

test('recoverable failures still consume unchanged model/tool budgets and cannot loop without bounds',async()=>{
  const h=harness({config:{maxRounds:2},tools:[tool('read_discord_messages',async()=>({status:'unavailable'}))],turns:[turn(call('read_discord_messages','one')),request=>{feedback(request,'one');return turn(call('read_discord_messages','two'));}]});
  assert.equal((await h.run()).status,'round_limit');assert.equal(h.requests.length,2);assert(h.pending());
  const callBound=harness({config:{maxCalls:1},tools:[tool('read_discord_messages',async()=>({status:'unavailable'}))],turns:[turn(call('read_discord_messages','one')),request=>{feedback(request,'one');return turn(call('read_discord_messages','two'));}]});
  assert.equal((await callBound.run()).status,'call_limit');assert.equal(callBound.requests.length,2);assert(h.pending());
});

test('actual staged task resolver refuses generic failed write as completion and retains the pending task',async()=>{
  const taskId=randomUUID(),personId=randomUUID(),task={uuid:taskId,created_at:stamp,updated_at:stamp,expires_at:'2026-10-23T18:00:00Z',info:{version:1,sourceIds:[sourceId],inputs:[structuredClone(input)],request:{summary:'Attach speaker to workshop',operation:'participation',calendarEventId:'workshop123',personId},executionHistory:[]}};
  const rows=new Map([[taskId,task]]),storage=[],principal={id:'synthetic-worker',allowedSourceIds:[sourceId]};
  const taskStore={configured:true,list:async()=>({status:'ready',tasks:structuredClone([...rows.values()])}),
    save:async args=>{storage.push('save');const prior=rows.get(args.task.uuid),saved={...prior,...args.task,updated_at:'2026-10-22T18:01:00Z'};rows.set(saved.uuid,saved);return {status:'ready',task:structuredClone(saved)};},
    resolve:async args=>{storage.push('resolve');rows.delete(args.taskId);return {status:'ready'};},
  };
  attachTaskReads(taskStore,rows);
  const staged=createStagedPipeline({taskStore,principal,fragments:createBoundedResults(),now:()=>new Date(stamp),authorizeInputs:async()=>true,bindTask:async()=>{},runSync:async()=>({status:'ready',results:[],unresolved:[]})});
  const h=harness({principal,pipeline:staged.pipeline,tools:[...staged.tools,tool('upsert_map_event',async()=>({status:'conflict',body:secret}),false)],turns:[
    finish('initial'),turn(call('read_pending_task','read_task',{taskId},[taskId])),
    turn(call('upsert_map_event','write_failed',{},[taskId])),
    request=>{feedback(request,'write_failed');return turn(call('resolve_pending_task','resolve_failed',{taskId,outcome:'completed'},[taskId]));},
    request=>{assert.equal(feedback(request,'resolve_failed').reason,'invalid_request');return finish('final',[]);},
  ]});
  assert.equal((await h.run()).status,'completed');assert(rows.has(taskId));assert(!storage.includes('resolve'));assert.equal(h.receipts.size,0);
  assert(rows.get(taskId).info.executionHistory.some(row=>row.kind==='tool_result'&&row.tool==='upsert_map_event'&&row.result.status==='tool_error'));
  assert(!JSON.stringify(rows.get(taskId)).includes(secret));
});

for(const providerName of ['openai-compatible','anthropic'])test(`actual ${providerName} provider receives paired failed/successful sibling results and continues`,async()=>{
  const requests=[],errors=[];let n=0,writes=0;
  const provider=createProvider({configured:true,provider:providerName,baseUrl:providerName==='anthropic'?'https://api.anthropic.com/v1':'https://api.openai.com/v1',model:providerName==='anthropic'?'claude-fixture':'gpt-6-luna',apiKey:'synthetic',timeoutMs:1000},{fetchImpl:async(_url,options)=>{
    try{
      const body=JSON.parse(options.body);requests.push(body);
      if(n++===1){
        const results=providerName==='anthropic'?body.messages.flatMap(message=>Array.isArray(message.content)?message.content:[]).filter(part=>part.type==='tool_result'):body.messages.filter(message=>message.role==='tool');
        assert.deepEqual(results.map(row=>row.tool_use_id??row.tool_call_id),['failed_native','saved_native']);
        assert.equal(JSON.parse(results[0].content).status,'tool_error');assert.equal(JSON.parse(results[1].content).status,'ready');assert(!JSON.stringify(results).includes(secret));
      }
      const calls=n===1?[call('read_discord_messages','failed_native'),call('upsert_map_event','saved_native')]:[call('finish_batch','finished_native',[inputId])];
      return providerName==='anthropic'?Response.json({id:'msg_fixture',type:'message',role:'assistant',content:calls.map(row=>({type:'tool_use',id:row.id,name:row.name,input:row.arguments})),stop_reason:'tool_use'}):Response.json({id:'completion_fixture',choices:[{index:0,finish_reason:'tool_calls',message:{role:'assistant',content:'',tool_calls:calls.map(row=>({id:row.id,type:'function',function:{name:row.name,arguments:JSON.stringify(row.arguments)}}))}}]});
    }catch(error){errors.push(error);throw error;}
  }});
  const h=harness({providedProvider:provider,tools:[tool('read_discord_messages',async()=>({status:'not_found',body:secret})),tool('upsert_map_event',async()=>{writes++;return {status:'ready'};},false)]});
  const result=await h.run();if(errors.length)throw errors[0];assert.equal(result.status,'completed');assert.equal(requests.length,2);assert.equal(writes,1);assert.equal(h.receipts.size,1);assert(!h.pending());
});

for(const code of ['aborted','stale','forbidden'])test(`tool-local thrown ${code} is recoverable while the real run signal, lease and source remain valid`,async()=>{
  const h=harness({tools:[tool('read_discord_messages',async()=>{throw Error(code);})],turns:[turn(call('read_discord_messages','local_exception')),request=>{assert.equal(feedback(request,'local_exception').reason,code);return finish();}]});
  assert.equal((await h.run()).status,'completed');assert.equal(h.requests.length,2);assert.equal(h.receipts.size,0);assert(!h.pending());
});
