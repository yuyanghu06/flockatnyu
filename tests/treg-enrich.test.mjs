import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readdir,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createTregEnrichmentClient} from '../server/treg/enrich.js';
import {createTregCallLogger} from '../server/treg/call-log.js';

const requestId='61000000-0000-4000-8000-000000000001',principal={id:'synthetic-enrichment-worker',allowedSourceIds:[]};
const email='Rae@Example.com';
const envelope={output:{full_name:'Rae Example',email:'rae@example.com'},raw:{person:{first_name:'Rae',last_name:'Example',email:'rae@example.com',native_extra:{keep:[1,null,'exact']},workplace:{name:'Native Company Object'}}},_treg:{served_by:'synthetic.people.enrich',tried:[{provider:'synthetic',cost_micro:2500}]}};
async function fixture(t,{response=envelope,status=200,headers={},env={},callLogger}={}) {
  const root=await mkdtemp(join(tmpdir(),'flock-treg-enrich-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const requests=[],mode={},configuration={TREG_TOKEN:'synthetic-enrich-secret',TREG_CALL_LOG_DIR:join(root,'calls'),...env};
  const logger=callLogger??createTregCallLogger({env:configuration});
  t.after(()=>logger.close?.());
  const fetchImpl=async(input,init={})=>{
    assert.equal(String(input),'https://treg.to/call/treg.people.enrich','No Gmail or other business-service requests');
    if(init.signal?.aborted)throw new DOMException('Aborted','AbortError');
    requests.push({url:String(input),method:init.method,headers:new Headers(init.headers),body:JSON.parse(init.body),signal:init.signal});
    if(mode.throw)throw Error('PRIVATE transport exception synthetic-enrich-secret');
    if(mode.reply)return mode.reply();
    return new Response(JSON.stringify(response),{status,headers:{'content-type':'application/json','x-treg-call-id':'synthetic-enrich-call','x-treg-cost-micro':'2500','x-treg-served-by':'synthetic.people.enrich',...headers}});
  };
  const client=createTregEnrichmentClient({env:configuration,fetchImpl,callLogger:logger});
  const enrich=options=>client.enrich({email,requestId,principal,...options});
  const logs=async()=>{
    const entries=await readdir(configuration.TREG_CALL_LOG_DIR);
    return Promise.all(entries.filter(name=>name.endsWith('.jsonl')).map(async name=>(await readFile(join(configuration.TREG_CALL_LOG_DIR,name),'utf8')).trim().split('\n').map(line=>JSON.parse(line))));
  };
  return {client,enrich,requests,mode,logs,logger};
}

test('Treg email enrichment sends only the email and preserves the complete native response and private log',async t=>{
  const f=await fixture(t),result=await f.enrich();
  assert.equal(result.status,'ready');assert.equal(result.matched,true);assert.deepEqual(result.enrichment,envelope);
  assert.deepEqual(result.usage,{callId:'synthetic-enrich-call',costMicro:2500,provider:'synthetic.people.enrich'});
  assert.equal(f.requests.length,1);assert.equal(f.requests[0].method,'POST');assert.deepEqual(f.requests[0].body,{email:email.toLowerCase()});
  assert.equal(f.requests[0].headers.get('x-treg-token'),'synthetic-enrich-secret');assert.equal(Number(f.requests[0].headers.get('x-treg-route-max-cost')),0.1);assert.equal(f.requests[0].headers.get('x-treg-route-waterfall'),'0');
  const entries=await f.logs();assert.equal(entries.length,1);assert.deepEqual(entries[0].map(event=>event.type),['request','response']);
  assert.deepEqual(entries[0][0].data.body,{email:email.toLowerCase()});assert.deepEqual(entries[0][1].data.body,envelope);
  assert(!JSON.stringify(entries).includes('synthetic-enrich-secret'));assert(result.callLog?.logId);
  const outcome={status:'ready',cacheWritten:true,contact:{operation:'imported',id:'61000000-0000-4000-8000-000000000002'}};
  assert.equal((await result.finishLog(outcome)).status,'ready');assert.deepEqual((await f.logs())[0].at(-1).data,outcome);
});

test('Treg email enrichment identifies misses and keeps errors, malformed responses and logging failures honest',async t=>{
  const miss=await fixture(t,{response:{output:{full_name:null,email:null},raw:{native_miss:true},_treg:{served_by:'synthetic.people.enrich'}}});
  const missed=await miss.enrich();assert.equal(missed.status,'ready');assert.equal(missed.matched,false);assert.equal(missed.enrichment.raw.native_miss,true);
  for(const status of [402,429,500]) {
    const f=await fixture(t,{status,response:{error:'PRIVATE response synthetic-enrich-secret',details:{provider_error:'retain private raw error'}}});
    const failed=await f.enrich();assert.notEqual(failed.status,'ready');assert(!Object.hasOwn(failed,'enrichment'));assert(!JSON.stringify(failed).includes('PRIVATE'));
    const entries=await f.logs();assert(JSON.stringify(entries).includes('retain private raw error'));assert(!JSON.stringify(entries).includes('synthetic-enrich-secret'));assert.equal(f.requests.length,1);
  }
  const malformed=await fixture(t);malformed.mode.reply=()=>new Response('invalid JSON',{status:200});assert.notEqual((await malformed.enrich()).status,'ready');
  const huge=await fixture(t);huge.mode.reply=()=>new Response('x'.repeat(600001),{status:200});assert.equal((await huge.enrich()).status,'response_too_large');assert.equal((await huge.logs())[0][1].complete,false);
  const blocked=await fixture(t,{callLogger:{begin:async()=>({status:'log_unavailable'})}});assert.equal((await blocked.enrich()).status,'log_unavailable');assert.equal(blocked.requests.length,0);
  const transport=await fixture(t);transport.mode.throw=true;const failure=await transport.enrich();assert.equal(failure.status,'unavailable');assert(!JSON.stringify(await transport.logs()).includes('PRIVATE transport exception'));
});

test('Treg email enrichment validates inputs before calls and binds retries to the actor and email',async t=>{
  const f=await fixture(t);
  for(const invalid of ['',null,' Person <rae@example.com>','rae@example.com ','a\nb@example.com','not-email','x'.repeat(321)+'@example.com']) {
    assert.equal((await f.enrich({email:invalid})).status,'invalid_request');
  }
  assert.equal((await f.enrich({requestId:'not-a-uuid'})).status,'invalid_request');assert.equal((await f.enrich({principal:{}})).status,'forbidden');assert.equal(f.requests.length,0);
  const controller=new AbortController();controller.abort();assert.equal((await f.enrich({signal:controller.signal})).status,'aborted');assert.equal(f.requests.length,0);
  await f.enrich();await f.enrich({email:'rae@example.com'});await f.enrich({email:'other@example.com'});await f.enrich({principal:{...principal,id:'different-worker'}});
  const keys=f.requests.map(request=>request.headers.get('idempotency-key'));assert.equal(keys[0],keys[1]);assert.notEqual(keys[0],keys[2]);assert.notEqual(keys[0],keys[3]);
  const absent=await fixture(t,{env:{TREG_TOKEN:''}});assert.equal((await absent.enrich()).status,'not_configured');assert.equal(absent.requests.length,0);
});
