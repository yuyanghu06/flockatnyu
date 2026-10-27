// The chat tool is a private endpoint client, not the owner of map reads or writes.
import { createChatMapOperationApi } from '../../server/operation-api/factories/map.js';
export { normalizeChatMapPersonName } from '../../server/map/operations/chat-helpers.js';
export function createChatMapTools(options) {
  return createChatMapOperationApi(options);
}
