import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {createProvider} from '../server/providers/index.js';
import {readConfig} from '../server/shared/config.js';
import {createAutomationHandler} from '../server/automation/handler.js';
import {readAutomationConfig} from '../server/automation/config.js';
import {canonicalJson} from '../server/automation/validation.js';
import {encodeTaskInfo,decodeTaskInfo,postgresJsonBytes,MAX_TASK_WIRE_BYTES} from '../server/automation/task-history-codec.js';
import {fixture,input,task,ids,copy,now,originalUrl} from './fixtures/planner-followup.mjs';

const arg=name=>process.argv.find(value=>value.startsWith('--'+name+'='))?.slice(name.length+3);
const hash=value=>createHash('sha256').update(typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value)).digest('hex');
const bytes=value=>Buffer.byteLength(JSON.stringify(value));
const scenarios=[
 {name:'five-fresh-mixed-inputs-and-phase-reuse',setup:()=>fixture({backlog:0,unmatchedAuthors:['700'],freshInputs:[
  input(1,{content:'Check the workshop announcement above for the exact time and place. I will attend that entire workshop tonight.',author:'400'}),
  input(2,{content:'Thanks for sharing the slides!',author:'500'}),input(3,{content:'I might join but I do not know when yet; do not mark me going.',author:'600'}),
  input(4,{content:'I will attend the entire Friday workshop tonight too.',author:'700'}),input(5,{content:'Have a good afternoon everyone!',author:'500'})]}),
  verify(f,result){assert.equal(result.status,'completed');assert.equal(result.handled,5,'All five fresh originals must be accounted for');const person=f.state.event_people.find(row=>row.person_id===ids.person);assert(person);assert.equal(person.attendance_status,'going');assert.equal(person.source_url,originalUrl(f.originals[0]));assert(!f.state.event_people.some(row=>row.person_id===ids.blocked),'Tentative Casey cannot become confirmed going');assert(f.tasks.size>0,'Unmatched/ambiguous work survives when it cannot safely finish');assert.equal(f.calendarWrites.length,0);}},
 {name:'one-unavailable-source-does-not-block-independent-ready-work',setup:()=>{
  const bad=task(1,{current:true,original:input(1,{author:'700',content:'I will attend the workshop, but my original cannot currently be read.'}),personId:null}),good=task(2,{current:true,original:input(2,{author:'400'})});
  const f=fixture({backlog:0,current:[bad,good],unmatchedAuthors:['700']}),tool=f.adapters.tools.find(row=>row.name==='read_discord_messages'),read=tool.execute;
  tool.execute=async(args,context)=>args.messageId==='301'||args.url?.endsWith('/301')?{status:'unavailable',reason:'source_unavailable'}:read(args,context);f.failureTask=bad.uuid;f.readyTask=good.uuid;return f;
 },verify(f,result){assert.equal(result.status,'completed');assert(f.state.event_people.some(row=>row.person_id===ids.person));assert(f.tasks.has(f.failureTask));assert(!f.tasks.has(f.readyTask));assert(f.tools.some(row=>row.name==='read_discord_messages'&&row.result.status==='unavailable'));assert.equal(f.calendarWrites.length,0);}},
 {name:'near-limit-history-and-concurrent-human-map-edit',setup:()=>{
  const ready=task(1,{current:true,original:input(1,{author:'400'})}),f=fixture({backlog:1,current:[ready],conflict:true}),old=f.backlogTasks[0],saved=f.tasks.get(old.uuid);
  saved.info.executionHistory.push({kind:'model_result',result:{text:'Keep every earlier observation. '.repeat(6000)}});f.retainedTask=copy(saved);return f;
 },verify(f,result){assert.equal(result.status,'completed');assert(f.state.event_people.some(row=>row.person_id===ids.person));assert.equal(f.state.events[0].notes,'Human correction made concurrently; preserve this exact note.');assert.equal(f.attempts.length,2,'One optimistic conflict, one later merged successful write');assert.equal(f.writes.length,1);const saved=f.tasks.get(f.retainedTask.uuid);assert(saved);assert.deepEqual(saved.info.inputs,f.retainedTask.info.inputs);assert.deepEqual(saved.info.batchContext,f.retainedTask.info.batchContext);assert.deepEqual(saved.info.executionHistory.slice(0,f.retainedTask.info.executionHistory.length),f.retainedTask.info.executionHistory);assert.equal(f.calendarWrites.length,0);}},
];
const requested=process.argv.filter(value=>value.startsWith('--case=')).map(value=>value.slice(7));
const selected=scenarios.filter(row=>!requested.length||requested.includes(row.name));assert(selected.length,'No matching scenario');
const replayFile=arg('replay-evidence'),replayMode=Boolean(replayFile);
assert(!(replayMode&&process.argv.includes('--live-model')),'Replay cannot request live inference');
const replayEvidence=replayMode?JSON.parse(await readFile(resolve(replayFile),'utf8')):null;
const maxRequests=Number(arg('max-requests')??48),caseLimit=Number(arg('per-case-cap')??16);
assert(Number.isInteger(maxRequests)&&maxRequests>=1&&maxRequests<=48,'Hard total inference dispatch cap is1–48');assert(Number.isInteger(caseLimit)&&caseLimit>=1&&caseLimit<=26,'Hard per-case dispatch cap is1–26');

