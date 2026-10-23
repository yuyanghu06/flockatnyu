import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,mkdtemp,mkdir,writeFile,chmod} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {createProvider} from '../server/providers/index.js';
import {readConfig} from '../server/config.js';
import {scenario,caseNames,selfCheckProvider} from './fixtures/chat-steering-model.mjs';
const selected=process.argv.filter(value=>value.startsWith('--case=')).map(value=>value.slice(7));
const chosen=caseNames.filter(name=>!selected.length||selected.includes(name));assert(chosen.length);
if(process.argv.includes('--self-check')){
  const config=readConfig({LLM_PROVIDER:'openai-compatible',LLM_MODEL:'offline-scripted',LLM_API_KEY:'inert'});
  for(const name of chosen){const s=scenario(name),base=selfCheckProvider(s),proposals=[];
    const provider={...base,async toolTurn(input){const turn=await base.toolTurn(input);proposals.push(turn.toolCalls);return turn;}};
    const answer=await s.run(provider,config);s.verify(answer,proposals);console.log(JSON.stringify({case:name,passed:true,kind:'Scripted fixture mechanics only',inferenceRequests:0}));
  }process.exit(0);
}
if(!process.argv.includes('--live-model')){console.log(JSON.stringify({cases:chosen,inferenceRequests:0,scope:'Actual configured model initial tool choice and same-run steering. --live-model requires setup review and parent GO.'}));process.exit(0);}
const config=readConfig();assert(config.configured,'Configured model unavailable; no credentials printed');
const maxRequests=Number(process.argv.find(value=>value.startsWith('--max-requests='))?.slice(15)??12);assert(Number.isInteger(maxRequests)&&maxRequests>0&&maxRequests<=12);
const files=['server/chat-runner.js','server/chat-steering.js','server/assistant-context.js','server/chat-behavior.js','server/chat-request-context.js','server/chat-discord-context.js','server/providers/index.js','server/providers/retry.js','server/config.js','server/time-zone.js','server/tool-diagnostics.js','server/map/chat-time.js','server/map/events.js','server/map/contracts.js','server/map/source-access.js','server/map/read-comparison.js','server/automation/local-clock-boundary.js','server/automation/validation.js','tools/map/chat.js','tools/map/index.js','tests/fixtures/chat-map-time.mjs','tests/fixtures/chat-steering-model.mjs','tests/chat-steering-model.mjs'];
const hashes=async()=>Object.fromEntries(await Promise.all(files.map(async file=>[file,createHash('sha256').update(await readFile(new URL(`../${file}`,import.meta.url))).digest('hex')])));
const pins=await hashes(),folder=await mkdtemp('/tmp/flock-chat-steering-model-'),evidence=join(folder,'evidence.json');await chmod(folder,0o700);
for(const file of files){const target=join(folder,'source',file);await mkdir(dirname(target),{recursive:true});await writeFile(target,await readFile(new URL(`../${file}`,import.meta.url)),{mode:0o600});}
const report={provider:config.provider,model:config.model,maxRequests,maxRequestsPerCase:7,networkRequests:0,pins,startedAt:new Date().toISOString(),cases:[],limitations:['Synthetic map storage and trusted Discord actor; website authorization/transport are separately exercised offline.','No business-network I/O. All initial and recovery model choices are actual configured-model responses; only injection timing is controlled.','Machine assertions require independent semantic review; prior map-time/recovery evidence is separate.']};
const persist=()=>writeFile(evidence,JSON.stringify(report,null,2)+'\n',{mode:0o600});await persist();
const originalFetch=globalThis.fetch,endpoint=`${config.baseUrl.replace(/\/$/,'')}/${config.provider==='anthropic'?'messages':'chat/completions'}`;let active;
globalThis.fetch=async(url,options)=>{
  assert.equal(String(url),endpoint,'Only configured inference endpoint may receive network');assert.deepEqual(await hashes(),pins,'Pinned sources changed before inference');
  if(report.networkRequests>=maxRequests||active.networkRequests>=7){active.budgetStopped=true;throw Error('Hard inference dispatch cap reached');}
  report.networkRequests++;active.networkRequests++;await persist();return originalFetch(url,{...options,redirect:'error'});
};
const raw=createProvider(config,{fetchImpl:globalThis.fetch,audit:{required:false,startModel:async()=>({status:'ready'}),finishModel:async()=>({status:'ready'})},writeDiagnostic:()=>{}});
try{for(const name of chosen){const s=scenario(name);active={name,networkRequests:0,proposals:[],modelInputs:[],passed:false};report.cases.push(active);
  const provider={async toolTurn(input){active.modelInputs.push(structuredClone({phase:'tools',messages:input.messages}));const turn=await raw.toolTurn(input);active.proposals.push(structuredClone(turn.toolCalls));await persist();return turn;},
    async *stream(input){active.modelInputs.push(structuredClone({phase:'answer',messages:input.messages}));yield*raw.stream(input);}};
  try{active.answer=await s.run(provider,config,{signal:AbortSignal.timeout(90000)});assert(!active.budgetStopped,'Cap exhaustion cannot count as success');s.verify(active.answer,active.proposals);active.passed=true;}
  catch(error){active.failure=error.message;process.exitCode=1;}
  Object.assign(active,{records:s.records,audit:s.audit,injections:s.injections,initialMessages:s.messages,injectedText:s.correction,tools:s.f.calls,attempts:s.f.attempts,writes:s.f.writes,finalState:s.f.state});await persist();
  console.log(JSON.stringify({case:name,passed:active.passed,inferenceDispatches:active.networkRequests,...(active.failure?{failure:active.failure}:{})}));
}}
finally{globalThis.fetch=originalFetch;report.finishedAt=new Date().toISOString();report.pinsStable=JSON.stringify(await hashes())===JSON.stringify(pins);await persist();}
console.log(JSON.stringify({evidence,model:report.model,inferenceDispatches:report.networkRequests,passed:report.cases.every(row=>row.passed),pinsStable:report.pinsStable}));
