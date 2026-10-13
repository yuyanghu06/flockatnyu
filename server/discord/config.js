const snowflake = value => typeof value === 'string' && /^[0-9]{1,20}$/.test(value);
const integer = (value, fallback, min, max) => Number.isInteger(Number(value)) && value !== '' && value != null ? Math.max(min, Math.min(max, Number(value))) : fallback;
export function readDiscordConfig(env = process.env) {
  const botToken = (env.DISCORD_BOT_TOKEN || '').trim(), guildId = env.DISCORD_GUILD_ID || '';
  const timezone = 'America/New_York';
  const backfillFrom = env.DISCORD_BACKFILL_FROM || '2026-01-01T00:00:00-05:00';
  const provider = env.EMBEDDING_PROVIDER || 'openai-compatible', model = env.EMBEDDING_MODEL || '';
  const baseUrl = env.EMBEDDING_BASE_URL || 'https://api.openai.com/v1';
  // The current archive mode stores originals/groups only. Stale deployment
  // flags must never reactivate embedding calls before a provider is selected.
  const embedding = Object.freeze({configured: false, disabledReason:'archive_storage_only', provider, model, apiKey:'', baseUrl, dimensions: 1536,
    batchSize: integer(env.EMBEDDING_BATCH_SIZE, 16, 1, 64), maxInputsPerRun: integer(env.EMBEDDING_MAX_INPUTS_PER_RUN, 100, 1, 1000)});
  return Object.freeze({configured: Boolean(botToken && snowflake(guildId) && Number.isFinite(Date.parse(backfillFrom)) && Date.parse(backfillFrom) <= Date.now()), botToken, guildId, timezone, backfillFrom,
    maxPagesPerChannel: integer(env.DISCORD_MAX_PAGES_PER_CHANNEL, 100, 1, 1000), maxMessagesPerRun: integer(env.DISCORD_MAX_MESSAGES_PER_RUN, 10000, 1, 100000),
    maxRuntimeMs: integer(env.DISCORD_MAX_RUNTIME_MS, 240000, 100, 900000),
    discovery:Object.freeze({maxPages:integer(env.DISCORD_DISCOVERY_MAX_PAGES,200,1,1000),maxChannels:integer(env.DISCORD_DISCOVERY_MAX_CHANNELS,2000,1,10000),maxRuntimeMs:integer(env.DISCORD_DISCOVERY_MAX_RUNTIME_MS,120000,100,900000),pageSize:integer(env.DISCORD_DISCOVERY_PAGE_SIZE,100,1,100)}),embedding});
}
