const snowflake = value => typeof value === 'string' && /^[0-9]{1,20}$/.test(value);
const integer = (value, fallback, min, max) => Number.isInteger(Number(value)) && value !== '' && value != null ? Math.max(min, Math.min(max, Number(value))) : fallback;
/** Bot access and bounded metadata discovery; no archive or embedding settings. */
export function readDiscordConfig(env = process.env) {
  const botToken = (env.DISCORD_BOT_TOKEN || '').trim(), guildId = env.DISCORD_GUILD_ID || '';
  return Object.freeze({configured: Boolean(botToken && snowflake(guildId)), botToken, guildId, timezone:'America/New_York',
    pacing:Object.freeze({minIntervalMs:integer(env.DISCORD_REQUEST_INTERVAL_MS,750,500,5000),requestBudgetMs:90000}),
    discovery:Object.freeze({maxPages:integer(env.DISCORD_DISCOVERY_MAX_PAGES,200,1,1000),maxChannels:integer(env.DISCORD_DISCOVERY_MAX_CHANNELS,2000,1,10000),maxRuntimeMs:integer(env.DISCORD_DISCOVERY_MAX_RUNTIME_MS,120000,100,900000),pageSize:integer(env.DISCORD_DISCOVERY_PAGE_SIZE,100,1,100)})});
}
