import { promptText } from '../../prompt-loader/index.js';
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
  define('read_map_events', promptText('tools/map/read_map_events#description'), {
    eventId: text(36),
    sourceId: text(36),
    sourceRecordId: text(200),
  }),
  define(
    'lookup_map_person',
    promptText('tools/map/lookup_map_person#description'),
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
    promptText('tools/map/upsert_map_event#description'),
    {
      event: MAP_EVENT_SCHEMA,
      buildings: EVENT_BUILDINGS_SCHEMA,
      people: EVENT_PEOPLE_SCHEMA,
      expectedUpdatedAt: {
        ...text(40),
        description: promptText('tools/map/upsert_map_event#expectedupdatedat.description'),
      },
    },
    ['event', 'buildings', 'people'],
    false,
  ),
]);
