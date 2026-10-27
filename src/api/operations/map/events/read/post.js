/**
 * POST /api/operations/map/events/read
 *
 * Why: Read authorized events and retain private write-validation context without source reads.
 * Input: JSON {arguments, phase?, preparation?}; phase is execute (default) or
 * internal preparation. Existing operation schemas and field bounds still apply.
 * Access: Private server-created Request binding only. JSON, cookies and headers
 * cannot supply principals, grants, receipts or lease ownership. Not publicly mounted.
 * Service: Saved map database. The bound service retains its current authorization,
 * exact-read/version checks, state, cancellation and write-uncertainty behavior.
 * Backend: server/map/operations/service.js or chat.js; worker participation
 * uses its existing leased adapter. Keep fixed person/building catalogues, exact
 * snapshots, participant evidence and optimistic versions. Reading saved map
 * data never fetches its Discord/Gmail/Calendar/Miro original.
 * Result: Bounded JSON operation result; generic transport failures contain no raw
 * exceptions or credentials. Private capabilities remain behind this API boundary.
 */
import { dispatchOperation } from '../../../../../../server/operation-api/dispatch.js';

export function registerReadMapEventsOperation(app) {
  app.post('/api/operations/map/events/read', (c) => dispatchOperation(c, 'read_map_events'));
}
