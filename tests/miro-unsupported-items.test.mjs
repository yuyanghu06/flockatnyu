import test from 'node:test';
import assert from 'node:assert/strict';
import {createMiroTools, MIRO_TOOLS} from '../tools/miro/index.js';
import {createMiroClient} from '../server/miro/client.js';
import {readMiroConfig} from '../server/miro/config.js';

const sourceId = '11111111-1111-4111-8111-111111111111';
const principal = {allowedSourceIds: [sourceId]};
const config = {...readMiroConfig({MIRO_ACCESS_TOKEN: 'offline-fixture-token', MIRO_BOARD_IDS: 'board1', MIRO_TEAM_ID: 'team1'}), maxRetries: 0};
const metadata = {id: 'board1', name: 'Schedule', modifiedAt: '2026-10-17T12:00:00Z', team: {id: 'team1'}};
const frame = {id: 'frame1', type: 'frame', data: {title: 'October 2026'}, geometry: {width: 1000, height: 800}};
const text = {id: 'text1', type: 'text', parent: {id: 'frame1'}, data: {content: '<p>Workshop at 6 PM</p>'}};
const table = {id: 'table1', type: 'table', parent: {id: 'frame1'}, position: {x: 80, y: 140},
  geometry: {width: 600, height: 400}, links: {self: 'https://api.miro.com/v2/boards/board1/items/table1'},
  data: {title: 'Schedule table metadata'}};

function fixture({pages = [{data: [frame, table, text]}], allowed = true, team = 'team1', textStatus, large = false} = {}) {
  const calls = [], store = {configured: true, authorizedBoard: async () => allowed
    ? {status: 'ready', data: {board_id: 'board1', source_id: sourceId, team_id: 'team1'}} : {status: 'forbidden'}};
  const tools = createMiroTools({config, store, clientFactory: () => createMiroClient({config, fetchImpl: async url => {
    const u = new URL(url); calls.push(u);
    if (u.pathname === '/v2/boards/board1') return Response.json({...metadata, team: {id: team}});
    if (u.pathname === '/v2/boards/board1/items') return Response.json(pages[u.searchParams.get('cursor') ? 1 : 0]);
    if (u.pathname.endsWith('/frames/frame1') || u.pathname.endsWith('/items/frame1')) return Response.json(frame);
    if (u.pathname.endsWith('/texts/text1')) return textStatus ? new Response(null, {status: textStatus})
      : Response.json({...text, ...(large ? {data: {content: '<p>' + 'schedule '.repeat(4000) + '</p>'}} : {})});
    assert.fail('Unsupported or unexpected detail request: ' + u.pathname);
  }})});
  return {tools, calls};
}
const execute = (f, name, args, p = principal) => f.tools.execute({name, arguments: args, principal: p});
const readPage = (f, args = {}) => execute(f, 'read_miro_board', {boardId: 'board1', mode: 'items', ...args});

test('mixed frame/table/text keeps original order and unknown metadata while hydrating only supported objects', async () => {
  const f = fixture(), result = await readPage(f);
  assert.equal(result.status, 'partial');
  assert.equal(result.coverage.complete, false);
  assert.deepEqual(result.coverage.unsupportedTypes, ['table']);
  assert.equal(result.coverage.reason, 'unsupported_content');
  assert.deepEqual(result.boardContext.items, [frame, table, text]);
  assert.deepEqual(result.boardContext.itemCoverage, [{itemId: 'table1', type: 'table', status: 'metadata_only', contentAvailable: false,
    notice: result.boardContext.itemCoverage[0].notice}]);
  assert.match(result.boardContext.notice, /Native table cells are unavailable/);
  assert.deepEqual(f.calls.map(u => u.pathname), ['/v2/boards/board1', '/v2/boards/board1/items', '/v2/boards/board1/frames/frame1', '/v2/boards/board1/texts/text1']);
  const citation = result.sources.find(s => s.itemId === 'table1');
  assert.equal(citation.contentAvailable, false);
  assert.equal(citation.partial, true);
  assert.match(citation.excerpt, /^Metadata only\./);
  assert.equal(citation.url, 'https://miro.com/app/board/board1/?moveToWidget=table1');
});

test('supported hydration preserves listing-only nested original metadata without polluting prototypes', async () => {
  const listing = {...text, data: {listingOnly: {label: 'original listing metadata'}},
    position: {x: 4, y: 5}, ...JSON.parse('{"__proto__":{"miroPolluted":true}}')};
  const result = await readPage(fixture({pages: [{data: [listing]}]}));
  assert.equal(result.status, 'ready');
  assert.deepEqual(result.boardContext.items[0].data, {...listing.data, ...text.data});
  assert.deepEqual(result.boardContext.items[0].position, listing.position);
  assert.deepEqual(Object.getOwnPropertyDescriptor(result.boardContext.items[0], '__proto__').value, {miroPolluted: true});
  assert.equal({}.miroPolluted, undefined);
  assert.equal(result.coverage.complete, true);
});

