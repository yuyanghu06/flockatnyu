import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { createGmailSendStore } from '../server/google/gmail-send-store.js';
import { createGmailSendService } from '../server/google/gmail-send-service.js';
import { createGmailSendClient } from '../server/google/gmail-send.js';
import { createGmailSendTools } from '../tools/gmail-send/index.js';
import { createApp } from '../server/runtime/app.js';
import { readConfig } from '../server/shared/config.js';
import { createSiteAuth, readSiteAuthConfig } from '../server/auth/site-auth.js';
import { createChatRunner } from '../server/chat/runner.js';
import { createChatSteeringRegistry } from '../server/chat/steering.js';
import { createRuntimeApp } from '../server/runtime/services.js';

const principal = { id: 'synthetic-gmail-operator', googleAccess: true, allowedSourceIds: [] };
const sender = 'hello@example.test', privateToken = 'SYNTHETIC_OAUTH_TOKEN_NEVER_IN_LEDGER';
const message = { requestId: '72000000-0000-4000-8000-000000000001', to: ['recipient@example.test'], subject: 'PRIVATE_SYNTHETIC_SUBJECT', body: 'PRIVATE_SYNTHETIC_BODY' };
const rpcNames = ['probe', 'claim', 'finish', 'read'];
const googleScopes = ['https://www.googleapis.com/auth/gmail.readonly', 'https://www.googleapis.com/auth/gmail.send'];
const env = { GMAIL_SEND_ENABLED: 'true', GMAIL_SEND_RECEIPT_KEY: 'synthetic-receipt-signing-key-over-thirty-two-characters', GOOGLE_CLIENT_ID: 'synthetic-client', GOOGLE_CLIENT_SECRET: 'synthetic-client-secret', GOOGLE_REFRESH_TOKEN: 'synthetic-refresh', GOOGLE_EXPECTED_ACCOUNT_EMAIL: sender, SUPABASE_URL: 'https://gmail-send-sql.example.test', SUPABASE_SERVICE_ROLE_KEY: 'synthetic-private-database-key' };

async function fixture(t) {
  const db = new PGlite(); t.after(() => db.close());
  await db.exec('create role anon;create role authenticated;create role public_probe;create role service_role bypassrls;');
  await db.exec(await readFile(new URL('../supabase/migrations/202610270053_gmail_send_receipts.sql', import.meta.url), 'utf8')); await db.exec('set role service_role');
  const requests = [], posts = [], rpcCalls = [], mode = {}, errors = [];
  const rpc = async (name, payload = {}) => (await db.query(`select public.gmail_send_${name}($1::jsonb) result`, [JSON.stringify(payload)])).rows[0].result;
  const fetchImpl = async (input, init = {}) => {
    const url = new URL(input), method = init.method ?? 'GET', body = init.body ? JSON.parse(init.body) : undefined;
    requests.push({ origin: url.origin, path: url.pathname, method });
    if (url.origin === 'https://gmail.googleapis.com') {
      assert.equal(new Headers(init.headers).get('authorization'), 'Bearer ' + privateToken); assert.equal(init.redirect, 'error');
      if (url.pathname.endsWith('/profile')) { assert.equal(method, 'GET'); return Response.json({ emailAddress: mode.email ?? sender }); }
      assert.equal(url.pathname, '/gmail/v1/users/me/messages/send'); assert.equal(method, 'POST'); posts.push({ body, signal: init.signal });
      if (mode.beforeSend) await mode.beforeSend(init);
      if (mode.googleReply) return mode.googleReply(init);
      return Response.json({ id: 'aabbcc', threadId: 'ddeeff' });
    }
    assert.equal(url.origin, 'https://gmail-send-sql.example.test', 'No actual business/inference transport'); assert.equal(method, 'POST');
    assert.equal(new Headers(init.headers).get('authorization'), 'Bearer ' + env.SUPABASE_SERVICE_ROLE_KEY); assert.deepEqual(Object.keys(body), ['p_payload']);
    const name = rpcNames.find(name => url.pathname === `/rest/v1/rpc/gmail_send_${name}`); assert(name); rpcCalls.push({ name, payload: structuredClone(body.p_payload) });
    if (mode.beforeRpc) await mode.beforeRpc(name, body.p_payload);
    if (mode.failBefore === name) throw Error('Synthetic persistence transport loss');
    let result;
    try { result = await rpc(name, body.p_payload); } catch (error) { errors.push({ name, code: error.code }); throw error; }
    if (mode.failAfter === name) throw Error('Synthetic response loss after durable commit');
    return Response.json(result);
  };
  const oauthClient = { setCredentials() {}, async getAccessToken() { return { token: privateToken }; }, async getTokenInfo() { return { scopes: mode.scopes ?? googleScopes }; } };
  const store = createGmailSendStore({ env, fetchImpl });
  const client = createGmailSendClient({ env, fetchImpl, oauthClient });
  const service = () => createGmailSendService({ env, client, store });
  const rows = async () => (await db.query('select to_jsonb(r) value from public.gmail_send_receipts r order by actor_hash,ordinal')).rows.map(row => row.value);
  const owner = async (sql, params = []) => { await db.exec('reset role'); try { return await db.query(sql, params); } finally { await db.exec('set role service_role'); } };
  return { db, store, client, service, rows, owner, rpc, requests, posts, rpcCalls, mode, errors };
}
const send = (service, changes = {}) => service.send({ ...message, principal, ...changes });
const assertBlocked = result => { assert.equal(result.sent, false, 'This new operation never dispatched'); assert.equal(result.blocked, true); assert.equal(result.reason, 'write_outcome_unknown'); };

