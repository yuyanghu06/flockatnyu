import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readdir,readFile,rm,lstat,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {Hono} from 'hono';
import {createTregLookupClient,TREG_LOOKUP_CONTRACTS,validTregLookupInput} from '../server/treg-lookups.js';
import {registerTregLookupApi} from '../src/api/treg/register.js';
import {createTregCallLogger} from '../server/treg-call-log.js';
import {createTregPeopleClient} from '../server/treg-people.js';
import {createTregEnrichmentClient} from '../server/treg-enrich.js';
import {createTregTools} from '../tools/treg/index.js';
import {createApp} from '../server/app.js';
import {readConfig} from '../server/config.js';
import {createSiteAuth,readSiteAuthConfig} from '../server/site-auth.js';

const requestId='71000000-0000-4000-8000-000000000001',requestId2='71000000-0000-4000-8000-000000000002';
const principal={id:'synthetic-dormant-route-member',allowedSourceIds:[]};
const token='synthetic-dormant-route-token',native='PRIVATE_NATIVE_LOOKUP_DETAIL';
const contracts={
 email_find:{service:'treg.people.email.find',path:'/api/treg/people/email/find',input:{domain:'example.com',full_name:'Rae Example'},output:{email:'rae@example.com',confidence:0,first_name:'Rae',last_name:'Example',verified:false}},
 email_verify:{service:'treg.people.email.verify',path:'/api/treg/people/email/verify',input:{email:'rae@example.com'},output:{valid:false,status:'invalid',score:0}},
 phone_find:{service:'treg.people.phone.find',path:'/api/treg/people/phone/find',input:{email:'rae@example.com'},output:{phone:'+12025550123',line_type:'mobile',country_code:'US'}},
 company_enrich:{service:'treg.companies.enrich',path:'/api/treg/companies/enrich',input:{domain:'example.com'},output:{name:'Example Labs',domain:'example.com',website:'https://example.com',description:'Synthetic company',industry:'Software',employees:'11-50',location:'New York',linkedin_url:'https://www.linkedin.com/company/example-labs',founded:2020}},
};
const envelope=(operation,output=contracts[operation].output)=>({output:{...output,unknown_native:native},raw:{nested:{native,keep:[1,null]},credentials:{token},session_cookie:'synthetic-private-cookie'},_treg:{served_by:'synthetic.lookup',tried:[{provider:'synthetic.lookup',cost_micro:1234}]}});
const json=(body,status=200,headers={})=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json','x-treg-served-by':'synthetic.lookup','x-treg-call-id':'synthetic-call','x-treg-cost-micro':'1234',...headers}});
const publicOnly=value=>{const text=JSON.stringify(value);for(const privateValue of [token,native,'synthetic-private-cookie','callLog','finishLog','PRIVATE_PROVIDER_ERROR'])assert(!text.includes(privateValue),`Private value ${privateValue} escaped its log boundary`);};

