import test from 'node:test';
import assert from 'node:assert/strict';
import {createBoundedResults} from '../server/automation/bounded-result.js';
import {compactConversation} from '../server/automation/conversation-context.js';
import {encodeTaskInfo,decodeTaskInfo,postgresJsonBytes} from '../server/automation/task-history-codec.js';
import {selectedFixture,input,task,ids,copy,now,originalUrl,call,turn,scriptedProvider,preserveBusinessState,bytes} from './fixtures/planner-selected-fixes.mjs';

const readOriginal=(original)=>({url:originalUrl(original),context:false});
const mapTarget={sourceId:ids.club,sourceRecordId:'workshop20261023'};
async function open(f,t){await f.prepare();await f.afterInitial();const read=await f.execute('read_pending_task',{taskId:t.uuid},[t.uuid]);assert.equal(read.status,'ready');assert(!read.fragment,'This task intent fits in a complete compact read');return read;}

test('an explicit nonactionable review closes its exact task without Calendar/map writes',async()=>{
  const own=input(1,{content:'Thanks for posting the slides!'}),t=task(1,{current:true,operation:'source_review',original:own,large:false});
  const unrelated=task(2,{operation:'source_review',original:input(2,{content:'A separate plan still needs a room.'}),large:false});
  const f=selectedFixture({pending:[t,unrelated]});const old=copy(f.tasks.get(unrelated.uuid));
  const read=await open(f,t);assert(Array.isArray(read.sourceHints));
  assert.equal((await f.execute('read_discord_messages',readOriginal(own),[t.uuid])).status,'ready');
  const result=await f.execute('resolve_pending_task',{taskId:t.uuid,outcome:'no_change_needed',reason:'no_actionable_request'},[t.uuid]);
  assert.equal(result.status,'ready');assert.equal(result.resolutionOutcome,'no_change_needed');assert(!f.tasks.has(t.uuid));assert.deepEqual(f.tasks.get(unrelated.uuid),old);preserveBusinessState(f);
});

test('already-correct attendance can finish from current source and map reads without a redundant write',async()=>{
  const own=input(),t=task(1,{current:true,original:own,large:false}),f=selectedFixture({pending:[t],alreadyCorrect:true});
  await open(f,t);await f.execute('read_discord_messages',readOriginal(own),[t.uuid]);
  const state=await f.execute('read_map_events',mapTarget,[t.uuid]);assert.equal(state.status,'ready');assert(state.participationTargets.some(row=>row.eligible&&row.mapEventId===ids.event));
  const result=await f.execute('resolve_pending_task',{taskId:t.uuid,outcome:'no_change_needed',reason:'already_correct'},[t.uuid]);
  assert.equal(result.status,'ready');assert.equal(result.resolutionOutcome,'no_change_needed');assert(!f.tasks.has(t.uuid));preserveBusinessState(f);
});

for(const code of ['not_found','permission_denied','discord_unavailable'])test('an access/source failure '+code+' cannot masquerade as missing original or no change',async()=>{
  const t=task(1,{current:true,large:false});const f=selectedFixture({pending:[t],...(code==='discord_unavailable'?{sourceFailure:code}:{authFailure:code})});
  await open(f,t);const read=await f.execute('read_discord_messages',readOriginal(t.info.inputs[0]),[t.uuid]);
  assert.notEqual(read.status,'ready');assert.notEqual(read.outcome,'source_missing');
  const missing=await f.execute('resolve_pending_task',{taskId:t.uuid,outcome:'source_missing'},[t.uuid]);assert.notEqual(missing.status,'ready');
  const noChange=await f.execute('resolve_pending_task',{taskId:t.uuid,outcome:'no_change_needed',reason:'no_actionable_request'},[t.uuid]);assert.notEqual(noChange.status,'ready');assert(f.tasks.has(t.uuid));preserveBusinessState(f);
});

