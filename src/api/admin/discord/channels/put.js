/**
 * PUT /api/admin/discord/channels
 *
 * Why: Change one explicitly selected Discord channel policy through the existing
 * administrator controls.
 * Inputs: JSON<=8192 bytes/config.timeoutMs; only top-level channel accepted and
 * required. Configured guild must match channel.guildId; store validates remaining
 * fields.
 * Access: authorize requires authenticated isAdmin===true principal/current scope;
 * existing auth adapter retains session/Origin rules.
 * Service and effects: discordStore.configureChannel writes only its own channel policy
 * with principal/request signal. Does not read message history, write Calendar/map or
 * bypass live Discord permissions.
 * Response and failure: JSON store result with shared HTTP statuses; 400
 * malformed/unknown/guild-mismatched input, 403 denied. no-store; only actual store
 * outcomes establish applied changes.
 */
import { apiError, resultStatus, readJSON } from '../../../_shared/http.js';

export function registerApiAdminDiscordChannelsPut({
  app,
  authorize,
  config,
  discordStore,
  discordConfig,
}) {
  app.put('/api/admin/discord/channels', async (c) => {
    const principal = await authorize(c);
    if (!principal?.id || principal.isAdmin !== true) return apiError(c, 'access_denied', 403);
    let value;
    try {
      value = await readJSON(c.req.raw, config.timeoutMs, 8192);
    } catch {
      return apiError(c, 'invalid_request', 400);
    }
    if (
      !value ||
      Object.keys(value).some((key) => key !== 'channel') ||
      !value.channel ||
      !discordStore.configureChannel
    )
      return apiError(c, 'invalid_request', 400);
    if (discordConfig.guildId && value.channel.guildId !== discordConfig.guildId)
      return apiError(c, 'invalid_request', 400);
    const result = await discordStore.configureChannel({
      principal,
      channel: value.channel,
      signal: c.req.raw.signal,
    });
    c.header('cache-control', 'no-store');
    return c.json(result, resultStatus(result.status));
  });
}
