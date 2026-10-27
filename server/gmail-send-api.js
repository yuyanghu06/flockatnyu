import { normalizeGmailSendInput } from './google/gmail-send-contract.js';
import { plainObject, validUuid } from './automation/validation.js';

const codes = Object.freeze({ ready: 200, forbidden: 403, invalid_request: 400, conflict: 409, not_found: 404,
  not_configured: 503, disabled: 503, schema_not_ready: 503, reauthorization_required: 503, account_mismatch: 503,
  rate_limited: 429, google_unavailable: 503, aborted: 503, timeout: 503, invalid_response: 503,
  response_too_large: 503, unavailable: 503 });
const local = host => ['localhost', '127.0.0.1', '[::1]'].includes(host);
const providerId = value => typeof value === 'string' && /^[a-fA-F0-9]{1,64}$/.test(value);
const allowed = principal => typeof principal?.id === 'string' && principal.id.trim().length > 0 && principal.googleAccess === true;

export function registerGmailSendApi({ app, service, auth, config, readJSON } = {}) {
  async function admit(c, mutation = false) {
    c.header('cache-control', 'private, no-store'); c.header('x-content-type-options', 'nosniff');
    if (c.req.header('sec-fetch-site') === 'cross-site') return null;
    if (mutation) {
      try {
        const value = c.req.header('origin'), origin = new URL(value), request = new URL(c.req.url);
        if (!['http:', 'https:'].includes(origin.protocol) || origin.origin !== value
          || origin.origin !== request.origin && !(config?.allowedOrigins || []).includes(origin.origin)
            && !(config?.production !== true && local(origin.hostname) && local(request.hostname))) return null;
      } catch { return null; }
    }
    try { const principal = await auth(c, config); return allowed(principal) ? principal : null; } catch { return null; }
  }
  const respond = (c, result) => {
    let value = { status: 'unavailable', sent: 'unknown', reason: 'write_outcome_unknown' };
    if (plainObject(result) && Object.hasOwn(codes, result.status)) {
      value = { status: result.status };
      for (const key of ['accepted', 'replayed', 'blocked', 'configured', 'enabled', 'receiptStoreReady', 'accountVerified', 'sendScopeGranted']) {
        if (typeof result[key] === 'boolean') value[key] = result[key];
      }
      if ([true, false, 'unknown'].includes(result.sent)) value.sent = result.sent;
      if (validUuid(result.requestId)) value.requestId = result.requestId;
      if (['write_outcome_unknown', 'request_conflict'].includes(result.reason)) value.reason = result.reason;
      if (result.sent === true) {
        const receipt = result.gmailSend;
        if (result.status !== 'ready' || result.accepted !== true || receipt?.operation !== 'sent'
          || !validUuid(receipt.requestId) || !providerId(receipt.messageId)
          || receipt.threadId !== undefined && !providerId(receipt.threadId)) value = { status: 'unavailable', sent: 'unknown', reason: 'write_outcome_unknown' };
        else value.gmailSend = { operation: 'sent', requestId: receipt.requestId, messageId: receipt.messageId,
          ...(receipt.threadId === undefined ? {} : { threadId: receipt.threadId }) };
      }
    }
    return c.json(value, codes[value.status]);
  };
  const fail = (c, status) => c.json({ status, sent: false }, codes[status]);
  const queryFree = c => !new URL(c.req.url).search;
  app.get('/api/gmail/send-status', async c => {
    const principal = await admit(c); if (!principal) return fail(c, 'forbidden');
    if (!queryFree(c)) return fail(c, 'invalid_request');
    if (!service?.readiness) return fail(c, 'not_configured');
    try { return respond(c, await service.readiness({ principal, signal: c.req.raw.signal })); }
    catch { return respond(c, { status: 'unavailable', sent: false }); }
  });
  app.get('/api/gmail/send/:requestId', async c => {
    const principal = await admit(c); if (!principal) return fail(c, 'forbidden');
    const requestId = c.req.param('requestId');
    if (!queryFree(c) || !validUuid(requestId)) return fail(c, 'invalid_request');
    if (!service?.getStatus) return fail(c, 'not_configured');
    try { return respond(c, await service.getStatus({ requestId, principal, signal: c.req.raw.signal })); }
    catch { return respond(c, { status: 'unavailable', sent: 'unknown', reason: 'write_outcome_unknown' }); }
  });
  app.post('/api/gmail/send', async c => {
    const principal = await admit(c, true); if (!principal) return fail(c, 'forbidden');
    if (!queryFree(c)) return fail(c, 'invalid_request');
    let input;
    try { input = normalizeGmailSendInput(await readJSON(c.req.raw, Math.min(config?.timeoutMs || 10000, 10000), 150000)); }
    catch { return fail(c, 'invalid_request'); }
    if (!service?.send) return fail(c, 'not_configured');
    try { return respond(c, await service.send({ ...input, principal, signal: c.req.raw.signal })); }
    catch { return respond(c, { status: 'unavailable', sent: 'unknown', reason: 'write_outcome_unknown', requestId: input.requestId }); }
  });
}
