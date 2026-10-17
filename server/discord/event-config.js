import {readDiscordConfig} from './config.js';

export function readDiscordEventConfig(env = process.env) {
  const discord = readDiscordConfig(env);
  return Object.freeze({...discord, enabled: env.DISCORD_EVENTS_ENABLED === 'true',
    // Ingestion covers this server's current eligible catalogue; assistant read
    // scopes remain independently configured on the assistant service.
    maxPending: 100, metadataRefreshMs: 3600000});
}
