import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeContactContext as browserContext, boundedMessages, streamAssistant, steerAssistant } from '../src/features/assistant/chat-client.js';
import { normalizeContactContext as serverContext, contactMessageForModel } from '../server/chat-contact-context.js';
import { createChatSteeringRegistry } from '../server/chat-steering.js';
import { createApp } from '../server/app.js';
import { createContactsTools } from '../tools/contacts/index.js';
import { contactStorage, contactRow, contactIds, contactPrincipal } from './fixtures/contacts-store.mjs';

const selected = { id: contactIds.rae, first_name: 'Display Label', last_name: 'Only' };
const other = { id: contactIds.other, first_name: 'Second', last_name: 'Selection' };
const origin = 'http://contact-subject.example.test';
const config = { configured: true, provider: 'openai-compatible', model: 'synthetic-only', timeoutMs: 5000, requestTimeoutMs: 5000, retrievalToolsEnabled: true };
const ndjson = records => new Response(records.map(record => JSON.stringify(record) + '\n').join(''), { headers: { 'content-type': 'application/x-ndjson' } });

test('selected Contact transport keeps exact per-message IDs/names, rejects profile data, and counts context in its byte limit', async () => {
  const input = { ...selected, id: selected.id.toUpperCase() };
  assert.deepEqual(browserContext(input), selected); assert.deepEqual(serverContext(input), selected);
  const browser = browserContext(input), server = serverContext(input); input.first_name = 'Changed after normalization';
  assert.equal(browser.first_name, selected.first_name); assert.equal(server.first_name, selected.first_name);
  for (const value of [null, [], {}, { ...selected, email: 'private@example.com' }, { ...selected, first_name: 'x'.repeat(201) }, { ...selected, last_name: 'nul\0name' }, { ...selected, id: 'not-a-uuid' }, { id: selected.id, first_name: 'Missing last name' }]) {
    assert.throws(() => browserContext(value)); assert.throws(() => serverContext(value));
  }
  const messages = [{ role: 'user', content: 'Earlier subject', contactContext: selected }, { role: 'assistant', content: 'Earlier answer' }, { role: 'user', content: 'What about this person?', contactContext: other }];
  const copy = boundedMessages(messages); assert.deepEqual(copy, messages); messages[2].contactContext = selected; assert.deepEqual(copy[2].contactContext, other);
  assert.throws(() => boundedMessages([{ role: 'assistant', content: 'Invalid subject owner', contactContext: selected }]));
  const many = Array.from({ length: 20 }, () => ({ role: 'user', content: 'x'.repeat(700), contactContext: { ...selected, first_name: '漢'.repeat(200), last_name: '漢'.repeat(200) } }));
  const bounded = boundedMessages(many); assert(bounded.length < many.length); assert(Buffer.byteLength(JSON.stringify({ messages: bounded })) <= 32500); assert.deepEqual(bounded.at(-1).contactContext, many.at(-1).contactContext);
  let sent;
  await streamAssistant({ messages: copy, fetchImpl: async (url, init) => { assert.equal(url, '/api/chat'); sent = JSON.parse(init.body); return ndjson([{ type: 'delta', text: 'Synthetic answer' }, { type: 'done' }]); } });
  assert.deepEqual(sent.messages.map(message => message.contactContext), [selected, undefined, other]);
  assert(!JSON.stringify(sent).includes('private@example.com'));
});

