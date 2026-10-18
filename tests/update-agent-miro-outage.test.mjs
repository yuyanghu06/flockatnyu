import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createAutomationAdapters} from '../server/automation/adapters.js';
import {createAutomationHandler} from '../server/automation/handler.js';
import {readAutomationConfig} from '../server/automation/config.js';
import {buildAutomationPrompt} from '../server/automation/prompt.js';
import {createMiroMcpTools} from '../tools/miro/mcp.js';
import {MiroMcpError} from '../server/miro/mcp-auth.js';

const miroSource=randomUUID(),discordSource=randomUUID(),calendarSource=randomUUID(),inputId=randomUUID();
const now=()=>new Date('2026-10-18T16:00:00Z'),boardId='fixture',calendarId='club@group.calendar.google.com',eventId='club_event_1';
const calendarUrl=`https://calendar.google.com/calendar/event?eid=${Buffer.from(`${eventId} ${calendarId}`).toString('base64url')}`;
const original={kind:'discord',retrieval:'live',sourceId:discordSource,guildId:'100',channelId:'200',messageId:'300',authorId:'400',url:'https://discord.com/channels/100/200/300',createdAt:now().toISOString(),excerpt:'General club coordination update; no new scheduled event.'};
const calendarEvent={eventId,url:calendarUrl,title:'Club workshop',status:'confirmed',updatedAt:now().toISOString(),start:{dateTime:'2026-10-20T22:00:00Z',timeZone:'America/New_York'},end:{dateTime:'2026-10-21T00:00:00Z',timeZone:'America/New_York'},location:'Bobst Library'};
function fixture({failure='tool_result_error',catalogueStatus='ready',configured=true,rawOverview,missingContext=false,revokeDuringOverview=false,mcpResponse}={}) {
 let revoked=false,upstream=0,calendarWrites=0,discordReads=0,finished=0;const writes=[],outputs=[];
 const miroConfig={configured,boardIds:[boardId],teamId:'team'};
 const miroStore={configured:true,authorizedBoard:async()=>({status:revoked?'forbidden':'ready',data:{board_id:boardId,source_id:miroSource,team_id:'team'}})};
 const realMiro=createMiroMcpTools({config:miroConfig,store:miroStore,client:{configured:true,callTool:async()=>{
  upstream++;if(revokeDuringOverview)revoked=true;
  if(mcpResponse!==undefined)return mcpResponse;
  if(failure)throw new MiroMcpError(failure);
  return {structuredContent:{total_items:0,total_results:0,results:[]}};
 }}});
 const miroTools={...realMiro,execute:async options=>options.name==='list_miro_boards'&&catalogueStatus!=='ready'?{status:catalogueStatus}:realMiro.execute(options),
  ...(rawOverview?{prepareBoard:async()=>{upstream++;return rawOverview;}}:missingContext?{prepareBoard:async()=>({status:'ready'})}:{})};
 const input={uuid:inputId,raw_response:{source:'discord',source_id:discordSource,event_type:'message_created',event_id:'300',revision:'1',received_at:now().toISOString(),payload:{id:'300',guild_id:'100',channel_id:'200',timestamp:now().toISOString(),author:{id:'400'},content:original.excerpt}}};
 const channel={id:'200',guild_id:'100',type:0,parent_id:null};
 const discordStore={configured:true,getPolicy:async()=>({status:'ready',policy:{guildId:'100',revision:1,paused:false,discoveryEnabled:true,excludedCategoryIds:[],excludedChannelIds:[]}}),listSyncChannels:async()=>({status:'ready',channels:[{enabled:true,guildId:'100',channelId:'200',sourceId:discordSource}]})};
 const readDiscord=async()=>{discordReads++;return {status:'ready',sources:[original],coverage:{complete:true,textTruncated:false}};};
 const calendarClient={configured:true,calendarId,preflight:async()=>({status:'ready',calendarId,accessRole:'owner'}),listEvents:async()=>({status:'ready',events:[calendarEvent],coverage:{complete:true}}),readEvent:async()=>({status:'ready',events:[calendarEvent]}),upsertEvent:async()=>{calendarWrites++;return {status:'ready',eventId};}};
 const a=createAutomationAdapters({env:{ASSISTANT_ALLOWED_SOURCE_IDS:[miroSource,discordSource,calendarSource].join(','),AGENT_CALENDAR_SOURCE_ID:calendarSource},config:readAutomationConfig({AGENT_AUTOMATION_ENABLED:'true'}),now,fetchImpl:async()=>{throw Error('No external calls');},dependencies:{
  miroConfig,miroStore,miroTools,googleConfig:{configured:false},googleClient:{configured:false},calendarConfig:{configured:true,calendarId,sourceId:calendarSource},calendarClient,
  discordConfig:{configured:true,guildId:'100'},discordStore,discordClient:{getGuildChannels:async()=>[channel],getChannel:async()=>channel},liveDiscordService:{configured:true,readMessages:readDiscord},
  discordTools:{tools:[{name:'read_discord_messages',description:'Read exact current Discord original',parameters:{type:'object',properties:{channelId:{type:'string'},messageId:{type:'string'}},required:['channelId','messageId'],additionalProperties:false}}],execute:readDiscord},
  mapEventService:{configured:true,read:async()=>({status:'ok',events:[],event_buildings:[],event_people:[],event_types:[],people:[],buildings:[{id:'bobst-library',name:'Bobst Library'}]}),upsert:async args=>{writes.push(args);return {status:'applied',event_id:randomUUID(),updated_at:now().toISOString()};}},
 }});
 const context={principal:a.principal,inputIds:[inputId]},tool=name=>a.tools.find(t=>t.name===name);
 const prepare=()=>a.prepareBatch({...context,inputs:[input]});
 const run=()=>{
  let round=0,batch;
  const store={configured:true,claim:async()=>({status:'ready',leaseToken:randomUUID(),inputs:[input]}),renew:async()=>({status:'ready'}),release:async()=>({status:'ready'}),action:async({complete})=>({status:complete?'completed':'execute'}),finish:async()=>{finished++;return {status:'ready'};}};
  const provider={toolTurn:async request=>{
   round++;batch??=JSON.parse(request.messages[0].content).batchContext;outputs.push(structuredClone(request));
   let name,args;
   if(round===1){name='read_discord_messages';args={channelId:'200',messageId:'300'};}
   else if(round===2){name='list_calendar_events';args={timeMin:batch.reconciliationWindow.timeMin,timeMax:batch.reconciliationWindow.timeMax};}
   else if(round===3){name='read_map_events';args={sourceId:calendarSource,sourceRecordId:eventId};}
   else if(round===4){name='upsert_map_event';args={event:{name:calendarEvent.title,kind:'scheduled_event',type_id:'event',status:'confirmed',time_kind:'timed',starts_at:calendarEvent.start.dateTime,ends_at:calendarEvent.end.dateTime,time_zone:'America/New_York',source_id:calendarSource,source_url:calendarUrl,source_record_id:eventId,reported_at:now().toISOString(),notes:calendarEvent.location},buildings:[{building_id:'bobst-library',location_notes:''}],people:[]};}
   else{name='finish_batch';args={handledInputIds:[inputId]};}
   return {stopReason:'tool_calls',toolCalls:[{id:'call_'+round,name,arguments:name==='finish_batch'?args:{inputIds:[inputId],arguments:args}}]};
  }};
  return createAutomationHandler({...a,store,provider,config:readAutomationConfig({AGENT_AUTOMATION_ENABLED:'true'}),now}).tick();
 };
 return {a,context,prepare,run,tool,writes,outputs,counts:()=>({upstream,calendarWrites,discordReads,finished}),revoke:()=>{revoked=true;}};
}

