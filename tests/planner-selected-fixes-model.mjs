import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {createProvider} from '../server/providers/index.js';
import {readConfig} from '../server/shared/config.js';
import {selectedFixture,input,task,ids,copy,originalUrl,preserveBusinessState,bytes,call,turn} from './fixtures/planner-selected-fixes.mjs';

const flag=name=>process.argv.find(value=>value.startsWith('--'+name+'='))?.slice(name.length+3);
const selected=process.argv.filter(value=>value.startsWith('--case=')).map(value=>value.slice(7));
const cap=Number(flag('max-requests')??48);assert(Number.isInteger(cap)&&cap>0&&cap<=48);
const evidenceDir=resolve(flag('evidence-dir')??'evidence/planner-selected-fixes-2026-10-26/model');
const hash=value=>createHash('sha256').update(value).digest('hex');
const files=['server/automation/handler.js','server/automation/conversation-context.js','server/automation/observation-handoff.js','server/automation/staged-pipeline.js','server/automation/adapters.js','server/automation/prompt.js','server/discord/live-retrieval.js','tools/discord/index.js','tests/fixtures/planner-selected-fixes.mjs','tests/planner-selected-fixes-model.mjs'];
const pins=async()=>Object.fromEntries(await Promise.all(files.map(async path=>[path,hash(await readFile(new URL('../'+path,import.meta.url)))])));
const fresh=(content='I will attend the Friday workshop at Bobst tonight for the entire event.')=>input(1,{content});
const setup=(options={})=>{const original=fresh(options.content),saved=task(1,{current:true,original,large:options.large??false,operation:options.operation??'participation',summary:options.summary});return {saved,original,f:selectedFixture({...options,pending:[saved]})};};
const targeted=process.argv.includes('--targeted-decisions'),replaySetup=process.argv.includes('--replay-setup'),recordedDecisionFile=flag('replay-recorded-decisions');
const targetedCases=[
  {name:'targeted-already-correct-decision',build:()=>setup({alreadyCorrect:true}),reason:'already_correct'},
  {name:'targeted-nonactionable-decision',build:()=>setup({content:'Thanks for sharing the slides. Have a nice weekend!',operation:'source_review',summary:'Review whether this message requires a Calendar or map update.'}),reason:'no_actionable_request'},
].map(scenario=>({...scenario,targeted:true,verify({f,saved}){preserveBusinessState(f);assert(!f.tasks.has(saved.uuid),'Actual model must close the exact saved task');assert.equal(f.tasks.size,0,'No replacement or duplicate saved task');assert(f.tools.some(row=>row.name==='resolve_pending_task'&&row.arguments.outcome==='no_change_needed'&&row.arguments.reason===scenario.reason&&row.result.status==='ready'&&row.result.resolutionOutcome==='no_change_needed'));}}));
const scenarios=targeted?targetedCases:[
  {name:'already-correct-saved-attendance',build:()=>setup({alreadyCorrect:true}),verify({f,saved}){preserveBusinessState(f);assert(!f.tasks.has(saved.uuid));assert(f.tools.some(row=>row.name==='resolve_pending_task'&&row.result.resolutionOutcome==='no_change_needed'));}},
  {name:'saved-nonactionable-review',build:()=>setup({content:'Thanks for sharing the slides. Have a nice weekend!',operation:'source_review',summary:'Review whether this message requires a Calendar or map update.'}),verify({f,saved}){preserveBusinessState(f);assert(!f.tasks.has(saved.uuid));assert(f.tools.some(row=>row.name==='resolve_pending_task'&&row.result.resolutionOutcome==='no_change_needed'));}},
  {name:'exact-missing-original',build:()=>setup({missing:['301']}),verify({f,saved,original}){preserveBusinessState(f);assert(!f.tasks.has(saved.uuid));assert(f.tools.some(row=>row.result.outcome==='source_missing'));assert(f.tools.some(row=>row.name==='resolve_pending_task'&&row.result.resolutionOutcome==='source_missing'));assert(f.finishPackets.some(row=>row.handledInputIds.includes(original.uuid)));}},
  {name:'denied-source-preserves-saved-work',build:()=>setup({authFailure:'permission_denied'}),verify({f,saved}){preserveBusinessState(f);assert(f.tasks.has(saved.uuid));assert(f.tools.some(row=>row.name==='read_discord_messages'&&row.result.status==='permission_denied'));assert(!f.tools.some(row=>row.name==='resolve_pending_task'&&row.result.status==='ready'));}},
  {name:'long-history-selects-calendar-backed-event',build:()=>setup({legacyEvent:true,large:true}),verify({f,saved,original}){
    assert(!f.tasks.has(saved.uuid));assert.equal(f.calendarWrites.length,0);assert(f.writes.length>0);
    assert(f.writes.every(row=>row.event.id===ids.event),'Every applied map write targets the pinned Calendar event');
    const oldLegacy=f.before.events.find(row=>row.id!==ids.event);assert.deepEqual(f.state.events.find(row=>row.id===oldLegacy.id),oldLegacy);
    const parent=f.state.events.find(row=>row.id===ids.event),old=f.before.events.find(row=>row.id===ids.event);assert.deepEqual({...parent,updated_at:old.updated_at},old);
    assert.deepEqual(f.state.event_people.find(row=>row.person_id===ids.other),f.before.event_people.find(row=>row.person_id===ids.other));
    const person=f.state.event_people.find(row=>row.event_id===ids.event&&row.person_id===ids.person);assert(person);assert.equal(person.attendance_status,'going');assert.equal(person.source_url,originalUrl(original));
    assert(f.requests.every(request=>bytes(request.messages)<=262144));
  }},
];
const cases=scenarios.filter(row=>!selected.length||selected.includes(row.name));assert(cases.length);

