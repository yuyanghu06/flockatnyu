/**
 * POST /api/gmail/send
 *
 * Why: Send the user-requested plain-text email once, with a durable request ID for safe
 * status checks.
 * Inputs: No query; JSON exactly {requestId, to, subject, body}; UUID ID, 1–10 literal
 * addresses<=320 chars, subject<=200, body<=20000 chars/65536 UTF-8 bytes. JSON
 * read<=150000 bytes/<=10 s; shared contract validates Unicode/header safety.
 * Access: Requires googleAccess principal, rejects cross-site and validates exact Origin
 * against request/configured origins (local-only development exception). Existing
 * session checks remain.
 * Service and effects: Calls send service once with normalized input/principal/request
 * signal. Service owns receipt/account/scope and duplicate-send protection; no automatic
 * retry, attachments, CC/BCC or source fetch here.
 * Response and failure: 200 projected confirmed receipt or replay; 400 invalid, 403
 * forbidden, 409 request conflict, 429 rate limit, 503 disabled/setup/provider/uncertain
 * result. Uncertain errors keep requestId, sent:"unknown", write_outcome_unknown; never
 * claim delivery. Private no-store.
 */
import { normalizeGmailSendInput } from '../../../../server/google/gmail-send-contract.js';

import { createGmailSendHttpContext } from '../../_shared/gmail-send.js';

export function registerApiGmailSendPost({ app, service, auth, config, readJSON } = {}) {
  const { admit, respond, fail, queryFree } = createGmailSendHttpContext({ auth, config });
  app.post('/api/gmail/send', async (c) => {
    const principal = await admit(c, true);
    if (!principal) return fail(c, 'forbidden');
    if (!queryFree(c)) return fail(c, 'invalid_request');
    let input;
    try {
      input = normalizeGmailSendInput(
        await readJSON(c.req.raw, Math.min(config?.timeoutMs || 10000, 10000), 150000),
      );
    } catch {
      return fail(c, 'invalid_request');
    }
    if (!service?.send) return fail(c, 'not_configured');
    try {
      return respond(c, await service.send({ ...input, principal, signal: c.req.raw.signal }));
    } catch {
      return respond(c, {
        status: 'unavailable',
        sent: 'unknown',
        reason: 'write_outcome_unknown',
        requestId: input.requestId,
      });
    }
  });
}
