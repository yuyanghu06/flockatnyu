import test from 'node:test';
import assert from 'node:assert/strict';
import {createTregResultCache} from '../server/treg/result-cache.js';
import {contactFields} from '../server/contacts/fields.js';
import {tregToolsFixture,fixtureSecret} from './fixtures/treg-tools.mjs';
import {saveFixture,principal,hiddenNative} from './fixtures/treg-save.mjs';

const engineer={id:'https://exa.ai/library/person/example-engineer',title:'A name that must not be split',url:'https://www.linkedin.com/in/example-engineer',
  entities:[{type:'person',properties:{firstName:'Renée',lastName:'Example',name:'Ignore this full name',workHistory:[
    {title:'Former Engineer',dates:{to:'2025-01-01'},company:{name:'Former Company'}},
    {title:'Software Engineer',dates:{to:null},company:{name:'Example Labs'}},
  ],extra:{keep:[null,'native',hiddenNative]}}}],highlights:['Provider prose is not a contact field']};
const invoke=(tools,name,args)=>tools.execute({name,arguments:args,principal});
const search=(f,query,requestId='91000000-0000-4000-8000-000000000001',extra={})=>f.peopleClient.search({query,requestId,principal,...extra});

test('Exa search sends every supplied criterion to one fixed native endpoint and binds idempotency to effective arguments',async()=>{
  const f=tregToolsFixture({people:[engineer]});
  const query={q:'Machine learning engineers',full_name:'Renée Example',company_domain:'example.com',title:'software engineer',country:'US',location:'New York',keywords:['distributed systems','C++'],limit:1};
  const found=await search(f,query);assert.equal(found.status,'ready');assert.deepEqual(found.people,[engineer]);assert.equal(found.usage.provider,'exa.people.search');
  const first=f.requests[0];assert.equal(first.path,'/call/exa.people.search');assert.equal(first.body.category,'people');assert.equal(first.body.numResults,1);
  for(const value of [query.q,query.full_name,query.company_domain,query.title,query.country,query.location,...query.keywords])assert(first.body.query.includes(value),'Supplied criterion must reach Exa: '+value);
  assert.equal(first.headers.get('x-treg-route-max-cost'),'0.10');assert.equal(first.headers.get('x-treg-route-waterfall'),'0');
  await search(f,query);assert.equal(f.requests[1].headers.get('idempotency-key'),first.headers.get('idempotency-key'));
  await search(f,{...query,title:'principal engineer'});assert.notEqual(f.requests[2].headers.get('idempotency-key'),first.headers.get('idempotency-key'));
  await search(f,query,undefined,{principal:{...principal,id:'another-actor'}});assert.notEqual(f.requests[3].headers.get('idempotency-key'),first.headers.get('idempotency-key'));
  const suppliedOnly=tregToolsFixture({people:[]});await search(suppliedOnly,{company_domain:'opaque-example.com'});
  assert.equal(suppliedOnly.requests[0].body.query,'Find people matching these supplied criteria:\nCompany domain: opaque-example.com','Do not infer a company name, role or extra filters');
  assert.equal(suppliedOnly.requests[0].body.numResults,5);
});

test('Native Exa records pass from lookup to a separate import unchanged and render supported fields without fetching sources',async()=>{
  const f=saveFixture({people:[engineer]}),tregResults=createTregResultCache({principal});
  const treg=f.tregTools.createRequest({principal,userMessage:'Find and save engineers',tregResults});
  const contacts=f.contactsTools.createRequest({principal,userMessage:'Find and save engineers',tregResults});
  const found=await invoke(treg,'search_treg_people',{company_domain:'example.com',limit:1});assert.equal(found.status,'ready');
  assert.deepEqual(found.people[0].fields,{first_name:'Renée',last_name:'Example',workplace:'Example Labs'});assert.equal(f.storage.requests.length,0);
  assert(!JSON.stringify(found).includes(hiddenNative));assert(!JSON.stringify(found).includes('entities'));assert(found.people[0].resultId);
  const saved=await invoke(contacts,'import_treg_contacts',{resultIds:[found.people[0].resultId]});assert.equal(saved.status,'ready');assert.equal(saved.contactImport.imported,1);
  assert.deepEqual(f.storage.state[0].raw_input,engineer);assert.equal(f.requests.length,1,'Saving and rendering cannot trigger Exa, profile, Discord, Calendar or Gmail reads');
  assert.deepEqual(contactFields(f.storage.state[0]),{first_name:'Renée',last_name:'Example',email:'',phone_number:'',workplace:'Example Labs',notes:''});
  const before=structuredClone(f.storage.state);await invoke(contacts,'import_treg_contacts',{resultIds:[found.people[0].resultId]});assert.deepEqual(f.storage.state,before);assert.equal(f.storage.attempts.length,1);
});

