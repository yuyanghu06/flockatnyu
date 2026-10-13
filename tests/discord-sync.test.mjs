import test from 'node:test';
import assert from 'node:assert/strict';
import { readDiscordConfig } from '../server/discord/config.js';
import { normalizeMessage, previousMidnight, runDiscordSync, snowflakeBefore } from '../server/discord/sync.js';

const sourceId = '22222222-2222-4222-8222-222222222222', guildId = '123456789012345678', channelId = '234567890123456789';
const channel = { sourceId, guildId, channelId, title: 'Events', enabled: true, backfillFrom: '2026-01-01T00:00:00-05:00' };
const config = readDiscordConfig({ DISCORD_BOT_TOKEN: 'fixture-secret', DISCORD_GUILD_ID: guildId });
function message(time, sequence = 1, extra = {}) {
  return { id: (BigInt(snowflakeBefore(time)) + BigInt(sequence)).toString(), channel_id: channelId, author: { id: '345678901234567890', username: 'Pope' }, timestamp: new Date(time).toISOString(), content: 'Meet in room 204', ...extra };
}
function fixture(messages = [], initialState = null, channels = [channel]) {
  let state = initialState;
  const rows = new Map(), pages = [], requests = [];
  const store = { configured: true,
    async listSyncChannels() { return { status: 'ready', channels }; },
    async getSyncState() { return { status: state ? 'ready' : 'empty', state }; },
    async persistPage(args) { pages.push(structuredClone(args)); for (const m of args.messages) rows.set(m.messageId, structuredClone(m)); state = structuredClone(args.state); return { status: 'ready' }; },
  };
  const client = { configured: true,
    async getChannel() { return { id: channelId, guild_id: guildId }; },
    async getMessages(args) { requests.push(args); return messages.filter(m => BigInt(m.id) < BigInt(args.before)).sort((a, b) => BigInt(a.id) > BigInt(b.id) ? -1 : 1).slice(0, args.limit); },
  };
  return { store, client, rows, pages, requests, get state() { return state; } };
}

test('message archive retains timestamps, authors, reply IDs and source links without recursively importing foreign replies', () => {
  const raw = message('2026-10-10T18:20:00Z', 1, { edited_timestamp: '2026-10-10T18:30:00Z', message_reference: { message_id: '123456789' }, referenced_message: { content: 'foreign private content' }, attachments: [{ id: '456', filename: 'agenda.pdf', url: 'https://cdn.discordapp.com/agenda.pdf' }] });
  const normalized = normalizeMessage(raw, channel);
  assert.equal(normalized.messageId, raw.id);
  assert.equal(normalized.authorId, raw.author.id);
  assert.equal(normalized.replyToMessageId, '123456789');
  assert.equal(normalized.editedAt, '2026-10-10T18:30:00.000Z');
  assert.equal(normalized.url, `https://discord.com/channels/${guildId}/${channelId}/${raw.id}`);
  assert.equal(normalized.payload.attachments[0].filename, 'agenda.pdf');
  assert.equal(normalized.payload.referenced_message, undefined);
  assert.match(normalized.embeddingText, /agenda.pdf/);
  assert.equal(normalized.contentHash, normalizeMessage(raw, channel).contentHash);
  assert.notEqual(normalized.contentHash, normalizeMessage({ ...raw, content: 'Updated room 301' }, channel).contentHash);
});

test('New York previous-midnight window handles both DST boundaries', () => {
  for (const [now, expected] of [
    ['2026-03-08T16:00:00Z', '2026-03-07T05:00:00.000Z'],
    ['2026-03-09T16:00:00Z', '2026-03-08T05:00:00.000Z'],
    ['2026-03-10T16:00:00Z', '2026-03-09T04:00:00.000Z'],
    ['2026-11-01T16:00:00Z', '2026-10-31T04:00:00.000Z'],
    ['2026-11-02T16:00:00Z', '2026-11-01T04:00:00.000Z'],
    ['2026-11-03T16:00:00Z', '2026-11-02T05:00:00.000Z'],
  ]) assert.equal(previousMidnight(new Date(now)), expected, now);
});

