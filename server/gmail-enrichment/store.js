import { plainObject } from '../automation/validation.js';
import { SOURCE_TOOL_TIMEOUT_MS } from "../shared/source-timeout.js";

const functions = Object.freeze({ probe: 'gmail_enrichment_probe', claim: 'gmail_enrichment_claim', renew: 'gmail_enrichment_renew',
  complete: 'gmail_enrichment_complete', defer: 'gmail_enrichment_defer' });
const statuses = new Set(['ready', 'empty', 'schema_not_ready', 'invalid_request', 'forbidden', 'unavailable', 'conflict',
  'lease_lost', 'stale', 'budget_exceeded', 'rate_limited', 'aborted', 'not_configured']);
const bound = 1_048_576;
const claimFields = ['id', 'jobId', 'sourceId', 'account', 'personKey', 'email', 'requestId', 'leaseToken',
  'sourceVersion', 'version', 'leaseExpiresAt', 'budgetReservedMicro'];
const uncertain = () => ({ status: 'unavailable', reason: 'write_outcome_unknown' });

// Fixed service-only RPCs read contacts_cache and write only metadata jobs,
// budgets and native Contacts. Sender-cache rows are never mutated.
export function createGmailEnrichmentCacheStore({ env = process.env, fetchImpl = globalThis.fetch } = {}) {
  let origin;
  try {
    const url = new URL(env.SUPABASE_URL);
    if (url.protocol !== 'https:' || url.username || url.password || !['', '/'].includes(url.pathname) || url.search || url.hash) throw Error();
    origin = url.origin;
  } catch {}
  const key = typeof env.SUPABASE_SERVICE_ROLE_KEY === 'string' ? env.SUPABASE_SERVICE_ROLE_KEY.trim() : '';
  const configured = Boolean(origin && key && !/[\r\n]/.test(key) && typeof fetchImpl === 'function');
  async function rpc(operation, { signal, ...payload } = {}) {
    if (!configured) return { status: 'not_configured' };
    if (!Object.hasOwn(functions, operation) || !plainObject(payload)) return { status: 'invalid_request' };
    if (signal?.aborted) return { status: 'aborted' };
    let body;
    try {
      // Claims contain only identity/version metadata. No response envelope or
      // cached sender document may be copied into a job-tracking request.
      const requestPayload = Object.hasOwn(payload, 'claim') && plainObject(payload.claim)
        ? { ...payload, claim: Object.fromEntries(claimFields.filter(key => Object.hasOwn(payload.claim, key)).map(key => [key, payload.claim[key]])) }
        : payload;
      body = JSON.stringify({ p_payload: requestPayload });
      if (Buffer.byteLength(body) > bound) return { status: 'invalid_request' };
    }
    catch { return { status: 'invalid_request' }; }
    const mutation = operation !== 'probe';
    try {
      const response = await fetchImpl(`${origin}/rest/v1/rpc/${functions[operation]}`, { method: 'POST', redirect: 'error',
        signal: AbortSignal.any([signal, AbortSignal.timeout(SOURCE_TOOL_TIMEOUT_MS)].filter(Boolean)),
        headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body });
      if (!response.ok) {
        await response.body?.cancel();
        if (response.status === 404) return { status: 'schema_not_ready' };
        if ([401, 403].includes(response.status)) return { status: 'forbidden' };
        if (response.status === 429) return { status: 'rate_limited' };
        return mutation ? uncertain() : { status: 'unavailable' };
      }
      if (!response.body) return mutation ? uncertain() : { status: 'unavailable' };
      const chunks = []; let bytes = 0;
      for await (const chunk of response.body) {
        bytes += chunk.byteLength;
        if (bytes > bound) return mutation ? uncertain() : { status: 'unavailable' };
        chunks.push(chunk);
      }
      const result = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      return plainObject(result) && statuses.has(result.status) ? result : mutation ? uncertain() : { status: 'unavailable' };
    } catch { return mutation ? uncertain() : { status: signal?.aborted ? 'aborted' : 'unavailable' }; }
  }
  return Object.freeze({ configured, ...Object.fromEntries(Object.keys(functions).map(name => [name, args => rpc(name, args)])) });
}

