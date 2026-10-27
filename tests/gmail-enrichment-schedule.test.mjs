import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {isGmailEnrichmentScheduleTime,drainGmailEnrichment} from '../server/gmail-enrichment/schedule.js';
import {runGmailEnrichmentCli,createGmailEnrichmentRuntime} from '../server/gmail-enrichment/cli.js';

const noWait=async()=>{};
const counts=overrides=>({claimed:0,enriched:0,imported:0,existing:0,missed:0,deferred:0,requests:0,costMicro:0,unknownCost:false,jobCompleted:0,loggingFailures:0,...overrides});
const batch=(n,extra={})=>({status:'ready',counts:counts({claimed:n,enriched:n,imported:n,requests:n,costMicro:n*2500,jobCompleted:n,...extra}),outcomes:[]});
function fakeRuntime(results){let calls=0,closed=0;return {config:{pollMs:5000},worker:{once:async({signal}={})=>{assert(signal===undefined||signal instanceof AbortSignal);const next=results[Math.min(calls++,results.length-1)];if(next instanceof Error)throw next;return structuredClone(next);}},close:async()=>{closed++;},get calls(){return calls;},get closed(){return closed;}};}

test('scheduled enrichment follows New York 9 AM across summer, winter and both DST transitions',async()=>{
  const cases=[
    ['2026-07-01T13:00:00Z',true],['2026-07-01T14:00:00Z',false],['2026-12-01T13:00:00Z',false],['2026-12-01T14:00:00Z',true],
    ['2026-03-08T13:00:00Z',true],['2026-03-08T14:00:00Z',false],['2026-11-01T13:00:00Z',false],['2026-11-01T14:00:00Z',true],
    ['2026-07-01T13:59:59Z',true],['2026-07-01T12:59:59Z',false],['2026-10-26T22:30:00Z',false],
  ];
  for(const [stamp,due] of cases){assert.equal(isGmailEnrichmentScheduleTime(new Date(stamp)),due,stamp);let created=0;const runtime=fakeRuntime([batch(0)]),output=[];const result=await runGmailEnrichmentCli({waitImpl:noWait,argv:['scheduled'],now:()=>new Date(stamp),createRuntime:()=>{created++;return runtime;},write:value=>output.push(value)});assert.equal(created,due?1:0,stamp);assert.equal(runtime.calls,due?1:0,stamp);assert.equal(runtime.closed,due?1:0,stamp);if(!due)assert.deepEqual(result,{status:'skipped_schedule'});assert.equal(output.length,1);}
});

test('off-hour scheduled commands do not construct or inspect a runtime, validate private settings or perform network/log work',async()=>{
  let constructed=0,inspected=0;const runtime=new Proxy({}, {get(){inspected++;throw Error('Off-hour runtime accessed');}}),output=[];
  const result=await runGmailEnrichmentCli({waitImpl:noWait,argv:['scheduled'],env:{GMAIL_ENRICHMENT_MAX_DRAIN_CYCLES:'invalid'},runtime,now:()=>new Date('2026-12-01T13:00:00Z'),createRuntime:()=>{constructed++;throw Error('Off-hour factory accessed');},write:value=>output.push(value)});
  assert.deepEqual(result,{status:'skipped_schedule'});assert.deepEqual(output,[{status:'skipped_schedule'}]);assert.equal(constructed,0);assert.equal(inspected,0);
});

test('finite drain processes multiple five-item batches and closes cleanly when work is empty',async()=>{
  const runtime=fakeRuntime([batch(5),batch(2),batch(0)]),output=[],signals={term:process.listenerCount('SIGTERM'),int:process.listenerCount('SIGINT')};
  const result=await runGmailEnrichmentCli({waitImpl:noWait,argv:['drain'],runtime,write:value=>output.push(value)});
  assert.equal(runtime.calls,3);assert.equal(runtime.closed,1);assert.equal(result.stopReason,'empty');assert.equal(result.counts.imported,7);assert.equal(result.counts.requests,7);assert.equal(result.counts.costMicro,17500);assert.equal(output.length,1);
  assert.equal(process.listenerCount('SIGTERM'),signals.term);assert.equal(process.listenerCount('SIGINT'),signals.int);
  const empty=fakeRuntime([batch(0)]),done=await drainGmailEnrichment({waitImpl:noWait,worker:empty.worker});assert.equal(done.stopReason,'empty');assert.equal(empty.calls,1);assert.equal(done.counts.requests,0);
});

