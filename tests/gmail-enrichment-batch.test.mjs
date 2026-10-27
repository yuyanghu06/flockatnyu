import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {PGlite} from '@electric-sql/pglite';
import {readGmailEnrichmentConfig} from '../server/gmail-enrichment/config.js';
import {createGmailEnrichmentRuntime,runGmailEnrichmentCli} from '../server/gmail-enrichment/cli.js';
import {createGmailEnrichmentWorker} from '../server/gmail-enrichment/worker.js';
import {createGmailEnrichmentCacheStore} from '../server/gmail-enrichment/store.js';
import {createDailyTregEnrichmentClient} from '../server/gmail-enrichment/treg.js';
import {createTregCallLogger} from '../server/treg/call-log.js';
import {drainGmailEnrichment} from '../server/gmail-enrichment/schedule.js';

const originalFetch=globalThis.fetch;
before(()=>{globalThis.fetch=()=>{throw Error('External network forbidden in independent batch tests');};});
after(()=>{globalThis.fetch=originalFetch;});
const baseEnv={GMAIL_ENRICHMENT_ENABLED:'true',GMAIL_ENRICHMENT_ACCOUNT:'synthetic-club@example.com',GMAIL_ENRICHMENT_SOURCE_IDS:'62000000-0000-4000-8000-000000000001',SUPABASE_URL:'https://batch-sql.example.test',SUPABASE_SERVICE_ROLE_KEY:'synthetic-batch-service-key',TREG_TOKEN:'synthetic-batch-provider-key'};
const counts=values=>({claimed:0,enriched:0,imported:0,existing:0,missed:0,deferred:0,requests:0,costMicro:0,unknownCost:false,jobCompleted:0,loggingFailures:0,...values});
const batch=(n,values={})=>({status:'ready',counts:counts({claimed:n,enriched:n,imported:n,requests:n,jobCompleted:n,...values}),outcomes:[]});
const noWait=async()=>{};

async function sqlRuntime(t,{size=101,env:extra={}}={}){
 const db=new PGlite();t.after(()=>db.close());await db.exec('create role anon;create role authenticated;create role service_role bypassrls;');
 const migrationRoot=new URL('../supabase/migrations/',import.meta.url),files=await readdir(migrationRoot);
 for(const suffix of ['0047','0049','0050'])await db.exec(await readFile(new URL(files.find(name=>name.startsWith('20261026'+suffix+'_')),migrationRoot),'utf8'));
 await db.exec(await readFile(new URL('202610270051_contacts_native_fields.sql',migrationRoot),'utf8'));await db.exec('set role service_role');
 const emails=Array.from({length:size},(_,i)=>`batch-${String(i+1).padStart(3,'0')}@example.test`);
 for(const email of emails)await db.query('insert into public.contacts_cache(id,raw_input) values($1,$2::jsonb)',[randomUUID(),JSON.stringify({email,name:'Original sender',intake_extra:{keep:[true,null,email.length]}})]);
 const snapshot=async()=>(await db.query('select id::text,created_at::text,raw_input::text from public.contacts_cache order by id')).rows,before=await snapshot();
 await db.exec("reset role;create function public.batch_cache_readonly() returns trigger language plpgsql as $$begin raise exception 'Batch worker attempted cache mutation';end$$;create trigger batch_cache_readonly before insert or update or delete on public.contacts_cache for each statement execute function public.batch_cache_readonly();set role service_role;");
 const directory=await mkdtemp(join(tmpdir(),'flock-independent-batch-'));t.after(()=>rm(directory,{recursive:true,force:true}));const env={...baseEnv,TREG_CALL_LOG_DIR:join(directory,'calls'),...extra};
 let providerCalls=0,active=0,maxActive=0,closed=0;const observedEmails=[],rawByEmail=new Map();
 const fetchImpl=async(input,init={})=>{
  const url=new URL(input);
  if(url.origin==='https://treg.to'){
   assert.equal(init.method,'GET');assert.equal(url.pathname,'/call/tomba.people.enrich');assert.equal(init.body,undefined);assert.deepEqual([...url.searchParams.keys()],['email']);const email=url.searchParams.get('email');assert(emails.includes(email));assert(!observedEmails.includes(email),'No duplicate provider request');observedEmails.push(email);providerCalls++;active++;maxActive=Math.max(maxActive,active);assert(active<=1,'Emails must stay sequential within and across batches');await delay(1);active--;
   const data={full_name:'Batch Sender',first_name:'Batch',last_name:'Sender',email,native_extra:{keep:[null,true,providerCalls]},phone_number:false};rawByEmail.set(email,structuredClone(data));
   return Response.json({data},{headers:{'x-treg-cost-micro':'0','x-treg-call-id':'synthetic-batch-'+providerCalls,'x-treg-served-by':'tomba.people.enrich'}});
  }
  assert.equal(url.origin,'https://batch-sql.example.test');assert.equal(init.method,'POST');const operation=url.pathname.split('/').at(-1);assert(['gmail_enrichment_probe','gmail_enrichment_claim','gmail_enrichment_renew','gmail_enrichment_complete','gmail_enrichment_defer'].includes(operation));const body=JSON.parse(init.body);assert.deepEqual(Object.keys(body),['p_payload']);const value=(await db.query(`select public.${operation}($1::jsonb) result`,[JSON.stringify(body.p_payload)])).rows[0].result;return Response.json(value);
 };
 const runtime=createGmailEnrichmentRuntime({env,fetchImpl}),close=runtime.close;runtime.close=async()=>{closed++;await close();};t.after(()=>close());
 return {db,env,runtime,fetchImpl,snapshot,before,emails,rawByEmail,get providerCalls(){return providerCalls;},get maxActive(){return maxActive;},get closed(){return closed;}};
}

