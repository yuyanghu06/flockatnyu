import { AttachmentError, attachmentErrors, attachmentBudget, normalizeAttachments, ATTACHMENT_ONLY_CONTENT, MAX_CHAT_BODY_BYTES } from './chat-attachments.js';
import { Hono } from 'hono';
import {canonicalTimeZone, createTimeContext} from './time-zone.js';
import { readConfig } from './config.js';
import { createProvider } from './providers/index.js';
import { createAuditLogger } from './model-audit.js';
import { createChatRunner } from './chat-runner.js';
import {avatarProxyPath} from './map/avatars.js';
import {withDiscordSourceScope} from './discord/source-scope.js';
import {validateManualRunInput} from './automation/manual-runs.js';
import {createManualPlannerAuth} from './automation/manual-auth.js';
import {validUuid} from './automation/validation.js';

const unavailableDiscord = { configured: false, async search() { return { status: 'not_configured', sources: [] }; }, async listChannels() { return { status: 'not_configured', channels: [] }; } };
const errorMessages = {
  ...attachmentErrors,
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
    if(/^\/api\/map\/people\/[^/]+\/avatar$/.test(requestUrl.pathname)&&c.req.header('sec-fetch-site')==='cross-site')return null;
    if (!localHosts.includes(requestUrl.hostname)) return null;
    const host = c.req.header('host');
    if (host && !localHosts.includes(new URL(`http://${host}`).hostname)) return null;
    const originHeader = c.req.header('origin');
    // Same-origin GET fetches generally omit Origin. Only the exact read-only
    // routes below receive this exemption; mutation requests still require Origin.
    if (!originHeader && c.req.method === 'GET' && (['/api/status', '/api/admin/discord', '/api/tools', '/api/map/presence'].includes(requestUrl.pathname) || (!requestUrl.search && (/^\/api\/map\/people\/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\/avatar$/.test(requestUrl.pathname) || /^\/api\/planner\/runs\/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(requestUrl.pathname))))) {
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
      if (length > maxBytes) { void reader.cancel().catch(() => {}); throw new Error('invalid'); }
      chunks.push(value);
    }
  } finally { clearTimeout(timer); reader.releaseLock(); }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}

async function readConversation(request, timeoutMs) {
  const value = await readJSON(request, timeoutMs, MAX_CHAT_BODY_BYTES);
  if (!value || !Array.isArray(value.messages) || !value.messages.length || value.messages.length > 20) throw new Error('invalid');
  let total = 0;
  const budget = attachmentBudget();
  const messages = value.messages.map(message => {
    if (!message || !['user', 'assistant'].includes(message.role) || typeof message.content !== 'string' || message.content.length > 8000) throw new Error('invalid');
    if (message.attachments !== undefined && message.role !== 'user') throw new AttachmentError();
    const attachments = normalizeAttachments(message.attachments, budget);
    if (!message.content.trim() && !attachments.length) throw new Error('invalid');
    const content = message.content.trim() ? message.content : ATTACHMENT_ONLY_CONTENT;
    total += content.length;
    return { role: message.role, content, ...(attachments.length ? { attachments } : {}) };
  });
  const textBytes = new TextEncoder().encode(JSON.stringify({ messages: messages.map(({ role, content }) => ({ role, content })) })).length;
  if (total > 16000 || textBytes > 32500 || messages.at(-1).role !== 'user') throw new Error('invalid');
  if (value.buildingId !== undefined && (typeof value.buildingId !== 'string' || !/^[a-z0-9-]{1,80}$/.test(value.buildingId))) throw new Error('invalid');
  const timeZone = canonicalTimeZone(value.timeZone);
  if (!timeZone) throw new Error('invalid');
  return { messages, buildingId: value.buildingId, timeZone };
}

