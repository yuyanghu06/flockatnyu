import {attachTaskReads} from './fixtures/planner-followup.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createMapEventService,mapReadContext} from '../server/map/events.js';
import {createMapSourceAuthorizer} from '../server/map/source-access.js';
import {createLiveChatTools} from '../tools/discord/live-summary.js';
import {createCalendarClient} from '../server/google/calendar-client.js';
import {readCalendarConfig,CALENDAR_REQUIRED_SCOPES} from '../server/google/calendar-config.js';
import {createChatCalendarTools} from '../tools/calendar/chat.js';
import {snapshot,principal,ids,eventUrl,calendarId,plain,updated} from './fixtures/chat-map-attendance.mjs';
import {randomUUID} from 'node:crypto';
import {createStagedPipeline} from '../server/automation/staged-pipeline.js';
import {createBoundedResults} from '../server/automation/bounded-result.js';
import {createAutomationHandler} from '../server/automation/handler.js';
import {readAutomationConfig} from '../server/automation/config.js';

test('actual map service reads and writes saved records while all provider clients are unavailable',async()=>{
 const state=snapshot(),io=[],forbidden=async()=>{io.push('UNRELATED_PROVIDER');throw Error('Unrelated provider unavailable');};
 const store={configured:true,read:async()=>{io.push('DB_READ');return structuredClone(state);},lookup:async()=>{io.push('DB_LOOKUP');return {...state.people[0]};},upsert:async args=>{io.push('DB_WRITE');assert.equal(args.expectedUpdatedAt,updated);return {status:'applied',event_id:args.event.id,updated_at:'2026-10-22T20:00:00Z'};}};
 const sourceAuth=createMapSourceAuthorizer({store,calendarSourceId:ids.source,calendarClient:{configured:true,calendarId,readEvent:forbidden},liveDiscordService:{configured:true,readMessages:forbidden},googleClient:{configured:true,readGmail:forbidden}});
 const service=createMapEventService({store,authorizeSource:sourceAuth});
 const read=await service.read({principal});assert.equal(read.status,'ok');assert.equal(read.events[0].name,'GoGreek');
 const lookup=await service.lookup({principal,provider:'discord',providerUserId:'400',sourceId:ids.source,sourceUrl:eventUrl});assert.equal(lookup.status,'ok');assert.equal(lookup.person.id,ids.person);
 const args={principal,event:{...plain(state.events[0]),notes:'Updated map note'},expectedUpdatedAt:updated,buildings:state.event_buildings.map(plain),people:state.event_people.map(plain),readContext:mapReadContext(read)};
 const write=await service.upsert(args);assert.equal(write.status,'applied');assert.deepEqual(io,['DB_READ','DB_LOOKUP','DB_WRITE']);
});

test('large Discord window is an original-message read without hidden summarizer calls',async()=>{
 let reads=0,inference=0;const sources=Array.from({length:30},(_,index)=>({id:String(index),excerpt:'Original message '.repeat(100)}));
 const tools=createLiveChatTools({guildId:'100',config:{configured:true},service:{readWindow:async()=>{reads++;return {status:'ready',sources,coverage:{complete:true,returnedCount:30}};},fetchWindow:async()=>{throw Error('Hidden aggregate window fetch');}},provider:{configured:true,summarize:async()=>{inference++;throw Error('Unexpected model');},map:async()=>{inference++;throw Error('Unexpected model');}}});
 const result=await tools.execute({name:'read_discord_window',arguments:{channelId:'200',from:'2026-10-22',to:'2026-10-23'},principal:{id:'member'},timeContext:{now:'2026-10-22T20:00:00Z',timeZone:'America/New_York'}});
 assert.equal(result.status,'ready');assert.deepEqual(result.sources,sources);assert.equal(reads,1);assert.equal(inference,0);
});