test('exact authorized missing original acknowledges only its queue input and deletes only its task version',async()=>{
  const own=input(),t=task(1,{current:true,original:own,large:false}),f=selectedFixture({pending:[t],missing:['301'],backlog:1});
  const unrelated=copy(f.backlogTasks[0]);
  const result=await f.run(scriptedProvider([
    turn(call('read_discord_messages','read_missing',readOriginal(own),[own.uuid])),
    turn(call('finish_batch','initial_missing',{handledInputIds:[own.uuid],missingInputIds:[own.uuid]})),
    turn(call('read_pending_task','read_own_task',{taskId:t.uuid},[t.uuid])),
    turn(call('resolve_pending_task','resolve_missing',{taskId:t.uuid,outcome:'source_missing'},[t.uuid])),
    turn(call('finish_batch','final',{handledInputIds:[]})),
  ]));
  assert.equal(result.status,'completed');assert.equal(result.handled,1);assert(!f.tasks.has(t.uuid));assert.deepEqual(f.tasks.get(unrelated.uuid),unrelated);
  assert.deepEqual(f.finishPackets.at(-1).handledInputIds,[own.uuid]);
  const read=f.tools.find(row=>row.name==='read_discord_messages');assert.equal(read.result.status,'ready');assert.equal(read.result.outcome,'source_missing');assert.equal(read.result.coverage.complete,true);
  assert.equal(f.execution.filter(row=>row.kind==='tool_result'&&row.tool==='sync_calendars_to_map').length,1,'Initial completion still triggers its separate named sync');
  preserveBusinessState(f);
});

test('an incidental guessed missing message cannot clear the task whose real original still exists',async()=>{
  const t=task(1,{current:true,large:false}),f=selectedFixture({pending:[t]});await open(f,t);
  const absent=await f.execute('read_discord_messages',{channelId:'200',messageId:'999999999999999999',context:false},[t.uuid]);assert.equal(absent.outcome,'source_missing');
  const result=await f.execute('resolve_pending_task',{taskId:t.uuid,outcome:'source_missing'},[t.uuid]);assert.notEqual(result.status,'ready');assert(f.tasks.has(t.uuid));preserveBusinessState(f);
});

test('missing one original of a multi-original task preserves its remaining work',async()=>{
  const own=input(),t=task(1,{current:true,original:own,large:false});t.info.inputs.push(input(2,{content:'Separate essential follow-up still applies.'}));
  const f=selectedFixture({pending:[t],missing:['301']});await open(f,t);
  await f.execute('read_discord_messages',readOriginal(own),[t.uuid]);
  const result=await f.execute('resolve_pending_task',{taskId:t.uuid,outcome:'source_missing'},[t.uuid]);assert.notEqual(result.status,'ready');assert(f.tasks.has(t.uuid));preserveBusinessState(f);
});

test('a newer task revision survives a no-change decision made from an older read',async()=>{
  const own=input(1,{content:'Thanks for posting the slides.'}),t=task(1,{current:true,operation:'source_review',original:own,large:false}),f=selectedFixture({pending:[t]});await open(f,t);
  await f.execute('read_discord_messages',readOriginal(own),[t.uuid]);
  const changed=f.tasks.get(t.uuid);changed.updated_at='2026-10-23T22:31:00.000Z';changed.info.request.summary='A newer instruction still requires action.';const expected=copy(changed);
  const result=await f.execute('resolve_pending_task',{taskId:t.uuid,outcome:'no_change_needed',reason:'no_actionable_request'},[t.uuid]);assert.equal(result.status,'conflict');assert.deepEqual(f.tasks.get(t.uuid),expected);preserveBusinessState(f);
});

test('a subsequently observed original invalidates an older missing-original result',async()=>{
  const own=input(),t=task(1,{current:true,original:own,large:false}),f=selectedFixture({pending:[t],missing:['301']});await open(f,t);
  assert.equal((await f.execute('read_discord_messages',readOriginal(own),[t.uuid])).outcome,'source_missing');
  f.controls.missing.delete('301');const returned=await f.execute('read_discord_messages',{url:originalUrl(own),context:true},[t.uuid]);assert(returned.sources.some(row=>row.messageId==='301'));
  assert.notEqual((await f.execute('resolve_pending_task',{taskId:t.uuid,outcome:'source_missing'},[t.uuid])).status,'ready');assert(f.tasks.has(t.uuid));preserveBusinessState(f);
});

