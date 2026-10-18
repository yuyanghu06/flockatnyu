import test from 'node:test';
import assert from 'node:assert/strict';
import { readDiscordConfig } from '../server/discord/config.js';
import { createDiscordClient } from '../server/discord/client.js';
import {createDiscordRequestPacer} from '../server/discord/request-pacing.js';
const fastPacer=()=>{let clock=0;return createDiscordRequestPacer({now:()=>clock,sleep:async ms=>{clock+=ms;},minIntervalMs:0});};

const guildId = '123456789012345678', channelId = '234567890123456789', botId = '345678901234567890';
const config = readDiscordConfig({ DISCORD_BOT_TOKEN: 'fixture-secret', DISCORD_GUILD_ID: guildId });
const json = (data, status = 200) => Response.json(data, { status });
function channelFixture({ permissions = '66560', overwrites = [], type = 0, guild = guildId } = {}) {
  const calls = [];
  const client = createDiscordClient({ config, requestPacer:fastPacer(), fetchImpl: async (url, options) => {
    calls.push({ url, options });
    const path = new URL(url).pathname;
    if (path === `/api/v10/channels/${channelId}`) return json({ id: channelId, guild_id: guild, type, permission_overwrites: overwrites });
    if (path === '/api/v10/users/@me') return json({ id: botId });
    if (path.endsWith('/roles')) return json([{ id: guildId, permissions }]);
    if (path.endsWith(`/members/${botId}`)) return json({ roles: [] });
    throw new Error('Unexpected fixture URL');
  } });
  return { client, calls };
}

test('Discord configuration is absent by default and ignores retired archive flags', async () => {
  assert.equal(readDiscordConfig({}).configured, false);
  assert.equal(config.timezone, 'America/New_York');
  assert(!Object.hasOwn(config,'backfillFrom'));
  assert(!Object.hasOwn(config,'embedding'));
  assert.equal(readDiscordConfig({DISCORD_BOT_TOKEN:'fixture',DISCORD_GUILD_ID:guildId,DISCORD_BACKFILL_FROM:'invalid'}).configured,true);
  let calls = 0;
  const client = createDiscordClient({ config: readDiscordConfig({}), fetchImpl: () => { calls++; } });
  await assert.rejects(client.getMessages({ channelId }), { code: 'not_configured' });
  assert.equal(calls, 0);
});

test('Discord API uses server-only bot credentials, paginates string snowflakes, and caps page size', async () => {
  let call;
  const client = createDiscordClient({ config, requestPacer:fastPacer(), fetchImpl: async (url, options) => { call = { url, options }; return json([]); } });
  await client.getMessages({ channelId, before: '1460000000000000001', limit: 300 });
  assert.equal(new URL(call.url).searchParams.get('before'), '1460000000000000001');
  assert.equal(new URL(call.url).searchParams.get('limit'), '100');
  assert.equal(call.options.headers.Authorization, 'Bot fixture-secret');
  assert.equal(call.options.redirect, 'error');
});

test('Discord 429 is retried within budget and invalid or endless retry returns sanitized failure', async () => {
  let count = 0;
  const client = createDiscordClient({ config, requestPacer:fastPacer(), fetchImpl: async () => ++count === 1 ? json({ retry_after: 0 }, 429) : json([]) });
  assert.deepEqual(await client.getMessages({ channelId }), []);
  assert.equal(count, 2);
  for (const retry of [999, 'invalid', 0]) {
    let retries = 0;
    const c = createDiscordClient({ config, requestPacer:fastPacer(), fetchImpl: async () => { retries++; return json({ retry_after: retry, secret: 'fixture-secret' }, 429); } });
    await assert.rejects(c.getMessages({ channelId }), { code: 'rate_limited', message: 'rate_limited' });
    assert(retries <= 4);
  }
});

test('Discord distinguishes lost token, forbidden history, and missing channel without leaking bodies', async () => {
  for (const [status, code] of [[401, 'invalid_token'], [403, 'permission_denied'], [404, 'not_found']]) {
    const client = createDiscordClient({ config, requestPacer:fastPacer(), fetchImpl: async () => json({ secret: 'fixture-secret' }, status) });
    await assert.rejects(client.getMessages({ channelId }), { code, message: code });
  }
});

test('empty history is trusted only after explicit view+read-history permissions and selected guild validation', async () => {
  assert.equal((await channelFixture().client.getChannel({ channelId })).id, channelId);
  for (const permissions of ['0', '1024', '65536']) await assert.rejects(channelFixture({ permissions }).client.getChannel({ channelId }), { code: 'permission_denied' });
  await assert.rejects(channelFixture({ overwrites: [{ id: guildId, type: 0, deny: '65536', allow: '0' }] }).client.getChannel({ channelId }), { code: 'permission_denied' });
  await assert.rejects(channelFixture({ guild: '999999999999999999' }).client.getChannel({ channelId }), { code: 'channel_scope_denied' });
  await assert.rejects(channelFixture({ type: 2 }).client.getChannel({ channelId }), { code: 'channel_scope_denied' });
  assert.equal((await channelFixture({ permissions: '8' }).client.getChannel({ channelId })).id, channelId);
});
