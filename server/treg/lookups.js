import { createHash } from 'node:crypto';
import { canonicalJson, plainObject, validUuid } from '../automation/validation.js';
import { readTregPeopleConfig } from './people.js';
import { validTregEnrichmentEmail } from './enrich.js';
import { createTregCallLogger } from './call-log.js';
import { SOURCE_TOOL_TIMEOUT_MS } from '../shared/source-timeout.js';
import { brandDevRequest, projectBrandDevOutput } from './branddev.js';

// Deliberately dormant: neither this module nor the HTTP registration module is
// imported by the running application, tools, collectors or workers.
export const TREG_LOOKUP_CONTRACTS = Object.freeze(
  Object.fromEntries(
    [
      ['email_find', 'treg.people.email.find', '/api/treg/people/email/find'],
      ['email_verify', 'treg.people.email.verify', '/api/treg/people/email/verify'],
      ['phone_find', 'treg.people.phone.find', '/api/treg/people/phone/find'],
      ['company_enrich', 'branddev.brand.retrieve', '/api/treg/companies/enrich'],
    ].map(([operation, service, path]) => [
      operation,
      Object.freeze({ service, endpoint: `https://treg.to/call/${service}`, path }),
    ]),
  ),
);

const responseLimit = 512_000;
const limits = Object.freeze({
  email: 320,
  domain: 253,
  first_name: 200,
  last_name: 200,
  full_name: 400,
  name: 400,
  linkedin_handle: 200,
  linkedin_url: 2048,
  website: 2048,
});
const inputs = Object.freeze({
  email_find: ['domain', 'full_name', 'first_name', 'last_name', 'linkedin_url', 'linkedin_handle'],
  email_verify: ['email'],
  phone_find: ['linkedin_url', 'email', 'domain', 'full_name', 'first_name', 'last_name'],
  company_enrich: ['domain', 'website', 'name', 'linkedin_url', 'linkedin_handle', 'email'],
});
const outputs = Object.freeze({
  email_find: {
    required: ['email'],
    fields: {
      email: 'string',
      confidence: 'confidence',
      first_name: 'string',
      last_name: 'string',
      verified: 'boolean',
    },
  },
  email_verify: {
    required: ['valid', 'status'],
    fields: { valid: 'boolean', status: 'string', score: 'integer' },
  },
  phone_find: {
    required: ['phone'],
    fields: { phone: 'string', line_type: 'string', country_code: 'string' },
  },
  company_enrich: {
    required: ['name'],
    fields: {
      name: 'string',
      domain: 'string',
      website: 'string',
      description: 'string',
      industry: 'string',
      employees: 'string',
      location: 'string',
      linkedin_url: 'string',
      founded: 'integer',
    },
  },
});
const label = (value) =>
  typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,159}$/.test(value);
const actorAllowed = (value) =>
  typeof value?.id === 'string' &&
  value.id.trim().length > 0 &&
  value.id.length <= 512 &&
  Array.isArray(value.allowedSourceIds);