test('a failed newest target read blocks an already-correct decision based on older state',async()=>{
  const own=input(),t=task(1,{current:true,original:own,large:false}),f=selectedFixture({pending:[t],alreadyCorrect:true});await open(f,t);await f.execute('read_discord_messages',readOriginal(own),[t.uuid]);
  assert.equal((await f.execute('read_map_events',mapTarget,[t.uuid])).status,'ready');
  f.currentTargetUnavailable=true;assert.notEqual((await f.execute('read_map_events',mapTarget,[t.uuid])).status,'ready');
  const result=await f.execute('resolve_pending_task',{taskId:t.uuid,outcome:'no_change_needed',reason:'already_correct'},[t.uuid]);assert.notEqual(result.status,'ready');assert(f.tasks.has(t.uuid));preserveBusinessState(f);
});

for(const target of [mapTarget,{eventId:ids.event}])test('an unrelated ready map read cannot hide the current target failure for '+(target.eventId?'a map event UUID':'a Calendar source identity'),async()=>{
  const own=input(),t=task(1,{current:true,original:own,large:false}),f=selectedFixture({pending:[t],alreadyCorrect:true});await open(f,t);
  const current=await f.execute('read_discord_messages',readOriginal(own),[t.uuid]);assert.equal(current.status,'ready');assert(current.sources.some(row=>row.messageId===own.raw_response.payload.id));
  const first=await f.execute('read_map_events',target,[t.uuid]);assert.equal(first.status,'ready');assert(first.events.some(row=>row.id===ids.event));
  f.currentTargetUnavailable=true;const failed=await f.execute('read_map_events',target,[t.uuid]);assert.notEqual(failed.status,'ready');
  f.currentTargetUnavailable=false;const unrelated=await f.execute('read_map_events',{sourceId:ids.club,sourceRecordId:'unrelated-empty-occurrence'},[t.uuid]);assert.equal(unrelated.status,'ready');assert.notEqual(unrelated.coverage?.complete,false);assert.notEqual(unrelated.partial,true);assert.deepEqual(unrelated.events,[]);
  const expected=copy(f.tasks.get(t.uuid)),blocked=await f.execute('resolve_pending_task',{taskId:t.uuid,outcome:'no_change_needed',reason:'already_correct'},[t.uuid]);
  assert.notEqual(blocked.status,'ready','Only current evidence about this task target may support already_correct');assert.deepEqual(f.tasks.get(t.uuid),expected);preserveBusinessState(f);
  const recovered=await f.execute('read_map_events',target,[t.uuid]);assert.equal(recovered.status,'ready');assert(recovered.events.some(row=>row.id===ids.event));
  const closed=await f.execute('resolve_pending_task',{taskId:t.uuid,outcome:'no_change_needed',reason:'already_correct'},[t.uuid]);assert.equal(closed.status,'ready');assert.equal(closed.resolutionOutcome,'no_change_needed');assert(!f.tasks.has(t.uuid));preserveBusinessState(f);
});

test('held page-ID problem reproduces: nonexistent IDs reject while the actual issued ID continues losslessly',async()=>{
  const fragments=createBoundedResults(),value={status:'ready',body:'Synthetic complete source text 🙂 '.repeat(1400)},first=fragments.bound(value);assert(first.fragment);
  for(const id of ['00000000-0000-0000-0000-000000000000','11111111-1111-5111-8111-111111111111','22222222-2222-4222-8222-222222222222'])assert.equal((await fragments.tool.execute({id,offset:0})).status,'invalid_request');
  let piece=first,text=first.fragment.data;
  while(piece.fragment.nextOffset!==null){piece=await fragments.tool.execute({id:first.fragment.id,offset:piece.fragment.nextOffset});assert.equal(piece.status,'ready');text+=piece.fragment.data;}
  assert.deepEqual(JSON.parse(text),value);
});

