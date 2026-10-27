import { bindOperationApi, aliasOperationApi } from '../adapter.js';
import { createMiroOperations } from '../../miro/operations/index.js';

export function createMiroApi(options) {
  const client = bindOperationApi(createMiroOperations(options));
  return aliasOperationApi(client, {
    transport: 'mcp',
    prepareBoard: ({ boardId, principal, signal }) =>
      client.execute({
        name: 'read_miro_board',
        arguments: { boardId, mode: 'overview' },
        principal,
        signal,
      }),
  });
}
