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

function harness({pending=[],runSync,authorizeInputs,authorizeTask,verifyResolution,getEvidenceReferences,jsonPersistence=false}={}) {
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
      const persisted=jsonPersistence?JSON.parse(JSON.stringify(saved)):structuredClone(saved);
      rows.set(saved.uuid,persisted);return {status:'ready',task:structuredClone(persisted)};
    },
    resolve:async args=>{calls.push({method:'resolve',...args});if(rows.get(args.taskId)?.updated_at!==args.expectedUpdatedAt)return {status:'conflict'};rows.delete(args.taskId);return {status:'ready'};},
  };
  const fragments=createBoundedResults({maxBytes:4*1048576,maxEntries:64});
  const staged=createStagedPipeline({taskStore:store,principal,fragments,now:()=>new Date(stamp),
    authorizeInputs:async(...args)=>authorized&&(authorizeInputs?await authorizeInputs(...args):true),authorizeTask,verifyResolution,getEvidenceReferences,
    bindTask:async row=>{bound.push(structuredClone(row));},
  });
  const context={principal,inputIds:[inputId]};
  return {staged,rows,calls,history,principal,bound,context,fragments,revoke:()=>{principal.allowedSourceIds=[];},
    begin:(inputs=[original()])=>staged.pipeline.beginCycle({leaseToken,inputs,recordExecution:async row=>history.push(row),getExecutionLog:()=>structuredClone(history)}),
    sync:async()=>{const result=await (runSync??(async()=>({status:'ready',results:[],unresolved:[]})))({recordExecution:async row=>history.push(row)});history.push({kind:'tool_result',origin:'runner',tool:'sync_calendars_to_map',arguments:{},result:structuredClone(result)});return result;},
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
  const apiRows=[{kind:'api_response',name:'calendar.read_event',result:{status:'ready',body:'原始'.repeat(8000)}},{kind:'api_result',result:{status:'created',eventId:'workshop123',mapEventId:'map123'}}];
  const h=harness({pending:tasks,runSync:async({recordExecution})=>{for(const row of apiRows)await recordExecution(structuredClone(row));return {status:'ready',results:[{status:'created',eventId:'workshop123',mapEventId:'map123',details:'回'.repeat(14000)}],unresolved:[]};}});
  const initialModel={kind:'model_result',result:{text:'reason'.repeat(8000)}};
  await h.begin();h.history.push(initialModel);const sync=await h.sync();const next=await h.after();
  assert.equal(next.context.taskCount,200);assert.deepEqual(new Set(next.inputIds),new Set(tasks.map(row=>row.uuid)));assert.equal(next.context.tasks.length,200);
  assert.deepEqual((await full(next.context.executionHistory,h.fragments)).history,apiRows,'Only new deterministic API evidence is repeated in stage context, losslessly');
  assert.deepEqual(h.history.slice(0,-1),[initialModel,...apiRows],'The original execution log retains initial model output and every API body');
  assert.equal(sync.results[0].details,'回'.repeat(14000));assert.equal(h.history.at(-1).tool,'sync_calendars_to_map');assert.match(next.context.apiResults.notice,/separately recorded/);
  const read=await h.execute('read_pending_task',{taskId:tasks[199].uuid},[tasks[199].uuid]);assert.deepEqual((await full(read,h.fragments)).task,tasks[199]);
});

test('untouched and read-only tasks survive byte-for-byte with no refresh of timestamps or JSON',async()=>{
  const a=task(),b=task();const h=harness({pending:[a,b]});await h.begin();await h.after();
  await h.execute('read_pending_task',{taskId:b.uuid},[b.uuid]);h.history.push({kind:'model_result',result:{text:'Could not get to the rest'}});
  assert.equal((await h.finish()).status,'ready');assert.deepEqual([...h.rows.values()],[a,b]);assert.equal(h.calls.filter(row=>row.method==='save'||row.method==='resolve').length,0);
});

