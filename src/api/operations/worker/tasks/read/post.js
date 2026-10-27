/**
 * POST /api/operations/worker/tasks/read
 *
 * Why: Read an exact current task and its bounded saved context.
 * Input: JSON {arguments, phase?, preparation?}; phase is execute (default) or
 * internal preparation. Existing operation schemas and field bounds still apply.
 * Access: Private server-created Request binding only. JSON, cookies and headers
 * cannot supply principals, grants, receipts or lease ownership. Not publicly mounted.
 * Service: Leased saved tasks. The bound service retains its current authorization,
 * exact-read/version checks, state, cancellation and write-uncertainty behavior.
 * Backend: leased worker operations in server/automation and its operations
 * folder. Retain principal, exact task/queue versions, preparation capabilities,
 * completion evidence and lease checks. finish_batch only checks bookkeeping;
 * sync_calendars_to_map remains a separate named, audited runner invocation.
 * Result: Bounded JSON operation result; generic transport failures contain no raw
 * exceptions or credentials. Private capabilities remain behind this API boundary.
 */
import { dispatchOperation } from '../../../../../../server/operation-api/dispatch.js';

export function registerReadPendingTaskOperation(app) {
  app.post('/api/operations/worker/tasks/read', (c) => dispatchOperation(c, 'read_pending_task'));
}
