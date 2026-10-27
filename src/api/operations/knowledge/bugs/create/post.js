/**
 * POST /api/operations/knowledge/bugs/create
 *
 * Why: Record the current reported malfunction without claiming it was fixed.
 * Input: JSON {arguments, phase?, preparation?}; phase is execute (default) or
 * internal preparation. Existing operation schemas and field bounds still apply.
 * Access: Private server-created Request binding only. JSON, cookies and headers
 * cannot supply principals, grants, receipts or lease ownership. Not publicly mounted.
 * Service: Saved bug reports. The bound service retains its current authorization,
 * exact-read/version checks, state, cancellation and write-uncertainty behavior.
 * Backend: server/knowledge/operations/bug-reports.js and the bug-report store.
 * Retain trusted current-conversation context, bounded fields and once-only
 * request state. Caller JSON cannot supply trusted conversation evidence.
 * Result: Bounded JSON operation result; generic transport failures contain no raw
 * exceptions or credentials. Private capabilities remain behind this API boundary.
 */
import { dispatchOperation } from '../../../../../../server/operation-api/dispatch.js';

export function registerBugReportsOperation(app) {
  app.post('/api/operations/knowledge/bugs/create', (c) => dispatchOperation(c, 'bug_reports'));
}
