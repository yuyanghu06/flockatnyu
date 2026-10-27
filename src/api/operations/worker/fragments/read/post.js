/**
 * POST /api/operations/worker/fragments/read
 *
 * Why: Continue the actual bounded fragment without inventing page identities.
 * Input: JSON {arguments, phase?, preparation?}; phase is execute (default) or
 * internal preparation. Existing operation schemas and field bounds still apply.
 * Access: Private server-created Request binding only. JSON, cookies and headers
 * cannot supply principals, grants, receipts or lease ownership. Not publicly mounted.
 * Service: Existing run-local fragments. The bound service retains its current authorization,
 * exact-read/version checks, state, cancellation and write-uncertainty behavior.
 * Backend: leased worker operations in server/automation and its operations
 * folder. Retain principal, exact task/queue versions, preparation capabilities,
 * completion evidence and lease checks. finish_batch only checks bookkeeping;
 * sync_calendars_to_map remains a separate named, audited runner invocation.
 * Result: Bounded JSON operation result; generic transport failures contain no raw
 * exceptions or credentials. Private capabilities remain behind this API boundary.
 */
import { dispatchOperation } from '../../../../../../server/operation-api/dispatch.js';

export function registerReadContextFragmentOperation(app) {
  app.post('/api/operations/worker/fragments/read', (c) =>
    dispatchOperation(c, 'read_context_fragment'),
  );
}