const hash = (value) => createHash('sha256').update(value).digest('hex');
const handle = (value) => /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,199}$/.test(value);
function domain(value) {
  const parts = value.split('.');
  return (
    parts.length >= 2 &&
    parts.every((part) => /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/.test(part)) &&
    /[a-zA-Z]/.test(parts.at(-1))
  );
}
function website(value) {
  try {
    const url = new URL(value);
    return (
      /^https:\/\//i.test(value) &&
      !/[\s\\]/.test(value) &&
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      !url.port &&
      domain(url.hostname)
    );
  } catch {
    return false;
  }
}
function linkedin(value, company) {
  try {
    const url = new URL(value),
      prefix = company ? '/company/' : '/in/';
    const slug = url.pathname.startsWith(prefix)
      ? url.pathname.slice(prefix.length).replace(/\/$/, '')
      : '';
    return (
      /^https:\/\//i.test(value) &&
      !/[\s\\]/.test(value) &&
      url.protocol === 'https:' &&
      ['linkedin.com', 'www.linkedin.com'].includes(url.hostname) &&
      !url.username &&
      !url.password &&
      !url.port &&
      !url.search &&
      !url.hash &&
      handle(slug)
    );
  } catch {
    return false;
  }
}
export function validTregLookupInput(operation, input) {
  if (
    typeof operation !== 'string' ||
    !Object.hasOwn(inputs, operation) ||
    !plainObject(input) ||
    !Object.keys(input).length
  )
    return false;
  if (
    !Object.entries(input).every(
      ([key, value]) =>
        inputs[operation].includes(key) &&
        typeof value === 'string' &&
        value === value.trim() &&
        value.length > 0 &&
        value.length <= limits[key] &&
        // eslint-disable-next-line no-control-regex -- Reject untrusted ASCII control characters.
        !/[\u0000-\u001f\u007f]/.test(value) &&
        (key !== 'email' || validTregEnrichmentEmail(value)) &&
        (key !== 'domain' || domain(value)) &&
        (key !== 'website' || website(value)) &&
        (key !== 'linkedin_url' || linkedin(value, operation === 'company_enrich')) &&
        (key !== 'linkedin_handle' || handle(value)),
    )
  )
    return false;
  if (operation === 'email_verify') return Object.hasOwn(input, 'email');
  if (operation === 'company_enrich') return brandDevRequest(input) !== null;
  return Boolean(
    input.linkedin_url ||
    (operation === 'email_find' && input.linkedin_handle) ||
    (operation === 'phone_find' && input.email) ||
    (input.domain && (input.full_name || (input.first_name && input.last_name))),
  );
}
function projectOutput(operation, output) {
  const contract = outputs[operation];
  if (!plainObject(output) || contract.required.some((key) => !Object.hasOwn(output, key)))
    return null;
  const projected = {};
  for (const [key, type] of Object.entries(contract.fields)) {
    if (!Object.hasOwn(output, key)) continue;
    let value = output[key];
    if (
      operation === 'company_enrich' &&
      key === 'employees' &&
      Number.isSafeInteger(value) &&
      value >= 0
    )
      value = String(value);
    if (
      value !== null &&
      !(type === 'string'
        ? typeof value === 'string' && value.length <= responseLimit
        : type === 'boolean'
          ? typeof value === 'boolean'
          : type === 'integer'
            ? Number.isSafeInteger(value)
            : typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1)
    )
      return null;
    projected[key] = value;
  }
  const primary =
    operation === 'email_find'
      ? 'email'
      : operation === 'phone_find'
        ? 'phone'
        : operation === 'company_enrich'
          ? 'name'
          : 'status';
  if (projected[primary] !== null && !projected[primary].trim()) return null;
  return projected;
}
function usageOf(response, body, service, allowFallback = false) {
  const headerProvider = response.headers.get('X-Treg-Served-By'),
    bodyProvider = body?._treg?.served_by;
  if (
    (headerProvider !== null && !label(headerProvider)) ||
    (bodyProvider !== undefined && bodyProvider !== null && !label(bodyProvider)) ||
    (headerProvider && bodyProvider && headerProvider !== bodyProvider)
  )
    return null;
  const callId = response.headers.get('X-Treg-Call-Id'),
    rawCost = response.headers.get('X-Treg-Cost-Micro');
  if (
    (callId !== null && !label(callId)) ||
    (rawCost !== null &&
      (!/^(0|[1-9][0-9]{0,15})$/.test(rawCost) || !Number.isSafeInteger(Number(rawCost))))
  )
    return null;
  const provider = service.startsWith('branddev.')
    ? service
    : headerProvider || bodyProvider || (allowFallback ? service : null);
  return provider
    ? { callId, provider, costMicro: rawCost === null ? null : Number(rawCost) }
    : null;
}

