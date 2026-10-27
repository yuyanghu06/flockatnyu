import { createOperationSession } from './session.js';

const sessions = new WeakMap();
const services = new WeakMap();
const workerClients = new WeakMap();
const cachedClients = new WeakMap();

// Converts an operation service into a thin endpoint client while preserving the
// existing constructor/metadata interface used by chat and worker composition.
export function bindOperationApi(service) {
  const session = createOperationSession(service);
  const prepared = new WeakMap();
  const definitions = (service.tools || []).map((tool) => {
    const result = { ...tool };
    if (typeof tool.execute === 'function')
      result.execute = async (args, context = {}) =>
        (
          await session.invoke(tool.name, args, context, {
            preparation: args && typeof args === 'object' ? prepared.get(args) : undefined,
          })
        ).value;
    if (typeof tool.prepareArguments === 'function')
      result.prepareArguments = async (args, context = {}) => {
        const result = await session.invoke(tool.name, args, context, {
          phase: 'prepare',
        });
        if (!result.value || typeof result.value !== 'object' || !result.preparation)
          throw new Error('invalid_request');
        prepared.set(result.value, result.preparation);
        return result.value;
      };
    return Object.isFrozen(tool) ? Object.freeze(result) : result;
  });
  const client = {
    ...(Object.hasOwn(service, 'configured') ? { configured: service.configured } : {}),
    tools: Object.isFrozen(service.tools) ? Object.freeze(definitions) : definitions,
    execute: async ({ name, arguments: args, ...context } = {}) =>
      (await session.invoke(name, args, context)).value,
    ...(typeof service.createRequest === 'function'
      ? { createRequest: (context) => bindOperationApi(session.createRequest(context)) }
      : {}),
    ...(typeof service.advanceUserInput === 'function'
      ? { advanceUserInput: (...args) => session.advanceUserInput(...args) }
      : {}),
    ...(typeof service.updateUserContext === 'function'
      ? { updateUserContext: (...args) => session.updateUserContext(...args) }
      : {}),
    ...(typeof service.observe === 'function'
      ? { observe: (name, result) => session.observe(name, result) }
      : {}),
  };
  sessions.set(client, session);
  services.set(client, service);
  return Object.freeze(client);
}

// Direct authenticated HTTP compatibility routes use the API session itself,
// never recurse through a thin model tool's execute method.
export async function executeAdapterOperation(adapter, input) {
  let client = sessions.has(adapter) ? adapter : cachedClients.get(adapter);
  if (!client) {
    client = bindOperationApi(adapter);
    cachedClients.set(adapter, client);
  }
  return (
    await sessions
      .get(client)
      .invoke(
        input.name,
        input.arguments,
        Object.fromEntries(
          Object.entries(input).filter(([key]) => !['name', 'arguments'].includes(key)),
        ),
      )
  ).value;
}
export function resetOperationApi(client) {
  sessions.get(client)?.reset();
}
export function disposeOperationApi(client) {
  sessions.get(client)?.dispose();
}

// Worker operation services already live below the API layer. Their returned
// definitions become endpoint clients without moving lease/source logic into tools.
export function bindWorkerOperations(tools) {
  const client = bindOperationApi({ tools });
  workerClients.set(client.tools, client);
  return client.tools;
}

// Compatibility facades share the same private API session rather than wrapping
// one API client inside another API service. Extensions contain trusted controls.
export function aliasOperationApi(client, extensions) {
  if (!sessions.has(client)) throw new Error('operation_session_missing');
  const alias = Object.freeze({ ...client, ...extensions });
  sessions.set(alias, sessions.get(client));
  services.set(alias, services.get(client));
  return alias;
}
export function resetWorkerOperations(tools) {
  resetOperationApi(workerClients.get(tools));
}
