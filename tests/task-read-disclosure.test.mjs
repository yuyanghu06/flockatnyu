import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createStagedPipeline } from '../server/automation/staged-pipeline.js';
import { createBoundedResults } from '../server/automation/bounded-result.js';
import { canonicalJson } from '../server/automation/validation.js';

// An optional immutable old source makes the observed failure reproducible
// without changing the current application or weakening the assertions.
const factory = process.env.TASK_READ_DISCLOSURE_BASELINE
  ? (await import('data:text/javascript;base64,' + Buffer.from(
    (await readFile(process.env.TASK_READ_DISCLOSURE_BASELINE, 'utf8')).replace(
      /from (['"])(\.[^'"]+)\1/g,
      (_match, _quote, path) => `from ${JSON.stringify(new URL(path, new URL('../server/automation/staged-pipeline.js', import.meta.url)).href)}`,
    ),
  ).toString('base64'))).createStagedPipeline
  : createStagedPipeline;
const stamp = '2026-10-23T08:00:00.000Z';

function fixture({ large = true, bindFailure = false } = {}) {
  const source = randomUUID(), person = randomUUID(), inputId = randomUUID(), taskId = randomUUID();
  const original = { uuid: inputId, raw_response: {
    source: 'discord', source_id: source, event_type: 'message_created', event_id: '300', revision: '1', received_at: stamp,
    payload: { id: '300', guild_id: '100', channel_id: '200', timestamp: stamp, author: { id: '400' }, content: 'I will attend the entire workshop.' },
  } };
  const task = { uuid: taskId, created_at: stamp, updated_at: stamp, expires_at: '2026-10-24T08:00:00.000Z', info: {
    version: 1, sourceIds: [source], inputs: [original], references: [{ sourceId: source, sourceUrl: 'https://discord.com/channels/100/200/300' }],
    request: { summary: 'Attend the existing workshop', operation: 'participation', calendarKind: 'club', calendarEventId: 'workshop123', personId: person },
    batchContext: { sourceNotes: large ? 'Original context🙂漢字"\\'.repeat(1600) : 'Original context' },
    executionHistory: [{ kind: 'model_result', result: { text: 'Previous interpretation remains private and complete' } }],
  } };
  const rows = new Map([[taskId, structuredClone(task)]]), history = [], bindings = [], storeCalls = [];
  const principal = { allowedSourceIds: [source] };
  let clock = stamp, version = 0, failBind = bindFailure, transformSave = row => row;
  const fragments = createBoundedResults({ maxBytes: 4 * 1048576, maxEntries: 128 });
  const store = {
    configured: true,
    list: async () => ({ status: 'ready', tasks: structuredClone([...rows.values()]) }),
    save: async args => {
      storeCalls.push({ method: 'save', args: structuredClone(args) });
      const prior = rows.get(args.task.uuid);
      if (prior && prior.updated_at !== args.expectedUpdatedAt) return { status: 'conflict' };
      const saved = transformSave({ ...structuredClone(args.task), created_at: prior.created_at, expires_at: prior.expires_at, updated_at: `2026-10-23T08:00:${String(++version).padStart(2, '0')}.000Z` });
      rows.set(saved.uuid, structuredClone(saved));
      return { status: 'ready', task: structuredClone(saved) };
    },
    resolve: async args => {
      storeCalls.push({ method: 'resolve', args: structuredClone(args) });
      if (rows.get(args.taskId)?.updated_at !== args.expectedUpdatedAt) return { status: 'conflict' };
      rows.delete(args.taskId); return { status: 'ready' };
    },
  };
  const staged = factory({ taskStore: store, principal, fragments, now: () => new Date(clock), runSync: async () => ({ status: 'ready', results: [], unresolved: [] }), bindTask: async row => {
    if (failBind) throw Error('Synthetic bind failure');
    bindings.push(structuredClone(row));
  } });
  const context = { principal, inputIds: [taskId] };
  const call = async (name, args, extra = {}) => {
    const ctx = { ...context, ...extra };
    const value = name === 'read_context_fragment'
      ? await staged.readTaskFragment(args, ctx, (a, c) => fragments.tool.execute(a, c))
      : await staged.tools.find(tool => tool.name === name).execute(args, ctx);
    history.push({ kind: 'tool_result', stage: staged.phase, tool: name, inputIds: ctx.inputIds, arguments: structuredClone(args), result: structuredClone(value) });
    return value;
  };
  const read = extra => call('read_pending_task', { taskId }, extra);
  const full = async first => {
    first ??= await read();
    if (!first.fragment) return first;
    let part = first, text = '';
    while (true) {
      text += part.fragment.data;
      if (part.fragment.nextOffset === null) break;
      part = await call('read_context_fragment', { id: part.fragment.id, offset: part.fragment.nextOffset });
      assert.equal(part.status, 'ready');
    }
    return JSON.parse(text);
  };
  const begin = () => staged.pipeline.beginCycle({ leaseToken: randomUUID(), inputs: [original], recordExecution: async row => history.push(row), getExecutionLog: () => structuredClone(history) });
  const after = () => staged.pipeline.afterInitial({ handledInputIds: [inputId], inputs: [original], executionLog: structuredClone(history) });
  return { staged, task, rows, history, bindings, storeCalls, principal, fragments, context, taskId, inputId, person, call, read, full, begin, after,
    setClock: value => { clock = value; }, setBindFailure: value => { failBind = value; }, setSaveTransform: value => { transformSave = value; } };
}
const compactNotice = 'This exact task snapshot was fully read earlier in this phase. Reuse its earlier full data; no new read/action proof.';

test('repeat of an actually delivered exact snapshot reuses data without rebinding, editing storage or granting completion', async () => {
  const h = fixture(); await h.begin(); await h.after();
  assert.deepEqual((await h.full()).task, h.task);
  const stored = canonicalJson(h.rows.get(h.taskId)), beforeBindings = h.bindings.length;
  const expected = { status: 'ready', alreadyRead: true, taskId: h.taskId, updated_at: stamp, request: Object.fromEntries(Object.entries(h.task.info.request).filter(([key]) => ['operation', 'calendarKind', 'calendarEventId', 'personId', 'buildingId'].includes(key))), notice: compactNotice };
  assert.deepEqual(await h.read(), expected);
  assert.equal(Object.hasOwn(expected.request, 'summary'), false, 'Repeated metadata does not duplicate the fully delivered summary');
  assert.equal(h.bindings.length, beforeBindings, 'Known disclosure must not grant a new bind/read proof');
  assert.equal(canonicalJson(h.rows.get(h.taskId)), stored, 'Originals/full history and every saved field remain unchanged');
  assert.equal((await h.call('resolve_pending_task', { taskId: h.taskId, outcome: 'completed' })).status, 'invalid_request');
  assert.equal(h.rows.size, 1); assert.equal(h.storeCalls.length, 0);
  h.history.push({ kind: 'tool_result', tool: 'upsert_map_event', inputIds: [h.taskId], arguments: { event: { source_record_id: 'workshop123' }, people: [{ person_id: h.person }] }, result: { status: 'ready', eventId: 'workshop123' } });
  assert.deepEqual(await h.read(), expected);
  assert.equal((await h.call('resolve_pending_task', { taskId: h.taskId, outcome: 'completed' })).status, 'ready', 'Earlier action proof survives a repeated data read');
});

test('partial chains and bypassed fragments never establish actual delivery; successful full chain does', async () => {
  const h = fixture(); await h.begin(); await h.after();
  const first = await h.read(); assert(first.fragment);
  let part = first;
  while (part.fragment.nextOffset !== null) part = await h.fragments.tool.execute({ id: part.fragment.id, offset: part.fragment.nextOffset });
  assert.equal(h.bindings.length, 0, 'Raw fragment retrieval bypasses the owning-task delivery receipt');
  const repeated = await h.read(); assert(repeated.fragment); assert.equal(repeated.alreadyRead, undefined);
  const wrongOffset = await h.call('read_context_fragment', { id: repeated.fragment.id, offset: repeated.fragment.nextOffset + 1 });
  assert.equal(wrongOffset.status, 'invalid_request');
  assert.deepEqual((await h.full(repeated)).task, h.task);
  assert.equal((await h.read()).alreadyRead, true);
});

test('version, same-version content, and expiry changes require complete current data, never stale snapshot reuse', async () => {
  for (const change of ['version', 'same-version-content', 'same-version-expiry']) {
    const h = fixture(); await h.begin(); await h.after(); await h.full();
    if (change !== 'version') h.setSaveTransform(row => ({ ...row, updated_at: stamp, ...(change === 'same-version-expiry' ? { expires_at: '2026-10-24T09:00:00.000Z' } : {}) }));
    const request = { ...h.task.info.request, ...(change === 'same-version-content' ? { summary: 'Leave after the first hour' } : {}) };
    assert.equal((await h.call('defer_task', { taskId: h.taskId, ...request })).status, 'ready');
    const next = await h.read(); assert(next.fragment || next.task, `${change} must disclose full current data`); assert.equal(next.alreadyRead, undefined);
    assert.deepEqual((await h.full(next)).task, h.rows.get(h.taskId));
    assert.equal((await h.read()).alreadyRead, true);
  }
});

test('scope, principal, abort, expiry and phase/cycle boundaries cannot reuse a private disclosure marker', async () => {
  const h = fixture(); await h.begin(); await h.full();
  await h.after(); assert((await h.read()).fragment, 'Initial-phase delivery is not follow-up delivery'); await h.full();
  assert.equal((await h.read({ inputIds: [randomUUID()] })).status, 'invalid_request');
  assert.equal((await h.read({ principal: { ...h.principal } })).status, 'forbidden');
  const controller = new AbortController(); controller.abort(); assert.equal((await h.read({ signal: controller.signal })).status, 'forbidden');
  h.setClock('2026-10-24T08:00:00.000Z'); assert.equal((await h.read()).status, 'forbidden'); h.setClock(stamp);
  await h.begin(); await h.after(); assert((await h.read()).fragment, 'New cycle must disclose full task again'); await h.full();
  h.principal.allowedSourceIds = []; assert.equal((await h.read()).status, 'forbidden');
});

test('failed bind does not mark a small fully serialized task as reusable', async () => {
  const h = fixture({ large: false, bindFailure: true }); await h.begin(); await h.after();
  await assert.rejects(h.read(), /Synthetic bind failure/);
  h.setBindFailure(false); const full = await h.read(); assert.deepEqual(full.task, h.task); assert.equal(full.alreadyRead, undefined);
  assert.equal((await h.read()).alreadyRead, true); assert.equal(h.bindings.length, 1);
});

test('executed but unlogged data never counts as model-visible delivery', async () => {
  const h = fixture({ large: false }); await h.begin(); await h.after();
  const tool = h.staged.tools.find(row => row.name === 'read_pending_task');
  const first = await tool.execute({ taskId: h.taskId }, h.context);
  assert.deepEqual(first.task, h.task);
  const unloggedRepeat = await tool.execute({ taskId: h.taskId }, h.context);
  assert.deepEqual(unloggedRepeat.task, h.task); assert.equal(unloggedRepeat.alreadyRead, undefined);
  h.history.push({ kind: 'tool_result', stage: 'followup', tool: 'read_pending_task', inputIds: [h.taskId], arguments: { taskId: h.taskId }, result: structuredClone(first) });
  assert.equal((await h.read()).alreadyRead, true);
});

test('tampered, incomplete or foreign-phase delivery history cannot qualify for reuse', async () => {
  for (const defect of ['missing-piece', 'foreign-phase', 'foreign-scope', 'changed-data']) {
    const h = fixture(); await h.begin(); await h.after(); await h.full();
    const last = h.history.at(-1);
    if (defect === 'missing-piece') h.history.pop();
    if (defect === 'foreign-phase') last.stage = 'initial';
    if (defect === 'foreign-scope') last.inputIds = [randomUUID()];
    if (defect === 'changed-data') last.result.fragment.data += 'altered';
    const read = await h.read(); assert.equal(read.alreadyRead, undefined, defect); assert(read.fragment, defect);
    assert.deepEqual(h.rows.get(h.taskId), h.task, 'Delivery-history rejection does not edit saved source data');
  }
});