test('mixed unsupported pages preserve opaque cursors and requested frame scope', async () => {
  const cursor = 'opaque/continuation==';
  const f = fixture({pages: [{data: [table, text], cursor}, {data: [frame]}]});
  const first = await readPage(f, {frameId: 'frame1'});
  assert.equal(first.status, 'partial');
  assert.equal(first.boardContext.nextCursor, cursor);
  assert.deepEqual(first.boardContext.items, [table, text]);
  const second = await readPage(f, {frameId: 'frame1', cursor});
  assert.equal(second.status, 'ready');
  assert.equal(second.boardContext.nextCursor, null);
  assert.equal(second.coverage.complete, true);
  const listings = f.calls.filter(u => u.pathname.endsWith('/items'));
  assert.equal(listings[1].searchParams.get('cursor'), cursor);
  assert(listings.every(u => u.searchParams.get('parent_item_id') === 'frame1'));
});

test('missing pagination is still disclosed alongside unsupported content', async () => {
  const result = await readPage(fixture({pages: [{data: [table, text], total: 3}]}));
  assert.equal(result.status, 'partial');
  assert.equal(result.coverage.reason, 'incomplete_pagination');
  assert.deepEqual(result.coverage.unsupportedTypes, ['table']);
  assert.equal(result.boardContext.nextCursor, null);
  assert.equal(result.boardContext.itemCoverage[0].contentAvailable, false);
});

test('large mixed pages keep unknown metadata and disclosure in the fragment index; supported content is recoverable', async () => {
  const f = fixture({large: true, pages: [{data: [frame, table, text], cursor: 'next'}]});
  const page = await readPage(f);
  assert.equal(page.status, 'partial');
  assert.equal(page.boardContext.format, 'miro-board-page-index-v1');
  assert.equal(page.boardContext.nextCursor, 'next');
  assert.deepEqual(page.boardContext.items.map(item => item.id), ['frame1', 'table1', 'text1']);
  assert.deepEqual(page.boardContext.items[1], table);
  assert.equal(page.boardContext.itemCoverage[0].contentAvailable, false);
  assert.deepEqual(page.coverage.unsupportedTypes, ['table']);
  assert.equal(page.coverage.complete, false);
  assert.match(page.boardContext.notice, /Read supported objects/);
  assert.match(page.boardContext.notice, /Native table cells are unavailable/);
  let raw = '', offset = 0;
  do {
    const detail = await execute(f, 'read_miro_item', {boardId: 'board1', itemId: 'text1', type: 'text', offset});
    assert.equal(detail.status, 'ready'); raw += detail.boardContext.data; offset = detail.boardContext.nextOffset;
  } while (offset !== null);
  assert.equal(JSON.parse(raw).data.content, '<p>' + 'schedule '.repeat(4000) + '</p>');
});

test('oversized unsupported listing metadata fails explicitly without truncating originals or attempting detail', async () => {
  const f = fixture({pages: [{data: [{...table, originalMetadata: 'x'.repeat(25000)}]}]});
  const result = await readPage(f);
  assert.equal(result.status, 'context_limit');
  assert.equal(result.boardContext, undefined);
  assert.deepEqual(result.sources, []);
  assert.equal(f.calls.length, 2);
});

test('unknown item types validate safely, authorize board/source/team, and never request unsupported details', async () => {
  const typeSchema = MIRO_TOOLS.find(tool => tool.name === 'read_miro_item').parameters.properties.type;
  assert.equal(typeSchema.enum, undefined);
  for (const type of ['table', 'future_widget']) {
    assert(new RegExp(typeSchema.pattern).test(type));
    const f = fixture(), result = await execute(f, 'read_miro_item', {boardId: 'board1', itemId: 'table1', type});
    assert.equal(result.status, 'unsupported_content');
    assert.equal(result.coverage.complete, false);
    assert.deepEqual(result.coverage.unsupportedTypes, [type]);
    assert.equal(result.boardContext.itemCoverage[0].contentAvailable, false);
    assert.equal(result.boardContext.data, undefined);
    assert.deepEqual(result.sources, []);
    assert.deepEqual(f.calls.map(u => u.pathname), ['/v2/boards/board1']);
  }
  const denied = fixture({allowed: false});
  assert.equal((await execute(denied, 'read_miro_item', {boardId: 'board1', itemId: 'table1', type: 'table'})).status, 'forbidden');
  assert.equal(denied.calls.length, 0);
  const team = fixture({team: 'other'});
  assert.equal((await execute(team, 'read_miro_item', {boardId: 'board1', itemId: 'table1', type: 'table'})).status, 'forbidden');
  assert.equal(team.calls.length, 1);
  const f = fixture();
  for (const type of ['../table', 'table/path', 'a'.repeat(65), '', null]) {
    assert.equal((await execute(f, 'read_miro_item', {boardId: 'board1', itemId: 'table1', type})).status, 'invalid_request');
  }
  assert.equal(f.calls.length, 0);
});

test('supported detail denial still discards the entire mixed page, including previously hydrated objects', async () => {
  for (const [textStatus, expected] of [[401, 'auth_required'], [403, 'forbidden'], [404, 'forbidden'], [500, 'unavailable']]) {
    const result = await readPage(fixture({textStatus}));
    assert.equal(result.status, expected);
    assert.equal(result.coverage.complete, false);
    assert.equal(result.boardContext, undefined);
    assert.deepEqual(result.sources, []);
  }
});
