import {chatSourceFiles} from './fixtures/chat-source-files.mjs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,mkdtemp,mkdir,writeFile,chmod} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {createProvider} from '../server/providers/index.js';
import {readConfig} from '../server/shared/config.js';
import {recoveryCase,assertPrefix,verifyRecovery,attendanceArguments} from './fixtures/chat-map-recovery.mjs';

const names=['duplicate-already-recorded','duplicate-new-attendee','conflict-preserves-human-edit','unavailable-write-honest'];
const selected=process.argv.filter(value=>value.startsWith('--case=')).map(value=>value.slice(7));
const chosen=names.filter(name=>!selected.length||selected.includes(name));assert(chosen.length,'No matching scenario');
function prefixProvider(scenario,recovery,record){
  let index=0,observed=false;
  return {async toolTurn(args){
    if(index<scenario.prefix.length){const turn=structuredClone(scenario.prefix[index++]);record.scriptedTurns.push(turn);return turn;}
    if(!observed){observed=true;record.modelStartCallIndex=scenario.f.calls.length;record.scriptedStorageAttempts=scenario.f.attempts.length;record.scriptedConfirmedWrites=scenario.f.writes.length;record.scriptedCommittedWithoutReceipt=structuredClone(scenario.committedWithoutReceipt);record.visiblePrefixResults=args.messages.filter(row=>row.role==='tool').map(row=>JSON.parse(row.content));
      try{assertPrefix(scenario,record.visiblePrefixResults);record.prefixValidated=true;}catch(error){record.prefixValidationFailure=error.message;throw error;}
    }
    const turn=await recovery.toolTurn(args);record.modelProposals.push(structuredClone(turn.toolCalls));return turn;
  },async *stream(args){assert(record.prefixValidated,record.prefixValidationFailure??'Known failure prefix must be verified before any final inference');yield* recovery.stream(args);}};
}
const recordBase=name=>({name,scriptedPrefixDescription:'SCRIPTED failed tool-result prefix executed through production adapters; configured model evaluates recovery only, not initial tool choice. The lost-receipt case actually commits despite its failed response.',scriptedTurns:[],modelProposals:[],networkRequests:0,prefixValidated:false,passed:false});
const modelTools=(scenario,record)=>scenario.f.calls.slice(record.modelStartCallIndex??scenario.f.calls.length).filter(row=>row.arguments);

async function selfCheck(){
  const config=readConfig({LLM_PROVIDER:'openai-compatible',LLM_MODEL:'scripted-fixture-only',LLM_API_KEY:'synthetic-key'});
  for(const name of names){const scenario=recoveryCase(name),record=recordBase(name);let step=0;
    const recovery={async toolTurn(){
      if(name==='duplicate-already-recorded'||name==='unavailable-write-honest')return {text:'',toolCalls:[]};
      if(name==='conflict-preserves-human-edit'&&step===0){step++;return {text:'',toolCalls:[{id:'scripted_recovery_read',name:'read_map_events',arguments:{}}]};}
      if(step++>(name==='conflict-preserves-human-edit'?1:0))return {text:'',toolCalls:[]};
      return {text:'',toolCalls:[{id:'scripted_recovery_write',name:'upsert_map_event',arguments:attendanceArguments(scenario.expectedBase)}]};
    },async *stream(){yield name==='unavailable-write-honest'?'I could not confirm saving your attendance because the write response was unavailable.':name==='duplicate-already-recorded'?'You are already recorded as going.':'You are marked as going.';}};
    const answer=await scenario.f.run(prefixProvider(scenario,recovery,record),config,scenario.messages);assert(record.prefixValidated,record.prefixValidationFailure??'Known failure prefix was not verified');verifyRecovery(scenario,{modelProposals:record.modelProposals,modelTools:modelTools(scenario,record),answer});
    console.log(JSON.stringify({case:name,passed:true,kind:'SCRIPTED fixture mechanics only',inferenceRequests:0}));
  }
}
if(process.argv.includes('--self-check')){await selfCheck();process.exit(0);}
if(!process.argv.includes('--live-model')){console.log(JSON.stringify({inferenceRequests:0,cases:chosen,scope:'Explicitly scripted failure prefix followed by real configured-model recovery only. Use --self-check offline; --live-model requires setup review.'}));process.exit(0);}

