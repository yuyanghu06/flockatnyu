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

test('distinct reads used only by later resolved tasks retire with coverage and authentic copied observations',()=>{
  const closed=Array.from({length:6},(_,index)=>task(20+index,{large:false}).uuid),open=task(90,{large:false}).uuid;
  const bindings={phase:'followup',inputIds:[...closed,open].map((uuid,index)=>({ref:'t_closed_'+index,uuid})),handledInputIds:[{ref:'q_original',uuid:input(90).uuid}]};
  const compact={status:'ready',detail:'compact',task:{uuid:open,info:{request:{operation:'participation',calendarKind:'club',calendarEventId:'still-open',personId:ids.blocked},inputs:[input(90,{author:'999'})],batchContext:{calendarMap:{sourceId:ids.club}}}}};
  const snapshot={status:'ready',phase:'followup',tasks:[{taskId:open,updatedAt:now,compactDisclosed:true,compact}],catalogue:[{taskId:open}],fragments:[],historyPages:[]};
  const messages=[{role:'user',content:JSON.stringify({referenceBindings:bindings})}],execution=[];
  const add=(tool,id,inputIds,args,result)=>{
    messages.push({role:'assistant',content:'',toolCalls:[{id,name:tool,arguments:{inputIds,arguments:args}}]},{role:'tool',toolCallId:id,content:JSON.stringify(result)});
    execution.push({kind:'tool_result',stage:'followup',tool,callId:id,inputIds,arguments:args,result:copy(result)});
  };
  for(const [index,id]of closed.entries()) {
    const body='Distinct closed-task facts '+index+' '+'.'.repeat(14000),eventId='closed-event-'+index;
    add('read_discord_messages','closed-source-'+index,[id],{url:'https://discord.com/channels/100/200/'+(700+index),context:false},{status:'ready',sourceStatus:'ready',sources:[{excerpt:body}],coverage:{complete:false,reason:'message_context',textTruncated:false}});
    add('read_calendar_event','closed-calendar-'+index,[id],{eventId},{status:'ready',events:[{eventId,description:body}],coverage:{complete:true}});
    add('read_map_events','closed-map-'+index,[id],{sourceId:ids.club,sourceRecordId:eventId},{status:'ready',events:[{id:'closed-map-'+index,source_id:ids.club,source_record_id:eventId,notes:body}],coverage:{complete:true}});
    add('resolve_pending_task','closed-resolution-'+index,[id],{taskId:id,outcome:'no_change_needed',reason:'no_actionable_request'},{status:'ready',resolutionOutcome:'no_change_needed'});
  }
  const source=execution[0],observation={callId:source.callId,tool:source.tool,arguments:copy(source.arguments),result:copy(source.result),originalInputIds:[input(20).uuid]};
  messages.push({role:'user',content:JSON.stringify({currentCycleObservations:{observations:[observation,{...observation,callId:'unknown-provenance'},{callId:source.callId,tool:source.tool}],omittedResults:0}})});
  const before=copy({messages,execution,snapshot,bindings});assert(bytes(messages)>262144);
  const result=compactConversation({messages,executionLog:execution,snapshot,referenceBindings:bindings,phase:'followup'});
  assert(result.afterBytes<262144);assert.deepEqual({messages,execution,snapshot,bindings},before);
  for(const row of result.messages.filter(row=>row.role==='tool'&&/^closed-(?:source|calendar|map)-/.test(row.toolCallId)))assert.equal(JSON.parse(row.content).reason,'resolved_task_read');
  const marker=JSON.parse(result.messages.find(row=>row.toolCallId==='closed-source-0').content);assert.deepEqual(marker.coverage,source.result.coverage);assert.equal(marker.sourceStatus,'ready');
  const handoff=JSON.parse(result.messages.find(row=>row.role==='user'&&row.content.includes('currentCycleObservations')).content).currentCycleObservations;
  assert.equal(handoff.observations.length,2,'Exact call provenance removes its copy; unknown/missing provenance survives even when original-input IDs differ from task IDs');
  const assistant=result.messages.flatMap(row=>row.role==='assistant'?(row.toolCalls||[]).map(call=>call.id):[]),tools=result.messages.filter(row=>row.role==='tool').map(row=>row.toolCallId);assert.deepEqual(tools,assistant);
  assert(result.messages.filter(row=>row.role==='tool'&&row.toolCallId.startsWith('closed-resolution')).every(row=>JSON.parse(row.content).status==='ready'));
  const again=compactConversation({messages:result.messages,executionLog:execution,snapshot,referenceBindings:bindings,phase:'followup'});assert.deepEqual(again.messages,result.messages);
});

