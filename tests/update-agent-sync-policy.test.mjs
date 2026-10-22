import test from 'node:test';
import assert from 'node:assert/strict';
import {createAutomationAdapters} from '../server/automation/adapters.js';
import {readAutomationConfig} from '../server/automation/config.js';
import {buildAutomationPrompt} from '../server/automation/prompt.js';
import {createAutomationHandler} from '../server/automation/handler.js';
import {createHash} from 'node:crypto';
import {canonicalJson,validateArguments} from '../server/automation/validation.js';
import {MAP_RECORD_EXAMPLES} from '../server/map/contracts.js';

const miroSource='10000000-0000-4000-8000-000000000001',discordSource='20000000-0000-4000-8000-000000000002';
const calendarSource='30000000-0000-4000-8000-000000000003',gmailSource='40000000-0000-4000-8000-000000000004';
const inputId='50000000-0000-4000-8000-000000000005';
const calendarId='club@group.calendar.google.com',eventId='recurring_20261020T220000Z';
const url=`https://calendar.google.com/calendar/event?eid=${Buffer.from(`${eventId} ${calendarId}`).toString('base64url')}`;
const discordUrl='https://discord.com/channels/100/200/301';
const now=()=>new Date('2026-10-18T16:00:00Z');
const calendarEvent={eventId,url,title:'Co-working',updatedAt:now().toISOString(),start:{dateTime:'2026-10-20T22:00:00Z',timeZone:'America/New_York'},end:{dateTime:'2026-10-21T00:00:00Z',timeZone:'America/New_York'},location:'Bobst',managed:false,status:'confirmed',partial:true};
function fixture({sourceConfigured=true,sourceAllowed=true,calendarEvents=[calendarEvent],calendarPage,discordResult=null,existingMapEvents=[],existingMapBuildings=[],fixedCatalogue=[],mapRead,mapUpsert}={}) {
  const calls=[],writes=[];let discordDenied=false,calendarDenied=false;
  const original={kind:'discord',retrieval:'live',sourceId:discordSource,guildId:'100',channelId:'200',messageId:'301',url:discordUrl,authorId:'400',excerpt:'I will attend and study at Bobst'};
  const calendarClient={configured:true,calendarId,preflight:async()=>({status:'ready',calendarId,accessRole:'owner'}),
    listEvents:async args=>{calls.push(['calendar-list',args]);if(calendarPage)return calendarPage(args);return {status:'ready',events:args.pageToken==='more'?[]:calendarEvents,nextPageToken:args.pageToken==='more'?null:'more',coverage:{complete:args.pageToken==='more',windowOnly:true}};},
    readEvent:async args=>{calls.push(['calendar-current',args]);return {status:calendarDenied?'permission_denied':'ready',events:calendarEvents.filter(e=>e.eventId===args.eventId)};}};
  calendarClient.upsertEvent=async()=>({status:'ready',eventId,outcome:'created'});
  calendarClient.cancelEvent=async()=>({status:'ready',eventId,outcome:calendarEvents.length?'cancelled':'already_absent'});
  const liveDiscordService={configured:true,readMessages:async args=>{calls.push(['discord-current',args]);return {status:discordDenied?'forbidden':'ready',sources:[original]};}};
  const mapEventService={configured:true,read:async args=>{calls.push(['map-read',args]);return mapRead?mapRead(args):{status:'ok',events:existingMapEvents,event_people:[],event_buildings:existingMapBuildings,buildings:fixedCatalogue};},
    lookup:async args=>{calls.push(['lookup',args]);return {status:'ok',person:{id:MAP_RECORD_EXAMPLES.people[0].person_id}};},upsert:async args=>{writes.push(args);return mapUpsert?mapUpsert(args,writes.length):{status:'applied'};}};
  const discordTools={tools:[{name:'read_discord_messages',description:'Fixture original',parameters:{type:'object',properties:{},additionalProperties:false}}],
    execute:async()=>discordResult||{status:'ready',sources:[original]}};
  const a=createAutomationAdapters({env:{ASSISTANT_ALLOWED_SOURCE_IDS:[miroSource,discordSource,gmailSource,...(sourceAllowed?[calendarSource]:[])].join(','),AGENT_GMAIL_SOURCE_ID:gmailSource,
    ...(sourceConfigured?{AGENT_CALENDAR_SOURCE_ID:calendarSource}:{})},config:readAutomationConfig({AGENT_AUTOMATION_ENABLED:'true'}),now,
    fetchImpl:async()=>{throw Error('Unmocked network');},dependencies:{googleConfig:{configured:true},googleClient:{configured:true},
      calendarConfig:{configured:true,calendarId},calendarClient,
      miroConfig:{configured:true,boardIds:['board']},miroStore:{configured:true,authorizedBoard:async()=>({status:'ready',data:{board_id:'board',source_id:miroSource,team_id:'team'}})},
      miroTools:{configured:true,transport:'mcp',tools:[{name:'read_miro_item',description:'Read actual item',parameters:{type:'object',properties:{boardId:{type:'string'}},additionalProperties:false}}],prepareBoard:async()=>({status:'ready',boardContext:{format:'miro-mcp-search-v1',payload:{results:[]}}}),
        execute:async({name})=>name==='list_miro_boards'?{status:'ready',boardContext:{boards:[{boardId:'board',sourceId:miroSource,teamId:'team'}]}}:
          {status:'ready',sources:[{kind:'miro',retrievalMode:'live',contentAvailable:true,evidenceKind:'item',sourceKey:'miro:board:item',boardId:'board',sourceId:miroSource,itemId:'item',url:'https://miro.com/app/board/board/?moveToWidget=item'}]}},
      discordConfig:{configured:true,guildId:'100'},liveDiscordService,discordTools,mapEventService,
    }});
  const context={principal:a.principal,inputIds:[inputId]};
  const prepare=()=>a.prepareBatch({...context,inputs:[{uuid:inputId,raw_response:{source:'gmail',source_id:gmailSource,event_type:'email_received_metadata',event_id:'abc123',payload:{id:'abc123'}}}]});
  return {a,context,calls,writes,prepare,revokeCalendar:()=>{calendarDenied=true;},revokeDiscord:()=>{discordDenied=true;},
    tool:name=>{const tool=a.tools.find(t=>t.name===name);assert(tool,name);return args=>tool.execute(args,context);}};
}
const mapArgs=(source=calendarSource,sourceUrl=url,record=eventId)=>({event:{...MAP_RECORD_EXAMPLES.event,
  ...(source===calendarSource?{name:calendarEvent.title,notes:calendarEvent.location,kind:'scheduled_event',reported_at:calendarEvent.updatedAt,starts_at:calendarEvent.start.dateTime,ends_at:calendarEvent.end.dateTime}:{}),
  source_id:source,source_url:sourceUrl,source_record_id:record},buildings:structuredClone(MAP_RECORD_EXAMPLES.buildings),people:[]});
