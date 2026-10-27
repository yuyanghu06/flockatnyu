import { SOURCE_TOOL_TIMEOUT_MS } from '../source-timeout.js';
import { plainObject } from '../automation/validation.js';
import { readGoogleConfig, GOOGLE_GMAIL_SEND_SCOPES } from './config.js';
import { createGoogleOAuth, GoogleError, googleError, verifyGoogleToken, waitForGoogleAuth } from './oauth.js';
import { boundedGoogleBody } from './client.js';
import { normalizeGmailSendInput, validGmailSendAddress } from './gmail-send-contract.js';

const gmail = 'https://gmail.googleapis.com/gmail/v1/users/me';
const requiredScopes = Object.freeze(['https://www.googleapis.com/auth/gmail.readonly', ...GOOGLE_GMAIL_SEND_SCOPES]);
const providerId = value => typeof value === 'string' && /^[a-fA-F0-9]{1,64}$/.test(value);
const noSend = status => ({ status, sent: false, dispatched: false });
const unknown = status => ({ status, sent: 'unknown', dispatched: true, reason: 'write_outcome_unknown' });

function subjectLines(subject) {
  const chunks = []; let chunk = '';
  for (const character of subject) {
    if (Buffer.byteLength(chunk + character, 'utf8') > 42) { chunks.push(chunk); chunk = ''; }
    chunk += character;
  }
  if (chunk) chunks.push(chunk);
  return chunks.length ? chunks.map((value, index) => `${index ? ' ' : 'Subject: '}=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`) : ['Subject:'];
}

// Native MIME stays in request memory only. Its deterministic Message-ID is a
// correlation aid; Gmail does not promise it makes a repeated send idempotent.
function mimeMessage(input, sender, now) {
  const date = new Date(now());
  if (!Number.isFinite(date.getTime())) throw new TypeError('Invalid send clock');
  const body = Buffer.from(input.body.replace(/\r\n|\r|\n/g, '\r\n'), 'utf8').toString('base64');
  const lines = [`From: ${sender}`, ...input.to.map((address, index) => `${index ? ' ' : 'To: '}${address}${index < input.to.length - 1 ? ',' : ''}`),
    ...subjectLines(input.subject), `Date: ${date.toUTCString()}`, `Message-ID: <${input.requestId}@flock.techatnyu.org>`,
    'MIME-Version: 1.0', 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '',
    ...(body.match(/.{1,76}/g) || [''])];
  if (lines.some(line => Buffer.byteLength(line, 'utf8') > 998)) throw new TypeError('Invalid MIME line');
  return Buffer.from(lines.join('\r\n') + '\r\n', 'utf8').toString('base64url');
}

export function createGmailSendClient({ env = process.env, config = readGoogleConfig(env), fetchImpl = globalThis.fetch,
  oauthClient, now = () => new Date() } = {}) {
  const enabled = env.GMAIL_SEND_ENABLED === 'true';
  const configured = Boolean(enabled && config.configured && validGmailSendAddress(config.expectedAccountEmail) && typeof fetchImpl === 'function');
  const oauth = oauthClient || createGoogleOAuth(config);
  if (configured) oauth.setCredentials({ refresh_token: config.refreshToken });

  function errorStatus(error, signal, timeout) {
    if (signal?.aborted) return 'aborted';
    if (timeout.aborted) return 'timeout';
    const code = googleError(error, signal).code;
    return ['reauthorization_required', 'account_mismatch', 'permission_denied', 'rate_limited', 'invalid_response', 'response_too_large', 'aborted'].includes(code) ? code : 'unavailable';
  }
  async function authorize(active) {
    const result = await waitForGoogleAuth(() => oauth.getAccessToken(), active, 'oauth');
    const token = result?.token;
    if (typeof token !== 'string' || !token || token.length > 16384 || /[\r\n]/.test(token)) throw new GoogleError('reauthorization_required');
    await verifyGoogleToken(oauth, token, config.expectedAccountEmail, async accessToken => {
      const response = await fetchImpl(`${gmail}/profile`, { method: 'GET', redirect: 'error', signal: active,
        headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' } });
      if (!response.ok) {
        await response.body?.cancel().catch(() => {});
        throw new GoogleError(response.status === 401 ? 'reauthorization_required' : response.status === 403 ? 'permission_denied'
          : response.status === 429 ? 'rate_limited' : 'google_unavailable');
      }
      try { return JSON.parse(await boundedGoogleBody(response, { maxBytes: 10000, signal: active })); }
      catch (error) { throw error instanceof GoogleError ? error : new GoogleError('invalid_response'); }
    }, active, requiredScopes, true);
    return token;
  }
  async function readiness({ signal } = {}) {
    const base = { enabled, configured, canSend: false, scopeVerified: false, accountVerified: false, sent: false, dispatched: false };
    if (!enabled) return { ...base, status: 'disabled' };
    if (!configured) return { ...base, status: 'not_configured' };
    const timeout = AbortSignal.timeout(SOURCE_TOOL_TIMEOUT_MS), active = AbortSignal.any([signal, timeout].filter(Boolean));
    try {
      await authorize(active);
      if (active.aborted) return { ...base, status: signal?.aborted ? 'aborted' : 'timeout' };
      return { ...base, status: 'ready', canSend: true, scopeVerified: true, accountVerified: true };
    } catch (error) { return { ...base, status: errorStatus(error, signal, timeout) }; }
  }
  async function send(value = {}) {
    let input, signal;
    try {
      if (!plainObject(value)) return noSend('invalid_request');
      const { signal: suppliedSignal, ...payload } = value;
      if (suppliedSignal !== undefined && !(suppliedSignal instanceof AbortSignal)) return noSend('invalid_request');
      signal = suppliedSignal;
      input = normalizeGmailSendInput(payload);
    } catch { return noSend('invalid_request'); }
    if (!enabled) return noSend('disabled');
    if (!configured) return noSend('not_configured');
    const timeout = AbortSignal.timeout(SOURCE_TOOL_TIMEOUT_MS), active = AbortSignal.any([signal, timeout].filter(Boolean));
    let dispatched = false;
    try {
      const token = await authorize(active), raw = mimeMessage(input, config.expectedAccountEmail, now);
      if (active.aborted) return noSend(signal?.aborted ? 'aborted' : 'timeout');
      dispatched = true;
      const response = await fetchImpl(`${gmail}/messages/send`, { method: 'POST', redirect: 'error', signal: active,
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify({ raw }) });
      if ([400, 401, 403, 429].includes(response.status)) {
        await response.body?.cancel().catch(() => {});
        return { status: ({ 400: 'invalid_request', 401: 'reauthorization_required', 403: 'permission_denied', 429: 'rate_limited' })[response.status], sent: false, dispatched: true };
      }
      if (!response.ok) { await response.body?.cancel().catch(() => {}); return unknown('unavailable'); }
      let result;
      try { result = JSON.parse(await boundedGoogleBody(response, { maxBytes: 8192, signal: active })); }
      catch (error) { throw error instanceof GoogleError ? error : new GoogleError('invalid_response'); }
      if (!result || !providerId(result.id) || result.threadId !== undefined && !providerId(result.threadId)) return unknown('invalid_response');
      return { status: 'ready', sent: true, dispatched: true, accepted: true, messageId: result.id,
        ...(result.threadId ? { threadId: result.threadId } : {}), recipientCount: input.to.length };
    } catch (error) {
      const status = errorStatus(error, signal, timeout);
      return dispatched ? unknown(status) : noSend(status);
    }
  }
  return Object.freeze({ configured, enabled, readiness, status: readiness, send });
}
