import test from 'node:test';
import assert from 'node:assert/strict';
import {assistantAnswerPrompt,retrieveAssistantContext} from '../server/chat/context.js';
import {createApp} from '../server/runtime/app.js';
import {readConfig} from '../server/shared/config.js';
import {createMapTools} from '../tools/map/index.js';
import {createChatMapTools} from '../tools/map/chat.js';
import {MAP_RECORD_EXAMPLES} from '../server/map/contracts.js';
import {createChatCalendarTools} from '../tools/calendar/chat.js';
import {createRuntimeServices} from '../server/runtime/services.js';
import {createChatRunner} from '../server/chat/runner.js';
import {CHAT_MAP_SOURCE_ID,withChatMapSource,chatMapEventUrl,createMapSourceAuthorizer} from '../server/map/source-access.js';
import {createMapEventService,mapReadContext} from '../server/map/events.js';
import {createTimeContext} from '../server/shared/time-zone.js';

const sourceId = MAP_RECORD_EXAMPLES.event.source_id, personId = MAP_RECORD_EXAMPLES.people[0].person_id;
const sourceUrl = 'https://discord.com/channels/123/456/789';
const principal = {id:'chat-fixture',allowedSourceIds:[sourceId]};
const now = '2026-10-18T16:00:00Z', timeZone = 'America/New_York';
const messages = [{role:'user',content:'Use this original Discord message to add the study plan to the map.'}];
const source = {kind:'discord',retrieval:'live',sourceId,url:sourceUrl,guildId:'123',channelId:'456',messageId:'789',authorId:'567',excerpt:'I am studying at Bobst',title:'Study plan'};
const rosterPerson={id:personId,display_name:'Yuyang Hu',avatar_url:'/assets/avatars/Yuyang.png',is_trackable:true,discord_user_id:'567',email:'PRIVATE_EMAIL'};
const snapshot = {events:[],event_buildings:[],event_people:[],buildings:[{id:'bobst-library',name:'Bobst Library'}],people:[rosterPerson],event_types:['study','meeting','event','social','other'].map((code,index)=>({code,name:code,description:'',icon_key:code,sort_order:index}))};
const storageWriteArgs = () => structuredClone({event:{...MAP_RECORD_EXAMPLES.event,source_url:sourceUrl},buildings:MAP_RECORD_EXAMPLES.buildings,people:MAP_RECORD_EXAMPLES.people.map(p=>({...p,source_url:sourceUrl}))});
const writeArgs=()=>{const args=storageWriteArgs();for(const key of ['starts','ends']){args.event[`${key}_local`]=createTimeContext({now:args.event[`${key}_at`],timeZone}).localDateTime;delete args.event[`${key}_at`];}return args;};
const directWriteArgs=()=>{
  const args=writeArgs();for(const row of [args.event,...args.people])for(const key of ['source_id','source_url','source_record_id','reported_at'])delete row[key];
  args.event.starts_local='2026-10-18T12:00:00';args.event.ends_local='2026-10-18T17:00:00';return args;
};
const plan = [
  {name:'read_discord_messages',arguments:{channelId:'456',messageId:'789'}},
  {name:'read_map_events',arguments:{sourceId,sourceRecordId:MAP_RECORD_EXAMPLES.event.source_record_id}},
  {name:'lookup_map_person',arguments:{provider:'discord',providerUserId:'567',sourceId,sourceUrl}},
  {name:'upsert_map_event',arguments:null},
];
function fixture({writeStatus='applied',mapSnapshot=snapshot,readSource=source}={}) {
  let writes=0;const lookups=[],saved=[];
  const store={configured:true,read:async()=>structuredClone(mapSnapshot),lookup:async args=>{lookups.push(args);return args.providerUserId==='567'?structuredClone(rosterPerson):null;}};
  const mapTools=createChatMapTools({mapTools:createMapTools({service:{configured:true,
    read:async()=>({status:'ok',...structuredClone(mapSnapshot),privateCredential:'do-not-forward'}),
    lookup:async()=>({status:'ok',person:{id:personId,display_name:'Fixture member',is_trackable:true,secret:'do-not-forward'}}),
    upsert:async args=>{writes++;saved.push(args);return {status:writeStatus,event_id:'00000000-0000-0000-0000-000000000099',updated_at:now,secret:'do-not-forward'};},
  }}),store,publicOrigin:'https://flock.example',now:()=>new Date(now)});
  const liveTools={tools:[{name:'read_discord_messages',parameters:{type:'object',properties:{}}}],execute:async options=>{
    assert.equal(options.userMessage,messages[0].content);return {status:'ready',sources:[readSource]};
  }};
  return {mapTools,liveTools,store,lookups,saved,writes:()=>writes};
}
function providerFor(calls,onAnswer=()=>{}) {
  let round=0;
  return {planTools:async({system,tools})=>{
    assert(tools.some(tool=>tool.name==='upsert_map_event'));
    if(round===2)assert(system.includes('"mapContext"'));
    if(round===3)assert(system.includes('"mapPerson"'));
    const call=calls[round++];return call ? [{...call,arguments:call.arguments || writeArgs()}] : [];
  },async *stream({system}){onAnswer(system);yield 'Recorded the source-backed plan.';}};
}