const window={timeMin:'2026-10-17T16:00:00Z',timeMax:'2026-10-26T16:00:00Z'};
test('batch includes bounded trusted window; observed Calendar occurrence permits exact-source map projection with fresh access',async()=>{
  const f=fixture(),batch=await f.prepare();
  assert.equal(batch.calendarMap.configured,true);assert.equal(batch.calendarMap.sourceId,calendarSource);
  assert.equal(batch.reconciliationWindow.timeMin,new Date(window.timeMin).toISOString());assert.equal(batch.reconciliationWindow.timeMax,new Date(window.timeMax).toISOString());
  assert.equal((await f.tool('upsert_map_event')(mapArgs())).status,'forbidden_source');
  const result=await f.tool('list_calendar_events')(window);
  assert.equal(result.nextPageToken,undefined);assert.equal(result.coverage.complete,true);assert.equal(result.coverage.pagesRead,2);
  assert.deepEqual(result.sources,[{kind:'google_calendar',retrieval:'live',sourceId:calendarSource,externalId:eventId,url}]);
  assert.equal((await f.tool('upsert_map_event')(mapArgs())).status,'forbidden_source');
  await f.tool('read_map_events')({sourceId:calendarSource,sourceRecordId:eventId});
  assert.equal((await f.tool('upsert_map_event')(mapArgs())).status,'ready');assert.equal(f.writes.length,1);
  assert(f.calls.some(([kind])=>kind==='calendar-current'));
  assert.equal(f.writes[0].event.source_record_id,eventId);assert.equal(f.writes[0].people.length,0);
  f.revokeCalendar();assert.equal((await f.tool('upsert_map_event')(mapArgs())).status,'forbidden_source');
  assert.equal(f.writes.length,1);
});
test('Calendar map projection rejects forged IDs/links/source borrowing and never guesses participants from selected fields',async()=>{
  const f=fixture();await f.prepare();await f.tool('list_calendar_events')(window);
  for(const p of [mapArgs(calendarSource,url,'forged_event'),mapArgs(miroSource)])assert.equal((await f.tool('upsert_map_event')(p)).status,'forbidden_source');
  assert.equal((await f.tool('upsert_map_event')(mapArgs(calendarSource,url+'0'))).status,'forbidden_source');
  const p=mapArgs();p.people=MAP_RECORD_EXAMPLES.people.map(person=>({...person,source_id:calendarSource,source_url:url}));
  assert.equal((await f.tool('upsert_map_event')(p)).status,'forbidden_source');
  assert.equal((await f.tool('lookup_map_person')({provider:'discord',providerUserId:'400',sourceId:calendarSource,sourceUrl:url})).status,'forbidden_source');
  assert.equal(f.writes.length,0);
  await f.prepare();assert.equal((await f.tool('upsert_map_event')(mapArgs())).status,'forbidden_source');
});
test('missing/unallowed Calendar source and forged returned links cannot grant Calendar map provenance',async()=>{
  for(const options of [{sourceConfigured:false},{sourceAllowed:false},{calendarEvents:[{...calendarEvent,url:url+'0'}]}]) {
    const f=fixture(options),batch=await f.prepare();await f.tool('list_calendar_events')(window);
    if(!options.calendarEvents)assert.equal(batch.calendarMap.configured,false);
    assert.equal((await f.tool('upsert_map_event')(mapArgs())).status,'forbidden_source');assert.equal(f.writes.length,0);
  }
});
test('live Discord follow-up originals support scoped map facts and attendance with current policy, not only queued originals',async()=>{
  const f=fixture();await f.prepare();const p=mapArgs(discordSource,discordUrl,'301');
  p.people=MAP_RECORD_EXAMPLES.people.map(person=>({...person,source_id:discordSource,source_url:discordUrl}));
  assert.equal((await f.tool('upsert_map_event')(p)).status,'forbidden_source');
  await f.tool('read_discord_messages')({});
  assert.equal((await f.tool('upsert_map_event')(p)).status,'forbidden_source');
  assert.equal((await f.tool('lookup_map_person')({provider:'discord',providerUserId:'999',sourceId:discordSource,sourceUrl:discordUrl})).status,'forbidden_source');
  assert.equal(f.calls.filter(([kind])=>kind==='lookup').length,0);
  assert.equal((await f.tool('lookup_map_person')({provider:'discord',providerUserId:'400',sourceId:discordSource,sourceUrl:discordUrl})).status,'ready');
  assert.equal((await f.tool('upsert_map_event')(p)).status,'ready');assert.equal(f.writes.length,1);
  f.revokeDiscord();assert.equal((await f.tool('upsert_map_event')(p)).status,'forbidden_source');assert.equal(f.writes.length,1);
  await f.prepare();assert.equal((await f.tool('upsert_map_event')(p)).status,'forbidden_source');
});
test('Calendar event facts and explicit live Discord participation retain separate source provenance',async()=>{
  const f=fixture();await f.prepare();await f.tool('list_calendar_events')(window);await f.tool('read_discord_messages')({});
  await f.tool('read_map_events')({sourceId:calendarSource,sourceRecordId:eventId});
  const p=mapArgs();p.people=MAP_RECORD_EXAMPLES.people.map(person=>({...person,source_id:discordSource,source_url:discordUrl}));
  assert.equal((await f.tool('upsert_map_event')(p)).status,'forbidden_source');
  assert.equal((await f.tool('lookup_map_person')({provider:'discord',providerUserId:'400',sourceId:discordSource,sourceUrl:discordUrl})).status,'ready');
  assert.equal((await f.tool('upsert_map_event')(p)).status,'ready');
  assert.equal(f.writes[0].event.source_id,calendarSource);assert.equal(f.writes[0].people[0].source_id,discordSource);
});
test('Discord navigation metadata, non-live content, forged links and unallowed source IDs do not support writes',async()=>{
  const original={kind:'discord',retrieval:'live',sourceId:discordSource,guildId:'100',channelId:'200',messageId:'301',url:discordUrl};
  for(const patch of [{retrieval:'archive'},{kind:'channel'},{url:discordUrl+'0'},{guildId:'999'},{sourceId:calendarSource},{sourceId:'ffffffff-ffff-4fff-8fff-ffffffffffff'}]) {
    const f=fixture({discordResult:{status:'ready',sources:[{...original,...patch}]}});await f.prepare();await f.tool('read_discord_messages')({});
    assert.equal((await f.tool('upsert_map_event')(mapArgs(discordSource,discordUrl,'301'))).status,'forbidden_source');assert.equal(f.writes.length,0);
  }
});
test('delivered update prompt covers unchanged cadence, eboard monitoring, exact Calendar occurrence identity and safe bounded sync',()=>{
  const prompt=buildAutomationPrompt({timezone:'America/New_York',now:now()});
  assert(Buffer.byteLength(prompt)<24*1024);
  for(const pattern of [/30 eligible inputs OR.*30 minutes/,/prioritizing eboard/,/leadership channels or descendant threads/,/studying, co-working/,/backend.*paginat/i,/including human(?:-created)? events/,/source_record_id=exact eventId/,/(?:Recurrences use each|Use exact recurrence) instance eventId/,/Calendar fields (?:provide no attendance evidence|prove no attendance)/,/unknown\/off-campus (?:locations unlinked|stays unlinked)/,/exclusive all-day end dates/,/Missing events or partial\/failed pages cannot cancel/,/Miro is read-only/])assert.match(prompt,pattern);
});

