/**
 * POST /api/operations/discord/messages/window
 *
 * Why: Read one channel/time window with honest coverage and no implicit summary call.
 * Input: JSON {arguments, phase?, preparation?}; phase is execute (default) or
 * internal preparation. Existing operation schemas and field bounds still apply.
 * Access: Private server-created Request binding only. JSON, cookies and headers
 * cannot supply principals, grants, receipts or lease ownership. Not publicly mounted.
 * Service: Authorized live Discord reads. The bound service retains its current authorization,
 * exact-read/version checks, state, cancellation and write-uncertainty behavior.
 * Backend: server/discord/operations reads, live-summary or draft service.
 * Enforce current guild/channel policy, source grants and bounded live reads.
 * Summaries use authorized Discord evidence only; drafts never send messages
 * or read a different provider. No durable source archive is introduced.
 * Result: Bounded JSON operation result; generic transport failures contain no raw
 * exceptions or credentials. Private capabilities remain behind this API boundary.
 */
import { dispatchOperation } from '../../../../../../server/operation-api/dispatch.js';

export function registerReadDiscordWindowOperation(app) {
  app.post('/api/operations/discord/messages/window', (c) =>
    dispatchOperation(c, 'read_discord_window'),
  );
}
