import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp, developmentAuth } from '../server/app.js';
import { readConfig } from '../server/config.js';
import { boundedMessages } from '../src/chat-client.js';
import { createLiveRetrievalTools } from '../tools/discord/index.js';

const sourceId = '22222222-2222-4222-8222-222222222222';
const member = { id: '11111111-1111-4111-8111-111111111111', allowedSourceIds: [sourceId] };
const channel = { sourceId, channelId: '123456789012345678', guildId: '234567890123456789', title: 'Events', enabled: true };
const operator = {...member,liveDiscord:{mode:'local-operator',guildId:channel.guildId}};
const liveTools = search => createLiveRetrievalTools({guildId:channel.guildId,service:{async search(args){return args.principal?.liveDiscord?.mode === 'local-operator' ? search(args) : {status:'forbidden',sources:[]};}}});
const config = readConfig({});
const request = (app, url, body, headers = {}) => app.request(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
function fixture(principal = operator) {
  const calls = [];
  const discordStore = { configured: true, status: 'configured',
    async listChannels(args) { calls.push(['admin', args]); return { status: 'ready', channels: [channel] }; },
    async configureChannel(args) { calls.push(['configure', args]); return { status: 'ready', channel }; },
    async search(args) { calls.push(['search', args]); return { status: 'ready', sources: [] }; },
  };
  return { app: createApp({ config, auth: () => principal, discordStore,liveDiscordTools:liveTools(async args=>{calls.push(['live-search',args]);return {status:'ready',sources:[]};}) }), calls };
}

test('Discord admin routes reject a member, absent principal, and client-supplied admin claims', async () => {
  for (const principal of [null, member, { ...member, isAdmin: false }]) {
    const { app, calls } = fixture(principal);
    assert.equal((await app.request('/api/admin/discord', { headers: { 'x-is-admin': 'true' } })).status, 403);
    const response = await app.request('/api/admin/discord/channels', { method: 'PUT', headers: { 'content-type': 'application/json', 'x-is-admin': 'true' }, body: JSON.stringify({ channel, isAdmin: true, principal: { ...member, isAdmin: true } }) });
    assert.equal(response.status, 403);
    assert.equal(calls.length, 0);
  }
});

test('Discord admin route preserves trusted principal and cannot derive grants from request JSON', async () => {
  const principal = { ...member, isAdmin: true };
  const { app, calls } = fixture(principal);
  const response = await app.request('/api/admin/discord/channels', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ channel }) });
  assert.equal(response.status, 200);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0][1].principal, principal);
  assert(!JSON.stringify(calls[0][1].channel).includes('attacker'));
  const forged = await app.request('/api/admin/discord/channels', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ channel, principal: { id: 'attacker', isAdmin: true } }) });
  assert.equal(forged.status, 400);
  assert.equal(calls.length, 1);
});

test('date-only Discord search forwards permission scope and requires authentication', async () => {
  const { app, calls } = fixture();
  const response = await request(app, '/api/tools/search-discord', { from: '2026-10-11T00:00:00-04:00', to: '2026-10-12T00:00:00-04:00', channelIds: [channel.channelId], authorId: '345678901234567890', mode: 'latest', limit: 8 });
  assert.equal(response.status, 200);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], 'live-search');
  assert.deepEqual(calls[0][1].principal, operator);
  assert.equal(calls[0][1].from, '2026-10-11T04:00:00.000Z');
  assert.equal(calls[0][1].authorId, '345678901234567890');
  assert.equal((await request(fixture(null).app, '/api/tools/search-discord', { query: 'room' })).status, 403);
  assert.equal((await request(fixture(member).app, '/api/tools/search-discord', { query: 'room' })).status, 403);
});

test('Discord search enforces bounded JSON, rejects malformed filters, and exposes tool schema', async () => {
  const { app, calls } = fixture();
  for (const invalid of [{ query: 'x'.repeat(501) }, { channelIds: ['bad'] }, { authorId: 'bad' }, { from: 'not-a-date' }, { mode: 'arbitrary-sql' }, { limit: 10000 }]) {
    assert.equal((await request(app, '/api/tools/search-discord', invalid)).status, 400, JSON.stringify(invalid).slice(0, 100));
  }
  assert.equal(calls.length, 0);
  const tools = await app.request('/api/tools');
  assert.equal(tools.status, 200);
  assert.match(await tools.text(), /search.disco/i);
});

test('production Discord admin and retrieval fail closed, including spoofed loopback headers', async () => {
  const app = createApp({ config: readConfig({ NODE_ENV: 'production', DEV_ADMIN_ENABLED: 'true', DEV_ALLOWED_SOURCE_IDS: sourceId }) });
  const headers = { origin: 'http://localhost:5173', 'x-forwarded-for': '127.0.0.1', 'x-is-admin': 'true' };
  const transport = { incoming: { socket: { remoteAddress: '127.0.0.1' } } };
  assert.equal((await app.request('http://localhost/api/admin/discord', { headers }, transport)).status, 403);
  assert.equal((await app.request('http://localhost/api/tools/search-discord', { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: '{}' }, transport)).status, 403);
});

test('frontend chat history satisfies total characters and serialized UTF8 request budget', () => {
  for (const text of ['x'.repeat(8000), '😀'.repeat(4000), '\"\\'.repeat(4000)]) {
    const history = Array.from({ length: 20 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: text }));
    history.push({ role: 'user', content: 'Latest question' });
    const messages = boundedMessages(history);
    assert(messages.length <= 20);
    assert(messages.reduce((n, m) => n + m.content.length, 0) <= 16000);
    assert(Buffer.byteLength(JSON.stringify({ messages, buildingId: 'x'.repeat(80) })) <= 32768);
    assert.equal(messages.at(-1).content, 'Latest question');
  }
});