test('new original tasks are durable before API failure and survive cleanup/crash',async()=>{
  const h=harness({runSync:async()=>({status:'unavailable'})});await h.begin();const result=await h.execute('defer_task',{summary:'Attach attendee later',operation:'participation'});
  assert.equal(result.persisted,true);assert.equal((await h.sync()).status,'unavailable');assert.equal((await h.after()).status,'ready');const saved=structuredClone(h.rows.get(result.taskId));h.staged.cleanup();
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
  await h.execute('read_pending_task',{taskId:t.uuid},[t.uuid]);
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
  await h.execute('read_pending_task',{taskId:t.uuid},[t.uuid]);
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

test('explicit partial sync preserves mechanical outcomes without creating model tasks across cycles',async()=>{
 const outcome={status:'partial',results:[],unresolved:[{kind:'club',reason:'calendar_window_incomplete'},{kind:'member',reason:'calendar_exact_read_failed',eventId:'workshop123'}]};
 let dispatches=0;const h=harness({runSync:async()=>{dispatches++;return structuredClone(outcome);}});
 for(let cycle=0;cycle<2;cycle++){
  await h.begin();const sync=await h.sync(),next=await h.after();
  assert.deepEqual(sync,outcome);assert.equal(next.status,'ready');assert.equal(next.followupRequired,false);assert.deepEqual(next.inputIds,[]);assert.equal(h.rows.size,0);
  assert.deepEqual(h.history.at(-1),{kind:'tool_result',origin:'runner',tool:'sync_calendars_to_map',arguments:{},result:outcome});
  assert.match(next.context.apiResults.notice,/separately recorded/);h.staged.cleanup();
 }
 assert.equal(dispatches,2);assert(!h.calls.some(row=>row.method==='save'||row.method==='resolve'));
 assert(!h.staged.tools.find(tool=>tool.name==='defer_task').parameters.properties.operation.enum.includes('calendar_review'));
});

const confirmedParticipation=(t,patch={})=>({kind:'tool_result',tool:'upsert_map_event',inputIds:[t.uuid],
  arguments:{event:{id:'map-event',source_record_id:t.info.request.calendarEventId},people:[{person_id:t.info.request.personId}]},
  result:{status:'ready',eventId:t.info.request.calendarEventId},...patch});

test('same-version cache reread retains a confirmed participation write and exact resolution target',async()=>{
  const t=task(),untouched=task(),h=harness({pending:[t,untouched]});await h.begin();await h.after();
  const first=await h.execute('read_pending_task',{taskId:t.uuid},[t.uuid]);assert.equal(first.status,'ready');
  h.history.push(confirmedParticipation(t));
  for(let i=0;i<2;i++){
    const reread=await h.execute('read_pending_task',{taskId:t.uuid},[t.uuid]);assert.deepEqual(reread.task,first.task);
  }
  assert.equal((await h.execute('resolve_pending_task',{taskId:randomUUID(),outcome:'completed'},[t.uuid])).status,'forbidden');
  assert.equal((await h.execute('resolve_pending_task',{taskId:t.uuid,outcome:'completed'},[t.uuid])).status,'ready');
  assert(!h.rows.has(t.uuid));assert.deepEqual(h.rows.get(untouched.uuid),untouched);
  assert.deepEqual(h.calls.filter(row=>row.method==='resolve').map(row=>({id:row.taskId,version:row.expectedUpdatedAt})),[{id:t.uuid,version:t.updated_at}]);
  assert.equal(h.calls.filter(row=>row.method==='save').length,0,'Reading the same version never rewrites a task');
});

test('changed task version discards older write proof until a new read and new successful action',async()=>{
  const t=task(),h=harness({pending:[t]});await h.begin();await h.after();await h.execute('read_pending_task',{taskId:t.uuid},[t.uuid]);
  h.history.push(confirmedParticipation(t));
  const changed=await h.execute('defer_task',{taskId:t.uuid,...t.info.request,summary:'Updated attendance interpretation'},[t.uuid]);assert.equal(changed.status,'ready');
  const current=structuredClone(h.rows.get(t.uuid));assert.notEqual(current.updated_at,t.updated_at);
  assert.equal((await h.execute('resolve_pending_task',{taskId:t.uuid,outcome:'completed'},[t.uuid])).status,'forbidden');
  await h.execute('read_pending_task',{taskId:t.uuid},[t.uuid]);await h.execute('read_pending_task',{taskId:t.uuid},[t.uuid]);
  assert.equal((await h.execute('resolve_pending_task',{taskId:t.uuid,outcome:'completed'},[t.uuid])).status,'invalid_request');assert.deepEqual(h.rows.get(t.uuid),current);
  h.history.push(confirmedParticipation(current));await h.execute('read_pending_task',{taskId:t.uuid},[t.uuid]);
  assert.equal((await h.execute('resolve_pending_task',{taskId:t.uuid,outcome:'completed'},[t.uuid])).status,'ready');
  assert.equal(h.calls.filter(row=>row.method==='resolve').at(-1).expectedUpdatedAt,current.updated_at);
});

test('repeated same-version reads cannot turn missing or unrelated evidence into completion',async t=>{
  const scenarios=['read-only current state','proposal only','failed write','different event','different person','different task','write before first read'];
  for(const scenario of scenarios)await t.test(scenario,async()=>{
    const pending=task(),h=harness({pending:[pending]});await h.begin();await h.after();
    if(scenario==='write before first read')h.history.push(confirmedParticipation(pending));
    await h.execute('read_pending_task',{taskId:pending.uuid},[pending.uuid]);
    if(scenario==='read-only current state')h.history.push({kind:'tool_result',tool:'read_map_events',inputIds:[pending.uuid],result:{status:'ready',event_people:[{person_id:personId}]}});
    if(scenario==='proposal only')h.history.push({kind:'model_result',result:{toolCalls:[{name:'upsert_map_event',arguments:confirmedParticipation(pending).arguments}]}});
    if(scenario==='failed write')h.history.push(confirmedParticipation(pending,{result:{status:'conflict'}}));
    if(scenario==='different event')h.history.push(confirmedParticipation(pending,{arguments:{event:{source_record_id:'another-event'},people:[{person_id:personId}]},result:{status:'ready',eventId:'another-event'}}));
    if(scenario==='different person')h.history.push(confirmedParticipation(pending,{arguments:{event:{source_record_id:'workshop123'},people:[{person_id:randomUUID()}]}}));
    if(scenario==='different task')h.history.push(confirmedParticipation(pending,{inputIds:[randomUUID()]}));
    await h.execute('read_pending_task',{taskId:pending.uuid},[pending.uuid]);
    assert.equal((await h.execute('resolve_pending_task',{taskId:pending.uuid,outcome:'completed'},[pending.uuid])).status,'invalid_request');
    assert.deepEqual(h.rows.get(pending.uuid),pending);assert.equal(h.calls.filter(row=>row.method==='resolve').length,0);
  });
});

test('receipt reuse never survives cleanup or a new cycle and never bypasses withdrawn source scope',async t=>{
  for(const boundary of ['cleanup','begin again','source withdrawn'])await t.test(boundary,async()=>{
    const pending=task(),h=harness({pending:[pending]});await h.begin();await h.after();await h.execute('read_pending_task',{taskId:pending.uuid},[pending.uuid]);
    h.history.push(confirmedParticipation(pending));await h.execute('read_pending_task',{taskId:pending.uuid},[pending.uuid]);
    if(boundary==='source withdrawn'){
      h.revoke();assert.equal((await h.execute('resolve_pending_task',{taskId:pending.uuid,outcome:'completed'},[pending.uuid])).status,'forbidden');
    }else{
      if(boundary==='cleanup'){
        h.staged.cleanup();assert.equal((await h.execute('resolve_pending_task',{taskId:pending.uuid,outcome:'completed'},[pending.uuid])).status,'forbidden');
      }
      await h.begin();await h.after();
      assert.equal((await h.execute('resolve_pending_task',{taskId:pending.uuid,outcome:'completed'},[pending.uuid])).status,'forbidden');
      await h.execute('read_pending_task',{taskId:pending.uuid},[pending.uuid]);
      assert.equal((await h.execute('resolve_pending_task',{taskId:pending.uuid,outcome:'completed'},[pending.uuid])).status,'invalid_request','Prior cycle history is not fresh completion evidence');
    }
    assert.deepEqual(h.rows.get(pending.uuid),pending);assert.equal(h.calls.filter(row=>row.method==='resolve').length,0);
  });
});

const patchSourceUrl='https://discord.com/channels/100/200/300';
const patchSelection=(h,t,changes=[{personId:t.info.request.personId,sourceUrl:patchSourceUrl,attendanceStatus:'going'}])=>({context:{principal:h.principal,inputIds:[t.uuid]},calendarKind:'club',calendarEventId:'workshop123',changes});

test('participation patch selection requires current task reads and a one-to-one saved person/provider/source binding',async()=>{
 const t=task(),h=harness({pending:[t]});await h.begin();const selection=patchSelection(h,t);assert.equal(h.staged.participationTasks(selection),null,'Initial phase cannot patch');await h.after();assert.equal(h.staged.participationTasks(selection),null,'Unread cached task is not action authority');await h.execute('read_pending_task',{taskId:t.uuid},[t.uuid]);const selected=h.staged.participationTasks(selection);assert.equal(selected.length,1);assert.equal(selected[0].taskId,t.uuid);assert.equal(selected[0].original.raw_response.payload.author.id,'400');assert.equal(await h.staged.verifyParticipationTasks(selection,selected),true);
 for(const changed of [{...selection,calendarEventId:randomUUID()},{...selection,calendarKind:'member'},{...selection,changes:[{...selection.changes[0],personId:randomUUID()}]},{...selection,changes:[{...selection.changes[0],sourceUrl:'https://discord.com/channels/100/200/999'}]},{...selection,changes:[selection.changes[0],selection.changes[0]]},{...selection,context:{...selection.context,inputIds:[t.uuid,t.uuid]}},{...selection,context:{...selection.context,principal:{...h.principal}}}])assert.equal(h.staged.participationTasks(changed),null);
});

test('two distinct participation tasks bind exactly two people and their separate originals',async()=>{
 const first=task(),second=task({personId:randomUUID()});second.info.inputs[0].uuid=randomUUID();second.info.inputs[0].raw_response.event_id='301';second.info.inputs[0].raw_response.payload.id='301';second.info.inputs[0].raw_response.payload.author.id='500';const h=harness({pending:[first,second]});await h.begin();await h.after();for(const row of [first,second])await h.execute('read_pending_task',{taskId:row.uuid},[row.uuid]);const args={context:{principal:h.principal,inputIds:[first.uuid,second.uuid]},calendarKind:'club',calendarEventId:'workshop123',changes:[{personId:first.info.request.personId,sourceUrl:patchSourceUrl},{personId:second.info.request.personId,sourceUrl:'https://discord.com/channels/100/200/301'}]};assert.equal(h.staged.participationTasks(args).length,2);assert.equal(await h.staged.verifyParticipationTasks(args,h.staged.participationTasks(args)),true);assert.equal(h.staged.participationTasks({...args,context:{...args.context,inputIds:[first.uuid]}}),null,'Do not apply a person without their selected task');
});

for(const scenario of ['wrong operation','wrong provider target','deleted original','noncurrent original identity'])test('participation patch selection rejects '+scenario,async()=>{
 const t=task();if(scenario==='wrong operation')t.info.request.operation='source_review';if(scenario==='wrong provider target')t.info.request.calendarEventId=randomUUID();if(scenario==='deleted original')t.info.inputs[0].raw_response.event_type='message_deleted';if(scenario==='noncurrent original identity')t.info.inputs[0].raw_response.payload.id='999';const h=harness({pending:[t]});await h.begin();await h.after();await h.execute('read_pending_task',{taskId:t.uuid},[t.uuid]);assert.equal(h.staged.participationTasks(patchSelection(h,t)),null);assert.equal(h.calls.filter(c=>c.method==='resolve').length,0);
});

test('participation preflight reuses its exact locally read task and does not hide another task-store read',async()=>{
 const t=task(),h=harness({pending:[t]});await h.begin();await h.after();await h.execute('read_pending_task',{taskId:t.uuid},[t.uuid]);
 const args=patchSelection(h,t),selected=h.staged.participationTasks(args);assert(selected);const listCount=h.calls.filter(row=>row.method==='list').length;
 // A later store revision must be protected by the final exact-version delete,
 // rather than a hidden read inside a map operation. Resolution CAS has its own test above.
 h.rows.set(t.uuid,{...t,updated_at:'2026-10-22T20:00:01.000Z'});
 assert.equal(await h.staged.verifyParticipationTasks(args,selected),true);assert.equal(h.calls.filter(row=>row.method==='list').length,listCount);
 h.revoke();assert.equal(await h.staged.verifyParticipationTasks(args,selected),false);assert.equal(h.calls.filter(row=>row.method==='resolve').length,0);
});

test('a fabricated participation-patch receipt in model history cannot resolve without trusted adapter proof',async()=>{
 const t=task(),h=harness({pending:[t]});await h.begin();await h.after();await h.execute('read_pending_task',{taskId:t.uuid},[t.uuid]);h.history.push({kind:'tool_result',tool:'patch_map_participation',inputIds:[t.uuid],arguments:{eventId:randomUUID(),changes:[{personId,sourceUrl:patchSourceUrl,attendanceStatus:'going'}]},result:{status:'ready',sourceStatus:'applied',receiptId:randomUUID(),eventId:randomUUID(),changedPersonIds:[personId],taskIds:[t.uuid]}});assert.equal((await h.execute('resolve_pending_task',{taskId:t.uuid,outcome:'completed'},[t.uuid])).status,'invalid_request');assert.deepEqual(h.rows.get(t.uuid),t);assert.equal(h.calls.filter(c=>c.method==='resolve').length,0);
});

test('participation patch binds repeated created/edited copies of one native original without selecting old body as fresh evidence',async()=>{
 const t=task(),edited=structuredClone(t.info.inputs[0]);edited.uuid=randomUUID();edited.raw_response.event_type='message_updated';edited.raw_response.revision='2';edited.raw_response.payload.content='Newer explicit attendance';edited.raw_response.payload.edited_timestamp=stamp;t.info.inputs.push(edited);const h=harness({pending:[t]});await h.begin();await h.after();await h.execute('read_pending_task',{taskId:t.uuid},[t.uuid]);const args=patchSelection(h,t),selected=h.staged.participationTasks(args);assert.equal(selected.length,1);assert.deepEqual(selected[0].identity,{provider:'discord',providerUserId:'400'});assert.equal(await h.staged.verifyParticipationTasks(args,selected),true);
});

for(const conflict of ['author','source','deleted edit','native mismatch'])test('repeated original copies reject immutable conflict: '+conflict,async()=>{
 const t=task(),edited=structuredClone(t.info.inputs[0]);edited.uuid=randomUUID();edited.raw_response.event_type='message_updated';edited.raw_response.revision='2';if(conflict==='author')edited.raw_response.payload.author.id='999';if(conflict==='source'){edited.raw_response.source_id=randomUUID();t.info.sourceIds.push(edited.raw_response.source_id);}if(conflict==='deleted edit')edited.raw_response.event_type='message_deleted';if(conflict==='native mismatch')edited.raw_response.event_id='999';t.info.inputs.push(edited);const h=harness({pending:[t]});if(conflict==='source')h.principal.allowedSourceIds.push(edited.raw_response.source_id);await h.begin();await h.after();await h.execute('read_pending_task',{taskId:t.uuid},[t.uuid]);assert.equal(h.staged.participationTasks(patchSelection(h,t)),null);
});

for(const variant of ['metadata then body','conflicting senders','duplicate From'])test('Gmail repeated-source task identity: '+variant,async()=>{
 const t=task(),mail=(metadata=false)=>({uuid:randomUUID(),raw_response:{source:'gmail',source_id:sourceId,event_type:metadata?'email_received_metadata':'email_received',event_id:'abc123',received_at:stamp,payload:{id:'abc123',...(metadata?{}:{payload:{headers:[{name:'From',value:'Known Person <sender@example.test>'}]}})}}});t.info.inputs=[mail(true),mail()];if(variant==='conflicting senders')t.info.inputs[0]=mail();if(variant==='conflicting senders')t.info.inputs[0].raw_response.payload.payload.headers[0].value='Other <other@example.test>';if(variant==='duplicate From')t.info.inputs[1].raw_response.payload.payload.headers.push({name:'From',value:'sender@example.test'});const h=harness({pending:[t]});await h.begin();await h.after();await h.execute('read_pending_task',{taskId:t.uuid},[t.uuid]);const args=patchSelection(h,t,[{personId,sourceUrl:'https://mail.google.com/mail/u/0/#all/abc123',attendanceStatus:'going'}]),selected=h.staged.participationTasks(args);if(variant==='metadata then body'){assert.equal(selected.length,1);assert.deepEqual(selected[0].identity,{provider:'email',providerUserId:'sender@example.test'});}else assert.equal(selected,null);
});

async function recordedPendingTask(h,taskUuid,record) {
  let piece=await h.execute('read_pending_task',{taskId:taskUuid},[taskUuid]);
  assert.equal(piece.status,'ready');
  record({kind:'tool_result',tool:'read_pending_task',callId:randomUUID(),inputIds:[taskUuid],arguments:{taskId:taskUuid},result:structuredClone(piece)});
  if(!piece.fragment)return {task:piece.task,fragmentId:null};
  const id=piece.fragment.id;let text='';
  while(true){text+=piece.fragment.data;if(piece.fragment.nextOffset===null)break;
    const args={id,offset:piece.fragment.nextOffset};piece=await h.staged.readTaskFragment(args,{principal:h.principal,inputIds:[taskUuid]},value=>h.fragments.tool.execute(value));assert.equal(piece.status,'ready');
    record({kind:'tool_result',tool:'read_context_fragment',callId:randomUUID(),inputIds:[taskUuid],arguments:args,result:structuredClone(piece)});
  }
  return {task:JSON.parse(text).task,fragmentId:id};
}

test('legitimate repeated task target updates retain facts without recirculating pending-task fragment bodies',async()=>{
  const t=task({operation:'source_review'});for(const key of ['calendarKind','calendarEventId','personId'])delete t.info.request[key];
  const sourceText='Original source fact — retain exactly. '.repeat(600),priorCycle=randomUUID();
  const sourceResult={status:'ready',sources:[{sourceId,url:'https://discord.com/channels/100/200/300',authorId:'400',content:sourceText}]};
  const outcome={kind:'api_response',cycleId:priorCycle,sequence:2,result:{status:'ready',outcome:'updated',eventId:'workshop123',sourceId:calendarSourceId,notes:'Human API outcome must survive'}};
  t.info.executionHistory=[{kind:'tool_result',cycleId:priorCycle,sequence:1,tool:'read_discord_messages',inputIds:[t.uuid],result:sourceResult},outcome];
  t.info.references=[{sourceId,sourceUrl:'https://discord.com/channels/100/200/300'}];t.info.sourceIds.push(calendarSourceId);
  const h=harness({pending:[t],jsonPersistence:true});await h.begin();h.staged.pipeline.setBatchContext(t.info.batchContext);await h.after();
  const cycleId=randomUUID(),record=row=>h.history.push({cycleId,sequence:h.history.length+1,stage:'followup',...row});
  const pendingChains=new Set(),readOrigins=new Map(),sizes=[JSON.stringify(t).length];
  const requests=[
    {summary:'Exact workshop identified; person identity still pending',operation:'participation',calendarKind:'club',calendarEventId:'workshop123'},
    {summary:'Exact workshop and verified person identified',operation:'participation',calendarKind:'club',calendarEventId:'workshop123',personId},
    {summary:'Exact workshop/person and confirmed Bobst building identified',operation:'participation',calendarKind:'club',calendarEventId:'workshop123',personId,buildingId:'bobst-library'},
  ];
  for(const request of requests){
    const read=await recordedPendingTask(h,t.uuid,record);if(read.fragmentId){pendingChains.add(read.fragmentId);readOrigins.set(read.fragmentId,{taskId:read.task.uuid,updatedAt:read.task.updated_at});}
    assert.deepEqual(read.task.info.inputs,t.info.inputs);assert(read.task.info.executionHistory.some(row=>row.kind==='api_response'&&row.result.notes===outcome.result.notes));
    const model={kind:'model_result',result:{text:'Confirmed one new target from authorized source evidence',toolCalls:[{name:'defer_task',arguments:{taskId:t.uuid,...request}}]}};record(model);
    const result=await h.execute('defer_task',{taskId:t.uuid,...request},[t.uuid]);assert.equal(result.status,'ready');
    record({kind:'tool_result',tool:'defer_task',callId:randomUUID(),inputIds:[t.uuid],arguments:{taskId:t.uuid,...request},result:structuredClone(result)});
    sizes.push(JSON.stringify(h.rows.get(t.uuid)).length);
  }
  const saved=h.rows.get(t.uuid),copies=saved.info.executionHistory.filter(row=>row.tool==='read_context_fragment'&&pendingChains.has(row.arguments?.id)&&typeof row.result?.fragment?.data==='string');
  console.log(JSON.stringify({regression:'pending-task-fragment-history-amplification',sizes,persistedPendingFragmentBodyCopies:copies.length,liveFragmentChains:pendingChains.size}));
  assert.deepEqual(saved.info.inputs,t.info.inputs);assert.deepEqual(saved.info.references,t.info.references);assert.deepEqual(saved.info.batchContext,t.info.batchContext);
  assert(saved.info.executionHistory.some(row=>row.kind==='tool_result'&&row.tool==='read_discord_messages'&&row.result.sources[0].content===sourceText));
  assert(saved.info.executionHistory.some(row=>row.kind==='api_response'&&row.result.notes===outcome.result.notes));
  assert.deepEqual(saved.info.request,requests.at(-1),'Every legitimate new intent/target field survives exactly');
  for(const live of h.history.filter(row=>readOrigins.has(row.result?.fragment?.id))){
    const fragment=live.result.fragment,origin=readOrigins.get(fragment.id),persisted=saved.info.executionHistory.find(row=>row.cycleId===live.cycleId&&row.sequence===live.sequence);assert(persisted);
    assert.deepEqual(persisted.pendingTaskFragment,{version:1,chainId:fragment.id,...origin},'Origin metadata uses the exact task/read revision, never a later saved revision');
    const {data,...metadata}=fragment;
    for(const [key,value] of Object.entries(live.result).filter(([key])=>key!=='fragment'))assert.deepEqual(persisted.result[key],value,'Existing envelope field '+key+' survives later merges');
    assert.deepEqual(persisted.result.fragment,{...metadata,dataChars:data.length,dataBytes:Buffer.byteLength(data)},'Compaction retains id/encoding/offset/nextOffset/totalChars and exact removed-body sizes');
    assert(Date.parse(origin.updatedAt)<Date.parse(saved.updated_at),'Earlier read provenance survives later legitimate task revisions');
  }
  assert.equal(copies.length,0,'Saved task history must not embed losslessly retrievable copies of its own pending-task fragment body');
  assert(sizes.at(-1)<sizes[0]*3,'Repeated legitimate target refinements grow with new outcomes, not nested task-body copies');
});

for(const restart of ['beginCycle','cleanup then beginCycle'])test('pending-task fragment origins do not classify orphan data after '+restart,async()=>{
 const t=task({}, {executionHistory:[{kind:'tool_result',tool:'read_discord_messages',result:{status:'ready',sources:[{sourceId,content:'Large exact source fact '.repeat(900)}]}}]});
 const h=harness({pending:[t],jsonPersistence:true});await h.begin();await h.after();
 const firstCycle=randomUUID(),recordOld=row=>h.history.push({cycleId:firstCycle,sequence:h.history.length+1,stage:'followup',...row});
 const old=await recordedPendingTask(h,t.uuid,recordOld);assert(old.fragmentId);
 if(restart.startsWith('cleanup'))h.staged.cleanup();h.history.length=0;await h.begin();await h.after();
 const cycleId=randomUUID(),record=row=>h.history.push({cycleId,sequence:h.history.length+1,stage:'followup',...row});
 await recordedPendingTask(h,t.uuid,record);
 const orphan={kind:'tool_result',tool:'read_context_fragment',inputIds:[t.uuid],arguments:{id:old.fragmentId,offset:12000},result:{status:'ready',sourceStatus:'ready',fragment:{id:old.fragmentId,offset:12000,nextOffset:null,totalChars:12034,data:'New-cycle orphan bytes must survive'}}};record(orphan);
 const expected=structuredClone(h.history.at(-1));
 assert.equal((await h.execute('defer_task',{taskId:t.uuid,...t.info.request,summary:'A new concrete follow-up fact',buildingId:'bobst-library'},[t.uuid])).status,'ready');
 assert.deepEqual(h.rows.get(t.uuid).info.executionHistory.find(row=>row.cycleId===cycleId&&row.sequence===expected.sequence),expected,'A previous batch fragment ID is not current authority to remove this body');
});

test('pending-task history compaction preserves unrelated source fragments, orphan legacy bytes and live evidence losslessly',async()=>{
 const t=task(),untouched=task(),legacyId=randomUUID(),legacyCycle=randomUUID();
 const legacy={kind:'tool_result',tool:'read_context_fragment',cycleId:legacyCycle,sequence:1,inputIds:[t.uuid],arguments:{id:legacyId,offset:12000},result:{status:'ready',sourceStatus:'ready',fragment:{id:legacyId,offset:12000,nextOffset:null,totalChars:12024,data:'Unknown legacy fragment bytes'}}};
 t.info.executionHistory=[structuredClone(legacy)];
 const h=harness({pending:[t,untouched],jsonPersistence:true});await h.begin();h.staged.pipeline.setBatchContext(t.info.batchContext);await h.after();
 const cycleId=randomUUID(),record=row=>h.history.push({cycleId,sequence:h.history.length+1,stage:'followup',...row});
 const unrelated={status:'ready',coverage:{complete:true},sources:[{sourceId,url:'https://discord.com/channels/100/200/300',content:'Unrelated authorized source content '.repeat(800)}]};
 let piece=h.fragments.bound(unrelated);assert(piece.fragment);const sourceChain=piece.fragment.id;
 record({kind:'tool_result',tool:'read_discord_messages',inputIds:[t.uuid],arguments:{channelId:'200',messageId:'300'},result:structuredClone(piece)});
 while(piece.fragment.nextOffset!==null){const args={id:sourceChain,offset:piece.fragment.nextOffset};piece=await h.fragments.tool.execute(args);record({kind:'tool_result',tool:'read_context_fragment',inputIds:[t.uuid],arguments:args,result:structuredClone(piece)});}
 const unknown=h.fragments.bound({status:'ready',sources:[{sourceId,content:'Orphan source body without a registered origin '.repeat(500)}]});assert(unknown.fragment);
 const orphanArgs={id:unknown.fragment.id,offset:unknown.fragment.nextOffset},orphanPiece=await h.fragments.tool.execute(orphanArgs);record({kind:'tool_result',tool:'read_context_fragment',inputIds:[t.uuid],arguments:orphanArgs,result:structuredClone(orphanPiece)});
 record({kind:'api_response',result:{status:'ready',outcome:'updated',eventId:'workshop123',sourceId:calendarSourceId,notes:'Preserved business outcome'}});
 const modelText='Actual model output must remain whole. '.repeat(400);record({kind:'model_result',result:{text:modelText}});
 const request={taskId:t.uuid,...t.info.request,summary:'New concrete location evidence refined the pending task',buildingId:'bobst-library'};
 // Force a real primary pending-task fragment chain using its existing source history.
 const seeded=t.info.executionHistory;seeded.push({kind:'tool_result',tool:'read_discord_messages',cycleId:legacyCycle,sequence:2,result:unrelated});
 h.rows.get(t.uuid).info.executionHistory=structuredClone(seeded);
 // Reload the actual cached task snapshot before reading it, as at a new worker phase.
 await h.after();
 const read=await recordedPendingTask(h,t.uuid,record);assert(read.fragmentId);
 const beforeLog=structuredClone(h.history),livePending=await full(await h.fragments.tool.execute({id:read.fragmentId,offset:0}),h.fragments);
 assert.equal((await h.execute('defer_task',request,[t.uuid])).status,'ready');
 assert.deepEqual(h.history,beforeLog,'Saving compact history never mutates the actual current execution log/model output');
 assert.deepEqual(await full(await h.fragments.tool.execute({id:read.fragmentId,offset:0}),h.fragments),livePending,'Live bounded result cache remains lossless until cycle cleanup');
 assert.deepEqual(await full(await h.fragments.tool.execute({id:sourceChain,offset:0}),h.fragments),unrelated);
 const saved=h.rows.get(t.uuid),kept=saved.info.executionHistory;
 assert.deepEqual(kept.find(row=>row.cycleId===legacyCycle&&row.sequence===1),legacy,'Unmatched legacy chains have no safe provenance for body removal');
 for(const row of beforeLog.filter(row=>row.result?.fragment?.id===sourceChain||row.result?.fragment?.id===unknown.fragment.id))assert.deepEqual(kept.find(x=>x.cycleId===row.cycleId&&x.sequence===row.sequence),row,'Unrelated and orphan source fragment bytes remain exact');
 assert(kept.some(row=>row.kind==='model_result'&&row.result.text===modelText));assert(kept.some(row=>row.kind==='api_response'&&row.result.notes==='Preserved business outcome'));
 for(const row of beforeLog.filter(row=>row.tool==='read_context_fragment'&&row.arguments?.id===read.fragmentId)){
  const compact=kept.find(x=>x.cycleId===row.cycleId&&x.sequence===row.sequence);assert(compact);assert.deepEqual(compact.arguments,row.arguments);assert.deepEqual(compact.inputIds,row.inputIds);assert.equal(compact.result.status,row.result.status);assert.equal(compact.result.fragment?.data,undefined,'Only identified pending-task self-copy bodies are omitted from persisted history');
 }
 assert.deepEqual(saved.info.inputs,t.info.inputs);assert.deepEqual(h.rows.get(untouched.uuid),untouched);
});
