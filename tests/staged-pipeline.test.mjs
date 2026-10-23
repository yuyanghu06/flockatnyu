import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createStagedPipeline} from '../server/automation/staged-pipeline.js';
import {createBoundedResults} from '../server/automation/bounded-result.js';

const sourceId=randomUUID(),calendarSourceId=randomUUID(),inputId=randomUUID(),leaseToken=randomUUID(),personId=randomUUID();
const stamp='2026-10-22T20:00:00.000Z';
const original=()=>({uuid:inputId,raw_response:{source:'discord',source_id:sourceId,event_type:'message_created',event_id:'300',revision:'1',received_at:stamp,
  payload:{guild_id:'100',channel_id:'200',id:'300',author:{id:'400',username:'Tony'},content:"I'll attend Friday's workshop.",timestamp:stamp}}});
const task=(request={},extra={})=>({uuid:randomUUID(),created_at:stamp,updated_at:stamp,expires_at:'2026-10-23T20:00:00.000Z',info:{version:1,sourceIds:[sourceId],inputs:[original()],
  request:{summary:'Attach Tony to workshop',operation:'participation',calendarEventId:'workshop123',calendarKind:'club',personId,...request},
  batchContext:{previousHour:[{id:'299',author:{id:'401'},content:'Workshop Friday at Bobst'}]},executionHistory:[],...extra}});

function harness({pending=[],runSync,authorizeInputs,authorizeTask,verifyResolution,getEvidenceReferences}={}) {
  const rows=new Map(pending.map(row=>[row.uuid,structuredClone(row)])),calls=[],history=[],bound=[];
  const principal={allowedSourceIds:[sourceId,calendarSourceId]};
  let version=0,authorized=true;
  const store={configured:true,
    list:async args=>{calls.push({method:'list',...args});return {status:'ready',tasks:structuredClone([...rows.values()])};},
    save:async args=>{
      calls.push({method:'save',...structuredClone(args)});
      const prior=rows.get(args.task.uuid);
      if(prior&&prior.updated_at!==args.expectedUpdatedAt)return {status:'conflict'};
      const saved={...args.task,created_at:prior?.created_at??stamp,updated_at:`2026-10-22T20:00:${String(++version).padStart(2,'0')}.000Z`,expires_at:prior?.expires_at??'2026-10-23T20:00:00.000Z'};
      rows.set(saved.uuid,structuredClone(saved));return {status:'ready',task:structuredClone(saved)};
    },
    resolve:async args=>{calls.push({method:'resolve',...args});if(rows.get(args.taskId)?.updated_at!==args.expectedUpdatedAt)return {status:'conflict'};rows.delete(args.taskId);return {status:'ready'};},
  };
  const fragments=createBoundedResults({maxBytes:4*1048576,maxEntries:64});
  const staged=createStagedPipeline({taskStore:store,principal,fragments,now:()=>new Date(stamp),
    authorizeInputs:async(...args)=>authorized&&(authorizeInputs?await authorizeInputs(...args):true),authorizeTask,verifyResolution,getEvidenceReferences,
    bindTask:async row=>{bound.push(structuredClone(row));},
    runSync:runSync??(async()=>({status:'ready',results:[],unresolved:[]})),
  });
  const context={principal,inputIds:[inputId]};
  return {staged,rows,calls,history,principal,bound,context,fragments,revoke:()=>{principal.allowedSourceIds=[];},
    begin:(inputs=[original()])=>staged.pipeline.beginCycle({leaseToken,inputs,recordExecution:async row=>history.push(row),getExecutionLog:()=>structuredClone(history)}),
    after:(inputs=[original()])=>staged.pipeline.afterInitial({handledInputIds:inputs.map(row=>row.uuid),inputs,executionLog:structuredClone(history)}),
    execute:(name,args,ids=[inputId],ctx={})=>staged.tools.find(tool=>tool.name===name).execute(args,{...context,inputIds:ids,...ctx}),
    finish:()=>staged.pipeline.finishCycle({executionLog:structuredClone(history)}),
  };
}
async function full(result,fragments) {
  if(!result.fragment)return result;
  const id=result.fragment.id;let text='',piece=result;
  while(true){assert(Buffer.byteLength(JSON.stringify(piece))<=16384);text+=piece.fragment.data;if(piece.fragment.nextOffset===null)break;
    piece=await fragments.tool.execute({id,offset:piece.fragment.nextOffset});assert.equal(piece.status,'ready');}
  return JSON.parse(text);
}