test('053 and actual Google/store/service confirm a send once, preserve durable replay across restart, and store no message content', async t => {
  const h = await fixture(t), service = h.service();
  assert.equal((await service.readiness({ principal })).status, 'ready'); assert.equal(h.posts.length, 0, 'Readiness never sends');
  h.mode.beforeSend = async () => { const rows = await h.rows(); assert.equal(rows.length, 1); assert.equal(rows[0].status, 'dispatching', 'Durable marker exists before Google dispatch'); };
  const result = await send(service); assert.deepEqual(result, { status: 'ready', sent: true, accepted: true, replayed: false, gmailSend: { operation: 'sent', requestId: message.requestId, messageId: 'aabbcc', threadId: 'ddeeff' } }); assert.equal(h.posts.length, 1);
  const replay = await send(h.service()); assert.equal(replay.replayed, true); assert.deepEqual(replay.gmailSend, result.gmailSend); assert.equal(h.posts.length, 1);
  const status = await h.service().getStatus({ principal, requestId: message.requestId }); assert.deepEqual(status.gmailSend, result.gmailSend);
  assert.equal((await send(h.service(), { body: 'Changed arguments under same id' })).status, 'conflict'); assert.equal(h.posts.length, 1);
  assert.equal((await h.service().getStatus({ principal: { ...principal, id: 'other-operator' }, requestId: message.requestId })).status, 'not_found');
  const rows = await h.rows(); assert.equal(rows[0].status, 'sent');
  const metadata = JSON.stringify({ rows, rpcCalls: h.rpcCalls }); for (const value of [message.to[0], message.subject, message.body, sender, privateToken, env.GOOGLE_REFRESH_TOKEN, env.GMAIL_SEND_RECEIPT_KEY]) assert(!metadata.includes(value), 'Ledger/RPC contains private content');
  const columns = (await h.db.query("select column_name,data_type from information_schema.columns where table_schema='public' and table_name='gmail_send_receipts'")).rows; assert(!columns.some(column => ['json', 'jsonb'].includes(column.data_type))); assert(!columns.some(column => /^(to|subject|body|email|sender_email|payload|raw|refresh_token|access_token)$/.test(column.column_name)));
});

