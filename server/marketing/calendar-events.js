// Read-only list of confirmed upcoming club Calendar events for the marketing
// and events teams. It reuses the existing club Calendar client, so OAuth,
// account and Calendar ACL checks stay in that client. Nothing here writes to
// Google Calendar or saved data.
import { createTimeContext, resolveDateBoundary } from '../shared/time-zone.js';

export const MARKETING_TIME_ZONE = 'America/New_York';
export const MARKETING_LOOKAHEAD_DAYS = 60;
// Google Calendar colorId 8 is "Graphite" (gray), used by the club for drafts.
export const SKIPPED_COLOR_IDS = Object.freeze(['8']);
export const SKIPPED_TITLE_PREFIXES = Object.freeze(['[TBD]', 'TENTATIVE']);
export const MARKETING_PRINCIPAL_ID = 'service:marketing-events';

const MAX_WINDOWS = 64;
const MAX_DEPTH = 10;
const SPLITTABLE = new Set(['context_limit', 'event_limit', 'page_limit']);
const ACCESS_FAILURES = new Set([
  'forbidden',
  'forbidden_source',
  'permission_denied',
  'reauthorization_required',
  'account_mismatch',
  'not_configured',
]);

function addDays(localDate, days) {
  const date = new Date(`${localDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

// Local-day window: from the start of "today" in New York to the start of the
// local day `lookaheadDays` later. Midnight is resolved through IANA rules, so
// DST transitions produce the real instants rather than fixed offsets.
export function upcomingWindow({
  now = new Date(),
  timeZone = MARKETING_TIME_ZONE,
  lookaheadDays = MARKETING_LOOKAHEAD_DAYS,
} = {}) {
  if (!Number.isInteger(lookaheadDays) || lookaheadDays < 1 || lookaheadDays > 366)
    throw new RangeError('lookaheadDays must be an integer from 1 to 366');
  const context = createTimeContext({ timeZone, now });
  if (!context) throw new RangeError('invalid time zone or clock');
  const endDate = addDays(context.localDate, lookaheadDays);
  const timeMin = resolveDateBoundary(context.localDate, { timeZone });
  const timeMax = resolveDateBoundary(endDate, { timeZone });
  if (!timeMin || !timeMax) throw new RangeError('local day boundary could not be resolved');
  return { timeZone: context.timeZone, startDate: context.localDate, endDate, timeMin, timeMax };
}

export function skipReason(event) {
  if (event?.status !== 'confirmed') return 'not_confirmed';
  if (SKIPPED_COLOR_IDS.includes(String(event.colorId ?? ''))) return 'gray_color';
  const title = String(event.title || '')
    .trim()
    .toUpperCase();
  if (SKIPPED_TITLE_PREFIXES.some((prefix) => title.startsWith(prefix))) return 'tentative_title';
  return null;
}

function localDateOf(boundary, timeZone) {
  if (boundary?.date) return boundary.date;
  return createTimeContext({ timeZone, now: boundary?.dateTime })?.localDate ?? null;
}

function describeWhen(boundary, timeZone) {
  if (boundary?.date)
    return new Date(`${boundary.date}T12:00:00Z`).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    });
  return new Date(boundary.dateTime).toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone,
  });
}

// All-day events sort first within their local day, then timed events by instant.
function sortKey(event) {
  return `${event.date} ${event.allDay ? '0' : `1${new Date(event.start.dateTime).toISOString()}`}`;
}

export function toMarketingEvent(event, timeZone = MARKETING_TIME_ZONE) {
  return {
    eventId: event.eventId,
    title: String(event.title || '').trim() || 'Untitled event',
    date: localDateOf(event.start, timeZone),
    allDay: Boolean(event.start?.date),
    when: describeWhen(event.start, timeZone),
    start: event.start,
    end: event.end,
    location: String(event.location || '').trim(),
    description: String(event.description || '').trim(),
    url: event.url,
    ...(event.colorId ? { colorId: event.colorId } : {}),
  };
}

// Reads the whole window through the client's bounded listEventsWindow. When a
// window hits its size bounds the range is split and both halves are re-read;
// events spanning a split point are deduplicated by event ID. A failed or
// bounded read is reported as incomplete instead of an empty calendar.
export async function readUpcomingMarketingEvents({
  client,
  now = new Date(),
  timeZone = MARKETING_TIME_ZONE,
  lookaheadDays = MARKETING_LOOKAHEAD_DAYS,
  signal,
} = {}) {
  if (!client?.configured || typeof client.listEventsWindow !== 'function')
    return { status: 'not_configured', events: [], coverage: { complete: false } };
  const window = upcomingWindow({ now, timeZone, lookaheadDays });
  const principal = {
    id: MARKETING_PRINCIPAL_ID,
    calendarAccess: true,
    calendarId: client.calendarId,
  };
  const found = new Map();
  let windows = 0;
  let incomplete = null;
  let failure = null;

  async function read(timeMin, timeMax, depth) {
    if (failure) return;
    if (signal?.aborted) {
      incomplete ??= 'aborted';
      return;
    }
    if (++windows > MAX_WINDOWS) {
      incomplete ??= 'window_limit';
      return;
    }
    const result = await client.listEventsWindow({
      timeMin,
      timeMax,
      limit: 25,
      principal,
      signal,
    });
    const span = Date.parse(timeMax) - Date.parse(timeMin);
    if (
      result?.status === 'partial' &&
      SPLITTABLE.has(result.coverage?.reason) &&
      depth < MAX_DEPTH &&
      span > 60000
    ) {
      const middle = new Date(Date.parse(timeMin) + Math.floor(span / 2)).toISOString();
      await read(timeMin, middle, depth + 1);
      await read(middle, timeMax, depth + 1);
      return;
    }
    if (result?.status !== 'ready' && result?.status !== 'partial') {
      failure = result?.status || 'invalid_response';
      return;
    }
    if (result.status === 'partial') incomplete ??= result.coverage?.reason || 'incomplete_window';
    for (const event of result.events ?? []) found.set(event.eventId, event);
  }

  await read(window.timeMin, window.timeMax, 0);
  // Access failures, or a failure before anything was read, withhold content
  // rather than returning a partial list that looks like an empty calendar.
  if (failure && (ACCESS_FAILURES.has(failure) || found.size === 0))
    return { status: failure, events: [], window, coverage: { complete: false } };
  if (failure) incomplete ??= failure;

  const skipped = {};
  const events = [];
  for (const event of found.values()) {
    const reason = skipReason(event);
    if (reason) skipped[reason] = (skipped[reason] ?? 0) + 1;
    else events.push(toMarketingEvent(event, window.timeZone));
  }
  events.sort((a, b) => sortKey(a).localeCompare(sortKey(b)) || a.title.localeCompare(b.title));
  return {
    status: incomplete ? 'partial' : 'ready',
    events,
    window,
    skipped,
    coverage: {
      complete: !incomplete,
      windowsRead: windows,
      ...(incomplete ? { reason: incomplete } : {}),
    },
  };
}
