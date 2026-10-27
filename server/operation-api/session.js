import { randomUUID } from 'node:crypto';
import { assertJsonArguments } from './arguments.js';
import { canonicalJson } from '../automation/validation.js';
import { createOperationApp } from './app.js';
import { bindInvocation, consumeOutcome } from './invocation.js';
import { OPERATIONS } from './catalogue.js';
import { OPERATION_BODY_BYTES } from './dispatch.js';

const failure = (reason, status = 'tool_error') => ({ status, reason, sources: [] });
const scopeOf = (context) => canonicalJson([...(context.inputIds || [])].sort());

export function createOperationSession(service, { catalogue = service.tools || [] } = {}) {
  const app = createOperationApp();
  const owner = { epoch: 0, closed: false };
  const definitions = new Map((service.tools || []).map((tool) => [tool.name, tool]));
  const knownNames = new Set(catalogue.map((tool) => tool.name));
  for (const name of definitions.keys())
    if (!OPERATIONS[name]) throw new Error('operation_route_missing');
  const preparations = new Map();
  let originals = new WeakMap();

  function retainPreparation(name, value, context) {
    if (preparations.size >= 128) throw new Error('operation_preparation_limit');
    const id = randomUUID();
    preparations.set(id, {
      name,
      value,
      identity: canonicalJson(value),
      principal: context.principal,
      scope: scopeOf(context),
      epoch: owner.epoch,
    });
    return id;
  }
  function consumePreparation(id, name, value, context) {
    const saved = preparations.get(id);
    preparations.delete(id);
    if (
      !saved ||
      saved.name !== name ||
      saved.epoch !== owner.epoch ||
      saved.principal !== context.principal ||
      saved.scope !== scopeOf(context) ||
      saved.identity !== canonicalJson(value)
    )
      throw new Error('invalid_request');
    return saved.value;
  }
  async function invoke(name, args, context = {}, { phase = 'execute', preparation } = {}) {
    const definition = definitions.get(name),
      operation = OPERATIONS[name];
    if (owner.closed || !definitions.size || (!definition && knownNames.has(name)))
      return { value: failure('operation_not_available', 'forbidden') };
    if (!definition || !operation)
      return { value: failure('invalid_operation', 'invalid_request') };
    let body;
    try {
      if (args !== undefined) assertJsonArguments(args);
      body = JSON.stringify({
        arguments: args === undefined ? null : args,
        ...(args === undefined ? { missingArguments: true } : {}),
        phase,
        ...(preparation ? { preparation } : {}),
      });
      if (!body || Buffer.byteLength(body) > OPERATION_BODY_BYTES)
        return { value: failure('operation_request_too_large', 'invalid_request') };
    } catch {
      return { value: failure('invalid_operation_arguments', 'invalid_request') };
    }
    const invocationEpoch = owner.epoch;
    const request = new Request('http://flock-operations.invalid' + operation.path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
      ...(context.signal ? { signal: context.signal } : {}),
    });
    bindInvocation(
      request,
      owner,
      name,
      context,
      async (input) => {
        if (input.phase === 'prepare') {
          if (typeof definition.prepareArguments !== 'function') throw new Error('invalid_request');
          const value = await definition.prepareArguments(input.arguments, context);
          if (owner.closed || owner.epoch !== invocationEpoch || context.signal?.aborted)
            throw new Error('operation_session_expired');
          return { value, preparation: retainPreparation(name, value, context) };
        }
        const actual = input.preparation
          ? consumePreparation(input.preparation, name, input.arguments, context)
          : input.arguments;
        const value =
          typeof service.execute !== 'function'
            ? await definition.execute(actual, context)
            : await service.execute({ ...context, name, arguments: actual });
        return { value };
      },
      { ...definition, readOnly: definition.readOnly ?? operation.readOnly },
    );
    let response;
    try {
      response = await app.fetch(request, { operationOwner: owner });
    } catch {
      return {
        value: failure(
          operation.readOnly ? 'operation_transport_unavailable' : 'write_outcome_unknown',
        ),
      };
    }
    const outcome = consumeOutcome(request);
    if (outcome && Object.hasOwn(outcome, 'error')) throw outcome.error;
    let envelope;
    try {
      envelope = await response.json();
    } catch {
      return {
        value: failure(operation.readOnly ? 'operation_invalid_response' : 'write_outcome_unknown'),
      };
    }
    const value = envelope?.missing ? undefined : envelope?.value;
    if (!envelope || !['value', 'rejected'].includes(envelope.kind))
      return {
        value: failure(operation.readOnly ? 'operation_invalid_response' : 'write_outcome_unknown'),
      };
    if (value && typeof value === 'object' && outcome && Object.hasOwn(outcome, 'raw'))
      originals.set(value, outcome.raw);
    if (phase === 'prepare' && envelope.kind !== 'value') throw new Error('invalid_request');
    return { value, preparation: envelope.preparation };
  }
  return {
    invoke,
    // These are trusted lifecycle controls, not additional model-callable tools.
    createRequest: (context) => service.createRequest(context),
    advanceUserInput: (...args) => service.advanceUserInput(...args),
    updateUserContext: (...args) => service.updateUserContext(...args),
    observe: (name, result) => {
      const raw = result && typeof result === 'object' ? (originals.get(result) ?? result) : result;
      const observed = service.observe(name, raw);
      return observed === undefined ? observed : JSON.parse(JSON.stringify(observed));
    },
    reset() {
      owner.epoch++;
      preparations.clear();
      originals = new WeakMap();
    },
    dispose() {
      owner.closed = true;
      owner.epoch++;
      preparations.clear();
      originals = new WeakMap();
    },
  };
}
