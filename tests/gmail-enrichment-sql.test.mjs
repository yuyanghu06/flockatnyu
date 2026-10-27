import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir,mkdtemp,rm} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {PGlite} from '@electric-sql/pglite';
import {createGmailEnrichmentRuntime,runGmailEnrichmentCli} from '../server/gmail-enrichment/cli.js';
import {createGmailEnrichmentCacheStore} from '../server/gmail-enrichment/store.js';
import {enrichedEnvelope,enrichmentUsage,nativeLead,gmailSourceId,gmailAccount} from './fixtures/gmail-enrichment.mjs';

const migrationRoot=new URL('../supabase/migrations/',import.meta.url);
const names={probe:'gmail_enrichment_probe',claim:'gmail_enrichment_claim',renew:'gmail_enrichment_renew',complete:'gmail_enrichment_complete',defer:'gmail_enrichment_defer'};
const scope={sourceIds:[gmailSourceId],account:gmailAccount,scope:'sender',maxCycleCostMicro:500000,maxDailyCostMicro:1000000};
async function database(t) {
  const db=new PGlite();t.after(()=>db.close());
  await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create role enrichment_public_probe;');
  const files=await readdir(migrationRoot);
  for(const number of ['047','049','050']) {
    const file=files.find(name=>name.startsWith('20261026'+number.padStart(4,'0')+'_'));
    assert(file,`Missing actual migration ${number}`);await db.exec(await readFile(new URL(file,migrationRoot),'utf8'));
  }
  await db.exec('set role service_role');
  const rpc=async(operation,payload={})=>{
    assert(Object.hasOwn(names,operation));
    return (await db.query(`select public.${names[operation]}($1::jsonb) as result`,[JSON.stringify(payload)])).rows[0].result;
  };
  const owner=async(sql,params=[])=>{await db.exec('reset role');try{return await db.query(sql,params);}finally{await db.exec('set role service_role');}};
  const seed=async(raw={email:'rae@example.com',name:'Rae Sender',intake_extra:{preserve:true}})=>{
    const id=randomUUID();await db.query('insert into public.contacts_cache(id,raw_input) values($1,$2::jsonb)',[id,JSON.stringify(raw)]);return id;
  };
  const claim=extra=>rpc('claim',{...scope,leaseSeconds:120,reserveMicro:100000,cycleId:randomUUID(),...extra});
  const cache=id=>db.query('select id,created_at,raw_input from public.contacts_cache where id=$1',[id]).then(result=>result.rows[0]);
  const expire=async id=>{
    await owner("update public.contacts_enrichment_state set lease_expires_at=clock_timestamp()-interval '1 second' where lease_job_id is not null");
    await db.query("update public.contacts_enrichment_jobs set available_at=clock_timestamp()-interval '1 second' where cache_id=$1",[id]);
  };
  const snapshot=()=>db.query('select id::text,created_at::text,raw_input::text from public.contacts_cache order by id').then(result=>result.rows);
  const jobs=()=>db.query('select to_jsonb(j) as data from public.contacts_enrichment_jobs j order by id').then(result=>result.rows.map(row=>row.data));
  const ownerExec=async sql=>{await db.exec('reset role');try{return await db.exec(sql);}finally{await db.exec('set role service_role');}};
  return {db,rpc,owner,ownerExec,seed,claim,cache,expire,snapshot,jobs};
}
async function realRuntime(t,h,{response=enrichedEnvelope,failAfterRpc,env:overrides={}}={}) {
  const directory=await mkdtemp(join(tmpdir(),'flock-gmail-sql-'));t.after(()=>rm(directory,{recursive:true,force:true}));
  const requests=[],rpcCalls=[],errors=[],mode={};
  const env={NODE_ENV:'production',GMAIL_ENRICHMENT_ENABLED:'true',GMAIL_ENRICHMENT_ACCOUNT:gmailAccount,GMAIL_ENRICHMENT_SOURCE_IDS:gmailSourceId,
    GMAIL_ENRICHMENT_MAX_REQUESTS:'5',GMAIL_ENRICHMENT_MAX_ITEMS:'5',GMAIL_ENRICHMENT_MAX_CYCLE_COST_USD:'0.50',GMAIL_ENRICHMENT_MAX_DAILY_COST_USD:'1.00',
    SUPABASE_URL:'https://gmail-sql.example.test',SUPABASE_SERVICE_ROLE_KEY:'synthetic-local-sql-key',TREG_TOKEN:'synthetic-local-treg-key',TREG_CALL_LOG_DIR:join(directory,'calls'),...overrides};
  // Preserve every synthetic native field inside Tomba's actual data object.
  // Its transport envelope is logged, while the complete person is stored.
  const nativeResponse={...response.raw,full_name:response.output.full_name};
  const fetchImpl=async(input,init={})=>{
    const url=new URL(input);
    if(url.origin==='https://treg.to') {
      assert(['/call/tomba.people.enrich','/call/apollo.people.enrich'].includes(url.pathname));
      const tomba=url.pathname==='/call/tomba.people.enrich';
      assert.equal(init.method,tomba?'GET':'POST');assert.equal(init.body,undefined);assert.deepEqual([...url.searchParams.keys()],['email']);
      const body={email:url.searchParams.get('email')};
      requests.push({body,headers:new Headers(init.headers)});
      if(mode.beforeTregResponse)await mode.beforeTregResponse();
      return new Response(JSON.stringify(tomba?{data:nativeResponse}:{person:null}),{status:200,headers:{'content-type':'application/json','x-treg-call-id':'synthetic-enrich-call','x-treg-cost-micro':mode.costMicro??'2500','x-treg-served-by':tomba?'tomba.people.enrich':'apollo.people.enrich'}});
    }
    assert.equal(init.method,'POST');const body=JSON.parse(init.body);
    assert.equal(url.origin,'https://gmail-sql.example.test');assert.match(url.pathname,/^\/rest\/v1\/rpc\/gmail_enrichment_[a-z_]+$/);assert.deepEqual(Object.keys(body),['p_payload']);
    assert.equal(new Headers(init.headers).get('authorization'),'Bearer synthetic-local-sql-key');
    const operation=Object.keys(names).find(name=>url.pathname.endsWith('/'+names[name]));assert(operation);rpcCalls.push({operation,payload:structuredClone(body.p_payload)});
    try {
      if(mode.beforeRpc)await mode.beforeRpc(operation);
      if(mode.failBeforeComplete&&operation==='complete'&&!mode.failureUsed){mode.failureUsed=true;throw Error('Synthetic lost local SQL response');}
      const result=await h.rpc(operation,body.p_payload);
      if(mode.afterRpc)await mode.afterRpc(operation,result);
      if(failAfterRpc===operation&&!mode.failureUsed){mode.failureUsed=true;throw Error('Synthetic lost local SQL response');}
      return new Response(JSON.stringify(result),{status:200,headers:{'content-type':'application/json'}});
    } catch(error) {
      if(error.message==='Synthetic lost local SQL response')throw error;
      errors.push({operation,code:error.code,message:error.message});if(mode.onRpcError)await mode.onRpcError(operation,error);throw error;
    }
  };
  const runtime=createGmailEnrichmentRuntime({env,fetchImpl});t.after(()=>runtime.close());
  return {runtime,requests,rpcCalls,errors,mode,env,fetchImpl,nativeResponse};
}