test('batch settings default to 50, reject out-of-range values and retain existing money/lease/provider settings',()=>{
 const config=readGmailEnrichmentConfig(baseEnv);assert.equal(config.configured,true);assert.equal(config.batchSize,50);assert.equal(config.maxItems,50);assert.equal(config.maxRequests,50);assert.equal(config.pollMs,5000);assert.equal(config.leaseSeconds,120);assert.equal(config.perCallMaxCostMicro,100000);assert.equal(config.maxCycleCostMicro,500000);assert.equal(config.maxDailyCostMicro,1000000);
 for(const value of ['1','25','50']){const selected=readGmailEnrichmentConfig({...baseEnv,GMAIL_ENRICHMENT_BATCH_SIZE:value});assert.equal(selected.configured,true);assert.equal(selected.batchSize,Number(value));}
 for(const value of ['0','51','100','-1','1.5','invalid'])assert.equal(readGmailEnrichmentConfig({...baseEnv,GMAIL_ENRICHMENT_BATCH_SIZE:value}).configured,false);
 const legacy=readGmailEnrichmentConfig({...baseEnv,GMAIL_ENRICHMENT_MAX_ITEMS:'100',GMAIL_ENRICHMENT_MAX_REQUESTS:'100'});assert.equal(legacy.configured,true);assert.equal(legacy.batchSize,50);
 const lower=readGmailEnrichmentConfig({...baseEnv,GMAIL_ENRICHMENT_BATCH_SIZE:'20',GMAIL_ENRICHMENT_MAX_ITEMS:'7',GMAIL_ENRICHMENT_MAX_REQUESTS:'3'});assert.equal(lower.configured,true);assert.equal(lower.batchSize,20);assert.equal(lower.maxItems,7);assert.equal(lower.maxRequests,3);
});

test('actual CLI drains 101 local saved inputs as 50+50+1 sequential batches with recorded five-second pauses and unchanged raw cache',async t=>{
 const h=await sqlRuntime(t),batchSizes=[],waits=[];const once=h.runtime.worker.once;
 h.runtime.worker={...h.runtime.worker,once:async args=>{const result=await once(args);batchSizes.push(result.counts.claimed);return result;}};
 const result=await runGmailEnrichmentCli({argv:['drain'],env:h.env,runtime:h.runtime,write:()=>{},waitImpl:async(ms,{signal})=>{assert.equal(signal.aborted,false);waits.push({ms,completed:h.providerCalls});}});
 assert.equal(result.status,'ready');assert.equal(result.stopReason,'empty');assert.deepEqual(batchSizes,[50,50,1,0]);assert.equal(result.cycles,4);assert.equal(result.counts.claimed,101);assert.equal(result.counts.imported,101);assert.equal(result.counts.jobCompleted,101);assert.equal(result.counts.requests,101);assert.equal(result.counts.costMicro,0);assert.equal(h.providerCalls,101);assert.equal(h.maxActive,1);assert.equal(h.closed,1);
 assert.deepEqual(waits,[{ms:5000,completed:50},{ms:5000,completed:100},{ms:5000,completed:101}]);assert.deepEqual(await h.snapshot(),h.before);
 const saved=(await h.db.query('select raw_input,lookup_email from public.contacts')).rows;assert.equal(saved.length,101);assert.equal(new Set(saved.map(row=>row.lookup_email)).size,101);for(const row of saved)assert.deepEqual(row.raw_input,h.rawByEmail.get(row.lookup_email));
 assert.equal((await h.db.query("select count(*)::int n from public.contacts_enrichment_jobs where status='completed'")).rows[0].n,101);assert.equal(Number((await h.db.query('select day_spent_micro from public.contacts_enrichment_state')).rows[0].day_spent_micro),0);
 const beforeRerun=h.providerCalls;let rerunWaits=0;const again=await runGmailEnrichmentCli({argv:['drain'],env:h.env,runtime:h.runtime,write:()=>{},waitImpl:async()=>{rerunWaits++;}});assert.equal(again.counts.requests,0);assert.equal(h.providerCalls,beforeRerun);assert.equal(rerunWaits,0);assert.deepEqual(await h.snapshot(),h.before);
});

