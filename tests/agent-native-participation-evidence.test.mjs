import {withTaskReadFixtures} from './fixtures/planner-followup.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';

// Reuse the real-component synthetic fixture without registering its tests or
// changing the pinned fixture. Extra controls affect simulated transports only.
const frozenSource=await readFile(new URL('./staged-runtime-integration.test.mjs',import.meta.url),'utf8');

const begin=frozenSource.indexOf('async function participationFixture('),end=frozenSource.indexOf('\nconst participationCall=',begin);
assert(begin>0&&end>begin);let fixtureSource=frozenSource.slice(begin,end);
const replace=(from,to)=>{assert(fixtureSource.includes(from),'Pinned fixture transport marker changed');fixtureSource=fixtureSource.replace(from,to);};
replace('createdAt:taskStamp,sourceUpdatedAt:taskStamp','createdAt:m.createdAt??taskStamp,sourceUpdatedAt:m.updatedAt??m.createdAt??taskStamp');
replace("const liveService={readMessages:async args=>{", "const liveService={readMessages:async args=>{control.liveReads=(control.liveReads||0)+1;");
replace("return {status:'ready',coverage:{complete:true,textTruncated:false},sources:rows};", "if(control.liveDeleted)rows.length=0;if(control.liveSource)rows.forEach(row=>row.sourceId=control.liveSource);if(control.liveTime)rows.forEach(row=>row.sourceUpdatedAt=control.liveTime);if(control.missingLiveTime)rows.forEach(row=>{delete row.sourceUpdatedAt;delete row.createdAt;});return {status:'ready',coverage:{complete:false,textTruncated:control.textTruncated===true},sources:rows};");
let adapterUrl=new URL('../server/automation/adapters.js',import.meta.url).href;
if(process.env.NATIVE_PARTICIPATION_BASELINE_ADAPTER){
 const retained=await readFile(process.env.NATIVE_PARTICIPATION_BASELINE_ADAPTER,'utf8');
 assert.equal(createHash('sha256').update(retained).digest('hex'),'f19ab7c8ab4dc4684a27fc05f524c6b534257f93df6d24bd93f5b5be068fc891');
 adapterUrl='data:text/javascript;base64,'+Buffer.from(retained.replace(/from (['"])(\.[^'"]+)\1/g,(_m,_q,path)=>`from ${JSON.stringify(new URL(path,new URL('../server/automation/adapters.js',import.meta.url)).href)}`)).toString('base64');
}
const imports=[['createAutomationAdapters',adapterUrl],['createAutomationHandler',new URL('../server/automation/handler.js',import.meta.url).href],['readAutomationConfig',new URL('../server/automation/config.js',import.meta.url).href],['createCalendarClient',new URL('../server/google/calendar-client.js',import.meta.url).href],['readCalendarConfig,readMemberPlansConfig,CALENDAR_REQUIRED_SCOPES',new URL('../server/google/calendar-config.js',import.meta.url).href],['createMapEventService',new URL('../server/map/events.js',import.meta.url).href],['createCalendarMapSync',new URL('../server/automation/calendar-sync.js',import.meta.url).href],['createLiveRetrievalTools',new URL('../tools/discord/index.js',import.meta.url).href]];
const moduleSource="import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';\n"+imports.map(([names,url])=>`import {${names}} from ${JSON.stringify(url)};`).join('\n')+"\nconst clubId='club@group.calendar.google.com',memberId='members@group.calendar.google.com';\n"+fixtureSource+'\nexport {participationFixture};';
const {participationFixture}=await import('data:text/javascript;base64,'+Buffer.from(withTaskReadFixtures(moduleSource)).toString('base64'));
const call=(name,id,args,ids)=>({id,name,arguments:name==='finish_batch'?{handledInputIds:args}:{inputIds:ids,arguments:args}}),turn=(...toolCalls)=>({stopReason:'tool_calls',toolCalls});
const ownUrl=i=>'https://discord.com/channels/100/200/'+String(300+i);
const facts=row=>Object.fromEntries(Object.entries(row).filter(([key])=>!['created_at','updated_at'].includes(key)));
async function ready(f,{previous=false,read=true,lookup=true,indexes=[0],sourceRead=false}={}){
 const inputs=previous?[f.inputs[2]]:f.inputs;
 await f.adapters.prepareBatch({principal:f.adapters.principal,inputs});
 await f.adapters.pipeline.beginCycle({leaseToken:randomUUID(),inputs,getExecutionLog:()=>f.clone(f.history),recordExecution:row=>f.history.push(row)});
 await f.followup();
 for(const i of indexes){const id=f.pending[i].uuid;if(read)assert.equal((await f.execute('read_pending_task',{detail:'full',taskId:id},[id])).status,'ready');if(lookup&&sourceRead)assert.equal((await f.execute('read_discord_messages',{url:ownUrl(i),context:false},[id])).status,'ready');if(lookup)assert.equal((await f.execute('lookup_map_person',{provider:'discord',providerUserId:f.native[i].author,sourceId:f.source,sourceUrl:ownUrl(i)},[id])).status,'ready');}
 if(read)assert.equal((await f.execute('read_map_events',{eventId:[...f.mapRows.keys()][0]},indexes.map(i=>f.pending[i].uuid))).status,'ready');
 f.chronology.length=0;
}
async function deny(f,args=f.patch([0]),ids=[f.pending[0].uuid]){
 const before=f.clone([...f.mapRows.values()]),result=await f.execute('patch_map_participation',args,ids);
 if(result.status==='ready'){assert.equal(result.outcome,'no_change_needed');assert.equal(result.changed,false);}else assert.notEqual(result.status,'ready');assert(!result.receiptId);assert.equal(f.chronology.filter(row=>row.kind==='map_attempt'||row.kind==='calendar_write').length,0);assert.deepEqual([...f.mapRows.values()],before);
 assert.notEqual((await f.execute('resolve_pending_task',{taskId:f.pending[0].uuid,outcome:'completed'},[f.pending[0].uuid])).status,'ready');assert(f.tasks.has(f.pending[0].uuid));assert.equal(f.network.length,0);return result;
}
const changeNative=(f,i,mutate)=>{mutate(f.inputs[i].raw_response);mutate(f.tasks.get(f.pending[i].uuid).info.inputs[0].raw_response);};

test('real handler uses exact native evidence with fresh live reads to apply grouped attendance and resolve actual receipts',async()=>{
 const f=await participationFixture(),ids=f.pending.slice(0,2).map(row=>row.uuid),before=f.clone([...f.mapRows.values()][0]),blocked=f.clone(f.tasks.get(f.pending[2].uuid));let applied;
 const result=await f.run([turn(call('finish_batch','initial',f.inputs.map(row=>row.uuid))),turn(...ids.map((id,i)=>call('read_pending_task','read_'+i,{taskId:id},[id]))),turn(...ids.map((id,i)=>call('read_discord_messages','original_'+i,{url:ownUrl(i),context:false},[id])),...ids.map((id,i)=>call('lookup_map_person','lookup_'+i,{provider:'discord',providerUserId:f.native[i].author,sourceId:f.source,sourceUrl:ownUrl(i)},[id])),call('read_map_events','current_map',{eventId:[...f.mapRows.keys()][0]},ids)),()=>turn(call('patch_map_participation','patch',f.patch(),ids)),request=>{applied=JSON.parse(request.messages.at(-1).content);return turn(...ids.map((id,i)=>call('resolve_pending_task','resolve_'+i,{taskId:id,outcome:'completed'},[id])));},turn(call('finish_batch','final',[]))]);
 if(process.env.NATIVE_PARTICIPATION_BASELINE_ADAPTER)console.log(JSON.stringify({baseline:'exact f19 with handler28b',patch:applied,actualWrites:f.chronology.filter(row=>row.kind==='map_write').length,remainingTasks:f.tasks.size}));
 assert.equal(result.result.status,'completed');assert.equal(applied.status,'ready');assert.equal(applied.sourceStatus,'applied');assert.equal(typeof applied.receiptId,'string');assert.equal(f.chronology.filter(row=>row.kind==='map_write').length,1);assert.equal(f.chronology.filter(row=>row.kind==='calendar_write').length,0);assert.equal(f.control.liveReads,2,'The model explicitly chooses two source reads; map operations add none');assert(result.requests.flatMap(row=>row.messages).some(row=>row.role==='assistant'&&row.toolCalls?.some(tool=>tool.name==='read_discord_messages')));
 const row=[...f.mapRows.values()][0];assert.deepEqual(facts(row.event),facts(before.event));assert.deepEqual(row.buildings,before.buildings);assert.deepEqual(row.people.find(p=>p.person_id===f.ids[2]),before.people[0]);assert.equal(row.people.length,3);for(const [i,start,end]of [[0,'2026-10-23T19:00:00Z','2026-10-23T20:00:00Z'],[1,'2026-10-23T19:30:00Z','2026-10-23T21:00:00Z']]){const p=row.people.find(p=>p.person_id===f.ids[i]);assert.equal(p.attendance_status,'going');assert.equal(p.presence_basis,'planned');assert.equal(Date.parse(p.starts_at),Date.parse(start));assert.equal(Date.parse(p.ends_at),Date.parse(end));assert.equal(p.reported_at,'2026-10-22T18:20:00.000Z');assert.equal(p.source_url,ownUrl(i));assert(!f.tasks.has(ids[i]));}assert.deepEqual(f.tasks.get(blocked.uuid),blocked);assert.equal(f.network.length,0);
});

test('previous-cycle task with absent observations applies using its own bound original and no global observation mutation',async()=>{
 const f=await participationFixture();await ready(f,{previous:true,sourceRead:true});const before=f.clone([...f.mapRows.values()][0]),id=f.pending[0].uuid,result=await f.execute('patch_map_participation',f.patch([0]),[id]);
 if(process.env.NATIVE_PARTICIPATION_BASELINE_ADAPTER)console.log(JSON.stringify({baseline:'absent previous-cycle observation',patch:result,actualWrites:f.chronology.filter(row=>row.kind==='map_write').length}));
 assert.equal(result.status,'ready');assert.equal(f.control.liveReads,1);assert.equal((await f.execute('resolve_pending_task',{taskId:id,outcome:'completed'},[id])).status,'ready');assert.deepEqual(facts([...f.mapRows.values()][0].event),facts(before.event));assert.deepEqual([...f.mapRows.values()][0].people.find(p=>p.person_id===f.ids[2]),before.people[0]);
 // A patch-local candidate must not turn an unobserved original into a normal
 // provider observation. A changed live body still cannot support another patch.
 f.control.changedContent=true;const other=f.pending[1].uuid;await f.execute('read_pending_task',{detail:'full',taskId:other},[other]);await f.execute('lookup_map_person',{provider:'discord',providerUserId:'500',sourceId:f.source,sourceUrl:ownUrl(1)},[other]);const denied=await f.execute('patch_map_participation',f.patch([1]),[other]);assert.notEqual(denied.status,'ready');assert.equal(f.chronology.filter(row=>row.kind==='map_write').length,1);
});

test('explicit provider reads retain creation/edit instants and missing-time native fallback never substitutes received or worker time',async()=>{
 for(const variant of ['valid offset creation','valid edit','missing created','invalid created','date only','missing edit for update','invalid supplied edit','before Discord epoch']){
  const f=await participationFixture();changeNative(f,0,event=>{if(variant==='valid offset creation')event.payload.timestamp='2026-10-22T14:20:00-04:00';if(variant==='valid edit'){event.event_type='message_updated';event.payload.edited_timestamp='2026-10-22T14:21:00-04:00';}if(variant==='missing created')delete event.payload.timestamp;if(variant==='invalid created')event.payload.timestamp='garbage';if(variant==='date only')event.payload.timestamp='2026-10-22';if(variant==='missing edit for update')event.event_type='message_updated';if(variant==='invalid supplied edit')event.payload.edited_timestamp='garbage';if(variant==='before Discord epoch')event.payload.timestamp='2010-01-01T00:00:00Z';});
  if(variant==='valid edit')f.native[0].updatedAt='2026-10-22T18:21:00.000Z';if(!variant.startsWith('valid')&&variant!=='missing edit for update')f.control.missingLiveTime=true;await ready(f,{previous:true,sourceRead:true});if(variant.startsWith('valid')||variant==='missing edit for update'){const result=await f.execute('patch_map_participation',f.patch([0]),[f.pending[0].uuid]);assert.equal(result.status,'ready',variant);assert.equal(Date.parse([...f.mapRows.values()][0].people.find(p=>p.person_id===f.ids[0]).reported_at),Date.parse(variant==='valid edit'?'2026-10-22T18:21:00.000Z':'2026-10-22T18:20:00.000Z'));}else await deny(f);
 }
});

test('explicit current-source reads expose changed or unavailable evidence without map writes or task deletion',async()=>{
 for(const variant of ['body','author','source','time','missing time','deleted','unavailable','truncated','revoked']){
  const f=await participationFixture();await ready(f,{previous:true,sourceRead:true});
  const id=f.pending[0].uuid,before=f.clone(f.tasks.get(id));
  const baseline=await f.execute('read_discord_messages',{url:ownUrl(0),context:false},[id]);
  if(variant==='body')f.control.changedContent=true;if(variant==='author')f.control.changedAuthor=true;if(variant==='source')f.control.liveSource=randomUUID();if(variant==='time')f.control.liveTime='2026-10-22T18:21:00.000Z';if(variant==='missing time')f.control.missingLiveTime=true;if(variant==='deleted')f.control.liveDeleted=true;if(variant==='unavailable')f.control.originalUnavailable=true;if(variant==='truncated')f.control.textTruncated=true;if(variant==='revoked')f.control.revoked=true;
  const current=await f.execute('read_discord_messages',{url:ownUrl(0),context:false},[id]);
  assert.notDeepEqual(current,baseline,variant+' must be visible as changed evidence or a read failure');
  assert.equal(f.chronology.filter(row=>row.kind==='map_write'||row.kind==='calendar_write'||row.kind==='task_resolve').length,0);
  assert.deepEqual(f.tasks.get(id),before,'A read never silently resolves or rewrites saved work');
 }
});

test('a retained task uses its own exact source original despite a different current queued trigger',async()=>{
 const f=await participationFixture();f.inputs[0].raw_response.payload.content='Different current trigger text';
 await ready(f,{previous:true,sourceRead:true});
 const result=await f.execute('patch_map_participation',f.patch([0]),[f.pending[0].uuid]);
 assert.equal(result.sourceStatus,'applied');
 const own=[...f.mapRows.values()][0].people.find(row=>row.person_id===f.ids[0]);
 assert.equal(own.source_url,ownUrl(0));assert.equal(own.reported_at,'2026-10-22T18:20:00.000Z');
 assert.equal(f.tasks.get(f.pending[0].uuid).info.inputs[0].raw_response.payload.content,'I can join the first hour.');
});

test('retained revisions cannot manufacture timestamp proof when the explicit current source read has no provider time',async()=>{
 for(const variant of ['old body new time','old time new body','foreign author','deleted copy','foreign source']){
  const f=await participationFixture(),task=f.tasks.get(f.pending[0].uuid),old=f.clone(task.info.inputs[0]),edited=f.clone(old);edited.uuid=randomUUID();edited.raw_response.event_type='message_updated';edited.raw_response.revision='2';edited.raw_response.payload.edited_timestamp='2026-10-22T18:21:00.000Z';if(variant==='old body new time'){old.raw_response.payload.content='Old body';f.native[0].updatedAt='2026-10-22T18:21:00.000Z';}if(variant==='old time new body'){edited.raw_response.payload.content='Different newer body';f.native[0].content='Different newer body';}if(variant==='foreign author')edited.raw_response.payload.author.id='999';if(variant==='deleted copy')edited.raw_response.event_type='message_deleted';if(variant==='foreign source'){edited.raw_response.source_id=f.clubSource;task.info.sourceIds.push(f.clubSource);}task.info.inputs=[old,edited];f.control.missingLiveTime=true;await ready(f,{previous:true,sourceRead:true});await deny(f);
 }
});

test('native evidence needs identity, task reads and targets; exact task versions survive concurrent changes and no-ops grant no applied proof',async()=>{
 for(const variant of ['identity','unread','version','target','no-op']){
  const f=await participationFixture();if(variant==='target')delete f.tasks.get(f.pending[0].uuid).info.request.personId;await ready(f,{previous:true,sourceRead:true,lookup:!['identity','unread'].includes(variant),read:variant!=='unread'});if(variant==='version')f.tasks.get(f.pending[0].uuid).updated_at='2026-10-22T18:21:00Z';const args=f.patch([0]);if(variant==='no-op'){const row=[...f.mapRows.values()][0];row.people.push({person_id:f.ids[0],attendance_status:'going',presence_basis:'planned',label:'',source_id:f.source,source_url:ownUrl(0),reported_at:'2026-10-22T18:20:00.000Z',starts_at:'2026-10-23T19:00:00+00:00',ends_at:'2026-10-23T20:00:00.000Z'});await f.execute('read_map_events',{eventId:[...f.mapRows.keys()][0]},[f.pending[0].uuid]);}if(variant==='version'){const changed=f.clone(f.tasks.get(f.pending[0].uuid)),applied=await f.execute('patch_map_participation',args,[f.pending[0].uuid]);assert.equal(applied.sourceStatus,'applied');assert.notEqual((await f.execute('resolve_pending_task',{taskId:f.pending[0].uuid,outcome:'completed'},[f.pending[0].uuid])).status,'ready');assert.deepEqual(f.tasks.get(f.pending[0].uuid),changed,'Exact task CAS preserves the newer version');continue;}try{await deny(f,args);}catch(error){throw new Error(variant+': '+error.message,{cause:error});}
 }
});

test('CAS rejects stale attendance writes and separate map reads report later own-row drift or partial data',async()=>{
 for(const variant of ['CAS conflict','readback mismatch','readback partial']){
  const f=await participationFixture();await ready(f,{previous:true,sourceRead:true});const args=f.patch([0]);
  if(variant==='CAS conflict')f.control.humanConflict=true;if(variant==='readback mismatch')f.control.mismatchAfterWrite=true;if(variant==='readback partial')f.control.partialAfterWrite=true;
  const result=await f.execute('patch_map_participation',args,[f.pending[0].uuid]);
  assert.equal(f.chronology.filter(row=>row.kind==='map_write').length,variant==='CAS conflict'?0:1);
  if(variant==='CAS conflict'){assert.notEqual(result.status,'ready');assert(!result.receiptId);}
  else {assert.equal(result.sourceStatus,'applied');const read=await f.execute('read_map_events',{eventId:[...f.mapRows.keys()][0]},[f.pending[0].uuid]);if(variant==='readback partial')assert.equal(read.coverage.complete,false);else assert.equal(read.event_people.find(row=>row.person_id===f.ids[0]).label,'Concurrent human readback');}
  assert(f.tasks.has(f.pending[0].uuid),'Observation alone never deletes a task');
  assert.equal(f.chronology.filter(row=>row.kind==='task_resolve'||row.kind==='calendar_write').length,0);
 }
});
