import test from 'node:test';
import assert from 'node:assert/strict';
import {createMapPresenceService,createMapPresenceStore,MAP_DEBUG_SOURCE_ID,MAP_DEBUG_SOURCE_URL,MAP_LOCAL_PLAN_SOURCE_ID,MAP_LOCAL_PLAN_SOURCE_URL,MAP_LOCAL_PLAN_PERSON_ID,MAP_DEBUG_EVENTS_SOURCE_ID,MAP_DEBUG_EVENTS_SOURCE_URL} from '../server/map/presence.js';
import {createMapSourceAuthorizer} from '../server/map/source-access.js';
import {createApp} from '../server/app.js';
import {readConfig} from '../server/config.js';
const at='2026-10-18T16:00:00.000Z',pid='11111111-1111-1111-1111-111111111111',other='11111111-1111-1111-1111-111111111112',sid='22222222-2222-2222-2222-222222222222',eid='33333333-3333-3333-3333-333333333333';
const eventTypes=()=>['study','meeting','event','social','other'].map((code,index)=>({code,name:code[0].toUpperCase()+code.slice(1),description:'Synthetic type',icon_key:code,sort_order:(index+1)*10}));
const principal={id:'local-development',allowedSourceIds:[sid]};
const person=(patch={})=>({id:pid,display_name:'Synthetic Person',avatar_url:'/assets/avatars/Synthetic%20Person.png',is_trackable:true,email:'PRIVATE_EMAIL',discord_user_id:'PRIVATE_DISCORD',...patch});
const event=(patch={})=>({id:eid,name:'Studying',notes:'Original activity',kind:'personal_plan',type_id:'other',status:'confirmed',time_kind:'timed',starts_at:'2026-10-18T15:00:00Z',ends_at:'2026-10-18T17:00:00Z',starts_on:null,ends_on:null,time_zone:'America/New_York',source_id:MAP_DEBUG_SOURCE_ID,source_url:MAP_DEBUG_SOURCE_URL,source_record_id:'synthetic-event',url:null,reported_at:'2026-10-18T15:00:00Z',created_at:at,updated_at:at,...patch});
const participant=(patch={})=>({event_id:eid,person_id:pid,attendance_status:'going',presence_basis:'planned',label:'Studying',starts_at:null,ends_at:null,source_id:MAP_DEBUG_SOURCE_ID,source_url:MAP_DEBUG_SOURCE_URL,reported_at:'2026-10-18T15:00:00Z',...patch});
const data=(ep={},pp={},extra={})=>({event_types:eventTypes(),buildings:[{id:'bobst-library',name:'Bobst Library'}],people:[person()],events:[event(ep)],event_buildings:[{event_id:eid,building_id:'bobst-library',location_notes:'Room 101'}],event_people:[participant(pp)],...extra});
const service=(value=data(),options={})=>createMapPresenceService({store:{configured:true,read:async()=>value},production:false,now:()=>new Date(at),...options,...(typeof options.authorizeSource==='function'?{authorizeSource:Object.assign(options.authorizeSource,{localOnly:true})}:{})});
const read=(s,p=principal)=>s.read({principal:p});

