import { promptText } from '../prompt-loader/index.js';
import { normalizeMemberPlanBoundary } from '../automation/local-clock-boundary.js';
import { canonicalTimeZone } from '../shared/time-zone.js';
import { timestamp, eventWindow } from './events.js';

export class ChatMapTimeError extends Error {
  constructor(reason) {
    super(reason);
    this.reason = reason;
  }
}
const fail = (reason) => {
  throw new ChatMapTimeError(reason);
};
const localClock = {
  type: 'string',
  minLength: 19,
  maxLength: 23,
  description: promptText('tools/map/chat-fields#local-clock'),
};

// Only chat changes its input contract. Shared map storage and worker tools keep
// their explicit-offset timestamps, including byte-exact existing microseconds.
export function chatMapTimeSchema(schema) {
  return {
    ...schema,
    properties: {
      ...schema.properties,
      starts_at: {
        ...schema.properties.starts_at,
        description: promptText('tools/map/chat-fields#starts-at-preservation'),
      },
      ends_at: {
        ...schema.properties.ends_at,
        description: promptText('tools/map/chat-fields#ends-at-preservation'),
      },
      starts_local: { ...localClock },
      ends_local: { ...localClock },
    },
  };
}

export function normalizeChatMapTimes(
  row,
  { current, timeZone, timeKind, trustedPresenceStart } = {},
) {
  const result = { ...row };
  for (const key of ['starts', 'ends']) {
    const raw = `${key}_at`,
      local = `${key}_local`;
    if (row[local] !== undefined) {
      if (row[raw] !== undefined) fail('map_time_conflicting_boundaries');
      if (timeKind !== 'timed') fail('map_time_requires_timed_event');
      try {
        result[raw] = normalizeMemberPlanBoundary({ localDateTime: row[local], timeZone }).dateTime;
      } catch {
        fail('map_time_invalid_or_ambiguous_local_clock');
      }
    } else if (
      row[raw] !== undefined &&
      row[raw] !== current?.[raw] &&
      !(key === 'starts' && trustedPresenceStart !== undefined && row[raw] === trustedPresenceStart)
    ) {
      fail('map_time_requires_local_clock');
    }
    delete result[local];
  }
  return result;
}

function localInstant(raw, timeZone) {
  const at = timestamp(raw);
  if (at === null) return null;
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone,
      calendar: 'iso8601',
      numberingSystem: 'latn',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(new Date(at))
      .map((part) => [part.type, part.value]),
  );
  const clock = `${parts.year.padStart(4, '0')}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
  const offsetSeconds = Math.round((Date.parse(`${clock}Z`) - Math.floor(at / 1000) * 1000) / 1000);
  const absolute = Math.abs(offsetSeconds),
    hours = String(Math.floor(absolute / 3600)).padStart(2, '0'),
    minutes = String(Math.floor((absolute % 3600) / 60)).padStart(2, '0');
  const seconds = absolute % 60,
    offset = `${offsetSeconds < 0 ? '-' : '+'}${hours}:${minutes}${seconds ? `:${String(seconds).padStart(2, '0')}` : ''}`;
  const fraction = /\.(\d{1,6})(?:Z|[+-])/.exec(raw)?.[1];
  return {
    clock: `${clock}${fraction ? `.${fraction}` : ''}${offset}`,
    label: new Intl.DateTimeFormat('en-US', {
      timeZone,
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short',
    }).format(new Date(at)),
  };
}

// Display-only: never pass these hints to storage or use them as raw-copy proof.
export function chatMapLocalDisplay(event, participant, requestTimeZone) {
  const timeZone = canonicalTimeZone(requestTimeZone ?? event.time_zone);
  if (!timeZone) return undefined;
  if (
    event.time_kind === 'all_day' &&
    participant?.starts_at == null &&
    participant?.ends_at == null
  )
    return { time_zone: event.time_zone, starts_on: event.starts_on, ends_on: event.ends_on };
  if (event.time_kind !== 'timed' && event.time_kind !== 'all_day') return undefined;
  const allDay = event.time_kind === 'all_day' ? eventWindow(event) : null;
  const starts = localInstant(
      participant?.starts_at ??
        event.starts_at ??
        (allDay ? new Date(allDay.start).toISOString() : undefined),
      timeZone,
    ),
    ends = localInstant(
      participant?.ends_at ??
        event.ends_at ??
        (allDay ? new Date(allDay.end).toISOString() : undefined),
      timeZone,
    );
  return starts || ends
    ? {
        time_zone: timeZone,
        ...(starts ? { starts_at: starts.clock, starts_label: starts.label } : {}),
        ...(ends ? { ends_at: ends.clock, ends_label: ends.label } : {}),
      }
    : undefined;
}

export function projectChatMapLocalDisplay(value) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    typeof value.time_zone !== 'string' ||
    !canonicalTimeZone(value.time_zone)
  )
    return undefined;
  const result = { time_zone: value.time_zone };
  for (const key of ['starts_at', 'ends_at']) {
    if (value[key] !== undefined) {
      if (
        typeof value[key] !== 'string' ||
        !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?[+-]\d\d:\d\d(?::\d\d)?$/.test(value[key])
      )
        return undefined;
      result[key] = value[key];
    }
  }
  for (const key of ['starts_on', 'ends_on'])
    if (value[key] !== undefined) {
      if (typeof value[key] !== 'string' || !/^\d{4}-\d\d-\d\d$/.test(value[key])) return undefined;
      result[key] = value[key];
    }
  for (const key of ['starts_label', 'ends_label'])
    if (value[key] !== undefined) {
      if (
        typeof value[key] !== 'string' ||
        value[key].length > 100 ||
        /[\x00-\x1f\x7f]/.test(value[key])
      )
        return undefined;
      result[key] = value[key];
    }
  return Object.keys(result).length > 1 ? result : undefined;
}
