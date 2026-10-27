import test from 'node:test';
import assert from 'node:assert/strict';
import { createGmailSendClient } from '../server/google/gmail-send.js';
import { validateGmailSendInput, validateMailMessage, validGmailSendAddress, normalizeGmailSendInput } from '../server/google/gmail-send-contract.js';
import { GOOGLE_SCOPES, GOOGLE_GMAIL_SEND_SCOPES } from '../server/google/config.js';

const sender = 'hello@example.test', access = 'SYNTHETIC_PRIVATE_ACCESS_TOKEN';
const requestId = '71000000-0000-4000-8000-000000000001';
const input = { requestId, to: ['recipient@example.test'], subject: 'Synthetic subject', body: 'Synthetic body' };
const env = { GMAIL_SEND_ENABLED: 'true', GOOGLE_CLIENT_ID: 'synthetic-client', GOOGLE_CLIENT_SECRET: 'SYNTHETIC_PRIVATE_CLIENT_SECRET', GOOGLE_REFRESH_TOKEN: 'SYNTHETIC_PRIVATE_REFRESH_TOKEN', GOOGLE_EXPECTED_ACCOUNT_EMAIL: sender };
const scopes = ['https://www.googleapis.com/auth/gmail.readonly', ...GOOGLE_GMAIL_SEND_SCOPES];
const json = value => Response.json(value);