const completeHit=(h,claim,extra={})=>h.rpc('complete',{claim,outcome:'hit',rawInput:nativeLead,usage:enrichmentUsage,...extra});
const trackingHasNoPayload=async h=>{
  const columns=(await h.db.query("select column_name,data_type from information_schema.columns where table_schema='public' and table_name='contacts_enrichment_jobs'")).rows;
  assert(!columns.some(column=>['json','jsonb'].includes(column.data_type)),'Jobs use typed metadata columns rather than payload containers');
  assert(!columns.some(column=>/^(email|name|raw_input|response|enrichment)$/.test(column.column_name)));
  const values=JSON.stringify(await h.jobs());assert(!/exact native record|provider_extra|full_name|provider_payload/.test(values));
  const state=(await h.db.query('select day_requests,cycles from public.contacts_enrichment_state')).rows;
  assert(!/full_name|provider_extra|exact native record/.test(JSON.stringify(state)));
};

test('raw-only SQL keeps all sender data unchanged through successful native contact completion and large responses',async t=>{
  const h=await database(t);await h.seed();const before=await h.snapshot();
  await h.ownerExec("create function public.synthetic_cache_readonly() returns trigger language plpgsql as $$begin raise exception 'Sender cache mutations are forbidden';end$$;create trigger synthetic_cache_readonly before insert or update or delete on public.contacts_cache for each statement execute function public.synthetic_cache_readonly();");
  const raw={...nativeLead,provider_payload:'n'.repeat(200000)},response={...enrichedEnvelope,raw};
  const f=await realRuntime(t,h,{response});assert(Buffer.byteLength(JSON.stringify(f.nativeResponse))>200000);assert(Buffer.byteLength(JSON.stringify(f.nativeResponse))<254976);
  const result=await f.runtime.worker.once();assert.deepEqual(f.errors,[]);assert.equal(result.counts.imported,1);assert.equal(result.counts.jobCompleted,1);assert.equal(f.requests.length,1);
  assert.deepEqual(await h.snapshot(),before);assert.deepEqual((await h.db.query('select raw_input from public.contacts')).rows,[{raw_input:f.nativeResponse}]);await trackingHasNoPayload(h);
  const complete=f.rpcCalls.find(call=>call.operation==='complete').payload;assert.deepEqual(complete.rawInput,f.nativeResponse);assert(!Object.hasOwn(complete,'enrichment'));assert(!JSON.stringify(result).includes('rae@example.com'));
});

