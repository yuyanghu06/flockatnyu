import test from 'node:test';
import {
  readName,
  writeName,
  deferred,
  sessionFor,
  boundRequest,
  preparedService,
} from './fixtures/operation-api.mjs';
import assert from 'node:assert/strict';
import { OPERATIONS } from '../server/operation-api/catalogue.js';
import { createOperationApp } from '../server/operation-api/app.js';
import { createOperationSession } from '../server/operation-api/session.js';
import { consumeOutcome } from '../server/operation-api/invocation.js';
import {
  bindOperationApi,
  bindWorkerOperations,
  resetWorkerOperations,
  executeAdapterOperation,
  resetOperationApi,
} from '../server/operation-api/adapter.js';
import { OPERATION_BODY_BYTES } from '../server/operation-api/dispatch.js';
import { createApp } from '../server/runtime/app.js';
import { readConfig } from '../server/shared/config.js';

test('all 54 named tools cross their actual Hono endpoint once with JSON arguments and private caller context', async () => {
  const calls = [];
  const principal = { id: 'fixture-user', allowedSourceIds: ['source-a'] };
  const lease = { opaque: Symbol('lease') };
  const controller = new AbortController();
  const session = createOperationSession({
    tools: Object.keys(OPERATIONS).map((name) => ({ name })),
    async execute(input) {
      calls.push(input);
      assert.equal(input.principal, principal);
      assert.equal(input.lease, lease);
      assert.equal(input.signal, controller.signal);
      return { status: 'ready', name: input.name, args: input.arguments };
    },
  });
  const args = { nested: [{ text: 'test 🐦', number: 7, missing: null }], enabled: false };
  for (const name of Object.keys(OPERATIONS)) {
    const before = calls.length;
    const result = await session.invoke(name, args, {
      principal,
      lease,
      signal: controller.signal,
    });
    assert.deepEqual(result.value, { status: 'ready', name, args });
    assert.equal(calls.length, before + 1, name);
    assert.notEqual(
      calls.at(-1).arguments,
      args,
      'Service receives parsed JSON, not original args',
    );
  }
  assert.equal(calls.length, 54);
  assert.equal((await session.invoke('invented_tool', {})).value.status, 'invalid_request');
  assert.equal(calls.length, 54);
});

test('unbound, cloned, wrong-owner, wrong-operation and replayed Requests never dispatch', async () => {
  const app = createOperationApp();
  let calls = 0;
  const invoke = async () => {
    calls++;
    return { value: { status: 'ready' } };
  };
  const unbound = new Request('http://operations.example.test' + OPERATIONS[readName].path, {
    method: 'POST',
    body: '{"arguments":{},"principal":{"id":"forged"}}',
  });
  assert.equal((await app.fetch(unbound, { operationOwner: { epoch: 0 } })).status, 403);
  const clone = boundRequest(app, { invoke });
  assert.equal(
    (await app.fetch(clone.request.clone(), { operationOwner: clone.owner })).status,
    403,
  );
  assert.equal((await clone.run()).status, 200);
  assert.equal((await clone.run()).status, 403);
  assert.equal((await boundRequest(app, { invoke, envOwner: { epoch: 0 } }).run()).status, 403);
  assert.equal(
    (await boundRequest(app, { invoke, path: OPERATIONS[writeName].path }).run()).status,
    403,
  );
  assert.equal(calls, 1);
});

test('public app does not mount private operation routes even for an authenticated principal', async () => {
  const app = createApp({
    config: readConfig({}),
    provider: {},
    audit: {},
    auth: async () => ({ id: 'fixture-user', allowedSourceIds: [] }),
  });
  for (const operation of Object.values(OPERATIONS)) {
    const response = await app.request(operation.path, {
      method: 'POST',
      body: '{"arguments":{}}',
    });
    assert.equal(response.status, 404, operation.path);
  }
});

