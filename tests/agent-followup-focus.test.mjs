import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,task,input,ids,eventId,copy,call,turn,lookupFor,patchFor,assertAdded,assertPreserved} from './fixtures/planner-followup.mjs';

const scripted=steps=>{let index=0;const failures=[];return {failures,toolTurn:async request=>{try{assert(index<steps.length,'Unexpected follow-up request');const step=steps[index++];return typeof step==='function'?await step(request):step;}catch(error){failures.push(error);throw error;}}};};
const currentTask=()=>task(1,{current:true});
const followupHeader=request=>JSON.parse(request.messages.findLast(row=>row.role==='user'&&row.content.includes('"stage":"followup"')).content);

test('freshly deferred current work precedes121old tasks in both manifest and actual reference bindings',async()=>{
 const originals=[input(1),input(2,{author:'600',content:'I will attend the Friday workshop but my arrival time is undecided.'})],f=fixture({freshInputs:originals}),provider=scripted([request=>{
  const payload=followupHeader(request),bindings=payload.referenceBindings.inputIds,manifest=payload.context.tasks;
  assert.equal(manifest.length,123);assert.equal(manifest[0].currentCycle,true);assert.equal(manifest[1].currentCycle,true);assert.equal(manifest[2].currentCycle,false);
  assert.deepEqual(bindings.map(row=>row.uuid),manifest.map(row=>row.uuid),'Input refs and manifest must use the same priority order');
  return turn(call('finish_batch','finish_focus',[]));
 },...Array.from({length:9},(_,i)=>turn(call('finish_batch','finish_unvisited_'+i,[])))]);
 const result=await f.run(provider,{initialProvider:(_request,n)=>n===1?turn(...originals.map((row,i)=>call('defer_task','fresh_'+i,{summary:i?'Offered attendance; precise arrival remains unknown.':'Ready full-event attendance.',operation:'participation',calendarKind:'club',calendarEventId:eventId,personId:i?ids.blocked:ids.person},[row.uuid]))):turn(call('finish_batch','initial_finish',originals.map(row=>row.uuid)))});
 assert.deepEqual(provider.failures,[]);assert.notEqual(result.status,'not_configured');assert.equal(f.tasks.size,123);for(const old of f.backlogTasks)assert.deepEqual(f.tasks.get(old.uuid),old);
});

test('compact task evidence completes a real participation patch and exact resolution without loading87KBhistory',async()=>{
 const current=currentTask(),f=fixture({current:[current]}),provider=scripted([
  request=>{const payload=followupHeader(request);assert.equal(payload.context.tasks[0].uuid,current.uuid);return turn(call('read_pending_task','compact',{taskId:current.uuid},[current.uuid]));},
  request=>{const result=JSON.parse(request.messages.findLast(row=>row.role==='tool').content);assert.equal(result.status,'ready');assert(!result.fragment,'Default compact task must fit one result');assert.deepEqual(result.task.info.inputs,current.info.inputs);assert.deepEqual(result.task.info.request,current.info.request);assert.equal(result.task.updated_at,current.updated_at);assert(Buffer.byteLength(JSON.stringify(result))<10000,'Large historical task must disclose a small operational view');return turn(call('read_discord_messages','original',{url:'https://discord.com/channels/100/200/301',context:false},[current.uuid]),call('lookup_map_person','person',lookupFor(),[current.uuid]),call('read_map_events','event',{sourceId:ids.club,sourceRecordId:eventId},[current.uuid]));},
  turn(call('patch_map_participation','patch',patchFor(f.state),[current.uuid])),
  turn(call('resolve_pending_task','resolve',{taskId:current.uuid,outcome:'completed'},[current.uuid])),
  turn(call('finish_batch','finish',[])),
 ]);
 const result=await f.run(provider);assert.deepEqual(provider.failures,[]);assert.equal(result.status,'completed',JSON.stringify(result));assert.equal(result.followupStatus,'completed');assertAdded(f);assert(!f.tasks.has(current.uuid));assert.equal(f.tasks.size,121);assert.equal(f.tools.filter(row=>row.name==='read_pending_task').length,1);assert.equal(f.tools.filter(row=>row.name==='read_context_fragment').length,0);
 assert(f.chronology.find(row=>row.kind==='task_resolve'&&row.expectedUpdatedAt===current.updated_at));
});

test('optional fullhistory escalation remains lossless and cache reads make no source,Calendar or map calls',async()=>{
 const current=task(1,{current:true,operation:'source_review',original:input(1,{content:'I will attend the Friday workshop — cafés 🗽 é.'})}),f=fixture({backlog:0,current:[current]});let serialized='',next,fragmentId;
 const provider=scripted([turn(call('read_pending_task','full',{taskId:current.uuid,detail:'full'},[current.uuid])),...Array.from({length:8},(_,i)=>request=>{
  const result=JSON.parse(request.messages.findLast(row=>row.role==='tool').content);assert.equal(result.status,'ready');
  if(result.fragment){serialized+=result.fragment.data;next=result.fragment.nextOffset;fragmentId=result.fragment.id;}else{assert(result.task);serialized=JSON.stringify(result);next=null;}
  if(next!==null)return turn(call('read_context_fragment','fragment_'+i,{id:fragmentId,offset:next},[current.uuid]));
  assert.deepEqual(JSON.parse(serialized).task,current,'Explicit full detail preserves every historical byte and exact source input');return turn(call('finish_batch','finish_full',[]));
 })]);
 await f.run(provider);assert.deepEqual(provider.failures,[]);assert(serialized.length>80000);assert(!f.chronology.some(row=>['source_read','map_read','person_lookup','map_write'].includes(row.kind)));assert.equal(f.calendarWrites.length,0);assert.equal(f.writes.length,0);
});