test('parallel claims, a process restart and an arbitrarily old dispatch marker never create another Google send', async t => {
  const h = await fixture(t); let release, entered;
  const pending = new Promise(resolve => { release = resolve; }), started = new Promise(resolve => { entered = resolve; });
  h.mode.beforeSend = async () => { entered(); await pending; };
  const first = send(h.service()); await started;
  const duplicate = await send(h.service()); assert.equal(duplicate.sent, 'unknown'); assert.equal(h.posts.length, 1);
  await h.owner("update public.gmail_send_receipts set created_at='2000-01-01',updated_at='2000-01-01' where status='dispatching'");
  assert.equal((await send(h.service())).sent, 'unknown'); assertBlocked(await send(h.service(), { requestId: randomUUID(), groupId: message.requestId, ordinal: 1 })); assert.equal(h.posts.length, 1);
  release(); assert.equal((await first).sent, true); assert.equal((await send(h.service())).sent, true); assert.equal(h.posts.length, 1);
});

test('post-dispatch failures, aborts and failed receipt persistence fence exact/changed/next requests instead of retrying', async t => {
  for (const kind of ['network', 'malformed', 'server-error', 'abort', 'finish-write-loss']) {
    const h = await fixture(t), controller = new AbortController();
    if (kind === 'network') h.mode.googleReply = () => { throw Error(privateToken); };
    if (kind === 'malformed') h.mode.googleReply = () => Response.json({ id: 'invalid provider id' });
    if (kind === 'server-error') h.mode.googleReply = () => new Response(privateToken, { status: 503 });
    if (kind === 'abort') h.mode.googleReply = () => { controller.abort(); throw new DOMException('Synthetic abort', 'AbortError'); };
    if (kind === 'finish-write-loss') h.mode.failBefore = 'finish';
    const result = await send(h.service(), { signal: controller.signal }); assert.equal(result.sent, 'unknown', kind); assert.equal(result.reason, 'write_outcome_unknown'); assert.equal(h.posts.length, 1);
    assert.equal((await send(h.service())).sent, 'unknown'); assertBlocked(await send(h.service(), { requestId: randomUUID(), groupId: message.requestId, ordinal: 1 })); assert.equal((await send(h.service(), { body: 'Changed message' })).status, 'conflict'); assert.equal((await send(h.service(), { requestId: randomUUID(), groupId: message.requestId, ordinal: 2 })).status, 'conflict', 'Payload conflicts durably fence later group operations too'); assert.equal(h.posts.length, 1);
    assert(['dispatching', 'unknown'].includes((await h.rows())[0].status)); assert(!JSON.stringify(result).includes(privateToken)); assert.equal((await h.service().getStatus({ principal, requestId: message.requestId })).sent, 'unknown');
  }
});

test('lost claim/finish responses are conservatively fenced or read-only recovered; definitive failures remain terminal', async t => {
  const lostClaim = await fixture(t); lostClaim.mode.failAfter = 'claim'; assert.equal((await send(lostClaim.service())).sent, 'unknown'); assert.equal(lostClaim.posts.length, 0); lostClaim.mode.failAfter = undefined; assert.equal((await send(lostClaim.service())).sent, 'unknown'); assert.equal(lostClaim.posts.length, 0);
  const lostFinish = await fixture(t); lostFinish.mode.failAfter = 'finish'; assert.equal((await send(lostFinish.service())).sent, true, 'Read-only recovery confirms the exact committed receipt'); assert.equal(lostFinish.posts.length, 1); assert.equal((await send(lostFinish.service())).replayed, true); assert.equal(lostFinish.posts.length, 1);
  const denied = await fixture(t); denied.mode.googleReply = () => new Response(privateToken, { status: 403 }); const failed = await send(denied.service()); assert.equal(failed.sent, false); assert.equal(failed.status, 'forbidden'); assert.equal((await send(denied.service())).replayed, true); assert.equal(denied.posts.length, 1); assert.equal((await denied.rows())[0].status, 'failed');
  const noScope = await fixture(t); noScope.mode.scopes = ['https://www.googleapis.com/auth/gmail.readonly']; assert.equal((await send(noScope.service())).status, 'reauthorization_required'); assert.equal(noScope.posts.length, 0); assert.equal((await send(noScope.service())).replayed, true); assert.equal(noScope.posts.length, 0);
});

