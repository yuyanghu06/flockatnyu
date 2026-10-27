import {chatSourceFiles,operationSourceFiles} from './fixtures/chat-source-files.mjs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {readConfig} from '../server/shared/config.js';
import {createProvider} from '../server/providers/index.js';
import {modelCases,saveModelScenario,hiddenNative,fixtureSecret,humanId,otherId,stamp} from './fixtures/treg-save.mjs';

const selected=process.argv.filter(arg=>arg.startsWith('--case=')).map(arg=>arg.slice(7));
const chosen=modelCases.filter(name=>!selected.length||selected.includes(name));assert(chosen.length);
const selfCheck=process.argv.includes('--self-check');
const live=process.argv.includes('--live-model');
if(!selfCheck&&!live){console.log(JSON.stringify({cases:chosen,inferenceDispatches:0,scope:'Actual chat runner, adapters and private Treg logs; simulated business transports. Requires frozen-source GO for inference.'}));process.exit(0);}
if(selfCheck){
 const config=readConfig({LLM_PROVIDER:'openai-compatible',LLM_MODEL:'offline-fixture',LLM_API_KEY:'inert'});
 for(const name of chosen){
  const s=saveModelScenario(name),proposals=[];let step=0;
  const provider={async toolTurn(){
   const search=s.calls.find(c=>c.name==='search_treg_people')?.result;
   const enriched=s.calls.find(c=>c.name==='enrich_treg_people')?.result;
   let call;
   if(name==='existing-and-edit'){
    const calls=[['enrich_treg_people',{emails:['avery@example.com']}],['import_treg_contacts',{resultIds:enriched?.results.filter(r=>r.resultId).map(r=>r.resultId)}],['read_contact',{contactId:humanId}],['update_contact',{contactId:humanId,expectedUpdatedAt:stamp,fields:{notes:'Follow up Friday'}}],['read_contact',{contactId:otherId}],['delete_contact',{contactId:otherId,expectedUpdatedAt:stamp}]];
    const current=calls[step++];if(current)call={name:current[0],arguments:current[1]};
   }else if(name==='mixed-enrichment'){
    if(step++===0)call={name:'enrich_treg_people',arguments:{emails:['avery@example.com','missing@example.com','failed@example.com']}};
    else if(step===2)call={name:'import_treg_contacts',arguments:{resultIds:enriched.results.filter(r=>r.resultId).map(r=>r.resultId)}};
   }else if(name==='company-search-enrich'){
    if(step++===0)call={name:'search_treg_people',arguments:{company_domain:'example.com',limit:3}};
    else if(step===2)call={name:'enrich_treg_people',arguments:{emails:['avery@example.com','jordan@example.com']}};
    else if(step===3)call={name:'import_treg_contacts',arguments:{resultIds:[enriched.results[0].resultId,search.people[1].resultId,search.people[2].resultId]}};
   }else{
    if(step++===0)call={name:'search_treg_people',arguments:{company_domain:'example.com',limit:name==='company-search'?2:1}};
    else if(step===2&&name!=='no-save-injection')call={name:'import_treg_contacts',arguments:{resultIds:search.people.map(p=>p.resultId)}};
   }
   const toolCalls=call?[{id:'scripted-'+name+'-'+step,...call}]:[];proposals.push(toolCalls);return {text:'',toolCalls};
  },async *stream(){yield name==='write-failure'?'Found Avery Example. Saving is unconfirmed because its reply was lost.':name==='mixed-enrichment'?'avery@example.com matched and saved. missing@example.com had no match. failed@example.com lookup failed.':'Completed the requested contact operations.';}};
  const answer=await s.run(provider,config);s.verify(answer,proposals);console.log(JSON.stringify({case:name,passed:true,kind:'Scripted fixture check only',inferenceDispatches:0}));
 }
 process.exit(0);
}
const config=readConfig();assert(config.configured,'Configured model unavailable; credentials remain private');
const maxRequests=Number(process.argv.find(arg=>arg.startsWith('--max-requests='))?.slice(15)??32);
const perCase=Number(process.argv.find(arg=>arg.startsWith('--max-per-case='))?.slice(15)??6);
assert(Number.isInteger(maxRequests)&&maxRequests>=1&&maxRequests<=32);assert(Number.isInteger(perCase)&&perCase>=1&&perCase<=6);
const files=[...new Set([...(await chatSourceFiles()),...(await operationSourceFiles()),'tests/fixtures/chat-source-files.mjs',...['server/chat/context.js','server/treg/result-cache.js','tools/treg/index.js','tools/contacts/index.js','server/contacts/store.js','server/contacts/fields.js','server/contacts/search.js','server/treg/people.js','server/treg/validation.js','server/treg/contact-identity.js','server/treg/contacts-importer.js','server/treg/enrich.js','server/treg/call-log.js','server/chat/runner.js','server/chat/behavior.js','server/audit/diagnostics.js','server/audit/diagnostic-codes.js','server/audit/argument-diagnostics.js','server/shared/config.js','server/providers/index.js','server/providers/retry.js','server/automation/validation.js','tests/treg-save-model.mjs','tests/fixtures/treg-save.mjs']])].sort();
const pins=async()=>Object.fromEntries(await Promise.all(files.map(async file=>[file,createHash('sha256').update(await readFile(new URL('../'+file,import.meta.url))).digest('hex')])));
const frozen=await pins();
const base=new URL('../evidence/treg-save/',import.meta.url),directory=new URL('model-'+new Date().toISOString().replace(/[:.]/g,'-')+'/',base);await mkdir(directory,{recursive:true,mode:0o700});
const budgetPath=new URL('inference-budget.json',base);let budget={ceiling:32,used:0};try{budget=JSON.parse(await readFile(budgetPath,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
assert.equal(budget.ceiling,32);assert(Number.isInteger(budget.used)&&budget.used>=0&&budget.used<=32);
const report={model:config.model,provider:config.provider,pins:frozen,maxRequests,maxPerCase:perCase,networkRequests:0,cumulativeStart:budget.used,startedAt:new Date().toISOString(),cases:[],limitations:['All business services are simulated using production clients/adapters/runner. Only the exact configured inference endpoint may receive network.','Small bounded behavior sample; no live Treg billable lookup, production data mutation, website/Discord run or deployed behavior is established.','Synthetic prompts and outputs are retained only in private ignored evidence; no credentials are saved.']};
const path=new URL('report.json',directory),persist=()=>writeFile(path,JSON.stringify(report,null,2)+'\n',{mode:0o600});await persist();
const endpoint=`${config.baseUrl.replace(/\/$/,'')}/${config.provider==='anthropic'?'messages':'chat/completions'}`;
const actualFetch=globalThis.fetch;let active;
globalThis.fetch=async(url,options)=>{
 assert.equal(String(url),endpoint,'Only configured inference endpoint may receive network');assert.deepEqual(await pins(),frozen,'Frozen production sources changed');
 if(budget.used>=budget.ceiling||report.networkRequests>=maxRequests||active.networkRequests>=perCase){active.budgetStopped=true;throw Error('Hard inference request cap reached');}
 budget.used++;active.networkRequests++;report.networkRequests++;report.cumulativeUsed=budget.used;
 await writeFile(budgetPath,JSON.stringify(budget,null,2)+'\n',{mode:0o600});await persist();
 return actualFetch(url,{...options,redirect:'error'});
};
const provider=createProvider(config,{fetchImpl:globalThis.fetch,audit:{required:false,startModel:async()=>({status:'ready'}),finishModel:async()=>({status:'ready'})},writeDiagnostic:()=>{}});
try{
 for(const name of chosen){
  if(budget.used>=budget.ceiling||report.networkRequests>=maxRequests){report.budgetStopped=true;process.exitCode=1;break;}
  const s=saveModelScenario(name);active={name,userMessage:s.text,networkRequests:0,proposals:[],planningInputs:[],answerInputs:[],passed:false,initialState:s.initial};report.cases.push(active);await persist();
  const wrapped={async toolTurn(input){active.planningInputs.push(structuredClone(input));const result=await provider.toolTurn(input);active.proposals.push(structuredClone(result.toolCalls));await persist();return result;},async *stream(input){active.answerInputs.push(structuredClone(input));await persist();yield*provider.stream(input);}};
  try{
   active.answer=await s.run(wrapped,config,{signal:AbortSignal.timeout(180000)});assert(!active.budgetStopped,'Budget stop cannot count as passing');s.verify(active.answer,active.proposals);
   const modelInput=JSON.stringify([...active.planningInputs,...active.answerInputs]);for(const marker of [hiddenNative,fixtureSecret])assert(!modelInput.includes(marker),'Private raw/credentials reached model');
   if(name!=='no-save-injection')assert(active.planningInputs.slice(1).some(input=>JSON.stringify(input).includes('resultId')),'Opaque result references must survive model-facing projection');
   active.passed=true;
  }catch(error){active.failure=String(error.message).slice(0,1200);process.exitCode=1;}
  Object.assign(active,{calls:s.calls,tregRequests:s.f.requests,attemptedWrites:s.f.storage.attempts,appliedWrites:s.f.storage.applied,finalState:s.f.storage.state,records:s.records,audit:s.audit});await persist();
  console.log(JSON.stringify({case:name,passed:active.passed,inferenceDispatches:active.networkRequests,...(active.failure?{failure:active.failure}:{})}));
 }
}finally{globalThis.fetch=actualFetch;report.finishedAt=new Date().toISOString();report.pinsStable=JSON.stringify(await pins())===JSON.stringify(frozen);report.cumulativeUsed=budget.used;await persist();}
console.log(JSON.stringify({evidence:path.pathname,model:report.model,inferenceDispatches:report.networkRequests,cumulativeUsed:budget.used,cases:report.cases.length,passed:report.cases.length===chosen.length&&report.cases.every(c=>c.passed),pinsStable:report.pinsStable}));