async function fixture(t,{env={},callLogger}={}){
 const root=await mkdtemp(join(tmpdir(),'flock-dormant-treg-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const configuration={TREG_TOKEN:token,TREG_ORG:'synthetic-org',TREG_CALL_LOG_DIR:join(root,'calls'),...env};
 const logger=callLogger??createTregCallLogger({env:configuration});t.after(()=>logger.close?.());
 const requests=[],mode={};
 const fetchImpl=async(value,init={})=>{
  const url=new URL(value),operation=Object.keys(contracts).find(key=>url.href===`https://treg.to/call/${contracts[key].service}`);assert(operation,'Only one of the four exact fixed lookup endpoints may receive simulated network');assert.equal(init.redirect,'error');assert.equal(init.method,'POST');
  if(init.signal?.aborted)throw new DOMException('Aborted','AbortError');requests.push({url:url.href,operation,body:JSON.parse(init.body),headers:new Headers(init.headers),signal:init.signal});
  if(mode.throw)throw Error('PRIVATE_PROVIDER_ERROR '+token);if(mode.before)await mode.before(requests.at(-1));if(mode.reply)return mode.reply(operation,init);return json(envelope(operation));
 };
 const client=createTregLookupClient({env:configuration,callLogger:logger,fetchImpl});
 const lookup=(operation,args={})=>client.lookup({operation,input:contracts[operation]?.input,requestId,principal,...args});
 const logs=async()=>{let names;try{names=await readdir(configuration.TREG_CALL_LOG_DIR);}catch{return [];}return Promise.all(names.filter(name=>name.endsWith('.jsonl')).map(async name=>({name,mode:(await lstat(join(configuration.TREG_CALL_LOG_DIR,name))).mode&0o777,events:(await readFile(join(configuration.TREG_CALL_LOG_DIR,name),'utf8')).trim().split('\n').map(line=>JSON.parse(line))})));};
 return {root,env:configuration,logger,client,requests,mode,lookup,logs};
}

// The registration deliberately accepts a JSON-reader seam, just like the
// existing import API. This fixture supplies a bounded transport reader; the
// route/client under test still perform auth and all operation validation.
async function readJSON(request,_timeout,maxBytes){
 if(!request.headers.get('content-type')?.startsWith('application/json'))throw Error('Invalid content type');
 const body=await request.arrayBuffer();if(body.byteLength>maxBytes)throw Error('Too large');return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(body));
}
function optionalApi(client,{authOverride}={}){
 const config=readConfig({NODE_ENV:'production'}),origin='https://dormant.example.test';
 const siteAuth=createSiteAuth({config:readSiteAuthConfig({PUBLIC_ORIGIN:origin,SITE_ACCESS_PASSWORD:'synthetic-dormant-password',SITE_SESSION_SECRET:'synthetic-dormant-signing-secret-at-least-32'}),apiConfig:config});
 const cookie=siteAuth.issue('synthetic-dormant-password').split(';')[0],app=new Hono();registerTregLookupApi({app,tregLookupClient:client,auth:authOverride??siteAuth.auth,config,readJSON});
 const request=(operation,{body={requestId,input:contracts[operation].input},headers={},session=true,method='POST',query='',signal}={})=>app.fetch(new Request(origin+contracts[operation].path+query,{method,headers:{origin,'content-type':'application/json',...(session?{cookie}:{}),...headers},...(method==='GET'?{}:{body:typeof body==='string'?body:JSON.stringify(body)}),signal}));
 return {app,request,config,origin,siteAuth,cookie};
}

test('Dormant Treg clients: four fixed operations preserve typed results, private native logs and no-fallback cost/idempotency boundaries',async t=>{
 const f=await fixture(t);assert(Object.isFrozen(TREG_LOOKUP_CONTRACTS));
 for(const [operation,expected] of Object.entries(contracts)){
  assert(Object.isFrozen(TREG_LOOKUP_CONTRACTS[operation]));assert.equal(TREG_LOOKUP_CONTRACTS[operation].service,expected.service);assert.equal(TREG_LOOKUP_CONTRACTS[operation].endpoint,`https://treg.to/call/${expected.service}`);assert.equal(TREG_LOOKUP_CONTRACTS[operation].path,expected.path);
  const result=await f.lookup(operation);assert.equal(result.status,'ready');assert.equal(result.operation,operation);assert.equal(result.hasResult,true);assert.deepEqual(result.output,expected.output);assert.deepEqual(result.usage,{callId:'synthetic-call',provider:'synthetic.lookup',costMicro:1234});publicOnly(result);
  const sent=f.requests.at(-1);assert.deepEqual(sent.body,expected.input);assert.equal(sent.headers.get('x-treg-token'),token);assert.equal(sent.headers.get('x-treg-org'),'synthetic-org');assert.equal(sent.headers.get('x-treg-route-waterfall'),'0');assert.equal(Number(sent.headers.get('x-treg-route-max-cost')),0.1);assert(sent.headers.get('idempotency-key'));assert(!sent.headers.get('x-treg-meta').includes('rae@example.com'));
 }
 assert.equal(f.requests.length,4,'Each lookup makes one request, without fallback');
 await f.lookup('email_find');assert.equal(f.requests[0].headers.get('idempotency-key'),f.requests.at(-1).headers.get('idempotency-key'));
 await f.lookup('email_find',{principal:{...principal,id:'another-member'}});assert.notEqual(f.requests[0].headers.get('idempotency-key'),f.requests.at(-1).headers.get('idempotency-key'));
 await f.lookup('email_find',{requestId:requestId2});assert.notEqual(f.requests[0].headers.get('idempotency-key'),f.requests.at(-1).headers.get('idempotency-key'));
 await f.lookup('email_find',{input:{domain:'other.example',full_name:'Rae Example'}});assert.notEqual(f.requests[0].headers.get('idempotency-key'),f.requests.at(-1).headers.get('idempotency-key'));
 const entries=await f.logs();assert.equal(entries.length,8);assert.equal((await lstat(f.env.TREG_CALL_LOG_DIR)).mode&0o777,0o700);assert(entries.every(log=>log.mode===0o600));
 const text=JSON.stringify(entries);assert(text.includes(native),'Complete extra/native provider fields remain in private logs');for(const privateValue of [token,'synthetic-private-cookie'])assert(!text.includes(privateValue));
 for(const log of entries){assert.deepEqual(log.events.map(event=>event.type),['request','response','lookup_outcome']);assert.equal(log.events[1].complete,true);assert.equal(log.events.at(-1).data.saved,false);assert.equal(log.events.at(-1).data.operation,'lookup_only');}
});

test('Dormant Treg result semantics: misses, invalid/unknown verification and asynchronous pending never invent positive results or poll',async t=>{
 const f=await fixture(t);
 for(const [operation,output] of [['email_find',{email:null,confidence:null}],['phone_find',{phone:null,line_type:null}],['company_enrich',{name:null,domain:null}],['email_verify',{valid:null,status:null,score:null}]]){
  // Absent metadata differs from a literal empty header value.
  f.mode.reply=()=>new Response(JSON.stringify({output,raw:{selected_provider_miss:true},_treg:{served_by:null}}),{status:200,headers:{'content-type':'application/json'}});
  const result=await f.lookup(operation);assert.equal(result.status,'ready');assert.equal(result.hasResult,false);assert.deepEqual(result.output,output);assert.deepEqual(result.usage,{callId:null,provider:contracts[operation].service,costMicro:null});
 }
 for(const status of ['invalid','unknown','accept_all']){f.mode.reply=()=>json({output:{valid:status==='invalid'?false:null,status,score:0},raw:{native},_treg:{served_by:'synthetic.lookup'}});const result=await f.lookup('email_verify');assert.equal(result.status,'ready');assert.equal(result.hasResult,true);assert.deepEqual(result.output,{valid:status==='invalid'?false:null,status,score:0});assert(!Object.hasOwn(result.output,'deliverable'));}
 f.mode.reply=()=>json(envelope('company_enrich',{name:'Example Labs',description:''}));const optionalBlank=await f.lookup('company_enrich');assert.equal(optionalBlank.status,'ready');assert.deepEqual(optionalBlank.output,{name:'Example Labs',description:''},'An empty optional description is preserved without becoming a blank primary result');
 for(const operation of Object.keys(contracts)){const before=f.requests.length;f.mode.reply=()=>new Response(JSON.stringify({output:null,raw:null,_treg:{outcome:'pending',served_by:null}}),{status:202,headers:{'content-type':'application/json'}});const result=await f.lookup(operation);assert.deepEqual(result,{status:'pending',operation,usage:{callId:null,provider:contracts[operation].service,costMicro:null}});assert.equal(f.requests.length,before+1,'Pending never starts automatic polling or another provider');}
});

test('Dormant Treg selectors: supported alternatives pass; malformed, incomplete, injected and overbound inputs never dispatch',async t=>{
 const f=await fixture(t),valid={
  email_find:[{domain:'example.com',full_name:'Rae Example'},{domain:'example.com',first_name:'Rae',last_name:'Example'},{linkedin_url:'https://www.linkedin.com/in/rae-example'},{linkedin_handle:'rae-example'}],
  email_verify:[{email:'Rae@Example.com'}],
  phone_find:[{email:'rae@example.com'},{linkedin_url:'https://linkedin.com/in/rae-example'},{domain:'example.com',full_name:'Rae Example'},{domain:'example.com',first_name:'Rae',last_name:'Example'}],
  company_enrich:[{domain:'example.com'},{website:'https://example.com/about'},{name:'Example Labs'},{linkedin_url:'https://www.linkedin.com/company/example-labs'},{linkedin_handle:'example-labs'},{email:'company@example.com'}],
 };
 valid.email_find.push({domain:'example.com',first_name:'x'.repeat(200),last_name:'y'.repeat(200)},{domain:'example.com',full_name:'x'.repeat(400)},{linkedin_handle:'x'.repeat(200)});valid.company_enrich.push({name:'x'.repeat(400)},{website:'https://example.com/'+('x'.repeat(2028))});
 for(const [operation,inputs] of Object.entries(valid))for(const input of inputs){assert(validTregLookupInput(operation,input));assert.equal((await f.lookup(operation,{input})).status,'ready');}
 const before=f.requests.length;
 for(const operation of Object.keys(contracts))for(const input of [{},null,[],{...contracts[operation].input,endpoint:'https://attacker.example'},{...contracts[operation].input,waterfall:true},{...contracts[operation].input,cost:1},{...contracts[operation].input,requestId},{...contracts[operation].input,token:'injected'}]){assert.equal(validTregLookupInput(operation,input),false);assert.equal((await f.lookup(operation,{input})).status,'invalid_request');}
 for(const [operation,input] of [
  ['email_find',{domain:'example.com'}],['email_find',{first_name:'Rae',last_name:'Example'}],['email_find',{domain:'example.com',first_name:'Rae'}],['phone_find',{linkedin_handle:'rae-example'}],
  ['email_verify',{email:'Rae <rae@example.com>'}],['email_verify',{email:'rae@example.com '}],['email_verify',{email:'not-email'}],['email_verify',{email:'x'.repeat(321)}],
  ['company_enrich',{domain:'https://example.com'}],['company_enrich',{domain:'example.com/path'}],['company_enrich',{domain:'x'.repeat(254)}],['company_enrich',{website:'http://example.com'}],['company_enrich',{website:'https://user:pass@example.com'}],
  ['company_enrich',{website:'https:example.com'}],['company_enrich',{website:'https://example.com\\@attacker.example'}],['company_enrich',{website:'https://example.com:8443'}],
  ['email_find',{linkedin_url:'https://attacker.example/in/rae'}],['email_find',{linkedin_url:'https://www.linkedin.com/company/example-labs'}],['company_enrich',{linkedin_url:'https://linkedin.com/in/rae-example'}],['email_find',{linkedin_url:'https://www.linkedin.com/in/rae?token=x'}],['email_find',{linkedin_handle:'@rae'}],['email_find',{linkedin_handle:'a/b'}],['email_find',{linkedin_handle:'x'.repeat(201)}],
  ['email_find',{domain:'example.com',first_name:'x'.repeat(201),last_name:'Example'}],['email_find',{domain:'example.com',full_name:'x'.repeat(401)}],['company_enrich',{name:'x'.repeat(401)}],['company_enrich',{name:' '}],['company_enrich',{name:' Example'}],['company_enrich',{name:'Bad\nName'}],['company_enrich',{website:'https://example.com/'+('x'.repeat(2049))}],
 ]){assert.equal(validTregLookupInput(operation,input),false,JSON.stringify(input).slice(0,90));assert.equal((await f.lookup(operation,{input})).status,'invalid_request');}
 assert.equal((await f.lookup('unknown')).status,'invalid_request');assert.equal((await f.lookup('email_find',{requestId:'not-uuid'})).status,'invalid_request');assert.equal((await f.lookup('email_find',{principal:{}})).status,'forbidden');assert.equal((await f.lookup('email_find',{signal:AbortSignal.abort()})).status,'aborted');assert.equal(f.requests.length,before);
 const missing=await fixture(t,{env:{TREG_TOKEN:''}});assert.equal((await missing.lookup('email_find')).status,'not_configured');assert.equal(missing.requests.length,0);
});

test('Dormant lookup HTTP handlers: explicit opt-in registration enforces session/origin, strict JSON and operation projection',async t=>{
 const f=await fixture(t),api=optionalApi(f.client);
 for(const operation of Object.keys(contracts)){const response=await api.request(operation);assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/private.*no-store/);assert.equal(response.headers.get('x-content-type-options'),'nosniff');const result=await response.json();assert.deepEqual(result.output,contracts[operation].output);publicOnly(result);}
 const before=f.requests.length;
 for(const options of [{session:false},{headers:{origin:'https://attacker.example'}},{headers:{origin:'null'}},{headers:{'sec-fetch-site':'cross-site'}}])assert.equal((await api.request('email_find',options)).status,403);
 assert.equal((await api.app.fetch(new Request(api.origin+contracts.email_find.path,{method:'POST',headers:{cookie:api.cookie,'content-type':'application/json'},body:JSON.stringify({requestId,input:contracts.email_find.input})}))).status,403,'A valid session does not bypass the missing-Origin check');
 for(const options of [{query:'?extra=1'},{body:[]},{body:null},{body:{requestId,input:contracts.email_find.input,extra:true}},{body:{requestId:'invalid',input:contracts.email_find.input}},{body:{requestId,input:{domain:'example.com'}}},{body:'invalid JSON'},{body:{requestId,input:contracts.email_find.input},headers:{'content-type':'text/plain'}},{body:'x'.repeat(20000)}])assert.equal((await api.request('email_find',options)).status,400);
 assert.equal((await api.request('email_find',{method:'GET'})).status,404);assert.equal(f.requests.length,before);
 f.mode.reply=()=>new Response(JSON.stringify({output:null,_treg:{outcome:'pending',served_by:null}}),{status:202,headers:{'content-type':'application/json'}});const pending=await api.request('email_find');assert.equal(pending.status,202);assert.equal((await pending.json()).status,'pending');
 const denied=optionalApi(f.client,{authOverride:async()=>{throw Error('PRIVATE authentication failure');}});assert.equal((await denied.request('email_find')).status,403);
 const injected={configured:true,lookup:async()=>({status:'ready',operation:'email_find',hasResult:true,output:{email:'rae@example.com',unknown_native:native},usage:{callId:'safe-call',provider:'synthetic.lookup',costMicro:null},raw:native,token})};const projected=await optionalApi(injected).request('email_find');assert.equal(projected.status,200);const safe=await projected.json();assert.deepEqual(safe.output,{email:'rae@example.com'});publicOnly(safe);
 for(const patch of [{output:{email:17}},{output:{email:''}},{hasResult:false},{usage:{callId:'safe',provider:'synthetic.lookup',costMicro:-1}}]){const unsafe=optionalApi({configured:true,lookup:async()=>({...await injected.lookup(),...patch})});const response=await unsafe.request('email_find');assert.equal(response.status,502);assert.deepEqual(await response.json(),{status:'invalid_response'});}
});