test('ledger grants, token ownership, terminal transitions and authenticated service access remain private', async t => {
  const h = await fixture(t), payload = { actorHash: 'a'.repeat(64), senderHash: 'b'.repeat(64), payloadHash: 'c'.repeat(64), requestId: randomUUID(), groupId: randomUUID(), ordinal: 0 };
  const claimed = await h.rpc('claim', payload); assert.equal(claimed.status, 'claimed'); assert(!Object.hasOwn(claimed.receipt, 'dispatch_token')); assert(!Object.hasOwn(claimed.receipt, 'token'));
  assert.equal((await h.rpc('finish', { actorHash: payload.actorHash, requestId: payload.requestId, token: randomUUID(), status: 'sent', messageId: 'abc' })).status, 'conflict');
  const unknown = { actorHash: payload.actorHash, requestId: payload.requestId, token: claimed.token, status: 'unknown', reason: 'write_outcome_unknown' }; assert.equal((await h.rpc('finish', unknown)).status, 'ready'); assert.equal((await h.rpc('finish', unknown)).status, 'ready'); assert.equal((await h.rpc('finish', { ...unknown, status: 'sent', messageId: 'abc', reason: undefined })).status, 'conflict');
  for (const actor of [null, { id: 'operator' }, { id: 'operator', googleAccess: false }]) { assert.equal((await send(h.service(), { principal: actor })).status, 'forbidden'); assert.equal((await h.service().readiness({ principal: actor })).status, 'forbidden'); }
  assert.equal(h.posts.length, 0);
  const grants = (await h.owner("select proname,has_function_privilege('anon',oid,'execute') anon,has_function_privilege('authenticated',oid,'execute') authenticated,has_function_privilege('public_probe',oid,'execute') public_probe,has_function_privilege('service_role',oid,'execute') service from pg_proc where pronamespace='public'::regnamespace and proname like '%gmail_send%'")).rows; assert.equal(grants.length, 5); assert(grants.every(row => !row.anon && !row.authenticated && !row.public_probe && row.service));
  const rls = (await h.owner("select relrowsecurity,relforcerowsecurity from pg_class where oid='public.gmail_send_receipts'::regclass")).rows[0]; assert.deepEqual(rls, { relrowsecurity: true, relforcerowsecurity: true });
  for (const role of ['anon', 'authenticated', 'public_probe']) { await h.db.exec(`begin;set local role ${role}`); try { await assert.rejects(() => h.db.query('select * from public.gmail_send_receipts'), error => error.code === '42501'); } finally { await h.db.exec('rollback'); } }
});

test('actual chat send adapter keeps stable operation identities and blocks changed/steered/resumed sends after uncertainty', async t => {
  const h = await fixture(t), tools = createGmailSendTools({ service: h.service() }), args = { to: message.to, subject: message.subject, body: message.body }, group = randomUUID();
  assert.equal((await tools.execute({ name: 'send_gmail', arguments: args, principal })).status, 'forbidden');
  const missing = tools.createRequest({ principal, userMessage: 'Send the requested email.' }); assert.equal((await missing.execute({ name: 'send_gmail', arguments: args })).reason, 'stable_request_id_required');
  const empty = tools.createRequest({ principal, requestId: group, userMessage: '' }); assert.equal((await empty.execute({ name: 'send_gmail', arguments: args })).status, 'forbidden');
  const request = tools.createRequest({ principal, requestId: group, userMessage: 'Send the requested email.' });
  assert.equal((await request.execute({ name: 'send_gmail', arguments: { ...args, requestId: randomUUID() } })).status, 'invalid_request');
  assert.equal((await request.execute({ name: 'send_gmail', arguments: args, principal: { ...principal, id: 'spoofed' } })).status, 'forbidden');
  assert.equal(h.posts.length, 0);
  h.mode.googleReply = () => { throw Error(privateToken); };
  const first = await request.execute({ name: 'send_gmail', arguments: args }); assert.equal(first.sent, 'unknown'); assert.equal(h.posts.length, 1);
  assert.deepEqual(await request.execute({ name: 'send_gmail', arguments: structuredClone(args) }), first); assert.equal(h.posts.length, 1);
  request.advanceUserInput({ userMessage: 'Actually use a different body.' });
  assertBlocked(await request.execute({ name: 'send_gmail', arguments: { ...args, body: 'New body after uncertain send' } })); assert.equal(h.posts.length, 1);
  const resumed = tools.createRequest({ principal, requestId: group, userMessage: 'Resume the interrupted message.' });
  assert.equal((await resumed.execute({ name: 'send_gmail', arguments: args })).sent, 'unknown'); assert.equal(h.posts.length, 1);
  const changedResume = tools.createRequest({ principal, requestId: group, userMessage: 'Resume with changed details.' });
  assert.equal((await changedResume.execute({ name: 'send_gmail', arguments: { ...args, subject: 'Changed' } })).status, 'conflict');
  assertBlocked(await changedResume.execute({ name: 'send_gmail', arguments: { ...args, subject: 'Another changed attempt' } })); assert.equal(h.posts.length, 1);
  const row = (await h.rows())[0]; assert.equal(row.group_id, group); assert.equal(row.ordinal, 0); assert.equal(row.request_id, first.requestId);
  assert(!JSON.stringify(first).includes(message.subject)); assert(!JSON.stringify(first).includes(message.to[0])); assert(!JSON.stringify(first).includes(privateToken));
});

