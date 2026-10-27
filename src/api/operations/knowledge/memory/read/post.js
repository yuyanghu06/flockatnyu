/**
 * POST /api/operations/knowledge/memory/read
 *
 * Why: Read the current club note and its exact version.
 * Input: JSON {arguments, phase?, preparation?}; phase is execute (default) or
 * internal preparation. Existing operation schemas and field bounds still apply.
 * Access: Private server-created Request binding only. JSON, cookies and headers
 * cannot supply principals, grants, receipts or lease ownership. Not publicly mounted.
 * Service: Saved shared memory. The bound service retains its current authorization,
 * exact-read/version checks, state, cancellation and write-uncertainty behavior.
 * Backend: server/knowledge/operations/memory.js and the saved-memory store.
 * Reads use trusted principal context; updates require the current exact saved
 * version and existing field/content checks. No source originals are fetched.
 * Result: Bounded JSON operation result; generic transport failures contain no raw
 * exceptions or credentials. Private capabilities remain behind this API boundary.
 */
import { dispatchOperation } from '../../../../../../server/operation-api/dispatch.js';

export function registerReadMemoryOperation(app) {
  app.post('/api/operations/knowledge/memory/read', (c) => dispatchOperation(c, 'read_memory'));
}
