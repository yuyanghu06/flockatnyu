/**
 * POST /api/operations/treg/people/enrich
 *
 * Why: Enrich literal supplied emails with existing cost bounds and duplicate reuse.
 * Input: JSON {arguments, phase?, preparation?}; phase is execute (default) or
 * internal preparation. Existing operation schemas and field bounds still apply.
 * Access: Private server-created Request binding only. JSON, cookies and headers
 * cannot supply principals, grants, receipts or lease ownership. Not publicly mounted.
 * Service: Treg and private lookup logs. The bound service retains its current authorization,
 * exact-read/version checks, state, cancellation and write-uncertainty behavior.
 * Backend: server/treg/operations/service.js, then the named people provider.
 * Search and enrichment stay separate; enrichment uses actual supplied email
 * addresses. Preserve paid-call bounds, deduplication, private native results
 * and redacted private full-call logs. Saving uses a separate Contacts call.
 * Result: Bounded JSON operation result; generic transport failures contain no raw
 * exceptions or credentials. Private capabilities remain behind this API boundary.
 */
import { dispatchOperation } from '../../../../../../server/operation-api/dispatch.js';

export function registerEnrichTregPeopleOperation(app) {
  app.post('/api/operations/treg/people/enrich', (c) => dispatchOperation(c, 'enrich_treg_people'));
}