test('Dormant lookups fail honestly once: malformed outputs/usage, provider errors, cancellation and oversized bodies never fall back',async t=>{
 const f=await fixture(t);
 const malformed=[
  ['email_find',{output:{email:17}}],['email_find',{output:{email:'rae@example.com',confidence:1.01}}],['email_find',{output:{email:'rae@example.com',verified:'yes'}}],
  ['email_find',{output:{email:''}}],['email_find',{output:{email:' '}}],['phone_find',{output:{phone:' '}}],['company_enrich',{output:{name:''}}],['email_verify',{output:{valid:null,status:''}}],
  ['email_verify',{output:{valid:'true',status:'valid'}}],['email_verify',{output:{valid:true}}],['email_verify',{output:{valid:null,status:'unknown',score:0.5}}],
  ['phone_find',{output:{phone:123}}],['company_enrich',{output:{name:'Example',employees:-42}}],['company_enrich',{output:{name:'Example',founded:2020.5}}],
 ];
 for(const [operation,body] of malformed){const before=f.requests.length;f.mode.reply=()=>json({...body,raw:{native},_treg:{served_by:'synthetic.lookup'}});const result=await f.lookup(operation);assert.equal(result.status,'invalid_response');assert(!Object.hasOwn(result,'output'));publicOnly(result);assert.equal(f.requests.length,before+1);}
 for(const [status,expected] of [[402,'budget_exceeded'],[429,'rate_limited'],[500,'unavailable']]){const before=f.requests.length;f.mode.reply=()=>json({error:'PRIVATE_PROVIDER_ERROR '+token,raw:{native}},status);const result=await f.lookup('phone_find');assert.equal(result.status,expected);publicOnly(result);assert.equal(f.requests.length,before+1);}
 f.mode.reply=()=>new Response('not-json',{status:200});assert.equal((await f.lookup('email_find')).status,'invalid_response');
 f.mode.reply=()=>json(envelope('email_find'),200,{'x-treg-served-by':'different.provider'});assert.equal((await f.lookup('email_find')).status,'invalid_response');
 f.mode.reply=()=>json(envelope('email_find'),200,{'x-treg-cost-micro':'not-cost'});assert.equal((await f.lookup('email_find')).status,'invalid_response');
 f.mode.reply=()=>new Response(JSON.stringify({output:contracts.email_find.output,raw:{native},_treg:{served_by:null}}),{status:200,headers:{'content-type':'application/json'}});assert.equal((await f.lookup('email_find')).status,'invalid_response','A positive match needs an observed provider label; fixed-service fallback is for misses/pending only');
 for(const response of [()=>json({output:null,raw:null,_treg:{}},202),()=>json({output:null,raw:null,_treg:{outcome:'pending',served_by:'synthetic.lookup'}},200)]){f.mode.reply=response;assert.equal((await f.lookup('email_find')).status,'invalid_response','Pending requires the actual asynchronous202 envelope');}
 f.mode.reply=()=>new Response('x'.repeat(600000),{status:200});assert.equal((await f.lookup('company_enrich')).status,'response_too_large');const captured=(await f.logs()).flatMap(log=>log.events).find(event=>event.type==='response'&&event.data.truncated);assert(captured);assert.equal(captured.complete,false);
 delete f.mode.reply;f.mode.throw=true;const before=f.requests.length;const failed=await f.lookup('email_find');assert.equal(failed.status,'unavailable');publicOnly(failed);assert.equal(f.requests.length,before+1);delete f.mode.throw;
 const abort=new AbortController();f.mode.before=()=>abort.abort();assert.equal((await f.lookup('email_find',{signal:abort.signal})).status,'aborted');
 const text=JSON.stringify(await f.logs());assert(text.includes('PRIVATE_PROVIDER_ERROR'),'Safe private error details remain available only in full-call logs');assert(!text.includes(token));
});

