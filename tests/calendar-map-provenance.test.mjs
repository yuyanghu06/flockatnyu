import test from 'node:test';
import assert from 'node:assert/strict';
import {createMapSourceAuthorizer} from '../server/map/source-access.js';
import {readCalendarConfig} from '../server/google/calendar-config.js';
import {createChatCalendarTools} from '../tools/calendar/chat.js';
import {createAutomationAdapters} from '../server/automation/adapters.js';
import {createAutomationHandler} from '../server/automation/handler.js';
import {readAutomationConfig} from '../server/automation/config.js';
import {MAP_RECORD_EXAMPLES} from '../server/map/contracts.js';
import {canonicalJson} from '../server/automation/validation.js';
import {createHash,randomUUID} from 'node:crypto';

const sourceId='10000000-0000-4000-8000-000000000001';
const otherId='20000000-0000-4000-8000-000000000002';
const calendarId='club@group.calendar.google.com',eventId='recurring_20261020T220000Z';
const link=(id=eventId,target=calendarId)=>`https://calendar.google.com/calendar/event?eid=${Buffer.from(`${id} ${target}`).toString('base64url')}`;
const principal={id:'chat',googleAccess:true,allowedSourceIds:[sourceId]};
function fixture() {
  const calls=[];
  let status='ready',events=[{eventId,url:link(),status:'confirmed'}];
  const client={configured:true,calendarId,readEvent:async args=>{calls.push(args);return {status,events};}};
  const authorize=createMapSourceAuthorizer({calendarClient:client,calendarSourceId:sourceId});
  return {client,calls,authorize,revoke:()=>{status='permission_denied';},changeEvents:rows=>{events=rows;}};
}
test('Calendar map access validates exact configured source, canonical event identity and current live read',async()=>{
  const f=fixture();
  for(const actor of [principal,{id:'update-agent',calendarAccess:true,calendarId,allowedSourceIds:[sourceId]}]) {
    assert.equal(await f.authorize({principal:actor,sourceId,sourceUrl:link()}),true);
    assert.deepEqual(f.calls.at(-1).principal,{id:actor.id,calendarAccess:true,calendarId});
    assert.equal(f.calls.at(-1).eventId,eventId);
  }
  f.revoke();assert.equal(await f.authorize({principal,sourceId,sourceUrl:link()}),false);
});
test('forged Calendar targets, links, source IDs and grants fail before provider read',async()=>{
  const f=fixture();
  for(const sourceUrl of [link(eventId,'other@example.com'),link()+'&extra=1',link()+'&eid=x',link()+'#details',link()+'=',link().replace('https:','http:'),link().replace('/calendar/event','/calendar/other'),link('bad/id'),link().replace('calendar.google.com','user@calendar.google.com')])
    assert.equal(await f.authorize({principal,sourceId,sourceUrl}),false,sourceUrl);
  for(const actor of [{...principal,googleAccess:false},{...principal,allowedSourceIds:[]},{id:'worker',calendarAccess:true,calendarId:'other@example.com',allowedSourceIds:[sourceId]},null])
    assert.equal(await f.authorize({principal:actor,sourceId,sourceUrl:link()}),false);
  assert.equal(await f.authorize({principal:{...principal,allowedSourceIds:[sourceId,otherId]},sourceId:otherId,sourceUrl:link()}),false);
  assert.equal(await createMapSourceAuthorizer({calendarClient:f.client})({principal,sourceId,sourceUrl:link()}),false);
  assert.equal(f.calls.length,0);
});
test('current Calendar mismatch, missing event, failure or aborted read cannot authorize map visibility',async()=>{
  for(const rows of [[],[{eventId:'another',url:link()}],[{eventId,url:link(eventId,'other@example.com')}]]) {
    const f=fixture();f.changeEvents(rows);assert.equal(await f.authorize({principal,sourceId,sourceUrl:link()}),false);
  }
  const f=fixture();f.client.readEvent=async()=>{throw Error('private');};
  assert.equal(await f.authorize({principal,sourceId,sourceUrl:link()}),false);
  const controller=new AbortController();controller.abort();
  assert.equal(await fixture().authorize({principal,sourceId,sourceUrl:link(),signal:controller.signal}),false);
  const during=fixture(),duringController=new AbortController();during.client.readEvent=async()=>{duringController.abort();return {status:'ready',events:[{eventId,url:link()}]};};
  assert.equal(await during.authorize({principal,sourceId,sourceUrl:link(),signal:duringController.signal}),false);
});
test('Calendar source configuration is optional and chat provenance is attached only from server config plus allowlist',async()=>{
  assert.equal(readCalendarConfig({}).sourceId,'');
  assert.equal(readCalendarConfig({AGENT_CALENDAR_SOURCE_ID:` ${sourceId} `}).sourceId,sourceId);
  for(const [configuredId,actor,expected] of [[sourceId,principal,sourceId],[otherId,principal,undefined],['not-uuid',principal,undefined],[undefined,principal,undefined]]) {
    const f=fixture();
    const tools=createChatCalendarTools({client:f.client,sourceId:configuredId});
    const result=await tools.execute({name:'read_calendar_event',arguments:{eventId},principal:actor});
    assert.equal(result.status,'ready');assert.equal(result.sources[0].sourceId,expected);
    assert.equal(result.sources[0].externalId,eventId);assert.equal(result.sources[0].url,link());
  }
});

