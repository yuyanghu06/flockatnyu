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
import {createMapEventStore} from '../server/map/events.js';

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
  const chronology=[],calendarEvents=new Map([[clubId,new Map()],[memberId,new Map()]]),mapRows=new Map(),tasks=new Map(pending.map(row=>[row.uuid,structuredClone(row)])),modelRequests=[],lookups=[],modelErrors=[];
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
  const config=readAutomationConfig({AGENT_AUTOMATION_ENABLED:'true'});
  const adapters=adapterFactory({env,config,now:()=>new Date('2026-10-22T18:30:00Z'),fetchImpl:async()=>{throw Error('Unexpected runtime HTTP');},dependencies:{
    googleConfig:{configured:gmail},googleClient:{configured:gmail,readGmail:async({messageId})=>({status:revoked?'forbidden':'ready',sources:revoked?[]:[{kind:'gmail',externalId:messageId,url:`https://mail.google.com/mail/u/0/#all/${messageId}`,from:'Organizer <host@example.test>',title:'Study plan',date:stamp,excerpt:currentInput.raw_response.payload.content,contentStatus:'text_only_bounded'}]})},calendarConfig,memberConfig,calendarClient,memberClient,
    discordConfig:{configured:true,guildId:'100'},discordStore:{getPolicy:async()=>({status:'ready',policy:{...policy,paused:revoked}}),listSyncChannels:async()=>({status:'ready',channels:[{enabled:true,guildId:'100',channelId:'200',sourceId:source}]})},discordClient:{getGuildChannels:async()=>[channel],getChannel:async()=>channel},
    liveDiscordService,discordTools:{tools:[{name:'read_discord_messages',description:'Read current original',readOnly:true,parameters:{type:'object',properties:{},additionalProperties:false}}],execute:async()=>{chronology.push({kind:'discord_tool'});return {status:originalUnavailable?'unavailable':'ready',coverage:{complete:!originalUnavailable,textTruncated:false},sources:originalUnavailable?[]:[liveSource()]};}},
    mapEventService,mapSourceAuthorizer:async()=>!revoked,taskStore,loadBuildings:async()=>[{id:'bobst-library',name:'Bobst Library',aliases:['Bobst','70 Washington Square South']}],
  }});
  const context={principal:adapters.principal,inputIds:[currentInput.uuid]};
  const store={configured:true,claim:async()=>({status:'ready',leaseToken:lease,inputs:[currentInput]}),renew:async()=>({status:'ready'}),release:async()=>{},fail:async()=>{},action:async({complete})=>({status:complete?'completed':'execute'}),finish:async()=>{finished=true;return {status:'ready'};}};
  return {adapters,context,calendarEvents,calendarControl,mapRows,tasks,chronology,lookups,modelRequests,calendarClient,memberClient,config,revoke:()=>{revoked=true;},setCurrentSpeaker:id=>{liveAuthorId=id;},finished:()=>finished,
    prepare:async()=>{await adapters.prepareBatch({...context,inputs:[currentInput]});await adapters.pipeline.beginCycle({leaseToken:lease,inputs:[currentInput],getExecutionLog:()=>[],recordExecution:async()=>{}});},
    execute:(name,args,ids=context.inputIds)=>{const tool=adapters.tools.find(tool=>tool.name===name);assert(tool,`Tool ${name} exists`);return tool.execute(args,{...context,inputIds:ids});},
    run:async turns=>{let i=0;const handler=createAutomationHandler({...adapters,config,store,now:()=>new Date('2026-10-22T18:30:00Z'),provider:{toolTurn:async request=>{modelRequests.push(request);chronology.push({kind:'model'});try{const response=turns[i++];assert(response,`Unexpected model call ${i}`);return typeof response==='function'?response(request):response;}catch(error){modelErrors.push(error);throw error;}}}});const result=await handler.tick();if(modelErrors.length)throw modelErrors[0];return result;},
  };
}

