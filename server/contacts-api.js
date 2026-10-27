import { contactFields } from './contact-fields.js';
import { validContact, validContactFields } from './contacts.js';
import { plainObject, validUuid } from './automation/validation.js';
import { CONTACT_SEARCH_PROPERTIES, validContactsSearchOptions } from './contacts-search.js';

const statuses = Object.freeze({ forbidden: 403, invalid_request: 400, not_found: 404, conflict: 409,
  not_configured: 503, schema_not_ready: 503, unavailable: 503, aborted: 503, rate_limited: 503,
  invalid_response: 503, response_too_large: 503 });
const authorized = principal => typeof principal?.id === 'string' && Boolean(principal.id.trim()) && Array.isArray(principal.allowedSourceIds);
const validVersion = value => typeof value === 'string' && value.length > 0 && value.length <= 50 && Number.isFinite(Date.parse(value));
const sameContact = (contact, id) => validContact(contact) && (!id || contact.id.toLowerCase() === id.toLowerCase());
const project = contact => ({ id: contact.id, created_at: contact.created_at, updated_at: contact.updated_at,
  fields: contactFields(contact) });
const receipt = (operation, contact) => ({ operation, id: contact.id, updated_at: contact.updated_at });
const exactKeys = (value, keys) => plainObject(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));