test('actual chat planning reaches source read, catalogue, identity and write, retaining safe complete results and receipt',async()=>{
  const f=fixture(),context=await retrieveAssistantContext({messages,principal,provider:providerFor(plan),...f,now,timeZone});
  assert.equal(f.writes(),1);assert.equal(context.results.length,4);
  assert.equal(context.results[1].mapContext.complete,true);assert.deepEqual(context.results[1].mapContext.buildings,snapshot.buildings);
  assert.equal(context.results[2].mapPerson.id,personId);
  assert.deepEqual(context.results[3].mapWrite,{outcome:'applied',eventId:'00000000-0000-0000-0000-000000000099',updatedAt:now});
  assert(!JSON.stringify(context).includes('do-not-forward'));
  assert(assistantAnswerPrompt({...context,now,timeZone}).includes('"outcome":"applied"'));
});

test('map conflicts, denied writes and missing receipts cannot become successful answer receipts',async()=>{
  for(const writeStatus of ['conflict','forbidden','unavailable','ready']) {
    const f=fixture({writeStatus});
    const context=await retrieveAssistantContext({messages,principal,provider:providerFor(plan),...f,now,timeZone});
    assert.equal(context.results.at(-1).status,writeStatus);assert.equal(context.results.at(-1).mapWrite,undefined);
    const prompt=assistantAnswerPrompt({...context,now,timeZone});assert.match(prompt,/missing receipt or failed write is not a saved change/);
  }
});

test('direct chat updates use existing map tools without source reads, linked-author receipts or lexical action gates',async()=>{
  for(const content of ['@Flock im at bobst','plot me on map','put me on the map at Bobst until 5','Please mark this location for Yuyang','Add myself to the map.']) {
    const f=fixture();let round=0;
    const calls=[{name:'read_map_events',arguments:{}},{name:'lookup_map_person',arguments:{personName:'Yuyang'}},{name:'upsert_map_event',arguments:directWriteArgs()}];
    const conversation=[{role:'user',content:'My name is Yuyang. I am at Bobst studying until 5.'},{role:'assistant',content:'Which change should I make?'},{role:'user',content}];
    const context=await retrieveAssistantContext({messages:conversation,principal,now,timeZone,mapTools:f.mapTools,
      provider:{planTools:async()=>round<calls.length?[calls[round++]]:[]}});
    assert.equal(f.writes(),1,content);assert.deepEqual(context.results.map(row=>row.tool),calls.map(row=>row.name));
    assert(context.results.some(row=>row.mapWrite?.outcome==='applied'));assert.equal(f.saved[0].event.source_id,CHAT_MAP_SOURCE_ID);
    assert.equal(new URL(f.saved[0].event.source_url).origin,'https://flock.example');assert(!f.saved[0].event.source_url.includes('discord.com'));
  }
});

test('oversized map snapshots are withheld as a whole with explicit incomplete context',async()=>{
  const f=fixture({mapSnapshot:{...snapshot,events:[{id:'large',notes:'x'.repeat(65000)}]}});
  let n=0;
  const context=await retrieveAssistantContext({messages,principal,provider:{planTools:async()=>n++===0?[{name:'read_map_events',arguments:{}}]:[]},...f,now,timeZone});
  assert.deepEqual(context.results[0].mapContext,{complete:false,reason:'snapshot_too_large_use_event_or_source_filter'});
  assert.equal(context.results[0].possiblyTruncated,true);assert(!JSON.stringify(context).includes('xxxxx'));
});

test('named lookup uses the fixed trackable roster and leaves unknown or ambiguous names unresolved',async()=>{
  for(const [people,name,matched] of [[[rosterPerson],'yuyang',true],[[rosterPerson],'YUYANG HU',true],[[],'Yuyang',false],[[{...rosterPerson,is_trackable:false}],'Yuyang',false],[[rosterPerson,{...rosterPerson,id:'00000000-0000-0000-0000-000000000088',display_name:'Yuyang Other'}],'Yuyang',false]]) {
    const f=fixture({mapSnapshot:{...snapshot,people}}),request=f.mapTools.createRequest({principal});
    const result=await request.execute({name:'lookup_map_person',arguments:{personName:name},principal});
    assert.equal(result.status,'ready');assert.equal(Boolean(result.person),matched);assert(!JSON.stringify(result).includes('PRIVATE_EMAIL'));assert(!JSON.stringify(result).includes('discord_user_id'));
    assert.equal(f.writes(),0);
  }
});

test('observed source text cannot override a denial from the shared map service',async()=>{
  for(const name of ['read_miro_board','read_miro_item','read_discord_messages']) {
    const f=fixture({writeStatus:'forbidden'}),request=f.mapTools.createRequest({principal});
    request.observe(name,{status:'ready',sources:[source]});
    const result=await request.execute({name:'upsert_map_event',arguments:directWriteArgs(),principal});
    assert.equal(result.status,'forbidden');assert(!result.mapWrite);
  }
});

test('extended map workflows stop at thirty total calls across paired rounds with sequential progress IDs',async()=>{
  let executions=0,rounds=0;const events=[];
  const mapTools={tools:[{name:'read_map_events'}],execute:async()=>{executions++;return {status:'ready',...snapshot};}};
  await retrieveAssistantContext({messages,principal,now,timeZone,mapTools,onToolEvent:e=>events.push(e),
    provider:{planTools:async()=>{rounds++;return [0,1].map(i=>({name:'read_map_events',arguments:{sourceRecordId:`unique-${rounds}-${i}`}}));}}});
  assert.equal(executions,30);assert.equal(rounds,15);
  assert.deepEqual(events.filter(event=>event.status==='running').map(event=>event.id),Array.from({length:30},(_,i)=>`tool-${i+1}`));
  assert.equal(events.at(-1).id,'tool-30');
});

