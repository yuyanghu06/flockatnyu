/**
 * DELETE /api/contacts/:id
 *
 * Why: Remove only the exact saved contact version the user chose, protecting concurrent
 * edits.
 * Inputs: UUID id, no query; JSON exactly {expectedUpdatedAt}, <=32768 bytes/<=10 s
 * read; timestamp nonempty<=50 chars. Extra fields rejected.
 * Access: Saved-Contacts auth and cross-site rejection; existing mutation Origin/session
 * policy stays in auth.
 * Service and effects: Reads exact current contact, compares updated_at, then
 * contactsStore.delete with exact version and request signal. Does not call providers or
 * delete other data.
 * Response and failure: 200 ready/contactWrite:{operation:"deleted", id, updated_at};
 * 400 invalid, 403 forbidden, 404 missing, 409 changed version, 503 unavailable.
 * Post-dispatch uncertainty is explicit and never retried here. Private no-store; raw
 * records are not returned.
 */
import { validUuid } from '../../../../server/automation/validation.js';
import {
  createContactsHttpContext,
  sameContact,
  receipt,
  exactKeys,
  validVersion,
} from '../../_shared/contacts.js';

export function registerApiContactsIdDelete({ app, contactsStore, auth, config, readJSON } = {}) {
  const { send, fail, failedResult, admitted, body } = createContactsHttpContext({
    auth,
    config,
    readJSON,
  });
  app.delete('/api/contacts/:id', async (c) => {
    if (!(await admitted(c))) return fail(c, 'forbidden');
    const contactId = c.req.param('id');
    if (!validUuid(contactId) || new URL(c.req.url).search) return fail(c, 'invalid_request');
    let input;
    try {
      input = await body(c);
    } catch {
      return fail(c, 'invalid_request');
    }
    if (!exactKeys(input, ['expectedUpdatedAt']) || !validVersion(input.expectedUpdatedAt))
      return fail(c, 'invalid_request');
    if (
      !contactsStore?.configured ||
      typeof contactsStore.read !== 'function' ||
      typeof contactsStore.delete !== 'function'
    )
      return fail(c, 'not_configured');
    let dispatched = false;
    try {
      const saved = await contactsStore.read({ contactId, signal: c.req.raw.signal });
      if (saved?.status !== 'ready') return failedResult(c, saved);
      if (!sameContact(saved.contact, contactId)) return fail(c);
      if (saved.contact.updated_at !== input.expectedUpdatedAt) return fail(c, 'conflict');
      const args = {
        contactId,
        expectedUpdatedAt: input.expectedUpdatedAt,
        signal: c.req.raw.signal,
      };
      dispatched = true;
      const result = await contactsStore.delete(args);
      if (result?.status !== 'ready') return failedResult(c, result, true);
      if (!sameContact(result.contact, contactId)) return fail(c, 'unavailable', true);
      return send(c, { status: 'ready', contactWrite: receipt('deleted', result.contact) });
    } catch {
      return fail(c, 'unavailable', dispatched);
    }
  });
}
