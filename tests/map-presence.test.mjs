import test from 'node:test';
import assert from 'node:assert/strict';
import {createMapPresenceService, createMapPresenceStore, MAP_DEBUG_SOURCE_ID, MAP_DEBUG_SOURCE_URL, MAP_LOCAL_PLAN_SOURCE_ID, MAP_LOCAL_PLAN_SOURCE_URL, MAP_LOCAL_PLAN_PERSON_ID, MAP_DEBUG_EVENTS_SOURCE_ID, MAP_DEBUG_EVENTS_SOURCE_URL} from '../server/map/presence.js';
import {createApp} from '../server/app.js';
import {readConfig} from '../server/config.js';

const at = '2026-10-17T20:00:00.000Z';
const pid = '11111111-1111-4111-8111-111111111111';
const sid = '22222222-2222-4222-8222-222222222222';
const principal = {id:'local-development', allowedSourceIds:[sid]};
const person = (overrides={}) => ({id:pid,display_name:'Synthetic Person',avatar_url:'/assets/avatars/Synthetic%20Person.png',is_trackable:true,discord_user_id:'PRIVATE_DISCORD',email:'PRIVATE_EMAIL',...overrides});
const entry = (overrides={}) => ({person_id:pid,status:'planned',label:'Test',valid_from:'2026-10-17T19:00:00Z',expires_at:'2026-10-17T21:00:00Z',source_id:MAP_DEBUG_SOURCE_ID,source_url:MAP_DEBUG_SOURCE_URL,...overrides});
const building = (entries=[entry()],overrides={}) => ({id:'bobst-library',name:'Bobst Library',people_here:entries,updated_at:'PRIVATE_UPDATED',...overrides});
const data = (entries=[entry()],people=[person()]) => ({buildings:[building(entries)],people});
const service = (value=data(), options={}) => createMapPresenceService({store:{configured:true,read:async()=>value},production:false,now:()=>new Date(at),...options});
const read = (s,p=principal) => s.read({principal:p});

