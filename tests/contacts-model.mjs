import {chatSourceFiles} from './fixtures/chat-source-files.mjs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,mkdir,writeFile,chmod} from 'node:fs/promises';
import {createProvider} from '../server/providers/index.js';
import {readConfig} from '../server/shared/config.js';
import {caseNames,scenario,scriptedFixtureProvider} from './fixtures/contacts-model.mjs';

const selected=process.argv.filter(value=>value.startsWith('--case=')).map(value=>value.slice(7));
const chosen=caseNames.filter(name=>!selected.length||selected.includes(name));assert(chosen.length);
if(process.argv.includes('--self-check')){
 const config=readConfig({LLM_PROVIDER:'openai-compatible',LLM_MODEL:'offline-fixture',LLM_API_KEY:'inert'});
 for(const name of chosen){
  const s=scenario(name),base=scriptedFixtureProvider(s),proposals=[];
  const provider={...base,async toolTurn(input){const result=await base.toolTurn(input);proposals.push(result.toolCalls);return result;}};
  const answer=await s.run(provider,config);s.verify(answer,proposals);
  console.log(JSON.stringify({case:name,passed:true,kind:'Scripted fixture mechanics only',inferenceDispatches:0}));
 }
 process.exit(0);
}
if(!process.argv.includes('--live-model')){
 console.log(JSON.stringify({cases:chosen,inferenceDispatches:0,scope:'Production chat runner and contacts adapters; synthetic persistence; explicit --live-model uses configured inference only after parent source-freeze GO.'}));process.exit(0);
}
const config=readConfig();assert(config.configured,'Configured inference unavailable; no private configuration printed');
const maxRequests=Number(process.argv.find(value=>value.startsWith('--max-requests='))?.slice(15)??48);
assert(Number.isInteger(maxRequests)&&maxRequests>0&&maxRequests<=48);
const perCase=Number(process.argv.find(value=>value.startsWith('--max-per-case='))?.slice(15)??8);assert(Number.isInteger(perCase)&&perCase>0&&perCase<=8);
const files=[...new Set([...(await chatSourceFiles()),'tests/fixtures/chat-source-files.mjs',...['server/chat/runner.js','server/chat/context.js','server/chat/behavior.js','server/contacts/store.js','server/contacts/search.js','server/shared/config.js','server/providers/index.js','server/providers/retry.js','server/audit/diagnostics.js','server/audit/diagnostic-codes.js','server/audit/argument-diagnostics.js','server/automation/validation.js','tools/contacts/index.js','tools/attio/index.js','server/attio/client.js','server/attio/config.js','supabase/migrations/202610260048_contacts_search.sql','tests/contacts-model.mjs','tests/fixtures/contacts-model.mjs','tests/fixtures/contacts-store.mjs']])].sort();
const hashes=async()=>Object.fromEntries(await Promise.all(files.map(async file=>[file,createHash('sha256').update(await readFile(new URL(`../${file}`,import.meta.url))).digest('hex')])));
const pins=await hashes(),folder=new URL(`../${process.env.CONTACTS_MODEL_EVIDENCE||'evidence/contacts-tools'}/model-${new Date().toISOString().replace(/[:.]/g,'-')}/`,import.meta.url);
await mkdir(folder,{recursive:true,mode:0o700});await chmod(folder,0o700);
const evidence=new URL('report.json',folder);
const report={provider:config.provider,model:config.model,maxRequests,maxRequestsPerCase:perCase,networkRequests:0,pins,startedAt:new Date().toISOString(),cases:[],limitations:[
 'Only the configured inference endpoint receives network requests. Persistence is a synthetic PostgREST transport used by the real contacts store and tools.',
 'Actual model selects all initial and subsequent tool calls; private synthetic proposals, attempted/applied writes, exact saved fields and final answers are recorded for review.',
 'No live contacts, Discord, Calendar, Supabase or other business-service requests. Hosted schema and website transport are separate checks.',
 'Machine assertions are complemented by semantic review of final answers; this small bounded sample does not establish every possible model behavior.'
]};
const persist=()=>writeFile(evidence,JSON.stringify(report,null,2)+'\n',{mode:0o600});await persist();
const originalFetch=globalThis.fetch,endpoint=`${config.baseUrl.replace(/\/$/,'')}/${config.provider==='anthropic'?'messages':'chat/completions'}`;
let active;
globalThis.fetch=async(url,options)=>{
 assert.equal(String(url),endpoint,'Only exact configured inference endpoint may receive network');
 assert.deepEqual(await hashes(),pins,'Production/harness sources changed after pinning');
 if(report.networkRequests>=maxRequests||active.networkRequests>=perCase){active.budgetStopped=true;throw Error('Hard inference dispatch cap reached');}
 report.networkRequests++;active.networkRequests++;await persist();
 return originalFetch(url,{...options,redirect:'error'});
};
const raw=createProvider(config,{fetchImpl:globalThis.fetch,audit:{required:false,startModel:async()=>({status:'ready'}),finishModel:async()=>({status:'ready'})},writeDiagnostic:()=>{}});
try{
 for(const name of chosen){
  if(report.networkRequests>=maxRequests){report.budgetStopped=true;process.exitCode=1;break;}
  const s=scenario(name);active={name,networkRequests:0,proposals:[],passed:false,userMessage:s.text,initialState:s.initial};report.cases.push(active);await persist();
  const provider={
   async toolTurn(input){const turn=await raw.toolTurn(input);active.proposals.push(structuredClone(turn.toolCalls));await persist();return turn;},
   async *stream(input){yield*raw.stream(input);}
  };
  try{
   active.answer=await s.run(provider,config,{signal:AbortSignal.timeout(120000)});
   assert(!active.budgetStopped,'Cap exhaustion cannot count as success');s.verify(active.answer,active.proposals);active.passed=true;
  }catch(error){active.failure=String(error.message).slice(0,1000);process.exitCode=1;}
  Object.assign(active,{toolCalls:s.calls,attioDispatches:s.attioCalls??[],attioToolCalls:s.attioToolCalls??[],attempts:s.f.attempts,applied:s.f.applied,finalState:s.f.state,records:s.records,audit:s.audit});await persist();
  console.log(JSON.stringify({case:name,passed:active.passed,inferenceDispatches:active.networkRequests,...(active.failure?{failure:active.failure}:{})}));
 }
}finally{
 globalThis.fetch=originalFetch;report.finishedAt=new Date().toISOString();report.pinsStable=JSON.stringify(await hashes())===JSON.stringify(pins);await persist();
}
console.log(JSON.stringify({evidence:evidence.pathname,model:report.model,inferenceDispatches:report.networkRequests,cases:report.cases.length,passed:report.cases.length===chosen.length&&report.cases.every(row=>row.passed),pinsStable:report.pinsStable}));