test('defer captures provider original, observed hour context and actual execution history; task UUID never replaces source identity',async()=>{
  const h=harness();await h.begin();const batchContext={priorHour:[{channelId:'200',speaker:'401',messageId:'299',content:'Friday workshop at Bobst'}]};
  h.staged.pipeline.setBatchContext(batchContext);
  h.history.push({kind:'tool_result',tool:'read_discord_messages',inputIds:[inputId],result:{status:'ready',sources:[{sourceId,content:'Observed neighboring original'}]}});
  const result=await h.execute('defer_task',{summary:'Wait for map workshop',operation:'participation',personId,calendarEventId:'workshop123',calendarKind:'club'});
  assert.equal(result.status,'ready');const saved=h.rows.get(result.taskId);
  assert.deepEqual(saved.info.inputs,[original()]);assert.deepEqual(saved.info.batchContext,batchContext);assert.deepEqual(saved.info.executionHistory.map(({cycleId,...row})=>row),h.history);assert(saved.info.executionHistory.every(row=>typeof row.cycleId==='string'));
  assert.deepEqual(saved.info.sourceIds,[sourceId]);assert.notEqual(result.taskId,inputId);
  const next=await h.after();assert(next.inputIds.includes(result.taskId));
  const read=await h.execute('read_pending_task',{taskId:result.taskId},[result.taskId]);assert.equal(read.status,'ready');
  assert.equal(read.task.info.inputs[0].uuid,inputId);assert.equal(read.task.info.inputs[0].raw_response.payload.author.id,'400');assert.equal(read.task.info.inputs[0].raw_response.payload.channel_id,'200');
  assert(h.bound.some(row=>row.uuid===result.taskId));
});

test('complete eligible manifest includes every task and lossless fragments retain full task/history/API bodies',async()=>{
  const tasks=Array.from({length:200},(_,i)=>task({summary:`Unfinished ${i}`},i===199?{batchContext:{context:'🙂漢字"\\'.repeat(10000)}}:{}));
  const h=harness({pending:tasks,runSync:async()=>({status:'ready',results:[{status:'created',eventId:'workshop123',mapEventId:'map123',details:'回'.repeat(14000)}],unresolved:[]})});
  await h.begin();h.history.push({kind:'model_result',result:{text:'reason'.repeat(8000)}});const next=await h.after();
  assert.equal(next.context.taskCount,200);assert.deepEqual(new Set(next.inputIds),new Set(tasks.map(row=>row.uuid)));assert.equal(next.context.tasks.length,200);
  assert.deepEqual((await full(next.context.executionHistory,h.fragments)).history,h.history);
  assert.equal((await full(next.context.apiResults,h.fragments)).results[0].details,'回'.repeat(14000));
  const read=await h.execute('read_pending_task',{taskId:tasks[199].uuid},[tasks[199].uuid]);assert.deepEqual((await full(read,h.fragments)).task,tasks[199]);
});

test('untouched and read-only tasks survive byte-for-byte with no refresh of timestamps or JSON',async()=>{
  const a=task(),b=task();const h=harness({pending:[a,b]});await h.begin();await h.after();
  await h.execute('read_pending_task',{taskId:b.uuid},[b.uuid]);h.history.push({kind:'model_result',result:{text:'Could not get to the rest'}});
  assert.equal((await h.finish()).status,'ready');assert.deepEqual([...h.rows.values()],[a,b]);assert.equal(h.calls.filter(row=>row.method==='save'||row.method==='resolve').length,0);
});

test('new original tasks are durable before API failure and survive cleanup/crash',async()=>{
  const h=harness({runSync:async()=>({status:'unavailable'})});await h.begin();const result=await h.execute('defer_task',{summary:'Attach attendee later',operation:'participation'});
  assert.equal(result.persisted,true);assert.equal((await h.after()).status,'unavailable');const saved=structuredClone(h.rows.get(result.taskId));h.staged.cleanup();
  assert.deepEqual(h.rows.get(result.taskId),saved);assert.equal(h.staged.taskCount,0);
});