export function createApp({ config = readConfig(), audit = createAuditLogger(), provider = createProvider(config,{audit}), discordStore = unavailableDiscord, discordConfig = {}, liveDiscordTools = null, liveDiscordService = null, googleTools = null, googleClient = null, miroTools = null, attioTools = null, bugReportTools = null, memoryTools = null, mapTools = null, mapPresenceService = null, mapAvatarService = null, plannerRuns = null, plannerAuth = createManualPlannerAuth(), auth = developmentAuth, now = () => new Date() } = {}) {
  const app = new Hono();
  const chatRunner = createChatRunner({config,provider,audit,liveDiscordTools,googleTools,miroTools,bugReportTools,memoryTools,mapTools,attioTools,now});
  const deny = (c, code, status) => c.body(JSON.stringify(errorRecord(code)) + '\n', status, ndjsonHeaders);
  const authorize = async c => {
    try {
      return await withDiscordSourceScope({principal:await auth(c, config),store:discordStore,
        guildId:config.discordGuildId,signal:c.req.raw.signal});
    } catch { return null; }
  };
  app.get('/healthz', c => c.json({ ok: true, service: 'tech-nyu-api' }));
  app.get('/api/status', async c => {
    const principal = await authorize(c);
    c.header('cache-control', 'no-store');
    return c.json({ chat: { configured: config.configured, provider: config.provider || null, model: config.model || null },
      discord: { configured: Boolean(discordStore.configured), syncConfigured: Boolean(discordConfig.configured),
        liveConfigured: liveDiscordService?.configured === true, liveAllowed: Boolean(principal?.liveDiscord), retrieval: 'live_only' },
      miro: {configured: miroTools?.configured === true, retrieval: 'live_read_only'},
      attio: {configured:attioTools?.configured === true},
      google: { ...(googleClient?.status?.() || { configured: false, oauthVerified: false, status: 'not_configured' }), allowed: principal?.googleAccess === true },
      access: { mode: config.production ? 'members_required' : 'local_development', allowed: Boolean(principal), admin: principal?.isAdmin === true } });
  });
  const apiError = (c, code, status) => c.json({ status: code, error: { message: errorMessages[code] || 'This operation is unavailable.' } }, status);
  const resultStatus = status => ({ forbidden: 403, forbidden_source:403, invalid_request: 400, invalid:400, conflict:409, not_configured: 503, unavailable: 503, aborted: 408, stale: 409, rate_limited: 429, timeout:504, not_found:404, reauthorization_required:401, permission_denied:403, invalid_response:502, response_too_large:502, read_required:409 })[status] || 200;
  app.post('/api/planner/runs', async c => {
    c.header('cache-control', 'no-store');
    if (!plannerAuth.authorizeRequest(c.req.raw)) return apiError(c, 'access_denied', 403);
    if (new URL(c.req.url).search) return apiError(c, 'invalid_request', 400);
    let input;
    try { input = validateManualRunInput(await readJSON(c.req.raw, Math.min(config.timeoutMs || 10000, 10000), 4096)); }
    catch { return apiError(c, 'invalid_request', 400); }
    if (!input) return apiError(c, 'invalid_request', 400);
    if (!plannerRuns?.start) return apiError(c, 'not_configured', 503);
    try {
      const result = await plannerRuns.start({...input, signal:c.req.raw.signal});
      if (result.status === 'queued' && validUuid(result.runId)) {
        const statusUrl = `/api/planner/runs/${result.runId}`;
        c.header('location', statusUrl);
        return c.json({status:'queued', runId:result.runId, statusUrl}, 202);
      }
      return c.json({status: ['capacity','rate_limited','invalid_request','not_configured','aborted'].includes(result?.status) ? result.status : 'unavailable'},
        ['capacity','rate_limited'].includes(result?.status) ? 429 : result?.status === 'invalid_request' ? 400 : result?.status === 'aborted' ? 408 : 503);
    } catch { return c.json({status:'unavailable'}, 503); }
  });
  app.get('/api/planner/runs/:runId', async c => {
    c.header('cache-control', 'no-store');
    if (!plannerAuth.authorizeRequest(c.req.raw)) return apiError(c, 'access_denied', 403);
    const runId = c.req.param('runId');
    if (!validUuid(runId) || new URL(c.req.url).search) return apiError(c, 'invalid_request', 400);
    if (!plannerRuns?.read) return apiError(c, 'not_configured', 503);
    try {
      const result = await plannerRuns.read({runId, signal:c.req.raw.signal});
      return c.json(result, result?.status === 'not_found' ? 404 : result?.status === 'ready' ? 200 : 503);
    } catch { return c.json({status:'unavailable'}, 503); }
  });
  app.get('/api/map/people/:personId/avatar', async c => {
    c.header('cache-control', 'private, no-store');
    c.header('x-content-type-options', 'nosniff');
    const principal=await authorize(c);
    if(!principal?.id||!Array.isArray(principal.allowedSourceIds))return apiError(c,'access_denied',403);
    const url=new URL(c.req.url),personId=c.req.param('personId');
    if(url.search||url.pathname!==avatarProxyPath(personId)||mapAvatarService?.configured!==true||!mapAvatarService?.read)return c.json({status:'not_found'},404);
    try {
      const result=await mapAvatarService.read({personId,principal,signal:c.req.raw.signal});
      if(result?.status==='ok'&&result.contentType==='image/png'&&result.bytes instanceof Uint8Array) {
        c.header('content-type','image/png');c.header('content-disposition','inline');
        return c.body(result.bytes,200);
      }
      return c.json({status:result?.status==='unavailable'?'unavailable':'not_found'},result?.status==='unavailable'?503:404);
    } catch {return c.json({status:'unavailable'},503);}
  });
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
    return c.json({ tools: [...(liveDiscordTools?.tools || []), ...(googleTools?.tools || []), ...(miroTools?.tools || []), ...(attioTools?.tools || []), ...(bugReportTools?.tools || []), ...(memoryTools?.tools || []), ...(mapTools?.tools || [])], policy: { discord: 'live_only' } });
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
    const adapter = liveDiscordTools?.tools?.some(tool => tool.name === name) ? liveDiscordTools : googleTools?.tools?.some(tool => tool.name === name) ? googleTools : miroTools?.tools?.some(tool => tool.name === name) ? miroTools : attioTools?.tools?.some(tool => tool.name === name) ? attioTools : mapTools?.tools?.some(tool => tool.name === name) ? mapTools : null;
    if (!adapter) return apiError(c, 'not_configured', 503);
    const timeContext = createTimeContext({now:now()});
    const result = await adapter.execute({ name, arguments: value, principal, signal: c.req.raw.signal, timeContext,
      ...(adapter === liveDiscordTools ? {userMessage:''} : {}) });
    c.header('cache-control', 'no-store');
    return c.json(result, resultStatus(result.status));
  });
  app.post('/api/chat', async c => {
    const principal = await authorize(c);
    if (!principal?.id || !Array.isArray(principal.allowedSourceIds)) return deny(c, 'access_denied', 403);
    let conversation;
    try { conversation = await readConversation(c.req.raw, config.timeoutMs); } catch (error) { return deny(c, error instanceof AttachmentError ? error.code : 'invalid_request', 400); }
    if (config.provider === 'anthropic' && conversation.messages.some(message => message.attachments?.length)) return deny(c, 'attachments_provider_unsupported', 400);
    if (!config.configured) return deny(c, 'not_configured', 503);
    const abort = new AbortController(); let disconnected = false;
    const disconnect = () => { disconnected = true; abort.abort(); };
    c.req.raw.signal.addEventListener('abort', disconnect, { once: true });
    const stream = new ReadableStream({
      async start(controller) {
        const encode = new TextEncoder();
        try {
          if (c.req.raw.signal.aborted) disconnect();
          await chatRunner.run({ conversation, principal, signal:abort.signal,
            onRecord:record => { if (!disconnected) controller.enqueue(encode.encode(JSON.stringify(record) + '\n')); } });
        } finally {
          c.req.raw.signal.removeEventListener('abort', disconnect);
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
