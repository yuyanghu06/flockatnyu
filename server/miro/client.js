import {setTimeout as delay} from 'node:timers/promises';
import {readMiroConfig, validMiroId} from './config.js';
export class MiroError extends Error {
  constructor(code) { super(code); this.name = 'MiroError'; this.code = code; }
}
export const miroErrorCode = error => error instanceof MiroError ? error.code : 'unexpected_error';
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const endpoints = Object.freeze({card:'cards', app_card:'app_cards', shape:'shapes', text:'texts', sticky_note:'sticky_notes', frame:'frames', image:'images', document:'documents', embed:'embeds', connector:'connectors'});
function originalIds(key, value, context) {
  if (key !== 'id' || typeof value !== 'number') return value;
  // Miro occasionally serializes 64-bit IDs as JSON numbers. The parsed Number
  // has already lost digits, so only the original integer token is trustworthy.
  if (typeof context?.source !== 'string' || !/^(?:0|[1-9][0-9]{0,199})$/.test(context.source)) throw new MiroError('malformed_numeric_id');
  return context.source;
}
export function createMiroClient({config = readMiroConfig(), fetchImpl = globalThis.fetch, signal, onProgress = async () => {}, now = Date.now, sleep = (ms, signal) => delay(ms, undefined, {signal})} = {}) {
  const started = now(); let requests = 0, bytes = 0, pages = 0;
  const stats = () => ({requests, bytes, pages});
  function guard(localSignal) {
    if (signal?.aborted || localSignal?.aborted) throw new MiroError('aborted');
    if (now() - started >= config.maxRunMs) throw new MiroError('runtime_limit');
  }
  function boardPath(boardId) {
    if (!config.configured) throw new MiroError('not_configured');
    if (!validMiroId(boardId) || !config.boardIds.includes(boardId)) throw new MiroError('board_not_allowed');
    return `/v2/boards/${encodeURIComponent(boardId)}`;
  }
  const itemPart = itemId => { if (!validMiroId(itemId)) throw new MiroError('invalid_item_id'); return encodeURIComponent(itemId); };
  async function request(path, query = {}, localSignal) {
    guard(localSignal);
    const url = new URL(`https://api.miro.com${path}`);
    for (const [key, value] of Object.entries(query)) if (value !== null && value !== undefined) url.searchParams.set(key, String(value));
    for (let attempt = 0; ; attempt++) {
      guard(localSignal); await onProgress(); guard(localSignal);
      if (++requests > config.maxRequests) throw new MiroError('request_limit');
      const timeout = AbortSignal.timeout(Math.max(1, Math.min(config.requestTimeoutMs, config.maxRunMs - (now() - started))));
      const combined = AbortSignal.any([signal, localSignal, timeout].filter(Boolean));
      let response;
      try { response = await fetchImpl(url.href, {method:'GET', headers:{Authorization:`Bearer ${config.accessToken}`, Accept:'application/json'}, redirect:'error', signal:combined}); }
      catch { guard(localSignal); throw new MiroError(timeout.aborted ? 'request_timeout' : 'network_error'); }
      if (response.status === 429 || response.status >= 500 && response.status <= 599) {
        await response.body?.cancel();
        if (attempt >= config.maxRetries) throw new MiroError(response.status === 429 ? 'rate_limit' : 'upstream_unavailable');
        const value = response.headers.get('retry-after');
        const wait = value == null ? Math.min(1000 * 2 ** attempt, config.maxRetryDelayMs) : /^\d+(\.\d+)?$/.test(value) ? Math.ceil(Number(value) * 1000) : Math.max(0, Date.parse(value) - now());
        if (!Number.isFinite(wait) || wait > config.maxRetryDelayMs) throw new MiroError('retry_delay_limit');
        if (now() - started + wait >= config.maxRunMs) throw new MiroError('runtime_limit');
        // Renew between bounded wait slices so throttling cannot silently expire a lease.
        for (let left = wait; left > 0; left -= Math.min(left, 10000)) {
          try { await sleep(Math.min(left, 10000), AbortSignal.any([signal,localSignal].filter(Boolean))); } catch { guard(localSignal); throw new MiroError('request_timeout'); }
          await onProgress(); guard(localSignal);
        }
        continue;
      }
      if (!response.ok) { await response.body?.cancel(); throw new MiroError(response.status === 401 ? 'auth_required' : response.status === 403 ? 'forbidden' : response.status === 404 ? 'not_found' : 'upstream_error'); }
      const length = Number(response.headers.get('content-length'));
      if (length > config.maxResponseBytes || bytes + length > config.maxBytes) { await response.body?.cancel(); throw new MiroError('byte_limit'); }
      const chunks = []; let responseBytes = 0;
      try {
        for await (const chunk of response.body) {
          guard(localSignal); responseBytes += chunk.byteLength; bytes += chunk.byteLength;
          if (responseBytes > config.maxResponseBytes || bytes > config.maxBytes) throw new MiroError('byte_limit');
          chunks.push(chunk);
        }
      } catch (error) { if (error instanceof MiroError) throw error; guard(localSignal); throw new MiroError(timeout.aborted ? 'request_timeout' : 'network_error'); }
      let raw; try { raw = JSON.parse(Buffer.concat(chunks).toString('utf8'), originalIds); }
      catch (error) { if (error instanceof MiroError) throw error; throw new MiroError('malformed_response'); }
      if (!object(raw)) throw new MiroError('malformed_response');
      await onProgress(); guard(localSignal); return raw;
    }
  }
  async function readBoard(boardId, {signal} = {}) {
    const board = await request(boardPath(boardId), {}, signal);
    if (board.id !== boardId || !Number.isFinite(Date.parse(board.modifiedAt))) throw new MiroError('malformed_board');
    if (config.teamId && board.team?.id !== config.teamId) throw new MiroError('team_mismatch');
    return board;
  }
  async function readItem(boardId, itemId, type, {signal} = {}) {
    const path = `${boardPath(boardId)}/${endpoints[type] || 'items'}/${itemPart(itemId)}`;
    const item = await request(path, {}, signal);
    if (item.id !== itemId || typeof item.type !== 'string' || type && item.type !== type) throw new MiroError('malformed_item');
    if (['shape','text','sticky_note','card'].includes(type) && !object(item.data)) throw new MiroError('missing_item_detail');
    if (['text','sticky_note'].includes(type) && typeof item.data.content !== 'string' || type === 'card' && typeof item.data.title !== 'string' || type === 'shape' && typeof item.data.shape !== 'string' && typeof item.data.content !== 'string') throw new MiroError('missing_item_detail');
    return item;
  }
  async function page(boardId, resource, {cursor, limit = 50, parentItemId, groupItemId, type, offset, signal} = {}) {
    if (!Number.isInteger(limit) || limit < 10 || limit > 50 || cursor != null && (typeof cursor !== 'string' || cursor.length > 8192)) throw new MiroError('invalid_page');
    if (++pages > config.maxPages) throw new MiroError('page_limit');
    return request(`${boardPath(boardId)}/${resource}`, {limit,cursor,parent_item_id:parentItemId,group_item_id:groupItemId,type,offset}, signal);
  }
  return Object.freeze({stats, readBoard, readItem,
    listItems:(id, options) => page(id, 'items', options),
    listConnectors:(id, options) => page(id, 'connectors', options),
    listGroups:(id, options) => page(id, 'groups', options),
    listTags:(id, options) => page(id, 'tags', options),
    listGroupItems:(id, groupItemId, options) => page(id, 'groups/items', {...options,groupItemId}),
    async readItemTags(boardId, itemId, {signal} = {}) {
      const raw = await request(`${boardPath(boardId)}/items/${itemPart(itemId)}/tags`, {}, signal);
      if (!Array.isArray(raw.tags) || raw.tags.some(t => !object(t) || !validMiroId(t.id))) throw new MiroError('malformed_tags');
      return raw;
    },
  });
}
