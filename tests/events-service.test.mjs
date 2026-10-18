import test from 'node:test';
import assert from 'node:assert/strict';
import {createMapEventService,createMapEventStore} from '../server/map/events.js';
const at='2026-10-18T16:00:00.000Z',id='33333333-3333-3333-3333-333333333333',pid='11111111-1111-1111-1111-111111111111',sid='22222222-2222-2222-2222-222222222222',other='22222222-2222-2222-2222-222222222223';
const eventTypes=()=>['study','meeting','event','social','other'].map((code,index)=>({code,name:code[0].toUpperCase()+code.slice(1),description:'Synthetic type',icon_key:code,sort_order:(index+1)*10}));
const principal={id:'member',allowedSourceIds:[sid,other]};
const event=(patch={})=>({id,name:'Project session',notes:'Original text',kind:'scheduled_event',type_id:'other',status:'confirmed',time_kind:'timed',starts_at:'2026-10-18T15:00:00Z',ends_at:'2026-10-18T17:00:00Z',starts_on:null,ends_on:null,time_zone:'America/New_York',source_id:sid,source_url:'https://example.com/event',source_record_id:'provider:stable-original',url:null,reported_at:'2026-10-18T15:00:00Z',...patch});
const participant=(patch={})=>({person_id:pid,attendance_status:'going',presence_basis:'planned',label:'Working on project',starts_at:null,ends_at:null,source_id:sid,source_url:'https://example.com/attendance',reported_at:'2026-10-18T15:00:00Z',...patch});
const snapshot=(patch={})=>({event_types:eventTypes(),buildings:[{id:'bobst-library',name:'Bobst'}],people:[{id:pid,display_name:'Synthetic Person',avatar_url:'/assets/avatars/Synthetic.png',is_trackable:true,email:'PRIVATE_EMAIL'}],events:[],event_buildings:[],event_people:[],...patch});
function fixture({data=snapshot(),authorizeSource=async()=>true,upsert,lookup}={}) {
  const writes=[];const store={configured:true,read:async()=>data,lookup:lookup??(async()=>data.people[0]),upsert:upsert??(async args=>{writes.push(args);return {status:'applied',event_id:args.event.id,updated_at:at};})};
  return {writes,service:createMapEventService({store,authorizeSource,now:()=>new Date(at)})};
}
const write=(service,patch={})=>service.upsert({principal,event:event(),buildings:[{building_id:'bobst-library',location_notes:'Room 101'}],people:[participant()],expectedUpdatedAt:null,...patch});

