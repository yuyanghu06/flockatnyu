import {validMiroId} from './mcp-config.js';
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
export function createMiroStore({env = process.env, fetchImpl = globalThis.fetch} = {}) {
  let base;
  try { const url = new URL(env.SUPABASE_URL); if ((url.protocol === 'https:' || url.protocol === 'http:' && ['localhost','127.0.0.1','[::1]'].includes(url.hostname)) && !url.username && !url.password && !url.search && !url.hash && ['','/'].includes(url.pathname)) base = url.origin; } catch {}
  const key = (env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  const configured = Boolean(base && key && !/[\r\n]/.test(key) && typeof fetchImpl === 'function');
  async function rpc(name, args, signal) {
    if (!configured) return {status:'not_configured'};
    if (signal?.aborted) return {status:'aborted'};
    try {
      const combined = AbortSignal.any([signal, AbortSignal.timeout(60000)].filter(Boolean));
      const response = await fetchImpl(`${base}/rest/v1/rpc/${name}`, {method:'POST',headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify(args),redirect:'error',signal:combined});
      if (!response.ok) { await response.body?.cancel(); return {status:[401,403].includes(response.status) ? 'forbidden' : response.status === 409 ? 'stale' : 'unavailable'}; }
      const chunks = []; let bytes = 0;
      for await (const chunk of response.body) { bytes += chunk.byteLength; if (bytes > 65536) { await response.body?.cancel().catch(() => {}); return {status:'unavailable'}; } chunks.push(chunk); }
      const text = Buffer.concat(chunks).toString('utf8');
      return {status:'ready',data:text ? JSON.parse(text) : null};
    } catch { return {status:signal?.aborted ? 'aborted' : 'unavailable'}; }
  }
  async function authorized(name, {principal,boardId,signal} = {}) {
    const ids = principal?.allowedSourceIds;
    if (!validMiroId(boardId) || !Array.isArray(ids) || !ids.length || ids.length > 500 || !ids.every(uuid)) return {status:'forbidden'};
    const result = await rpc(name, {p_member_id:principal?.id ?? null,p_allowed_source_ids:[...new Set(ids)],p_board_id:boardId}, signal);
    return result.status === 'ready' && !result.data ? {status:'forbidden'} : result;
  }
  return Object.freeze({configured,authorizedBoard:options => authorized('miro_authorized_board', options)});
}
