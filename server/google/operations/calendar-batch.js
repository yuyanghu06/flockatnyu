import { promptText } from '../../prompt-loader/index.js';
import { createHash } from 'node:crypto';
import { projectCalendarReceipt } from '../calendar-receipt.js';
import { googleDiagnostics, googleError } from '../oauth.js';
import {
  batchTimingProperties,
  normalizeBatchTiming,
  validateBatchTiming,
  savedBatchTimingFields,
} from './calendar-boundaries.js';

const validId = (value) => typeof value === 'string' && /^[a-zA-Z0-9_-]{5,1024}$/.test(value);
const normalizedTitle = (value) =>
  value.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLowerCase();
const text = (value, max, required = false) =>
  typeof value === 'string' &&
  value.length <= max &&
  (!required || value.trim().length > 0) &&
  // eslint-disable-next-line no-control-regex -- Strip unsafe control characters from provider text.
  !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(value);
const canonicalUrl = (id, calendarId) =>
  `https://calendar.google.com/calendar/event?eid=${Buffer.from(`${id} ${calendarId}`).toString('base64url')}`;
// Only provider-returned strings confirm saved location; absence remains unknown.
export const calendarReceiptLocation = (value) =>
  typeof value?.location === 'string'
    ? {
        location: value.location
          // eslint-disable-next-line no-control-regex -- Strip unsafe control characters from provider text.
          .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
          .slice(0, 500),
      }
    : {};
const fatal = new Set([
  'forbidden',
  'permission_denied',
  'reauthorization_required',
  'account_mismatch',
  'not_configured',
  'aborted',
]);
const optionalFields = {
  description: { type: 'string', maxLength: 3000 },
  location: { type: 'string', maxLength: 500 },
};
const define = (name, description, properties, required) =>
  Object.freeze({
    name,
    description,
    idempotent: true,
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['events'],
      properties: {
        events: {
          type: 'array',
          minItems: 1,
          maxItems: 50,
          items: { type: 'object', additionalProperties: false, required, properties },
        },
      },
    },
  });
export const CHAT_CALENDAR_BATCH_TOOL = define(
  'create_calendar_events',
  promptText('tools/calendar/create_calendar_events#description'),
  {
    title: { type: 'string', minLength: 1, maxLength: 300 },
    ...batchTimingProperties,
    ...optionalFields,
  },
  ['title'],
);
export const CHAT_CALENDAR_BATCH_UPDATE_TOOL = define(
  'update_calendar_events',
  promptText('tools/calendar/update_calendar_events#description'),
  {
    eventId: { type: 'string', minLength: 5, maxLength: 1024 },
    title: { type: 'string', minLength: 1, maxLength: 300 },
    ...batchTimingProperties,
    ...optionalFields,
  },
  ['eventId'],
);
function fields(value) {
  if (
    (value.title !== undefined && !text(value.title, 300, true)) ||
    (value.description !== undefined && !text(value.description, 3000)) ||
    (value.location !== undefined && !text(value.location, 500))
  )
    throw Error('invalid_event');
  return Object.fromEntries(
    ['title', 'description', 'location']
      .filter((key) => value[key] !== undefined)
      .map((key) => [key, value[key]]),
  );
}
function receipt(value, calendarId) {
  if (
    !validId(value?.eventId) ||
    value.url !== canonicalUrl(value.eventId, calendarId) ||
    !['created', 'reconciled', 'unchanged', 'existing', 'updated'].includes(value.outcome)
  )
    return null;
  return projectCalendarReceipt(value);
}
function savedRow(base, saved, status) {
  // Successful display fields describe returned provider state only. Requested
  // title/date remain useful on failed rows, never as saved-state fallback.
  const { title: _, date: __, ...identity } = base;
  return {
    ...identity,
    ...(typeof saved.title === 'string' ? { title: saved.title } : {}),
    ...savedBatchTimingFields(saved),
    status,
    calendarWrite: saved,
  };
}