// The bounded retest records production-generated preparation through scripted
// model replies, lets the real model choose ONE decision with the complete
// unmodified production request/catalogue, and uses local finish bookkeeping.
// It does not establish a fresh complete real-model conversation.
function targetedProvider(built,scenario,delegate,record) {
  const {f,saved,original}=built;let prepared=0,decided=false;
  return {toolTurn:async request=>{
    const bindings=request.messages.filter(row=>row.role==='user').map(row=>{try{return JSON.parse(row.content);}catch{return null;}}).filter(Boolean);
    const current=bindings.findLast(row=>row.referenceBindings)?.referenceBindings;
    const ref=current.inputIds.find(row=>row.uuid===(current.phase==='initial'?original.uuid:saved.uuid))?.ref;assert(ref);
    const scripted=proposal=>{record.scriptedSetup.push({proposal:copy(proposal),phase:current.phase});return proposal;};
    if(current.phase==='initial')return scripted(turn(call('finish_batch','prepared_initial',{handledInputIds:[ref],noChangeInputIds:[]})));
    if(prepared++===0)return scripted(turn(call('read_pending_task','prepared_task',{taskId:ref},[ref])));
    if(prepared===2)return scripted(turn(call('read_discord_messages','prepared_original',{url:originalUrl(original),context:false},[ref])));
    if(scenario.reason==='already_correct'){
      if(prepared===3)return scripted(turn(call('lookup_map_person','prepared_identity',{provider:'discord',providerUserId:original.raw_response.payload.author.id,sourceId:ids.source,sourceUrl:originalUrl(original)},[ref])));
      if(prepared===4)return scripted(turn(call('read_map_events','prepared_target',{sourceId:ids.club,sourceRecordId:'workshop20261023'},[ref])));
      if(prepared===5)return scripted(turn(call('patch_map_participation','prepared_noop',{eventId:ids.event,expectedUpdatedAt:f.state.events.find(row=>row.id===ids.event).updated_at,changes:[{personId:ids.person,sourceUrl:originalUrl(original),attendanceStatus:'going',start:{inherit:true},end:{inherit:true}}]},[ref])));
    }
    if(!decided){
      const modelResults=request.messages.filter(row=>row.role==='tool').map(row=>JSON.parse(row.content));
      const hints=modelResults.flatMap(row=>row.resolutionHints??[]);assert(hints.some(row=>row.arguments.arguments.reason===scenario.reason),'Production-generated copyable task refs are visible');
      const originalRead=f.tools.find(row=>row.name==='read_discord_messages');assert.equal(originalRead.result.status,'ready');assert(originalRead.result.sources.length);
      if(scenario.reason==='already_correct'){
        const noop=f.tools.find(row=>row.name==='patch_map_participation')?.result;assert.equal(noop?.status,'ready');assert.equal(noop.outcome,'no_change_needed');assert.equal(noop.reason,'already_correct');assert.equal(noop.changed,false);assert(!noop.receiptId);assert(modelResults.at(-1).resolutionHints?.length);
      }
      preserveBusinessState(f);record.preparedEvidence={request:copy({...request,signal:undefined}),setupTools:copy(f.tools)};
      decided=true;const result=await delegate.toolTurn(request);record.actualDecision=copy(result);return result;
    }
    record.localFinish={handledInputIds:[]};return turn(call('finish_batch','local_finish_after_decision',{handledInputIds:[]}));
  }};
}

