import { bindOperationApi } from '../adapter.js';
import { createGmailSendOperations } from '../../google/operations/gmail-send.js';
export const createGmailSendApi = (options) => bindOperationApi(createGmailSendOperations(options));
