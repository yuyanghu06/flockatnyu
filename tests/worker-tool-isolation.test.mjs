import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createAutomationAdapters} from '../server/automation/adapters.js';
import {createAutomationHandler} from '../server/automation/handler.js';
import {readAutomationConfig} from '../server/automation/config.js';
import {createMapEventService} from '../server/map/events.js';
import {createMapSourceAuthorizer} from '../server/map/source-access.js';
import {createCalendarClient,calendarEventId} from '../server/google/calendar-client.js';
import {readCalendarConfig,readMemberPlansConfig,CALENDAR_REQUIRED_SCOPES} from '../server/google/calendar-config.js';
import {createLiveRetrievalTools} from '../tools/discord/index.js';

const clock='2026-10-23T18:00:00.000Z',clubId='club@group.calendar.google.com',memberId='member@group.calendar.google.com';
const clone=structuredClone;
function fixture({task=false,syncStatus='ready',syncThrows=false,syncUnresolved}={}) {
 const source=randomUUID(),clubSource=randomUUID(),memberSource=randomUUID(),personId=randomUUID(),eventId=randomUUID(),inputId=randomUUID();
 const sourceUrl='https://discord.com/channels/100/200/300',calendarUrl=`https://calendar.google.com/calendar/event?eid=${Buffer.from(`workshop123 ${clubId}`).toString('base64url')}`;
 const input={uuid:inputId,raw_response:{source:'discord',source_id:source,event_type:'message_created',event_id:'300',revision:'1',received_at:clock,payload:{id:'300',guild_id:'100',channel_id:'200',timestamp:clock,author:{id:'400'},content:"I'll attend the workshop for the first hour."}}};
 const effects=[],history=[],actions=[],completedActions=new Set(),tasks=new Map(),calendars=new Map([[clubId,new Map()],[memberId,new Map()]]);let revision=0;
 const data={events:[{id:eventId,name:'Workshop',notes:'Human notes',kind:'scheduled_event',type_id:'other',status:'confirmed',time_kind:'timed',starts_at:'2026-10-24T19:00:00Z',ends_at:'2026-10-24T21:00:00Z',starts_on:null,ends_on:null,time_zone:'America/New_York',source_id:clubSource,source_url:calendarUrl,source_record_id:'workshop123',url:null,reported_at:clock,created_at:clock,updated_at:clock}],event_people:[],event_buildings:[{event_id:eventId,building_id:'bobst-library',location_notes:'Room 204'}],people:[{id:personId,display_name:'Known speaker',is_trackable:true}],buildings:[{id:'bobst-library',name:'Bobst Library'}],event_types:[{code:'other',name:'Other',description:'',icon_key:'other',sort_order:0}]};
 const sourceResult=()=>({status:'ready',coverage:{complete:true,textTruncated:false},sources:[{kind:'discord',retrieval:'live',sourceId:source,url:sourceUrl,guildId:'100',channelId:'200',messageId:'300',authorId:'400',content:input.raw_response.payload.content,excerpt:input.raw_response.payload.content,createdAt:clock,sourceUpdatedAt:clock}]});
 const liveDiscordService={readMessages:async()=>{effects.push('discord.read');return sourceResult();}};
 const forbidden=name=>()=>{effects.push(name);throw Error('Unrelated service dispatched');};
 const rawStore={configured:true,read:async()=>{effects.push('map.read');return clone(data);},lookup:async()=>{effects.push('map.lookup');return {id:personId,display_name:'Known speaker',is_trackable:true};},upsert:async args=>{effects.push('map.write');const current=data.events.find(row=>row.id===args.event.id);if(current&&current.updated_at!==args.expectedUpdatedAt)return {status:'conflict'};const updated=`2026-10-23T18:00:${String(++revision).padStart(2,'0')}.000Z`;data.events=[{...clone(args.event),created_at:current?.created_at??clock,updated_at:updated}];data.event_buildings=args.buildings.map(row=>({...clone(row),event_id:args.event.id}));data.event_people=args.people.map(row=>({...clone(row),event_id:args.event.id}));return {status:'applied',event_id:args.event.id,updated_at:updated};}};
 const env={AGENT_AUTOMATION_STAGED_ENABLED:'true',ASSISTANT_ALLOWED_SOURCE_IDS:[source,clubSource,memberSource].join(','),GOOGLE_CLIENT_ID:'test',GOOGLE_CLIENT_SECRET:'test-only',GOOGLE_REFRESH_TOKEN:'test-only',GOOGLE_EXPECTED_ACCOUNT_EMAIL:'club@example.test',GOOGLE_CALENDAR_ID:clubId,AGENT_CALENDAR_SOURCE_ID:clubSource,GOOGLE_MEMBER_PLANS_CALENDAR_ID:memberId,AGENT_MEMBER_PLANS_SOURCE_ID:memberSource,AGENT_MEMBER_PLANS_SIGNING_KEY:'only-a-test-signing-key-at-least32characters'};
 const oauth={setCredentials(){},getAccessToken:async()=>({token:'test-only'}),getTokenInfo:async()=>({scopes:CALENDAR_REQUIRED_SCOPES})};
 const fetchImpl=async(url,options={})=>{const u=new URL(url);if(u.hostname==='gmail.googleapis.com')return Response.json({emailAddress:'club@example.test'});assert.equal(u.hostname,'www.googleapis.com');if(u.pathname.includes('/calendarList/'))return Response.json({id:decodeURIComponent(u.pathname.split('/calendarList/')[1]),accessRole:'owner'});const match=/\/calendars\/([^/]+)\/events(?:\/([^/]+))?$/.exec(u.pathname);assert(match);const target=decodeURIComponent(match[1]),rows=calendars.get(target),id=match[2]&&decodeURIComponent(match[2]);assert(rows);if(!options.method||options.method==='GET'){effects.push('calendar.read');return id?(rows.has(id)?Response.json(rows.get(id)):Response.json({}, {status:404})):Response.json({items:[...rows.values()]});}effects.push('calendar.write');const body=JSON.parse(options.body),key=id||body.id,row={...rows.get(key),...body,id:key,etag:`"${++revision}"`,created:clock,updated:clock};rows.set(key,row);return Response.json(row);};
 const calendarConfig=readCalendarConfig(env),memberConfig=readMemberPlansConfig(env),calendarClient=createCalendarClient({config:calendarConfig,oauthClient:oauth,fetchImpl}),memberClient=createCalendarClient({config:memberConfig,oauthClient:oauth,fetchImpl});
 const authorizer=createMapSourceAuthorizer({liveDiscordService:{readMessages:forbidden('map.hidden.discord')},calendarClient:{...calendarClient,readEvent:forbidden('map.hidden.calendar')},calendarSourceId:clubSource});
 const mapService=createMapEventService({store:rawStore,authorizeSource:authorizer,now:()=>new Date(clock)});
 const taskStore={configured:true,prune:async()=>({status:'ready'}),list:async()=>({status:'ready',tasks:clone([...tasks.values()])}),save:async({task,expectedUpdatedAt})=>{const prior=tasks.get(task.uuid);if(prior&&prior.updated_at!==expectedUpdatedAt)return {status:'conflict'};const saved={...clone(task),created_at:prior?.created_at??clock,updated_at:`2026-10-23T18:01:${String(++revision).padStart(2,'0')}.000Z`,expires_at:'2026-10-24T18:00:00Z'};tasks.set(saved.uuid,saved);return {status:'ready',task:clone(saved)};},resolve:async({taskId,expectedUpdatedAt})=>{effects.push('task.resolve');if(tasks.get(taskId)?.updated_at!==expectedUpdatedAt)return {status:'conflict'};tasks.delete(taskId);return {status:'ready'};}};
 const pending={uuid:randomUUID(),created_at:clock,updated_at:clock,expires_at:'2026-10-24T18:00:00Z',info:{version:1,sourceIds:[source],inputs:[clone(input)],references:[{sourceId:source,sourceUrl}],request:{summary:'Save this speaker first-hour attendance',operation:'participation',calendarKind:'club',calendarEventId:'workshop123',personId},executionHistory:[],batchContext:{}}};if(task)tasks.set(pending.uuid,pending);
 const config={...readAutomationConfig({AGENT_AUTOMATION_ENABLED:'true'})},policy={guildId:'100',revision:1,paused:false,discoveryEnabled:true,excludedCategoryIds:[],excludedChannelIds:[]};
 const adapters=createAutomationAdapters({env,config,now:()=>new Date(clock),fetchImpl:forbidden('unexpected.http'),dependencies:{calendarConfig,memberConfig,calendarClient,memberClient,googleConfig:{configured:false},googleClient:{configured:false,readGmail:forbidden('hidden.gmail')},discordConfig:{configured:true,guildId:'100'},discordStore:{getPolicy:async()=>({status:'ready',policy}),listSyncChannels:async()=>({status:'ready',channels:[{enabled:true,guildId:'100',channelId:'200',sourceId:source}]})},discordClient:{getGuildChannels:forbidden('hidden.discord.metadata'),getChannel:forbidden('hidden.discord.channel')},liveDiscordService,discordTools:createLiveRetrievalTools({service:liveDiscordService,guildId:'100'}),mapEventStore:rawStore,mapEventService:mapService,taskStore,synchronize:{sync:async()=>{effects.push('named.sync');if(syncThrows)throw Error('private failed sync');return {status:syncStatus,complete:syncStatus==='ready',results:[],unresolved:syncUnresolved??(syncStatus==='partial'?[{reason:'map_write_conflict'}]:[])};}}}});
 const context={principal:adapters.principal,inputIds:[inputId]},execute=async(name,args={},ids=context.inputIds)=>{const result=await adapters.tools.find(t=>t.name===name).execute(args,{...context,inputIds:ids});history.push({kind:'tool_result',stage:adapters.pipeline?'followup':'initial',tool:name,inputIds:ids,arguments:clone(args),result:clone(result)});return result;};
 const lookup={provider:'discord',providerUserId:'400',sourceId:source,sourceUrl};
 return {adapters,context,config,execute,lookup,input,pending,effects,history,actions,tasks,data,source,clubSource,memberSource,sourceUrl,personId,eventId,calendars,
  prepare:async()=>{await adapters.prepareBatch({...context,inputs:[input]});await adapters.pipeline.beginCycle({leaseToken:randomUUID(),inputs:[input],getExecutionLog:()=>history,recordExecution:row=>history.push(row)});},
  followup:()=>adapters.pipeline.afterInitial({handledInputIds:[inputId],inputs:[input],executionLog:history}),
  handler:(provider,events=[],audit=[])=>createAutomationHandler({...adapters,config,now:()=>new Date(clock),provider,audit:{recordEvent:async row=>audit.push(row)},store:{configured:true,claim:async()=>({status:'ready',leaseToken:randomUUID(),inputs:[input]}),renew:async()=>({status:'ready'}),action:async args=>{actions.push(args);if(args.complete)completedActions.add(args.actionKey);return {status:args.complete||completedActions.has(args.actionKey)?'completed':'execute'};},finish:async()=>{events.push('queue.finish');return {status:'ready'};},release:async()=>({status:'ready'}),fail:async()=>({status:'ready'})}})};
}

