import { contactFields } from './contact-fields.js';
import { createHash } from 'node:crypto';
import { canonicalJson, plainObject, validUuid } from './automation/validation.js';
import { CONTACT_FIELDS, validContact } from './contacts.js';
import { SOURCE_TOOL_TIMEOUT_MS } from './source-timeout.js';
import { createTregCallLogger } from './treg-call-log.js';

const provider = 'exa.people.search';
const endpoint = `https://treg.to/call/${provider}`;
const responseLimit = 512_000, personLimit = 32_000;
const queryStrings = { q: 1000, company_domain: 253, title: 200, full_name: 400, country: 100, location: 300 };
const label = value => typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,159}$/.test(value);
const actorAllowed = actor => typeof actor?.id === 'string' && actor.id.trim().length > 0 && actor.id.length <= 512 && Array.isArray(actor.allowedSourceIds);
const hash = value => createHash('sha256').update(value).digest('hex');
const clean = (value, max) => typeof value === 'string' && value.length <= max && !/[\u0000-\u001f\u007f]/.test(value) ? value.trim() : '';
const emailOf = value => {
  const email = clean(value, CONTACT_FIELDS.email);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '';
};
const linkedinOf = value => {
  try {
    const url = new URL(value);
    if (url.protocol === 'https:' && ['linkedin.com', 'www.linkedin.com'].includes(url.hostname) && !url.username && !url.password
      && /^\/in\/[a-zA-Z0-9_%.-]+\/?$/.test(url.pathname)) return `https://www.linkedin.com${url.pathname.replace(/\/$/, '').toLowerCase()}`;
  } catch {}
  return '';
};

export function readTregPeopleConfig(env = process.env) {
  const token = typeof env.TREG_TOKEN === 'string' ? env.TREG_TOKEN.trim() : '';
  const org = typeof env.TREG_ORG === 'string' ? env.TREG_ORG.trim() : '';
  const cost = env.TREG_MAX_COST_USD === undefined || env.TREG_MAX_COST_USD === '' ? '0.10' : env.TREG_MAX_COST_USD;
  const validCost = typeof cost === 'string' && /^(?:0(?:\.[0-9]{1,6})?|1(?:\.0{1,6})?)$/.test(cost) && Number(cost) > 0 && Number(cost) <= 1;
  const configured = token.length > 0 && token.length <= 4096 && !/[\s\u0000-\u001f\u007f]/.test(token)
    && (!org || label(org)) && validCost;
  return Object.freeze({ configured, token, org, maxCostUsd: validCost ? cost : null });
}

export function validTregPeopleQuery(query) {
  return plainObject(query) && Object.keys(query).every(key => Object.hasOwn(queryStrings, key) || ['limit', 'keywords'].includes(key))
    && Object.entries(queryStrings).every(([key, max]) => query[key] === undefined || typeof query[key] === 'string'
      && query[key].trim().length > 0 && query[key].length <= max && !/[\u0000-\u001f\u007f]/.test(query[key]))
    && ['q', 'company_domain', 'title', 'full_name'].some(key => typeof query[key] === 'string' && query[key].trim())
    && (query.limit === undefined || Number.isSafeInteger(query.limit) && query.limit >= 1 && query.limit <= 10)
    && (query.keywords === undefined || Array.isArray(query.keywords) && query.keywords.length >= 1 && query.keywords.length <= 10
      && query.keywords.every(value => typeof value === 'string' && value.trim() && value.length <= 100 && !/[\u0000-\u001f\u007f]/.test(value)));
}

function exaSearchBody(query) {
  const criteria = Object.entries({ q: 'Search text', full_name: 'Full name', company_domain: 'Company domain', title: 'Job title',
    country: 'Country', location: 'Location' }).filter(([key]) => query[key] !== undefined)
    .map(([key, name]) => `${name}: ${query[key].trim()}`);
  if (query.keywords !== undefined) criteria.push(`Keywords: ${query.keywords.map(value => value.trim()).join(', ')}`);
  return { query: `Find people matching these supplied criteria:\n${criteria.join('\n')}`, category: 'people', numResults: query.limit ?? 5 };
}

