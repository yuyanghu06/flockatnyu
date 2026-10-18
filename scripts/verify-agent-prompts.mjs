import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {setTimeout as pause} from 'node:timers/promises';
import {createProvider} from '../server/providers/index.js';
import {readConfig} from '../server/config.js';
import {retrieveAssistantContext,assistantAnswerPrompt} from '../server/assistant-context.js';
import {createLiveDiscordRetrieval} from '../server/discord/live-retrieval.js';
import {discordSnowflakeAt} from '../server/discord/live-client.js';
import {EBOARD_CATEGORY_ID} from '../server/discord/channel-scope.js';
import {createLiveChatTools} from '../tools/discord/live-summary.js';
import {createLiveRetrievalTools} from '../tools/discord/index.js';
import {createChatCalendarTools} from '../tools/calendar/chat.js';
import {MIRO_MCP_TOOLS} from '../tools/miro/mcp.js';
import {createMapTools} from '../tools/map/index.js';
import {createChatMapTools} from '../tools/map/chat.js';
import {validateArguments} from '../server/automation/validation.js';
import {createAutomationAdapters} from '../server/automation/adapters.js';
import {createAutomationHandler} from '../server/automation/handler.js';
import {readAutomationConfig} from '../server/automation/config.js';

// Explicitly opt in. Run with Node's --env-file-if-exists flags; no source
// credentials are inspected, persisted or used by this fixture harness.
if(!process.argv.includes('--live-model')) {
  console.log('No model calls made. Add --live-model and load the normal environment files to run synthetic behavioral smoke tests.');
  process.exit(0);
}
const config=readConfig();
if(!config.configured)throw Error('Configured model unavailable; no credentials printed.');
const CASE_TIMEOUT_MS=config.requestTimeoutMs||300000, MAX_MODEL_CALLS=180, MODEL_MIN_INTERVAL_MS=1000;
// Enable only the synthetic handler invocation; retain the actual configured
// worker budgets/defaults so smoke coverage cannot hide production limits.
const automationConfig=readAutomationConfig({...process.env,AGENT_AUTOMATION_ENABLED:'true'});
assert.equal(automationConfig.maxRounds,16,'Smoke run must use the effective production round budget');
assert.equal(automationConfig.maxCalls,32,'Smoke run must use the effective production tool-call budget');
assert.equal(automationConfig.maxRunMs,180000,'Smoke run must use the effective production runtime budget');
const now='2026-10-18T16:00:00.000Z', zone='America/New_York';
const ids={discord:'20000000-0000-4000-8000-000000000002',miro:'10000000-0000-4000-8000-000000000001',
  calendar:'30000000-0000-4000-8000-000000000003',gmail:'40000000-0000-4000-8000-000000000004',
  input:'50000000-0000-4000-8000-000000000005',person:'60000000-0000-4000-8000-000000000006',
  event:'70000000-0000-4000-8000-000000000007',lease:'80000000-0000-4000-8000-000000000008'};
const guildId='100',eboard='200',marketing='201',engineering='202',general='203';
const posted='2026-10-18T15:00:00.000Z',messageId=discordSnowflakeAt(posted);
const discordUrl=`https://discord.com/channels/${guildId}/${eboard}/${messageId}`;
const calendarId='synthetic-club@group.calendar.google.com',occurrenceId='workshop_20261020T220000Z';
const calendarUrl=`https://calendar.google.com/calendar/event?eid=${Buffer.from(`${occurrenceId} ${calendarId}`).toString('base64url')}`;
const boardId='synthetic-board',itemId='501',miroUrl=`https://miro.com/app/board/${boardId}/?moveToWidget=${itemId}`;
const calendarEvent={eventId:occurrenceId,url:calendarUrl,title:'Synthetic Workshop',status:'confirmed',managed:false,
  start:{dateTime:'2026-10-20T22:00:00.000Z',timeZone:zone},end:{dateTime:'2026-10-21T00:00:00.000Z',timeZone:zone},
  location:'Bobst Library, room 204',description:'Synthetic public club workshop.',
  createdAt:'2026-10-17T14:00:00.000Z',updatedAt:'2026-10-18T14:00:00.000Z'};