test('Company counts: actual client normalizes only nonnegative safe integer employees before authenticated HTTP while native logs retain numbers',async t=>{
 const f=await fixture(t),api=optionalApi(f.client);
 const cases=[
  {present:true,input:15610,expected:'15610'}, {present:true,input:221000,expected:'221000'},
  {present:true,input:0,expected:'0'}, {present:true,input:-0,expected:'0'},
  {present:true,input:Number.MAX_SAFE_INTEGER,expected:'9007199254740991'},
  {present:true,input:'11-50',expected:'11-50'}, {present:true,input:'221000',expected:'221000'},
  {present:true,input:'',expected:''}, {present:true,input:'  ',expected:'  '},
  {present:true,input:null,expected:null}, {present:false},
 ];
 const original=[];
 for(const entry of cases){
  const output={name:'Synthetic Company',domain:'example.com',description:'',founded:2020,...(entry.present?{employees:entry.input}:{})};
  const body=envelope('company_enrich',output);original.push(structuredClone(body));
  f.mode.reply=()=>json(body);
  const before=f.requests.length,response=await api.request('company_enrich');assert.equal(response.status,200);
  const result=await response.json();assert.equal(result.status,'ready');assert.equal(result.hasResult,true);
  assert.deepEqual(result.output,{name:'Synthetic Company',domain:'example.com',description:'',founded:2020,...(entry.present?{employees:entry.expected}:{})});
  assert.equal(f.requests.length,before+1,'Each request performs exactly one named company lookup without fallback or storage');
  assert.deepEqual(body,original.at(-1),'Projecting the result cannot alter the native upstream envelope');publicOnly(result);
 }
 const entries=await f.logs();assert.equal(entries.length,cases.length);
 const responses=entries.map(log=>log.events.find(event=>event.type==='response').data.body);
 for(const body of original)assert(responses.some(saved=>JSON.stringify(saved.output)===JSON.stringify(body.output)),'Private log retains complete native output, including numeric employee counts');
 for(const count of [15610,221000,0,Number.MAX_SAFE_INTEGER])assert(responses.some(body=>body.output.employees===count&&typeof body.output.employees==='number'));
 const before=f.requests.length;
 for(const options of [{session:false},{headers:{origin:'https://attacker.example'}},{headers:{'sec-fetch-site':'cross-site'}}])assert.equal((await api.request('company_enrich',options)).status,403);
 assert.equal(f.requests.length,before,'Company lookup still rejects unauthorized requests before dispatch');
});

