import test from 'node:test';
import assert from 'node:assert/strict';
import { createDiscordStore } from '../server/discord/store.js';
import { createApp } from '../server/app.js';
import { readConfig } from '../server/config.js';

const sourceId = '22222222-2222-4222-8222-222222222222', foreign = '33333333-3333-4333-8333-333333333333';
const principal = { id: '11111111-1111-4111-8111-111111111111', allowedSourceIds: [sourceId] };
const row = { id: '44444444-4444-4444-8444-444444444444', source_id: sourceId, message_id: '1460000000000000001', channel_id: '234567890123456789', guild_id: '123456789012345678', author_id: '345678901234567890', title: 'Events', excerpt: 'Room 204', created_at: '2026-10-11T12:00:00Z', indexed_at: '2026-10-11T12:01:00Z' };
const env = { SUPABASE_URL: 'https://fixture.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'fixture-service-secret' };
function fixture(data = [row], status = 200) {
  const calls = [];
  const store = createDiscordStore({ env, fetchImpl: async (url, options) => { calls.push({ url, options, body: JSON.parse(options.body) }); return Response.json(data, { status }); } });
  return { store, calls };
}

test('archive store rejects invalid or absent permissions without touching database', async () => {
  const { store, calls } = fixture();
  for (const p of [null, { id: principal.id }, { ...principal, allowedSourceIds: [] }, { ...principal, id: 'attacker' }, { ...principal, allowedSourceIds: ['bad'] }]) assert.equal((await store.search({ query: 'room', principal: p })).status, 'forbidden');
  assert.equal((await store.listChannels({ principal })).status, 'forbidden');
  assert.equal(calls.length, 0);
});

test('archive retrieval passes trusted scope, filters foreign sources, bounds excerpts, and creates exact original links', async () => {
  const { store, calls } = fixture([{ ...row, source_id: foreign }, row, ...Array.from({ length: 7 }, () => ({ ...row, excerpt: 'x'.repeat(9000) }))]);
  const result = await store.search({ query: 'room', principal, limit: 8 });
  assert.equal(result.status, 'ready');
  assert(result.sources.every(s => s.sourceId === sourceId));
  assert(result.sources.every(s => s.excerpt.length <= 1800));
  assert(result.sources.reduce((n, s) => n + s.excerpt.length, 0) <= 12000);
  assert.equal(result.sources[0].url, `https://discord.com/channels/${row.guild_id}/${row.channel_id}/${row.message_id}`);
  assert.deepEqual(calls[0].body.p_allowed_source_ids, [sourceId]);
  assert.equal(calls[0].body.p_member_id, principal.id);
  assert.equal(calls[0].options.headers.Authorization, 'Bearer fixture-service-secret');
  assert(!JSON.stringify(result).includes('fixture-service-secret'));
});

test('archive admin cannot turn client-submitted permission fields into grants', async () => {
  const response = { source_id: sourceId, channel_id: row.channel_id, guild_id: row.guild_id, title: 'Events', enabled: true, backfill_from: '2026-01-01T05:00:00Z' };
  const { store, calls } = fixture(response);
  const result = await store.configureChannel({ principal: { ...principal, isAdmin: true }, channel: { sourceId, channelId: row.channel_id, guildId: row.guild_id, title: 'Events', enabled: true, allowedMemberIds: ['attacker'], canRead: true } });
  assert.equal(result.status, 'ready');
  assert(!JSON.stringify(calls[0].body).includes('attacker'));
  assert.equal(calls[0].body.p_channel.backfill_from, '2026-01-01T05:00:00.000Z');
});

test('real archive store accepts the API text-search contract and responds with original links', async () => {
  const { store, calls } = fixture();
  const app = createApp({ config: readConfig({}), auth: () => principal, discordStore: store });
  const response = await app.request('/api/tools/search-discord', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query: 'room', mode: 'relevance' }) });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.status, 'ready');
  assert.equal(calls.length, 1);
  assert.equal(result.sources[0].messageId, row.message_id);
});

test('store HTTP errors are sanitized and missing configuration never performs a request', async () => {
  assert.equal((await fixture({ secret: 'fixture-service-secret' }, 403).store.search({ query: 'room', principal })).status, 'forbidden');
  let requests = 0;
  const store = createDiscordStore({ env: {}, fetchImpl: async () => { requests++; } });
  assert.equal((await store.search({ query: 'room', principal })).status, 'not_configured');
  assert.equal(requests, 0);
});

test('classification alone receives the extended RPC budget and both timeout and caller cancellation remain effective',async t=>{
  const budgets=[],timers=[];
  t.mock.method(AbortSignal,'timeout',milliseconds=>{
    budgets.push(milliseconds);
    const controller=new AbortController();timers.push(controller);return controller.signal;
  });
  let pending=false,started;
  const store=createDiscordStore({env,fetchImpl:async(url,options)=>{
    if(pending){
      started(options.signal);
      return new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(options.signal.reason),{once:true}));
    }
    return Response.json(url.endsWith('/discord_rebuild_memory')?{buckets:1,messages:1}:[]);
  }});
  const options={guildId:'123456789012345678',expectedPolicyRevision:1,asOf:'2026-10-11T12:00:00Z'};
  assert.equal((await store.rebuildMemory(options)).status,'ready');
  assert.equal((await store.listSyncChannels()).status,'ready');
  assert.equal((await store.search({principal,mode:'latest'})).status,'empty');
  assert.deepEqual(budgets,[65000,12000,12000]);
  pending=true;
  let signalSeen;
  const start=new Promise(resolve=>{started=signal=>{signalSeen=signal;resolve();};});
  const caller=new AbortController(),request=store.rebuildMemory({...options,signal:caller.signal});
  await start;caller.abort(new Error('private-fixture-caller-reason'));
  assert.equal(signalSeen.aborted,true);
  const aborted=await request;assert.equal(aborted.status,'aborted');assert(!JSON.stringify(aborted).includes('private-fixture'));
  const count=budgets.length;
  assert.equal((await store.rebuildMemory({...options,signal:caller.signal})).status,'aborted');
  assert.equal(budgets.length,count);
  let timeoutSignal;
  const timerStarted=new Promise(resolve=>{started=signal=>{timeoutSignal=signal;resolve();};});
  const timedRequest=store.rebuildMemory(options);
  await timerStarted;timers.at(-1).abort(new Error('private-fixture-timer-reason'));
  assert.equal(timeoutSignal.aborted,true);
  const timedOut=await timedRequest;assert.equal(timedOut.status,'unavailable');assert(!JSON.stringify(timedOut).includes('private-fixture'));
  assert.equal(budgets.at(-1),65000);
});
