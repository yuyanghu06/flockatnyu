import {createLiveRetrievalTools} from '../tools/discord/index.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createAutomationAdapters} from '../server/automation/adapters.js';
import {createAutomationHandler} from '../server/automation/handler.js';
import {readAutomationConfig} from '../server/automation/config.js';
import {MAP_RECORD_EXAMPLES} from '../server/map/contracts.js';
const source='10000000-0000-4000-8000-000000000001',inputId='20000000-0000-4000-8000-000000000002',eventId='30000000-0000-4000-8000-000000000003';
const url='https://discord.com/channels/100/200/300';
const now=()=>new Date('2026-10-18T16:00:00Z');
const row=()=>({uuid:inputId,raw_response:{source:'discord',source_id:source,event_type:'message_created',event_id:'300',revision:'1',received_at:now().toISOString(),payload:{id:'300',guild_id:'100',channel_id:'200',timestamp:now().toISOString(),author:{id:'400'},content:'At Bobst studying'}}});
const params=()=>({event:{...MAP_RECORD_EXAMPLES.event,source_id:source,source_url:url,source_record_id:'300'},buildings:structuredClone(MAP_RECORD_EXAMPLES.buildings),people:MAP_RECORD_EXAMPLES.people.map(p=>({...p,source_id:source,source_url:url}))});
function fixture({resultStatus='applied',old=null,extraEvents=[],pinned=false,lookupPerson={id:MAP_RECORD_EXAMPLES.people[0].person_id},gmailFrom='Actual Sender <sender@example.com>'}={}) {
 let writes=0,lookups=0,revoked=false,team='team';
 const miroStore={configured:true,authorizedBoard:async()=>({status:revoked?'forbidden':'ready',data:{board_id:'board',source_id:source,team_id:team}})};
 const calendarClient={configured:true,calendarId:'fixed',preflight:async()=>({status:'ready',calendarId:'fixed',accessRole:'writer'})};
 const policy={guildId:'100',revision:1,paused:false,discoveryEnabled:true,excludedCategoryIds:[],excludedChannelIds:[]};
 const channel={id:'200',guild_id:'100',type:0,parent_id:null};
 const mapEventService={configured:true,read:async()=>({status:'ok',events:[...(old?[old.event]:[]),...extraEvents.map(row=>row.event)],event_people:[...(old?.people||[]),...extraEvents.flatMap(row=>row.people||[])],event_buildings:[...(old?.buildings||[]),...extraEvents.flatMap(row=>row.buildings||[])],buildings:[{id:'bobst-library',name:'Bobst'}],people:[]}),lookup:async()=>{lookups++;return {status:'ok',person:lookupPerson};},upsert:async()=>{writes++;return {status:resultStatus,event_id:eventId,updated_at:now().toISOString()};}};
 const liveDiscordService={configured:true,readMessages:async()=>({status:revoked?'forbidden':'ready',coverage:{complete:true,textTruncated:false},sources:revoked?[]:[{kind:'discord',retrieval:'live',sourceId:source,guildId:'100',channelId:'200',messageId:'300',authorId:'400',url,content:row().raw_response.payload.content,excerpt:row().raw_response.payload.content,createdAt:now().toISOString(),sourceUpdatedAt:now().toISOString()}]})};
 const a=createAutomationAdapters({env:{ASSISTANT_ALLOWED_SOURCE_IDS:source,AGENT_GMAIL_SOURCE_ID:source},config:readAutomationConfig({AGENT_AUTOMATION_ENABLED:'true'}),now,fetchImpl:async()=>{throw Error('No network');},dependencies:{
  googleConfig:{configured:true},googleClient:{configured:true,readGmail:async({messageId})=>({status:'ready',sources:[{kind:'gmail',externalId:messageId,url:`https://mail.google.com/mail/u/0/#all/${messageId}`,from:gmailFrom,excerpt:'Original full text',contentStatus:'text_only_bounded'}]})},calendarConfig:{configured:true,calendarId:'fixed'},calendarClient,
  miroConfig:{configured:true,boardIds:['board'],...(pinned?{teamId:'team'}:{})},miroStore,miroTools:{configured:true,transport:'mcp',prepareBoard:async()=>({status:'ready',boardContext:{format:'miro-mcp-search-v1',payload:{results:[]}}}),tools:[{name:'read_miro_item',description:'Read',readOnly:true,parameters:{type:'object',properties:{},additionalProperties:false}}],execute:async({name})=>name==='list_miro_boards'?{status:'ready',boardContext:{boards:[{boardId:'board',sourceId:source,teamId:team}]}}:{status:'ready',sources:[{kind:'miro',retrievalMode:'live',contentAvailable:true,evidenceKind:'item',sourceKey:'miro:board:item',boardId:'board',sourceId:source,itemId:'item',url:'https://miro.com/app/board/board/?moveToWidget=item'}]}},
  discordConfig:{configured:true,guildId:'100'},discordStore:{getPolicy:async()=>({status:'ready',policy:{...policy,paused:revoked}}),listSyncChannels:async()=>({status:'ready',channels:[{enabled:true,guildId:'100',channelId:'200',sourceId:source}]})},discordClient:{getGuildChannels:async()=>[channel],getChannel:async()=>channel},liveDiscordService,discordTools:createLiveRetrievalTools({service:liveDiscordService,guildId:'100'}),mapEventService,mapSourceAuthorizer:async()=>!revoked,
 }});
 const context={principal:a.principal,inputIds:[inputId]};
 return {a,context,changeTeam:()=>{team='other-team';},writes:()=>writes,lookups:()=>lookups,revoke:async()=>{revoked=true;await a.resolveClaimSourceIds({principal:a.principal});},prepare:async(input=row())=>{const prepared=await a.prepareBatch({...context,inputs:[input]});if(input.raw_response.source==='discord'&&input.raw_response.event_type!=='message_deleted')await a.tools.find(t=>t.name==='read_discord_messages').execute({channelId:'200',messageId:'300',context:false},context);if(old)await a.tools.find(t=>t.name==='read_map_events').execute({},context);return prepared;},tool:name=>{const t=a.tools.find(t=>t.name===name);assert(t);return t;}};
}
test('bundled prepared batch exposes callable shared tools and requires exact scoped original provenance',async()=>{
 const f=fixture();assert(f.a.tools.length<=24);
 assert.equal((await f.tool('upsert_map_event').execute(params(),f.context)).status,'forbidden');
 await f.prepare();
 for(const [p,c] of [[{...params(),event:{...params().event,source_url:url+'0'}},f.context],[params(),{...f.context,inputIds:['40000000-0000-4000-8000-000000000004']}],[params(),{...f.context,principal:{...f.a.principal}}]])assert.match((await f.tool('upsert_map_event').execute(p,c)).status,/forbidden/);
 assert.equal(f.writes(),0);
 assert.equal((await f.tool('upsert_map_event').execute(params(),f.context)).status,'forbidden_source');
 const lookup={provider:'discord',providerUserId:'400',sourceId:source,sourceUrl:url};assert.equal((await f.tool('lookup_map_person').execute(lookup,f.context)).status,'ready');assert.equal(f.lookups(),1);
 assert.equal((await f.tool('upsert_map_event').execute(params(),f.context)).status,'ready');assert.equal(f.writes(),1);
 assert.equal((await f.tool('lookup_map_person').execute({...lookup,sourceUrl:url+'0'},f.context)).status,'forbidden_source');assert.equal(f.lookups(),1);
 await f.revoke();assert.equal(await f.a.authorizeEvent({event:row().raw_response,principal:f.a.principal}),false,'The runner rechecks published source access before dispatching another map mutation');assert.equal(f.writes(),1);
 f.a.cleanupBatch();assert.equal((await f.tool('read_map_events').execute({},f.context)).status,'forbidden');
});