test('Company counts: malformed values and other-field coercions stay rejected; injected clients must already return the public string/null shape',async t=>{
 const f=await fixture(t),api=optionalApi(f.client);
 const invalid=[-1,-42,0.5,Number.MAX_SAFE_INTEGER+1,1e20,true,false,[],[42],{count:42}];
 for(const employees of invalid){
  f.mode.reply=()=>json(envelope('company_enrich',{name:'Synthetic Company',employees}));
  const before=f.requests.length,response=await api.request('company_enrich');assert.equal(response.status,502,JSON.stringify(employees));assert.deepEqual(await response.json(),{status:'invalid_response'});
  assert.equal(f.requests.length,before+1,'Bad provider values are not retried or sent to another service');
 }
 for(const output of [{name:42,employees:100},{name:'Synthetic Company',employees:100,founded:'2020'},{name:'Synthetic Company',employees:100,founded:2020.5},{name:'Synthetic Company',employees:100,domain:42}]){
  f.mode.reply=()=>json(envelope('company_enrich',output));assert.equal((await api.request('company_enrich')).status,502,'Normalizing employees must not coerce another field');
 }
 const ready=output=>({configured:true,lookup:async()=>({status:'ready',operation:'company_enrich',hasResult:true,output,usage:{callId:'safe-count-call',provider:'synthetic.lookup',costMicro:0}})});
 for(const employees of [42,0,Number.MAX_SAFE_INTEGER,...invalid]){
  const response=await optionalApi(ready({name:'Synthetic Company',employees})).request('company_enrich');assert.equal(response.status,502,'The HTTP boundary does not normalize an injected client numeric/invalid value');assert.deepEqual(await response.json(),{status:'invalid_response'});
 }
 for(const employees of ['42','11-50','',null]){
  const response=await optionalApi(ready({name:'Synthetic Company',employees})).request('company_enrich');assert.equal(response.status,200);assert.equal((await response.json()).output.employees,employees);
 }
});