function fixture({ scopeList = scopes, email = sender, token = access, oauthError, tokenInfoError, profile, handler, environment = {} } = {}) {
  const calls = [], oauthCalls = [];
  const oauthClient = { setCredentials(value) { assert.equal(value.refresh_token, env.GOOGLE_REFRESH_TOKEN); }, async getAccessToken() { oauthCalls.push('token'); if (oauthError) throw oauthError; return { token }; }, async getTokenInfo(value) { oauthCalls.push('scope'); assert.equal(value, access); if (tokenInfoError) throw tokenInfoError; return { scopes: scopeList }; } };
  const client = createGmailSendClient({ env: { ...env, ...environment }, oauthClient, now: () => new Date('2026-10-27T16:00:00Z'), fetchImpl: async (url, options) => {
    assert.equal(options.redirect, 'error'); assert.equal(new Headers(options.headers).get('authorization'), 'Bearer ' + access);
    assert(String(url).startsWith('https://gmail.googleapis.com/gmail/v1/users/me/'), 'Only synthetic injected Gmail transport is allowed');
    calls.push({ url: String(url), method: options.method, body: options.body, signal: options.signal });
    if (String(url).endsWith('/profile')) { assert.equal(options.method, 'GET'); return profile ? profile() : json({ emailAddress: email }); }
    assert.equal(String(url), 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send'); assert.equal(options.method, 'POST');
    return handler ? handler(options) : json({ id: 'abc123', threadId: 'def456', provider_private: 'DO NOT EXPOSE' });
  } });
  return { client, calls, oauthCalls, posts: () => calls.filter(call => call.method === 'POST') };
}
function decoded(post) {
  const body = JSON.parse(post.body); assert.deepEqual(Object.keys(body), ['raw']); assert(/^[A-Za-z0-9_-]+$/.test(body.raw));
  const mime = Buffer.from(body.raw, 'base64url').toString('utf8'); assert(!/(?<!\r)\n|\r(?!\n)/.test(mime), 'MIME uses CRLF only');
  const split = mime.indexOf('\r\n\r\n'); assert(split > 0); const headers = mime.slice(0, split), encodedBody = mime.slice(split + 4);
  const unfolded = headers.replace(/\r\n[ \t]+/g, ' '), subject = unfolded.match(/^Subject: ?(.*)$/m)?.[1] ?? '';
  return { mime, headers: unfolded, subject: [...subject.matchAll(/=\?UTF-8\?B\?([^?]+)\?=/g)].map(match => Buffer.from(match[1], 'base64').toString('utf8')).join(''), body: Buffer.from(encodedBody.replace(/\r\n/g, ''), 'base64').toString('utf8'), encodedBody };
}

test('Gmail send input accepts bounded literal mailboxes and Unicode plain text while rejecting header/payload injection before OAuth', async () => {
  for (const address of ['a+b@example.test', 'UPPER@EXAMPLE.TEST', "o'brien@example.test"]) assert(validGmailSendAddress(address));
  for (const address of ['Name <a@example.test>', 'a@example.test,b@example.test', 'a@example.test\r\nBcc:evil@example.test', '"a b"@example.test', 'é@example.test', 'a@例.test', ' a@example.test', '.a@example.test', 'a..b@example.test', 'a@-bad.test', 'a@localhost']) assert(!validGmailSendAddress(address), address);
  const valid = { ...input, subject: '你好 👋', body: 'Unicode body\nBcc: this remains body text\rLast line' }; assert(validateGmailSendInput(valid)); assert(validateMailMessage({ to: valid.to, subject: valid.subject, body: valid.body }));
  const copied = normalizeGmailSendInput(valid); valid.to.push('second@example.test'); assert.equal(copied.to.length, 1);
  const invalid = [
    { ...input, requestId: 'not-a-uuid' }, { ...input, to: [] }, { ...input, to: Array(11).fill('a@example.test') }, { ...input, to: ['A <a@example.test>'] },
    { ...input, subject: 'Injected\r\nBcc: evil@example.test' }, { ...input, subject: 'line\u2028break' }, { ...input, subject: 'x'.repeat(201) }, { ...input, subject: '\ud800' },
    { ...input, body: 'x'.repeat(20001) }, { ...input, body: 'nul\0body' }, { ...input, body: '\ud800' },
    ...['cc', 'bcc', 'html', 'attachments', 'threadId', 'from'].map(key => ({ ...input, [key]: 'forbidden extra field' })),
  ];
  for (const value of invalid) assert(!validateGmailSendInput(value));
  const f = fixture(); for (const value of [...invalid, null, [], { ...input, signal: {} }]) assert.equal((await f.client.send(value)).status, 'invalid_request'); assert.equal(f.oauthCalls.length, 0); assert.equal(f.calls.length, 0);
  assert(!GOOGLE_SCOPES.includes(GOOGLE_GMAIL_SEND_SCOPES[0]), 'Existing read scopes do not silently gain send permission');
});

test('actual MIME send preserves long Unicode subjects/body as plain text, folds lines and makes exactly one send POST', async () => {
  const f = fixture(), subject = '你好 👋 Meeting – '.repeat(10).slice(0, 190), body = 'Hello 世界 👋\nBcc: literal body only\r\n<b>plain text</b>\rLast line\n' + 'x'.repeat(1000);
  const result = await f.client.send({ ...input, to: ['one@example.test', 'two@example.test'], subject, body });
  assert.deepEqual(result, { status: 'ready', sent: true, dispatched: true, accepted: true, messageId: 'abc123', threadId: 'def456', recipientCount: 2 }); assert.equal(f.posts().length, 1); assert.deepEqual(f.calls.map(call => call.method), ['GET', 'POST']);
  const m = decoded(f.posts()[0]); assert.equal(m.subject, subject); assert.equal(m.body, body.replace(/\r\n|\r|\n/g, '\r\n')); assert(m.headers.includes('From: ' + sender)); assert(m.headers.includes('To: one@example.test, two@example.test')); assert(m.headers.includes('Content-Type: text/plain; charset=UTF-8')); assert(m.headers.includes(`Message-ID: <${requestId}@flock.techatnyu.org>`)); assert(!/^Cc:|^Bcc:|text\/html|multipart\//mi.test(m.headers));
  assert(m.mime.split('\r\n').every(line => Buffer.byteLength(line) <= 998)); assert(m.encodedBody.split('\r\n').every(line => line.length <= 76)); assert(!JSON.stringify(result).includes(access)); assert(!JSON.stringify(result).includes(body)); assert(!JSON.stringify(result).includes('DO NOT EXPOSE'));
});

test('enablement, current OAuth scope/account and abort checks prevent dispatch without leaking credentials', async () => {
  for (const options of [
    { environment: { GMAIL_SEND_ENABLED: 'false' }, status: 'disabled' }, { environment: { GOOGLE_REFRESH_TOKEN: '' }, status: 'not_configured' },
    { scopeList: ['https://www.googleapis.com/auth/gmail.readonly'], status: 'reauthorization_required' }, { scopeList: GOOGLE_GMAIL_SEND_SCOPES, status: 'reauthorization_required' },
    { email: 'other@example.test', status: 'account_mismatch' }, { oauthError: { response: { status: 400, data: { error: 'invalid_grant', private: access } } }, status: 'reauthorization_required' },
    { tokenInfoError: new Error(access), status: 'unavailable' },
  ]) {
    const f = fixture(options), result = await f.client.send(input); assert.equal(result.status, options.status); assert.equal(result.sent, false); assert.equal(result.dispatched, false); assert.equal(f.posts().length, 0); assert(!JSON.stringify(result).includes(access));
  }
  const aborted = fixture(); assert.equal((await aborted.client.send({ ...input, signal: AbortSignal.abort() })).sent, false); assert.equal(aborted.posts().length, 0);
  const ready = fixture(), status = await ready.client.readiness(); assert.equal(status.status, 'ready'); assert.equal(status.canSend, true); assert.equal(status.scopeVerified, true); assert.equal(status.accountVerified, true); assert.equal(ready.posts().length, 0);
  const currentScopes = [...scopes], revoked = fixture({ scopeList: currentScopes }); assert.equal((await revoked.client.readiness()).status, 'ready'); currentScopes.splice(currentScopes.indexOf(GOOGLE_GMAIL_SEND_SCOPES[0]), 1); assert.equal((await revoked.client.send(input)).status, 'reauthorization_required'); assert.equal(revoked.posts().length, 0, 'A prior readiness result does not authorize a later revoked send');
});

test('post-dispatch network, malformed/oversized responses and cancellation stay unknown with no automatic retry', async () => {
  for (const handler of [
    () => { throw new Error(access); }, () => new Response('not-json'), () => json({}), () => json({ id: 'not a safe provider id' }), () => json({ id: 'abc', threadId: 'bad value' }),
    () => new Response('x'.repeat(9000)), () => new Response(access, { status: 500 }), () => new Response(access, { status: 503 }),
  ]) { const f = fixture({ handler }), result = await f.client.send(input); assert.equal(result.sent, 'unknown'); assert.equal(result.dispatched, true); assert.equal(result.reason, 'write_outcome_unknown'); assert.equal(f.posts().length, 1); assert(!JSON.stringify(result).includes(access)); }
  const controller = new AbortController(), f = fixture({ handler: async options => { controller.abort(); throw new DOMException('Synthetic cancellation', 'AbortError'); } }); const result = await f.client.send({ ...input, signal: controller.signal }); assert.equal(result.sent, 'unknown'); assert.equal(result.status, 'aborted'); assert.equal(f.posts().length, 1);
  for (const [status, expected] of [[400, 'invalid_request'], [401, 'reauthorization_required'], [403, 'permission_denied'], [429, 'rate_limited']]) { const f = fixture({ handler: () => new Response(access, { status }) }), result = await f.client.send(input); assert.equal(result.status, expected); assert.equal(result.sent, false); assert.equal(result.dispatched, true); assert.equal(f.posts().length, 1); }
});

test('the actual send timeout stops one dispatched request without retrying', async t => {
  t.mock.method(AbortSignal, 'timeout', () => { const controller = new AbortController(); setTimeout(() => controller.abort(new DOMException('Synthetic bounded timeout', 'TimeoutError')), 5); return controller.signal; });
  const f = fixture({ handler: options => new Promise((resolve, reject) => options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true })) });
  const result = await f.client.send(input); assert.equal(result.status, 'timeout'); assert.equal(result.sent, 'unknown'); assert.equal(result.reason, 'write_outcome_unknown'); assert.equal(f.posts().length, 1);
});
