/**
 * GET /api/map/people/:personId/avatar
 *
 * Why: Show an authorized person portrait without exposing private Storage URLs to the
 * browser.
 * Inputs: Exact canonical person-bound avatarProxyPath(personId), no query or body.
 * Invalid/noncanonical/missing-service paths are 404.
 * Access: Requires authorized principal ID/allowedSourceIds and current source scope
 * through authorize. Profile/storage access stays with mapAvatarService.
 * Service and effects: mapAvatarService.read only with personId/principal/request
 * signal. No map mutation or arbitrary external image retrieval.
 * Response and failure: 200 validated Uint 8 Array PNG, inline; 403 denied, 404
 * missing/invalid/non-PNG, 503 unavailable. Private no-store, nosniff; internal object
 * URLs/credentials are not returned.
 */
import { avatarProxyPath } from '../../../../../../server/map/avatars.js';
import { apiError } from '../../../../_shared/http.js';

export function registerApiMapPeoplePersonIdAvatarGet({ app, authorize, mapAvatarService }) {
  app.get('/api/map/people/:personId/avatar', async (c) => {
    c.header('cache-control', 'private, no-store');
    c.header('x-content-type-options', 'nosniff');
    const principal = await authorize(c);
    if (!principal?.id || !Array.isArray(principal.allowedSourceIds))
      return apiError(c, 'access_denied', 403);
    const url = new URL(c.req.url),
      personId = c.req.param('personId');
    if (
      url.search ||
      url.pathname !== avatarProxyPath(personId) ||
      mapAvatarService?.configured !== true ||
      !mapAvatarService?.read
    )
      return c.json({ status: 'not_found' }, 404);
    try {
      const result = await mapAvatarService.read({ personId, principal, signal: c.req.raw.signal });
      if (
        result?.status === 'ok' &&
        result.contentType === 'image/png' &&
        result.bytes instanceof Uint8Array
      ) {
        c.header('content-type', 'image/png');
        c.header('content-disposition', 'inline');
        return c.body(result.bytes, 200);
      }
      return c.json(
        { status: result?.status === 'unavailable' ? 'unavailable' : 'not_found' },
        result?.status === 'unavailable' ? 503 : 404,
      );
    } catch {
      return c.json({ status: 'unavailable' }, 503);
    }
  });
}