test('fresh existing token is required; read-and-merge preserves unchanged independently sourced participation',async()=>{
 const p=params(),token='2026-10-18T15:00:00.000Z';p.event.id=eventId;
 const old={event:{...p.event,updated_at:token,created_at:token},people:p.people.map(x=>({...x,event_id:eventId,source_url:'https://discord.com/channels/100/200/999'}))};
 const f=fixture({old});await f.prepare();
 assert.equal((await f.tool('upsert_map_event').execute(p,f.context)).status,'conflict');assert.equal(f.writes(),0);
 p.expectedUpdatedAt=token;p.people=old.people.map(({event_id,...x})=>x);p.event.name='Updated supported activity';assert.equal((await f.tool('upsert_map_event').execute(p,f.context)).status,'ready');
 assert.equal((await f.tool('upsert_map_event').execute({...p,people:[]},f.context)).status,'forbidden_source');
 assert.equal(f.writes(),1);
});
test('real handler preserves successful receipts and pending-safe conflicts from bundled map actions',async()=>{
 for(const resultStatus of ['applied','conflict']) {
  const f=fixture({resultStatus});let turns=0,finished=false,receipts=0;
  const store={configured:true,claim:async()=>({status:'ready',leaseToken:'50000000-0000-4000-8000-000000000005',inputs:[row()]}),renew:async()=>({status:'ready'}),release:async()=>({status:'ready'}),action:async({complete})=>{if(complete)receipts++;return {status:complete?'completed':'execute'};},finish:async()=>{finished=true;return {status:'ready'};}};
  const handler=createAutomationHandler({...f.a,store,config:readAutomationConfig({AGENT_AUTOMATION_ENABLED:'true'}),now,provider:{toolTurn:async request=>{turns++;if(turns===3&&resultStatus==='conflict'){const feedback=JSON.parse(request.messages.at(-1).content);assert.equal(feedback.status,'tool_error');assert.equal(feedback.reason,'conflict');return {stopReason:'stop',toolCalls:[]};}return {stopReason:'tool_calls',toolCalls:turns===1?[{id:'lookup',name:'lookup_map_person',arguments:{inputIds:[inputId],arguments:{provider:'discord',providerUserId:'400',sourceId:source,sourceUrl:url}}}]:turns===2?[{id:'write',name:'upsert_map_event',arguments:{inputIds:[inputId],arguments:params()}}]:[{id:'done',name:'finish_batch',arguments:{handledInputIds:[inputId]}}]};}}});
  assert.equal((await handler.tick()).status,resultStatus==='applied'?'completed':'incomplete_batch');assert.equal(f.writes(),1);assert.equal(finished,resultStatus==='applied');assert.equal(receipts,resultStatus==='applied'?1:0);
 }
});

