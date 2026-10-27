/**
 * POST /api/operations/google/gmail/send
 *
 * Why: Send explicitly requested plain-text email without retrying an uncertain outcome.
 * Input: JSON {arguments, phase?, preparation?}; phase is execute (default) or
 * internal preparation. Existing operation schemas and field bounds still apply.
 * Access: Private server-created Request binding only. JSON, cookies and headers
 * cannot supply principals, grants, receipts or lease ownership. Not publicly mounted.
 * Service: Fixed Gmail account and send receipts. The bound service retains its current authorization,
 * exact-read/version checks, state, cancellation and write-uncertainty behavior.
 * Backend: server/google/operations/google.js (reads) or gmail-send.js (send).
 * Reads require Google account access; queries are bounded and message IDs exact.
 * Send uses literal to/subject/body and trusted actor/request identity, durable
 * receipts and unknown-outcome fences; provider acceptance does not mean delivery.
 * Result: Bounded JSON operation result; generic transport failures contain no raw
 * exceptions or credentials. Private capabilities remain behind this API boundary.
 */
import { dispatchOperation } from '../../../../../../server/operation-api/dispatch.js';

export function registerSendGmailOperation(app) {
  app.post('/api/operations/google/gmail/send', (c) => dispatchOperation(c, 'send_gmail'));
}
