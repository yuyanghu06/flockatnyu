/**
 * POST /api/contacts
 *
 * Why: Save a person supplied by the user as a new Contacts entry.
 * Inputs: No query; JSON exactly {fields}; supported contact fields only, at least one
 * nonblank. Body<=32768 bytes; read deadline min(config.timeoutMs or 10 s, 10 s). Field
 * bounds come from validContactFields.
 * Access: Saved-Contacts authentication rejects cross-site; injected auth keeps existing
 * mutation Origin/session checks.
 * Service and effects: Calls contactsStore.create once with supplied fields and request
 * signal. No enrichment, Gmail or source reads.
 * Response and failure: 200 ready/contact plus contactWrite:{operation:"created", id,
 * updated_at}; 400 invalid, 403 forbidden, 409 conflict, 503 failed/unavailable.
 * Malformed/uncertain post-dispatch outcomes report write_outcome_unknown, never
 * fabricate success or retry. Raw data stays private.
 */
import { validContactFields } from '../../../server/contacts/store.js';

import {
  createContactsHttpContext,
  sameContact,
  project,
  receipt,
  exactKeys,
} from '../_shared/contacts.js';

export function registerApiContactsPost({ app, contactsStore, auth, config, readJSON } = {}) {
  const { send, fail, failedResult, admitted, body } = createContactsHttpContext({
    auth,
    config,
    readJSON,
  });
  app.post('/api/contacts', async (c) => {
    if (!(await admitted(c))) return fail(c, 'forbidden');
    if (new URL(c.req.url).search) return fail(c, 'invalid_request');
    let input;
    try {
      input = await body(c);
    } catch {
      return fail(c, 'invalid_request');
    }
    if (!exactKeys(input, ['fields']) || !validContactFields(input.fields, { create: true }))
      return fail(c, 'invalid_request');
    if (!contactsStore?.configured || typeof contactsStore.create !== 'function')
      return fail(c, 'not_configured');
    try {
      const result = await contactsStore.create({ fields: input.fields, signal: c.req.raw.signal });
      if (result?.status !== 'ready') return failedResult(c, result, true);
      if (!sameContact(result.contact)) return fail(c, 'unavailable', true);
      return send(c, {
        status: 'ready',
        contact: project(result.contact),
        contactWrite: receipt('created', result.contact),
      });
    } catch {
      return fail(c, 'unavailable', true);
    }
  });
}
