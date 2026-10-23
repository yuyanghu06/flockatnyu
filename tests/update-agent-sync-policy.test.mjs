import {calendarEventReceipt} from '../server/google/calendar-receipt.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createAutomationAdapters} from '../server/automation/adapters.js';
import {readAutomationConfig} from '../server/automation/config.js';
import {buildAutomationPrompt} from '../server/automation/prompt.js';
import {createAutomationHandler} from '../server/automation/handler.js';
import {createHash} from 'node:crypto';
import {canonicalJson} from '../server/automation/validation.js';
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
  calendarClient.upsertEvent=async args=>({status:'ready',...calendarEventReceipt({id:eventId,summary:args.title,description:args.description,location:args.location,start:args.start,end:args.end,status:'confirmed'},{calendarId,outcome:'created'})});
  calendarClient.cancelEvent=async()=>({status:'ready',...calendarEventReceipt(calendarEvents.length?{id:eventId,status:'cancelled'}:null,{calendarId,eventId,outcome:calendarEvents.length?'cancelled':'already_absent',absent:calendarEvents.length===0})});
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
  assert.equal(batch.reconciliationWindow,undefined);assert.equal(batch.miro,undefined);
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

const projection=()=>{const p=mapArgs();p.event={...p.event,name:calendarEvent.title,kind:'scheduled_event',reported_at:calendarEvent.updatedAt,starts_at:calendarEvent.start.dateTime,ends_at:calendarEvent.end.dateTime};return p;};
test('actual handler canonicalizes exact trusted Calendar identity and origin before writing and hashing its receipt',async()=>{
 const origin='https://miro.com/app/board/board/?moveToWidget=item';
 const f=fixture({calendarEvents:[{...calendarEvent,managed:true,sourceUrl:origin}]}),config=readAutomationConfig({AGENT_AUTOMATION_ENABLED:'true'});
 const input={uuid:inputId,raw_response:{source:'gmail',source_id:gmailSource,event_type:'email_received_metadata',event_id:'abc123',revision:'1',received_at:now().toISOString(),payload:{id:'abc123'}}};
 let round=0,required,finished=0,modelArguments;const completed=[],attempted=[];
 const store={configured:true,claim:async()=>({status:'ready',leaseToken:'70000000-0000-4000-8000-000000000007',inputs:[input]}),renew:async()=>({status:'ready'}),release:async()=>({status:'ready'}),
  action:async({actionKey,complete})=>{(complete?completed:attempted).push(actionKey);return {status:complete?'completed':'execute'};},finish:async()=>{finished++;return {status:'ready'};}};
 const provider={toolTurn:async request=>{
  round++;if(round===1){required=window;}
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
