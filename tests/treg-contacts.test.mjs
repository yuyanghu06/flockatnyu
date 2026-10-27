import test from 'node:test';
import assert from 'node:assert/strict';
import {tregContactsFixture,tregPerson,tregQuery,tregRequestId,tregStamp} from './fixtures/treg-contacts.mjs';
import {readTregPeopleConfig} from '../server/treg/people.js';

const bodyOf=async response=>({code:response.status,body:await response.json()});
const requestId2='51000000-0000-4000-8000-000000000002';
const fields={first_name:'Rae',last_name:'Example',email:'rae@example.com',phone_number:'+1 001 555 0100',workplace:'',notes:''};

test('Treg import: actual authenticated route preserves provider data and saves only confirmed contact fields',async()=>{
  const f=tregContactsFixture();
  const response=await f.request(),result=await response.json();
  assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/private.*no-store/);
  assert.equal(result.status,'ready');assert.equal(result.imported,1);assert.equal(result.existing,0);assert.equal(result.skipped,0);
  assert.equal(f.state.length,1);assert.equal(f.applied.length,1);assert.deepEqual(result.contacts[0].fields,fields);
  assert.deepEqual(f.state[0].raw_input,tregPerson,'Native provider row is saved exactly, without normalization or added provenance');
  assert.deepEqual(result.usage,{callId:'synthetic-call-1',costMicro:1234,provider:'exa.people.search'});
  assert(!JSON.stringify(result).includes('private_extra'));assert(!JSON.stringify(result).includes('raw_input'));
  const call=f.tregRequests[0];assert.equal(call.method,'POST');assert.equal(call.body.category,'people');assert.equal(call.body.numResults,tregQuery.limit);assert(call.body.query.includes(tregQuery.q));
  assert.equal(call.headers.get('x-treg-token'),'synthetic-treg-secret');assert.equal(Number(call.headers.get('x-treg-route-max-cost')),0.1);
  assert.equal(call.headers.get('x-treg-route-waterfall'),'0');assert(call.headers.get('idempotency-key'));
  assert(call.headers.get('x-treg-meta'));assert(!call.headers.get('x-treg-meta').includes('rae@example.com'));
  assert.equal(f.discordCalls,0);assert.equal(f.audit.length,0);
});

test('Treg import: known provider records remain faithful without guessing missing or obfuscated information',async()=>{
  const cases=[
    {provider:'aiark.people.search',person:{id:'aiark-1',profile:{first_name:'Ali',last_name:'Example',full_name:'Ali Example',title:'Founder'},company:{name:'AI Example'},link:{linkedin:'https://www.linkedin.com/in/ali-example'}},expected:{first_name:'',last_name:'',email:'',phone_number:'',workplace:'',notes:''}},
    {provider:'apollo.people.search',person:{id:'apollo-1',first_name:'Avery',last_name_obfuscated:'Ex***e',full_name:'Avery Example',has_email:true,organization:{name:'Apollo Example'}},expected:{first_name:'Avery',last_name:'',email:'',phone_number:'',workplace:'',notes:''}},
    {provider:'exa.people.search',person:{id:'https://exa.ai/library/person/synthetic',url:'https://www.linkedin.com/in/jane-example',entities:[{type:'person',properties:{firstName:'Jane',lastName:'Example',workHistory:[{dates:{to:'2025-01-01'},company:{name:'Old Co'}},{dates:{to:null},company:{name:'Current Co'}}]}}]},expected:{first_name:'Jane',last_name:'Example',email:'',phone_number:'',workplace:'Current Co',notes:''}},
    {provider:'hunter.companies.emails',person:{value:'hunter@example.com',first_name:'Hunter',last_name:'Example',phone_number:'+44 020 000 000',position:'Engineer'},expected:{first_name:'Hunter',last_name:'Example',email:'',phone_number:'+44 020 000 000',workplace:'',notes:''}},
  ];
  for(const entry of cases) {
    const f=tregContactsFixture({people:[entry.person],provider:entry.provider});
    const {code,body}=await bodyOf(await f.request());assert.equal(code,200,entry.provider);assert.equal(body.imported,1,entry.provider);
    assert.deepEqual(body.contacts[0].fields,entry.expected,entry.provider);assert.deepEqual(f.state[0].raw_input,entry.person);
  }
  const unknown=tregContactsFixture({people:[{full_name:'Do Not Split This',company:'Do Not Guess',unrecognized:'data'}],provider:'unknown.people.search'});
  const result=await(await unknown.request()).json();assert.equal(result.imported,1);assert.equal(result.skipped,0);assert.deepEqual(unknown.state[0].raw_input,{full_name:'Do Not Split This',company:'Do Not Guess',unrecognized:'data'});
  const native={first_name:{native:'object name'},last_name:123,email:null,phone_number:['native','list'],workplace:{name:'native object'},notes:{body:'native notes'},treg:{native:'retain this too'},extra:{nested:[1,null,{keep:true}]}};
  const collisions=tregContactsFixture({people:[native],provider:'unknown.people.search'}),collisionResult=await(await collisions.request()).json();
  assert.equal(collisionResult.imported,1);assert.deepEqual(collisions.state[0].raw_input,native);
  assert.deepEqual(collisionResult.contacts[0].fields,{first_name:'',last_name:'',email:'',phone_number:'',workplace:'',notes:''},'Only supported native strings enter the six-field display');
});