test('large legacy and directly injected limits cannot raise the hard 50-email once cap',async t=>{
 const h=await sqlRuntime(t,{env:{GMAIL_ENRICHMENT_MAX_ITEMS:'100',GMAIL_ENRICHMENT_MAX_REQUESTS:'100'}});let waits=0;
 const first=await runGmailEnrichmentCli({argv:['once'],env:h.env,runtime:h.runtime,write:()=>{},waitImpl:async()=>{waits++;}});assert.equal(first.counts.claimed,50);assert.equal(first.counts.requests,50);assert.equal(h.providerCalls,50);assert.equal(waits,0);
 const logger=createTregCallLogger({env:h.env});t.after(()=>logger.close());const worker=createGmailEnrichmentWorker({config:{...h.runtime.config,batchSize:500,maxItems:500,maxRequests:500},cacheStore:createGmailEnrichmentCacheStore({env:h.env,fetchImpl:h.fetchImpl}),enrichmentClient:createDailyTregEnrichmentClient({env:h.env,fetchImpl:h.fetchImpl,callLogger:logger})});
 const second=await worker.once();assert.equal(second.counts.claimed,50);assert.equal(second.counts.requests,50);assert.equal(h.providerCalls,100);assert.deepEqual(await h.snapshot(),h.before);
 const last=await worker.once();assert.equal(last.counts.claimed,1);assert.equal(last.counts.requests,1);assert.equal(h.providerCalls,101);assert.deepEqual(await h.snapshot(),h.before);
});

test('pause is only between successful nonempty cycles and never follows terminal outcomes or the cycle limit',async()=>{
 const terminal=[
  [batch(0),'empty'],[{status:'budget_exceeded',counts:counts()},'budget_exceeded'],[{status:'unavailable',counts:counts()},'unavailable'],
  [batch(1,{unknownCost:true}),'unknown_cost'],[batch(1,{loggingFailures:1}),'log_unavailable'],[batch(1,{jobCompleted:0,imported:0,enriched:0,requests:0}),'no_progress'],
 ];
 for(const [outcome,reason]of terminal){let calls=0,waits=0;const result=await drainGmailEnrichment({worker:{once:async()=>{calls++;return outcome;}},pauseMs:5000,waitImpl:async()=>{waits++;}});assert.equal(result.stopReason,reason);assert.equal(calls,1);assert.equal(waits,0);}
 let calls=0,waits=0;const capped=await drainGmailEnrichment({worker:{once:async()=>{calls++;return batch(50);}},maxCycles:2,pauseMs:5000,waitImpl:async ms=>{assert.equal(ms,5000);waits++;}});assert.equal(capped.stopReason,'cycle_limit');assert.equal(calls,2);assert.equal(waits,1);
 for(const pauseMs of [0,999,300001,'5000']){let inspected=0;const invalid=await drainGmailEnrichment({worker:{once:async()=>{inspected++;return batch(0);}},pauseMs,waitImpl:noWait});assert.equal(invalid.stopReason,'invalid_request');assert.equal(inspected,0);}
 const controller=new AbortController();controller.abort();let afterAbort=0;const stopped=await drainGmailEnrichment({worker:{once:async()=>{afterAbort++;return batch(50);}},signal:controller.signal,waitImpl:async()=>{afterAbort++;}});assert.equal(stopped.stopReason,'aborted');assert.equal(afterAbort,0);
 let failedCalls=0;const failed=await drainGmailEnrichment({worker:{once:async()=>{failedCalls++;return batch(50);}},waitImpl:async()=>{throw Error('PRIVATE wait failed');}});assert.equal(failed.status,'unavailable');assert.equal(failed.stopReason,'unavailable');assert.equal(failedCalls,1);assert(!JSON.stringify(failed).includes('PRIVATE'));
});

test('aborting a real pause prevents the next batch; actual CLI SIGTERM pause closes resources and leaves remaining inputs untouched',async t=>{
 let calls=0;const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10);let watchdog;
 try{const result=await Promise.race([drainGmailEnrichment({worker:{once:async()=>{calls++;return batch(50);}},signal:controller.signal,pauseMs:300000}),new Promise((_,reject)=>{watchdog=setTimeout(()=>reject(Error('Pause did not abort')),1000);})]);assert.equal(result.stopReason,'aborted');assert.equal(calls,1);}finally{clearTimeout(timer);clearTimeout(watchdog);}
 const h=await sqlRuntime(t),listeners={term:process.listenerCount('SIGTERM'),int:process.listenerCount('SIGINT')};let waits=0;
 const result=await runGmailEnrichmentCli({argv:['drain'],env:h.env,runtime:h.runtime,write:()=>{},waitImpl:async(ms,{signal})=>{waits++;assert.equal(ms,5000);assert.equal(h.providerCalls,50);const stop=setTimeout(()=>process.emit('SIGTERM'),10);try{await delay(ms,undefined,{signal});}finally{clearTimeout(stop);}}});
 assert.equal(result.stopReason,'aborted');assert.equal(result.counts.imported,50);assert.equal(h.providerCalls,50);assert.equal(waits,1);assert.equal(h.closed,1);assert.deepEqual(await h.snapshot(),h.before);assert.equal((await h.db.query('select count(*)::int n from public.contacts')).rows[0].n,50);assert.equal(process.listenerCount('SIGTERM'),listeners.term);assert.equal(process.listenerCount('SIGINT'),listeners.int);
});
