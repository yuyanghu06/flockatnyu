import test from 'node:test';
import assert from 'node:assert/strict';
import {createMapSourceAuthorizer,CHAT_MAP_SOURCE_ID,chatMapEventUrl} from '../server/map/source-access.js';
import {createMapEventService,mapReadContext} from '../server/map/events.js';
import {createMapPresenceService} from '../server/map/presence.js';
const sourceId='12345678-1234-1234-1234-123456789abc',otherSourceId='12345678-1234-1234-1234-123456789abd';
const eventId='33333333-3333-3333-3333-333333333333',personId='11111111-1111-1111-1111-111111111111',otherPersonId='11111111-1111-1111-1111-111111111112';
const at='2026-10-23T15:30:00Z',origin='https://flock.example';
const miroSourceId='12345678-1234-4234-8234-123456789abe';
const principal={id:'synthetic',allowedSourceIds:[sourceId,otherSourceId,miroSourceId],liveDiscord:{guildId:'111'},googleAccess:true,mapSourceBindings:[{sourceId,provider:'discord',guildId:'111',channelId:'222'},{sourceId:otherSourceId,provider:'gmail'},{sourceId:miroSourceId,provider:'miro',boardId:'board=',enabled:true,teamId:null}]};
const urls=['https://discord.com/channels/111/222/333','https://miro.com/app/board/board%3D/?moveToWidget=widget','https://mail.google.com/mail/u/0/#all/abc123'];
const marker=(event=eventId,person=personId)=>`${origin}/?event=${event}#attendance-${person}-44444444-4444-4444-4444-444444444444`;
const event=()=>({id:eventId,name:'Event',notes:'',kind:'scheduled_event',type_id:'other',status:'confirmed',time_kind:'timed',starts_at:'2026-10-23T15:00:00Z',ends_at:'2026-10-23T17:00:00Z',starts_on:null,ends_on:null,time_zone:'America/New_York',source_id:sourceId,source_url:urls[0],source_record_id:'original',url:null,reported_at:at,updated_at:at});
const snapshot=()=>({event_types:[{code:'other',name:'Other',description:'',icon_key:'other',sort_order:0}],buildings:[{id:'bobst-library',name:'Bobst'}],people:[{id:personId,display_name:'Person',is_trackable:true},{id:otherPersonId,display_name:'Other person',is_trackable:true}],events:[event()],event_buildings:[{event_id:eventId,building_id:'bobst-library',location_notes:''}],event_people:[]});
function fixture() {
  let calls=0;const forbidden=()=>{calls++;throw Error('source dispatch forbidden');};
  const authorize=createMapSourceAuthorizer({publicOrigin:origin,gmailSourceId:otherSourceId,liveDiscordService:{configured:false,readMessages:forbidden},miroStore:{configured:false,authorizedBoard:forbidden},googleClient:{configured:false,readGmail:forbidden}});
  return {authorize,get calls(){return calls;}};
}
test('saved source links use local grants and exact provider syntax with no provider dispatch',()=>{
  const f=fixture();for(const [index,sourceUrl] of urls.entries())assert.equal(f.authorize({principal,sourceId:[sourceId,miroSourceId,otherSourceId][index],sourceUrl}),true);
  assert.equal(f.calls,0);
});
test('malformed links, another guild/account, missing grants and cancellation fail locally',()=>{
  const f=fixture();for(const sourceUrl of [urls[0]+'?expand=1',urls[0]+'#fragment',urls[0].replace('/111/','/999/'),urls[1]+'&extra=1',urls[1].replace('board%3D','board='),urls[2].replace('/u/0/','/u/1/'),'https://example.com/source','http://discord.com/channels/111/222/333','https://user@discord.com/channels/111/222/333'])assert.equal(f.authorize({principal,sourceId,sourceUrl}),false,sourceUrl);
  for(const actor of [null,{...principal,allowedSourceIds:[]},{...principal,googleAccess:false}])assert.equal(f.authorize({principal:actor,sourceId:otherSourceId,sourceUrl:urls[2]}),false);
  const controller=new AbortController();controller.abort();assert.equal(f.authorize({principal,sourceId,sourceUrl:urls[0],signal:controller.signal}),false);assert.equal(f.calls,0);
});
test('Calendar references are bound to the fixed configured calendar without account/API checks',()=>{
  let calls=0;const calendarId='fixed@example.com',url=id=>`https://calendar.google.com/calendar/event?eid=${Buffer.from(`event1 ${id}`).toString('base64url')}`;
  const authorize=createMapSourceAuthorizer({calendarSourceId:otherSourceId,calendarClient:{configured:false,calendarId,readEvent:()=>{calls++;throw Error('must not fetch');}}});
  assert.equal(authorize({principal:{...principal,mapSourceBindings:[]},sourceId:otherSourceId,sourceUrl:url(calendarId)}),true);assert.equal(authorize({principal:{...principal,mapSourceBindings:[]},sourceId:otherSourceId,sourceUrl:url('another@example.com')}),false);assert.equal(calls,0);
});
test('legacy attendance links bind the existing event and person using only the supplied DB snapshot',async()=>{
  const f=fixture(),data=snapshot(),controller=new AbortController(),scope=await f.authorize.createReadScope({principal,snapshot:data,signal:controller.signal});
  const args={principal,sourceId,sourceUrl:marker(),eventId,personId,signal:controller.signal};
  assert.equal(scope(args),true);
  for(const patch of [{eventId:otherPersonId},{personId:otherPersonId},{sourceId:otherSourceId},{sourceUrl:marker(eventId,otherPersonId)},{principal:{...principal}},{signal:new AbortController().signal}])assert.equal(scope({...args,...patch}),false);
  assert.equal(f.authorize(args),false,'no implicit DB read to reconstruct a declaration');
  data.people[0].is_trackable=false;assert.equal(scope(args),false);assert.equal(f.calls,0);
});
test('later grant changes and recursive declarations are denied without source rechecks',async()=>{
  const f=fixture(),data=snapshot(),actor={...principal,allowedSourceIds:[sourceId]},signal=new AbortController().signal;
  const scope=await f.authorize.createReadScope({principal:actor,snapshot:data,signal}),args={principal:actor,sourceId,sourceUrl:marker(),eventId,personId,signal};
  assert.equal(scope(args),true);actor.allowedSourceIds=[];assert.equal(scope(args),false);actor.allowedSourceIds=[sourceId];data.events[0].source_url=marker();assert.equal(scope(args),false);assert.equal(f.calls,0);
});
test('another participant cannot borrow a stored legacy declaration in a read, write or browser projection',async()=>{
  const f=fixture(),data=snapshot(),participant=id=>({event_id:eventId,person_id:id,attendance_status:'going',presence_basis:'planned',label:'',starts_at:null,ends_at:null,source_id:sourceId,source_url:marker(),reported_at:at});
  data.event_people=[participant(personId),participant(otherPersonId)];let writes=0;
  const store={configured:true,read:async()=>structuredClone(data),upsert:async()=>{writes++;return {status:'applied'};}},service=createMapEventService({store,authorizeSource:f.authorize});
  const read=await service.read({principal});assert.deepEqual(read.event_people.map(row=>row.person_id),[personId]);
  const {updated_at,...e}=event();const strip=({event_id,...row})=>row;
  assert.equal((await service.upsert({principal,event:e,buildings:[{building_id:'bobst-library'}],people:[strip(participant(otherPersonId))],expectedUpdatedAt:at,readContext:mapReadContext(read)})).status,'forbidden');assert.equal(writes,0);
  const projected=await createMapPresenceService({store,authorizeSource:f.authorize,production:true,now:()=>new Date(at)}).read({principal});assert.deepEqual(projected.buildings[0].events[0].attendees.map(row=>row.id),[personId]);assert.equal(f.calls,0);
});
test('direct chat attribution requires its exact event URL and explicit local chat grant',()=>{
  const actor={...principal,allowedSourceIds:[CHAT_MAP_SOURCE_ID]},sourceUrl=chatMapEventUrl(eventId,origin);
  const off=createMapSourceAuthorizer({publicOrigin:origin}),on=createMapSourceAuthorizer({publicOrigin:origin,allowChatMapUpdates:true});
  assert.equal(off({principal:actor,sourceId:CHAT_MAP_SOURCE_ID,sourceUrl,eventId}),false);assert.equal(on({principal:actor,sourceId:CHAT_MAP_SOURCE_ID,sourceUrl,eventId}),true);assert.equal(on({principal:actor,sourceId:CHAT_MAP_SOURCE_ID,sourceUrl,eventId:otherPersonId}),false);
});