const calendarSource='30000000-0000-4000-8000-000000000003',queuedId='40000000-0000-4000-8000-000000000004';
const mapId='50000000-0000-4000-8000-000000000005',oldTimestamp='2026-10-18T14:00:00.000Z',currentTimestamp='2026-10-18T16:00:00.000Z';
function timestampFixture(patch={}) {
 const clock=()=>new Date(currentTimestamp),config=readAutomationConfig({AGENT_AUTOMATION_ENABLED:'true'});
 const original={eventId,url:link(),title:'Current event',updatedAt:currentTimestamp,start:{dateTime:'2026-10-21T22:00:00Z',timeZone:'America/New_York'},end:{dateTime:'2026-10-22T00:00:00Z',timeZone:'America/New_York'},location:'Bobst Library',status:'confirmed',...patch};
 for(const key of Object.keys(original))if(original[key]===undefined)delete original[key];
 const proposal={event:{...MAP_RECORD_EXAMPLES.event,id:mapId,name:original.title,kind:'scheduled_event',source_id:calendarSource,source_record_id:eventId,source_url:link(),notes:'Bobst Library',reported_at:oldTimestamp,starts_at:'2026-10-21T22:00:00Z',ends_at:'2026-10-22T00:00:00Z',time_zone:'America/New_York'},expectedUpdatedAt:oldTimestamp,buildings:[{building_id:'bobst-library',location_notes:''}],people:[]};
 const input={uuid:queuedId,raw_response:{source:'gmail',source_id:sourceId,event_type:'email_received_metadata',event_id:'abc123',revision:'1',received_at:currentTimestamp,payload:{id:'abc123'}}};
 let revoked=false;const writes=[];
 const a=createAutomationAdapters({env:{ASSISTANT_ALLOWED_SOURCE_IDS:[sourceId,calendarSource].join(','),AGENT_GMAIL_SOURCE_ID:sourceId,AGENT_CALENDAR_SOURCE_ID:calendarSource},config,now:clock,fetchImpl:async()=>{throw Error('No network allowed');},dependencies:{
  googleConfig:{configured:true},googleClient:{configured:true},calendarConfig:{configured:true,calendarId},calendarClient:{configured:true,calendarId,preflight:async()=>({status:'ready',calendarId,accessRole:'owner'}),listEvents:async()=>({status:'ready',events:[original],coverage:{complete:true},nextPageToken:null}),readEvent:async()=>({status:revoked?'permission_denied':'ready',events:[original]})},
  discordConfig:{configured:false},discordTools:{tools:[]},mapEventService:{configured:true,read:async()=>({status:'ok',events:[{...proposal.event,status:'confirmed',updated_at:oldTimestamp,created_at:oldTimestamp}],event_people:[],event_buildings:proposal.buildings.map(b=>({...b,event_id:mapId})),buildings:[{id:'bobst-library',name:'Bobst Library'}]}),upsert:async args=>{writes.push(structuredClone({...args,signal:undefined}));return {status:'applied',event_id:mapId,updated_at:currentTimestamp};}},
 }});
 const context={principal:a.principal,inputIds:[queuedId]},tool=name=>a.tools.find(t=>t.name===name);
 const prepare=async()=>{const batch=await a.prepareBatch({...context,inputs:[input]});await tool('list_calendar_events').execute({timeMin:'2026-10-21T00:00:00Z',timeMax:'2026-10-23T00:00:00Z'},context);await tool('read_map_events').execute({sourceId:calendarSource,sourceRecordId:eventId},context);return batch;};
 return {a,config,clock,input,context,proposal,original,writes,tool,prepare,revoke:()=>{revoked=true;}};
}
test('Calendar timestamp preparation uses observed updatedAt or createdAt without touching map token or participants',async()=>{
 for(const patch of [{},{updatedAt:undefined,createdAt:currentTimestamp}]){
  const f=timestampFixture(patch);await f.prepare();const args=structuredClone(f.proposal);args.people=[{reported_at:oldTimestamp,source_id:sourceId}];
  const prepared=await f.tool('upsert_map_event').prepareArguments(args,f.context);
  assert.equal(prepared.event.reported_at,currentTimestamp);assert.equal(prepared.expectedUpdatedAt,oldTimestamp);assert.deepEqual(prepared.people,args.people);assert.equal(args.event.reported_at,oldTimestamp);
 }
});
test('Calendar timestamp preparation never repairs foreign/unobserved/revoked sources or non-Calendar timestamps',async()=>{
 const f=timestampFixture();await f.prepare();
 for(const patch of [{source_id:sourceId},{source_id:randomUUID()},{source_record_id:'unknown_event'}]){
  const args={...structuredClone(f.proposal),event:{...f.proposal.event,...patch}},prepared=await f.tool('upsert_map_event').prepareArguments(args,f.context);
  assert.equal(prepared.event.reported_at,oldTimestamp);assert.equal((await f.tool('upsert_map_event').execute(args,f.context)).status,'forbidden_source');
 }
 f.revoke();assert.equal((await f.tool('upsert_map_event').prepareArguments(f.proposal,f.context)).event.reported_at,oldTimestamp);assert.equal((await f.tool('upsert_map_event').execute(f.proposal,f.context)).status,'forbidden_source');assert.equal(f.writes.length,0);
 const unobserved=timestampFixture();await unobserved.a.prepareBatch({...unobserved.context,inputs:[unobserved.input]});assert.equal((await unobserved.tool('upsert_map_event').prepareArguments(unobserved.proposal,unobserved.context)).event.reported_at,oldTimestamp);
});
test('missing/invalid original Calendar timestamps fail closed; sparse cancellation preserves known timestamp',async()=>{
 for(const patch of [{updatedAt:undefined},{updatedAt:'not-a-date',createdAt:currentTimestamp}]){
  const f=timestampFixture(patch);await f.prepare();const prepared=await f.tool('upsert_map_event').prepareArguments(f.proposal,f.context);assert.equal(prepared.event.reported_at,oldTimestamp);
  assert.equal((await f.tool('upsert_map_event').execute(f.proposal,f.context)).status,'forbidden_source');assert.equal(f.writes.length,0);
 }
 const sparse=timestampFixture({status:'cancelled',start:null,end:null});await sparse.prepare();const args=structuredClone(sparse.proposal);args.event.status='cancelled';
 assert.equal((await sparse.tool('upsert_map_event').prepareArguments(args,sparse.context)).event.reported_at,oldTimestamp);
 assert.equal((await sparse.tool('upsert_map_event').execute(args,sparse.context)).status,'ready');assert.equal(sparse.writes[0].event.reported_at,oldTimestamp);
});
test('actual handler hashes corrected Calendar reported_at before action receipt and preserves optimistic token',async()=>{
 const f=timestampFixture(),receipts=[];let round=0,batch;
 const store={configured:true,claim:async()=>({status:'ready',leaseToken:randomUUID(),inputs:[f.input]}),renew:async()=>({status:'ready'}),release:async()=>({status:'ready'}),finish:async()=>({status:'ready'}),action:async({actionKey,complete})=>{receipts.push({actionKey,complete});return {status:complete?'completed':'execute'};}};
 const provider={toolTurn:async request=>{
  round++;batch??=JSON.parse(request.messages[0].content).batchContext;let name,args;
  if(round===1){name='list_calendar_events';args={timeMin:'2026-10-21T00:00:00Z',timeMax:'2026-10-23T00:00:00Z'};}
  else if(round===2){name='read_map_events';args={sourceId:calendarSource,sourceRecordId:eventId};}
  else if(round===3){name='upsert_map_event';args=structuredClone(f.proposal);}
  else{name='finish_batch';args={handledInputIds:[queuedId]};}
  return {stopReason:'tool_calls',toolCalls:[{id:'call'+round,name,arguments:name==='finish_batch'?args:{inputIds:[queuedId],arguments:args}}]};
 }};
 assert.equal((await createAutomationHandler({...f.a,store,provider,config:f.config,now:f.clock}).tick()).status,'completed');assert.equal(f.writes.length,1);
 const {principal,signal,...written}=f.writes[0];assert.equal(written.event.reported_at,currentTimestamp);assert.equal(written.expectedUpdatedAt,oldTimestamp);
 const hash=args=>createHash('sha256').update(canonicalJson({inputIds:[queuedId],name:'upsert_map_event',arguments:args})).digest('hex');
 assert.equal(receipts.length,2);assert.equal(receipts[0].actionKey,hash(written));assert.equal(receipts[1].actionKey,hash(written));assert.notEqual(hash(written),hash(f.proposal));
});
