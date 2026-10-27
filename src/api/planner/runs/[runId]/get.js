/**
 * GET /api/planner/runs/:runId
 *
 * Why: Let the operator distinguish a queued/running/finished planner run from a failed
 * start.
 * Inputs: UUID runId path; no query or body.
 * Access: Dedicated plannerAuth Bearer-key check; website cookies/admin flags grant no
 * access.
 * Service and effects: plannerRuns.read only with request signal; no planner
 * cycle/model/source fetch is started.
 * Response and failure: 200 ready run status, 400 invalid ID/query, 403 denied, 404
 * missing, 503 unconfigured/unavailable. Existing store projection defines safe run
 * fields. no-store; does not expose operational logs.
 */
import { validUuid } from '../../../../../server/automation/validation.js';
import { apiError } from '../../../_shared/http.js';

export function registerApiPlannerRunsRunIdGet({ app, plannerRuns, plannerAuth }) {
  app.get('/api/planner/runs/:runId', async (c) => {
    c.header('cache-control', 'no-store');
    if (!plannerAuth.authorizeRequest(c.req.raw)) return apiError(c, 'access_denied', 403);
    const runId = c.req.param('runId');
    if (!validUuid(runId) || new URL(c.req.url).search) return apiError(c, 'invalid_request', 400);
    if (!plannerRuns?.read) return apiError(c, 'not_configured', 503);
    try {
      const result = await plannerRuns.read({ runId, signal: c.req.raw.signal });
      return c.json(
        result,
        result?.status === 'not_found' ? 404 : result?.status === 'ready' ? 200 : 503,
      );
    } catch {
      return c.json({ status: 'unavailable' }, 503);
    }
  });
}