test('compaction retires obsolete tool bodies without modifying evidence, pairs or the latest failure',()=>{
  const big='Old redundant provider result. '.repeat(5000),messages=[{role:'user',content:JSON.stringify({referenceBindings:{inputIds:[]}})}],execution=[];
  for(let n=1;n<=3;n++){
    const result=n===3?{status:'unavailable',reason:'source_unavailable'}:{status:'ready',sources:[{content:big}],coverage:{complete:false}};
    messages.push({role:'assistant',content:'',toolCalls:[{id:'r'+n,name:'read_discord_messages',arguments:{inputIds:[],arguments:{channelId:'200',messageId:'301',context:false}}}]},{role:'tool',toolCallId:'r'+n,content:JSON.stringify(result)});
    execution.push({kind:'tool_result',tool:'read_discord_messages',callId:'r'+n,inputIds:[],arguments:{channelId:'200',messageId:'301',context:false},result:copy(result)});
  }
  const untouched={messages:copy(messages),execution:copy(execution)};
  const compacted=compactConversation({messages,executionLog:execution,snapshot:{status:'ready',tasks:[],fragments:[]},referenceBindings:{inputIds:[]},phase:'initial'});
  assert(compacted.compacted);assert(compacted.afterBytes<262144);assert(compacted.afterBytes<bytes(messages));assert.deepEqual(messages,untouched.messages);assert.deepEqual(execution,untouched.execution);
  const assistantIds=compacted.messages.flatMap(row=>row.role==='assistant'?(row.toolCalls||[]).map(call=>call.id):[]),toolIds=compacted.messages.filter(row=>row.role==='tool').map(row=>row.toolCallId);
  assert.deepEqual(toolIds,assistantIds);assert.equal(JSON.parse(compacted.messages.find(row=>row.toolCallId==='r3').content).status,'unavailable');
  const again=compactConversation({messages:compacted.messages,executionLog:execution,snapshot:{status:'ready',tasks:[],fragments:[]},referenceBindings:{inputIds:[]},phase:'initial'});assert.deepEqual(again.messages,compacted.messages);
});

test('compaction preserves a mandatory incomplete compact-task chain rather than inventing a complete task read',()=>{
  const taskId='50000000-0000-4000-8000-000000000001',id='70000000-0000-4000-8000-000000000001';
  const serialized=JSON.stringify({status:'ready',task:{uuid:taskId,info:{request:{summary:'Preserve the exact own intent'},inputs:[{raw_response:{payload:{content:'Essential original facts 🙂 '.repeat(18000)}}}]}}});
  const messages=[{role:'user',content:JSON.stringify({referenceBindings:{inputIds:[{ref:'t_test_1',uuid:taskId}]}})}],execution=[];
  for(let n=0;n<27;n++){
    const offset=n*12000,result={status:'ready',coverage:{complete:false},fragment:{id,encoding:'json-fragment',offset,nextOffset:offset+12000,totalChars:serialized.length,data:serialized.slice(offset,offset+12000)}};
    const tool=n?'read_context_fragment':'read_pending_task',args=n?{id,offset}:{taskId},callId='required_'+n;
    messages.push({role:'assistant',content:'',toolCalls:[{id:callId,name:tool,arguments:{inputIds:[taskId],arguments:args}}]},{role:'tool',toolCallId:callId,content:JSON.stringify(result)});execution.push({kind:'tool_result',tool,callId,inputIds:[taskId],arguments:args,result:copy(result)});
  }
  const before=copy(messages),result=compactConversation({messages,executionLog:execution,snapshot:{status:'ready',tasks:[],fragments:[{id,taskId,detail:'compact',nextOffset:324000,totalChars:serialized.length,complete:false}]},referenceBindings:{inputIds:[{ref:'t_test_1',uuid:taskId}]},phase:'followup'});
  assert(result.afterBytes>262144,'Indispensable information remains above the existing bound so the runner must stop honestly');
  for(const message of before.filter(row=>row.role==='tool'))assert.equal(result.messages.find(row=>row.toolCallId===message.toolCallId).content,message.content,'No mandatory unseen prefix is silently discarded');assert.deepEqual(messages,before);
});

