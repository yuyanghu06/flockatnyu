import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,snapshot,plain,ids,principal,now} from './fixtures/chat-map-attendance.mjs';
import {retrieveAssistantContext} from '../server/chat/context.js';
import {createMapTools} from '../tools/map/index.js';
import {createChatMapTools} from '../tools/map/chat.js';

const timeZone='America/New_York';
const request=f=>f.mapTools.createRequest({principal,timeContext:{now,timeZone}});
const invoke=(chat,name,args={})=>chat.execute({name,arguments:args,principal});
function argumentsFor(data){return {event:plain(data.events[0]),expectedUpdatedAt:data.events[0].updated_at,
  buildings:data.event_buildings.map(plain),people:data.event_people.map(plain)};}
function personalData({winter=false}={}){
  const data=snapshot(),day=winter?'2026-12-12':'2026-10-23',next=winter?'2026-12-13':'2026-10-24';
  Object.assign(data.events[0],{name:'Stern presence',kind:'presence',starts_at:`${day}T22:00:00.123456Z`,ends_at:`${next}T04:00:00.654321Z`});
  Object.assign(data.event_people[0],{starts_at:`${day}T22:15:00.111222Z`,ends_at:`${day}T22:45:00.333444Z`});
  return data;
}

test('7 PM New York corrections save the actual summer/winter instant and preserve untouched exact storage fields',async()=>{
  for(const winter of [false,true]){
    const data=personalData({winter}),f=fixture({data}),chat=request(f),day=winter?'2026-12-12':'2026-10-23';
    await invoke(chat,'read_map_events',{eventId:ids.event});
    const args=argumentsFor(data);delete args.event.ends_at;args.event.ends_local=`${day}T19:00:00`;
    const result=await invoke(chat,'upsert_map_event',args);
    assert.equal(result.sourceStatus,'applied');assert.equal(f.writes.length,1);
    assert.equal(f.state.events[0].ends_at,winter?'2026-12-13T00:00:00.000Z':'2026-10-23T23:00:00.000Z');
    assert.deepEqual(plain(f.state.events[0]),{...plain(data.events[0]),ends_at:f.state.events[0].ends_at});
    assert.deepEqual(f.state.event_people,data.event_people);assert.deepEqual(f.state.event_buildings,data.event_buildings);
    assert.equal(f.writes[0].event.starts_at,data.events[0].starts_at);assert(!('ends_local' in f.writes[0].event));
    assert.match(result.mapSubmission.event.local_display.ends_label,/7:00 PM (?:EDT|EST)$/);
    assert.equal(result.mapSubmission.event.local_display.ends_at,`${day}T19:00:00.000${winter?'-05:00':'-04:00'}`);
    assert.equal(result.mapSubmission.people[0].ends_at,data.event_people[0].ends_at);
  }
});

test('current-presence creation uses trusted request start, honors explicit 7 PM, and keeps the two-hour default when no end is supplied',async()=>{
  for(const explicit of [false,true]){
    const data=snapshot();data.events=[];data.event_people=[];data.event_buildings=[];
    const f=fixture({data}),chat=request(f);await invoke(chat,'read_map_events');
    const event={name:'At Stern',notes:'',kind:'presence',type_id:'other',status:'confirmed',time_kind:'timed',time_zone:timeZone,
      ...(explicit?{ends_local:'2026-10-22T19:00:00'}:{})};
    const result=await invoke(chat,'upsert_map_event',{event,buildings:[{building_id:'stern-school-of-business',location_notes:''}],people:[{person_id:ids.person,attendance_status:'going',presence_basis:'reported',label:''}]});
    assert.equal(result.sourceStatus,'applied');assert.equal(f.writes[0].event.starts_at,now);
    assert.equal(f.writes[0].event.ends_at,explicit?'2026-10-22T23:00:00.000Z':'2026-10-22T22:00:00.000Z');
    assert.equal(f.writes[0].event.reported_at,now);assert(!JSON.stringify(f.writes).includes('local_display'));
    if(explicit)assert.match(result.mapSubmission.people[0].effective_local_display.ends_label,/7:00 PM EDT$/);
  }
});

test('new personal local clocks convert before storage and only an exact trusted presence start can use a new raw boundary',async()=>{
  for(const kind of ['personal_plan','presence']){
    const data=snapshot();data.events=[];data.event_people=[];data.event_buildings=[];
    const f=fixture({data}),chat=request(f);await invoke(chat,'read_map_events');
    const event={name:'Stern plan',notes:'',kind,type_id:'other',status:'confirmed',time_kind:'timed',time_zone:timeZone,
      ...(kind==='presence'?{starts_at:now,ends_local:'2026-10-22T19:00:00'}:{starts_local:'2026-10-23T18:00:00',ends_local:'2026-10-23T19:00:00'})};
    const result=await invoke(chat,'upsert_map_event',{event,buildings:[{building_id:'stern-school-of-business',location_notes:''}],people:[]});
    assert.equal(result.sourceStatus,'applied');assert.equal(f.writes[0].event.starts_at,kind==='presence'?now:'2026-10-23T22:00:00.000Z');
    assert.equal(f.writes[0].event.ends_at,kind==='presence'?'2026-10-22T23:00:00.000Z':'2026-10-23T23:00:00.000Z');
    assert(!('starts_local' in f.writes[0].event));
  }
});

