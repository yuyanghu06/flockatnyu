import assert from 'node:assert/strict';
import {fixture as baseFixture,input,task,ids,copy,now,stamp,zone,clubId,memberId,eventId,eventUrl,originalUrl} from './planner-followup.mjs';
import {createAutomationAdapters} from '../../server/automation/adapters.js';
import {createAutomationHandler} from '../../server/automation/handler.js';
import {createCalendarClient} from '../../server/google/calendar-client.js';
import {readCalendarConfig,readMemberPlansConfig,CALENDAR_REQUIRED_SCOPES} from '../../server/google/calendar-config.js';
import {readAutomationConfig} from '../../server/automation/config.js';
import {createLiveDiscordRetrieval} from '../../server/discord/live-retrieval.js';
import {createLiveRetrievalTools} from '../../tools/discord/index.js';
import {createMapEventService} from '../../server/map/events.js';
import {createMapSourceAuthorizer} from '../../server/map/source-access.js';

export {input,task,ids,copy,now,stamp,zone,clubId,memberId,eventId,eventUrl,originalUrl};
export const bytes=value=>Buffer.byteLength(JSON.stringify(value));
export const call=(name,id,args={},inputIds=[])=>({id,name,arguments:name==='finish_batch'?args:{inputIds,arguments:args}});
export const turn=(...toolCalls)=>({text:'',stopReason:'tool_calls',toolCalls});