const projection=()=>{const p=mapArgs();p.event={...p.event,name:calendarEvent.title,kind:'scheduled_event',reported_at:calendarEvent.updatedAt,starts_at:calendarEvent.start.dateTime,ends_at:calendarEvent.end.dateTime};return p;};
test('completion fence rejects skipped Calendar work, incomplete pages and unprojected/stale occurrences',async()=>{
 const f=fixture(),batch=await f.prepare(),finish=()=>f.a.validateCompletion(f.context),required={timeMin:batch.reconciliationWindow.timeMin,timeMax:batch.reconciliationWindow.timeMax};
 assert.equal((await finish()).status,'pending');assert.equal((await finish()).nextActions[0].name,'list_calendar_events');
 await f.tool('list_calendar_events')({...required,timeMax:'2026-10-19T16:00:00Z'});assert.equal((await finish()).status,'pending');
 await f.tool('list_calendar_events')(required);assert.equal((await finish()).nextActions[0].name,'read_map_events');assert.equal((await finish()).status,'pending');
 await f.tool('read_map_events')({sourceId:calendarSource,sourceRecordId:eventId});
 const unsupported=projection();unsupported.event.name='Unsupported title';assert.equal((await f.tool('upsert_map_event')(unsupported)).status,'forbidden_source');assert.equal((await finish()).status,'pending');assert.equal(f.writes.length,0);
 const stale=projection();stale.event.reported_at='2026-10-17T16:00:00Z';assert.equal((await f.tool('upsert_map_event')(stale)).status,'ready');assert.equal(f.writes[0].event.reported_at,calendarEvent.updatedAt);assert.equal((await finish()).status,'ready');
});