test('single-call planning reaches round thirty and stops even when a skipped duplicate leaves unused call budget',async()=>{
  for(const skipSecond of [false,true]) {
    let rounds=0,executions=0;const events=[];
    await retrieveAssistantContext({messages,principal,now,timeZone,onToolEvent:event=>events.push(event),
      mapTools:{tools:[{name:'read_map_events'}],execute:async()=>{executions++;return {status:'ready',...snapshot};}},
      provider:{planTools:async()=>{rounds++;return [{name:'read_map_events',arguments:{sourceRecordId:`unique-${skipSecond&&rounds===2?1:rounds}`}}];}}});
    assert.equal(rounds,30);assert.equal(executions,skipSecond?29:30);
    assert.equal(events.filter(event=>event.status==='running').length,executions);
    assert.equal(events.at(-1).id,`tool-${executions}`);
  }
});

test('three consecutive no-progress rounds still terminate planning before the expanded limit',async()=>{
  let rounds=0,executions=0;
  const result=await retrieveAssistantContext({messages,principal,now,timeZone,
    mapTools:{tools:[{name:'read_map_events'}],execute:async()=>{executions++;return {status:'ready',...snapshot};}},
    provider:{planTools:async()=>{rounds++;return [{name:'read_map_events',arguments:{sourceRecordId:'same'}}];}}});
  assert.equal(rounds,4);assert.equal(executions,1);
  assert.equal(result.results.filter(row=>row.status==='duplicate_call_skipped').length,3);
});

test('chat lookup schemas reject arbitrary controls while provider identity lookup needs no observed-source receipt',async()=>{
  const f=fixture(),request=f.mapTools.createRequest({principal});
  for(const args of [{personName:'Yuyang',sql:'select *'},{provider:'discord',providerUserId:'567',admin:true}])assert.equal((await request.execute({name:'lookup_map_person',arguments:args,principal})).status,'invalid_request');
  const result=await request.execute({name:'lookup_map_person',arguments:{provider:'discord',providerUserId:'567'},principal});
  assert.equal(result.status,'ready');assert.equal(result.person.id,personId);assert.equal(f.lookups[0].providerUserId,'567');
});

test('fully dependent source fallback and map read/lookup/write can reach the eighth planning round',async()=>{
  let round=0,executions=0;
  const names=['list_calendar_events','list_miro_boards','read_miro_board','read_miro_item','read_discord_messages','read_map_events','lookup_map_person','upsert_map_event'];
  const adapter=tools=>({tools:tools.map(name=>({name})),execute:async()=>{executions++;return {status:'ready',sources:[]};}});
  await retrieveAssistantContext({messages,principal,now,timeZone,googleTools:adapter(names.slice(0,1)),miroTools:adapter(names.slice(1,4)),liveTools:adapter(names.slice(4,5)),mapTools:adapter(names.slice(5)),
    provider:{planTools:async()=>round<names.length?[{name:names[round++],arguments:{}}]:[]}});
  assert.equal(executions,8);assert.equal(round,8);
});

test('Calendar empty/failure can reach automatic Miro content fallback after four dependent reads',async()=>{
  for(const calendarStatus of ['ready','permission_denied']) {
    const calls=['list_calendar_events','list_miro_boards','read_miro_board','read_miro_item'];let n=0;
    const result=await retrieveAssistantContext({messages:[{role:'user',content:'What is happening this week?'}],principal,now,timeZone,
      provider:{planTools:async()=>n<calls.length?[{name:calls[n++],arguments:{}}]:[]},
      googleTools:{tools:[{name:calls[0]}],execute:async()=>({status:calendarStatus,calendarContext:{events:[],nextPageToken:null},sources:[]})},
      miroTools:{tools:calls.slice(1).map(name=>({name})),execute:async({name})=>({status:'ready',boardContext:{content:name==='read_miro_item'?'Actual week cells':'navigation'},sources:[]})}});
    assert.deepEqual(result.results.map(r=>r.tool),calls);assert.equal(result.results[0].status,calendarStatus);
    assert.equal(result.results.at(-1).boardContext.content,'Actual week cells');
  }
});

test('existing provider provenance is passed to the shared service rather than requiring a request-local source receipt',async()=>{
  const f=fixture(),request=f.mapTools.createRequest({principal}),args=writeArgs();
  const result=await request.execute({name:'upsert_map_event',arguments:args,principal});assert.equal(result.status,'ready');
  assert.equal(f.saved[0].event.source_id,sourceId);assert.equal(f.saved[0].event.source_url,sourceUrl);assert.equal(f.saved[0].event.source_record_id,args.event.source_record_id);
  assert.equal(f.saved[0].people[0].person_id,personId);
});

test('stateless live Discord HTTP tool execution cannot claim a current explicit user request',async()=>{
  let userMessage='not-called';
  const app=createApp({config:readConfig({}),auth:()=>principal,liveDiscordTools:{tools:[{name:'read_discord_messages'}],execute:async options=>{
    userMessage=options.userMessage;return {status:'forbidden',sources:[]};
  }}});
  const response=await app.request('/api/tools/read_discord_messages',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});
  assert.equal(response.status,403);assert.equal(userMessage,'');
});