const body=row=>Object.fromEntries(Object.entries(row).filter(([key,value])=>!['event_id','updated_at','created_at'].includes(key)&&value!==null));
test('actual worker map read, lookup and map write touch only map storage after preparation',async()=>{
 const f=fixture();await f.prepare();f.effects.length=0;
 assert.equal((await f.execute('read_map_events',{})).status,'ready');assert.deepEqual(f.effects,['map.read']);
 f.effects.length=0;assert.equal((await f.execute('lookup_map_person',f.lookup)).status,'ready');assert.deepEqual(f.effects,['map.lookup']);
 f.effects.length=0;const event=f.data.events[0];assert.equal((await f.execute('upsert_map_event',{event:body(event),expectedUpdatedAt:event.updated_at,buildings:f.data.event_buildings.map(body),people:[{person_id:f.personId,attendance_status:'going',presence_basis:'planned',label:'First hour',starts_at:event.starts_at,ends_at:'2026-10-24T20:00:00Z',source_id:f.source,source_url:f.sourceUrl,reported_at:clock}]})).status,'ready');assert.deepEqual(f.effects,['map.write']);
});
test('Calendar upsert and Member Plan upsert/cancel never fetch sources, identities, map or sync',async()=>{
 const f=fixture();await f.prepare();await f.execute('lookup_map_person',f.lookup);f.effects.length=0;
 const args={sourceKey:'discord:100:200:300',sourceUrl:f.sourceUrl,title:'Workshop',start:{dateTime:'2026-10-24T19:00:00Z',timeZone:'America/New_York'},end:{dateTime:'2026-10-24T21:00:00Z',timeZone:'America/New_York'}};
 assert.equal((await f.execute('upsert_calendar_event',args)).status,'ready');assert(f.effects.includes('calendar.write'));assert(f.effects.every(kind=>kind.startsWith('calendar.')));
 f.effects.length=0;assert.equal((await f.execute('cancel_calendar_event',{sourceKey:args.sourceKey,sourceUrl:f.sourceUrl})).status,'ready');assert(f.effects.includes('calendar.write'));assert(f.effects.every(kind=>kind.startsWith('calendar.')));
 const plan={sourceKey:'discord:100:200:300',sourceId:f.source,sourceUrl:f.sourceUrl,personId:f.personId,title:'Study session',activityKind:'personal_plan',start:{localDateTime:'2026-10-24T15:00:00',timeZone:'America/New_York'},end:{localDateTime:'2026-10-24T17:00:00',timeZone:'America/New_York'}};
 f.effects.length=0;const tool=f.adapters.tools.find(row=>row.name==='upsert_member_plan'),prepared=await tool.prepareArguments(plan,f.context);assert.equal((await tool.execute(prepared,f.context)).status,'ready');assert(f.effects.includes('calendar.write'));assert(f.effects.every(kind=>kind.startsWith('calendar.')));
 f.effects.length=0;assert.equal((await f.execute('cancel_member_plan',{sourceKey:plan.sourceKey,sourceId:f.source,sourceUrl:f.sourceUrl,personId:f.personId})).status,'ready');assert(f.effects.every(kind=>kind.startsWith('calendar.')));
});
test('task completion consumes prior applied proof and exact version without hidden map/source reads',async()=>{
 const f=fixture({task:true});await f.prepare();await f.followup();const id=f.pending.uuid;
 await f.execute('read_pending_task',{taskId:id},[id]);await f.execute('read_map_events',{},[id]);await f.execute('lookup_map_person',f.lookup,[id]);
 const event=f.data.events[0],args={eventId:event.id,expectedUpdatedAt:event.updated_at,changes:[{personId:f.personId,sourceUrl:f.sourceUrl,attendanceStatus:'going',start:{inherit:true},end:{anchor:'event_start',offsetMinutes:60}}]};
 f.effects.length=0;const patched=await f.execute('patch_map_participation',args,[id]);assert.equal(patched.status,'ready',JSON.stringify(patched));assert.deepEqual(f.effects,['map.write']);
 f.effects.length=0;assert.equal((await f.execute('resolve_pending_task',{taskId:id,outcome:'completed'},[id])).status,'ready');assert.deepEqual(f.effects,['task.resolve']);assert(!f.tasks.has(id));
});
test('mismatched successful evidence cannot delete a saved task or fetch additional state',async()=>{
 const f=fixture({task:true});await f.prepare();await f.followup();const id=f.pending.uuid;await f.execute('read_pending_task',{taskId:id},[id]);f.effects.length=0;
 f.history.push({kind:'tool_result',tool:'upsert_map_event',inputIds:[id],arguments:{event:{id:f.eventId,source_id:f.clubSource,source_record_id:'wrong123'},people:[{person_id:f.personId,source_url:f.sourceUrl}]},result:{status:'ready',sourceStatus:'applied',event_id:f.eventId}});
 assert.equal((await f.execute('resolve_pending_task',{taskId:id,outcome:'completed'},[id])).status,'invalid_request');assert(f.tasks.has(id));assert.deepEqual(f.effects,[]);
});
test('successful initial finish invokes sync as a separate runner-originated registered call',async()=>{
 const f=fixture(),events=[],audit=[];let rounds=0;const handler=f.handler({toolTurn:async()=>({stopReason:'tool_calls',toolCalls:[{id:'done_'+(++rounds),name:'finish_batch',arguments:{handledInputIds:[f.input.uuid],noChangeInputIds:[f.input.uuid]}}]})},events,audit);
 const result=await handler.tick();assert.equal(result.status,'completed',JSON.stringify(result));assert.deepEqual(f.effects,['named.sync']);assert.deepEqual(events,['queue.finish']);assert.equal(result.calls,2,'finish and separate sync each consume a tool call');assert(audit.some(row=>row.kind==='tool_started'&&row.tool==='sync_calendars_to_map'));assert(audit.some(row=>row.kind==='tool_finished'&&row.tool==='sync_calendars_to_map'));assert.equal(rounds,1);
});
test('initial round cap performs no automatic sync without successful finish',async()=>{
 const f=fixture();const tool=f.adapters.tools.find(row=>row.name==='read_map_events');
 // A one-round initial stage is enough to hit the cap after the single read.
 const result=await createAutomationHandler({...f.adapters,config:{...f.config,maxRounds:1},principal:f.adapters.principal,now:()=>new Date(clock),provider:{toolTurn:async()=>({stopReason:'tool_calls',toolCalls:[{id:'read',name:tool.name,arguments:{inputIds:[f.input.uuid],arguments:{}}}]})},store:{configured:true,claim:async()=>({status:'ready',leaseToken:randomUUID(),inputs:[f.input]}),renew:async()=>({status:'ready'}),action:async({complete})=>({status:complete?'completed':'execute'}),release:async()=>({status:'ready'}),fail:async()=>({status:'ready'})}}).tick();
 assert(!f.effects.includes('named.sync'));assert.notEqual(result.status,'completed');
});

