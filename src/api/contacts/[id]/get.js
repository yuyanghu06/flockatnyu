/**
 * GET /api/contacts/:id
 *
 * Why: Open one saved contact before showing or editing that person.
 * Inputs: Path id must be UUID; no query string or body. Returns exact updated_at for
 * later conditional writes.
 * Access: Same saved-Contacts auth as directory; cross-site requests rejected without
 * live Discord discovery.
 * Service and effects: contactsStore.read only with request signal. No provider call,
 * lookup, mutation or other-service fetch.
 * Response and failure: 200 ready/contact projection; 400 invalid, 403 forbidden, 404
 * missing, 503 unconfigured/unavailable/invalid response. Exact returned identity is
 * checked. Private no-store; raw_input is not exposed.
 */
import { validUuid } from '../../../../server/automation/validation.js';

import { createContactsHttpContext, sameContact, project } from '../../_shared/contacts.js';

export function registerApiContactsIdGet({ app, contactsStore, auth, config, readJSON } = {}) {
  const { send, fail, failedResult, admitted } = createContactsHttpContext({
    auth,
    config,
    readJSON,
  });
  app.get('/api/contacts/:id', async (c) => {
    if (!(await admitted(c))) return fail(c, 'forbidden');
    const contactId = c.req.param('id');
    if (!validUuid(contactId) || new URL(c.req.url).search) return fail(c, 'invalid_request');
    if (!contactsStore?.configured || typeof contactsStore.read !== 'function')
      return fail(c, 'not_configured');
    try {
      const result = await contactsStore.read({ contactId, signal: c.req.raw.signal });
      if (result?.status !== 'ready') return failedResult(c, result);
      if (!sameContact(result.contact, contactId)) return fail(c);
      return send(c, { status: 'ready', contact: project(result.contact) });
    } catch {
      return fail(c);
    }
  });
}
