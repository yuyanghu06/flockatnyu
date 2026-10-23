import assert from 'node:assert/strict';
import {createAutomationAdapters} from '../../server/automation/adapters.js';
import {createAutomationHandler} from '../../server/automation/handler.js';
import {readAutomationConfig} from '../../server/automation/config.js';
import {createCalendarClient} from '../../server/google/calendar-client.js';
import {readCalendarConfig,readMemberPlansConfig,CALENDAR_REQUIRED_SCOPES} from '../../server/google/calendar-config.js';
import {createMapEventService,validateSnapshot} from '../../server/map/events.js';
import {createMapSourceAuthorizer} from '../../server/map/source-access.js';
import {createLiveRetrievalTools} from '../../tools/discord/index.js';

export const copy=value=>structuredClone(value),now='2026-10-23T22:30:00.000Z',stamp='2026-10-23T22:00:00.000Z',zone='America/New_York';
export const uid=(family,n)=>`${family}0000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
export const ids={source:uid('1',1),club:uid('1',2),member:uid('1',3),event:uid('2',1),person:uid('3',1),other:uid('3',2),blocked:uid('3',3)};
export const clubId='club@group.calendar.google.com',memberId='members@group.calendar.google.com',eventId='workshop20261023';
export const eventUrl=`https://calendar.google.com/calendar/event?eid=${Buffer.from(`${eventId} ${clubId}`).toString('base64url')}`;
export const originalUrl=input=>`https://discord.com/channels/100/200/${input.raw_response.payload.id}`;
// Simulated storage follows the catalogue/exact-read boundary independently of
// the pipeline. Keep legacy list mocks only for frozen historical witnesses.
export function taskCatalogue(row) {
 const request=row.info.request??{},summary=typeof request.summary==='string'?request.summary:'Deferred source work';
 const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
 const inputs=Array.isArray(row.info.inputs)?row.info.inputs:[],inputIds=[...new Set(inputs.filter(input=>uuid(input?.uuid)).map(input=>input.uuid.toLowerCase()))];
 const eligible=row.info.version===1&&['participation','location','source_review'].includes(request.operation)&&inputs.length>0&&inputIds.length===inputs.length
  &&inputs.every(input=>input?.raw_response&&['discord','gmail'].includes(input.raw_response.source)&&row.info.sourceIds.includes(input.raw_response.source_id)&&input.raw_response.payload&&typeof input.raw_response.payload==='object'&&!Array.isArray(input.raw_response.payload));
 return {uuid:row.uuid,created_at:row.created_at,updated_at:row.updated_at,expires_at:row.expires_at,
  sourceIds:copy(row.info.sourceIds),inputIds,modelEligible:eligible,summaryTruncated:[...summary].length>100,
  request:{summary:[...summary].slice(0,100).join(''),...Object.fromEntries(['operation','calendarKind','calendarEventId','personId','buildingId'].filter(key=>typeof request[key]==='string'&&(key!=='calendarEventId'||[...request[key]].length<=1024)).map(key=>[key,request[key]]))}};
}
export function attachTaskReads(store,rows,{failed=()=>false,onCall=()=>{}}={}) {
 const permitted=(row,scope)=>Array.isArray(scope)&&row.info.sourceIds.every(id=>scope.includes(id));
 store.catalogue=async args=>{onCall({method:'catalogue',...args});return failed('catalogue')?{status:'unavailable'}:{status:'ready',tasks:[...rows.values()].filter(row=>permitted(row,args.allowedSourceIds)).map(taskCatalogue)};};
 store.read=async args=>{onCall({method:'read',...args});if(failed('read'))return {status:'unavailable'};const row=rows.get(args.taskId);return row&&permitted(row,args.allowedSourceIds)?{status:'ready',task:copy(row)}:{status:'not_found'};};
 return store;
}
export function withTaskReadFixtures(source) {
 const adapted=source.includes('attachTaskReads(taskStore,tasks')?source:source.replace(/const adapters=(createAutomationAdapters|adapterFactory)\(/g,
  (_match,factory)=>`attachTaskReads(taskStore,tasks,{failed:method=>typeof control!=='undefined'&&(method==='catalogue'?control.taskListUnavailable:control.taskReadUnavailable)});const adapters=${factory}(`);
 assert(adapted.includes('attachTaskReads(taskStore,tasks'),'Expected an integration fixture storage boundary');
 const contextImport=/import\s*\{[^}]*\bmapReadContext\b/.test(source)?'':`import {mapReadContext} from ${JSON.stringify(new URL('../../server/map/events.js',import.meta.url).href)};\n`;
 return `import {attachTaskReads} from ${JSON.stringify(import.meta.url)};\n`+contextImport+adapted;
}
export function input(n=1,{content='I will attend the Friday workshop at Bobst tonight for the entire event.',author='400'}={}){
 return {uuid:uid('4',n),raw_response:{source:'discord',source_id:ids.source,event_type:'message_created',event_id:String(300+n),revision:'1',received_at:stamp,
  payload:{id:String(300+n),guild_id:'100',channel_id:'200',timestamp:stamp,author:{id:author,username:'synthetic-'+author},content}}};
}
export function task(n=1,{original=input(n),current=false,operation='participation',personId=ids.person,large=true,summary}={}){
 const request={summary:summary??(current?'Ready: add the original speaker as going for the entire Friday Bobst workshop.':'Older task: determine the room for a separate unannounced event; essential details are unavailable.'),operation,
  ...(operation==='participation'?{calendarKind:'club',calendarEventId:eventId,...(personId?{personId}:{})}:{})};
 return {uuid:uid('5',n),created_at:current?stamp:'2026-10-23T12:00:00.000Z',updated_at:current?stamp:'2026-10-23T12:00:00.000Z',expires_at:'2026-10-24T12:00:00.000Z',info:{version:1,sourceIds:[ids.source],inputs:[copy(original)],request,
  batchContext:{calendarMap:{sourceId:ids.club,configured:true},memberPlans:{sourceId:ids.member,configured:true},previousHour:[{messageId:'299',channelId:'200',speaker:'500',content:'The Friday workshop is tonight at Bobst 7–9 PM New York. Reply if attending.'}]},
  executionHistory:large?[{kind:'tool_result',tool:'read_map_events',stage:'followup',inputIds:[uid('5',n)],arguments:{},result:{status:'ready',events:[],unrelatedHistoricalDescriptions:'Earlier inspected unrelated event detail. '.repeat(2050)}},{kind:'model_result',stage:'followup',result:{text:'The original speaker still needs to be attached to the known Friday workshop; no action succeeded.'}}]:[]}};
}
export function mapSnapshot(){return validateSnapshot({buildings:[{id:'bobst-library',name:'Bobst Library',aliases:['Bobst']}],
 people:[{id:ids.person,display_name:'Tony Example',is_trackable:true,discord_user_id:'400'},{id:ids.other,display_name:'Alex Example',is_trackable:true,discord_user_id:'500'},{id:ids.blocked,display_name:'Casey Example',is_trackable:true,discord_user_id:'600'}],
 event_types:['study','other'].map((code,i)=>({code,name:code,description:'',icon_key:code,sort_order:i})),
 events:[{id:ids.event,name:'Friday workshop',notes:'Human notes: keep the projector setup and side entrance.',kind:'scheduled_event',type_id:'study',status:'confirmed',time_kind:'timed',starts_at:'2026-10-23T23:00:00.000Z',ends_at:'2026-10-24T01:00:00.000Z',starts_on:null,ends_on:null,time_zone:zone,source_id:ids.club,source_url:eventUrl,source_record_id:eventId,url:eventUrl,reported_at:stamp,created_at:stamp,updated_at:stamp}],
 event_buildings:[{event_id:ids.event,building_id:'bobst-library',location_notes:'Room 101; keep the room note.'}],
 event_people:[{event_id:ids.event,person_id:ids.other,attendance_status:'going',presence_basis:'planned',label:'Setting up the projector',starts_at:'2026-10-23T23:15:00.000Z',ends_at:'2026-10-24T00:15:00.000Z',source_id:ids.club,source_url:eventUrl,reported_at:stamp}]});}

// Production runner, staged pipeline, source tool routing, Calendar client and map
// service are unchanged. Only external source/storage boundaries are simulated.
export function fixture({backlog=121,current=[],freshInputs=[],mapUnavailable=false,sourceUnavailable=false,conflict=false,taskConflict=false,unmatchedAuthors=[]}={}){
 let state=mapSnapshot(),version=0,finished=false,forcedConflict=false,taskChanged=false;
 const before=copy(state),backlogTasks=Array.from({length:backlog},(_,i)=>task(1000+i,{original:input(1000+i,{content:'Maybe a separate meetup; no date or room has been decided.'}),operation:'source_review'}));
 const originals=current.length?current.map(row=>copy(row.info.inputs[0])):freshInputs.length?copy(freshInputs):[input()];
 const tasks=new Map([...backlogTasks,...current].map(row=>[row.uuid,copy(row)])),initialTasks=copy([...tasks.values()]),chronology=[],tools=[],execution=[],requests=[],proposals=[],attempts=[],writes=[],calendarWrites=[];
 const sources=new Map([...originals,...initialTasks.flatMap(row=>row.info.inputs)].map(row=>[row.raw_response.payload.id,row]));
 const liveSource=row=>({kind:'discord',retrieval:'live',sourceId:ids.source,url:originalUrl(row),guildId:'100',channelId:'200',messageId:row.raw_response.payload.id,authorId:row.raw_response.payload.author.id,content:row.raw_response.payload.content,excerpt:row.raw_response.payload.content,sourceUpdatedAt:row.raw_response.payload.timestamp,createdAt:row.raw_response.payload.timestamp});
 const liveDiscordService={configured:true,readMessages:async args=>{chronology.push({kind:'source_read',messageId:args.messageId,context:args.context});const row=sources.get(args.messageId)||originals[0],context=liveSource(input(0,{author:'500',content:'The Friday workshop is tonight at Bobst 7–9 PM New York. Who will attend the entire workshop?'}));context.messageId='299';context.url='https://discord.com/channels/100/200/299';return {status:sourceUnavailable?'unavailable':'ready',sources:sourceUnavailable?[]:[...(args.context?[context]:[]),liveSource(row)],coverage:{complete:!sourceUnavailable,textTruncated:false}};},
  search:async args=>({status:'ready',sources:originals.map(liveSource),coverage:{complete:false,reason:'bounded_search'}}),readWindow:async()=>({status:'ready',sources:originals.map(liveSource),coverage:{complete:true,textTruncated:false}}),getCatalogue:async()=>({status:'ready',channels:[{id:'200',name:'flock-test',sourceId:ids.source}],coverage:{complete:true}})};
 const rawStore={configured:true,read:async()=>{chronology.push({kind:'map_read'});if(mapUnavailable)throw Error('Synthetic unavailable map');return copy(state);},lookup:async args=>{chronology.push({kind:'person_lookup',providerUserId:args.providerUserId});return copy(unmatchedAuthors.includes(args.providerUserId)?null:state.people.find(row=>row.discord_user_id===args.providerUserId)??null);},
  upsert:async args=>{const attempt=copy({...args,signal:undefined});attempts.push(attempt);if(conflict&&!forcedConflict){forcedConflict=true;state.events[0].notes='Human correction made concurrently; preserve this exact note.';state.events[0].updated_at='2026-10-23T22:30:01.000Z';}
   const old=state.events.find(row=>row.id===args.event.id);if(old?.updated_at!==args.expectedUpdatedAt)return {status:'conflict'};
   const event={...copy(args.event),created_at:old.created_at,updated_at:new Date(Date.parse(now)+ ++version+2000).toISOString()};state={...state,events:state.events.map(row=>row.id===event.id?event:row),event_buildings:[...state.event_buildings.filter(row=>row.event_id!==event.id),...args.buildings.map(row=>({...copy(row),event_id:event.id}))],event_people:[...state.event_people.filter(row=>row.event_id!==event.id),...args.people.map(row=>({...copy(row),event_id:event.id}))]};validateSnapshot(state);writes.push(attempt);chronology.push({kind:'map_write',eventId:event.id});return {status:'applied',event_id:event.id,updated_at:event.updated_at};}};
 const taskStore={configured:true,prune:async()=>({status:'ready',pruned:0}),list:async()=>{
  return {status:'ready',tasks:copy([...tasks.values()])};},save:async args=>{const old=tasks.get(args.task.uuid);if(old&&old.updated_at!==args.expectedUpdatedAt)return {status:'conflict'};const saved={...copy(args.task),created_at:old?.created_at||stamp,updated_at:new Date(Date.parse(now)+ ++version).toISOString(),expires_at:old?.expires_at||'2026-10-24T12:00:00.000Z'};tasks.set(saved.uuid,saved);chronology.push({kind:'task_save',taskId:saved.uuid,expectedUpdatedAt:args.expectedUpdatedAt});return {status:'ready',task:copy(saved)};},resolve:async args=>{chronology.push({kind:'task_resolve',taskId:args.taskId,expectedUpdatedAt:args.expectedUpdatedAt});if(taskConflict&&!taskChanged){taskChanged=true;const target=tasks.get(args.taskId);target.updated_at='2026-10-23T22:30:01.000Z';target.info.request.summary='Concurrent task revision: speaker now asks to arrive at 8 PM, preserve this new instruction.';}if(tasks.get(args.taskId)?.updated_at!==args.expectedUpdatedAt)return {status:'conflict'};tasks.delete(args.taskId);return {status:'ready'};}};
 attachTaskReads(taskStore,tasks,{onCall:row=>chronology.push({kind:'task_'+row.method,taskId:row.taskId})});
 const env={AGENT_AUTOMATION_STAGED_ENABLED:'true',ASSISTANT_ALLOWED_SOURCE_IDS:[ids.source,ids.club,ids.member].join(','),GOOGLE_CLIENT_ID:'synthetic',GOOGLE_CLIENT_SECRET:'synthetic',GOOGLE_REFRESH_TOKEN:'synthetic',GOOGLE_EXPECTED_ACCOUNT_EMAIL:'club@example.test',GOOGLE_CALENDAR_ID:clubId,AGENT_CALENDAR_SOURCE_ID:ids.club,GOOGLE_MEMBER_PLANS_CALENDAR_ID:memberId,AGENT_MEMBER_PLANS_SOURCE_ID:ids.member,AGENT_MEMBER_PLANS_SIGNING_KEY:'synthetic-member-signing-key-32-characters'};
 const calendarConfig=readCalendarConfig(env),memberConfig=readMemberPlansConfig(env),oauth={setCredentials(){},getAccessToken:async()=>({token:'synthetic'}),getTokenInfo:async()=>({scopes:CALENDAR_REQUIRED_SCOPES})};
 const calendarFetch=async(value,options={})=>{const url=new URL(value);assert(['gmail.googleapis.com','www.googleapis.com'].includes(url.hostname));if(url.hostname==='gmail.googleapis.com')return Response.json({emailAddress:'club@example.test'});if(url.pathname.includes('/calendarList/'))return Response.json({id:decodeURIComponent(url.pathname.split('/calendarList/')[1]),accessRole:'owner'});
  const match=/\/calendars\/([^/]+)\/events(?:\/([^/]+))?$/.exec(url.pathname);assert(match);if(options.method&&options.method!=='GET'){calendarWrites.push({method:options.method,body:options.body});throw Error('No Calendar write expected for saved participation');}
  const providerEvent={id:eventId,status:'confirmed',summary:'Friday workshop',description:before.events[0].notes,location:'Bobst Library',start:{dateTime:before.events[0].starts_at,timeZone:zone},end:{dateTime:before.events[0].ends_at,timeZone:zone},created:stamp,updated:stamp,etag:'"human"',htmlLink:eventUrl};
  const rows=decodeURIComponent(match[1])===clubId?[providerEvent]:[];return match[2]?(rows.find(row=>row.id===decodeURIComponent(match[2]))?Response.json(providerEvent):Response.json({}, {status:404})):Response.json({items:rows});};
 const calendarClient=createCalendarClient({config:calendarConfig,oauthClient:oauth,fetchImpl:calendarFetch}),memberClient=createCalendarClient({config:memberConfig,oauthClient:oauth,fetchImpl:calendarFetch});
 const authorizer=createMapSourceAuthorizer({calendarClient,calendarSourceId:ids.club,calendarTargets:[{client:memberClient,sourceId:ids.member}],liveDiscordService});
 const mapService=createMapEventService({store:rawStore,authorizeSource:authorizer,now:()=>new Date(now)}),config=readAutomationConfig({AGENT_AUTOMATION_ENABLED:'true'});
 const policy={guildId:'100',revision:1,paused:false,discoveryEnabled:true,excludedCategoryIds:[],excludedChannelIds:[]},channel={id:'200',guild_id:'100',type:0,parent_id:null};
 const adapters=createAutomationAdapters({env,config,now:()=>new Date(now),fetchImpl:async()=>{throw Error('Unexpected runtime network');},dependencies:{googleConfig:{configured:false},googleClient:{configured:false},calendarConfig,memberConfig,calendarClient,memberClient,discordConfig:{configured:true,guildId:'100'},discordStore:{getPolicy:async()=>({status:'ready',policy:copy(policy)}),listSyncChannels:async()=>({status:'ready',channels:[{enabled:true,guildId:'100',channelId:'200',sourceId:ids.source}]})},discordClient:{getGuildChannels:async()=>[channel],getChannel:async()=>channel},liveDiscordService,discordTools:createLiveRetrievalTools({service:liveDiscordService,guildId:'100'}),mapEventService:mapService,mapEventStore:rawStore,mapSourceAuthorizer:authorizer,taskStore,loadBuildings:async()=>before.buildings,
  // The initial-phase fixture checkpoint ends before follow-up. Projection is
  // independently covered by staged-runtime-integration, so this fixture returns
  // its simulated successful result without altering the pre-seeded map facts.
  synchronize:{sync:async()=>({status:'ready',complete:true,results:[]})}}});
 const store={configured:true,claim:async()=>({status:'ready',leaseToken:uid('6',1),inputs:copy(originals)}),renew:async()=>({status:'ready'}),release:async()=>{},fail:async()=>{},action:async({complete})=>({status:complete?'completed':'execute'}),finish:async()=>{finished=true;return {status:'ready'};}};
 const trackedTools=adapters.tools.map(tool=>({...tool,execute:async(args,context)=>{const entry={name:tool.name,arguments:copy(args),inputIds:copy(context.inputIds),phase:context.phase};const result=await tool.execute(args,context);entry.result=copy(result);tools.push(entry);return result;}}));
 const pipeline={...adapters.pipeline,recordExecution:async row=>execution.push(copy(row))};
 return {adapters,config,store,tools,execution,requests,proposals,chronology,attempts,writes,calendarWrites,tasks,initialTasks,backlogTasks,before,originals,mapService,rawStore,taskStore,get state(){return copy(state);},get finished(){return finished;},
  async run(provider,{initialProvider,signal}={}){let initialTurns=0;const observed={toolTurn:async request=>{requests.push(copy({...request,signal:undefined}));let result;if(!request.system.includes('FOLLOWUP phase')){initialTurns++;result=initialProvider?await initialProvider(request,initialTurns):turn(call('finish_batch','fixture_initial',originals.map(row=>row.uuid)));}else result=await provider.toolTurn(request);proposals.push({phase:request.system.includes('FOLLOWUP phase')?'followup':'initial',result:copy(result)});return result;}};return createAutomationHandler({...adapters,tools:trackedTools,pipeline,config,store,provider:observed,now:()=>new Date(now)}).tick({signal});}
 };
}
export const call=(name,id,args={},inputIds=[])=>({id,name,arguments:name==='finish_batch'?{handledInputIds:args}:{inputIds,arguments:args}});
export const turn=(...toolCalls)=>({toolCalls,text:'',stopReason:'tool_calls'});
export const lookupFor=(original=input())=>({provider:'discord',providerUserId:original.raw_response.payload.author.id,sourceId:ids.source,sourceUrl:originalUrl(original)});
export const patchFor=(state,original=input(),personId=ids.person)=>({eventId:ids.event,expectedUpdatedAt:state.events[0].updated_at,changes:[{personId,sourceUrl:originalUrl(original),attendanceStatus:'going',start:{inherit:true},end:{inherit:true}}]});
export function assertPreserved(f,{humanConflict=false}={}){
 const after=f.state,old=f.before.events[0],saved=after.events[0];assert.equal(after.events.length,f.before.events.length);assert.deepEqual({...saved,notes:old.notes,updated_at:old.updated_at},old,'All event facts besides the explicit concurrent note and revision survive');
 assert.equal(saved.notes,humanConflict?'Human correction made concurrently; preserve this exact note.':old.notes);assert.deepEqual(after.event_buildings,f.before.event_buildings);assert.deepEqual(after.event_people.find(row=>row.person_id===ids.other),f.before.event_people[0]);assert.equal(f.calendarWrites.length,0);
 for(const oldTask of f.backlogTasks){const saved=f.tasks.get(oldTask.uuid),visited=f.tools.some(row=>row.phase==='followup'&&row.inputIds.includes(oldTask.uuid));
  if(!visited)assert.deepEqual(saved,oldTask,'Unvisited backlog task must remain byte-identical');
  else{assert(saved,'Unresolved older task cannot be silently removed');assert.deepEqual(saved.info.inputs,oldTask.info.inputs,'Visited unresolved older task retains its exact originals');assert.deepEqual(saved.info.request,oldTask.info.request,'No supported new facts justify changing this older task request');assert.deepEqual(saved.info.batchContext,oldTask.info.batchContext,'Original historical context must remain saved');}
 }
}
export function assertAdded(f,{humanConflict=false}={}){assertPreserved(f,{humanConflict});assert.equal(f.writes.length,1,'One successful map patch');const row=f.state.event_people.find(row=>row.person_id===ids.person);assert(row,'Ready original speaker must be added');assert.equal(row.attendance_status,'going');assert.equal(row.presence_basis,'planned');assert.equal(row.source_id,ids.source);assert.equal(row.source_url,originalUrl(f.originals.find(row=>row.raw_response.payload.author.id==='400')));assert.equal(row.reported_at,stamp);assert.equal(row.starts_at??f.state.events[0].starts_at,f.before.events[0].starts_at);assert.equal(row.ends_at??f.state.events[0].ends_at,f.before.events[0].ends_at);}