test('completed Calendar windows remain visible for automatic empty or failed Miro fallback',async()=>{
  const window={timeMin:'2026-10-19T00:00:00-04:00',timeMax:'2026-10-26T00:00:00-04:00'};
  for(const status of ['ready','permission_denied']) {
    let round=0;
    const context=await retrieveAssistantContext({messages:[{role:'user',content:'What is happening next week?'}],principal,now,timeZone,
      provider:{planTools:async({system})=>{
        if(round++===0)return [{name:'list_calendar_events',arguments:window}];
        assert(system.includes('NEXT ACTION: The Calendar read already completed'));
        assert(system.includes(JSON.stringify(window.timeMin)));
        assert(system.includes(JSON.stringify(window.timeMax)));
        return [];
      }},googleTools:{tools:[{name:'list_calendar_events'}],execute:async()=>({status,sources:[],calendarContext:{events:[],nextPageToken:null}})}});
    assert.deepEqual(context.results[0].arguments,window);
  }
});

test('empty lookup resolves a verified Discord actor ID without trusting labels or requiring a pasted link',async()=>{
  const f=fixture(),requestContext={transport:'discord',actor:{provider:'discord',userId:'567',guildId:'123',username:'untrusted',displayName:'Someone Else'},channelId:'456',threadId:null,requestId:'789',sourceProfileId:'fixture'};
  const request=f.mapTools.createRequest({principal,requestContext,userMessage:'@Flock im at bobst'});
  const result=await request.execute({name:'lookup_map_person',arguments:{},principal});
  assert.equal(result.status,'ready');assert.equal(result.person.id,personId);assert.equal(f.lookups[0].providerUserId,'567');
  const web=f.mapTools.createRequest({principal,userMessage:'im at bobst'}),unknown=await web.execute({name:'lookup_map_person',arguments:{},principal});
  assert(!unknown.person);assert.equal(f.writes(),0);
});

test('an unknown Discord actor cannot resolve from its display label but may use an explicit roster name',async()=>{
  const f=fixture(),requestContext={transport:'discord',actor:{provider:'discord',userId:'999',guildId:'123',username:'Yuyang',displayName:'Yuyang Hu'},channelId:'456',threadId:null,requestId:'789',sourceProfileId:'fixture'};
  const request=f.mapTools.createRequest({principal,requestContext,userMessage:'plot me on map'});
  assert(!(await request.execute({name:'lookup_map_person',arguments:{},principal})).person);
  assert.equal((await request.execute({name:'lookup_map_person',arguments:{personName:'Yuyang'},principal})).person.id,personId);
});

test('a model-supplied fixed person ID can be saved without inventing a mandatory prior identity receipt',async()=>{
  const f=fixture(),request=f.mapTools.createRequest({principal,userMessage:'plot me on map'});
  const result=await request.execute({name:'upsert_map_event',arguments:directWriteArgs(),principal});
  assert.equal(result.status,'ready');assert.equal(f.writes(),1);assert.equal(f.saved[0].people[0].person_id,personId);assert.equal(f.lookups.length,0);
});

test('a bounded duplicate lookup correction retains full identity arguments and reaches the map write',async()=>{
  const f=fixture();let round=0,correctivePrompt='';
  const calls=[plan[0],plan[1],plan[2],plan[2],plan[3]];
  const result=await retrieveAssistantContext({messages,principal,now,timeZone,liveTools:f.liveTools,mapTools:f.mapTools,
    provider:{planTools:async({system})=>{
      if(round===3){assert(system.includes('"providerUserId":"567"'));assert(system.includes('"sourceUrl":'+JSON.stringify(sourceUrl)));}
      if(round===4)correctivePrompt=system;
      const call=calls[round++];return call?[{...call,arguments:call.arguments||writeArgs()}]:[];
    }}});
  assert(correctivePrompt.includes('duplicate_call_skipped'));assert.equal(f.writes(),1);
  assert.equal(result.results.filter(row=>row.tool==='lookup_map_person').length,1);
  assert(result.results.some(row=>row.mapWrite?.outcome==='applied'));
});

test('model sees one applied map receipt when it repeats an identical direct write in a turn',async()=>{
  const f=fixture();let round=0;
  const calls=[{name:'read_map_events',arguments:{}},{name:'lookup_map_person',arguments:{personName:'Yuyang'}}];
  const result=await retrieveAssistantContext({messages:[{role:'user',content:'plot me on map'}],principal,now,timeZone,mapTools:f.mapTools,
    provider:{planTools:async({system})=>{
      if(round<calls.length)return [calls[round++]];
      if(round++===2)return [{name:'upsert_map_event',arguments:directWriteArgs()},{name:'upsert_map_event',arguments:directWriteArgs()}];
      assert.match(system,/"mapWrite"/);return [];
    }}});
  assert.equal(f.writes(),1);assert.equal(result.results.filter(row=>row.mapWrite).length,1);
});

test('chat provenance is owned by the adapter and repeated direct writes cannot rename its record to duplicate it',async()=>{
  const f=fixture(),request=f.mapTools.createRequest({principal,userMessage:'plot me on map'});
  const first=await request.execute({name:'upsert_map_event',arguments:directWriteArgs(),principal});assert.equal(first.status,'ready');
  const duplicate=directWriteArgs();Object.assign(duplicate.event,{source_id:CHAT_MAP_SOURCE_ID,source_record_id:'renamed_duplicate',source_url:'https://fake.example/pretended-original'});
  assert.deepEqual(await request.execute({name:'upsert_map_event',arguments:duplicate,principal}),first);assert.equal(f.writes(),1);
});

test('a changed payload cannot borrow an earlier successful receipt and falsely claim its correction was saved',async()=>{
  const f=fixture(),request=f.mapTools.createRequest({principal,userMessage:'plot me on map'}),args=directWriteArgs();
  const first=await request.execute({name:'upsert_map_event',arguments:args,principal});assert.equal(first.status,'ready');
  const corrected=directWriteArgs();corrected.event.name='Corrected activity';corrected.people[0].label='Corrected activity';
  const result=await request.execute({name:'upsert_map_event',arguments:corrected,principal});
  assert.equal(result.status,'conflict');assert.equal(f.writes(),1);assert.equal(f.saved[0].people[0].label,'studying');
});