test('unfinished initial interpretation checkpoints without finishing original and preserves all original evidence',async()=>{
  const h=harness();await h.begin();const result=await h.staged.pipeline.afterInitial({handledInputIds:[],inputs:[original()],executionLog:[{kind:'model_result',result:{text:'not finished'}}]});
  assert.equal(result.status,'ready');assert.equal(h.rows.size,1);const saved=[...h.rows.values()][0];assert.equal(saved.info.request.operation,'source_review');assert.deepEqual(saved.info.inputs,[original()]);
});

test('foreign principal, revoked source, excluded dependency, expired task and aborted caller cannot read/resolve cached context',async()=>{
  const expired=task();expired.expires_at='2026-10-22T19:59:59.000Z';const valid=task();const foreign=task({}, {sourceIds:[randomUUID()]});
  const h=harness({pending:[expired,valid,foreign]});await h.begin();const next=await h.after();assert.deepEqual(next.inputIds,[valid.uuid]);
  for(const row of [expired,foreign])assert.equal((await h.execute('read_pending_task',{taskId:row.uuid},[row.uuid])).status,'forbidden');
  assert.equal((await h.execute('read_pending_task',{taskId:valid.uuid},[valid.uuid],{principal:{...h.principal}})).status,'forbidden');
  const controller=new AbortController();controller.abort();assert.equal((await h.execute('read_pending_task',{taskId:valid.uuid},[valid.uuid],{signal:controller.signal})).status,'forbidden');
  h.revoke();assert.equal((await h.execute('read_pending_task',{taskId:valid.uuid},[valid.uuid])).status,'forbidden');assert.equal(h.rows.size,3);
});

test('cannot defer arbitrary task UUID lacking trusted original inputs or include hidden source dependencies',async()=>{
  const h=harness();await h.begin();assert.equal((await h.execute('defer_task',{summary:'fabricated',operation:'source_review'},[randomUUID()])).status,'forbidden');
  h.history.push({kind:'tool_result',result:{status:'ready',sourceId:randomUUID()}});
  assert.equal((await h.execute('defer_task',{summary:'cross source',operation:'source_review'})).status,'forbidden');assert.equal(h.rows.size,0);
});

test('resolution requires read receipt and a successful confirmed outcome; failed/proposed writes never clear tasks',async()=>{
  const t=task();const h=harness({pending:[t]});await h.begin();await h.after();
  assert.equal((await h.execute('resolve_pending_task',{taskId:t.uuid,outcome:'completed'},[t.uuid])).status,'forbidden');await h.execute('read_pending_task',{taskId:t.uuid},[t.uuid]);
  h.history.push({kind:'model_result',result:{toolCalls:[{name:'upsert_map_event'}]}});
  h.history.push({kind:'tool_result',tool:'upsert_map_event',inputIds:[t.uuid],result:{status:'conflict'}});
  assert.equal((await h.execute('resolve_pending_task',{taskId:t.uuid,outcome:'completed'},[t.uuid])).status,'invalid_request');assert(h.rows.has(t.uuid));assert.equal(h.calls.filter(row=>row.method==='resolve').length,0);
});

test('exact version conflict at resolution preserves a newer concurrent task',async()=>{
  const t=task();const h=harness({pending:[t]});
  await h.begin();await h.after();await h.execute('read_pending_task',{taskId:t.uuid},[t.uuid]);
  h.history.push({kind:'tool_result',tool:'upsert_map_event',inputIds:[t.uuid],arguments:{event:{source_record_id:'workshop123'},people:[{person_id:personId}]},result:{status:'ready',eventId:'workshop123'}});
  const newer={...t,updated_at:'2026-10-22T20:00:01.000Z',info:{...t.info,request:{...t.info.request,summary:'Changed by a newer run'}}};h.rows.set(t.uuid,newer);
  assert.equal((await h.execute('resolve_pending_task',{taskId:t.uuid,outcome:'completed'},[t.uuid])).status,'conflict');assert.deepEqual(h.rows.get(t.uuid),newer);
});

test('legacy mechanical Calendar review tasks stay stored without entering model follow-up',async()=>{
  const t=task({operation:'calendar_review'});const h=harness({pending:[t],runSync:async()=>({status:'ready',results:[{kind:'club',status:'created',eventId:'workshop123',mapEventId:'map123'}]})});
  await h.begin();const next=await h.after();assert.equal(next.followupRequired,false);assert.deepEqual(next.inputIds,[]);
  assert.equal((await h.execute('read_pending_task',{taskId:t.uuid},[t.uuid])).status,'forbidden');
  await h.finish();assert.deepEqual(h.rows.get(t.uuid),t);assert(!h.calls.some(row=>row.method==='save'||row.method==='resolve'));
});