let activeCase,modelCalls=0,lastModelDispatchAt=0;
const modelDispatchTimes=[];
const rawProvider=createProvider(config,{fetchImpl:async(url,options)=>{
  if(modelCalls>=MAX_MODEL_CALLS)throw Error('smoke_model_call_limit');
  const target=new URL(url),allowed=new URL(config.baseUrl);
  if(target.origin!==allowed.origin)throw Error('unconfigured_network_target');
  while(Date.now()-lastModelDispatchAt<MODEL_MIN_INTERVAL_MS)
    await pause(MODEL_MIN_INTERVAL_MS-(Date.now()-lastModelDispatchAt),undefined,{signal:options.signal});
  if(options.signal?.aborted)throw Error('aborted');
  lastModelDispatchAt=Date.now();
  modelDispatchTimes.push(lastModelDispatchAt);
  (activeCase.modelDispatchTimes??=[]).push(lastModelDispatchAt);
  modelCalls++;
  activeCase.modelCalls++;
  return fetch(url,options);
}});
const provider={
  async planTools(args){activeCase.planningTurns++;(activeCase.planningCatalogues??=[]).push(args.tools.map(tool=>tool.name));const calls=await rawProvider.planTools(args);activeCase.proposals.push(calls);return calls;},
  async toolTurn(args){
    activeCase.automationTurns++;
    activeCase.automationCatalogue=args.tools.map(tool=>tool.name);
    const seen=new Set((activeCase.modelToolFeedback||[]).map(row=>row.toolCallId));
    for(const message of args.messages.filter(row=>row.role==='tool'))if(!seen.has(message.toolCallId)){
      let result;try{result=JSON.parse(message.content);}catch{result={invalidJson:true,byteLength:Buffer.byteLength(message.content||'')};}
      (activeCase.modelToolFeedback??=[]).push({toolCallId:message.toolCallId,result});seen.add(message.toolCallId);
    }
    const turn=await rawProvider.toolTurn(args);activeCase.proposals.push(turn.toolCalls);return turn;
  },
  async *stream(args){activeCase.answerTurns++;yield* rawProvider.stream(args);},
};
const copy=value=>structuredClone(value);
const evidenceJson=value=>JSON.stringify(value,(key,entry)=>['excerpt','svg'].includes(key)?undefined:entry,2)+'\n';
const catalogue=()=>({events:[],event_buildings:[],event_people:[],
  buildings:[{id:'bobst-library',name:'Bobst Library'},{id:'courant-institute',name:'Courant Institute'}],
  people:[{id:ids.person,display_name:'Synthetic Member',is_trackable:true}],
  event_types:['study','meeting','event','social','other'].map((code,index)=>({code,name:code,description:'',icon_key:code,sort_order:index}))});
const rawMessage=(content,channelId=eboard)=>({id:messageId,guild_id:guildId,channel_id:channelId,
  author:{id:'400',username:'Synthetic Member'},timestamp:posted,content});
function record(name,args,result){activeCase.tools.push({name,arguments:copy(args),status:result.status,result:copy(result),
  ...(result.coverage?{coverage:copy(result.coverage)}:{}),...(result.channelCoverage?{channelCoverage:copy(result.channelCoverage)}:{})});return result;}
function tracked(adapter){
  const wrapper={...adapter,execute:async options=>record(options.name,options.arguments,await adapter.execute(options))};
  if(typeof adapter.createRequest==='function')wrapper.createRequest=(...args)=>tracked(adapter.createRequest(...args));
  return wrapper;
}

