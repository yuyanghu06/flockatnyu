/**
 * GET /api/map/presence
 *
 * Why: Give the campus view the saved people, plans and activities it is allowed to
 * display.
 * Inputs: No body/path parameters; existing query handling unchanged.
 * Access: Requires authorized nonblank principal ID and allowedSourceIds; authorize
 * refreshes current source scope.
 * Service and effects: mapPresenceService.read only with principal/request signal. Reads
 * saved map data; this route does not fetch Discord/Calendar/Gmail originals or write
 * activity.
 * Response and failure: JSON service result with shared status mapping; 503
 * {status:"not_configured"|"unavailable", buildings:[]} on missing/throwing service, 403
 * denied. no-store, nosniff. Failure status is preserved instead of claiming an empty
 * successful map.
 */
import { apiError, resultStatus } from '../../_shared/http.js';

export function registerApiMapPresenceGet({ app, authorize, mapPresenceService }) {
  app.get('/api/map/presence', async (c) => {
    c.header('cache-control', 'no-store');
    c.header('x-content-type-options', 'nosniff');
    const principal = await authorize(c);
    if (!principal?.id || !Array.isArray(principal.allowedSourceIds))
      return apiError(c, 'access_denied', 403);
    if (!mapPresenceService?.read) return c.json({ status: 'not_configured', buildings: [] }, 503);
    try {
      const result = await mapPresenceService.read({ principal, signal: c.req.raw.signal });
      return c.json(result, resultStatus(result.status));
    } catch {
      return c.json({ status: 'unavailable', buildings: [] }, 503);
    }
  });
}
