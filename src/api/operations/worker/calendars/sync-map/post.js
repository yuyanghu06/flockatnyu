/**
 * POST /api/operations/worker/calendars/sync-map
 *
 * Why: Project both fixed Calendars through a separately named and audited operation.
 * Input: JSON {arguments, phase?, preparation?}; phase is execute (default) or
 * internal preparation. Existing operation schemas and field bounds still apply.
 * Access: Private server-created Request binding only. JSON, cookies and headers
 * cannot supply principals, grants, receipts or lease ownership. Not publicly mounted.
 * Service: Explicit Calendar-to-map exception. The bound service retains its current authorization,
 * exact-read/version checks, state, cancellation and write-uncertainty behavior.
 * Backend: leased worker operations in server/automation and its operations
 * folder. Retain principal, exact task/queue versions, preparation capabilities,
 * completion evidence and lease checks. finish_batch only checks bookkeeping;
 * sync_calendars_to_map remains a separate named, audited runner invocation.
 * Result: Bounded JSON operation result; generic transport failures contain no raw
 * exceptions or credentials. Private capabilities remain behind this API boundary.
 */
import { dispatchOperation } from '../../../../../../server/operation-api/dispatch.js';

export function registerSyncCalendarsToMapOperation(app) {
  app.post('/api/operations/worker/calendars/sync-map', (c) =>
    dispatchOperation(c, 'sync_calendars_to_map'),
  );
}
