import {readDiscordConfig} from './config.js';

const bounded = (value, fallback, min, max) => value != null && value !== '' && Number.isInteger(Number(value)) ? Math.max(min, Math.min(max, Number(value))) : fallback;

/** Explicit opt-in, bounded process-local state; never a source archive. */
export function readDiscordChatConfig(env = process.env) {
  const discord = readDiscordConfig(env);
  return Object.freeze({...discord, enabled: env.DISCORD_CHAT_ENABLED === 'true',
    maxConcurrent: bounded(env.DISCORD_CHAT_MAX_CONCURRENT, 3, 1, 10),
    perUserConcurrent: bounded(env.DISCORD_CHAT_PER_USER_CONCURRENT, 1, 1, 2),
    requestsPerUserHour: bounded(env.DISCORD_CHAT_REQUESTS_PER_USER_HOUR, 20, 1, 100),
    requestTimeoutMs: bounded(env.DISCORD_CHAT_TIMEOUT_MS, 1200000, 1000, 1200000),
    historyTtlMs: bounded(env.DISCORD_CHAT_HISTORY_TTL_MS, 1800000, 1000, 3600000),
    maxHistories: bounded(env.DISCORD_CHAT_MAX_HISTORIES, 100, 1, 500),
    maxHistoryMessages: bounded(env.DISCORD_CHAT_MAX_HISTORY_MESSAGES, 12, 2, 20),
    maxHistoryChars: bounded(env.DISCORD_CHAT_MAX_HISTORY_CHARS, 12000, 8000, 16000),
    dedupTtlMs: bounded(env.DISCORD_CHAT_DEDUP_TTL_MS, 3600000, 1000, 7200000),
    maxDedupEntries: bounded(env.DISCORD_CHAT_MAX_DEDUP_ENTRIES, 2000, 10, 10000),
    typingIntervalMs: bounded(env.DISCORD_CHAT_TYPING_INTERVAL_MS, 8000, 5000, 9000),
  });
}
