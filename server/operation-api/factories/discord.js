import { bindOperationApi } from '../adapter.js';
import { createDiscordReadOperations } from '../../discord/operations/reads.js';
import { createDiscordChatOperations } from '../../discord/operations/live-summary.js';
import { createDiscordDraftOperations } from '../../discord/operations/draft.js';

export const createDiscordReadApi = (options) =>
  bindOperationApi(createDiscordReadOperations(options));
export const createDiscordChatApi = (options) =>
  bindOperationApi(createDiscordChatOperations(options));
export const createDiscordDraftApi = (options) =>
  bindOperationApi(createDiscordDraftOperations(options));