test('website name-only clarification keeps the supplied place and end through ordinary history without a cache',async()=>{
  const initial=[{role:'user',content:'im at bobst until 5'}],f=fixture();let initialPlans=0;
  await retrieveAssistantContext({messages:initial,principal,now,timeZone,mapTools:f.mapTools,provider:{planTools:async()=>{initialPlans++;return [];}}});
  assert.equal(initialPlans,1);assert.equal(f.writes(),0);
  const conversation=[...initial,{role:'assistant',content:'What name should I use for you?'},{role:'user',content:'Yuyang'}];
  // A fresh adapter and a much later request have no pending-report cache.
  const resumed=fixture(),args=directWriteArgs(),calls=[{name:'lookup_map_person',arguments:{personName:'Yuyang'}},{name:'read_map_events',arguments:{}},{name:'upsert_map_event',arguments:args}];let round=0;
  const result=await retrieveAssistantContext({messages:conversation,principal,now:'2026-10-18T16:31:00Z',timeZone,mapTools:resumed.mapTools,provider:{planTools:async({messages:history})=>{
    assert.deepEqual(history,conversation);return round<calls.length?[calls[round++]]:[];
  }}});
  assert.equal(resumed.writes(),1);assert.equal(resumed.saved[0].event.ends_at,'2026-10-18T21:00:00.000Z');assert(result.results.some(row=>row.mapWrite?.outcome==='applied'));
});


test('protected app exposes map tools, denies stateless writes and passes successful chat receipt into answer generation',async()=>{
  const f=fixture();let answerPrompt;
  const app=createApp({config:readConfig({LLM_PROVIDER:'openai-compatible',LLM_MODEL:'fixture',LLM_API_KEY:'fixture-only'}),
    provider:providerFor(plan,system=>{answerPrompt=system;}),auth:()=>principal,mapTools:f.mapTools,liveDiscordTools:f.liveTools,now:()=>new Date(now)});
  const inventory=await(await app.request('/api/tools')).json();assert(inventory.tools.some(t=>t.name==='upsert_map_event'));
  const direct=await(await app.request('/api/tools/upsert_map_event',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(writeArgs())})).json();
  assert.equal(direct.status,'forbidden');assert.equal(f.writes(),0);
  const response=await app.request('/api/chat',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({messages,timeZone})});
  const events=(await response.text()).trim().split('\n').map(JSON.parse);
  assert.equal(events.at(-1).type,'done');assert.equal(f.writes(),1);assert(answerPrompt.includes('"mapWrite":{"outcome":"applied"'));
  assert(!JSON.stringify(events).includes('do-not-forward'));
});


test('the shared service retains invalid-window, fixed-catalogue and authentication validation',async()=>{
  const calls=[],store={configured:true,read:async()=>structuredClone(snapshot),upsert:async args=>{calls.push(args);return {status:'applied',event_id:args.event.id,updated_at:now};}};
  const authorized=withChatMapSource(principal),authorizeSource=createMapSourceAuthorizer({store,publicOrigin:'https://flock.example',allowChatMapUpdates:true});
  const service=createMapEventService({store,authorizeSource,now:()=>new Date(now)});
  const eventId='00000000-0000-0000-0000-000000000099',args=storageWriteArgs();args.event={...args.event,id:eventId,source_id:CHAT_MAP_SOURCE_ID,source_url:chatMapEventUrl(eventId,'https://flock.example')};
  args.people=args.people.map(row=>({...row,source_id:CHAT_MAP_SOURCE_ID,source_url:args.event.source_url}));
  args.readContext=mapReadContext(await service.read({principal:authorized}));
  const invalid={...structuredClone({...args,readContext:undefined}),readContext:args.readContext};invalid.event.ends_at=invalid.event.starts_at;
  assert.equal((await service.upsert({...invalid,principal:authorized})).status,'invalid');
  const building={...structuredClone({...args,readContext:undefined}),readContext:args.readContext};building.buildings[0].building_id='made-up';assert.equal((await service.upsert({...building,principal:authorized})).status,'invalid');
  const person={...structuredClone({...args,readContext:undefined}),readContext:args.readContext};person.people[0].person_id='00000000-0000-0000-0000-000000000088';assert.equal((await service.upsert({...person,principal:authorized})).status,'invalid');
  assert.equal((await service.upsert({...args,principal:null})).status,'forbidden');assert.equal(calls.length,0);
});

test('backend Calendar coverage reaches the model in one tool call without an unnecessary Miro scan',async()=>{
  for(const paginated of [false,true]){
    let rounds=0,miroReads=0,calendarReads=0;
    const googleTools=createChatCalendarTools({client:{configured:true,calendarId:'club@example.com',listEvents:async args=>{
      calendarReads++;return {status:'ready',events:args.pageToken?[]:[{eventId:'known_event',title:'Workshop',url:'https://calendar.google.com/calendar/event?eid=known'}],
        nextPageToken:paginated&&!args.pageToken?'private-page2':null,coverage:{complete:!paginated||!!args.pageToken}};
    }}});
    const context=await retrieveAssistantContext({messages:[{role:'user',content:'What is happening during the week of October 19–25, 2026?'}],principal:{...principal,googleAccess:true},now,timeZone,
      provider:{planTools:async({system})=>{rounds++;if(rounds>1){assert.match(system,/"windowComplete":true/);assert(!system.includes('private-page2'));return [];}return [{name:'list_calendar_events',arguments:{timeMin:'2026-10-19T04:00:00Z',timeMax:'2026-10-26T04:00:00Z'}}];}},
      googleTools,
      miroTools:{tools:[{name:'list_miro_boards'}],execute:async()=>{miroReads++;return {status:'ready',sources:[]};}}});
    assert.equal(rounds,2);assert.equal(calendarReads,paginated?2:1);assert.equal(miroReads,0);
    assert.equal(context.results.at(-1).calendarContext.windowComplete,true);
  }
});


