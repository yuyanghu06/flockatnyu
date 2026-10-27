import { createHash } from 'node:crypto';
import { canonicalJson, plainObject, validUuid } from '../automation/validation.js';
import { SOURCE_TOOL_TIMEOUT_MS } from '../shared/source-timeout.js';
import { createTregCallLogger } from './call-log.js';
import {
  actorAllowed,
  label,
  personLimit,
  readTregPeopleConfig,
  validTregPeopleQuery,
} from './validation.js';
export { readTregPeopleConfig, validTregPeopleQuery } from './validation.js';
export { tregContactIdentity } from './contact-identity.js';
export { createTregContactsImporter } from './contacts-importer.js';

const provider = 'exa.people.search';
const endpoint = `https://treg.to/call/${provider}`;
const responseLimit = 512_000;
const hash = (value) => createHash('sha256').update(value).digest('hex');
function exaSearchBody(query) {
  const criteria = Object.entries({
    q: 'Search text',
    full_name: 'Full name',
    company_domain: 'Company domain',
    title: 'Job title',
    country: 'Country',
    location: 'Location',
  })
    .filter(([key]) => query[key] !== undefined)
    .map(([key, name]) => `${name}: ${query[key].trim()}`);
  if (query.keywords !== undefined)
    criteria.push(`Keywords: ${query.keywords.map((value) => value.trim()).join(', ')}`);
  return {
    query: `Find people matching these supplied criteria:\n${criteria.join('\n')}`,
    category: 'people',
    numResults: query.limit ?? 5,
  };
}

function usageOf(response, body) {
  const headerProvider = response.headers.get('X-Treg-Served-By');
  const bodyProvider = body?._treg?.served_by;
  if (
    (headerProvider && !label(headerProvider)) ||
    (bodyProvider !== undefined && !label(bodyProvider)) ||
    (headerProvider && bodyProvider && headerProvider !== bodyProvider)
  )
    return null;
  const rawCost = response.headers.get('X-Treg-Cost-Micro');
  const rawCall = response.headers.get('X-Treg-Call-Id');
  if (
    (rawCost !== null &&
      (!/^(0|[1-9][0-9]{0,15})$/.test(rawCost) || !Number.isSafeInteger(Number(rawCost)))) ||
    (rawCall !== null && !label(rawCall))
  )
    return null;
  return { callId: rawCall, costMicro: rawCost === null ? null : Number(rawCost), provider };
}