function sources({content='At Bobst Library studying.',calendarStatus='ready',events=[calendarEvent],miroEvent=false,emptyEboard=false,editedAt,mapSnapshot}={}) {
  const channels=[{id:EBOARD_CATEGORY_ID,name:'eboard',type:4,parent_id:null,guild_id:guildId},
    {id:'1203562092574277673',name:'marketing team',type:4,parent_id:null,guild_id:guildId},
    {id:'1203562092574277676',name:'engineering team',type:4,parent_id:null,guild_id:guildId},
    {id:eboard,name:'eboard-planning',type:0,parent_id:EBOARD_CATEGORY_ID,guild_id:guildId},
    {id:marketing,name:'marketing-updates',type:0,parent_id:'1203562092574277673',guild_id:guildId},
    {id:engineering,name:'engineering-updates',type:0,parent_id:'1203562092574277676',guild_id:guildId},
    {id:general,name:'general',type:0,parent_id:null,guild_id:guildId}];
  const rows=channels.filter(row=>row.type===0).map(row=>({channelId:row.id,guildId,sourceId:ids.discord,enabled:true}));
  const discordStore={configured:true,getPolicy:async()=>({status:'ready',policy:{guildId,revision:1,paused:false,discoveryEnabled:true,excludedCategoryIds:[],excludedChannelIds:[]}}),
    listSyncChannels:async()=>({status:'ready',channels:rows})};
  const makeMessage=(text,channelId=eboard)=>({...rawMessage(text,channelId),...(editedAt?{edited_timestamp:editedAt}:{})});
  const original=makeMessage(content);
  const contentFor=id=>id===marketing?'Marketing launch is scheduled; draft is ready.':id===engineering?'Engineering fixture update.':id===general?'Volunteer signups are open until October 23, 2026.':content;
  const discordClient={configured:true,getCurrentApplication:async()=>({flags:1<<18}),getGuildChannels:async()=>channels,
    getChannel:async({channelId})=>channels.find(row=>row.id===channelId),
    getMessage:async({channelId,messageId:requestedMessageId})=>{
      if(!rows.some(row=>row.channelId===channelId)||requestedMessageId!==messageId)throw Error('synthetic_message_not_found');
      return makeMessage(contentFor(channelId),channelId);},
    getMessages:async({channelId,before})=>{activeCase.sourceReads.push({provider:'discord',channelId});
      if(emptyEboard&&channelId===eboard)return [];
      if(before&&BigInt(before)<=BigInt(messageId))return [];
      return [makeMessage(contentFor(channelId),channelId)];},
    searchMessages:async({channelIds})=>{const selected=channelIds.filter(id=>!emptyEboard||id!==eboard);return {messages:selected.map(id=>makeMessage(contentFor(id),id)),totalResults:selected.length};}};
  const liveDiscordService=createLiveDiscordRetrieval({config:{configured:true,guildId},store:discordStore,client:discordClient});
  const discordTools=createLiveChatTools({service:liveDiscordService,guildId,config:{configured:false}});
  const state={events:copy(events),calendarWrites:[],mapWrites:[],lookups:[],snapshot:mapSnapshot?copy(mapSnapshot):catalogue()};
  const calendarClient={configured:true,calendarId,
    preflight:async()=>({status:'ready',calendarId,accessRole:'owner'}),
    listEvents:async({timeMin,timeMax,pageToken,limit=5})=>{
      if(!Number.isFinite(Date.parse(timeMin))||!Number.isFinite(Date.parse(timeMax))||Date.parse(timeMax)<=Date.parse(timeMin)||!Number.isInteger(limit)||limit<1||limit>5||pageToken!==undefined)
        return {status:'invalid_request',events:[]};
      if(calendarStatus!=='ready')return {status:calendarStatus,events:[],nextPageToken:null,coverage:{complete:false,windowOnly:true}};
      const selected=state.events.filter(event=>Date.parse(event.end.dateTime||event.end.date)>Date.parse(timeMin)&&Date.parse(event.start.dateTime||event.start.date)<Date.parse(timeMax));
      // Each scenario has at most one occurrence: this fixture never issues a
      // next-page token, so every supplied token is invalid rather than a repeat.
      assert(selected.length<=limit,'Fixture would require unimplemented pagination');
      return {status:'ready',events:copy(selected),nextPageToken:null,coverage:{complete:true,windowOnly:true}};},
    readEvent:async({eventId})=>({status:'ready',events:copy(state.events.filter(e=>e.eventId===eventId))}),
    upsertEvent:async args=>{state.calendarWrites.push(copy({...args,principal:undefined,signal:undefined}));
      const existing=state.events.find(row=>row.eventId===occurrenceId&&row.managed===true&&row.sourceUrl===args.sourceUrl);
      const event={...copy(calendarEvent),managed:true,title:args.title,start:args.start,end:args.end,location:args.location||'',description:args.description||'',sourceUrl:args.sourceUrl,createdAt:existing?.createdAt||now,updatedAt:now};
      state.events=[event];return {status:'ready',eventId:event.eventId,outcome:existing?'updated':'created'};},
    cancelEvent:async()=>({status:'forbidden'})};
  const miroSource={id:`miro:${boardId}:${itemId}`,kind:'miro',retrievalMode:'live',sourceId:ids.miro,boardId,itemId,
    sourceKey:`miro:${boardId}:${itemId}`,evidenceKind:'item',contentAvailable:true,url:miroUrl,title:'Synthetic October 2026 calendar',
    excerpt:miroEvent?'Synthetic Workshop, October 20, 2026, 6–8pm America/New_York, Bobst Library room 204.':'No scheduled entries in this synthetic October 2026 section.'};
  const board={boardId,sourceId:ids.miro,teamId:'synthetic-team',title:'Synthetic club calendar',url:`https://miro.com/app/board/${boardId}/`};
  const navigation={format:'miro-mcp-search-v1',payload:{results:[{id:itemId,itemId,title:'October 2026',type:'frame',text:'October 2026'}]},
    notice:'Navigation only. Read canvas item 501 for actual calendar content.'};
  const miroTools={configured:true,transport:'mcp',tools:MIRO_MCP_TOOLS,
    prepareBoard:async({boardId:requestedBoardId})=>requestedBoardId===boardId
      ?{status:'ready',sources:[],boardContext:copy(navigation),coverage:{complete:true}}
      :{status:'forbidden',sources:[]},
    execute:async({name,arguments:args})=>{
      if(!validateArguments(args,MIRO_MCP_TOOLS.find(t=>t.name===name)?.parameters))return {status:'invalid_request',sources:[]};
      activeCase.sourceReads.push({provider:'miro',name});
      if(name==='list_miro_boards')return {status:'ready',sources:[],boardContext:{boards:[board]},coverage:{complete:true}};
      if(args.boardId!==boardId)return {status:'forbidden',sources:[]};
      if(name==='read_miro_item'&&(args.itemId!==itemId||args.itemIds?.some(id=>id!==itemId)))return {status:'not_found',sources:[]};
      if(name==='read_miro_board')return {status:'ready',sources:[],boardContext:copy(navigation),coverage:{complete:true,navigationOnly:true}};
      return {status:'ready',sources:[copy(miroSource)],boardContext:{format:'miro-mcp-canvas-v1',
        payload:{svg:`<svg><g data-miro-id="501"><text>October 2026</text><text>${miroSource.excerpt}</text><text>Last changed October 17 2026 10:00 America/New_York</text></g></svg>`}},
        coverage:{complete:true,contentAvailable:true}};
    }};
  const mapEventService={configured:true,
    read:async()=>({status:'ok',...copy(state.snapshot)}),
    lookup:async args=>{state.lookups.push(copy({...args,principal:undefined,signal:undefined}));return {status:'ok',person:args.provider==='discord'&&args.providerUserId==='400'?{id:ids.person,display_name:'Synthetic Member',is_trackable:true}:null};},
    upsert:async args=>{state.mapWrites.push(copy({...args,principal:undefined,signal:undefined}));
      const eventId=args.event.id||ids.event;
      state.snapshot.events=[...state.snapshot.events.filter(row=>row.id!==eventId),{...copy(args.event),id:eventId,created_at:now,updated_at:now}];
      state.snapshot.event_buildings=[...state.snapshot.event_buildings.filter(row=>row.event_id!==eventId),...args.buildings.map(row=>({...copy(row),event_id:eventId}))];
      state.snapshot.event_people=[...state.snapshot.event_people.filter(row=>row.event_id!==eventId),...args.people.map(row=>({...copy(row),event_id:eventId}))];
      return {status:'applied',event_id:eventId,updated_at:now};}};
  return {state,original,discordStore,discordClient,liveDiscordService,discordTools,calendarClient,miroTools,mapEventService};
}

