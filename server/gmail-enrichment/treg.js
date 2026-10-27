import { createHash } from 'node:crypto';
import { canonicalJson, plainObject, validUuid } from '../automation/validation.js';
import { createTregCallLogger } from "../treg/call-log.js";
import { SOURCE_TOOL_TIMEOUT_MS } from "../shared/source-timeout.js";

const providers = Object.freeze(['tomba.people.enrich', 'apollo.people.enrich']);
const responseLimit = 512_000;
const hash = value => createHash('sha256').update(value).digest('hex');
const label = value => typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,159}$/.test(value);
const authorized = principal => typeof principal?.id === 'string' && principal.id.trim().length > 0
  && principal.id.length <= 512 && Array.isArray(principal.allowedSourceIds);
const string = value => typeof value === 'string' && value.trim() ? value : null;
const usd = micro => (micro / 1e6).toFixed(6).replace(/\.?0+$/, '');

// Keep this service's credentials and literal-email checks local so its source
// package does not depend on the website's Contacts/search implementation.
export function readDailyTregConfig(env = process.env) {
  const token = typeof env.TREG_TOKEN === 'string' ? env.TREG_TOKEN.trim() : '';
  const org = typeof env.TREG_ORG === 'string' ? env.TREG_ORG.trim() : '';
  const cost = env.TREG_MAX_COST_USD === undefined || env.TREG_MAX_COST_USD === '' ? '0.10' : env.TREG_MAX_COST_USD;
  const validCost = typeof cost === 'string' && /^(?:0(?:\.[0-9]{1,6})?|1(?:\.0{1,6})?)$/.test(cost)
    && Number(cost) > 0 && Number(cost) <= 1;
  const configured = token.length > 0 && token.length <= 4096 && !/[\s\u0000-\u001f\u007f]/.test(token)
    && (!org || label(org)) && validCost;
  return Object.freeze({ configured, token, org, maxCostUsd: validCost ? cost : null });
}

export function validDailyTregEmail(email) {
  if (typeof email !== 'string' || email.length > 320 || email !== email.trim()) return false;
  const parts = email.split('@');
  return parts.length === 2 && parts[0].length >= 1 && parts[0].length <= 64
    && /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(parts[0]) && !parts[0].startsWith('.') && !parts[0].endsWith('.') && !parts[0].includes('..')
    && parts[1].length <= 253 && parts[1].includes('.')
    && parts[1].split('.').every(part => /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/.test(part));
}

// This policy belongs only to the separate daily worker. The website continues
// to use its existing routed client and never imports this module.
export function readDailyTregEnrichmentPolicy(env = process.env) {
  const value = env.GMAIL_ENRICHMENT_MAX_PROVIDERS;
  const maxProviders = value === undefined || value === '' ? 2 : value === '1' ? 1 : value === '2' ? 2 : null;
  return Object.freeze({ configured: maxProviders !== null, maxProviders, primary: providers[0],
    providers: Object.freeze(providers.slice(0, maxProviders ?? 0)) });
}

function profile(provider, body) {
  if (!plainObject(body)) return null;
  if (provider === 'tomba.people.enrich') {
    if (!Object.hasOwn(body, 'data') || !(body.data === null || plainObject(body.data))) return null;
    const person = body.data;
    if (person?.full_name !== undefined && person?.full_name !== null && typeof person.full_name !== 'string') return null;
    const fullName = string(person?.full_name);
    return { matched: fullName !== null, output: { full_name: fullName,
      ...(fullName && string(person.first_name) ? { first_name: person.first_name } : {}),
      ...(fullName && string(person.last_name) ? { last_name: person.last_name } : {}) } };
  }
  if (provider === 'apollo.people.enrich') {
    if (!Object.hasOwn(body, 'person') || !(body.person === null || plainObject(body.person))) return null;
    const person = body.person;
    if (!person) return { matched: false, output: { full_name: null } };
    // Apollo can echo a stub name for a miss. Its documented match predicate
    // uses confidence/email, rather than treating that echoed name as evidence.
    const confidence = person.match_confidence;
    if (confidence !== undefined && confidence !== null && typeof confidence !== 'string'
      || person.email !== undefined && person.email !== null && typeof person.email !== 'string') return null;
    const matched = confidence !== undefined && confidence !== null && confidence !== 'none'
      || person.email !== undefined && person.email !== null;
    return { matched, output: { full_name: matched ? string(person.name) : null,
      ...(matched && string(person.first_name) ? { first_name: person.first_name } : {}),
      ...(matched && string(person.last_name) ? { last_name: person.last_name } : {}) } };
  }
  return null;
}