test('closed-read cleanup preserves current dependencies, failures, uncertain scopes, pages and post-resolution readbacks',()=>{
  const closed=task(30,{large:false}).uuid,reopened=task(31,{large:false}).uuid,open=task(32,{large:false}).uuid,otherOpen=task(33,{large:false}).uuid,queue=input(30).uuid;
  const bindings={phase:'followup',inputIds:[closed,reopened,open,otherOpen].map((uuid,index)=>({ref:'t_protected_'+index,uuid})),handledInputIds:[{ref:'q_native',uuid:queue}]};
  const compactFor=(id,n)=>({status:'ready',detail:'compact',task:{uuid:id,info:{request:{operation:'participation',calendarKind:'club',calendarEventId:'open-event-'+n,personId:n?ids.other:ids.person},inputs:[input(900+n,{author:String(990+n)})],batchContext:{calendarMap:{sourceId:ids.club}}}}});
  const snapshot={status:'ready',phase:'followup',tasks:[open,otherOpen].map((taskId,index)=>({taskId,updatedAt:now,compactDisclosed:true,compact:compactFor(taskId,index)})),catalogue:[open,otherOpen,reopened].map(taskId=>({taskId})),fragments:[],historyPages:[]};
  const messages=[],execution=[],protectedIds=[];
  const add=(tool,id,scope,args,result,{stage='followup',protect=true}={})=>{
    messages.push({role:'assistant',content:'',toolCalls:[{id,name:tool,arguments:{inputIds:scope,arguments:args}}]},{role:'tool',toolCallId:id,content:JSON.stringify(result)});
    execution.push({kind:'tool_result',stage,tool,callId:id,inputIds:scope,arguments:args,result:copy(result)});if(protect)protectedIds.push(id);
  };
  const body='Unchanged protected facts. '.repeat(60),ready={status:'ready',body};
  add('read_discord_messages','mixed',[closed,open],{messageId:'601',channelId:'200'},ready);
  add('read_discord_messages','open',[open],{messageId:'602',channelId:'200'},ready);
  add('read_discord_messages','unknown',[task(99).uuid],{messageId:'603',channelId:'200'},ready);
  add('read_discord_messages','queue',[queue],{messageId:'604',channelId:'200'},ready);
  add('read_discord_messages','initial',[closed],{messageId:'605',channelId:'200'},ready,{stage:'initial'});
  add('read_discord_messages','empty',[],{messageId:'606',channelId:'200'},ready);
  add('read_discord_messages','native-shared',[closed],{messageId:'1200',channelId:'200'},ready);
  add('read_discord_messages','other-disclosed-shared',[closed],{messageId:'1201',channelId:'200'},ready);
  add('read_discord_messages','url-shared',[closed],{url:originalUrl(input(900))},ready);
  add('lookup_map_person','person-shared',[closed],{sourceUrl:'https://discord.com/channels/100/200/607',provider:'discord',providerUserId:'400'},{...ready,person:{id:ids.person}});
  add('read_calendar_event','calendar-shared',[closed],{eventId:'open-event-0'},ready);
  add('read_map_events','map-shared',[closed],{sourceId:ids.club,sourceRecordId:'open-event-1'},ready);
  add('list_calendar_events','broad-calendar',[closed],{timeMin:now,timeMax:now},ready);
  add('read_map_events','broad-map',[closed],{},ready);
  add('read_discord_messages','failed',[closed],{messageId:'608',channelId:'200'},{status:'tool_error',reason:'source_unavailable',body});
  add('read_calendar_event','normalized-partial',[closed],{eventId:'partial-event'},{status:'ready',sourceStatus:'partial',body});
  add('read_map_events','explicit-partial',[closed],{sourceId:ids.club,sourceRecordId:'partial-map'},{status:'ready',partial:true,body});
  add('read_discord_messages','reopened',[reopened],{messageId:'609',channelId:'200'},ready);
  add('read_context_fragment','fragment',[closed],{id:'70000000-0000-4000-8000-000000000001',offset:0},{status:'ready',fragment:{id:'70000000-0000-4000-8000-000000000001',offset:0,nextOffset:body.length,totalChars:body.length*2,data:body}});
  add('read_pending_task','history-page',[closed],{taskId:closed,detail:'history'},{status:'ready',historyPage:{taskId:closed,updatedAt:now,section:'executionHistory',offset:0,nextOffset:body.length,totalChars:body.length*2,data:body}});
  add('upsert_map_event','write-receipt',[closed],{},{status:'ready',body});
  add('read_discord_messages','eligible-control',[closed],{messageId:'610',channelId:'200'},{status:'ready',outcome:'source_missing',coverage:{complete:true,reason:'exact_original_missing'},body:'Closed original result. '.repeat(500)},{protect:false});
  for(const id of [closed,reopened])add('resolve_pending_task','resolution-'+id,[id],{taskId:id,outcome:'no_change_needed'},{status:'ready'});
  add('read_map_events','post-resolution',[closed],{sourceId:ids.club,sourceRecordId:'closed-readback'},ready);
  const before=copy({messages,execution,snapshot}),result=compactConversation({messages,executionLog:execution,snapshot,referenceBindings:bindings,phase:'followup',triggerBytes:1});
  for(const id of protectedIds)assert.equal(result.messages.find(row=>row.toolCallId===id).content,messages.find(row=>row.toolCallId===id).content,id+' must remain unchanged');
  const marker=JSON.parse(result.messages.find(row=>row.toolCallId==='eligible-control').content);assert.equal(marker.reason,'resolved_task_read');assert.equal(marker.outcome,'source_missing');assert.deepEqual(marker.coverage,{complete:true,reason:'exact_original_missing'});
  assert.deepEqual({messages,execution,snapshot},before);
});