async function runChat(prompt,options={}) {
  const f=sources(options),signal=AbortSignal.timeout(CASE_TIMEOUT_MS);
  const principal={id:'synthetic-chat',allowedSourceIds:Object.values(ids).slice(0,4),googleAccess:true,liveDiscord:{mode:'local-operator',guildId}};
  const mapTools=createChatMapTools({mapTools:createMapTools({service:f.mapEventService})});
  const trackedMap={...mapTools,createRequest:(...args)=>tracked(mapTools.createRequest(...args))};
  const messages=[{role:'user',content:prompt}];
  const context=await retrieveAssistantContext({messages,principal,provider,liveTools:tracked(f.discordTools),
    googleTools:tracked(createChatCalendarTools({client:f.calendarClient,sourceId:ids.calendar})),
    miroTools:tracked(f.miroTools),mapTools:trackedMap,timeZone:zone,now,signal});
  let answer='';for await(const chunk of provider.stream({messages,system:assistantAnswerPrompt({...context,timeZone:zone,now}),signal}))answer+=chunk;
  activeCase.answer=answer;activeCase.retrieval=copy(context.results);activeCase.mapWrites=copy(f.state.mapWrites);activeCase.calendarWrites=copy(f.state.calendarWrites);
  assert(answer.trim().length>0,'No final answer');
  assert(!/\b(obviously|you should have|as i already said|that is your fault|just read it yourself)\b/i.test(answer),'Sharp/scolding answer tone');
  return {f,context,answer};
}
const names=()=>activeCase.tools.map(row=>row.name);
const instant=value=>new Date(value).toISOString();
function assertPresence(write){
  assert.equal(write.event.kind,'presence');assert.equal(write.event.type_id,'study');
  assert.equal(write.event.time_kind,'timed','Explicit current presence needs its original-report active window');
  assert.equal(write.event.source_id,ids.discord);assert(write.event.source_record_id.includes(messageId),'Presence identity must retain original Discord message ID');
  assert.equal(instant(write.event.starts_at),posted);assert.equal(instant(write.event.ends_at),'2026-10-18T17:00:00.000Z');
  assert.equal(instant(write.event.reported_at),posted);assert.equal(write.event.source_url,discordUrl);
  assert.deepEqual(write.buildings.map(row=>row.building_id),['bobst-library']);
  assert.equal(write.people.length,1);assert.equal(write.people[0].person_id,ids.person);
  assert.equal(write.people[0].presence_basis,'reported');assert.equal(write.people[0].source_url,discordUrl);
  assert.match(write.people[0].label,/study/i);
}

