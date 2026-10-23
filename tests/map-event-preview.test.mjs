import test from 'node:test';
import assert from 'node:assert/strict';
import {createMapPresenceService,MAP_DEBUG_EVENTS_SOURCE_ID,MAP_DEBUG_EVENTS_SOURCE_URL} from '../server/map/presence.js';
import {createMapEventService} from '../server/map/events.js';
import {createMapSourceAuthorizer} from '../server/map/source-access.js';
import {GO_GREEK_EVENT_PREVIEW as F,authorizeGoGreekEventPreview,isGoGreekPreviewProvenance} from '../server/map/event-preview.js';

const at='2026-10-21T22:00:00.000Z',normalSource='22222222-2222-4222-8222-222222222222',personId='11111111-1111-4111-8111-111111111111';
const types=()=>['study','meeting','event','social','other'].map((code,i)=>({code,name:code,description:'Synthetic type',icon_key:code,sort_order:(i+1)*10}));
const event=(patch={})=>({id:F.eventId,name:F.name,notes:'Synthetic UI preview',kind:F.kind,type_id:F.typeId,status:F.status,time_kind:F.timeKind,starts_at:'2026-10-21T21:30:00Z',ends_at:'2026-10-21T22:30:00Z',starts_on:null,ends_on:null,time_zone:'America/New_York',source_id:F.sourceId,source_url:F.sourceUrl,source_record_id:F.sourceRecordId,reported_at:'2026-10-21T21:30:00Z',url:null,...patch});
const fixture=(e=event(),building=F.buildingId,participants=[])=>({event_types:types(),buildings:[{id:building,name:building===F.buildingId?'Go Greek':'Bobst'}],people:participants.length?[{id:personId,display_name:'Synthetic Person',avatar_url:'/assets/avatars/Synthetic.png',is_trackable:true}]:[],events:[e],event_buildings:[{event_id:e.id,building_id:building,location_notes:''}],event_people:participants});
async function project(value,{production=false,principal={id:'local-development',allowedSourceIds:[F.sourceId,normalSource,MAP_DEBUG_EVENTS_SOURCE_ID]},authorizeSource=()=>true,now=at}={}) {
  let authorizerCalls=0;
  const result=await createMapPresenceService({store:{configured:true,read:async()=>value},production,now:()=>new Date(now),authorizeSource:Object.assign(args=>{authorizerCalls++;return authorizeSource(args);},{localOnly:true})}).read({principal});
  return {result,authorizerCalls};
}

test('Exact local Go Greek preview projects scheduled kind without source grants, people or provenance disclosure',async()=>{
  const {result,authorizerCalls}=await project(fixture(),{principal:{id:'local-development',allowedSourceIds:[]}});
  assert.equal(result.status,'ok');assert.equal(result.buildings[0].events.length,1);assert.equal(result.buildings[0].events[0].kind,'scheduled_event');assert.equal(result.buildings[0].events[0].title,F.name);
  assert.deepEqual(result.buildings[0].people,[]);assert.deepEqual(result.buildings[0].events[0].attendees,[]);assert.equal(authorizerCalls,0);
  for(const text of [F.sourceId,F.sourceUrl,F.sourceRecordId])assert(!JSON.stringify(result).includes(text));
});

test('Production, other principal/building and every altered preview identity or event field fail closed even with permissive normal authorizer',async()=>{
  const cases=[
    ['production',{}, {production:true}],['other principal',{}, {principal:{id:'member',allowedSourceIds:[F.sourceId]}}],
    ...Object.entries({id:'33333333-3333-4333-8333-333333333333',name:'Altered event',source_id:normalSource,source_url:'https://example.test/forged',source_record_id:'different',type_id:'social',status:'tentative',kind:'personal_plan',time_kind:'all_day'}).map(([key,value])=>[key,{[key]:value},{}]),
    ['duration',{ends_at:'2026-10-22T00:00:00Z'},{}],['timezone',{time_zone:'Invalid/Zone'},{}],['unordered',{ends_at:'2026-10-21T21:30:00Z'},{}],
  ];
  for(const [name,patch,options] of cases){const {result,authorizerCalls}=await project(fixture(event(patch)),options);assert.equal(result.status,'ok',name);assert.deepEqual(result.buildings[0].events,[],name);assert.deepEqual(result.buildings[0].people,[],name);assert.equal(authorizerCalls,0,name);}
  const other=await project(fixture(event(),'bobst-library'));assert.deepEqual(other.result.buildings[0].events,[]);assert.equal(other.authorizerCalls,0);
});