// One fixed upstream request, private full-call logging, no fallback or polling.
// These operations do not read or write Contacts, cache rows or other services.
export function createTregLookupClient({
  env = process.env,
  config = readTregPeopleConfig(env),
  fetchImpl = globalThis.fetch,
  callLogger = createTregCallLogger({ env, secretValues: [config.token] }),
} = {}) {
  const configured = config.configured === true && typeof fetchImpl === 'function';
  return Object.freeze({
    configured,
    async lookup({ operation, input, requestId, principal, signal } = {}) {
      if (!actorAllowed(principal)) return { status: 'forbidden' };
      if (!validTregLookupInput(operation, input) || !validUuid(requestId))
        return { status: 'invalid_request' };
      if (!configured) return { status: 'not_configured' };
      if (signal?.aborted) return { status: 'aborted' };
      const contract = TREG_LOOKUP_CONTRACTS[operation],
        actor = principal.id;
      const request =
        operation === 'company_enrich'
          ? brandDevRequest(input)
          : {
              service: contract.service,
              endpoint: contract.endpoint,
              method: 'POST',
              body: Object.fromEntries(Object.entries(input)),
            };
      const { service, endpoint, method, body } = request;
      const safeHeaders = {
        'Content-Type': 'application/json',
        'X-Treg-Meta': `customer=${hash(actor).slice(0, 32)}, workspace=flockatnyu, feature=dormant-${operation.replaceAll('_', '-')}`,
        'X-Treg-Route-Max-Cost': config.maxCostUsd,
        'X-Treg-Route-Waterfall': '0',
        'Idempotency-Key': hash(
          canonicalJson({
            actor,
            operation,
            requestId: requestId.toLowerCase(),
            ...(operation === 'company_enrich'
              ? { method, endpoint, input: request.input }
              : { body }),
          }),
        ),
      };
      let started;
      try {
        started = await callLogger.begin({
          endpoint,
          method,
          headers: safeHeaders,
          body,
          requestId,
          actorHash: hash(actor),
          operation,
        });
      } catch {
        return { status: 'log_unavailable' };
      }
      const session = started?.session;
      if (
        started?.status !== 'ready' ||
        !validUuid(session?.logId) ||
        typeof session?.append !== 'function'
      )
        return { status: 'log_unavailable' };
      async function append(type, data) {
        try {
          return (await session.append(type, data))?.status === 'ready';
        } catch {
          return false;
        }
      }
      async function finish(result) {
        const outcome = (status) => ({
          status,
          operation: 'lookup_only',
          lookupOperation: operation,
          saved: false,
          ...(typeof result.hasResult === 'boolean' && status === 'ready'
            ? { hasResult: result.hasResult }
            : {}),
          ...(result.usage ? { usage: result.usage } : {}),
        });
        if (!(await append('lookup_outcome', outcome(result.status))))
          return { status: 'log_unavailable' };
        // A caller cancellation/deadline may arrive while the completion record
        // is flushed. Record that final outcome before returning any success.
        if (['ready', 'pending'].includes(result.status) && active.aborted) {
          const status = signal?.aborted ? 'aborted' : 'unavailable';
          return (await append('lookup_outcome', outcome(status)))
            ? { status }
            : { status: 'log_unavailable' };
        }
        return result;
      }
      if (signal?.aborted) return finish({ status: 'aborted' });
      const active = AbortSignal.any(
        [signal, AbortSignal.timeout(SOURCE_TOOL_TIMEOUT_MS)].filter(Boolean),
      );
      const began = Date.now();
      const captured = [];
      let response,
        bytesObserved = 0,
        bytesCaptured = 0,
        truncated = false,
        readError = null;
      try {
        response = await fetchImpl(endpoint, {
          method,
          redirect: 'error',
          signal: active,
          headers: {
            ...safeHeaders,
            'X-Treg-Token': config.token,
            ...(config.org ? { 'X-Treg-Org': config.org } : {}),
          },
          ...(method === 'POST' ? { body: JSON.stringify(body) } : {}),
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
      if (!readError && active.aborted) readError = signal?.aborted ? 'aborted' : 'timeout';
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
      if (!logged) return finish({ status: 'log_unavailable' });
      if (readError || active.aborted)
        return finish({ status: signal?.aborted ? 'aborted' : 'unavailable' });
      if (truncated) return finish({ status: 'response_too_large' });
      if (!response?.ok)
        return finish({
          status:
            response?.status === 429
              ? 'rate_limited'
              : response?.status === 402
                ? 'budget_exceeded'
                : 'unavailable',
        });
      if (
        !parsedOk ||
        !plainObject(parsed) ||
        (parsed._treg !== undefined && !plainObject(parsed._treg))
      )
        return finish({ status: 'invalid_response' });
      if (response.status === 202) {
        const usage = usageOf(response, parsed, service, true);
        return finish(
          parsed._treg?.outcome === 'pending' && usage
            ? { status: 'pending', operation, usage }
            : { status: 'invalid_response' },
        );
      }
      if (parsed._treg?.outcome === 'pending') return finish({ status: 'invalid_response' });
      const output = projectOutput(
        operation,
        operation === 'company_enrich' ? projectBrandDevOutput(parsed) : parsed.output,
      );
      if (!output) return finish({ status: 'invalid_response' });
      const primary =
        operation === 'email_find'
          ? 'email'
          : operation === 'phone_find'
            ? 'phone'
            : operation === 'company_enrich'
              ? 'name'
              : 'status';
      const hasResult = output[primary] !== null,
        usage = usageOf(response, parsed, service, !hasResult);
      if (!usage) return finish({ status: 'invalid_response' });
      return finish({ status: 'ready', operation, hasResult, output, usage });
    },
  });
}