test('exact tool replay and concurrent same-argument calls reuse one confirmed receipt without rebroadcasting', async t => {
  const h = await fixture(t), tools = createGmailSendTools({ service: h.service() }), group = randomUUID(), args = { to: message.to, subject: message.subject, body: message.body };
  const first = tools.createRequest({ principal, requestId: group, userMessage: 'Send these emails.' });
  const outcomes = await Promise.all([first.execute({ name: 'send_gmail', arguments: args }), first.execute({ name: 'send_gmail', arguments: structuredClone(args) })]); assert.deepEqual(outcomes[0], outcomes[1]); assert.equal(outcomes[0].sent, true); assert.equal(h.posts.length, 1);
  const resumed = tools.createRequest({ principal, requestId: group, userMessage: 'Resume the same request.' }); const replay = await resumed.execute({ name: 'send_gmail', arguments: args }); assert.equal(replay.sent, true); assert.equal(replay.replayed, true); assert.deepEqual(replay.gmailSend, outcomes[0].gmailSend); assert.equal(h.posts.length, 1);
  const second = await first.execute({ name: 'send_gmail', arguments: { ...args, to: ['second@example.test'] } }); assert.equal(second.sent, true); assert.notEqual(second.gmailSend.requestId, outcomes[0].gmailSend.requestId); assert.equal(h.posts.length, 2); assert.deepEqual((await h.rows()).map(row => [row.group_id, row.ordinal, row.status]), [[group, 0, 'sent'], [group, 1, 'sent']]);
});

