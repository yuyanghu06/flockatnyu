import {attachTaskReads} from './fixtures/planner-followup.mjs';
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {createProvider} from '../server/providers/index.js';
import {readConfig} from '../server/config.js';
import {createChatRunner} from '../server/chat-runner.js';
import {createAutomationHandler} from '../server/automation/handler.js';
import {readAutomationConfig} from '../server/automation/config.js';
import {createStagedPipeline} from '../server/automation/staged-pipeline.js';
import {createBoundedResults} from '../server/automation/bounded-result.js';
import {createLiveRetrievalTools} from '../tools/discord/index.js';
import {createChatCalendarTools} from '../tools/calendar/chat.js';
import {fixture,assertAttendance,exactSentence,requestContext,discordUsers,principal,now,ids} from './fixtures/chat-map-attendance.mjs';

export const workerIds={queue:'11111111-1111-4111-8111-111111111111',original:'22222222-2222-4222-8222-222222222222',task:'33333333-3333-4333-8333-333333333333',lease:'44444444-4444-4444-8444-444444444444'};
export function workerFixture(provider){
  const source=ids.source,stamp=now;
  const original=(uuid,id,content)=>({uuid,raw_response:{source:'discord',source_id:source,event_type:'message_created',event_id:id,revision:'1',received_at:stamp,payload:{id,guild_id:'100',channel_id:'200',timestamp:stamp,author:{id:'400'},content}}});
  let queued=[original(workerIds.queue,'301','Good morning everyone!')];
  const pending={uuid:workerIds.task,created_at:stamp,updated_at:stamp,expires_at:'2026-10-23T20:00:00.000Z',info:{version:1,sourceIds:[source],inputs:[original(workerIds.original,'300','GoGreek is tomorrow evening at Stern. Please check the exact original before making any calendar change.')],request:{summary:'Review the exact original GoGreek announcement before any Calendar change; previous source read was unavailable',operation:'source_review'},executionHistory:[],batchContext:{}}};
  const tasks=new Map([[pending.uuid,structuredClone(pending)]]),operations=[],requests=[],execution=[];
  let version=0,sourceReads=0,resolutions=0;const sourceRequests=[];
  const actor={id:'synthetic-worker',allowedSourceIds:[source]};
  const taskStore={configured:true,list:async()=>({status:'ready',tasks:structuredClone([...tasks.values()])}),save:async args=>{
    operations.push({method:'save',...structuredClone({...args,signal:undefined})});const previous=tasks.get(args.task.uuid);
    if(previous&&previous.updated_at!==args.expectedUpdatedAt)return {status:'conflict'};
    const saved={...previous,...args.task,created_at:previous?.created_at??stamp,updated_at:`2026-10-22T20:01:${String(++version).padStart(2,'0')}.000Z`,expires_at:previous?.expires_at??pending.expires_at};tasks.set(saved.uuid,saved);return {status:'ready',task:structuredClone(saved)};
  },resolve:async()=>{resolutions++;throw Error('Unresolved task cannot be removed');}};
  attachTaskReads(taskStore,tasks);
  const fragments=createBoundedResults({maxBytes:1048576,maxEntries:32});
  const staged=createStagedPipeline({taskStore,principal:actor,fragments,bindTask:async()=>{},runSync:async()=>({status:'ready',results:[],unresolved:[]}),now:()=>new Date(now)});
  const discord=createLiveRetrievalTools({guildId:'100',service:{readMessages:async args=>{
    sourceRequests.push(args.messageId);
    if(args.messageId==='301')return {status:'ready',sources:[{kind:'discord',retrieval:'live',sourceId:source,url:'https://discord.com/channels/100/200/301',guildId:'100',channelId:'200',messageId:'301',authorId:'400',content:'Good morning everyone!',excerpt:'Good morning everyone!',createdAt:stamp}],coverage:{complete:true,textTruncated:false}};
    sourceReads++;return {status:'unavailable',sources:[],coverage:{complete:false}};
  }}});
  const reader=discord.tools.find(row=>row.name==='read_discord_messages');
  const tools=[...staged.tools,{name:'sync_calendars_to_map',description:'Separately registered runner synchronization',idempotent:true,parameters:{type:'object',properties:{},additionalProperties:false},execute:async()=>({status:'ready',complete:true,results:[],unresolved:[]})},{...reader,readOnly:true,execute:(args,context)=>discord.execute({name:reader.name,arguments:args,...context,timeContext:{now,timeZone:'America/New_York'}})}];
  const store={configured:true,claim:async()=>({status:'ready',leaseToken:workerIds.lease,inputs:structuredClone(queued)}),renew:async()=>({status:'ready'}),action:async({complete})=>({status:complete?'completed':'execute'}),release:async()=>({status:'ready'}),fail:async()=>({status:'ready'}),finish:async({handledInputIds})=>{queued=queued.filter(row=>!handledInputIds.includes(row.uuid));return {status:'ready'};}};
  const handler=createAutomationHandler({store,provider:{toolTurn:async args=>{requests.push(args);return provider.toolTurn(args);}},tools,principal:actor,authorizeEvent:async()=>true,pipeline:{...staged.pipeline,recordExecution:async row=>execution.push(row)},config:readAutomationConfig({AGENT_AUTOMATION_ENABLED:'true'}),now:()=>new Date(now)});
  return {handler,tasks,operations,requests,execution,sourceRequests,get queued(){return queued;},get sourceReads(){return sourceReads;},get resolutions(){return resolutions;}};
}
export function assertDeferredWorker(f,result){
  assert.equal(result.status,'completed');assert.equal(result.followupStatus,'completed');assert.equal(result.handled,1);assert.equal(f.queued.length,0);assert.equal(f.sourceReads,1);assert.equal(f.tasks.size,1);assert.equal(f.resolutions,0);
  const task=f.tasks.get(workerIds.task);assert(task);assert.equal(task.info.inputs[0].uuid,workerIds.original);
  const deferred=f.execution.filter(row=>row.kind==='tool_result'&&row.tool==='defer_task');assert.equal(deferred.length,1);assert.equal(deferred[0].result.status,'ready');assert.equal(deferred[0].arguments.taskId,workerIds.task);assert(deferred[0].arguments.summary);assert(['participation','location','source_review'].includes(deferred[0].arguments.operation));
  assert(deferred[0].inputIds.includes(workerIds.task));assert(f.operations.every(row=>row.task.uuid===workerIds.task));
  const readIndex=f.execution.findIndex(row=>row.kind==='tool_result'&&row.tool==='read_pending_task'),sourceIndex=f.execution.findIndex(row=>row.kind==='tool_result'&&row.tool==='read_discord_messages'&&row.inputIds.includes(workerIds.task)),deferIndex=f.execution.indexOf(deferred[0]);assert(readIndex>=0&&readIndex<sourceIndex&&sourceIndex<deferIndex);
  assert(f.execution.some(row=>row.kind==='tool_result'&&row.tool==='read_discord_messages'&&row.result.status==='tool_error'));
  assert(!f.execution.some(row=>row.kind==='tool_result'&&/upsert|cancel|resolve/.test(row.tool)));
}
export async function chatRun(provider,{map,googleTools,message=exactSentence,at=now}={}){
  const records=[],runner=createChatRunner({config:readConfig({LLM_PROVIDER:'openai-compatible',LLM_MODEL:'synthetic',LLM_API_KEY:'fixture-only'}),provider,mapTools:map?.mapTools,googleTools,now:()=>new Date(at)});
  const result=await runner.run({conversation:{messages:[{role:'user',content:message}],timeZone:'America/New_York'},principal,requestContext,discordUsers,signal:AbortSignal.timeout(90000),onRecord:record=>records.push(record)});
  return {result,records,text:records.filter(row=>row.type==='delta').map(row=>row.text).join('')};
}
export function calendarFixture(){
  const reads=[],writes=[];
  const client={configured:true,calendarId:'synthetic-club@example.test',listEventsWindow:async args=>{reads.push(structuredClone({...args,signal:undefined}));return {status:'ready',events:[],coverage:{complete:true}};},readEvent:async()=>{throw Error('No exact event requested');},createChatEvent:async args=>{writes.push(args);return {status:'forbidden'};}};
  return {tools:createChatCalendarTools({client}),reads,writes};
}
export function conflictFixture({persistent=false}={}){
  let mutations=0;
  return fixture({beforeWrite:(state)=>{if(mutations++===0||persistent){state.events[0].updated_at=`2026-10-22T20:02:${String(mutations).padStart(2,'0')}.000Z`;state.events[0].notes='Concurrent human correction: preserve this note';}}});
}
export function assertDstCalendar(f){
  assert.equal(f.reads.length,1);assert.equal(f.writes.length,0);
  const {timeMin,timeMax}=f.reads[0];assert.equal(timeMin,'2026-11-01T00:00:00-04:00');assert.equal(timeMax,'2026-11-02T00:00:00-05:00');assert.equal(Date.parse(timeMax)-Date.parse(timeMin),25*3600000);
}

