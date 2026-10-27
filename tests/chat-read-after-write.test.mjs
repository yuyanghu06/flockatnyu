import test from 'node:test';
import assert from 'node:assert/strict';
import { createChatRunner } from '../server/chat/runner.js';
import { createContactsTools } from '../tools/contacts/index.js';
import { createChatCalendarTools } from '../tools/calendar/chat.js';
import { savedStorage, humanRow, humanId, otherId } from './fixtures/treg-save.mjs';
import { workerCalendars } from './fixtures/operation-api-all-model/worker-calendar.mjs';
import { mapSnapshot, eventId, now } from './fixtures/planner-followup.mjs';

const principal = { id: 'synthetic-read-after-write', googleAccess: true, allowedSourceIds: [] };
const config = {
  configured: true,
  provider: 'openai-compatible',
  timeoutMs: 10000,
  requestTimeoutMs: 10000,
  retrievalToolsEnabled: true,
};
function observe(adapter, calls) {
  const tracked = {
    ...adapter,
    async execute(input) {
      const result = await adapter.execute(input);
      calls.push(structuredClone({ name: input.name, arguments: input.arguments, result }));
      return result;
    },
  };
  if (adapter.createRequest)
    tracked.createRequest = (context) => observe(adapter.createRequest(context), calls);
  return tracked;
}
async function runScript(adapters, steps) {
  const calls = [],
    records = [],
    audit = [];
  let round = 0;
  const provider = {
    async toolTurn() {
      const next = steps[round++];
      const choices = typeof next === 'function' ? next(calls) : next;
      return {
        text: '',
        toolCalls: (choices ? (Array.isArray(choices) ? choices : [choices]) : []).map(
          (choice, index) => ({ id: `fixture_${round}_${index}`, ...choice }),
        ),
      };
    },
    async *stream() {
      yield 'Fixture actions finished.';
    },
  };
  const runner = createChatRunner({
    config,
    provider,
    ...Object.fromEntries(
      Object.entries(adapters).map(([name, adapter]) => [name, observe(adapter, calls)]),
    ),
    now: () => new Date(now),
    audit: { recordEvent: async (event) => audit.push(event) },
  });
  const outcome = await runner.run({
    principal,
    conversation: {
      messages: [
        {
          role: 'user',
          content:
            'Update the selected record, read the current saved version again, then remove only that record when explicitly selected. Preserve other data.',
        },
      ],
      timeZone: 'America/New_York',
    },
    onRecord: (record) => records.push(record),
  });
  assert.equal(outcome.status, 'succeeded');
  return { calls, records, audit };
}
const call = (name, args) => ({ name, arguments: args });
const readContact = () => call('read_contact', { contactId: humanId });
const contactTools = (storage) => createContactsTools({ store: storage.store });
const updateContact = (stamp) =>
  call('update_contact', {
    contactId: humanId,
    expectedUpdatedAt: stamp,
    fields: { notes: 'Requested revision' },
  });
const deleteContact = (stamp) =>
  call('delete_contact', { contactId: humanId, expectedUpdatedAt: stamp });

test('production chat rereads Contacts after update so a later exact-version deletion succeeds', async () => {
  const preserved = humanRow(otherId, { first_name: 'Unrelated', email: 'other@example.com' });
  const storage = savedStorage({ rows: [humanRow(), preserved] });
  const result = await runScript({ contactsTools: contactTools(storage) }, [
    readContact(),
    () => updateContact(storage.state.find((row) => row.id === humanId).updated_at),
    readContact(),
    () => deleteContact(storage.state.find((row) => row.id === humanId).updated_at),
  ]);
  assert.deepEqual(
    result.calls.map((row) => [row.name, row.result.status]),
    [
      ['read_contact', 'ready'],
      ['update_contact', 'ready'],
      ['read_contact', 'ready'],
      ['delete_contact', 'ready'],
    ],
  );
  assert.notEqual(
    result.calls[0].result.contact.updated_at,
    result.calls[2].result.contact.updated_at,
  );
  assert.equal(storage.applied.length, 2);
  assert.deepEqual(storage.state, [preserved]);
});

test('production chat rereads Calendar after update before cancelling the current revision', async () => {
  const calendar = workerCalendars(mapSnapshot());
  const before = structuredClone(
    calendar.maps.get(calendar.calendarClient.calendarId).get(eventId),
  );
  const result = await runScript(
    { googleTools: createChatCalendarTools({ client: calendar.calendarClient }) },
    [
      call('read_calendar_event', { eventId }),
      call('update_calendar_event', { eventId, title: 'Requested revision' }),
      call('read_calendar_event', { eventId }),
      call('delete_calendar_event', { eventId }),
    ],
  );
  assert.deepEqual(
    result.calls.map((row) => [row.name, row.result.status]),
    [
      ['read_calendar_event', 'ready'],
      ['update_calendar_event', 'ready'],
      ['read_calendar_event', 'ready'],
      ['delete_calendar_event', 'ready'],
    ],
  );
  const saved = calendar.maps.get(calendar.calendarClient.calendarId).get(eventId);
  assert.equal(saved.status, 'cancelled');
  assert.equal(saved.summary, 'Requested revision');
  assert.equal(saved.description, before.description);
  assert.deepEqual(saved.start, before.start);
  assert.equal(calendar.writes.length, 2);
});