test('native Gmail IDs require a separately observed body before map writes',async()=>{
 for(const eventType of ['email_received','email_received_metadata']) {
  const f=fixture(),input={uuid:inputId,raw_response:{source:'gmail',source_id:source,event_type:eventType,event_id:'abc123',revision:'1',received_at:now().toISOString(),payload:{id:'abc123',internalDate:String(now().getTime()),payload:{headers:[{name:'From',value:'Actual Sender <sender@example.com>'}],mimeType:'text/plain',body:{data:'body'}}}}};
  await f.prepare(input);const p=params(),mailUrl='https://mail.google.com/mail/u/0/#all/abc123';p.event.source_url=mailUrl;p.event.source_record_id='abc123';p.people=p.people.map(x=>({...x,source_url:mailUrl}));
  const first=await f.tool('upsert_map_event').execute({...p,people:[]},f.context);assert.equal(first.status,'forbidden_source');
  {
   assert.equal(f.writes(),0);assert.equal((await f.tool('read_gmail').execute({messageId:'abc123'},f.context)).status,'ready');
  }
  assert.equal((await f.tool('upsert_map_event').execute(p,f.context)).status,'forbidden_source');
  assert.equal((await f.tool('lookup_map_person').execute({provider:'email',providerUserId:'SENDER@example.com',sourceId:source,sourceUrl:mailUrl},f.context)).status,'ready');
  assert.equal((await f.tool('upsert_map_event').execute(p,f.context)).status,'ready');
  assert.equal(f.writes(),1);
 }
});
test('deletion input cannot manufacture new map facts from the deleted source URL',async()=>{
 const f=fixture(),input=row();input.raw_response.event_type='message_deleted';await f.prepare(input);
 assert.equal((await f.tool('upsert_map_event').execute(params(),f.context)).status,'forbidden_source');assert.equal(f.writes(),0);
});

