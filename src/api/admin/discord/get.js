/**
 * GET /api/admin/discord
 *
 * Why: Let an administrator see the current Discord channel access policy before
 * changing it.
 * Inputs: No request body/path parameters; current query handling unchanged.
 * Access: authorize must return an authenticated principal with isAdmin===true and
 * current scope; ordinary session access is insufficient.
 * Service and effects: discordStore.listChannels only with principal/request signal;
 * appends configured guild/sync metadata. No Discord content import or policy write.
 * Response and failure: JSON channel result plus sync flags using shared status mapping;
 * 403 access_denied otherwise. no-store; private source content and credentials are not
 * returned.
 */
import { apiError, resultStatus } from '../../_shared/http.js';

export function registerApiAdminDiscordGet({ app, authorize, discordStore, discordConfig }) {
  app.get('/api/admin/discord', async (c) => {
    const principal = await authorize(c);
    if (!principal?.id || principal.isAdmin !== true) return apiError(c, 'access_denied', 403);
    c.header('cache-control', 'no-store');
    const result = await discordStore.listChannels({ principal, signal: c.req.raw.signal });
    return c.json(
      {
        ...result,
        sync: {
          configured: Boolean(discordConfig.configured),
          guildId: discordConfig.guildId || null,
        },
      },
      resultStatus(result.status),
    );
  });
}