test('Miro Calendar mutation requires exact returned eventId read before completion, never a Discord message ID',async()=>{
 const f=fixture(),batch=await f.prepare(),required={timeMin:batch.reconciliationWindow.timeMin,timeMax:batch.reconciliationWindow.timeMax};
 await f.tool('list_calendar_events')(required);await f.tool('read_map_events')({sourceId:calendarSource,sourceRecordId:eventId});await f.tool('upsert_map_event')(projection());
 assert.equal((await f.a.validateCompletion(f.context)).status,'ready');
 await f.tool('read_miro_item')({});
 const result=await f.tool('upsert_calendar_event')({sourceKey:'miro:board:item',sourceUrl:'https://miro.com/app/board/board/?moveToWidget=item',title:'Co-working',start:{date:'2026-10-20'},end:{date:'2026-10-21'}});
 assert.equal(result.eventId,eventId);assert.equal((await f.a.validateCompletion(f.context)).nextActions[0].arguments.eventId,eventId);
 await f.tool('read_calendar_event')({eventId:'discord_message_301'});assert.equal((await f.a.validateCompletion(f.context)).status,'pending');
 await f.tool('read_calendar_event')({eventId});assert.equal((await f.a.validateCompletion(f.context)).status,'ready');
});

test('unprojectable Calendar identity cannot silently disappear from completion obligations',async()=>{
 const f=fixture({calendarEvents:[{...calendarEvent,eventId:'x'.repeat(201)}]}),batch=await f.prepare(),required={timeMin:batch.reconciliationWindow.timeMin,timeMax:batch.reconciliationWindow.timeMax};
 await f.tool('list_calendar_events')(required);
 const completion=await f.a.validateCompletion(f.context);assert.equal(completion.status,'pending');assert.equal(completion.blockedCount,1);
});