test('actual authenticated HTTP send/status APIs enforce Origin, Google permission and exact bodies without model or hidden source reads', async t => {
  const h = await fixture(t), service = h.service(), config = readConfig({ NODE_ENV: 'production' }), origin = 'https://gmail-send.example.test';
  const site = createSiteAuth({ config: readSiteAuthConfig({ PUBLIC_ORIGIN: origin, SITE_ACCESS_PASSWORD: 'synthetic-gmail-send-password', SITE_SESSION_SECRET: 'synthetic-gmail-send-session-secret-over-thirty-two', SITE_GOOGLE_ENABLED: 'true' }), apiConfig: config });
  const cookie = site.issue('synthetic-gmail-send-password').split(';')[0]; let modelCalls = 0;
  const app = createApp({ config, auth: site.auth, gmailSendService: service, gmailSendTools: createGmailSendTools({ service }), provider: { async toolTurn() { modelCalls++; throw Error('Dedicated API must not call model'); }, async *stream() { modelCalls++; } }, audit: { recordEvent: async () => {} } });
  const request = (path = '/api/gmail/send', { method = 'GET', body, session = true, headers = {} } = {}) => app.request(origin + path, { method, headers: { ...(session ? { cookie } : {}), ...(method === 'GET' ? {} : { origin, 'content-type': 'application/json' }), ...headers }, ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }) });
  for (const path of ['/api/gmail/send-status', '/api/gmail/send/' + message.requestId]) assert.equal((await request(path, { session: false })).status, 403);
  for (const headers of [{ origin: 'https://evil.example.test' }, { origin: '' }, { origin: 'null' }, { 'sec-fetch-site': 'cross-site' }]) assert.equal((await request('/api/gmail/send', { method: 'POST', body: message, headers })).status, 403);
  const statusResponse = await request('/api/gmail/send-status'); assert.equal(statusResponse.status, 200); assert.match(statusResponse.headers.get('cache-control'), /private.*no-store/); assert.equal((await statusResponse.json()).sendScopeGranted, true); assert.equal(h.posts.length, 0);
  for (const body of [null, [], {}, { ...message, cc: ['extra@example.test'] }, { ...message, bcc: ['extra@example.test'] }, { ...message, from: 'spoof@example.test' }, { ...message, attachments: [] }, { ...message, html: '<b>not supported</b>' }, { ...message, threadId: 'abc' }, { ...message, groupId: randomUUID() }, { ...message, ordinal: 1 }]) assert.equal((await request('/api/gmail/send', { method: 'POST', body })).status, 400);
  assert.equal((await request('/api/gmail/send', { method: 'POST', body: 'not-json' })).status, 400); assert.equal((await request('/api/gmail/send', { method: 'POST', body: message, headers: { 'content-type': 'text/plain' } })).status, 400); assert.equal((await request('/api/gmail/send?unexpected=1', { method: 'POST', body: message })).status, 400);
  assert.equal(h.posts.length, 0); assert.equal((await request('/api/gmail/send/not-a-uuid')).status, 400); assert.equal((await request('/api/gmail/send-status?extra=1')).status, 400);
  const generic = await request('/api/tools/send_gmail', { method: 'POST', body: { to: message.to, subject: message.subject, body: message.body } }); assert(generic.status >= 400, 'Generic tool HTTP route cannot bypass the dedicated operation ID'); assert.equal(h.posts.length, 0);
  const sent = await request('/api/gmail/send', { method: 'POST', body: message }); assert.equal(sent.status, 200); const receipt = await sent.json(); assert.equal(receipt.sent, true); assert.equal(h.posts.length, 1); assert(!JSON.stringify(receipt).includes(message.subject)); assert(!JSON.stringify(receipt).includes(message.to[0]));
  const replay = await request('/api/gmail/send', { method: 'POST', body: message }); assert.equal((await replay.json()).replayed, true); assert.equal(h.posts.length, 1);
  const saved = await request('/api/gmail/send/' + message.requestId); assert.equal(saved.status, 200); assert.deepEqual((await saved.json()).gmailSend, receipt.gmailSend);
  assert.equal((await request('/api/gmail/send', { method: 'POST', body: { ...message, body: 'Different content under same id' } })).status, 409); assert.equal(h.posts.length, 1); assert.equal(modelCalls, 0);
  const noGoogleSite = createSiteAuth({ config: readSiteAuthConfig({ PUBLIC_ORIGIN: origin, SITE_ACCESS_PASSWORD: 'synthetic-gmail-send-password', SITE_SESSION_SECRET: 'synthetic-gmail-send-session-secret-over-thirty-two', SITE_GOOGLE_ENABLED: 'false' }), apiConfig: config });
  const blocked = createApp({ config, auth: noGoogleSite.auth, gmailSendService: service, provider: {}, audit: { recordEvent: async () => {} } }); assert.equal((await blocked.request(origin + '/api/gmail/send', { method: 'POST', headers: { origin, cookie, 'content-type': 'application/json' }, body: JSON.stringify({ ...message, requestId: randomUUID() }) })).status, 403); assert.equal(h.posts.length, 1);
});

