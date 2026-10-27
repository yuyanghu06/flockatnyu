import { plainObject } from './automation/validation.js';
import { SOURCE_TOOL_TIMEOUT_MS } from './source-timeout.js';

const names = Object.freeze({ probe: 'gmail_send_probe', claim: 'gmail_send_claim', finish: 'gmail_send_finish', read: 'gmail_send_read' });
const statuses = new Set(['ready', 'claimed', 'blocked', 'conflict', 'not_found', 'invalid_request']);
const uncertain = () => ({ status: 'unavailable', reason: 'write_outcome_unknown' });

// Fixed operational-metadata RPCs only. No email payload reaches this store.
export function createGmailSendStore({ env = process.env, fetchImpl = globalThis.fetch } = {}) {
  let origin;
  try {
    const url = new URL(env.SUPABASE_URL);
    if ((url.protocol === 'https:' || url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
      && !url.username && !url.password && !url.search && !url.hash && ['', '/'].includes(url.pathname)) origin = url.origin;
  } catch {}
  const key = typeof env.SUPABASE_SERVICE_ROLE_KEY === 'string' ? env.SUPABASE_SERVICE_ROLE_KEY.trim() : '';
  const configured = Boolean(origin && key && !/[\r\n]/.test(key) && typeof fetchImpl === 'function');
  async function rpc(operation, { signal, ...payload } = {}) {
    if (!configured) return { status: 'not_configured' };
    if (!Object.hasOwn(names, operation) || !plainObject(payload)) return { status: 'invalid_request' };
    if (signal?.aborted) return { status: 'aborted' };
    let body;
    try { body = JSON.stringify({ p_payload: payload }); if (Buffer.byteLength(body) > 8192) return { status: 'invalid_request' }; }
    catch { return { status: 'invalid_request' }; }
    const mutation = ['claim', 'finish'].includes(operation);
    try {
      const response = await fetchImpl(`${origin}/rest/v1/rpc/${names[operation]}`, { method: 'POST', redirect: 'error',
        signal: AbortSignal.any([signal, AbortSignal.timeout(SOURCE_TOOL_TIMEOUT_MS)].filter(Boolean)),
        headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body });
      if (!response.ok) {
        await response.body?.cancel();
        if (response.status === 404) return { status: 'schema_not_ready' };
        if ([401, 403].includes(response.status)) return { status: 'forbidden' };
        return mutation ? uncertain() : { status: 'unavailable' };
      }
      if (!response.body) return mutation ? uncertain() : { status: 'unavailable' };
      const chunks = []; let bytes = 0;
      for await (const chunk of response.body) { bytes += chunk.byteLength; if (bytes > 16384) return mutation ? uncertain() : { status: 'unavailable' }; chunks.push(chunk); }
      const result = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      return plainObject(result) && statuses.has(result.status) ? result : mutation ? uncertain() : { status: 'unavailable' };
    } catch { return mutation ? uncertain() : { status: signal?.aborted ? 'aborted' : 'unavailable' }; }
  }
  return Object.freeze({ configured, ...Object.fromEntries(Object.keys(names).map(name => [name, args => rpc(name, args)])) });
}
