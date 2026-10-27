import { bindOperationApi, aliasOperationApi } from '../adapter.js';
import { createMemoryOperations, MEMORY_TOOLS } from '../../knowledge/operations/memory.js';

export function createMemoryApi(options) {
  const service = createMemoryOperations(options);
  const client = bindOperationApi(service);
  // Initial context loading uses the same private read endpoint, with the
  // original read-only service entry rather than model-write prerequisites.
  const initialRead = bindOperationApi({
    tools: [MEMORY_TOOLS[0]],
    execute: ({ principal, signal }) => service.read({ principal, signal }),
  });
  return aliasOperationApi(client, {
    read: ({ principal, signal } = {}) =>
      initialRead.execute({ name: 'read_memory', arguments: {}, principal, signal }),
  });
}
