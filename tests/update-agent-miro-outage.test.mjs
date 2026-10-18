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
function fixture({failure='tool_result_error',catalogueStatus='ready',configured=true,rawOverview,missingContext=false,revokeDuringOverview=false,mcpResponse,failAfter=0,retryAt}={}) {
 let revoked=false,upstream=0,calendarWrites=0,discordReads=0,finished=0,batches=0;const writes=[],outputs=[];
 const miroConfig={configured,boardIds:[boardId],teamId:'team'};
 const miroStore={configured:true,authorizedBoard:async()=>({status:revoked?'forbidden':'ready',data:{board_id:boardId,source_id:miroSource,team_id:'team',title:'Fixture board'}})};
 const realMiro=createMiroMcpTools({config:miroConfig,store:miroStore,client:{configured:true,callTool:async(name,args)=>{
  upstream++;if(revokeDuringOverview)revoked=true;
  if(failure&&(mcpResponse===undefined||failAfter>0)&&upstream>failAfter){const error=new MiroMcpError(failure);error.retryAt=retryAt;error.private='PRIVATE_QUOTA_CANARY';throw error;}
  if(mcpResponse!==undefined)return typeof mcpResponse==='function'?mcpResponse(upstream,name,args):mcpResponse;
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
  miroConfig,miroStore,miroTools,miroClient:{beginBackgroundBatch:()=>{batches++;}},googleConfig:{configured:false},googleClient:{configured:false},calendarConfig:{configured:true,calendarId,sourceId:calendarSource},calendarClient,
  discordConfig:{configured:true,guildId:'100'},discordStore,discordClient:{getGuildChannels:async()=>[channel],getChannel:async()=>channel},liveDiscordService:{configured:true,readMessages:readDiscord},
  discordTools:{tools:[{name:'read_discord_messages',description:'Read exact current Discord original',parameters:{type:'object',properties:{channelId:{type:'string'},messageId:{type:'string'}},required:['channelId','messageId'],additionalProperties:false}}],execute:readDiscord},
  mapEventService:{configured:true,read:async()=>({status:'ok',events:[],event_buildings:[],event_people:[],event_types:[],people:[],buildings:[{id:'bobst-library',name:'Bobst Library'}]}),upsert:async args=>{writes.push(args);return {status:'applied',event_id:randomUUID(),updated_at:now().toISOString()};}},
 }});
 const context={principal:a.principal,inputIds:[inputId]},tool=name=>a.tools.find(t=>t.name===name);
 const prepare=()=>a.prepareBatch({...context,inputs:[input]});
 const run=({midBatchRead=false}={})=>{
  let round=0,batch;
  const store={configured:true,claim:async()=>({status:'ready',leaseToken:randomUUID(),inputs:[input]}),renew:async()=>({status:'ready'}),release:async()=>({status:'ready'}),action:async({complete})=>({status:complete?'completed':'execute'}),finish:async()=>{finished++;return {status:'ready'};}};
  const provider={toolTurn:async request=>{
   round++;batch??=JSON.parse(request.messages[0].content).batchContext;outputs.push(structuredClone(request));
   let name,args;
   const step=round-(midBatchRead?1:0);
   if(midBatchRead&&round===1){name='read_miro_item';args={boardId,itemId:'fake',type:'canvas'};}
   else if(step===1){name='read_discord_messages';args={channelId:'200',messageId:'300'};}
   else if(step===2){name='list_calendar_events';args={timeMin:batch.reconciliationWindow.timeMin,timeMax:batch.reconciliationWindow.timeMax};}
   else if(step===3){name='read_map_events';args={sourceId:calendarSource,sourceRecordId:eventId};}
   else if(step===4){name='upsert_map_event';args={event:{name:calendarEvent.title,kind:'scheduled_event',type_id:'event',status:'confirmed',time_kind:'timed',starts_at:calendarEvent.start.dateTime,ends_at:calendarEvent.end.dateTime,time_zone:'America/New_York',source_id:calendarSource,source_url:calendarUrl,source_record_id:eventId,reported_at:now().toISOString(),notes:calendarEvent.location},buildings:[{building_id:'bobst-library',location_notes:''}],people:[]};}
   else{name='finish_batch';args={handledInputIds:[inputId]};}
   return {stopReason:'tool_calls',toolCalls:[{id:'call_'+round,name,arguments:name==='finish_batch'?args:{inputIds:[inputId],arguments:args}}]};
  }};
  return createAutomationHandler({...a,store,provider,config:readAutomationConfig({AGENT_AUTOMATION_ENABLED:'true'}),now}).tick();
 };
 return {a,context,prepare,run,tool,writes,outputs,counts:()=>({upstream,calendarWrites,discordReads,finished,batches}),revoke:()=>{revoked=true;}};
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


test('quota and governor deferrals complete real handler Calendar/map work with safe no-content context',async()=>{
 const retryAt='2026-10-19T00:00:00.000Z';
 for(const failure of ['quota_exhausted','budget_exhausted','reconciliation_deferred','quota_state_unavailable']){
  const f=fixture({failure,retryAt}),result=await f.run();
  assert.equal(result.status,'completed');assert.equal(f.writes.length,1);assert.equal(f.counts().calendarWrites,0);
  assert.equal(f.counts().batches,1);assert.equal(f.counts().upstream,1);
  assert.deepEqual(result.miroReconciliation,{status:'deferred',boardCount:1,syncComplete:false});
  const batch=JSON.parse(f.outputs[0].messages[0].content).batchContext;
  const failed=batch.miro.boards[0].result;
  assert.equal(failed.sourceStatus,failure);assert.equal(failed.retryAt,retryAt);assert.equal(failed.contentAvailable,false);
  assert.equal(failed.coverage.complete,false);assert.deepEqual(failed.sources,[]);
  assert(!JSON.stringify(batch).includes('PRIVATE_QUOTA_CANARY'));assert(!failed.notice.includes('until the next batch'));
 }
});

test('quota metadata is fixed and canonical UTC only; revoked access remains fatal',async()=>{
 for(const failure of ['quota_exhausted','budget_exhausted','reconciliation_deferred','quota_state_unavailable']){
  const f=fixture({failure,retryAt:'PRIVATE_RETRY_CANARY'});await f.prepare();
  const result=await f.tool('read_miro_item').execute({boardId,itemId:'fake',type:'canvas'},f.context);
  assert.equal(result.retryAt,undefined);assert(!JSON.stringify(result).includes('PRIVATE_'));
  f.revoke();assert.equal((await f.tool('read_miro_item').execute({boardId,itemId:'fake',type:'canvas'},f.context)).status,'forbidden');
  assert.equal(f.counts().upstream,1);
  const revoked=fixture({failure,revokeDuringOverview:true});assert.notEqual((await revoked.run()).status,'completed');
  assert.equal(revoked.outputs.length,0);assert.equal(revoked.writes.length,0);
 }
});

test('mid-batch quota defers the board, blocks fake Miro writes and prevents repeated calls',async()=>{
 const f=fixture({failure:'quota_exhausted',failAfter:1,retryAt:'2026-10-19T00:00:00.000Z'});
 const batch=await f.prepare();assert.equal(batch.miro.deferredBoards,undefined);assert.equal(f.counts().upstream,1);
 const read=()=>f.tool('read_miro_item').execute({boardId,itemId:'fake',type:'canvas'},f.context);
 const first=await read();assert.equal(first.status,'ready');assert.equal(first.sourceStatus,'quota_exhausted');assert.deepEqual(first.sources,[]);
 assert.equal(first.contentAvailable,false);assert.equal(first.coverage.complete,false);assert.equal(f.counts().upstream,2);
 assert.deepEqual(await read(),first);assert.equal(f.counts().upstream,2);
 const completion=await f.a.validateCompletion(f.context);
 assert.deepEqual(completion.miroReconciliation,{status:'deferred',boardIds:[boardId],syncComplete:false});
 const forged=await f.tool('upsert_calendar_event').execute({sourceKey:'miro:fixture:fake',sourceUrl:'https://miro.com/app/board/fixture/?moveToWidget=fake',title:'Invented',start:{date:'2026-10-20'},end:{date:'2026-10-21'}},f.context);
 assert.equal(forged.status,'forbidden_source');assert.equal(f.counts().calendarWrites,0);
 f.revoke();assert.equal((await read()).status,'forbidden');assert.equal(f.counts().upstream,2);
 await f.a.cleanupBatch();assert.equal(f.counts().batches,1);
});

test('shared chat-facing tools expose safe quota status without provider text or source facts',async()=>{
 for(const failure of ['quota_exhausted','budget_exhausted','reconciliation_deferred','quota_state_unavailable']){
  const client={configured:true,callTool:async()=>{const error=new MiroMcpError(failure);error.retryAt='2026-10-19T00:00:00.000Z';error.private='PRIVATE_QUOTA_CANARY';throw error;}};
  const tools=createMiroMcpTools({config:{configured:true,boardIds:[boardId],teamId:'team'},store:{configured:true,authorizedBoard:async()=>({status:'ready',data:{board_id:boardId,source_id:miroSource,team_id:'team'}})},client,now});
  const result=await tools.execute({name:'read_miro_board',arguments:{boardId},principal:{allowedSourceIds:[miroSource]}});
  assert.equal(result.status,failure);assert.equal(result.retryAt,'2026-10-19T00:00:00.000Z');assert.equal(result.contentAvailable,false);
  assert.deepEqual(result.sources,[]);assert.equal(result.coverage.complete,false);assert(result.notice.length>20);assert(!JSON.stringify(result).includes('PRIVATE_'));
 }
});


test('actual handler records a mid-batch quota deferral and still completes Calendar projection',async()=>{
 const f=fixture({failure:'quota_exhausted',failAfter:1,retryAt:'2026-10-19T00:00:00.000Z'});
 const result=await f.run({midBatchRead:true});
 assert.equal(result.status,'completed');assert.equal(f.counts().upstream,2);assert.equal(f.writes.length,1);
 assert.equal(f.writes[0].event.source_id,calendarSource);assert.equal(f.counts().calendarWrites,0);
 assert.deepEqual(result.miroReconciliation,{status:'deferred',boardCount:1,syncComplete:false});
});

test('a quota after successful item evidence revokes that boards mutation evidence for the batch',async()=>{
 const f=fixture({failure:'budget_exhausted',failAfter:2,mcpResponse:(_count,name)=>name==='canvas_search'
  ?{structuredContent:{total_items:1,total_results:0,results:[]}}
  :{structuredContent:{success:true,miro_url:'https://miro.com/app/board/fixture/',svg:'<svg xmlns="http://www.w3.org/2000/svg"><g data-miro-id="realitem" data-type="sticky_note"><text>Confirmed club workshop October 20</text></g></svg>',item_count:1,skipped_count:0}}});
 await f.prepare();
 const first=await f.tool('read_miro_item').execute({boardId,itemId:'realitem',type:'canvas'},f.context);
 assert.equal(first.status,'ready');assert(first.sources.some(source=>source.sourceKey==='miro:fixture:realitem'));
 const quota=await f.tool('read_miro_item').execute({boardId,itemId:'otheritem',type:'canvas'},f.context);
 assert.equal(quota.sourceStatus,'budget_exhausted');assert.equal(f.counts().upstream,3);
 const mutation=await f.tool('upsert_calendar_event').execute({sourceKey:'miro:fixture:realitem',sourceUrl:'https://miro.com/app/board/fixture/?moveToWidget=realitem',title:'Workshop',start:{date:'2026-10-20'},end:{date:'2026-10-21'}},f.context);
 assert.equal(mutation.status,'forbidden_source');assert.equal(f.counts().calendarWrites,0);
});

test('explicit provider quota envelopes are classified safely without exposing their upgrade text',async()=>{
 const f=fixture({mcpResponse:{isError:true,content:[{type:'text',text:'Your organization has reached its daily Miro MCP tool call limit of 100 calls on the Free plan. The limit resets tomorrow. PRIVATE_UPGRADE_CANARY'}]}});
 const result=await f.run();assert.equal(result.status,'completed');
 const batch=JSON.parse(f.outputs[0].messages[0].content).batchContext;
 assert.equal(batch.miro.boards[0].result.sourceStatus,'quota_exhausted');assert(!JSON.stringify(batch).includes('PRIVATE_UPGRADE_CANARY'));
});
