import { createHash } from 'node:crypto';
import { classifyMiroToolError } from '../mcp-client.js';

export const urlFor = (board, item) =>
  `https://miro.com/app/board/${encodeURIComponent(board)}/${item ? `?moveToWidget=${encodeURIComponent(item)}` : ''}`;
// Miro's MCP URL parser rejects percent-encoded '=' board IDs, even though the
// canonical citation URL is valid. IDs have already passed a strict path charset.
export const upstreamUrl = (board, item) =>
  `https://miro.com/app/board/${board}/${item ? `?moveToWidget=${item}` : ''}`;
export const blocked = (status) => ({
  status,
  sources: [],
  coverage: { complete: false, reason: status },
});
export const quotaNotices = Object.freeze({
  quota_exhausted:
    'Miro has reached its daily tool-call allowance. Live content is unavailable until the daily reset; honor retryAt when present and do not retry in this request.',
  budget_exhausted:
    'The shared Miro read budget is exhausted. Honor retryAt when present and do not retry in this request.',
  reconciliation_deferred:
    'Background Miro reconciliation is deferred by its read schedule. Honor retryAt when present; this does not establish board contents or synchronization.',
  quota_state_unavailable:
    'The shared Miro read budget cannot currently be checked. Live content is unavailable; do not retry in this request.',
});
const safeRetryAt = (value) =>
  typeof value === 'string' &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) &&
  Number.isFinite(Date.parse(value)) &&
  new Date(value).toISOString() === value
    ? value
    : undefined;
export const quotaFailure = (code, error) => ({
  ...blocked(code),
  contentAvailable: false,
  notice: quotaNotices[code],
  ...(safeRetryAt(error?.retryAt) ? { retryAt: error.retryAt } : {}),
});
const requestNotices = Object.freeze({
  schema:
    'Use the declared tool schema and exact native boardId/itemId values returned by live Miro navigation. Do not guess IDs or repeat unchanged invalid arguments.',
  canvas_options:
    'For type=canvas, omit limit and cursor; use itemIds and/or scope to narrow content. For JSON fragments use offset and expectedHash. Copy exact returned native IDs.',
  table_options:
    'For type=table, omit scope and itemIds; use limit and cursor from nextCursor for rows. For JSON fragments use offset and expectedHash. Copy exact returned native IDs.',
});
export const invalidRequest = (reason) => ({
  ...blocked('invalid_request'),
  reason,
  notice: requestNotices[reason],
});
const plain = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
export const digest = (text) => createHash('sha256').update(text).digest('hex');
export function sameBoard(url, board, item) {
  try {
    const u = new URL(url);
    return (
      u.origin === 'https://miro.com' &&
      !u.username &&
      !u.password &&
      decodeURIComponent(u.pathname).replace(/\/$/, '') === `/app/board/${board}` &&
      (!item ||
        u.searchParams.get('moveToWidget') === item ||
        u.searchParams.get('focusWidget') === item)
    );
  } catch {
    return false;
  }
}
export function unpack(result) {
  if (!plain(result) || (Object.hasOwn(result, 'isError') && typeof result.isError !== 'boolean'))
    throw new Error('invalid_mcp_result');
  if (result.isError) throw new Error(classifyMiroToolError(result));
  if (Object.hasOwn(result, 'structuredContent')) {
    if (!plain(result.structuredContent)) throw new Error('invalid_mcp_result');
    return result.structuredContent;
  }
  if (
    !Array.isArray(result.content) ||
    result.content.some(
      (block) =>
        !plain(block) ||
        typeof block.type !== 'string' ||
        (block.type === 'text' && typeof block.text !== 'string'),
    )
  )
    throw new Error('invalid_mcp_result');
  const text = result.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n');
  if (!text) throw new Error('invalid_mcp_result');
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error('invalid_mcp_result');
  }
  if (!plain(value)) throw new Error('invalid_mcp_result');
  return value;
}