function failureDiagnostics(value, reason = 'google_unavailable', stage = 'provider_request') {
  return { diagnostics: googleDiagnostics(value?.diagnostics ?? { stage, reason }) };
}
function caughtFailure(error, signal) {
  const safe = googleError(error, signal);
  // Preserve batch's existing catch status; keep the underlying safe cause too.
  return {
    status: signal?.aborted ? 'aborted' : 'google_unavailable',
    diagnostics: safe.diagnostics,
  };
}
function stoppedDiagnostics(diagnostics) {
  // A skipped row has no HTTP response of its own, even when an earlier row did.
  return failureDiagnostics(
    null,
    diagnostics?.reason || 'aborted',
    diagnostics?.stage || 'local_validation',
  );
}
function finish(items, family) {
  const counts = {
    requested: items.length,
    ...(family === 'update' ? { updated: 0, unchanged: 0 } : { created: 0, existing: 0 }),
    failed: 0,
    unattempted: 0,
  };
  for (const item of items) counts[item.status]++;
  const complete = !counts.failed && !counts.unattempted;
  return {
    status: complete ? 'ready' : 'partial',
    sources: [],
    calendarBatchWrite: { complete, counts, items },
  };
}
export async function createCalendarBatch({ client, events, principal, operationId, signal }) {
  const items = [];
  let stopReason, stopDiagnostics;
  for (const [index, event] of events.entries()) {
    const base = {
      index,
      title: event.title,
      ...(event.date !== undefined ? { date: event.date } : {}),
    };
    if (signal?.aborted || stopReason) {
      items.push({
        ...base,
        status: 'unattempted',
        reason: stopReason || 'aborted',
        ...stoppedDiagnostics(signal?.aborted ? undefined : stopDiagnostics),
      });
      continue;
    }
    let timing, desired;
    try {
      timing = normalizeBatchTiming(event, true);
      desired = { ...fields(event), ...timing };
    } catch (error) {
      items.push({
        ...base,
        status: 'failed',
        reason:
          error.message === 'ambiguous_local_time' || error.message === 'nonexistent_local_time'
            ? error.message
            : 'invalid_event',
        ...failureDiagnostics(
          null,
          timing ? 'invalid_request' : 'invalid_time_window',
          'local_validation',
        ),
      });
      continue;
    }
    // Retry identity is local to this requested operation. Discovering unrelated
    // existing events and deciding what to create belongs to separate reads.
    const identity = createHash('sha256')
      .update(
        JSON.stringify([
          'chat-calendar-batch-v2',
          operationId,
          normalizedTitle(event.title),
          timing,
        ]),
      )
      .digest('hex');
    let result;
    try {
      result = await client.createChatEvent({
        ...desired,
        operationId: identity,
        principal,
        signal,
      });
    } catch (error) {
      result = caughtFailure(error, signal);
    }
    const saved = result?.status === 'ready' ? receipt(result, client.calendarId) : null;
    if (!saved) {
      const reason =
        result?.status === 'ready' ? 'invalid_response' : result?.status || 'google_unavailable';
      if (fatal.has(reason)) {
        stopReason = reason;
        stopDiagnostics = failureDiagnostics(
          result,
          reason,
          result?.status === 'ready' ? 'response_parse' : 'provider_request',
        ).diagnostics;
      }
      items.push({
        ...base,
        status: 'failed',
        reason,
        ...failureDiagnostics(
          result,
          reason,
          result?.status === 'ready' ? 'response_parse' : 'provider_request',
        ),
      });
      continue;
    }
    const status = saved.outcome === 'unchanged' ? 'existing' : 'created';
    items.push(savedRow(base, saved, status));
  }
  return finish(items, 'create');
}

