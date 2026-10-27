import { validUuid } from '../../../server/automation/validation.js';

export function developmentAuth(c, config) {
  if (config.production) return null;
  // This value comes from the node adapter, never a client-supplied header.
  const address = c.env?.incoming?.socket?.remoteAddress;
  if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address)) return null;
  try {
    const localHosts = ['localhost', '127.0.0.1', '[::1]'];
    const requestUrl = new URL(c.req.url);
    if (
      (/^\/api\/map\/people\/[^/]+\/avatar$/.test(requestUrl.pathname) ||
        /^\/api\/contacts(?:\/|$)/.test(requestUrl.pathname)) &&
      c.req.header('sec-fetch-site') === 'cross-site'
    )
      return null;
    if (!localHosts.includes(requestUrl.hostname)) return null;
    const host = c.req.header('host');
    if (host && !localHosts.includes(new URL(`http://${host}`).hostname)) return null;
    const originHeader = c.req.header('origin');
    // Same-origin GET fetches generally omit Origin. Only the exact read-only
    // routes below receive this exemption; mutation requests still require Origin.
    const contactRead =
      requestUrl.pathname === '/api/contacts' ||
      (/^\/api\/contacts\/[^/]+$/.test(requestUrl.pathname) &&
        validUuid(requestUrl.pathname.split('/').at(-1)));
    const gmailSendRead =
      requestUrl.pathname === '/api/gmail/send-status' ||
      (/^\/api\/gmail\/send\/[^/]+$/.test(requestUrl.pathname) &&
        validUuid(requestUrl.pathname.split('/').at(-1)));
    if (
      !originHeader &&
      c.req.method === 'GET' &&
      (contactRead ||
        gmailSendRead ||
        ['/api/status', '/api/admin/discord', '/api/tools', '/api/map/presence'].includes(
          requestUrl.pathname,
        ) ||
        (!requestUrl.search &&
          (/^\/api\/map\/people\/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\/avatar$/.test(
            requestUrl.pathname,
          ) ||
            /^\/api\/planner\/runs\/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(
              requestUrl.pathname,
            ))))
    ) {
      return {
        id: 'local-development',
        allowedSourceIds: [...config.allowedSourceIds],
        isAdmin: config.devAdminEnabled === true,
        ...(config.devLiveDiscordEnabled && /^[0-9]{1,20}$/.test(config.discordGuildId)
          ? { liveDiscord: { mode: 'local-operator', guildId: config.discordGuildId } }
          : {}),
        ...(config.devGoogleEnabled ? { googleAccess: true } : {}),
      };
    }
    const origin = new URL(originHeader);
    if (
      !['http:', 'https:'].includes(origin.protocol) ||
      !['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname)
    )
      return null;
  } catch {
    return null;
  }
  return {
    id: 'local-development',
    allowedSourceIds: [...config.allowedSourceIds],
    isAdmin: config.devAdminEnabled === true,
    ...(config.devLiveDiscordEnabled && /^[0-9]{1,20}$/.test(config.discordGuildId)
      ? { liveDiscord: { mode: 'local-operator', guildId: config.discordGuildId } }
      : {}),
    ...(config.devGoogleEnabled ? { googleAccess: true } : {}),
  };
}
