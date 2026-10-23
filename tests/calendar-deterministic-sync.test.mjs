import test from 'node:test';
import assert from 'node:assert/strict';
import {createCalendarMapSync,matchCalendarBuildings,calendarMapName} from '../server/automation/calendar-sync.js';
import {createMapSourceAuthorizer} from '../server/map/source-access.js';
const sourceId='11111111-1111-4111-8111-111111111111',memberSource='22222222-2222-4222-8222-222222222222',personId='33333333-3333-4333-8333-333333333333';
const at='2026-10-22T15:00:00.000Z',calendarId='club@group.calendar.google.com';
const url=(eventId,target=calendarId)=>`https://calendar.google.com/calendar/event?eid=${Buffer.from(`${eventId} ${target}`).toString('base64url')}`;
const principal={id:'worker',googleAccess:true,allowedSourceIds:[sourceId,memberSource]};
const window={timeMin:'2026-10-22T00:00:00Z',timeMax:'2026-10-25T00:00:00Z'};
function fixture() {
  let originals=[{eventId:'event0001',title:'Workshop',description:'Plan',location:'Bobst Library room 3',start:{dateTime:'2026-10-23T15:00:00Z',timeZone:'America/New_York'},end:{dateTime:'2026-10-23T17:00:00Z',timeZone:'America/New_York'},status:'confirmed',createdAt:at,updatedAt:at,url:url('event0001')}];
  const data={events:[],event_buildings:[],event_people:[],buildings:[{id:'bobst-library',name:'Bobst Library',aliases:['Bobst','70 Washington Square South']}],people:[]},writes=[];
  const client={configured:true,calendarId,listEventsWindow:async()=>({status:'ready',events:originals,coverage:{complete:true}}),readEvent:async({eventId})=>({status:'ready',events:originals.filter(row=>row.eventId===eventId)})};
  const mapService={read:async({sourceId:source,sourceRecordId})=>({...structuredClone(data),status:'ok',events:data.events.filter(row=>(!source||row.source_id===source)&&(!sourceRecordId||row.source_record_id===sourceRecordId))}),upsert:async args=>{
    writes.push(structuredClone({...args,signal:undefined}));const old=data.events.findIndex(row=>row.id===args.event.id);const row={...args.event,updated_at:at};if(old<0)data.events.push(row);else data.events[old]=row;
    data.event_buildings=data.event_buildings.filter(row=>row.event_id!==row.id);data.event_buildings=args.buildings.map(row=>({...row,event_id:args.event.id}));data.event_people=args.people.map(row=>({...row,event_id:args.event.id}));return {status:'applied',event_id:row.id,updated_at:at};}};
  const sync=extra=>createCalendarMapSync({targets:[{client,sourceId,kind:'club'}],mapService,...extra}).sync({principal,window});
  return {data,writes,client,mapService,sync,get originals(){return originals;},set originals(value){originals=value;}};
}
test('deterministic projection is idempotent, matches aliases, retains exact provider identity',async()=>{
  const f=fixture();assert.equal((await f.sync()).complete,true);assert.equal(f.writes.length,1);
  assert.equal(f.data.events[0].source_record_id,'event0001');assert.equal(f.data.event_buildings[0].building_id,'bobst-library');
  assert.equal((await f.sync()).results[0].status,'unchanged');assert.equal(f.writes.length,1);
});
test('matching respects word boundaries and ambiguous aliases, matches full address aliases',()=>{
 const buildings=[{id:'one',name:'Bobst Library',aliases:['Bobst','70 Washington Square South']},{id:'two',name:'Other',aliases:['Common']},{id:'three',name:'Third',aliases:['Common']}];
 assert.deepEqual(matchCalendarBuildings('SuperBobst',buildings).buildingIds,[]);
 assert.equal(matchCalendarBuildings('Common room 3',buildings).status,'ambiguous');
 assert.deepEqual(matchCalendarBuildings('70 Washington Square South, New York NY',buildings).buildingIds,['one']);
});
test('independent people and existing type survive Calendar changes; shrinking past explicit participation defers',async()=>{
 const f=fixture();await f.sync();const event=f.data.events[0];event.type_id='meeting';
 f.data.event_people=[{event_id:event.id,person_id:personId,attendance_status:'going',presence_basis:'planned',label:'Joining',starts_at:'2026-10-23T15:00:00Z',ends_at:'2026-10-23T17:00:00Z',source_id:sourceId,source_url:'https://discord.com/channels/1/2/3',reported_at:at}];
 f.originals[0].title='Changed';f.originals[0].updatedAt='2026-10-22T16:00:00Z';await f.sync();assert.equal(f.writes.at(-1).people.length,1);assert.equal(f.data.events[0].type_id,'meeting');
 f.originals[0].end.dateTime='2026-10-23T16:00:00Z';const result=await f.sync();assert.equal(result.complete,false);assert.equal(result.unresolved[0].reason,'participation_time_conflict');assert.equal(f.writes.length,2);
});
test('resolved buildings survive unchanged raw location; explicit cancellation updates, absence does not delete',async()=>{
 const f=fixture();await f.sync();f.data.event_buildings=[{event_id:f.data.events[0].id,building_id:'chosen-building',location_notes:'User resolution'}];f.originals[0].title='New name';await f.sync();assert.equal(f.writes.at(-1).buildings[0].building_id,'chosen-building');
 const saved=f.originals[0];f.originals=[];await f.sync();assert.equal(f.data.events[0].status,'confirmed');
 f.originals=[{...saved,status:'cancelled',start:null,end:null}];await f.sync();assert.equal(f.data.events[0].status,'cancelled');
});
test('revoked exact read cannot authorize projection and incomplete reads never establish absence',async()=>{
 const f=fixture();f.client.readEvent=async()=>({status:'permission_denied',events:[]});assert.equal((await f.sync()).complete,false);assert.equal(f.writes.length,0);
});
test('signed member participation requires fresh verification and maps member source separately',async()=>{
 const f=fixture();const participation={personId,sourceId,sourceUrl:'https://discord.com/channels/1/2/3',provider:'discord',providerUserId:'3',reportedAt:at,label:'Studying'};
 f.originals[0].memberPlan={activityKind:'presence',typeId:'study',participation};
 let allowed=false;
 const extra={targets:[{client:f.client,sourceId:memberSource,kind:'member'}],authorizeParticipation:async()=>allowed};
 assert.equal((await f.sync(extra)).complete,false);assert.equal(f.writes.length,0);
 allowed=true;assert.equal((await f.sync(extra)).complete,true);assert.equal(f.data.events[0].source_id,memberSource);assert.equal(f.data.event_people[0].person_id,personId);assert.equal(f.data.events[0].kind,'presence');
});
test('additional pinned Calendar target needs exact source/id and current grants',async()=>{
 const f=fixture(),authorizer=createMapSourceAuthorizer({calendarTargets:[{client:f.client,sourceId:memberSource}]});
 assert.equal(await authorizer({principal,sourceId:memberSource,sourceUrl:url('event0001')}),true);
 assert.equal(await authorizer({principal,sourceId,sourceUrl:url('event0001')}),false);
 assert.equal(await authorizer({principal:{...principal,googleAccess:false},sourceId:memberSource,sourceUrl:url('event0001')}),false);
});
test('partial oversized Calendar reads split into contiguous windows without losing instance IDs',async()=>{
 const f=fixture(),calls=[];
 f.client.listEventsWindow=async args=>{calls.push([args.timeMin,args.timeMax]);return calls.length===1?{status:'partial',events:[],coverage:{complete:false,reason:'context_limit'}}:{status:'ready',events:f.originals,coverage:{complete:true}};};
 const result=await f.sync();assert.equal(result.complete,true);assert.equal(calls.length,3);assert.equal(calls[1][0],window.timeMin);assert.equal(calls[1][1],calls[2][0]);assert.equal(calls[2][1],window.timeMax);assert.equal(f.writes.length,1);
});
test('two pinned calendars use disjoint stable map identities for identical provider event IDs',async()=>{
 const f=fixture(),memberCalendar='member@group.calendar.google.com';
 const second={...f.client,calendarId:memberCalendar,readEvent:async()=>({status:'ready',events:f.originals.map(row=>({...row,url:url(row.eventId,memberCalendar)}))})};
 const result=await f.sync({targets:[{client:f.client,sourceId,kind:'club'},{client:second,sourceId:memberSource,kind:'club'}]});
 assert.equal(result.complete,true);assert.equal(f.writes.length,2);assert.notEqual(f.writes[0].event.id,f.writes[1].event.id);assert.equal(f.writes[1].event.source_id,memberSource);
});
test('member identity revoked at final write boundary defers rather than authoring relationship',async()=>{
 const f=fixture();let checks=0;f.originals[0].memberPlan={activityKind:'presence',typeId:'study',participation:{personId,sourceId,sourceUrl:'https://discord.com/channels/1/2/3',provider:'discord',providerUserId:'3',reportedAt:at}};
 const result=await f.sync({targets:[{client:f.client,sourceId:memberSource,kind:'member'}],authorizeParticipation:async()=>++checks===1});
 assert.equal(result.complete,false);assert.equal(f.writes.length,0);assert.equal(checks,2);
});
test('execution callback receives actual selected API results and writes without grants or credentials',async()=>{
 const f=fixture(),log=[];
 const result=await createCalendarMapSync({targets:[{client:f.client,sourceId,kind:'club'}],mapService:f.mapService}).sync({principal,window,onApiResult:async row=>log.push(row)});
 assert.equal(result.complete,true);assert(log.some(row=>row.name==='calendar.list_window'&&row.result.events[0].eventId==='event0001'));
 assert(log.some(row=>row.name==='calendar.read_event'));assert(log.some(row=>row.name==='map.upsert_event'&&row.result.status==='applied'));
 assert(!JSON.stringify(log).includes('allowedSourceIds'));assert(log.every(row=>!Object.hasOwn(row.arguments,'principal')));
});
test('unexpected provider exceptions do not leak private exception text into deferred execution results',async()=>{
 const f=fixture();f.mapService.read=async()=>{throw Error('private-token-value');};
 const result=await f.sync();assert.equal(result.unresolved[0].reason,'execution_failed');assert(!JSON.stringify(result).includes('private-token-value'));
});

test('ambiguous alternatives and distinct building matches defer without multi-location guesses',()=>{
 const buildings=[{id:'bobst-library',name:'Bobst Library',aliases:['Bobst']},{id:'stern',name:'Stern',aliases:[]}];
 for(const location of ['Bobst or Stern (TBD)','Bobst and Stern','Maybe Bobst','Bobst?','Bobst, to be determined'])assert.deepEqual(matchCalendarBuildings(location,buildings),{status:'ambiguous',buildingIds:[]},location);
 assert.deepEqual(matchCalendarBuildings('Bobst room 3',buildings),{status:'matched',buildingIds:['bobst-library']});
});
test('map title normalization uses bounded Unicode codepoints and valid blank-title fallback',()=>{
 assert.equal(calendarMapName({title:'a'.repeat(250)}),'a'.repeat(200));
 assert.equal(calendarMapName({title:'😀'.repeat(250)}),'😀'.repeat(200));
 for(const title of ['', '   ',null,undefined]){
  assert.equal(calendarMapName({title},{name:'Existing name'}),'Existing name');
  assert.equal(calendarMapName({title},{name:'  '}),'Calendar event');
 }
 assert.equal(calendarMapName({title:'  Source title  '},{name:'Old'}),'  Source title  ');
});