function receipt(response, provider, free) {
  const cost = response.headers.get('X-Treg-Cost-Micro'), callId = response.headers.get('X-Treg-Call-Id');
  const original = response.headers.get('X-Treg-Original-Cost-Micro');
  const servedBy = response.headers.get('X-Treg-Served-By');
  if (cost !== null && (!/^(0|[1-9][0-9]{0,15})$/.test(cost) || !Number.isSafeInteger(Number(cost)))
    || original !== null && (!/^(0|[1-9][0-9]{0,15})$/.test(original) || !Number.isSafeInteger(Number(original)) || cost !== '0')
    || callId !== null && !label(callId) || servedBy !== null && !label(servedBy)) return null;
  // Only the documented before-charge provider-paused response permits an
  // absent receipt to mean zero. Generic HTTP errors are never assumed free.
  const chargedCostMicro = cost === null ? free ? 0 : null : Number(cost);
  // The same leased job may replay an earlier provider after a crash. Its
  // original charge still consumes this email's allowance even when the replay
  // itself is free, and must be settled once in the existing request ledger.
  const costMicro = original === null ? chargedCostMicro : Number(original);
  if (free && costMicro !== 0) return null;
  return { provider, callId, costMicro, chargedCostMicro,
    ...(original !== null ? { originalCostMicro: Number(original) } : {}) };
}