test('Dormant lookups require durable logs before dispatch and before reporting success',async t=>{
 const blocked=await fixture(t);await writeFile(join(blocked.root,'not-directory'),'Not a log directory');const badLogger=createTregCallLogger({env:{},directory:join(blocked.root,'not-directory')});t.after(()=>badLogger.close());const client=createTregLookupClient({env:blocked.env,callLogger:badLogger,fetchImpl:async()=>{throw Error('Must not dispatch before logging');}});assert.equal((await client.lookup({operation:'email_find',input:contracts.email_find.input,requestId,principal})).status,'log_unavailable');
 for(const failedType of ['response','lookup_outcome']){
  const f=await fixture(t),wrapper={begin:async data=>{const result=await f.logger.begin(data);return {...result,session:{...result.session,append:async(type,body)=>type===failedType?{status:'log_unavailable'}:result.session.append(type,body)}};}};
  const local=createTregLookupClient({env:f.env,callLogger:wrapper,fetchImpl:async()=>json(envelope('email_find'))});const result=await local.lookup({operation:'email_find',input:contracts.email_find.input,requestId,principal});assert.equal(result.status,'log_unavailable');assert(!Object.hasOwn(result,'output'));publicOnly(result);
 }
 const f=await fixture(t),controller=new AbortController(),delayed={begin:async data=>{const result=await f.logger.begin(data);return {...result,session:{...result.session,append:async(type,body)=>{const outcome=await result.session.append(type,body);if(type==='lookup_outcome')controller.abort();return outcome;}}};}};
 const interrupted=createTregLookupClient({env:f.env,callLogger:delayed,fetchImpl:async()=>json(envelope('email_find'))});assert.deepEqual(await interrupted.lookup({operation:'email_find',input:contracts.email_find.input,requestId,principal,signal:controller.signal}),{status:'aborted'},'Cancellation while durable completion is awaited must never return ready');assert.equal((await f.logs())[0].events.at(-1).data.status,'aborted');
 let deadline; t.mock.method(AbortSignal,'timeout',()=>deadline.signal);
 for(const phase of ['provider','completion'])for(const pending of [false,true]){
  deadline=new AbortController();const f=await fixture(t),logging={begin:async data=>{const result=await f.logger.begin(data);return {...result,session:{...result.session,append:async(type,body)=>{const outcome=await result.session.append(type,body);if(phase==='completion'&&type==='lookup_outcome')deadline.abort();return outcome;}}};}};
  const client=createTregLookupClient({env:f.env,callLogger:logging,fetchImpl:async()=>{if(phase==='provider')deadline.abort();return pending?json({output:null,_treg:{outcome:'pending',served_by:'synthetic.lookup'}},202):json(envelope('email_find'));}});
  const result=await client.lookup({operation:'email_find',input:contracts.email_find.input,requestId,principal});assert.deepEqual(result,{status:'unavailable'},`The combined timeout signal must prevent ${pending?'pending':'ready'} after ${phase}`);const events=(await f.logs())[0].events;assert.equal(events.at(-1).data.status,'unavailable');
  if(phase==='provider'){const response=events.find(event=>event.type==='response');assert.equal(response.complete,false);assert.equal(response.data.error,'timeout');}
 }
});

