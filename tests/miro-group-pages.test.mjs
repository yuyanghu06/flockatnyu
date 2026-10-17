import test from 'node:test';
import assert from 'node:assert/strict';
import {createMiroClient} from '../server/miro/client.js';
import {readMiroConfig} from '../server/miro/config.js';
import {collectCursorPages, collectGroupPages, fetchBoardSnapshot, normalizeGroupPage} from '../server/miro/snapshot.js';

const config = {...readMiroConfig({MIRO_ACCESS_TOKEN: 'offline-fixture', MIRO_BOARD_IDS: 'board1', MIRO_TEAM_ID: 'team1'}), captureRetries: 1};
const board = {id: 'board1', modifiedAt: '2026-10-17T12:00:00Z', team: {id: 'team1'}};
const group = (id, items, extra = {}) => ({id, type: 'group', data: {items, label: 'original group metadata'}, ...extra});
const text = {id: 'text1', type: 'text', data: {content: '<p>Workshop</p>'}};
const unsafeId = '3458764655334159047';
const adjacentId = '3458764655334159048';

test('group membership slices merge once in first-seen order and preserve every raw page/fragment', async () => {
  const pages = [
    {size: 2, limit: 3, data: [group('group1', ['a', 'b']), group('group2', ['c'])], cursor: 'next', type: 'list'},
    {size: 2, limit: 3, data: [group('group1', ['b', 'd']), group('group3', ['e'])], type: 'list'},
  ];
  const before = structuredClone(pages), cursors = [];
  const result = await collectGroupPages(async ({cursor, limit}) => {
    assert.equal(limit, 50); cursors.push(cursor); return pages[cursor ? 1 : 0];
  }, {config});
  assert.deepEqual(result.groups.map(g => g.id), ['group1', 'group2', 'group3']);
  assert.deepEqual(result.groups[0], group('group1', ['a', 'b', 'd']));
  assert.deepEqual(result.pages, before);
  assert.deepEqual(pages, before, 'canonical membership union must not mutate original fragments');
  assert.deepEqual(cursors, [undefined, 'next']);
});

test('unique legacy groups without membership lists still work; repeated groups need mergeable membership slices', async () => {
  const unique = await collectGroupPages(async () => ({data: [{id: 'group1', type: 'group'}]}), {config});
  assert.deepEqual(unique.groups, [{id: 'group1', type: 'group'}]);
  let index = 0;
  await assert.rejects(collectGroupPages(async () => [
    {data: [{id: 'group1', type: 'group'}], cursor: 'next'},
    {data: [group('group1', ['a'])]},
  ][index++], {config}), {code: 'duplicate_or_malformed_group'});
});

test('group metadata conflicts and malformed member IDs fail closed', async () => {
  for (const changed of [group('group1', ['b'], {type: 'other'}), {id: 'group1', type: 'group', data: {items: ['b'], label: 'changed'}}]) {
    let index = 0;
    await assert.rejects(collectGroupPages(async () => [
      {data: [group('group1', ['a'])], cursor: 'next'}, {data: [changed]},
    ][index++], {config}), {code: 'conflicting_group_metadata'});
  }
  for (const members of [[1], [null], [{}], ['../a'], ['a/b'], 'a']) {
    await assert.rejects(collectGroupPages(async () => ({data: [group('group1', members)]}), {config}), {code: 'malformed_group_members'});
  }
});

test('group pagination retains cursor, size, total and resource guards while ordinary duplicates remain invalid', async () => {
  let index = 0;
  await assert.rejects(collectGroupPages(async () => [
    {data: [group('group1', ['a'])], cursor: 'same'}, {data: [group('group1', ['b'])], cursor: 'same'},
  ][index++], {config}), {code: 'repeated_cursor'});
  for (const [page, code] of [
    [{data: [group('group1', ['a'])], size: 2}, 'malformed_page'],
    [{data: [group('group1', ['a'])], cursor: 1}, 'malformed_cursor'],
    [{data: [group('group1', ['a'])], total: 2}, 'incomplete_pagination'],
    [{data: [], links: {next: 'https://api.miro.com/next'}}, 'incomplete_pagination'],
  ]) await assert.rejects(collectGroupPages(async () => page, {config}), {code});
  await assert.rejects(collectGroupPages(async () => ({data: [group('group1', ['a', 'b'])]}), {config: {...config, maxItems: 1}}), {code: 'item_limit'});
  await assert.rejects(collectGroupPages(async () => ({data: [group('group1', ['a'])], cursor: 'next'}), {config: {...config, maxPages: 1}}), {code: 'page_limit'});
  await assert.rejects(collectCursorPages(async () => ({data: [text, text]}), {config}), {code: 'duplicate_or_malformed_item'});
});

test('optional group totals count membership slices, stay consistent and reject ambiguous legacy totals', async () => {
  const pages = [
    {data: [group('group1', ['a', 'b']), group('group2', ['c'])], size: 2, total: 4, cursor: 'next'},
    {data: [group('group1', ['d'])], size: 1, total: 4},
  ];
  let index = 0;
  const result = await collectGroupPages(async () => pages[index++], {config});
  assert.equal(result.groups.length, 2);
  assert.deepEqual(result.groups[0].data.items, ['a', 'b', 'd']);
  assert.deepEqual(result.pages, pages);
  index = 0;
  await assert.rejects(collectGroupPages(async () => [pages[0], {...pages[1], total: 5}][index++], {config}), {code: 'inconsistent_group_total'});
  await assert.rejects(collectGroupPages(async () => ({data: [{id: 'group1', type: 'group'}], total: 1}), {config}), {code: 'ambiguous_group_total'});
  index = 0;
  await assert.rejects(collectGroupPages(async () => [
    {data: [{id: 'group1', type: 'group'}], cursor: 'next'},
    {data: [group('group2', ['a'])], total: 2},
  ][index++], {config}), {code: 'ambiguous_group_total'});
  await assert.rejects(collectGroupPages(async () => ({data: [group('group1', ['a', 'b'])], total: 1}), {config}), {code: 'incomplete_pagination'});
});

