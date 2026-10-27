import test from 'node:test';
import assert from 'node:assert/strict';
import {createChatRunner} from '../server/chat/runner.js';
import {createApp} from '../server/runtime/app.js';
import {readConfig} from '../server/shared/config.js';
import {createSiteAuth,readSiteAuthConfig} from '../server/auth/site-auth.js';
import {createTregEnrichmentClient} from '../server/treg/enrich.js';
import {contactPrincipal} from './fixtures/contacts-store.mjs';
import {tregToolsFixture,fixtureSecret,hiddenProviderValue,personFields} from './fixtures/treg-tools.mjs';

const invoke=(request,name,args,extra={})=>request.execute({name,arguments:args,principal:contactPrincipal,...extra});
const noPrivate=value=>{const text=JSON.stringify(value);for(const marker of [fixtureSecret,hiddenProviderValue,'callLog','finishLog','PRIVATE'])assert(!text.includes(marker),marker+' must remain private');};

test('Treg tools separately search and enrich through actual clients without importing or normalizing native values',async()=>{
 const f=tregToolsFixture(),request=f.request();
 const search=await invoke(request,'search_treg_people',{company_domain:'example.com'});
 assert.equal(search.status,'ready');assert.deepEqual(search.people,[{fields:personFields}]);assert.equal(search.coverage.complete,false);
 assert.equal(f.requests[0].path,'/call/exa.people.search');assert.equal(f.requests[0].body.category,'people');assert.equal(f.requests[0].body.numResults,5);assert(f.requests[0].body.query.includes('Company domain: example.com'));
 const enrich=await invoke(request,'enrich_treg_people',{emails:['rae@example.com']});
 assert.equal(enrich.status,'ready');assert.equal(enrich.results[0].matched,true);assert.deepEqual(enrich.results[0].fields,personFields);
 assert.deepEqual(f.requests[1].body,{email:'rae@example.com'});assert.equal(f.requests[1].path,'/call/treg.people.enrich');
 for(const dispatch of f.requests){assert.equal(dispatch.headers.get('x-treg-token'),fixtureSecret);assert.equal(dispatch.headers.get('x-treg-route-max-cost'),'0.10');assert.equal(dispatch.headers.get('x-treg-route-waterfall'),'0');assert(dispatch.headers.get('idempotency-key'));}
 noPrivate({search,enrich});assert(!JSON.stringify({search,enrich}).includes('provider-native-id'));
 const logs=await f.logs();assert.equal(logs.length,2);assert(logs.every(entries=>entries.some(event=>event.type==='request')&&entries.some(event=>event.type==='response')));
 assert(JSON.stringify(logs).includes(hiddenProviderValue),'Native provider data remains in private full-call log');assert(!JSON.stringify(logs).includes(fixtureSecret));
 assert(logs.every(entries=>entries.at(-1).type!=='response'),'Each completed lookup must have a completion outcome');
});

test('Array enrichment keeps ordered per-address success, miss and failure; duplicate emails reuse a paid request',async()=>{
 const f=tregToolsFixture({enrichments:{'missing@example.com':{miss:true},'failed@example.com':{status:503,body:{error:'PRIVATE '+fixtureSecret}}}}),request=f.request();
 const args={emails:['Rae@Example.com','missing@example.com','failed@example.com','rae@example.com']};
 const result=await invoke(request,'enrich_treg_people',args);
 assert.equal(result.status,'partial');assert.deepEqual(result.results.map(row=>row.email),args.emails);
 assert.equal(result.results[0].matched,true);assert.equal(result.results[1].matched,false);assert.deepEqual(result.results[1].fields,{});assert.notEqual(result.results[2].status,'ready');assert.deepEqual(result.results[3].fields,personFields);
 assert.equal(f.requests.length,3);assert.equal(result.coverage.complete,false);noPrivate(result);
 const overlapping=await invoke(request,'enrich_treg_people',{emails:['rae@example.com','missing@example.com']});
 assert.equal(overlapping.status,'ready');assert.equal(f.requests.length,3,'Overlapping tool batches must not bill an email twice');
 await invoke(request,'enrich_treg_people',args);assert.equal(f.requests.length,3);
});

test('Equivalent search calls and concurrent overlapping enrichment calls share request-local dispatches',async()=>{
 const f=tregToolsFixture(),request=f.request();
 await invoke(request,'search_treg_people',{q:'Example leads'});await invoke(request,'search_treg_people',{q:'Example leads',limit:5});
 assert.equal(f.requests.length,1,'Explicit default and omitted default are the same search');
 await Promise.all([invoke(request,'enrich_treg_people',{emails:['rae@example.com','other@example.com']}),invoke(request,'enrich_treg_people',{emails:['RAE@EXAMPLE.COM']})]);
 assert.equal(f.requests.filter(row=>row.path.endsWith('.enrich')).length,2);
});

