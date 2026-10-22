import test from 'node:test';
import assert from 'node:assert/strict';
import {createMapEventService} from '../server/map/events.js';
import {createMapSourceAuthorizer} from '../server/map/source-access.js';

const at='2026-10-21T16:00:00.000Z',sourceId='22222222-2222-2222-2222-222222222222';
const principal={id:'synthetic',allowedSourceIds:[sourceId],calendarAccess:true,calendarId:'fixed@example.com'};
const eventId=index=>`33333333-3333-3333-3333-${String(index).padStart(12,'0')}`;
const personId=index=>`11111111-1111-1111-1111-${String(index).padStart(12,'0')}`;
const calendarUrl=id=>`https://calendar.google.com/calendar/event?eid=${Buffer.from(`${id} ${principal.calendarId}`).toString('base64url')}`;
const event=(index,patch={})=>({id:eventId(index),name:`Synthetic event ${index}`,notes:'',kind:'scheduled_event',type_id:'other',status:'confirmed',time_kind:'timed',
  starts_at:'2026-10-21T15:00:00Z',ends_at:'2026-10-21T17:00:00Z',starts_on:null,ends_on:null,time_zone:'America/New_York',
  source_id:sourceId,source_url:calendarUrl(`event${index}`),source_record_id:`original-${index}`,url:null,reported_at:at,...patch});
const participation=(index,person=index,patch={})=>({event_id:eventId(index),person_id:personId(person),attendance_status:'going',presence_basis:'planned',label:'',starts_at:null,ends_at:null,
  source_id:sourceId,source_url:calendarUrl(`attendance${index}`),reported_at:at,...patch});
function snapshot(count=1) {
  return {event_types:[{code:'other',name:'Other',description:'',icon_key:'other',sort_order:1}],buildings:[{id:'bobst-library',name:'Bobst'}],
    people:Array.from({length:count},(_,i)=>({id:personId(i+1),display_name:`Synthetic person ${i+1}`,is_trackable:true})),
    events:Array.from({length:count},(_,i)=>event(i+1)),event_buildings:Array.from({length:count},(_,i)=>({event_id:eventId(i+1),building_id:'bobst-library',location_notes:`Room ${i+1}`})),
    event_people:Array.from({length:count},(_,i)=>participation(i+1))};
}
function fixture(data=snapshot(),options={}) {
  let reads=0,writes=0;
  const store={configured:true,read:async()=>{reads++;return structuredClone(data);},upsert:async()=>{writes++;return {status:'applied'};}};
  const service=createMapEventService({store,now:()=>new Date(at),...options});
  return {store,service,get reads(){return reads;},get writes(){return writes;}};
}
function calendarAuthorizer(store,readEvent,options={}) {
  return createMapSourceAuthorizer({store,calendarSourceId:sourceId,calendarClient:{configured:true,calendarId:principal.calendarId,readEvent},...options});
}
const ready=eventId=>({status:'ready',events:[{eventId,url:calendarUrl(eventId)}]});
const tick=()=>new Promise(resolve=>setImmediate(resolve));

test('one trusted read shares exact in-flight originals and its snapshot while binding every attendance marker',async()=>{
  const data=snapshot(3),shared=calendarUrl('shared1'),origin='https://flock.example';
  const marker=(event,person)=>`${origin}/?event=${event}#attendance-${person}-44444444-4444-4444-4444-444444444444`;
  data.events=data.events.map(row=>({...row,source_url:shared}));
  data.event_people=[
    participation(1,1,{source_url:marker(eventId(1),personId(1))}),
    participation(2,2,{source_url:marker(eventId(1),personId(1))}), // Cannot borrow another relation's declaration.
    participation(3,3,{source_url:shared}),
  ];
  const f=fixture(data);let checks=0;
  const authorizeSource=calendarAuthorizer(f.store,async({eventId})=>{checks++;await tick();return ready(eventId);},{publicOrigin:origin});
  const service=createMapEventService({store:f.store,authorizeSource,now:()=>new Date(at)});
  const result=await service.read({principal});
  assert.equal(result.status,'ok');assert.equal(checks,1,'events, direct participation and bound declaration share one exact provider read');
  assert.equal(f.reads,1,'declarations reuse the same validated snapshot');
  assert.deepEqual(result.events.map(row=>row.id),data.events.map(row=>row.id));
  assert.deepEqual(result.event_people.map(row=>row.person_id),[personId(1),personId(3)]);
  assert.deepEqual(result.people.map(row=>row.id),[personId(1),personId(3)]);
});

test('separate originals never share grants and a later trusted read sees fresh policy and snapshot revocation',async()=>{
  const data=snapshot(2);let allowed=true;const calls=[];
  const f=fixture(data),authorizeSource=calendarAuthorizer(f.store,async({eventId})=>{calls.push(eventId);return allowed?ready(eventId):{status:'forbidden'};});
  const service=createMapEventService({store:f.store,authorizeSource,now:()=>new Date(at)});
  const first=await service.read({principal});assert.equal(first.events.length,2);assert.equal(first.event_people.length,2);
  assert.deepEqual(calls.sort(),['attendance1','attendance2','event1','event2']);
  allowed=false;
  const second=await service.read({principal});assert.equal(second.status,'ok');assert.deepEqual(second.events,[]);assert.deepEqual(second.event_people,[]);assert.deepEqual(second.people,[]);
  assert.equal(calls.length,6,'new request checks both originals again, but never reads participation of denied events');assert.equal(f.reads,2);
  data.events=[];data.event_people=[];data.event_buildings=[];
  assert.deepEqual((await service.read({principal})).events,[]);assert.equal(f.reads,3);assert.equal(calls.length,6);
});

