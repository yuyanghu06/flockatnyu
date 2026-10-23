import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,snapshot,currentUpdate,withoutMetadata,ids,principal,origin,zone} from './fixtures/chat-map-time.mjs';
import {createMapEventService} from '../server/map/events.js';
import {createChatMapTools} from '../tools/map/chat.js';
import {createMapTools} from '../tools/map/index.js';
import {CHAT_MAP_SOURCE_ID,chatMapEventUrl,withChatMapSource} from '../server/map/source-access.js';

const clone=value=>structuredClone(value),execute=(chat,name,args={},actor=principal)=>chat.execute({name,arguments:args,principal:actor});
const reordered=value=>Array.isArray(value)?value.map(reordered):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).reverse().map(([k,v])=>[k,reordered(v)])):value;
const argsFor=(data,eventId=ids.event)=>currentUpdate({...data,events:data.events.filter(row=>row.id===eventId),event_buildings:data.event_buildings.filter(row=>row.event_id===eventId),event_people:data.event_people.filter(row=>row.event_id===eventId)});
const participant=(personId=ids.yuyang)=>({person_id:personId,attendance_status:'going',presence_basis:'planned'});
const prepared=async(data=snapshot())=>{const f=fixture({data}),chat=f.request();assert.equal((await execute(chat,'read_map_events')).status,'ready');return {f,chat};};
const savedPerson=(f,personId,eventId=ids.event)=>f.state.event_people.find(row=>row.event_id===eventId&&row.person_id===personId);
const assertEventPreserved=(f,before,eventId=ids.event)=>{
 for(const old of before.events){const saved=f.state.events.find(row=>row.id===old.id);assert.deepEqual(old.id===eventId?{...saved,updated_at:old.updated_at}:saved,old);}
 const ordered=rows=>[...rows].sort((a,b)=>`${a.event_id}/${a.building_id}`.localeCompare(`${b.event_id}/${b.building_id}`));assert.deepEqual(ordered(f.state.event_buildings),ordered(before.event_buildings));assert.deepEqual(f.state.people,before.people);assert.deepEqual(f.state.event_types,before.event_types);
};

test('omitted labels preserve the same authorized person on each separate event while exact timestamps and other people survive',async()=>{
 const data=snapshot();data.event_people[0].label='  Cafe\u0301 <code> 🗽  ';const second={...clone(data.events[0]),id:ids.second,source_record_id:'chat:second',source_url:chatMapEventUrl(ids.second,origin),url:chatMapEventUrl(ids.second,origin)};
 data.events.push(second);data.event_buildings.push({...data.event_buildings[0],event_id:ids.second,location_notes:'Different room'});
 data.event_people.push(...data.event_people.filter(row=>row.event_id===ids.event).map((row,i)=>({...clone(row),event_id:ids.second,label:`Other event caption ${i}`,source_url:second.source_url})));
 for(const eventId of [ids.event,ids.second])for(const personId of [ids.yuyang,ids.jennifer]){
  const {f,chat}=await prepared(data),args=argsFor(data,eventId),target=args.people.find(row=>row.person_id===personId);delete target.label;target.attendance_status='tentative';
  const start=f.calls.length,result=await execute(chat,'upsert_map_event',args);assert.equal(result.status,'ready');assert.equal(result.sourceStatus,'applied');assert.equal(f.writes.length,1);assertEventPreserved(f,data,eventId);
  const old=data.event_people.find(row=>row.event_id===eventId&&row.person_id===personId);assert.deepEqual({...savedPerson(f,personId,eventId),attendance_status:old.attendance_status},old);
  for(const row of data.event_people.filter(row=>row.event_id!==eventId||row.person_id!==personId))assert.deepEqual(savedPerson(f,row.person_id,row.event_id),row);
  assert.deepEqual(f.calls.slice(start).map(row=>row.name),['upsert_map_event'],'Label completion and persistence may not fetch or look up anything');
 }
});

