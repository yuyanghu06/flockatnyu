import test from 'node:test';
import assert from 'node:assert/strict';
import {createMapEventService,mapReadContext} from '../server/map/events.js';
import {createMapSourceAuthorizer} from '../server/map/source-access.js';

const at='2026-10-23T16:00:00.000Z',sourceId='22222222-2222-2222-2222-222222222222',calendarId='fixed@example.com';
const principal={id:'synthetic',allowedSourceIds:[sourceId],calendarAccess:true,calendarId};
const id=index=>`33333333-3333-3333-3333-${String(index).padStart(12,'0')}`;
const url=index=>`https://calendar.google.com/calendar/event?eid=${Buffer.from(`event${index} ${calendarId}`).toString('base64url')}`;
const event=index=>({id:id(index),name:`Saved event ${index}`,notes:'',kind:'scheduled_event',type_id:'other',status:index%3?'confirmed':'cancelled',time_kind:'timed',
  starts_at:'2026-10-21T15:00:00Z',ends_at:'2026-10-21T17:00:00Z',starts_on:null,ends_on:null,time_zone:'America/New_York',source_id:sourceId,source_url:url(index),source_record_id:`event${index}`,url:null,reported_at:at,updated_at:at});
const snapshot=count=>({event_types:[{code:'other',name:'Other',description:'',icon_key:'other',sort_order:1}],buildings:[{id:'bobst-library',name:'Bobst'}],people:[],events:Array.from({length:count},(_,i)=>event(i+1)),event_people:[],event_buildings:Array.from({length:count},(_,i)=>({event_id:id(i+1),building_id:'bobst-library',location_notes:''}))});

function fixture(count=30) {
  let reads=0,providerCalls=0,writes=0;const data=snapshot(count);
  const store={configured:true,read:async()=>{reads++;return structuredClone(data);},upsert:async args=>{writes++;return {status:'applied',event_id:args.event.id,updated_at:at};}};
  const unavailable=()=>{providerCalls++;throw Error('No source service should run');};
  const authorizeSource=createMapSourceAuthorizer({calendarSourceId:sourceId,calendarClient:{configured:false,calendarId,readEvent:unavailable},liveDiscordService:{readMessages:unavailable},googleClient:{readGmail:unavailable}});
  return {data,service:createMapEventService({store,authorizeSource}),get reads(){return reads;},get writes(){return writes;},get providerCalls(){return providerCalls;}};
}

test('large saved history including cancelled and ended events costs one DB read and zero provider reads',async()=>{
  const f=fixture(400),result=await f.service.read({principal});
  assert.equal(result.status,'ok');assert.equal(result.events.length,400);assert.equal(result.event_buildings.length,400);
  assert.equal(f.reads,1);assert.equal(f.providerCalls,0);
});
test('targeted map read returns only that saved event and still performs no source fetch',async()=>{
  const f=fixture(),result=await f.service.read({principal,eventId:id(5)});
  assert.deepEqual(result.events.map(row=>row.id),[id(5)]);assert.deepEqual(result.event_buildings.map(row=>row.event_id),[id(5)]);
  assert.equal(f.reads,1);assert.equal(f.providerCalls,0);
});
test('explicit map read supplies write validation; write dispatches only the DB transaction',async()=>{
  const f=fixture(),read=await f.service.read({principal,eventId:id(1)}),saved=read.events[0];
  const {updated_at,...event}=saved;
  const result=await f.service.upsert({principal,event:{...event,notes:'Requested new note'},buildings:[{building_id:'bobst-library',location_notes:''}],people:[],expectedUpdatedAt:updated_at,readContext:mapReadContext(read)});
  assert.equal(result.status,'applied');assert.equal(f.reads,1);assert.equal(f.writes,1);assert.equal(f.providerCalls,0);
});
test('caller cancellation does not start map storage or any provider work',async()=>{
  const f=fixture(),controller=new AbortController();controller.abort();
  assert.deepEqual(await f.service.read({principal,signal:controller.signal}),{status:'unavailable',diagnostics:{stage:'execution',reason:'aborted'}});
  assert.equal(f.reads,0);assert.equal(f.providerCalls,0);
});
