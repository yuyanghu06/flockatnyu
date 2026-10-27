import test from 'node:test';
import assert from 'node:assert/strict';
import { readConfig } from '../server/shared/config.js';
import { createProvider, parseSSE } from '../server/providers/index.js';

const config = readConfig({ LLM_PROVIDER: 'openai-compatible', LLM_MODEL: 'test-model', LLM_API_KEY: 'test-secret' });
const sse = text => new Response(new ReadableStream({ start(controller) {
  const bytes = new TextEncoder().encode(text);
  for (let i = 0; i < bytes.length; i += 3) controller.enqueue(bytes.slice(i, i + 3));
  controller.close();
} }), { headers: { 'content-type': 'text/event-stream' } });
const collect = async provider => { const output = []; for await (const chunk of provider.stream({ messages: [{ role: 'user', content: 'Hi' }], system: 'Policy', signal: new AbortController().signal })) output.push(chunk); return output; };
const openaiText = 'data: {"choices":[{"index":0,"delta":{"content":"héllo"},"finish_reason":null}]}\r\n\r\ndata: {"choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n';

test('configuration requires explicit provider, model and key; dev always binds loopback', () => {
  assert.equal(readConfig({}).configured, false);
  assert.equal(readConfig({ ...{ LLM_PROVIDER: 'anthropic', LLM_MODEL: 'm', LLM_API_KEY: 'k' }, HOST: '0.0.0.0' }).host, '127.0.0.1');
  assert.equal(readConfig({ NODE_ENV: 'production' }).host, '0.0.0.0');
  assert.equal(readConfig({}).port, 3001);
  assert.deepEqual(readConfig({}).allowedSourceIds, []);
  assert.equal(readConfig({ LLM_PROVIDER: 'other', LLM_MODEL: 'm', LLM_API_KEY: 'k' }).configured, false);
});
test('OpenAI chunks decode UTF8 and CRLF across chunks and end only with finish plus DONE', async () => {
  let request;
  const adapter = createProvider(config, { fetchImpl: async (url, init) => { request = { url, ...init }; return sse(openaiText); } });
  assert.deepEqual(await collect(adapter), ['héllo']);
  assert.equal(request.url, 'https://api.openai.com/v1/chat/completions');
  assert.equal(JSON.parse(request.body).store, false);
  assert.equal(JSON.parse(request.body).messages[0].role, 'system');
  assert.equal(request.redirect, 'error');
});
test('Anthropic uses messages endpoint and requires final message_stop', async () => {
  let request;
  const adapter = createProvider({ ...config, provider: 'anthropic', baseUrl: 'https://example.test/v1' }, { fetchImpl: async (url, init) => {
    request = { url, ...init };
    return sse(['message_start|{"type":"message_start"}', 'content_block_delta|{"type":"content_block_delta","delta":{"type":"text_delta","text":"Hi"}}', 'message_delta|{"type":"message_delta","delta":{"stop_reason":"end_turn"}}', 'message_stop|{"type":"message_stop"}'].map(row => { const [event, data] = row.split('|'); return `event: ${event}\ndata: ${data}\n\n`; }).join(''));
  } });
  assert.deepEqual(await collect(adapter), ['Hi']);
  assert.equal(request.headers['anthropic-version'], '2023-06-01');
  assert.equal(JSON.parse(request.body).system, 'Policy');
});
for (const [name, text] of [
  ['early EOF', openaiText.replace('data: [DONE]\n\n', '')],
  ['missing finish', 'data: [DONE]\n\n'],
  ['malformed JSON', 'data: nope\n\n'],
  ['upstream error', 'data: {"error":{"message":"secret upstream details"}}\n\n'],
  ['truncated frame', 'data: {"choices":[]}'],
  ['token limit', 'data: {"choices":[{"index":0,"delta":{},"finish_reason":"length"}]}\n\ndata: [DONE]\n\n'],
]) test(`rejects ${name} without exposing upstream text`, async () => {
  await assert.rejects(collect(createProvider(config, { fetchImpl: async () => sse(text) })), error => !error.message.includes('secret') && Boolean(error.code));
});
test('HTTP errors and redirects do not expose response bodies', async () => {
  await assert.rejects(collect(createProvider(config, { fetchImpl: async () => new Response('sensitive data', { status: 401 }) })), { message: 'provider_unavailable' });
});
test('SSE bounded event and cancellation', async () => {
  await assert.rejects(async () => { for await (const _ of parseSSE(new Response('data: ' + 'x'.repeat(262145)).body)) {} });
  const controller = new AbortController(); controller.abort();
  await assert.rejects(async () => { for await (const _ of parseSSE(sse(openaiText).body, controller.signal)) {} }, { code: 'aborted' });
});

test('provider fetch cancellation remains sanitized', async () => {
  const controller = new AbortController();
  const adapter = createProvider(config, { fetchImpl: async (_, { signal }) => new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(new Error('private URL')), { once: true })) });
  const next = adapter.stream({ messages: [], system: '', signal: controller.signal }).next();
  controller.abort();
  await assert.rejects(next, { code: 'aborted', message: 'aborted' });
});

test('Hono API integration (requires installed dependency)', async t => {
  try { await import('hono'); } catch (error) { if (error.code === 'ERR_MODULE_NOT_FOUND') { t.skip('Hono dependency unavailable in offline environment'); return; } throw error; }
  const { createApp } = await import('../server/runtime/app.js');
  const app = createApp({ config, auth: () => ({ id: 'local-development', allowedSourceIds: [] }), provider: { async *stream({ system }) { assert.match(system, /No club knowledge/); yield 'Hello'; } } });
  const response = await app.request('/api/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ messages: [{ role: 'user', content: 'Hello' }] }) });
  assert.deepEqual((await response.text()).trim().split('\n').map(JSON.parse).map(row => row.type), ['meta', 'delta', 'done']);
  const denied = createApp({ config });
  assert.equal((await denied.request('/api/chat', { method: 'POST', headers: { origin: 'http://localhost', 'x-forwarded-for': '127.0.0.1' } })).status, 403);
  const transport = { incoming: { socket: { remoteAddress: '127.0.0.1' } } };
  const localStatus = await denied.request('http://localhost:3001/api/status', {}, transport);
  assert.equal((await localStatus.json()).access.allowed, true);
  const remoteHost = await denied.request('http://attacker.example/api/status', {}, transport);
  assert.equal((await remoteHost.json()).access.allowed, false);
  const badHostHeader = await denied.request('http://localhost/api/status', { headers: { host: 'attacker.example' } }, transport);
  assert.equal((await badHostHeader.json()).access.allowed, false);
  assert.equal((await denied.request('http://localhost/api/chat', { method: 'POST' }, transport)).status, 403);
  const remoteOrigin = await denied.request('http://localhost/api/status', { headers: { origin: 'https://attacker.example' } }, transport);
  assert.equal((await remoteOrigin.json()).access.allowed, false);
});