test('finite drain stops honestly on budgets, unknown costs, failures, cancellation and lack of progress',async()=>{
  const cases=[
    [{status:'budget_exceeded',counts:counts(),outcomes:[]},'budget_exceeded'],
    [batch(1,{unknownCost:true}),'unknown_cost'],
    [{status:'unavailable',counts:counts({claimed:1}),outcomes:[]},'unavailable'],
    [batch(1,{loggingFailures:1}),'log_unavailable'],
    [batch(1,{enriched:0,imported:0,requests:0,jobCompleted:0}),'no_progress'],
    [{status:'ready'},'invalid_response'],
  ];
  for(const [value,reason] of cases){const runtime=fakeRuntime([value,batch(5)]),result=await drainGmailEnrichment({waitImpl:noWait,worker:runtime.worker});assert.equal(runtime.calls,1,reason);assert.equal(result.stopReason,reason);}
  const controller=new AbortController();controller.abort();const aborted=fakeRuntime([batch(5)]),result=await drainGmailEnrichment({waitImpl:noWait,worker:aborted.worker,signal:controller.signal});assert.equal(aborted.calls,0);assert.equal(result.stopReason,'aborted');
  const capped=fakeRuntime([batch(1)]),limited=await drainGmailEnrichment({waitImpl:noWait,worker:capped.worker,maxCycles:3});assert.equal(capped.calls,3);assert.equal(limited.stopReason,'cycle_limit');
  const maximum=fakeRuntime([batch(1)]);assert.equal((await drainGmailEnrichment({waitImpl:noWait,worker:maximum.worker})).stopReason,'cycle_limit');assert.equal(maximum.calls,1000);
  const invalid=fakeRuntime([batch(1)]);assert.equal((await drainGmailEnrichment({waitImpl:noWait,worker:invalid.worker,maxCycles:1001})).stopReason,'invalid_request');assert.equal(invalid.calls,0);
  const broken=fakeRuntime([Error('PRIVATE failure detail')]),output=[];const failed=await runGmailEnrichmentCli({waitImpl:noWait,argv:['drain'],runtime:broken,write:value=>output.push(value)});assert.equal(broken.closed,1);assert(!JSON.stringify(failed).includes('PRIVATE'));assert(!JSON.stringify(output).includes('PRIVATE'));
  const listeners={term:process.listenerCount('SIGTERM'),int:process.listenerCount('SIGINT')},interrupted=fakeRuntime([]);interrupted.worker.once=async({signal})=>{process.emit('SIGTERM');assert.equal(signal.aborted,true);return {status:'aborted',counts:counts(),outcomes:[]};};
  const stopped=await runGmailEnrichmentCli({waitImpl:noWait,argv:['drain'],runtime:interrupted,write:()=>{}});assert.equal(stopped.stopReason,'aborted');assert.equal(interrupted.closed,1);assert.equal(process.listenerCount('SIGTERM'),listeners.term);assert.equal(process.listenerCount('SIGINT'),listeners.int);
});