function usageOf(response, body) {
  const headerProvider = response.headers.get('X-Treg-Served-By');
  const bodyProvider = body?._treg?.served_by;
  if (headerProvider && !label(headerProvider) || bodyProvider !== undefined && !label(bodyProvider)
    || headerProvider && bodyProvider && headerProvider !== bodyProvider) return null;
  const rawCost = response.headers.get('X-Treg-Cost-Micro');
  const rawCall = response.headers.get('X-Treg-Call-Id');
  if (rawCost !== null && (!/^(0|[1-9][0-9]{0,15})$/.test(rawCost) || !Number.isSafeInteger(Number(rawCost)))
    || rawCall !== null && !label(rawCall)) return null;
  return { callId: rawCall, costMicro: rawCost === null ? null : Number(rawCost), provider };
}

// This adapter calls Treg only. Saving contacts is an explicit importer operation
// below; saved contact reads and the existing chat tools never call Treg.
export function createTregPeopleClient({ env = process.env, config = readTregPeopleConfig(env), fetchImpl = globalThis.fetch,
  callLogger = createTregCallLogger({ env, secretValues: [config.token] }) } = {}) {
  const configured = config.configured === true && typeof fetchImpl === 'function';
  return Object.freeze({ configured,
    async search({ query, requestId, principal, signal } = {}) {
      if (!actorAllowed(principal)) return { status: 'forbidden' };
      if (!validTregPeopleQuery(query) || !validUuid(requestId)) return { status: 'invalid_request' };
      if (!configured) return { status: 'not_configured' };
      if (signal?.aborted) return { status: 'aborted' };
      const body = exaSearchBody(query);
      const idempotency = hash(canonicalJson({ actor: principal.id, requestId: requestId.toLowerCase(), endpoint, body }));
      const safeHeaders = { 'Content-Type': 'application/json',
        'X-Treg-Meta': `customer=${hash(principal.id).slice(0, 32)}, workspace=flockatnyu, feature=contacts`,
        'X-Treg-Route-Max-Cost': config.maxCostUsd, 'X-Treg-Route-Waterfall': '0', 'Idempotency-Key': idempotency };
      let started;
      try { started = await callLogger.begin({ endpoint, method: 'POST', headers: safeHeaders, body,
        requestId, actorHash: hash(principal.id) }); } catch { return { status: 'log_unavailable' }; }
      const callLog = started?.session;
      if (started?.status !== 'ready' || !validUuid(callLog?.logId) || typeof callLog?.append !== 'function') return { status: 'log_unavailable' };
      const append = async (type, data) => { try { return (await callLog.append(type, data))?.status === 'ready'; } catch { return false; } };
      async function failed(status) {
        const result = { status };
        const logged = await append('lookup_outcome', result);
        return { ...result, callLog, ...(!logged ? { logging: { status: 'log_unavailable', logId: callLog.logId } } : {}) };
      }
      const active = AbortSignal.any([signal, AbortSignal.timeout(SOURCE_TOOL_TIMEOUT_MS)].filter(Boolean));
      const began = Date.now();
      let response, captured = [], bytesObserved = 0, bytesCaptured = 0, truncated = false, readError = null;
      try {
        response = await fetchImpl(endpoint, { method: 'POST', redirect: 'error', signal: active,
          headers: { ...safeHeaders, 'X-Treg-Token': config.token, ...(config.org ? { 'X-Treg-Org': config.org } : {}) },
          body: JSON.stringify(body) });
        if (response.body) {
          const reader = response.body.getReader();
          try {
            while (true) {
              const { value, done } = await reader.read();
              if (done) break;
              bytesObserved += value.byteLength;
              const allowed = Math.min(value.byteLength, responseLimit - bytesCaptured);
              if (allowed) { captured.push(Buffer.from(value.subarray(0, allowed))); bytesCaptured += allowed; }
              if (bytesObserved > responseLimit) { truncated = true; await reader.cancel(); break; }
            }
          } catch { readError = signal?.aborted ? 'aborted' : active.aborted ? 'timeout' : 'response_read_failed'; }
          finally { reader.releaseLock(); }
        }
      } catch { readError = signal?.aborted ? 'aborted' : active.aborted ? 'timeout' : 'transport_error'; }
      const text = Buffer.concat(captured).toString('utf8');
      let parsed, parsedOk = false;
      if (!truncated && !readError) { try { parsed = JSON.parse(text); parsedOk = true; } catch {} }
      const headers = {};
      for (const name of ['content-type', 'x-treg-call-id', 'x-treg-cost-micro', 'x-treg-original-cost-micro', 'x-treg-served-by', 'x-treg-error']) {
        const value = response?.headers?.get(name);
        if (value !== null && value !== undefined) headers[name] = value.slice(0, 4096);
      }
      const logged = await append('response', { httpStatus: response?.status ?? null, headers, durationMs: Math.max(0, Date.now() - began),
        bytesObserved, bytesCaptured, truncated, complete: !truncated && !readError, ...(readError ? { error: readError } : {}),
        ...(parsedOk ? { body: parsed } : { rawText: text }) });
      if (!logged) return failed('log_unavailable');
      if (readError) return failed(signal?.aborted ? 'aborted' : 'unavailable');
      if (truncated) return failed('response_too_large');
      if (!response?.ok) return failed(response?.status === 429 ? 'rate_limited' : response?.status === 402 ? 'budget_exceeded' : 'unavailable');
      if (!parsedOk || !plainObject(parsed) || !Array.isArray(parsed.results)
        || parsed.results.length > body.numResults || parsed.results.some(person => !plainObject(person)
          || Buffer.byteLength(JSON.stringify(person)) > personLimit)) return failed('invalid_response');
      // Direct Exa responses need no routed serving-child envelope. The fixed
      // endpoint establishes the provider; missing observed cost stays unknown.
      const usage = usageOf(response, parsed);
      if (!usage) return failed('invalid_response');
      return { status: 'ready', people: parsed.results, usage, callLog };
    },
  });
}