const lookup={provider:'discord',providerUserId:'400',sourceId:source,sourceUrl:url};
const plan={sourceKey:'discord:100:200:300',sourceUrl:url,sourceId:source,personId,title:'Studying',location:'Bobst',activityKind:'presence',typeId:'study',label:'Studying'};

test('actual bundled handler writes presence to Member Plans first, API projects person/building, final phase sees actual results under same lease',async()=>{
  const untouched=pendingTask(),f=fixture({pending:[untouched]});assert.deepEqual(await f.adapters.resolveClaimSourceIds({principal:f.context.principal}),[source]);const result=await f.run([
    request=>{assert(!request.tools.some(tool=>tool.name==='upsert_map_event'));assert(request.tools.some(tool=>tool.name==='upsert_member_plan'));return turn(call('read_discord_messages','read'),call('lookup_map_person','lookup',lookup),call('upsert_member_plan','plan',plan));},
    turn(call('finish_batch','initial',[inputId])),
    request=>{
      assert(request.tools.some(tool=>tool.name==='upsert_member_plan'));assert(request.tools.some(tool=>tool.name==='upsert_map_event'));
      const followup=JSON.parse(request.messages.at(-1).content);assert.equal(followup.stage,'followup');assert.equal(followup.context.apiResults.complete,true);
      assert(followup.context.apiResults.results.some(row=>row.sourceId===memberSource&&row.mapEventId));
      assert(followup.context.executionHistory.history.some(row=>row.kind==='tool_result'&&row.tool==='upsert_member_plan'&&row.result.status==='ready'));
      assert(followup.context.executionHistory.history.some(row=>row.kind==='api_result'&&row.result.sourceId===memberSource));return turn(call('finish_batch','final',[]));
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
  f.revoke();assert.equal((await f.execute('upsert_member_plan',plan)).status,'forbidden_source');assert.equal(f.calendarEvents.get(memberId).size,0);
});

test('full cached context can bind original speaker/source through task UUID without treating task UUID as source authority',async()=>{
  const task=pendingTask(),current=input();current.uuid=randomUUID();current.raw_response.payload.author.id='500';current.raw_response.payload.id='301';current.raw_response.event_id='301';current.raw_response.payload.content='Other queued work';
  const f=fixture({pending:[task],currentInput:current});await f.prepare();const next=await f.adapters.pipeline.afterInitial({handledInputIds:[current.uuid],inputs:[current],executionLog:[]});assert(next.inputIds.includes(task.uuid));
  assert.equal((await f.execute('lookup_map_person',lookup,[task.uuid])).status,'forbidden_source');assert.equal(f.lookups.length,0);
  const read=await f.execute('read_pending_task',{taskId:task.uuid},[task.uuid]);assert.equal(read.status,'ready');assert.deepEqual(read.task.info.batchContext,task.info.batchContext);
  assert.equal((await f.execute('lookup_map_person',lookup,[task.uuid])).status,'ready');assert.equal((await f.execute('lookup_map_person',{...lookup,providerUserId:task.uuid},[task.uuid])).status,'forbidden_source');
  assert.equal(f.lookups.at(-1).providerUserId,'400');f.revoke();assert.equal((await f.execute('read_pending_task',{taskId:task.uuid},[task.uuid])).status,'ready');assert.equal((await f.execute('lookup_map_person',lookup,[task.uuid])).status,'forbidden_source');await f.adapters.resolveClaimSourceIds({principal:f.context.principal});assert.equal((await f.execute('read_pending_task',{taskId:task.uuid},[task.uuid])).status,'forbidden');assert(f.tasks.has(task.uuid));
});

test('actual final agent reads cached RSVP, refreshes linked speaker, updates the API-created occurrence, then resolves exact task',async()=>{
  const task=pendingTask();task.info.inputs[0].raw_response.payload.content="I'm going to Friday's workshop at Bobst";const current=structuredClone(task.info.inputs[0]);
  const f=fixture({pending:[task],currentInput:current});f.calendarEvents.get(clubId).set('workshop123',{id:'workshop123',summary:'Friday workshop',location:'Bobst',description:'Club workshop',status:'confirmed',etag:'"human"',created:stamp,updated:stamp,start:{dateTime:'2026-10-23T18:00:00.000Z',timeZone:'America/New_York'},end:{dateTime:'2026-10-23T20:00:00.000Z',timeZone:'America/New_York'}});
  const result=await f.run([
    turn(call('finish_batch','initial',[inputId])),
    turn(call('read_pending_task','read_task',{taskId:task.uuid},[task.uuid])),
    turn(call('read_discord_messages','refresh',{},[task.uuid]),call('lookup_map_person','lookup',lookup,[task.uuid])),
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
  const task=pendingTask(),untouched=pendingTask(),f=fixture({pending:[task,untouched],mapWriteFailureAfter:1});
  f.calendarEvents.get(clubId).set('workshop123',{id:'workshop123',summary:'Friday workshop',location:'Bobst',status:'confirmed',etag:'"human"',created:stamp,updated:stamp,start:{dateTime:'2026-10-23T18:00:00.000Z',timeZone:'America/New_York'},end:{dateTime:'2026-10-23T20:00:00.000Z',timeZone:'America/New_York'}});
  const result=await f.run([turn(call('finish_batch','initial',[inputId])),turn(call('read_pending_task','read_task',{taskId:task.uuid},[task.uuid])),turn(call('lookup_map_person','lookup',lookup,[task.uuid])),()=>{
    const map=[...f.mapRows.values()][0],{updated_at,...stored}=map.event,event=Object.fromEntries(Object.entries(stored).filter(([,value])=>value!==null));
    return turn(call('upsert_map_event','conflicted',{event,expectedUpdatedAt:updated_at,buildings:map.buildings,people:[{person_id:personId,attendance_status:'going',presence_basis:'planned',label:'',source_id:source,source_url:url,reported_at:stamp}]},[task.uuid]));
  },request=>{const error=JSON.parse(request.messages.at(-1).content);assert.equal(error.status,'tool_error');assert.equal(error.reason,'conflict');return turn(call('finish_batch','final',[]));}]);
  assert.equal(result.status,'completed');assert.equal(result.followupStatus,'completed');assert.equal(f.tasks.size,2);assert.deepEqual(f.tasks.get(untouched.uuid),untouched);assert.deepEqual(f.tasks.get(task.uuid).info.inputs,task.info.inputs);
  assert(f.tasks.get(task.uuid).info.executionHistory.some(row=>row.kind==='tool_result'&&row.tool==='upsert_map_event'&&row.result.status==='tool_error'&&row.result.reason==='conflict'));assert.equal([...f.mapRows.values()][0].people.length,0);
});

test('actual successful empty task manifest skips an unnecessary final model phase',async()=>{
  const f=fixture(),result=await f.run([turn(call('finish_batch','initial',[inputId]))]);assert.equal(result.status,'completed');assert.equal(result.followupStatus,'not_needed');assert.equal(f.modelRequests.length,1);assert.equal(f.tasks.size,0);
});

test('cached initial interpretation can finish a Member Plans write in final phase and immediately receive deterministic projection results',async()=>{
  const task=pendingTask();task.info.request={summary:'Original personal plan still needs interpreting',operation:'source_review'};const f=fixture({pending:[task]});
  const result=await f.run([
    turn(call('finish_batch','initial',[inputId])),turn(call('read_pending_task','read_task',{taskId:task.uuid},[task.uuid])),
    turn(call('read_discord_messages','refresh',{},[task.uuid]),call('lookup_map_person','lookup',lookup,[task.uuid])),
    turn(call('upsert_member_plan','member',plan,[task.uuid])),
    request=>{
      const result=JSON.parse(request.messages.at(-1).content);assert.equal(result.status,'ready');assert.equal(result.followupSync.sourceStatus,'ready');assert(result.followupSync.results.some(row=>row.sourceId===memberSource&&row.mapEventId));
      assert.equal(f.mapRows.size,1);assert.equal([...f.mapRows.values()][0].people[0].person_id,personId);return turn(call('resolve_pending_task','resolve',{taskId:task.uuid,outcome:'completed'},[task.uuid]));
    },turn(call('finish_batch','final',[])),
  ]);
  assert.equal(result.status,'completed',JSON.stringify({result,requests:f.modelRequests.length,chronology:f.chronology}));assert.equal(f.tasks.size,0);assert.equal(f.calendarEvents.get(memberId).size,1);assert.equal(f.mapRows.size,1);
});

test('map source authorizer reads both pinned calendars with exact instance binding and no cross-calendar substitution',async()=>{
  const reads=[],eventId='shared_event_id';const clients=[clubId,memberId].map(calendarId=>({configured:true,calendarId,readEvent:async args=>{reads.push({calendarId,args});return {status:'ready',events:[{eventId,url:`https://calendar.google.com/calendar/event?eid=${Buffer.from(`${eventId} ${calendarId}`).toString('base64url')}`}]};}}));
  const authorize=createMapSourceAuthorizer({calendarClient:clients[0],calendarSourceId:clubSource,calendarTargets:[{client:clients[1],sourceId:memberSource}]});
  const principal={id:'web',allowedSourceIds:[clubSource,memberSource],calendarAccess:true,calendarId:clubId,calendarTargets:[{sourceId:memberSource,calendarId:memberId}]};
  const memberUrl=`https://calendar.google.com/calendar/event?eid=${Buffer.from(`${eventId} ${memberId}`).toString('base64url')}`,clubUrl=`https://calendar.google.com/calendar/event?eid=${Buffer.from(`${eventId} ${clubId}`).toString('base64url')}`;
  assert.equal(await authorize({principal,sourceId:memberSource,sourceUrl:memberUrl}),true);assert.equal(reads[0].calendarId,memberId);assert.equal(reads[0].args.eventId,eventId);
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
  const summary='🙂'.repeat(2000),longId='a'.repeat(1024),pending=Array.from({length:200},()=>{const row=pendingTask();row.info.request.summary=summary;row.info.request.calendarEventId=longId;return row;}),f=fixture({pending});
  const messageBytes=[];
  const selected=pending[199],result=await f.run([
    turn(call('finish_batch','initial',[inputId])),
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
  const task=pendingTask(),f=fixture({pending:[task]});f.calendarEvents.get(clubId).set('workshop123',{id:'workshop123',summary:'Workshop',description:'Provider description',location:'Bobst',status:'confirmed',etag:'"human"',created:stamp,updated:stamp,start:{dateTime:'2026-10-23T18:00:00.000Z',timeZone:'America/New_York'},end:{dateTime:'2026-10-23T20:00:00.000Z',timeZone:'America/New_York'}});
  let originalNotes;const result=await f.run([turn(call('finish_batch','initial',[inputId])),()=>{
    const map=[...f.mapRows.values()][0],{updated_at,...stored}=map.event;originalNotes=stored.notes;assert(originalNotes.endsWith('Location: Bobst'));
    const event=Object.fromEntries(Object.entries(stored).filter(([,value])=>value!==null));event.notes='Agent text removing the raw location marker';return turn(call('upsert_map_event','mutate_notes',{event,expectedUpdatedAt:updated_at,buildings:map.buildings,people:[]},[task.uuid]));
  },request=>{const error=JSON.parse(request.messages.at(-1).content);assert.equal(error.status,'tool_error');assert.equal(error.reason,'forbidden_source');return turn(call('finish_batch','final',[]));}]);
  assert.equal(result.status,'completed');assert.equal([...f.mapRows.values()][0].event.notes,originalNotes);assert.equal(f.chronology.filter(row=>row.kind==='map_write').length,1);assert.deepEqual(f.tasks.get(task.uuid),task);
});

test('actual RSVP followup accepts the deterministic map name for long and blank Calendar titles',async t=>{
  for(const [label,title] of [['201-character','W'.repeat(201)],['300-character','W'.repeat(300)],['astral','🙂'.repeat(201)],['empty',''],['whitespace','   ']])await t.test(label,async()=>{
    const task=pendingTask(),f=fixture({pending:[task]});f.calendarEvents.get(clubId).set('workshop123',{id:'workshop123',summary:title,location:'Bobst',status:'confirmed',etag:'"human"',created:stamp,updated:stamp,start:{dateTime:'2026-10-23T18:00:00.000Z',timeZone:'America/New_York'},end:{dateTime:'2026-10-23T20:00:00.000Z',timeZone:'America/New_York'}});
    const result=await f.run([turn(call('finish_batch','initial',[inputId])),turn(call('read_pending_task','read_task',{taskId:task.uuid},[task.uuid])),turn(call('lookup_map_person','lookup',lookup,[task.uuid])),()=>{
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
    if(scenario==='changed live speaker')f.setCurrentSpeaker('500');if(scenario==='revoked')f.revoke();
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
  const result=await f.run([request=>{assert(!request.tools.some(tool=>/miro/.test(tool.name)));return turn(call('finish_batch','irrelevant',[inputId]));}]);
  assert.equal(result.status,'completed');assert.equal(f.modelRequests.length,1);assert.equal(f.mapRows.size,1);assert.equal([...f.mapRows.values()][0].event.source_record_id,'workshop123');assert.equal(f.tasks.size,0);
});

test('mechanical projection failure and legacy calendar_review task do not force model pagination or erase task',async()=>{
  const legacy=pendingTask();legacy.info.request.operation='calendar_review';const f=fixture({pending:[legacy],mapWriteFailureAfter:0});
  f.calendarEvents.get(clubId).set('workshop123',{id:'workshop123',summary:'Workshop',location:'Bobst',status:'confirmed',etag:'"human"',created:stamp,updated:stamp,start:{dateTime:'2026-10-23T18:00:00Z',timeZone:'America/New_York'},end:{dateTime:'2026-10-23T20:00:00Z',timeZone:'America/New_York'}});
  const result=await f.run([turn(call('finish_batch','irrelevant',[inputId]))]);
  assert.equal(result.status,'completed');assert.equal(f.modelRequests.length,1);assert.equal(f.mapRows.size,0);assert.deepEqual(f.tasks.get(legacy.uuid),legacy);assert.equal(f.tasks.size,1);
});

test('model reads saved task without original I/O, chooses normal Discord tool afterward, and unavailable original still prevents a Member Plans write',async()=>{
  const task=pendingTask();task.info.request={summary:'Interpret the saved personal plan',operation:'source_review'};const f=fixture({pending:[task],originalUnavailable:true});let cacheBoundary;
  const result=await f.run([
    turn(call('finish_batch','initial',[inputId])),
    ()=>{cacheBoundary=f.chronology.length;return turn(call('read_pending_task','cached',{taskId:task.uuid},[task.uuid]));},
    request=>{const cached=JSON.parse(request.messages.at(-1).content);assert.equal(cached.status,'ready');assert.deepEqual(cached.task,task);assert(!f.chronology.slice(cacheBoundary).some(row=>row.kind==='discord_original'||row.kind==='discord_tool'));return turn(call('read_discord_messages','normal_read',{},[task.uuid]));},
    request=>{const failed=JSON.parse(request.messages.at(-1).content);assert.equal(failed.status,'tool_error');assert.equal(failed.reason,'unavailable');assert(f.chronology.some(row=>row.kind==='discord_tool'));return turn(call('lookup_map_person','known_sender',lookup,[task.uuid]));},
    turn(call('upsert_member_plan','unavailable_write',plan,[task.uuid])),
    request=>{const failed=JSON.parse(request.messages.at(-1).content);assert.equal(failed.status,'tool_error');assert.equal(failed.reason,'forbidden_source');return turn(call('finish_batch','final',[]));},
  ]);
  assert.equal(result.status,'completed');assert.equal(f.calendarEvents.get(memberId).size,0);assert.equal(f.calendarEvents.get(clubId).size,0);assert.equal(f.mapRows.size,0);assert(f.tasks.has(task.uuid));assert.equal(f.chronology.filter(row=>row.kind==='calendar_write'||row.kind==='map_write').length,0);
});

async function cancellationFlow(kind,{state='active',readback,writeFailure,wrongPerson=false,wrongTarget=false,staleVersion=false,revokeSource=false}={}){
  const task=pendingTask(),untouched=pendingTask(),target=kind==='member'?memberId:clubId,key='discord:100:200:300',eventId=calendarEventId(target,key);
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
    turn(call('read_discord_messages','cancel_original',{},[task.uuid]),...(kind==='member'?[call('lookup_map_person','cancel_person',lookup,[task.uuid])]:[])),
    ()=>{f.calendarControl.writeFailure=writeFailure;if(revokeSource)f.setCurrentSpeaker('999');return turn(call(kind==='member'?'cancel_member_plan':'cancel_calendar_event','cancel',args,[task.uuid]));},
    request=>{cancellation=JSON.parse(request.messages.at(-1).content);f.calendarControl.readback=readback;readBoundary=f.chronology.length;
      if(readback==='reappeared')f.calendarEvents.get(target).set(eventId,{id:eventId,summary:'Concurrent provider event',status:'confirmed',source:{url},start:{dateTime:'2026-10-23T18:00:00Z',timeZone:'America/New_York'},end:{dateTime:'2026-10-23T20:00:00Z',timeZone:'America/New_York'}});
      if(staleVersion)f.tasks.get(task.uuid).updated_at='2026-10-22T18:59:00.000Z';
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
    const {f,task,result,cancellation,resolution,eventId,target}=await cancellationFlow(kind,{readback,...(readback==='reappeared'?{state:'absent'}:{})});assert.equal(result.status,'completed');assert.equal(cancellation.status,'ready');assert.equal(f.calendarEvents.get(target).get(eventId).status,readback==='reappeared'?'confirmed':'cancelled');assert.equal(resolution.status,'tool_error');assert(f.tasks.has(task.uuid));assert.equal(f.chronology.filter(row=>row.kind==='task_resolve').length,0);
  }
});

test('source-review cancellation failures, revoked original identity and wrong task target/person retain unfinished work',async()=>{
  for(const [kind,options] of [['club',{writeFailure:'conflict'}],['member',{revokeSource:true}],['club',{wrongTarget:true}],['member',{wrongPerson:true}]]){
    const {f,task,result,cancellation,resolution,target,eventId}=await cancellationFlow(kind,options);assert.equal(result.status,'completed');assert.equal(resolution.status,'tool_error');assert(f.tasks.has(task.uuid));assert.equal(f.chronology.filter(row=>row.kind==='task_resolve').length,0);
    const denied=options.writeFailure||options.revokeSource;assert.equal(cancellation.status,denied?'tool_error':'ready');assert.equal(f.calendarEvents.get(target).get(eventId).status,denied?'confirmed':'cancelled');
  }
});

test('a successful cancellation cannot delete a newer task version created after the cache read',async()=>{
  const {f,task,result,resolution}=await cancellationFlow('club',{staleVersion:true});assert.equal(resolution.status,'tool_error');assert.equal(result.status,'preflight_failed');assert.equal(f.tasks.get(task.uuid).updated_at,'2026-10-22T18:59:00.000Z');assert.equal(f.chronology.find(row=>row.kind==='task_resolve').expectedUpdatedAt,task.updated_at);
});