test('fresh RSVP evidence can update participation but cannot move an independently sourced event',async()=>{
 const p=params(),token='2026-10-18T15:00:00.000Z';p.event={...p.event,id:eventId,source_url:'https://discord.com/channels/100/200/999'};p.expectedUpdatedAt=token;
 const old={event:{...p.event,updated_at:token,created_at:token},buildings:p.buildings.map(x=>({...x,event_id:eventId})),people:[]};
 const f=fixture({old});await f.prepare();
 assert.equal((await f.tool('lookup_map_person').execute({provider:'discord',providerUserId:'400',sourceId:source,sourceUrl:url},f.context)).status,'ready');
 assert.equal((await f.tool('upsert_map_event').execute(p,f.context)).status,'ready');
 assert.equal((await f.tool('upsert_map_event').execute({...p,buildings:[{building_id:'courant-institute',location_notes:''}]},f.context)).status,'forbidden_source');assert.equal(f.writes(),1);
});

test('changed participants require successful exact-author lookup receipt, never a claimed known UUID or mentioned ID',async()=>{
 const f=fixture();await f.prepare();const lookup={provider:'discord',providerUserId:'400',sourceId:source,sourceUrl:url};
 assert.equal((await f.tool('upsert_map_event').execute(params(),f.context)).status,'forbidden_source');
 for(const patch of [{providerUserId:'999'},{provider:'email',providerUserId:'claimed@example.com'}])assert.equal((await f.tool('lookup_map_person').execute({...lookup,...patch},f.context)).status,'forbidden_source');
 assert.equal(f.lookups(),0);
 assert.equal((await f.tool('lookup_map_person').execute(lookup,f.context)).status,'ready');
 const wrong=params();wrong.people[0].person_id='90000000-0000-4000-8000-000000000009';
 assert.equal((await f.tool('upsert_map_event').execute(wrong,f.context)).status,'forbidden_source');
 assert.equal((await f.tool('upsert_map_event').execute(params(),f.context)).status,'ready');assert.equal(f.writes(),1);
 await f.prepare();assert.equal((await f.tool('upsert_map_event').execute(params(),f.context)).status,'forbidden_source');
 const unknown=fixture({lookupPerson:null});await unknown.prepare();assert.equal((await unknown.tool('lookup_map_person').execute(lookup,unknown.context)).status,'ready');
 assert.equal((await unknown.tool('upsert_map_event').execute(params(),unknown.context)).status,'forbidden_source');assert.equal(unknown.writes(),0);
});

test('changing an existing participant label still requires a fresh source-bound linked identity',async()=>{
 const p=params(),token='2026-10-18T15:00:00.000Z';p.event={...p.event,id:eventId};p.expectedUpdatedAt=token;
 const old={event:{...p.event,updated_at:token},buildings:p.buildings.map(b=>({...b,event_id:eventId})),people:p.people.map(person=>({...person,event_id:eventId}))};
 const f=fixture({old});await f.prepare();p.people[0].label='Co-working';
 assert.equal((await f.tool('upsert_map_event').execute(p,f.context)).status,'forbidden_source');assert.equal(f.writes(),0);
 assert.equal((await f.tool('lookup_map_person').execute({provider:'discord',providerUserId:'400',sourceId:source,sourceUrl:url},f.context)).status,'ready');
 assert.equal((await f.tool('upsert_map_event').execute(p,f.context)).status,'ready');assert.equal(f.writes(),1);
});

