import {attachTaskReads} from './fixtures/planner-followup.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {createAutomationAdapters} from '../server/automation/adapters.js';
import {createAutomationHandler} from '../server/automation/handler.js';
import {readAutomationConfig} from '../server/automation/config.js';
import {createCalendarClient,calendarEventId} from '../server/google/calendar-client.js';
import {readCalendarConfig,readMemberPlansConfig,CALENDAR_REQUIRED_SCOPES} from '../server/google/calendar-config.js';
import {createMapSourceAuthorizer} from '../server/map/source-access.js';
import {createMapEventStore,createMapEventService,mapReadContext} from '../server/map/events.js';
import {createCalendarMapSync} from '../server/automation/calendar-sync.js';
import {createLiveRetrievalTools} from '../tools/discord/index.js';

// Optional isolated deployed-adapter regression reproduction; never rewrites
// shared runtime files. Support modules resolve from this checkout as usual.
const adapterFactory=process.env.CANCELLATION_BASELINE_ADAPTER
  ?(await import('data:text/javascript;base64,'+Buffer.from((await readFile(process.env.CANCELLATION_BASELINE_ADAPTER,'utf8')).replace(/from (['"])(\.[^'"]+)\1/g,(_match,_quote,path)=>`from ${JSON.stringify(new URL(path,new URL('../server/automation/adapters.js',import.meta.url)).href)}`)).toString('base64'))).createAutomationAdapters:createAutomationAdapters;

const source=randomUUID(),clubSource=randomUUID(),memberSource=randomUUID(),personId=randomUUID(),inputId=randomUUID(),lease=randomUUID();
const clubId='club@group.calendar.google.com',memberId='members@group.calendar.google.com';
const stamp='2026-10-22T18:00:00.000Z',url='https://discord.com/channels/100/200/300';
const input=()=>({uuid:inputId,raw_response:{source:'discord',source_id:source,event_type:'message_created',event_id:'300',revision:'1',received_at:stamp,
  payload:{id:'300',guild_id:'100',channel_id:'200',timestamp:stamp,author:{id:'400'},content:"I'm at Bobst now studying"}}});
const pendingTask=()=>({uuid:randomUUID(),created_at:stamp,updated_at:stamp,expires_at:'2026-10-23T18:00:00.000Z',info:{version:1,sourceIds:[source],inputs:[input()],
  request:{summary:'Attach this original speaker to the workshop',operation:'participation',calendarEventId:'workshop123',calendarKind:'club',personId},
  batchContext:{previousHour:[{messageId:'299',channelId:'200',speaker:'401',content:'Workshop at Bobst'}]},executionHistory:[{kind:'model_result',result:{text:'Earlier interpretation'}}]}});
const call=(name,id,args={},ids=[inputId])=>({id,name,arguments:name==='finish_batch'?{handledInputIds:args}:{inputIds:ids,arguments:args}});
const turn=(...toolCalls)=>({text:'Synthetic model interpretation',stopReason:'tool_calls',toolCalls});

function fixture({pending=[],currentInput=input(),staged=true,mapWriteFailureAfter,gmail=false,originalUnavailable=false,calendarControl={}}={}) {
  const chronology=[],calendarEvents=new Map([[clubId,new Map()],[memberId,new Map()]]),mapRows=new Map(),tasks=new Map(pending.map(row=>[row.uuid,structuredClone(row)])),modelRequests=[],lookups=[],modelErrors=[],taskExecution=[];
  let revoked=false,version=0,finished=false,liveAuthorId='400';
  const env={...(gmail?{AGENT_GMAIL_SOURCE_ID:source}:{}),AGENT_AUTOMATION_STAGED_ENABLED:String(staged),ASSISTANT_ALLOWED_SOURCE_IDS:[source,clubSource,memberSource].join(','),
    GOOGLE_CLIENT_ID:'client',GOOGLE_CLIENT_SECRET:'synthetic-secret',GOOGLE_REFRESH_TOKEN:'refresh',GOOGLE_EXPECTED_ACCOUNT_EMAIL:'club@example.test',
    GOOGLE_CALENDAR_ID:clubId,AGENT_CALENDAR_SOURCE_ID:clubSource,GOOGLE_MEMBER_PLANS_CALENDAR_ID:memberId,AGENT_MEMBER_PLANS_SOURCE_ID:memberSource,AGENT_MEMBER_PLANS_SIGNING_KEY:'synthetic-member-signing-key-32-characters'};
  const oauth={setCredentials:()=>{},getAccessToken:async()=>({token:'synthetic'}),getTokenInfo:async()=>({scopes:CALENDAR_REQUIRED_SCOPES})};
  const fetchImpl=async(value,options={})=>{
    const endpoint=new URL(value);assert(['www.googleapis.com','gmail.googleapis.com'].includes(endpoint.hostname),`Unexpected endpoint ${endpoint.origin}`);
    if(endpoint.hostname==='gmail.googleapis.com')return Response.json({emailAddress:'club@example.test'});
    if(endpoint.pathname.includes('/calendarList/')){const id=decodeURIComponent(endpoint.pathname.split('/calendarList/')[1]);return Response.json({id,accessRole:'owner'});}
    const match=/\/calendars\/([^/]+)\/events(?:\/([^/]+))?$/.exec(endpoint.pathname);assert(match,`Unexpected API path ${endpoint.pathname}`);
    const calendarId=decodeURIComponent(match[1]),eventId=match[2]&&decodeURIComponent(match[2]),rows=calendarEvents.get(calendarId);assert(rows,'Calendar target must be pinned');
    if(!options.method||options.method==='GET'){
      if(eventId){chronology.push({kind:'calendar_read',calendarId,eventId});
        if(calendarControl.readback==='unavailable')return Response.json({}, {status:503});
        if(calendarControl.readback==='empty')return Response.json({}, {status:404});
        const saved=rows.get(eventId);if(!saved)return Response.json({}, {status:404});
        const row=structuredClone(saved);
        if(calendarControl.readback==='active')row.status='confirmed';
        if(calendarControl.readback==='wrong_source')row.source={url:'https://discord.com/channels/100/200/999'};
        if(calendarControl.readback==='wrong_target')row.id='different_exact_event';
        return Response.json(row);
      }return Response.json({items:[...rows.values()]});
    }
    const body=JSON.parse(options.body);assert(!body.attendees);assert.equal(endpoint.searchParams.get('sendUpdates'),'none');
    if(calendarControl.writeFailure)return Response.json({}, {status:calendarControl.writeFailure==='conflict'?412:503});
    const id=eventId||body.id,saved={...rows.get(id),...body,id,etag:`"${++version}"`,created:stamp,updated:stamp};rows.set(id,saved);chronology.push({kind:'calendar_write',calendarId,eventId:id,body});return Response.json(saved);
  };
  const calendarConfig=readCalendarConfig(env),memberConfig=readMemberPlansConfig(env);
  const calendarClient=createCalendarClient({config:calendarConfig,oauthClient:oauth,fetchImpl}),memberClient=createCalendarClient({config:memberConfig,oauthClient:oauth,fetchImpl});
  const policy={guildId:'100',revision:1,paused:false,discoveryEnabled:true,excludedCategoryIds:[],excludedChannelIds:[]},channel={id:'200',guild_id:'100',type:0,parent_id:null};
  const originalText=pending[0]?.info?.inputs?.[0]?.raw_response.payload.content||currentInput.raw_response.payload.content;
  const liveSource=()=>({kind:'discord',retrieval:'live',sourceId:source,url,guildId:'100',channelId:'200',messageId:'300',authorId:liveAuthorId,content:originalText,excerpt:originalText,sourceUpdatedAt:stamp,createdAt:stamp});
  const liveDiscordService={readMessages:async()=>{chronology.push({kind:'discord_original'});return {status:revoked?'forbidden':originalUnavailable?'unavailable':'ready',coverage:{complete:!originalUnavailable,textTruncated:false},sources:revoked||originalUnavailable?[]:[liveSource()]};}};
  const mapEventService={configured:true,
    lookup:async args=>{lookups.push(args);return {status:revoked?'forbidden':'ok',person:{id:['400','host@example.test'].includes(args.providerUserId)?personId:randomUUID()}};},
    read:async args=>{
      const rows=[...mapRows.values()].filter(row=>(!args.eventId||row.event.id===args.eventId)&&(!args.sourceId||row.event.source_id===args.sourceId)&&(!args.sourceRecordId||row.event.source_record_id===args.sourceRecordId));
      return {status:'ok',events:rows.map(row=>structuredClone(row.event)),event_buildings:rows.flatMap(row=>row.buildings.map(building=>({...building,event_id:row.event.id}))),event_people:rows.flatMap(row=>row.people.map(person=>({...person,event_id:row.event.id}))),buildings:[{id:'bobst-library',name:'Bobst Library',aliases:['Bobst','70 Washington Square South']}],people:[{id:personId,display_name:'Synthetic Tony',is_trackable:true}],event_types:[{id:'study'},{id:'other'}]};
    },
    upsert:async args=>{
      if(mapWriteFailureAfter!==undefined&&chronology.filter(row=>row.kind==='map_write').length>=mapWriteFailureAfter)return {status:'conflict'};
      const old=mapRows.get(args.event.id);if(old&&old.event.updated_at!==args.expectedUpdatedAt)return {status:'conflict'};
      const row={event:{...structuredClone(args.event),updated_at:`2026-10-22T18:30:${String(++version).padStart(2,'0')}.000Z`},buildings:structuredClone(args.buildings),people:structuredClone(args.people)};
      mapRows.set(args.event.id,row);chronology.push({kind:'map_write',...structuredClone(row)});return {status:'applied',event_id:row.event.id,updated_at:row.event.updated_at};
    },
  };
  const taskStore={configured:true,prune:async()=>({status:'ready',pruned:0}),list:async()=>({status:'ready',tasks:structuredClone([...tasks.values()])}),
    save:async args=>{const old=tasks.get(args.task.uuid);if(old&&old.updated_at!==args.expectedUpdatedAt)return {status:'conflict'};const row={...args.task,created_at:old?.created_at||stamp,updated_at:`2026-10-22T18:30:${String(++version).padStart(2,'0')}.000Z`,expires_at:old?.expires_at||'2026-10-23T18:00:00.000Z'};tasks.set(row.uuid,structuredClone(row));return {status:'ready',task:row};},
    resolve:async args=>{chronology.push({kind:'task_resolve',taskId:args.taskId,expectedUpdatedAt:args.expectedUpdatedAt});if(tasks.get(args.taskId)?.updated_at!==args.expectedUpdatedAt)return {status:'conflict'};tasks.delete(args.taskId);return {status:'ready'};},
  };
  attachTaskReads(taskStore,tasks);
  const config=readAutomationConfig({AGENT_AUTOMATION_ENABLED:'true'});
  const adapters=adapterFactory({env,config,now:()=>new Date('2026-10-22T18:30:00Z'),fetchImpl:async()=>{throw Error('Unexpected runtime HTTP');},dependencies:{
    googleConfig:{configured:gmail},googleClient:{configured:gmail,readGmail:async({messageId})=>({status:revoked?'forbidden':'ready',sources:revoked?[]:[{kind:'gmail',externalId:messageId,url:`https://mail.google.com/mail/u/0/#all/${messageId}`,from:'Organizer <host@example.test>',title:'Study plan',date:stamp,excerpt:currentInput.raw_response.payload.content,contentStatus:'text_only_bounded'}]})},calendarConfig,memberConfig,calendarClient,memberClient,
    discordConfig:{configured:true,guildId:'100'},discordStore:{getPolicy:async()=>({status:'ready',policy:{...policy,paused:revoked}}),listSyncChannels:async()=>({status:'ready',channels:[{enabled:true,guildId:'100',channelId:'200',sourceId:source}]})},discordClient:{getGuildChannels:async()=>[channel],getChannel:async()=>channel},
    liveDiscordService,discordTools:{tools:[{name:'read_discord_messages',description:'Read current original',readOnly:true,parameters:{type:'object',properties:{},additionalProperties:false}}],execute:async()=>{chronology.push({kind:'discord_tool'});return {status:originalUnavailable?'unavailable':'ready',coverage:{complete:!originalUnavailable,textTruncated:false},sources:originalUnavailable?[]:[liveSource()]};}},
    mapEventService,mapSourceAuthorizer:async()=>!revoked,taskStore,loadBuildings:async()=>[{id:'bobst-library',name:'Bobst Library',aliases:['Bobst','70 Washington Square South']}],
  }});
  const context={principal:adapters.principal,inputIds:[currentInput.uuid]};
  const store={configured:true,claim:async()=>({status:'ready',leaseToken:lease,inputs:[currentInput]}),renew:async()=>({status:'ready'}),release:async()=>{},fail:async()=>{},action:async({complete})=>({status:complete?'completed':'execute'}),finish:async()=>{finished=true;return {status:'ready'};}};
  return {adapters,context,calendarEvents,calendarControl,mapRows,tasks,chronology,lookups,modelRequests,calendarClient,memberClient,config,mapEventService,revoke:()=>{revoked=true;},setCurrentSpeaker:id=>{liveAuthorId=id;},finished:()=>finished,
    prepare:async()=>{await adapters.prepareBatch({...context,inputs:[currentInput]});await adapters.pipeline.beginCycle({leaseToken:lease,inputs:[currentInput],getExecutionLog:()=>structuredClone(taskExecution),recordExecution:async row=>taskExecution.push(structuredClone(row))});},
    execute:async(name,args,ids=context.inputIds)=>{const tool=adapters.tools.find(tool=>tool.name===name);assert(tool,`Tool ${name} exists`);const result=await tool.execute(args,{...context,inputIds:ids});taskExecution.push({kind:'tool_result',stage:adapters.pipeline.phase,tool:name,arguments:structuredClone(args),inputIds:[...ids],result:structuredClone(result)});return result;},
    run:async turns=>{let i=0;const handler=createAutomationHandler({...adapters,config,store,now:()=>new Date('2026-10-22T18:30:00Z'),provider:{toolTurn:async request=>{modelRequests.push(request);chronology.push({kind:'model'});try{const response=turns[i++];assert(response,`Unexpected model call ${i}`);return typeof response==='function'?response(request):response;}catch(error){modelErrors.push(error);throw error;}}}});const result=await handler.tick();if(modelErrors.length)throw modelErrors[0];return result;},
  };
}

const unrelatedTask=()=>{const task=pendingTask(),original=task.info.inputs[0];original.uuid=randomUUID();original.raw_response.event_id='399';original.raw_response.payload.id='399';original.raw_response.payload.author.id='499';return task;};

const lookup={provider:'discord',providerUserId:'400',sourceId:source,sourceUrl:url};
const plan={sourceKey:'discord:100:200:300',sourceUrl:url,sourceId:source,personId,title:'Studying',location:'Bobst',activityKind:'presence',typeId:'study',label:'Studying'};

test('actual bundled handler writes presence to Member Plans first, API projects person/building, final phase sees actual results under same lease',async()=>{
  const untouched=unrelatedTask(),f=fixture({pending:[untouched]});assert.deepEqual(await f.adapters.resolveClaimSourceIds({principal:f.context.principal}),[source]);const result=await f.run([
    request=>{assert(request.tools.some(tool=>tool.name==='upsert_map_event'));assert(request.tools.some(tool=>tool.name==='upsert_member_plan'));return turn(call('read_discord_messages','read'),call('lookup_map_person','lookup',lookup),call('upsert_member_plan','plan',plan));},
    turn(call('finish_batch','initial',[inputId])),
    request=>{
      assert(request.tools.some(tool=>tool.name==='upsert_member_plan'));assert(request.tools.some(tool=>tool.name==='upsert_map_event'));
      const followup=JSON.parse(request.messages.at(-1).content);assert.equal(followup.stage,'followup');const sync=followup.runnerToolExecution;assert.equal(sync.name,'sync_calendars_to_map');assert.equal(sync.origin,'runner');assert.equal(typeof sync.callId,'string');assert.deepEqual(sync.arguments,{});assert.equal(sync.result.complete,true);
      assert(sync.result.results.some(row=>row.sourceId===memberSource&&row.mapEventId));
      assert.equal(sync.result.status,'ready');return turn(call('finish_batch','final',[]));
    },
  ]);
  assert.equal(result.status,'completed',JSON.stringify({result,chronology:f.chronology,requests:f.modelRequests.length}));assert.equal(f.finished(),true);assert.equal(f.calendarEvents.get(clubId).size,0);assert.equal(f.calendarEvents.get(memberId).size,1);assert.equal(f.mapRows.size,1);
  const [calendar]=f.calendarEvents.get(memberId).values(),[map]=f.mapRows.values();assert.equal(calendar.start.dateTime,stamp);assert.equal(calendar.end.dateTime,'2026-10-22T20:00:00.000Z');
  assert.equal(map.event.source_id,memberSource);assert.equal(map.event.kind,'presence');assert.deepEqual(map.buildings,[{building_id:'bobst-library',location_notes:'Bobst'}]);assert.equal(map.people[0].person_id,personId);assert.equal(map.people[0].source_id,source);
  assert(f.chronology.findIndex(row=>row.kind==='calendar_write')<f.chronology.findIndex(row=>row.kind==='map_write'));assert.equal(f.modelRequests[0].auditContext.runId,f.modelRequests[2].auditContext.runId);assert.deepEqual(f.tasks.get(untouched.uuid),untouched);
});

test('bundled staged adapter denies direct map-only personal creation and unverified or wrong speaker Member Plans writes',async()=>{
  const f=fixture();await f.prepare();
  assert.equal((await f.execute('upsert_member_plan',plan)).status,'forbidden_source');
  assert.equal((await f.execute('lookup_map_person',{...lookup,providerUserId:'500'})).status,'forbidden_source');
  assert.equal((await f.execute('lookup_map_person',lookup)).status,'ready');assert.equal((await f.execute('upsert_member_plan',{...plan,personId:randomUUID()})).status,'forbidden_source');
  const event={id:randomUUID(),name:'Studying',notes:'',kind:'presence',type_id:'study',status:'confirmed',time_kind:'timed',starts_at:stamp,ends_at:'2026-10-22T20:00:00.000Z',starts_on:null,ends_on:null,time_zone:'America/New_York',source_id:source,source_url:url,source_record_id:'300',url:null,reported_at:stamp};
  assert.equal((await f.execute('upsert_map_event',{event,buildings:[{building_id:'bobst-library'}],people:[]})).status,'forbidden_source');assert.equal(f.mapRows.size,0);assert.equal(f.calendarEvents.get(memberId).size,0);
  f.revoke();assert.equal(await f.adapters.authorizeEvent({event:input().raw_response,principal:f.context.principal}),false);assert.equal(f.calendarEvents.get(memberId).size,0);
});

test('full cached context can bind original speaker/source through task UUID without treating task UUID as source authority',async()=>{
  const task=pendingTask(),current=input();current.uuid=randomUUID();current.raw_response.payload.author.id='500';current.raw_response.payload.id='301';current.raw_response.event_id='301';current.raw_response.payload.content='Other queued work';
  const f=fixture({pending:[task],currentInput:current});await f.prepare();const next=await f.adapters.pipeline.afterInitial({handledInputIds:[current.uuid],inputs:[current],executionLog:[]});assert(next.inputIds.includes(task.uuid));
  assert.equal((await f.execute('lookup_map_person',lookup,[task.uuid])).status,'forbidden_source');assert.equal(f.lookups.length,0);
  const read=await f.execute('read_pending_task',{taskId:task.uuid,detail:'full'},[task.uuid]);assert.equal(read.status,'ready');assert.deepEqual(read.task.info.batchContext,task.info.batchContext);
  await f.execute('read_discord_messages',{},[task.uuid]);assert.equal((await f.execute('lookup_map_person',lookup,[task.uuid])).status,'ready');assert.equal((await f.execute('lookup_map_person',{...lookup,providerUserId:task.uuid},[task.uuid])).status,'forbidden_source');
  assert.equal(f.lookups.at(-1).providerUserId,'400');f.revoke();assert.equal((await f.execute('read_pending_task',{taskId:task.uuid},[task.uuid])).status,'ready');assert.notEqual((await f.execute('lookup_map_person',lookup,[task.uuid])).status,'ready');await f.adapters.resolveClaimSourceIds({principal:f.context.principal});assert.equal((await f.execute('read_pending_task',{taskId:task.uuid},[task.uuid])).status,'forbidden');assert(f.tasks.has(task.uuid));
});

test('actual final agent reads cached RSVP, refreshes linked speaker, updates the API-created occurrence, then resolves exact task',async()=>{
  const task=pendingTask();task.info.inputs[0].raw_response.payload.content="I'm going to Friday's workshop at Bobst";const current=structuredClone(task.info.inputs[0]);
  const f=fixture({pending:[task],currentInput:current});f.calendarEvents.get(clubId).set('workshop123',{id:'workshop123',summary:'Friday workshop',location:'Bobst',description:'Club workshop',status:'confirmed',etag:'"human"',created:stamp,updated:stamp,start:{dateTime:'2026-10-23T18:00:00.000Z',timeZone:'America/New_York'},end:{dateTime:'2026-10-23T20:00:00.000Z',timeZone:'America/New_York'}});
  const result=await f.run([
    turn(call('finish_batch','initial',[inputId])),
    turn(call('read_pending_task','read_task',{taskId:task.uuid},[task.uuid])),
    turn(call('read_discord_messages','refresh',{},[task.uuid]),call('lookup_map_person','lookup',lookup,[task.uuid])),
    ()=>turn(call('read_map_events','map_snapshot',{sourceId:clubSource,sourceRecordId:'workshop123'},[task.uuid])),
    ()=>{
      assert.equal(f.tasks.size,1);const map=[...f.mapRows.values()].find(row=>row.event.source_record_id==='workshop123');assert(map,'API created occurrence before final write');const {updated_at,...stored}=map.event,event=Object.fromEntries(Object.entries(stored).filter(([,value])=>value!==null));
      return turn(call('upsert_map_event','attach',{event,expectedUpdatedAt:updated_at,buildings:map.buildings,people:[{person_id:personId,attendance_status:'going',presence_basis:'planned',label:'',source_id:source,source_url:url,reported_at:stamp}]},[task.uuid]));
    },
    ()=>{assert.equal([...f.mapRows.values()][0].people[0].person_id,personId);assert(f.tasks.has(task.uuid));return turn(call('resolve_pending_task','resolve',{taskId:task.uuid,outcome:'completed'},[task.uuid]));},
    turn(call('finish_batch','final',[])),
  ]);
  assert.equal(result.status,'completed');assert.equal(f.tasks.size,0);assert.equal(f.calendarEvents.get(memberId).size,0);assert.equal(f.calendarEvents.get(clubId).size,1);assert.equal(f.chronology.filter(row=>row.kind==='map_write').length,2);
});

test('actual bundled ten-turn cap preserves all uncompleted cache tasks including completely untouched tasks',async()=>{
  const pending=Array.from({length:11},()=>pendingTask()),f=fixture({pending});
  const result=await f.run([turn(call('finish_batch','initial',[inputId])),...pending.slice(0,10).map((task,i)=>turn(call('read_pending_task',`task_${i}`,{taskId:task.uuid},[task.uuid])))]);
  assert.equal(result.status,'completed');assert.equal(result.followupStatus,'round_limit');assert.equal(f.modelRequests.length,11);assert.equal(f.finished(),true);assert.deepEqual([...f.tasks.values()],pending);
});

test('actual final map conflict checkpoints the unfinished task and preserves untouched tasks instead of clearing cache',async()=>{
  const task=pendingTask(),untouched=unrelatedTask();task.info.request.operation='source_review';const f=fixture({pending:[task,untouched],mapWriteFailureAfter:1});
  f.calendarEvents.get(clubId).set('workshop123',{id:'workshop123',summary:'Friday workshop',location:'Bobst',status:'confirmed',etag:'"human"',created:stamp,updated:stamp,start:{dateTime:'2026-10-23T18:00:00.000Z',timeZone:'America/New_York'},end:{dateTime:'2026-10-23T20:00:00.000Z',timeZone:'America/New_York'}});
  const result=await f.run([turn(call('finish_batch','initial',[inputId])),turn(call('read_pending_task','read_task',{taskId:task.uuid},[task.uuid])),turn(call('lookup_map_person','lookup',lookup,[task.uuid])),turn(call('read_map_events','map_snapshot',{sourceId:clubSource,sourceRecordId:'workshop123'},[task.uuid])),()=>{
    const map=[...f.mapRows.values()][0],{updated_at,...stored}=map.event,event=Object.fromEntries(Object.entries(stored).filter(([,value])=>value!==null));
    return turn(call('upsert_map_event','conflicted',{event,expectedUpdatedAt:updated_at,buildings:map.buildings,people:[{person_id:personId,attendance_status:'going',presence_basis:'planned',label:'',source_id:source,source_url:url,reported_at:stamp}]},[task.uuid]));
  },request=>{const error=JSON.parse(request.messages.at(-1).content);assert.equal(error.status,'tool_error');assert.equal(error.reason,'conflict');return turn(call('finish_batch','final',[]));}]);
  assert.equal(result.status,'completed');assert.equal(result.followupStatus,'completed');assert.equal(f.tasks.size,2);assert.deepEqual(f.tasks.get(untouched.uuid),untouched);assert.deepEqual(f.tasks.get(task.uuid).info.inputs,task.info.inputs);
  assert(f.tasks.get(task.uuid).info.executionHistory.some(row=>row.kind==='tool_result'&&row.tool==='upsert_map_event'&&row.result.status==='tool_error'&&row.result.reason==='conflict'));assert.equal([...f.mapRows.values()][0].people.length,0);
});

test('actual successful empty task manifest skips an unnecessary final model phase',async()=>{
  const f=fixture(),result=await f.run([turn({id:'initial',name:'finish_batch',arguments:{handledInputIds:[],noChangeInputIds:[inputId]}})]);assert.equal(result.status,'completed');assert.equal(result.followupStatus,'not_needed');assert.equal(f.modelRequests.length,1);assert.equal(f.tasks.size,0);
});

test('cached initial interpretation can finish a Member Plans write in final phase and immediately receive deterministic projection results',async()=>{
  const task=pendingTask();task.info.request={summary:'Original personal plan still needs interpreting',operation:'source_review'};const f=fixture({pending:[task]});
  const result=await f.run([
    turn(call('finish_batch','initial',[inputId])),turn(call('read_pending_task','read_task',{taskId:task.uuid},[task.uuid])),
    turn(call('read_discord_messages','refresh',{},[task.uuid]),call('lookup_map_person','lookup',lookup,[task.uuid])),
    turn(call('upsert_member_plan','member',plan,[task.uuid])),
    request=>{const written=JSON.parse(request.messages.at(-1).content);assert.equal(written.status,'ready');assert(!written.followupSync);assert.equal(f.mapRows.size,0);return turn(call('sync_calendars_to_map','explicit_member_sync',{},[task.uuid]));},
    request=>{
      const result=JSON.parse(request.messages.at(-1).content);assert.equal(result.status,'ready');assert(result.results.some(row=>row.sourceId===memberSource&&row.mapEventId));
      assert.equal(f.mapRows.size,1);assert.equal([...f.mapRows.values()][0].people[0].person_id,personId);return turn(call('resolve_pending_task','resolve',{taskId:task.uuid,outcome:'completed'},[task.uuid]));
    },turn(call('finish_batch','final',[])),
  ]);
  assert.equal(result.status,'completed',JSON.stringify({result,requests:f.modelRequests.length,chronology:f.chronology}));assert.equal(f.tasks.size,0);assert.equal(f.calendarEvents.get(memberId).size,1);assert.equal(f.mapRows.size,1);
});

test('map source authorizer locally binds both pinned calendars with exact instance binding and no cross-calendar substitution',async()=>{
  const reads=[],eventId='shared_event_id';const clients=[clubId,memberId].map(calendarId=>({configured:true,calendarId,readEvent:async args=>{reads.push({calendarId,args});return {status:'ready',events:[{eventId,url:`https://calendar.google.com/calendar/event?eid=${Buffer.from(`${eventId} ${calendarId}`).toString('base64url')}`}]};}}));
  const authorize=createMapSourceAuthorizer({calendarClient:clients[0],calendarSourceId:clubSource,calendarTargets:[{client:clients[1],sourceId:memberSource}]});
  const principal={id:'web',allowedSourceIds:[clubSource,memberSource],calendarAccess:true,calendarId:clubId,calendarTargets:[{sourceId:memberSource,calendarId:memberId}]};
  const memberUrl=`https://calendar.google.com/calendar/event?eid=${Buffer.from(`${eventId} ${memberId}`).toString('base64url')}`,clubUrl=`https://calendar.google.com/calendar/event?eid=${Buffer.from(`${eventId} ${clubId}`).toString('base64url')}`;
  assert.equal(await authorize({principal,sourceId:memberSource,sourceUrl:memberUrl}),true);assert.equal(reads.length,0,'Saved-map authorization never fetches Calendar originals');
  assert.equal(await authorize({principal,sourceId:memberSource,sourceUrl:clubUrl}),false);assert.equal(await authorize({principal:{...principal,allowedSourceIds:[clubSource]},sourceId:memberSource,sourceUrl:memberUrl}),false);
});

test('041 actual SQL fences deterministic map writes by active queue lease and grants no public entry point',async()=>{
  const db=new PGlite();try {
    await db.exec("create role anon;create role authenticated;create role service_role bypassrls;create table public.agent_automation_state(key text primary key,data jsonb not null);create table public.write_probe(value jsonb);create function public.map_upsert_event(p_event jsonb,p_buildings jsonb,p_people jsonb,p_expected_updated_at timestamptz) returns jsonb language plpgsql security definer as $$ begin insert into public.write_probe values(p_event);return jsonb_build_object('status','applied');end; $$;");
    await db.exec(await readFile(new URL('../supabase/migrations/202610220041_automation_map_lease_fence.sql',import.meta.url),'utf8'));
    await db.query("insert into public.agent_automation_state values('runner',jsonb_build_object('token',$1::text,'lease_until',clock_timestamp()+interval '1 hour'))",[lease]);
    const write=token=>db.query("select public.map_automation_upsert_event($1,'{\"id\":\"test\"}'::jsonb,'[]'::jsonb,'[]'::jsonb) result",[token]);
    for(const role of ['anon','authenticated']){await db.exec(`set role ${role}`);await assert.rejects(write(lease),error=>error.code==='42501');await db.exec('reset role');}
    await db.exec('set role service_role');assert.equal((await write(null)).rows[0].result.status,'conflict');assert.equal((await write(randomUUID())).rows[0].result.status,'conflict');assert.equal((await write(lease)).rows[0].result.status,'applied');await db.exec('reset role');
    assert.equal((await db.query('select count(*)::int n from public.write_probe')).rows[0].n,1);
    await db.query("update public.agent_automation_state set data=jsonb_build_object('token',$1::text,'lease_until',clock_timestamp()-interval '1 second') where key='runner'",[lease]);
    await db.exec('set role service_role');assert.equal((await write(lease)).rows[0].result.status,'conflict');await db.exec('reset role');assert.equal((await db.query('select count(*)::int n from public.write_probe')).rows[0].n,1);
  }finally{await db.close();}
});

test('actual map store uses current staged lease for deterministic and final writes, and rejects missing lease before HTTP',async()=>{
  let token;const requests=[],id=randomUUID();const store=createMapEventStore({env:{SUPABASE_URL:'https://database.example.test',SUPABASE_SERVICE_ROLE_KEY:'synthetic'},getLeaseToken:()=>token,
    fetchImpl:async(value,options)=>{requests.push({url:value,args:JSON.parse(options.body)});return Response.json({status:'applied',event_id:id,updated_at:stamp});}});
  const args={event:{id},buildings:[],people:[],expectedUpdatedAt:stamp};assert.equal((await store.upsert(args)).status,'conflict');assert.equal(requests.length,0);
  token=lease;assert.equal((await store.upsert(args)).status,'applied');assert.equal(requests[0].url,'https://database.example.test/rest/v1/rpc/map_automation_upsert_event');assert.equal(requests[0].args.p_token,lease);assert.equal(requests[0].args.p_expected_updated_at,stamp);
  token=randomUUID();await store.upsert(args);assert.equal(requests[1].args.p_token,token);token=undefined;assert.equal((await store.upsert(args)).status,'conflict');assert.equal(requests.length,2);
});

test('actual handler carries every maximum-size task in its bounded manifest and exposes unabridged long IDs/summaries on demand',async t=>{
  const summary='🙂'.repeat(2000),longId='a'.repeat(1024),pending=Array.from({length:200},()=>{const row=unrelatedTask();row.info.request.summary=summary;row.info.request.calendarEventId=longId;return row;}),f=fixture({pending});
  const messageBytes=[];
  const selected=pending[199],result=await f.run([
    turn({id:'initial',name:'finish_batch',arguments:{handledInputIds:[],noChangeInputIds:[inputId]}}),
    request=>{
      messageBytes.push(Buffer.byteLength(JSON.stringify(request.messages)));assert(messageBytes.at(-1)<262144);const next=JSON.parse(request.messages.at(-1).content);assert.equal(next.context.taskCount,200);assert.deepEqual(new Set(next.context.tasks.map(row=>row.uuid)),new Set(pending.map(row=>row.uuid)));
      for(const row of next.context.tasks){assert.equal(row.summaryTruncated,true);assert.equal(row.eventIdInTask,true);assert.equal([...row.summary].length,100);assert(!Object.hasOwn(row,'calendarEventId'));}
      return turn(call('read_pending_task','full_task',{taskId:selected.uuid},[selected.uuid]));
    },
    request=>{messageBytes.push(Buffer.byteLength(JSON.stringify(request.messages)));assert(messageBytes.at(-1)<262144);const read=JSON.parse(request.messages.at(-1).content);assert.equal(read.task.info.request.summary,summary);assert.equal(read.task.info.request.calendarEventId,longId);return turn(call('finish_batch','final',[]));},
  ]);
  assert.equal(result.status,'completed');assert.deepEqual([...f.tasks.values()],pending);t.diagnostic(`Full 200-task manifest messages ${messageBytes[0]} bytes; after full task read ${messageBytes[1]} bytes; limit262144.`);
});

test('followup notes mutation is denied and preserves the raw Calendar location resolution marker',async()=>{
  const task=pendingTask();task.info.request.operation='source_review';const f=fixture({pending:[task]});f.calendarEvents.get(clubId).set('workshop123',{id:'workshop123',summary:'Workshop',description:'Provider description',location:'Bobst',status:'confirmed',etag:'"human"',created:stamp,updated:stamp,start:{dateTime:'2026-10-23T18:00:00.000Z',timeZone:'America/New_York'},end:{dateTime:'2026-10-23T20:00:00.000Z',timeZone:'America/New_York'}});
  let originalNotes;const result=await f.run([turn(call('finish_batch','initial',[inputId])),turn(call('read_map_events','map_snapshot',{sourceId:clubSource,sourceRecordId:'workshop123'},[task.uuid])),()=>{
    const map=[...f.mapRows.values()][0],{updated_at,...stored}=map.event;originalNotes=stored.notes;assert(originalNotes.endsWith('Location: Bobst'));
    const event=Object.fromEntries(Object.entries(stored).filter(([,value])=>value!==null));event.notes='Agent text removing the raw location marker';return turn(call('upsert_map_event','mutate_notes',{event,expectedUpdatedAt:updated_at,buildings:map.buildings,people:[]},[task.uuid]));
  },request=>{const error=JSON.parse(request.messages.at(-1).content);assert.equal(error.status,'tool_error');assert.equal(error.reason,'forbidden_source');return turn(call('finish_batch','final',[]));}]);
  assert.equal(result.status,'completed');assert.equal([...f.mapRows.values()][0].event.notes,originalNotes);assert.equal(f.chronology.filter(row=>row.kind==='map_write').length,1);assert.deepEqual(f.tasks.get(task.uuid),task);
});

test('actual RSVP followup accepts the deterministic map name for long and blank Calendar titles',async t=>{
  for(const [label,title] of [['201-character','W'.repeat(201)],['300-character','W'.repeat(300)],['astral','🙂'.repeat(201)],['empty',''],['whitespace','   ']])await t.test(label,async()=>{
    const task=pendingTask(),f=fixture({pending:[task]});f.calendarEvents.get(clubId).set('workshop123',{id:'workshop123',summary:title,location:'Bobst',status:'confirmed',etag:'"human"',created:stamp,updated:stamp,start:{dateTime:'2026-10-23T18:00:00.000Z',timeZone:'America/New_York'},end:{dateTime:'2026-10-23T20:00:00.000Z',timeZone:'America/New_York'}});
    const result=await f.run([turn(call('finish_batch','initial',[inputId])),turn(call('read_pending_task','read_task',{taskId:task.uuid},[task.uuid])),turn(call('lookup_map_person','lookup',lookup,[task.uuid])),turn(call('read_map_events','map_snapshot',{sourceId:clubSource,sourceRecordId:'workshop123'},[task.uuid])),()=>{
      const map=[...f.mapRows.values()][0];assert(map);assert([...map.event.name].length<=200);assert(map.event.name.trim());const {updated_at,...stored}=map.event,event=Object.fromEntries(Object.entries(stored).filter(([,value])=>value!==null));
      return turn(call('upsert_map_event','attach',{event,expectedUpdatedAt:updated_at,buildings:map.buildings,people:[{person_id:personId,attendance_status:'going',presence_basis:'planned',label:'',source_id:source,source_url:url,reported_at:stamp}]},[task.uuid]));
    },turn(call('resolve_pending_task','resolve',{taskId:task.uuid,outcome:'completed'},[task.uuid])),turn(call('finish_batch','final',[]))]);
    assert.equal(result.status,'completed');assert.equal(f.tasks.size,0);assert.equal([...f.mapRows.values()][0].people[0].person_id,personId);
  });
});

test('actual Member Plans argument preparation derives omitted or copied source fields only from exact original and linked receipt',async t=>{
  for(const [label,patch] of [['omitted',{}],['copied Calendar source',{sourceId:memberSource,sourceKey:'calendar:member:wrong-event'}],['wrong Discord key',{sourceId:clubSource,sourceKey:'discord:100:999:888'}],['ungranted supplied UUID',{sourceId:randomUUID(),sourceKey:'miro:other:wrong'}]])await t.test(label,async()=>{
    const f=fixture(),grants=[...f.context.principal.allowedSourceIds],{sourceId:_,sourceKey:__,...minimal}=plan,args={...minimal,...patch};
    const result=await f.run([turn(call('read_discord_messages','read'),call('lookup_map_person','lookup',lookup),call('upsert_member_plan','plan',args)),turn(call('finish_batch','initial',[inputId]))]);
    assert.equal(result.status,'completed');assert.equal(f.calendarEvents.get(clubId).size,0);assert.equal(f.calendarEvents.get(memberId).size,1);assert.deepEqual(f.context.principal.allowedSourceIds,grants);
    const [saved]=f.calendarEvents.get(memberId).values(),metadata=JSON.parse(saved.extendedProperties.private.memberPlan);assert.equal(saved.id,calendarEventId(memberId,'discord:100:200:300'));assert.equal(saved.source.url,url);
    assert.equal(metadata.participation.sourceId,source);assert.equal(metadata.participation.sourceUrl,url);assert.equal(metadata.participation.providerUserId,'400');assert.equal(metadata.participation.personId,personId);
    assert.equal([...f.mapRows.values()][0].event.source_id,memberSource);assert.equal([...f.mapRows.values()][0].people[0].source_id,source);
  });
});

test('Member Plans argument preparation never invents receipts or grants for wrong originals, speakers or revoked sources',async t=>{
  for(const scenario of ['no receipt','wrong URL','wrong person','wrong lookup speaker','changed live speaker','revoked'])await t.test(scenario,async()=>{
    const f=fixture(),grants=[...f.context.principal.allowedSourceIds],{sourceId:_,sourceKey:__,...minimal}=plan;await f.prepare();await f.execute('read_discord_messages',{});
    if(scenario==='wrong lookup speaker')assert.equal((await f.execute('lookup_map_person',{...lookup,providerUserId:'500'})).status,'forbidden_source');
    else if(scenario!=='no receipt')assert.equal((await f.execute('lookup_map_person',lookup)).status,'ready');
    const args={...minimal,...(scenario==='wrong URL'?{sourceUrl:url+'1'}:{}),...(scenario==='wrong person'?{personId:randomUUID()}:{}),sourceId:memberSource,sourceKey:'discord:100:999:888'};
    if(scenario==='changed live speaker'){f.setCurrentSpeaker('500');await f.execute('read_discord_messages',{});}if(scenario==='revoked'){f.revoke();assert.equal(await f.adapters.authorizeEvent({event:input().raw_response,principal:f.context.principal}),false);return;}
    assert.equal((await f.execute('upsert_member_plan',args)).status,'forbidden_source');assert.equal(f.calendarEvents.get(memberId).size,0);assert.equal(f.calendarEvents.get(clubId).size,0);assert.equal(f.mapRows.size,0);assert.deepEqual(f.context.principal.allowedSourceIds,grants);
    assert.equal(f.chronology.filter(row=>row.kind==='calendar_write').length,0);
  });
});

test('signed Gmail Member Plans path survives club Gmail support and deterministically projects exact sender',async()=>{
  const mailUrl='https://mail.google.com/mail/u/0/#all/abc123',current={uuid:inputId,raw_response:{source:'gmail',source_id:source,event_type:'email_received_metadata',event_id:'abc123',revision:'1',received_at:stamp,
    payload:{id:'abc123',internalDate:String(Date.parse(stamp)),content:'I am at Bobst studying',payload:{headers:[{name:'From',value:'Organizer <host@example.test>'}]}}}};
  const f=fixture({gmail:true,currentInput:current}),gmailLookup={provider:'email',providerUserId:'host@example.test',sourceId:source,sourceUrl:mailUrl};
  const result=await f.run([
    turn(call('read_gmail','body',{messageId:'abc123'}),call('lookup_map_person','sender',gmailLookup)),
    turn(call('upsert_member_plan','personal',{...plan,sourceKey:'gmail:abc123',sourceUrl:mailUrl})),
    turn(call('finish_batch','initial',[inputId])),
  ]);
  assert.equal(result.status,'completed');assert.equal(f.calendarEvents.get(clubId).size,0);assert.equal(f.calendarEvents.get(memberId).size,1);assert.equal(f.mapRows.size,1);
  const [saved]=f.calendarEvents.get(memberId).values(),metadata=JSON.parse(saved.extendedProperties.private.memberPlan),[map]=f.mapRows.values();
  assert.equal(saved.id,calendarEventId(memberId,'gmail:abc123'));assert.equal(metadata.participation.provider,'email');assert.equal(metadata.participation.providerUserId,'host@example.test');
  assert.equal(metadata.participation.personId,personId);assert.equal(metadata.participation.sourceId,source);assert.equal(map.people[0].person_id,personId);assert.equal(map.people[0].source_url,mailUrl);
});

test('irrelevant input still runs deterministic Calendar projection without model-driven rolling scans',async()=>{
  const current=input();current.raw_response.payload.content='Thank you!';const f=fixture({currentInput:current});
  f.calendarEvents.get(clubId).set('workshop123',{id:'workshop123',summary:'Workshop',location:'Bobst',status:'confirmed',etag:'"human"',created:stamp,updated:stamp,start:{dateTime:'2026-10-23T18:00:00Z',timeZone:'America/New_York'},end:{dateTime:'2026-10-23T20:00:00Z',timeZone:'America/New_York'}});
  const result=await f.run([request=>{assert(!request.tools.some(tool=>/miro/.test(tool.name)));return turn({id:'irrelevant',name:'finish_batch',arguments:{handledInputIds:[],noChangeInputIds:[inputId]}});}]);
  assert.equal(result.status,'completed');assert.equal(f.modelRequests.length,1);assert.equal(f.mapRows.size,1);assert.equal([...f.mapRows.values()][0].event.source_record_id,'workshop123');assert.equal(f.tasks.size,0);
});

test('mechanical projection failure and legacy calendar_review task do not force model pagination or erase task',async()=>{
  const legacy=pendingTask();legacy.info.request.operation='calendar_review';const f=fixture({pending:[legacy],mapWriteFailureAfter:0});
  f.calendarEvents.get(clubId).set('workshop123',{id:'workshop123',summary:'Workshop',location:'Bobst',status:'confirmed',etag:'"human"',created:stamp,updated:stamp,start:{dateTime:'2026-10-23T18:00:00Z',timeZone:'America/New_York'},end:{dateTime:'2026-10-23T20:00:00Z',timeZone:'America/New_York'}});
  const result=await f.run([turn({id:'irrelevant',name:'finish_batch',arguments:{handledInputIds:[],noChangeInputIds:[inputId]}})]);
  assert.equal(result.status,'completed');assert.equal(f.modelRequests.length,1);assert.equal(f.mapRows.size,0);assert.deepEqual(f.tasks.get(legacy.uuid),legacy);assert.equal(f.tasks.size,1);
});

test('model reads saved task without original I/O, chooses normal Discord tool afterward, and unavailable original still prevents a Member Plans write',async()=>{
  const task=pendingTask();task.info.request={summary:'Interpret the saved personal plan',operation:'source_review'};task.info.inputs[0].raw_response.payload.content='';const f=fixture({pending:[task],currentInput:structuredClone(task.info.inputs[0]),originalUnavailable:true});let cacheBoundary;
  const result=await f.run([
    turn(call('finish_batch','initial',[inputId])),
    ()=>{cacheBoundary=f.chronology.length;return turn(call('read_pending_task','cached',{taskId:task.uuid,detail:'full'},[task.uuid]));},
    request=>{const cached=JSON.parse(request.messages.at(-1).content);assert.equal(cached.status,'ready');assert.deepEqual(cached.task,task);assert(!f.chronology.slice(cacheBoundary).some(row=>row.kind==='discord_original'||row.kind==='discord_tool'));return turn(call('read_discord_messages','normal_read',{},[task.uuid]));},
    request=>{const failed=JSON.parse(request.messages.at(-1).content);assert.equal(failed.status,'tool_error');assert.equal(failed.reason,'unavailable');assert(f.chronology.some(row=>row.kind==='discord_tool'));return turn(call('lookup_map_person','known_sender',lookup,[task.uuid]));},
    turn(call('upsert_member_plan','unavailable_write',plan,[task.uuid])),
    request=>{const failed=JSON.parse(request.messages.at(-1).content);assert.equal(failed.status,'tool_error');assert.equal(failed.reason,'forbidden_source');return turn(call('finish_batch','final',[]));},
  ]);
  assert.equal(result.status,'completed');assert.equal(f.calendarEvents.get(memberId).size,0);assert.equal(f.calendarEvents.get(clubId).size,0);assert.equal(f.mapRows.size,0);assert(f.tasks.has(task.uuid));assert.equal(f.chronology.filter(row=>row.kind==='calendar_write'||row.kind==='map_write').length,0);
});

async function cancellationFlow(kind,{state='active',readback,writeFailure,wrongPerson=false,wrongTarget=false,staleVersion=false,revokeSource=false}={}){
  const task=pendingTask(),untouched=unrelatedTask(),target=kind==='member'?memberId:clubId,key='discord:100:200:300',eventId=calendarEventId(target,key);
  const content=kind==='member'?"I cancelled my study plan at Bobst.":'The Friday workshop at Bobst is cancelled.';
  task.info.inputs[0].raw_response.payload.content=content;task.info.request={summary:'Finish the exact original cancellation',operation:'source_review',calendarKind:kind,calendarEventId:wrongTarget?'wrong_requested_event':eventId,...(kind==='member'?{personId:wrongPerson?randomUUID():personId}:{})};
  const f=fixture({pending:[task,untouched],currentInput:structuredClone(task.info.inputs[0])}),client=kind==='member'?f.memberClient:f.calendarClient;
  if(state!=='absent'){
    const participation={sourceId:source,sourceUrl:url,provider:'discord',providerUserId:'400',personId,reportedAt:stamp,label:'Studying'};
    const actor={id:'synthetic-seed',calendarAccess:true,calendarId:target,allowedSourceIds:[source],calendarSources:[{provider:'discord',guildId:'100',channelId:'200',messageId:'300',sourceId:source}],memberPlanReceipts:[participation]};
    const args={sourceKey:key,sourceUrl:url,title:'Friday workshop',location:'Bobst',start:{dateTime:'2026-10-23T18:00:00Z',timeZone:'America/New_York'},end:{dateTime:'2026-10-23T20:00:00Z',timeZone:'America/New_York'},principal:actor,...(kind==='member'?{trustedParticipation:participation,activityKind:'personal_plan',typeId:'study'}:{})};
    const seed=await client[kind==='member'?'upsertMemberPlan':'upsertEvent'](args);assert.equal(seed.status,'ready',JSON.stringify(seed));assert.equal(seed.eventId,eventId);
    if(state==='cancelled'){const cancelled=await client[kind==='member'?'cancelMemberPlan':'cancelEvent'](args);assert.equal(cancelled.status,'ready');}
  }
  f.chronology.length=0;let cancellation,resolution,readBoundary;
  const args=kind==='member'?{sourceUrl:url,personId}:{sourceKey:key,sourceUrl:url};
  const result=await f.run([
    turn(call('finish_batch','cancel_initial',[inputId])),turn(call('read_pending_task','cancel_task',{taskId:task.uuid},[task.uuid])),
    ()=>{if(revokeSource)f.setCurrentSpeaker('999');return turn(call('read_discord_messages','cancel_original',{},[task.uuid]),...(kind==='member'?[call('lookup_map_person','cancel_person',lookup,[task.uuid])]:[]));},
    ()=>{f.calendarControl.writeFailure=writeFailure;return turn(call(kind==='member'?'cancel_member_plan':'cancel_calendar_event','cancel',args,[task.uuid]));},
    request=>{cancellation=JSON.parse(request.messages.at(-1).content);f.calendarControl.readback=readback;readBoundary=f.chronology.length;
      if(readback==='reappeared')f.calendarEvents.get(target).set(eventId,{id:eventId,summary:'Concurrent provider event',status:'confirmed',source:{url},start:{dateTime:'2026-10-23T18:00:00Z',timeZone:'America/New_York'},end:{dateTime:'2026-10-23T20:00:00Z',timeZone:'America/New_York'}});
      if(staleVersion)f.tasks.get(task.uuid).updated_at='2026-10-22T18:59:00.000Z';
      return turn(call(kind==='member'?'read_member_plan':'read_calendar_event','cancel_explicit_readback',{eventId},[task.uuid]));},
    request=>{
      const current=JSON.parse(request.messages.at(-1).content);
      if(readback){resolution={status:'not_requested',reason:'uncertain_current_state',observedStatus:current.status};return turn(call('finish_batch','cancel_final',[]));}
      return turn(call('resolve_pending_task','cancel_resolve',{taskId:task.uuid,outcome:'completed'},[task.uuid]));},
    request=>{resolution=JSON.parse(request.messages.at(-1).content);return turn(call('finish_batch','cancel_final',[]));},
  ]);
  assert.deepEqual(f.tasks.get(untouched.uuid),untouched,'Unvisited task must retain its exact version/content');
  return {f,task,eventId,target,result,cancellation,resolution,readBoundary};
}

for(const kind of ['club','member'])test(`source-review ${kind} cancellation removes only the confirmed exact task after a fresh cancelled read`,async()=>{
  const {f,task,eventId,target,result,cancellation,resolution,readBoundary}=await cancellationFlow(kind);
  assert.equal(result.status,'completed');assert.equal(cancellation.status,'ready');assert.equal(cancellation.calendarWrite?.outcome??cancellation.outcome,'cancelled');assert.equal(resolution.status,'ready');assert(!f.tasks.has(task.uuid));assert.equal(f.tasks.size,1);assert.equal(f.calendarEvents.get(target).get(eventId).status,'cancelled');
  assert(f.chronology.slice(readBoundary).some(row=>row.kind==='calendar_read'&&row.calendarId===target&&row.eventId===eventId));assert.deepEqual(f.chronology.filter(row=>row.kind==='task_resolve').map(row=>({taskId:row.taskId,version:row.expectedUpdatedAt})),[{taskId:task.uuid,version:task.updated_at}]);
});

test('source-review idempotent cancelled club and authorized absent Member Plans outcomes finish only with exact fresh state',async()=>{
  for(const [kind,state,outcome] of [['club','cancelled','unchanged'],['member','absent','already_absent']]){
    const {f,task,result,cancellation,resolution,readBoundary,eventId,target}=await cancellationFlow(kind,{state});assert.equal(result.status,'completed');assert.equal(cancellation.calendarWrite?.outcome??cancellation.outcome,outcome);assert.equal(resolution.status,'ready');assert(!f.tasks.has(task.uuid));assert.equal(f.chronology.filter(row=>row.kind==='calendar_write').length,0);assert(f.chronology.slice(readBoundary).some(row=>row.kind==='calendar_read'&&row.calendarId===target&&row.eventId===eventId));
  }
});

test('source-review cancellation retains tasks when the fresh read is active, unavailable or bound to another source/event',async()=>{
  for(const [kind,readback] of [['club','active'],['member','unavailable'],['club','wrong_source'],['member','wrong_target'],['club','empty'],['member','reappeared']]){
    const {f,task,result,cancellation,resolution,eventId,target}=await cancellationFlow(kind,{readback,...(readback==='reappeared'?{state:'absent'}:{})});assert.equal(result.status,'completed');assert.equal(cancellation.status,'ready');assert.equal(f.calendarEvents.get(target).get(eventId).status,readback==='reappeared'?'confirmed':'cancelled');assert.equal(resolution.status,'not_requested');assert(f.tasks.has(task.uuid));assert.equal(f.chronology.filter(row=>row.kind==='task_resolve').length,0);
  }
});

test('source-review cancellation failures, revoked original identity and wrong task target/person retain unfinished work',async()=>{
  for(const [kind,options] of [['club',{writeFailure:'conflict'}],['member',{revokeSource:true}],['club',{wrongTarget:true}],['member',{wrongPerson:true}]]){
    const {f,task,result,cancellation,resolution,target,eventId}=await cancellationFlow(kind,options);assert.equal(result.status,'completed');assert.equal(resolution.status,'tool_error');assert(f.tasks.has(task.uuid));assert.equal(f.chronology.filter(row=>row.kind==='task_resolve').length,0);
    const denied=options.writeFailure||options.revokeSource;assert.equal(cancellation.status,denied?'tool_error':'ready');assert.equal(f.calendarEvents.get(target).get(eventId).status,denied?'confirmed':'cancelled');
  }
});

test('a successful cancellation cannot delete a newer task version created after the cache read',async()=>{
  const {f,task,result,resolution}=await cancellationFlow('club',{staleVersion:true});assert.equal(resolution.status,'tool_error');assert.equal(resolution.reason,'conflict');assert.equal(result.status,'completed');
  assert.deepEqual(f.tasks.get(task.uuid),{...task,updated_at:'2026-10-22T18:59:00.000Z'},'The newer exact task survives unchanged even though this run can finish');
  assert.equal(f.chronology.filter(row=>row.kind==='task_resolve').length,0,'Fresh exact reads reject stale completion before dispatching a delete');
});

test('actual RSVP completion survives same-version cache reread after its single map write',async()=>{
  const task=pendingTask(),untouched=unrelatedTask(),f=fixture({pending:[task,untouched]});
  f.calendarEvents.get(clubId).set('workshop123',{id:'workshop123',summary:'Friday workshop',location:'Bobst',description:'Human notes remain',status:'confirmed',etag:'"human"',created:stamp,updated:stamp,
    start:{dateTime:'2026-10-23T18:00:00.000Z',timeZone:'America/New_York'},end:{dateTime:'2026-10-23T20:00:00.000Z',timeZone:'America/New_York'}});
  let writeResult,readResult,resolution,cacheBoundary;
  const result=await f.run([
    turn(call('finish_batch','initial_handoff',[inputId])),
    turn(call('read_pending_task','before_write',{taskId:task.uuid},[task.uuid])),
    turn(call('read_discord_messages','current_original',{},[task.uuid]),call('lookup_map_person','linked_author',lookup,[task.uuid])),
    ()=>turn(call('read_map_events','map_snapshot',{sourceId:clubSource,sourceRecordId:'workshop123'},[task.uuid])),
    ()=>{
      const map=[...f.mapRows.values()][0];assert(map);const {updated_at,...stored}=map.event,event=Object.fromEntries(Object.entries(stored).filter(([,value])=>value!==null));
      return turn(call('upsert_map_event','single_attendance_write',{event,expectedUpdatedAt:updated_at,buildings:map.buildings,people:[{person_id:personId,attendance_status:'going',presence_basis:'planned',label:'',source_id:source,source_url:url,reported_at:stamp}]},[task.uuid]));
    },
    request=>{
      writeResult=JSON.parse(request.messages.at(-1).content);assert.equal(writeResult.status,'ready');assert.equal(f.tasks.size,2);cacheBoundary=f.chronology.length;
      return turn(call('read_pending_task','same_version_after_write',{taskId:task.uuid},[task.uuid]));
    },
    request=>{
      readResult=JSON.parse(request.messages.at(-1).content);assert.equal(readResult.status,'ready');assert.equal(readResult.alreadyRead,true);assert.equal(readResult.updated_at,task.updated_at);assert.equal(readResult.taskId,task.uuid);
      assert(!f.chronology.slice(cacheBoundary).some(row=>row.kind==='calendar_read'||row.kind==='discord_tool'||row.kind==='discord_original'),'Cache reread adds no source/provider access');
      return turn(call('resolve_pending_task','confirmed_completion',{taskId:task.uuid,outcome:'completed'},[task.uuid]));
    },
    request=>{resolution=JSON.parse(request.messages.at(-1).content);return turn(call('finish_batch','end_followup',[]));},
  ]);
  assert.equal(result.status,'completed');assert.equal(resolution.status,'ready');assert(!f.tasks.has(task.uuid));assert.deepEqual(f.tasks.get(untouched.uuid),untouched);
  assert.deepEqual(f.chronology.filter(row=>row.kind==='task_resolve').map(row=>({id:row.taskId,version:row.expectedUpdatedAt})),[{id:task.uuid,version:task.updated_at}]);
  assert.equal(f.chronology.filter(row=>row.kind==='calendar_write').length,0);assert.equal(f.chronology.filter(row=>row.kind==='map_write').length,2,'One deterministic projection and one attendance merge');
  const map=[...f.mapRows.values()][0];assert.equal(map.people[0].person_id,personId);assert.equal(map.people[0].source_url,url);assert.equal(map.event.starts_at,'2026-10-23T18:00:00.000Z');assert.equal(map.event.ends_at,'2026-10-23T20:00:00.000Z');
});

test('argument recovery actual handler and adapters reject a whole turn then permit one exact partial RSVP write and resolution',async()=>{
  const task=pendingTask();task.info.inputs[0].raw_response.payload.content="I'll join only the first hour of Friday's workshop at Bobst, 3–5 PM New York.";
  const blocked=pendingTask();blocked.info.inputs[0]=structuredClone(task.info.inputs[0]);blocked.info.inputs[0].uuid=randomUUID();blocked.info.inputs[0].raw_response.event_id='301';blocked.info.inputs[0].raw_response.payload={id:'301',author:{id:'900'},content:"I'll attend the whole workshop."};blocked.info.request={summary:'Exact original author900 has no linked identity; retain supported attendance until externally linked',operation:'participation',calendarKind:'club',calendarEventId:'workshop123'};
  const f=fixture({pending:[task,blocked],currentInput:task.info.inputs[0]});
  const helperId=randomUUID(),helper={person_id:helperId,attendance_status:'going',presence_basis:'planned',label:'Existing helper',starts_at:null,ends_at:null,source_id:source,source_url:'https://discord.com/channels/100/200/302',reported_at:stamp};
  const rawRead=f.mapEventService.read.bind(f.mapEventService),rawUpsert=f.mapEventService.upsert.bind(f.mapEventService);
  const {createMapEventService}=await import('../server/map/events.js');
  const service=createMapEventService({authorizeSource:async()=>true,now:()=>new Date('2026-10-22T18:30:00Z'),store:{configured:true,
    read:async()=>{const {status,...rows}=await rawRead({});return {...rows,people:[{id:personId,display_name:'Ready author',is_trackable:true},{id:helperId,display_name:'Existing helper',is_trackable:true}],event_types:[{code:'other',name:'Other',description:'',icon_key:'other',sort_order:0}]};},
    lookup:async({provider,providerUserId})=>provider==='discord'&&providerUserId==='400'?{id:personId,display_name:'Ready author',is_trackable:true}:null,
    upsert:rawUpsert,
  }});Object.assign(f.mapEventService,{read:service.read,lookup:service.lookup,upsert:service.upsert});
  assert.equal((await service.lookup({principal:f.adapters.principal,provider:'discord',providerUserId:'900',sourceId:source,sourceUrl:'https://discord.com/channels/100/200/301'})).person,null);
  f.calendarEvents.get(clubId).set('workshop123',{id:'workshop123',summary:'Friday workshop',location:'Bobst',description:'Human notes remain',status:'confirmed',etag:'"human"',created:stamp,updated:stamp,start:{dateTime:'2026-10-23T19:00:00.000Z',timeZone:'America/New_York'},end:{dateTime:'2026-10-23T21:00:00.000Z',timeZone:'America/New_York'}});
  const {createCalendarMapSync}=await import('../server/automation/calendar-sync.js');
  const sync=createCalendarMapSync({targets:[{client:f.calendarClient,sourceId:clubSource,kind:'club'}],mapService:f.mapEventService,loadBuildings:async()=>[{id:'bobst-library',name:'Bobst Library',aliases:['Bobst']}]});
  const seeded=await sync.sync({principal:f.adapters.principal,window:{timeMin:'2026-10-23T00:00:00Z',timeMax:'2026-10-24T00:00:00Z'}});assert.equal(seeded.complete,true);
  const initial=[...f.mapRows.values()][0];initial.people.push(structuredClone(helper));const before=structuredClone(initial);f.chronology.length=0;
  const args=()=>{const row=[...f.mapRows.values()][0];return {event:Object.fromEntries(Object.entries(row.event).filter(([key,value])=>!['created_at','updated_at'].includes(key)&&value!==null)),expectedUpdatedAt:row.event.updated_at,buildings:row.buildings,people:[Object.fromEntries(Object.entries(helper).filter(([,value])=>value!==null)),{person_id:personId,attendance_status:'going',presence_basis:'planned',label:'',starts_at:'2026-10-23T19:00:00Z',ends_at:'2026-10-23T20:00:00Z',source_id:source,source_url:url,reported_at:stamp}]};};
  const typo=randomUUID();let resolution;
  const result=await f.run([
    turn(call('finish_batch','initial',[inputId])),
    turn(call('read_pending_task','wrong_scope',{taskId:task.uuid},[typo]),call('upsert_map_event','skipped_peer',args(),[task.uuid])),
    request=>{const errors=request.messages.slice(-2).map(m=>JSON.parse(m.content));assert(errors.every(e=>e.status==='tool_error'));assert(errors.every(e=>!JSON.stringify(e).includes(typo)&&!JSON.stringify(e).includes(task.uuid)));assert(!f.chronology.some(e=>e.kind==='map_write'||e.kind==='calendar_write'));assert.deepEqual(f.tasks.get(blocked.uuid),blocked);return turn(call('read_pending_task','correct_scope',{taskId:task.uuid},[task.uuid]));},
    turn(call('resolve_pending_task','rejected_turn_is_no_proof',{taskId:task.uuid,outcome:'completed'},[task.uuid])),
    request=>{assert.equal(JSON.parse(request.messages.at(-1).content).status,'tool_error');assert(f.tasks.has(task.uuid));return turn(call('read_discord_messages','original',{},[task.uuid]),call('lookup_map_person','person',lookup,[task.uuid]));},
    ()=>turn(call('read_map_events','map_for_real_write',{sourceId:clubSource,sourceRecordId:'workshop123'},[task.uuid])),
    ()=>turn(call('upsert_map_event','only_real_write',args(),[task.uuid])),
    request=>{const receipt=JSON.parse(request.messages.at(-1).content);assert.equal(receipt.sourceStatus,'applied',JSON.stringify(receipt));return turn(call('read_pending_task','post_write_wrong_scope',{taskId:task.uuid},[typo]));},
    request=>{assert.equal(JSON.parse(request.messages.at(-1).content).status,'tool_error');assert.equal(f.chronology.filter(e=>e.kind==='map_write').length,1);return turn(call('read_pending_task','unchanged_version',{taskId:task.uuid},[task.uuid]));},
    turn(call('resolve_pending_task','resolve_ready',{taskId:task.uuid,outcome:'completed'},[task.uuid])),
    request=>{resolution=JSON.parse(request.messages.at(-1).content);return turn(call('finish_batch','final',[]));},
  ]);
  assert.equal(result.status,'completed');assert.equal(result.followupStatus,'completed');assert.equal(resolution.status,'ready');assert(!f.tasks.has(task.uuid));assert.deepEqual(f.tasks.get(blocked.uuid),blocked);
  assert.equal(f.chronology.filter(e=>e.kind==='map_write').length,1);assert.equal(f.chronology.filter(e=>e.kind==='calendar_write').length,0);
  const row=[...f.mapRows.values()][0],ready=row.people.find(p=>p.person_id===personId);assert.equal(Date.parse(ready.starts_at),Date.parse('2026-10-23T19:00:00Z'));assert.equal(Date.parse(ready.ends_at),Date.parse('2026-10-23T20:00:00Z'));assert.equal(ready.source_url,url);assert.deepEqual(row.people.find(p=>p.person_id===helperId),helper);
  const facts=value=>Object.fromEntries(Object.entries(value).filter(([key])=>!['created_at','updated_at'].includes(key)));assert.deepEqual(facts(row.event),facts(before.event));assert.deepEqual(row.buildings,before.buildings);
});

// Complete participation contract fixture: real handler, clients, adapters and
// shared map service. Only provider HTTP, queue/task persistence and raw map RPC
// storage are simulated; no environment credential or production network path.
async function participationFixture({omitRawStore=false}={}) {
 const s=randomUUID(),cs=randomUUID(),ms=randomUUID(),token=randomUUID(),clock='2026-10-22T18:30:00.000Z',taskStamp='2026-10-22T18:20:00.000Z';
 const ids=['400','500','600'].map(()=>randomUUID()),people=ids.map((id,i)=>({id,display_name:['Alex','Blair','Casey'][i],is_trackable:true,discord_user_id:['400','500','600'][i]}));
 const native=['300','301','302'].map((id,i)=>({id,author:['400','500','900'][i],content:['I can join the first hour.','I will join for the last90minutes.',"I'll attend, too."][i]}));
 const inputs=native.map(m=>({uuid:randomUUID(),raw_response:{source:'discord',source_id:s,event_type:'message_created',event_id:m.id,revision:'1',received_at:taskStamp,payload:{id:m.id,guild_id:'100',channel_id:'200',timestamp:taskStamp,author:{id:m.author},content:m.content}}}));
 const originals=()=>native.map(m=>({kind:'discord',retrieval:'live',sourceId:s,url:`https://discord.com/channels/100/200/${m.id}`,guildId:'100',channelId:'200',messageId:m.id,authorId:m.author,content:m.content,excerpt:m.content,createdAt:taskStamp,sourceUpdatedAt:taskStamp}));
 const tasks=new Map(),mapRows=new Map(),history=[],chronology=[],network=[],observations=[],control={revoked:false,originalUnavailable:false,changedAuthor:false,changedContent:false,hiddenHelper:false,humanConflict:false,writeStatus:'applied'},buildings=[{id:'bobst-library',name:'Bobst Library',aliases:['Bobst']}];let version=0;
 const clone=value=>JSON.parse(JSON.stringify(value));
 const rawStore={configured:true,read:async({observedAt})=>{assert.equal(observedAt,clock,'Raw snapshots require explicit observation time');observations.push(observedAt);const rows=[...mapRows.values()];return clone({events:rows.map(r=>r.event),event_buildings:rows.flatMap(r=>r.buildings.map(b=>({...b,event_id:r.event.id}))),event_people:rows.flatMap(r=>r.people.map(p=>({...p,event_id:r.event.id}))),buildings,people,event_types:['study','meeting','event','social','other'].map(code=>({code,name:code,description:'',icon_key:code,sort_order:0}))});},lookup:async({provider,providerUserId})=>clone(people.find(p=>provider==='discord'&&p.discord_user_id===providerUserId)??null),upsert:async args=>{
  chronology.push({kind:'map_attempt',arguments:clone({...args,signal:undefined})});const prior=mapRows.get(args.event.id);if(control.humanConflict&&prior){prior.event.notes='Newer human notes';prior.event.updated_at='2026-10-22T18:31:00.000Z';return {status:'conflict'};}if(prior&&prior.event.updated_at!==args.expectedUpdatedAt)return {status:'conflict'};if(control.writeStatus!=='applied')return {status:control.writeStatus};
  const updated=`2026-10-22T18:30:${String(++version).padStart(2,'0')}.000Z`,row={event:{...clone(args.event),created_at:prior?.event.created_at??taskStamp,updated_at:updated},buildings:clone(args.buildings),people:args.people.map(p=>({starts_at:null,ends_at:null,...clone(p)}))};mapRows.set(args.event.id,row);chronology.push({kind:'map_write',row:clone(row)});if(control.mismatchAfterWrite){row.people.find(p=>p.person_id===ids[0]).label='Concurrent human readback';chronology.push({kind:'post_write_change'});}return control.omitReceipt?{status:'applied'}:{status:'applied',event_id:args.event.id,updated_at:updated};}};
 const authorize=({principal,sourceId,sourceUrl})=>!control.revoked&&principal.allowedSourceIds.includes(sourceId)&&!(control.hiddenHelper&&sourceUrl==='https://discord.com/channels/100/200/292');
 const baseMapService=createMapEventService({store:rawStore,authorizeSource:authorize,now:()=>new Date(clock)});
 const mapService={...baseMapService,read:async args=>{const result=await baseMapService.read(args);if(control.partialAfterWrite&&chronology.some(row=>row.kind==='map_write'))return {...result,coverage:{complete:false}};if(control.authorizedFieldMismatch&&result.event_people?.length)result.event_people[0].label='Filtered different accepted value';return result;}};
 const calendars=new Map([[clubId,new Map([['feedback123',{id:'feedback123',summary:'Feedback Circle',description:'Human notes <keep> & URL',location:'Bobst room204',status:'confirmed',etag:'"human"',created:taskStamp,updated:taskStamp,start:{dateTime:'2026-10-23T19:00:00+00:00',timeZone:'America/New_York'},end:{dateTime:'2026-10-23T21:00:00+00:00',timeZone:'America/New_York'}}]])],[memberId,new Map()]]);
 const env={AGENT_AUTOMATION_STAGED_ENABLED:'true',ASSISTANT_ALLOWED_SOURCE_IDS:[s,cs,ms].join(','),GOOGLE_CLIENT_ID:'fixture-client',GOOGLE_CLIENT_SECRET:'fixture-only',GOOGLE_REFRESH_TOKEN:'fixture-only',GOOGLE_EXPECTED_ACCOUNT_EMAIL:'club@example.test',GOOGLE_CALENDAR_ID:clubId,AGENT_CALENDAR_SOURCE_ID:cs,GOOGLE_MEMBER_PLANS_CALENDAR_ID:memberId,AGENT_MEMBER_PLANS_SOURCE_ID:ms,AGENT_MEMBER_PLANS_SIGNING_KEY:'synthetic-participation-test-key-32chars'};
 const googleHttp=async(value,options={})=>{const endpoint=new URL(value);if(endpoint.hostname==='gmail.googleapis.com')return Response.json({emailAddress:'club@example.test'});assert.equal(endpoint.origin,'https://www.googleapis.com');if(endpoint.pathname.includes('/calendarList/'))return Response.json({id:decodeURIComponent(endpoint.pathname.split('/calendarList/')[1]),accessRole:'owner'});const match=/\/calendars\/([^/]+)\/events(?:\/([^/]+))?$/.exec(endpoint.pathname);assert(match);const rows=calendars.get(decodeURIComponent(match[1]));assert(rows);if(options.method&&options.method!=='GET'){chronology.push({kind:'calendar_write',method:options.method});return Response.json({}, {status:503});}const eventId=match[2]&&decodeURIComponent(match[2]);return eventId?rows.has(eventId)?Response.json(rows.get(eventId)):Response.json({}, {status:404}):Response.json({items:[...rows.values()]});};
 const oauth={setCredentials(){},getAccessToken:async()=>({token:'fixture-only'}),getTokenInfo:async()=>({scopes:CALENDAR_REQUIRED_SCOPES})};
 const calendarConfig=readCalendarConfig(env),memberConfig=readMemberPlansConfig(env),calendarClient=createCalendarClient({config:calendarConfig,oauthClient:oauth,fetchImpl:googleHttp}),memberClient=createCalendarClient({config:memberConfig,oauthClient:oauth,fetchImpl:googleHttp});
 const liveService={readMessages:async args=>{if(control.revoked||control.originalUnavailable)return {status:control.revoked?'forbidden':'unavailable',sources:[]};const rows=originals().filter(row=>!args.messageId||row.messageId===args.messageId);if(control.changedAuthor)rows.forEach(row=>row.authorId='999');if(control.changedContent)rows.forEach(row=>row.content=row.excerpt='Newer different intent');return {status:'ready',coverage:{complete:true,textTruncated:false},sources:rows};}};
 const taskStore={configured:true,prune:async()=>({status:'ready'}),list:async()=>control.taskListUnavailable?{status:'unavailable',tasks:[]}:({status:'ready',tasks:clone([...tasks.values()])}),save:async({task,expectedUpdatedAt})=>{const prior=tasks.get(task.uuid);if(prior&&prior.updated_at!==expectedUpdatedAt)return {status:'conflict'};const row={...clone(task),created_at:prior?.created_at??taskStamp,updated_at:`2026-10-22T18:30:${String(++version).padStart(2,'0')}.000Z`,expires_at:prior?.expires_at??'2026-10-23T18:30:00Z'};tasks.set(task.uuid,row);return {status:'ready',task:clone(row)};},resolve:async({taskId,expectedUpdatedAt})=>{if(tasks.get(taskId)?.updated_at!==expectedUpdatedAt)return {status:'conflict'};tasks.delete(taskId);chronology.push({kind:'task_resolve',taskId});return {status:'ready'};}};
 const policy={guildId:'100',revision:1,paused:false,discoveryEnabled:true,excludedCategoryIds:[],excludedChannelIds:[]},channel={id:'200',guild_id:'100',type:0,parent_id:null},config=readAutomationConfig({AGENT_AUTOMATION_ENABLED:'true'});
 attachTaskReads(taskStore,tasks,{failed:method=>method==='catalogue'?control.taskListUnavailable:control.taskReadUnavailable});
 const adapters=createAutomationAdapters({env,config,now:()=>new Date(clock),fetchImpl:async value=>{network.push(String(value));throw Error('Unexpected production network');},dependencies:{calendarConfig,memberConfig,calendarClient,memberClient,googleConfig:{configured:false},googleClient:{configured:false},discordConfig:{configured:true,guildId:'100'},discordStore:{getPolicy:async()=>({status:'ready',policy:{...policy,paused:control.revoked}}),listSyncChannels:async()=>({status:'ready',channels:[{enabled:true,guildId:'100',channelId:'200',sourceId:s}]})},discordClient:{getGuildChannels:async()=>[channel],getChannel:async()=>channel},liveDiscordService:liveService,discordTools:createLiveRetrievalTools({service:liveService,guildId:'100'}),mapEventService:mapService,...(!omitRawStore?{mapEventStore:rawStore}:{}),mapSourceAuthorizer:authorize,taskStore,loadBuildings:async()=>buildings}});
 await adapters.resolveClaimSourceIds({principal:adapters.principal});
 await adapters.prepareBatch({principal:adapters.principal,inputs});
 const sync=createCalendarMapSync({targets:[{client:calendarClient,sourceId:cs,kind:'club'}],mapService,loadBuildings:async()=>buildings,authorizeParticipation:async()=>true,now:()=>new Date(clock)});assert.equal((await sync.sync({principal:adapters.principal,window:{timeMin:'2026-10-22T00:00:00Z',timeMax:'2026-10-24T00:00:00Z'}})).complete,true);
 const savedSnapshot=await mapService.read({principal:adapters.principal});
 const row=[...mapRows.values()][0],helper={person_id:ids[2],attendance_status:'going',presence_basis:'planned',label:'Human helper',source_id:s,source_url:'https://discord.com/channels/100/200/292',reported_at:'2026-10-22T18:03:00Z'};assert.equal((await mapService.upsert({principal:adapters.principal,event:Object.fromEntries(Object.entries(row.event).filter(([key,value])=>!['created_at','updated_at'].includes(key)&&value!==null)),buildings:row.buildings,people:[helper],expectedUpdatedAt:row.event.updated_at,readContext:mapReadContext(savedSnapshot)})).status,'applied');
 const pending=inputs.map((input,index)=>({uuid:randomUUID(),created_at:taskStamp,updated_at:taskStamp,expires_at:'2026-10-23T18:30:00Z',info:{version:1,sourceIds:[s],inputs:[clone(input)],references:[{sourceId:s,sourceUrl:`https://discord.com/channels/100/200/${native[index].id}`}],request:{summary:'Supported attendance '+native[index].author,operation:'participation',calendarKind:'club',calendarEventId:'feedback123',...(index<2?{personId:ids[index]}:{})},executionHistory:[]}}));pending.forEach(task=>tasks.set(task.uuid,clone(task)));
 const context={principal:adapters.principal,inputIds:inputs.map(input=>input.uuid)},execute=async(name,args,ids=context.inputIds)=>{const tool=adapters.tools.find(tool=>tool.name===name);assert(tool);const result=await tool.execute(args,{...context,inputIds:ids});history.push({kind:'tool_result',tool:name,arguments:clone(args),inputIds:[...ids],result:clone(result)});return result;};
 const prepare=async()=>{await adapters.prepareBatch({...context,inputs});await adapters.pipeline.beginCycle({leaseToken:token,inputs,getExecutionLog:()=>clone(history),recordExecution:row=>history.push(row)});};
 const followup=()=>adapters.pipeline.afterInitial({handledInputIds:context.inputIds,inputs,executionLog:clone(history)});
 const prime=async indexes=>{await prepare();await followup();for(const i of indexes){await execute('read_pending_task',{taskId:pending[i].uuid},[pending[i].uuid]);assert.equal((await execute('read_discord_messages',{channelId:'200',messageId:native[i].id,context:false},[pending[i].uuid])).status,'ready');assert.equal((await execute('lookup_map_person',{provider:'discord',providerUserId:native[i].author,sourceId:s,sourceUrl:`https://discord.com/channels/100/200/${native[i].id}`},[pending[i].uuid])).status,'ready');}await execute('read_map_events',{eventId:[...mapRows.keys()][0]},indexes.map(i=>pending[i].uuid));chronology.length=0;};
 const patch=(indexes=[0,1])=>({eventId:[...mapRows.keys()][0],expectedUpdatedAt:[...mapRows.values()][0].event.updated_at,changes:indexes.map(i=>({personId:ids[i],sourceUrl:`https://discord.com/channels/100/200/${native[i].id}`,attendanceStatus:'going',start:{anchor:i===0?'event_start':'event_end',offsetMinutes:i===0?0:-90},end:{anchor:i===0?'event_start':'event_end',offsetMinutes:i===0?60:0}}))});
 const run=async turns=>{let i=0;const modelErrors=[],requests=[],store={configured:true,claim:async()=>({status:'ready',leaseToken:token,inputs:clone(inputs)}),renew:async()=>({status:'ready'}),release:async()=>{},action:async({complete})=>({status:complete?'completed':'execute'}),finish:async()=>({status:'ready'})};const handler=createAutomationHandler({...adapters,config,store,now:()=>new Date(clock),provider:{toolTurn:async request=>{requests.push(request);try{assert(i<turns.length,'Unexpected scripted provider turn');const step=turns[i++];return typeof step==='function'?await step(request):step;}catch(error){modelErrors.push(error);throw error;}}}});const result=await handler.tick();if(modelErrors.length)throw modelErrors[0];return {result,requests};};
 chronology.length=0;return {adapters,context,inputs,native,pending,ids,source:s,clubSource:cs,rawStore,mapService,mapRows,tasks,control,chronology,observations,network,history,prepare,followup,prime,execute,patch,run,clone};
}

const participationCall=(name,id,args,taskIds)=>({id,name,arguments:{inputIds:taskIds,arguments:args}});

test('new participation tool: actual handler grouped update resolves both ready tasks and preserves blocked work',async()=>{
 const f=await participationFixture(),blocked=f.clone(f.pending[2]),before=f.clone([...f.mapRows.values()][0]),ids=f.pending.slice(0,2).map(task=>task.uuid);let receipt;
 const {result,requests}=await f.run([
  request=>{assert(!request.tools.some(t=>t.name==='patch_map_participation'));return turn({id:'initial_done',name:'finish_batch',arguments:{handledInputIds:f.inputs.map(i=>i.uuid)}});},
  request=>{assert(request.tools.some(t=>t.name==='patch_map_participation'));return turn(...ids.map((id,i)=>participationCall('read_pending_task','read_patch_task_'+i,{taskId:id},[id])));},
  turn(...ids.map((id,i)=>participationCall('read_discord_messages','read_patch_original_'+i,{channelId:'200',messageId:f.native[i].id,context:false},[id]))),
  turn(...ids.map((id,i)=>participationCall('lookup_map_person','lookup_patch_person_'+i,{provider:'discord',providerUserId:f.native[i].author,sourceId:f.source,sourceUrl:'https://discord.com/channels/100/200/'+f.native[i].id},[id]))),
  ()=>turn(participationCall('read_map_events','read_patch_map',{eventId:[...f.mapRows.keys()][0]},ids)),
  ()=>turn(participationCall('patch_map_participation','apply_grouped_patch',f.patch(),ids)),
  request=>{const outcomes=request.messages.filter(m=>m.role==='tool').map(m=>JSON.parse(m.content));receipt=outcomes.find(row=>row.status==='ready'&&row.sourceStatus==='applied'&&row.receiptId);assert(receipt,'Real adapter mints an applied receipt');assert.deepEqual(new Set(receipt.taskIds),new Set(ids));return turn(...ids.map((id,i)=>participationCall('resolve_pending_task','resolve_patch_'+i,{taskId:id,outcome:'completed'},[id])));},
  turn({id:'final_done',name:'finish_batch',arguments:{handledInputIds:[]}}),
 ]);
 assert.equal(result.status,'completed');assert.equal(result.followupStatus,'completed');assert.equal(result.handled,3);assert.equal(result.remaining,0);assert.equal(requests.length,8);assert.equal(f.tasks.size,1);assert.deepEqual(f.tasks.get(blocked.uuid),blocked);assert.equal(f.chronology.filter(x=>x.kind==='map_write').length,1);assert.equal(f.chronology.filter(x=>x.kind==='calendar_write').length,0);assert.equal(f.network.length,0);assert(f.observations.length>0);
 const after=[...f.mapRows.values()][0];assert.deepEqual(after.buildings,before.buildings);assert.deepEqual(after.people.find(p=>p.person_id===f.ids[2]),before.people[0]);assert.equal(after.event.url,before.event.url);assert.equal(after.event.notes,before.event.notes);assert.equal(after.people.find(p=>p.person_id===f.ids[0]).ends_at,'2026-10-23T20:00:00.000Z');assert.equal(after.people.find(p=>p.person_id===f.ids[1]).starts_at,'2026-10-23T19:30:00.000Z');
});

for(const scenario of ['unread task','no identity receipt','wrong author','revoked source','wrong person','wrong source URL','wrong provider target','invalid helper'])test('new participation tool: denies '+scenario+' without business writes or raw disclosure',async()=>{
 const f=await participationFixture(),task=f.pending[0];
 if(scenario==='wrong provider target')f.tasks.get(task.uuid).info.request.calendarEventId=[...f.mapRows.keys()][0];
 if(scenario==='wrong author')f.control.changedAuthor=true;
 if(scenario==='invalid helper')[...f.mapRows.values()][0].people[0].label={private:'RAW_SECRET'};
 await f.prepare();await f.followup();
 if(scenario==='revoked source'){f.control.revoked=true;assert.equal(await f.adapters.authorizeEvent({event:f.inputs[0].raw_response,principal:f.context.principal}),false);assert.equal(f.chronology.filter(row=>row.kind==='map_attempt'||row.kind==='calendar_write').length,0);return;}
 if(scenario!=='unread task')await f.execute('read_pending_task',{taskId:task.uuid},[task.uuid]);
 if(scenario!=='no observed original')await f.execute('read_discord_messages',{channelId:'200',messageId:'300',context:false},[task.uuid]);
 if(scenario!=='no identity receipt')await f.execute('lookup_map_person',{provider:'discord',providerUserId:'400',sourceId:f.source,sourceUrl:'https://discord.com/channels/100/200/300'},[task.uuid]);
 await f.execute('read_map_events',{eventId:[...f.mapRows.keys()][0]},[task.uuid]);f.chronology.length=0;
 const args=f.patch([0]);if(scenario==='wrong person')args.changes[0].personId=randomUUID();if(scenario==='wrong source URL')args.changes[0].sourceUrl='https://discord.com/channels/100/200/999';
 const before=f.clone([...f.mapRows.values()]),result=await f.execute('patch_map_participation',args,[task.uuid]);
 assert.notEqual(result.status,'ready');assert(!result.receiptId);assert.equal(f.chronology.filter(x=>x.kind==='map_attempt'||x.kind==='calendar_write').length,0);assert.deepEqual([...f.mapRows.values()],before);
 assert(!JSON.stringify(result).includes('RAW_SECRET'));assert(!JSON.stringify(result).includes(f.ids[2]));assert.equal(f.network.length,0);
});

test('new participation tool reuses explicitly observed state through unrelated service outages and final task CAS rejects a newer version',async()=>{
 const f=await participationFixture({omitRawStore:true});await f.prime([0]);const task=f.pending[0],before=f.clone([...f.mapRows.values()][0]);
 f.control.originalUnavailable=true;f.control.taskListUnavailable=true;
 const result=await f.execute('patch_map_participation',f.patch([0]),[task.uuid]);assert.equal(result.status,'ready');assert(result.receiptId);
 assert.equal(f.chronology.filter(row=>row.kind==='map_write').length,1);assert.equal(f.chronology.filter(row=>row.kind==='calendar_write').length,0);assert.equal(f.network.length,0);
 assert.deepEqual([...f.mapRows.values()][0].people.find(row=>row.person_id===f.ids[2]),before.people[0]);
 f.tasks.get(task.uuid).updated_at='2026-10-22T18:31:00Z';
 assert.equal((await f.execute('resolve_pending_task',{taskId:task.uuid,outcome:'completed'},[task.uuid])).status,'conflict');assert(f.tasks.has(task.uuid));
});

test('new participation tool: optimistic human revision conflict never refreshes the token or overwrites notes',async()=>{
 const f=await participationFixture();await f.prime([0]);const args=f.patch([0]);f.control.humanConflict=true;const result=await f.execute('patch_map_participation',args,[f.pending[0].uuid]);assert.equal(result.status,'conflict');assert(!result.receiptId);assert.equal(f.chronology.filter(x=>x.kind==='map_attempt').length,1);assert.equal(f.chronology.filter(x=>x.kind==='map_write').length,0);const current=[...f.mapRows.values()][0];assert.equal(current.event.notes,'Newer human notes');assert.equal(current.event.updated_at,'2026-10-22T18:31:00.000Z');assert.equal((await f.execute('resolve_pending_task',{taskId:f.pending[0].uuid,outcome:'completed'},[f.pending[0].uuid])).status,'invalid_request');assert(f.tasks.has(f.pending[0].uuid));
});

for(const representation of ['inherit to anchors','anchors to inherit'])test('new participation tool: effective full-window no-op '+representation+' makes no write or proof',async()=>{
 const f=await participationFixture(),row=[...f.mapRows.values()][0],actor={person_id:f.ids[0],attendance_status:'going',presence_basis:'planned',label:'',source_id:f.source,source_url:'https://discord.com/channels/100/200/291',reported_at:'2026-10-22T18:02:00Z',starts_at:representation==='inherit to anchors'?null:row.event.starts_at,ends_at:representation==='inherit to anchors'?null:row.event.ends_at};row.people.push(actor);await f.prime([0]);const before=f.clone([...f.mapRows.values()]),args=f.patch([0]);args.changes[0].start=representation==='inherit to anchors'?{anchor:'event_start',offsetMinutes:0}:{inherit:true};args.changes[0].end=representation==='inherit to anchors'?{anchor:'event_end',offsetMinutes:0}:{inherit:true};const result=await f.execute('patch_map_participation',args,[f.pending[0].uuid]);assert.equal(result.status,'ready');assert.equal(result.outcome,'no_change_needed');assert.equal(result.reason,'already_correct');assert.equal(result.changed,false);assert.notEqual(result.sourceStatus,'applied');assert(!result.receiptId);assert.equal(f.chronology.filter(x=>x.kind==='map_attempt').length,0);assert.deepEqual([...f.mapRows.values()],before);assert.equal((await f.execute('resolve_pending_task',{taskId:f.pending[0].uuid,outcome:'completed'},[f.pending[0].uuid])).status,'invalid_request');assert(f.tasks.has(f.pending[0].uuid));
});

for(const scenario of ['duplicate person','mixed endpoint','outside event','inverted window','foreign task','aborted'])test('new participation tool: invalid patch '+scenario+' leaves source-owned activity untouched',async()=>{
 const f=await participationFixture();await f.prime([0]);const args=f.patch([0]);let ids=[f.pending[0].uuid];if(scenario==='duplicate person')args.changes.push(f.clone(args.changes[0]));if(scenario==='mixed endpoint')args.changes[0].start={at:'2026-10-23T19:00:00Z',inherit:true};if(scenario==='outside event')args.changes[0].start={anchor:'event_start',offsetMinutes:-1};if(scenario==='inverted window')args.changes[0].start={anchor:'event_end',offsetMinutes:0};if(scenario==='foreign task')ids=[randomUUID()];const before=f.clone([...f.mapRows.values()]);let result;if(scenario==='aborted'){const controller=new AbortController();controller.abort();result=await f.adapters.tools.find(t=>t.name==='patch_map_participation').execute(args,{...f.context,inputIds:ids,signal:controller.signal});}else result=await f.execute('patch_map_participation',args,ids);assert.notEqual(result.status,'ready');assert(!result.receiptId);assert.equal(f.chronology.filter(x=>x.kind==='map_attempt'||x.kind==='calendar_write').length,0);assert.deepEqual([...f.mapRows.values()],before);
});

test('new participation tool: forged and prior-cycle receipts cannot resolve unfinished tasks',async()=>{
 const f=await participationFixture();await f.prime([0]);const task=f.pending[0],args=f.patch([0]);f.history.push({kind:'tool_result',tool:'patch_map_participation',inputIds:[task.uuid],arguments:args,result:{status:'ready',sourceStatus:'applied',receiptId:randomUUID(),eventId:args.eventId,changedPersonIds:[f.ids[0]],taskIds:[task.uuid]}});assert.equal((await f.execute('resolve_pending_task',{taskId:task.uuid,outcome:'completed'},[task.uuid])).status,'invalid_request');const result=await f.execute('patch_map_participation',args,[task.uuid]);assert.equal(result.status,'ready');assert.deepEqual(Object.keys(result).sort(),['changedPersonIds','eventId','receiptId','sourceStatus','status','taskIds','updatedAt'].sort());await f.prime([0]);assert.equal((await f.execute('resolve_pending_task',{taskId:task.uuid,outcome:'completed'},[task.uuid])).status,'invalid_request','Old internal receipt does not survive beginCycle');assert(f.tasks.has(task.uuid));
});

for(const variant of ['same author edit','conflicting author','conflicting source','deleted retained copy'])test('new participation tool: retained original revisions '+variant,async()=>{
 const f=await participationFixture(),task=f.tasks.get(f.pending[0].uuid),created=f.clone(task.info.inputs[0]),edited=f.clone(created);created.raw_response.payload.content='Earlier body is historical';edited.uuid=randomUUID();edited.raw_response.event_type='message_updated';edited.raw_response.revision='2';edited.raw_response.payload.edited_timestamp='2026-10-22T18:20:00.000Z';if(variant==='conflicting author')edited.raw_response.payload.author.id='999';if(variant==='conflicting source'){edited.raw_response.source_id=f.clubSource;task.info.sourceIds.push(f.clubSource);}if(variant==='deleted retained copy')edited.raw_response.event_type='message_deleted';task.info.inputs=[created,edited];await f.prime([0]);const result=await f.execute('patch_map_participation',f.patch([0]),[task.uuid]);if(variant==='same author edit'){assert.equal(result.status,'ready');assert.equal(result.sourceStatus,'applied');assert.equal(f.chronology.filter(x=>x.kind==='map_write').length,1);}else{assert.notEqual(result.status,'ready');assert.equal(f.chronology.filter(x=>x.kind==='map_attempt').length,0);assert(!result.receiptId);}
});

test('new participation tool: withdrawal retains declined row with current own original and exact unrelated fields',async()=>{
 const f=await participationFixture(),row=[...f.mapRows.values()][0];row.people.push({person_id:f.ids[0],attendance_status:'going',presence_basis:'planned',label:'Human own label',starts_at:null,ends_at:null,source_id:f.source,source_url:'https://discord.com/channels/100/200/291',reported_at:'2026-10-22T18:02:00Z'});f.native[0].content="I can't attend after all.";await f.prime([0]);const before=f.clone(row),args=f.patch([0]);args.changes=[{personId:f.ids[0],sourceUrl:'https://discord.com/channels/100/200/300',attendanceStatus:'declined'}];const result=await f.execute('patch_map_participation',args,[f.pending[0].uuid]);assert.equal(result.status,'ready');const after=[...f.mapRows.values()][0],own=after.people.find(p=>p.person_id===f.ids[0]);assert.equal(after.people.length,2);assert.equal(own.attendance_status,'declined');assert.equal(own.label,'Human own label');assert.equal(own.source_url,'https://discord.com/channels/100/200/300');assert.equal(own.reported_at,'2026-10-22T18:20:00.000Z');assert.deepEqual(after.people.find(p=>p.person_id===f.ids[2]),before.people[0]);assert.deepEqual(after.buildings,before.buildings);assert.equal(after.event.url,before.event.url);assert.equal(after.event.notes,before.event.notes);assert.equal(f.chronology.filter(x=>x.kind==='map_write').length,1);assert.equal((await f.execute('resolve_pending_task',{taskId:f.pending[0].uuid,outcome:'completed'},[f.pending[0].uuid])).status,'ready');assert(!f.tasks.has(f.pending[0].uuid));
});

for(const scenario of ['failed write','unchanged backend','new task version'])test('new participation tool: completion proof rejects '+scenario,async()=>{
 const f=await participationFixture();await f.prime([0]);const task=f.pending[0];if(scenario==='failed write')f.control.writeStatus='conflict';if(scenario==='unchanged backend')f.control.writeStatus='unchanged';const result=await f.execute('patch_map_participation',f.patch([0]),[task.uuid]);if(['failed write','unchanged backend'].includes(scenario)){assert.notEqual(result.status,'ready');assert(!result.receiptId);}else assert.equal(result.status,'ready');if(scenario==='new task version')f.tasks.get(task.uuid).updated_at='2026-10-22T18:21:00Z';if(scenario==='revoked readback')f.control.revoked=true;assert.notEqual((await f.execute('resolve_pending_task',{taskId:task.uuid,outcome:'completed'},[task.uuid])).status,'ready');assert(f.tasks.has(task.uuid));assert.equal(f.chronology.filter(x=>x.kind==='task_resolve').length,0);
});

test('new participation tool returns applied proof without a hidden readback, then separately reports a later observation',async()=>{
 const f=await participationFixture();await f.prime([0]);const task=f.pending[0];f.control.partialAfterWrite=true;
 const result=await f.execute('patch_map_participation',f.patch([0]),[task.uuid]);assert.equal(result.status,'ready');assert(result.receiptId);assert.equal(f.chronology.filter(row=>row.kind==='map_write').length,1);
 const observed=await f.execute('read_map_events',{eventId:result.eventId},[task.uuid]);assert.equal(observed.coverage.complete,false);
 assert(f.tasks.has(task.uuid),'An uncertain later observation is left for the model to interpret; no implicit resolution');assert.equal(f.chronology.filter(row=>row.kind==='task_resolve').length,0);
});

test('new participation tool requires a complete explicit read when authorized fields differ from the private snapshot',async()=>{
 const f=await participationFixture();f.control.authorizedFieldMismatch=true;await f.prime([0]);const before=f.clone([...f.mapRows.values()]);
 const result=await f.execute('patch_map_participation',f.patch([0]),[f.pending[0].uuid]);assert.notEqual(result.status,'ready');assert(!result.receiptId);assert.equal(f.chronology.filter(row=>row.kind==='map_attempt').length,0);assert.deepEqual([...f.mapRows.values()],before);assert(!JSON.stringify(result).includes('Human helper'));
});

for(const scenario of ['unread task','missing target fields','wrong selected task','wrong operation','original input used as task'])test('participation readiness feedback: '+scenario+' is fixed, private and cannot write or prove completion',async()=>{
 const f=await participationFixture(),task=f.pending[0],before=f.clone([...f.mapRows.values()]);
 if(scenario==='missing target fields'){delete f.tasks.get(task.uuid).info.request.calendarEventId;delete f.tasks.get(task.uuid).info.request.personId;}
 if(scenario==='wrong operation')f.tasks.get(task.uuid).info.request.operation='source_review';
 if(scenario==='unread task'){await f.prepare();await f.followup();await f.execute('read_map_events',{eventId:[...f.mapRows.keys()][0]},[task.uuid]);f.chronology.length=0;}else await f.prime(scenario==='wrong selected task'?[0,1]:[0]);
 const ids=scenario==='wrong selected task'?[f.pending[1].uuid]:scenario==='original input used as task'?[f.inputs[0].uuid]:[task.uuid];
 const result=await f.execute('patch_map_participation',f.patch([0]),ids);assert.deepEqual(result,{status:'invalid_request',reason:'participation_task_not_ready'});
 assert.equal(f.chronology.filter(row=>row.kind==='map_attempt'||row.kind==='calendar_write').length,0);assert.deepEqual([...f.mapRows.values()],before);assert(!result.receiptId);
 assert.notEqual((await f.execute('resolve_pending_task',{taskId:task.uuid,outcome:'completed'},[task.uuid])).status,'ready');assert(f.tasks.has(task.uuid));assert.equal(f.chronology.filter(row=>row.kind==='task_resolve').length,0);assert.equal(f.network.length,0);
});

for(const condition of ['revoked','originalUnavailable'])test('participation readiness feedback: fully ready task '+condition+' remains a source denial',async()=>{
 const f=await participationFixture();await f.prepare();await f.followup();f.control[condition]=true;if(condition==='revoked'){assert.equal(await f.adapters.authorizeEvent({event:f.inputs[0].raw_response,principal:f.context.principal}),false);assert.equal(f.chronology.filter(row=>row.kind==='map_attempt'||row.kind==='calendar_write').length,0);return;}const task=f.pending[0];await f.execute('read_pending_task',{taskId:task.uuid},[task.uuid]);await f.execute('read_discord_messages',{channelId:'200',messageId:'300',context:false},[task.uuid]);await f.execute('lookup_map_person',{provider:'discord',providerUserId:'400',sourceId:f.source,sourceUrl:'https://discord.com/channels/100/200/300'},[task.uuid]);await f.execute('read_map_events',{eventId:[...f.mapRows.keys()][0]},[task.uuid]);const before=f.clone([...f.mapRows.values()]);f.chronology.length=0;
 const result=await f.execute('patch_map_participation',f.patch([0]),[f.pending[0].uuid]);assert.deepEqual(result,{status:'forbidden_source'});assert(!result.receiptId);assert.equal(f.chronology.filter(row=>row.kind==='map_attempt'||row.kind==='calendar_write').length,0);assert.deepEqual([...f.mapRows.values()],before);
});

test('participation readiness feedback survives the actual handler without identifiers or proposed values',async()=>{
 const f=await participationFixture(),id=f.pending[0].uuid;
 const {result}=await f.run([
  turn({id:'finish_readiness_initial',name:'finish_batch',arguments:{handledInputIds:f.inputs.map(row=>row.uuid)}}),
  ()=>turn(participationCall('patch_map_participation','unread_patch_feedback',f.patch([0]),[id])),
  request=>{const feedback=JSON.parse(request.messages.at(-1).content);assert.equal(feedback.status,'tool_error');assert.equal(feedback.reason,'participation_task_not_ready');assert.equal(feedback.requiredTaskReads.length,1);assert(!JSON.stringify(feedback).includes('Human helper'));assert(!JSON.stringify(feedback).includes(f.ids[2]));return turn(...f.pending.slice(0,2).map((task,i)=>participationCall('read_pending_task','read_blocked_'+i,{taskId:task.uuid},[task.uuid])));},
 ()=>{f.control.originalUnavailable=true;return turn(...f.pending.slice(0,2).map((task,i)=>participationCall('read_discord_messages','blocked_source_'+i,{channelId:'200',messageId:f.native[i].id,context:false},[task.uuid])));},
 turn({id:'finish_readiness_final',name:'finish_batch',arguments:{handledInputIds:[]}}),
 ]);
 assert.equal(result.status,'completed');assert.equal(result.followupStatus,'completed');assert.equal(f.tasks.size,3);assert.equal(f.chronology.filter(row=>row.kind==='map_attempt'||row.kind==='calendar_write'||row.kind==='task_resolve').length,0);assert.equal(f.network.length,0);
});

test('worker Calendar and Member Plans list/read add derived local display without changing raw provider results',async()=>{
 const f=fixture(),opaque='https://calendar.google.com/calendar/event?eid=Opaque_-Ab%3D%3D&ctz=America%2FNew_York';
 for(const [calendarId,eventId] of [[clubId,'displayclub123'],[memberId,'displaymember123']])f.calendarEvents.get(calendarId).set(eventId,{id:eventId,summary:'Human event title',description:'Human notes stay exact',location:'Bobst',status:'confirmed',etag:'"human"',htmlLink:opaque,created:stamp,updated:stamp,start:{dateTime:'2026-11-01T05:30:00.123Z',timeZone:'America/New_York'},end:{dateTime:'2026-11-01T06:30:00.123Z',timeZone:'America/New_York'}});
 await f.prepare();
 for(const [listTool,readTool,client,calendarId,eventId] of [['list_calendar_events','read_calendar_event',f.calendarClient,clubId,'displayclub123'],['list_member_plans','read_member_plan',f.memberClient,memberId,'displaymember123']]){
  const window={timeMin:'2026-11-01T00:00:00Z',timeMax:'2026-11-02T00:00:00Z'},principal={...f.context.principal,calendarId};
  const directList=await client.listEventsWindow({...window,principal}),workerList=await f.execute(listTool,{...window,...(listTool==='list_calendar_events'?{resultMode:'full'}:{})});
  assert.equal(workerList.status,'ready');assert.equal(workerList.events.length,1);assert(!directList.events[0].localTimeDisplay,'Shared Calendar client remains raw; display belongs to worker adapter only');
  const remove=result=>({status:result.status,coverage:result.coverage,events:result.events.map(({localTimeDisplay,...row})=>row)});assert.deepEqual(remove(workerList),remove(directList));
  const directRead=await client.readEvent({principal,eventId}),workerRead=await f.execute(readTool,{eventId});assert.deepEqual(remove(workerRead),remove(directRead));
  for(const result of [workerList,workerRead]){const row=result.events[0],hint=row.localTimeDisplay;assert.equal(hint.basis,'derived_display_only');assert.equal(hint.start.dateTime,'2026-11-01T01:30:00.123-04:00');assert.equal(hint.end.dateTime,'2026-11-01T01:30:00.123-05:00');assert.equal(row.url,directRead.events[0].url);assert.equal(row.start.dateTime,directRead.events[0].start.dateTime);assert.equal(row.end.dateTime,directRead.events[0].end.dateTime);}
 }
 assert.equal(f.chronology.filter(row=>row.kind==='calendar_write'||row.kind==='map_write').length,0);
});
