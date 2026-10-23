import test from 'node:test';
import assert from 'node:assert/strict';
import {createMapEventStore,createMapEventService} from '../server/map/events.js';
const secret='PRIVATE_MAP_SOURCE_BODY_TOKEN_OR_EXCEPTION';
const sourceId='22222222-2222-2222-2222-222222222222';
const principal={id:'operator',allowedSourceIds:[sourceId]};
const at='2026-10-21T16:00:00.000Z';
const env={SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_SERVICE_ROLE_KEY:secret};
const snapshot=()=>({buildings:[],people:[],events:[],event_buildings:[],event_people:[],
  event_types:[{code:'other',icon_key:'other',name:'Other',description:'',sort_order:1}]});
const serviceFor=(store,options={})=>createMapEventService({store,now:()=>new Date(at),...options});
function safe(result,diagnostics){assert.equal(result.status,'unavailable');assert.deepEqual(result.diagnostics,diagnostics);assert(!JSON.stringify(result).includes(secret));}

test('actual map service deadline and caller cancellation retain unavailable with separate reasons',async()=>{
  let reads=0;const service=serviceFor({configured:true,read:()=>{reads++;return new Promise(()=>{});}},{timeoutMs:50});
  safe(await service.read({principal}),{stage:'execution',reason:'timeout'});
  const controller=new AbortController();controller.abort(secret);
  safe(await service.read({principal,signal:controller.signal}),{stage:'execution',reason:'aborted'});
  assert.equal(reads,1);
});

test('actual map store deadline propagates through service without inventing HTTP',async()=>{
  let dispatches=0;const store=createMapEventStore({env,timeoutMs:50,fetchImpl:async()=>{dispatches++;return new Promise(()=>{});}});
  safe(await serviceFor(store).read({principal}),{stage:'execution',reason:'timeout'});assert.equal(dispatches,1);
});

for(const httpStatus of [400,503])test(`map storage observed HTTP${httpStatus} survives service wrapping without source body`,async()=>{
  const store=createMapEventStore({env,fetchImpl:async()=>Response.json({message:secret,code:'PRIVATE_UPSTREAM_SQL_CODE'},{status:httpStatus})});
  safe(await serviceFor(store).read({principal}),{stage:'provider_request',reason:'http_error',httpStatus});
});

test('map malformed JSON and storage response bounds identify parsing with observed HTTP',async()=>{
  for(const [response,httpStatus] of [
    [()=>new Response(secret,{status:200}),200],
    [()=>new Response(secret,{status:503}),503],
    [()=>new Response(secret,{status:200,headers:{'content-length':'16777217'}}),200],
    [()=>new Response(null,{status:204}),204],
  ]) {
    const store=createMapEventStore({env,fetchImpl:async()=>response()});
    safe(await serviceFor(store).read({principal}),{stage:'response_parse',reason:'invalid_response',httpStatus});
  }
});

test('map malformed snapshots and oversized arrays are invalid responses, not raw source diagnostics',async()=>{
  for(const data of [{private:secret}, {...snapshot(),buildings:Array(101).fill({id:'building',name:secret})}, {...snapshot(),event_types:[]}]) {
    safe(await serviceFor({configured:true,read:async()=>data}).read({principal}),{stage:'response_parse',reason:'invalid_response'});
  }
  const store=createMapEventStore({env,fetchImpl:async()=>Response.json({private:secret})});
  safe(await serviceFor(store).read({principal}),{stage:'response_parse',reason:'invalid_response'});
});

test('unknown store and network exception text/metadata never enter map diagnostics',async()=>{
  const error=Object.assign(Error(secret),{diagnostics:{stage:secret,reason:secret,httpStatus:503,body:secret}});
  safe(await serviceFor({configured:true,read:async()=>{throw error;}}).read({principal}),{stage:'execution',reason:'exception'});
  const store=createMapEventStore({env,fetchImpl:async()=>{throw error;}});
  safe(await serviceFor(store).read({principal}),{stage:'provider_request',reason:'exception'});
});

test('source authorization false retains its existing denied/filtered behavior without invented provider failure',async()=>{
  const event={id:'33333333-3333-3333-3333-333333333333',name:'Event',notes:'',kind:'scheduled_event',type_id:'other',status:'confirmed',
    time_kind:'timed',starts_at:'2026-10-21T15:00:00Z',ends_at:'2026-10-21T17:00:00Z',starts_on:null,ends_on:null,time_zone:'America/New_York',
    source_id:sourceId,source_url:'https://example.com/source',source_record_id:'source-event',url:null,reported_at:at};
  const store={configured:true,read:async()=>({...snapshot(),events:[event]}),lookup:async()=>{throw Error('must not read denied identity');}};
  const service=serviceFor(store,{authorizeSource:Object.assign(()=>false,{localOnly:true})});
  const read=await service.read({principal});assert.equal(read.status,'ok');assert.deepEqual(read.events,[]);assert.equal(read.diagnostics,undefined);
  assert.deepEqual(await service.lookup({principal,provider:'email',providerUserId:'person@example.com',sourceId,sourceUrl:'https://example.com/source'}),{status:'forbidden'});
});

test('existing SQL conflict and validation return shapes remain exact, without raw SQL errors',async()=>{
  for(const [code,status] of [['40001','conflict'],['23514','invalid'],['23503','invalid'],['23505','invalid'],['22023','invalid']]) {
    const store=createMapEventStore({env,fetchImpl:async()=>Response.json({code,message:secret},{status:400})});
    assert.deepEqual(await store.upsert({event:{},buildings:[],people:[]}),{status});
  }
});