async function runAutomation(options={}) {
  const f=sources(options);
  const env={ASSISTANT_ALLOWED_SOURCE_IDS:[ids.discord,ids.miro,ids.calendar,ids.gmail].join(','),AGENT_GMAIL_SOURCE_ID:ids.gmail,AGENT_CALENDAR_SOURCE_ID:ids.calendar};
  const adapters=createAutomationAdapters({env,config:automationConfig,now:()=>new Date(now),fetchImpl:async()=>{throw Error('Real source network forbidden');},dependencies:{
    googleConfig:{configured:true},googleClient:{configured:true,
      searchGmail:async({query})=>{activeCase.sourceReads.push({provider:'gmail',operation:'search',query});return {status:'ready',sources:[],possiblyTruncated:false};},
      readGmail:async()=>({status:'not_found',sources:[]})},calendarConfig:{configured:true,calendarId},calendarClient:f.calendarClient,
    miroConfig:{configured:true,boardIds:[boardId],teamId:'synthetic-team'},
    miroStore:{configured:true,authorizedBoard:async({boardId:requestedBoardId})=>requestedBoardId===boardId
      ?{status:'ready',data:{board_id:boardId,source_id:ids.miro,team_id:'synthetic-team'}}:{status:'forbidden'}},
    miroTools:f.miroTools,discordConfig:{configured:true,guildId},discordStore:f.discordStore,discordClient:f.discordClient,
    liveDiscordService:f.liveDiscordService,discordTools:createLiveRetrievalTools({service:f.liveDiscordService,guildId}),mapEventService:f.mapEventService}});
  const input={uuid:ids.input,raw_response:{source:'discord',source_id:ids.discord,event_type:options.eventType||'message_created',event_id:messageId,revision:options.eventType==='message_updated'?'2':'1',received_at:now,payload:f.original}};
  let finished=[];
  const store={configured:true,claim:async()=>({status:'ready',leaseToken:ids.lease,inputs:[input]}),renew:async()=>({status:'ready'}),release:async()=>({status:'ready'}),
    action:async({complete})=>({status:complete?'completed':'execute'}),finish:async({handledInputIds})=>{finished=handledInputIds;return {status:'ready'};}};
  const tools=adapters.tools.map(tool=>({...tool,execute:async(args,context)=>record(tool.name,args,await tool.execute(args,context))}));
  const handler=createAutomationHandler({...adapters,tools,store,provider,config:automationConfig,now:()=>new Date(now)});
  const result=await handler.tick();
  activeCase.outcome=result;activeCase.handledInputIds=finished;activeCase.mapWrites=copy(f.state.mapWrites);activeCase.calendarWrites=copy(f.state.calendarWrites);
  assert.equal(result.status,'completed',`Automation outcome: ${result.status}`);assert.deepEqual(finished,[ids.input]);
  return f;
}

