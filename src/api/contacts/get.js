/**
 * GET /api/contacts
 *
 * Why: Find saved people in the Contacts directory without depending on Discord being
 * online.
 * Inputs: Allowlisted, single-valued
 * query/name/workplace/emailPresence/phonePresence/sort/limit/offset; query<=256
 * characters. Default limit 10/offset 0; shared search validator enforces limits.
 * Access: Requires authenticated nonblank actor ID and allowedSourceIds array through
 * auth; rejects Sec-Fetch-Site:cross-site. Session/origin policy remains with auth.
 * Service and effects: Reads only contactsStore.search; no paid lookup, source fetch or
 * write. Passes request cancellation.
 * Response and failure: 200 {status:"ready", contacts:[six-field projections],
 * coverage:{complete, nextOffset}}. 400 invalid, 403 forbidden, 503
 * configuration/storage/invalid result; bounded coverage never proves absence. Private
 * no-store; raw records stay private.
 */
import { validContact } from '../../../server/contacts.js';

import {
  CONTACT_SEARCH_PROPERTIES,
  validContactsSearchOptions,
} from '../../../server/contacts-search.js';
import { createContactsHttpContext, project } from '../_shared/contacts.js';

export function registerApiContactsGet({ app, contactsStore, auth, config, readJSON } = {}) {
  const { send, fail, failedResult, admitted } = createContactsHttpContext({
    auth,
    config,
    readJSON,
  });
  app.get('/api/contacts', async (c) => {
    if (!(await admitted(c))) return fail(c, 'forbidden');
    const query = new URL(c.req.url).searchParams;
    if (
      [...query.keys()].some(
        (key) => !Object.hasOwn(CONTACT_SEARCH_PROPERTIES, key) || query.getAll(key).length !== 1,
      )
    )
      return fail(c, 'invalid_request');
    const text = query.get('query') ?? '',
      rawLimit = query.get('limit') ?? '10',
      rawOffset = query.get('offset') ?? '0';
    if (
      text.length > 256 ||
      !/^[1-9][0-9]*$/.test(rawLimit) ||
      !/^(0|[1-9][0-9]*)$/.test(rawOffset)
    )
      return fail(c, 'invalid_request');
    const limit = Number(rawLimit),
      offset = Number(rawOffset);
    const options = {
      query: text,
      limit,
      offset,
      name: query.get('name') ?? '',
      workplace: query.get('workplace') ?? '',
      emailPresence: query.get('emailPresence') ?? 'any',
      phonePresence: query.get('phonePresence') ?? 'any',
      sort: query.get('sort') ?? 'auto',
    };
    if (!validContactsSearchOptions(options)) return fail(c, 'invalid_request');
    if (!contactsStore?.configured || typeof contactsStore.search !== 'function')
      return fail(c, 'not_configured');
    try {
      const result = await contactsStore.search({ ...options, signal: c.req.raw.signal });
      if (result?.status !== 'ready') return failedResult(c, result);
      if (
        !Array.isArray(result.contacts) ||
        result.contacts.length > limit ||
        result.contacts.some((contact) => !validContact(contact)) ||
        typeof result.coverage?.complete !== 'boolean' ||
        !(
          result.coverage.nextOffset === null ||
          (Number.isSafeInteger(result.coverage.nextOffset) &&
            result.coverage.nextOffset > offset &&
            result.coverage.nextOffset <= 10000)
        )
      )
        return fail(c);
      return send(c, {
        status: 'ready',
        contacts: result.contacts.map(project),
        coverage: { complete: result.coverage.complete, nextOffset: result.coverage.nextOffset },
      });
    } catch {
      return fail(c);
    }
  });
}