test('one granted Discord source cannot borrow another channel or provider binding',()=>{
  const f=fixture(),second='12345678-1234-1234-1234-123456789abf';
  const actor={...principal,allowedSourceIds:[...principal.allowedSourceIds,second],mapSourceBindings:[...principal.mapSourceBindings,{sourceId:second,provider:'discord',guildId:'111',channelId:'444'}]};
  assert.equal(f.authorize({principal:actor,sourceId,sourceUrl:urls[0]}),true);
  assert.equal(f.authorize({principal:actor,sourceId,sourceUrl:'https://discord.com/channels/111/444/555'}),false);
  assert.equal(f.authorize({principal:actor,sourceId:second,sourceUrl:urls[0]}),false);
  assert.equal(f.authorize({principal:actor,sourceId:otherSourceId,sourceUrl:urls[0]}),false,'Gmail source UUID cannot borrow Discord content attribution');
  assert.equal(f.authorize({principal:actor,sourceId,sourceUrl:urls[1]}),false,'Discord source UUID cannot borrow a Miro board');
  assert.equal(f.authorize({principal:actor,sourceId:miroSourceId,sourceUrl:urls[1].replace('board%3D','other%3D')}),false);
  assert.equal(f.calls,0);
});

test('Miro map visibility reads exact enabled team metadata from the DB once and never live content',async()=>{
  const {createMiroStore}=await import('../server/miro/store.js');
  const boardId='db-board=',boardUrl='https://miro.com/app/board/db-board%3D/?moveToWidget=widget';
  const actor={id:'member',allowedSourceIds:[miroSourceId]},value=snapshot();value.events=[{...event(),source_id:miroSourceId,source_url:boardUrl}];
  value.event_people=[];const calls=[],writes=[];let enabled=true,team='teamA',actualSource=miroSourceId;
  const miroStore=createMiroStore({env:{SUPABASE_URL:'https://synthetic.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'synthetic'},fetchImpl:async(url,options)=>{
    calls.push(url);assert.equal(url,'https://synthetic.supabase.co/rest/v1/rpc/miro_authorized_board');assert.equal(JSON.parse(options.body).p_board_id,boardId);
    return Response.json({board_id:boardId,source_id:actualSource,enabled,team_id:team});
  }});
  const store={configured:true,read:async()=>structuredClone(value),upsert:async args=>{writes.push(args);return {status:'applied',event_id:eventId,updated_at:at};}};
  const authorize=createMapSourceAuthorizer({miroStore,miroTeamId:'teamA'}),service=createMapEventService({store,authorizeSource:authorize});
  const read=await service.read({principal:actor});assert.equal(read.events.length,1);assert.equal(calls.length,1);
  const projection=createMapPresenceService({store,authorizeSource:authorize,production:true,now:()=>new Date(at)});
  assert.equal((await projection.read({principal:actor})).buildings[0].events.length,1);const metadataReads=calls.length;
  const {updated_at,...e}=read.events[0];
  const saved=await service.upsert({principal:actor,event:{...e,notes:'Requested note'},buildings:[],people:[],expectedUpdatedAt:at,readContext:mapReadContext(read)});
  assert.equal(saved.status,'applied');assert.equal(writes.length,1);assert.equal(calls.length,metadataReads,'write reuses only the metadata already loaded by explicit map read');
  enabled=false;assert.deepEqual((await service.read({principal:actor})).events,[]);assert.deepEqual((await projection.read({principal:actor})).buildings[0].events,[]);
  enabled=true;team='otherTeam';assert.deepEqual((await service.read({principal:actor})).events,[]);
  team='teamA';actualSource='12345678-1234-4234-8234-123456789abf';actor.allowedSourceIds.push(actualSource);assert.deepEqual((await service.read({principal:actor})).events,[],'an allowed but different board source cannot borrow the requested source');
  assert(calls.every(url=>new URL(url).hostname==='synthetic.supabase.co'));
});
