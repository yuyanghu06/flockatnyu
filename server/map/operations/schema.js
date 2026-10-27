import { MAP_EVENT_SCHEMA, EVENT_BUILDINGS_SCHEMA, EVENT_PEOPLE_SCHEMA } from '../contracts.js';
const text = (maxLength) => ({ type: 'string', minLength: 1, maxLength });
const define = (name, description, properties, required = [], readOnly = true) =>
  Object.freeze({
    name,
    description,
    parameters: { type: 'object', additionalProperties: false, properties, required },
    ...(readOnly ? { readOnly: true } : { idempotent: true }),
  });
export const MAP_TOOLS = Object.freeze([
  define(
    'read_map_events',
    'Read saved database map events within the current source grants; this tool never fetches provider originals. Return complete relationships, fixed buildings, safe trackable people and the full read-only event_types catalogue even when event filters match nothing. An unfiltered call covers all events; reuse that result when reconciling multiple records instead of reading once per event. Choose an existing type_id from source evidence, other when unknown; preserve existing type on unrelated edits. Read before updating, retain updated_at for expectedUpdatedAt; merge partial evidence into a complete snapshot. Optional filters select an event or stable source identity for targeted rereads.',
    { eventId: text(36), sourceId: text(36), sourceRecordId: text(200) },
  ),
  define(
    'lookup_map_person',
    'Resolve one EXISTING trackable person by exact linked Discord user ID or email, by reading the saved map roster only. Source fields identify local scope; this tool does not fetch originals. No name matching, guesses, profile creation or relinking.',
    {
      provider: { type: 'string', enum: ['discord', 'email'] },
      providerUserId: text(320),
      sourceId: text(36),
      sourceUrl: text(2048),
    },
    ['provider', 'providerUserId', 'sourceId', 'sourceUrl'],
  ),
  define(
    'upsert_map_event',
    'Atomically create or update ONE normalized event and its complete building/people relationships. First read and merge existing state. For existing records send event.id inside event and expectedUpdatedAt as a TOP-LEVEL sibling of event/buildings/people, copied from the parent event.updated_at; omit token for creation. Stable source_record_id prevents duplicates. Every participant displays at every linked building; overlaps allowed. No profile/building creation or cross-event removal. Conflicts require reread, never a new identity.',
    {
      event: MAP_EVENT_SCHEMA,
      buildings: EVENT_BUILDINGS_SCHEMA,
      people: EVENT_PEOPLE_SCHEMA,
      expectedUpdatedAt: {
        ...text(40),
        description:
          'For updates, put this at the TOP LEVEL beside event, buildings and people. Copy the parent event.updated_at exactly. Never put expectedUpdatedAt inside event.',
      },
    },
    ['event', 'buildings', 'people'],
    false,
  ),
]);