test('Validation, principal binding and cancellation prevent paid lookups before dispatch',async()=>{
 const f=tregToolsFixture(),request=f.request();
 for(const args of [{},{location:'New York'},{q:'x',limit:11},{q:'x',token:'injected'},{q:'x',cost:1},{q:'x',url:'https://attacker.example'}])assert.notEqual((await invoke(request,'search_treg_people',args)).status,'ready');
 for(const args of [{emails:[]},{emails:Array(11).fill('rae@example.com')},{emails:['rae@example.com','not-an-email']},{emails:['Person <rae@example.com>']},{emails:['rae@example.com ']},{email:'rae@example.com'},{emails:['rae@example.com'],requestId:'arbitrary'}])assert.notEqual((await invoke(request,'enrich_treg_people',args)).status,'ready');
 assert.equal((await invoke(request,'search_treg_people',{q:'x'},{principal:{...contactPrincipal,id:'another-person'}})).status,'forbidden');
 assert.equal((await invoke(f.tools,'search_treg_people',{q:'x'},{principal:{}})).status,'forbidden');
 const controller=new AbortController();controller.abort();
 assert.equal((await invoke(request,'enrich_treg_people',{emails:['rae@example.com']},{signal:controller.signal})).status,'aborted');
 assert.equal(f.requests.length,0);
 const missing=tregToolsFixture({token:''});assert.equal((await invoke(missing.request(),'search_treg_people',{q:'x'})).status,'not_configured');assert.equal(missing.requests.length,0);
});

test('Cancellation during an email batch prevents later addresses from dispatching and preserves explicit per-address outcomes',async()=>{
 const f=tregToolsFixture(),controller=new AbortController();f.modes.before=()=>controller.abort();
 const result=await invoke(f.request(),'enrich_treg_people',{emails:['rae@example.com','other@example.com']},{signal:controller.signal});
 assert.equal(f.requests.length,1);assert.equal(result.results.length,2);assert.equal(result.results[1].email,'other@example.com');assert.equal(result.results[1].status,'aborted');assert.equal(result.coverage.complete,false);noPrivate(result);
});

test('Unknown provider shapes stay valid with empty supported fields rather than fabricated names or lost matches',async()=>{
 const f=tregToolsFixture({people:[{profile:{first_name:'Nested'},full_name:'Do Not Split',workplace:{name:'Nested Company'}}],enrichments:{'rae@example.com':{body:{output:{full_name:'Do Not Split',company:{name:'Nested Company'}},raw:{profile:{name:'Original'}},_treg:{served_by:'synthetic.people.lookup'}}}}});
 const request=f.request(),search=await invoke(request,'search_treg_people',{q:'unknown format'}),enrich=await invoke(request,'enrich_treg_people',{emails:['rae@example.com']});
 assert.equal(search.status,'ready');assert.deepEqual(search.people,[{fields:{}}]);assert.equal(enrich.status,'ready');assert.equal(enrich.results[0].matched,true);assert.deepEqual(enrich.results[0].fields,{});noPrivate({search,enrich});
});

test('Mandatory logging blocks paid dispatch and malformed or oversized provider data never becomes contact facts',async()=>{
 const blocked=tregToolsFixture({callLogger:{begin:async()=>({status:'log_unavailable'})}});
 for(const [name,args]of [['search_treg_people',{q:'x'}],['enrich_treg_people',{emails:['rae@example.com']}]]){
  const result=await invoke(blocked.request(),name,args);assert.notEqual(result.status,'ready');noPrivate(result);
 }
 assert.equal(blocked.requests.length,0);
 for(const response of [()=>new Response('not JSON'),()=>new Response('x'.repeat(600000))]){
  const f=tregToolsFixture();f.modes.reply=response;const result=await invoke(f.request(),'search_treg_people',{q:'x'});assert.notEqual(result.status,'ready');assert(!result.people?.length);noPrivate(result);
 }
});

test('Chat enrichment metadata uses its own fixed tag while the existing Gmail default and invalid-tag rejection remain intact',async()=>{
 const f=tregToolsFixture(),tags=[];
 const options={env:{TREG_TOKEN:fixtureSecret},callLogger:f.logger,fetchImpl:async(url,init)=>{assert.equal(String(url),'https://treg.to/call/treg.people.enrich');tags.push(new Headers(init.headers).get('x-treg-meta'));return Response.json({output:{full_name:null},raw:{native:'miss'},_treg:{served_by:'synthetic.people.lookup'}},{headers:{'x-treg-served-by':'synthetic.people.lookup'}});}};
 for(const feature of [undefined,'chat-contact-enrichment']){
  const client=createTregEnrichmentClient({...options,...(feature?{feature}:{})});
  const result=await client.enrich({email:'rae@example.com',requestId:'61000000-0000-4000-8000-000000000001',principal:contactPrincipal});assert.equal(result.status,'ready');await result.finishLog({saved:false});
 }
 assert(tags[0].endsWith('feature=gmail-contact-enrichment'));assert(tags[1].endsWith('feature=chat-contact-enrichment'));
 const invalid=createTregEnrichmentClient({...options,feature:'chat-contact-enrichment, injected=true'});assert.equal(invalid.configured,false);assert.equal((await invalid.enrich({email:'rae@example.com',requestId:'61000000-0000-4000-8000-000000000001',principal:contactPrincipal})).status,'not_configured');assert.equal(tags.length,2);
});

