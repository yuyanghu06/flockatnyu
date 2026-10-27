import {calendarEventReceipt} from '../server/google/calendar-receipt.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createAutomationAdapters,discordCalendarIntent} from '../server/automation/adapters.js';
import {readAutomationConfig} from '../server/automation/config.js';
import {calendarEventId} from '../server/google/calendar-client.js';

const miroSource='10000000-0000-4000-8000-000000000001',discordSource='20000000-0000-4000-8000-000000000002',inputId='30000000-0000-4000-8000-000000000003';
const calendarId='club@group.calendar.google.com',sourceKey='discord:100:200:300',sourceUrl='https://discord.com/channels/100/200/300';
const now=()=>new Date('2026-10-18T16:00:00Z');
const announcement='Tech@NYU event: Synthetic Workshop is scheduled October 20, 2026 at 6pm at Bobst.';
const args={sourceKey,sourceUrl,title:'Synthetic Workshop',location:'Bobst',start:{dateTime:'2026-10-20T18:00:00-04:00',timeZone:'America/New_York'},end:{dateTime:'2026-10-20T20:00:00-04:00',timeZone:'America/New_York'}};
const window={timeMin:'2026-10-20T00:00:00-04:00',timeMax:'2026-10-21T00:00:00-04:00'};
function fixture({body=announcement,liveBody=body,eventType='message_created',existing=[],truncated=false,liveMessageId='300'}={}) {
 let excluded=false,deleted=false,currentBody=liveBody;const writes=[],reads=[];
 const source=()=>({kind:'discord',retrieval:'live',sourceId:discordSource,guildId:'100',channelId:'200',messageId:liveMessageId,url:sourceUrl.replace('/300',`/${liveMessageId}`),authorId:'400',excerpt:currentBody});
 const liveDiscordService={configured:true,readMessages:async input=>{reads.push(input);return {status:excluded||deleted?'forbidden':'ready',sources:excluded||deleted?[]:[source()],coverage:{textTruncated:truncated}};}};
 const policy={guildId:'100',revision:1,paused:false,discoveryEnabled:true,excludedCategoryIds:[],excludedChannelIds:[]};
 const channel={id:'200',guild_id:'100',type:0,parent_id:null};
 const calendarClient={configured:true,calendarId,preflight:async()=>({status:'ready',calendarId,accessRole:'owner'}),
  listEvents:async()=>({status:'ready',events:existing,nextPageToken:null,coverage:{complete:true}}),
  readEvent:async({eventId})=>({status:'ready',events:existing.filter(event=>event.eventId===eventId)}),
  upsertEvent:async input=>{writes.push(input);return {status:'ready',...calendarEventReceipt({id:calendarEventId(calendarId,input.sourceKey),summary:input.title,start:input.start,end:input.end},{calendarId,outcome:'created'})};},
  cancelEvent:async input=>{writes.push(input);return {status:'ready',...calendarEventReceipt({id:calendarEventId(calendarId,input.sourceKey),status:'cancelled'},{calendarId,outcome:'cancelled'})};}};
 const a=createAutomationAdapters({env:{ASSISTANT_ALLOWED_SOURCE_IDS:[miroSource,discordSource].join(',')},config:readAutomationConfig({AGENT_AUTOMATION_ENABLED:'true'}),now,
  fetchImpl:async()=>{throw Error('Unmocked network');},dependencies:{googleConfig:{configured:false},googleClient:{configured:false},
   calendarConfig:{configured:true,calendarId},calendarClient,
   miroConfig:{configured:true,boardIds:['board']},miroStore:{configured:true,authorizedBoard:async()=>({status:'ready',data:{board_id:'board',source_id:miroSource,team_id:'team'}})},
   miroTools:{configured:true,transport:'mcp',tools:[],prepareBoard:async()=>({status:'ready',boardContext:{format:'miro-mcp-search-v1',payload:{results:[]}}}),execute:async()=>({status:'ready',boardContext:{boards:[{boardId:'board',sourceId:miroSource,teamId:'team'}]}})},
   discordConfig:{configured:true,guildId:'100'},liveDiscordService,
   discordStore:{getPolicy:async()=>({status:'ready',policy:{...policy,excludedChannelIds:excluded?['200']:[]}}),listSyncChannels:async()=>({status:'ready',channels:[{enabled:true,guildId:'100',channelId:'200',sourceId:discordSource}]})},
   discordClient:{getGuildChannels:async()=>[channel],getChannel:async()=>channel},
  }});
 const context={principal:a.principal,inputIds:[inputId]};
 const input={uuid:inputId,raw_response:{source:'discord',source_id:discordSource,event_type:eventType,event_id:'300',revision:'1',received_at:now().toISOString(),payload:{id:'300',guild_id:'100',channel_id:'200',author:{id:'400'},timestamp:now().toISOString(),content:body}}};
 return {a,context,writes,reads,prepare:()=>a.prepareBatch({...context,inputs:[input]}),exclude:()=>{excluded=true;},remove:()=>{deleted=true;},
  tool:name=>async arguments_=>a.tools.find(tool=>tool.name===name).execute(arguments_,context)};
}
const readOriginal=f=>f.tool('read_discord_messages')({channelId:'200',messageId:'300',context:false});