test('production chat runner keeps one durable group through in-flight steering, unknown results and later Resume', async t => {
  const h = await fixture(t), group = randomUUID(), originalText = 'Send the requested plain-text email.', changedText = 'Actually use the revised body.', args = { to: message.to, subject: message.subject, body: message.body }, contexts = [], advances = [];
  const base = createGmailSendTools({ service: h.service() }), tools = { ...base, createRequest(context) { contexts.push(structuredClone(context)); const request = base.createRequest(context); return { ...request, advanceUserInput(input) { advances.push(structuredClone(input)); request.advanceUserInput(input); } }; } };
  let release, entered;
  const hold = new Promise(resolve => { release = resolve; }), started = new Promise(resolve => { entered = resolve; }); h.mode.beforeSend = async () => { entered(); await hold; }; h.mode.googleReply = () => { throw Error(privateToken); };
  const messages = [{ role: 'user', content: originalText }], registry = createChatSteeringRegistry(), origin = 'https://gmail-chat.example.test', steering = registry.create({ principal, origin, messages }); let round = 0;
  const plans = [], streams = [], records = [], audit = [];
  const provider = { async toolTurn(input) { plans.push(input); const calls = ++round === 1 ? [{ id: 'first-send', name: 'send_gmail', arguments: args }] : round === 2 ? [{ id: 'changed-send', name: 'send_gmail', arguments: { ...args, body: 'Revised body after unknown outcome' } }] : []; return { text: '', toolCalls: calls }; }, async *stream(input) { streams.push(input); yield 'The send outcome is unknown. I did not resend it.'; } };
  const config = { configured: true, provider: 'openai-compatible', model: 'synthetic-scripted-only', timeoutMs: 5000, requestTimeoutMs: 5000, retrievalToolsEnabled: true };
  const runner = createChatRunner({ config, provider, gmailSendTools: tools, audit: { recordEvent: async event => audit.push(event) } });
  const running = runner.run({ conversation: { requestId: group, messages, timeZone: 'UTC' }, principal, steering, onRecord: record => records.push(record) }); await started;
  assert.equal(registry.enqueue(steering.runId, { principal, origin, token: steering.steeringToken, body: { messageId: 'revised', text: changedText } }).httpStatus, 202); release(); assert.equal((await running).status, 'succeeded');
  assert.equal(h.posts.length, 1); assert.equal(contexts.length, 1); assert.equal(contexts[0].requestId, group); assert.equal(contexts[0].userMessage, originalText); assert(advances.some(input => input.userMessage === changedText));
  assert.equal((await h.rows())[0].group_id, group); assert.equal((await h.rows()).length, 1); assert(streams.at(-1).system.includes('write_outcome_unknown')); assert(!JSON.stringify(records).includes('"operation":"sent"')); assert(!JSON.stringify(audit).includes(message.subject));
  let resumeRound = 0;
  const resumed = createChatRunner({ config, gmailSendTools: createGmailSendTools({ service: h.service() }), audit: { recordEvent: async () => {} }, provider: { async toolTurn() { return { text: '', toolCalls: ++resumeRound === 1 ? [{ id: 'resume-send', name: 'send_gmail', arguments: { ...args, body: 'Revised body after unknown outcome' } }] : [] }; }, async *stream() { yield 'I could not confirm the earlier send and did not retry.'; } } });
  assert.equal((await resumed.run({ conversation: { requestId: group, messages: [{ role: 'user', content: 'Resume the interrupted request.' }], timeZone: 'UTC' }, principal })).status, 'succeeded'); assert.equal(h.posts.length, 1); assert.equal((await h.rows())[0].group_blocked, true);
  let missingRound = 0; const missingId = createChatRunner({ config, gmailSendTools: createGmailSendTools({ service: h.service() }), audit: { recordEvent: async () => {} }, provider: { async toolTurn() { return { text: '', toolCalls: ++missingRound === 1 ? [{ id: 'no-id', name: 'send_gmail', arguments: args }] : [] }; }, async *stream() { yield 'A stable request ID is required before sending.'; } } });
  await missingId.run({ conversation: { messages: [{ role: 'user', content: originalText }], timeZone: 'UTC' }, principal }); assert.equal(h.posts.length, 1);
});

