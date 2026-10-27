/**
 * GET /api/gmail/send/:requestId
 *
 * Why: Check an earlier send receipt so a lost response does not cause a duplicate
 * email.
 * Inputs: UUID requestId path; no query or body.
 * Access: Authenticated principal with googleAccess=true; rejects cross-site. Receipt
 * ownership remains enforced by service.
 * Service and effects: send service getStatus only, with principal/request signal. This
 * endpoint never dispatches an email or retries a send.
 * Response and failure: 200 projected receipt/status, 400 invalid, 403 forbidden, 404
 * missing, 409 conflict, 429 rate limited, 503 unavailable/setup. A failed status read
 * preserves sent:"unknown" and write_outcome_unknown; only validated confirmed receipts
 * expose message/thread IDs. Private no-store.
 */
import { validUuid } from '../../../../../server/automation/validation.js';
import { createGmailSendHttpContext } from '../../../_shared/gmail-send.js';

export function registerApiGmailSendRequestIdGet({ app, service, auth, config } = {}) {
  const { admit, respond, fail, queryFree } = createGmailSendHttpContext({ auth, config });
  app.get('/api/gmail/send/:requestId', async (c) => {
    const principal = await admit(c);
    if (!principal) return fail(c, 'forbidden');
    const requestId = c.req.param('requestId');
    if (!queryFree(c) || !validUuid(requestId)) return fail(c, 'invalid_request');
    if (!service?.getStatus) return fail(c, 'not_configured');
    try {
      return respond(
        c,
        await service.getStatus({ requestId, principal, signal: c.req.raw.signal }),
      );
    } catch {
      return respond(c, {
        status: 'unavailable',
        sent: 'unknown',
        reason: 'write_outcome_unknown',
      });
    }
  });
}
