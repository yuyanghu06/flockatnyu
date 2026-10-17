import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite-pgvector';
import { normalizeMessage } from './fixtures/legacy-message.mjs';

const admin = '11111111-1111-4111-8111-111111111111', reader = '33333333-3333-4333-8333-333333333333', otherReader = '44444444-4444-4444-8444-444444444444';
const channel = { channelId: '234567890123456789', guildId: '123456789012345678', title: 'Events', enabled: true, backfillFrom: '2026-01-01T05:00:00Z' };
const rpcChannel = (c = channel) => ({ source_id: c.sourceId ?? null, channel_id: c.channelId, guild_id: c.guildId, title: c.title, enabled: c.enabled, backfill_from: c.backfillFrom });
const raw = (content = 'Meet in room 204', extra = {}) => ({ id: '1460000000000000001', channel_id: channel.channelId, author: { id: '345678901234567890', username: 'Pope' }, timestamp: '2026-10-11T12:00:00Z', content, ...extra });
function storedMessage(rawMessage, c) {
  const m = normalizeMessage(rawMessage, c);
  return { message_id: m.messageId, channel_id: m.channelId, guild_id: m.guildId, author_id: m.authorId, created_at: m.createdAt, edited_at: m.editedAt, reply_to_message_id: m.replyToMessageId, content: m.content, embedding_text: m.embeddingText, payload: m.payload, content_hash: m.contentHash, url: m.url };
}
const done = { last_success_at: '2026-10-11T13:00:00Z', window_from: null, window_to: null, before_cursor: null, status: 'succeeded', expected_before: null, expected_window_to: null };

