import { createHash, randomUUID } from 'node:crypto';
import { canonicalJson, plainObject, validUuid } from '../automation/validation.js';
import { validEnrichmentEmail } from './config.js';

const text = (value, max = 400) => typeof value === 'string' && value.length > 0 && value.length <= max && !/[\u0000-\u001f\u007f]/.test(value);
const label = value => typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,159}$/.test(value);
const safeReasons = new Set(['aborted', 'unavailable', 'forbidden', 'invalid_response', 'response_too_large', 'rate_limited',
  'budget_exceeded', 'log_unavailable', 'schema_not_ready', 'write_outcome_unknown', 'invalid_email', 'unsupported_raw', 'raw_too_large', 'lease_lost']);
const reasonOf = value => value === 'stale' ? 'lease_lost' : safeReasons.has(value) ? value : 'unavailable';
const capabilities = ['atomicClaims', 'versionChecks', 'durableRequestIds', 'durableBudget', 'readOnlyCache', 'metadataOnlyJobs', 'atomicContactCompletion'];
const same = (left, right) => { try { return canonicalJson(left) === canonicalJson(right); } catch { return false; } };
const contactIdForEmail = email => {
  const value = createHash('sha256').update(`flockatnyu:treg-contact:v1:email:${email.toLowerCase()}`).digest('hex').slice(0, 32).split('');
  value[12] = '8'; value[16] = (parseInt(value[16], 16) & 3 | 8).toString(16);
  const hex = value.join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};
const countsOf = () => ({ claimed: 0, enriched: 0, imported: 0, existing: 0, missed: 0, deferred: 0,
  requests: 0, costMicro: 0, unknownCost: false, jobCompleted: 0, loggingFailures: 0 });
const validUsage = usage => plainObject(usage) && label(usage.provider) && (usage.callId === null || label(usage.callId))
  && (usage.costMicro === null || Number.isSafeInteger(usage.costMicro) && usage.costMicro >= 0);
function validResult(found) {
  if (found?.status !== 'ready' || !plainObject(found.enrichment) || !plainObject(found.enrichment.output)
    || !Object.hasOwn(found.enrichment, 'raw') || !Object.hasOwn(found.enrichment.output, 'full_name')
    || !(found.enrichment.output.full_name === null || typeof found.enrichment.output.full_name === 'string' && found.enrichment.output.full_name.trim())
    || typeof found.matched !== 'boolean' || (!found.matched && found.enrichment.output.full_name !== null) || !validUsage(found.usage)) return false;
  try { return Buffer.byteLength(canonicalJson(found.enrichment)) <= 530_000; } catch { return false; }
}

