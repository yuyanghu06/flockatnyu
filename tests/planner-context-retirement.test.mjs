import test from 'node:test';
import assert from 'node:assert/strict';
import { compactConversation } from '../server/automation/conversation-context.js';

const closed = '10000000-0000-4000-8000-000000000001';
const open = '10000000-0000-4000-8000-000000000002';
const bindings = {
  phase: 'followup',
  inputIds: [
    { ref: 't_11111111_1', uuid: closed },
    { ref: 't_11111111_2', uuid: open },
  ],
  handledInputIds: [],
};
function fixture({ shared = false, resolved = true, remaining = false } = {}) {
  const result = {
    status: 'ready',
    sourceStatus: 'ready',
    sources: [
      {
        url: 'https://discord.com/channels/100/200/301',
        excerpt: 'Exact observed facts. '.repeat(1500),
      },
    ],
    coverage: { complete: true },
  };
  const messages = [
    {
      role: 'assistant',
      content: 'Read source.',
      toolCalls: [
        {
          id: 'read',
          name: 'read_discord_messages',
          arguments: { inputIds: [closed], arguments: { url: result.sources[0].url } },
        },
      ],
    },
    { role: 'tool', toolCallId: 'read', content: JSON.stringify(result) },
  ];
  const executionLog = [
    {
      kind: 'tool_result',
      stage: 'followup',
      tool: 'read_discord_messages',
      callId: 'read',
      inputIds: [closed],
      arguments: { url: result.sources[0].url },
      result,
    },
  ];
  if (resolved)
    executionLog.push({
      kind: 'tool_result',
      stage: 'followup',
      tool: 'resolve_pending_task',
      callId: 'resolved',
      inputIds: [closed],
      arguments: { taskId: closed, outcome: 'no_change_needed' },
      result: { status: 'ready' },
    });
  const snapshot = {
    status: 'ready',
    phase: 'followup',
    catalogue: remaining ? [{ taskId: closed }] : [],
    tasks: shared
      ? [
          {
            taskId: open,
            compactDisclosed: true,
            updatedAt: '2026-10-28T15:00:00Z',
            compact: { task: { info: { sourceUrl: result.sources[0].url } } },
          },
        ]
      : [],
    fragments: [],
    historyPages: [],
  };
  return { messages, executionLog, snapshot, referenceBindings: bindings, phase: 'followup' };
}

test('confirmed uniquely resolved reads retire below the normal compaction threshold without changing private evidence', () => {
  const data = fixture(),
    before = structuredClone(data);
  const compacted = compactConversation(data);
  assert(compacted.beforeBytes < 196608);
  assert(compacted.afterBytes < compacted.beforeBytes / 10);
  assert.equal(compacted.retiredResults, 1);
  assert.equal(JSON.parse(compacted.messages[1].content).reason, 'resolved_task_read');
  assert.deepEqual(
    compacted.messages[0],
    data.messages[0],
    'Assistant/tool identities and proposals remain intact',
  );
  assert.deepEqual(data, before);
  const again = compactConversation({ ...data, messages: compacted.messages });
  assert.equal(again.compacted, false);
  assert.deepEqual(again.messages, compacted.messages);
});

test('small conversations preserve shared unfinished evidence, unresolved tasks, failed resolution and partial source results', () => {
  for (const option of [
    { shared: true },
    { resolved: false },
    { remaining: true },
    { failure: true },
    { partial: true },
    { mismatched: true },
  ]) {
    const data = fixture(option);
    if (option.failure) data.executionLog.at(-1).result.status = 'conflict';
    if (option.partial) {
      data.executionLog[0].result.partial = true;
      data.messages[1].content = JSON.stringify(data.executionLog[0].result);
    }
    if (option.mismatched)
      data.messages[1].content = JSON.stringify({
        ...data.executionLog[0].result,
        extra: 'Unmatched result body must remain',
      });
    const compacted = compactConversation(data);
    assert.equal(compacted.compacted, false, JSON.stringify(option));
    assert.deepEqual(compacted.messages, data.messages);
  }
});

function calendarFixture(request, tool = 'read_calendar_event') {
  const data = fixture();
  data.snapshot.catalogue.push({ taskId: open, request });
  const args =
    tool === 'list_calendar_events'
      ? { start: '2026-10-28T00:00:00Z', end: '2026-10-29T00:00:00Z' }
      : tool === 'read_map_events'
        ? {
            sourceId: '20000000-0000-4000-8000-000000000001',
            sourceRecordId: 'shared_calendar_event',
          }
        : { eventId: 'shared_calendar_event' };
  const result = {
    status: 'ready',
    events: [
      { eventId: 'shared_calendar_event', description: 'Saved Calendar facts. '.repeat(300) },
    ],
    coverage: { complete: true },
  };
  Object.assign(data.executionLog[0], { tool, arguments: args, result });
  Object.assign(data.messages[0].toolCalls[0], {
    name: tool,
    arguments: { inputIds: [closed], arguments: args },
  });
  data.messages[1].content = JSON.stringify(result);
  return data;
}

test('undisclosed pending Calendar targets preserve shared read facts in small and full compaction', () => {
  for (const triggerBytes of [196608, 0]) {
    const data = calendarFixture({
      operation: 'participation',
      calendarKind: 'club',
      calendarEventId: 'shared_calendar_event',
    });
    const before = structuredClone(data);
    const compacted = compactConversation({ ...data, triggerBytes });
    assert.deepEqual(
      JSON.parse(compacted.messages.find((message) => message.toolCallId === 'read').content),
      data.executionLog[0].result,
    );
    assert.deepEqual(data, before);
  }
});

test('unknown or partial pending targets and broad reads cannot establish independent facts', () => {
  for (const request of [
    undefined,
    {},
    { operation: 'participation' },
    { calendarKind: 'club' },
    { calendarEventId: 'different_event' },
    { calendarKind: 'club', calendarEventId: '' },
  ]) {
    const data = calendarFixture(request),
      compacted = compactConversation(data);
    assert.equal(compacted.compacted, false, JSON.stringify(request));
    assert.deepEqual(compacted.messages, data.messages);
  }
  for (const tool of ['list_calendar_events', 'read_map_events']) {
    const data = calendarFixture(
      { calendarKind: 'club', calendarEventId: 'different_event' },
      tool,
    );
    assert.equal(compactConversation(data).compacted, false, tool);
  }
  const source = fixture();
  source.snapshot.catalogue.push({
    taskId: open,
    request: { calendarKind: 'club', calendarEventId: 'different_event' },
  });
  assert.equal(
    compactConversation(source).compacted,
    false,
    'Calendar hints cannot prove that another task does not need a Discord original',
  );
  const partial = fixture();
  partial.snapshot.fragments.push({ taskId: open, id: 'pending-fragment', complete: false });
  assert.equal(
    compactConversation(partial).compacted,
    false,
    'An undisclosed partial task is unfinished work too',
  );
});

test('clearly different narrow pending Calendar targets still permit unique closed reads to retire', () => {
  const data = calendarFixture({
    operation: 'participation',
    calendarKind: 'club',
    calendarEventId: 'different_event',
  });
  const compacted = compactConversation(data);
  assert.equal(compacted.retiredResults, 1);
  assert(compacted.afterBytes < compacted.beforeBytes / 5);
  assert.equal(JSON.parse(compacted.messages[1].content).reason, 'resolved_task_read');
});