test('unrelated successful write cannot resolve a participation task for another event/person',async()=>{
  const t=task();const h=harness({pending:[t]});await h.begin();await h.after();await h.execute('read_pending_task',{taskId:t.uuid},[t.uuid]);
  h.history.push({kind:'tool_result',tool:'upsert_map_event',inputIds:[t.uuid],arguments:{event:{source_record_id:'other-event'},people:[{person_id:randomUUID()}]},result:{status:'ready',eventId:'other-event'}});
  assert.equal((await h.execute('resolve_pending_task',{taskId:t.uuid,outcome:'completed'},[t.uuid])).status,'invalid_request');assert(h.rows.has(t.uuid));
});

test('successful read showing a still-current original is not evidence that a task is obsolete',async()=>{
  const t=task();const h=harness({pending:[t]});await h.begin();await h.after();await h.execute('read_pending_task',{taskId:t.uuid},[t.uuid]);
  h.history.push({kind:'tool_result',tool:'read_discord_messages',inputIds:[t.uuid],result:{status:'ready',sources:[{sourceId,messageId:'300',content:"I'll attend Friday's workshop."}]}});
  assert.equal((await h.execute('resolve_pending_task',{taskId:t.uuid,outcome:'obsolete'},[t.uuid])).status,'invalid_request');assert(h.rows.has(t.uuid));
});

test('same event ID in different calendars cannot complete the other calendar task',async()=>{
  const t=task({operation:'location',calendarKind:'member'});delete t.info.request.personId;const h=harness({pending:[t]});
  await h.begin();await h.after();await h.execute('read_pending_task',{taskId:t.uuid},[t.uuid]);
  h.history.push({kind:'tool_result',tool:'upsert_calendar_event',inputIds:[t.uuid],arguments:{},result:{status:'ready',eventId:'workshop123'}});
  assert.equal((await h.execute('resolve_pending_task',{taskId:t.uuid,outcome:'completed'},[t.uuid])).status,'invalid_request');assert(h.rows.has(t.uuid));
});

test('followup checkpoint records only execution after task read and never duplicates previous history',async()=>{
  const t=task();const h=harness({pending:[t]});await h.begin();
  const old={kind:'tool_result',tool:'read_map_events',inputIds:[t.uuid],result:{status:'ready',events:[]}};h.history.push(old);await h.after();await h.execute('read_pending_task',{taskId:t.uuid},[t.uuid]);
  const fresh={kind:'tool_result',tool:'read_discord_messages',inputIds:[t.uuid],result:{status:'ready',sources:[]}};h.history.push(fresh);assert.equal((await h.finish()).status,'ready');
  assert.deepEqual(h.rows.get(t.uuid).info.executionHistory.map(({cycleId,...row})=>row),[fresh]);
});

test('model-authored success/proof never overrides a trusted negative resolution verification',async()=>{
  let proof;const t=task();const h=harness({pending:[t],verifyResolution:async value=>{proof=value;return false;}});await h.begin();await h.after();await h.execute('read_pending_task',{taskId:t.uuid},[t.uuid]);
  h.history.push({kind:'tool_result',tool:'upsert_map_event',inputIds:[t.uuid],arguments:{event:{source_record_id:t.info.request.calendarEventId},people:[{person_id:personId}]},result:{status:'ready',eventId:t.info.request.calendarEventId,confirmed:true}});
  assert.equal((await h.execute('resolve_pending_task',{taskId:t.uuid,outcome:'completed',confirmed:true,verified:true},[t.uuid],{resolutionVerified:true})).status,'invalid_request');
  assert.equal(proof.task.uuid,t.uuid);assert.equal(proof.history.length,1);assert(!('confirmed' in proof));assert(h.rows.has(t.uuid));
});