const config=readConfig();assert(config.configured,'Configured model is unavailable; no credentials printed');
const maxRequests=Number(process.argv.find(value=>value.startsWith('--max-requests='))?.slice(15)??20);
assert(Number.isInteger(maxRequests)&&maxRequests>=1&&maxRequests<=20,'Hard total inference dispatch cap must be1through20');
const files=[...new Set([...(await chatSourceFiles()),'tests/fixtures/chat-source-files.mjs',...['server/chat/runner.js','server/chat/context.js','server/chat/behavior.js','server/chat/request-context.js','server/chat/discord-context.js','server/providers/index.js','server/providers/retry.js','server/shared/config.js','server/shared/time-zone.js','server/audit/diagnostics.js','server/audit/diagnostic-codes.js','server/audit/argument-diagnostics.js','server/map/chat-time.js','server/map/events.js','server/map/contracts.js','server/map/source-access.js','server/map/read-comparison.js','server/automation/local-clock-boundary.js','server/automation/validation.js','tools/map/chat.js','tools/map/index.js','tests/fixtures/chat-map-time.mjs','tests/fixtures/chat-map-recovery.mjs','tests/chat-map-recovery-model.mjs']])].sort();
const hashes=async()=>Object.fromEntries(await Promise.all(files.map(async file=>[file,createHash('sha256').update(await readFile(new URL(`../${file}`,import.meta.url))).digest('hex')])));
const pins=await hashes(),folder=await mkdtemp('/tmp/flock-chat-map-recovery-'),evidence=join(folder,'evidence.json');await chmod(folder,0o700);
for(const file of files){const target=join(folder,'source',file);await mkdir(dirname(target),{recursive:true});await writeFile(target,await readFile(new URL(`../${file}`,import.meta.url)),{mode:0o600});}
const report={provider:config.provider,model:config.model,maxRequests,maxRequestsPerCase:6,networkRequests:0,startedAt:new Date().toISOString(),selectedCases:chosen,pins,cases:[],limitations:['Scripted prefix guarantees the known failure. Actual configured model chooses recovery; this does not establish initial tool choice.','All map storage and identity responses are synthetic in-memory data; no business clients or business-network writes.','Prior accepted time/ambiguity ledgers remain separate.']};
const persist=()=>writeFile(evidence,JSON.stringify(report,null,2)+'\n',{mode:0o600});await persist();
const originalFetch=globalThis.fetch,endpoint=`${config.baseUrl.replace(/\/$/,'')}/${config.provider==='anthropic'?'messages':'chat/completions'}`;let active;
globalThis.fetch=async(url,options)=>{
  assert.equal(String(url),endpoint,'Only the exact configured inference endpoint may receive network traffic');assert.deepEqual(await hashes(),pins,'Pinned source changed before inference dispatch');
  if(report.networkRequests>=maxRequests||active.networkRequests>=6){active.budgetStopped=true;throw Error('Hard inference dispatch cap reached');}
  report.networkRequests++;active.networkRequests++;await persist();return originalFetch(url,{...options,redirect:'error'});
};
const raw=createProvider(config,{fetchImpl:globalThis.fetch,audit:{required:false,startModel:async()=>({status:'ready'}),finishModel:async()=>({status:'ready'})},writeDiagnostic:()=>{}});
try{for(const name of chosen){
  const scenario=recoveryCase(name);active=recordBase(name);report.cases.push(active);const started=performance.now();
  try{const answer=await scenario.f.run(prefixProvider(scenario,raw,active),config,scenario.messages,{signal:AbortSignal.timeout(90000)});Object.assign(active,{answer,tools:scenario.f.calls,attempts:scenario.f.attempts,writes:scenario.f.writes,committedWithoutReceipt:scenario.committedWithoutReceipt,finalState:scenario.f.state,expectedBase:scenario.expectedBase});assert(active.prefixValidated,active.prefixValidationFailure??'Known failure prefix was not verified');verifyRecovery(scenario,{modelProposals:active.modelProposals,modelTools:modelTools(scenario,active),answer});assert(!active.budgetStopped,'Budget exhaustion cannot count as recovery');active.passed=true;}
  catch(error){active.failure=error.message;Object.assign(active,{tools:scenario.f.calls,attempts:scenario.f.attempts,writes:scenario.f.writes,committedWithoutReceipt:scenario.committedWithoutReceipt,finalState:scenario.f.state,expectedBase:scenario.expectedBase});process.exitCode=1;}
  active.durationMs=Math.round(performance.now()-started);active.scriptedToolProposals=active.scriptedTurns.reduce((count,turn)=>count+turn.toolCalls.length,0);active.actualModelToolProposals=active.modelProposals.flat().length;await persist();console.log(JSON.stringify({case:name,passed:active.passed,scriptedToolProposals:active.scriptedToolProposals,inferenceDispatches:active.networkRequests,actualModelToolProposals:active.actualModelToolProposals,...(active.failure?{failure:active.failure}:{})}));
}}
finally{globalThis.fetch=originalFetch;report.finishedAt=new Date().toISOString();report.pinsStable=JSON.stringify(await hashes())===JSON.stringify(pins);await persist();}
console.log(JSON.stringify({evidence,model:report.model,inferenceDispatches:report.networkRequests,passed:report.cases.every(row=>row.passed),pinsStable:report.pinsStable}));