test('Exa unknown records are retained while malformed pages and unsafe usage return honest failures without fallback',async()=>{
  const unknown={unknown_native:{name:'Do not split this',company:'Do not infer this'},extra:[false,null]};
  const good=tregToolsFixture({people:[unknown]});const found=await search(good,{q:'Unknown',limit:1});assert.equal(found.status,'ready');assert.deepEqual(found.people,[unknown]);
  const invalid=[{results:null},{results:[null]},{results:[[]]},{results:[engineer,engineer]},{output:{people:[engineer]}},{results:[{huge:'x'.repeat(32001)}]}];
  for(const body of invalid){const f=tregToolsFixture({searchBody:body});const value=await search(f,{q:'One result',limit:1});assert.equal(value.status,'invalid_response');assert.equal(f.requests.length,1);assert.equal(value.people,undefined);}
  for(const headers of [{'x-treg-cost-micro':'NaN'},{'x-treg-call-id':'bad call id'},{'x-treg-served-by':'bad provider label'},{'x-treg-served-by':'exa.people.search'}]){
    const f=tregToolsFixture();f.modes.reply=()=>Response.json({results:[engineer],...(headers['x-treg-served-by']==='exa.people.search'?{_treg:{served_by:'different.provider'}}:{})},{headers});
    assert.equal((await search(f,{q:'One result',limit:1})).status,'invalid_response');assert.equal(f.requests.length,1);
  }
  const direct=tregToolsFixture();direct.modes.reply=()=>Response.json({results:[engineer]});const value=await search(direct,{q:'Direct response',limit:1});assert.equal(value.status,'ready');assert.deepEqual(value.usage,{provider:'exa.people.search',callId:null,costMicro:null});
  const unavailable=tregToolsFixture({searchStatus:503});const result=await unavailable.request().execute({name:'search_treg_people',arguments:{q:'Fail once'}});assert.notEqual(result.status,'ready');assert.equal(unavailable.requests.length,1);assert(!JSON.stringify(result).includes(fixtureSecret));
});

test('Exa display uses explicit names and one current employer; manual clears and existing native person fields take priority',()=>{
  const empty={first_name:'',last_name:'',email:'',phone_number:'',workplace:'',notes:''};
  const field=raw=>contactFields({raw_input:raw,lookup_email:'lookup@example.com'});
  const base=structuredClone(engineer),properties=base.entities[0].properties;
  assert.deepEqual(field(base),{...empty,first_name:'Renée',last_name:'Example',email:'lookup@example.com',workplace:'Example Labs'});
  assert.deepEqual(field({...base,first_name:'',last_name:null,workplace:false,email:''}),empty,'Own clear/invalid fields suppress every fallback');
  assert.deepEqual(field({...base,person:{first_name:'Existing',last_name:'Native',workplace:'Person Company',email:'native@example.com'}}),{...empty,first_name:'Existing',last_name:'Native',workplace:'Person Company',email:'native@example.com'});
  const ambiguous={...base,entities:[base.entities[0],{type:'person',properties:{firstName:'Other'}}]};assert.deepEqual(field(ambiguous),{...empty,email:'lookup@example.com'});
  const duplicateCurrent={...base,entities:[{type:'person',properties:{...properties,workHistory:[...properties.workHistory,{dates:{to:null},company:{name:'Other Current Company'}}]}}]};assert.equal(field(duplicateCurrent).workplace,'');
  const incompleteCurrent={...base,entities:[{type:'person',properties:{...properties,workHistory:[...properties.workHistory,{dates:{to:null}}]}}]};assert.equal(field(incompleteCurrent).workplace,'','A current job with missing company still makes employment ambiguous');
  const fullNameOnly={title:'Never Split This',entities:[{type:'person',properties:{name:'Never Split This',workHistory:[{company:{name:'Missing End Date'}}]}}]};assert.deepEqual(field(fullNameOnly),{...empty,email:'lookup@example.com'});
  const utf={...base,entities:[{type:'person',properties:{firstName:'😀'.repeat(100),lastName:'😀'.repeat(101),workHistory:[{dates:{to:null},company:{name:'😀'.repeat(251)}}]}}]};
  assert.equal(field(utf).first_name,'😀'.repeat(100));assert.equal(field(utf).last_name,'');assert.equal(field(utf).workplace,'');
});