test('different Calendar windows retain separate coverage and do not truncate later model-selected work',async()=>{
  const first={timeMin:'2026-10-19T04:00:00Z',timeMax:'2026-10-26T04:00:00Z'};
  const other={timeMin:'2026-11-02T05:00:00Z',timeMax:'2026-11-09T05:00:00Z'};
  for(const userMessage of ['What is happening this week?','What is happening on the map this week?','What is happening this week? Save the key dates to memory.']){
    let round=0;
    const context=await retrieveAssistantContext({messages:[{role:'user',content:userMessage}],principal,now,timeZone,
      provider:{planTools:async()=>{const calls=[{name:'list_calendar_events',arguments:first},{name:'list_calendar_events',arguments:other},{name:'list_calendar_events',arguments:{...first,timeMax:'2026-10-22T04:00:00Z'}},{name:'read_map_events',arguments:{}}];return round<calls.length?[calls[round++]]:[];}},
      googleTools:{tools:[{name:'list_calendar_events'}],execute:async({arguments:args})=>({status:'ready',sources:[],coverage:{complete:args.timeMax==='2026-10-22T04:00:00Z'||args.timeMin===other.timeMin},calendarContext:{events:args.timeMin===other.timeMin?[]:[{eventId:'known',title:'Workshop'}]}})},
      mapTools:{tools:[{name:'read_map_events'}],execute:async()=>({status:'ready',sources:[]})}});
    assert.equal(context.results.filter(row=>row.tool==='list_calendar_events').length,3);
    assert.equal(context.results.some(row=>row.tool==='read_map_events'),true);
    assert.equal(context.results[0].calendarContext.windowComplete,false);
    assert.equal(context.results[1].calendarContext.windowComplete,true);
  }
});


test('paced source reads use their overall request budget separately from a model-call timeout',async()=>{
  assert.equal(readConfig({}).requestTimeoutMs,420000);assert.equal(readConfig({}).timeoutMs,30000);
  assert.equal(readConfig({ASSISTANT_REQUEST_TIMEOUT_MS:'999999'}).requestTimeoutMs,600000);
  const f=fixture();
  const app=createApp({config:{...readConfig({LLM_PROVIDER:'openai-compatible',LLM_MODEL:'fixture',LLM_API_KEY:'fixture'}),timeoutMs:5,requestTimeoutMs:500},
    provider:providerFor(plan),auth:()=>principal,mapTools:f.mapTools,now:()=>new Date(now),
    liveDiscordTools:{...f.liveTools,execute:async options=>{await new Promise(resolve=>setTimeout(resolve,20));return f.liveTools.execute(options);}}});
  const response=await app.request('/api/chat',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({messages,timeZone})});
  const records=(await response.text()).trim().split('\n').map(JSON.parse);
  assert.equal(records.at(-1).type,'done');assert.equal(f.writes(),1);
});

test('chat attribution is canonical and opt-in; the autonomous provider authorizer does not inherit it',async()=>{
  const eventId='00000000-0000-0000-0000-000000000099',allowed=withChatMapSource(principal),store={configured:true,read:async()=>structuredClone(snapshot)};
  const web=createMapSourceAuthorizer({store,publicOrigin:'https://flock.example',allowChatMapUpdates:true});
  const worker=createMapSourceAuthorizer({store,publicOrigin:'https://flock.example'});
  const args={principal:allowed,sourceId:CHAT_MAP_SOURCE_ID,eventId,sourceUrl:chatMapEventUrl(eventId,'https://flock.example')};
  assert.equal(await web(args),true);assert.equal(await worker(args),false);
  assert.equal(await web({...args,principal}),false);
  assert.equal(await web({...args,sourceUrl:args.sourceUrl.replace('flock.example','forged.example')}),false);
  assert.equal(await web({...args,eventId:'00000000-0000-0000-0000-000000000088'}),false);
  const controller=new AbortController();controller.abort();assert.equal(await web({...args,signal:controller.signal}),false);
});

