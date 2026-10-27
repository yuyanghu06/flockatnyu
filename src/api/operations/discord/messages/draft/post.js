/**
 * POST /api/operations/discord/messages/draft
 *
 * Why: Prepare an authorized conversation-local draft without sending a message.
 * Input: JSON {arguments, phase?, preparation?}; phase is execute (default) or
 * internal preparation. Existing operation schemas and field bounds still apply.
 * Access: Private server-created Request binding only. JSON, cookies and headers
 * cannot supply principals, grants, receipts or lease ownership. Not publicly mounted.
 * Service: Discord metadata and invoking conversation. The bound service retains its current authorization,
 * exact-read/version checks, state, cancellation and write-uncertainty behavior.
 * Backend: server/discord/operations reads, live-summary or draft service.
 * Enforce current guild/channel policy, source grants and bounded live reads.
 * Summaries use authorized Discord evidence only; drafts never send messages
 * or read a different provider. No durable source archive is introduced.
 * Result: Bounded JSON operation result; generic transport failures contain no raw
 * exceptions or credentials. Private capabilities remain behind this API boundary.
 */
import { dispatchOperation } from '../../../../../../server/operation-api/dispatch.js';

export function registerDraftDiscordMessageOperation(app) {
  app.post('/api/operations/discord/messages/draft', (c) =>
    dispatchOperation(c, 'draft_discord_message'),
  );
}
