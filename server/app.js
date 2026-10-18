import { Hono } from 'hono';
import {canonicalTimeZone, createTimeContext} from './time-zone.js';
import { readConfig } from './config.js';
import { createProvider, ProviderError } from './providers/index.js';
import { retrieveAssistantContext, assistantAnswerPrompt } from './assistant-context.js';

const unavailableDiscord = { configured: false, async search() { return { status: 'not_configured', sources: [] }; }, async listChannels() { return { status: 'not_configured', channels: [] }; } };
const errorMessages = {
  access_denied: 'Access is not enabled for this request.', invalid_request: 'Send a valid, bounded chat conversation.',
  not_configured: 'The assistant model is not configured yet.', timeout: 'The assistant request timed out. Please try again.',
  aborted: 'The request was cancelled.', provider_unavailable: 'The assistant provider is unavailable. Please try again.',
  invalid_provider_response: 'The assistant returned an invalid response.', incomplete_provider_response: 'The assistant response was interrupted.',
};
function errorRecord(code) { return { type: 'error', code, message: errorMessages[code] || errorMessages.provider_unavailable }; }
const ndjsonHeaders = { 'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' };

export function developmentAuth(c, config) {
  if (config.production) return null;
  // This value comes from the node adapter, never a client-supplied header.
  const address = c.env?.incoming?.socket?.remoteAddress;
  if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address)) return null;
  try {
    const localHosts = ['localhost', '127.0.0.1', '[::1]'];
    const requestUrl = new URL(c.req.url);
    if (!localHosts.includes(requestUrl.hostname)) return null;
    const host = c.req.header('host');
    if (host && !localHosts.includes(new URL(`http://${host}`).hostname)) return null;
    const originHeader = c.req.header('origin');
    // Same-origin GET fetches generally omit Origin. Only the exact read-only
    // routes below receive this exemption; mutation requests still require Origin.
    if (!originHeader && c.req.method === 'GET' && ['/api/status', '/api/admin/discord', '/api/tools', '/api/map/presence'].includes(requestUrl.pathname)) {
      return { id: 'local-development', allowedSourceIds: [...config.allowedSourceIds], isAdmin: config.devAdminEnabled === true,
        ...(config.devLiveDiscordEnabled && /^[0-9]{1,20}$/.test(config.discordGuildId) ? { liveDiscord: { mode: 'local-operator', guildId: config.discordGuildId } } : {}),
        ...(config.devGoogleEnabled ? { googleAccess: true } : {}) };
    }
    const origin = new URL(originHeader);
    if (!['http:', 'https:'].includes(origin.protocol) || !['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname)) return null;
  } catch { return null; }
  return { id: 'local-development', allowedSourceIds: [...config.allowedSourceIds], isAdmin: config.devAdminEnabled === true,
        ...(config.devLiveDiscordEnabled && /^[0-9]{1,20}$/.test(config.discordGuildId) ? { liveDiscord: { mode: 'local-operator', guildId: config.discordGuildId } } : {}),
        ...(config.devGoogleEnabled ? { googleAccess: true } : {}) };
}

async function readJSON(request, timeoutMs, maxBytes = 32768) {
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw new Error('invalid');
  const reader = request.body?.getReader();
  if (!reader) throw new Error('invalid');
  const chunks = []; let length = 0, expired = false;
  const timer = setTimeout(() => { expired = true; void reader.cancel().catch(() => {}); }, timeoutMs);
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (expired) throw new Error('invalid');
      if (done) break;
      length += value.byteLength;
      if (length > maxBytes) { await reader.cancel(); throw new Error('invalid'); }
      chunks.push(value);
    }
  } finally { clearTimeout(timer); reader.releaseLock(); }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}

async function readConversation(request, timeoutMs) {
  const value = await readJSON(request, timeoutMs);
  if (!value || !Array.isArray(value.messages) || !value.messages.length || value.messages.length > 20) throw new Error('invalid');
  let total = 0;
  const messages = value.messages.map(message => {
    if (!message || !['user', 'assistant'].includes(message.role) || typeof message.content !== 'string' || !message.content.trim() || message.content.length > 8000) throw new Error('invalid');
    total += message.content.length;
    return { role: message.role, content: message.content };
  });
  if (total > 16000 || messages.at(-1).role !== 'user') throw new Error('invalid');
  if (value.buildingId !== undefined && (typeof value.buildingId !== 'string' || !/^[a-z0-9-]{1,80}$/.test(value.buildingId))) throw new Error('invalid');
  const timeZone = canonicalTimeZone(value.timeZone);
  if (!timeZone) throw new Error('invalid');
  return { messages, buildingId: value.buildingId, timeZone };
}