test('receipt-key rotation or missing configuration cannot create a fresh actor namespace and resend an existing operation', async t => {
  for (const uncertain of [false, true]) {
    const h = await fixture(t); if (uncertain) h.mode.googleReply = () => { throw Error('Synthetic lost send response'); };
    const first = await send(h.service()); assert.equal(first.sent, uncertain ? 'unknown' : true); assert.equal(h.posts.length, 1);
    const rotated = createGmailSendService({ env: { ...env, GMAIL_SEND_RECEIPT_KEY: 'different-synthetic-receipt-key-over-thirty-two-characters' }, client: h.client, store: h.store });
    assert.equal((await send(rotated)).status, 'conflict'); assert.equal(h.posts.length, 1, 'Key rotation must not rebroadcast the same actor/request'); assert.equal((await h.rows()).length, 1); assert.equal((await h.rows())[0].group_blocked, true);
    const missing = createGmailSendService({ env: { ...env, GMAIL_SEND_RECEIPT_KEY: '' }, client: h.client, store: h.store }); assert.equal((await send(missing)).status, 'not_configured'); assert.equal(h.posts.length, 1);
  }
});

test('trusted reverse-proxy origins and exact localhost read exemptions work without opening send mutations', async t => {
  const h = await fixture(t), service = h.service(), config = readConfig({ NODE_ENV: 'production' }), publicOrigin = 'https://gmail-public.example.test';
  const site = createSiteAuth({ config: readSiteAuthConfig({ PUBLIC_ORIGIN: publicOrigin, SITE_ACCESS_PASSWORD: 'synthetic-proxy-password', SITE_SESSION_SECRET: 'synthetic-proxy-secret-over-thirty-two-characters', SITE_GOOGLE_ENABLED: 'true' }), apiConfig: config }), cookie = site.issue('synthetic-proxy-password').split(';')[0];
  const services = { config, gmailSendService: service, gmailSendTools: createGmailSendTools({ service }), provider: {}, audit: { recordEvent: async () => {} } };
  const internalRequest = origin => new Request('http://internal-host.example.test/api/gmail/send', { method: 'POST', headers: { origin, cookie, 'content-type': 'application/json', 'x-forwarded-proto': 'https' }, body: JSON.stringify(message) });
  const unlisted = createRuntimeApp({ services, auth: site.auth }); assert.equal((await unlisted.fetch(internalRequest(publicOrigin))).status, 403, 'Proxy headers alone never authorize a different Origin'); assert.equal(h.posts.length, 0);
  const listed = createRuntimeApp({ services, auth: site.auth, allowedOrigins: site.config.allowedOrigins }); assert.equal((await listed.fetch(internalRequest('https://evil.example.test'))).status, 403); assert.equal(h.posts.length, 0); const sent = await listed.fetch(internalRequest(publicOrigin)); assert.equal(sent.status, 200); assert.equal((await sent.json()).sent, true); assert.equal(h.posts.length, 1);
  const local = createApp({ config: readConfig({ DEV_GOOGLE_ENABLED: 'true' }), gmailSendService: service, provider: {}, audit: { recordEvent: async () => {} } }), loopback = { incoming: { socket: { remoteAddress: '127.0.0.1' } } };
  assert.equal((await local.fetch(new Request('http://127.0.0.1/api/gmail/send-status'), loopback)).status, 200);
  assert.equal((await local.fetch(new Request('http://127.0.0.1/api/gmail/send/' + randomUUID()), loopback)).status, 404);
  assert.equal((await local.fetch(new Request('http://127.0.0.1/api/gmail/send/not-a-uuid'), loopback)).status, 403);
  assert.equal((await local.fetch(new Request('http://127.0.0.1/api/gmail/send-status', { headers: { 'sec-fetch-site': 'cross-site' } }), loopback)).status, 403);
  assert.equal((await local.fetch(new Request('http://127.0.0.1/api/gmail/send-status'), { incoming: { socket: { remoteAddress: '10.0.0.2' } } })).status, 403);
  assert.equal((await local.fetch(new Request('http://127.0.0.1/api/gmail/send', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...message, requestId: randomUUID() }) }), loopback)).status, 403); assert.equal(h.posts.length, 1);
});
