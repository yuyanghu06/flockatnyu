// Compacts already-observed Calendar receipts while preserving confirmed saved identities.
import { projectCalendarReceipt } from '../../google/calendar-receipt.js';
import { compactCalendarBatchWrite } from '../../../tools/calendar/chat-batch.js';

export function compactCalendarResult(result) {
  return {
    ...result,
    sources: [],
    ...(result.calendarWrite
      ? { calendarWrite: projectCalendarReceipt(result.calendarWrite, { compact: true }) }
      : {}),
    ...(result.calendarBatchWrite
      ? { calendarBatchWrite: compactCalendarBatchWrite(result.calendarBatchWrite) }
      : {}),
    ...(result.previousResult
      ? { previousResult: compactCalendarResult(result.previousResult) }
      : {}),
  };
}