test('a queued native Discord original authorizes its exact Calendar operation without hidden source reads',async()=>{
 const f=fixture();await f.prepare();assert.equal(f.reads.length,0);
 const result=await f.tool('upsert_calendar_event')(args);assert.equal(result.status,'ready');assert.equal(f.writes.length,1);assert.equal(f.reads.length,0);
 assert.equal(f.writes[0].sourceKey,sourceKey);assert.equal(f.writes[0].principal.calendarId,calendarId);
 assert.equal((await readOriginal(f)).status,'ready');assert.equal(f.reads.length,1,'A model-selected refresh stays a separate source operation');
});
test('live Discord observations retain exact source IDs, event keys and canonical URLs',async()=>{
 const f=fixture({body:'An irrelevant queue trigger',liveBody:announcement});await f.prepare();await readOriginal(f);
 assert.equal((await f.tool('upsert_calendar_event')(args)).status,'ready');
 for(const patch of [{sourceKey:'discord:100:200:301'},{sourceUrl:sourceUrl+'0'},{sourceKey:'discord:999:200:300'}])assert.equal((await f.tool('upsert_calendar_event')({...args,...patch})).status,'forbidden_source');assert.equal(f.writes.length,1);
});
test('updates and cancellations retain the exact observed managed source identity',async()=>{
 for(const operation of ['upsert_calendar_event','cancel_calendar_event']){
  const f=fixture({body:operation==='cancel_calendar_event'?'The workshop is cancelled.':'The workshop is rescheduled.',eventType:'message_updated'});await f.prepare();await readOriginal(f);
  const input=operation==='cancel_calendar_event'?{sourceKey,sourceUrl}:args;
  assert.equal((await f.tool(operation)(input)).status,'ready');assert.equal(f.writes.length,1);assert.equal(f.writes[0].sourceKey,sourceKey);assert.equal(f.writes[0].sourceUrl,sourceUrl);assert.equal(f.reads.length,1);
 }
});
test('failed explicit source rereads remove authority without Calendar writes',async()=>{
 for(const mode of ['exclude','remove']){
  const f=fixture(mode==='truncated'?{truncated:true}:{});await f.prepare();
  if(mode!=='truncated'){assert.equal((await readOriginal(f)).status,'ready');f[mode]();}
  const read=await readOriginal(f);assert.equal((await f.tool('upsert_calendar_event')(args)).status,'forbidden_source',mode+': '+JSON.stringify(read));assert.equal(f.writes.length,0);
 }
});
test('a truncated follow-up original cannot add new Calendar write authority',async()=>{
 const f=fixture({truncated:true,liveMessageId:'301'});await f.prepare();
 const read=await f.tool('read_discord_messages')({channelId:'200',messageId:'301',context:false});assert.equal(read.coverage.textTruncated,true);
 const changed={...args,sourceKey:'discord:100:200:301',sourceUrl:sourceUrl.replace('/300','/301')};
 assert.equal((await f.tool('upsert_calendar_event')(changed)).status,'forbidden_source');assert.equal(f.writes.length,0);
});
test('intent classification keeps own-location reports and RSVPs distinct from club announcements',()=>{
 for(const text of [announcement,'Tech@NYU event: Study Jam study group is scheduled on October20 at6pm.'])assert.equal(discordCalendarIntent(text),true,text);
 for(const text of ["I'm studying at Bobst until8",'Co-working with the Tech@NYU team tonight',"I'm attending the scheduled Tech@NYU workshop on Oct20 at6pm",'Reminder: RSVP yes for the workshop.'])assert.equal(discordCalendarIntent(text),false,text);
 for(const text of ['The workshop is not cancelled.','Is the workshop cancelled?','The workshop might be cancelled.'])assert.equal(discordCalendarIntent(text,{cancel:true}),false,text);
});
test('all-day Calendar writes preserve supplied New York dates after an explicit source read',async()=>{
 const f=fixture({body:'Tech@NYU event: Study Jam is scheduled all day October20, 2026.'});await f.prepare();await readOriginal(f);
 assert.equal((await f.tool('upsert_calendar_event')({...args,title:'Study Jam',start:{date:'2026-10-20'},end:{date:'2026-10-21'}})).status,'ready');assert.equal(f.writes.length,1);assert.deepEqual(f.writes[0].start,{date:'2026-10-20'});assert.deepEqual(f.writes[0].end,{date:'2026-10-21'});
});
