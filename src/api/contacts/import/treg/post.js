/**
 * POST /api/contacts/import/treg
 *
 * Why: Import people found through Treg while retaining native records server-side and
 * preserving existing Contacts.
 * Inputs: No query; JSON exactly two keys with UUID requestId and validTregPeopleQuery
 * query; <=8192 bytes and<=10 s bounded read. Query validation retains existing
 * 1–10-person limits.
 * Access: Requires authenticated nonblank actor ID and allowedSourceIds; rejects
 * cross-site; injected auth retains Origin/session checks.
 * Service and effects: Calls tregContactsImporter.importPeople with
 * requestId/query/principal/signal. Existing importer owns paid lookup, private log and
 * insert-only native Contact handling; this route adds no chained operations.
 * Response and failure: Returns importer outcome with its status mapping:200 ready, 400
 * invalid, 403 forbidden, 402 budget, 408 aborted, 429 rate limit, 502
 * malformed/oversized provider result, 503 partial/unavailable/config/log failure. No
 * success is invented on exception; private no-store.
 */
import { plainObject, validUuid } from '../../../../../server/automation/validation.js';
import { validTregPeopleQuery } from '../../../../../server/treg/people.js';
const statuses = {
  forbidden: 403,
  invalid_request: 400,
  not_configured: 503,
  unavailable: 503,
  aborted: 408,
  rate_limited: 429,
  budget_exceeded: 402,
  invalid_response: 502,
  response_too_large: 502,
  partial: 503,
  ready: 200,
  log_unavailable: 503,
};
export function registerApiContactsImportTregPost({
  app,
  tregContactsImporter,
  auth,
  config,
  readJSON,
} = {}) {
  app.post('/api/contacts/import/treg', async (c) => {
    c.header('cache-control', 'private, no-store');
    c.header('x-content-type-options', 'nosniff');
    const fail = (status) => c.json({ status }, statuses[status] || 503);
    if (c.req.header('sec-fetch-site') === 'cross-site') return fail('forbidden');
    let principal;
    try {
      principal = await auth(c, config);
    } catch {
      return fail('forbidden');
    }
    if (
      typeof principal?.id !== 'string' ||
      !principal.id.trim() ||
      !Array.isArray(principal.allowedSourceIds)
    )
      return fail('forbidden');
    if (new URL(c.req.url).search) return fail('invalid_request');
    let input;
    try {
      input = await readJSON(c.req.raw, Math.min(config?.timeoutMs || 10000, 10000), 8192);
    } catch {
      return fail('invalid_request');
    }
    if (
      !plainObject(input) ||
      Object.keys(input).length !== 2 ||
      !validUuid(input.requestId) ||
      !validTregPeopleQuery(input.query)
    )
      return fail('invalid_request');
    if (
      !tregContactsImporter?.configured ||
      typeof tregContactsImporter.importPeople !== 'function'
    )
      return fail('not_configured');
    try {
      const result = await tregContactsImporter.importPeople({
        query: input.query,
        requestId: input.requestId,
        principal,
        signal: c.req.raw.signal,
      });
      return c.json(result, statuses[result?.status] || 503);
    } catch {
      return fail('unavailable');
    }
  });
}
