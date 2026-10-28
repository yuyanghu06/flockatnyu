import { createHash } from 'node:crypto';
import { canonicalJson } from './validation.js';
import { validCalendarInstant } from '../google/calendar-client.js';
import { eventWindow } from '../map/events.js';

const instant = (value) => (validCalendarInstant(value) ? new Date(value).toISOString() : null);
export const calendarMapEventFields = [
  'id',
  'name',
  'notes',
  'kind',
  'type_id',
  'status',
  'time_kind',
  'starts_at',
  'ends_at',
  'starts_on',
  'ends_on',
  'time_zone',
  'source_id',
  'source_url',
  'source_record_id',
  'url',
  'reported_at',
];
const pick = (row, keys) =>
  Object.fromEntries(keys.filter((key) => key in row).map((key) => [key, row[key]]));
const stableId = (sourceId, eventId) => {
  const hex = createHash('sha256')
    .update(canonicalJson([sourceId, eventId]))
    .digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
};
export function calendarMapName(original, old) {
  const title =
    typeof original?.title === 'string' && original.title.trim()
      ? original.title
      : typeof old?.name === 'string' && old.name.trim()
        ? old.name
        : 'Calendar event';
  return [...title].slice(0, 200).join('');
}

// Pure extraction of the existing event projection. Source identity, times,
// cancellation and saved fields are unchanged by location matching policy.
export function projectCalendarEvent(original, target, old) {
  const cancelled = original.status === 'cancelled';
  const report = instant(original.updatedAt) || instant(original.createdAt);
  if (!old && cancelled) return null;
  if (!report && !cancelled) throw Error('missing_calendar_timestamp');
  const location = typeof original.location === 'string' ? original.location : '';
  const notes = [original.description || '', location ? `Location: ${location}` : '']
    .filter(Boolean)
    .join('\n\n');
  const event = {
    ...(old ? pick(old, calendarMapEventFields) : {}),
    id: old?.id || stableId(target.sourceId, original.eventId),
    name: calendarMapName(original, old),
    notes: notes.slice(0, 4000),
    kind:
      target.kind === 'member'
        ? original.memberPlan?.activityKind || old?.kind || 'personal_plan'
        : 'scheduled_event',
    type_id: old?.type_id || original.memberPlan?.typeId || 'other',
    status: cancelled ? 'cancelled' : original.status === 'tentative' ? 'tentative' : 'confirmed',
    starts_at: null,
    ends_at: null,
    starts_on: null,
    ends_on: null,
    time_zone: original.start?.timeZone || old?.time_zone || 'America/New_York',
    source_id: target.sourceId,
    source_url: original.url,
    source_record_id: original.eventId,
    url: original.url,
    reported_at: report || old.reported_at,
  };
  if (cancelled && (!original.start || !original.end))
    return { ...old, status: 'cancelled', reported_at: report || old.reported_at };
  if (original.start?.date && original.end?.date) {
    event.time_kind = 'all_day';
    event.starts_on = original.start.date;
    event.ends_on = original.end.date;
  } else {
    event.time_kind = 'timed';
    event.starts_at = instant(original.start?.dateTime);
    event.ends_at = instant(original.end?.dateTime);
  }
  if (!eventWindow(event)) throw Error('invalid_calendar_time');
  return event;
}
