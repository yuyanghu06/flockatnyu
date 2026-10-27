/**
 * GET /api/gmail/send-status
 *
 * Why: Explain whether the connected mailbox can send before the user tries an email.
 * Inputs: No query, path parameters or body.
 * Access: Authenticated nonblank principal with googleAccess=true; cross-site rejected.
 * Read does not require explicit Origin here; auth adapter retains session policy.
 * Service and effects: Calls only send service readiness with principal/request signal;
 * no email send, Contacts write or model call.
 * Response and failure: 200 ready with allowlisted readiness flags; 403 forbidden, 400
 * query invalid, 503 setup/permission/account/service failures, 429 rate limit where
 * returned. Respond projection removes private provider fields. Private no-store.
 */
import { createGmailSendHttpContext } from '../../_shared/gmail-send.js';

export function registerApiGmailSendStatusGet({ app, service, auth, config } = {}) {
  const { admit, respond, fail, queryFree } = createGmailSendHttpContext({ auth, config });
  app.get('/api/gmail/send-status', async (c) => {
    const principal = await admit(c);
    if (!principal) return fail(c, 'forbidden');
    if (!queryFree(c)) return fail(c, 'invalid_request');
    if (!service?.readiness) return fail(c, 'not_configured');
    try {
      return respond(c, await service.readiness({ principal, signal: c.req.raw.signal }));
    } catch {
      return respond(c, { status: 'unavailable', sent: false });
    }
  });
}