test('local PostgreSQL+pgvector executes migrations, archive transactions, grants and provenance', async t => {
  const db = new PGlite({ extensions: { vector } });
  try {
    await db.exec('create role anon; create role authenticated; create role service_role bypassrls;');
    for (const file of ['202610120001_knowledge.sql', '202610120002_discord_archive.sql']) await db.exec(await readFile(new URL(`../supabase/migrations/${file}`, import.meta.url), 'utf8'));
    await db.query('insert into public.discord_admin_members(member_id) values ($1)', [admin]);
    await db.exec('set role service_role');
    const configure = async (member, c) => (await db.query('select public.discord_configure_channel($1,$2::jsonb) as channel', [member, JSON.stringify(rpcChannel(c))])).rows[0].channel;
    const persist = async (messages, state = done) => {
      const current = (await db.query('select last_success_at from public.discord_sync_state where source_id=$1', [channel.sourceId])).rows[0];
      return (await db.query('select public.discord_persist_page($1,$2::jsonb,$3::jsonb) as saved', [channel.sourceId, JSON.stringify(messages), JSON.stringify({ expected_last_success_at: current?.last_success_at ?? null, ...state })])).rows[0].saved;
    };
    const search = async ({ member = reader, sources = [channel.sourceId], query = '', channels = [], author = null, authorName = null, from = null, to = null, mode = 'latest', vec = null, model = null, provider = null } = {}) => (await db.query('select * from public.discord_search($1,$2::uuid[],$3,$4::text[],$5,$6,$7::timestamptz,$8::timestamptz,$9,$10::extensions.vector,$11,$12,8)', [member, sources, query, channels, author, authorName, from, to, mode, vec, model, provider])).rows;

    await t.test('admin bootstrap is separate from read grants and channel configuration grants nobody', async () => {
      await assert.rejects(configure(reader, channel), /Admin access denied/);
      await assert.rejects(configure(admin, { ...channel, backfillFrom: '2099-01-01T00:00:00Z' }), /Invalid channel/);
      const result = await configure(admin, channel);
      channel.sourceId = result.source_id;
      assert.equal(new Date(result.backfill_from).toISOString(), '2026-01-01T05:00:00.000Z');
      assert.equal((await db.query('select count(*)::int as n from public.knowledge_source_members')).rows[0].n, 0);
      await db.query('insert into public.knowledge_source_members(source_id,member_id,can_read) values ($1,$2,true)', [channel.sourceId, reader]);
    });

    const original = storedMessage(raw(), channel);
    let citationId;
    await t.test('raw JSONB is idempotent with a stable citation and no duplicate revision on retries', async () => {
      assert.equal(await persist([original]), true);
      citationId = (await db.query('select id from public.discord_messages')).rows[0].id;
      assert.equal(await persist([original]), true);
      const rows = (await db.query('select * from public.discord_messages')).rows;
      assert.equal(rows.length, 1);
      assert.equal(rows[0].id, citationId);
      assert.equal(rows[0].message_id, original.message_id);
      assert.deepEqual(rows[0].payload, original.payload);
      assert.equal((await db.query('select count(*)::int as n from public.discord_message_revisions')).rows[0].n, 0);
    });

    await t.test('SQL requires both source grant and request scope, and supports date-only, author, channel and text retrieval', async () => {
      assert.equal((await search()).length, 1);
      assert.equal((await search({ sources: [] })).length, 0);
      assert.equal((await search({ member: otherReader })).length, 0);
      assert.equal((await search({ sources: ['55555555-5555-4555-8555-555555555555'] })).length, 0);
      assert.equal((await search({ from: '2026-10-11T00:00:00-04:00', to: '2026-10-12T00:00:00-04:00' })).length, 1);
      assert.equal((await search({ from: '2026-10-12T00:00:00-04:00' })).length, 0);
      assert.equal((await search({ authorName: 'pope' })).length, 1);
      assert.equal((await search({ author: '999999999999999999' })).length, 0);
      assert.equal((await search({ channels: ['999999999999999999'] })).length, 0);
      assert.equal((await search({ query: 'room', mode: 'text' })).length, 1);
      assert.equal((await search({ query: 'absentterm', mode: 'text' })).length, 0);
    });

    await t.test('malformed page rolls back all message writes and the sync watermark', async () => {
      const invalid = { ...original, message_id: '1460000000000000002', payload: { ...original.payload, id: 'different-id' } };
      const before = (await db.query('select * from public.discord_sync_state')).rows;
      await assert.rejects(persist([{ ...original, content: 'Must rollback', payload: { ...original.payload, content: 'Must rollback' } }, invalid]), /Invalid message scope/);
      assert.equal((await db.query('select content from public.discord_messages')).rows[0].content, original.content);
      assert.deepEqual((await db.query('select * from public.discord_sync_state')).rows, before);
    });

    await t.test('vector writes match hashes, semantic retrieval requires model/provider provenance, edits retain originals and invalidate old vectors', async () => {
      const vec = JSON.stringify([1, ...Array(1535).fill(0)]);
      const save = async hash => (await db.query('select public.discord_save_embedding($1,$2,$3,$4,$5::extensions.vector) as saved', [original.message_id, hash, 'fixture-model', 'fixture-provider', vec])).rows[0].saved;
      await assert.rejects(db.query('select public.discord_save_embedding($1,$2,null,$3,$4::extensions.vector)', [original.message_id, original.content_hash, 'fixture-provider', vec]), /Invalid embedding/);
      await assert.rejects(db.query('select public.discord_save_embedding($1,$2,$3,$4,$5::extensions.vector)', [original.message_id, original.content_hash, 'fixture-model', 'fixture-provider', '[1,0]']), /expected 1536 dimensions/);
      assert.equal(await save(original.content_hash), true);
      assert.equal((await search({ mode: 'semantic', vec, model: 'fixture-model', provider: 'fixture-provider' })).length, 1);
      assert.equal((await search({ mode: 'semantic', vec, model: 'other-model', provider: 'fixture-provider' })).length, 0);
      const updated = storedMessage(raw('Meet in room 301', { edited_timestamp: '2026-10-11T12:30:00Z' }), channel);
      assert.equal(await persist([updated]), true);
      assert.equal((await db.query('select id,embedding from public.discord_messages')).rows[0].id, citationId);
      assert.equal((await db.query('select embedding from public.discord_messages')).rows[0].embedding, null);
      assert.equal(await save(original.content_hash), false);
      const revisions = (await db.query('select payload from public.discord_message_revisions')).rows;
      assert.equal(revisions.length, 1);
      assert.equal(revisions[0].payload.content, original.content);
      assert.equal((await search({ mode: 'semantic', vec, model: 'fixture-model', provider: 'fixture-provider' })).length, 0);
    });

    await t.test('concurrent stale checkpoint is rejected without writing a message or watermark', async () => {
      const state = { ...done, status: 'running', last_success_at: done.last_success_at, window_from: '2026-10-11T00:00:00Z', window_to: '2026-10-12T00:00:00Z', before_cursor: '1460000000000000000' };
      assert.equal(await persist([], state), true);
      assert.equal(await persist([{ ...original, content: 'Stale overwrite' }], done), false);
      assert.equal((await db.query('select content from public.discord_messages')).rows[0].content, 'Meet in room 301');
      assert.equal((await db.query('select before_cursor from public.discord_sync_state')).rows[0].before_cursor, state.before_cursor);
    });

    await t.test('disabled channels immediately stop reads, embedding work and worker writes', async () => {
      await configure(admin, { ...channel, enabled: false });
      assert.equal((await search()).length, 0);
      assert.equal((await db.query("select * from public.discord_embedding_work(16,'fixture-model','fixture-provider')")).rows.length, 0);
      assert.equal((await db.query('select * from public.discord_sync_channels()')).rows.length, 0);
      await assert.rejects(persist([]), /Channel disabled/);
    });

    await t.test('anonymous and authenticated database roles cannot read tables or call guarded RPCs', async () => {
      for (const role of ['anon', 'authenticated']) {
        await db.exec(`reset role; set role ${role}`);
        await assert.rejects(db.query('select * from public.discord_messages'), /permission denied/);
        await assert.rejects(db.query('select public.discord_sync_channels()'), /permission denied/);
      }
    });
  } finally { await db.close(); }
});
