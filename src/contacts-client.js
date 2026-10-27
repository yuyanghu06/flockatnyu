export const CONTACT_FIELD_LIMITS = Object.freeze({ first_name: 200, last_name: 200, email: 320, phone_number: 100, workplace: 500, notes: 4000 });
const fields = Object.keys(CONTACT_FIELD_LIMITS);
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const stamp = value => typeof value === 'string' && value.length <= 50 && Number.isFinite(Date.parse(value));
function contact(value) {
  if (!uuid(value?.id) || !stamp(value.created_at) || !stamp(value.updated_at) || !value.fields
    || typeof value.fields !== 'object' || Array.isArray(value.fields)
    || Object.keys(value.fields).length !== fields.length
    || !fields.every(key => typeof value.fields[key] === 'string' && value.fields[key].length <= CONTACT_FIELD_LIMITS[key])) return null;
  return { id: value.id, created_at: value.created_at, updated_at: value.updated_at,
    fields: Object.fromEntries(fields.map(key => [key, value.fields[key]])) };
}
const failure = (status, reason) => ({ status, ...(reason ? { reason } : {}) });
const knownStatuses = new Set(['forbidden', 'invalid_request', 'not_found', 'conflict', 'not_configured', 'schema_not_ready', 'rate_limited', 'unavailable', 'aborted']);
const validFields = value => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).length > 0 && Object.entries(value).every(([key, text]) => Object.hasOwn(CONTACT_FIELD_LIMITS, key)
    && typeof text === 'string' && text.length <= CONTACT_FIELD_LIMITS[key]);

