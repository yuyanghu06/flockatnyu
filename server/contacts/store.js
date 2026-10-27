import { canonicalJson, plainObject, validUuid } from '../automation/validation.js';
import { SOURCE_TOOL_TIMEOUT_MS } from '../shared/source-timeout.js';
import { createContactsSearch } from './search.js';

import { CONTACT_FIELDS, contactFields } from './fields.js';
export { CONTACT_FIELDS } from './fields.js';
const responseLimit = 256_000;
const selection = 'id,created_at,updated_at,raw_input,lookup_email';
const validTimestamp = (value) =>
  typeof value === 'string' && value.length <= 50 && Number.isFinite(Date.parse(value));
export const validContact = (value) =>
  plainObject(value) &&
  validUuid(value.id) &&
  validTimestamp(value.created_at) &&
  validTimestamp(value.updated_at) &&
  plainObject(value.raw_input) &&
  (value.lookup_email === undefined ||
    value.lookup_email === null ||
    (typeof value.lookup_email === 'string' && value.lookup_email.length <= CONTACT_FIELDS.email));
export function validContactFields(fields, { create = false } = {}) {
  return (
    plainObject(fields) &&
    Object.keys(fields).length > 0 &&
    Object.entries(fields).every(
      ([key, value]) =>
        Object.hasOwn(CONTACT_FIELDS, key) &&
        typeof value === 'string' &&
        value.length <= CONTACT_FIELDS[key],
    ) &&
    (!create || Object.values(fields).some((value) => value.trim()))
  );
}
const contactOf = (value) => ({
  id: value.id,
  created_at: value.created_at,
  updated_at: value.updated_at,
  raw_input: value.raw_input,
  ...(value.lookup_email === undefined ? {} : { lookup_email: value.lookup_email }),
});
const unknown = () => ({ status: 'unavailable', reason: 'write_outcome_unknown' });

