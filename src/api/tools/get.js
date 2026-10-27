/**
 * GET /api/tools
 *
 * Why: Tell an authorized client which named tools are available instead of guessing
 * service capabilities.
 * Inputs: No body/path parameters; existing query behavior unchanged.
 * Access: Requires authorize principal ID and allowedSourceIds. Individual tools retain
 * their own source and write checks when later executed.
 * Service and effects: Combines injected tool metadata only; no tool execution, model
 * call, source content read or write.
 * Response and failure: 200 {tools:[definitions], policy:{discord:"live_only"}} or 403
 * access_denied. no-store. Listing a tool does not authorize any particular future
 * action.
 */
import { apiError } from '../_shared/http.js';

export function registerApiToolsGet({
  app,
  authorize,
  liveDiscordTools,
  googleTools,
  gmailSendTools,
  miroTools,
  attioTools,
  bugReportTools,
  memoryTools,
  contactsTools,
  tregTools,
  mapTools,
}) {
  app.get('/api/tools', async (c) => {
    const principal = await authorize(c);
    if (!principal?.id || !Array.isArray(principal.allowedSourceIds))
      return apiError(c, 'access_denied', 403);
    c.header('cache-control', 'no-store');
    return c.json({
      tools: [
        ...(liveDiscordTools?.tools || []),
        ...(googleTools?.tools || []),
        ...(gmailSendTools?.tools || []),
        ...(miroTools?.tools || []),
        ...(attioTools?.tools || []),
        ...(bugReportTools?.tools || []),
        ...(memoryTools?.tools || []),
        ...(contactsTools?.tools || []),
        ...(tregTools?.tools || []),
        ...(mapTools?.tools || []),
      ],
      policy: { discord: 'live_only' },
    });
  });
}
