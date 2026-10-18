import {validMiroId} from './config.js';
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
      for await (const chunk of response.body) { bytes += chunk.byteLength; if (bytes > 150000000) { await response.body?.cancel().catch(() => {}); return {status:'unavailable'}; } chunks.push(chunk); }
      const text = Buffer.concat(chunks).toString('utf8');
      return {status:'ready',data:text ? JSON.parse(text) : null};
    } catch { return {status:signal?.aborted ? 'aborted' : 'unavailable'}; }
  }
  const leaseArgs = options => validMiroId(options.boardId) && uuid(options.leaseToken) && Number.isSafeInteger(options.configRevision) && options.configRevision > 0 ? {p_board_id:options.boardId,p_lease_token:options.leaseToken,p_config_revision:options.configRevision} : null;
  const leaseCall = async (name, options, extra = {}) => {
    const args = leaseArgs(options); if (!args) return {status:'invalid_request'};
    const result = await rpc(`miro_sync_${name}`, {...args,...extra}, options.signal);
    return {...result,status:result.status === 'ready' && result.data !== true ? 'stale' : result.status};
  };
  async function authorized(name, {principal,boardId,signal} = {}) {
    const ids = principal?.allowedSourceIds;
    if (!validMiroId(boardId) || !Array.isArray(ids) || !ids.length || ids.length > 500 || !ids.every(uuid)) return {status:'forbidden'};
    const result = await rpc(name, {p_member_id:principal?.id ?? null,p_allowed_source_ids:[...new Set(ids)],p_board_id:boardId}, signal);
    return result.status === 'ready' && !result.data ? {status:'forbidden'} : result;
  }
  return Object.freeze({configured,
    async register({boardId,teamId = null,signal} = {}) {
      if (!validMiroId(boardId) || teamId !== null && !validMiroId(teamId)) return {status:'invalid_request'};
      return rpc('miro_sync_register', {p_board_id:boardId,p_team_id:teamId}, signal);
    },
    async claim({boardId,leaseSeconds = 900,signal} = {}) {
      if (!validMiroId(boardId) || !Number.isInteger(leaseSeconds) || leaseSeconds < 120 || leaseSeconds > 3600) return {status:'invalid_request'};
      const result = await rpc('miro_sync_claim', {p_board_id:boardId,p_lease_seconds:leaseSeconds}, signal);
      if (result.status !== 'ready') return result;
      const row = Array.isArray(result.data) ? result.data[0] : result.data;
      if (!row) return {status:'busy'};
      const configRevision = Number(row.config_revision);
      if (!uuid(row.lease_token) || !Number.isSafeInteger(configRevision) || configRevision < 1) return {status:'unavailable'};
      return {status:'ready',leaseToken:row.lease_token,configRevision};
    },
    renew:options => leaseCall('renew', options, {p_lease_seconds:options.leaseSeconds || 900}),
    // Migration 014 stores the intact payload as data; retain the RPC wire keys
    // so this adapter is compatible with both the original and simplified schema.
    finish:options => leaseCall('finish', options, {p_snapshot:options.snapshot,p_content_hash:options.contentHash}),
    fail:options => leaseCall('fail', options, {p_error_code:/^[a-z_]{1,64}$/.test(options.errorCode) ? options.errorCode : 'unexpected_error'}),
    authorizedBoard:options => authorized('miro_authorized_board', options),
    getAuthorizedBoard:options => authorized('miro_get_authorized_board', options),
  });
}
