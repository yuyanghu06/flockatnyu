/**
 * POST /api/planner/runs
 *
 * Why: Let an authorized operator request one standard planner cycle and receive a
 * status URL.
 * Inputs: No query; JSON body<=4096 bytes/<=10 s read, validated by
 * validateManualRunInput. Optional exact Discord channel selection retains existing
 * queued-original-only scope.
 * Access: Dedicated plannerAuth Bearer-key check only; website session/admin privileges
 * do not authorize this endpoint. No separate browser Origin grant.
 * Service and effects: plannerRuns.start queues a manual run with request signal. This
 * route does not import channel history or directly call Calendar/map/model services.
 * Response and failure: 202 {status:"queued", runId, statusUrl} plus Location; 400
 * invalid, 403 denied, 408 aborted, 429 capacity/rate limit, 503 missing
 * service/unavailable. no-store; response does not assert that planner actions already
 * succeeded.
 */
import { validateManualRunInput } from '../../../../server/automation/manual-runs.js';
import { validUuid } from '../../../../server/automation/validation.js';
import { apiError, readJSON } from '../../_shared/http.js';

export function registerApiPlannerRunsPost({ app, config, plannerRuns, plannerAuth }) {
  app.post('/api/planner/runs', async (c) => {
    c.header('cache-control', 'no-store');
    if (!plannerAuth.authorizeRequest(c.req.raw)) return apiError(c, 'access_denied', 403);
    if (new URL(c.req.url).search) return apiError(c, 'invalid_request', 400);
    let input;
    try {
      input = validateManualRunInput(
        await readJSON(c.req.raw, Math.min(config.timeoutMs || 10000, 10000), 4096),
      );
    } catch {
      return apiError(c, 'invalid_request', 400);
    }
    if (!input) return apiError(c, 'invalid_request', 400);
    if (!plannerRuns?.start) return apiError(c, 'not_configured', 503);
    try {
      const result = await plannerRuns.start({ ...input, signal: c.req.raw.signal });
      if (result.status === 'queued' && validUuid(result.runId)) {
        const statusUrl = `/api/planner/runs/${result.runId}`;
        c.header('location', statusUrl);
        return c.json({ status: 'queued', runId: result.runId, statusUrl }, 202);
      }
      return c.json(
        {
          status: [
            'capacity',
            'rate_limited',
            'invalid_request',
            'not_configured',
            'aborted',
          ].includes(result?.status)
            ? result.status
            : 'unavailable',
        },
        ['capacity', 'rate_limited'].includes(result?.status)
          ? 429
          : result?.status === 'invalid_request'
            ? 400
            : result?.status === 'aborted'
              ? 408
              : 503,
      );
    } catch {
      return c.json({ status: 'unavailable' }, 503);
    }
  });
}