test('actual handler completes unrelated Discord/Calendar map work while Miro navigation is explicitly deferred',async()=>{
 const f=fixture();const result=await f.run();assert.equal(result.status,'completed');assert.equal(f.writes.length,1);assert.equal(f.counts().finished,1);assert.equal(f.counts().calendarWrites,0);assert(f.counts().discordReads>0);
 assert.deepEqual(result.miroReconciliation,{status:'deferred',boardCount:1,syncComplete:false});assert(!JSON.stringify(result).includes(boardId));
 const batch=JSON.parse(f.outputs[0].messages[0].content).batchContext;
 assert.deepEqual(batch.miro.deferredBoards,[boardId]);assert.equal(batch.miro.reconciliationStatus,'deferred');assert.equal(batch.miro.syncComplete,false);assert.equal(batch.miro.coverage.complete,false);
 assert.equal(batch.miro.boards[0].result.status,'unavailable');assert.deepEqual(batch.miro.boards[0].result.sources,[]);assert.equal(batch.miro.boards[0].contextSummary.status,'unavailable');
 assert.equal(f.writes[0].event.source_id,calendarSource);assert.equal(f.writes[0].event.source_record_id,eventId);
});
test('only explicit transient navigation failures defer, strip failed payloads and retry next batch',async()=>{
 for(const failure of ['tool_result_error','request_timeout','unavailable']){
  const f=fixture({rawOverview:{status:failure,sources:[{sourceKey:'PRIVATE_FAKE_FACT'}],boardContext:{private:'PRIVATE_FAKE_FACT'}}});
  const batch=await f.prepare();assert.deepEqual(batch.miro.deferredBoards,[boardId]);assert(!JSON.stringify(batch).includes('PRIVATE_FAKE_FACT'));
  const before=f.counts().upstream,result=await f.tool('read_miro_item').execute({boardId,itemId:'fake',type:'canvas'},f.context);
  assert.equal(result.status,'ready');assert.equal(result.sourceStatus,'unavailable');assert.equal(result.deferred,true);assert.equal(result.contentAvailable,false);assert.deepEqual(result.sources,[]);assert.equal(result.coverage.complete,false);assert.equal(f.counts().upstream,before);
  const completion=await f.a.validateCompletion(f.context);assert.equal(completion.status,'pending');assert.deepEqual(completion.miroReconciliation,{status:'deferred',boardIds:[boardId],syncComplete:false});
  await f.prepare();assert.equal(f.counts().upstream,before+1,'next batch retries navigation');
 }
});
test('Miro access, configuration, malformed content, catalogue and revocation failures remain fatal before any action',async()=>{
 for(const options of [{configured:false},{catalogueStatus:'forbidden'},{catalogueStatus:'unavailable'},{missingContext:true},{revokeDuringOverview:true},...['forbidden','auth_required','not_configured','invalid_mcp_result','invalid_svg','response_byte_limit','invalid_request','aborted'].map(status=>({rawOverview:{status}}))]){
  const f=fixture(options),result=await f.run();assert.notEqual(result.status,'completed');assert.equal(f.writes.length,0);assert.equal(f.counts().calendarWrites,0);assert.equal(f.counts().finished,0);assert.equal(f.outputs.length,0);
 }
});
test('deferred Miro cannot supply Calendar write evidence; current access still gates deferred read reports',async()=>{
 const f=fixture();await f.prepare();
 const forged=await f.tool('upsert_calendar_event').execute({sourceKey:'miro:fixture:fake',sourceUrl:'https://miro.com/app/board/fixture/?moveToWidget=fake',title:'Invented',start:{date:'2026-10-20'},end:{date:'2026-10-21'}},f.context);
 assert.equal(forged.status,'forbidden_source');assert.equal(f.counts().calendarWrites,0);
 f.revoke();assert.equal((await f.tool('read_miro_item').execute({boardId,itemId:'fake',type:'canvas'},f.context)).status,'forbidden');assert.equal(f.counts().upstream,1);
});
test('actual MCP parser rejects malformed JSON and response shapes before unrelated handler actions',async()=>{
 for(const mcpResponse of [null,{content:[{type:'text',text:'{this is malformed JSON'}]},
  {content:{}},{content:[null]},{content:[{type:'text',text:{private:'PRIVATE_PARSE_CANARY'}}]},
  {content:[{type:'text',text:'[]'}]},{structuredContent:[]},{structuredContent:null,content:[{type:'text',text:'{}'}]},
  {isError:'false',content:[{type:'text',text:'{}'}]}]){
  const f=fixture({mcpResponse});const result=await f.run();assert.notEqual(result.status,'completed');assert.equal(f.writes.length,0);assert.equal(f.counts().calendarWrites,0);assert.equal(f.counts().finished,0);assert.equal(f.outputs.length,0);assert.equal(f.counts().upstream,1);assert(!JSON.stringify(result).includes('PRIVATE_PARSE_CANARY'));
 }
 const upstreamError=fixture({mcpResponse:{isError:true,content:[{type:'text',text:'Private upstream tool failure'}]}});
 assert.equal((await upstreamError.run()).status,'completed');assert.equal(upstreamError.writes.length,1,'real upstream tool error remains a navigation outage');
});
test('outage prompt preserves explicit deferral and fits the longest supported timezone budget',()=>{
 const prompt=buildAutomationPrompt({timezone:'America/Argentina/ComodRivadavia',now:now()});
 assert(Buffer.byteLength(prompt)<24576);assert.match(prompt,/Skip miro\.deferredBoards until next batch/);assert.match(prompt,/not empty\/synced/);assert.match(prompt,/dependent Miro work stays pending/);
});
test('outward completion reports only bounded deferred counts and never raw board IDs or private metadata',async()=>{
 const privateId='PRIVATE_BOARD_IDENTIFIER';
 for(const marker of [{status:'deferred',boardIds:[privateId],syncComplete:false,privateError:'PRIVATE_ERROR'},
  {status:'deferred',boardIds:Array(8).fill(privateId),syncComplete:false},
  ...[{}, {status:'ready',boardIds:[privateId],syncComplete:false},{status:'deferred',boardIds:[privateId],syncComplete:true},
   {status:'deferred',boardIds:[],syncComplete:false},{status:'deferred',boardIds:Array(9).fill(privateId),syncComplete:false},
   {status:'deferred',boardIds:privateId,syncComplete:false}]]){
  const handler=createAutomationHandler({config:readAutomationConfig({AGENT_AUTOMATION_ENABLED:'true'}),principal:{id:'fixture'},authorizeEvent:async()=>true,
   tools:[{name:'inert_read',description:'Inert fixture',readOnly:true,parameters:{type:'object',properties:{}},execute:async()=>({status:'ready'})}],
   validateCompletion:async()=>({status:'ready',miroReconciliation:marker}),
   store:{configured:true,claim:async()=>({status:'ready',leaseToken:randomUUID(),inputs:[{uuid:inputId,raw_response:{source:'discord',source_id:discordSource,event_type:'message_created',event_id:'300',revision:'1',received_at:now().toISOString(),payload:{}}}]}),renew:async()=>({status:'ready'}),finish:async()=>({status:'ready'}),release:async()=>({status:'ready'})},
   provider:{toolTurn:async()=>({stopReason:'tool_calls',toolCalls:[{id:'finish',name:'finish_batch',arguments:{handledInputIds:[inputId]}}]})}});
  const result=await handler.tick();assert.equal(result.status,'completed');assert(!JSON.stringify(result).includes('PRIVATE_'));
  if(marker.status==='deferred'&&marker.syncComplete===false&&Array.isArray(marker.boardIds)&&marker.boardIds.length>=1&&marker.boardIds.length<=8)
   assert.deepEqual(result.miroReconciliation,{status:'deferred',boardCount:marker.boardIds.length,syncComplete:false});
  else assert.equal(result.miroReconciliation,undefined);
 }
});