test('actual Calendar batch writes supplied rows without searching Calendar business records',async()=>{
 const target='club@group.calendar.google.com',records=new Map(),io=[];
 const client=createCalendarClient({config:readCalendarConfig({GOOGLE_CLIENT_ID:'synthetic',GOOGLE_CLIENT_SECRET:'synthetic',GOOGLE_REFRESH_TOKEN:'synthetic',GOOGLE_EXPECTED_ACCOUNT_EMAIL:'club@example.test',GOOGLE_CALENDAR_ID:target}),oauthClient:{setCredentials(){},getAccessToken:async()=>({token:'synthetic'}),getTokenInfo:async()=>({scopes:CALENDAR_REQUIRED_SCOPES})},fetchImpl:async(value,options={})=>{
  const url=new URL(value);if(url.hostname==='gmail.googleapis.com')return Response.json({emailAddress:'club@example.test'});
  if(url.pathname.includes('/calendarList/'))return Response.json({id:target,accessRole:'writer'});
  const match=/\/calendars\/([^/]+)\/events(?:\/([^/]+))?$/.exec(url.pathname);assert(match);assert.equal(decodeURIComponent(match[1]),target);
  const id=match[2]&&decodeURIComponent(match[2]);
  if(options.method==='GET'){assert(id,'A create tool may not perform a Calendar listing');io.push('EXACT_ID_RETRY_CHECK');return records.has(id)?Response.json(records.get(id)):Response.json({}, {status:404});}
  assert.equal(options.method,'POST');const body=JSON.parse(options.body);const row={...body,etag:'"saved"',created:'2026-10-22T20:00:00Z',updated:'2026-10-22T20:00:00Z'};records.set(body.id,row);io.push('CREATE');return Response.json(row);
 }});
 const tools=createChatCalendarTools({client}).createRequest({principal:{id:'member',googleAccess:true,allowedSourceIds:[]},operationId:'isolated-batch'});
 const options={name:'create_calendar_events',arguments:{events:[{title:'Requested event',date:'2026-10-23',startTime:'15:00',endTime:'16:00',timeZone:'America/New_York'}]}};
 const result=await tools.execute(options);assert.equal(result.status,'ready');assert.equal(records.size,1);assert.equal(result.calendarBatchWrite.counts.created,1);
 const again=await tools.execute(options);assert.equal(again.status,'ready');assert.equal(records.size,1);assert.equal(io.filter(value=>value==='CREATE').length,1);
});

function savedWorkFixture(){
 const stamp='2026-10-22T18:30:00.000Z',sourceId=randomUUID(),input={uuid:randomUUID(),raw_response:{source:'discord',source_id:sourceId,event_type:'message_created',event_id:'300',revision:'1',received_at:stamp,payload:{guild_id:'100',channel_id:'200',id:'300',author:{id:'400'},content:'An unfinished workshop question',timestamp:stamp}}};
 const task={uuid:randomUUID(),created_at:stamp,updated_at:stamp,expires_at:'2026-10-23T18:30:00.000Z',info:{version:1,sourceIds:[sourceId],inputs:[structuredClone(input)],request:{summary:'Private old saved summary',operation:'source_review'},executionHistory:[]}};
 const rows=new Map([[task.uuid,structuredClone(task)]]),calls=[],history=[],owner={id:'worker',allowedSourceIds:[sourceId]},leaseToken=randomUUID();
 const taskStore={configured:true,list:async()=>{calls.push('list');return {status:'ready',tasks:structuredClone([...rows.values()])};},save:async args=>{calls.push('save');const previous=rows.get(args.task.uuid);if(previous&&previous.updated_at!==args.expectedUpdatedAt)return {status:'conflict'};const saved={...structuredClone(args.task),created_at:previous?.created_at||stamp,updated_at:stamp,expires_at:previous?.expires_at||'2026-10-23T18:30:00.000Z'};rows.set(saved.uuid,saved);return {status:'ready',task:structuredClone(saved)};},resolve:async()=>{throw Error('Unfinished saved task cannot be deleted');}};
 attachTaskReads(taskStore,rows,{onCall:row=>calls.push(row.method)});
 const staged=createStagedPipeline({taskStore,principal:owner,fragments:createBoundedResults(),bindTask:async()=>{},now:()=>new Date(stamp)});
 return {stamp,sourceId,input,task,rows,calls,history,principal:owner,leaseToken,staged,begin:()=>staged.pipeline.beginCycle({leaseToken,inputs:[input],recordExecution:async row=>history.push(row),getExecutionLog:()=>structuredClone(history)}),after:()=>staged.pipeline.afterInitial({handledInputIds:[],inputs:[input],executionLog:history})};
}

