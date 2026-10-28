import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createProvider } from '../server/providers/index.js';
import { plannerCacheRequest } from '../server/providers/planner-cache.js';
import { buildAutomationPrompt } from '../server/automation/prompt.js';
import { readConfig } from '../server/shared/config.js';
import { createAutomationHandler } from '../server/automation/handler.js';
import { readAutomationConfig } from '../server/automation/config.js';
import {
  selectedFixture,
  input,
  task,
  preserveBusinessState,
} from './fixtures/planner-selected-fixes.mjs';

const config = readConfig({
  LLM_PROVIDER: 'openai-compatible',
  LLM_MODEL: 'gpt-6-luna',
  LLM_API_KEY: 'synthetic-key',
});
const context = { agent: 'planner', runId: randomUUID(), round: 1 };
const prompt = (now) =>
  buildAutomationPrompt({ phase: 'followup', now, timezone: 'America/New_York' });
const response = (toolCalls) =>
  Response.json({
    choices: [
      {
        finish_reason: toolCalls.length ? 'tool_calls' : 'stop',
        message: { role: 'assistant', content: '', tool_calls: toolCalls },
      },
    ],
  });
const toolCall = (name, id, args) => ({
  id,
  type: 'function',
  function: { name, arguments: JSON.stringify(args) },
});
function tools(tag) {
  const refs = [`t_${tag}_1`];
  return [
    {
      name: 'read_pending_task',
      description: 'Read an exact saved task.',
      parameters: {
        type: 'object',
        properties: {
          inputIds: {
            type: 'array',
            items: { type: 'string', minLength: 1, maxLength: 64, enum: [...refs] },
          },
          arguments: {
            type: 'object',
            properties: {
              taskId: { type: 'string', enum: [...refs] },
              category: { type: 'string', enum: ['study', 'meeting'] },
            },
          },
        },
      },
    },
    {
      name: 'finish_batch',
      parameters: {
        type: 'object',
        properties: {
          handledInputIds: { type: 'array', items: { type: 'string', enum: [`q_${tag}_1`] } },
          noChangeInputIds: {
            type: 'array',
            maxItems: 0,
            items: { type: 'string', enum: [`q_${tag}_1`] },
          },
        },
      },
    },
  ];
}

test('equivalent planner runs reuse wire instructions and schemas while retaining each trusted clock', async () => {
  const requests = [];
  const provider = createProvider(config, {
    fetchImpl: async (_url, init) => {
      requests.push(JSON.parse(init.body));
      return response([]);
    },
  });
  for (const [tag, now] of [
    ['11111111', '2026-10-28T15:00:00Z'],
    ['22222222', '2026-10-28T15:05:00Z'],
  ]) {
    const definitions = tools(tag),
      before = structuredClone(definitions);
    await provider.toolTurn({
      system: prompt(now),
      tools: definitions,
      messages: [{ role: 'user', content: `Task binding t_${tag}_1` }],
      auditContext: context,
    });
    assert.deepEqual(
      definitions,
      before,
      'Wire normalization never changes private request schemas',
    );
  }
  assert.deepEqual(requests[0].tools, requests[1].tools);
  assert.deepEqual(requests[0].messages[0], requests[1].messages[0]);
  assert.deepEqual(requests[0].messages[0].content[0].prompt_cache_breakpoint, {
    mode: 'explicit',
  });
  assert.match(requests[0].messages[1].content, /2026-10-28T15:00:00.000Z/);
  assert.match(requests[1].messages[1].content, /2026-10-28T15:05:00.000Z/);
  assert.equal(requests[1].messages[1].role, 'system');
  assert(!requests[0].messages[0].content[0].text.includes('2026-10-28T15:00'));
  assert.deepEqual(
    requests[0].tools[0].function.parameters.properties.arguments.properties.category.enum,
    ['study', 'meeting'],
  );
  assert.equal(requests[0].max_completion_tokens, 2048);
  assert.equal(requests[0].reasoning_effort, 'none');
  assert(!requests[0].prompt_cache_options, 'Useful implicit caching remains enabled by default');
});