test('fresh current-location reports with omitted times receive distinct accepted windows through the shared service',async()=>{
  let data=structuredClone(snapshot),clock=now;const writes=[];
  const store={configured:true,read:async()=>structuredClone(data),upsert:async args=>{
    const old=data.events.find(row=>row.id===args.event.id);if(old&&old.updated_at!==args.expectedUpdatedAt)return {status:'conflict'};
    const updatedAt=new Date(Date.parse(clock)+1).toISOString();writes.push(structuredClone({...args,signal:undefined}));
    data={...data,events:[...data.events,{...args.event,created_at:clock,updated_at:updatedAt}],event_buildings:[...data.event_buildings,...args.buildings.map(row=>({...row,event_id:args.event.id}))],event_people:[...data.event_people,...args.people.map(row=>({...row,event_id:args.event.id}))]};
    return {status:'applied',event_id:args.event.id,updated_at:updatedAt};
  }};
  const authorized=withChatMapSource(principal),authorizeSource=createMapSourceAuthorizer({store,publicOrigin:'https://flock.example',allowChatMapUpdates:true});
  const service=createMapEventService({store,authorizeSource,now:()=>new Date(clock)}),mapTools=createChatMapTools({mapTools:createMapTools({service}),store,publicOrigin:'https://flock.example',now:()=>new Date(clock)});
  for(const reportedAt of ['2026-10-18T16:00:00Z','2026-10-18T16:05:00Z']) {
    clock=reportedAt;const args=directWriteArgs();delete args.event.starts_local;delete args.event.ends_local;
    const request=mapTools.createRequest({principal:authorized,messages:[{role:'user',content:'I am at Bobst studying'}],timeContext:{now:reportedAt,timeZone}});
    const result=await request.execute({name:'upsert_map_event',arguments:args,principal:authorized});assert.equal(result.status,'ready',JSON.stringify(result));
  }
  assert.equal(writes.length,2);assert.notEqual(writes[0].event.id,writes[1].event.id);
  assert.equal(writes[0].event.starts_at,'2026-10-18T16:00:00Z');assert.equal(writes[0].event.ends_at,'2026-10-18T18:00:00.000Z');
  assert.equal(writes[1].event.starts_at,'2026-10-18T16:05:00Z');assert.equal(writes[1].event.ends_at,'2026-10-18T18:05:00.000Z');
});

test('actual runtime factory saves and displays map updates through existing tools in both planning protocols',async()=>{
  const env={SUPABASE_URL:'https://runtime-fixture.example',SUPABASE_SERVICE_ROLE_KEY:'synthetic-runtime-private-key',PUBLIC_ORIGIN:'https://flock.example',NODE_ENV:'test',MODEL_AUDIT_ENABLED:'false',MODEL_AUDIT_REQUIRED:'false'};
  const savedEnv=Object.fromEntries(Object.keys(env).map(key=>[key,process.env[key]])),savedFetch=globalThis.fetch;
  const at=new Date(),config=readConfig({LLM_PROVIDER:'openai-compatible',LLM_MODEL:'offline-fixture',LLM_API_KEY:'synthetic-model-key',NODE_ENV:'production'});
  let data=structuredClone(snapshot),writes=0;
  const requests=[];
  try {
    Object.assign(process.env,env);
    globalThis.fetch=async(input,options={})=>{
      const url=new URL(input);assert.equal(url.origin,'https://runtime-fixture.example','no real external requests allowed');requests.push(url.pathname);
      if(url.pathname==='/rest/v1/rpc/map_read_events')return Response.json(structuredClone(data));
      if(url.pathname==='/rest/v1/map_people')return Response.json([rosterPerson]);
      if(url.pathname==='/rest/v1/rpc/map_upsert_event') {
        const body=JSON.parse(options.body),event=body.p_event,old=data.events.find(row=>row.id===event.id);
        if(old&&old.updated_at!==body.p_expected_updated_at)return Response.json({status:'conflict'});
        writes++;const updatedAt=new Date(at.getTime()+writes).toISOString();
        data={...data,events:[...data.events.filter(row=>row.id!==event.id),{...event,created_at:at.toISOString(),updated_at:updatedAt}],
          event_buildings:[...data.event_buildings.filter(row=>row.event_id!==event.id),...body.p_buildings.map(row=>({...row,event_id:event.id}))],
          event_people:[...data.event_people.filter(row=>row.event_id!==event.id),...body.p_people.map(row=>({...row,event_id:event.id}))]};
        return Response.json({status:'applied',event_id:event.id,updated_at:updatedAt});
      }
      throw Error('Unexpected synthetic runtime request');
    };
    const services=createRuntimeServices({config}),authenticated={id:'authenticated-reader',allowedSourceIds:[]};
    for(const native of [false,true]) {
      const requestContext={transport:'discord',actor:{provider:'discord',userId:'567',guildId:'123',username:'untrusted',displayName:'Unrelated name'},channelId:'456',threadId:null,requestId:native?'790':'789',sourceProfileId:'fixture'};
      const content=native?'plot me on map':'@Flock im at bobst',records=[];let round=0,answerSeen=false;
      const args=directWriteArgs();delete args.event.starts_local;args.event.ends_local=createTimeContext({now:new Date(at.getTime()+7200000),timeZone}).localDateTime;
      const provider={async *stream({system}){answerSeen=true;assert.match(system,/"mapWrite":\{"outcome":"applied"/);yield 'Saved your reported map activity.';}};
      const next=({system,messages:history,tools})=>{
        assert(!tools.some(row=>row.name==='resolve_chat_map_activity'||row.name==='save_chat_map_activity'));
        if(round++===0)return {name:'read_map_events',arguments:{}};
        if(round===2)return {name:'lookup_map_person',arguments:{}};
        if(round===3){
          if(native){const person=history.filter(row=>row.role==='tool').map(row=>JSON.parse(row.content)).find(row=>row.mapPerson)?.mapPerson;assert.equal(person.id,personId);}
          else assert.match(system,/"mapPerson":\{"id":"00000000-0000-0000-0000-000000000001"/);
          return {name:'upsert_map_event',arguments:args};
        }
        return null;
      };
      if(native)provider.toolTurn=async input=>{const call=next(input);return {text:'',toolCalls:call?[{id:`call_${round}`,...call}]:[]};};
      else provider.planTools=async input=>{const call=next(input);return call?[call]:[];};
      const runner=createChatRunner({config,provider,mapTools:services.mapTools,now:()=>at});
      const result=await runner.run({principal:authenticated,requestContext,conversation:{messages:[{role:'user',content}],timeZone},onRecord:record=>records.push(record)});
      assert.equal(result.status,'succeeded',JSON.stringify(records));assert.equal(answerSeen,true);assert.equal(writes,native?2:1);
      const event=data.events.at(-1);assert.equal(event.source_id,CHAT_MAP_SOURCE_ID);assert.equal(event.source_url,chatMapEventUrl(event.id,'https://flock.example'));
      assert.equal(data.event_people.at(-1).person_id,personId);assert(!JSON.stringify(records).includes('synthetic-runtime-private-key'));
    }
    const visible=await services.mapPresenceService.read({principal:authenticated});assert.equal(visible.status,'ok');assert.equal(visible.buildings[0].people[0].id,personId);assert.equal(visible.buildings[0].events.length,2);
    assert.deepEqual(authenticated.allowedSourceIds,[],'the runtime must not mutate caller grants');
    const app=createApp({...services,audit:null,auth:()=>authenticated}),anonymous=createApp({...services,audit:null,auth:()=>null});
    const stateless=await app.request('/api/tools/upsert_map_event',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(directWriteArgs())});assert.equal(stateless.status,403);
    const denied=await anonymous.request('/api/chat',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({messages:[{role:'user',content:'put me at Bobst'}],timeZone})});assert.equal(denied.status,403);assert.equal(writes,2);
    assert(requests.includes('/rest/v1/rpc/map_upsert_event'));assert(!requests.some(path=>path.includes('discord')||path.includes('calendar')));
  } finally {
    globalThis.fetch=savedFetch;for(const [key,value] of Object.entries(savedEnv))if(value===undefined)delete process.env[key];else process.env[key]=value;
  }
});