const cases=[
  ['chat-broad-discord',async()=>{await runChat('Give me a calm, concise update on what is going on in our Discord server.');
    assert.equal(names()[0],'read_discord_summary');assert(['eboard',undefined].includes(activeCase.tools[0].arguments.scope));
    assert(activeCase.sourceReads.filter(r=>r.provider==='discord').every(row=>row.channelId===eboard));}],
  ['chat-empty-eboard-general-fallback',async()=>{const {context,answer}=await runChat('Give me a calm, concise update on what is going on in our Discord server.',{emptyEboard:true});
    const scans=activeCase.tools.filter(row=>row.name==='read_discord_summary');
    assert.deepEqual(scans.map(row=>row.arguments.scope||'eboard'),['eboard','general']);
    assert(!activeCase.sourceReads.some(row=>[marketing,engineering].includes(row.channelId)));
    assert(context.sources.some(row=>row.channelId===general&&/Volunteer signups/i.test(row.excerpt)),'Useful general fallback update was not retrieved');
    assert.match(answer,/volunteer|signups/i);}],
  ['chat-explicit-marketing',async()=>{const {context,answer}=await runChat('Read the marketing team channels and summarize their updates.');
    assert(activeCase.sourceReads.some(row=>row.channelId===marketing));assert(!activeCase.sourceReads.some(row=>row.channelId===engineering));
    assert(context.sources.some(row=>row.channelId===marketing&&/Marketing launch|draft is ready/i.test(row.excerpt)),'Current marketing update was not retrieved');
    assert.match(answer,/launch|draft/i);}],
  ['chat-week-calendar-primary',async()=>{await runChat('What is happening during the week of October 19–25, 2026?');
    assert.equal(names()[0],'list_calendar_events');assert(!names().some(name=>name.includes('miro')));assert.match(activeCase.answer,/Synthetic Workshop/i);}],
  ['chat-week-empty-calendar-miro',async()=>{await runChat('What is happening during the week of October 19–25, 2026?',{events:[],miroEvent:true});
    assert.equal(names()[0],'list_calendar_events');assert(names().includes('read_miro_item'));assert.match(activeCase.answer,/Synthetic Workshop/i);assert.match(activeCase.answer,/Miro/i);}],
  ['chat-week-unavailable-calendar-miro',async()=>{await runChat('What is happening during the week of October 19–25, 2026?',{calendarStatus:'permission_denied',events:[],miroEvent:true});
    assert.equal(names()[0],'list_calendar_events');assert(names().includes('read_miro_item'));assert.match(activeCase.answer,/calendar/i);assert.match(activeCase.answer,/Miro/i);assert.match(activeCase.answer,/couldn.t|could not|unable|unavailable|permission|access|can.t/i);}],
  ['chat-source-backed-map-update',async()=>{const {f}=await runChat(`Please update the map from this original Discord message: ${discordUrl}. Read it and show the author's study activity at the stated building.`);
    assert(!/map(?:[- ]writing)? tool[^.]{0,50}(?:isn.t|is not|not) available/i.test(activeCase.answer),'The listed map tool was falsely described as unavailable');
    assert.equal(f.state.mapWrites.length,1);assertPresence(f.state.mapWrites[0]);assert(f.state.lookups.some(row=>row.providerUserId==='400'));
    assert(activeCase.retrieval.some(row=>row.mapWrite?.outcome==='applied'));assert.match(activeCase.answer,/map|added|updated|recorded/i);}],
  ['chat-unsupported-self-assertion',async()=>{const {f}=await runChat('I am at Bobst studying. Put me on the map right now.');
    assert.equal(f.state.mapWrites.length,0);assert(!/i(?:.ve| have)? (?:added|updated|saved|recorded)/i.test(activeCase.answer));}],
  ['automation-discord-presence',async()=>{const f=await runAutomation({events:[]});assert.equal(f.state.mapWrites.length,1);assertPresence(f.state.mapWrites[0]);assert.equal(f.state.calendarWrites.length,0,'Informal study presence must not create a Calendar event');}],
  ['automation-calendar-occurrence',async()=>{const f=await runAutomation({content:'FYI: the club calendar is available. No location or attendance claim.'});
    const write=f.state.mapWrites.find(row=>row.event.source_id===ids.calendar);assert(write,'Missing Calendar map event');
    assert.equal(write.event.source_record_id,occurrenceId);assert.equal(write.event.source_url,calendarUrl);
    assert.equal(write.event.kind,'scheduled_event');assert.equal(instant(write.event.reported_at),instant(calendarEvent.updatedAt));
    assert.equal(instant(write.event.starts_at),instant(calendarEvent.start.dateTime));assert.equal(instant(write.event.ends_at),instant(calendarEvent.end.dateTime));
    assert.equal(write.people.length,0);assert.equal(f.state.calendarWrites.length,0);}],
  ['automation-discord-rsvp-existing-calendar',async()=>{const f=await runAutomation({content:'I am going to Synthetic Workshop at Bobst Library on October 20, 2026, 6–8pm America/New_York.'});
    assert.equal(f.state.calendarWrites.length,0,'An RSVP must not create or edit a Calendar event');
    assert(f.state.mapWrites.length>0);assert(f.state.mapWrites.every(row=>row.event.source_id===ids.calendar),'RSVP must attach to existing Calendar projection');
    const write=f.state.mapWrites.at(-1);assert.equal(write.event.source_record_id,occurrenceId);
    assert.equal(write.people.length,1);assert.equal(write.people[0].person_id,ids.person);assert.equal(write.people[0].attendance_status,'going');
    assert.equal(write.people[0].source_url,discordUrl);assert.equal(write.people[0].presence_basis,'planned');}],
  ['automation-discord-calendar-announcement-create',async()=>{const f=await runAutomation({events:[],content:'Tech@NYU event: Synthetic Workshop is scheduled for October 20, 2026, from 6pm to 8pm America/New_York at Bobst Library room 204. This announcement does not state anyone’s attendance.'});
    assert.equal(f.state.calendarWrites.length,1);const calendarWrite=f.state.calendarWrites[0];
    assert.equal(calendarWrite.sourceKey,`discord:${guildId}:${eboard}:${messageId}`);assert.equal(calendarWrite.sourceUrl,discordUrl);
    assert.equal(instant(calendarWrite.start.dateTime),'2026-10-20T22:00:00.000Z');assert.equal(instant(calendarWrite.end.dateTime),'2026-10-21T00:00:00.000Z');
    assert(f.state.mapWrites.length>0);assert(f.state.mapWrites.every(row=>row.event.source_id===ids.calendar),'Club announcement must project Calendar occurrence rather than duplicate Discord event');
    const write=f.state.mapWrites.at(-1);assert.equal(write.event.source_record_id,occurrenceId);assert.equal(write.event.source_url,calendarUrl);assert.equal(write.people.length,0,'Announcing/organizing does not establish attendance');}],
  ['automation-discord-calendar-announcement-edit',async()=>{
    const priorToken='2026-10-18T14:00:00.000Z';
    const snapshot=catalogue();snapshot.events=[{id:ids.event,name:calendarEvent.title,notes:'',kind:'scheduled_event',type_id:'event',status:'confirmed',time_kind:'timed',
      starts_at:calendarEvent.start.dateTime,ends_at:calendarEvent.end.dateTime,time_zone:zone,source_id:ids.calendar,source_url:calendarUrl,source_record_id:occurrenceId,reported_at:priorToken,created_at:priorToken,updated_at:priorToken}];
    snapshot.event_buildings=[{event_id:ids.event,building_id:'bobst-library',location_notes:'room 204'}];
    const f=await runAutomation({events:[{...copy(calendarEvent),managed:true,sourceUrl:discordUrl}],mapSnapshot:snapshot,eventType:'message_updated',editedAt:now,
      content:'Tech@NYU event UPDATE: Synthetic Workshop has been rescheduled to October 21, 2026, from 6pm to 9pm America/New_York at Bobst Library room 204. This announcement does not state anyone’s attendance.'});
    assert.equal(f.state.calendarWrites.length,1);const calendarWrite=f.state.calendarWrites[0];
    assert.equal(calendarWrite.sourceKey,`discord:${guildId}:${eboard}:${messageId}`);assert.equal(calendarWrite.sourceUrl,discordUrl);
    assert.equal(instant(calendarWrite.start.dateTime),'2026-10-21T22:00:00.000Z');assert.equal(instant(calendarWrite.end.dateTime),'2026-10-22T01:00:00.000Z');
    assert(f.state.mapWrites.length>0);const write=f.state.mapWrites.at(-1);
    assert.equal(write.event.id,ids.event);assert.equal(write.expectedUpdatedAt,priorToken);assert.equal(write.event.source_record_id,occurrenceId);assert.equal(write.event.source_url,calendarUrl);
    assert.equal(instant(write.event.starts_at),'2026-10-21T22:00:00.000Z');assert.equal(instant(write.event.ends_at),'2026-10-22T01:00:00.000Z');assert.equal(write.people.length,0);
  }],
  ['automation-miro-calendar-map-rsvp',async()=>{const f=await runAutomation({events:[],miroEvent:true,content:'I am going to Synthetic Workshop at Bobst Library on October 20, 2026, 6–8pm America/New_York.'});
    assert.equal(f.state.calendarWrites.length,1);assert.equal(f.state.calendarWrites[0].sourceKey,`miro:${boardId}:${itemId}`);
    assert.equal(f.state.calendarWrites[0].sourceUrl,miroUrl);
    const write=f.state.mapWrites.findLast(row=>row.event.source_id===ids.calendar);assert(write,'Missing reconciled Calendar map event');
    assert(f.state.mapWrites.every(row=>row.event.source_id===ids.calendar),'RSVP must merge into the Calendar-derived map event, not create a duplicate Discord event');
    assert.equal(write.event.source_record_id,occurrenceId);assert.equal(instant(write.event.starts_at),'2026-10-20T22:00:00.000Z');
    assert.equal(instant(write.event.ends_at),'2026-10-21T00:00:00.000Z');assert.equal(write.event.source_url,calendarUrl);
    assert(write.event.notes.includes(miroUrl),'Miro origin link must survive Calendar-to-map projection');
    assert.equal(write.people.length,1);assert.equal(write.people[0].person_id,ids.person);assert.equal(write.people[0].attendance_status,'going');
    assert.equal(write.people[0].presence_basis,'planned');assert.equal(write.people[0].source_id,ids.discord);assert.equal(write.people[0].source_url,discordUrl);
    assert.equal(instant(write.people[0].reported_at),posted);}],
];
const selector=process.argv.find(arg=>arg.startsWith('--case='))?.slice(7);
const repeats=Number(process.argv.find(arg=>arg.startsWith('--repeat='))?.slice(9)||1);
if(!Number.isSafeInteger(repeats)||repeats<1||repeats>3)throw Error('Repeat count must be1–3');
const selection=selector?cases.filter(([name])=>selector.split(',').includes(name)):cases;
const selected=Array.from({length:repeats},()=>selection).flat();
if(!selected.length)throw Error('Unknown smoke case');
const output=fileURLToPath(new URL('../evidence/agent-prompts/live-model-results.json',import.meta.url));
let prior;try{prior=JSON.parse(await readFile(output,'utf8'));}catch{}
const monitoredPaths=['scripts/verify-agent-prompts.mjs','server/app.js','server/assistant-context.js','server/providers/index.js','server/config.js',
  'server/automation/prompt.js','server/automation/config.js','server/automation/handler.js','server/automation/adapters.js',
  'server/map/contracts.js','server/map/source-access.js','server/map/chat-intent.js','tools/map/chat.js','tools/map/index.js',
  'server/discord/channel-scope.js','server/discord/live-retrieval.js','server/discord/live-client.js','server/discord/live-config.js','server/discord/client.js','server/discord/request-pacing.js','tools/discord/index.js','tools/discord/live-summary.js',
  'server/miro/navigation.js',
  'server/google/calendar-chat-prompt.js','server/google/calendar-client.js','tools/calendar/chat-intent.js','tools/calendar/chat.js','tools/calendar/index.js'];
