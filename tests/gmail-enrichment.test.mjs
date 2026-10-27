import test from 'node:test';
import assert from 'node:assert/strict';
import {gmailEnrichmentFixture,gmailCacheItem,gmailNow,nativeLead,enrichedEnvelope} from './fixtures/gmail-enrichment.mjs';

const noPayload=jobs=>assert(!/provider_extra|full_name|exact native record/.test(JSON.stringify(jobs)),'Tracking retains no enrichment payload');
test('raw-only Gmail enrichment leaves sender inputs unchanged and completes with exact native contact data',async t=>{
  const f=await gmailEnrichmentFixture(t),before=f.inputs,result=await f.worker.once();
  assert.equal(result.counts.requests,1);assert.equal(result.counts.imported,1);assert.equal(result.counts.jobCompleted,1);
  assert.deepEqual(f.inputs,before);assert.deepEqual(f.contacts[0].raw_input,nativeLead);assert.equal(f.jobs[0].stage,'completed');noPayload(f.jobs);
  const payload=f.trace.find(entry=>entry.operation==='complete').payload;assert.equal(payload.outcome,'hit');assert.deepEqual(payload.rawInput,nativeLead);assert(!Object.hasOwn(payload,'enrichment'));
  assert.deepEqual(f.requests[0].body,{email:'rae@example.com'});assert(!JSON.stringify(result).includes('rae@example.com'));
  const log=await f.logs();assert.deepEqual(log[0][1].data.body,enrichedEnvelope);assert(log[0].some(event=>event.type==='import_outcome'));
});

test('raw-only Gmail enrichment preserves human contacts and never reclaims completed jobs',async t=>{
  const manual={id:'65000000-0000-4000-8000-000000000001',created_at:gmailNow,updated_at:gmailNow,raw_input:{email:'RAE@example.com',notes:'Keep human notes',legacy:{keep:true}}};
  const f=await gmailEnrichmentFixture(t,{contacts:[manual]}),before=f.inputs,first=await f.worker.once();
  assert.equal(first.counts.existing,1);assert.deepEqual(f.contacts,[manual]);assert.deepEqual(f.inputs,before);assert.equal(f.requests.length,1);
  const second=await f.newWorker().once();assert.equal(second.counts.requests,0);assert.equal(f.requests.length,1);assert.equal(f.applied.length,0);noPayload(f.jobs);
});

test('raw-only Gmail enrichment retries before completion with the same request key and avoids lookups after committed completion',async t=>{
  const before=await gmailEnrichmentFixture(t),source=before.inputs;before.mode.completeFailureBefore=true;
  const first=await before.worker.once();assert.equal(first.counts.imported,0);assert.equal(before.applied.length,0);assert.equal(first.outcomes[0].reason,'write_outcome_unknown');
  delete before.mode.completeFailureBefore;before.requeue(gmailCacheItem().id);const resumed=await before.newWorker().once();assert.equal(resumed.counts.imported,1);assert.equal(before.requests.length,2);assert.equal(before.requests[0].headers.get('idempotency-key'),before.requests[1].headers.get('idempotency-key'));assert.deepEqual(before.inputs,source);noPayload(before.jobs);
  const after=await gmailEnrichmentFixture(t);after.mode.completeFailureAfter=true;const lost=await after.worker.once();assert.equal(lost.counts.imported,0);assert.equal(after.applied.length,1);assert.equal(lost.outcomes[0].reason,'write_outcome_unknown');
  const next=await after.newWorker().once();assert.equal(next.counts.requests,0);assert.equal(after.requests.length,1);assert.equal(after.contacts.length,1);noPayload(after.jobs);
});

test('raw-only Gmail enrichment bounds requests, checks service capabilities and uses atomic claims across workers',async t=>{
  const f=await gmailEnrichmentFixture(t),source=f.inputs;await Promise.all([f.worker.once(),f.newWorker().once()]);assert.equal(f.requests.length,1);assert.equal(f.contacts.length,1);assert.deepEqual(f.inputs,source);
  const second=gmailCacheItem({id:'63000000-0000-4000-8000-000000000002',jobId:'69000000-0000-4000-8000-000000000002',personKey:'sender:other@example.com',email:'other@example.com',requestId:'64000000-0000-4000-8000-000000000002'});
  const bounded=await gmailEnrichmentFixture(t,{items:[gmailCacheItem(),second],config:{maxRequests:1}});assert.equal((await bounded.worker.once()).counts.requests,1);assert.equal(bounded.requests.length,1);
  const disabled=await gmailEnrichmentFixture(t,{config:{enabled:false}});await disabled.worker.once();assert.equal(disabled.trace.length,0);
  const absent=await gmailEnrichmentFixture(t);absent.mode.probe={status:'schema_not_ready'};assert.equal((await absent.worker.once()).status,'schema_not_ready');assert.equal(absent.requests.length,0);
  const unreserved=await gmailEnrichmentFixture(t);unreserved.mode.claimMutate=claim=>{claim.budgetReservedMicro=0;};await unreserved.worker.once();assert.equal(unreserved.requests.length,0);
});

test('raw-only Gmail enrichment stops after lost ownership or cancellation without contact writes',async t=>{
  for(const renewFailureAt of [1,2]){const f=await gmailEnrichmentFixture(t),source=f.inputs;f.mode.renewFailureAt=renewFailureAt;await f.worker.once();assert.equal(f.applied.length,0);assert(!f.trace.some(entry=>entry.operation==='complete'));assert.deepEqual(f.inputs,source);}
  const f=await gmailEnrichmentFixture(t),source=f.inputs,controller=new AbortController();f.mode.tregBefore=()=>{controller.abort();throw new DOMException('Synthetic cancellation','AbortError');};await f.worker.once({signal:controller.signal});assert.equal(f.applied.length,0);assert.deepEqual(f.inputs,source);
});

test('raw-only Gmail enrichment records confirmed misses and rejects failed logging or malformed completion receipts',async t=>{
  const miss=await gmailEnrichmentFixture(t,{response:{output:{full_name:null},raw:{native_miss:true},_treg:{served_by:'synthetic.people.enrich'}}}),source=miss.inputs;
  const missed=await miss.worker.once();assert.equal(missed.counts.missed,1);assert.equal(missed.counts.jobCompleted,1);assert.equal(miss.applied.length,0);assert.deepEqual(miss.inputs,source);assert(!Object.hasOwn(miss.trace.find(row=>row.operation==='complete').payload,'rawInput'));noPayload(miss.jobs);
  const denied=await gmailEnrichmentFixture(t,{upstreamStatus:429,response:{error:'PRIVATE provider failure'}}),original=denied.inputs;const failed=await denied.worker.once();assert.equal(denied.applied.length,0);assert.deepEqual(denied.inputs,original);assert(!JSON.stringify(failed).includes('PRIVATE'));noPayload(denied.jobs);
  const log=await gmailEnrichmentFixture(t,{callLogger:{begin:async()=>({status:'log_unavailable'})}});await log.worker.once();assert.equal(log.requests.length,0);assert.equal(log.applied.length,0);
  for(const mode of ['malformedReceipt','staleReceipt']){const f=await gmailEnrichmentFixture(t);f.mode[mode]=true;const rejected=await f.worker.once();assert.equal(rejected.counts.imported,0);assert.equal(rejected.counts.jobCompleted,0);}
  const cannotDefer=await gmailEnrichmentFixture(t,{upstreamStatus:429});cannotDefer.mode.deferFailure=true;const result=await cannotDefer.worker.once();assert.equal(result.counts.deferred,0);assert.notEqual(result.outcomes[0].status,'deferred');
});
