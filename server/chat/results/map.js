import { projectChatMapLocalDisplay } from '../../map/chat-time.js';
import { MAP_WRITE_VALIDATION_FIELDS, uuid, timestamp } from '../../map/events.js';

import { optionalMapTimeFields, safeMapFailureReasons } from '../constants.js';

export function projectMapResult({ data, name, args, result, schemaFailure }) {
  if (name === 'read_map_events' && result?.status === 'ready') {
    const fields = {
      events: [
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
        'created_at',
        'updated_at',
      ],
      event_buildings: ['event_id', 'building_id', 'location_notes'],
      event_people: [
        'event_id',
        'person_id',
        'attendance_status',
        'presence_basis',
        'label',
        'starts_at',
        'ends_at',
        'source_id',
        'source_url',
        'reported_at',
        'created_at',
        'updated_at',
      ],
      buildings: ['id', 'name'],
      people: ['id', 'display_name', 'avatar_url', 'is_trackable'],
      event_types: ['code', 'name', 'description', 'icon_key', 'sort_order'],
    };
    const snapshot = {};
    let complete = true;
    for (const [key, keys] of Object.entries(fields)) {
      if (!Array.isArray(result[key])) {
        complete = false;
        break;
      }
      snapshot[key] = result[key].map((row) => {
        // Null time fields mean omitted dates or inherited participant bounds.
        // Keep the private read snapshot exact; expose copyable input fields.
        const projected = Object.fromEntries(
          keys
            .filter(
              (field) =>
                row &&
                !(optionalMapTimeFields.has(field) && row[field] === null) &&
                (['string', 'boolean', 'number'].includes(typeof row[field]) ||
                  row[field] === null),
            )
            .map((field) => [field, row[field]]),
        );
        const displayKey =
          key === 'events'
            ? 'local_display'
            : key === 'event_people'
              ? 'effective_local_display'
              : null;
        const display = displayKey && projectChatMapLocalDisplay(row?.[displayKey]);
        if (display) projected[displayKey] = display;
        return projected;
      });
    }
    // Never present sliced relationships as a complete snapshot suitable for upsert.
    if (complete && Buffer.byteLength(JSON.stringify(snapshot)) <= 64000)
      data.mapContext = { ...snapshot, complete: true };
    else {
      data.mapContext = {
        complete: false,
        reason: complete ? 'snapshot_too_large_use_event_or_source_filter' : 'incomplete_snapshot',
      };
      data.possiblyTruncated = true;
    }
  }
  if (name === 'lookup_map_person' && result?.status === 'ready') {
    data.mapPerson = result.person
      ? Object.fromEntries(
          ['id', 'display_name', 'avatar_url', 'is_trackable']
            .filter((key) => ['string', 'boolean'].includes(typeof result.person[key]))
            .map((key) => [key, result.person[key]]),
        )
      : null;
  }
  if (
    name === 'upsert_map_event' &&
    !(
      result?.status === 'ready' &&
      result.sourceStatus === 'applied' &&
      uuid(result.event_id) &&
      typeof result.updated_at === 'string'
    )
  ) {
    const reason = safeMapFailureReasons.has(result?.reason)
      ? result.reason
      : safeMapFailureReasons.has(result?.status)
        ? result.status
        : 'write_outcome_unknown';
    const field = MAP_WRITE_VALIDATION_FIELDS[reason];
    data.mapFailure = {
      outcome: [
        'invalid',
        'invalid_request',
        'conflict',
        'read_required',
        'forbidden',
        'permission_denied',
        'access_denied',
        'not_configured',
      ].includes(result?.status)
        ? 'unsaved'
        : 'unconfirmed',
      ...(uuid(args?.event?.id) ? { attemptedEventId: args.event.id } : {}),
      reason,
      ...(field ? { field } : {}),
    };
    if (!field && schemaFailure)
      data.mapFailure = {
        ...data.mapFailure,
        field: schemaFailure.field,
        validation: schemaFailure.keyword,
      };
    if (
      ['people', 'buildings'].includes(field) &&
      Array.isArray(args?.[field]) &&
      Array.isArray(result?.indices) &&
      result.indices.length > 0 &&
      result.indices.length <= 2 &&
      result.indices.every(
        (index) =>
          Number.isInteger(index) &&
          index >= 0 &&
          index < Math.min(args[field].length, field === 'buildings' ? 100 : 500),
      )
    )
      data.mapFailure.indices = [...result.indices];
    const comparison = result?.readComparison;
    if (
      result?.status === 'invalid' &&
      ['duplicate_participant_ids', 'duplicate_building_ids'].includes(reason) &&
      comparison?.deduplicatedMatchesRead === true &&
      comparison.basis === 'request_local_authorized_read' &&
      timestamp(comparison.readVersion) !== null &&
      comparison.readVersion === args?.expectedUpdatedAt
    )
      data.mapFailure.readComparison = {
        deduplicatedMatchesRead: true,
        basis: 'request_local_authorized_read',
        readVersion: comparison.readVersion,
      };
  }
  if (
    name === 'upsert_map_event' &&
    result?.status === 'ready' &&
    result.sourceStatus === 'applied' &&
    typeof result.event_id === 'string' &&
    typeof result.updated_at === 'string'
  ) {
    data.mapWrite = {
      outcome: 'applied',
      eventId: result.event_id.slice(0, 36),
      updatedAt: result.updated_at.slice(0, 40),
    };
    const submitted = result.mapSubmission;
    if (
      submitted?.confirmedApplied === true &&
      submitted.basis === 'submitted_values_not_readback' &&
      submitted.event?.id === result.event_id &&
      Array.isArray(submitted.buildings) &&
      Array.isArray(submitted.people) &&
      typeof submitted.complete === 'boolean' &&
      Buffer.byteLength(JSON.stringify(submitted)) <= 32000
    )
      data.mapWrite.submitted = JSON.parse(JSON.stringify(submitted));
  }
}