test('January backfill paginates, excludes earlier messages, and retry is idempotent', async () => {
  const input = [message('2025-12-31T23:59:00-05:00'), ...Array.from({ length: 110 }, (_, i) => message(new Date(Date.parse('2026-01-01T05:00:00Z') + i * 60000), i + 1))];
  const f = fixture(input);
  const first = await runDiscordSync({ config, ...f, now: new Date('2026-01-02T12:00:00Z') });
  assert.equal(first.status, 'ready');
  assert.equal(first.pages, 2);
  assert.equal(f.rows.size, 110);
  assert(f.pages.flatMap(p => p.messages).every(m => m.createdAt >= '2026-01-01T05:00:00.000Z'));
  assert.equal(f.state.lastSuccessAt, '2026-01-02T12:00:00.000Z');
  await runDiscordSync({ config, ...f, now: new Date('2026-01-02T13:00:00Z') });
  assert.equal(f.rows.size, 110);
});

test('interrupted scans retain a fixed upper bound and resume from persisted cursor', async () => {
  const input = Array.from({ length: 210 }, (_, i) => message(new Date(Date.parse('2026-10-09T12:00:00Z') + i * 60000), i + 1));
  const f = fixture(input), limited = { ...config, maxPagesPerChannel: 1 };
  const first = await runDiscordSync({ config: limited, ...f, now: new Date('2026-10-10T12:00:00Z') });
  assert.equal(first.status, 'partial');
  assert.equal(f.state.lastSuccessAt, null);
  const cursor = f.state.before, fixedTo = f.state.windowTo;
  const requestOffset = f.requests.length;
  const second = await runDiscordSync({ config, ...f, now: new Date('2026-10-11T12:00:00Z') });
  assert.equal(second.status, 'ready');
  assert.equal(f.requests[requestOffset].before, cursor);
  assert.equal(f.rows.size, 210);
  assert.equal(f.state.lastSuccessAt, fixedTo);
});

test('daily outage catches up from earlier successful watermark instead of skipping missed days', async () => {
  const f = fixture([message('2026-10-08T18:00:00Z'), message('2026-10-09T18:00:00Z'), message('2026-10-10T18:00:00Z')], { sourceId, status: 'succeeded', lastSuccessAt: '2026-10-08T12:00:00Z', before: null, windowTo: null });
  assert.equal((await runDiscordSync({ config, ...f, now: new Date('2026-10-11T12:00:00Z') })).status, 'ready');
  assert.equal(f.rows.size, 3);
  assert.equal(f.state.lastSuccessAt, '2026-10-11T12:00:00.000Z');
});

test('permission loss, rejected page persistence and malformed pagination never advance success', async () => {
  for (const failure of ['permission', 'database', 'cursor']) {
    const initial = { sourceId, status: 'succeeded', lastSuccessAt: '2026-10-08T12:00:00Z', before: null, windowTo: null };
    const f = fixture([message('2026-10-10T18:00:00Z')], initial);
    if (failure === 'permission') f.client.getChannel = async () => { throw Object.assign(new Error('private token'), { code: 'permission_denied' }); };
    if (failure === 'database') f.store.persistPage = async () => ({ status: 'unavailable' });
    if (failure === 'cursor') f.client.getMessages = async ({ before }) => [message('2026-10-10T18:00:00Z', 1, { id: before })];
    const result = await runDiscordSync({ config, ...f, now: new Date('2026-10-11T12:00:00Z') });
    assert.equal(result.status, 'partial');
    assert.equal(f.state.lastSuccessAt, initial.lastSuccessAt);
    assert.equal(result.errors.length, 1);
    assert(!JSON.stringify(result).includes('private token'));
  }
});

test('archive persists originals while stale embedding flags and injected adapters never spend model calls', async () => {
  const raw = message('2026-10-10T18:00:00Z'), f = fixture([raw]);
  const embedding = { ...config.embedding, configured: true, model: 'fixture-model', provider: 'openai-compatible', maxInputsPerRun: 1 };
  f.store.listEmbeddingWork = async () => ({ status: 'ready', messages: [...f.rows.values()] });
  let attempted = false, workReads = 0, vectorWrites = 0;
  f.store.listEmbeddingWork = async () => { workReads++; return { status: 'ready', messages: [...f.rows.values()] }; };
  f.store.saveEmbedding = async () => { vectorWrites++; return {status:'ready'}; };
  const failed = await runDiscordSync({ config: { ...config, embedding }, ...f, now: new Date('2026-10-11T12:00:00Z'), embedder: { configured: true, async embed() { attempted = true; assert.equal(f.rows.size, 1); return { status: 'rate_limited', vectors: [] }; } } });
  assert.equal(attempted, false);
  assert.equal(failed.embeddingStatus, 'disabled');
  assert.equal(f.rows.get(raw.id).payload.content, raw.content);
  const stale = await runDiscordSync({ config: { ...config, embedding }, ...f, now: new Date('2026-10-11T13:00:00Z'), embedder: { configured: true, async embed() { attempted = true; return { status: 'ready', vectors: [Array(1536).fill(0)] }; } } });
  assert.equal(stale.embedded, 0);
  assert.equal(stale.embeddingStatus, 'disabled');
  assert.equal(attempted, false); assert.equal(workReads, 0); assert.equal(vectorWrites, 0);
});