test('actual HTTP and native/non-native runner carry an untrusted subject selector without changing user authority or exposing private contact fields', async () => {
  for (const native of [true, false]) {
    const storage = contactStorage({ rows: [contactRow(contactIds.rae, { private_profile: { keep: 'PRIVATE NATIVE VALUE' } }), contactRow(contactIds.other)] });
    const contexts = [], plans = [], streams = [], audit = [];
    const base = createContactsTools({ store: storage.store });
    const contactsTools = { ...base, createRequest(context) { contexts.push(structuredClone(context)); return base.createRequest(context); } };
    let turn = 0;
    const calls = () => ++turn === 1 ? [{ ...(native ? { id: 'selected-read' } : {}), name: 'read_contact', arguments: { contactId: selected.id } }] : [];
    const provider = { ...(native ? { async toolTurn(input) { plans.push(input); return { text: '', toolCalls: calls() }; } } : { async planTools(input) { plans.push(input); return calls(); } }), async *stream(input) { streams.push(input); yield 'The saved workplace is Example Labs.'; } };
    const app = createApp({ config, provider, contactsTools, auth: async () => contactPrincipal, audit: { async recordEvent(event) { audit.push(event); } } });
    const request = body => app.request(origin + '/api/chat', { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const userText = 'What is this person’s saved workplace? Do not change anything.';
    const message = { role: 'user', content: userText, contactContext: selected };
    const response = await request({ messages: [message], timeZone: 'America/New_York' }); assert.equal(response.status, 200);
    const records = (await response.text()).trim().split('\n').map(line => JSON.parse(line)); assert(records.some(record => record.type === 'done'));
    assert.equal(contexts[0].userMessage, userText, 'The current write-authorization input is only the original user text');
    for (const input of [...plans, ...streams]) {
      const user = input.messages.find(message => message.role === 'user'); assert(user.content.startsWith(userText)); assert(user.content.includes('untrusted subject data')); assert(user.content.includes(selected.id)); assert(!Object.hasOwn(user, 'contactContext'));
      assert(input.system.includes('selected saved Contact')); assert(!JSON.stringify(input).includes('PRIVATE NATIVE VALUE'));
    }
    assert.equal(storage.attempts.length, 0); assert.equal(storage.applied.length, 0); assert(!JSON.stringify(records).includes(selected.first_name)); assert(!JSON.stringify(audit).includes(selected.first_name));
    const count = plans.length;
    for (const body of [
      { messages: [{ ...message, contactContext: { ...selected, raw_input: { private: true } } }], timeZone: 'UTC' },
      { messages: [{ role: 'assistant', content: 'Invalid owner', contactContext: selected }, { role: 'user', content: 'Hello' }], timeZone: 'UTC' },
      { messages: Array.from({ length: 20 }, () => ({ role: 'user', content: 'x'.repeat(700), contactContext: { ...selected, first_name: '漢'.repeat(200), last_name: '漢'.repeat(200) } })), timeZone: 'UTC' },
    ]) assert.equal((await request(body)).status, 400);
    assert.equal(plans.length, count, 'Invalid/oversized selectors fail before any provider dispatch');
    assert.deepEqual(message, { role: 'user', content: userText, contactContext: selected }, 'Provider serialization never rewrites the admitted conversation');
  }
});

test('steering binds selected subject and retry identity; accepted text retains only cloned context', async () => {
  const registry = createChatSteeringRegistry(), entry = registry.create({ principal: contactPrincipal, origin, messages: [{ role: 'user', content: 'Initial subject', contactContext: selected }] });
  const context = { ...selected }, base = { principal: contactPrincipal, origin, token: entry.steeringToken, body: { messageId: 'followup-1', text: 'Also read their notes, without changing them.', contactContext: context } };
  assert.equal(registry.enqueue(entry.runId, base).httpStatus, 202);
  assert.equal(registry.enqueue(entry.runId, base).httpStatus, 202, 'Exact retries reuse the admitted message');
  assert.equal(registry.enqueue(entry.runId, { ...base, body: { ...base.body, contactContext: { ...selected, first_name: 'Different retry label' } } }).httpStatus, 409);
  assert.equal(registry.enqueue(entry.runId, { ...base, body: { ...base.body, messageId: 'different-person', contactContext: other } }).httpStatus, 409);
  assert.equal(registry.enqueue(entry.runId, { ...base, body: { messageId: 'missing-selection', text: 'Change subject implicitly' } }).httpStatus, 409);
  context.first_name = 'Mutated caller copy';
  const pending = entry.drain(); assert.equal(pending.length, 1); assert.deepEqual(pending[0].contactContext, selected);
  const visible = contactMessageForModel({ role: 'user', content: pending[0].text, contactContext: pending[0].contactContext }); assert(visible.content.includes(selected.id)); assert(!visible.content.includes('Mutated caller copy'));
  entry.finish();
  let sent;
  await steerAssistant({ runId: '10000000-0000-4000-8000-000000000099', steeringToken: 'a'.repeat(43), messageId: 'followup-2', text: 'Keep the same person.', contactContext: selected, fetchImpl: async (url, init) => { sent = JSON.parse(init.body); return new Response(JSON.stringify({ status: 'accepted', messageId: 'followup-2', sequence: 1 }), { status: 202 }); } });
  assert.deepEqual(sent, { messageId: 'followup-2', text: 'Keep the same person.', contactContext: selected });
});