test('optimistic map conflict preserves human fields and leaves the task without completion proof',async()=>{
 const f=fixture({task:true});await f.prepare();await f.followup();const id=f.pending.uuid;await f.execute('read_pending_task',{taskId:id},[id]);await f.execute('read_map_events',{},[id]);await f.execute('lookup_map_person',f.lookup,[id]);
 const revision=f.data.events[0].updated_at;f.data.events[0].notes='Newer human edit';f.data.events[0].updated_at='2026-10-23T18:02:00.000Z';f.effects.length=0;
 const result=await f.execute('patch_map_participation',{eventId:f.eventId,expectedUpdatedAt:revision,changes:[{personId:f.personId,sourceUrl:f.sourceUrl,attendanceStatus:'going',start:{inherit:true},end:{inherit:true}}]},[id]);
 assert.equal(result.status,'conflict');assert.deepEqual(f.effects,['map.write']);assert.equal(f.data.events[0].notes,'Newer human edit');assert.equal(f.data.event_people.length,0);f.effects.length=0;
 assert.equal((await f.execute('resolve_pending_task',{taskId:id,outcome:'completed'},[id])).status,'invalid_request');assert.deepEqual(f.effects,[]);assert(f.tasks.has(id));
});
test('task exact-version deletion protects a newer task even after a successful map change',async()=>{
 const f=fixture({task:true});await f.prepare();await f.followup();const id=f.pending.uuid;await f.execute('read_pending_task',{taskId:id},[id]);await f.execute('read_map_events',{},[id]);await f.execute('lookup_map_person',f.lookup,[id]);
 const event=f.data.events[0];assert.equal((await f.execute('patch_map_participation',{eventId:f.eventId,expectedUpdatedAt:event.updated_at,changes:[{personId:f.personId,sourceUrl:f.sourceUrl,attendanceStatus:'going',start:{inherit:true},end:{inherit:true}}]},[id])).status,'ready');
 f.tasks.get(id).updated_at='2026-10-23T18:02:00.000Z';f.tasks.get(id).info.request.summary='Newer unfinished work';f.effects.length=0;
 assert.equal((await f.execute('resolve_pending_task',{taskId:id,outcome:'completed'},[id])).status,'conflict');assert.deepEqual(f.effects,['task.resolve']);assert.equal(f.tasks.get(id).info.request.summary,'Newer unfinished work');
});