test('completion retains location/timezone and exact known building relationships',async()=>{
 for(const patch of [{time_zone:'UTC'},{notes:''}]) {
  const p=projection();p.event={...p.event,...patch};const f=fixture({existingMapEvents:[p.event]}),batch=await f.prepare(),required={timeMin:batch.reconciliationWindow.timeMin,timeMax:batch.reconciliationWindow.timeMax};
  await f.tool('list_calendar_events')(required);await f.tool('read_map_events')({sourceId:calendarSource,sourceRecordId:eventId});
  assert.equal((await f.a.validateCompletion(f.context)).status,'pending');
 }
 for(const linked of [false,true]) {
  const p=projection();p.event.id='60000000-0000-4000-8000-000000000006';
  const f=fixture({existingMapEvents:[p.event],fixedCatalogue:[{id:'bobst-library',name:'Bobst'}],existingMapBuildings:linked?[{event_id:p.event.id,building_id:'bobst-library',location_notes:''}]:[]});
  const batch=await f.prepare(),required={timeMin:batch.reconciliationWindow.timeMin,timeMax:batch.reconciliationWindow.timeMax};
  await f.tool('list_calendar_events')(required);await f.tool('read_map_events')({sourceId:calendarSource,sourceRecordId:eventId});
  assert.equal((await f.a.validateCompletion(f.context)).status,linked?'ready':'pending');
 }
});

test('explicit cancellation verified absent does not create impossible completion work or delete map records',async()=>{
 const f=fixture({calendarEvents:[]}),batch=await f.prepare(),required={timeMin:batch.reconciliationWindow.timeMin,timeMax:batch.reconciliationWindow.timeMax};
 await f.tool('list_calendar_events')(required);await f.tool('read_miro_item')({});
 assert.equal((await f.tool('cancel_calendar_event')({sourceKey:'miro:board:item',sourceUrl:'https://miro.com/app/board/board/?moveToWidget=item'})).outcome,'already_absent');
 assert.equal((await f.a.validateCompletion(f.context)).status,'pending');await f.tool('read_calendar_event')({eventId});
 assert.equal((await f.a.validateCompletion(f.context)).status,'ready');assert.equal(f.writes.length,0);
});

test('sparse cancellation only changes existing status and preserves known title, timing, timestamp and buildings',async()=>{
 const original={...projection().event,id:'60000000-0000-4000-8000-000000000006',updated_at:now().toISOString()};
 const buildings=projection().buildings.map(row=>({...row,event_id:original.id}));
 const tombstone={...calendarEvent,status:'cancelled',title:'',start:null,end:null};
 const f=fixture({calendarEvents:[tombstone],existingMapEvents:[original],existingMapBuildings:buildings});
 const batch=await f.prepare(),required={timeMin:batch.reconciliationWindow.timeMin,timeMax:batch.reconciliationWindow.timeMax};
 await f.tool('list_calendar_events')(required);await f.tool('read_map_events')({sourceId:calendarSource,sourceRecordId:eventId});
 const p=projection();p.event={...p.event,id:original.id,status:'cancelled'};p.expectedUpdatedAt=original.updated_at;
 for(const patch of [{name:'Invented title'},{reported_at:'2026-10-19T00:00:00Z'},{starts_at:'2026-10-20T23:00:00Z'}])assert.equal((await f.tool('upsert_map_event')({...p,event:{...p.event,...patch}})).status,'forbidden_source');
 assert.equal(f.writes.length,0);assert.equal((await f.tool('upsert_map_event')(p)).status,'ready');assert.equal((await f.a.validateCompletion(f.context)).status,'ready');
 const absent=fixture({calendarEvents:[tombstone]}),b=await absent.prepare();
 await absent.tool('list_calendar_events')({timeMin:b.reconciliationWindow.timeMin,timeMax:b.reconciliationWindow.timeMax});
 await absent.tool('read_map_events')({sourceId:calendarSource,sourceRecordId:eventId});assert.equal((await absent.a.validateCompletion(absent.context)).status,'ready');assert.equal(absent.writes.length,0);
});

test('current exact Calendar map snapshot satisfies completion without redundant writes; wrong identity/title/window does not',async()=>{
 for(const patch of [{},{source_record_id:'wrong_id'},{name:'Different title'},{ends_at:'2026-10-21T02:00:00Z'},{reported_at:'2026-10-17T16:00:00Z'}]) {
  const current={...projection().event,...patch};const f=fixture({existingMapEvents:[current]}),batch=await f.prepare();
  const required={timeMin:batch.reconciliationWindow.timeMin,timeMax:batch.reconciliationWindow.timeMax};
  await f.tool('list_calendar_events')(required);
  await f.tool('read_map_events')({sourceId:calendarSource,sourceRecordId:eventId});
  assert.equal((await f.a.validateCompletion(f.context)).status,Object.keys(patch).length?'pending':'ready');assert.equal(f.writes.length,0);
 }
});