export function createContactsClient({ fetchImpl = globalThis.fetch, timeoutMs = 15000 } = {}) {
  async function request(path, { method = 'GET', body, signal, operation, contactId } = {}) {
    if (signal?.aborted) return failure('aborted');
    const controller = new AbortController();
    let timer, cancel, dispatched = false;
    const interrupted = new Promise(resolve => {
      cancel = () => { controller.abort(); resolve(failure('aborted', operation && dispatched ? 'write_outcome_unknown' : undefined)); };
      signal?.addEventListener('abort', cancel, { once: true });
      timer = setTimeout(() => { controller.abort(); resolve(failure('unavailable', operation && dispatched ? 'write_outcome_unknown' : undefined)); },
        Number.isFinite(timeoutMs) ? Math.min(30000, Math.max(1, timeoutMs)) : 15000);
    });
    const perform = async () => {
      let response;
      try {
        dispatched = true;
        response = await fetchImpl(path, { method, signal: controller.signal, credentials: 'same-origin', cache: 'no-store', redirect: 'error',
          headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
          ...(body ? { body: JSON.stringify(body) } : {}) });
        const reader = response.body?.getReader();
        if (!reader) return failure('unavailable', operation ? 'write_outcome_unknown' : undefined);
        const chunks = []; let bytes = 0;
        while (true) {
          const { value, done } = await reader.read(); if (done) break;
          bytes += value.byteLength;
          if (bytes > 256000) { await reader.cancel(); return failure('unavailable', operation ? 'write_outcome_unknown' : undefined); }
          chunks.push(value);
        }
        const all = new Uint8Array(bytes); let position = 0;
        for (const chunk of chunks) { all.set(chunk, position); position += chunk.byteLength; }
        const result = JSON.parse(new TextDecoder().decode(all));
        if (!response.ok || result?.status !== 'ready') {
          const status = knownStatuses.has(result?.status) ? result.status
            : response.status === 401 || response.status === 403 ? 'forbidden' : response.status === 404 ? 'not_found'
              : response.status === 409 ? 'conflict' : response.status === 400 ? 'invalid_request' : 'unavailable';
          return failure(status, operation && (result?.reason === 'write_outcome_unknown' || response.status >= 500 && !knownStatuses.has(result?.status)) ? 'write_outcome_unknown' : undefined);
        }
        if (operation) {
          const receipt = result.contactWrite;
          if (receipt?.operation !== operation || !uuid(receipt.id) || !stamp(receipt.updated_at)
            || contactId && receipt.id.toLowerCase() !== contactId.toLowerCase()) return failure('unavailable', 'write_outcome_unknown');
          const saved = operation === 'deleted' ? null : contact(result.contact);
          if (operation !== 'deleted' && (!saved || saved.id.toLowerCase() !== receipt.id.toLowerCase())) return failure('unavailable', 'write_outcome_unknown');
          return { status: 'ready', ...(saved ? { contact: saved } : {}), contactWrite: { operation, id: receipt.id, updated_at: receipt.updated_at } };
        }
        if (Array.isArray(result.contacts)) {
          const contacts = result.contacts.map(contact), coverage = result.coverage;
          if (contacts.length > 10 || !contacts.every(Boolean) || typeof coverage?.complete !== 'boolean'
            || !(coverage.nextOffset === null || Number.isInteger(coverage.nextOffset) && coverage.nextOffset >= 0 && coverage.nextOffset <= 10000)) return failure('unavailable');
          return { status: 'ready', contacts, coverage: { complete: coverage.complete, nextOffset: coverage.nextOffset } };
        }
        const saved = contact(result.contact);
        if (!saved || contactId && saved.id.toLowerCase() !== contactId.toLowerCase()) return failure('unavailable');
        return { status: 'ready', contact: saved };
      } catch { return failure(controller.signal.aborted ? 'aborted' : 'unavailable', operation && dispatched ? 'write_outcome_unknown' : undefined); }
    };
    try { return await Promise.race([perform(), interrupted]); }
    finally { clearTimeout(timer); signal?.removeEventListener('abort', cancel); }
  }
  return Object.freeze({
    search({ query = '', limit = 10, offset = 0, name = '', workplace = '', emailPresence = 'any', phonePresence = 'any', sort = 'auto', signal } = {}) {
      if (typeof query !== 'string' || query.length > 256 || query.includes('\0') || typeof name !== 'string' || name.length > 200 || name.includes('\0')
        || typeof workplace !== 'string' || workplace.length > 500 || workplace.includes('\0')
        || !['any', 'yes', 'no'].includes(emailPresence) || !['any', 'yes', 'no'].includes(phonePresence)
        || !['auto', 'relevance', 'name_asc', 'name_desc', 'newest', 'oldest'].includes(sort)
        || !Number.isInteger(limit) || limit < 1 || limit > 10 || !Number.isInteger(offset) || offset < 0 || offset > 10000) return Promise.resolve(failure('invalid_request'));
      const params = new URLSearchParams({ query, limit: String(limit), offset: String(offset) });
      if (name) params.set('name', name); if (workplace) params.set('workplace', workplace);
      if (emailPresence !== 'any') params.set('emailPresence', emailPresence); if (phonePresence !== 'any') params.set('phonePresence', phonePresence);
      if (sort !== 'auto') params.set('sort', sort);
      return request(`/api/contacts?${params}`, { signal });
    },
    read({ contactId, signal } = {}) { return uuid(contactId) ? request(`/api/contacts/${contactId}`, { contactId, signal }) : Promise.resolve(failure('invalid_request')); },
    create({ fields, signal } = {}) { return validFields(fields) ? request('/api/contacts', { method: 'POST', body: { fields }, signal, operation: 'created' }) : Promise.resolve(failure('invalid_request')); },
    update({ contactId, expectedUpdatedAt, fields, signal } = {}) {
      return uuid(contactId) && stamp(expectedUpdatedAt) && validFields(fields)
        ? request(`/api/contacts/${contactId}`, { method: 'PATCH', body: { expectedUpdatedAt, fields }, contactId, signal, operation: 'updated' }) : Promise.resolve(failure('invalid_request'));
    },
    delete({ contactId, expectedUpdatedAt, signal } = {}) {
      return uuid(contactId) && stamp(expectedUpdatedAt)
        ? request(`/api/contacts/${contactId}`, { method: 'DELETE', body: { expectedUpdatedAt }, contactId, signal, operation: 'deleted' }) : Promise.resolve(failure('invalid_request'));
    },
  });
}