const hashSources=async()=>Object.fromEntries(await Promise.all(monitoredPaths.map(async path=>
  [path,createHash('sha256').update(await readFile(new URL('../'+path,import.meta.url))).digest('hex')])));
const sourceHashes=await hashSources();
const runId=new Date().toISOString();
const results={syntheticOnly:true,provider:config.provider,model:config.model,startedAt:new Date().toISOString(),
  fixtureVersion:'runtime-discord-read-tools-actual-budgets-v2',
  sourceHashes,
  command:'node --env-file-if-exists=.env --env-file-if-exists=.env.google scripts/verify-agent-prompts.mjs --live-model'+(selector?' --case='+selector:'')+(repeats>1?' --repeat='+repeats:''),
  limits:{maxModelCalls:MAX_MODEL_CALLS,modelMinIntervalMs:MODEL_MIN_INTERVAL_MS,chatCaseTimeoutMs:CASE_TIMEOUT_MS,providerTimeoutMs:config.timeoutMs,automationMaxRounds:automationConfig.maxRounds,automationMaxCalls:automationConfig.maxCalls,automationMaxRunMs:automationConfig.maxRunMs},
  limitations:['Synthetic source boundaries and in-memory write stores; no real Discord/Gmail/Miro content or Calendar/map database writes.',
    'Source excerpts and SVG bodies are omitted from the artifact; synthetic final answers and proposed mutation facts are retained for review.',
    'Real configured model calls with runtime chat prompts/component schemas and complete automation adapter schemas; finite behavioral smoke coverage, not a reliability estimate.',
    'Chat fixtures exercise Discord, Calendar, Miro and map tools; unrelated Gmail/Drive/memory/bug-report tools are not exercised.',
    'Automation may incidentally search an inert empty Gmail fixture; Gmail bodies and Drive remain unexercised.',
    'Tone requires human review of recorded synthetic answer text; automated guard only rejects selected overtly scolding phrases.',
    'Automation queue is synthetic, immediately claimable; scheduler cadence/worker activation not exercised.'],cases:[],
  ...(prior?{previousRuns:[...(prior.previousRuns||[]),{...prior,previousRuns:undefined}]}:{})};