for(const mode of ['partial','failed'])test('separate finish sync '+mode+' has an honest result and no completed action receipt',async()=>{
 const f=fixture({syncStatus:'partial',syncThrows:mode==='failed'}),audit=[];let turns=0;
 const result=await f.handler({toolTurn:async()=>({stopReason:'tool_calls',toolCalls:[{id:'done_'+(++turns),name:'finish_batch',arguments:{handledInputIds:[f.input.uuid],noChangeInputIds:[f.input.uuid]}}]})},[],audit).tick();
 assert.equal(result.status,'completed');assert.deepEqual(f.effects,['named.sync']);assert.equal(f.actions.filter(row=>row.complete).length,0);const event=audit.find(row=>row.kind==='tool_finished'&&row.tool==='sync_calendars_to_map');assert(event);assert.notEqual(event.status,'ready');assert(!JSON.stringify(audit).includes('private failed sync'));
});
test('separate automatic sync respects the configured stage call cap without dispatch or receipt',async()=>{
 const f=fixture(),audit=[];f.config.maxCalls=1;
 const result=await f.handler({toolTurn:async()=>({stopReason:'tool_calls',toolCalls:[{id:'done',name:'finish_batch',arguments:{handledInputIds:[f.input.uuid],noChangeInputIds:[f.input.uuid]}}]})},[],audit).tick();
 assert.equal(result.calls,1);assert(!f.effects.includes('named.sync'));assert.equal(f.actions.length,0);
});