export function createDailyTregEnrichmentClient({ env = process.env, config = readDailyTregConfig(env),
  fetchImpl = globalThis.fetch, callLogger = createTregCallLogger({ env, secretValues: [config.token] }) } = {}) {
  const policy = readDailyTregEnrichmentPolicy(env);
  const maxCostMicro = Math.round(Number(config.maxCostUsd) * 1e6);
  const configured = config.configured === true && policy.configured && typeof fetchImpl === 'function'
    && Number.isSafeInteger(maxCostMicro) && maxCostMicro > 0 && maxCostMicro <= 1e6;
  return Object.freeze({ configured, policy,
    async enrich({ email, requestId, principal, signal } = {}) {
      if (!authorized(principal)) return { status: 'forbidden' };
      if (!validDailyTregEmail(email) || !validUuid(requestId)) return { status: 'invalid_request' };
      if (!configured) return { status: 'not_configured' };
      if (signal?.aborted) return { status: 'aborted' };
      email = email.toLowerCase();
      const active = AbortSignal.any([signal, AbortSignal.timeout(SOURCE_TOOL_TIMEOUT_MS)].filter(Boolean));
      const sessions = [], tried = [];
      let loggingFailed = false, totalCostMicro = 0;
      async function append(session, type, data) {
        try { if ((await session.append(type, data))?.status === 'ready') return true; } catch {}
        loggingFailed = true; return false;
      }
      async function finishLog(outcome) {
        let complete = true;
        for (const session of sessions) complete = await append(session, 'import_outcome', outcome) && complete;
        return { status: complete && !loggingFailed ? 'ready' : 'log_unavailable', logId: sessions[0]?.logId };
      }
      async function failed(status) {
        for (const session of sessions) await append(session, 'lookup_outcome', { status, providerAttempts: tried.length });
        return { status, finishLog, ...(sessions[0] ? { callLog: sessions[0] } : {}),
          ...(loggingFailed ? { logging: { status: 'log_unavailable', logId: sessions[0]?.logId } } : {}) };
      }
      async function ready(nativeBody, adapted, usage, budgetExceeded = false) {
        // Tomba's data object is the complete returned person. Keep all its
        // native values unchanged; the full outer response stays in the log.
        const raw = usage.provider === 'tomba.people.enrich' ? nativeBody.data : nativeBody;
        const enrichment = { output: adapted.output, raw,
          _treg: { served_by: usage.provider, tried: structuredClone(tried) } };
        for (const session of sessions) {
          if (!await append(session, 'lookup_outcome', { status: 'ready', matched: adapted.matched,
            providerAttempts: tried.length, ...(budgetExceeded ? { budgetExceeded: true } : {}) })) return failed('log_unavailable');
        }
        return { status: 'ready', matched: adapted.matched, enrichment,
          usage: { provider: usage.provider, callId: usage.callId, costMicro: totalCostMicro }, finishLog, callLog: sessions[0],
          ...(budgetExceeded ? { budgetExceeded: true } : {}) };
      }

      for (let index = 0; index < policy.providers.length; index++) {
        if (active.aborted) return failed(signal?.aborted ? 'aborted' : 'unavailable');
        const remaining = maxCostMicro - totalCostMicro;
        if (remaining <= 0) return failed('budget_exceeded');
        const provider = policy.providers[index], endpoint = new URL(`https://treg.to/call/${provider}`);
        const method = provider === 'tomba.people.enrich' ? 'GET' : 'POST', body = null;
        endpoint.searchParams.set('email', email);
        const safeHeaders = {
          'X-Treg-Meta': `customer=${hash(principal.id).slice(0, 32)}, workspace=flockatnyu, feature=gmail-contact-enrichment`,
          'X-Treg-Route-Max-Cost': usd(remaining), 'X-Treg-Route-Waterfall': '0',
          'Idempotency-Key': hash(canonicalJson({ actor: principal.id, requestId: requestId.toLowerCase(), email,
            policy: policy.providers, maxCostMicro, provider, attempt: index + 1, endpoint: endpoint.href, body })) };
        let started;
        try { started = await callLogger.begin({ endpoint: endpoint.href, method, headers: safeHeaders, body,
          requestId, actorHash: hash(principal.id), provider, attempt: index + 1, maxProviders: policy.maxProviders }); }
        catch { loggingFailed = true; return failed('log_unavailable'); }
        if (started?.status !== 'ready' || !validUuid(started.session?.logId) || typeof started.session?.append !== 'function') {
          loggingFailed = true; return failed('log_unavailable');
        }
        const session = started.session; sessions.push(session);
        if (active.aborted) return failed(signal?.aborted ? 'aborted' : 'unavailable');
        const began = Date.now();
        let response, captured = [], bytesObserved = 0, bytesCaptured = 0, truncated = false, readError = null;
        try {
          response = await fetchImpl(endpoint.href, { method, redirect: 'error', signal: active,
            headers: { ...safeHeaders, 'X-Treg-Token': config.token, ...(config.org ? { 'X-Treg-Org': config.org } : {}) } });
          if (response.body) {
            const reader = response.body.getReader();
            try {
              while (true) {
                const { value, done } = await reader.read(); if (done) break;
                bytesObserved += value.byteLength;
                const allowed = Math.min(value.byteLength, responseLimit - bytesCaptured);
                if (allowed) { captured.push(Buffer.from(value.subarray(0, allowed))); bytesCaptured += allowed; }
                if (bytesObserved > responseLimit) { truncated = true; await reader.cancel(); break; }
              }
            } catch { readError = active.aborted ? 'timeout_or_abort' : 'response_read_failed'; }
            finally { reader.releaseLock(); }
          }
        } catch { readError = active.aborted ? 'timeout_or_abort' : 'transport_error'; }
        const text = Buffer.concat(captured).toString('utf8');
        let nativeBody, parsed = false;
        if (!truncated && !readError) { try { nativeBody = JSON.parse(text); parsed = true; } catch {} }
        const headers = {};
        for (const name of ['content-type', 'x-treg-call-id', 'x-treg-cost-micro', 'x-treg-original-cost-micro', 'x-treg-served-by', 'x-treg-error']) {
          const value = response?.headers?.get(name); if (value !== null && value !== undefined) headers[name] = value.slice(0, 4096);
        }
        if (!await append(session, 'response', { httpStatus: response?.status ?? null, headers,
          durationMs: Math.max(0, Date.now() - began), bytesObserved, bytesCaptured, truncated, complete: !truncated && !readError,
          ...(readError ? { error: readError } : {}), ...(parsed ? { body: nativeBody } : { rawText: text }) })) return failed('log_unavailable');
        if (readError) return failed(signal?.aborted ? 'aborted' : 'unavailable');
        if (truncated) return failed('response_too_large');
        if (!parsed || !plainObject(nativeBody)) return failed('invalid_response');
        const paused = response.status === 503 && plainObject(nativeBody.detail) && nativeBody.detail.error === 'provider_paused';
        const usage = receipt(response, provider, paused);
        if (!usage) return failed('invalid_response');
        totalCostMicro = usage.costMicro === null ? null : totalCostMicro + usage.costMicro;
        const adapted = response.ok ? profile(provider, nativeBody) : null;
        tried.push({ provider, call_id: usage.callId, cost_micro: usage.costMicro, charged_cost_micro: usage.chargedCostMicro,
          ...(usage.originalCostMicro !== undefined ? { original_cost_micro: usage.originalCostMicro } : {}), http_status: response.status,
          ...(adapted ? { matched: adapted.matched } : {}), ...(paused ? { paused: true } : {}) });
        const last = index + 1 === policy.providers.length;
        if (response.status === 401 || response.status === 403) return failed('forbidden');
        if (response.status === 402) return failed('budget_exceeded');
        if (response.status === 429) return failed('rate_limited');
        if (adapted) {
          if (adapted.matched || last || totalCostMicro === null || totalCostMicro >= maxCostMicro) {
            return ready(nativeBody, adapted, usage, totalCostMicro !== null && totalCostMicro > maxCostMicro);
          }
          continue;
        }
        if (totalCostMicro === null) return failed('unavailable');
        if (totalCostMicro > maxCostMicro) return failed('budget_exceeded');
        if (!last && totalCostMicro < maxCostMicro && (paused || response.status >= 500 && response.status <= 599)) continue;
        return failed(response.ok ? 'invalid_response' : 'unavailable');
      }
      return failed('unavailable');
    },
  });
}
