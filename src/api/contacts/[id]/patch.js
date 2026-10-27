/**
 * PATCH /api/contacts/:id
 *
 * Why: Change selected contact fields while preserving human edits and fields the screen
 * does not display.
 * Inputs: UUID id, no query; JSON exactly {expectedUpdatedAt, fields}, <=32768 bytes
 * and<=10 s bounded read. Version is a valid nonempty timestamp<=50 chars; fields use
 * shared limits; empty string explicitly clears.
 * Access: Saved-Contacts auth and cross-site rejection; existing Origin policy remains
 * in auth.
 * Service and effects: Reads exact contact and requires matching updated_at before
 * contactsStore.update. Merges supplied fields into existing raw_input and passes the
 * exact version plus request signal; no source/provider calls.
 * Response and failure: 200 ready/contact and updated contactWrite receipt; 400 invalid,
 * 403 forbidden, 404 missing, 409 stale version, 503 unavailable. Only confirmed writes
 * report success; uncertainty after dispatch is write_outcome_unknown. Private no-store.
 */
import { validContactFields } from '../../../../server/contacts.js';
import { validUuid } from '../../../../server/automation/validation.js';
import {
  createContactsHttpContext,
  sameContact,
  project,
  receipt,
  exactKeys,
  validVersion,
} from '../../_shared/contacts.js';

export function registerApiContactsIdPatch({ app, contactsStore, auth, config, readJSON } = {}) {
  const { send, fail, failedResult, admitted, body } = createContactsHttpContext({
    auth,
    config,
    readJSON,
  });
  app.patch('/api/contacts/:id', async (c) => {
    if (!(await admitted(c))) return fail(c, 'forbidden');
    const contactId = c.req.param('id');
    if (!validUuid(contactId) || new URL(c.req.url).search) return fail(c, 'invalid_request');
    let input;
    try {
      input = await body(c);
    } catch {
      return fail(c, 'invalid_request');
    }
    if (
      !exactKeys(input, ['expectedUpdatedAt', 'fields']) ||
      !validVersion(input.expectedUpdatedAt) ||
      !validContactFields(input.fields)
    )
      return fail(c, 'invalid_request');
    if (
      !contactsStore?.configured ||
      typeof contactsStore.read !== 'function' ||
      typeof contactsStore.update !== 'function'
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
        rawInput: { ...saved.contact.raw_input, ...input.fields },
      };
      dispatched = true;
      const result = await contactsStore.update(args);
      if (result?.status !== 'ready') return failedResult(c, result, true);
      if (!sameContact(result.contact, contactId)) return fail(c, 'unavailable', true);
      return send(c, {
        status: 'ready',
        contact: project(result.contact),
        contactWrite: receipt('updated', result.contact),
      });
    } catch {
      return fail(c, 'unavailable', dispatched);
    }
  });
}
