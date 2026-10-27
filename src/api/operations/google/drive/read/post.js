/**
 * POST /api/operations/google/drive/read
 *
 * Why: Read supported bounded file content with the existing partial-content limits.
 * Input: JSON {arguments, phase?, preparation?}; phase is execute (default) or
 * internal preparation. Existing operation schemas and field bounds still apply.
 * Access: Private server-created Request binding only. JSON, cookies and headers
 * cannot supply principals, grants, receipts or lease ownership. Not publicly mounted.
 * Service: Authorized Drive. The bound service retains its current authorization,
 * exact-read/version checks, state, cancellation and write-uncertainty behavior.
 * Backend: server/google/operations/google.js, then the configured Drive client.
 * Fixed-account reads only; query<=500 characters. IDs and opaque page tokens
 * retain provider validation. This endpoint grants no Drive write capability.
 * Result: Bounded JSON operation result; generic transport failures contain no raw
 * exceptions or credentials. Private capabilities remain behind this API boundary.
 */
import { dispatchOperation } from '../../../../../../server/operation-api/dispatch.js';

export function registerReadDriveOperation(app) {
  app.post('/api/operations/google/drive/read', (c) => dispatchOperation(c, 'read_drive'));
}
