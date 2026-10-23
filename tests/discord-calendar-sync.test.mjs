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
function fixture({body=announcement,liveBody=body,eventType='message_created',existing=[],truncated=false}={}) {
 let excluded=false,deleted=false,currentBody=liveBody;const writes=[],reads=[];
 const source=()=>({kind:'discord',retrieval:'live',sourceId:discordSource,guildId:'100',channelId:'200',messageId:'300',url:sourceUrl,authorId:'400',excerpt:currentBody});
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
test('queued explicit Discord club event creates fixed Calendar event after a complete matching-window read',async()=>{
 const f=fixture();await f.prepare();assert.equal((await f.tool('upsert_calendar_event')(args)).status,'forbidden_source');
 await f.tool('list_calendar_events')(window);assert.equal((await f.tool('upsert_calendar_event')(args)).status,'ready');
 assert.equal(f.writes.length,1);assert.equal(f.writes[0].sourceKey,sourceKey);assert.equal(f.writes[0].principal.calendarId,calendarId);
});
test('live Discord originals can support Calendar scope and source IDs/URLs cannot be forged',async()=>{
 const f=fixture({body:'An irrelevant source trigger',liveBody:announcement});await f.prepare();await f.tool('list_calendar_events')(window);
 await f.tool('read_discord_messages')({channelId:'200',messageId:'300',context:false});
 assert.equal((await f.tool('upsert_calendar_event')(args)).status,'ready');
 for(const patch of [{sourceKey:'discord:100:200:301'},{sourceUrl:sourceUrl+'0'},{sourceKey:'discord:999:200:300'}])assert.equal((await f.tool('upsert_calendar_event')({...args,...patch})).status,'forbidden_source');
 assert.equal(f.writes.length,1);
});
test('same-message edit preserves managed source identity, new-message corrections/cross-source edits defer',async()=>{
 const existing={eventId:calendarEventId(calendarId,sourceKey),title:args.title,start:args.start,sourceUrl,managed:true};
 const f=fixture({body:'Tech@NYU event: Synthetic Workshop is rescheduled to October 20, 2026 at6pm.',eventType:'message_updated',existing:[existing]});
 await f.prepare();await f.tool('list_calendar_events')(window);assert.equal((await f.tool('upsert_calendar_event')(args)).status,'ready');assert.equal(f.writes[0].sourceKey,sourceKey);
 const newer=fixture({body:'Tech@NYU event: Synthetic Workshop is rescheduled to October 20, 2026 at6pm.'});
 await newer.prepare();await newer.tool('list_calendar_events')(window);assert.equal((await newer.tool('upsert_calendar_event')(args)).status,'conflict');assert.equal(newer.writes.length,0);
 const miroUrl='https://miro.com/app/board/board/?moveToWidget=item';
 const cross=fixture({body:`Tech@NYU event: Synthetic Workshop is scheduled October20 at6pm. Source ${miroUrl}`,existing:[{...existing,sourceUrl:miroUrl}]});
 await cross.prepare();await cross.tool('list_calendar_events')(window);assert.equal((await cross.tool('upsert_calendar_event')(args)).status,'conflict');assert.equal(cross.writes.length,0);
});
test('explicit original cancellation supports only same managed key; missing source and negation do not cancel',async()=>{
 const f=fixture({body:'Tech@NYU event: Synthetic Workshop is cancelled.',eventType:'message_updated'});await f.prepare();
 assert.equal((await f.tool('cancel_calendar_event')({sourceKey,sourceUrl})).status,'ready');assert.equal(f.writes.length,1);
 for(const body of ['The Tech@NYU workshop is not cancelled; it is still on.','Tech@NYU event: Synthetic Workshop might be cancelled.','Is the Tech@NYU workshop cancelled?']) {
  const n=fixture({body});await n.prepare();assert.equal((await n.tool('cancel_calendar_event')({sourceKey,sourceUrl})).status,'forbidden_source');assert.equal(n.writes.length,0);
 }
});
test('personal activities, RSVP-only originals and stale/removed/excluded/truncated evidence never write Calendar',async()=>{
 for(const body of ["I'm studying at Bobst until8",'Co-working with the Tech@NYU team tonight',"Reminder: I'm attending the scheduled Tech@NYU workshop on Oct20 at6pm", "I'm not attending the scheduled Tech@NYU workshop on Oct20 at6pm",'Alex is attending the scheduled Tech@NYU workshop on Oct20 at6pm',
  'Reminder: RSVP yes for the scheduled Tech@NYU workshop on October20 at6pm.',
  'I plan to attend the Tech@NYU event scheduled October20 at6pm.',
  'We are planning to join the Tech@NYU event scheduled October20 at6pm.',
  'I intend to go to the Tech@NYU event scheduled October20 at6pm.']) {
  const f=fixture({body});await f.prepare();await f.tool('list_calendar_events')(window);assert.equal((await f.tool('upsert_calendar_event')(args)).status,'forbidden_source',body);assert.equal(f.writes.length,0);
 }
 for(const options of [{liveBody:"I'm attending the workshop"},{truncated:true}]) {
  const f=fixture(options);await f.prepare();await f.tool('list_calendar_events')(window);assert.equal((await f.tool('upsert_calendar_event')(args)).status,'forbidden_source');assert.equal(f.writes.length,0);
 }
 for(const revoke of ['exclude','remove']) {const f=fixture();await f.prepare();await f.tool('list_calendar_events')(window);f[revoke]();assert.equal((await f.tool('upsert_calendar_event')(args)).status,'forbidden_source');assert.equal(f.writes.length,0);}
 assert.equal(discordCalendarIntent('Tech@NYU event: Study Jam study group is scheduled on October20 at6pm.'),true);
});
test('all-day Discord events respect local midnight window rather than UTC midnight',async()=>{
 const f=fixture({body:'Tech@NYU event: Study Jam is scheduled all day October20, 2026.'});await f.prepare();await f.tool('list_calendar_events')(window);
 assert.equal((await f.tool('upsert_calendar_event')({...args,title:'Study Jam',start:{date:'2026-10-20'},end:{date:'2026-10-21'}})).status,'ready');assert.equal(f.writes.length,1);
});
