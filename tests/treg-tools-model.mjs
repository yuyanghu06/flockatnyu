import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {readConfig} from '../server/config.js';
import {createProvider} from '../server/providers/index.js';
import {modelCaseNames,modelScenario,hiddenProviderValue,fixtureSecret} from './fixtures/treg-tools.mjs';

const selected=process.argv.filter(value=>value.startsWith('--case=')).map(value=>value.slice(7)),chosen=modelCaseNames.filter(name=>!selected.length||selected.includes(name));assert(chosen.length);
const syntheticConfig=readConfig({LLM_PROVIDER:'openai-compatible',LLM_MODEL:'offline-fixture',LLM_API_KEY:'inert'});
if(process.argv.includes('--self-check')){
 for(const name of chosen){
  const s=modelScenario(name),proposals=[];let turn=0;
  const call=name==='saved-only'?{name:'search_contacts',arguments:{query:'Rae Example'}}:name==='ambiguous'?null:name==='batch-mixed'?{name:'enrich_treg_people',arguments:{emails:['rae@example.com','missing@example.com','failed@example.com']}}:{name:'search_treg_people',arguments:{company_domain:'example.com',limit:name==='untrusted-no-save'?1:2}};
  const answerText=name==='saved-only'?'The saved workplace is Saved Workplace.':name==='ambiguous'?'What email address should I enrich?':name==='unavailable'?'Treg is unavailable.':name==='batch-mixed'?'rae@example.com: Example Labs. missing@example.com: no match. failed@example.com: lookup failed.':name==='discovery'?'Rae Example, rae@example.com; Jordan Sample, jordan@example.com. Nothing was saved.':'Rae Example works at Example Labs, rae@example.com. Nothing was saved.';
  const provider={async toolTurn(){const toolCalls=turn++===0&&call?[{id:'scripted-'+name,...call}]:[];proposals.push(toolCalls);return {text:'',toolCalls};},async *stream(){yield answerText;}};
  const answer=await s.run(provider,syntheticConfig);s.verify(answer,proposals);console.log(JSON.stringify({case:name,passed:true,kind:'Scripted fixture mechanics only',inferenceDispatches:0}));
 }
 process.exit(0);
}
if(!process.argv.includes('--live-model')){console.log(JSON.stringify({cases:chosen,inferenceDispatches:0,scope:'Production chat runner, Treg clients/tools and private logs; simulated Treg/Contacts; requires source-freeze GO before --live-model.'}));process.exit(0);}
const config=readConfig();assert(config.configured,'Configured inference unavailable; credentials remain private');
const maxRequests=Number(process.argv.find(value=>value.startsWith('--max-requests='))?.slice(15)??28),perCase=Number(process.argv.find(value=>value.startsWith('--max-per-case='))?.slice(15)??6);
assert(Number.isInteger(maxRequests)&&maxRequests>0&&maxRequests<=28);assert(Number.isInteger(perCase)&&perCase>0&&perCase<=6);
const files=['tools/treg/index.js','tools/contacts/index.js','server/assistant-context.js','server/chat-runner.js','server/chat-behavior.js','server/contacts.js','server/contacts-search.js','server/treg-people.js','server/treg-enrich.js','server/treg-call-log.js','server/tool-diagnostics.js','server/config.js','server/providers/index.js','server/providers/retry.js','server/automation/validation.js','tests/treg-tools-model.mjs','tests/fixtures/treg-tools.mjs','tests/fixtures/contacts-store.mjs'];
const hashes=async()=>Object.fromEntries(await Promise.all(files.map(async file=>[file,createHash('sha256').update(await readFile(new URL('../'+file,import.meta.url))).digest('hex')])));
const pins=await hashes(),directory=new URL('../evidence/treg-agent-tools/model-'+new Date().toISOString().replace(/[:.]/g,'-')+'/',import.meta.url);await mkdir(directory,{recursive:true,mode:0o700});
const report={provider:config.provider,model:config.model,pins,maxRequests,maxRequestsPerCase:perCase,networkRequests:0,startedAt:new Date().toISOString(),cases:[],limitations:['Only configured inference network is allowed. Treg and Contacts transports are simulated using production clients/tools and runner.','This is a small real-model behavior sample, not a live Treg lookup, live website/Discord verification, deployed runtime or database mutation.','Synthetic prompts, tool proposals/results and final answers are private evaluation evidence; no credentials are recorded.']};
const evidence=new URL('report.json',directory),persist=()=>writeFile(evidence,JSON.stringify(report,null,2)+'\n',{mode:0o600});await persist();
const originalFetch=globalThis.fetch,endpoint=`${config.baseUrl.replace(/\/$/,'')}/${config.provider==='anthropic'?'messages':'chat/completions'}`;let active;
globalThis.fetch=async(url,options)=>{
 assert.equal(String(url),endpoint,'Only exact configured inference endpoint may receive network');assert.deepEqual(await hashes(),pins,'Frozen sources changed');
 if(report.networkRequests>=maxRequests||active.networkRequests>=perCase){active.budgetStopped=true;throw Error('Hard inference dispatch cap reached');}
 report.networkRequests++;active.networkRequests++;await persist();return originalFetch(url,{...options,redirect:'error'});
};
const provider=createProvider(config,{fetchImpl:globalThis.fetch,audit:{required:false,startModel:async()=>({status:'ready'}),finishModel:async()=>({status:'ready'})},writeDiagnostic:()=>{}});
try{
 for(const name of chosen){
  if(report.networkRequests>=maxRequests){report.budgetStopped=true;process.exitCode=1;break;}
  const s=modelScenario(name);active={name,userMessage:s.text,networkRequests:0,proposals:[],planningInputs:[],answerInputs:[],passed:false,initialState:s.initial};report.cases.push(active);await persist();
  const wrapped={async toolTurn(input){active.planningInputs.push(structuredClone(input));const reply=await provider.toolTurn(input);active.proposals.push(structuredClone(reply.toolCalls));await persist();return reply;},async *stream(input){active.answerInputs.push(structuredClone(input));await persist();yield*provider.stream(input);}};
  try{
   active.answer=await s.run(wrapped,config,{signal:AbortSignal.timeout(120000)});assert(!active.budgetStopped,'Budget stop cannot count as success');s.verify(active.answer,active.proposals);
   for(const marker of [hiddenProviderValue,fixtureSecret])assert(!JSON.stringify([...active.planningInputs,...active.answerInputs]).includes(marker),'Private raw data reached model input');
   if(['discovery','batch-mixed','untrusted-no-save'].includes(name)){assert(JSON.stringify(active.answerInputs).includes('Example Labs'),'Answer stage must receive actual returned fields');assert(active.planningInputs.slice(1).some(input=>JSON.stringify(input).includes('Example Labs')),'Later planning stage must receive actual returned fields');}
   active.passed=true;
  }catch(error){active.failure=String(error.message).slice(0,1000);process.exitCode=1;}
  Object.assign(active,{calls:s.calls,tregRequests:s.f.requests.map(request=>({path:request.path,body:request.body})),attemptedWrites:s.storage.attempts,appliedWrites:s.storage.applied,finalState:s.storage.state,records:s.records,audit:s.audit});await persist();
  console.log(JSON.stringify({case:name,passed:active.passed,inferenceDispatches:active.networkRequests,...(active.failure?{failure:active.failure}:{})}));
 }
}finally{globalThis.fetch=originalFetch;report.finishedAt=new Date().toISOString();report.pinsStable=JSON.stringify(await hashes())===JSON.stringify(pins);await persist();}
console.log(JSON.stringify({evidence:evidence.pathname,model:report.model,inferenceDispatches:report.networkRequests,cases:report.cases.length,passed:report.cases.length===chosen.length&&report.cases.every(row=>row.passed),pinsStable:report.pinsStable}));
