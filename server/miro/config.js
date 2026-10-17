const integer = (value, fallback, min, max) => value === undefined || value === '' ? fallback : Number.isInteger(Number(value)) && Number(value) >= min && Number(value) <= max ? Number(value) : null;
export const validMiroId = value => typeof value === 'string' && /^[a-zA-Z0-9_=-]{1,200}$/.test(value);
export function parseBoardIds(value = '') {
  if (typeof value !== 'string') throw new Error('invalid_board_scope');
  const ids = value.split(',').map(v => v.trim()).filter(Boolean).map(v => {
    if (!v.startsWith('https://')) { if (!validMiroId(v)) throw new Error('invalid_board_scope'); return v; }
    let url; try { url = new URL(v); } catch { throw new Error('invalid_board_scope'); }
    const match = /^\/app\/board\/([^/]+)\/?$/.exec(url.pathname);
    if (!['miro.com', 'www.miro.com'].includes(url.hostname) || url.username || url.password || !match) throw new Error('invalid_board_scope');
    const id = decodeURIComponent(match[1]); if (!validMiroId(id)) throw new Error('invalid_board_scope'); return id;
  });
  if (ids.length > 100) throw new Error('invalid_board_scope');
  return [...new Set(ids)];
}
export function readMiroConfig(env = process.env) {
  const issues = [];
  let boardIds = []; try { boardIds = parseBoardIds(env.MIRO_BOARD_IDS); } catch { issues.push('invalid_board_scope'); }
  const enabled = env.MIRO_SYNC_ENABLED === 'true';
  if (env.MIRO_SYNC_ENABLED && !['true', 'false'].includes(env.MIRO_SYNC_ENABLED)) issues.push('invalid_enabled');
  const accessToken = (env.MIRO_ACCESS_TOKEN || '').trim();
  const teamId = (env.MIRO_TEAM_ID || '').trim() || null;
  if (!accessToken || /[\r\n]/.test(accessToken)) issues.push('missing_or_invalid_token');
  if (!boardIds.length) issues.push('missing_board_scope');
  if (teamId && !validMiroId(teamId)) issues.push('invalid_team_scope');
  const limits = {
    requestTimeoutMs: integer(env.MIRO_REQUEST_TIMEOUT_MS, 30000, 1000, 60000),
    maxRunMs: integer(env.MIRO_MAX_RUN_MS, 1200000, 1000, 3600000),
    maxPages: integer(env.MIRO_MAX_PAGES, 2000, 1, 10000),
    maxItems: integer(env.MIRO_MAX_ITEMS, 20000, 1, 100000),
    maxBytes: integer(env.MIRO_MAX_BYTES, 33554432, 1024, 134217728),
    maxRequests: integer(env.MIRO_MAX_REQUESTS, 50000, 1, 200000),
    maxResponseBytes: integer(env.MIRO_MAX_RESPONSE_BYTES, 8388608, 1024, 33554432),
    maxRetries: integer(env.MIRO_MAX_RETRIES, 3, 0, 5),
    maxRetryDelayMs: integer(env.MIRO_MAX_RETRY_DELAY_MS, 60000, 100, 120000),
    captureRetries: integer(env.MIRO_CAPTURE_RETRIES, 1, 0, 2),
    leaseSeconds: integer(env.MIRO_LEASE_SECONDS, 900, 120, 3600),
  };
  if (Object.values(limits).includes(null)) issues.push('invalid_resource_limit');
  return Object.freeze({enabled, configured: issues.length === 0, issues: Object.freeze(issues), accessToken, boardIds: Object.freeze(boardIds), teamId, ...limits});
}
export function isMiroScheduleDue(date = new Date()) {
  return new Intl.DateTimeFormat('en-US', {timeZone: 'America/New_York', hour: '2-digit', hourCycle: 'h23'}).format(date) === '06';
}