test('Actual authenticated tool API lists and dispatches separate Treg operations, rejecting anonymous and cross-origin calls',async()=>{
 const f=tregToolsFixture(),config=readConfig({NODE_ENV:'production'}),origin='https://treg-tools.example.test';
 const auth=createSiteAuth({config:readSiteAuthConfig({PUBLIC_ORIGIN:origin,SITE_ACCESS_PASSWORD:'synthetic-password',SITE_SESSION_SECRET:'synthetic-long-session-secret-over-32-characters'}),apiConfig:config});
 const cookie=auth.issue('synthetic-password').split(';')[0],app=createApp({config,tregTools:f.tools,auth:auth.auth,provider:{},audit:{recordEvent:async()=>{}}});
 const request=(path,{method='GET',body,session=true,requestOrigin=origin}={})=>app.fetch(new Request(origin+path,{method,headers:{...(session?{cookie}:{}),origin:requestOrigin,'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})}));
 assert.equal((await request('/api/tools',{session:false})).status,403);
 const listed=await request('/api/tools');assert.equal(listed.status,200);assert.equal(listed.headers.get('cache-control'),'no-store');const catalogue=await listed.json();assert(catalogue.tools.some(tool=>tool.name==='search_treg_people'));assert(catalogue.tools.some(tool=>tool.name==='enrich_treg_people'));
 assert.equal((await request('/api/tools/search_treg_people',{method:'POST',body:{q:'x'},requestOrigin:'https://attacker.example'})).status,403);assert.equal(f.requests.length,0);
 const searched=await request('/api/tools/search_treg_people',{method:'POST',body:{q:'x'}});assert.equal(searched.status,200);assert.equal((await searched.json()).people.length,1);
 const enriched=await request('/api/tools/enrich_treg_people',{method:'POST',body:{emails:['rae@example.com']}});assert.equal(enriched.status,200);const result=await enriched.json();assert.equal(result.results[0].matched,true);noPrivate(result);assert.equal(f.requests.length,2);
});

test('Production chat passes usable lookup fields to the model, continues after an error and keeps execution metadata private',async()=>{
 const f=tregToolsFixture({searchStatus:503}),calls=[],records=[],audit=[],modelInputs=[];let turn=0;
 const provider={async toolTurn(input){modelInputs.push(structuredClone(input));const steps=[{id:'search',name:'search_treg_people',arguments:{q:'Example leads'}},{id:'enrich',name:'enrich_treg_people',arguments:{emails:['rae@example.com']}}];const call=steps[turn++];return {text:'',toolCalls:call?[call]:[]};},async *stream(input){modelInputs.push(structuredClone(input));yield 'The enrichment result lists Example Labs. The search was unavailable. No contacts were saved.';}};
 const raw=f.tools,track=adapter=>({...adapter,execute:async input=>{const result=await adapter.execute(input);calls.push(structuredClone({name:input.name,result}));return result;}}),tregTools={...track(raw),createRequest:context=>track(raw.createRequest(context))};
 const runner=createChatRunner({config:readConfig({LLM_PROVIDER:'openai-compatible',LLM_MODEL:'offline-fixture',LLM_API_KEY:'inert'}),provider,tregTools,audit:{recordEvent:async event=>audit.push(structuredClone(event))}});
 const result=await runner.run({conversation:{messages:[{role:'user',content:'Search Treg, then independently enrich rae@example.com. Do not save anything.'}],timeZone:'America/New_York'},principal:contactPrincipal,onRecord:record=>records.push(record)});
 assert.equal(result.status,'succeeded');assert.equal(f.requests.length,2);assert.equal(calls[1].result.results[0].matched,true);
 assert(JSON.stringify(modelInputs).includes('Example Labs'),'Model must receive the actual enrichment fields');assert(!JSON.stringify(modelInputs).includes(hiddenProviderValue));assert(!JSON.stringify(modelInputs).includes(fixtureSecret));
 const metadata=JSON.stringify({audit,records:records.filter(record=>!['delta','reset'].includes(record.type))});for(const marker of ['rae@example.com','Example Labs',fixtureSecret,hiddenProviderValue])assert(!metadata.includes(marker));
});
