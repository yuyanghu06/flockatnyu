import { bindOperationApi } from '../adapter.js';
import { createCalendarOperations } from '../../google/operations/calendar.js';
import { createChatCalendarOperations } from '../../google/operations/chat-calendar.js';
export const createCalendarApi = (options) => bindOperationApi(createCalendarOperations(options));
export const createChatCalendarApi = (options) =>
  bindOperationApi(createChatCalendarOperations(options));