test('a later Calendar mutation gives the same-input sync a new action identity and projects again',async()=>{
 const f=fixture(),audit=[];let turn=0;const args={sourceKey:'discord:100:200:300',sourceUrl:f.sourceUrl,title:'Workshop',start:{dateTime:'2026-10-24T19:00:00Z',timeZone:'America/New_York'},end:{dateTime:'2026-10-24T21:00:00Z',timeZone:'America/New_York'}};
 const sequence=[['upsert_calendar_event',args],['sync_calendars_to_map',{}],['upsert_calendar_event',{...args,title:'Updated workshop'}],['sync_calendars_to_map',{}]];
 const result=await f.handler({toolTurn:async()=>{const row=sequence[turn++];return {stopReason:'tool_calls',toolCalls:[row?{id:'step_'+turn,name:row[0],arguments:{inputIds:[f.input.uuid],arguments:row[1]}}:{id:'done',name:'finish_batch',arguments:{handledInputIds:[f.input.uuid]}}]};}},[],audit).tick();
 assert.equal(result.status,'completed');assert.equal(f.effects.filter(kind=>kind==='named.sync').length,2,'Both successful explicit syncs dispatch; final automatic call may reuse the same final revision');assert.equal(f.effects.filter(kind=>kind==='calendar.write').length,2);
 const results=audit.filter(row=>row.kind==='tool_finished'&&row.tool==='sync_calendars_to_map');assert.equal(results.length,3);assert(results.every(row=>row.status==='ready'));
});

