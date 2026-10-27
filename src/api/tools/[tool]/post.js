/**
 * POST /api/tools/:tool
 *
 * Why: Execute one explicitly selected existing tool and return its own result
 * separately.
 * Inputs: Path tool converts hyphens to underscores; JSON arguments<=8192 bytes with
 * config.timeoutMs read bound. Adapter owns its schema/field limits.
 * Access: Requires authorize principal ID/allowedSourceIds, then the selected adapter
 * enforces service permissions and exact-write checks. Existing auth adapter owns
 * Origin/session policy.
 * Service and effects: Dispatches exactly one matching Discord, Google, Miro, Attio,
 * Treg or map adapter; no hidden cross-service sequence. Supplies request signal/time
 * context; Discord direct calls retain empty userMessage context.
 * Response and failure: JSON adapter result with shared HTTP status map; 400 malformed
 * JSON, 403 denied, 503 no configured matching adapter. Effects/receipts and
 * unavailable/uncertain states stay with the named adapter; this route never asserts
 * write success itself. no-store.
 */
import { createTimeContext } from '../../../../server/time-zone.js';
import { apiError, resultStatus, readJSON } from '../../_shared/http.js';

export function registerApiToolsToolPost({
  app,
  authorize,
  config,
  now,
  liveDiscordTools,
  googleTools,
  miroTools,
  attioTools,
  tregTools,
  mapTools,
}) {
  app.post('/api/tools/:tool', async (c) => {
    const principal = await authorize(c);
    if (!principal?.id || !Array.isArray(principal.allowedSourceIds))
      return apiError(c, 'access_denied', 403);
    let value;
    try {
      value = await readJSON(c.req.raw, config.timeoutMs, 8192);
    } catch {
      return apiError(c, 'invalid_request', 400);
    }
    const name = c.req.param('tool').replaceAll('-', '_');
    const adapter = liveDiscordTools?.tools?.some((tool) => tool.name === name)
      ? liveDiscordTools
      : googleTools?.tools?.some((tool) => tool.name === name)
        ? googleTools
        : miroTools?.tools?.some((tool) => tool.name === name)
          ? miroTools
          : attioTools?.tools?.some((tool) => tool.name === name)
            ? attioTools
            : tregTools?.tools?.some((tool) => tool.name === name)
              ? tregTools
              : mapTools?.tools?.some((tool) => tool.name === name)
                ? mapTools
                : null;
    if (!adapter) return apiError(c, 'not_configured', 503);
    const timeContext = createTimeContext({ now: now() });
    const result = await adapter.execute({
      name,
      arguments: value,
      principal,
      signal: c.req.raw.signal,
      timeContext,
      ...(adapter === liveDiscordTools ? { userMessage: '' } : {}),
    });
    c.header('cache-control', 'no-store');
    return c.json(result, resultStatus(result.status));
  });
}
