import { promptText } from '../../prompt-loader/index.js';
import { validateArguments } from '../../automation/validation.js';
import { MEMORY_MAX_BYTES, validMemory } from '../../knowledge/memory.js';

const define = (name, description, properties, required = []) =>
  Object.freeze({
    name,
    description,
    parameters: { type: 'object', additionalProperties: false, properties, required },
  });
export const MEMORY_TOOLS = Object.freeze([
  define('read_memory', promptText('tools/memory/read_memory#description'), {}),
  define(
    'update_memory',
    promptText('tools/memory/update_memory#description'),
    {
      content: { type: 'string', maxLength: 16000 },
      expectedUpdatedAt: { type: 'string', minLength: 1, maxLength: 50 },
    },
    ['content', 'expectedUpdatedAt'],
  ),
]);
const authorized = (principal) =>
  typeof principal?.id === 'string' &&
  Boolean(principal.id) &&
  Array.isArray(principal.allowedSourceIds);
export function createMemoryOperations({ store } = {}) {
  async function read({ principal, signal } = {}) {
    if (!authorized(principal)) return { status: 'forbidden' };
    if (!store?.configured) return { status: 'not_configured' };
    try {
      return await store.read({ signal });
    } catch {
      return { status: signal?.aborted ? 'aborted' : 'unavailable' };
    }
  }
  async function execute({ name, arguments: args, principal, memoryContext, signal } = {}) {
    const tool = MEMORY_TOOLS.find((tool) => tool.name === name);
    if (!tool || !validateArguments(args, tool.parameters))
      return { status: 'invalid_request', sources: [] };
    if (!authorized(principal) || !memoryContext || typeof memoryContext.userMessage !== 'string')
      return { status: 'forbidden', sources: [] };
    if (name === 'read_memory') {
      const result = await read({ principal, signal });
      if (result.status === 'ready' && validMemory(result.memory)) memoryContext.snapshot = result;
      return { ...result, sources: [] };
    }
    if (!memoryContext.userMessage.trim() || !validMemory(memoryContext.snapshot?.memory))
      return { status: 'forbidden', sources: [] };
    if (
      Buffer.byteLength(args.content) > MEMORY_MAX_BYTES ||
      !Number.isFinite(Date.parse(args.expectedUpdatedAt))
    )
      return { status: 'invalid_request', sources: [] };
    if (args.expectedUpdatedAt !== memoryContext.snapshot.memory.updated_at)
      return { status: 'conflict', sources: [] };
    if (!store?.configured) return { status: 'not_configured', sources: [] };
    try {
      const result = await store.write({
        content: args.content,
        expectedUpdatedAt: args.expectedUpdatedAt,
        signal,
      });
      if (result.status === 'ready' && validMemory(result.memory)) memoryContext.snapshot = result;
      return { ...result, sources: [] };
    } catch {
      return { status: signal?.aborted ? 'aborted' : 'unavailable', sources: [] };
    }
  }
  return Object.freeze({
    configured: store?.configured === true,
    tools: MEMORY_TOOLS,
    read,
    execute,
  });
}