test('Treg import: retries and concurrent imports do not duplicate or overwrite saved human changes',async()=>{
  const f=tregContactsFixture();
  const first=await(await f.request()).json(),id=first.contacts[0].id;
  f.edit(id,{notes:'Human note — preserve exactly',workplace:'Human workplace',legacy:{do:'not remove'}});
  const saved=f.state[0];
  const replay=await(await f.request()).json();assert.equal(replay.imported,0);assert.equal(replay.existing,1);
  assert.deepEqual(f.state[0],saved);assert.equal(f.state.length,1);assert.equal(f.applied.length,1);
  const repeated=await(await f.request({body:{query:tregQuery,requestId:requestId2}})).json();assert.equal(repeated.existing,1);assert.equal(f.state.length,1);assert.deepEqual(f.state[0],saved);
  assert.equal(f.tregRequests[0].headers.get('idempotency-key'),f.tregRequests[1].headers.get('idempotency-key'));
  assert.notEqual(f.tregRequests[0].headers.get('idempotency-key'),f.tregRequests[2].headers.get('idempotency-key'));
  const concurrent=tregContactsFixture();
  const results=await Promise.all([concurrent.request(),concurrent.request()]);
  const bodies=await Promise.all(results.map(response=>response.json()));
  assert.equal(concurrent.state.length,1);assert.equal(concurrent.applied.length,1);assert.equal(bodies.reduce((n,x)=>n+x.imported,0),1);assert.equal(bodies.reduce((n,x)=>n+x.existing,0),1);
  assert(concurrent.storageRequests.filter(request=>new URL(request.url).pathname==='/rest/v1/contacts'&&request.method==='POST').every(request=>request.headers.get('prefer')?.includes('resolution=ignore-duplicates')));
  const duplicateRows=tregContactsFixture({people:[tregPerson,tregPerson]});
  const duplicate=await(await duplicateRows.request()).json();assert.equal(duplicate.imported,1);assert.equal(duplicate.skipped,1);assert.equal(duplicateRows.state.length,1);
});