// Browser operations use saved contacts only. Authentication is deliberately
// independent of Discord discovery and source availability.
export function registerContactsApi({ app, contactsStore, auth, config, readJSON } = {}) {
  const send = (c, body, status = 200) => c.json(body, status);
  const fail = (c, status = 'unavailable', unknown = false) => send(c,
    { status: Object.hasOwn(statuses, status) ? status : 'unavailable', ...(unknown ? { reason: 'write_outcome_unknown' } : {}) },
    statuses[status] || 503);
  const failedResult = (c, result, mutation = false) => fail(c, Object.hasOwn(statuses, result?.status) ? result.status : 'unavailable',
    result?.reason === 'write_outcome_unknown' || mutation && (!Object.hasOwn(statuses, result?.status) || ['invalid_response', 'response_too_large'].includes(result.status)));
  async function admitted(c) {
    c.header('cache-control', 'private, no-store');
    c.header('x-content-type-options', 'nosniff');
    if (c.req.header('sec-fetch-site') === 'cross-site') return false;
    try { return authorized(await auth(c, config)); } catch { return false; }
  }
  async function body(c) {
    return readJSON(c.req.raw, Math.min(config?.timeoutMs || 10000, 10000), 32768);
  }
  app.get('/api/contacts', async c => {
    if (!await admitted(c)) return fail(c, 'forbidden');
    const query = new URL(c.req.url).searchParams;
    if ([...query.keys()].some(key => !Object.hasOwn(CONTACT_SEARCH_PROPERTIES, key) || query.getAll(key).length !== 1)) return fail(c, 'invalid_request');
    const text = query.get('query') ?? '', rawLimit = query.get('limit') ?? '10', rawOffset = query.get('offset') ?? '0';
    if (text.length > 256 || !/^[1-9][0-9]*$/.test(rawLimit) || !/^(0|[1-9][0-9]*)$/.test(rawOffset)) return fail(c, 'invalid_request');
    const limit = Number(rawLimit), offset = Number(rawOffset);
    const options = { query: text, limit, offset, name: query.get('name') ?? '', workplace: query.get('workplace') ?? '',
      emailPresence: query.get('emailPresence') ?? 'any', phonePresence: query.get('phonePresence') ?? 'any', sort: query.get('sort') ?? 'auto' };
    if (!validContactsSearchOptions(options)) return fail(c, 'invalid_request');
    if (!contactsStore?.configured || typeof contactsStore.search !== 'function') return fail(c, 'not_configured');
    try {
      const result = await contactsStore.search({ ...options, signal: c.req.raw.signal });
      if (result?.status !== 'ready') return failedResult(c, result);
      if (!Array.isArray(result.contacts) || result.contacts.length > limit || result.contacts.some(contact => !validContact(contact))
        || typeof result.coverage?.complete !== 'boolean' || !(result.coverage.nextOffset === null || Number.isSafeInteger(result.coverage.nextOffset)
          && result.coverage.nextOffset > offset && result.coverage.nextOffset <= 10000)) return fail(c);
      return send(c, { status: 'ready', contacts: result.contacts.map(project),
        coverage: { complete: result.coverage.complete, nextOffset: result.coverage.nextOffset } });
    } catch { return fail(c); }
  });
  app.get('/api/contacts/:id', async c => {
    if (!await admitted(c)) return fail(c, 'forbidden');
    const contactId = c.req.param('id');
    if (!validUuid(contactId) || new URL(c.req.url).search) return fail(c, 'invalid_request');
    if (!contactsStore?.configured || typeof contactsStore.read !== 'function') return fail(c, 'not_configured');
    try {
      const result = await contactsStore.read({ contactId, signal: c.req.raw.signal });
      if (result?.status !== 'ready') return failedResult(c, result);
      if (!sameContact(result.contact, contactId)) return fail(c);
      return send(c, { status: 'ready', contact: project(result.contact) });
    } catch { return fail(c); }
  });
  app.post('/api/contacts', async c => {
    if (!await admitted(c)) return fail(c, 'forbidden');
    if (new URL(c.req.url).search) return fail(c, 'invalid_request');
    let input;
    try { input = await body(c); } catch { return fail(c, 'invalid_request'); }
    if (!exactKeys(input, ['fields']) || !validContactFields(input.fields, { create: true })) return fail(c, 'invalid_request');
    if (!contactsStore?.configured || typeof contactsStore.create !== 'function') return fail(c, 'not_configured');
    try {
      const result = await contactsStore.create({ fields: input.fields, signal: c.req.raw.signal });
      if (result?.status !== 'ready') return failedResult(c, result, true);
      if (!sameContact(result.contact)) return fail(c, 'unavailable', true);
      return send(c, { status: 'ready', contact: project(result.contact), contactWrite: receipt('created', result.contact) });
    } catch { return fail(c, 'unavailable', true); }
  });
  for (const [method, operation] of [['patch', 'updated'], ['delete', 'deleted']]) {
    app[method]('/api/contacts/:id', async c => {
      if (!await admitted(c)) return fail(c, 'forbidden');
      const contactId = c.req.param('id');
      if (!validUuid(contactId) || new URL(c.req.url).search) return fail(c, 'invalid_request');
      let input;
      try { input = await body(c); } catch { return fail(c, 'invalid_request'); }
      if (!exactKeys(input, method === 'patch' ? ['expectedUpdatedAt', 'fields'] : ['expectedUpdatedAt']) || !validVersion(input.expectedUpdatedAt)
        || method === 'patch' && !validContactFields(input.fields)) return fail(c, 'invalid_request');
      const storeMethod = method === 'patch' ? 'update' : 'delete';
      if (!contactsStore?.configured || typeof contactsStore.read !== 'function' || typeof contactsStore[storeMethod] !== 'function') return fail(c, 'not_configured');
      let dispatched = false;
      try {
        const saved = await contactsStore.read({ contactId, signal: c.req.raw.signal });
        if (saved?.status !== 'ready') return failedResult(c, saved);
        if (!sameContact(saved.contact, contactId)) return fail(c);
        if (saved.contact.updated_at !== input.expectedUpdatedAt) return fail(c, 'conflict');
        const args = { contactId, expectedUpdatedAt: input.expectedUpdatedAt, signal: c.req.raw.signal,
          ...(method === 'patch' ? { rawInput: { ...saved.contact.raw_input, ...input.fields } } : {}) };
        dispatched = true;
        const result = await contactsStore[storeMethod](args);
        if (result?.status !== 'ready') return failedResult(c, result, true);
        if (!sameContact(result.contact, contactId)) return fail(c, 'unavailable', true);
        return send(c, { status: 'ready', ...(method === 'patch' ? { contact: project(result.contact) } : {}), contactWrite: receipt(operation, result.contact) });
      } catch { return fail(c, 'unavailable', dispatched); }
    });
  }
}