test('an unfinished input reuses only a current saved task with the exact original when initial processing stops',async t=>{
 for(const variant of ['same original','changed original','expired task','task removed after initial snapshot'])await t.test(variant,async()=>{
  const f=savedWorkFixture();
  if(variant==='changed original'){f.input.raw_response.revision='2';f.input.raw_response.payload.content='The workshop question was edited';}
  if(variant==='expired task')f.rows.get(f.task.uuid).expires_at=f.stamp;
  await f.begin();
  assert.deepEqual(f.staged.pipeline.getInitialTaskCoverage(),variant==='same original'||variant==='task removed after initial snapshot'?[{inputId:f.input.uuid,taskCount:1}]:[]);
  if(variant==='task removed after initial snapshot')f.rows.delete(f.task.uuid);
  const result=await f.after();assert.equal(result.status,'ready');
  const saves=f.calls.filter(row=>row==='save').length;
  if(variant==='same original'){
   assert.equal(saves,0,'Cap or empty finish must not add a duplicate saved task');assert.equal(f.rows.size,1);assert.deepEqual(f.rows.get(f.task.uuid),f.task);assert.equal(result.context.taskCount,1);assert.deepEqual(result.inputIds,[f.task.uuid]);
  }else{
   assert.equal(saves,1,'A stale, missing or differently bound task cannot suppress a new checkpoint');
   const fresh=[...f.rows.values()].find(row=>row.uuid!==f.task.uuid);assert(fresh);assert.deepEqual(fresh.info.inputs,[f.input]);
   assert(result.inputIds.includes(fresh.uuid));assert.equal(result.context.taskCount,variant==='changed original'?2:1);
  }
 });
});

test('initial planner context discloses only saved coverage and still requires explicit queue completion',async t=>{
 for(const declared of [true,false])await t.test(declared?'input explicitly handled':'input omitted stays queued',async()=>{
 const f=savedWorkFixture(),requests=[];let queueFinished=false;
 const config=readAutomationConfig({AGENT_AUTOMATION_ENABLED:'true'});
 const handler=createAutomationHandler({config,principal:f.principal,tools:[...f.staged.tools,{name:'sync_calendars_to_map',description:'Explicit separate synchronization',idempotent:true,parameters:{type:'object',properties:{},additionalProperties:false},execute:async()=>({status:'ready'})}],pipeline:f.staged.pipeline,authorizeEvent:async()=>true,now:()=>new Date(f.stamp),store:{configured:true,claim:async()=>({status:'ready',leaseToken:f.leaseToken,inputs:[f.input]}),renew:async()=>({status:'ready'}),release:async()=>{},fail:async()=>{},action:async({complete})=>({status:complete?'completed':'execute'}),finish:async()=>{queueFinished=true;return {status:'ready'};}},provider:{toolTurn:async request=>{
  const message=JSON.parse(request.messages[0].content);requests.push(message);
  if(requests.length===1){
   const binding=message.referenceBindings.handledInputIds.find(row=>row.uuid===f.input.uuid);
   assert.deepEqual(message.savedTaskCoverage.inputs,[{inputRef:binding.ref,taskCount:1}]);
   const coverage=JSON.stringify(message.savedTaskCoverage);assert(!coverage.includes(f.task.uuid));assert(!coverage.includes(f.task.info.request.summary));
   assert.deepEqual(f.calls,['catalogue','read'],'Coverage uses the saved catalogue and exact matching task only');
   return {stopReason:'tool_calls',text:'',toolCalls:[{id:'finish_initial',name:'finish_batch',arguments:{handledInputIds:declared?[binding.ref]:[],noChangeInputIds:[]}}]};
  }
  return {stopReason:'tool_calls',text:'',toolCalls:[{id:'finish_followup',name:'finish_batch',arguments:{handledInputIds:[]}}]};
 }}});
 const result=await handler.tick();assert.equal(result.status,declared?'completed':'round_limit');assert.equal(queueFinished,declared);assert.equal(requests.length,2);assert.equal(f.rows.size,1);assert.deepEqual(f.rows.get(f.task.uuid),f.task);
 });
});