export async function updateCalendarBatch({ client, events, principal, signal }) {
  const items = [];
  let stopReason, stopDiagnostics;
  for (const [index, event] of events.entries()) {
    const base = {
      index,
      eventId: event.eventId,
      ...(event.title !== undefined ? { title: event.title } : {}),
    };
    if (signal?.aborted || stopReason) {
      items.push({
        ...base,
        status: 'unattempted',
        reason: stopReason || 'aborted',
        ...stoppedDiagnostics(signal?.aborted ? undefined : stopDiagnostics),
      });
      continue;
    }
    let patch,
      validatingTiming = false;
    try {
      if (!validId(event.eventId)) throw Error('invalid_event');
      const inputFields = fields(event);
      validatingTiming = true;
      const timing = normalizeBatchTiming(event);
      validatingTiming = false;
      patch = { ...inputFields, ...timing };
      if (!Object.keys(patch).length) throw Error('invalid_event');
    } catch (error) {
      items.push({
        ...base,
        status: 'failed',
        reason: ['ambiguous_local_time', 'nonexistent_local_time'].includes(error.message)
          ? error.message
          : 'invalid_event',
        ...failureDiagnostics(
          null,
          validatingTiming ? 'invalid_time_window' : 'invalid_request',
          'local_validation',
        ),
      });
      continue;
    }
    let read;
    try {
      read = await client.readChatEvent({ eventId: event.eventId, principal, signal });
    } catch (error) {
      read = caughtFailure(error, signal);
    }
    const current = read?.events?.[0],
      revision = read?.chatRevision;
    let reason =
      read?.status !== 'ready'
        ? read?.status || 'google_unavailable'
        : !current
          ? 'not_found'
          : null;
    if (
      !reason &&
      (read.events.length !== 1 ||
        current.eventId !== event.eventId ||
        revision?.eventId !== event.eventId ||
        !text(revision.etag, 1000, true) ||
        /[\r\n]/.test(revision.etag) ||
        typeof revision.unsupported !== 'boolean')
    )
      reason = 'invalid_response';
    if (!reason && revision.unsupported) reason = 'unsupported_event';
    if (reason) {
      if (fatal.has(reason)) {
        stopReason = reason;
        stopDiagnostics = failureDiagnostics(
          read,
          reason,
          reason === 'invalid_response' ? 'response_parse' : 'provider_request',
        ).diagnostics;
      }
      items.push({
        ...base,
        status: 'failed',
        reason,
        ...failureDiagnostics(
          read,
          reason,
          reason === 'invalid_response' ? 'response_parse' : 'provider_request',
        ),
      });
      continue;
    }
    let desired;
    try {
      desired = { ...current, ...patch };
      validateBatchTiming(desired, true);
    } catch {
      items.push({
        ...base,
        status: 'failed',
        reason: 'invalid_event',
        ...failureDiagnostics(null, 'invalid_time_window', 'local_validation'),
      });
      continue;
    }
    let result;
    try {
      result = await client.updateChatEvent({
        ...patch,
        eventId: event.eventId,
        expectedEtag: revision.etag,
        principal,
        signal,
      });
    } catch (error) {
      result = caughtFailure(error, signal);
    }
    const saved =
      result?.status === 'ready' && result.eventId === event.eventId
        ? receipt(result, client.calendarId)
        : null;
    if (!saved || !['updated', 'unchanged'].includes(saved.outcome)) {
      reason =
        result?.status === 'ready' ? 'invalid_response' : result?.status || 'google_unavailable';
      if (fatal.has(reason)) {
        stopReason = reason;
        stopDiagnostics = failureDiagnostics(
          result,
          reason,
          result?.status === 'ready' ? 'response_parse' : 'provider_request',
        ).diagnostics;
      }
      items.push({
        ...base,
        status: 'failed',
        reason,
        ...failureDiagnostics(
          result,
          reason,
          result?.status === 'ready' ? 'response_parse' : 'provider_request',
        ),
      });
      continue;
    }
    items.push(savedRow(base, saved, saved.outcome));
  }
  return finish(items, 'update');
}

export { projectCalendarBatchWrite, compactCalendarBatchWrite } from './calendar-batch-receipts.js';
