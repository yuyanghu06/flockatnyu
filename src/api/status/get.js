/**
 * GET /api/status
 *
 * Why: Tell the browser which assistant features are ready so it can show an honest
 * connection state.
 * Inputs: No request body or path parameters; existing query handling is unchanged.
 * Access: Attempts current request/source authorization; an unauthorized session is
 * reported as access.allowed=false instead of rejected here.
 * Service and effects: Reads injected configuration and Google client status only;
 * current Discord scope resolution stays in authorize. No write or model call.
 * Response and failure: 200 JSON chat/discord/miro/attio/contacts/treg/google/access
 * flags; no source bodies or credentials. no-store.
 */
export function registerApiStatusGet({
  app,
  authorize,
  config,
  discordStore,
  discordConfig,
  liveDiscordService,
  miroTools,
  attioTools,
  contactsTools,
  tregTools,
  googleClient,
}) {
  app.get('/api/status', async (c) => {
    const principal = await authorize(c);
    c.header('cache-control', 'no-store');
    return c.json({
      chat: {
        configured: config.configured,
        provider: config.provider || null,
        model: config.model || null,
      },
      discord: {
        configured: Boolean(discordStore.configured),
        syncConfigured: Boolean(discordConfig.configured),
        liveConfigured: liveDiscordService?.configured === true,
        liveAllowed: Boolean(principal?.liveDiscord),
        retrieval: 'live_only',
      },
      miro: { configured: miroTools?.configured === true, retrieval: 'live_read_only' },
      attio: { configured: attioTools?.configured === true },
      contacts: { configured: contactsTools?.configured === true },
      treg: { configured: tregTools?.configured === true },
      google: {
        ...(googleClient?.status?.() || {
          configured: false,
          oauthVerified: false,
          status: 'not_configured',
        }),
        allowed: principal?.googleAccess === true,
      },
      access: {
        mode: config.production ? 'members_required' : 'local_development',
        allowed: Boolean(principal),
        admin: principal?.isAdmin === true,
      },
    });
  });
}
