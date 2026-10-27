import test from 'node:test';
import assert from 'node:assert/strict';
import { createDiscordStore } from '../server/discord/store.js';
import { createApp } from '../server/runtime/app.js';
import { readConfig } from '../server/shared/config.js';

const sourceId = '22222222-2222-4222-8222-222222222222', foreign = '33333333-3333-4333-8333-333333333333';
const principal = { id: '11111111-1111-4111-8111-111111111111', allowedSourceIds: [sourceId] };
const row = { id: '44444444-4444-4444-8444-444444444444', source_id: sourceId, message_id: '1460000000000000001', channel_id: '234567890123456789', guild_id: '123456789012345678', author_id: '345678901234567890', title: 'Events', excerpt: 'Room 204', created_at: '2026-10-11T12:00:00Z', indexed_at: '2026-10-11T12:01:00Z' };
const env = { SUPABASE_URL: 'https://fixture.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'fixture-service-secret' };
function fixture(data = [row], status = 200) {
  const calls = [];
  const store = createDiscordStore({ env, fetchImpl: async (url, options) => { calls.push({ url, options, body: JSON.parse(options.body) }); return Response.json(data, { status }); } });
  return { store, calls };
}

test('catalogue admin cannot turn client-submitted permission fields into grants', async () => {
  const response = { source_id: sourceId, channel_id: row.channel_id, guild_id: row.guild_id, title: 'Events', enabled: true, backfill_from: '2026-01-01T05:00:00Z' };
  const { store, calls } = fixture(response);
  const result = await store.configureChannel({ principal: { isAdmin: true }, channel: { sourceId, channelId: row.channel_id, guildId: row.guild_id, title: 'Events', enabled: true, allowedMemberIds: ['attacker'], canRead: true } });
  assert.equal(result.status, 'ready');
  assert(!JSON.stringify(calls[0].body).includes('attacker'));assert.equal(calls[0].body.p_member_id,null);
  assert.equal(calls[0].body.p_channel.backfill_from, '2015-01-01T00:00:00.000Z');
  assert(!Object.hasOwn(result.channel,'backfillFrom'));
});

test('a catalogue store alone cannot expose raw-message search through the live API', async () => {
  const { store, calls } = fixture();
  const app = createApp({ config: readConfig({}), auth: () => principal, discordStore: store });
  const response = await app.request('/api/tools/search-discord', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query: 'room', mode: 'relevance' }) });
  assert.equal(response.status, 503);
  assert.equal((await response.json()).status, 'not_configured');
  assert.equal(calls.length, 0);
});

test('active metadata HTTP errors sanitized, unconfigured metadata never fetches, cancellation preserved',async t=>{
 assert.equal((await fixture({secret:'fixture-service-secret'},403).store.listSyncChannels()).status,'forbidden');
 let requests=0;const missing=createDiscordStore({env:{},fetchImpl:async()=>{requests++;}});assert.equal((await missing.listSyncChannels()).status,'not_configured');assert.equal(requests,0);
 const timeouts=[];t.mock.method(AbortSignal,'timeout',ms=>{timeouts.push(ms);return new AbortController().signal;});
 let start;const started=new Promise(resolve=>start=resolve);
 const store=createDiscordStore({env,fetchImpl:async(url,options)=>{start(options.signal);return new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(new Error('private-fixture')),{once:true}));}});
 const controller=new AbortController(),pending=store.listSyncChannels({signal:controller.signal});const signal=await started;controller.abort();assert.equal(signal.aborted,true);const result=await pending;assert.equal(result.status,'aborted');assert(!JSON.stringify(result).includes('private-fixture'));assert.deepEqual(timeouts,[60000]);
 const calls=timeouts.length;assert.equal((await store.listSyncChannels({signal:controller.signal})).status,'aborted');assert.equal(timeouts.length,calls);
});

test('backend admin capability remains required without per-person identities',async()=>{
 const {store,calls}=fixture();
 const channel={sourceId,channelId:row.channel_id,guildId:row.guild_id,title:'Events',enabled:true};
 for(const principal of [null,{}, {isAdmin:false}, {id:'server-operator'}]){assert.equal((await store.listChannels({principal})).status,'forbidden');assert.equal((await store.configureChannel({principal,channel})).status,'forbidden');}
 assert.equal(calls.length,0);
});
