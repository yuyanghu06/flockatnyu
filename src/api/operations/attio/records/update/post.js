/**
 * POST /api/operations/attio/records/update
 *
 * Why: Change requested fields on an exactly read CRM record.
 * Input: JSON {arguments, phase?, preparation?}; phase is execute (default) or
 * internal preparation. Existing operation schemas and field bounds still apply.
 * Access: Private server-created Request binding only. JSON, cookies and headers
 * cannot supply principals, grants, receipts or lease ownership. Not publicly mounted.
 * Service: Attio only. The bound service retains its current authorization,
 * exact-read/version checks, state, cancellation and write-uncertainty behavior.
 * Backend: server/attio/operations/service.js and the configured Attio client.
 * Retain allowed objects/sources, exact request-local read-before-update receipts,
 * approved fields, duplicate protection and uncertain-write state.
 * Result: Bounded JSON operation result; generic transport failures contain no raw
 * exceptions or credentials. Private capabilities remain behind this API boundary.
 */
import { dispatchOperation } from '../../../../../../server/operation-api/dispatch.js';

export function registerUpdateAttioRecordOperation(app) {
  app.post('/api/operations/attio/records/update', (c) =>
    dispatchOperation(c, 'update_attio_record'),
  );
}