test('raw-only SQL grants private access, checks full source snapshots and rejects stale lease owners',async t=>{
  const h=await database(t),id=await h.seed({email:'rae@example.com',name:'Original',_treg_enrichment:{native:'original data'}}),before=await h.snapshot();
  const probe=await h.rpc('probe',scope);assert.equal(probe.contract,'gmail-enrichment-v2');assert.equal(probe.capabilities.readOnlyCache,true);assert.equal(probe.capabilities.metadataOnlyJobs,true);
  const permissions=(await h.owner("select proname,has_function_privilege('anon',oid,'execute') as anon,has_function_privilege('authenticated',oid,'execute') as authenticated,has_function_privilege('enrichment_public_probe',oid,'execute') as public_probe,has_function_privilege('service_role',oid,'execute') as service from pg_proc where pronamespace='public'::regnamespace and (proname like 'gmail_enrichment_%' or proname like '_gmail_enrichment_%')")).rows;
  assert(permissions.length>=8);assert(permissions.every(row=>!row.anon&&!row.authenticated&&!row.public_probe&&row.service));
  const tables=(await h.owner("select relname,relrowsecurity,relforcerowsecurity from pg_class where relnamespace='public'::regnamespace and relkind='r'")).rows;assert(tables.every(row=>row.relrowsecurity&&row.relforcerowsecurity));
  for(const role of ['anon','authenticated','enrichment_public_probe']){
    await h.db.exec(`begin;set local role ${role}`);try{await assert.rejects(()=>h.db.query('select public.gmail_enrichment_probe($1::jsonb)',[JSON.stringify(scope)]),error=>error.code==='42501');}finally{await h.db.exec('rollback');}
  }
  const claims=await Promise.all([h.claim(),h.claim()]);assert.equal(claims.filter(value=>value.status==='ready').length,1);const claim=claims.find(value=>value.status==='ready').claim;assert(claim.jobId);assert.match(claim.sourceVersion,/^[0-9a-f]{64}$/);assert.deepEqual(await h.snapshot(),before);
  assert.equal((await h.rpc('defer',{claim})).status,'invalid_request');assert.deepEqual(await h.snapshot(),before);
  await h.expire(id);const next=await h.claim();assert.equal(next.status,'ready');assert.notEqual(next.claim.leaseToken,claim.leaseToken);assert.equal(next.claim.requestId,claim.requestId);
  assert.equal((await completeHit(h,claim)).status,'stale');assert.equal((await h.rpc('renew',{claim,leaseSeconds:120})).status,'stale');assert.deepEqual(await h.snapshot(),before);
  const input=await h.cache(id);await h.db.query('update public.contacts_cache set raw_input=$2::jsonb where id=$1',[id,JSON.stringify({...input.raw_input,_treg_enrichment:{native:'external edit'}})]);
  const changed=await h.snapshot();assert.equal((await completeHit(h,next.claim)).status,'stale');assert.deepEqual(await h.snapshot(),changed);assert.equal((await h.db.query('select count(*)::int n from public.contacts')).rows[0].n,0);
  const transport=await realRuntime(t,h),adapter=createGmailEnrichmentCacheStore({env:transport.env,fetchImpl:transport.fetchImpl});const stale=await adapter.renew({claim:next.claim,leaseSeconds:120});assert.equal(stale.status,'stale');assert.notEqual(stale.reason,'write_outcome_unknown');await trackingHasNoPayload(h);
});