test('maximum Unicode task summaries retain a complete bounded manifest and full on-demand originals',async()=>{
  const summary='🙂'.repeat(2000),tasks=Array.from({length:200},()=>task({summary})),h=harness({pending:tasks});await h.begin();const result=await h.after();
  assert.equal(result.context.tasks.length,200);assert.equal(result.inputIds.length,200);assert(Buffer.byteLength(JSON.stringify(result))<262144);
  for(const item of result.context.tasks){assert.equal(item.summaryTruncated,true);assert.equal([...item.summary].length,100);}
  const read=await h.execute('read_pending_task',{taskId:tasks[199].uuid},[tasks[199].uuid]);assert.equal((await full(read,h.fragments)).task.info.request.summary,summary);
});

test('updating a read deferred task keeps identity and original context while adding resolved dependency IDs',async()=>{
  const t=task({operation:'source_review'});for(const field of ['calendarEventId','calendarKind','personId'])delete t.info.request[field];const h=harness({pending:[t]});await h.begin();await h.after();await h.execute('read_pending_task',{taskId:t.uuid},[t.uuid]);
  const request={taskId:t.uuid,summary:'Known workshop now, pending attendance',operation:'participation',calendarEventId:'workshop123',calendarKind:'club',personId};
  const result=await h.execute('defer_task',request,[t.uuid]);assert.equal(result.status,'ready');assert.equal(result.taskId,t.uuid);assert.equal(h.rows.size,1);assert.deepEqual(h.rows.get(t.uuid).info.inputs,t.info.inputs);assert.equal(h.rows.get(t.uuid).info.request.personId,personId);
  const save=h.calls.find(row=>row.method==='save');assert.equal(save.expectedUpdatedAt,t.updated_at);
});

test('same stable deferred task across batches preserves earlier speakers, source references and histories when new originals join',async()=>{
  const h=harness(),request={summary:'Coordinate workshop attendance',operation:'participation',calendarEventId:'workshop123',calendarKind:'club',personId};await h.begin();
  const oldContext={previousHour:[{channelId:'200',speaker:'401',content:'Earlier hour context'}]};h.staged.pipeline.setBatchContext(oldContext);h.history.push({sequence:1,kind:'batch_context',batchContext:oldContext});
  h.history.push({sequence:2,kind:'tool_result',tool:'read_discord_messages',inputIds:[inputId],result:{status:'ready',sources:[{sourceId,url:'https://discord.com/channels/100/200/300',authorId:'400',content:'Earlier original'}]}});
  const first=await h.execute('defer_task',request);assert.equal(first.status,'ready');const saved=structuredClone(h.rows.get(first.taskId));
  h.staged.cleanup();h.history.length=0;
  const newer=original();newer.uuid=randomUUID();newer.raw_response.source_id=calendarSourceId;newer.raw_response.payload.channel_id='201';newer.raw_response.payload.id='301';newer.raw_response.event_id='301';newer.raw_response.payload.author={id:'500',username:'Second speaker'};newer.raw_response.payload.content='A new relevant original';
  await h.begin([newer]);await h.after([newer]);await h.execute('read_pending_task',{taskId:first.taskId},[first.taskId]);
  const newContext={previousHour:[{channelId:'201',speaker:'501',content:'New hour context'}]};h.staged.pipeline.setBatchContext(newContext);h.history.push({sequence:1,kind:'batch_context',batchContext:newContext});
  h.history.push({sequence:2,kind:'tool_result',tool:'read_discord_messages',inputIds:[first.taskId,newer.uuid],result:{status:'ready',sources:[{sourceId:calendarSourceId,url:'https://discord.com/channels/100/201/301',authorId:'500',content:'New original'}]}});
  const updated=await h.execute('defer_task',{...request,taskId:first.taskId},[first.taskId,newer.uuid]);assert.equal(updated.status,'ready');assert.equal(h.rows.size,1);
  const next=h.rows.get(first.taskId);assert.deepEqual(next.info.inputs,[...saved.info.inputs,newer]);assert.deepEqual(new Set(next.info.sourceIds),new Set([sourceId,calendarSourceId]));assert.equal(next.info.inputs[0].raw_response.payload.author.id,'400');assert.equal(next.info.inputs[1].raw_response.payload.author.id,'500');
  assert(next.info.executionHistory.some(row=>row.result?.sources?.[0]?.content==='Earlier original'));assert(next.info.executionHistory.some(row=>row.result?.sources?.[0]?.content==='New original'));assert.equal(new Set(next.info.executionHistory.map(row=>row.cycleId)).size,2);
  assert.deepEqual(next.info.batchContext,newContext);assert(next.info.executionHistory.some(row=>row.kind==='batch_context'&&row.batchContext.previousHour[0].content==='Earlier hour context'));assert(next.info.executionHistory.some(row=>row.kind==='batch_context'&&row.batchContext.previousHour[0].content==='New hour context'));
  assert(next.info.references.some(row=>row.sourceId===sourceId&&row.sourceUrl.endsWith('/200/300')));assert(next.info.references.some(row=>row.sourceId===calendarSourceId&&row.sourceUrl.endsWith('/201/301')));
  h.principal.allowedSourceIds=[calendarSourceId];assert.equal((await h.execute('read_pending_task',{taskId:first.taskId},[first.taskId])).status,'forbidden');assert.deepEqual(h.rows.get(first.taskId),next);
});