test('a new leased cycle cannot reuse an earlier cycle sync receipt for the same inputs',async()=>{
 const f=fixture();
 for(let cycle=0;cycle<2;cycle++){
  let round=0;
  const result=await f.handler({toolTurn:async()=>({stopReason:'tool_calls',toolCalls:[{id:`done_${cycle}_${++round}`,name:'finish_batch',arguments:{handledInputIds:[f.input.uuid],noChangeInputIds:[f.input.uuid]}}]})}).tick();
  assert.equal(result.status,'completed');
 }
 assert.equal(f.effects.filter(kind=>kind==='named.sync').length,2);
 const keys=f.actions.filter(row=>row.complete).map(row=>row.actionKey);assert.equal(new Set(keys).size,2);
});

for(const alreadyCancelled of [false,true])test(`confirmed ${alreadyCancelled?'already-cancelled':'already-absent'} Calendar cancellation resolves its exact task locally`,async()=>{
 const f=fixture({task:true}),task=f.pending;
 task.info.request={summary:'Cancel the announced workshop',operation:'source_review',calendarKind:'club'};
 task.info.inputs[0].raw_response.payload.content='The workshop is cancelled.';
 f.tasks.set(task.uuid,clone(task));await f.prepare();
 const cancellation={sourceKey:'discord:100:200:300',sourceUrl:f.sourceUrl};
 if(alreadyCancelled){
  const created=await f.execute('upsert_calendar_event',{...cancellation,title:'Workshop',start:{dateTime:'2026-10-24T19:00:00Z',timeZone:'America/New_York'},end:{dateTime:'2026-10-24T21:00:00Z',timeZone:'America/New_York'}});
  assert.equal(created.status,'ready');assert.equal((await f.execute('cancel_calendar_event',cancellation)).status,'ready');
 }
 await f.followup();await f.execute('read_pending_task',{taskId:task.uuid},[task.uuid]);
 const result=await f.execute('cancel_calendar_event',cancellation,[task.uuid]);
 assert.equal(result.status,'ready');const receipt=result.calendarWrite??result;
 assert.equal(receipt.outcome,alreadyCancelled?'unchanged':'already_absent');
 assert.equal(receipt.eventStatus,alreadyCancelled?'cancelled':'absent');
 f.effects.length=0;
 const completed=await f.execute('resolve_pending_task',{taskId:task.uuid,outcome:'completed'},[task.uuid]);
 assert.equal(completed.status,'ready');assert.deepEqual(f.effects,['task.resolve']);assert.equal(f.tasks.has(task.uuid),false);
});