test('unchanged duplicate reads remain cached and a Contacts write does not invalidate another adapter', async () => {
  const storage = savedStorage({ rows: [humanRow()] }),
    calendar = workerCalendars(mapSnapshot());
  const result = await runScript(
    {
      contactsTools: contactTools(storage),
      googleTools: createChatCalendarTools({ client: calendar.calendarClient }),
    },
    [
      readContact(),
      readContact(),
      call('read_calendar_event', { eventId }),
      () => updateContact(storage.state[0].updated_at),
      call('read_calendar_event', { eventId }),
    ],
  );
  assert.equal(result.calls.filter((row) => row.name === 'read_contact').length, 1);
  assert.equal(result.calls.filter((row) => row.name === 'read_calendar_event').length, 1);
  assert.equal(result.calls.filter((row) => row.name === 'update_contact').length, 1);
  assert.equal(storage.applied.length, 1);
  assert(
    result.audit.filter(
      (row) => row.kind === 'tool_finished' && row.status === 'duplicate_call_skipped',
    ).length >= 2,
  );
});

test('read invalidation never resets duplicate write protection', async () => {
  const storage = savedStorage({ rows: [humanRow()] });
  const create = call('create_contact', {
    fields: { first_name: 'Casey', last_name: 'Sample', email: 'casey@example.com' },
  });
  const result = await runScript({ contactsTools: contactTools(storage) }, [
    create,
    readContact(),
    create,
    readContact(),
  ]);
  assert.equal(result.calls.filter((row) => row.name === 'create_contact').length, 1);
  assert.equal(storage.applied.length, 1);
  assert.equal(storage.state.length, 2);
  assert(
    result.audit.some(
      (row) => row.kind === 'tool_finished' && row.status === 'duplicate_call_skipped',
    ),
  );
});

test('a conflict permits only the existing single targeted refresh, not unlimited identical reads', async () => {
  const storage = savedStorage({ rows: [humanRow()], conflict: true });
  const result = await runScript({ contactsTools: contactTools(storage) }, [
    readContact(),
    () => updateContact(storage.state[0].updated_at),
    readContact(),
    readContact(),
  ]);
  assert.equal(result.calls.filter((row) => row.name === 'read_contact').length, 2);
  assert.equal(result.calls.find((row) => row.name === 'update_contact').result.status, 'conflict');
  assert.equal(storage.applied.length, 0);
  assert.equal(storage.attempts.length, 1);
  assert(
    result.audit.some(
      (row) => row.kind === 'tool_finished' && row.status === 'duplicate_call_skipped',
    ),
  );
});

test('uncertain writes allow a fresh read while preserving uncertain-write blocking and no replay', async () => {
  const storage = savedStorage({ rows: [humanRow()], writeFailure: 'after' });
  const originalWrite = updateContact(storage.state[0].updated_at);
  const result = await runScript({ contactsTools: contactTools(storage) }, [
    readContact(),
    originalWrite,
    readContact(),
    originalWrite,
    () => deleteContact(storage.state[0].updated_at),
  ]);
  assert.equal(result.calls.filter((row) => row.name === 'read_contact').length, 2);
  assert.equal(
    result.calls.find((row) => row.name === 'update_contact').result.reason,
    'write_outcome_unknown',
  );
  assert.equal(
    result.calls.find((row) => row.name === 'delete_contact').result.reason,
    'write_outcome_unknown',
  );
  assert.equal(
    result.calls.filter((row) => row.name === 'update_contact').length,
    1,
    'Uncertain write signature must survive a later successful read',
  );
  assert.equal(storage.attempts.length, 1);
  assert.equal(storage.applied.length, 1);
  assert.equal(storage.state.length, 1);
  assert.equal(storage.state[0].raw_input.notes, 'Requested revision');
});

test('Contacts retries an identical read-required write only after the real exact read', async () => {
  const storage = savedStorage({ rows: [humanRow()] });
  const original = structuredClone(storage.state[0]);
  const update = updateContact(original.updated_at);
  const result = await runScript({ contactsTools: contactTools(storage) }, [
    update,
    readContact(),
    update,
    readContact(),
    update,
  ]);
  assert.deepEqual(
    result.calls.map((row) => [row.name, row.result.status]),
    [
      ['update_contact', 'read_required'],
      ['read_contact', 'ready'],
      ['update_contact', 'ready'],
      ['read_contact', 'ready'],
    ],
  );
  assert.equal(storage.applied.length, 1);
  assert.deepEqual(storage.state[0].raw_input, {
    ...original.raw_input,
    notes: 'Requested revision',
  });
  assert(
    result.audit.some(
      (row) => row.kind === 'tool_finished' && row.status === 'duplicate_call_skipped',
    ),
    'Successful identical write remains protected after rereading',
  );
});

test('Calendar retries an identical read-required write after an exact read without replaying success', async () => {
  const calendar = workerCalendars(mapSnapshot());
  const original = structuredClone(
    calendar.maps.get(calendar.calendarClient.calendarId).get(eventId),
  );
  const update = call('update_calendar_event', { eventId, title: 'Requested revision' });
  const read = call('read_calendar_event', { eventId });
  const result = await runScript(
    { googleTools: createChatCalendarTools({ client: calendar.calendarClient }) },
    [update, read, update, read, update],
  );
  assert.deepEqual(
    result.calls.map((row) => [row.name, row.result.status]),
    [
      ['update_calendar_event', 'read_required'],
      ['read_calendar_event', 'ready'],
      ['update_calendar_event', 'ready'],
      ['read_calendar_event', 'ready'],
    ],
  );
  const saved = calendar.maps.get(calendar.calendarClient.calendarId).get(eventId);
  assert.equal(saved.summary, 'Requested revision');
  assert.equal(saved.description, original.description);
  assert.deepEqual(saved.start, original.start);
  assert.deepEqual(saved.end, original.end);
  assert.equal(calendar.writes.length, 1);
  assert(
    result.audit.some(
      (row) => row.kind === 'tool_finished' && row.status === 'duplicate_call_skipped',
    ),
  );
});
