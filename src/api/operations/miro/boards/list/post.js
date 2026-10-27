/**
 * POST /api/operations/miro/boards/list
 *
 * Why: List allowed boards as navigation rather than evidence of their contents.
 * Input: JSON {arguments, phase?, preparation?}; phase is execute (default) or
 * internal preparation. Existing operation schemas and field bounds still apply.
 * Access: Private server-created Request binding only. JSON, cookies and headers
 * cannot supply principals, grants, receipts or lease ownership. Not publicly mounted.
 * Service: Authorized Miro catalogue. The bound service retains its current authorization,
 * exact-read/version checks, state, cancellation and write-uncertainty behavior.
 * Backend: server/miro/operations/service.js, then official read-only Miro MCP.
 * Keep published board access, bounded parsing, cursor/fragment coverage and
 * unavailable/partial results. No Miro REST snapshot or write capability.
 * Result: Bounded JSON operation result; generic transport failures contain no raw
 * exceptions or credentials. Private capabilities remain behind this API boundary.
 */
import { dispatchOperation } from '../../../../../../server/operation-api/dispatch.js';

export function registerListMiroBoardsOperation(app) {
  app.post('/api/operations/miro/boards/list', (c) => dispatchOperation(c, 'list_miro_boards'));
}