test('normalized projection preserves safe UI fields and no provenance or provider identities',async()=>{
  const r=await read(service());assert.equal(r.status,'ok');assert.equal(r.observedAt,at);
  assert.deepEqual(r.buildings[0].people,[{id:pid,displayName:'Synthetic Person',avatarUrl:'/assets/avatars/Synthetic%20Person.png',status:'planned',label:'Studying',validFrom:'2026-10-18T15:00:00.000Z',expiresAt:'2026-10-18T17:00:00.000Z'}]);
  assert.equal(r.buildings[0].events[0].title,'Studying');assert.equal(r.buildings[0].events[0].attendees[0].id,pid);for(const key of ['PRIVATE','source_id','source_url',MAP_DEBUG_SOURCE_ID,MAP_DEBUG_SOURCE_URL])assert(!JSON.stringify(r).includes(key));
});
test('authentication precedes storage; legacy JSON never serves as fallback',async()=>{
  let calls=0;const s=service(data(),{store:{configured:true,read:async()=>{calls++;return data();}}});
  for(const principal of [null,{}, {id:'member'}, {id:'',allowedSourceIds:[]}])assert.equal((await s.read({principal})).status,'forbidden');assert.equal(calls,0);
  assert.equal((await read(service({buildings:[{id:'bobst-library',name:'Bobst',people_here:[]}],people:[]}))).status,'unavailable');
});
test('event and participation provenance independently require allowlist and positive current policy',async()=>{
  const ep={source_id:sid,source_url:'https://example.com/event'},pp={source_id:sid,source_url:'https://example.com/person'};
  for(const authorizeSource of [()=>false,()=>1])assert.deepEqual((await read(service(data(ep,pp),{authorizeSource}))).buildings[0].people,[]);
  for(const blocked of ['event','person'])assert.deepEqual((await read(service(data(ep,pp),{authorizeSource: a=>!a.sourceUrl.endsWith(blocked)}))).buildings[0].people,[]);
  let calls=0;const s=service(data(ep,pp),{authorizeSource: a=>{calls++;assert.equal(a.principal,principal);assert.equal(a.buildingId,'bobst-library');assert(a.signal instanceof AbortSignal);return true;}});
  assert.equal((await read(s)).buildings[0].people.length,1);assert.equal(calls,2);assert.equal((await read(s,{id:'member',allowedSourceIds:[]})).buildings[0].people.length,0);
});
test('all people display at all event buildings and same-building overlaps deduplicate deterministically',async()=>{
  const second='33333333-3333-3333-3333-333333333334',value=data({}, {}, {
    buildings:[{id:'bobst-library',name:'Bobst'},{id:'courant-institute',name:'Courant'}],people:[person(),person({id:other})],events:[event(),event({id:second,name:'Project',ends_at:'2026-10-18T16:30:00Z',reported_at:'2026-10-18T15:30:00Z'})],
    event_buildings:[{event_id:eid,building_id:'bobst-library',location_notes:''},{event_id:eid,building_id:'courant-institute',location_notes:''},{event_id:second,building_id:'bobst-library',location_notes:''}],event_people:[participant(),participant({person_id:other}),participant({event_id:second,label:'Working on project'})]});
  for(const e of [...value.events,...value.event_people])Object.assign(e,{source_id:sid,source_url:'https://example.com/evidence'});
  const r=await read(service(value,{authorizeSource:()=>true}));assert.deepEqual(r.buildings.map(b=>b.people.length),[2,2]);assert.equal(r.buildings[0].people[0].label,'Working on project');assert.equal(r.buildings[0].people[0].activities.length,2);assert.equal(r.buildings[0].people[0].expiresAt,'2026-10-18T17:00:00.000Z');
  assert.deepEqual(await read(service({...value,events:[...value.events].reverse()},{authorizeSource:()=>true})),r);
});
test('overlap captions choose newest authorized active nonblank label without inferring from event names',async()=>{
  const newerId='33333333-3333-3333-3333-333333333334';
  const overlap=(newLabel='',oldLabel='  working on flock@nyu  ',oldEvent={},oldParticipant={})=>data({}, {}, {
    events:[event({source_id:sid,source_url:'https://example.com/allowed',...oldEvent}),event({id:newerId,kind:'scheduled_event',name:'Open coworking day',reported_at:'2026-10-18T15:30:00Z',source_id:sid,source_url:'https://example.com/allowed'})],
    event_buildings:[{event_id:eid,building_id:'bobst-library',location_notes:''},{event_id:newerId,building_id:'bobst-library',location_notes:''}],
    event_people:[participant({label:oldLabel,source_id:sid,source_url:'https://example.com/allowed',...oldParticipant}),participant({event_id:newerId,label:newLabel,reported_at:'2026-10-18T15:30:00Z',source_id:sid,source_url:'https://example.com/allowed'})],
  });
  const project=async value=>read(service(value,{authorizeSource: a=>!a.sourceUrl.endsWith('/denied')}));
  for(const newestBlank of ['', ' \t\n ']) {
    const result=await project(overlap(newestBlank));
    assert.equal(result.buildings[0].people[0].label,'  working on flock@nyu  ','Preserve the supplied nonblank activity verbatim');
    assert.deepEqual(result.buildings[0].people[0].activities.map(a=>a.label),[newestBlank,'  working on flock@nyu  ']);
    assert.deepEqual(await project({...overlap(newestBlank),events:[...overlap(newestBlank).events].reverse()}),result,'Caption does not depend on storage row order');
  }
  assert.equal((await project(overlap('Newer explicit activity','Older explicit activity'))).buildings[0].people[0].label,'Newer explicit activity');
  const independentReport=overlap('Earlier participation label','  Latest participant activity  ',{}, {reported_at:'2026-10-18T15:45:00Z'});
  const ranked=await project(independentReport);
  assert.equal(ranked.buildings[0].people[0].label,'  Latest participant activity  ','Participation chronology is independent of event-report order');
  assert.deepEqual(await project({...independentReport,events:[...independentReport.events].reverse(),event_people:[...independentReport.event_people].reverse()}),ranked);
  for(const internal of ['reported_at','labelTimes','labelRank','2026-10-18T15:45:00Z'])assert(!JSON.stringify(ranked).includes(internal),'Caption ranking remains private');
  assert.equal((await project(overlap('Stable tie winner','Other tied label',{}, {reported_at:'2026-10-18T15:30:00Z'}))).buildings[0].people[0].label,'Stable tie winner','Equal participation times retain stable event ordering');
  for(const [oldEvent,oldParticipant] of [[{}, {source_url:'https://example.com/denied'}],[{source_url:'https://example.com/denied'},{}],[{ends_at:at},{}],[{starts_at:'2026-10-18T17:00:00Z',ends_at:'2026-10-18T19:00:00Z'},{}],[{}, {starts_at:'2026-10-18T16:30:00Z'}]]) {
    const result=await project(overlap('','Hidden activity',oldEvent,oldParticipant));
    assert.equal(result.buildings[0].people[0].label,'','Denied, expired and future activity cannot fill a current caption');
  }
  for(const labels of [['',''],[' \t ','\n ']])assert.equal((await project(overlap(...labels))).buildings[0].people[0].label,labels[0],'All blank labels stay blank without copying an event name');
});
test('future participation is upcoming only; exact start is active and exact end expired',async()=>{
  const r=await read(service(data({starts_at:'2026-10-18T17:00:00Z',ends_at:'2026-10-18T19:00:00Z'})));assert.equal(r.buildings[0].people.length,0);assert.equal(r.upcoming.length,1);
  assert.equal((await read(service(data({starts_at:at})))).buildings[0].people.length,1);assert.equal((await read(service(data({ends_at:at})))).buildings[0].people.length,0);
  const individual=await read(service(data({}, {starts_at:'2026-10-18T16:30:00Z',ends_at:'2026-10-18T16:45:00Z'})));assert.equal(individual.upcoming[0].validFrom,'2026-10-18T16:30:00.000Z');
});
test('all-day dates respect named timezone and spring/fall daylight-saving changes',async()=>{
  for(const [start,end,from,until] of [['2026-11-01','2026-11-02','2026-11-01T04:00:00.000Z','2026-11-02T05:00:00.000Z'],['2026-03-08','2026-03-09','2026-03-08T05:00:00.000Z','2026-03-09T04:00:00.000Z']]){
    const value=data({time_kind:'all_day',starts_at:null,ends_at:null,starts_on:start,ends_on:end}),r=await read(service(value,{now:()=>new Date(from)}));assert.equal(r.buildings[0].people[0].validFrom,from);assert.equal(r.buildings[0].people[0].expiresAt,until);assert.equal((await read(service(value,{now:()=>new Date(until)}))).buildings[0].people.length,0);
  }
});
test('unknown times, cancellations, tentative participation and malformed intervals never populate avatars',async()=>{
  for(const ep of [{status:'cancelled'},{status:'superseded'},{status:'tentative'},{time_kind:'unknown',starts_at:null,ends_at:null},{starts_at:'2026-02-30T12:00:00Z'},{time_zone:'Invalid/Zone'}])assert.equal((await read(service(data(ep)))).buildings[0].people.length,0);
  for(const pp of [{attendance_status:'declined'},{attendance_status:'tentative'},{starts_at:'2026-10-18T14:00:00Z'},{ends_at:'2026-10-18T18:00:00Z'},{label:null}])assert.equal((await read(service(data({},pp)))).buildings[0].people.length,0);
  assert.equal((await read(service(data({}, {}, {people:[person({is_trackable:false})]})))).buildings[0].people.length,0);
});
test('scheduled events and attendees have separate authorization; active confirmed attendance places avatars',async()=>{
  const ep={kind:'scheduled_event',source_id:sid,source_url:'https://example.com/event'},pp={source_id:sid,source_url:'https://example.com/person'};
  const r=await read(service(data(ep,pp),{authorizeSource:()=>true}));assert.equal(r.buildings[0].events.length,1);assert.equal(r.buildings[0].events[0].location,'Room 101');assert.equal(r.buildings[0].events[0].attendees.length,1);assert.equal(r.buildings[0].people.length,1);
  const denied=await read(service(data(ep,pp),{authorizeSource: a=>a.sourceUrl.endsWith('event')}));assert.equal(denied.buildings[0].events.length,1);assert.deepEqual(denied.buildings[0].events[0].attendees,[]);assert.deepEqual(denied.buildings[0].people,[]);
  const tentative=await read(service(data({...ep,status:'tentative'},pp),{authorizeSource:()=>true}));assert.equal(tentative.buildings[0].events.length,1);assert.equal(tentative.buildings[0].people.length,0);
});
test('building card lists every normalized event kind with active or future known windows',async()=>{
  for(const kind of ['presence','personal_plan','scheduled_event'])for(const future of [false,true]) {
    const ep={kind,name:'Stored building activity',source_id:sid,source_url:'https://example.com/event',...(future?{starts_at:'2026-10-18T17:00:00Z',ends_at:'2026-10-18T19:00:00Z'}:{})};
    const value=data(ep,{source_id:sid,source_url:'https://example.com/person',label:''},{buildings:[{id:'stern-school-of-business',name:'Stern School of Business'}],event_buildings:[{event_id:eid,building_id:'stern-school-of-business',location_notes:''}]});
    const result=await read(service(value,{authorizeSource:()=>true}));assert.equal(result.buildings[0].events.length,1);assert.equal(result.buildings[0].events[0].title,'Stored building activity');assert.equal(result.buildings[0].events[0].attendees[0].id,pid);assert.equal(result.buildings[0].events[0].attendees[0].avatarUrl,person().avatar_url);
    assert.equal(result.buildings[0].people.length,future?0:1);assert.equal(result.upcoming.length,future?1:0);
    const tentative=await read(service({...value,events:[{...value.events[0],status:'tentative'}]},{authorizeSource:()=>true}));assert.equal(tentative.buildings[0].events.length,1);assert.equal(tentative.buildings[0].people.length,0);
  }
});
test('building event types come only from validated catalogue metadata for each supported classification',async()=>{
  for(const type_id of ['study','meeting','event','social','other']) {
    const result=await read(service(data({type_id})));const type=eventTypes().find(t=>t.code===type_id);
    assert.deepEqual(result.buildings[0].events[0].type,{code:type.code,name:type.name,iconKey:type.icon_key});
    assert.deepEqual(Object.keys(result.buildings[0].events[0].type).sort(),['code','iconKey','name']);
  }
  const invalid=data({type_id:'invented'});assert.equal((await read(service(invalid))).status,'unavailable');
  const unsafe=data({}, {}, {event_types:eventTypes().map(t=>t.code==='other'?{...t,icon_key:'https://example.com/private.svg'}:t)});assert.equal((await read(service(unsafe))).status,'unavailable');
});
test('personal activities require a current or future authorized participant before revealing titles or portraits',async()=>{
  for(const kind of ['presence','personal_plan']) {
    const base=data({kind,name:'Private stored activity',source_id:sid,source_url:'https://example.com/event'},{source_id:sid,source_url:'https://example.com/person'});
    const cases=[{...base,event_people:[]},{...base,event_people:[{...base.event_people[0],source_url:'https://example.com/denied'}]},{...base,event_people:[{...base.event_people[0],ends_at:at}]},{...base,event_people:[{...base.event_people[0],attendance_status:'declined'}]},{...base,people:[person({is_trackable:false})]}];
    for(const value of cases) {
      const result=await read(service(value,{authorizeSource: a=>!a.sourceUrl.endsWith('/denied')}));assert.deepEqual(result.buildings[0].events,[]);assert(!JSON.stringify(result).includes('Private stored activity'));assert(!JSON.stringify(result).includes(person().avatar_url));
    }
    for(const patch of [{status:'cancelled'},{status:'superseded'},{ends_at:at},{time_kind:'unknown',starts_at:null,ends_at:null}])assert.deepEqual((await read(service({...base,events:[{...base.events[0],...patch}]},{authorizeSource:()=>true}))).buildings[0].events,[]);
  }
  const emptyScheduled=data({kind:'scheduled_event',source_id:sid,source_url:'https://example.com/event'}, {}, {event_people:[]});assert.equal((await read(service(emptyScheduled,{authorizeSource:()=>true}))).buildings[0].events.length,1,'Scheduled events may still have no attendees');
});
test('local debug bypass is exact and cannot reach production, another principal, building or reported participation',async()=>{
  assert.equal((await read(service(data(),{production:true}))).buildings[0].people.length,0);assert.equal((await read(service(),{id:'member',allowedSourceIds:[MAP_DEBUG_SOURCE_ID]})).buildings[0].people.length,0);
  for(const ep of [{source_id:sid},{source_url:'https://example.com/forged'},{kind:'scheduled_event'}])assert.equal((await read(service(data(ep),{authorizeSource:()=>true}))).buildings[0].people.length,0);
  assert.equal((await read(service(data({}, {presence_basis:'reported'})))).buildings[0].people.length,0);
  const value=data({}, {},{buildings:[{id:'courant-institute',name:'Courant'}],event_buildings:[{event_id:eid,building_id:'courant-institute',location_notes:''}]});assert.equal((await read(service(value))).buildings[0].people.length,0);
});
test('local owner plans retain exact owner and location scope',async()=>{
  const ep={source_id:MAP_LOCAL_PLAN_SOURCE_ID,source_url:MAP_LOCAL_PLAN_SOURCE_URL},pp={source_id:MAP_LOCAL_PLAN_SOURCE_ID,source_url:MAP_LOCAL_PLAN_SOURCE_URL,person_id:MAP_LOCAL_PLAN_PERSON_ID};
  const value=data(ep,pp,{people:[person({id:MAP_LOCAL_PLAN_PERSON_ID})],buildings:[{id:'courant-institute',name:'Courant'}],event_buildings:[{event_id:eid,building_id:'courant-institute',location_notes:''}]});assert.equal((await read(service(value))).buildings[0].people.length,1);
  assert.equal((await read(service({...value,people:[person()],event_people:[{...value.event_people[0],person_id:pid}]}))).buildings[0].people.length,0);
});
test('Bobst event fixtures require legacy stable source-record prefix and display-name prefix',async()=>{
  const ep={kind:'scheduled_event',name:'[UI TEST] Synthetic',source_record_id:'bobst-ui-debug-v1-test',source_id:MAP_DEBUG_EVENTS_SOURCE_ID,source_url:MAP_DEBUG_EVENTS_SOURCE_URL},pp={source_id:MAP_DEBUG_EVENTS_SOURCE_ID,source_url:MAP_DEBUG_EVENTS_SOURCE_URL};
  assert.equal((await read(service(data(ep,pp)))).buildings[0].events.length,1);assert.equal((await read(service(data(ep,pp)))).buildings[0].people.length,1);
  for(const patch of [{name:'Ordinary event'},{source_record_id:'ordinary'},{source_url:'https://example.com/forged'}])assert.equal((await read(service(data({...ep,...patch},pp),{authorizeSource:()=>true}))).buildings[0].events.length,0);
  assert.equal((await read(service(data(ep,pp),{production:true}))).buildings[0].events.length,0);
});
test('labels remain exact plain text; unsafe portrait paths use initials',async()=>{
  for(const label of ['', '<img src=x onerror=alert(1)>','🗽'.repeat(200)])assert.equal((await read(service(data({}, {label})))).buildings[0].people[0].label,label);
  for(const avatar_url of ['https://example.com/private.png','/assets/avatars/%2fprivate.png','/assets/avatars/%00private.png'])assert.equal((await read(service(data({}, {},{people:[person({avatar_url})]})))).buildings[0].people[0].avatarUrl,null);
});
test('snapshot duplicates, bounds, adapter errors and invalid clocks fail closed',async()=>{
  for(const value of [{},data({}, {}, {people:[person(),person()]}),data({}, {}, {events:Array(2001).fill(event())}),data({}, {},{event_people:Array(20001).fill(participant())})])assert.equal((await read(service(value))).status,'unavailable');
  assert.equal((await read(service(data(),{now:()=>new Date('invalid')}))).status,'unavailable');assert.equal((await read(service(data(),{store:{configured:false}}))).status,'not_configured');
  assert.equal((await read(service(data({source_id:sid,source_url:'https://example.com/source'}),{authorizeSource:()=>{throw Error('PRIVATE');}}))).status,'unavailable');
});
test('large relationship expansion fails unavailable instead of silently truncating upcoming or event copies',async()=>{
  const buildings=Array.from({length:100},(_,i)=>({id:`building-${i}`,name:`Building ${i}`}));
  const events=Array.from({length:2},(_,i)=>event({id:`33333333-3333-3333-3333-${String(i).padStart(12,'0')}`,source_id:sid,source_url:'https://example.com/event',starts_at:'2026-10-19T15:00:00Z',ends_at:'2026-10-19T17:00:00Z'}));
  const people=Array.from({length:251},(_,i)=>person({id:`11111111-1111-1111-1111-${String(i).padStart(12,'0')}`}));
  const value={event_types:eventTypes(),buildings,people,events,event_buildings:events.flatMap(e=>buildings.map(b=>({event_id:e.id,building_id:b.id,location_notes:''}))),event_people:events.flatMap(e=>people.map(p=>participant({event_id:e.id,person_id:p.id,source_id:sid,source_url:'https://example.com/person'})))};
  assert.equal((await read(service(value,{authorizeSource:()=>true}))).status,'unavailable');
  const expanded=Array.from({length:50},(_,i)=>event({id:`33333333-3333-3333-3333-${String(i).padStart(12,'0')}`,kind:'scheduled_event',notes:'x'.repeat(4000),source_id:sid,source_url:'https://example.com/event'}));
  const eventCopies={...value,events:expanded,event_people:[],event_buildings:expanded.flatMap(e=>buildings.map(b=>({event_id:e.id,building_id:b.id,location_notes:''})))};
  assert.equal((await read(service(eventCopies,{authorizeSource:()=>true}))).status,'unavailable');
});
test('store reads one fixed-origin RPC with service-only headers and no legacy operations',async()=>{
  const calls=[],store=createMapPresenceStore({env:{SUPABASE_URL:'https://synthetic.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'PRIVATE_KEY'},fetchImpl:async(url,options)=>{calls.push({url,options});return Response.json(data());}});assert.deepEqual(await store.read({observedAt:at}),data());assert.equal(calls.length,1);assert.equal(calls[0].url,'https://synthetic.supabase.co/rest/v1/rpc/map_read_events');assert.equal(calls[0].options.method,'POST');assert.deepEqual(JSON.parse(calls[0].options.body),{p_at:at});assert.equal(calls[0].options.redirect,'error');assert.equal(calls[0].options.headers.Authorization,'Bearer PRIVATE_KEY');
});
test('store rejects unsafe configuration, oversized responses, hung streams and cancelled requests',async()=>{
  const env={SUPABASE_URL:'https://synthetic.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'PRIVATE_KEY'};
  for(const SUPABASE_URL of ['http://synthetic.supabase.co','https://u:p@synthetic.supabase.co','https://synthetic.supabase.co/path'])assert.equal(createMapPresenceStore({env:{...env,SUPABASE_URL}}).configured,false);
  for(const fetchImpl of [async()=>new Response('{}',{status:403}),async()=>new Response('{}',{headers:{'content-length':'16777217'}}),async()=>Response.json({...data(),events:Array(2001).fill(event())}),()=>new Promise(()=>{}),async()=>new Response(new ReadableStream({start(){}}))])await assert.rejects(createMapPresenceStore({env,fetchImpl,timeoutMs:50}).read({observedAt:at}));
  let calls=0;const controller=new AbortController();controller.abort();await assert.rejects(createMapPresenceStore({env,fetchImpl:async()=>{calls++;return Response.json(data());}}).read({observedAt:at,signal:controller.signal}));assert.equal(calls,0);
  assert.equal((await read(service(data(),{store:{configured:true,read:()=>new Promise(()=>{})},timeoutMs:50}))).status,'unavailable');
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

test('browser projection uses one DB snapshot despite unavailable providers and applies current local grants',async()=>{
  const calendarId='fixed@example.com',sourceUrl=`https://calendar.google.com/calendar/event?eid=${Buffer.from(`event001 ${calendarId}`).toString('base64url')}`;
  const value=data({kind:'scheduled_event',source_id:sid,source_url:sourceUrl,source_record_id:'event001'},{source_id:sid,source_url:sourceUrl});
  const actor={id:'member',allowedSourceIds:[sid],googleAccess:true};let reads=0,providerCalls=0;
  const store={configured:true,read:async()=>{reads++;return structuredClone(value);}},authorizeSource=createMapSourceAuthorizer({calendarSourceId:sid,calendarClient:{configured:false,calendarId,readEvent:()=>{providerCalls++;throw Error('No source read');}}});
  const projected=createMapPresenceService({store,authorizeSource,production:true,now:()=>new Date(at)});
  assert.equal((await projected.read({principal:actor})).buildings[0].events[0].attendees.length,1);assert.equal(reads,1);assert.equal(providerCalls,0);
  actor.allowedSourceIds=[];assert.deepEqual((await projected.read({principal:actor})).buildings[0].events,[]);assert.equal(reads,2);assert.equal(providerCalls,0);
});