test('service returns only safe presentation fields for the exact local debug fixture', async()=>{
  const result=await read(service());
  assert.equal(result.status,'ok');assert.equal(result.observedAt,at);assert.equal(result.buildings[0].people.length,1);
  assert.deepEqual(Object.keys(result.buildings[0]).sort(),['events','id','name','people']);
  assert.deepEqual(result.buildings[0].people[0],{id:pid,displayName:'Synthetic Person',avatarUrl:'/assets/avatars/Synthetic%20Person.png',status:'planned',validFrom:'2026-10-17T19:00:00.000Z',expiresAt:'2026-10-17T21:00:00.000Z',label:'Test'});
  assert(!JSON.stringify(result).includes('PRIVATE'));assert(!JSON.stringify(result).includes(MAP_DEBUG_SOURCE_URL));
});
test('service requires a principal with an allowlist before any store read', async()=>{
  let reads=0;const s=service(data(),{store:{configured:true,read:async()=>{reads++;return data();}}});
  for(const p of [null,{}, {id:'local-development'},{id:'',allowedSourceIds:[]},{id:'member',allowedSourceIds:'*'}])assert.deepEqual(await read(s,p),{status:'forbidden',buildings:[]});
  assert.equal(reads,0);
});
test('debug fixture cannot leak to production, other members, other buildings or modified provenance',async()=>{
  const cases=[
    [data(),{production:true},principal], [data(),{},{id:'member',allowedSourceIds:[MAP_DEBUG_SOURCE_ID]}],
    [{buildings:[building([entry()],{id:'other-building'})],people:[person()]},{},principal],
    [data([entry({status:'self_reported'})]),{},principal],
    [data([entry({source_url:'https://example.invalid/not-the-fixture'})]),{},principal],
    [data([entry({source_id:sid})]),{authorizeSource:async()=>true},principal],
  ];
  for(const [value,options,p] of cases){const r=await read(service(value,options),p);assert.equal(r.status,'ok');assert.deepEqual(r.buildings[0].people,[]);}
});
test('freshness boundaries, missing/untrackable people and invalid native entries stay hidden',async()=>{
  const invalid=[
    {expires_at:at},{valid_from:'2026-10-17T20:00:00.001Z'}, {expires_at:'2026-10-17T18:00:00Z'},
    {valid_from:'invalid'}, {expires_at:'invalid'}, {status:'inferred'}, {person_id:sid},
    {source_id:'invalid'}, {source_url:''}, {label:undefined}, {label:null}, {label:3}, {label:'x'.repeat(201)}, {label:'🗽'.repeat(201)},
  ];
  for(const changes of invalid)assert.deepEqual((await read(service(data([entry(changes)])))).buildings[0].people,[]);
  for(const people of [[],[person({is_trackable:false})],[person({id:'invalid'})],[person({display_name:''})]])assert.deepEqual((await read(service(data([entry()],people)))).buildings[0].people,[]);
  assert.equal((await read(service(data([entry({valid_from:at})])))).buildings[0].people.length,1);
});
test('native sources require both shared allowlist and strict positive current policy authorization',async()=>{
  const value=data([entry({source_id:sid,source_url:'https://discord.com/channels/1/2/3',status:'self_reported'})]);
  assert.deepEqual((await read(service(value))).buildings[0].people,[]);
  for(const allowed of [false,null,undefined,'true',1])assert.deepEqual((await read(service(value,{authorizeSource:async()=>allowed}))).buildings[0].people,[]);
  let calls=0;const s=service(value,{authorizeSource:async args=>{calls++;assert.equal(args.sourceId,sid);assert.equal(args.buildingId,'bobst-library');assert.equal(args.principal,principal);assert(args.signal instanceof AbortSignal);return true;}});
  assert.equal((await read(s,{id:'member',allowedSourceIds:[]})).buildings[0].people.length,0);assert.equal(calls,0);
  const result=await read(s);assert.equal(calls,1);assert.equal(result.buildings[0].people[0].label,'Test');assert(!('isDebug' in result.buildings[0].people[0]));
  const memberResult=await read(service(value,{production:true,authorizeSource:async args=>args.principal.id==='member'}),{id:'member',allowedSourceIds:[sid]});
  assert.equal(memberResult.buildings[0].people.length,1);assert.equal(memberResult.buildings[0].people[0].label,'Test');assert(!('isDebug' in memberResult.buildings[0].people[0]));
});
test('source exceptions, hung store/policy and aborted requests fail closed without upstream details',async()=>{
  const hang=()=>new Promise(()=>{}),boom=()=>{throw Error('PRIVATE_TOKEN_DATABASE_HOST');};
  for(const s of [service(data(),{store:{configured:true,read:boom}}),service(data(),{store:{configured:true,read:hang},timeoutMs:50}),service(data([entry({source_id:sid,source_url:'https://example.com/source'})]),{authorizeSource:boom}),service(data([entry({source_id:sid,source_url:'https://example.com/source'})]),{authorizeSource:hang,timeoutMs:50})]){
    const start=Date.now();assert.deepEqual(await read(s),{status:'unavailable',buildings:[]});assert(Date.now()-start<1000);
  }
  const c=new AbortController();c.abort();assert.deepEqual(await service().read({principal,signal:c.signal}),{status:'unavailable',buildings:[]});
});
test('unsafe avatar values fall back to initials; duplicates are bounded without false identity',async()=>{
  for(const url of ['https://example.com/a.png','javascript:alert(1)','/assets/avatars/../a.png','/assets/avatars/%2fsecret.png','/assets/avatars/a.png?token=SECRET','/assets/avatars/%00.png'])assert.equal((await read(service(data([entry()],[person({avatar_url:url})])))).buildings[0].people[0].avatarUrl,null);
  assert.equal((await read(service(data([entry(),entry()])))).buildings[0].people.length,1);
  assert.deepEqual(await read(service(data([entry()],[person(),person()]))),{status:'unavailable',buildings:[]});
});
test('invalid/oversized store payloads and invalid observation date fail closed',async()=>{
  for(const value of [{}, {buildings:[],people:Array(1000).fill(person())},{buildings:Array(101).fill(building()),people:[]},{buildings:[building(Array(501).fill(entry()))],people:[person()]},{buildings:[building(),building()],people:[person()]}])assert.deepEqual(await read(service(value)),{status:'unavailable',buildings:[]});
  assert.deepEqual(await read(service(data(),{now:()=>new Date('invalid')})),{status:'unavailable',buildings:[]});
  assert.deepEqual(await read(service(data(),{store:{configured:false}})),{status:'not_configured',buildings:[]});
});
test('store uses fixed HTTPS origin with service-only headers and two bounded read operations including future plans',async()=>{
  const calls=[],env={SUPABASE_URL:'https://synthetic.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'PRIVATE_SERVICE_KEY'};
  const store=createMapPresenceStore({env,fetchImpl:async(url,options)=>{calls.push({url,options});return Response.json(url.includes('/map_buildings?')?[building()]:[person()]);}});
  assert.equal(store.configured,true);assert.deepEqual(await store.read({observedAt:at}),data());assert.equal(calls.length,2);
  const rpc=calls.find(x=>x.url.includes('/map_buildings?')),rows=calls.find(x=>x.url.includes('/map_people?'));
  assert.equal(new URL(rpc.url).pathname,'/rest/v1/map_buildings');assert.equal(rpc.options.method,'GET');assert.equal(new URL(rpc.url).searchParams.get('select'),'id,name,people_here,scheduled_events');assert.equal(new URL(rpc.url).searchParams.get('limit'),'101');
  assert.equal(rows.options.method,'GET');const q=new URL(rows.url).searchParams;assert.equal(q.get('select'),'id,display_name,avatar_url,is_trackable');assert.equal(q.get('is_trackable'),'eq.true');assert.equal(q.get('limit'),'1000');
  for(const c of calls){assert.equal(c.options.redirect,'error');assert.equal(c.options.headers.Authorization,'Bearer PRIVATE_SERVICE_KEY');assert(c.options.signal instanceof AbortSignal);}
});
test('store rejects unsafe configuration, provider errors, oversized and hung bodies',async()=>{
  for(const url of ['http://synthetic.supabase.co','https://user:pass@synthetic.supabase.co','https://synthetic.supabase.co/path','https://synthetic.supabase.co/?key=secret'])assert.equal(createMapPresenceStore({env:{SUPABASE_URL:url,SUPABASE_SERVICE_ROLE_KEY:'secret'}}).configured,false);
  const env={SUPABASE_URL:'https://synthetic.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'secret'};
  for(const fetchImpl of [async()=>new Response('PRIVATE',{status:403}),async()=>new Response('[]',{headers:{'content-length':'1000001'}}),async()=>new Response('x'.repeat(1000001)),async()=>Response.json(Array(1000).fill({})),()=>new Promise(()=>{}),async()=>new Response(new ReadableStream({start(){}}))])await assert.rejects(createMapPresenceStore({env,fetchImpl,timeoutMs:50}).read({observedAt:at}));
});
test('API authenticates trusted local socket, denies spoofed remote/production requests and sends no-store',async()=>{
  let calls=0;const mapPresenceService={read:async({principal:p})=>{calls++;assert.equal(p.id,'local-development');return {status:'ok',observedAt:at,buildings:[]};}};
  const app=createApp({config:readConfig({}),mapPresenceService});
  const local={incoming:{socket:{remoteAddress:'127.0.0.1'}}};
  const response=await app.fetch(new Request('http://localhost/api/map/presence'),local);assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');assert.equal((await response.json()).status,'ok');assert.equal(calls,1);
  for(const [url,headers,env] of [
    ['http://localhost/api/map/presence',{'x-forwarded-for':'127.0.0.1',origin:'http://localhost'}, {incoming:{socket:{remoteAddress:'203.0.113.5'}}}],
    ['http://localhost/api/map/presence',{},{}],['http://remote.invalid/api/map/presence',{},local],
    ['http://localhost/api/map/presence',{origin:'https://remote.invalid'},local],['http://localhost/api/map/presence',{host:'remote.invalid'},local],
  ])assert.equal((await app.fetch(new Request(url,{headers}),env)).status,403);
  const prod=createApp({config:readConfig({NODE_ENV:'production'}),mapPresenceService});assert.equal((await prod.fetch(new Request('http://localhost/api/map/presence'),local)).status,403);assert.equal(calls,1);
});
test('API missing service/error paths return bounded unavailable responses without leaking secrets',async()=>{
  for(const [mapPresenceService,status] of [[null,'not_configured'],[{read:async()=>({status:'unavailable',buildings:[]})},'unavailable'],[{read:async()=>{throw Error('PRIVATE_SERVICE_KEY');}},'unavailable']]){
    const app=createApp({config:readConfig({}),auth:async()=>principal,mapPresenceService});const r=await app.request('http://localhost/api/map/presence');assert.equal(r.status,503);assert.equal(r.headers.get('cache-control'),'no-store');const body=await r.json();assert.equal(body.status,status);assert(!JSON.stringify(body).includes('PRIVATE'));
  }
});
test('API authenticated production access still hides local-only fixtures',async()=>{
  const mapPresenceService=service(data(),{production:true});
  const app=createApp({config:readConfig({NODE_ENV:'production'}),auth:async()=>principal,mapPresenceService});
  const response=await app.request('http://localhost/api/map/presence');
  assert.equal(response.status,200);const result=await response.json();assert.equal(result.status,'ok');assert.equal(result.buildings[0].people.length,0);
});

test('table labels are returned verbatim without presentation inference or provenance disclosure',async()=>{
  for(const label of ['', '  ', 'Study group · 你好 🗽', '<img src=x onerror=alert(1)>', '🗽'.repeat(200)]){
    const result=await read(service(data([entry({label})])));
    assert.equal(result.buildings[0].people.length,1);
    assert.equal(result.buildings[0].people[0].label,label);
    const serialized=JSON.stringify(result);
    for(const internal of ['isDebug','source_id','source_url',MAP_DEBUG_SOURCE_ID,MAP_DEBUG_SOURCE_URL])assert(!serialized.includes(internal),internal);
  }
});
test('labels cannot grant source authorization or turn ordinary entries into local fixtures',async()=>{
  for(const label of ['Test','Test location · UI preview','']){
    const native=data([entry({label,source_id:sid,source_url:'https://discord.com/channels/1/2/3'})]);
    assert.deepEqual((await read(service(native))).buildings[0].people,[]);
    assert.deepEqual((await read(service(native,{authorizeSource:async()=>true}),{id:'member',allowedSourceIds:[]})).buildings[0].people,[]);
    const allowed=await read(service(native,{authorizeSource:async()=>true}));
    assert.equal(allowed.buildings[0].people[0].label,label);
    assert.deepEqual((await read(service(data([entry({label})]),{production:true}))).buildings[0].people,[]);
  }
});

test('upcoming locations require future planned validity and the same current-source authorization',async()=>{
  const future=entry({source_id:sid,source_url:'https://example.com/plan',valid_from:'2026-10-18T20:00:00Z',expires_at:'2026-10-18T21:00:00Z',label:'Project meeting'});
  const value={buildings:[building([entry()]),building([future],{id:'nyu-kimmel-center',name:'Kimmel Center'})],people:[person()]};
  assert.deepEqual((await read(service(value))).upcoming,[]);
  assert.deepEqual((await read(service(value,{authorizeSource:async()=>false}))).upcoming,[]);
  assert.deepEqual((await read(service(value,{authorizeSource:async()=>true}),{id:'member',allowedSourceIds:[]})).upcoming,[]);
  const result=await read(service(value,{authorizeSource:async()=>true}));
  assert.equal(result.buildings[1].people.length,0);
  assert.deepEqual(result.upcoming,[{personId:pid,buildingId:'nyu-kimmel-center',buildingName:'Kimmel Center',label:'Project meeting',validFrom:'2026-10-18T20:00:00.000Z',expiresAt:'2026-10-18T21:00:00.000Z'}]);
  assert(!JSON.stringify(result.upcoming).includes('source'));assert(!JSON.stringify(result.upcoming).includes('PRIVATE'));
  for(const patch of [{status:'self_reported'},{expires_at:at},{valid_from:'invalid'},{label:null}]){
    const malformed={...value,buildings:[building([{...future,...patch}],{id:'nyu-kimmel-center'})]};
    assert.deepEqual((await read(service(malformed,{authorizeSource:async()=>true}))).upcoming,[]);
  }
});

test('explicit local person plans remain limited to the exact person, buildings, provenance and local principal',async()=>{
  const localEntry=entry({person_id:MAP_LOCAL_PLAN_PERSON_ID,source_id:MAP_LOCAL_PLAN_SOURCE_ID,source_url:MAP_LOCAL_PLAN_SOURCE_URL,valid_from:'2026-10-18T04:00:00Z',expires_at:'2026-10-19T04:00:00Z',label:''});
  const localData={buildings:[building([localEntry],{id:'courant-institute',name:'Courant Institute'})],people:[person({id:MAP_LOCAL_PLAN_PERSON_ID})]};
  const current=await read(service(localData));
  assert.equal(current.upcoming.length,1);
  assert.equal(current.buildings[0].people.length,0,'Tomorrow plans must not populate today map avatars');
  const tomorrow=await read(service(localData,{now:()=>new Date('2026-10-18T16:00:00Z')}));
  assert.equal(tomorrow.buildings[0].people.length,1);
  assert.equal(tomorrow.upcoming.length,0);
  assert.deepEqual((await read(service(localData,{production:true}))).upcoming,[]);
  assert.deepEqual((await read(service(localData),{id:'member',allowedSourceIds:[MAP_LOCAL_PLAN_SOURCE_ID]})).upcoming,[]);
  for(const patch of [{source_id:sid},{source_url:'https://example.com/not-the-plan'},{status:'self_reported'}]){
    const changed={...localData,buildings:[building([{...localEntry,...patch}],{id:'courant-institute'})]};
    assert.deepEqual((await read(service(changed,{authorizeSource:async()=>true}))).upcoming,[]);
  }
  assert.deepEqual((await read(service({...localData,buildings:[building([localEntry],{id:'nyu-kimmel-center'})]}))).upcoming,[]);
  assert.deepEqual((await read(service({buildings:[building([{...localEntry,person_id:pid}],{id:'courant-institute'})],people:[person()]}))).upcoming,[]);
});

test('building events require current source policy, omit expired/cancelled entries and expose only safe fields',async()=>{
  const event={id:'event-1',title:'Synthetic session',starts_at:'2026-10-18T18:00:00Z',ends_at:'2026-10-18T19:00:00Z',time_zone:'America/New_York',all_day:false,status:'confirmed',source_id:sid,source_url:'https://example.com/source',url:'https://example.com/event',description:'Original event text',location:'Room 101'};
  const value=events=>({buildings:[building([],{scheduled_events:events})],people:[]});
  for(const options of [{},{authorizeSource:async()=>false},{authorizeSource:async()=>1}])assert.deepEqual((await read(service(value([event]),options))).buildings[0].events,[]);
  assert.deepEqual((await read(service(value([event]),{authorizeSource:async()=>true}),{id:'member',allowedSourceIds:[]})).buildings[0].events,[]);
  let calls=0;
  const result=await read(service(value([{...event,id:'later',starts_at:'2026-10-19T18:00:00Z',ends_at:'2026-10-19T19:00:00Z'},event,event,{...event,id:'cancelled',status:'cancelled'},{...event,id:'expired',ends_at:at,starts_at:'2026-10-17T19:00:00Z'}]),{authorizeSource:async args=>{calls++;assert.equal(args.sourceId,sid);assert.equal(args.buildingId,'bobst-library');return true;}}));
  assert.equal(calls,2);assert.deepEqual(result.buildings[0].people,[]);
  assert.deepEqual(result.buildings[0].events.map(event=>event.id),['event-1','later']);
  assert.deepEqual(result.buildings[0].events[0],{id:'event-1',title:'Synthetic session',startsAt:'2026-10-18T18:00:00.000Z',endsAt:'2026-10-18T19:00:00.000Z',timeZone:'America/New_York',allDay:false,status:'confirmed',description:'Original event text',location:'Room 101',url:'https://example.com/event'});
  assert(!JSON.stringify(result).includes('source_id'));assert(!JSON.stringify(result).includes('https://example.com/source'));
  for(const patch of [{url:'javascript:alert(1)'},{source_url:'https://user:secret@example.com/source'},{all_day:'false'},{description:{}},{time_zone:'Invalid/Zone'},{starts_at:'invalid'},{title:''}])assert.deepEqual((await read(service(value([{...event,...patch}]),{authorizeSource:async()=>true}))).buildings[0].events,[]);
  const localEvent={...event,source_id:MAP_DEBUG_SOURCE_ID,source_url:MAP_DEBUG_SOURCE_URL};
  assert.deepEqual((await read(service(value([localEvent])))).buildings[0].events,[],'No person fixture bypass for events');
  for(const events of [{},Array(201).fill(event)])assert.equal((await read(service(value(events)))).status,'unavailable');
  assert.deepEqual(await read(service(value([event]),{authorizeSource:async()=>{throw Error('PRIVATE');}})),{status:'unavailable',buildings:[]});
});

test('explicit event fixtures are restricted to labeled Bobst events in local development',async()=>{
  const event={id:'bobst-ui-debug-v1-test',title:'[UI TEST] Synthetic event',starts_at:'2026-10-18T18:00:00Z',ends_at:'2026-10-18T19:00:00Z',time_zone:'America/New_York',all_day:false,status:'confirmed',source_id:MAP_DEBUG_EVENTS_SOURCE_ID,source_url:MAP_DEBUG_EVENTS_SOURCE_URL};
  const value=(patch={},id='bobst-library')=>({buildings:[building([],{id,scheduled_events:[{...event,...patch}]})],people:[]});
  assert.equal((await read(service(value()))).buildings[0].events.length,1);
  assert.deepEqual((await read(service(value(),{production:true}))).buildings[0].events,[]);
  assert.deepEqual((await read(service(value()),{id:'member',allowedSourceIds:[MAP_DEBUG_EVENTS_SOURCE_ID]})).buildings[0].events,[]);
  assert.deepEqual((await read(service(value({},'stern-school-of-business')))).buildings[0].events,[]);
  for(const patch of [{source_id:sid},{source_url:'https://example.com/source'},{id:'ordinary-event'},{title:'Real-looking event'},{status:'cancelled'}]) {
    assert.deepEqual((await read(service(value(patch),{authorizeSource:async()=>true}))).buildings[0].events,[]);
  }
});

test('event attendees resolve only authorized events and trackable safe identities without creating presence',async()=>{
  const unknown='33333333-3333-4333-8333-333333333333';
  const event={id:'bobst-ui-debug-v1-attendees',title:'[UI TEST] Attendees',starts_at:'2026-10-18T18:00:00Z',ends_at:'2026-10-18T19:00:00Z',time_zone:'America/New_York',all_day:false,status:'confirmed',source_id:MAP_DEBUG_EVENTS_SOURCE_ID,source_url:MAP_DEBUG_EVENTS_SOURCE_URL,attendee_ids:[pid,unknown]};
  const value=(patch={},people=[person()])=>({buildings:[building([],{scheduled_events:[{...event,...patch}]})],people});
  const result=await read(service(value()));
  assert.deepEqual(result.buildings[0].events[0].attendees,[{id:pid,displayName:'Synthetic Person',avatarUrl:'/assets/avatars/Synthetic%20Person.png'}]);
  assert.deepEqual(result.buildings[0].people,[]);
  assert(!JSON.stringify(result).includes('PRIVATE'));
  assert.deepEqual((await read(service(value({},[person({is_trackable:false})])))).buildings[0].events[0].attendees,[]);
  assert.deepEqual((await read(service(value(),{production:true}))).buildings[0].events,[]);
  for(const attendee_ids of [null,{},[pid,pid.toUpperCase()],['invalid'],Array(501).fill(pid)])assert.deepEqual((await read(service(value({attendee_ids})))).buildings[0].events,[]);
});