test('new omitted labels default empty; explicit empty clears only the selected existing caption',async()=>{
 const data=snapshot({attendance:true}),{f,chat}=await prepared(data),args=argsFor(data);args.people.push(participant());
 assert.equal((await execute(chat,'upsert_map_event',args)).status,'ready');assert.equal(savedPerson(f,ids.yuyang).label,'');assertEventPreserved(f,data);for(const old of data.event_people)assert.deepEqual(savedPerson(f,old.person_id),old);
 const g=await prepared(),clear=argsFor(g.f.state);clear.people.find(row=>row.person_id===ids.jennifer).label='';
 assert.equal((await execute(g.chat,'upsert_map_event',clear)).status,'ready');assert.equal(savedPerson(g.f,ids.jennifer).label,'');assert.equal(savedPerson(g.f,ids.yuyang).label,snapshot().event_people.find(row=>row.person_id===ids.yuyang).label);
});

test('explicit null and unknown participant fields remain invalid, including inside a duplicate',async()=>{
 for(const mutate of [args=>{args.people[0].label=null;},args=>{args.people[0].mystery='unknown';},args=>{args.people.push({...args.people[0],label:null});},args=>{args.people.push({...args.people[0],mystery:'unknown'});},args=>{args.people[0].starts_at=null;}]){
  const {f,chat}=await prepared(),before=f.state,args=argsFor(before);mutate(args);const result=await execute(chat,'upsert_map_event',args);assert.equal(result.status,'invalid_request');assert.equal(f.attempts.length,0);assert.deepEqual(f.state,before);
 }
});

test('identical duplicates collapse after label, source and inherited-boundary defaults despite object-key order',async()=>{
 for(const existing of [true,false]){
  const data=snapshot({attendance:!existing}),{f,chat}=await prepared(data),args=argsFor(data);
  const first=existing?args.people.find(row=>row.person_id===ids.yuyang):participant();if(!existing)args.people.push(first);
  const full=existing?clone(first):{...first,label:'',source_id:CHAT_MAP_SOURCE_ID,source_url:chatMapEventUrl(ids.event,origin),reported_at:f.now};
  delete first.label;for(const key of ['source_id','source_url','reported_at'])delete first[key];
  args.people.push(reordered(full));const count=args.people.length,start=f.calls.length,result=await execute(chat,'upsert_map_event',args);
  assert.equal(result.status,'ready');assert.equal(f.writes.length,1);assert.equal(f.writes[0].people.length,count-1);assert.equal(new Set(f.writes[0].people.map(row=>row.person_id)).size,count-1);
  assert.equal(savedPerson(f,ids.yuyang).label,existing?data.event_people.find(row=>row.person_id===ids.yuyang).label:'');assertEventPreserved(f,data);
  assert.deepEqual(f.calls.slice(start).map(row=>row.name),['upsert_map_event']);
 }
});

test('canonical UUID spelling identifies the same existing participant and cannot erase their caption',async()=>{
 const data=snapshot(),canonical='abcdefab-cdef-4abc-8def-abcdefabcdef';
 for(const row of data.people)if(row.id===ids.yuyang)row.id=canonical;for(const row of data.event_people)if(row.person_id===ids.yuyang)row.person_id=canonical;
 const {f,chat}=await prepared(data),args=argsFor(data),first=args.people.find(row=>row.person_id===canonical),duplicate=clone(first);delete first.label;first.person_id=canonical.toUpperCase();args.people.push(duplicate);
 const result=await execute(chat,'upsert_map_event',args);assert.equal(result.status,'ready');assert.equal(f.writes.length,1);assert.equal(f.state.event_people.filter(row=>row.person_id===canonical).length,1);assert.equal(savedPerson(f,canonical).label,data.event_people.find(row=>row.person_id===canonical).label);
});