test('participant local departure changes only that person and effective inherited displays describe the actual event window',async()=>{
  const data=personalData(),f=fixture({data}),chat=request(f);await invoke(chat,'read_map_events');
  const args=argumentsFor(data);args.people.push({person_id:ids.person,attendance_status:'going',presence_basis:'planned',label:'Working',starts_local:'2026-10-23T18:30:00',ends_local:'2026-10-23T19:00:00'});
  const result=await invoke(chat,'upsert_map_event',args);assert.equal(result.sourceStatus,'applied');
  assert.deepEqual(plain(f.state.events[0]),plain(data.events[0]));assert.deepEqual(f.state.event_people[0],data.event_people[0]);
  const saved=f.state.event_people.find(row=>row.person_id===ids.person);assert.equal(saved.starts_at,'2026-10-23T22:30:00.000Z');assert.equal(saved.ends_at,'2026-10-23T23:00:00.000Z');
  assert(!('starts_local' in saved));assert(!('effective_local_display' in saved));
  const display=result.mapSubmission.people.find(row=>row.person_id===ids.person).effective_local_display;
  assert.match(display.starts_label,/6:30 PM EDT$/);assert.match(display.ends_label,/7:00 PM EDT$/);
  const fresh=await invoke(chat,'read_map_events',{eventId:ids.event});assert.deepEqual(fresh.event_people.find(row=>row.person_id===ids.person).effective_local_display,display);
});

test('invalid local, DST gap/fold, dual and raw retag boundaries are rejected before any write',async()=>{
  const variants=[
    {ends_local:'2026-03-08T02:30:00'}, {ends_local:'2026-11-01T01:30:00'},
    {ends_local:'2026-02-30T19:00:00'}, {ends_local:'2026-10-23T24:00:00'},
    {ends_local:'2026-10-23T19:00:00Z'}, {ends_local:'2026-10-23T19:00:00',ends_at:'2026-10-23T23:00:00Z'},
    {ends_at:'2026-10-23T23:00:00-04:00'}, {ends_at:'2026-10-24T04:00:00.654321+00:00'},
    {ends_at:'2026-10-23T22:00:00.123456Z'},
  ];
  for(const boundary of variants){
    const data=personalData(),f=fixture({data}),chat=request(f);await invoke(chat,'read_map_events');
    const args=argumentsFor(data);delete args.event.ends_at;Object.assign(args.event,boundary);
    const result=await invoke(chat,'upsert_map_event',args);
    assert.equal(result.status,'invalid_request',JSON.stringify(boundary));assert.match(result.reason,/^map_time_/);
    assert.equal(f.attempts.length,0);assert.deepEqual(f.state,data);
  }
});

test('raw copies require a read of the same event and person in this request; new raw event clocks cannot bypass conversion',async()=>{
  for(const variant of ['no read','other person','new event']){
    const data=personalData(),f=fixture({data}),chat=request(f),args=argumentsFor(data);
    if(variant!=='no read')await invoke(chat,'read_map_events');
    if(variant==='no read')delete args.expectedUpdatedAt;
    if(variant==='other person')args.people.push({...plain(data.event_people[0]),person_id:ids.person});
    if(variant==='new event'){delete args.event.id;delete args.expectedUpdatedAt;delete args.event.source_id;delete args.event.source_url;delete args.event.source_record_id;delete args.event.reported_at;}
    const result=await invoke(chat,'upsert_map_event',args);
    assert.equal(result.status,'invalid_request',variant);assert.equal(result.reason,'map_time_requires_local_clock',variant);assert.equal(f.attempts.length,0);
  }
  const f=fixture(),chat=request(f);await invoke(chat,'read_map_events');
  const args=argumentsFor(snapshot());const result=await invoke(chat,'upsert_map_event',args);
  assert.equal(result.sourceStatus,'applied');assert.deepEqual(plain(f.state.events[0]),plain(snapshot().events[0]));
});

test('read displays use the request timezone and each endpoint’s actual DST offset without changing raw values',async()=>{
  const data=snapshot();Object.assign(data.events[0],{starts_at:'2026-11-01T04:30:00.123456Z',ends_at:'2026-11-01T08:00:00Z'});
  Object.assign(data.event_people[0],{starts_at:null,ends_at:null});
  const f=fixture({data}),ny=await invoke(request(f),'read_map_events');
  assert.equal(ny.events[0].starts_at,data.events[0].starts_at);assert.equal(ny.events[0].local_display.starts_at,'2026-11-01T00:30:00.123456-04:00');
  assert.equal(ny.events[0].local_display.ends_at,'2026-11-01T03:00:00-05:00');
  assert.match(ny.events[0].local_display.starts_label,/12:30 AM EDT$/);assert.match(ny.events[0].local_display.ends_label,/3:00 AM EST$/);
  assert.deepEqual(ny.event_people[0].effective_local_display,ny.events[0].local_display);
  const west=f.mapTools.createRequest({principal,timeContext:{now,timeZone:'America/Los_Angeles'}}),read=await invoke(west,'read_map_events');
  assert.equal(read.events[0].local_display.starts_at,'2026-10-31T21:30:00.123456-07:00');assert.match(read.events[0].local_display.starts_label,/9:30 PM PDT$/);
  assert.deepEqual(f.state,data);assert.equal(f.attempts.length,0);
});