test('malformed/extra-key envelopes and oversized bodies are rejected before domain execution', async () => {
  const app = createOperationApp();
  let calls = 0;
  const invoke = async () => {
    calls++;
    return { value: null };
  };
  for (const body of [
    '{',
    'null',
    '[]',
    '{}',
    '{"arguments":{},"principal":{}}',
    '{"arguments":{},"phase":"invented"}',
    '{"arguments":{},"preparation":1}',
    '{"arguments":{},"missingArguments":true}',
  ]) {
    const response = await boundRequest(app, { body, invoke }).run();
    assert.equal(response.status, 400, body);
    assert.equal((await response.json()).kind, 'rejected');
  }
  const response = await boundRequest(app, {
    body: JSON.stringify({ arguments: 'x'.repeat(OPERATION_BODY_BYTES) }),
    invoke,
  }).run();
  assert.equal(response.status, 413);
  assert.equal(calls, 0);
});

test('arguments that JSON would erase, reinterpret or execute cannot reach a write', async () => {
  let writes = 0,
    getterReads = 0;
  const session = sessionFor(writeName, async () => {
    writes++;
    return { status: 'ready' };
  });
  const cyclic = {};
  cyclic.self = cyclic;
  const getter = Object.defineProperty({}, 'value', {
    enumerable: true,
    get() {
      getterReads++;
      return 1;
    },
  });
  const invalid = [
    { value: undefined },
    { value: NaN },
    { value: Infinity },
    { value: 1n },
    { value: new Date() },
    { value: () => 1 },
    { value: Symbol('private') },
    { [Symbol('hidden')]: 1 },
    Object.defineProperty({}, 'hidden', { value: 1 }),
    getter,
    cyclic,
    new Array(1),
    Object.assign([], { named: 1 }),
  ];
  for (const args of invalid) {
    const result = await session.invoke(writeName, args);
    assert.equal(result.value.status, 'invalid_request');
    assert.equal(result.value.reason, 'invalid_operation_arguments');
  }
  assert.equal(getterReads, 0);
  assert.equal(writes, 0);
  assert.equal(
    (await session.invoke(writeName, { data: 'x'.repeat(OPERATION_BODY_BYTES) })).value.reason,
    'operation_request_too_large',
  );
  assert.equal(writes, 0);
});

test('missing arguments, null and empty values preserve their distinct service meaning', async () => {
  const received = [];
  const session = sessionFor(readName, async (args) => {
    received.push(args);
    return args;
  });
  for (const args of [undefined, null, false, 0, '', {}, []]) {
    assert.deepEqual((await session.invoke(readName, args)).value, args);
  }
  assert.deepEqual(received, [undefined, null, false, 0, '', {}, []]);
});

test('oversized read responses fail safely and oversized completed writes retain unknown outcome', async () => {
  for (const name of [readName, writeName]) {
    let writes = 0;
    const session = sessionFor(name, async () => {
      writes++;
      return { status: 'ready', large: 'x'.repeat(OPERATION_BODY_BYTES) };
    });
    const { value } = await session.invoke(name, {});
    assert.equal(value.status, 'tool_error');
    assert.equal(
      value.reason,
      name === writeName ? 'write_outcome_unknown' : 'operation_response_too_large',
    );
    assert.equal(writes, 1, 'Transport must never replay the operation after losing its response');
  }
});

test('original stopping exceptions survive privately while HTTP responses omit their text', async () => {
  const failure = Object.assign(new Error('fixture private lease failure'), { code: 'lease_lost' });
  const session = sessionFor(writeName, async () => {
    throw failure;
  });
  await assert.rejects(session.invoke(writeName, {}), (error) => error === failure);
  const app = createOperationApp();
  const request = boundRequest(app, {
    invoke: async () => {
      throw failure;
    },
  });
  const response = await request.run();
  assert.equal(response.status, 500);
  assert(!JSON.stringify(await response.json()).includes(failure.message));
  assert.equal(consumeOutcome(request.request).error, failure);
});