test('different duplicate labels,status,boundaries or provenance reject safely before persistence',async()=>{
 const variants={label:row=>{row.label='Different activity';},status:row=>{row.attendance_status='tentative';},boundary:row=>{row.starts_local='2026-10-23T16:30:00';delete row.starts_at;},source:row=>{row.source_id='41000000-0000-4000-8000-000000000099';},url:row=>{row.source_url='https://example.test/other';},reported:row=>{row.reported_at=row.reported_at.replace('Z','+00:00');},omittedVersusClear:row=>{row.label='';}};
 for(const [name,mutate]of Object.entries(variants)){
  const {f,chat}=await prepared(),before=f.state,args=argsFor(before),duplicate=clone(args.people[0]);if(name==='omittedVersusClear')delete args.people[0].label;mutate(duplicate);args.people.push(duplicate);
  const start=f.calls.length,result=await execute(chat,'upsert_map_event',args);assert.equal(result.status,'invalid',name);assert.equal(result.reason,'duplicate_participant_ids',name);assert.equal(result.field,'people');assert.deepEqual(result.indices,[0,args.people.length-1]);assert.equal(result.mapSubmission,undefined);assert.equal(f.attempts.length,0);assert.deepEqual(f.state,before);assert.deepEqual(f.calls.slice(start).map(row=>row.name),['upsert_map_event']);
 }
});

test('deduplication never repairs missing or stale parent versions and duplicate buildings still reject',async()=>{
 for(const variant of ['missing','stale','duplicate building']){
  const {f,chat}=await prepared(),before=f.state,args=argsFor(before);args.people.push(reordered(args.people[0]));
  if(variant==='missing')delete args.expectedUpdatedAt;if(variant==='stale')args.expectedUpdatedAt='2026-10-23T19:59:59.123456Z';if(variant==='duplicate building')args.buildings.push({...args.buildings[0]});
  const result=await execute(chat,'upsert_map_event',args);assert(!['ready','applied'].includes(result.status),variant);if(variant==='duplicate building'){assert.equal(result.reason,'duplicate_building_ids');assert.deepEqual(result.indices,[0,1]);}assert.equal(f.attempts.length,0);assert.deepEqual(f.state,before);
 }
});

test('unique versus identical repeated new participants produce the same new-event identity',async()=>{
 const created=[];
 for(const duplicate of [false,true]){const f=fixture({data:snapshot({empty:true})}),chat=f.request(),args={event:{name:'Requested study session',notes:'',kind:'presence',type_id:'study',status:'confirmed',time_kind:'timed',time_zone:zone,ends_local:'2026-10-23T19:00:00'},buildings:[{building_id:'bobst-library',location_notes:'Room 101'}],people:[participant()]};
  if(duplicate)args.people.push(reordered({...args.people[0],label:''}));const start=f.calls.length,result=await execute(chat,'upsert_map_event',args);assert.equal(result.status,'ready');assert.equal(f.writes.length,1);assert.equal(f.state.event_people.length,1);assert.equal(f.state.event_people[0].label,'');assert.deepEqual(f.calls.slice(start).map(row=>row.name),['upsert_map_event']);created.push(f.state.events[0]);
 }
 assert.deepEqual(created[0],created[1],'A harmless repeated person must not alter source_record_id, map UUID or provenance');
});

test('omitted labels cannot copy a hidden relationship caption from the raw store',async()=>{
 const data=snapshot(),f=fixture({data}),actor=withChatMapSource(principal),hidden=ids.jennifer,forwarded=[];
 const authorizeSource=Object.assign(({personId})=>personId!==hidden,{localOnly:true}),service=createMapEventService({store:f.store,authorizeSource,now:()=>new Date(f.now)}),base=createMapTools({service});
 const mapTools={...base,execute:async options=>{if(options.name==='upsert_map_event')forwarded.push(clone(options.arguments));return base.execute(options);}},chat=createChatMapTools({mapTools,store:f.store,publicOrigin:origin,now:()=>new Date(f.now)}).createRequest({principal:actor,timeContext:{now:f.now,timeZone:zone}});
 const read=await execute(chat,'read_map_events',{},actor);assert(!read.event_people.some(row=>row.person_id===hidden));const args=argsFor(data);delete args.people.find(row=>row.person_id===hidden).label;
 const result=await execute(chat,'upsert_map_event',args,actor);assert.notEqual(result.status,'ready');assert.equal(forwarded[0].people.find(row=>row.person_id===hidden).label,'');assert.equal(f.attempts.length,0);assert.deepEqual(f.state,data);
});
