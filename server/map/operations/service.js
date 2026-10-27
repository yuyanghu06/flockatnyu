import { validateArguments } from '../../automation/validation.js';

import { MAP_TOOLS } from './schema.js';
const methods = {
  read_map_events: 'read',
  lookup_map_person: 'lookup',
  upsert_map_event: 'upsert',
};
export function createMapOperationService({ service } = {}) {
  async function execute({ name, arguments: args, principal, signal, readContext } = {}) {
    const tool = MAP_TOOLS.find((row) => row.name === name);
    if (!tool || !validateArguments(args, tool.parameters)) return { status: 'invalid_request' };
    if (service?.configured !== true) return { status: 'not_configured' };
    if (
      typeof principal?.id !== 'string' ||
      !principal.id ||
      !Array.isArray(principal.allowedSourceIds)
    )
      return { status: 'forbidden' };
    try {
      const result = await service[methods[name]]({ ...args, principal, signal, readContext });
      return ['ok', 'applied'].includes(result?.status)
        ? { ...result, status: 'ready', sourceStatus: result.status }
        : result;
    } catch {
      return { status: signal?.aborted ? 'aborted' : 'unavailable' };
    }
  }
  return Object.freeze({
    configured: service?.configured === true,
    tools: Object.freeze(
      MAP_TOOLS.map((tool) =>
        Object.freeze({
          ...tool,
          execute: (args, context) => execute({ name: tool.name, arguments: args, ...context }),
        }),
      ),
    ),
    execute,
  });
}