test('Reserved source ID or exact URL independently prevent ordinary authorizer fallback and attendance disclosure',async()=>{
  for(const patch of [{source_id:F.sourceId,source_url:'https://example.test/normal'},{source_id:normalSource,source_url:F.sourceUrl},{source_id:F.sourceId.toUpperCase(),source_url:'https://example.test/normal'}]) {
    assert.equal(isGoGreekPreviewProvenance(event(patch)),true);
    const {result,authorizerCalls}=await project(fixture(event(patch)),{production:true});assert.deepEqual(result.buildings[0].events,[]);assert.equal(authorizerCalls,0);
  }
  for(const source_id of [F.sourceId,normalSource]) {
    const participant={event_id:F.eventId,person_id:personId,presence_basis:'planned',attendance_status:'going',label:'Must stay private',starts_at:null,ends_at:null,source_id,source_url:source_id===F.sourceId?F.sourceUrl:'https://example.test/normal',reported_at:'2026-10-21T21:30:00Z'};
    const {result,authorizerCalls}=await project(fixture(event(),F.buildingId,[participant]));assert.equal(result.buildings[0].events.length,1);assert.deepEqual(result.buildings[0].events[0].attendees,[]);assert.deepEqual(result.buildings[0].people,[]);assert.equal(authorizerCalls,0);assert(!JSON.stringify(result).includes('Must stay private'));
  }
});

test('Guard itself requires exact event object/no participant and bounded finite strictly parsed interval',()=>{
  const e=event(),args={production:false,principal:{id:'local-development'},row:e,event:e,building:{id:F.buildingId}};
  assert.equal(authorizeGoGreekEventPreview(args),true);
  for(const patch of [{production:true},{production:undefined},{principal:{id:'another'}},{row:{...e}},{person:{id:personId}},{person:undefined,building:{id:'bobst-library'}}])assert.equal(authorizeGoGreekEventPreview({...args,...patch}),false);
  for(const patch of [{starts_at:'invalid'},{ends_at:'infinity'},{starts_at:'2026-02-30T12:00:00Z'},{starts_on:'2026-10-21'},{ends_at:e.starts_at},{ends_at:'2026-10-21T23:30:00.002Z'}]){const value=event(patch);assert.equal(authorizeGoGreekEventPreview({...args,row:value,event:value}),false);}
  const edge=event({ends_at:'2026-10-21T23:30:00.001Z'});assert.equal(authorizeGoGreekEventPreview({...args,row:edge,event:edge}),true);
});

test('Normal source authorization and existing Bobst debug scope remain unchanged; every event kind is projected truthfully',async()=>{
  const normal=event({source_id:normalSource,source_url:'https://example.test/normal',source_record_id:'normal',name:'Normal fixture'});
  for(const allowed of [false,true]){const {result,authorizerCalls}=await project(fixture(normal),{production:true,authorizeSource:()=>allowed});assert.equal(result.buildings[0].events.length,allowed?1:0);assert.equal(authorizerCalls,1);}
  const blocked=await project(fixture(normal),{production:true,principal:{id:'member',allowedSourceIds:[]}});assert.deepEqual(blocked.result.buildings[0].events,[]);assert.equal(blocked.authorizerCalls,0);
  const bobst=event({source_id:MAP_DEBUG_EVENTS_SOURCE_ID,source_url:MAP_DEBUG_EVENTS_SOURCE_URL,source_record_id:'bobst-ui-debug-v1-test',name:'[UI TEST] Existing Bobst fixture'});
  assert.equal((await project(fixture(bobst,'bobst-library'))).result.buildings[0].events.length,1);
  assert.deepEqual((await project(fixture(bobst,'bobst-library'),{production:true})).result.buildings[0].events,[]);
  for(const kind of ['scheduled_event','personal_plan','presence']) {
    const e={...normal,kind};const participant={event_id:e.id,person_id:personId,presence_basis:'planned',attendance_status:'going',label:'Synthetic',starts_at:null,ends_at:null,source_id:normalSource,source_url:e.source_url,reported_at:e.reported_at};
    const {result}=await project(fixture(e,F.buildingId,[participant]),{production:true});assert.equal(result.buildings[0].events[0].kind,kind);
  }
});

test('Preview expires exactly at end and never bypasses normal service source write boundaries',async()=>{
  assert.equal((await project(fixture(),{now:'2026-10-21T22:29:59.999Z'})).result.buildings[0].events.length,1);
  assert.deepEqual((await project(fixture(),{now:'2026-10-21T22:30:00.000Z'})).result.buildings[0].events,[]);
  const value=event();assert.equal(isGoGreekPreviewProvenance({...value,source_id:normalSource,source_url:'https://example.test/normal'}),false);
  const principal={id:'local-development',allowedSourceIds:[F.sourceId]},authorizeSource=createMapSourceAuthorizer({env:{}});
  assert.equal(await authorizeSource({principal,sourceId:F.sourceId,sourceUrl:F.sourceUrl}),false);
  let writes=0; const stored=fixture();
  const existing=createMapEventService({store:{configured:true,read:async()=>stored,upsert:async()=>{writes++;return {status:'applied'};}},authorizeSource,now:()=>new Date(at)});
  assert.deepEqual((await existing.read({principal})).events,[]);
  const empty={...stored,events:[],event_buildings:[]};const creating=createMapEventService({store:{configured:true,read:async()=>empty,upsert:async()=>{writes++;return {status:'applied'};}},authorizeSource,now:()=>new Date(at)});
  assert.deepEqual(await creating.upsert({principal,event:value,buildings:[{building_id:F.buildingId}],people:[]}),{status:'forbidden'});assert.equal(writes,0);
});