if(replaySetup||recordedDecisionFile){
  assert(targeted&&!process.argv.includes('--live-model'));
  const recorded=recordedDecisionFile?JSON.parse(await readFile(resolve(recordedDecisionFile),'utf8')):null,currentPins=await pins();
  if(recorded)assert.equal(currentPins['server/automation/prompt.js'],recorded.sourcePins['server/automation/prompt.js'],'Recorded real-model decisions use this unchanged prompt');
  const offline={startedAt:new Date().toISOString(),kind:recorded?'offline_recorded_model_decision_replay':'offline_scripted_setup_replay',modelRequests:0,recordedModel:recorded?.model,recordedDecisionFile,sourcePins:currentPins,recordedSourcePins:recorded?.sourcePins,cases:[]};
  for(const scenario of cases){
    const built=scenario.build(),record={name:scenario.name,scriptedSetup:[]};
    const local={toolTurn:async request=>{
      const visible=request.messages.filter(row=>row.role==='tool').map(row=>JSON.parse(row.content));const hint=visible.flatMap(row=>row.resolutionHints??[]).find(row=>row.arguments.arguments.reason===scenario.reason);assert(hint);
      if(!recorded)return turn({id:'local_replay_only',name:hint.tool,arguments:hint.arguments});
      const prior=recorded.cases.find(row=>row.name===scenario.name);assert(prior?.passed);assert.equal(prior.actualDecision.toolCalls.length,1);
      const reply=copy(prior.actualDecision),proposal=reply.toolCalls[0];assert.equal(proposal.name,'resolve_pending_task');assert.equal(proposal.arguments.arguments.outcome,'no_change_needed');assert.equal(proposal.arguments.arguments.reason,scenario.reason);assert.equal(proposal.arguments.inputIds.length,1);assert.equal(proposal.arguments.arguments.taskId,proposal.arguments.inputIds[0]);
      record.recordedDecision=copy(prior.actualDecision);proposal.arguments.inputIds=copy(hint.arguments.inputIds);proposal.arguments.arguments.taskId=hint.arguments.arguments.taskId;record.reboundDecision=copy(reply);return reply;
    }};
    record.outcome=await built.f.run(targetedProvider(built,scenario,local,record));scenario.verify(built);assert.equal(record.outcome.followupStatus,'completed');
    Object.assign(record,{passed:true,tools:copy(built.f.tools),attemptedMapWrites:copy(built.f.attempts),appliedMapWrites:copy(built.f.writes),attemptedCalendarWrites:copy(built.f.calendarWrites),initialMap:copy(built.f.before),finalMap:copy(built.f.state),remainingTasks:copy([...built.f.tasks.values()])});offline.cases.push(record);
    console.log(JSON.stringify({case:scenario.name,modelRequests:0,replaySetupPassed:true,recordedDecisionRebound:Boolean(recorded),setupCalls:record.scriptedSetup.length}));
  }
  assert.deepEqual(await pins(),currentPins,'Runtime fixed for offline replay');
  if(recorded){const output=resolve(flag('replay-evidence-file')??'evidence/planner-selected-fixes-2026-10-26/tester-recorded-decisions-after-target-fix.json');offline.finishedAt=new Date().toISOString();await writeFile(output,JSON.stringify(offline,null,2),{mode:0o600});console.log(JSON.stringify({offlineEvidence:output,modelRequests:0}));}
  process.exit(0);
}
if(!process.argv.includes('--live-model')){console.log(JSON.stringify({cases:cases.map(row=>row.name),modelRequests:0,cap,network:'Configured inference only in --live-model mode; production business adapters use simulated clients and storage.'}));process.exit(0);}

