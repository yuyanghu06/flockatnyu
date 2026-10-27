// Existing chat tool/source budgets and operation allowlists; values are unchanged by file organization.
import { MAP_WRITE_VALIDATION_FIELDS } from '../map/events.js';

export const denied = new Set([
  'forbidden',
  'permission_denied',
  'access_denied',
  'channel_scope_denied',
]);
export const maxSources = 12,
  maxExcerpt = 1800,
  maxExcerptChars = 12000;
export const maxToolCalls = 30,
  maxPlanningRounds = 30;
export const calendarWriteNames = new Set([
  'create_calendar_events',
  'update_calendar_events',
  'create_calendar_event',
  'update_calendar_event',
  'delete_calendar_event',
]);
export const contactToolNames = new Set([
  'search_contacts',
  'read_contact',
  'create_contact',
  'update_contact',
  'delete_contact',
]);
export const contactWriteOperations = {
  create_contact: 'created',
  update_contact: 'updated',
  delete_contact: 'deleted',
};
export const optionalMapTimeFields = new Set(['starts_at', 'ends_at', 'starts_on', 'ends_on']);
export const safeMapFailureReasons = new Set([
  ...Object.keys(MAP_WRITE_VALIDATION_FIELDS),
  'invalid',
  'invalid_request',
  'conflict',
  'read_required',
  'forbidden',
  'permission_denied',
  'access_denied',
  'not_configured',
  'unavailable',
  'aborted',
  'write_outcome_unknown',
  'map_time_conflicting_boundaries',
  'map_time_requires_timed_event',
  'map_time_invalid_or_ambiguous_local_clock',
  'map_time_requires_local_clock',
  'source_already_written_read_existing_event',
]);