test('Treg import: existing exact email is preserved and request keys bind the actor and complete query',async()=>{
  const existing={id:'52000000-0000-4000-8000-000000000001',created_at:tregStamp,updated_at:tregStamp,raw_input:{...fields,email:'RAE@example.com',notes:'Existing manual data',legacy:{keep:true}}};
  const f=tregContactsFixture({rows:[existing]});
  const result=await(await f.request()).json();assert.equal(result.existing,1);assert.equal(result.imported,0);assert.deepEqual(f.state,[existing]);assert.equal(f.applied.length,0);
  const unrelated=tregContactsFixture();
  unrelated.mode.storageReadResponse=()=>new Response(JSON.stringify([{...existing,raw_input:{...existing.raw_input,email:'different@example.com'}}]),{status:200});
  const wrong=await(await unrelated.request()).json();assert.equal(wrong.status,'partial');assert.equal(wrong.imported,0);assert.equal(wrong.existing,0);assert.deepEqual(wrong.contacts,[]);assert.equal(unrelated.applied.length,0);
  const base={query:tregQuery,requestId:tregRequestId,principal:{id:'actor-1',allowedSourceIds:[]}};
  const tracking=tregContactsFixture();
  await tracking.client.search(base);
  await tracking.client.search({...base,query:{...tregQuery,title:'Different title'}});
  await tracking.client.search({...base,principal:{id:'actor-2',allowedSourceIds:[]}});
  assert.equal(new Set(tracking.tregRequests.map(request=>request.headers.get('idempotency-key'))).size,3);
});

test('Treg import: session, Origin and bounded input checks reject before paid lookups or persistence',async()=>{
  const f=tregContactsFixture();
  for(const options of [{session:false},{headers:{origin:'https://evil.example'}},{headers:{origin:'null'}},{headers:{'sec-fetch-site':'cross-site'}}])assert.equal((await f.request(options)).status,403);
  const invalid=[null,[],{}, {query:tregQuery}, {query:tregQuery,requestId:'wrong'}, {query:{},requestId:tregRequestId},
    {query:{q:'x',limit:11},requestId:tregRequestId},{query:{q:'x',limit:0},requestId:tregRequestId},{query:{q:'x',limit:1.5},requestId:tregRequestId},
    {query:{q:'x',extra:'bad'},requestId:tregRequestId},{query:tregQuery,requestId:tregRequestId,extra:'bad'},
    {query:{q:'x'.repeat(20000)},requestId:tregRequestId},{query:{q:'x',keywords:['x'.repeat(20000)]},requestId:tregRequestId}];
  for(const body of invalid)assert.equal((await f.request({body})).status,400,JSON.stringify(body)?.slice(0,100));
  assert.equal((await f.request({body:'not-json'})).status,400);
  assert.equal((await f.request({headers:{'content-type':'text/plain'}})).status,400);
  assert.equal((await f.request({path:'/api/contacts/import/treg?extra=1'})).status,400);
  assert.equal((await f.request({body:'x'.repeat(40000)})).status,400);
  assert.equal(f.tregRequests.length,0);assert.equal(f.storageRequests.length,0);
  const local=tregContactsFixture({production:false});
  assert.equal((await local.request({headers:{origin:''},env:{incoming:{socket:{remoteAddress:'127.0.0.1'}}}})).status,403);
});

test('Treg import: missing configuration, empty results and unsafe upstream output never write or expose raw errors',async()=>{
  const missing=tregContactsFixture({token:''});assert.equal((await missing.request()).status,503);assert.equal(missing.tregRequests.length,0);assert.equal(missing.storageRequests.length,0);
  for(const env of [{TREG_MAX_COST_USD:'-1'},{TREG_MAX_COST_USD:'Infinity'},{TREG_MAX_COST_USD:'not-money'},{TREG_TOKEN:'bad\nheader'}])assert.equal(readTregPeopleConfig({TREG_TOKEN:'synthetic',...env}).configured,false);
  const empty=tregContactsFixture({people:[]});const result=await(await empty.request()).json();assert.equal(result.status,'ready');assert.equal(result.imported,0);assert.equal(empty.applied.length,0);
  const cases=[
    {upstreamStatus:402,upstream:{error:'insufficient_balance',balance:500,secret:'synthetic-treg-secret',message:'PRIVATE rae@example.com'}},
    {upstreamStatus:429,upstream:{error:'PRIVATE upstream quota'}},
    {upstreamStatus:500,upstream:{message:'PRIVATE upstream failure'}},
    {upstream:{results:[tregPerson,null]}},
    {upstream:{results:'invalid'}},
    {upstream:{results:[tregPerson],_treg:{served_by:'different.provider'}}},
    {upstream:{results:[{...tregPerson,huge:'x'.repeat(300000)}]}},
  ];
  for(const entry of cases) {
    const f=tregContactsFixture(entry),response=await f.request(),text=await response.text();
    assert(response.status>=400);assert.equal(f.applied.length,0);assert.equal(f.storageRequests.length,0);assert.equal(f.tregRequests.length,1);
    assert(!/PRIVATE|synthetic-treg-secret|rae@example.com|balance/.test(text));
  }
  const thrown=tregContactsFixture();thrown.mode.tregThrow=true;const response=await thrown.request();assert.equal(response.status,503);assert(!/PRIVATE|synthetic-treg-secret|rae@example.com/.test(await response.text()));assert.equal(thrown.applied.length,0);
});