function safeMapPreservation(f){
 const old=f.before.events[0],after=f.state.events[0];assert.equal(f.state.events.length,f.before.events.length);assert.deepEqual({...after,notes:old.notes,updated_at:old.updated_at},old);assert.deepEqual(f.state.event_buildings,f.before.event_buildings);assert.deepEqual(f.state.event_people.find(row=>row.person_id===ids.other),f.before.event_people[0]);
}
function summarizeRequests(f,requests){
 const reads=f.tools.filter(row=>row.name==='read_discord_messages'),seen=new Map();let repeatedSuccessfulSourceProposals=0;
 for(const row of f.tools){
  if(['source_changed','original_changed','source_refresh_required','original_read_required'].includes(row.result?.reason))seen.clear();
  if(row.name!=='read_discord_messages')continue;
  const args=copy(row.arguments);if(args.url){const match=/\/channels\/([^/]+)\/([^/]+)\/([^/]+)$/.exec(new URL(args.url).pathname);if(match){args.channelId=match[2];args.messageId=match[3];delete args.url;}}
  args.context=args.context!==false;args.limit??=5;const key=hash(canonicalJson(args));
  const complete=row.result.status==='ready'&&row.result.coverage?.complete===true&&!row.result.fragment;
  if(complete&&seen.has(key))repeatedSuccessfulSourceProposals++;if(complete)seen.set(key,true);
 }
 return {phaseRequests:requests,sourceToolCalls:reads.length,sourceTransportObservations:f.chronology.filter(row=>row.kind==='source_read').length,
  repeatedSuccessfulSourceProposals,observationHandoffSeen:requests.some(row=>row.phase==='followup'&&row.observationCount>0),
  observationReadNames:[...new Set(requests.flatMap(row=>row.observationNames??[]))]};
}
if(!process.argv.includes('--live-model')&&!replayMode){
 const cases=selected.map(row=>{const f=row.setup();assert(f.adapters.pipeline);assert(f.adapters.tools.length);return{name:row.name,freshOrClaimedInputs:f.originals.length,initialSavedTasks:f.tasks.size,actualRunner:true,actualAdapters:true,scriptedInitialPhase:false};});
 console.log(JSON.stringify({modelRequests:0,maxRequests,perCaseCap:caseLimit,cases,network:'Only exact configured inference endpoint will be allowed in --live-model mode. All business services are in-memory simulations.',limitations:['This fixture expects no Calendar writes for attendance cases; an attempted Calendar write is recorded and rejected.','Source failure case injects one unavailable result at the source adapter boundary.','Changed-source/lease/revocation guards are covered separately by deterministic production tests.']}));process.exit(0);
}
const config=replayMode?{configured:true,model:replayEvidence.model,provider:replayEvidence.provider}:readConfig();assert(config.configured,'Configured inference credentials unavailable; never printed');assert.equal(config.model,'gpt-6-luna','Use the actual selected configured model');
const endpoint=replayMode?null:config.baseUrl.replace(/\/$/,'')+'/'+(config.provider==='anthropic'?'messages':'chat/completions');
const evidenceDir=resolve(arg('evidence-dir')??`evidence/planner-throughput-fix-2026-10-25/tester-model-${Date.now()}`);await mkdir(evidenceDir,{recursive:true,mode:0o700});
async function walk(path){const files=[];for(const entry of await readdir(new URL('../'+path+'/',import.meta.url),{withFileTypes:true})){const name=path+'/'+entry.name;if(entry.isDirectory())files.push(...await walk(name));else if(entry.isFile())files.push(name);}return files;}
const files=[...await walk('server'),...await walk('tools'),...await walk('src/api/operations'),'tests/fixtures/planner-followup.mjs','tests/planner-throughput-model.mjs','package.json','package-lock.json'].sort();
const sourceHashes=async()=>Object.fromEntries(await Promise.all(files.map(async name=>[name,hash(await readFile(new URL('../'+name,import.meta.url)))]))),pins=await sourceHashes();
const report={model:config.model,provider:config.provider,mode:replayMode?'offline-recorded-model-replay':'configured-model-api',
 ...(replayMode?{recordedEvidence:resolve(replayFile),recordedEvidenceSha256:hash(await readFile(resolve(replayFile))),recordedRequests:replayEvidence.networkRequests}:{}),
 startedAt:new Date().toISOString(),maxRequests,perCaseCap:caseLimit,networkRequests:0,pins,cases:[],limitations:['Production handler and adapters; only source, storage and Calendar/map data boundaries are simulated.',replayMode?'Scripted OFFLINE replay of recorded real-model returned replies; zero new inference. Only q/t positional transport refs are remapped.':'Every initial and follow-up model reply uses the configured API; no scripted replies.','No live Discord, Calendar, map, Supabase or deployment writes.','Calendar mutations are forbidden by this attendance-only fixture.','Source failure is injected at the source adapter result boundary.','Source-revision and revocation safety are deterministic checks, not a real-model changed-source case.']};
