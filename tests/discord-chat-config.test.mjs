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
  assert.equal(config.historyTtlMs,1000); assert.equal(config.requestTimeoutMs,1200000);
  assert.equal(config.requestsPerUserHour,20); assert.equal(config.typingIntervalMs,5000);
});


test('Discord total deadline defaults to twenty minutes, preserves shorter overrides and clamps beyond twenty minutes',()=>{
  for(const [value,expected] of [[undefined,1200000],['',1200000],['1200000',1200000],['1199999',1199999],['180000',180000],['300000',300000],['1000',1000],['0',1000],['-1',1000],['1200001',1200000],['99999999',1200000]]) {
    assert.equal(readDiscordChatConfig({DISCORD_CHAT_TIMEOUT_MS:value}).requestTimeoutMs,expected,`timeout ${String(value)}`);
  }
});

test('malformed or noninteger Discord deadlines use the twenty-minute default',()=>{
  for(const value of ['NaN','Infinity','not-a-number','1200000ms','1200000.5']) {
    assert.equal(readDiscordChatConfig({DISCORD_CHAT_TIMEOUT_MS:value}).requestTimeoutMs,1200000,value);
  }
});