test('a failed actual map read never supplies completion proof or drops the current task',async()=>{
 const current=currentTask(),f=fixture({backlog:2,current:[current],mapUnavailable:true}),provider=scripted([
  turn(call('read_pending_task','read',{taskId:current.uuid},[current.uuid])),
  turn(call('read_map_events','unavailable',{sourceId:ids.club,sourceRecordId:eventId},[current.uuid])),
  turn(call('resolve_pending_task','unsupported_resolve',{taskId:current.uuid,outcome:'completed'},[current.uuid])),
  turn(call('finish_batch','finish_blocked',[])),
 ]);
 const result=await f.run(provider);assert.deepEqual(provider.failures,[]);assert.equal(result.status,'completed');assert.equal(f.writes.length,0);assert(f.tasks.has(current.uuid));assertPreserved(f);assert(f.tools.find(row=>row.name==='resolve_pending_task').result.status!=='ready');assert.deepEqual(f.tasks.get(current.uuid).info.inputs,current.info.inputs);
});

test('concurrent map edits force reread and merge before the same exact task can be resolved',async()=>{
 const current=currentTask(),f=fixture({backlog:2,current:[current],conflict:true}),provider=scripted([
  turn(call('read_pending_task','read',{taskId:current.uuid},[current.uuid])),
  turn(call('read_discord_messages','original',{url:'https://discord.com/channels/100/200/301',context:false},[current.uuid]),call('lookup_map_person','person',lookupFor(),[current.uuid]),call('read_map_events','event',{sourceId:ids.club,sourceRecordId:eventId},[current.uuid])),
  turn(call('patch_map_participation','stale',patchFor(f.state),[current.uuid])),
  turn(call('resolve_pending_task','rejected_resolve',{taskId:current.uuid,outcome:'completed'},[current.uuid])),
  turn(call('read_map_events','refresh',{sourceId:ids.club,sourceRecordId:eventId},[current.uuid])),
  ()=>turn(call('patch_map_participation','merged',patchFor(f.state),[current.uuid])),
  turn(call('resolve_pending_task','resolve',{taskId:current.uuid,outcome:'completed'},[current.uuid])),
  turn(call('finish_batch','finish',[])),
 ]);
 const result=await f.run(provider);assert.deepEqual(provider.failures,[]);assert.equal(result.followupStatus,'completed',JSON.stringify(result));assert.equal(f.attempts.length,2);assertAdded(f,{humanConflict:true});assert(!f.tasks.has(current.uuid));assert.notEqual(f.tools.find(row=>row.name==='resolve_pending_task').result.status,'ready');assert.equal(f.attempts[1].expectedUpdatedAt,'2026-10-23T22:30:01.000Z');
});

test('an unfinished optional fullhistory chain does not revoke a complete compact task read',async()=>{
 const current=currentTask(),f=fixture({backlog:0,current:[current]}),provider=scripted([
  turn(call('read_pending_task','compact',{taskId:current.uuid},[current.uuid])),
  turn(call('read_pending_task','optional_full',{taskId:current.uuid,detail:'full'},[current.uuid])),
  request=>{assert(JSON.parse(request.messages.findLast(row=>row.role==='tool').content).fragment);return turn(call('read_discord_messages','original',{url:'https://discord.com/channels/100/200/301',context:false},[current.uuid]),call('lookup_map_person','person',lookupFor(),[current.uuid]),call('read_map_events','event',{sourceId:ids.club,sourceRecordId:eventId},[current.uuid]));},
  turn(call('patch_map_participation','patch',patchFor(f.state),[current.uuid])),
  turn(call('resolve_pending_task','resolve',{taskId:current.uuid,outcome:'completed'},[current.uuid])),turn(call('finish_batch','finish',[])),
 ]);
 const result=await f.run(provider);assert.deepEqual(provider.failures,[]);assert.equal(result.followupStatus,'completed');assertAdded(f);assert(!f.tasks.has(current.uuid));assert.equal(f.tools.filter(row=>row.name==='read_context_fragment').length,0);
});

test('successful action for one read version cannot delete a concurrent newer task version',async()=>{
 const current=currentTask(),f=fixture({backlog:2,current:[current],taskConflict:true}),provider=scripted([
  turn(call('read_pending_task','read',{taskId:current.uuid},[current.uuid])),
  turn(call('read_discord_messages','original',{url:'https://discord.com/channels/100/200/301',context:false},[current.uuid]),call('lookup_map_person','person',lookupFor(),[current.uuid]),call('read_map_events','event',{sourceId:ids.club,sourceRecordId:eventId},[current.uuid])),
  turn(call('patch_map_participation','patch',patchFor(f.state),[current.uuid])),
  turn(call('resolve_pending_task','stale_resolution',{taskId:current.uuid,outcome:'completed'},[current.uuid])),...Array.from({length:7},(_,i)=>turn(call('finish_batch','finish_'+i,[]))),
 ]);
 await f.run(provider);assert.deepEqual(provider.failures,[]);assertAdded(f);assert(f.tasks.has(current.uuid));assert.equal(f.tasks.get(current.uuid).updated_at,'2026-10-23T22:30:01.000Z');assert.match(f.tasks.get(current.uuid).info.request.summary,/Concurrent task revision/);assert.equal(f.tools.find(row=>row.name==='resolve_pending_task').result.status,'conflict');assert.deepEqual(f.tasks.get(current.uuid).info.inputs,current.info.inputs);
});
