import test from 'node:test';
import assert from 'node:assert/strict';
import {createMapSourceAuthorizer} from '../server/map/source-access.js';

const sourceId = '12345678-1234-1234-1234-123456789abc';
const principal = {id:'synthetic',allowedSourceIds:[sourceId],liveDiscord:{mode:'local-operator',guildId:'111'},googleAccess:true};
const discordUrl = 'https://discord.com/channels/111/222/333';
const miroUrl = 'https://miro.com/app/board/board%3D/?moveToWidget=widget';
const gmailUrl = 'https://mail.google.com/mail/u/0/#all/abc123';
function harness() {
  const calls = [];
  const dependencies = {
    liveDiscordService:{configured:true,readMessages:async args=>{
      calls.push(['discord',args]);return {status:'ready',sources:[{sourceId,url:discordUrl,guildId:'111',channelId:'222',messageId:'333'}]};}},
    miroStore:{configured:true,authorizedBoard:async args=>{
      calls.push(['miro',args]);return {status:'ready',data:{board_id:'board=',source_id:sourceId}};}},
    googleClient:{configured:true,readGmail:async args=>{
      calls.push(['gmail',args]);return {status:'ready',sources:[{kind:'gmail',externalId:'abc123',url:gmailUrl}]};}},
    gmailSourceId:sourceId,
  };
  return {calls,dependencies,authorize:createMapSourceAuthorizer(dependencies)};
}
test('map source access reuses current source services with exact references',async()=>{
  const {authorize,calls}=harness();
  for (const sourceUrl of [discordUrl,miroUrl,gmailUrl]) assert.equal(await authorize({principal,sourceId,sourceUrl}),true);
  assert.equal(calls[0][1].principal,principal);assert.equal(calls[0][1].context,false);
  assert.equal(calls[0][1].limit,1);assert.equal(calls[1][1].boardId,'board=');assert.equal(calls[2][1].messageId,'abc123');
});
test('map source grants cannot be inferred from URLs, forged identity, other accounts or extra query parameters',async()=>{
  const {authorize,calls}=harness();
  for(const sourceUrl of [discordUrl+'?expand=1',discordUrl+'#fragment',discordUrl.replace('/111/','/999/'),miroUrl+'&extra=1',miroUrl.replace('board%3D','board='),gmailUrl.replace('/u/0/','/u/1/'),'https://example.com/source','http://discord.com/channels/111/222/333','https://user@discord.com/channels/111/222/333'])assert.equal(await authorize({principal,sourceId,sourceUrl}),false,sourceUrl);
  for(const actor of [null,{...principal,allowedSourceIds:[]},{...principal,googleAccess:false}])assert.equal(await authorize({principal:actor,sourceId,sourceUrl:gmailUrl}),false);
  assert.equal(await authorize({principal,sourceId:'invalid',sourceUrl:discordUrl}),false);
  assert.equal(calls.length,0);
});
test('withdrawn policies, source mismatches, failures and aborted reads deny visibility',async()=>{
  const {dependencies}=harness();
  dependencies.liveDiscordService.readMessages=async()=>({status:'forbidden',sources:[]});
  dependencies.miroStore.authorizedBoard=async()=>({status:'ready',data:{board_id:'board=',source_id:'different'}});
  dependencies.googleClient.readGmail=async()=>{throw Error('PRIVATE');};
  const authorize=createMapSourceAuthorizer(dependencies);
  for(const sourceUrl of [discordUrl,miroUrl,gmailUrl])assert.equal(await authorize({principal,sourceId,sourceUrl}),false);
  const controller=new AbortController();controller.abort();
  assert.equal(await authorize({principal,sourceId,sourceUrl:discordUrl,signal:controller.signal}),false);
});