test('raw-only SQL commits contact and small job receipt atomically and replays safely after a lost completion response',async t=>{
  const h=await database(t);await h.seed();const before=await h.snapshot(),f=await realRuntime(t,h,{failAfterRpc:'complete'});
  const lost=await f.runtime.worker.once();assert.equal(lost.counts.imported,0);assert.equal(lost.outcomes[0].reason,'write_outcome_unknown');assert.equal((await h.db.query('select count(*)::int n from public.contacts')).rows[0].n,1);
  const next=await f.runtime.worker.once();assert.equal(next.counts.requests,0);assert.equal(f.requests.length,1);assert.deepEqual(await h.snapshot(),before);
  const human={...nativeLead,notes:'Human edit after lost response',legacy:{keep:true}};await h.db.query('update public.contacts set raw_input=$1::jsonb',[JSON.stringify(human)]);
  const payload=f.rpcCalls.find(call=>call.operation==='complete').payload,replayed=await h.rpc('complete',payload);assert.equal(replayed.status,'ready');assert.equal(replayed.receipt.operation,'existing');assert(!Object.hasOwn(replayed,'contact'));assert(!JSON.stringify(replayed).includes('Human edit'));
  assert.deepEqual((await h.db.query('select raw_input from public.contacts')).rows,[{raw_input:human}]);assert.deepEqual(await h.snapshot(),before);await trackingHasNoPayload(h);
  const input=await h.cache(payload.claim.id);await h.db.query('update public.contacts_cache set raw_input=$2::jsonb where id=$1',[input.id,JSON.stringify({...input.raw_input,name:'External source correction'})]);const changed=await h.snapshot();assert.equal((await h.rpc('complete',payload)).status,'stale');assert.deepEqual(await h.snapshot(),changed);assert.deepEqual((await h.db.query('select raw_input from public.contacts')).rows,[{raw_input:human}]);
});

test('raw-only SQL retries before completion with a stable provider key and retains unknown reservations',async t=>{
  const h=await database(t),id=await h.seed(),before=await h.snapshot(),f=await realRuntime(t,h);f.mode.failBeforeComplete=true;
  const first=await f.runtime.worker.once();assert.equal(first.counts.imported,0);assert.equal((await h.db.query('select count(*)::int n from public.contacts')).rows[0].n,0);assert.deepEqual(await h.snapshot(),before);
  const request=(await h.jobs())[0].request_id;assert.equal((await h.claim()).status,'empty','Backoff prevents an immediate paid retry');
  await h.expire(id);f.mode.costMicro='0';const resumed=await f.runtime.worker.once();assert.equal(resumed.counts.imported,1);assert.equal(f.requests.length,2);assert.equal(f.requests[0].headers.get('idempotency-key'),f.requests[1].headers.get('idempotency-key'));
  assert.equal((await h.jobs())[0].request_id,request);assert.equal(Number((await h.db.query('select day_spent_micro from public.contacts_enrichment_state')).rows[0].day_spent_micro),100000,'Replay zero cannot erase an unknown first-call reservation');assert.deepEqual(await h.snapshot(),before);await trackingHasNoPayload(h);
});

test('raw-only SQL rolls back contact insertion, receipt and budget settlement together on database failure',async t=>{
  const h=await database(t);await h.seed();const before=await h.snapshot(),f=await realRuntime(t,h);
  await h.ownerExec("create function public.synthetic_contact_reject() returns trigger language plpgsql as $$begin raise exception 'Synthetic contact failure';end$$;create trigger synthetic_contact_reject before insert on public.contacts for each row execute function public.synthetic_contact_reject();");
  let prior,after;
  const state=async()=>({jobs:await h.jobs(),budget:(await h.db.query('select to_jsonb(s) as data from public.contacts_enrichment_state s')).rows});
  f.mode.beforeRpc=async operation=>{if(operation==='complete')prior=await state();};f.mode.onRpcError=async operation=>{if(operation==='complete')after=await state();};
  const result=await f.runtime.worker.once();assert.equal(result.counts.imported,0);assert.equal((await h.db.query('select count(*)::int n from public.contacts')).rows[0].n,0);assert.deepEqual(after,prior,'One failed SQL completion rolls back all of its writes');assert.deepEqual(await h.snapshot(),before);assert.equal((await h.jobs())[0].status,'retry');await trackingHasNoPayload(h);
});