test('chat, unsupported models, alternate hosts and legacy prompts retain existing wire contracts', () => {
  const base = {
    config,
    auditContext: context,
    system: prompt('2026-10-28T15:00:00Z'),
    messages: [],
    tools: [],
  };
  for (const changed of [
    { auditContext: { ...context, agent: 'chat' } },
    { config: { ...config, model: 'unknown-model' } },
    { config: { ...config, baseUrl: 'https://proxy.example/v1' } },
    { config: { ...config, provider: 'anthropic' } },
    { system: 'Legacy system without staged clock suffix' },
  ])
    assert.equal(plannerCacheRequest({ ...base, ...changed }), null);
});

test('stable OpenAI wire schemas do not authorize a foreign task reference in the real runner', async () => {
  const own = input(1, { content: 'Thanks for sharing!' });
  const pending = task(1, {
    current: true,
    operation: 'source_review',
    original: own,
    large: false,
  });
  const fixture = selectedFixture({ pending: [pending] });
  const before = structuredClone(fixture.tasks.get(pending.uuid));
  let calls = 0;
  const provider = createProvider(config, {
    fetchImpl: async (_url, init) => {
      const body = JSON.parse(init.body);
      const bindings = body.messages
        .flatMap((message) => {
          if (message.role !== 'user' || typeof message.content !== 'string') return [];
          try {
            const value = JSON.parse(message.content);
            return value.referenceBindings ? [value.referenceBindings] : [];
          } catch {
            return [];
          }
        })
        .at(-1);
      calls++;
      if (calls === 1)
        return response([
          toolCall('finish_batch', 'initial', {
            handledInputIds: bindings.handledInputIds.map((row) => row.ref),
          }),
        ]);
      if (calls === 2) {
        const schema = body.tools.find((tool) => tool.function.name === 'read_pending_task')
          .function.parameters;
        assert(!schema.properties.inputIds.items.enum);
        return response([
          toolCall('read_pending_task', 'foreign', {
            inputIds: ['t_ffffffff_999'],
            arguments: { taskId: 't_ffffffff_999' },
          }),
        ]);
      }
      assert.equal(calls, 3);
      assert(
        body.messages.some(
          (message) =>
            message.role === 'tool' &&
            message.tool_call_id === 'foreign' &&
            JSON.parse(message.content).status === 'tool_error',
        ),
      );
      return response([toolCall('finish_batch', 'final', { handledInputIds: [] })]);
    },
  });
  const result = await fixture.run(provider);
  assert.equal(result.status, 'completed');
  assert.equal(calls, 3);
  assert(!fixture.tools.some((row) => row.name === 'read_pending_task'));
  assert.deepEqual(fixture.tasks.get(pending.uuid), before);
  preserveBusinessState(fixture);
});

