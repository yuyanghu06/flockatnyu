import test from 'node:test';
import assert from 'node:assert/strict';
import {readDiscordChatConfig} from '../server/discord/chat-config.js';

test('Discord chat is explicit opt-in and requires existing bot configuration', () => {
  assert.equal(readDiscordChatConfig({}).enabled, false);
  assert.equal(readDiscordChatConfig({DISCORD_CHAT_ENABLED:'TRUE'}).enabled, false);
  const config = readDiscordChatConfig({DISCORD_CHAT_ENABLED:'true',DISCORD_BOT_TOKEN:'synthetic',DISCORD_GUILD_ID:'123'});
  assert.equal(config.enabled, true); assert.equal(config.configured, true);
  assert.equal(config.timezone, 'America/New_York'); assert.ok(Object.isFrozen(config));
});

test('chat budgets clamp extreme values and reject nonintegral inputs', () => {
  const config = readDiscordChatConfig({DISCORD_CHAT_MAX_CONCURRENT:'9999',DISCORD_CHAT_MAX_HISTORY_MESSAGES:'999',
    DISCORD_CHAT_MAX_HISTORY_CHARS:'999999',DISCORD_CHAT_HISTORY_TTL_MS:'1',DISCORD_CHAT_TIMEOUT_MS:'NaN',
    DISCORD_CHAT_REQUESTS_PER_USER_HOUR:'1.5',DISCORD_CHAT_TYPING_INTERVAL_MS:'0'});
  assert.equal(config.maxConcurrent,10); assert.equal(config.maxHistoryMessages,20); assert.equal(config.maxHistoryChars,16000);
  assert.equal(config.historyTtlMs,1000); assert.equal(config.requestTimeoutMs,180000);
  assert.equal(config.requestsPerUserHour,20); assert.equal(config.typingIntervalMs,5000);
});
