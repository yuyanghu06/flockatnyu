import { promptText } from '../prompt-loader/index.js';
// Legacy contracts below preserve immutable migrations023/024 verification.
// Runtime tools use the normalized event relationship schemas further below.
// Semantic checks remain the database/trusted tool's responsibility.
function deepFreeze(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

export const PRESENCE_DEFAULT_TTL_SECONDS = 7200;
export const PRESENCE_DEFAULT_POLICY = deepFreeze({
  seconds: PRESENCE_DEFAULT_TTL_SECONDS,
  appliesTo: 'explicit_current_self_report_without_end',
  anchoredTo: 'original_provider_report_timestamp',
  refreshRequires: 'newer_explicit_current_location_confirmation',
  meaning: 'freshness_cutoff_not_promised_departure',
  excludes: [
    'future_plans',
    'events',
    'activity_only_edits',
    'partial_edits_without_location_confirmation',
  ],
});

export const EVENT_DEFAULT_DURATION_SECONDS = 7200;
export const EVENT_DEFAULT_POLICY = deepFreeze({
  seconds: EVENT_DEFAULT_DURATION_SECONDS,
  appliesTo: 'timed_event_with_supported_start_and_missing_end',
  explicitEndOrDurationOverrides: true,
  preserveExistingEndOnPartialEdit: true,
  excludes: ['all_day_events', 'unknown_or_ambiguous_start', 'future_person_location_plans'],
});

const string = (description, bounds = {}) => ({ type: 'string', description, ...bounds });
const uuid = (description) =>
  string(promptText('tools/map/fields#uuid.text', { description: description }), {
    minLength: 36,
    maxLength: 36,
  });
const timestamp = (description) =>
  string(promptText('tools/map/fields#timestamp.text', { description: description }), {
    maxLength: 40,
  });
const sourceUrl = string(promptText('tools/map/fields#sourceurl.text'), {
  minLength: 9,
  maxLength: 2048,
});
const lengthNote = promptText('tools/map/fields#lengthnote.text');

export const PEOPLE_HERE_ENTRY_SCHEMA = deepFreeze({
  type: 'object',
  description: promptText('tools/map/fields#people_here_entry_schema.description', {
    lengthNote: lengthNote,
  }),
  additionalProperties: false,
  required: ['person_id', 'status', 'valid_from', 'expires_at', 'source_id', 'source_url', 'label'],
  properties: {
    person_id: uuid(promptText('tools/map/fields#people_here_entry_schema.person_id')),
    status: {
      type: 'string',
      enum: ['self_reported', 'planned'],
      description: promptText('tools/map/fields#people_here_entry_schema.status.description'),
    },
    valid_from: timestamp(promptText('tools/map/fields#people_here_entry_schema.valid_from')),
    expires_at: timestamp(promptText('tools/map/fields#people_here_entry_schema.expires_at')),
    source_id: uuid(promptText('tools/map/fields#people_here_entry_schema.source_id')),
    source_url: sourceUrl,
    label: string(promptText('tools/map/fields#people_here_entry_schema.label'), {
      minLength: 0,
      maxLength: 200,
    }),
  },
});

export const PEOPLE_HERE_SCHEMA = deepFreeze({
  type: 'array',
  maxItems: 500,
  description: promptText('tools/map/fields#people_here_schema.description'),
  items: PEOPLE_HERE_ENTRY_SCHEMA,
});

export const SCHEDULED_EVENT_ENTRY_SCHEMA = deepFreeze({
  type: 'object',
  description: promptText('tools/map/fields#scheduled_event_entry_schema.description', {
    lengthNote: lengthNote,
  }),
  additionalProperties: false,
  required: [
    'id',
    'title',
    'starts_at',
    'ends_at',
    'time_zone',
    'all_day',
    'status',
    'source_id',
    'source_url',
  ],
  properties: {
    id: string(promptText('tools/map/fields#scheduled_event_entry_schema.id'), {
      minLength: 1,
      maxLength: 200,
    }),
    title: string(promptText('tools/map/fields#scheduled_event_entry_schema.title'), {
      minLength: 1,
    }),
    starts_at: timestamp(promptText('tools/map/fields#scheduled_event_entry_schema.starts_at')),
    ends_at: timestamp(promptText('tools/map/fields#scheduled_event_entry_schema.ends_at')),
    time_zone: string(promptText('tools/map/fields#scheduled_event_entry_schema.time_zone')),
    all_day: {
      type: 'boolean',
      description: promptText('tools/map/fields#scheduled_event_entry_schema.all_day.description'),
    },
    status: {
      type: 'string',
      enum: ['confirmed', 'tentative', 'cancelled'],
      description: promptText('tools/map/fields#scheduled_event_entry_schema.status.description'),
    },
    source_id: uuid(promptText('tools/map/fields#scheduled_event_entry_schema.source_id')),
    source_url: sourceUrl,
    description: string(promptText('tools/map/fields#scheduled_event_entry_schema.description.2'), {
      maxLength: 4000,
    }),
    location: string(promptText('tools/map/fields#scheduled_event_entry_schema.location'), {
      maxLength: 500,
    }),
    url: string(promptText('tools/map/fields#scheduled_event_entry_schema.url'), {
      maxLength: 2048,
    }),
  },
});

export const SCHEDULED_EVENTS_SCHEMA = deepFreeze({
  type: 'array',
  maxItems: 200,
  description: promptText('tools/map/fields#scheduled_events_schema.description'),
  items: SCHEDULED_EVENT_ENTRY_SCHEMA,
});

// Normalized event records supersede the legacy JSON building-column contracts above.
export const EVENT_TYPE_CODES = Object.freeze(['study', 'meeting', 'event', 'social', 'other']);
const object = (properties, required) => ({
  type: 'object',
  additionalProperties: false,
  properties,
  required,
});
export const MAP_EVENT_SCHEMA = deepFreeze(
  object(
    {
      id: uuid(promptText('tools/map/fields#map_event_schema.id')),
      name: string(promptText('tools/map/fields#map_event_schema.name'), {
        minLength: 1,
        maxLength: 400,
      }),
      notes: string(promptText('tools/map/fields#map_event_schema.notes'), { maxLength: 8000 }),
      kind: { type: 'string', enum: ['presence', 'personal_plan', 'scheduled_event'] },
      type_id: {
        type: 'string',
        enum: EVENT_TYPE_CODES,
        description: promptText('tools/map/fields#map_event_schema.type_id.description'),
      },
      status: { type: 'string', enum: ['confirmed', 'tentative', 'cancelled', 'superseded'] },
      time_kind: { type: 'string', enum: ['timed', 'all_day', 'unknown'] },
      starts_at: timestamp(promptText('tools/map/fields#map_event_schema.starts_at')),
      ends_at: timestamp(promptText('tools/map/fields#map_event_schema.ends_at')),
      starts_on: string(promptText('tools/map/fields#map_event_schema.starts_on'), {
        maxLength: 10,
      }),
      ends_on: string(promptText('tools/map/fields#map_event_schema.ends_on'), { maxLength: 10 }),
      time_zone: string(promptText('tools/map/fields#map_event_schema.time_zone'), {
        maxLength: 100,
      }),
      source_id: uuid(promptText('tools/map/fields#map_event_schema.source_id')),
      source_url: sourceUrl,
      source_record_id: string(promptText('tools/map/fields#map_event_schema.source_record_id'), {
        minLength: 1,
        maxLength: 200,
      }),
      url: string(promptText('tools/map/fields#map_event_schema.url'), { maxLength: 2048 }),
      reported_at: timestamp(promptText('tools/map/fields#map_event_schema.reported_at')),
    },
    [
      'name',
      'notes',
      'kind',
      'type_id',
      'status',
      'time_kind',
      'time_zone',
      'source_id',
      'source_url',
      'source_record_id',
      'reported_at',
    ],
  ),
);
export const EVENT_BUILDINGS_SCHEMA = deepFreeze({
  type: 'array',
  maxItems: 100,
  description: promptText('tools/map/fields#event_buildings_schema.description'),
  items: object(
    {
      building_id: string(promptText('tools/map/fields#event_buildings_schema.building_id'), {
        minLength: 1,
        maxLength: 120,
      }),
      location_notes: string(promptText('tools/map/fields#event_buildings_schema.location_notes'), {
        maxLength: 500,
      }),
    },
    ['building_id', 'location_notes'],
  ),
});
export const EVENT_PEOPLE_SCHEMA = deepFreeze({
  type: 'array',
  maxItems: 500,
  description: promptText('tools/map/fields#event_people_schema.description'),
  items: object(
    {
      person_id: uuid(promptText('tools/map/fields#event_people_schema.person_id')),
      attendance_status: { type: 'string', enum: ['going', 'tentative', 'declined'] },
      presence_basis: { type: 'string', enum: ['planned', 'reported'] },
      label: string(promptText('tools/map/fields#event_people_schema.label'), { maxLength: 400 }),
      starts_at: timestamp(promptText('tools/map/fields#event_people_schema.starts_at')),
      ends_at: timestamp(promptText('tools/map/fields#event_people_schema.ends_at')),
      source_id: uuid(promptText('tools/map/fields#event_people_schema.source_id')),
      source_url: sourceUrl,
      reported_at: timestamp(promptText('tools/map/fields#event_people_schema.reported_at')),
    },
    [
      'person_id',
      'attendance_status',
      'presence_basis',
      'label',
      'source_id',
      'source_url',
      'reported_at',
    ],
  ),
});
export const MAP_RECORD_CONTRACTS = deepFreeze({
  events: MAP_EVENT_SCHEMA,
  event_buildings: EVENT_BUILDINGS_SCHEMA,
  event_people: EVENT_PEOPLE_SCHEMA,
});
export const MAP_RECORD_EXAMPLES = deepFreeze({
  syntheticOnly: true,
  event: {
    name: 'Studying',
    notes: '',
    kind: 'presence',
    type_id: 'study',
    status: 'confirmed',
    time_kind: 'timed',
    starts_at: '2026-10-17T14:00:00-04:00',
    ends_at: '2026-10-17T16:00:00-04:00',
    time_zone: 'America/New_York',
    source_id: '00000000-0000-0000-0000-000000000002',
    source_url: 'https://example.invalid/messages/presence-example',
    source_record_id: 'example:message:123',
    reported_at: '2026-10-17T14:00:00-04:00',
  },
  buildings: [{ building_id: 'bobst-library', location_notes: '' }],
  people: [
    {
      person_id: '00000000-0000-0000-0000-000000000001',
      attendance_status: 'going',
      presence_basis: 'reported',
      label: 'studying',
      source_id: '00000000-0000-0000-0000-000000000002',
      source_url: 'https://example.invalid/messages/presence-example',
      reported_at: '2026-10-17T14:00:00-04:00',
    },
  ],
});

export function buildMapRecordPrompt() {
  return promptText('legacy/map-records#instructions', {
    MAP_RECORD_CONTRACTS: JSON.stringify(MAP_RECORD_CONTRACTS),
    PRESENCE_DEFAULT_POLICY: JSON.stringify(PRESENCE_DEFAULT_POLICY),
    EVENT_DEFAULT_POLICY: JSON.stringify(EVENT_DEFAULT_POLICY),
    MAP_RECORD_EXAMPLES: JSON.stringify(MAP_RECORD_EXAMPLES),
  });
}