export function createApp({ config = readConfig(), provider = createProvider(config), discordStore = unavailableDiscord, discordConfig = {}, liveDiscordTools = null, liveDiscordService = null, googleTools = null, googleClient = null, miroTools = null, mapPresenceService = null, auth = developmentAuth, now = () => new Date() } = {}) {
  const app = new Hono();
  const deny = (c, code, status) => c.body(JSON.stringify(errorRecord(code)) + '\n', status, ndjsonHeaders);
  app.get('/healthz', c => c.json({ ok: true, service: 'tech-nyu-api' }));
  app.get('/api/status', async c => {
    let principal = null;
    try { principal = await auth(c, config); } catch {}
    c.header('cache-control', 'no-store');
    return c.json({ chat: { configured: config.configured, provider: config.provider || null, model: config.model || null },
      discord: { configured: Boolean(discordStore.configured), syncConfigured: Boolean(discordConfig.configured),
        liveConfigured: liveDiscordService?.configured === true, liveAllowed: Boolean(principal?.liveDiscord), retrieval: 'live_only' },
      miro: {configured: miroTools?.configured === true, retrieval: 'live_read_only'},
      google: { ...(googleClient?.status?.() || { configured: false, oauthVerified: false, status: 'not_configured' }), allowed: principal?.googleAccess === true },
      access: { mode: config.production ? 'members_required' : 'local_development', allowed: Boolean(principal), admin: principal?.isAdmin === true } });
  });
  const authorize = async c => { try { return await auth(c, config); } catch { return null; } };
  const apiError = (c, code, status) => c.json({ status: code, error: { message: errorMessages[code] || 'This operation is unavailable.' } }, status);
  const resultStatus = status => ({ forbidden: 403, invalid_request: 400, not_configured: 503, unavailable: 503, aborted: 408, stale: 409, rate_limited: 429 })[status] || 200;
  app.get('/api/map/presence', async c => {
    c.header('cache-control', 'no-store');
    c.header('x-content-type-options', 'nosniff');
    const principal = await authorize(c);
    if (!principal?.id || !Array.isArray(principal.allowedSourceIds)) return apiError(c, 'access_denied', 403);
    if (!mapPresenceService?.read) return c.json({status:'not_configured', buildings:[]}, 503);
    try {
      const result = await mapPresenceService.read({principal, signal:c.req.raw.signal});
      return c.json(result, resultStatus(result.status));
    } catch { return c.json({status:'unavailable', buildings:[]}, 503); }
  });
  app.get('/api/tools', async c => {
    const principal = await authorize(c);
    if (!principal?.id || !Array.isArray(principal.allowedSourceIds)) return apiError(c, 'access_denied', 403);
    c.header('cache-control', 'no-store');
    return c.json({ tools: [...(liveDiscordTools?.tools || []), ...(googleTools?.tools || []), ...(miroTools?.tools || [])], policy: { discord: 'live_only' } });
  });
  app.get('/api/admin/discord', async c => {
    const principal = await authorize(c);
    if (!principal?.id || principal.isAdmin !== true) return apiError(c, 'access_denied', 403);
    c.header('cache-control', 'no-store');
    const result = await discordStore.listChannels({ principal, signal: c.req.raw.signal });
    return c.json({ ...result, sync: { configured: Boolean(discordConfig.configured), guildId: discordConfig.guildId || null } }, resultStatus(result.status));
  });
  app.put('/api/admin/discord/channels', async c => {
    const principal = await authorize(c);
    if (!principal?.id || principal.isAdmin !== true) return apiError(c, 'access_denied', 403);
    let value;
    try { value = await readJSON(c.req.raw, config.timeoutMs, 8192); } catch { return apiError(c, 'invalid_request', 400); }
    if (!value || Object.keys(value).some(key => key !== 'channel') || !value.channel || !discordStore.configureChannel) return apiError(c, 'invalid_request', 400);
    if (discordConfig.guildId && value.channel.guildId !== discordConfig.guildId) return apiError(c, 'invalid_request', 400);
    const result = await discordStore.configureChannel({ principal, channel: value.channel, signal: c.req.raw.signal });
    c.header('cache-control', 'no-store');
    return c.json(result, resultStatus(result.status));
  });
  app.post('/api/tools/:tool', async c => {
    const principal = await authorize(c);
    if (!principal?.id || !Array.isArray(principal.allowedSourceIds)) return apiError(c, 'access_denied', 403);
    let value;
    try { value = await readJSON(c.req.raw, config.timeoutMs, 8192); } catch { return apiError(c, 'invalid_request', 400); }
    const name = c.req.param('tool').replaceAll('-', '_');
    const adapter = liveDiscordTools?.tools?.some(tool => tool.name === name) ? liveDiscordTools : googleTools?.tools?.some(tool => tool.name === name) ? googleTools : miroTools?.tools?.some(tool => tool.name === name) ? miroTools : null;
    if (!adapter) return apiError(c, 'not_configured', 503);
    const timeContext = createTimeContext({now:now()});
    const result = await adapter.execute({ name, arguments: value, principal, signal: c.req.raw.signal, timeContext });
    c.header('cache-control', 'no-store');
    return c.json(result, resultStatus(result.status));
  });
  app.post('/api/chat', async c => {
    let principal;
    try { principal = await auth(c, config); } catch {}
    if (!principal?.id || !Array.isArray(principal.allowedSourceIds)) return deny(c, 'access_denied', 403);
    let conversation;
    try { conversation = await readConversation(c.req.raw, config.timeoutMs); } catch { return deny(c, 'invalid_request', 400); }
    const timeContext = createTimeContext({timeZone:conversation.timeZone,now:now()});
    if (!timeContext) return deny(c, 'invalid_request', 400);
    if (!config.configured) return deny(c, 'not_configured', 503);
    const abort = new AbortController(); let disconnected = false, timedOut = false;
    const disconnect = () => { disconnected = true; abort.abort(); };
    c.req.raw.signal.addEventListener('abort', disconnect, { once: true });
    const stream = new ReadableStream({
      async start(controller) {
        const encode = new TextEncoder();
        const send = record => { if (!disconnected) controller.enqueue(encode.encode(JSON.stringify(record) + '\n')); };
        const timeout = setTimeout(() => { timedOut = true; abort.abort(); }, config.timeoutMs);
        const aborted = new Promise((_, reject) => abort.signal.addEventListener('abort', () => reject(new ProviderError(timedOut ? 'timeout' : 'aborted')), { once: true }));
        // Each async boundary races cancellation, including injected adapters.
        const wait = promise => Promise.race([promise, aborted]);
        try {
          if (c.req.raw.signal.aborted) disconnect();
          const retrieval = await wait(retrieveAssistantContext({ messages: conversation.messages, principal, provider,
            liveTools: liveDiscordTools, googleTools, miroTools, signal: abort.signal, timeContext, planning: config.retrievalToolsEnabled !== false }));
          const sources = retrieval.sources;
          send({ type: 'meta', sources, timeZone:timeContext.timeZone, now:timeContext.now, knowledgeStatus: retrieval.status, retrieval: retrieval.results.map(result => ({
            tool: result.tool, status: result.status, coverage: result.coverage })) });
          const iterator = provider.stream({ messages: conversation.messages, system: assistantAnswerPrompt({ sources, results: retrieval.results, timeContext }), signal: abort.signal, timeContext })[Symbol.asyncIterator]();
          let outputLength = 0;
          try {
            while (true) {
              const { value, done } = await wait(iterator.next());
              if (done) break;
              if (typeof value !== 'string' || (outputLength += value.length) > 100000) throw new ProviderError('invalid_provider_response');
              if (value) send({ type: 'delta', text: value });
            }
          } finally { abort.abort(); void iterator.return?.().catch(() => {}); }
          send({ type: 'done' });
        } catch (error) {
          const code = timedOut ? 'timeout' : (error instanceof ProviderError && errorMessages[error.code] ? error.code : 'provider_unavailable');
          send(errorRecord(code));
        } finally {
          clearTimeout(timeout); abort.abort(); c.req.raw.signal.removeEventListener('abort', disconnect);
          if (!disconnected) controller.close();
        }
      },
      cancel() { disconnect(); },
    });
    return new Response(stream, { headers: ndjsonHeaders });
  });
  app.onError((_, c) => deny(c, 'provider_unavailable', 500));
  return app;
}