for(const initialCap of [false,true])test('production runner trims optional history with '+(initialCap?'initial-round carryover':'a completed initial phase')+' while preserving private evidence',async()=>{
  const first=task(1,{current:true}),second=task(2,{current:true}),f=selectedFixture({pending:[first,second],backlog:198});
  for(const row of [first,second]){
    const saved=f.tasks.get(row.uuid);saved.info.executionHistory=[{kind:'tool_result',tool:'read_map_events',inputIds:[row.uuid],arguments:{},result:{status:'ready',unrelatedHistoricalDescriptions:'Earlier unrelated event details; retain in private evidence. '.repeat(6000)}}];
    const wire=encodeTaskInfo(saved.info);assert.deepEqual(decodeTaskInfo(wire),saved.info);assert(postgresJsonBytes(wire)<262144);
  }
  if(initialCap)for(const row of f.backlogTasks.slice(-8))f.tasks.get(row.uuid).info.inputs[0].raw_response.payload.content='A separate old discussion that is not the selected task. '.repeat(80);
  const retained=copy([...f.tasks.values()]);let initialTurns=0,followupTurns=0,chain;
  const result=await f.run({toolTurn:async request=>{
    if(!request.system.includes('FOLLOWUP phase')){
      initialTurns++;
      if(!initialCap)return turn(call('finish_batch','initial_finish',{handledInputIds:f.originals.map(row=>row.uuid)}));
      return turn(call('read_discord_window','initial_window_'+initialTurns,{channelId:'200',from:'2026-10-23T20:00:00.000Z',to:'2026-10-23T23:00:00.000Z'},f.originals.map(row=>row.uuid)));
    }
    followupTurns++;
    if(followupTurns===1)return turn(call('read_pending_task','compact_first',{taskId:first.uuid},[first.uuid]),call('read_pending_task','compact_second',{taskId:second.uuid},[second.uuid]));
    if(followupTurns===2)return turn(call('read_pending_task','optional_full_second',{taskId:second.uuid,detail:'full'},[second.uuid]));
    const previous=f.tools.findLast(row=>row.name==='read_pending_task'&&row.arguments.detail==='full'||row.name==='read_context_fragment'&&row.inputIds.includes(second.uuid));
    chain=previous?.result?.fragment;
    assert(chain&&chain.nextOffset!==null,'Large optional history still has genuine subsequent pages');
    return turn(call('read_context_fragment','optional_continue_'+followupTurns,{id:chain.id,offset:chain.nextOffset},[second.uuid]));
  }});
  assert.notEqual(result.status,'context_limit');assert.equal(initialTurns,initialCap?16:1);assert.equal(followupTurns,10);
  assert(f.requests.every(row=>bytes(row.messages)<=262144));
  assert(f.requests.some(row=>row.messages.some(message=>message.role==='user'&&message.content.includes('runner_context_compaction'))),'This is an exercised compaction path, not merely a below-limit control');
  for(const request of f.requests){const calls=request.messages.flatMap(row=>row.role==='assistant'?(row.toolCalls||[]).map(call=>call.id):[]),results=request.messages.filter(row=>row.role==='tool').map(row=>row.toolCallId);assert.deepEqual(results,calls,'Every visible result remains paired with its actual call');}
  const actualPages=f.execution.filter(row=>row.kind==='tool_result'&&row.tool==='read_context_fragment');assert(actualPages.length>=6);assert(actualPages.every(row=>typeof row.result.fragment?.data==='string'&&!row.result.contextRetired),'Private execution retains every original page body');
  for(const old of retained){const saved=f.tasks.get(old.uuid);assert(saved);assert.deepEqual(saved.info.inputs,old.info.inputs);assert.deepEqual(saved.info.request,old.info.request);assert.deepEqual(saved.info.executionHistory.slice(0,old.info.executionHistory.length),old.info.executionHistory);}
  assert.equal(f.execution.filter(row=>row.kind==='tool_result'&&row.tool==='sync_calendars_to_map').length,initialCap?0:1,'An initial round cap does not trigger automatic Calendar sync');preserveBusinessState(f);
});