// Sender inputs remain read-only. Only native Contacts and separate typed job /
// lease / spending metadata may be written by the database completion RPC.
export function createGmailEnrichmentWorker({ config, cacheStore, enrichmentClient, now = () => new Date() } = {}) {
  const time = () => new Date(now()).getTime();
  const scope = () => ({ sourceIds: [...config.sourceIds], account: config.account, scope: config.scope });
  const principal = () => ({ id: 'gmail-enrichment-service', allowedSourceIds: [...config.sourceIds] });
  const methods = ['probe', 'claim', 'renew', 'complete', 'defer'];
  const configured = config?.configured === true && enrichmentClient?.configured === true && typeof enrichmentClient.enrich === 'function';
  const binding = claim => Object.fromEntries(['id', 'jobId', 'sourceId', 'sourceVersion', 'account', 'personKey', 'email', 'requestId', 'leaseToken'].map(key => [key, claim[key]]));
  function validClaim(claim) {
    return plainObject(claim) && validUuid(claim.id) && validUuid(claim.jobId) && validUuid(claim.sourceId)
      && config.sourceIds.includes(claim.sourceId.toLowerCase()) && claim.account === config.account
      && text(claim.personKey, 320) && text(claim.version, 200)
      && typeof claim.sourceVersion === 'string' && /^[0-9a-f]{64}$/.test(claim.sourceVersion)
      && typeof claim.email === 'string' && claim.email.length <= 320 && !/[\u0000-\u001f\u007f]/.test(claim.email)
      && validUuid(claim.requestId) && validUuid(claim.leaseToken) && typeof claim.leaseExpiresAt === 'string'
      && Date.parse(claim.leaseExpiresAt) > time()
      && !['enrichment', 'raw_input', 'rawInput', 'response'].some(key => Object.hasOwn(claim, key));
  }
  async function call(name, args) { try { return await cacheStore[name](args); } catch { return { status: 'unavailable', reason: 'write_outcome_unknown' }; } }
  async function status({ signal } = {}) {
    if (!config?.enabled) return { status: 'disabled' };
    if (!configured) return { status: 'not_configured' };
    if (cacheStore?.configured === false || methods.some(name => typeof cacheStore?.[name] !== 'function')) return { status: 'schema_not_ready' };
    const probe = await call('probe', { ...scope(), maxCycleCostMicro: config.maxCycleCostMicro, maxDailyCostMicro: config.maxDailyCostMicro, signal });
    if (probe?.status !== 'ready') return { status: probe?.status === 'forbidden' ? 'forbidden' : 'schema_not_ready' };
    if (probe.contract !== 'gmail-enrichment-v2' || probe.table !== 'contacts_cache' || probe.account !== config.account
      || !Array.isArray(probe.sourceIds) || !same([...probe.sourceIds].sort(), [...config.sourceIds].sort())
      || capabilities.some(name => probe.capabilities?.[name] !== true)) return { status: 'schema_not_ready' };
    return { status: 'ready' };
  }
  function receiptValid(receipt, claim, outcome, usage, reason) {
    if (!plainObject(receipt) || receipt.jobId !== claim.jobId || receipt.cacheId !== claim.id || receipt.sourceVersion !== claim.sourceVersion
      || receipt.requestId !== claim.requestId || receipt.version !== claim.version || receipt.outcome !== outcome || !same(receipt.usage, usage)) return false;
    if (outcome === 'hit') return validUuid(receipt.contactId) && ['imported', 'existing'].includes(receipt.operation) && receipt.reason === null
      && (receipt.operation !== 'imported' || receipt.contactId.toLowerCase() === contactIdForEmail(claim.email).toLowerCase());
    return receipt.contactId === null && receipt.operation === null && receipt.reason === (reason || null);
  }
  async function once({ signal } = {}) {
    const ready = await status({ signal }), counts = countsOf(), outcomes = [];
    if (ready.status !== 'ready') return { ...ready, counts, outcomes };
    let cycleStatus = 'ready', reservedMicro = 0;
    const cycleId = randomUUID();
    // Legacy test/injected configurations may omit batchSize or raise the old
    // limits. No individual batch may claim more than fifty sender inputs.
    const batchLimit = Math.min(config.batchSize ?? 50, config.maxItems, 50);
    for (let index = 0; index < batchLimit; index++) {
      if (signal?.aborted) { cycleStatus = 'aborted'; break; }
      if (counts.unknownCost || counts.requests >= config.maxRequests || reservedMicro + config.perCallMaxCostMicro > config.maxCycleCostMicro) break;
      const taken = await call('claim', { ...scope(), leaseSeconds: config.leaseSeconds, reserveMicro: config.perCallMaxCostMicro,
        maxCycleCostMicro: config.maxCycleCostMicro, maxDailyCostMicro: config.maxDailyCostMicro, cycleId, signal });
      if (taken?.status === 'empty') break;
      if (taken?.status !== 'ready' || !validClaim(taken.claim)) { cycleStatus = taken?.status === 'budget_exceeded' ? 'budget_exceeded' : 'unavailable'; break; }
      let claim = structuredClone(taken.claim), found, completionAttempt = null;
      counts.claimed++;
      const item = { id: claim.id, status: 'pending' }; outcomes.push(item);
      async function renew() {
        if (signal?.aborted || !validClaim(claim)) return false;
        const next = await call('renew', { claim, leaseSeconds: config.leaseSeconds, signal });
        if (next?.status !== 'ready' || !validClaim(next.claim) || !same(binding(claim), binding(next.claim)) || next.claim.version !== claim.version) return false;
        claim = structuredClone(next.claim); return true;
      }
      async function finish(outcome) {
        Object.assign(item, outcome);
        let logged = true;
        try {
          const detail = { cacheId: claim.id, jobId: claim.jobId, requestId: claim.requestId, ...outcome, completionAttempt };
          if (typeof found?.finishLog === 'function') logged = (await found.finishLog(detail))?.status === 'ready';
          else if (found?.callLog) logged = (await found.callLog.append('import_outcome', detail))?.status === 'ready';
        } catch { logged = false; }
        if (!logged || found?.logging?.status === 'log_unavailable') { counts.loggingFailures++; item.loggingStatus = 'log_unavailable'; }
      }
      async function defer(reason, uncertain = false) {
        if (!await renew()) {
          cycleStatus = 'partial';
          return finish({ status: 'partial', reason: uncertain ? reasonOf(reason) : 'lease_lost', ...(uncertain ? { uncertain: true } : {}) });
        }
        const deferred = await call('defer', { claim, reason: reasonOf(reason), uncertain, signal });
        if (deferred?.status === 'ready') { counts.deferred++; return finish({ status: 'deferred', reason: reasonOf(reason), ...(uncertain ? { uncertain: true } : {}) }); }
        cycleStatus = 'partial';
        return finish({ status: 'partial', reason: uncertain ? reasonOf(reason) : reasonOf(deferred?.status), ...(uncertain ? { uncertain: true } : {}) });
      }
      if (!validEnrichmentEmail(claim.email)) { await defer('invalid_email'); continue; }
      if (!Number.isSafeInteger(claim.budgetReservedMicro) || claim.budgetReservedMicro < config.perCallMaxCostMicro) {
        cycleStatus = 'schema_not_ready'; await defer('schema_not_ready'); break;
      }
      if (!await renew()) { cycleStatus = 'partial'; await finish({ status: 'partial', reason: 'lease_lost' }); continue; }
      reservedMicro += config.perCallMaxCostMicro; counts.requests++;
      try { found = await enrichmentClient.enrich({ email: claim.email, requestId: claim.requestId, principal: principal(), signal }); }
      catch { found = { status: 'unavailable' }; }
      if (!validResult(found)) { counts.unknownCost = true; await defer(reasonOf(found?.status)); break; }
      counts.enriched++;
      if (found.usage.costMicro === null) counts.unknownCost = true;
      else { counts.costMicro += found.usage.costMicro; reservedMicro += found.usage.costMicro - config.perCallMaxCostMicro; }
      if (!await renew()) {
        cycleStatus = 'partial'; await finish({ status: 'partial', reason: 'lease_lost' });
        if (found.budgetExceeded === true) break;
        continue;
      }
      let outcome = 'hit', reason;
      if (!found.matched) outcome = 'miss';
      else if (!plainObject(found.enrichment.raw)) { outcome = 'unsupported_raw'; reason = 'unsupported_raw'; }
      else if (Buffer.byteLength(canonicalJson(found.enrichment.raw)) > 254_976) { outcome = 'unsupported_raw'; reason = 'raw_too_large'; }
      completionAttempt = { status: 'dispatched', outcome, ...(outcome === 'hit' ? { contactId: contactIdForEmail(claim.email) } : {}) };
      const completed = await call('complete', { claim, outcome, usage: found.usage,
        ...(outcome === 'hit' ? { rawInput: structuredClone(found.enrichment.raw) } : {}), ...(reason ? { reason } : {}), signal });
      if (completed?.status !== 'ready' || !receiptValid(completed.receipt, claim, outcome, found.usage, reason)) {
        const failure = completed?.reason === 'write_outcome_unknown' || completed?.status === 'ready' ? 'write_outcome_unknown' : reasonOf(completed?.status);
        completionAttempt = { ...completionAttempt, status: 'unconfirmed', reason: failure };
        cycleStatus = 'partial';
        if (failure === 'lease_lost') await finish({ status: 'partial', reason: failure });
        else await defer(failure, failure === 'write_outcome_unknown');
        if (found.budgetExceeded === true) break;
        continue;
      }
      const receipt = completed.receipt;
      completionAttempt = { status: 'confirmed', outcome, contactId: receipt.contactId, operation: receipt.operation };
      counts.jobCompleted++;
      if (outcome === 'hit') { counts[receipt.operation]++; await finish({ status: 'ready', operation: receipt.operation, contactId: receipt.contactId }); }
      else if (outcome === 'miss') { counts.missed++; await finish({ status: 'miss' }); }
      else await finish({ status: 'unsupported_raw', reason });
      // Preserve an actual overrun receipt, then stop this cycle rather than
      // treating the configured reservation as a retroactive charge limit.
      if (found.budgetExceeded === true) { cycleStatus = 'budget_exceeded'; break; }
    }
    return { status: cycleStatus, counts, outcomes };
  }
  return Object.freeze({ status, once });
}