function attemptRunner({
  marker = 'ready',
  checkpoint = 'ready',
  finalization = 'ready',
  readStatus = 'ready',
  abort,
} = {}) {
  const source = randomUUID(),
    taskId = randomUUID(),
    queueId = randomUUID(),
    leaseToken = randomUUID();
  const events = [],
    snapshots = [];
  const original = {
    uuid: queueId,
    raw_response: {
      source: 'discord',
      source_id: source,
      event_type: 'message_created',
      event_id: '300',
      revision: '1',
      received_at: '2026-10-28T15:00:00Z',
      payload: { content: 'Synthetic task' },
    },
  };
  const proposal = (id, name, args) => ({
    text: '',
    stopReason: 'tool_calls',
    toolCalls: [{ id, name, arguments: args }],
  });
  let round = 0;
  const provider = {
    toolTurn: async (request) => {
      events.push(`model:${++round}`);
      snapshots.push(request);
      if (round === 1) return proposal('initial', 'finish_batch', { handledInputIds: [queueId] });
      if (round === 2)
        return proposal('read', 'read_pending_task', { inputIds: [taskId], arguments: { taskId } });
      return proposal('final', 'finish_batch', { handledInputIds: [] });
    },
  };
  const pipeline = {
    beginCycle: async () => {},
    afterInitial: async () => ({ status: 'ready', inputIds: [taskId], context: {} }),
    finishCycle: async () => {
      events.push('checkpoint');
      return { status: checkpoint };
    },
    recordTaskAttempt: async (args) => {
      assert.equal(args.taskId, taskId);
      events.push('marker');
      return { status: marker };
    },
    finishAttempt: async (args) => {
      events.push(`finalize:${args.outcome}`);
      assert.equal(args.signal.aborted, false);
      return { status: finalization };
    },
  };
  const store = {
    claim: async () => ({ status: 'ready', leaseToken, inputs: [original] }),
    renew: async () => ({ status: 'ready' }),
    finish: async () => {
      events.push('finish');
      return { status: 'ready' };
    },
    fail: async (args) => {
      events.push(`fail:${args.outcome}`);
      return { status: 'ready' };
    },
    release: async () => {
      events.push('release');
      return { status: 'ready' };
    },
  };
  const tool = {
    name: 'read_pending_task',
    description: 'Read saved task data.',
    readOnly: true,
    parameters: {
      type: 'object',
      properties: { taskId: { type: 'string' } },
      required: ['taskId'],
      additionalProperties: false,
    },
    execute: async () => {
      events.push('read');
      abort?.abort();
      return { status: readStatus, task: { uuid: taskId } };
    },
  };
  const config = readAutomationConfig({
    AGENT_AUTOMATION_ENABLED: 'true',
    AGENT_AUTOMATION_MAX_RUN_MS: '600000',
  });
  const handler = createAutomationHandler({
    store,
    provider,
    pipeline,
    tools: [tool],
    config,
    principal: { id: 'synthetic', allowedSourceIds: [source] },
    authorizeEvent: async () => true,
    now: () => new Date('2026-10-28T15:00:00Z'),
  });
  return { events, snapshots, run: () => handler.tick({ signal: abort?.signal }) };
}

test('task attempt marker precedes model delivery and successful finalization precedes lease release', async () => {
  const runner = attemptRunner();
  assert.equal((await runner.run()).status, 'completed');
  assert.deepEqual(runner.events, [
    'model:1',
    'model:2',
    'read',
    'marker',
    'model:3',
    'checkpoint',
    'finalize:completed',
    'finish',
  ]);
  assert(
    runner.snapshots[2].messages.some(
      (message) => message.role === 'tool' && message.toolCallId === 'read',
    ),
  );
});

test('failed durable markers and checkpoints stop paid continuation but finalize before failure accounting', async () => {
  for (const option of [
    { marker: 'unavailable' },
    { checkpoint: 'unavailable' },
    { finalization: 'unavailable' },
  ]) {
    const runner = attemptRunner(option),
      result = await runner.run();
    assert.equal(result.status, 'preflight_failed', JSON.stringify(option));
    assert(!runner.events.includes('finish'));
    assert(
      runner.events.indexOf('finalize:preflight_failed') <
        runner.events.indexOf('fail:preflight_failed'),
    );
    if (option.marker)
      assert(
        !runner.events.includes('model:3'),
        'Unreadable durable marker cannot become an ordinary tool error followed by another paid turn',
      );
  }
});

test('caller cancellation preserves its outcome and finalizes retry metadata with a fresh signal', async () => {
  const abort = new AbortController(),
    runner = attemptRunner({ abort });
  const result = await runner.run();
  assert.equal(result.status, 'aborted');
  assert(runner.events.includes('finalize:aborted'));
  assert(runner.events.indexOf('finalize:aborted') < runner.events.indexOf('release'));
  assert(!runner.events.includes('fail:aborted'));
});

test('ordinary failed saved-task reads never create markers and retain later model turns', async () => {
  for (const readStatus of ['forbidden', 'unavailable', 'not_found']) {
    const runner = attemptRunner({ readStatus, marker: 'stale' });
    assert.equal((await runner.run()).status, 'completed');
    assert(!runner.events.includes('marker'));
    assert(runner.events.includes('model:3'));
    assert(
      runner.snapshots[2].messages.some(
        (message) =>
          message.role === 'tool' &&
          message.toolCallId === 'read' &&
          JSON.parse(message.content).status === 'tool_error',
      ),
    );
  }
});
