import { SOURCE_TOOL_TIMEOUT_MS } from '../shared/source-timeout.js';

// Fixed service-only RPCs from migration 202611190057. Only Calendar event
// IDs, titles, dates and submitted marketing details pass through here.
const names = Object.freeze({
  register: 'marketing_event_register',
  lookup: 'marketing_event_lookup',
});
const statuses = new Set(['ready', 'not_found', 'conflict', 'invalid_request']);
const plainObject = (value) =>
  value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype;

function supabaseOrigin(value) {
  try {
    const url = new URL(value);
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (
      (url.protocol === 'https:' || (url.protocol === 'http:' && local)) &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      ['', '/'].includes(url.pathname)
    )
      return url.origin;
  } catch {}
  return undefined;
}

export function createMarketingStore({ env = process.env, fetchImpl = globalThis.fetch } = {}) {
  const origin = supabaseOrigin(env.SUPABASE_URL);
  const key =
    typeof env.SUPABASE_SERVICE_ROLE_KEY === 'string' ? env.SUPABASE_SERVICE_ROLE_KEY.trim() : '';
  const configured = Boolean(
    origin && key && !/[\r\n]/.test(key) && typeof fetchImpl === 'function',
  );

  async function rpc(operation, { signal, ...payload } = {}) {
    if (!configured) return { status: 'not_configured' };
    if (!Object.hasOwn(names, operation)) return { status: 'invalid_request' };
    if (signal?.aborted) return { status: 'aborted' };
    let body;
    try {
      body = JSON.stringify({ p_payload: payload });
      if (Buffer.byteLength(body) > 65536) return { status: 'invalid_request' };
    } catch {
      return { status: 'invalid_request' };
    }
    try {
      const response = await fetchImpl(`${origin}/rest/v1/rpc/${names[operation]}`, {
        method: 'POST',
        redirect: 'error',
        signal: AbortSignal.any(
          [signal, AbortSignal.timeout(SOURCE_TOOL_TIMEOUT_MS)].filter(Boolean),
        ),
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        body,
      });
      if (!response.ok) {
        await response.body?.cancel();
        if (response.status === 404) return { status: 'schema_not_ready' };
        if ([401, 403].includes(response.status)) return { status: 'forbidden' };
        return { status: 'unavailable' };
      }
      const text = await response.text();
      if (Buffer.byteLength(text) > 65536) return { status: 'unavailable' };
      const result = JSON.parse(text);
      return plainObject(result) && statuses.has(result.status)
        ? result
        : { status: 'unavailable' };
    } catch {
      return { status: signal?.aborted ? 'aborted' : 'unavailable' };
    }
  }

  return Object.freeze({
    configured,
    register: ({ events, signal } = {}) => rpc('register', { events, signal }),
    lookup: ({ token, signal } = {}) => rpc('lookup', { token, signal }),
  });
}