test('all-day dates remain dates and local participant overrides inherit the other event boundary',async()=>{
  const data=snapshot();Object.assign(data.events[0],{time_kind:'all_day',starts_at:null,ends_at:null,starts_on:'2026-10-23',ends_on:'2026-10-24'});
  Object.assign(data.event_people[0],{starts_at:null,ends_at:null});
  const f=fixture({data}),chat=request(f);const read=await invoke(chat,'read_map_events');
  assert.deepEqual(read.events[0].local_display,{time_zone:timeZone,starts_on:'2026-10-23',ends_on:'2026-10-24'});
  const args=argumentsFor(data);args.people[0].ends_local='2026-10-23T19:00:00';
  const result=await invoke(chat,'upsert_map_event',args);assert.equal(result.sourceStatus,'applied');
  assert.equal(f.writes[0].people[0].ends_at,'2026-10-23T23:00:00.000Z');assert.match(result.mapSubmission.people[0].effective_local_display.starts_label,/12:00 AM EDT$/);
  assert.match(result.mapSubmission.people[0].effective_local_display.ends_label,/7:00 PM EDT$/);
});

test('model-facing reads omit nullable input times while private/raw snapshots preserve null inheritance and effective windows',async()=>{
  const data=snapshot();Object.assign(data.event_people[0],{starts_at:null,ends_at:null});
  const f=fixture({data});let round=0;
  const context=await retrieveAssistantContext({messages:[{role:'user',content:'Check current attendance.'}],principal,now,timeZone,mapTools:f.mapTools,
    provider:{planTools:async()=>round++===0?[{name:'read_map_events',arguments:{eventId:ids.event}}]:[]}});
  const raw=f.calls.find(call=>call.name==='read_map_events').result,visible=context.results[0].mapContext;
  assert.equal(raw.events[0].starts_on,null);assert.equal(raw.events[0].ends_on,null);
  assert.equal(raw.event_people[0].starts_at,null);assert.equal(raw.event_people[0].ends_at,null);
  assert(!('starts_on' in visible.events[0]));assert(!('ends_on' in visible.events[0]));
  assert(!('starts_at' in visible.event_people[0]));assert(!('ends_at' in visible.event_people[0]));
  assert.equal(visible.events[0].starts_at,data.events[0].starts_at);assert.equal(visible.events[0].ends_at,data.events[0].ends_at);
  assert.deepEqual(visible.event_people[0].effective_local_display,visible.events[0].local_display);
  assert.deepEqual(f.state,data);assert.equal(f.attempts.length,0);assert.equal(visible.complete,true);
});

test('planning and applied receipt projections retain local displays; oversized enriched snapshots stay explicitly incomplete',async()=>{
  const data=personalData(),f=fixture({data}),args=argumentsFor(data);delete args.event.ends_at;args.event.ends_local='2026-10-23T19:00:00';let round=0;
  const result=await retrieveAssistantContext({messages:[{role:'user',content:'Change our Stern departure to 7 PM.'}],principal,now,timeZone,mapTools:f.mapTools,
    provider:{planTools:async()=>round++===0?[{name:'read_map_events',arguments:{eventId:ids.event}}]:round===2?[{name:'upsert_map_event',arguments:args}]:[]}});
  assert.match(result.results[0].mapContext.events[0].local_display.ends_label,/12:00 AM EDT$/);
  assert.match(result.results[0].mapContext.event_people[0].effective_local_display.ends_label,/6:45 PM EDT$/);
  assert.match(result.results[1].mapWrite.submitted.event.local_display.ends_label,/7:00 PM EDT$/);
  const large={...snapshot(),events:Array.from({length:13},(_,i)=>({...snapshot().events[0],id:`20000000-0000-4000-8000-${String(i).padStart(12,'0')}`,notes:'x'.repeat(4000)}))};
  while(Buffer.byteLength(JSON.stringify(large))<63000)large.events.at(-1).notes+='x'.repeat(100);
  assert(Buffer.byteLength(JSON.stringify(large))<64000);
  const mapTools=createChatMapTools({mapTools:createMapTools({service:{configured:true,read:async()=>({status:'ok',...large})}})});let call=0;
  const bounded=await retrieveAssistantContext({messages:[{role:'user',content:'Show saved map events.'}],principal,now,timeZone,mapTools,provider:{planTools:async()=>call++===0?[{name:'read_map_events',arguments:{}}]:[]}});
  assert.deepEqual(bounded.results[0].mapContext,{complete:false,reason:'snapshot_too_large_use_event_or_source_filter'});assert.equal(bounded.results[0].possiblyTruncated,true);
});