test('Unsupported Miro links and Gmail display-name claims cannot supply linked participant identities',async()=>{
 const f=fixture();await f.prepare();assert(!f.a.tools.some(tool=>/miro/i.test(tool.name)));
 assert.equal((await f.tool('lookup_map_person').execute({provider:'discord',providerUserId:'400',sourceId:source,sourceUrl:'https://miro.com/app/board/board/?moveToWidget=item'},f.context)).status,'forbidden_source');assert.equal(f.lookups(),0);
 for(const headers of [[{name:'From',value:'"claimed@example.com" <sender@example.com>'}],[{name:'From',value:'sender@example.com'},{name:'From',value:'claimed@example.com'}]]) {
  const g=fixture(),input={uuid:inputId,raw_response:{source:'gmail',source_id:source,event_type:'email_received',event_id:'abc123',payload:{id:'abc123',payload:{headers}}}};
  await g.prepare(input);const lookup={provider:'email',providerUserId:'claimed@example.com',sourceId:source,sourceUrl:'https://mail.google.com/mail/u/0/#all/abc123'};
  assert.equal((await g.tool('lookup_map_person').execute(lookup,g.context)).status,'forbidden_source');assert.equal(g.lookups(),0);
 }
 const g=fixture({gmailFrom:'"claimed@example.com" <sender@example.com>'}),input={uuid:inputId,raw_response:{source:'gmail',source_id:source,event_type:'email_received_metadata',event_id:'abc123',payload:{id:'abc123'}}};
 await g.prepare(input);await g.tool('read_gmail').execute({messageId:'abc123'},g.context);
 const lookup={provider:'email',providerUserId:'claimed@example.com',sourceId:source,sourceUrl:'https://mail.google.com/mail/u/0/#all/abc123'};
 assert.equal((await g.tool('lookup_map_person').execute(lookup,g.context)).status,'forbidden_source');assert.equal(g.lookups(),0);
 assert.equal((await g.tool('lookup_map_person').execute({...lookup,providerUserId:'sender@example.com'},g.context)).status,'ready');assert.equal(g.lookups(),1);
});

test('broad map reads isolate target building relations and accept reordered/default room notes',async()=>{
 const p=params(),token='2026-10-18T15:00:00.000Z';p.event={...p.event,id:eventId,source_url:'https://discord.com/channels/100/200/999'};p.expectedUpdatedAt=token;p.people=[];
 const buildings=[{building_id:'bobst-library',location_notes:null},{building_id:'courant-institute',location_notes:''}];
 const old={event:{...p.event,updated_at:token,created_at:token},buildings:buildings.map(row=>({...row,event_id:eventId})),people:[]};
 const otherId='30000000-0000-4000-8000-000000000004',extraEvents=[{event:{...old.event,id:otherId,source_record_id:'998',source_url:'https://discord.com/channels/100/200/998'},buildings:[{event_id:otherId,building_id:'silver-center',location_notes:'Different event, preserve it'}],people:[]}];
 const f=fixture({old,extraEvents});await f.prepare();p.buildings=[{building_id:'courant-institute',location_notes:''},{building_id:'bobst-library',location_notes:''}];
 assert.equal((await f.tool('upsert_map_event').execute(p,f.context)).status,'ready');assert.equal(f.writes(),1);
 const moved={...p,buildings:p.buildings.map(row=>({...row,location_notes:'Changed room'}))};
 assert.equal((await f.tool('upsert_map_event').execute(moved,f.context)).status,'forbidden_source');assert.equal(f.writes(),1);
});
