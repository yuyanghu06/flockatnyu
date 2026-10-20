import {SOURCE_TOOL_TIMEOUT_MS} from '../source-timeout.js';
import { boundedGoogleBody } from './client.js';

// Service-only metadata. Raw mail is written only by the shared input updater.
export function createGmailSubscriptionStore({ url, serviceRoleKey, fetchImpl = globalThis.fetch } = {}) {
  let origin;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) throw new Error();
    origin = parsed.origin;
  } catch { throw new Error('invalid_subscription_store_config'); }
  if (!serviceRoleKey || typeof fetchImpl !== 'function') throw new Error('invalid_subscription_store_config');
  async function rpc(name, args, signal) {
    const active = AbortSignal.any([AbortSignal.timeout(SOURCE_TOOL_TIMEOUT_MS), ...(signal ? [signal] : [])]);
    try {
      const response = await fetchImpl(`${origin}/rest/v1/rpc/${name}`, { method: 'POST', redirect: 'error', signal: active,
        headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify(args) });
      if (!response.ok) { await response.body?.cancel(); throw new Error(); }
      return JSON.parse(await boundedGoogleBody(response, { maxBytes: 16384, signal: active }));
    } catch { throw new Error('subscription_store_unavailable'); }
  }
  function checkKey(key) {
    if (typeof key !== 'string' || !/^subscription:[a-zA-Z0-9:@._-]{1,240}$/.test(key)) throw new Error('invalid_subscription_state_key');
  }
  return Object.freeze({
    async getState(key, { signal } = {}) { checkKey(key); return rpc('agent_subscription_get_state', { p_key: key }, signal); },
    async casState(key, expected, next, { signal } = {}) {
      checkKey(key);
      if (Buffer.byteLength(JSON.stringify([expected, next])) > 12000) throw new Error('subscription_state_too_large');
      return await rpc('agent_subscription_cas_state', { p_key: key, p_expected: expected, p_next: next }, signal) === true;
    },
  });
}