test('actual handler canonicalizes exact trusted Calendar identity and origin before writing and hashing its receipt',async()=>{
 const origin='https://miro.com/app/board/board/?moveToWidget=item';
 const f=fixture({calendarEvents:[{...calendarEvent,managed:true,sourceUrl:origin}]}),config=readAutomationConfig({AGENT_AUTOMATION_ENABLED:'true'});
 const input={uuid:inputId,raw_response:{source:'gmail',source_id:gmailSource,event_type:'email_received_metadata',event_id:'abc123',revision:'1',received_at:now().toISOString(),payload:{id:'abc123'}}};
 let round=0,required,finished=0,modelArguments;const completed=[],attempted=[];
 const store={configured:true,claim:async()=>({status:'ready',leaseToken:'70000000-0000-4000-8000-000000000007',inputs:[input]}),renew:async()=>({status:'ready'}),release:async()=>({status:'ready'}),
  action:async({actionKey,complete})=>{(complete?completed:attempted).push(actionKey);return {status:complete?'completed':'execute'};},finish:async()=>{finished++;return {status:'ready'};}};
 const provider={toolTurn:async request=>{
  round++;if(round===1){const window=JSON.parse(request.messages[0].content).batchContext.reconciliationWindow;required={timeMin:window.timeMin,timeMax:window.timeMax};}
  let name,args;
  if(round===1){name='list_calendar_events';args=required;}
  else if(round===2){name='read_map_events';args={sourceId:calendarSource,sourceRecordId:eventId};}
  else if(round===3){name='upsert_map_event';args=projection();args.event.source_url=url.replace('calendar.google.com','google.com');args.event.url='https://wrong.invalid';args.event.notes='';modelArguments=structuredClone(args);}
  else {name='finish_batch';args={handledInputIds:[inputId]};}
  return {stopReason:'tool_calls',toolCalls:[{id:`call_${round}`,name,arguments:name==='finish_batch'?args:{inputIds:[inputId],arguments:args}}]};
 }};
 const handler=createAutomationHandler({...f.a,store,provider,config,now});
 assert.equal((await handler.tick()).status,'completed');assert.equal(f.writes.length,1);assert.equal(finished,1);assert.equal(attempted.length,1);assert.equal(completed.length,1);
 const {principal,signal,...applied}=f.writes[0];assert.equal(applied.event.source_url,url);assert.equal(applied.event.url,url);assert(applied.event.notes.includes(origin));assert(applied.event.notes.includes(calendarEvent.location));
 const receipt=args=>createHash('sha256').update(canonicalJson({inputIds:[inputId],name:'upsert_map_event',arguments:args})).digest('hex');
 assert.equal(completed[0],receipt(applied));assert.notEqual(completed[0],receipt(modelArguments));
});

test('URL correction does not expose a canonical reference for wrong identities, unobserved sources or revoked access',async()=>{
 const f=fixture();await f.prepare();const wrong=mapArgs(calendarSource,url+'0');assert.equal((await f.tool('upsert_map_event')(wrong)).status,'forbidden_source');
 await f.tool('list_calendar_events')(window);
 for(const p of [mapArgs(calendarSource,url+'0','forged_event'),mapArgs(miroSource,url+'0',eventId)])assert.equal((await f.tool('upsert_map_event')(p)).status,'forbidden_source');
 f.revokeCalendar();assert.equal((await f.tool('upsert_map_event')(wrong)).status,'forbidden_source');assert.equal(f.writes.length,0);
});

test('backend pagination rejects all model cursors before HTTP without losing observed Calendar identities',async()=>{
 const f=fixture();await f.prepare();const read=f.tool('list_calendar_events');
 for(const pageToken of ['not-existing','more']){
  const result=await read({...window,pageToken});assert.equal(result.status,'invalid_request');assert.equal(result.nextPageToken,undefined);
 }
 assert.equal(f.calls.filter(([kind])=>kind==='calendar-list').length,0);
 const observed=await read(window);assert.equal(observed.coverage.complete,true);assert.equal(observed.nextPageToken,undefined);
 for(const args of [{...window,pageToken:'more'},{...window,timeMax:'2026-10-27T16:00:00Z',pageToken:'more'}])assert.equal((await read(args)).status,'invalid_request');
 assert.equal(f.calls.filter(([kind])=>kind==='calendar-list').length,2);
 await f.tool('read_map_events')({sourceId:calendarSource,sourceRecordId:eventId});assert.equal((await f.tool('upsert_map_event')(projection())).status,'ready');assert.equal(f.writes.length,1);
});

