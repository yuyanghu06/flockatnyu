import assert from 'node:assert/strict';
import { OPERATIONS } from '../../server/operation-api/catalogue.js';
import { createOperationSession } from '../../server/operation-api/session.js';
import { bindInvocation } from '../../server/operation-api/invocation.js';

// Synthetic services retain private capabilities while the real API transports JSON.
export const readName = 'read_map_events';
export const writeName = 'upsert_map_event';
export const deferred = () => {
  let resolve;
  const promise = new Promise((done) => (resolve = done));
  return { promise, resolve };
};
export function sessionFor(name, execute, extra = {}) {
  return createOperationSession({ tools: [{ name, execute, ...extra }] });
}
export function boundRequest(
  app,
  {
    name = readName,
    path = OPERATIONS[name].path,
    owner = { epoch: 0, closed: false },
    envOwner = owner,
    body = JSON.stringify({ arguments: {} }),
    invoke = async () => ({ value: { status: 'ready' } }),
    signal,
  } = {},
) {
  const request = new Request('http://operations.example.test' + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
    ...(signal ? { signal } : {}),
  });
  bindInvocation(request, owner, name, {}, invoke, OPERATIONS[name]);
  return { request, owner, run: () => app.fetch(request, { operationOwner: envOwner }) };
}

export function preparedService() {
  const secret = Symbol('private preparation');
  const executions = [];
  const definition = {
    name: writeName,
    async prepareArguments(args) {
      const value = { ...args, normalized: true };
      value[secret] = true;
      return value;
    },
    async execute(args) {
      assert.equal(args[secret], true, 'Only retained original prepared object may execute');
      executions.push(args);
      return { status: 'ready' };
    },
  };
  return { definition, executions };
}