// These methods access only the saved contacts table. They do not fetch source
// originals, resolve map identities or write to any other service.
export function createContactsStore({ env = process.env, fetchImpl = globalThis.fetch } = {}) {
  let base;
  try {
    const url = new URL(env.SUPABASE_URL);
    if (
      (url.protocol === 'https:' ||
        (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      ['', '/'].includes(url.pathname)
    )
      base = url.origin;
  } catch {}
  const key = (env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  const configured = Boolean(base && key && !/[\r\n]/.test(key) && typeof fetchImpl === 'function');
  async function request({
    method = 'GET',
    resource = 'contacts',
    readOnly = false,
    params,
    body,
    signal,
    ignoreDuplicates = false,
  }) {
    if (!configured) return { status: 'not_configured' };
    if (signal?.aborted) return { status: 'aborted' };
    if (
      resource !== 'contacts' &&
      !(
        ['rpc/contacts_search', 'rpc/contacts_match_email'].includes(resource) &&
        method === 'POST' &&
        readOnly
      )
    )
      return { status: 'invalid_request' };
    const mutation = method !== 'GET' && !readOnly;
    let encoded;
    try {
      encoded = body === undefined ? undefined : JSON.stringify(body);
      if (encoded && Buffer.byteLength(encoded) > responseLimit)
        return { status: 'invalid_request' };
    } catch {
      return { status: 'invalid_request' };
    }
    try {
      const active = AbortSignal.any(
        [signal, AbortSignal.timeout(SOURCE_TOOL_TIMEOUT_MS)].filter(Boolean),
      );
      const response = await fetchImpl(`${base}/rest/v1/${resource}${params ? `?${params}` : ''}`, {
        method,
        redirect: 'error',
        signal: active,
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
          ...(mutation
            ? {
                Prefer: ignoreDuplicates
                  ? 'resolution=ignore-duplicates,return=representation'
                  : 'return=representation',
              }
            : {}),
        },
        ...(encoded === undefined ? {} : { body: encoded }),
      });
      if (!response.ok) {
        await response.body?.cancel();
        if (mutation && response.status >= 500) return unknown();
        return {
          status:
            response.status === 400 && readOnly
              ? 'invalid_request'
              : response.status === 404
                ? 'schema_not_ready'
                : [401, 403].includes(response.status)
                  ? 'forbidden'
                  : response.status === 409
                    ? 'conflict'
                    : response.status === 429
                      ? 'rate_limited'
                      : 'unavailable',
        };
      }
      const chunks = [];
      let bytes = 0;
      for await (const chunk of response.body) {
        bytes += chunk.byteLength;
        if (bytes > responseLimit) return mutation ? unknown() : { status: 'response_too_large' };
        chunks.push(chunk);
      }
      const rows = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (!Array.isArray(rows) || rows.some((row) => !validContact(row)))
        return mutation ? unknown() : { status: 'invalid_response' };
      return { status: 'ready', rows: rows.map(contactOf) };
    } catch {
      return mutation ? unknown() : { status: signal?.aborted ? 'aborted' : 'unavailable' };
    }
  }
  const exact = (contactId) => new URLSearchParams({ select: selection, id: `eq.${contactId}` });
  async function one(options, { contactId, conflict = false } = {}) {
    const result = await request(options);
    if (result.status !== 'ready') return result;
    if (!result.rows.length)
      return options.method === 'POST'
        ? unknown()
        : { status: conflict ? 'conflict' : 'not_found' };
    if (
      result.rows.length !== 1 ||
      (contactId && result.rows[0].id.toLowerCase() !== contactId.toLowerCase())
    ) {
      return options.method && options.method !== 'GET'
        ? unknown()
        : { status: 'invalid_response' };
    }
    if (
      options.body &&
      canonicalJson(result.rows[0].raw_input) !== canonicalJson(options.body.raw_input)
    )
      return unknown();
    return { status: 'ready', contact: result.rows[0] };
  }
  return Object.freeze({
    configured,
    search: createContactsSearch({ request }),
    async read({ contactId, signal } = {}) {
      if (!validUuid(contactId)) return { status: 'invalid_request' };
      return one({ params: exact(contactId), signal }, { contactId });
    },
    async create({ fields, signal } = {}) {
      if (!validContactFields(fields, { create: true })) return { status: 'invalid_request' };
      const raw_input = Object.fromEntries(
        Object.keys(CONTACT_FIELDS).map((field) => [field, fields[field] ?? '']),
      );
      return one({
        method: 'POST',
        params: new URLSearchParams({ select: selection }),
        body: { raw_input },
        signal,
      });
    },
    // Insert-only integration entry point. It never changes an existing row.
    async importContact({ contactId, rawInput, email = '', lookupEmail, signal } = {}) {
      if (
        !validUuid(contactId) ||
        !plainObject(rawInput) ||
        typeof email !== 'string' ||
        email.length > CONTACT_FIELDS.email ||
        (lookupEmail !== undefined &&
          (typeof lookupEmail !== 'string' ||
            lookupEmail !== email ||
            !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lookupEmail)))
      )
        return { status: 'invalid_request' };
      try {
        if (Buffer.byteLength(canonicalJson(rawInput)) > responseLimit - 1024)
          return { status: 'invalid_request' };
      } catch {
        return { status: 'invalid_request' };
      }
      // A manual contact with the same email is preserved, including its notes.
      if (email) {
        const saved = await request({
          method: 'POST',
          resource: 'rpc/contacts_match_email',
          readOnly: true,
          body: { p_email: email },
          signal,
        });
        if (saved.status !== 'ready') return saved;
        if (
          saved.rows.length > 2 ||
          saved.rows.some((row) => contactFields(row).email.toLowerCase() !== email.toLowerCase())
        )
          return { status: 'invalid_response' };
        if (saved.rows.length)
          return { status: 'ready', operation: 'existing', contact: saved.rows[0] };
      }
      const params = new URLSearchParams({ select: selection, on_conflict: 'id' });
      const saved = await request({
        method: 'POST',
        params,
        body: {
          id: contactId,
          raw_input: rawInput,
          ...(lookupEmail === undefined ? {} : { lookup_email: lookupEmail }),
        },
        signal,
        ignoreDuplicates: true,
      });
      if (saved.status !== 'ready') return saved;
      if (
        saved.rows.length === 1 &&
        saved.rows[0].id.toLowerCase() === contactId.toLowerCase() &&
        canonicalJson(saved.rows[0].raw_input) === canonicalJson(rawInput) &&
        (lookupEmail === undefined || saved.rows[0].lookup_email === lookupEmail)
      )
        return { status: 'ready', operation: 'imported', contact: saved.rows[0] };
      if (saved.rows.length) return unknown();
      // PostgREST returns [] for an ignored primary-key conflict. Read the exact
      // winner instead of assuming an insert happened or overwriting its values.
      const existing = await one({ params: exact(contactId), signal }, { contactId });
      return existing.status === 'ready' ? { ...existing, operation: 'existing' } : unknown();
    },
    async update({ contactId, expectedUpdatedAt, rawInput, signal } = {}) {
      if (!validUuid(contactId) || !validTimestamp(expectedUpdatedAt) || !plainObject(rawInput))
        return { status: 'invalid_request' };
      const params = exact(contactId);
      params.set('updated_at', `eq.${expectedUpdatedAt}`);
      return one(
        { method: 'PATCH', params, body: { raw_input: rawInput }, signal },
        { contactId, conflict: true },
      );
    },
    async delete({ contactId, expectedUpdatedAt, signal } = {}) {
      if (!validUuid(contactId) || !validTimestamp(expectedUpdatedAt))
        return { status: 'invalid_request' };
      const params = exact(contactId);
      params.set('updated_at', `eq.${expectedUpdatedAt}`);
      return one({ method: 'DELETE', params, signal }, { contactId, conflict: true });
    },
  });
}