test('image metadata is discarded while message text, links and ordinary file attachments are preserved without fetching assets', () => {
  const normalized = normalizeMessage(message('2026-10-10T18:00:00Z', 1, {
    content:'Agenda https://example.com/resources',
    author:{id:'345678901234567890',username:'Fixture',avatar:'image-avatar',avatar_decoration_data:{asset:'image-decoration'}},
    mentions:[{id:'456789012345678901',username:'Other',avatar:'image-mention'}],
    attachments:[{id:'1',filename:'photo.png',content_type:'image/png',url:'https://cdn.discordapp.com/image-photo.png'}, {id:'2',filename:'agenda.pdf',content_type:'application/pdf',url:'https://cdn.discordapp.com/agenda.pdf'}, {id:'3',filename:'download',url:'https://example.com/image-opaque.PNG'}],
    embeds:[{type:'image',url:'https://example.com/image-full'}, {type:'rich',title:'Text title',description:'Text description',url:'https://example.com/resources',image:{url:'https://example.com/image-main'},thumbnail:{url:'https://example.com/image-thumb'},author:{name:'Fixture author',icon_url:'https://example.com/image-icon'}}],
    sticker_items:[{id:'2',name:'image-sticker',format_type:1}],
    components:[{type:17,components:[
      {type:10,content:'Component text https://example.com/resources'},
      {type:12,items:[{media:{url:'https://example.com/image-gallery.png'}}]},
      {type:9,components:[{type:10,content:'Section text'}],accessory:{type:11,media:{url:'https://example.com/image-thumbnail.png'}}},
      {type:13,file:{url:'https://example.com/image-file.png'}},
      {type:13,file:{url:'https://example.com/agenda.pdf'}},
    ]}],
  }), channel);
  assert.equal(normalized.content,'Agenda https://example.com/resources');
  assert.equal(normalized.payload.attachments.length,1); assert.equal(normalized.payload.attachments[0].filename,'agenda.pdf');
  assert.equal(normalized.payload.embeds.length,1); assert.equal(normalized.payload.embeds[0].title,'Text title');
  assert.equal(normalized.payload.embeds[0].author.name,'Fixture author');
  assert(!JSON.stringify(normalized.payload).includes('image-'));
  assert(JSON.stringify(normalized.payload.components).includes('Component text'));assert(JSON.stringify(normalized.payload.components).includes('Section text'));assert(JSON.stringify(normalized.payload.components).includes('agenda.pdf'));
  assert(!normalized.embeddingText.includes('photo.png')); assert.match(normalized.embeddingText,/agenda.pdf/);
});

test('deep component containers cannot evade bounded image stripping',()=>{
  let component={type:12,items:[{media:{url:'https://example.com/image-deep.png'}}]};
  for(let i=0;i<20;i++)component={type:17,components:[component]};
  const normalized=normalizeMessage(message('2026-10-10T18:00:00Z',1,{components:[component]}),channel);
  assert(!JSON.stringify(normalized.payload).includes('image-deep'));
});

test('disabled channels and unconfigured worker make no Discord calls', async () => {
  const f = fixture([], null, [{ ...channel, enabled: false }]);
  let calls = 0;
  f.client.getChannel = async () => { calls++; };
  assert.equal((await runDiscordSync({ config, ...f })).channelsProcessed, 0);
  assert.equal((await runDiscordSync({ config: { ...config, configured: false }, ...f })).status, 'not_configured');
  assert.equal(calls, 0);
});

test('future backfill fails before source reads and leaves the watermark unchanged', async () => {
  const f = fixture([], null, [{ ...channel, backfillFrom: '2027-01-01T00:00:00-05:00' }]);
  let reads = 0;
  f.client.getChannel = async () => { reads++; };
  const result = await runDiscordSync({ config, ...f, now: new Date('2026-10-11T12:00:00Z') });
  assert.equal(result.status, 'partial');
  assert.equal(result.errors[0].code, 'invalid_backfill');
  assert.equal(reads, 0);
  assert.equal(f.state, null);
});
