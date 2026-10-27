import { projectCalendarReceipt } from '../calendar-receipt.js';
import { savedBatchTimingFields } from './calendar-boundaries.js';
const validId = (value) => typeof value === 'string' && /^[a-zA-Z0-9_-]{5,1024}$/.test(value);
export function projectCalendarBatchWrite(value, { compact = false } = {}) {
  if (
    !value ||
    !Array.isArray(value.items) ||
    value.items.length < 1 ||
    value.items.length > 50 ||
    typeof value.complete !== 'boolean'
  )
    return null;
  const updating = Object.hasOwn(value.counts || {}, 'updated'),
    counts = {
      requested: value.items.length,
      ...(updating ? { updated: 0, unchanged: 0 } : { created: 0, existing: 0 }),
      failed: 0,
      unattempted: 0,
    },
    items = [];
  for (const [index, item] of value.items.entries()) {
    if (
      item.index !== index ||
      !Object.hasOwn(counts, item.status) ||
      item.status === 'requested' ||
      (item.title !== undefined && (typeof item.title !== 'string' || item.title.length > 300)) ||
      (item.date !== undefined && (typeof item.date !== 'string' || item.date.length > 10))
    )
      return null;
    const row = {
      index,
      status: item.status,
      ...(item.title !== undefined ? { title: item.title } : {}),
      ...(item.date !== undefined ? { date: item.date } : {}),
      ...(validId(item.eventId) ? { eventId: item.eventId } : {}),
    };
    if (item.details?.requestedFieldsOmitted === true)
      row.details = { compacted: true, requestedFieldsOmitted: true };
    if (['created', 'existing', 'updated', 'unchanged'].includes(item.status)) {
      if (value.details?.receiptsOmitted === true && item.receiptOmitted === true) {
        if (
          !validId(item.eventId) ||
          !['created', 'reconciled', 'unchanged', 'existing', 'updated'].includes(item.outcome)
        )
          return null;
        counts[item.status]++;
        items.push({
          index,
          status: item.status,
          eventId: item.eventId,
          outcome: item.outcome,
          receiptOmitted: true,
          reason: 'context_limit',
        });
        continue;
      }
      const saved = item.calendarWrite;
      if (
        !validId(saved?.eventId) ||
        typeof saved.url !== 'string' ||
        !/^https:\/\/calendar\.google\.com\/calendar\/event\?eid=[A-Za-z0-9_-]+$/.test(saved.url) ||
        !['created', 'reconciled', 'unchanged', 'existing', 'updated'].includes(saved.outcome)
      )
        return null;
      const projected = projectCalendarReceipt(saved, { compact });
      if (!projected) return null;
      delete row.title;
      delete row.date;
      if (!compact)
        Object.assign(
          row,
          ...(typeof projected.title === 'string' ? [{ title: projected.title }] : []),
          savedBatchTimingFields(projected),
        );
      row.calendarWrite = projected;
    }
    if (typeof item.reason === 'string') row.reason = item.reason.slice(0, 100);
    counts[item.status]++;
    items.push(row);
  }
  if (
    Object.keys(counts).some((key) => value.counts?.[key] !== counts[key]) ||
    value.complete !== (!counts.failed && !counts.unattempted)
  )
    return null;
  return {
    complete: value.complete,
    counts,
    items,
    ...(value.details?.receiptsOmitted === true
      ? { details: { compacted: true, reason: 'context_limit', receiptsOmitted: true } }
      : {}),
  };
}

export function compactCalendarBatchWrite(value) {
  const compacted = projectCalendarBatchWrite(value, { compact: true });
  if (!compacted || Buffer.byteLength(JSON.stringify(compacted)) <= 60000) return compacted;
  // Location and verbose field coverage are expendable before saved titles or
  // timings. This keeps50maximum writable titles with realistic provider IDs.
  const coreFields = new Set(['title', 'eventStatus', 'start', 'end', 'timeZone', 'allDay']);
  const thin = {
    ...compacted,
    items: compacted.items.map((item) => {
      if (!item.calendarWrite)
        return {
          index: item.index,
          status: item.status,
          ...(item.eventId ? { eventId: item.eventId } : {}),
          ...(item.reason ? { reason: item.reason } : {}),
          details: { compacted: true, requestedFieldsOmitted: true },
        };
      const saved = { ...item.calendarWrite },
        details = { ...saved.details, coverageOmitted: true };
      if (Object.hasOwn(saved, 'location')) {
        delete saved.location;
        details.truncatedFields = [...new Set([...details.truncatedFields, 'location'])];
        details.omittedFields = [...new Set([...(details.omittedFields || []), 'location'])];
      }
      details.missingFields = details.missingFields.filter((key) => coreFields.has(key));
      saved.details = details;
      return { index: item.index, status: item.status, calendarWrite: saved };
    }),
  };
  if (Buffer.byteLength(JSON.stringify(thin)) <= 60000) return thin;
  // Fifty maximum-size provider IDs/URLs and titles cannot all fit a native
  //64KB result. Keep every exact saved identity/outcome; explicitly flag the
  // unavailable detailed receipts rather than silently dropping successful rows.
  return {
    complete: compacted.complete,
    counts: compacted.counts,
    details: { compacted: true, reason: 'context_limit', receiptsOmitted: true },
    items: compacted.items.map((item) =>
      item.calendarWrite
        ? {
            index: item.index,
            status: item.status,
            eventId: item.calendarWrite.eventId,
            outcome: item.calendarWrite.outcome,
            receiptOmitted: true,
            reason: 'context_limit',
          }
        : {
            index: item.index,
            status: item.status,
            ...(item.eventId ? { eventId: item.eventId } : {}),
            ...(item.reason ? { reason: item.reason } : {}),
            details: { compacted: true, requestedFieldsOmitted: true },
          },
    ),
  };
}