function rawClient(raw) {
  return createMiroClient({config, fetchImpl: async () => new Response(raw, {headers: {'content-type': 'application/json'}})});
}

test('numeric 64-bit wrapper IDs use original JSON digits; adjacent rounded IDs never authorize', async () => {
  assert.equal(Number(unsafeId), Number(adjacentId), 'fixture must reproduce Number collision');
  const raw = `{"size":1,"limit":50,"data":{"id":${unsafeId},"type":"group","data":[{"id":"text1","type":"text","position":{"x":1.25,"y":-2},"data":{"content":"original id ${unsafeId}","count":42,"value":${unsafeId}}}]},"links":{},"type":"list"}`;
  const page = await rawClient(raw).listGroupItems('board1', unsafeId);
  assert.equal(page.data.id, unsafeId);
  assert.equal(normalizeGroupPage(page, unsafeId).data[0].id, 'text1');
  assert.throws(() => normalizeGroupPage(page, adjacentId), {code: 'malformed_page'});
  assert.deepEqual(page.data.data[0].position, {x: 1.25, y: -2});
  assert.equal(page.data.data[0].data.content, `original id ${unsafeId}`);
  assert.equal(page.data.data[0].data.count, 42);
  assert.equal(typeof page.data.data[0].data.value, 'number');
  const itemClient = rawClient(`{"id":${unsafeId},"type":"group"}`);
  assert.equal((await itemClient.readItem('board1', unsafeId, 'group')).id, unsafeId);
  await assert.rejects(itemClient.readItem('board1', adjacentId, 'group'), {code: 'malformed_item'});
});

test('numeric ID parser rejects unsupported lexical syntax and runtimes without source tokens', async () => {
  for (const token of ['1e3', '123.0', '-1', '-0', '1'.repeat(201)]) {
    await assert.rejects(rawClient(`{"data":{"id":${token},"data":[]}}`).listGroupItems('board1', '1000'), {code: 'malformed_numeric_id'});
  }
  const parse = JSON.parse;
  try {
    JSON.parse = (raw, reviver) => parse(raw, reviver ? function (key, value) { return reviver.call(this, key, value); } : undefined);
    await assert.rejects(rawClient(`{"data":{"id":${unsafeId},"data":[]}}`).listGroupItems('board1', unsafeId), {code: 'malformed_numeric_id'});
  } finally { JSON.parse = parse; }
});

function snapshotClient() {
  const calls = [], groupPages = [{size: 1, data: [group('group1', ['text1'])], cursor: 'next'}, {size: 1, data: [group('group1', ['table1'])]}];
  const memberships = {size: 2, limit: 50, data: {id: 'group1', type: 'group', data: [text, {id: 'table1', type: 'table'}]}, type: 'list'};
  const client = {
    readBoard: async () => { calls.push('board'); return board; },
    listGroups: async (_boardId, options) => { calls.push('groups'); return groupPages[options.cursor ? 1 : 0]; },
    listGroupItems: async () => { calls.push('members'); return memberships; },
    listItems: async () => { calls.push('items'); return {data: [text]}; },
    readItem: async () => { calls.push('hydrate'); return text; },
    listConnectors: async () => ({data: []}),
    listTags: async () => ({data: [], total: 0}),
  };
  return {client, calls, groupPages, memberships};
}

test('snapshot preserves canonical groups, original group pages and full membership envelopes before hydration', async () => {
  const f = snapshotClient();
  const snapshot = await fetchBoardSnapshot({client: f.client, boardId: 'board1', config});
  assert.deepEqual(snapshot.groups, [group('group1', ['text1', 'table1'])]);
  assert.deepEqual(snapshot.groupPages, f.groupPages);
  assert.deepEqual(snapshot.groupItems.group1, f.memberships.data.data);
  assert.deepEqual(snapshot.groupItemPages.group1, [f.memberships]);
  assert.deepEqual(f.calls.slice(0, 6), ['board', 'groups', 'groups', 'members', 'items', 'hydrate']);
});

test('group and membership failures occur before any typed hydration', async () => {
  for (const failMembership of [false, true]) {
    const f = snapshotClient();
    if (failMembership) f.client.listGroupItems = async () => ({data: {id: 'wrong', data: [text]}});
    else f.client.listGroups = async () => ({data: [group('group1', [123])]});
    await assert.rejects(fetchBoardSnapshot({client: f.client, boardId: 'board1', config}), {code: failMembership ? 'malformed_page' : 'malformed_group_members'});
    assert(!f.calls.includes('hydrate'));
    assert(!f.calls.includes('items'));
  }
});

test('a consistency retry fetches structural pages afresh and retains only the new capture', async () => {
  const f = snapshotClient(); let reads = 0, captures = 0;
  f.client.readBoard = async () => ({...board, modifiedAt: ++reads === 1 ? board.modifiedAt : '2026-10-17T13:00:00Z'});
  f.client.listGroups = async () => ({data: [group('group1', ['text1'], {capture: ++captures})]});
  const snapshot = await fetchBoardSnapshot({client: f.client, boardId: 'board1', config});
  assert.equal(captures, 2);
  assert.equal(snapshot.groups[0].capture, 2);
  assert.equal(snapshot.groupPages.length, 1);
  assert.equal(snapshot.groupPages[0].data[0].capture, 2);
  assert.equal(snapshot.groupItemPages.group1.length, 1);
});
