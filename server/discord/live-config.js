const id = value => typeof value === 'string' && /^[0-9]{1,20}$/.test(value);
const bounded = (value, fallback, max) => Number.isInteger(Number(value)) && Number(value) > 0 ? Math.min(max, Number(value)) : fallback;

// Credentials stay in this server-owned object, never in status/tool results.
export function readLiveDiscordConfig(env = process.env) {
  const botToken = (env.DISCORD_BOT_TOKEN || '').trim();
  const guildId = env.DISCORD_GUILD_ID || '';
  const enabled = env.DISCORD_LIVE_READ_ENABLED === 'true';
  return Object.freeze({enabled, configured: enabled && Boolean(botToken && id(guildId)), botToken, guildId,
    maxChannels: bounded(env.DISCORD_LIVE_MAX_CHANNELS, 16, 30),
    maxPages: bounded(env.DISCORD_LIVE_MAX_PAGES, 20, 100),
    maxMessages: bounded(env.DISCORD_LIVE_MAX_MESSAGES, 2000, 10000),
    maxRuntimeMs: bounded(env.DISCORD_LIVE_MAX_RUNTIME_MS, 45000, 120000),
    maxInputChars: bounded(env.DISCORD_LIVE_MAX_INPUT_CHARS, 500000, 2000000),
  });
}

export function liveDiscordStatus(config) {
  return {configured: config?.configured === true, enabled: config?.enabled === true,
    guildId: id(config?.guildId) ? config.guildId : null, access: 'explicit-local-operator-only'};
}