test('Four new lookup routes remain dormant in the actual app and existing Treg catalogue stays exactly two tools',async t=>{
 const f=await fixture(t),api=optionalApi(f.client),existingFetch=async()=>{throw Error('No existing lookup should dispatch during boundary inspection');};
 const tools=createTregTools({peopleClient:createTregPeopleClient({env:f.env,fetchImpl:existingFetch,callLogger:f.logger}),enrichmentClient:createTregEnrichmentClient({env:f.env,fetchImpl:existingFetch,callLogger:f.logger})});
 const app=createApp({config:api.config,provider:{},auth:api.siteAuth.auth,tregTools:tools,audit:{recordEvent:async()=>{}}});
 for(const {path,input} of Object.values(contracts)){const response=await app.fetch(new Request(api.origin+path,{method:'POST',headers:{origin:api.origin,cookie:api.cookie,'content-type':'application/json'},body:JSON.stringify({requestId,input})}));assert.equal(response.status,404,'Default app must never register a dormant handler');}
 const catalogue=await app.fetch(new Request(api.origin+'/api/tools',{headers:{cookie:api.cookie}}));assert.equal(catalogue.status,200);assert.deepEqual((await catalogue.json()).tools.filter(tool=>tool.name.includes('treg')).map(tool=>tool.name).sort(),['enrich_treg_people','search_treg_people']);assert.equal(f.requests.length,0);
});