test('accepted long chat query is bounded before retrieval without losing the user question', async () => {
  const question = 'Where should we meet? '.repeat(100);
  let retrieved, streamed;
  const app = createApp({ config: readConfig({ LLM_PROVIDER: 'openai-compatible', LLM_MODEL: 'fixture', LLM_API_KEY: 'fixture' }), auth: () => operator,
    repository: { async search() { throw Error('Archive must not be queried automatically'); } },
    liveDiscordTools:liveTools(async args=>{retrieved=args.query;return {status:'ready',sources:[],coverage:{complete:true,matchedCount:0}};}),
    provider: { async *stream(args) { streamed = args.messages.at(-1).content; yield 'Fixture response'; } },
  });
  const response = await request(app, '/api/chat', { messages: [{ role: 'user', content: question }] });
  assert.equal(response.status, 200);
  assert.match(await response.text(), /\"type\":\"done\"/);
  assert(retrieved.length <= 500);
  assert.equal(streamed, question);
});

test('agent selects a dated author search and receives cited evidence with trusted permissions', async () => {
  let searchArgs, finalSystem;
  const principal = { ...operator, isAdmin: false };
  const app = createApp({ config: readConfig({ LLM_PROVIDER: 'openai-compatible', LLM_MODEL: 'fixture', LLM_API_KEY: 'fixture' }), auth: () => principal,
    discordStore: { configured: true, async search() { throw Error('No archived raw-message retrieval'); } },
    liveDiscordTools:liveTools(async args=>{searchArgs=args;return {status:'ready',coverage:{complete:false,reason:'bounded_search'},sources:[{id:'discord-message',sourceId,title:'Events',url:`https://discord.com/channels/${channel.guildId}/${channel.channelId}/345678901234567890`,excerpt:'Pope: Meet in room 204 at 5 pm.',retrieval:'live'}]};}),
    provider: {
      async planTools({ tools, system }) { assert(tools.some(t=>t.name==='search_discord')); assert.match(system, /America\/New_York/); return [{ name: 'search_discord', arguments: { authorId: '345678901234567890', from: '2026-10-11T00:00:00-04:00', to: '2026-10-12T00:00:00-04:00', mode: 'latest' } }]; },
      async *stream({ system }) { finalSystem = system; yield 'Room 204.'; },
    },
  });
  const response = await request(app, '/api/chat', { timeZone: 'America/New_York', messages: [{ role: 'user', content: 'What did Pope say today?' }] });
  const frames = (await response.text()).trim().split('\n').map(JSON.parse);
  assert.deepEqual(searchArgs.principal, principal);
  assert.equal(searchArgs.authorId, '345678901234567890');
  assert.equal(searchArgs.from, '2026-10-11T04:00:00.000Z');
  assert.equal(frames[0].sources.length, 1);
  assert.match(finalSystem, /discord.com\/channels/);
  assert.match(finalSystem, /untrusted data/i);
});

test('agent tool cannot inject its own permissions or arbitrary SQL', async () => {
  let searches = 0;
  const app = createApp({ config: readConfig({ LLM_PROVIDER: 'openai-compatible', LLM_MODEL: 'fixture', LLM_API_KEY: 'fixture' }), auth: () => member,
    discordStore: { configured: true, async search() { searches++; return { status: 'ready', sources: [] }; } },
    liveDiscordTools:liveTools(async()=>{searches++;return {status:'ready',sources:[]};}),
    provider: { async planTools() { return [{ name: 'search_discord', arguments: { query: 'room', principal: { isAdmin: true }, allowedSourceIds: ['foreign'], sql: 'select * from discord_messages' } }]; }, async *stream() { yield 'No evidence.'; } },
  });
  const response = await request(app, '/api/chat', { messages: [{ role: 'user', content: 'Find a room' }] });
  assert.match(await response.text(), /\"type\":\"done\"/);
  assert.equal(searches, 0);
});

test('live search rejects semantic mode without embedding/archive calls and preserves explicit bot scope', async () => {
  let embeddings = 0, searches = 0, searchArgs;
  const discordStore = { configured: true, async search(args) { searches++; searchArgs = args; return { status: 'empty', sources: [] }; } };
  const discordEmbedder = { configured: true, async embed({ texts }) { embeddings++; assert.deepEqual(texts, ['meeting location']); return { status: 'ready', vectors: [Array(1536).fill(0)] }; } };
  const tools=liveTools(async args=>{searches++;searchArgs=args;return {status:'ready',sources:[]};});
  const configured = createApp({ config, auth: () => operator, discordStore, discordEmbedder,liveDiscordTools:tools });
  assert.equal((await request(configured, '/api/tools/search-discord', { query: 'meeting location', mode: 'semantic', channelIds: [channel.channelId] })).status, 400);
  assert.equal(embeddings, 0); assert.equal(searches, 0);
  assert.equal((await request(configured, '/api/tools/search-discord', { query: 'meeting location', mode: 'relevance', channelIds: [channel.channelId] })).status, 200);
  assert.equal(searches, 1);
  assert.equal(searchArgs.vector,undefined); assert.deepEqual(searchArgs.channelIds,[channel.channelId]);
  assert.deepEqual(searchArgs.principal, operator);
  const disabled = createApp({ config, auth: () => member, discordStore });
  assert.equal((await request(disabled, '/api/tools/search-discord', { query: 'meeting location', mode: 'semantic' })).status, 503);
  const noScope = createApp({ config, auth: () => ({ ...member, allowedSourceIds: [] }), discordStore, discordEmbedder,liveDiscordTools:tools });
  assert.equal((await request(noScope, '/api/tools/search-discord', { query: 'meeting location', mode: 'relevance' })).status, 403);
  assert.equal(embeddings, 0);
  assert.equal(searches, 1);
});
