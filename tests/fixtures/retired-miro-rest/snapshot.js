import {createHash} from 'node:crypto';
import {MiroError} from './client.js';
import {validMiroId} from './config.js';
const object = v => v && typeof v === 'object' && !Array.isArray(v);
const merge = (a, b) => Object.fromEntries([...new Set([...Object.keys(a), ...Object.keys(b)])].map(key => [key, object(a[key]) && object(b[key]) ? merge(a[key], b[key]) : Object.hasOwn(b,key) ? b[key] : a[key]]));
/** Flatten the official nested group-items envelope without hiding continuation. */
export function normalizeGroupPage(raw, groupId) {
  if (!object(raw)) throw new MiroError('malformed_page');
  const envelopes = [raw];
  let data;
  if (Array.isArray(raw.data)) data = raw.data;
  else if (raw.data?.id === groupId && Array.isArray(raw.data.data)) {
    envelopes.push(raw.data);
    data = raw.data.data.flatMap(entry => {
      if (!object(entry)) throw new MiroError('malformed_page');
      if (Array.isArray(entry.data)) {
        envelopes.push(entry);
        if (entry.size != null && (!Number.isInteger(entry.size) || entry.size !== entry.data.length)) throw new MiroError('malformed_page');
        return entry.data;
      }
      if (validMiroId(entry.id)) return [entry];
      throw new MiroError('malformed_page');
    });
  } else throw new MiroError('malformed_page');
  const cursors = new Set();
  for (const envelope of envelopes) {
    if (envelope.cursor != null && envelope.cursor !== '') {
      if (typeof envelope.cursor !== 'string' || envelope.cursor.length > 8192) throw new MiroError('malformed_cursor');
      cursors.add(envelope.cursor);
    }
    if (envelope.total != null && (!Number.isInteger(envelope.total) || envelope.total < 0)) throw new MiroError('malformed_page');
    if (envelope.offset != null && (!Number.isInteger(envelope.offset) || envelope.offset < 0)) throw new MiroError('malformed_page');
  }
  if (cursors.size > 1) throw new MiroError('ambiguous_group_pagination');
  const cursor = [...cursors][0] || null;
  if (!cursor && envelopes.some(envelope => envelope.links?.next || envelope !== raw && Array.isArray(envelope.data) && envelope.total != null && (envelope.offset || 0) + envelope.data.length < envelope.total)) throw new MiroError('incomplete_group_pagination');
  const nestedTotals = envelopes.slice(1).filter(envelope => Array.isArray(envelope.data) && envelope.total != null).map(envelope => envelope.total);
  if (new Set(nestedTotals).size > 1) throw new MiroError('ambiguous_group_pagination');
  const total = raw.total ?? raw.data?.total ?? nestedTotals[0];
  return {data,cursor,total,size:raw.size,links:raw.links};
}
export async function collectCursorPages(read, {config, onProgress = async () => {}, groupId, rawPages} = {}) {
  const result = [], ids = new Set(), cursors = new Set(); let cursor;
  for (let page = 0; ; page++) {
    if (page >= config.maxPages) throw new MiroError('page_limit');
    const response = await read({limit:50, cursor});
    const raw = groupId ? normalizeGroupPage(response,groupId) : response;
    const data = raw.data;
    if (!Array.isArray(data)) throw new MiroError('malformed_page');
    if (raw.size != null && (!Number.isInteger(raw.size) || raw.size !== data.length)) throw new MiroError('malformed_page');
    if (raw.total != null && (!Number.isInteger(raw.total) || raw.total < 0)) throw new MiroError('malformed_page');
    if (rawPages) rawPages.push(response);
    for (const entry of data) {
      if (!object(entry) || !validMiroId(entry.id) || ids.has(entry.id)) throw new MiroError('duplicate_or_malformed_item');
      ids.add(entry.id); result.push(entry);
      if (result.length > config.maxItems) throw new MiroError('item_limit');
    }
    await onProgress();
    const next = raw.cursor;
    if (next != null && next !== '' && (typeof next !== 'string' || next.length > 8192)) throw new MiroError('malformed_cursor');
    if (!next) {
      if (raw.links?.next || raw.total != null && result.length !== raw.total) throw new MiroError('incomplete_pagination');
      return result;
    }
    if (!data.length || cursors.has(next)) throw new MiroError('repeated_cursor');
    cursors.add(next); cursor = next;
  }
}
/** /groups paginates membership slices, so a group may span several pages. */
export async function collectGroupPages(read, {config, onProgress = async () => {}} = {}) {
  const groups = [], pages = [], byId = new Map(), cursors = new Set();
  let cursor, expectedTotal, fragments = 0, memberCount = 0, membershipItems = 0, unknownMembershipCount = false;
  for (let page = 0; ; page++) {
    if (page >= config.maxPages) throw new MiroError('page_limit');
    const raw = await read({limit:50, cursor});
    if (!object(raw) || !Array.isArray(raw.data) || raw.size != null && (!Number.isInteger(raw.size) || raw.size !== raw.data.length)
      || raw.total != null && (!Number.isInteger(raw.total) || raw.total < 0)) throw new MiroError('malformed_page');
    if (raw.total != null) {
      if (expectedTotal != null && raw.total !== expectedTotal) throw new MiroError('inconsistent_group_total');
      expectedTotal = raw.total;
    }
    pages.push(raw);
    for (const entry of raw.data) {
      if (!object(entry) || !validMiroId(entry.id) || entry.data !== undefined && !object(entry.data)) throw new MiroError('malformed_group');
      if (++fragments > config.maxItems) throw new MiroError('item_limit');
      const hasMembers = object(entry.data) && Object.hasOwn(entry.data, 'items');
      const members = hasMembers ? entry.data.items : null;
      if (hasMembers && (!Array.isArray(members) || members.some(id => !validMiroId(id)))) throw new MiroError('malformed_group_members');
      if (hasMembers) membershipItems += members.length;
      else unknownMembershipCount = true;
      const metadata = {...entry, ...(object(entry.data) ? {data:Object.fromEntries(Object.entries(entry.data).filter(([key]) => key !== 'items'))} : {})};
      const previous = byId.get(entry.id);
      if (previous) {
        if (!hasMembers || !previous.members) throw new MiroError('duplicate_or_malformed_group');
        if (canonical(previous.metadata) !== canonical(metadata)) throw new MiroError('conflicting_group_metadata');
        for (const id of members) if (!previous.members.has(id)) {
          previous.members.add(id); previous.group.data.items.push(id);
          if (++memberCount > config.maxItems) throw new MiroError('item_limit');
        }
      } else {
        const unique = hasMembers ? new Set(members) : null;
        memberCount += unique?.size || 0;
        if (memberCount > config.maxItems) throw new MiroError('item_limit');
        const group = {...entry, ...(hasMembers ? {data:{...entry.data,items:[...unique]}} : {})};
        groups.push(group); byId.set(entry.id, {group,metadata,members:unique});
      }
    }
    // /groups totals, when supplied, count paginated membership items rather
    // than unique groups. Legacy entries without member arrays are ambiguous.
    if (expectedTotal != null && unknownMembershipCount) throw new MiroError('ambiguous_group_total');
    if (expectedTotal != null && membershipItems > expectedTotal) throw new MiroError('incomplete_pagination');
    await onProgress();
    const next = raw.cursor;
    if (next != null && next !== '' && (typeof next !== 'string' || next.length > 8192)) throw new MiroError('malformed_cursor');
    if (!next) {
      if (raw.links?.next || expectedTotal != null && membershipItems !== expectedTotal) throw new MiroError('incomplete_pagination');
      return {groups,pages};
    }
    if (!raw.data.length || cursors.has(next)) throw new MiroError('repeated_cursor');
    cursors.add(next); cursor = next;
  }
}
async function collectTags(client, boardId, config, signal) {
  const tags = [], ids = new Set(); let offset = 0, expected;
  for (let page = 0; ; page++) {
    if (page >= config.maxPages) throw new MiroError('page_limit');
    const raw = await client.listTags(boardId, {offset,limit:50,signal});
    if (!Array.isArray(raw.data) || !Number.isInteger(raw.total) || raw.total < 0 || raw.offset != null && raw.offset !== offset || raw.size != null && raw.size !== raw.data.length) throw new MiroError('malformed_tags');
    if (expected != null && expected !== raw.total) throw new MiroError('board_changed');
    expected = raw.total;
    for (const tag of raw.data) {
      if (!object(tag) || !validMiroId(tag.id) || ids.has(tag.id)) throw new MiroError('malformed_tags');
      ids.add(tag.id); tags.push(tag);
      if (tags.length > config.maxItems) throw new MiroError('item_limit');
    }
    offset += raw.data.length;
    if (offset === raw.total) return tags;
    if (!raw.data.length || offset > raw.total) throw new MiroError('incomplete_pagination');
  }
}
const canonical = v => Array.isArray(v) ? `[${v.map(canonical).join(',')}]` : object(v) ? `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}` : JSON.stringify(v);
export function snapshotContentHash(snapshot) {
  const {captureStartedAt, captureFinishedAt, coverage, ...content} = snapshot;
  return createHash('sha256').update(canonical(content)).digest('hex');
}
/** Reads only Miro. Callers must enforce the requesting member's source permission first. */
export async function fetchBoardSnapshot({client, boardId, config, signal, onProgress = async () => {}, now = () => new Date()} = {}) {
  for (let attempt = 0; ; attempt++) {
    const captureStartedAt = new Date(now()).toISOString();
    const board = await client.readBoard(boardId, {signal});
    const listOptions = {config,onProgress};
    // Validate structural pagination before spending the run on typed hydration.
    // Every capture/retry reads its own groups and membership pages afresh.
    const {groups,pages:groupPages} = await collectGroupPages(options => client.listGroups(boardId, {...options,signal}), listOptions);
    const groupItems = Object.create(null), groupItemPages = Object.create(null);
    for (const group of groups) {
      groupItemPages[group.id] = [];
      groupItems[group.id] = await collectCursorPages(options => client.listGroupItems(boardId, group.id, {...options,signal}),
        {...listOptions,groupId:group.id,rawPages:groupItemPages[group.id]});
    }
    const genericItems = await collectCursorPages(options => client.listItems(boardId, {...options,signal}), listOptions);
    const items = [];
    for (const item of genericItems) {
      if (typeof item.type !== 'string' || !item.type) throw new MiroError('malformed_item');
      items.push(merge(item, await client.readItem(boardId, item.id, item.type, {signal})));
      await onProgress();
    }
    const connectors = await collectCursorPages(options => client.listConnectors(boardId, {...options,signal}), listOptions);
    for (let index = 0; index < connectors.length; index++) connectors[index] = merge(connectors[index], await client.readItem(boardId, connectors[index].id, 'connector', {signal}));
    const tags = await collectTags(client, boardId, config, signal);
    const itemTags = Object.create(null);
    // Miro supports tag attachment to cards and sticky notes only.
    for (const item of items.filter(item => ['card','sticky_note'].includes(item.type))) itemTags[item.id] = (await client.readItemTags(boardId,item.id,{signal})).tags;
    const after = await client.readBoard(boardId, {signal});
    if (board.modifiedAt !== after.modifiedAt) {
      if (attempt < config.captureRetries) continue;
      throw new MiroError('board_changed');
    }
    const knownTypes = new Set(['card','app_card','shape','text','sticky_note','frame','image','document','embed','connector']);
    const snapshot = {schemaVersion:1,board:after,items,connectors,groups,groupPages,tags,itemTags,groupItems,groupItemPages,
      coverage:{complete:true,scope:'rest_api_exposed_objects',consistency:'modifiedAt_before_after_best_effort',sourceUrl:`https://miro.com/app/board/${encodeURIComponent(boardId)}/`,
        genericItems,unsupportedTypes:[...new Set(items.filter(item => !knownTypes.has(item.type)).map(item => item.type))],
        counts:{items:items.length,connectors:connectors.length,groups:groups.length,tags:tags.length},
        caveats:['REST does not expose every Miro object or visual behavior.','No screenshots, comments, external link contents or binary assets are fetched.','Geometry, HTML and explicit relationships are preserved without inferring calendar dates or color meanings.','Concurrent edits are detected using board modifiedAt; the Miro API provides no transactional snapshot.']},
      captureStartedAt,captureFinishedAt:new Date(now()).toISOString()};
    if (Buffer.byteLength(JSON.stringify(snapshot)) > config.maxBytes) throw new MiroError('byte_limit');
    return snapshot;
  }
}
