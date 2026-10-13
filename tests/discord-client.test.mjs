import test from 'node:test';
import assert from 'node:assert/strict';
import { readDiscordConfig } from '../server/discord/config.js';
import { createDiscordClient } from '../server/discord/client.js';
import { createEmbeddingProvider } from '../server/discord/embeddings.js';

const guildId = '123456789012345678', channelId = '234567890123456789', botId = '345678901234567890';
const config = readDiscordConfig({ DISCORD_BOT_TOKEN: 'fixture-secret', DISCORD_GUILD_ID: guildId });
const json = (data, status = 200) => Response.json(data, { status });
function channelFixture({ permissions = '66560', overwrites = [], type = 0, guild = guildId } = {}) {
  const calls = [];
  const client = createDiscordClient({ config, fetchImpl: async (url, options) => {
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

test('Discord configuration is absent by default and January backfill uses New York midnight', async () => {
  assert.equal(readDiscordConfig({}).configured, false);
  assert.equal(config.timezone, 'America/New_York');
  assert.equal(new Date(config.backfillFrom).toISOString(), '2026-01-01T05:00:00.000Z');
  assert.equal(config.embedding.configured, false);
  let calls = 0;
  const client = createDiscordClient({ config: readDiscordConfig({}), fetchImpl: () => { calls++; } });
  await assert.rejects(client.getMessages({ channelId }), { code: 'not_configured' });
  assert.equal(calls, 0);
});

test('Discord API uses server-only bot credentials, paginates string snowflakes, and caps page size', async () => {
  let call;
  const client = createDiscordClient({ config, fetchImpl: async (url, options) => { call = { url, options }; return json([]); } });
  await client.getMessages({ channelId, before: '1460000000000000001', limit: 300 });
  assert.equal(new URL(call.url).searchParams.get('before'), '1460000000000000001');
  assert.equal(new URL(call.url).searchParams.get('limit'), '100');
  assert.equal(call.options.headers.Authorization, 'Bot fixture-secret');
  assert.equal(call.options.redirect, 'error');
});

test('Discord 429 is retried within budget and invalid or endless retry returns sanitized failure', async () => {
  let count = 0;
  const client = createDiscordClient({ config, fetchImpl: async () => ++count === 1 ? json({ retry_after: 0 }, 429) : json([]) });
  assert.deepEqual(await client.getMessages({ channelId }), []);
  assert.equal(count, 2);
  for (const retry of [999, 'invalid', 0]) {
    let retries = 0;
    const c = createDiscordClient({ config, fetchImpl: async () => { retries++; return json({ retry_after: retry, secret: 'fixture-secret' }, 429); } });
    await assert.rejects(c.getMessages({ channelId }), { code: 'rate_limited', message: 'rate_limited' });
    assert(retries <= 4);
  }
});

test('Discord distinguishes lost token, forbidden history, and missing channel without leaking bodies', async () => {
  for (const [status, code] of [[401, 'invalid_token'], [403, 'permission_denied'], [404, 'not_found']]) {
    const client = createDiscordClient({ config, fetchImpl: async () => json({ secret: 'fixture-secret' }, status) });
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

test('archive config hard-disables stale embedding flags; dormant provider unit validates dimensions/order and provenance', async () => {
  let calls = 0;
  const disabled = createEmbeddingProvider({ config, fetchImpl: async () => { calls++; } });
  assert.deepEqual(await disabled.embed({ texts: ['Meeting'] }), { status: 'not_configured', vectors: [] });
  assert.equal(calls, 0);
  const stale = readDiscordConfig({ EMBEDDING_ENABLED: 'true', EMBEDDING_MODEL: 'fixture-model', EMBEDDING_API_KEY: 'fixture-key' });
  assert.equal(stale.embedding.configured,false); assert.equal(stale.embedding.apiKey,'');
  const configured = {embedding:{...stale.embedding,configured:true,apiKey:'fixture-key'}};
  let payload;
  const provider = createEmbeddingProvider({ config: configured, fetchImpl: async (_, init) => { payload = JSON.parse(init.body); return json({ data: [{ index: 1, embedding: Array(1536).fill(2) }, { index: 0, embedding: Array(1536).fill(1) }] }); } });
  const result = await provider.embed({ texts: ['First', 'Second'] });
  assert.equal(result.status, 'ready');
  assert.equal(result.vectors[0][0], 1);
  assert.equal(result.model, 'fixture-model');
  assert.equal(result.provider, 'openai-compatible');
  assert.equal(payload.dimensions, 1536);
  const bad = createEmbeddingProvider({ config: configured, fetchImpl: async () => json({ data: [{ index: 0, embedding: [1, 2] }] }) });
  assert.equal((await bad.embed({ texts: ['First'] })).status, 'unavailable');
});
