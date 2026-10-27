import { projectCalendarReceipt } from '../../google/calendar-receipt.js';
import {
  projectCalendarBatchWrite,
  compactCalendarBatchWrite,
} from '../../google/operations/calendar-batch-receipts.js';

export function projectCalendarWrites({ data, name, result }) {
  const receipt = result?.calendarWrite;
  if (
    [
      'create_calendar_event',
      'update_calendar_event',
      'delete_calendar_event',
      'upsert_calendar_event',
      'cancel_calendar_event',
    ].includes(name) &&
    result?.status === 'ready'
  ) {
    const projected = projectCalendarReceipt(receipt);
    if (projected) data.calendarWrite = projected;
  }
  if (
    ['create_calendar_events', 'update_calendar_events'].includes(name) &&
    ['ready', 'partial'].includes(result?.status)
  ) {
    let batch = projectCalendarBatchWrite(result.calendarBatchWrite);
    // Keep every saved identity/title/timing. Long descriptions and ancillary
    // details are omitted explicitly before a native turn or final prompt grows.
    if (batch && Buffer.byteLength(JSON.stringify(batch)) > 48000)
      batch = compactCalendarBatchWrite(batch);
    if (batch) data.calendarBatchWrite = batch;
  }
}
export function projectCalendarRead({ data, name, result }) {
  if (['list_calendar_events', 'read_calendar_event'].includes(name) && result?.calendarContext) {
    const encoded = JSON.stringify(result.calendarContext);
    if (Buffer.byteLength(encoded) <= 20000)
      data.calendarContext = {
        ...JSON.parse(encoded),
        windowComplete:
          name === 'list_calendar_events' &&
          result.status === 'ready' &&
          result.coverage?.complete === true,
      };
    else {
      data.possiblyTruncated = true;
      data.complete = false;
    }
  }
}