for(const mode of ['ready','partial','failed'])test('full initial transcript reset retains the actual separately named sync '+mode+' result for follow-up',async()=>{
 const f=fixture({syncStatus:mode==='failed'?'ready':mode,syncThrows:mode==='failed'}),history=[];
 const after=f.adapters.pipeline.afterInitial;
 f.adapters.pipeline.afterInitial=async args=>({...await after(args),followupRequired:true});
 f.adapters.pipeline.recordExecution=async row=>history.push(clone(row));
 let turns=0;
 const result=await f.handler({toolTurn:async request=>{
  if(++turns===1)return {stopReason:'tool_calls',toolCalls:[{id:'initial_done',name:'finish_batch',arguments:{handledInputIds:[f.input.uuid],noChangeInputIds:[f.input.uuid]}}]};
  assert.equal(request.messages.length,1,'Successful full initial disposition resets the transcript');
  const visible=JSON.parse(request.messages[0].content).runnerToolExecution;
  assert.equal(visible.name,'sync_calendars_to_map');assert.equal(visible.origin,'runner');assert.deepEqual(visible.arguments,{});
  const actual=history.find(row=>row.kind==='tool_result'&&row.origin==='runner'&&row.tool==='sync_calendars_to_map');
  assert(actual);assert.equal(visible.callId,actual.callId);assert.deepEqual(visible.result,actual.result);
  assert.equal(visible.result.status,mode==='failed'?'tool_error':mode);
  return {stopReason:'tool_calls',toolCalls:[{id:'followup_done',name:'finish_batch',arguments:{handledInputIds:[]}}]};
 }}).tick();
 assert.equal(result.status,'completed');assert.equal(turns,2);assert.deepEqual(f.effects,['named.sync']);
});

for(const origin of ['runner','model'])test('fragmented partial sync stays partial without a completed receipt for '+origin,async()=>{
 const f=fixture({syncStatus:'partial',syncUnresolved:Array.from({length:180},(_,index)=>({reason:'map_write_conflict',index,detail:'Unresolved projection detail '.repeat(12)}))}),history=[],audit=[];
 f.adapters.pipeline.recordExecution=async row=>history.push(clone(row));
 let turns=0;
 const result=await f.handler({toolTurn:async()=>{
  if(origin==='model'&&++turns===1)return {stopReason:'tool_calls',toolCalls:[{id:'explicit_sync',name:'sync_calendars_to_map',arguments:{inputIds:[f.input.uuid],arguments:{}}}]};
  return {stopReason:'tool_calls',toolCalls:[{id:'initial_done',name:'finish_batch',arguments:{handledInputIds:[f.input.uuid],noChangeInputIds:[f.input.uuid]}}]};
 }},[],audit).tick();
 assert.equal(result.status,'completed');assert.equal(f.actions.filter(row=>row.complete).length,0);
 const results=history.filter(row=>row.kind==='tool_result'&&row.tool==='sync_calendars_to_map');assert(results.length>0);
 for(const row of results){assert.equal(row.result.status,'partial');assert.equal(row.result.sourceStatus,'partial');assert(row.result.fragment);assert(Buffer.byteLength(JSON.stringify(row.result))<=16384);}
 if(origin==='model')assert(results.some(row=>row.callId==='explicit_sync'));
 assert(!audit.some(row=>row.kind==='tool_finished'&&row.tool==='sync_calendars_to_map'&&row.status==='ready'));
});
