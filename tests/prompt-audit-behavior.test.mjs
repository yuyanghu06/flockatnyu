import test from 'node:test';
import assert from 'node:assert/strict';
import {workerFixture,workerIds,assertDeferredWorker,chatRun,conflictFixture} from './prompt-audit-model.mjs';
import {attendanceArguments,scriptedProvider} from './fixtures/chat-map-attendance.mjs';

const call=(name,id,args={},scope=[workerIds.task])=>({id,name,arguments:name==='finish_batch'?{handledInputIds:args}:{inputIds:scope,arguments:args}});
const turn=(...toolCalls)=>({text:'Synthetic test interpretation',stopReason:'tool_calls',toolCalls});
function workerProvider({invalidDefer=false}={}){let step=0;return {toolTurn:async request=>{
  const responses=[turn({id:'initial',name:'finish_batch',arguments:{handledInputIds:[],noChangeInputIds:[workerIds.queue]}}),turn(call('read_pending_task','task',{taskId:workerIds.task})),turn(call('read_discord_messages','source',{channelId:'200',messageId:'300',context:false,limit:1})),()=>{
    assert(request.messages.some(row=>row.role==='tool'&&JSON.parse(row.content).status==='tool_error'));
    return turn(call('defer_task','defer',{taskId:workerIds.task,summary:'Exact original is unavailable; retain the same unfinished Calendar review',...(invalidDefer?{}:{operation:'source_review'})}));
  },...(invalidDefer?[()=>{assert.equal(JSON.parse(request.messages.at(-1).content).status,'tool_error');return turn(call('defer_task','corrected_defer',{taskId:workerIds.task,summary:'Exact original is unavailable; retain the same unfinished Calendar review',operation:'source_review'}));}]:[]),turn(call('finish_batch','final',[]))];const response=responses[step++];assert(response,'Unexpected model request');return typeof response==='function'?response():response;
}};}
test('actual staged handler reads saved task, continues after failed normal source read and defers the exact unresolved task',async()=>{
  const f=workerFixture(workerProvider()),result=await f.handler.tick();assertDeferredWorker(f,result);assert.equal(f.tasks.get(workerIds.task).info.request.summary,'Exact original is unavailable; retain the same unfinished Calendar review');
});
test('actual required defer schema rejects missing operation safely then accepts an exact corrected retry without resolving pending work',async()=>{
  const f=workerFixture(workerProvider({invalidDefer:true})),result=await f.handler.tick();assert.equal(result.status,'completed');assert.equal(result.followupStatus,'completed');assert.equal(f.tasks.size,1);assert.equal(f.queued.length,0);assert.equal(f.resolutions,0);assert.equal(f.tasks.get(workerIds.task).info.request.operation,'source_review');
  const writes=f.execution.filter(row=>row.kind==='tool_result'&&row.tool==='defer_task');assert.equal(writes.length,2);assert.equal(writes[0].result.status,'tool_error');assert.equal(writes[1].result.status,'ready');assert.equal(writes[1].arguments.taskId,workerIds.task);assert(f.operations.every(row=>row.task.uuid===workerIds.task));
});
const read={name:'read_map_events',arguments:{}},lookup={name:'lookup_map_person',arguments:{}};
test('after one optimistic conflict the identical map read gets fresh state and a distinct merged proposal preserves human changes',async()=>{
  const f=conflictFixture();const provider=scriptedProvider([[read,lookup],[{name:'upsert_map_event',arguments:attendanceArguments()}],[read],()=>[{name:'upsert_map_event',arguments:attendanceArguments(f.state)}],[]]);
  const answer=await chatRun(provider,{map:f});if(provider.errors.length)throw provider.errors[0];assert.equal(answer.result.status,'succeeded');assert.equal(f.calls.filter(row=>row.name==='read_map_events').length,2);assert.equal(f.attempts.length,2);assert.equal(f.writes.length,1);assert.equal(f.state.events[0].notes,'Concurrent human correction: preserve this note');assert.equal(f.attempts[1].expectedUpdatedAt,'2026-10-22T20:02:01.000Z');
  const receipt=provider.requests.at(-1).system;assert(receipt.includes('submitted_values_not_readback'));assert(receipt.includes('Concurrent human correction: preserve this note'));
});
test('persistent conflicts do not permit unbounded repeated reads or an identical failed write retry',async()=>{
  const f=conflictFixture({persistent:true}),first={name:'upsert_map_event',arguments:attendanceArguments()};let second;
  const provider=scriptedProvider([[read,lookup],[first],[read],()=>{second={name:'upsert_map_event',arguments:attendanceArguments(f.state)};return [second];},[read],()=>[second],[]],{answer:'The event kept changing; I could not confirm saving attendance.'});
  const answer=await chatRun(provider,{map:f});if(provider.errors.length)throw provider.errors[0];assert.equal(answer.result.status,'succeeded');assert.equal(f.calls.filter(row=>row.name==='read_map_events').length,2);assert.equal(f.attempts.length,2);assert.equal(f.writes.length,0);assert.equal(f.state.events[0].notes,'Concurrent human correction: preserve this note');
});
test('unsupported model tool arguments are refused before a map read or write',async()=>{
  const f=conflictFixture(),provider=scriptedProvider([[{name:'read_map_events',arguments:{forceRefresh:true}}],[]]);await chatRun(provider,{map:f});if(provider.errors.length)throw provider.errors[0];assert.equal(f.calls.filter(row=>row.name==='store.read').length,0);assert.equal(f.calls.find(row=>row.name==='read_map_events').result.status,'invalid_request');assert.equal(f.attempts.length,0);
});
