/**
 * POST /api/operations/google/calendar/update
 *
 * Why: Patch requested fields on an exactly read event using its retained revision.
 * Input: JSON {arguments, phase?, preparation?}; phase is execute (default) or
 * internal preparation. Existing operation schemas and field bounds still apply.
 * Access: Private server-created Request binding only. JSON, cookies and headers
 * cannot supply principals, grants, receipts or lease ownership. Not publicly mounted.
 * Service: Fixed club Calendar. The bound service retains its current authorization,
 * exact-read/version checks, state, cancellation and write-uncertainty behavior.
 * Backend: server/google/operations/calendar.js or chat-calendar.js, selected
 * by the trusted host. Fixed Calendar target; list window<=366 days, bounded
 * pagination. Chat writes retain operation IDs and exact read revisions. Batch
 * writes allow<=50 rows and return only confirmed provider receipts. Updates
 * preserve supplied-field behavior; cancel is soft with sendUpdates=none.
 * Result: Bounded JSON operation result; generic transport failures contain no raw
 * exceptions or credentials. Private capabilities remain behind this API boundary.
 */
import { dispatchOperation } from '../../../../../../server/operation-api/dispatch.js';

export function registerUpdateCalendarEventOperation(app) {
  app.post('/api/operations/google/calendar/update', (c) =>
    dispatchOperation(c, 'update_calendar_event'),
  );
}