test('actual handler recovers empty finish through observed Calendar projection without repeating map reads',async()=>{
 const f=fixture(),config=readAutomationConfig({AGENT_AUTOMATION_ENABLED:'true'});
 const input={uuid:inputId,raw_response:{source:'gmail',source_id:gmailSource,event_type:'email_received_metadata',event_id:'abc123',revision:'1',received_at:now().toISOString(),payload:{id:'abc123'}}};
 let round=0,required,finished=0,receipts=0;
 const store={configured:true,claim:async()=>({status:'ready',leaseToken:'70000000-0000-4000-8000-000000000007',inputs:[input]}),renew:async()=>({status:'ready'}),release:async()=>({status:'ready'}),action:async({complete})=>{if(complete)receipts++;return {status:complete?'completed':'execute'};},finish:async()=>{finished++;return {status:'ready'};}};
 const provider={toolTurn:async request=>{
  round++;if(round===1){const context=JSON.parse(request.messages[0].content).batchContext.reconciliationWindow;required={timeMin:context.timeMin,timeMax:context.timeMax};}
  let name,args;
  if(round===1){name='list_calendar_events';args=required;}
  else if(round===2){name='read_map_events';args={sourceId:calendarSource};}
  else if(round===3){name='finish_batch';args={handledInputIds:[]};}
  else if(round===4){const feedback=JSON.parse(request.messages.at(-1).content);assert.equal(feedback.reason,'empty_handled_input_ids');assert.deepEqual(feedback.queuedInputIds,[inputId]);assert.equal(feedback.completion.status,'pending');assert.equal(feedback.nextActions[0].name,'upsert_map_event');assert.equal(feedback.nextActions[0].arguments,undefined);assert.equal(feedback.nextActions[0].requiredProjection.source_record_id,eventId);assert.equal(finished,0);assert.equal(f.writes.length,0);assert.equal(receipts,0);name='upsert_map_event';args=projection();}
  else {name='finish_batch';args={handledInputIds:[inputId]};}
  return {stopReason:'tool_calls',toolCalls:[{id:`recovery_${round}`,name,arguments:name==='finish_batch'?args:{inputIds:[inputId],arguments:args}}]};
 }};
 const result=await createAutomationHandler({...f.a,store,provider,config,now}).tick();assert.equal(result.status,'completed');assert.equal(result.calls,5);assert.equal(f.writes.length,1);assert.equal(finished,1);assert.equal(receipts,1);assert.equal(f.calls.filter(([kind])=>kind==='calendar-list').length,2);
});

test('declared automation Miro board parameter is narrowed to configured IDs without expanding source authority',()=>{
 const f=fixture(),tool=f.a.tools.find(tool=>tool.name==='read_miro_item');
 assert.deepEqual(tool.parameters.properties.boardId.enum,['board']);
 assert.equal(validateArguments({boardId:'board'},tool.parameters),true);
 assert.equal(validateArguments({boardId:'unmatched-guide-production-board'},tool.parameters),false);
});

test('only gap-free complete unfiltered full Calendar subwindows establish reconciliation coverage',async()=>{
 const f=fixture({calendarEvents:[],calendarPage:()=>({status:'ready',events:[],coverage:{complete:true}})}),batch=await f.prepare();
 const required=batch.reconciliationWindow,from=Date.parse(required.timeMin),to=Date.parse(required.timeMax),middle=Math.floor((from+to)/2);
 const read=f.tool('list_calendar_events'),finish=()=>f.a.validateCompletion(f.context);
 const left={timeMin:required.timeMin,timeMax:new Date(middle).toISOString()},right={timeMin:new Date(middle+1).toISOString(),timeMax:required.timeMax};
 await read(left);await read(right);assert.equal((await finish()).status,'pending','a1millisecond gap remains incomplete');
 await read({timeMin:new Date(middle).toISOString(),timeMax:new Date(middle+1).toISOString(),query:'meeting'});assert.equal((await finish()).status,'pending','query-filtered reads cannot fill a gap');
 await read({timeMin:new Date(middle).toISOString(),timeMax:new Date(middle+1).toISOString(),resultMode:'identities'});assert.equal((await finish()).status,'pending','identity projections cannot fill a full-content gap');
 await read({timeMin:new Date(middle).toISOString(),timeMax:new Date(middle+1).toISOString()});assert.equal((await finish()).status,'ready');
 assert.equal(f.writes.length,0);
});

