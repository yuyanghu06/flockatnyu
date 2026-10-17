import { createHash, randomUUID } from 'node:crypto';
import { OAuth2Client } from 'google-auth-library';
import { readGoogleConfig } from './config.js';
import { createGoogleOAuth, verifyGoogleToken, waitForGoogleAuth } from './oauth.js';
import { boundedGoogleBody } from './client.js';

const GMAIL = 'https://gmail.googleapis.com/gmail/v1/users/me';
const historyId = value => typeof value === 'string' && /^[1-9][0-9]{0,29}$/.test(value);
const messageId = value => typeof value === 'string' && /^[a-fA-F0-9]{1,64}$/.test(value);
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const safeCodes = new Set(['disabled', 'not_configured', 'unauthorized', 'invalid_push', 'account_mismatch', 'busy', 'not_started', 'resync_required',
  'invalid_response', 'rate_limited', 'permission_denied', 'reauthorization_required', 'response_too_large', 'enqueue_failed', 'lease_lost', 'aborted',
  'subscription_store_unavailable', 'google_unavailable', 'configuration_changed']);
class SubscriptionError extends Error { constructor(code) { super(code); this.code = code; } }
const fail = code => { throw new SubscriptionError(code); };
const stamp = now => new Date(now()).getTime();

const diagnosticReasons = new Set([
  'http_content_type', 'http_body_too_large', 'http_body_missing', 'http_body_aborted', 'http_json_invalid',
  'auth_header', 'auth_signature', 'auth_claims', 'envelope_object', 'message_object', 'message_id_type', 'message_id_format',
  'data_type', 'data_bounds', 'data_encoding', 'subscription_type', 'subscription_scope', 'subscription_mismatch',
  'notification_json', 'notification_object', 'notification_history_type', 'notification_history_format', 'notification_email_type', 'notification_account',
]);
// Only fixed reasons and scalar type labels cross this boundary. Never pass
// input values, provider errors, token claims, headers or message content.
export function createGmailPushDiagnostics(onDiagnostic) {
  return (reason, value) => {
    if (!diagnosticReasons.has(reason) || typeof onDiagnostic !== 'function') return;
    const classification = value === null ? 'null' : Array.isArray(value) ? 'array'
      : ['undefined', 'object', 'string', 'number', 'boolean'].includes(typeof value) ? typeof value : 'other';
    try { onDiagnostic(Object.freeze({ reason, classification }))?.catch?.(() => {}); } catch { /* Diagnostics cannot affect authorization. */ }
  };
}

export function readGmailSubscriptionConfig(env = process.env) {
  const str = key => typeof env[key] === 'string' ? env[key].trim() : '';
  const google = readGoogleConfig(env);
  const projectId = str('GOOGLE_PUBSUB_PROJECT_ID') || 'techflock';
  const topic = str('GOOGLE_PUBSUB_TOPIC');
  const audience = str('GOOGLE_PUBSUB_AUDIENCE');
  const pushServiceAccount = str('GOOGLE_PUBSUB_PUSH_SERVICE_ACCOUNT').toLowerCase();
  const expectedSubscription = str('GOOGLE_PUBSUB_SUBSCRIPTION');
  const sourceId = str('AGENT_GMAIL_SOURCE_ID');
  const allowedSourceIds = (str('ASSISTANT_ALLOWED_SOURCE_IDS') || str('DEV_ALLOWED_SOURCE_IDS')).split(',').map(s => s.trim()).filter(Boolean);
  let validAudience = false;
  try { const u = new URL(audience); validAudience = u.protocol === 'https:' && !u.username && !u.password && !u.hash && !u.search; } catch {}
  const prefix = `projects/${projectId}/`;
  const configured = google.configured && /^[a-z][a-z0-9-]{4,61}[a-z0-9]$/.test(projectId)
    && topic.startsWith(`${prefix}topics/`) && /^[A-Za-z][A-Za-z0-9._~+%-]{2,254}$/.test(topic.slice(`${prefix}topics/`.length))
    && validAudience && /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.iam\.gserviceaccount\.com$/.test(pushServiceAccount)
    && (!expectedSubscription || expectedSubscription.startsWith(`${prefix}subscriptions/`) && /^[A-Za-z][A-Za-z0-9._~+%-]{2,254}$/.test(expectedSubscription.slice(`${prefix}subscriptions/`.length)))
    && uuid(sourceId) && allowedSourceIds.includes(sourceId);
  return Object.freeze({ ...google, enabled: str('GMAIL_EVENTS_ENABLED') === 'true', configured: Boolean(configured), projectId, topic, audience,
    pushServiceAccount, expectedSubscription, sourceId, allowedSourceIds: Object.freeze(allowedSourceIds),
    maxPages: 5, pageSize: 20, maxMessages: 100, maxMessageBytes: 58000, maxHistoryBytes: 262144,
    maxRunMs: 60000, leaseMs: 90000, renewAfterMs: 86400000, reconcileMs: 300000 });
}

