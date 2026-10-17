import {createDiscordClient, DiscordError} from './client.js';

const id = value => typeof value === 'string' && /^[0-9]{1,20}$/.test(value);
const fail = code => { throw new DiscordError(code); };
const wait = (ms, signal) => new Promise((resolve, reject) => {
  if (signal?.aborted) return reject(new DiscordError('aborted'));
  const done = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); resolve(); };
  const abort = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); reject(new DiscordError('aborted')); };
  const timer = setTimeout(done, ms);
  signal?.addEventListener('abort', abort, {once:true});
});

/** First snowflake at an ISO instant; caller post-filters precise half-open dates. */
export function discordSnowflakeAt(value) {
  const time = Date.parse(value);
  if (!Number.isFinite(time) || time < 1420070400000) fail('invalid_request');
  return ((BigInt(time) - 1420070400000n) << 22n).toString();
}

export function createLiveDiscordClient({config, fetchImpl = globalThis.fetch} = {}) {
  const configured = Boolean(config?.configured && id(config.guildId) && config.botToken && typeof fetchImpl === 'function');
  const base = createDiscordClient({config:{...config,configured}, fetchImpl});
  async function request(path, signal) {
    if (!configured) fail('not_configured');
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const combined = signal ? AbortSignal.any([signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000);
        const response = await fetchImpl(`https://discord.com/api/v10${path}`, {method:'GET', headers:{Authorization:`Bot ${config.botToken}`}, signal:combined, redirect:'error'});
        // Access status is authoritative even when a proxy returns non-JSON.
        // Never turn an access denial into a retryable fallback condition.
        if (!response.ok && response.status !== 429) {
          await response.body?.cancel();
          fail(response.status === 401 ? 'invalid_token' : response.status === 403 ? 'permission_denied' : response.status === 404 ? 'not_found' : 'discord_unavailable');
        }
        const raw = await response.text();
        if (raw.length > 3000000) fail('response_too_large');
        let data; try { data = JSON.parse(raw); } catch { fail('invalid_response'); }
        if (response.status === 429 || response.status === 202) {
          const delay = Number(data?.retry_after);
          if (!Number.isFinite(delay) || delay < 0 || delay > 30 || attempt === 3) fail(response.status === 202 ? 'indexing' : 'rate_limited');
          await wait(Math.max(10, delay * 1000), signal); continue;
        }
        if (!response.ok) fail(response.status === 401 ? 'invalid_token' : response.status === 403 ? 'permission_denied' : response.status === 404 ? 'not_found' : 'discord_unavailable');
        return data;
      } catch (error) {
        if (error instanceof DiscordError) throw error;
        fail(signal?.aborted ? 'aborted' : 'discord_unavailable');
      }
    }
    fail('discord_unavailable');
  }
  async function getMessages({channelId, before, around, limit = 100, signal} = {}) {
    if (!id(channelId) || before != null && !id(before) || around != null && !id(around) || before && around || !Number.isInteger(limit) || limit < 1 || limit > 100) fail('invalid_request');
    const params = new URLSearchParams({limit:String(limit)});
    if (before) params.set('before', before);
    if (around) params.set('around', around);
    const result = await request(`/channels/${channelId}/messages?${params}`, signal);
    if (!Array.isArray(result) || result.length > limit) fail('invalid_response');
    return result;
  }
  async function getMessage({channelId, messageId, signal} = {}) {
    if (!id(channelId) || !id(messageId)) fail('invalid_request');
    return request(`/channels/${channelId}/messages/${messageId}`, signal);
  }
  async function searchMessages({query = '', channelIds, authorId, from, to, mode = 'relevance', signal} = {}) {
    if (!Array.isArray(channelIds) || !channelIds.length || channelIds.length > 30 || channelIds.some(value => !id(value)) || authorId != null && !id(authorId) || typeof query !== 'string' || query.length > 500 || !['latest','relevance'].includes(mode)) fail('invalid_request');
    const params = new URLSearchParams({limit:'25',sort_by:mode === 'latest' ? 'timestamp' : 'relevance',sort_order:'desc'});
    for (const channelId of channelIds) params.append('channel_id', channelId);
    if (query) params.set('content', query);
    if (authorId) params.append('author_id', authorId);
    if (from) params.set('min_id', (BigInt(discordSnowflakeAt(from)) - 1n).toString());
    if (to) params.set('max_id', discordSnowflakeAt(to));
    const result = await request(`/guilds/${config.guildId}/messages/search?${params}`, signal);
    if (!Array.isArray(result?.messages) || result.messages.length > 25 || !Number.isSafeInteger(result.total_results) || result.total_results < 0) fail('invalid_response');
    // Search may group hits with surrounding context. Never return nested content.
    const messages = [];
    for (const group of result.messages) {
      const items = Array.isArray(group) ? group : [group];
      if (items.length > 25) fail('invalid_response');
      for (const message of items) if (message?.hit === true || !Array.isArray(group)) messages.push(message);
    }
    if (messages.length > 25) fail('invalid_response');
    return {messages, totalResults:result.total_results};
  }
  return Object.freeze({...base, configured, getMessages, getMessage, searchMessages});
}