test('partial subwindows never establish full coverage and finish recommends fresh recursively narrower scans',async()=>{
 const f=fixture({calendarEvents:[],calendarPage:()=>({status:'ready',events:[],coverage:{complete:false}})}),batch=await f.prepare();
 const seen=new Set(),read=f.tool('list_calendar_events'),finish=()=>f.a.validateCompletion(f.context);
 let pending=[{timeMin:batch.reconciliationWindow.timeMin,timeMax:batch.reconciliationWindow.timeMax}];
 for(let depth=0;depth<3;depth++){
  for(const args of pending){const key=JSON.stringify(args);assert(!seen.has(key),'incomplete scans must not repeat');seen.add(key);const result=await read(args);assert.equal(result.coverage.complete,false);}
  const completion=await finish();assert.equal(completion.status,'pending');pending=completion.nextActions.filter(row=>row.name==='list_calendar_events').map(row=>row.arguments);
  assert(pending.length>0,'after incomplete halves the next pass must still offer narrower scans');
  assert(pending.every(args=>!Object.hasOwn(args,'pageToken')&&!args.query&&(!args.resultMode||args.resultMode==='full')));
 }
 assert.equal(f.writes.length,0);
});

test('oversized surrounding subwindows establish only the required clipped reconciliation interval',async()=>{
 const f=fixture({calendarEvents:[],calendarPage:()=>({status:'ready',events:[],coverage:{complete:true}})}),batch=await f.prepare();
 const start=Date.parse(batch.reconciliationWindow.timeMin),end=Date.parse(batch.reconciliationWindow.timeMax),middle=Math.floor((start+end)/2);
 await f.tool('list_calendar_events')({timeMin:new Date(start-86400000).toISOString(),timeMax:new Date(middle).toISOString()});
 assert.equal((await f.a.validateCompletion(f.context)).status,'pending');
 await f.tool('list_calendar_events')({timeMin:new Date(middle).toISOString(),timeMax:new Date(end+86400000).toISOString()});
 assert.equal((await f.a.validateCompletion(f.context)).status,'ready');
});

test('map conflicts invalidate bulk observations until a fresh matching read succeeds',async()=>{
 const f=fixture({mapUpsert:(_args,n)=>n===1?{status:'conflict'}:{status:'applied'}}),batch=await f.prepare();
 await f.tool('list_calendar_events')({timeMin:batch.reconciliationWindow.timeMin,timeMax:batch.reconciliationWindow.timeMax});
 await f.tool('read_map_events')({sourceId:calendarSource});
 let completion=await f.a.validateCompletion(f.context);assert.equal(completion.nextActions[0].name,'upsert_map_event');
 assert.equal((await f.tool('upsert_map_event')(projection())).status,'conflict');
 completion=await f.a.validateCompletion(f.context);assert.equal(completion.status,'pending');assert.equal(completion.nextActions[0].name,'read_map_events');
 await f.tool('read_map_events')({sourceId:miroSource});
 assert.equal((await f.a.validateCompletion(f.context)).nextActions[0].name,'read_map_events','an unrelated read cannot clear a conflict');
 await f.tool('read_map_events')({sourceId:calendarSource,sourceRecordId:eventId});
 assert.equal((await f.a.validateCompletion(f.context)).nextActions[0].name,'upsert_map_event');
 assert.equal((await f.tool('upsert_map_event')(projection())).status,'ready');assert.equal(f.writes.length,2);assert.equal((await f.a.validateCompletion(f.context)).status,'ready');
});

test('fresh map reads replace covered prior snapshots and remove completion credit for vanished records',async()=>{
 let vanished=false;const original={...projection().event,id:'60000000-0000-4000-8000-000000000006'};
 const f=fixture({mapRead:args=>({status:'ok',events:!vanished&&args.sourceId===calendarSource?[original]:[],event_people:[],event_buildings:[],buildings:[]})}),batch=await f.prepare();
 await f.tool('list_calendar_events')({timeMin:batch.reconciliationWindow.timeMin,timeMax:batch.reconciliationWindow.timeMax});
 await f.tool('read_map_events')({sourceId:calendarSource});assert.equal((await f.a.validateCompletion(f.context)).status,'ready');
 await f.tool('read_map_events')({sourceId:miroSource});assert.equal((await f.a.validateCompletion(f.context)).status,'ready','unrelated scopes preserve existing completion');
 vanished=true;await f.tool('read_map_events')({sourceId:calendarSource});
 const completion=await f.a.validateCompletion(f.context);assert.equal(completion.status,'pending');assert.equal(completion.nextActions[0].name,'upsert_map_event');assert.equal(completion.nextActions[0].requiredProjection.source_record_id,eventId);assert.equal(completion.nextActions[0].arguments,undefined);assert.equal(f.writes.length,0);
});
