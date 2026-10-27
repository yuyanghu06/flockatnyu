import {attachTaskReads} from './fixtures/planner-followup.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createAutomationHandler } from '../server/automation/handler.js';
import { createStagedPipeline } from '../server/automation/staged-pipeline.js';
import { createBoundedResults } from '../server/automation/bounded-result.js';
import { readAutomationConfig } from '../server/automation/config.js';

const oldHandler = process.env.INITIAL_DISPOSITIONS_BASELINE;
const handlerFactory = oldHandler
  ? (await import('data:text/javascript;base64,' + Buffer.from((await readFile(oldHandler, 'utf8')).replace(/from (['"])(\.[^'"]+)\1/g, (_match, _quote, path) => `from ${JSON.stringify(new URL(path, new URL('../server/automation/handler.js', import.meta.url)).href)}`)).toString('base64'))).createAutomationHandler
  : createAutomationHandler;
const stamp = '2026-10-23T08:00:00.000Z';
const response = (...toolCalls) => ({ text: '', stopReason: 'tool_calls', toolCalls });
const finish = (id, arguments_) => ({ id, name: 'finish_batch', arguments: arguments_ });

function harness({ count = 2, covered = [1], writeCovered = [], legacy = false } = {}) {
  const source = randomUUID(), principal = { allowedSourceIds: [source] }, lease = randomUUID();
  const inputs = Array.from({ length: count }, (_, index) => ({ uuid: randomUUID(), raw_response: {
    source: 'discord', source_id: source, event_type: 'message_created', event_id: String(300 + index), revision: '1', received_at: stamp,
    payload: { id: String(300 + index), guild_id: '100', channel_id: '200', timestamp: stamp, author: { id: String(400 + index) }, content: index ? 'I will attend the event.' : 'Who is going?' },
  } }));
  const tasks = new Map(covered.map(index => {
    const uuid = randomUUID();
    return [uuid, { uuid, created_at: stamp, updated_at: stamp, expires_at: '2026-10-24T08:00:00.000Z', info: { version: 1, sourceIds: [source], inputs: [structuredClone(inputs[index])], request: { summary: 'Unfinished supported action', operation: 'source_review' }, executionHistory: [] } }];
  }));
  const coverage = writeCovered.map(index => structuredClone(inputs[index])), history = [], requests = [], validations = [], transitions = [], finishes = [], proposals = [];
  let pending = structuredClone(inputs), dispatchedReads = 0;
  const taskStore = {
    configured: true, list: async () => ({ status: 'ready', tasks: structuredClone([...tasks.values()]) }),
    save: async ({ task }) => { const saved = { ...structuredClone(task), created_at: stamp, updated_at: stamp, expires_at: '2026-10-24T08:00:00.000Z' }; tasks.set(saved.uuid, saved); return { status: 'ready', task: structuredClone(saved) }; },
    resolve: async () => ({ status: 'forbidden' }),
  };
  attachTaskReads(taskStore,tasks);
  const staged = createStagedPipeline({ taskStore, principal, fragments: createBoundedResults(), now: () => new Date(stamp), getInitialWriteCoverage: () => coverage, bindTask: async () => {}, runSync: async () => ({ status: 'ready', results: [], unresolved: [] }) });
  const pipeline = { ...staged.pipeline,
    validateInitialFinish: async args => { const result = await staged.pipeline.validateInitialFinish(args); validations.push({ handled: [...args.handledInputIds], noChange: [...args.noChangeInputIds], result: structuredClone(result) }); return result; },
    afterInitial: async args => { transitions.push([...args.handledInputIds]); return staged.pipeline.afterInitial(args); },
    recordExecution: async row => history.push(structuredClone(row)),
  };
  const store = { configured: true, claim: async () => ({ status: 'ready', leaseToken: lease, inputs: structuredClone(inputs) }), renew: async () => ({ status: 'ready' }), action: async ({ complete }) => ({ status: complete ? 'completed' : 'execute' }), release: async () => {}, fail: async () => {}, finish: async ({ handledInputIds }) => { finishes.push([...handledInputIds]); pending = pending.filter(row => !handledInputIds.includes(row.uuid)); return { status: 'ready' }; } };
  const tools = [{ name: 'read_source', description: 'Inert read', readOnly: true, parameters: { type: 'object', properties: {}, additionalProperties: false }, execute: async () => { dispatchedReads++; return { status: 'ready' }; } }];
  return { inputs, tasks, coverage, history, requests, validations, transitions, finishes, proposals, principal, pending: () => pending, reads: () => dispatchedReads,
    refs: request => legacy ? inputs.map(row => row.uuid) : JSON.parse(request.messages.findLast(row => row.role === 'user').content).referenceBindings.handledInputIds.map(row => row.ref),
    run: async steps => {
      let index = 0;
      const provider = { toolTurn: async request => { requests.push(request); const step = steps[index++]; const value = typeof step === 'function' ? await step(request) : step ?? { text: 'Pending', stopReason: 'stop', toolCalls: [] }; proposals.push(structuredClone(value)); return value; } };
      return handlerFactory({ store, provider, tools, pipeline: legacy ? undefined : pipeline, principal, authorizeEvent: async () => true, config: readAutomationConfig({ AGENT_AUTOMATION_ENABLED: 'true' }), now: () => new Date(stamp) }).tick();
    },
  };
}

test('disjoint explicit dispositions become a private claimed-order union; raw H/N stay unchanged and complete initial finish resets only visible transcript', async () => {
  const h = harness(); let raw;
  const result = await h.run([request => { const refs = h.refs(request); raw = { handledInputIds: [refs[1]], noChangeInputIds: [refs[0]] }; return response(finish('initial', raw)); }, request => { assert.equal(request.messages.length, 1); assert.match(request.system, /FOLLOWUP phase/); return response(finish('final', { handledInputIds: [] })); }]);
  assert.equal(result.status, 'completed'); assert.deepEqual(h.validations[0].handled, h.inputs.map(row => row.uuid)); assert.deepEqual(h.transitions[0], h.inputs.map(row => row.uuid)); assert.deepEqual(h.finishes[0], h.inputs.map(row => row.uuid)); assert.equal(h.pending().length, 0);
  assert.deepEqual(h.proposals[0].toolCalls[0].arguments, raw); assert.deepEqual(h.history.find(row => row.kind === 'model_result').result.toolCalls[0].arguments, raw);
});

test('old subset overlap, mixed spelling across lists and no-change-only remain explicit valid dispositions', async () => {
  for (const mode of ['old-subset', 'mixed-cross-list', 'no-change-only']) {
    const h = harness(mode === 'no-change-only' ? { count: 1, covered: [] } : {});
    const result = await h.run([request => { const refs = h.refs(request); return response(finish('initial', mode === 'no-change-only' ? { handledInputIds: [], noChangeInputIds: [refs[0]] } : mode === 'old-subset' ? { handledInputIds: [refs[1], refs[0]], noChangeInputIds: [refs[0]] } : { handledInputIds: [refs[1], refs[0]], noChangeInputIds: [h.inputs[0].uuid] })); }, response(finish('final', { handledInputIds: [] }))]);
    assert.equal(result.status, 'completed', mode); assert.deepEqual(h.validations[0].handled, h.inputs.map(row => row.uuid)); assert.equal(h.pending().length, 0);
  }
});

test('omitted originals are not inferred into union and prevent transcript reset; their exact originals remain pending', async () => {
  const h = harness();
  const result = await h.run([request => response(finish('partial', { handledInputIds: [h.refs(request)[1]] })), request => { assert(request.messages.length > 1); assert(request.messages[0].content.includes(h.inputs[0].uuid)); return response(finish('final', { handledInputIds: [] })); }]);
  assert.equal(result.status, 'completed'); assert.deepEqual(h.transitions[0], [h.inputs[1].uuid]); assert.deepEqual(h.finishes[0], [h.inputs[1].uuid]); assert.deepEqual(h.pending(), [h.inputs[0]]);
  assert([...h.tasks.values()].some(task => task.info.inputs.some(input => input.uuid === h.inputs[0].uuid)), 'Existing checkpoint behavior preserves the unhandled exact original');
});

test('canonical within-list duplicate aliases, foreign/task IDs and malformed finish bodies never reach coverage validation', async () => {
  for (const kind of ['duplicate-H', 'duplicate-N', 'foreign-H', 'foreign-N', 'task-H', 'malformed-H', 'malformed-N', 'unknown-field']) {
    const h = harness();
    const result = await h.run([request => {
      const refs = h.refs(request); let args = { handledInputIds: [refs[1]], noChangeInputIds: [refs[0]] };
      if (kind === 'duplicate-H') args.handledInputIds = [refs[1], h.inputs[1].uuid];
      if (kind === 'duplicate-N') args.noChangeInputIds = [refs[0], h.inputs[0].uuid];
      if (kind === 'foreign-H') args.handledInputIds = [randomUUID()];
      if (kind === 'foreign-N') args.noChangeInputIds = [randomUUID()];
      if (kind === 'task-H') args.handledInputIds = [[...h.tasks.keys()][0]];
      if (kind === 'malformed-H') args.handledInputIds = 'not-an-array';
      if (kind === 'malformed-N') args.noChangeInputIds = null;
      if (kind === 'unknown-field') args.extra = true;
      return response(finish('invalid', args));
    }]);
    assert(['invalid_completion', 'invalid_tool_call'].includes(result.status), kind); assert.equal(h.validations.length, 0, kind); assert.equal(h.transitions.length, 0); assert.equal(h.finishes.length, 0); assert.deepEqual(h.pending(), h.inputs);
  }
});

test('mixed finish/read proposals never apply dispositions or dispatch their bundled ordinary calls', async () => {
  const h = harness();
  const result = await h.run([request => { const refs = h.refs(request); return response(finish('mixed', { handledInputIds: [refs[1]], noChangeInputIds: [refs[0]] }), { id: 'read', name: 'read_source', arguments: { inputIds: [refs[0]], arguments: {} } }); }]);
  assert.notEqual(result.status, 'completed'); assert.equal(h.reads(), 0); assert.equal(h.validations.length, 0); assert.equal(h.finishes.length, 0); assert.deepEqual(h.pending(), h.inputs);
});

test('union does not override backend conflicts with actual task/write coverage or stale native task/write evidence', async () => {
  for (const mode of ['task-conflict', 'write-conflict', 'stale-task', 'changed-write']) {
    const h = harness(mode === 'write-conflict' || mode === 'changed-write' ? { covered: [], writeCovered: [1] } : {});
    const result = await h.run([request => {
      const refs = h.refs(request);
      if (mode === 'stale-task') [...h.tasks.values()][0].updated_at = '2026-10-23T08:00:01.000Z';
      if (mode === 'changed-write') h.coverage[0].raw_response.payload.content = 'Different original';
      return response(finish('initial', { handledInputIds: [refs[1]], noChangeInputIds: mode.endsWith('conflict') ? [refs[0], refs[1]] : [refs[0]] }));
    }]);
    assert.equal(h.validations.length,mode==='task-conflict'?0:1,mode);if(mode!=='task-conflict'){assert.deepEqual(h.validations[0].handled,h.inputs.map(row=>row.uuid));assert.equal(h.validations[0].result.status,mode==='write-conflict'?'invalid_request':'pending',mode);}else assert.equal(result.status,'invalid_tool_call','Conflicting no-change/task dispositions are rejected before validation');
    assert.notEqual(result.status, 'completed'); assert.equal(h.transitions.length, 0); assert.equal(h.finishes.length, 0); assert.deepEqual(h.pending(), h.inputs);
  }
});

test('legacy and follow-up do not gain the initial no-change union contract', async () => {
  const legacy = harness({ legacy: true });
  assert.equal((await legacy.run([() => response(finish('legacy', { handledInputIds: [legacy.inputs[1].uuid], noChangeInputIds: [legacy.inputs[0].uuid] }))])).status, 'invalid_tool_call');
  assert.equal(legacy.finishes.length, 0);
  const h = harness();
  const result = await h.run([request => { const refs = h.refs(request); return response(finish('initial', { handledInputIds: refs, noChangeInputIds: [refs[0]] })); }, request => response(finish('followup', { handledInputIds: [], noChangeInputIds: [h.refs(request)[0]] }))]);
  assert.equal(result.status, 'invalid_tool_call'); assert.equal(h.finishes.length, 0); assert.deepEqual(h.pending(), h.inputs);
});