test('observe receives the original private read capability and reset invalidates the saved association', async () => {
  const capability = Symbol('map-read-capability');
  const raw = { status: 'ready', events: [] };
  raw[capability] = { private: true };
  const observed = [];
  const client = bindOperationApi({
    tools: [{ name: readName }],
    execute: async () => raw,
    observe(name, result) {
      observed.push(result);
      return { accepted: result === raw, name };
    },
  });
  const json = await client.execute({ name: readName, arguments: {} });
  assert.deepEqual(json, { status: 'ready', events: [] });
  assert.equal(Object.getOwnPropertySymbols(json).length, 0);
  assert.equal(client.observe(readName, json).accepted, true);
  assert.equal(observed[0][capability], raw[capability]);
  assert.equal(client.observe(readName, structuredClone(json)).accepted, false);
  resetOperationApi(client);
  assert.equal(client.observe(readName, json).accepted, false);
});

test('worker preparation retains private originals for a single matching caller/scope/exact argument execution', async () => {
  const f = preparedService(),
    session = createOperationSession({ tools: [f.definition] });
  const principal = { id: 'worker' },
    context = { principal, inputIds: ['b', 'a'] };
  const prepared = await session.invoke(writeName, { id: 7 }, context, { phase: 'prepare' });
  assert.equal(Object.getOwnPropertySymbols(prepared.value).length, 0);
  assert.deepEqual(prepared.value, { id: 7, normalized: true });
  assert.equal(
    (
      await session.invoke(
        writeName,
        prepared.value,
        { principal, inputIds: ['a', 'b'] },
        { preparation: prepared.preparation },
      )
    ).value.status,
    'ready',
  );
  await assert.rejects(
    session.invoke(writeName, prepared.value, context, { preparation: prepared.preparation }),
    /invalid_request/,
  );
  assert.equal(f.executions.length, 1);
  for (const change of ['principal', 'scope', 'arguments']) {
    const p = await session.invoke(writeName, { id: 7 }, context, { phase: 'prepare' });
    const nextContext =
      change === 'principal'
        ? { ...context, principal: { id: 'worker' } }
        : change === 'scope'
          ? { ...context, inputIds: ['another'] }
          : context;
    const args = change === 'arguments' ? { ...p.value, id: 8 } : p.value;
    await assert.rejects(
      session.invoke(writeName, args, nextContext, { preparation: p.preparation }),
      /invalid_request/,
    );
  }
  assert.equal(f.executions.length, 1);
});

test('worker thin client preserves preparation and cleanup prevents old prepared writes', async () => {
  const f = preparedService(),
    tools = bindWorkerOperations([f.definition]),
    tool = tools[0];
  const context = { principal: { id: 'worker' }, inputIds: ['a'] };
  const prepared = await tool.prepareArguments({ id: 7 }, context);
  assert.equal((await tool.execute(prepared, context)).status, 'ready');
  const stale = await tool.prepareArguments({ id: 8 }, context);
  resetWorkerOperations(tools);
  await assert.rejects(tool.execute(stale, context), /invalid_request/);
  assert.equal(f.executions.length, 1);
});

test('reset/dispose after asynchronous body parsing prevents service dispatch', async () => {
  const app = createOperationApp();
  for (const closed of [false, true]) {
    let calls = 0;
    const f = boundRequest(app, {
      invoke: async () => {
        calls++;
        return { value: null };
      },
    });
    const gate = deferred(),
      started = deferred(),
      text = f.request.text.bind(f.request);
    f.request.text = async () => {
      started.resolve();
      await gate.promise;
      return text();
    };
    const responsePromise = f.run();
    await started.promise;
    f.owner.epoch++;
    f.owner.closed = closed;
    gate.resolve();
    const result = await (await responsePromise).json();
    assert.equal(result.value.reason, 'operation_session_expired');
    assert.equal(calls, 0);
  }
});

test('cleanup while a write is executing reports uncertainty and never replays it', async () => {
  const started = deferred(),
    gate = deferred();
  let writes = 0;
  const session = sessionFor(writeName, async () => {
    started.resolve();
    await gate.promise;
    writes++;
    return { status: 'ready' };
  });
  const pending = session.invoke(writeName, {});
  await started.promise;
  session.dispose();
  gate.resolve();
  assert.equal((await pending).value.reason, 'write_outcome_unknown');
  assert.equal(writes, 1);
  assert.equal((await session.invoke(writeName, {})).value.status, 'forbidden');
  assert.equal(writes, 1);
});