async function sqlRuntime(t,{maxCycle='0.50',maxDaily='1.00'}={}){
  const db=new PGlite();t.after(()=>db.close());await db.exec('create role anon;create role authenticated;create role service_role bypassrls;');
  const migrationRoot=new URL('../supabase/migrations/',import.meta.url),files=await readdir(migrationRoot);for(const number of ['0047','0049','0050'])await db.exec(await readFile(new URL(files.find(name=>name.startsWith('20261026'+number+'_')),migrationRoot),'utf8'));
  await db.exec('set role service_role');for(let n=1;n<=7;n++)await db.query('insert into public.contacts_cache(id,raw_input) values($1,$2::jsonb)',[randomUUID(),JSON.stringify({email:`sender${n}@example.com`,name:`Sender ${n}`,native_extra:{keep:n}})]);
  const snapshot=()=>db.query('select id::text,created_at::text,raw_input::text from public.contacts_cache order by id').then(result=>result.rows),before=await snapshot();
  await db.exec("reset role;create function public.schedule_cache_readonly() returns trigger language plpgsql as $$begin raise exception 'Forbidden sender-cache mutation';end$$;create trigger schedule_cache_readonly before insert or update or delete on public.contacts_cache for each statement execute function public.schedule_cache_readonly();set role service_role;");
  const directory=await mkdtemp(join(tmpdir(),'flock-schedule-sql-'));t.after(()=>rm(directory,{recursive:true,force:true}));let providerCalls=0,rpcCalls=0,closed=0;
  const env={NODE_ENV:'production',GMAIL_ENRICHMENT_ENABLED:'true',GMAIL_ENRICHMENT_ACCOUNT:'synthetic-club@example.com',GMAIL_ENRICHMENT_SOURCE_IDS:'62000000-0000-4000-8000-000000000001',GMAIL_ENRICHMENT_MAX_REQUESTS:'5',GMAIL_ENRICHMENT_MAX_ITEMS:'5',GMAIL_ENRICHMENT_MAX_CYCLE_COST_USD:maxCycle,GMAIL_ENRICHMENT_MAX_DAILY_COST_USD:maxDaily,SUPABASE_URL:'https://schedule-sql.example.test',SUPABASE_SERVICE_ROLE_KEY:'synthetic-schedule-key',TREG_TOKEN:'synthetic-schedule-treg',TREG_CALL_LOG_DIR:join(directory,'calls')};
  const fetchImpl=async(input,init={})=>{const url=new URL(input);if(url.origin==='https://treg.to'){providerCalls++;assert.equal(init.method,'GET');assert.equal(url.pathname,'/call/tomba.people.enrich');assert.equal(init.body,undefined);assert.deepEqual([...url.searchParams.keys()],['email']);const data={email:url.searchParams.get('email'),full_name:'Native sender',first_name:'Native sender',provider_extra:{keep:true}};return new Response(JSON.stringify({data}),{status:200,headers:{'content-type':'application/json','x-treg-call-id':`synthetic-schedule-${providerCalls}`,'x-treg-cost-micro':'2500','x-treg-served-by':'tomba.people.enrich'}});}
    assert.equal(init.method,'POST');const body=JSON.parse(init.body);
    assert.equal(url.origin,'https://schedule-sql.example.test');const name=url.pathname.split('/').at(-1);assert(['gmail_enrichment_probe','gmail_enrichment_claim','gmail_enrichment_renew','gmail_enrichment_complete','gmail_enrichment_defer'].includes(name));assert.deepEqual(Object.keys(body),['p_payload']);rpcCalls++;const result=(await db.query(`select public.${name}($1::jsonb) result`,[JSON.stringify(body.p_payload)])).rows[0].result;return new Response(JSON.stringify(result),{status:200});};
  const runtime=createGmailEnrichmentRuntime({env,fetchImpl}),close=runtime.close;runtime.close=async()=>{closed++;await close();};t.after(()=>runtime.close());
  return {db,runtime,env,snapshot,before,get providerCalls(){return providerCalls;},get rpcCalls(){return rpcCalls;},get closed(){return closed;}};
}

test('scheduled production runtime drains seven SQL-backed senders across batches and an all-completed rerun makes no provider calls',async t=>{
  const h=await sqlRuntime(t),output=[];const first=await runGmailEnrichmentCli({waitImpl:noWait,argv:['scheduled'],env:h.env,runtime:h.runtime,now:()=>new Date('2026-07-01T13:00:00Z'),write:value=>output.push(value)});
  assert.equal(first.stopReason,'empty');assert.equal(first.cycles,3);assert.equal(first.counts.requests,7);assert.equal(first.counts.imported,7);assert.equal(first.counts.jobCompleted,7);assert.equal(h.providerCalls,7);assert.equal(h.closed,1);assert.deepEqual(await h.snapshot(),h.before);
  assert.equal((await h.db.query("select count(*)::int n from public.contacts_enrichment_jobs where status='completed'")).rows[0].n,7);assert.equal((await h.db.query('select count(*)::int n from public.contacts')).rows[0].n,7);
  const done=await runGmailEnrichmentCli({waitImpl:noWait,argv:['drain'],env:h.env,runtime:h.runtime,write:()=>{}});assert.equal(done.counts.requests,0);assert.equal(h.providerCalls,7);assert.deepEqual(await h.snapshot(),h.before);
  const rpc=h.rpcCalls;assert.deepEqual(await runGmailEnrichmentCli({waitImpl:noWait,argv:['scheduled'],env:h.env,runtime:h.runtime,now:()=>new Date('2026-07-01T14:00:00Z'),write:()=>{}}),{status:'skipped_schedule'});assert.equal(h.rpcCalls,rpc);assert.equal(h.providerCalls,7);assert(!JSON.stringify(output).includes('@example.com'));
  const bounded=await sqlRuntime(t,{maxCycle:'0.10',maxDaily:'0.10'}),limited=await runGmailEnrichmentCli({waitImpl:noWait,argv:['drain'],env:bounded.env,runtime:bounded.runtime,write:()=>{}});assert.equal(limited.stopReason,'budget_exceeded');assert.equal(limited.counts.imported,1);assert.equal(limited.counts.requests,1);assert.equal(bounded.providerCalls,1);assert.equal((await bounded.db.query("select count(*)::int n from public.contacts_enrichment_jobs where status='completed'")).rows[0].n,1);assert.deepEqual(await bounded.snapshot(),bounded.before);
});