await mkdir(evidenceDir,{recursive:true,mode:0o700});
const ledgerFile=resolve(evidenceDir,'ledger.json');let ledger;
try{ledger=JSON.parse(await readFile(ledgerFile,'utf8'));assert.equal(ledger.cap,cap);}catch(error){if(error.code!=='ENOENT')throw error;ledger={cap,requests:0,dispatches:[]};}
const config=readConfig();assert(config.configured,'Configured model unavailable; credentials are never printed');
const endpoint=config.baseUrl.replace(/\/$/,'')+'/'+(config.provider==='anthropic'?'messages':'chat/completions');
const sourcePins=await pins(),originalFetch=globalThis.fetch;
const report={startedAt:new Date().toISOString(),model:config.model,provider:config.provider,sourcePins,requestCap:cap,requestsAtStart:ledger.requests,cases:[],limitations:['Actual configured model with production runner/adapters; business services and data are simulated.','No scripted model replies are used in this API evaluation.','No live Discord, Google, Supabase or deployment calls/writes.','Missing and denied conditions are simulated at the production Discord client boundary.','Cases exercise one model and one attempt each; deterministic preservation tests provide separate regression evidence.']};
if(targeted)report.limitations=['Two targeted real-model decisions only, after recorded scripted preparation through production runner/adapters; local finish bookkeeping follows each decision.','The real-model request uses the full unmodified production prompt, messages and tool catalogue; no forced tool choice.','This does not establish a fresh complete real-model conversation or a fresh five-scenario pass.','Source/storage boundaries are simulated; only the configured inference endpoint is permitted.','One actual HTTP request per decision including retries; shared total cap remains48.'];
const reportFile=resolve(evidenceDir,'run-'+Date.now()+'.json');
const persist=async()=>{await writeFile(ledgerFile,JSON.stringify(ledger,null,2),{mode:0o600});await writeFile(reportFile,JSON.stringify(report,null,2),{mode:0o600});};await persist();let active,controller;
const guardedFetch=async(value,options={})=>{
  assert.equal(String(value),endpoint,'Network restricted to the exact configured inference endpoint');assert.deepEqual(await pins(),sourcePins,'Runtime must remain fixed during real-model evaluation');
  if(active.maxActual&&active.requestCount>=active.maxActual){active.capStopped=true;controller.abort();throw Error('Single-decision HTTP request cap reached');}
  if(ledger.requests>=cap){active.capStopped=true;controller.abort();throw Error('Hard inference request cap reached');}
  const dispatch={sequence:++ledger.requests,case:active.name,startedAt:new Date().toISOString()};ledger.dispatches.push(dispatch);active.requestCount++;await persist();
  try{const response=await originalFetch(value,{...options,redirect:'error'});dispatch.httpStatus=response.status;dispatch.finishedAt=new Date().toISOString();await persist();return response;}catch(error){dispatch.failed=error?.name==='AbortError'?'aborted':'transport_failure';await persist();throw error;}
};
globalThis.fetch=guardedFetch;
const provider=createProvider(config,{fetchImpl:guardedFetch,audit:{required:false,startModel:async()=>({status:'ready'}),finishModel:async()=>({status:'ready'})},writeDiagnostic:()=>{}});
try{
  for(const scenario of cases){
    if(ledger.requests>=cap){report.cases.push({name:scenario.name,notRun:'hard request cap'});break;}
    const built=scenario.build(),{f}=built;controller=new AbortController();active={name:scenario.name,requestCount:0,passed:false,...(scenario.targeted?{maxActual:1,scriptedSetup:[]}:{} )};report.cases.push(active);
    const wrapped={toolTurn:async request=>{const reply=await provider.toolTurn(request);return reply;}};
    try{active.outcome=await f.run(scenario.targeted?targetedProvider(built,scenario,wrapped,active):wrapped,{signal:controller.signal});scenario.verify(built);assert.equal(active.outcome.status,'completed');if(scenario.targeted){assert.equal(active.outcome.followupStatus,'completed');assert.equal(active.requestCount,1);}active.passed=true;}
    catch(error){active.failure=error?.code==='ERR_ASSERTION'?String(error.message).slice(0,1200):'scenario_execution_failed';process.exitCode=1;}
    Object.assign(active,{proposals:f.proposals,tools:f.tools,execution:f.execution,attemptedMapWrites:f.attempts,appliedMapWrites:f.writes,attemptedCalendarWrites:f.calendarWrites,initialMap:f.before,finalMap:f.state,initialOriginals:f.originals,remainingTasks:[...f.tasks.values()],queueFinishes:f.finishPackets,messageBytes:f.requests.map(request=>bytes(request.messages)),finalModelText:f.proposals.at(-1)?.text??''});await persist();
    console.log(JSON.stringify({case:active.name,passed:active.passed,requests:active.requestCount,status:active.outcome?.status,appliedMapWrites:f.writes.length,remainingTasks:f.tasks.size,...(active.failure?{failure:active.failure}:{})}));
  }
}finally{globalThis.fetch=originalFetch;report.finishedAt=new Date().toISOString();report.requestsAtEnd=ledger.requests;report.pinsStable=JSON.stringify(await pins())===JSON.stringify(sourcePins);await persist();}
console.log(JSON.stringify({model:report.model,requests:ledger.requests,cap,passed:report.cases.every(row=>row.passed),evidence:reportFile,pinsStable:report.pinsStable}));