test('raw-only SQL preserves sender inputs on misses, unsupported results, unknown costs and existing human matches',async t=>{
  for(const response of [{output:{full_name:null},raw:{miss:true},_treg:{served_by:'synthetic.people.enrich'}}]){
    const h=await database(t);await h.seed();const before=await h.snapshot(),f=await realRuntime(t,h,{response});const result=await f.runtime.worker.once();assert.equal(result.counts.jobCompleted,1);assert.equal((await h.db.query('select count(*)::int n from public.contacts')).rows[0].n,0);assert.deepEqual(await h.snapshot(),before);await trackingHasNoPayload(h);
  }
  // A direct Apollo array is invalid at the client boundary (covered in provider
  // tests). Keep the SQL unsupported-result completion invariant independently;
  // the existing injected worker tests still cover its unsupported-array path.
  const unsupported=await database(t);await unsupported.seed();const original=await unsupported.snapshot(),unsupportedClaim=(await unsupported.claim()).claim;
  const skipped=await unsupported.rpc('complete',{claim:unsupportedClaim,outcome:'unsupported_raw',reason:'unsupported_raw',usage:enrichmentUsage});
  assert.equal(skipped.status,'ready');assert.equal((await unsupported.jobs())[0].status,'completed');assert.equal((await unsupported.db.query('select count(*)::int n from public.contacts')).rows[0].n,0);assert.deepEqual(await unsupported.snapshot(),original);await trackingHasNoPayload(unsupported);
  const h=await database(t);await h.seed();const before=await h.snapshot(),id=randomUUID(),human={email:'RAE@example.com',notes:'Preserve human data',legacy:{keep:true}};await h.db.query('insert into public.contacts(id,raw_input) values($1,$2::jsonb)',[id,JSON.stringify(human)]);
  const f=await realRuntime(t,h),result=await f.runtime.worker.once();assert.equal(result.counts.existing,1);assert.deepEqual((await h.db.query('select raw_input from public.contacts')).rows,[{raw_input:human}]);assert.deepEqual(await h.snapshot(),before);await trackingHasNoPayload(h);
  const unknown=await database(t);await unknown.seed();const source=await unknown.snapshot(),claim=(await unknown.claim()).claim;const completed=await completeHit(unknown,claim,{usage:{...enrichmentUsage,costMicro:null}});assert.equal(completed.status,'ready');assert.equal(Number((await unknown.db.query('select day_spent_micro from public.contacts_enrichment_state')).rows[0].day_spent_micro),100000);assert.deepEqual(await unknown.snapshot(),source);
});

test('raw-only SQL enforces shared UTC-day budgets, retry backoff and quarantine without changing or deleting inputs',async t=>{
  const h=await database(t),id=await h.seed(),before=await h.snapshot(),budget={maxCycleCostMicro:100000,maxDailyCostMicro:100000};
  let claim=(await h.claim(budget)).claim;
  for(let attempt=0;attempt<5;attempt++){
    assert.equal((await h.rpc('defer',{claim,reason:'unavailable',uncertain:true})).status,'ready');assert.deepEqual(await h.snapshot(),before);
    if(attempt<4){await h.expire(id);const next=await h.claim(budget);assert.equal(next.status,'ready');assert.equal(next.claim.requestId,claim.requestId);claim=next.claim;}
  }
  assert.equal((await h.jobs())[0].status,'quarantined');await h.expire(id);assert.equal((await h.claim(budget)).status,'empty');assert.deepEqual(await h.snapshot(),before);
  const second=await h.seed({email:'other@example.com',name:'Other raw sender'}),both=await h.snapshot();assert.equal((await h.claim(budget)).status,'budget_exceeded');assert.deepEqual(await h.snapshot(),both);
  await h.owner("update public.contacts_enrichment_state set budget_day=((clock_timestamp() at time zone 'UTC')::date-1)");const newDay=await h.claim(budget);assert.equal(newDay.status,'ready');assert.equal(newDay.claim.id,second);assert.equal((await h.db.query("select budget_day=(clock_timestamp() at time zone 'UTC')::date as current_day from public.contacts_enrichment_state")).rows[0].current_day,true);assert.deepEqual(await h.snapshot(),both);await trackingHasNoPayload(h);
});

test('raw-only production CLI is content-free and disabled or missing-schema services do not call Treg',async t=>{
  const h=await database(t),f=await realRuntime(t,h),output=[];assert.equal((await runGmailEnrichmentCli({argv:['status'],runtime:f.runtime,write:value=>output.push(value)})).status,'ready');assert.deepEqual(output,[{status:'ready'}]);assert.equal(f.requests.length,0);
  const disabled=createGmailEnrichmentRuntime({env:{GMAIL_ENRICHMENT_ENABLED:'false'},fetchImpl:()=>{throw Error('Disabled service attempted network access');}});assert.equal((await runGmailEnrichmentCli({argv:['once'],runtime:disabled,write:value=>output.push(value)})).status,'disabled');
  const unavailable=createGmailEnrichmentRuntime({env:f.env,fetchImpl:async()=>new Response('{}',{status:404})});assert.equal((await runGmailEnrichmentCli({argv:['status'],runtime:unavailable,write:value=>output.push(value)})).status,'schema_not_ready');assert(!JSON.stringify(output).includes(gmailAccount));assert(!JSON.stringify(output).includes('synthetic-local-sql-key'));
});
