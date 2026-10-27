/**
 * POST /api/operations/google/member-plans/list
 *
 * Why: Read personal activities in a bounded window.
 * Input: JSON {arguments, phase?, preparation?}; phase is execute (default) or
 * internal preparation. Existing operation schemas and field bounds still apply.
 * Access: Private server-created Request binding only. JSON, cookies and headers
 * cannot supply principals, grants, receipts or lease ownership. Not publicly mounted.
 * Service: Fixed Member Plans Calendar. The bound service retains its current authorization,
 * exact-read/version checks, state, cancellation and write-uncertainty behavior.
 * Backend: server/automation/adapters.js Member Plans operation, then the
 * separately pinned Calendar client. Keep per-input source, participant identity,
 * exact saved version and owned-event checks. No map-only plan creation.
 * Result: Bounded JSON operation result; generic transport failures contain no raw
 * exceptions or credentials. Private capabilities remain behind this API boundary.
 */
import { dispatchOperation } from '../../../../../../server/operation-api/dispatch.js';

export function registerListMemberPlansOperation(app) {
  app.post('/api/operations/google/member-plans/list', (c) =>
    dispatchOperation(c, 'list_member_plans'),
  );
}