export function createGmailSubscription({ config = readGmailSubscriptionConfig(), auth, store, enqueueEvent,
  fetchImpl = globalThis.fetch, verifyPushToken, onDiagnostic, now = () => new Date() } = {}) {
  const diagnose = createGmailPushDiagnostics(onDiagnostic);
  const rejectPush = (reason, value, code = 'invalid_push') => { diagnose(reason, value); fail(code); };
  const oauth = auth || createGoogleOAuth(config);
  if (!auth && config.configured) oauth.setCredentials({ refresh_token: config.refreshToken });
  const verifier = new OAuth2Client({ transporterOptions: { timeout: 10000, retryConfig: { retry: 0 }, maxContentLength: 65536, maxRedirects: 0 } });
  const key = `subscription:gmail:${config.sourceId}`;
  let verifiedAccessToken;
  const ready = () => {
    if (!config.enabled) fail('disabled');
    if (!config.configured || !uuid(config.sourceId) || !config.allowedSourceIds?.includes(config.sourceId)
      || !store?.getState || !store?.casState || typeof enqueueEvent !== 'function') fail('not_configured');
  };
  async function request(path, token, signal, { method = 'GET', body, maxBytes = config.maxHistoryBytes } = {}) {
    if (signal?.aborted) fail('aborted');
    let response;
    try { response = await fetchImpl(`${GMAIL}${path}`, { method, redirect: 'error', signal,
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}) }); }
    catch { fail(signal?.aborted ? 'aborted' : 'google_unavailable'); }
    if (!response.ok) {
      await response.body?.cancel();
      fail(response.status === 404 && path.startsWith('/history?') ? 'resync_required' : response.status === 429 ? 'rate_limited'
        : response.status === 401 ? 'reauthorization_required' : response.status === 403 ? 'permission_denied' : 'google_unavailable');
    }
    try {
      const data = JSON.parse(await boundedGoogleBody(response, { maxBytes, signal }));
      if (!object(data)) fail('invalid_response');
      return data;
    } catch (error) { if (error?.code === 'response_too_large') fail('response_too_large'); if (signal?.aborted) fail('aborted'); fail('invalid_response'); }
  }
  async function access(signal) {
    try {
      const result = await waitForGoogleAuth(() => oauth.getAccessToken(), signal);
      if (!result?.token) fail('reauthorization_required');
      if (verifiedAccessToken !== result.token) {
        await verifyGoogleToken(oauth, result.token, config.expectedAccountEmail, token => request('/profile', token, signal), signal);
        verifiedAccessToken = result.token;
      }
      return result.token;
    } catch (error) { fail(safeCodes.has(error?.code) ? error.code : 'reauthorization_required'); }
  }
  async function guarded(operation) {
    try { ready(); return await operation(); }
    catch (error) { return { status: safeCodes.has(error?.code || error?.message) ? error.code || error.message : 'google_unavailable' }; }
  }
  async function leased(signal, operation) {
    const active = AbortSignal.any([AbortSignal.timeout(config.maxRunMs), ...(signal ? [signal] : [])]);
    let state = await store.getState(key, { signal: active });
    if (state !== null && !object(state)) fail('invalid_response');
    if (state?.lease && state.lease.expiresAt > stamp(now)) fail('busy');
    if (state && (state.account !== config.expectedAccountEmail || state.sourceId !== config.sourceId || state.topic !== config.topic)) fail('configuration_changed');
    const lease = { owner: randomUUID(), expiresAt: stamp(now) + config.leaseMs };
    let held = { ...(state || {}), account: config.expectedAccountEmail, sourceId: config.sourceId, topic: config.topic, lease };
    if (!await store.casState(key, state, held, { signal: active })) fail('busy');
    async function save(patch) {
      if (active.aborted || stamp(now) >= lease.expiresAt) fail('lease_lost');
      const next = { ...held, ...patch, lease };
      if (!await store.casState(key, held, next, { signal: active })) fail('lease_lost');
      held = next;
    }
    try { return await operation({ state: () => held, save, signal: active }); }
    finally {
      const released = { ...held }; delete released.lease;
      // Separate bounded cleanup signal also releases a timed-out job promptly.
      try { await store.casState(key, held, released, { signal: AbortSignal.timeout(5000) }); } catch { /* Lease expiration recovers this. */ }
    }
  }
  async function syncLocked(ctx, token) {
    const initial = ctx.state();
    if (initial.status === 'resync_required') fail('resync_required');
    if (!historyId(initial.cursor)) fail('not_started');
    let messages = 0, queued = 0, duplicates = 0;
    const seen = new Set();
    for (let page = 0; page < config.maxPages; page++) {
      const state = ctx.state();
      const query = new URLSearchParams({ startHistoryId: state.cursor, maxResults: String(config.pageSize), historyTypes: 'messageAdded' });
      if (state.pageToken) query.set('pageToken', state.pageToken);
      let data;
      try { data = await request(`/history?${query}`, token, ctx.signal); }
      catch (error) {
        if (error.code === 'resync_required') await ctx.save({ status: 'resync_required' });
        throw error;
      }
      if (!historyId(data.historyId) || BigInt(data.historyId) < BigInt(state.cursor)
        || data.history !== undefined && !Array.isArray(data.history)
        || data.nextPageToken !== undefined && (typeof data.nextPageToken !== 'string' || !data.nextPageToken || data.nextPageToken.length > 2048)) fail('invalid_response');
      const additions = new Map();
      for (const record of data.history || []) {
        if (!historyId(record.id) || BigInt(record.id) <= BigInt(state.cursor) || BigInt(record.id) > BigInt(data.historyId)
          || record.messagesAdded !== undefined && !Array.isArray(record.messagesAdded)) fail('invalid_response');
        for (const item of record.messagesAdded || []) {
          if (!messageId(item?.message?.id)) fail('invalid_response');
          const previous = additions.get(item.message.id);
          if (!previous || BigInt(record.id) < BigInt(previous)) additions.set(item.message.id, record.id);
        }
      }
      // Persist only an offset and a digest, never message IDs or source bodies.
      // Reordering is harmless; changed page contents replay through queue dedup.
      const entries = [...additions].sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0);
      const pageFingerprint = createHash('sha256').update(JSON.stringify(entries)).digest('hex');
      let pageOffset = state.pageFingerprint === pageFingerprint && Number.isSafeInteger(state.pageOffset)
        && state.pageOffset >= 0 && state.pageOffset <= entries.length ? state.pageOffset : 0;
      try {
        for (; pageOffset < entries.length; pageOffset++) {
          const [id, revision] = entries[pageOffset];
          if (seen.has(id)) continue;
          if (messages >= config.maxMessages) {
            await ctx.save({ pageOffset, pageFingerprint, status: 'pending' });
            return { status: 'pending', queued, duplicates, messages };
          }
          let message, eventType = 'email_received';
          try {
            message = await request(`/messages/${id}?format=full`, token, ctx.signal, { maxBytes: config.maxMessageBytes });
          } catch (error) {
            if (error.code !== 'response_too_large') throw error;
            // Preserve a bounded original provider response instead of blocking
            // all later mailbox changes on a large MIME body. The distinct event
            // type tells the agent it must read the body before body-based actions.
            message = await request(`/messages/${id}?format=metadata`, token, ctx.signal, { maxBytes: config.maxMessageBytes });
            eventType = 'email_received_metadata';
          }
          if (message.id !== id || !object(message.payload) || !historyId(message.historyId)) fail('invalid_response');
          const outcome = await enqueueEvent({ source: 'gmail', sourceId: config.sourceId, eventType, eventId: id,
            revision, payload: message, signal: ctx.signal });
          if (!['queued', 'duplicate'].includes(outcome?.status)) fail('enqueue_failed');
          seen.add(id); messages++;
          if (outcome.status === 'queued') queued++; else duplicates++;
        }
      } catch (error) {
        // Earlier successes can survive a fetch/enqueue failure or a new process.
        // If lease/storage is unavailable, safe replay remains the fallback.
        try { await ctx.save({ pageOffset, pageFingerprint, status: 'pending' }); } catch { /* Keep the original failure. */ }
        throw error;
      }
      if (data.nextPageToken) {
        await ctx.save({ pageToken: data.nextPageToken, pageOffset: 0, pageFingerprint: null, status: 'pending' });
      } else {
        await ctx.save({ cursor: data.historyId, pageToken: null, pageOffset: 0, pageFingerprint: null, lastSyncAt: stamp(now), status: 'ready' });
        return { status: 'ready', queued, duplicates, messages };
      }
    }
    return { status: 'pending', queued, duplicates, messages };
  }
  async function watchLocked(ctx, token) {
    if (ctx.state().status === 'resync_required') fail('resync_required');
    const data = await request('/watch', token, ctx.signal, { method: 'POST', body: { topicName: config.topic } });
    if (!historyId(data.historyId) || typeof data.expiration !== 'string' || !/^[0-9]{1,16}$/.test(data.expiration)
      || !Number.isSafeInteger(Number(data.expiration)) || Number(data.expiration) <= stamp(now)) fail('invalid_response');
    // Renewals never replace the existing history cursor with the watch baseline.
    await ctx.save({ ...(ctx.state().cursor ? {} : { cursor: data.historyId, pageToken: null, pageOffset: 0, pageFingerprint: null, status: 'ready' }),
      expiration: Number(data.expiration), lastWatchAt: stamp(now) });
    return { status: 'watching', expiration: Number(data.expiration) };
  }
  function watch({ signal } = {}) { return guarded(() => leased(signal, async ctx => watchLocked(ctx, await access(ctx.signal)))); }
  function sync({ signal } = {}) { return guarded(() => leased(signal, async ctx => syncLocked(ctx, await access(ctx.signal)))); }
  function renew({ signal } = {}) {
    return guarded(() => leased(signal, async ctx => {
      const token = await access(ctx.signal);
      const state = ctx.state();
      if (!state.cursor) return watchLocked(ctx, token);
      // Catch up from the old cursor before requesting another watch.
      const result = await syncLocked(ctx, token);
      if (!state.lastWatchAt || stamp(now) - state.lastWatchAt >= config.renewAfterMs || state.expiration - stamp(now) < config.renewAfterMs) {
        const watched = await watchLocked(ctx, token);
        return { ...result, watchStatus: watched.status, expiration: watched.expiration };
      }
      return result;
    }));
  }
  async function authenticate(authorization, signal) {
    if (typeof authorization !== 'string' || authorization.length > 8192 || !/^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(authorization)) rejectPush('auth_header', authorization, 'unauthorized');
    let claims;
    try {
      const token = authorization.slice(7);
      claims = verifyPushToken ? await waitForGoogleAuth(() => verifyPushToken(token, config.audience), signal)
        : (await waitForGoogleAuth(() => verifier.verifyIdToken({ idToken: token, audience: config.audience }), signal)).getPayload();
    } catch { rejectPush('auth_signature', undefined, 'unauthorized'); }
    if (!claims || claims.aud !== config.audience || !['accounts.google.com', 'https://accounts.google.com'].includes(claims.iss)
      || claims.email !== config.pushServiceAccount || claims.email_verified !== true
      || !Number.isFinite(claims.exp) || claims.exp * 1000 <= stamp(now)) rejectPush('auth_claims', undefined, 'unauthorized');
  }
  function handlePush({ authorization, body, signal } = {}) {
    return guarded(async () => {
      const active = AbortSignal.any([AbortSignal.timeout(config.maxRunMs), ...(signal ? [signal] : [])]);
      await authenticate(authorization, active);
      if (!object(body)) rejectPush('envelope_object', body);
      if (!object(body.message)) rejectPush('message_object', body.message);
      if (typeof body.message.messageId !== 'string') rejectPush('message_id_type', body.message.messageId);
      if (!/^[A-Za-z0-9_-]{1,200}$/.test(body.message.messageId)) rejectPush('message_id_format', body.message.messageId);
      if (typeof body.message.data !== 'string') rejectPush('data_type', body.message.data);
      const encoded = body.message.data;
      if (!encoded.length || encoded.length > 8192) rejectPush('data_bounds', encoded);
      // Gmail documents base64url, while Pub/Sub also uses standard base64.
      // Accept either canonical alphabet, with valid optional padding; never a mix.
      if (!/^(?:[A-Za-z0-9+/]+={0,2}|[A-Za-z0-9_-]+={0,2})$/.test(encoded)
        || encoded.includes('=') && encoded.length % 4 !== 0) rejectPush('data_encoding', encoded);
      if (typeof body.subscription !== 'string') rejectPush('subscription_type', body.subscription);
      if (!body.subscription.startsWith(`projects/${config.projectId}/subscriptions/`)) rejectPush('subscription_scope', body.subscription);
      if (config.expectedSubscription && body.subscription !== config.expectedSubscription) rejectPush('subscription_mismatch', body.subscription);
      const raw = Buffer.from(encoded, 'base64url');
      if (raw.length > 4096) rejectPush('data_bounds', undefined);
      if (raw.toString('base64').replace(/=+$/, '') !== encoded.replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '')) rejectPush('data_encoding', encoded);
      let notification;
      try { notification = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw)); }
      catch { rejectPush('notification_json', undefined); }
      if (!object(notification)) rejectPush('notification_object', notification);
      // Push history is a wake-up hint, never a checkpoint. Accept only exact
      // positive safe integers from numeric providers; API cursors stay strings.
      const notificationHistoryId = typeof notification.historyId === 'number'
        && Number.isSafeInteger(notification.historyId) && notification.historyId > 0
        ? String(notification.historyId) : notification.historyId;
      if (typeof notificationHistoryId !== 'string') rejectPush('notification_history_type', notification.historyId);
      if (!historyId(notificationHistoryId)) rejectPush('notification_history_format', notification.historyId);
      if (typeof notification.emailAddress !== 'string') rejectPush('notification_email_type', notification.emailAddress);
      if (notification.emailAddress.toLowerCase() !== config.expectedAccountEmail) rejectPush('notification_account', undefined, 'account_mismatch');
      return leased(active, async ctx => {
        const state = ctx.state();
        if (state.status === 'resync_required') fail('resync_required');
        if (!historyId(state.cursor)) fail('not_started');
        if (!state.pageToken && !state.pageFingerprint && BigInt(notificationHistoryId) <= BigInt(state.cursor)) return { status: 'duplicate', queued: 0 };
        // The notification is a wake-up only. Never assign its historyId as cursor.
        return syncLocked(ctx, await access(ctx.signal));
      });
    });
  }
  return Object.freeze({ watch, renew, sync, handlePush });
}