test('Treg import: cancellation and malformed provider responses stop before storage',async()=>{
  const aborted=tregContactsFixture(),controller=new AbortController();controller.abort();
  const cancelled=await aborted.importer.importPeople({query:tregQuery,requestId:tregRequestId,principal:{id:'actor-1',allowedSourceIds:[]},signal:controller.signal});
  assert.equal(cancelled.status,'aborted');assert.equal(aborted.tregRequests.length,0);assert.equal(aborted.applied.length,0);
  for(const produce of [()=>new Response('not-json',{status:200}),()=>new Response(new Uint8Array(600001),{status:200})]) {
    const f=tregContactsFixture();f.mode.tregResponse=produce;
    const response=await f.request();assert(response.status>=400);assert.equal(f.storageRequests.length,0);assert.equal(f.tregRequests.length,1);
  }
  const ownKey=tregContactsFixture();
  ownKey.mode.tregResponse=()=>new Response(JSON.stringify({results:[tregPerson]}),{status:200,headers:{'X-Treg-Call-Id':'synthetic-own-key-call'}});
  const result=await(await ownKey.request()).json();assert.equal(result.usage.costMicro,null,'Absent/empty cost is unknown, not a fabricated zero');
  const paidMiss=tregContactsFixture();
  paidMiss.mode.tregResponse=()=>new Response(JSON.stringify({results:[]}),{status:200,headers:{'X-Treg-Call-Id':'synthetic-paid-miss','X-Treg-Cost-Micro':'123'}});
  const miss=await(await paidMiss.request()).json();assert.equal(miss.status,'ready');assert.equal(miss.usage.callId,'synthetic-paid-miss');assert.equal(miss.usage.costMicro,123);assert.equal(paidMiss.applied.length,0);
  const badCharge=tregContactsFixture();
  badCharge.mode.tregResponse=()=>new Response(JSON.stringify({results:[]}),{status:200,headers:{'X-Treg-Cost-Micro':'PRIVATE bad charge'}});
  const bad=await badCharge.request();assert(bad.status>=400);assert.equal(badCharge.applied.length,0);
});

test('Treg import: partial and uncertain database writes return only confirmed receipts and never retry blindly',async()=>{
  const second={...tregPerson,id:'synthetic-person-2',email:'second@example.com',first_name:'Second'};
  const f=tregContactsFixture({people:[tregPerson,second],storageFailure:'after',storageFailureAt:2});
  const response=await f.request(),result=await response.json();
  assert.equal(result.status,'partial');assert.equal(result.imported,1);assert.equal(result.contacts.length,1);assert.equal(result.reason,'write_outcome_unknown');
  assert.equal(f.applied.length,2,'Second commit happened but must not be called confirmed');assert.equal(f.storageRequests.filter(request=>new URL(request.url).pathname==='/rest/v1/contacts'&&request.method==='POST').length,2);
  assert(!JSON.stringify(result).includes('PRIVATE'));assert(result.usage.callId);
  for(const failure of ['before','after','malformed']) {
    const h=tregContactsFixture({storageFailure:failure}),r=await(await h.request()).json();
    assert.equal(r.imported,0);assert.equal(r.contacts.length,0);assert.equal(r.reason,'write_outcome_unknown');
    assert.equal(h.storageRequests.filter(request=>new URL(request.url).pathname==='/rest/v1/contacts'&&request.method==='POST').length,1);
    assert.equal(h.applied.length,failure==='before'?0:1);
  }
});