await mkdir(fileURLToPath(new URL('../evidence/agent-prompts/',import.meta.url)),{recursive:true});
for(const [name,run] of selected){
  activeCase={name,attemptInRun:results.cases.filter(row=>row.name===name).length+1,runId,sourceHashes,modelCalls:0,planningTurns:0,answerTurns:0,automationTurns:0,proposals:[],tools:[],sourceReads:[]};
  const started=Date.now();console.log('Running '+name);
  try{await run();activeCase.pass=true;}catch(error){activeCase.pass=false;activeCase.failure=error?.code==='ERR_ASSERTION'?String(error.message).slice(0,1800):['aborted','provider_unavailable','not_configured','incomplete_provider_response','invalid_provider_response'].includes(error?.code)?error.code:'harness_or_case_failure';}
  activeCase.durationMs=Date.now()-started;results.cases.push(activeCase);
  const latest=new Map((results.latestCases||prior?.latestCases||prior?.cases||[]).map(row=>[row.name,row]));
  latest.set(name,activeCase);results.latestCases=[...latest.values()];
  results.modelCalls=modelCalls;results.modelDispatchTimes=[...modelDispatchTimes];results.completedAt=new Date().toISOString();
  results.totalRecordedModelCalls=modelCalls+(results.previousRuns||[]).reduce((sum,run)=>sum+(run.modelCalls||0),0);
  await writeFile(output,evidenceJson(results));
  console.log(`${activeCase.pass?'PASS':'FAIL'} ${name}; model calls=${activeCase.modelCalls}; tools=${activeCase.tools.map(t=>t.name+':'+t.status).join(' → ')}`);
  if(!activeCase.pass)console.log('Failure: '+activeCase.failure);
}
results.endSourceHashes=await hashSources();
results.changedSourceFiles=monitoredPaths.filter(path=>sourceHashes[path]!==results.endSourceHashes[path]);
results.buildStable=results.changedSourceFiles.length===0;
await writeFile(output,evidenceJson(results));
console.log(`Completed ${results.cases.filter(row=>row.pass).length}/${results.cases.length}; model calls=${modelCalls}; synthetic evidence saved.`);
if(!results.buildStable)console.log('Source files changed during this run; do not treat this run as a stable-build acceptance receipt.');
if(results.cases.some(row=>!row.pass)||!results.buildStable)process.exitCode=1;