function normalizePerson(person, provider) {
  let source = person, workplace = person.workplace, email = person.email, phone = person.phone_number;
  let linkedin = linkedinOf(person.linkedin_url) || linkedinOf(person.linkedin);
  let knownProvider = false;
  if (provider.startsWith('aiark.')) {
    knownProvider = true; source = plainObject(person.profile) ? person.profile : {};
    workplace = person.company?.name; linkedin = linkedinOf(person.link?.linkedin);
  } else if (provider.startsWith('apollo.')) {
    knownProvider = true; workplace = person.organization?.name;
  } else if (provider.startsWith('hunter.')) {
    knownProvider = true; email = person.value;
  } else if (provider.startsWith('exa.')) {
    knownProvider = true;
    const entities = Array.isArray(person.entities) ? person.entities.filter(entity => entity?.type === 'person' && plainObject(entity.properties)) : [];
    if (entities.length !== 1) return null;
    const properties = entities[0].properties;
    source = { first_name: properties.firstName, last_name: properties.lastName };
    const current = Array.isArray(properties.workHistory) ? properties.workHistory.filter(job => plainObject(job)
      && plainObject(job.dates) && job.dates.to === null && plainObject(job.company)) : [];
    workplace = current.length === 1 ? current[0].company.name : undefined;
    linkedin = linkedinOf(person.url);
  }
  const fields = { first_name: clean(source.first_name, CONTACT_FIELDS.first_name),
    last_name: clean(source.last_name, CONTACT_FIELDS.last_name), email: emailOf(email),
    phone_number: clean(phone, CONTACT_FIELDS.phone_number), workplace: clean(workplace, CONTACT_FIELDS.workplace), notes: '' };
  // Names alone cannot distinguish people. Provider-native ids are acceptable
  // only in formats we recognize; arbitrary unknown objects are not contacts.
  const nativeId = knownProvider && (typeof person.id === 'string' || Number.isSafeInteger(person.id))
    ? clean(String(person.id), 500) : '';
  const identity = fields.email ? `email:${fields.email.toLowerCase()}` : linkedin ? `linkedin:${linkedin}`
    : nativeId ? `provider:${provider.split('.')[0]}:${nativeId}` : '';
  if (!identity || ![fields.first_name, fields.last_name, fields.email, fields.phone_number].some(Boolean)) return null;
  return { contactId: contactIdFor(identity), fields };
}
function contactIdFor(identity) {
  const digest = hash(`flockatnyu:treg-contact:v1:${identity}`).slice(0, 32).split('');
  digest[12] = '8'; digest[16] = (parseInt(digest[16], 16) & 3 | 8).toString(16);
  const hex = digest.join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
// Identity is derived separately; this never rewrites the original person.
export function tregContactIdentity(person, provider, lookupEmail) {
  const known = normalizePerson(person, provider);
  const email = lookupEmail || known?.fields.email || emailOf(person?.email) || emailOf(person?.person?.email);
  return { contactId: email ? contactIdFor(`email:${email.toLowerCase()}`)
    : known?.contactId || contactIdFor(`raw:${provider}:${canonicalJson(person)}`),
    email, ...(lookupEmail ? { lookupEmail } : {}) };
}
const project = contact => ({ id: contact.id, created_at: contact.created_at, updated_at: contact.updated_at,
  fields: contactFields(contact) });

// User-requested import workflow: one Treg search, then insert-only contact
// writes. It is not exposed as a compound agent tool or called by plain reads.
export function createTregContactsImporter({ client, contactsStore } = {}) {
  const configured = client?.configured === true && typeof client.search === 'function' && contactsStore?.configured === true && typeof contactsStore.importContact === 'function';
  return Object.freeze({ configured,
    async importPeople({ query, requestId, principal, signal } = {}) {
      if (!actorAllowed(principal)) return { status: 'forbidden' };
      if (!validTregPeopleQuery(query) || !validUuid(requestId)) return { status: 'invalid_request' };
      if (!configured) return { status: 'not_configured' };
      let found;
      try { found = await client.search({ query, requestId, principal, signal }); }
      catch { return { status: 'unavailable' }; }
      const attempts = [];
      async function finish(result) {
        if (!found?.callLog) return result;
        let logged = false;
        try { logged = (await found.callLog.append('import_outcome', { ...result, attempts }))?.status === 'ready'; } catch {}
        return { ...result, logging: { status: logged && found.logging?.status !== 'log_unavailable' && found.status !== 'log_unavailable' ? 'ready' : 'log_unavailable', logId: found.callLog.logId } };
      }
      if (found?.status !== 'ready') return finish({ status: ['forbidden', 'invalid_request', 'not_configured', 'aborted', 'rate_limited', 'budget_exceeded', 'response_too_large', 'invalid_response', 'log_unavailable'].includes(found?.status) ? found.status : 'unavailable' });
      if (!Array.isArray(found.people) || found.people.length > (query.limit ?? 5) || !plainObject(found.usage)
        || !label(found.usage.provider) || !(found.usage.callId === null || label(found.usage.callId))
        || !(found.usage.costMicro === null || Number.isSafeInteger(found.usage.costMicro) && found.usage.costMicro >= 0) || found.people.some(person => !plainObject(person) || Buffer.byteLength(JSON.stringify(person)) > personLimit)) return finish({ status: 'invalid_response' });
      let planned;
      try { planned = found.people.map(person => {
        const identity = tregContactIdentity(person, found.usage.provider);
        return { person, normalized: { contactId: identity.contactId, fields: { email: identity.email } } };
      }); }
      catch { return finish({ status: 'invalid_response' }); }
      const result = { status: 'ready', imported: 0, existing: 0, skipped: 0, contacts: [], usage: found.usage };
      const seen = new Set();
      for (const [inputIndex, { person, normalized }] of planned.entries()) {
        if (!normalized || seen.has(normalized.contactId)) {
          attempts.push({ inputIndex, requestedContactId: normalized?.contactId ?? null, status: 'skipped', reason: 'duplicate_input' });
          result.skipped++; continue;
        }
        seen.add(normalized.contactId);
        if (signal?.aborted) {
          attempts.push({ inputIndex, requestedContactId: normalized.contactId, status: 'not_attempted', reason: 'aborted' });
          return finish({ ...result, status: 'partial', reason: 'aborted' });
        }
        const attempt = { inputIndex, requestedContactId: normalized.contactId, status: 'attempted' };
        attempts.push(attempt);
        let saved;
        try { saved = await contactsStore.importContact({ contactId: normalized.contactId,
          rawInput: structuredClone(person), email: normalized.fields.email, signal }); }
        catch { saved = { status: 'unavailable', reason: 'write_outcome_unknown' }; }
        if (saved?.status !== 'ready' || !validContact(saved.contact) || !['imported', 'existing'].includes(saved.operation)
          || saved.operation === 'imported' && saved.contact.id.toLowerCase() !== normalized.contactId.toLowerCase()) {
          const reason = saved?.reason === 'write_outcome_unknown' || saved?.status === 'ready' ? 'write_outcome_unknown'
            : ['aborted', 'not_configured', 'conflict', 'forbidden', 'rate_limited'].includes(saved?.status) ? saved.status : 'storage_unavailable';
          Object.assign(attempt, { status: 'failed', reason, uncertain: reason === 'write_outcome_unknown' });
          return finish({ ...result, status: 'partial', reason });
        }
        Object.assign(attempt, { status: 'confirmed', operation: saved.operation, confirmedContactId: saved.contact.id });
        result[saved.operation]++; result.contacts.push(project(saved.contact));
      }
      return finish(result);
    },
  });
}