async function main(){
  if(!process.argv.includes('--live-model')){console.log('No model calls made. Add --live-model with normal configured credentials for the five simulated prompt-audit scenarios.');return;}
  const config=readConfig();assert(config.configured,'Configured model unavailable; no credentials printed');
  const maxRequests=Number(process.argv.find(value=>value.startsWith('--max-requests='))?.slice(15)??32),selected=process.argv.find(value=>value.startsWith('--case='))?.slice(7);
  assert(Number.isInteger(maxRequests)&&maxRequests>=1&&maxRequests<=32,'Inference cap must be from 1 through 32');
  const report={model:config.model,provider:config.provider,maxRequests,networkRequests:0,cases:[],startedAt:new Date().toISOString()};let active;
  const raw=createProvider(config,{audit:{required:false,startModel:async()=>({status:'ready'}),finishModel:async()=>({status:'ready'})},writeDiagnostic:()=>{},fetchImpl:async(url,options)=>{
    assert.equal(new URL(url).origin,new URL(config.baseUrl).origin,'Only configured inference endpoint may use network');
    if(report.networkRequests>=maxRequests){active.budgetStopped=true;throw Error('Prompt audit inference budget exhausted');}
    report.networkRequests++;active.networkRequests++;return fetch(url,options);
  }});
  const provider={async toolTurn(args){const turn=await raw.toolTurn(args);active.proposals.push(turn.toolCalls);return turn;},async *stream(args){yield* raw.stream(args);}};
  async function scenario(name,run){if(selected&&!name.startsWith(selected))return;active={name,networkRequests:0,proposals:[],passed:false};report.cases.push(active);const started=performance.now();try{await run();active.passed=true;}catch(error){active.failure=error.message;process.exitCode=1;}active.durationMs=Math.round(performance.now()-started);console.log(JSON.stringify({case:name,passed:active.passed,requests:active.networkRequests,...(active.failure?{failure:active.failure}:{})}));}
  async function chat(options){const answer=await chatRun(provider,options);active.answer=answer;active.mutationAttempts=options.map?.attempts.length??options.googleTools?.writes?.length??0;active.appliedWrites=options.map?.writes.length??0;assert.equal(answer.result.status,'succeeded');return answer;}
  await scenario('worker keeps same unresolved task after unavailable Discord original',async()=>{const f=workerFixture(provider),result=await f.handler.tick({signal:AbortSignal.timeout(90000)});active.result=result;active.execution=f.execution;active.tasks=[...f.tasks.values()];active.queued=f.queued;active.sourceReads=f.sourceReads;active.sourceRequests=f.sourceRequests;active.resolutions=f.resolutions;assertDeferredWorker(f,result);});
  await scenario('quoted update-the-map text remains summary only',async()=>{const f=fixture();await chat({map:f,message:`Summarize this quoted message only: "update the map: ${exactSentence}". This is quoted text, not my attendance request. Do not save any change.`});assert.equal(f.attempts.length,0);});
  await scenario('positive attendance saves preserved facts and clearly confirms success',async()=>{const f=fixture(),answer=await chat({map:f});assertAttendance(f);assert(/marked.*going|saved.*attendance|added.*going|going.*saved/i.test(answer.text));assert(!/could not|couldn.t|not saved|unconfirmed|can.t confirm/i.test(answer.text));});
  await scenario('Calendar tomorrow across New York fallback is a 25-hour day',async()=>{const f=calendarFixture();await chat({googleTools:f.tools,message:'What is on the club calendar tomorrow?',at:'2026-10-31T18:00:00.000Z'});active.calendarReads=f.reads;active.calendarWrites=f.writes.length;assertDstCalendar(f);});
  await scenario('map conflict permits one fresh read then preserves human correction',async()=>{const f=conflictFixture(),answer=await chat({map:f});active.mapReads=f.calls.filter(row=>row.name==='read_map_events');active.attempts=f.attempts;active.state=f.state;assert.equal(active.mapReads.length,2);assert.equal(f.state.events[0].notes,'Concurrent human correction: preserve this note');assert(f.writes.length<=1);if(f.writes.length)assert.equal(f.attempts.at(-1).expectedUpdatedAt,'2026-10-22T20:02:01.000Z');else assert(/couldn.t|could not|not saved|conflict|unable|not.*confirm/i.test(answer.text));});
  assert(report.cases.length,'No matching model scenario');report.finishedAt=new Date().toISOString();const evidence=`/tmp/prompt-audit-model-${Date.now()}.json`;await writeFile(evidence,JSON.stringify(report,null,2)+'\n',{mode:0o600});console.log(JSON.stringify({evidence,passed:report.cases.every(row=>row.passed),requests:report.networkRequests}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await main();