const eventId='33333333-3333-3333-3333-333333333333',personId='11111111-1111-1111-1111-111111111111';
const otherSourceId='12345678-1234-1234-1234-123456789abd',otherEventId='33333333-3333-3333-3333-333333333334',otherPersonId='11111111-1111-1111-1111-111111111112';
const publicOrigin='https://flock.example',requestId='44444444-4444-4444-4444-444444444444';
const marker=(event=eventId,person=personId)=>`${publicOrigin}/?event=${event}#attendance-${person}-${requestId}`;
function scopedFixture() {
  const {dependencies,calls}=harness();let reads=0;
  const event={id:eventId,name:'Synthetic event',notes:'',kind:'scheduled_event',type_id:'other',status:'confirmed',time_kind:'timed',starts_at:'2026-10-18T15:00:00Z',ends_at:'2026-10-18T17:00:00Z',starts_on:null,ends_on:null,time_zone:'America/New_York',source_id:sourceId,source_url:discordUrl,source_record_id:'synthetic',url:null,reported_at:'2026-10-18T15:00:00Z'};
  const snapshot={event_types:[{code:'other',name:'Other',description:'',icon_key:'other',sort_order:0}],buildings:[],
    people:[{id:personId,display_name:'Synthetic person',is_trackable:true},{id:otherPersonId,display_name:'Other person',is_trackable:true}],
    events:[event,{...event,id:otherEventId}],event_buildings:[],event_people:[]};
  const store={configured:true,read:async()=>{reads++;return snapshot;}};
  const authorize=createMapSourceAuthorizer({...dependencies,store,publicOrigin});
  const controller=new AbortController(),signal=controller.signal;
  const scope=authorize.createReadScope({principal,snapshot,signal});
  return {authorize,scope,snapshot,signal,controller,calls,dependencies,get reads(){return reads;}};
}
test('projection scope shares concurrent exact provider checks and its snapshot for declarations',async()=>{
  const f=scopedFixture(),args={principal,sourceId,sourceUrl:discordUrl,signal:f.signal};
  const answers=await Promise.all(Array.from({length:20},(_,index)=>f.scope(index%2?{...args,sourceUrl:marker(),eventId,personId}:args)));
  assert(answers.every(value=>value===true));assert.equal(f.calls.length,1);assert.equal(f.reads,0,'declaration checks reuse the validated projection snapshot');
  for(const sourceUrl of [miroUrl,gmailUrl])assert.equal(await f.scope({...args,sourceUrl}),true);
  assert.deepEqual(f.calls.map(call=>call[0]),['discord','miro','gmail'],'different provider originals never borrow a grant');
});
test('cached originals cannot authorize another declaration event, person, source, URL or principal',async()=>{
  const f=scopedFixture(),args={principal,sourceId,sourceUrl:marker(),eventId,personId,signal:f.signal};
  assert.equal(await f.scope(args),true);
  for(const patch of [{eventId:otherEventId},{eventId:undefined},{personId:otherPersonId},{personId:undefined},
    {principal:{...principal}},{signal:new AbortController().signal},{sourceId:otherSourceId},{sourceUrl:discordUrl+'?extra=1'},
    {sourceUrl:marker(otherEventId),eventId},{sourceUrl:marker(eventId,otherPersonId),personId}]) {
    assert.equal(await f.scope({...args,...patch}),false,JSON.stringify(patch));
  }
  assert.equal(f.calls.length,1,'malformed and mismatched declarations are denied before provider reuse');
  const actor={...principal,allowedSourceIds:[sourceId,otherSourceId]};
  const otherScope=f.authorize.createReadScope({principal:actor,snapshot:f.snapshot,signal:f.signal});
  assert.equal(await otherScope({...args,principal:actor,sourceId:otherSourceId}),false,'an allowed but different source cannot borrow the event grant');
  assert.equal(await otherScope({...args,principal:actor,sourceId:otherSourceId,sourceUrl:discordUrl}),false,'provider response source UUID must still match');
  assert.equal(f.calls.length,2);
  f.snapshot.people[0].is_trackable=false;
  assert.equal(await f.scope(args),false,'trackability remains required even after an original was checked');
});
test('later read scopes and uncached authorizer calls observe provider and marker revocation',async()=>{
  const f=scopedFixture(),args={principal,sourceId,sourceUrl:marker(),eventId,personId,signal:f.signal};
  assert.equal(await f.scope(args),true);
  f.dependencies.liveDiscordService.readMessages=async()=>{f.calls.push(['revoked']);return {status:'forbidden'};};
  const nextScope=f.authorize.createReadScope({principal,snapshot:f.snapshot,signal:f.signal});
  assert.equal(await nextScope(args),false);assert.equal(f.reads,0);
  assert.equal(await f.authorize(args),false);assert.equal(await f.authorize(args),false);
  assert.equal(f.reads,2,'general authorization reads fresh storage for each declaration');assert.equal(f.calls.length,4,'general authorization checks the provider each time');
  f.snapshot.events=[];
  assert.equal(await f.authorize(args),false);assert.equal(f.reads,3);assert.equal(f.calls.length,4);
});
test('cancellation denies cached and in-flight scoped authorization',async()=>{
  const f=scopedFixture(),args={principal,sourceId,sourceUrl:discordUrl,signal:f.signal};
  assert.equal(await f.scope(args),true);f.controller.abort();assert.equal(await f.scope(args),false);assert.equal(f.calls.length,1);
  const g=scopedFixture();let release;
  g.dependencies.liveDiscordService.readMessages=()=>new Promise(resolve=>{release=resolve;});
  const pending=g.scope({...args,signal:g.signal});g.controller.abort();
  release({status:'ready',sources:[{sourceId,url:discordUrl,guildId:'111',channelId:'222',messageId:'333'}]});
  assert.equal(await pending,false);
});