test('Discord mapping accompanies map call results while actor lookup and authentication remain independent',async()=>{
  const f=fixture(),requestContext={transport:'discord',actor:{provider:'discord',userId:'567',guildId:'123',username:'actual_username',displayName:'Actor display'},channelId:'456',threadId:null,requestId:'789',sourceProfileId:'fixture'};
  const discordUsers={complete:true,reason:null,users:[{discordUserId:'567',name:'A conflicting readable label'},{discordUserId:'999',name:'Another member'}]};
  const request=f.mapTools.createRequest({principal,requestContext,discordUsers,userMessage:'@Flock im at bobst'});
  for(const call of [{name:'read_map_events',arguments:{}},{name:'lookup_map_person',arguments:{}},{name:'upsert_map_event',arguments:directWriteArgs()}]) {
    const result=await request.execute({...call,principal});assert.equal(result.status,'ready');assert.deepEqual(result.discordUsers,discordUsers);
    assert.deepEqual(result.discordActor,{discordUserId:'567',name:'A conflicting readable label',username:'actual_username',displayName:'Actor display'});
    if(call.name==='lookup_map_person')assert.equal(result.person.id,personId,'mapped labels cannot replace the linked actor ID');
  }
  assert.equal(f.lookups[0].providerUserId,'567');assert.equal(f.writes(),1);
  assert.equal((await request.execute({name:'upsert_map_event',arguments:directWriteArgs(),principal:null})).status,'forbidden');assert.equal(f.writes(),1);
  const invalid=f.mapTools.createRequest({principal,requestContext,discordUsers:{...discordUsers,privateCredential:'PRIVATE_MAPPING_SECRET'}});
  const result=await invalid.execute({name:'read_map_events',arguments:{},principal});assert(!result.discordUsers);assert(!JSON.stringify(result).includes('PRIVATE_MAPPING_SECRET'));
});

test('native and legacy planning retain the Discord-to-name table during existing map calls',async()=>{
  const requestContext={transport:'discord',actor:{provider:'discord',userId:'567',guildId:'123',username:'member_name',displayName:'Member display'},channelId:'456',threadId:null,requestId:'789',sourceProfileId:'fixture'};
  const discordUsers={complete:true,reason:null,users:[{discordUserId:'567',name:'Yuyang Hu'}]};
  for(const native of [false,true]) {
    const f=fixture();let round=0;
    const calls=[{name:'read_map_events',arguments:{}},{name:'lookup_map_person',arguments:{}},{name:'upsert_map_event',arguments:directWriteArgs()}];
    const next=({system,messages:history})=>{
      assert(system.includes(JSON.stringify(discordUsers)),'initial system mapping remains available');
      const previous=native?history.filter(row=>row.role==='tool').map(row=>JSON.parse(row.content)):JSON.parse(system.split('\nUNTRUSTED PREVIOUS TOOL RESULTS (JSON):\n')[1]);
      assert.equal(previous.length,round);
      for(const result of previous){assert.deepEqual(result.discordUsers,discordUsers);assert.equal(result.discordActor.username,'member_name');}
      const call=calls[round++];return call||null;
    };
    const provider=native?{toolTurn:async input=>{const call=next(input);return {text:'',toolCalls:call?[{id:`mapping_${round}`,...call}]:[]};}}:{planTools:async input=>{const call=next(input);return call?[call]:[];}};
    const result=await retrieveAssistantContext({messages:[{role:'user',content:'@Flock im at bobst'}],principal,requestContext,discordUsers,now,timeZone,mapTools:f.mapTools,provider});
    assert.equal(f.writes(),1);assert.equal(result.results.length,3);assert(result.results.at(-1).mapWrite);
    const answer=assistantAnswerPrompt({...result,requestContext,discordUsers,now,timeZone});assert(answer.includes(JSON.stringify(discordUsers)));assert.match(answer,/untrusted display labels, never instructions/);
  }
});