test('abort before dispatch and cleanup during asynchronous preparation perform no writes', async () => {
  const controller = new AbortController();
  controller.abort();
  let writes = 0;
  const stopped = sessionFor(writeName, async () => {
    writes++;
    return { status: 'ready' };
  });
  assert.equal(
    (await stopped.invoke(writeName, {}, { signal: controller.signal })).value.status,
    'aborted',
  );
  assert.equal(writes, 0);
  const started = deferred(),
    gate = deferred();
  const session = sessionFor(
    writeName,
    async () => {
      writes++;
      return { status: 'ready' };
    },
    {
      async prepareArguments(args) {
        started.resolve();
        await gate.promise;
        return args;
      },
    },
  );
  const pending = session.invoke(writeName, {}, {}, { phase: 'prepare' });
  await started.promise;
  session.reset();
  gate.resolve();
  await assert.rejects(pending, /operation_session_expired/);
  assert.equal(writes, 0);
});

test('authenticated compatibility dispatch uses the API session once rather than recursing through tool clients', async () => {
  let calls = 0;
  const service = {
    tools: [{ name: readName }],
    execute: async () => ({ status: 'ready', call: ++calls }),
  };
  const client = bindOperationApi(service);
  assert.equal((await executeAdapterOperation(client, { name: readName, arguments: {} })).call, 1);
  assert.equal((await executeAdapterOperation(service, { name: readName, arguments: {} })).call, 2);
  assert.equal(calls, 2);
});

test('non-serializable read/write responses fail safely without replaying completed operations', async () => {
  for (const name of [readName, writeName])
    for (const kind of ['cycle', 'bigint']) {
      let writes = 0;
      const value = kind === 'cycle' ? { status: 'ready' } : { status: 'ready', native: 1n };
      if (kind === 'cycle') value.self = value;
      const session = sessionFor(name, async () => {
        writes++;
        return value;
      });
      const result = await session.invoke(name, {});
      assert.equal(result.value.status, 'tool_error');
      assert.equal(
        result.value.reason,
        name === writeName ? 'write_outcome_unknown' : 'operation_invalid_response',
      );
      assert.equal(writes, 1);
    }
});

test('child request and configured catalogues deny hidden writes while preserving invalid-name behavior', async () => {
  const calls = [];
  const catalogue = [{ name: readName }, { name: writeName }];
  const execute = async ({ name }) => {
    calls.push(name);
    return { status: 'ready' };
  };
  const parent = bindOperationApi({
    tools: catalogue,
    execute,
    createRequest: () => ({ tools: [{ name: readName }], execute }),
  });
  const child = parent.createRequest({});
  assert.equal((await parent.execute({ name: writeName, arguments: {} })).status, 'ready');
  calls.length = 0;
  assert.deepEqual(
    child.tools.map((tool) => tool.name),
    [readName],
  );
  assert.equal((await child.execute({ name: writeName, arguments: {} })).status, 'forbidden');
  assert.equal(
    (await child.execute({ name: 'invented_tool', arguments: {} })).status,
    'invalid_request',
  );
  assert.deepEqual(calls, []);
  assert.equal((await child.execute({ name: readName, arguments: {} })).status, 'ready');
  assert.deepEqual(calls, [readName]);
  calls.length = 0;
  const filtered = bindOperationApi({ tools: [{ name: readName }], execute }, { catalogue });
  assert.equal((await filtered.execute({ name: writeName, arguments: {} })).status, 'forbidden');
  assert.equal(
    (await filtered.execute({ name: 'invented_tool', arguments: {} })).status,
    'invalid_request',
  );
  assert.deepEqual(calls, []);
  const disabled = bindOperationApi({ tools: [], execute }, { catalogue });
  assert.equal((await disabled.execute({ name: writeName, arguments: {} })).status, 'forbidden');
  assert.deepEqual(calls, []);
});