test('production follow-up retires a closed source read while preserving its queue-bound initial handoff',async()=>{
  const first=task(1,{current:true,operation:'source_review',original:input(1,{content:'Thanks for sharing the slides.',author:'700'}),large:false}),second=task(2,{current:true}),f=selectedFixture({pending:[first,second],backlog:198});
  const saved=f.tasks.get(second.uuid);saved.info.executionHistory=[{kind:'tool_result',tool:'read_map_events',arguments:{},inputIds:[second.uuid],result:{status:'ready',historicalDetail:'Optional earlier context retained privately. '.repeat(8000)}}];
  const original=copy(saved.info.inputs),history=copy(saved.info.executionHistory);let initial=0,followup=0;
  const result=await f.run({toolTurn:async request=>{
    if(!request.system.includes('FOLLOWUP phase'))return ++initial===1?turn(call('read_discord_messages','initial_queue_source',readOriginal(second.info.inputs[0]),[second.info.inputs[0].uuid])):turn(call('finish_batch','initial_handoff_finish',{handledInputIds:f.originals.map(row=>row.uuid)}));
    followup++;
    if(followup===1)return turn(call('read_pending_task','read_closed_compact',{taskId:first.uuid},[first.uuid]),call('read_pending_task','read_open_compact',{taskId:second.uuid},[second.uuid]));
    if(followup===2)return turn(call('read_discord_messages','closed_source',readOriginal(first.info.inputs[0]),[first.uuid]),call('resolve_pending_task','close_source_task',{taskId:first.uuid,outcome:'no_change_needed',reason:'no_actionable_request'},[first.uuid]),call('read_pending_task','open_optional_history',{taskId:second.uuid,detail:'full'},[second.uuid]));
    const chain=f.tools.findLast(row=>row.name==='read_pending_task'&&row.arguments.detail==='full'||row.name==='read_context_fragment'&&row.inputIds.includes(second.uuid))?.result?.fragment;
    assert(chain?.nextOffset!==null);return turn(call('read_context_fragment','continue_open_history_'+followup,{id:chain.id,offset:chain.nextOffset},[second.uuid]));
  }});
  assert.notEqual(result.status,'context_limit');assert(!f.tasks.has(first.uuid));assert(f.tasks.has(second.uuid));
  assert(f.requests.some(request=>request.messages.some(row=>row.role==='tool'&&row.toolCallId==='closed_source'&&JSON.parse(row.content).reason==='resolved_task_read')));
  const compactedRequests=f.requests.filter(request=>request.messages.some(row=>row.role==='user'&&row.content.includes('runner_context_compaction')));assert(compactedRequests.length);
  for(const request of compactedRequests){const handoff=request.messages.filter(row=>row.role==='user').map(row=>JSON.parse(row.content)).find(row=>row.currentCycleObservations)?.currentCycleObservations;assert(handoff?.observations.some(row=>row.callId==='initial_queue_source'&&row.result.status==='ready'),'Initial queue-bound source copy stays visible');}
  assert(f.execution.some(row=>row.callId==='closed_source'&&row.result.sources?.length&&!row.result.contextRetired));
  assert.deepEqual(f.tasks.get(second.uuid).info.inputs,original);assert.deepEqual(f.tasks.get(second.uuid).info.executionHistory.slice(0,history.length),history);preserveBusinessState(f);
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
