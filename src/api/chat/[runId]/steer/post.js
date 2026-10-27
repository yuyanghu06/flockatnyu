/**
 * POST /api/chat/:runId/steer
 *
 * Why: Add a queued correction to the current reply while keeping it bound to the same
 * user, contact and request.
 * Inputs: runId path; JSON<=32768 bytes/config.timeoutMs. Registry validates
 * messageId(1–80 safe chars), nonblank text<=8000 and optional contactContext; steering
 * capability comes in x-flock-steering-token.
 * Access: Requires authorized principal/source scope, rejects cross-site; registry binds
 * principal, exact Origin and per-run token. Tokens are not conversation text.
 * Service and effects: steeringRuns.enqueue updates only the in-memory active-run queue;
 * does not directly dispatch provider tools or writes. Existing stream later
 * acknowledges application.
 * Response and failure: 202 accepted with messageId/sequence/applied; 400 invalid, 403
 * invalid actor/token/origin, 409 closed/conflict/contact mismatch, 413 input limit.
 * no-store. HTTP acceptance alone does not mean the model incorporated the correction.
 */
import { apiError, readJSON } from '../../../_shared/http.js';

export function registerApiChatRunIdSteerPost({ app, authorize, config, steeringRuns }) {
  app.post('/api/chat/:runId/steer', async (c) => {
    const principal = await authorize(c);
    if (
      !principal?.id ||
      !Array.isArray(principal.allowedSourceIds) ||
      c.req.header('sec-fetch-site') === 'cross-site'
    )
      return apiError(c, 'access_denied', 403);
    let body;
    try {
      body = await readJSON(c.req.raw, config.timeoutMs, 32768);
    } catch {
      return apiError(c, 'invalid_request', 400);
    }
    const result = steeringRuns.enqueue(c.req.param('runId'), {
      principal,
      origin: c.req.header('origin'),
      token: c.req.header('x-flock-steering-token'),
      body,
    });
    const { httpStatus, ...data } = result;
    c.header('cache-control', 'no-store');
    return c.json(data, httpStatus);
  });
}
