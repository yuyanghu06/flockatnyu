/**
 * POST /api/operations/contacts/records/update
 *
 * Why: Merge requested fields into an exactly read contact while preserving other data.
 * Input: JSON {arguments, phase?, preparation?}; phase is execute (default) or
 * internal preparation. Existing operation schemas and field bounds still apply.
 * Access: Private server-created Request binding only. JSON, cookies and headers
 * cannot supply principals, grants, receipts or lease ownership. Not publicly mounted.
 * Service: Saved Contacts. The bound service retains its current authorization,
 * exact-read/version checks, state, cancellation and write-uncertainty behavior.
 * Backend: server/contacts/operations/service.js and the Contacts store.
 * Edits/deletes require exact read/version receipts; native raw JSON and human
 * changes survive. Treg import consumes separately retained native result refs;
 * it never silently searches or enriches a person.
 * Result: Bounded JSON operation result; generic transport failures contain no raw
 * exceptions or credentials. Private capabilities remain behind this API boundary.
 */
import { dispatchOperation } from '../../../../../../server/operation-api/dispatch.js';

export function registerUpdateContactOperation(app) {
  app.post('/api/operations/contacts/records/update', (c) =>
    dispatchOperation(c, 'update_contact'),
  );
}
