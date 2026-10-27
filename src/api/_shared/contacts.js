import { contactFields } from '../../../server/contacts/fields.js';
import { validContact } from '../../../server/contacts/store.js';
import { plainObject } from '../../../server/automation/validation.js';

const statuses = Object.freeze({
  forbidden: 403,
  invalid_request: 400,
  not_found: 404,
  conflict: 409,
  not_configured: 503,
  schema_not_ready: 503,
  unavailable: 503,
  aborted: 503,
  rate_limited: 503,
  invalid_response: 503,
  response_too_large: 503,
});
const authorized = (principal) =>
  typeof principal?.id === 'string' &&
  Boolean(principal.id.trim()) &&
  Array.isArray(principal.allowedSourceIds);
const validVersion = (value) =>
  typeof value === 'string' &&
  value.length > 0 &&
  value.length <= 50 &&
  Number.isFinite(Date.parse(value));
const sameContact = (contact, id) =>
  validContact(contact) && (!id || contact.id.toLowerCase() === id.toLowerCase());
const project = (contact) => ({
  id: contact.id,
  created_at: contact.created_at,
  updated_at: contact.updated_at,
  fields: contactFields(contact),
});
const receipt = (operation, contact) => ({
  operation,
  id: contact.id,
  updated_at: contact.updated_at,
});
const exactKeys = (value, keys) =>
  plainObject(value) &&
  Object.keys(value).length === keys.length &&
  keys.every((key) => Object.hasOwn(value, key));
export function createContactsHttpContext({ auth, config, readJSON }) {
  const send = (c, body, status = 200) => c.json(body, status);
  const fail = (c, status = 'unavailable', unknown = false) =>
    send(
      c,
      {
        status: Object.hasOwn(statuses, status) ? status : 'unavailable',
        ...(unknown ? { reason: 'write_outcome_unknown' } : {}),
      },
      statuses[status] || 503,
    );
  const failedResult = (c, result, mutation = false) =>
    fail(
      c,
      Object.hasOwn(statuses, result?.status) ? result.status : 'unavailable',
      result?.reason === 'write_outcome_unknown' ||
        (mutation &&
          (!Object.hasOwn(statuses, result?.status) ||
            ['invalid_response', 'response_too_large'].includes(result.status))),
    );
  async function admitted(c) {
    c.header('cache-control', 'private, no-store');
    c.header('x-content-type-options', 'nosniff');
    if (c.req.header('sec-fetch-site') === 'cross-site') return false;
    try {
      return authorized(await auth(c, config));
    } catch {
      return false;
    }
  }
  async function body(c) {
    return readJSON(c.req.raw, Math.min(config?.timeoutMs || 10000, 10000), 32768);
  }
  return { send, fail, failedResult, admitted, body };
}
export { sameContact, project, receipt, exactKeys, validVersion };