test('custom authorizer fallback bounds both authorization phases to four and keeps snapshot relationship ordering',async()=>{
  const data=snapshot(10);data.events.reverse();data.event_people.reverse();data.event_buildings.reverse();
  let active=0,max=0,eventChecksFinished=0;const calls=[],finished=[];
  let releaseFirst;const firstCheck=new Promise(resolve=>{releaseFirst=resolve;});
  const authorizeSource=async args=>{
    calls.push(args);active++;max=Math.max(max,active);
    const person=args.personId!==undefined;
    if(person)assert.equal(eventChecksFinished,10,'participant checks start only after event authorization phase');
    if(!person&&args.eventId===eventId(10))await firstCheck;else await tick();
    active--;finished.push(args.eventId);
    if(!person&&args.eventId===eventId(9))releaseFirst();
    if(!person)eventChecksFinished++;
    return person?args.personId!==personId(7):args.eventId!==eventId(8);
  };
  const f=fixture(data,{authorizeSource}),result=await f.service.read({principal});
  assert.equal(result.status,'ok');assert.equal(max,4);assert.equal(active,0);assert.equal(calls.length,19);
  assert(!calls.some(args=>args.personId&&args.eventId===eventId(8)),'denied event never dispatches participant checks');
  const expected=data.events.filter(row=>row.id!==eventId(8)).map(row=>row.id);
  assert.deepEqual(result.events.map(row=>row.id),expected);assert.deepEqual(result.event_buildings.map(row=>row.event_id),expected);
  assert.deepEqual(result.event_people.map(row=>row.event_id),expected.filter(id=>id!==eventId(7)));
  assert.deepEqual(result.people.map(row=>row.id),data.people.filter(row=>![personId(7),personId(8)].includes(row.id)).map(row=>row.id));
  assert.notDeepEqual(finished.slice(0,10),data.events.map(row=>row.id),'checks actually complete out of order');
});

test('filtered trusted reads authorize only matching events and their relations',async()=>{
  const calls=[],f=fixture(snapshot(10),{authorizeSource:async args=>{calls.push(args);return true;}});
  const result=await f.service.read({principal,eventId:eventId(6)});
  assert.equal(result.status,'ok');assert.deepEqual(result.events.map(row=>row.id),[eventId(6)]);assert.equal(result.event_people.length,1);
  assert.equal(calls.length,2);assert(calls.every(row=>row.eventId===eventId(6)));
});

test('real source authorizer never has more than four distinct provider originals in flight',async()=>{
  const f=fixture(snapshot(12));let active=0,max=0,checks=0;
  const authorizeSource=calendarAuthorizer(f.store,async({eventId})=>{
    checks++;active++;max=Math.max(max,active);await tick();active--;return ready(eventId);
  });
  const service=createMapEventService({store:f.store,authorizeSource,now:()=>new Date(at)});
  const result=await service.read({principal});
  assert.equal(result.status,'ok');assert.equal(result.events.length,12);assert.equal(result.event_people.length,12);
  assert.equal(checks,24);assert.equal(max,4);assert.equal(active,0);
});

for(const phase of ['events','participants'])test(`cancellation during ${phase} stops queued checks and returns no partial authorized data`,async()=>{
  const controller=new AbortController(),releases=[];let started=0;
  const f=fixture(snapshot(12),{authorizeSource:async args=>{
    if(phase==='participants'&&!args.personId)return true;
    started++;await new Promise(resolve=>releases.push(resolve));return true;
  }});
  const pending=f.service.read({principal,signal:controller.signal});
  for(let i=0;i<10&&started<4;i++)await tick();
  assert.equal(started,4);controller.abort();
  const result=await pending;
  assert.deepEqual(result,{status:'unavailable',diagnostics:{stage:'execution',reason:'aborted'}});
  for(const release of releases)release();await tick();await tick();
  assert.equal(started,4,'none of the queued checks dispatch after cancellation');
});

test('write authorization remains uncached through both passes even when rows share a provider original',async()=>{
  const data=snapshot();data.events=[];data.event_buildings=[];data.event_people=[];
  const f=fixture(data);let checks=0;
  const authorizeSource=calendarAuthorizer(f.store,async({eventId})=>{checks++;return ready(eventId);});
  authorizeSource.createReadScope=()=>{throw Error('writes must not create a read scope');};
  const service=createMapEventService({store:f.store,authorizeSource,now:()=>new Date(at)});
  const {event_id,...person}=participation(1,1,{source_url:calendarUrl('event1')});
  const result=await service.upsert({principal,event:event(1),buildings:[{building_id:'bobst-library',location_notes:''}],people:[person]});
  assert.equal(result.status,'applied');assert.equal(checks,4,'event and participation each recheck the provider in both passes');assert.equal(f.writes,1);
});