const reportFile=resolve(evidenceDir,'evidence.json'),persist=()=>writeFile(reportFile,JSON.stringify(report,null,2)+'\n',{mode:0o600});await persist();
const originalFetch=globalThis.fetch;let active;
const guardedFetch=async(value,options={})=>{
 assert(!replayMode,'All external network and inference are forbidden during offline replay');
 assert.equal(String(value),endpoint,'External network is limited to the exact configured inference endpoint');assert.deepEqual(await sourceHashes(),pins,'Freeze source before model testing');
 if(report.networkRequests>=maxRequests||active.networkRequests>=caseLimit){active.budgetStopped=true;await persist();throw Error('Hard inference dispatch cap reached');}
 const call={sequence:++report.networkRequests,caseSequence:++active.networkRequests,startedAt:new Date().toISOString()};active.dispatches.push(call);await persist();
 try{const response=await originalFetch(value,{...options,redirect:'error'});call.httpStatus=response.status;call.finishedAt=new Date().toISOString();await persist();return response;}catch(error){call.failure=error?.name==='AbortError'?'inference_aborted':'inference_transport_failed';call.finishedAt=new Date().toISOString();await persist();throw error;}
};
globalThis.fetch=guardedFetch;
const raw=replayMode?null:createProvider(config,{fetchImpl:guardedFetch,audit:{required:false,startModel:async()=>({status:'ready'}),finishModel:async()=>({status:'ready'})},writeDiagnostic:()=>{}});
const transportRef=/^([qt])_[a-zA-Z0-9]+_([1-9][0-9]*)$/;
function replayTurn(turn,request){
 const headers=request.messages.filter(row=>row.role==='user').map(row=>{try{return JSON.parse(row.content);}catch{return{};}}),header=headers.findLast(row=>row.referenceBindings);
 assert(header?.referenceBindings,'Replay requires the actual current reference bindings');
 const bindings=Object.values(header.referenceBindings).filter(Array.isArray).flat().filter(row=>row&&typeof row.ref==='string');
 function remap(value){
  if(typeof value==='string'){const match=transportRef.exec(value);if(!match)return value;const position=Number(match[2]),replacement=bindings.find(row=>{const current=transportRef.exec(row.ref);return current&&current[1]===match[1]&&Number(current[2])===position;});assert(replacement,'Recorded transport ref has no matching current positional binding');return replacement.ref;}
  return Array.isArray(value)?value.map(remap):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([key,item])=>[key,remap(item)])):value;
 }
 return remap(copy(turn));
}
function comparable(value,key=''){
 if(typeof value==='string'){
  const ref=transportRef.exec(value);if(ref)return `${ref[1]}_POSITION_${ref[2]}`;
  if(key==='cycleId'&&/^[0-9a-f-]{36}$/i.test(value))return'<runtime-cycle-id>';
  if(key==='receiptId'&&/^[0-9a-f-]{36}$/i.test(value))return'<runtime-receipt-id>';
  if(/^runner_sync_[0-9a-f]+$/i.test(value))return'<runtime-runner-sync-call-id>';
  return value;
 }
 return Array.isArray(value)?value.map(item=>comparable(item,key)):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([name,item])=>[name,comparable(item,name)])):value;
}
function compareReplay(recorded,actual,f,requests){
 const snapshot=value=>JSON.parse(JSON.stringify(value));
 assert.deepEqual(actual.outcome,recorded.outcome,'Recorded and replayed terminal outcomes differ');
 assert.deepEqual(comparable(f.tools),comparable(recorded.tools),'Actual tool calls/results differ after normalizing only runtime refs/receipts');
 assert.deepEqual(comparable(f.execution),comparable(recorded.execution),'Execution sequence and recorded bookkeeping differ');
 assert.deepEqual(actual.storageWrites,recorded.storageWrites,'Task checkpoint versions and encoded/logical sizes differ');
 assert.deepEqual(snapshot(f.before),recorded.before,'Initial simulated map state differs');
 assert.deepEqual(snapshot(f.originals),recorded.initialOriginals,'Initial queued originals differ');
 assert.equal(actual.returnedModelTurns.at(-1)?.text??'',recorded.finalModelText,'Final returned model text differs');
 // Recorded evidence is JSON. Use that same representation so an absent field
 // is comparable with an in-memory `undefined` without dropping any saved value.
 assert.deepEqual(snapshot(f.attempts),recorded.attemptedMapWrites,'Attempted map fields/CAS versions differ');assert.deepEqual(snapshot(f.writes),recorded.appliedMapWrites,'Applied map fields differ');assert.deepEqual(snapshot(f.calendarWrites),recorded.attemptedCalendarWrites);
 assert.deepEqual(snapshot(f.state),recorded.finalState,'Final map facts and human edit preservation differ');
 assert.deepEqual(comparable([...f.tasks.values()]),comparable(recorded.remainingTasks),'Remaining exact task facts/history differ');
 const actualSummary=summarizeRequests(f,requests);
 for(const key of ['sourceToolCalls','sourceTransportObservations','repeatedSuccessfulSourceProposals','observationHandoffSeen','observationReadNames'])assert.deepEqual(actualSummary[key],recorded[key],`Replay changed ${key}`);
 assert.deepEqual(requests.map(({messageBytes,...rest})=>rest),recorded.phaseRequests.map(({messageBytes,...rest})=>rest),'Model phase/reference/handoff sequence differs');
 return{matchedOutcome:true,matchedToolCallsAndResults:true,matchedExecutionSequence:true,matchedCheckpointVersionsAndSizes:true,matchedInitialStateAndOriginals:true,matchedFinalModelText:true,matchedAttemptedAndAppliedFields:true,matchedFinalMap:true,matchedRemainingTaskHistory:true,matchedSourceCallsAndHandoff:true,normalized:['q/t positional transport refs','runtime cycle UUIDs','runtime participation receipt UUIDs','runtime runner sync call IDs','JSON snapshot representation for write arguments/state (undefined properties omitted)']};
}
try{
 for(const scenario of selected){
  const recorded=replayMode?replayEvidence.cases.find(row=>row.name===scenario.name):null;if(replayMode)assert(recorded,'Recorded scenario is missing');
  active={name:scenario.name,networkRequests:0,passed:false,dispatches:[],returnedModelTurns:[],storageWrites:[],...(replayMode?{replayedTurns:0}: {})};report.cases.push(active);const f=scenario.setup(),requests=[],originalTaskStoreSave=f.taskStore.save;
  f.taskStore.save=async args=>{const wire=encodeTaskInfo(args.task.info),logical=decodeTaskInfo(wire);assert.deepEqual(logical,args.task.info);assert(postgresJsonBytes(wire)<=MAX_TASK_WIRE_BYTES);active.storageWrites.push({taskId:args.task.uuid,logicalBytes:bytes(logical),wireBytes:postgresJsonBytes(wire),expectedUpdatedAt:args.expectedUpdatedAt??null});return originalTaskStoreSave({...args,task:{...args.task,info:logical}});};
  const tools=f.adapters.tools.map(tool=>({...tool,execute:async(args,context)=>{const entry={name:tool.name,arguments:copy(args),inputIds:copy(context.inputIds),phase:context.phase};const result=await tool.execute(args,context);entry.result=copy(result);f.tools.push(entry);return result;}}));
  const provider={toolTurn:async request=>{const followup=request.system.includes('FOLLOWUP phase'),initialMessage=request.messages.find(row=>row.role==='user');let header;try{header=JSON.parse(initialMessage?.content??'{}');}catch{header={};}
   const observations=header.currentCycleObservations?.observations??[];requests.push({phase:followup?'followup':'initial',messageBytes:bytes(request.messages),observationCount:observations.length,observationNames:observations.map(row=>row.tool),inputRefCount:header.referenceBindings?.inputIds?.length??null});
   if(followup&&observations.length){assert.match(header.currentCycleObservations.notice,/not fresh reads or new permissions/);assert(bytes(request.messages)<=262144);}
   let result;if(replayMode){assert.deepEqual(await sourceHashes(),pins,'Frozen replay source changed');const original=recorded.returnedModelTurns[active.replayedTurns++];assert(original,'Replay requested more replies than the recorded real-model case');result=replayTurn(original,request);assert.deepEqual(comparable(result),comparable(original),'Replay altered non-reference model arguments');}else result=await raw.toolTurn(request);
   active.returnedModelTurns.push(copy(result));await persist();return result;}};
  const started=performance.now();
  try{active.outcome=await createAutomationHandler({...f.adapters,config:readAutomationConfig({AGENT_AUTOMATION_ENABLED:'true',AGENT_AUTOMATION_MAX_INPUTS:'5',AGENT_AUTOMATION_MAX_RUN_MS:'600000'}),tools,pipeline:{...f.adapters.pipeline,recordExecution:async row=>f.execution.push(copy(row))},store:f.store,provider,now:()=>new Date(now)}).tick();scenario.verify(f,active.outcome);safeMapPreservation(f);const actual=summarizeRequests(f,requests);assert.equal(actual.repeatedSuccessfulSourceProposals,0,'Unchanged complete equivalent source observations must be reused instead of explicitly refetched');if(scenario.name==='five-fresh-mixed-inputs-and-phase-reuse')assert(actual.observationHandoffSeen,'Real initial observations must reach follow-up in the phase-reuse scenario');if(replayMode){assert.equal(active.replayedTurns,recorded.returnedModelTurns.length,'Replay did not consume the exact recorded reply count');active.replayComparison=compareReplay(recorded,active,f,requests);}active.passed=true;}catch(error){active.failure=error?.code==='ERR_ASSERTION'?String(error.message).slice(0,1600):'scenario_execution_failed';process.exitCode=1;}
  Object.assign(active,{...summarizeRequests(f,requests),durationMs:Math.round(performance.now()-started),tools:f.tools,execution:f.execution,attemptedMapWrites:f.attempts,appliedMapWrites:f.writes,attemptedCalendarWrites:f.calendarWrites,before:f.before,finalState:f.state,remainingTasks:[...f.tasks.values()],finalModelText:active.returnedModelTurns.at(-1)?.text??'',initialOriginals:f.originals});await persist();
  console.log(JSON.stringify({case:active.name,passed:active.passed,networkRequests:active.networkRequests,status:active.outcome?.status,handled:active.outcome?.handled??0,sourceToolCalls:active.sourceToolCalls,phaseHandoffObserved:active.observationHandoffSeen,...(active.failure?{failure:active.failure}:{})}));
 }
}finally{globalThis.fetch=originalFetch;report.finishedAt=new Date().toISOString();report.pinsStable=JSON.stringify(await sourceHashes())===JSON.stringify(pins);await persist();}
console.log(JSON.stringify({evidence:reportFile,model:report.model,networkRequests:report.networkRequests,maxRequests,passed:report.cases.every(row=>row.passed),pinsStable:report.pinsStable}));