// Real planner/source/map/Calendar adapters; only external client and storage
// boundaries are simulated. All mutations are observable in the returned state.
export function selectedFixture({backlog=0,pending=[],freshInputs,alreadyCorrect=false,missing=[],authFailure=null,sourceFailure=null,conflict=false,legacyEvent=false}={}) {
  const originals=freshInputs??pending.map(row=>copy(row.info.inputs[0]));
  const f=baseFixture({backlog,current:pending,freshInputs:originals,conflict});
  const controls={missing:new Set(missing),authFailure,sourceFailure,revoked:false,currentTargetUnavailable:false};
  const network=[],finishPackets=[],failurePackets=[],execution=[],tools=[],requests=[],proposals=[];
  let state=copy(f.before),mapVersion=0,forcedConflict=false;
  if(alreadyCorrect) {
    const original=f.originals[0];
    state.event_people.push({event_id:ids.event,person_id:ids.person,attendance_status:'going',presence_basis:'planned',label:'',starts_at:null,ends_at:null,source_id:ids.source,source_url:originalUrl(original),reported_at:stamp});
  }
  if(legacyEvent){const old={...copy(state.events[0]),id:'20000000-0000-4000-8000-000000000099',source_id:ids.source,source_record_id:'discord:100:200:299',source_url:'https://discord.com/channels/100/200/299',url:'https://discord.com/channels/100/200/299'};state.events.unshift(old);state.event_buildings.push({event_id:old.id,building_id:'bobst-library',location_notes:'Existing legacy record; preserve it.'});}
  f.before=copy(state);Object.defineProperty(f,'state',{get:()=>copy(state)});
  f.rawStore.read=async()=>{if(controls.currentTargetUnavailable)throw Error('Simulated current map read unavailable');return copy(state);};
  f.rawStore.lookup=async args=>copy(state.people.find(row=>row.discord_user_id===args.providerUserId)??null);
  f.rawStore.upsert=async args=>{
    const attempt=copy({...args,signal:undefined});f.attempts.push(attempt);
    if(conflict&&!forcedConflict){forcedConflict=true;state.events.find(row=>row.id===ids.event).notes='Human correction made concurrently; preserve this exact note.';state.events.find(row=>row.id===ids.event).updated_at='2026-10-23T22:30:01.000Z';}
    const old=state.events.find(row=>row.id===args.event.id);if(old?.updated_at!==args.expectedUpdatedAt)return {status:'conflict'};
    const event={...copy(args.event),created_at:old.created_at,updated_at:new Date(Date.parse(now)+ ++mapVersion+2000).toISOString()};
    state={...state,events:state.events.map(row=>row.id===event.id?event:row),event_buildings:[...state.event_buildings.filter(row=>row.event_id!==event.id),...args.buildings.map(row=>({...copy(row),event_id:event.id}))],event_people:[...state.event_people.filter(row=>row.event_id!==event.id),...args.people.map(row=>({...copy(row),event_id:event.id}))]};f.writes.push(attempt);return {status:'applied',event_id:event.id,updated_at:event.updated_at};
  };
  const policy={guildId:'100',revision:1,paused:false,discoveryEnabled:true,excludedCategoryIds:[],excludedChannelIds:[]};
  const channel={id:'200',guild_id:'100',type:0,parent_id:null,name:'flock-test'};
  const channels=[{enabled:true,guildId:'100',channelId:'200',sourceId:ids.source,title:'#flock-test'}];
  const sourceRows=()=>new Map([...f.originals,...[...f.tasks.values()].flatMap(row=>row.info.inputs)].map(row=>[row.raw_response.payload.id,row]));
  const native=row=>({...copy(row.raw_response.payload),author:{...copy(row.raw_response.payload.author),username:'Synthetic member'}});
  const raise=code=>{throw Object.assign(new Error(code),{code});};
  const discordStore={getPolicy:async()=>({status:'ready',policy:{...copy(policy),paused:controls.revoked}}),listSyncChannels:async()=>({status:'ready',channels:copy(channels)})};
  const discordClient={configured:true,
    getCurrentApplication:async()=>({id:'100',flags:2**18}),getGuildChannels:async()=>copy([channel]),
    getChannel:async args=>{network.push({operation:'channel',channelId:args.channelId});if(controls.authFailure)raise(controls.authFailure);return copy(channel);},
    getMessage:async args=>{network.push({operation:'exact-message',messageId:args.messageId});if(controls.sourceFailure)raise(controls.sourceFailure);if(controls.missing.has(args.messageId)||!sourceRows().has(args.messageId))raise('not_found');return native(sourceRows().get(args.messageId));},
    getMessages:async args=>{network.push({operation:'nearby-or-window',around:args.around});if(controls.sourceFailure)raise(controls.sourceFailure);const available=[...sourceRows().values()].filter(row=>!controls.missing.has(row.raw_response.payload.id));return available.filter(row=>!args.before||BigInt(row.raw_response.payload.id)<BigInt(args.before)).sort((a,b)=>Number(BigInt(b.raw_response.payload.id)-BigInt(a.raw_response.payload.id))).slice(0,args.limit??5).map(native);},
    searchMessages:async args=>{network.push({operation:'search'});if(controls.sourceFailure)raise(controls.sourceFailure);const rows=[...sourceRows().values()].filter(row=>!controls.missing.has(row.raw_response.payload.id)&&(!args.authorId||row.raw_response.payload.author.id===args.authorId));return {messages:rows.slice(0,25).map(native),totalResults:rows.length};},
  };
  const discordConfig={configured:true,enabled:true,guildId:'100',maxRuntimeMs:10000};
  const liveDiscordService=createLiveDiscordRetrieval({config:discordConfig,store:discordStore,client:discordClient});
  const env={AGENT_AUTOMATION_STAGED_ENABLED:'true',ASSISTANT_ALLOWED_SOURCE_IDS:[ids.source,ids.club,ids.member].join(','),GOOGLE_CLIENT_ID:'synthetic',GOOGLE_CLIENT_SECRET:'synthetic',GOOGLE_REFRESH_TOKEN:'synthetic',GOOGLE_EXPECTED_ACCOUNT_EMAIL:'club@example.test',GOOGLE_CALENDAR_ID:clubId,AGENT_CALENDAR_SOURCE_ID:ids.club,GOOGLE_MEMBER_PLANS_CALENDAR_ID:memberId,AGENT_MEMBER_PLANS_SOURCE_ID:ids.member,AGENT_MEMBER_PLANS_SIGNING_KEY:'synthetic-member-signing-key-32-characters'};
  const calendarConfig=readCalendarConfig(env),memberConfig=readMemberPlansConfig(env);
  const oauth={setCredentials(){},getAccessToken:async()=>({token:'synthetic'}),getTokenInfo:async()=>({scopes:CALENDAR_REQUIRED_SCOPES})};
  const calendarFetch=async(value,options={})=>{
    const url=new URL(value);assert(['gmail.googleapis.com','www.googleapis.com'].includes(url.hostname));
    if(url.hostname==='gmail.googleapis.com')return Response.json({emailAddress:'club@example.test'});
    if(url.pathname.includes('/calendarList/'))return Response.json({id:decodeURIComponent(url.pathname.split('/calendarList/')[1]),accessRole:'owner'});
    const match=/\/calendars\/([^/]+)\/events(?:\/([^/]+))?$/.exec(url.pathname);assert(match);
    if(options.method&&options.method!=='GET'){f.calendarWrites.push({method:options.method});throw Error('Unexpected Calendar mutation in planner completion fixture');}
    const state=f.state,saved=state.events.find(row=>row.id===ids.event),event={id:eventId,status:'confirmed',summary:saved.name,description:saved.notes,location:'Bobst Library',start:{dateTime:saved.starts_at,timeZone:zone},end:{dateTime:saved.ends_at,timeZone:zone},created:stamp,updated:stamp,etag:'"human"',htmlLink:eventUrl};
    const rows=decodeURIComponent(match[1])===clubId?[event]:[];
    return match[2]?(rows.some(row=>row.id===decodeURIComponent(match[2]))?Response.json(event):Response.json({}, {status:404})):Response.json({items:rows});
  };
  const calendarClient=createCalendarClient({config:calendarConfig,oauthClient:oauth,fetchImpl:calendarFetch}),memberClient=createCalendarClient({config:memberConfig,oauthClient:oauth,fetchImpl:calendarFetch});
  const authorizer=createMapSourceAuthorizer({calendarClient,calendarSourceId:ids.club,calendarTargets:[{client:memberClient,sourceId:ids.member}],liveDiscordService});
  const mapService=createMapEventService({store:f.rawStore,authorizeSource:authorizer,now:()=>new Date(now)});
  const config=readAutomationConfig({AGENT_AUTOMATION_ENABLED:'true',AGENT_AUTOMATION_MAX_INPUTS:'5',AGENT_AUTOMATION_MAX_RUN_MS:'600000'});
  const adapters=createAutomationAdapters({env,config,now:()=>new Date(now),fetchImpl:async()=>{throw Error('Unexpected runtime network');},dependencies:{googleConfig:{configured:false},googleClient:{configured:false},calendarConfig,memberConfig,calendarClient,memberClient,discordConfig,discordStore,discordClient,liveDiscordService,discordTools:createLiveRetrievalTools({service:liveDiscordService,guildId:'100'}),mapEventService:mapService,mapEventStore:f.rawStore,mapSourceAuthorizer:authorizer,taskStore:f.taskStore,loadBuildings:async()=>f.before.buildings,synchronize:{sync:async()=>({status:'ready',complete:true,results:[]})}}});
  const oldFinish=f.store.finish,oldFail=f.store.fail;
  f.store.finish=async args=>{finishPackets.push(copy({...args,signal:undefined}));return oldFinish(args);};
  f.store.fail=async args=>{failurePackets.push(copy({...args,signal:undefined}));return oldFail(args);};
  const trackedTools=adapters.tools.map(tool=>({...tool,execute:async(args,context)=>{const result=await tool.execute(args,context);tools.push({name:tool.name,arguments:copy(args),inputIds:copy(context.inputIds),phase:context.phase,result:copy(result)});return result;}}));
  const pipeline={...adapters.pipeline,recordExecution:async row=>execution.push(copy(row))};
  const principal=adapters.principal,baseContext={principal,inputIds:f.originals.map(row=>row.uuid)};
  return {...f,adapters,config,controls,network,finishPackets,failurePackets,execution,tools,requests,proposals,liveDiscordService,discordClient,discordStore,
    get state(){return f.state;},
    get currentTargetUnavailable(){return controls.currentTargetUnavailable;},
    set currentTargetUnavailable(value){controls.currentTargetUnavailable=Boolean(value);},
    async prepare(){await adapters.prepareBatch({...baseContext,inputs:copy(f.originals)});await pipeline.beginCycle({...baseContext,leaseToken:'60000000-0000-4000-8000-000000000001',inputs:copy(f.originals),getExecutionLog:()=>copy(execution),recordExecution:async row=>execution.push(copy(row))});},
    async afterInitial(){return adapters.pipeline.afterInitial({...baseContext,handledInputIds:f.originals.map(row=>row.uuid),inputs:copy(f.originals),executionLog:copy(execution)});},
    async execute(name,args,inputIds=baseContext.inputIds){const tool=adapters.tools.find(row=>row.name===name);assert(tool,'Requested production tool exists');const context={...baseContext,inputIds};const result=await tool.execute(args,context);execution.push({kind:'tool_result',stage:adapters.pipeline.phase,tool:name,arguments:copy(args),inputIds:copy(inputIds),result:copy(result)});tools.push({name,arguments:copy(args),inputIds:copy(inputIds),phase:adapters.pipeline.phase,result:copy(result)});return result;},
    async run(provider,{signal}={}){const observed={toolTurn:async request=>{requests.push(copy({...request,signal:undefined}));const reply=await provider.toolTurn(request);proposals.push(copy(reply));return reply;}};return createAutomationHandler({...adapters,tools:trackedTools,pipeline,config,store:f.store,provider:observed,now:()=>new Date(now)}).tick({signal});},
  };
}

export function scriptedProvider(steps){let index=0;return {toolTurn:async request=>{assert(index<steps.length,'Unexpected additional model turn');const step=steps[index++];return typeof step==='function'?step(request):copy(step);}};}
export function preserveBusinessState(f,before=f.before){assert.deepEqual(f.state,before);assert.equal(f.writes.length,0);assert.equal(f.attempts.length,0);assert.equal(f.calendarWrites.length,0);}