test('shared service creates one complete normalized event snapshot after repeated current-policy checks',async()=>{
  let checks=0;const {service,writes}=fixture({authorizeSource:async args=>{checks++;assert(args.signal instanceof AbortSignal);assert.equal(args.principal,principal);return true;}});
  assert.deepEqual(await write(service),{status:'applied',event_id:id,updated_at:at});assert.equal(writes.length,1);assert.equal(checks,4);
  assert.equal(writes[0].event.source_record_id,'provider:stable-original');assert.equal(writes[0].buildings[0].event_id,undefined);assert.equal(writes[0].people[0].event_id,undefined);
});
test('create can generate event UUID and defaults without inventing an activity label or timing',async()=>{
  const {service,writes}=fixture(),e=event();delete e.id;const p=participant();delete p.label;delete p.attendance_status;
  const r=await write(service,{event:e,people:[p]});assert.equal(r.status,'applied');assert.match(r.event_id,/^[0-9a-f-]{36}$/);assert.equal(writes[0].people[0].label,'');assert.equal(writes[0].people[0].attendance_status,'going');
});
test('all five catalogue classifications roundtrip through trusted write/read without changing catalogue metadata',async()=>{
  for(const type_id of ['study','meeting','event','social','other']) {
    let data=snapshot();const originalTypes=structuredClone(data.event_types);
    const store={configured:true,read:async()=>data,upsert:async({event,buildings,people})=>{
      data={...data,events:[{...event,updated_at:at,created_at:at}],event_buildings:buildings.map(b=>({...b,event_id:event.id})),event_people:people.map(p=>({...p,event_id:event.id}))};return {status:'applied',event_id:event.id,updated_at:at};
    }};
    const service=createMapEventService({store,authorizeSource:async()=>true,now:()=>new Date(at)});
    assert.equal((await write(service,{event:event({type_id})})).status,'applied');
    const result=await service.read({principal,eventId:id});assert.equal(result.events[0].type_id,type_id);assert.deepEqual(result.event_types,originalTypes);
    const empty=await service.read({principal,eventId:other});assert.deepEqual(empty.events,[]);assert.deepEqual(empty.event_types,originalTypes,'Event filters never remove the read-only catalogue');
    assert.equal(typeof service.upsertType,'undefined');
  }
});
test('direct-service missing type defaults only new records to other and preserves an existing classification',async()=>{
  const input=event();delete input.type_id;
  const fresh=fixture();assert.equal((await write(fresh.service,{event:input})).status,'applied');assert.equal(fresh.writes[0].event.type_id,'other');
  const existing=fixture({data:snapshot({events:[event({type_id:'meeting',updated_at:at})]})});assert.equal((await write(existing.service,{event:input,expectedUpdatedAt:at})).status,'applied');assert.equal(existing.writes[0].event.type_id,'meeting');
  for(const type_id of ['workshop','work_session','unknown','https://example.com/icon.svg',null])assert.equal((await write(fixture().service,{event:event({type_id})})).status,'invalid');
});
test('strict catalogue snapshots reject missing/duplicate/oversized metadata, unsafe icons and invalid event references',async()=>{
  const missing=snapshot();delete missing.event_types;
  const cases=[missing,snapshot({event_types:[]}),snapshot({event_types:Array(101).fill(eventTypes()[0])}),snapshot({event_types:[...eventTypes(),eventTypes()[0]]}),snapshot({event_types:eventTypes().map((t,i)=>i===1?{...t,icon_key:'study'}:t)}),snapshot({event_types:eventTypes().map((t,i)=>i===0?{...t,icon_key:'https://example.com/icon.svg'}:t)}),snapshot({event_types:eventTypes().map((t,i)=>i===0?{...t,name:'x'.repeat(101)}:t)}),snapshot({events:[event({type_id:'unknown'})]})];
  for(const data of cases)assert.equal((await fixture({data}).service.read({principal})).status,'unavailable');
  const data=snapshot({event_types:eventTypes().map(t=>({...t,private_note:'PRIVATE'}))});const safe=await fixture({data}).service.read({principal});assert(!JSON.stringify(safe.event_types).includes('PRIVATE'));
});
test('new timed-event and explicit current-report defaults use original timestamps and preserve explicit ends',async()=>{
  for(const [e,expected] of [[event({ends_at:null}),'2026-10-18T17:00:00.000Z'],[event({kind:'presence',ends_at:null}),'2026-10-18T17:00:00.000Z'],[event({kind:'presence',starts_at:'2026-10-17T12:00:00Z',reported_at:'2026-10-17T12:00:00Z',ends_at:null}),'2026-10-17T14:00:00.000Z'],[event({ends_at:'2026-10-18T16:30:00Z'}),'2026-10-18T16:30:00Z']]) {
    const {service,writes}=fixture();assert.equal((await write(service,{event:e})).status,'applied');assert.equal(writes[0].event.ends_at,expected);
  }
  for(const e of [event({kind:'personal_plan',ends_at:null}),event({kind:'presence',starts_at:'2026-10-19T15:00:00Z',reported_at:'2026-10-19T15:00:00Z',ends_at:null}),event({starts_at:null,ends_at:null}),event({time_kind:'all_day',starts_at:null,ends_at:null,starts_on:'2026-10-18',ends_on:null})])assert.equal((await write(fixture().service,{event:e})).status,'invalid');
  const {service,writes}=fixture({data:snapshot({events:[event({updated_at:at,ends_at:'2026-10-18T16:30:00Z'})]})});assert.equal((await write(service,{event:event({ends_at:null}),expectedUpdatedAt:at})).status,'invalid');assert.equal(writes.length,0);
});
test('strict input validation rejects extras, unknown identities, malformed dates and duplicate relationships',async()=>{
  const {service,writes}=fixture();
  for(const patch of [{event:event({private:'not accepted'})},{event:event({updated_at:at})},{event:event({starts_at:'2026-02-30T12:00:00Z'})},{event:event({source_record_id:null})},{buildings:[{building_id:'missing-building'}]},{people:[participant({person_id:other})]},{people:[participant(),participant()]},{buildings:[{building_id:'bobst-library'},{building_id:'bobst-library'}]},{people:[participant({building_id:'bobst-library'})]},{people:[participant({starts_at:'2026-10-18T14:00:00Z'})]}])assert.equal((await write(service,patch)).status,'invalid');assert.equal(writes.length,0);
});
test('event and every participant require independently authorized current sources',async()=>{
  for(const authorizeSource of [null,async()=>false,async()=>1,async a=>a.sourceUrl.endsWith('event')]) {
    const {service,writes}=fixture({authorizeSource});assert.equal((await write(service)).status,'forbidden');assert.equal(writes.length,0);
  }
  const {service,writes}=fixture();assert.equal((await write(service,{principal:{id:'member',allowedSourceIds:[]}})).status,'forbidden');assert.equal(writes.length,0);
});
test('source policy revocation during validation prevents the transaction',async()=>{
  let calls=0;const {service,writes}=fixture({authorizeSource:async()=>++calls<3});assert.equal((await write(service)).status,'forbidden');assert.equal(writes.length,0);
});
test('updates require exact optimistic state, preserve source identity and authorize removed participation',async()=>{
  const old=event({updated_at:at}),p={...participant({source_id:other,source_url:'https://example.com/old-participation'}),event_id:id};
  const data=snapshot({events:[old],event_people:[p],event_buildings:[{event_id:id,building_id:'bobst-library',location_notes:''}]});
  const {service,writes}=fixture({data});assert.equal((await write(service)).status,'conflict');assert.equal((await write(service,{expectedUpdatedAt:'2026-10-18T15:59:59Z'})).status,'conflict');
  assert.equal((await write(service,{expectedUpdatedAt:at,event:event({source_record_id:'other-original'})})).status,'invalid');
  assert.equal((await write(service,{expectedUpdatedAt:at,event:event({source_id:other})})).status,'invalid');
  assert.equal((await write(service,{expectedUpdatedAt:at,people:[],principal:{id:'member',allowedSourceIds:[sid]}})).status,'forbidden');assert.equal(writes.length,0);
  assert.equal((await write(service,{expectedUpdatedAt:at,people:[]})).status,'applied');assert.equal(writes.length,1);
});
test('cancelled and expired state remains readable for matching stable identity and optimistic reconciliation',async()=>{
  const data=snapshot({events:[event({status:'cancelled',updated_at:at,ends_at:'2026-10-18T15:30:00Z',unexpected:'PRIVATE_RAW'})],event_people:[{event_id:id,...participant(),unexpected:'PRIVATE_RAW'}],event_buildings:[{event_id:id,building_id:'bobst-library',location_notes:'Room 101',unexpected:'PRIVATE_RAW'}]});
  const {service}=fixture({data});const result=await service.read({principal,sourceId:sid,sourceRecordId:'provider:stable-original'});assert.equal(result.status,'ok');assert.equal(result.events.length,1);assert.equal(result.events[0].status,'cancelled');assert.equal(result.event_people.length,1);assert.equal(result.people[0].id,pid);assert(!JSON.stringify(result).includes('PRIVATE'));
  assert.deepEqual((await service.read({principal,eventId:other})).events,[]);
});
test('trusted read hides unauthorized events and independently denied participation without leaking people',async()=>{
  const data=snapshot({events:[event()],event_people:[{event_id:id,...participant({source_id:other})}]});
  const {service}=fixture({data});const r=await service.read({principal:{id:'member',allowedSourceIds:[sid]}});assert.equal(r.events.length,1);assert.deepEqual(r.event_people,[]);assert.deepEqual(r.people,[]);
  assert.deepEqual((await service.read({principal:{id:'member',allowedSourceIds:[]}})).events,[]);
});
test('lookup requires source authority and returns canonical safe identity only',async()=>{
  const {service}=fixture();const args={principal,provider:'discord',providerUserId:'123456789012345678',sourceId:sid,sourceUrl:'https://example.com/source'};
  const r=await service.lookup(args);assert.equal(r.status,'ok');assert.equal(r.person.id,pid);assert(!JSON.stringify(r).includes('PRIVATE'));
  assert.equal((await service.lookup({...args,sourceId:other,principal:{id:'member',allowedSourceIds:[sid]}})).status,'forbidden');
});
test('store exact provider lookup is bounded and escapes email wildcard characters',async()=>{
  const calls=[],env={SUPABASE_URL:'https://synthetic.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'PRIVATE_KEY'},store=createMapEventStore({env,fetchImpl:async(url,options)=>{calls.push({url,options});return Response.json(snapshot().people.map(p=>({...p,email:'some_one%@example.com'})));}});
  assert.equal((await store.lookup({provider:'discord',providerUserId:'123456789012345678'})).id,pid);assert.equal(new URL(calls[0].url).searchParams.get('discord_user_id'),'eq.123456789012345678');assert.equal(new URL(calls[0].url).searchParams.get('limit'),'2');
  const email=await store.lookup({provider:'email',providerUserId:'some_one%@example.com'});assert.equal(email.id,pid);assert.equal(email.email,undefined);assert.equal(new URL(calls[1].url).searchParams.get('email'),'ilike.some\\_one\\%@example.com');assert.equal(new URL(calls[1].url).searchParams.get('select'),'id,display_name,avatar_url,is_trackable,email');
  assert.equal(await store.lookup({provider:'email',providerUserId:'some*one%@example.com'}),null,'Wildcard matches cannot establish an exact provider identity');
  for(const args of [{provider:'discord',providerUserId:'18446744073709551616'},{provider:'discord',providerUserId:'or(id.eq.private)'},{provider:'unknown',providerUserId:'value'}])await assert.rejects(store.lookup(args));
});
test('store sends fixed RPC transaction with optimistic token and sanitizes provider conflict responses',async()=>{
  const env={SUPABASE_URL:'https://synthetic.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'PRIVATE_KEY'};let captured;
  const store=createMapEventStore({env,fetchImpl:async(url,options)=>{captured={url,options};return Response.json({status:'applied',event_id:id,updated_at:at});}});
  assert.equal((await store.upsert({event:event(),buildings:[],people:[],expectedUpdatedAt:at})).status,'applied');assert.equal(captured.url,'https://synthetic.supabase.co/rest/v1/rpc/map_upsert_event');assert.equal(JSON.parse(captured.options.body).p_expected_updated_at,at);
  for(const [code,status] of [['40001','conflict'],['23514','invalid'],['23503','invalid']])assert.deepEqual(await createMapEventStore({env,fetchImpl:async()=>Response.json({code,message:'PRIVATE_PROVIDER_ERROR'},{status:400})}).upsert({event:event(),buildings:[],people:[]}),{status});
});
test('service remains bounded on stalled storage and cancellation; unconfigured authentication fails closed',async()=>{
  const service=createMapEventService({store:{configured:true,read:()=>new Promise(()=>{})},timeoutMs:50});assert.deepEqual(await service.read({principal}),{status:'unavailable'});
  const controller=new AbortController();controller.abort();assert.deepEqual(await service.read({principal,signal:controller.signal}),{status:'unavailable'});assert.deepEqual(await service.read({}),{status:'forbidden'});assert.deepEqual(await createMapEventService({store:{configured:false}}).read({principal}),{status:'not_configured'});
});