// This adapter calls Treg only. Saving contacts is an explicit importer operation
// below; saved contact reads and the existing chat tools never call Treg.
export function createTregPeopleClient({
  env = process.env,
  config = readTregPeopleConfig(env),
  fetchImpl = globalThis.fetch,
  callLogger = createTregCallLogger({ env, secretValues: [config.token] }),
} = {}) {
  const configured = config.configured === true && typeof fetchImpl === 'function';
  return Object.freeze({
    configured,
    async search({ query, requestId, principal, signal } = {}) {
      if (!actorAllowed(principal)) return { status: 'forbidden' };
      if (!validTregPeopleQuery(query) || !validUuid(requestId))
        return { status: 'invalid_request' };
      if (!configured) return { status: 'not_configured' };
      if (signal?.aborted) return { status: 'aborted' };
      const body = exaSearchBody(query);
      const idempotency = hash(
        canonicalJson({ actor: principal.id, requestId: requestId.toLowerCase(), endpoint, body }),
      );
      const safeHeaders = {
        'Content-Type': 'application/json',
        'X-Treg-Meta': `customer=${hash(principal.id).slice(0, 32)}, workspace=flockatnyu, feature=contacts`,
        'X-Treg-Route-Max-Cost': config.maxCostUsd,
        'X-Treg-Route-Waterfall': '0',
        'Idempotency-Key': idempotency,
      };
      let started;
      try {
        started = await callLogger.begin({
          endpoint,
          method: 'POST',
          headers: safeHeaders,
          body,
          requestId,
          actorHash: hash(principal.id),
        });
      } catch {
        return { status: 'log_unavailable' };
      }
      const callLog = started?.session;
      if (
        started?.status !== 'ready' ||
        !validUuid(callLog?.logId) ||
        typeof callLog?.append !== 'function'
      )
        return { status: 'log_unavailable' };
      const append = async (type, data) => {
        try {
          return (await callLog.append(type, data))?.status === 'ready';
        } catch {
          return false;
        }
      };
      async function failed(status) {
        const result = { status };
        const logged = await append('lookup_outcome', result);
        return {
          ...result,
          callLog,
          ...(!logged ? { logging: { status: 'log_unavailable', logId: callLog.logId } } : {}),
        };
      }
      const active = AbortSignal.any(
        [signal, AbortSignal.timeout(SOURCE_TOOL_TIMEOUT_MS)].filter(Boolean),
      );
      const began = Date.now();
      let response,
        captured = [],
        bytesObserved = 0,
        bytesCaptured = 0,
        truncated = false,
        readError = null;
      try {
        response = await fetchImpl(endpoint, {
          method: 'POST',
          redirect: 'error',
          signal: active,
          headers: {
            ...safeHeaders,
            'X-Treg-Token': config.token,
            ...(config.org ? { 'X-Treg-Org': config.org } : {}),
          },
          body: JSON.stringify(body),
        });
        if (response.body) {
          const reader = response.body.getReader();
          try {
            while (true) {
              const { value, done } = await reader.read();
              if (done) break;
              bytesObserved += value.byteLength;
              const allowed = Math.min(value.byteLength, responseLimit - bytesCaptured);
              if (allowed) {
                captured.push(Buffer.from(value.subarray(0, allowed)));
                bytesCaptured += allowed;
              }
              if (bytesObserved > responseLimit) {
                truncated = true;
                await reader.cancel();
                break;
              }
            }
          } catch {
            readError = signal?.aborted
              ? 'aborted'
              : active.aborted
                ? 'timeout'
                : 'response_read_failed';
          } finally {
            reader.releaseLock();
          }
        }
      } catch {
        readError = signal?.aborted ? 'aborted' : active.aborted ? 'timeout' : 'transport_error';
      }
      const text = Buffer.concat(captured).toString('utf8');
      let parsed,
        parsedOk = false;
      if (!truncated && !readError) {
        try {
          parsed = JSON.parse(text);
          parsedOk = true;
        } catch {}
      }
      const headers = {};
      for (const name of [
        'content-type',
        'x-treg-call-id',
        'x-treg-cost-micro',
        'x-treg-original-cost-micro',
        'x-treg-served-by',
        'x-treg-error',
      ]) {
        const value = response?.headers?.get(name);
        if (value !== null && value !== undefined) headers[name] = value.slice(0, 4096);
      }
      const logged = await append('response', {
        httpStatus: response?.status ?? null,
        headers,
        durationMs: Math.max(0, Date.now() - began),
        bytesObserved,
        bytesCaptured,
        truncated,
        complete: !truncated && !readError,
        ...(readError ? { error: readError } : {}),
        ...(parsedOk ? { body: parsed } : { rawText: text }),
      });
      if (!logged) return failed('log_unavailable');
      if (readError) return failed(signal?.aborted ? 'aborted' : 'unavailable');
      if (truncated) return failed('response_too_large');
      if (!response?.ok)
        return failed(
          response?.status === 429
            ? 'rate_limited'
            : response?.status === 402
              ? 'budget_exceeded'
              : 'unavailable',
        );
      if (
        !parsedOk ||
        !plainObject(parsed) ||
        !Array.isArray(parsed.results) ||
        parsed.results.length > body.numResults ||
        parsed.results.some(
          (person) =>
            !plainObject(person) || Buffer.byteLength(JSON.stringify(person)) > personLimit,
        )
      )
        return failed('invalid_response');
      // Direct Exa responses need no routed serving-child envelope. The fixed
      // endpoint establishes the provider; missing observed cost stays unknown.
      const usage = usageOf(response, parsed);
      if (!usage) return failed('invalid_response');
      return { status: 'ready', people: parsed.results, usage, callLog };
    },
  });
}
