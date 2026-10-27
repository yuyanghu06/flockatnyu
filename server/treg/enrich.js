import { createHash } from 'node:crypto';
import { canonicalJson, plainObject, validUuid } from '../automation/validation.js';
import { readTregPeopleConfig } from './people.js';
import { createTregCallLogger } from './call-log.js';
import { SOURCE_TOOL_TIMEOUT_MS } from '../shared/source-timeout.js';

const endpoint = 'https://treg.to/call/treg.people.enrich';
const responseLimit = 512_000;
const hash = (value) => createHash('sha256').update(value).digest('hex');
const label = (value) =>
  typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,159}$/.test(value);
const authorized = (principal) =>
  typeof principal?.id === 'string' &&
  principal.id.trim().length > 0 &&
  principal.id.length <= 512 &&
  Array.isArray(principal.allowedSourceIds);

// Accept a literal address, never a display-name address, list or message body.
// The service must choose the address and its own backend principal separately.
export function validTregEnrichmentEmail(email) {
  if (typeof email !== 'string' || email.length > 320 || email !== email.trim()) return false;
  const parts = email.split('@');
  return (
    parts.length === 2 &&
    parts[0].length >= 1 &&
    parts[0].length <= 64 &&
    /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(parts[0]) &&
    !parts[0].startsWith('.') &&
    !parts[0].endsWith('.') &&
    !parts[0].includes('..') &&
    parts[1].length <= 253 &&
    parts[1].includes('.') &&
    parts[1]
      .split('.')
      .every((part) => /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/.test(part))
  );
}

function usageOf(response, enrichment, matched) {
  const headerProvider = response.headers.get('X-Treg-Served-By'),
    bodyProvider = enrichment?._treg?.served_by;
  if (
    (headerProvider && !label(headerProvider)) ||
    (bodyProvider !== undefined && !label(bodyProvider)) ||
    (headerProvider && bodyProvider && headerProvider !== bodyProvider)
  )
    return null;
  const provider = headerProvider || bodyProvider || (!matched ? 'treg.people.enrich' : null);
  if (!provider) return null;
  const cost = response.headers.get('X-Treg-Cost-Micro'),
    callId = response.headers.get('X-Treg-Call-Id');
  if (
    (cost !== null &&
      (!/^(0|[1-9][0-9]{0,15})$/.test(cost) || !Number.isSafeInteger(Number(cost)))) ||
    (callId !== null && !label(callId))
  )
    return null;
  return { callId, costMicro: cost === null ? null : Number(cost), provider };
}

// This client performs one email-only Treg lookup. It never reads Gmail/cache
// records, saves contacts, guesses native person shapes or changes the envelope.
export function createTregEnrichmentClient({
  env = process.env,
  config = readTregPeopleConfig(env),
  fetchImpl = globalThis.fetch,
  callLogger = createTregCallLogger({ env, secretValues: [config.token] }),
  feature = 'gmail-contact-enrichment',
} = {}) {
  const configured =
    config.configured === true &&
    typeof fetchImpl === 'function' &&
    ['gmail-contact-enrichment', 'chat-contact-enrichment'].includes(feature);
  return Object.freeze({
    configured,
    async enrich({ email, requestId, principal, signal } = {}) {
      if (!authorized(principal)) return { status: 'forbidden' };
      if (!validTregEnrichmentEmail(email) || !validUuid(requestId))
        return { status: 'invalid_request' };
      if (!configured) return { status: 'not_configured' };
      if (signal?.aborted) return { status: 'aborted' };
      const body = { email: email.toLowerCase() };
      const safeHeaders = {
        'Content-Type': 'application/json',
        'X-Treg-Meta': `customer=${hash(principal.id).slice(0, 32)}, workspace=flockatnyu, feature=${feature}`,
        'X-Treg-Route-Max-Cost': config.maxCostUsd,
        'X-Treg-Route-Waterfall': '0',
        'Idempotency-Key': hash(
          canonicalJson({
            actor: principal.id,
            requestId: requestId.toLowerCase(),
            endpoint,
            body,
          }),
        ),
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
      let loggingFailed = false;
      async function append(type, data) {
        try {
          if ((await callLog.append(type, data))?.status === 'ready') return true;
        } catch {}
        loggingFailed = true;
        return false;
      }
      const finishLog = async (outcome) => {
        const recorded = await append('import_outcome', outcome);
        return {
          status: recorded && !loggingFailed ? 'ready' : 'log_unavailable',
          logId: callLog.logId,
        };
      };
      async function failed(status) {
        await append('lookup_outcome', { status });
        return {
          status,
          callLog,
          finishLog,
          ...(loggingFailed
            ? { logging: { status: 'log_unavailable', logId: callLog.logId } }
            : {}),
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
      let enrichment,
        parsed = false;
      if (!truncated && !readError) {
        try {
          enrichment = JSON.parse(text);
          parsed = true;
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
      const recorded = await append('response', {
        httpStatus: response?.status ?? null,
        headers,
        durationMs: Math.max(0, Date.now() - began),
        bytesObserved,
        bytesCaptured,
        truncated,
        complete: !truncated && !readError,
        ...(readError ? { error: readError } : {}),
        ...(parsed ? { body: enrichment } : { rawText: text }),
      });
      if (!recorded) return failed('log_unavailable');
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
        !parsed ||
        !plainObject(enrichment) ||
        !plainObject(enrichment.output) ||
        !Object.hasOwn(enrichment.output, 'full_name') ||
        !Object.hasOwn(enrichment, 'raw')
      )
        return failed('invalid_response');
      const fullName = enrichment.output.full_name;
      if (fullName !== null && (typeof fullName !== 'string' || !fullName.trim()))
        return failed('invalid_response');
      const matched = typeof fullName === 'string';
      const usage = usageOf(response, enrichment, matched);
      if (!usage) return failed('invalid_response');
      // The raw winning provider body can have arbitrary wrappers. Preserve it
      // and every other envelope key for the cache; the worker decides storage.
      return { status: 'ready', enrichment, usage, matched, callLog, finishLog };
    },
  });
}