test('fragmented extra-source observations retain dependencies and local scope withdrawal prevents later cache access',async()=>{
  const t=task(),extraReference={sourceId:calendarSourceId,sourceUrl:'https://discord.com/channels/100/201/399'};let observed=[];
  const h=harness({pending:[t],getEvidenceReferences:()=>observed});
  await h.begin();await h.after();await h.execute('read_pending_task',{taskId:t.uuid},[t.uuid]);
  observed=[extraReference];const envelope=h.fragments.bound({status:'ready',sources:[{...extraReference,content:'Very long neighboring original '.repeat(3000)}]});assert(envelope.fragment);
  h.history.push({kind:'tool_result',tool:'read_discord_messages',inputIds:[t.uuid],result:envelope});assert.equal((await h.finish()).status,'ready');
  const updated=structuredClone(h.rows.get(t.uuid));assert.deepEqual(new Set(updated.info.sourceIds),new Set([sourceId,calendarSourceId]));assert(updated.info.references.some(ref=>ref.sourceId===extraReference.sourceId&&ref.sourceUrl===extraReference.sourceUrl));
  h.staged.cleanup();h.history.length=0;observed=[];h.principal.allowedSourceIds=[sourceId];await h.begin();const next=await h.after();assert.equal(next.inputIds.length,0);assert.equal((await h.execute('read_pending_task',{taskId:t.uuid},[t.uuid])).status,'forbidden');assert.deepEqual(h.rows.get(t.uuid),updated);
});

test('same unresolved API occurrence across separate batches keeps one task and all earlier source inputs',async()=>{
  const runSync=async()=>({status:'partial',results:[],unresolved:[{kind:'club',calendarId:'club-calendar',eventId:'workshop123',reason:'unknown_location'}]}),h=harness({runSync});await h.begin();assert.equal((await h.after()).status,'ready');const first=structuredClone([...h.rows.values()][0]);
  h.staged.cleanup();h.history.length=0;const next=original();next.uuid=randomUUID();next.raw_response.source_id=calendarSourceId;next.raw_response.payload.author={id:'501',username:'New speaker'};next.raw_response.payload.channel_id='201';next.raw_response.payload.id='301';next.raw_response.event_id='301';
  await h.begin([next]);assert.equal((await h.after([next])).status,'ready');assert.equal(h.rows.size,1);const saved=h.rows.get(first.uuid);assert(saved);assert.deepEqual(saved.info.inputs,[...first.info.inputs,next]);assert.deepEqual(new Set(saved.info.sourceIds),new Set([sourceId,calendarSourceId]));assert(saved.info.references.some(ref=>ref.sourceUrl.endsWith('/200/300')));assert(saved.info.references.some(ref=>ref.sourceUrl.endsWith('/201/301')));
});

test('mechanical partial Calendar sync remains visible without creating a model pagination task',async()=>{
 const outcome={status:'partial',results:[],unresolved:[{kind:'club',reason:'calendar_window_incomplete'},{kind:'member',reason:'calendar_exact_read_failed',eventId:'workshop123'}]};
 const h=harness({runSync:async()=>outcome});await h.begin();const next=await h.after();
 assert.equal(next.status,'ready');assert.equal(next.followupRequired,false);assert.deepEqual(next.inputIds,[]);assert.equal(h.rows.size,0);
 const api=await full(next.context.apiResults,h.fragments);assert.equal(api.sourceStatus,'partial');assert.deepEqual(api.unresolved,outcome.unresolved);
 assert(!h.staged.tools.find(tool=>tool.name==='defer_task').parameters.properties.operation.enum.includes('calendar_review'));
});
