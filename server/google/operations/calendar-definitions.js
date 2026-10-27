import { promptText } from '../../prompt-loader/index.js';
const string = (maxLength) => ({ type: 'string', maxLength });
const source = {
  sourceKey: {
    ...string(615),
    minLength: 1,
    description: promptText('tools/calendar/fields#source.sourcekey.description'),
  },
  sourceUrl: {
    ...string(1200),
    minLength: 1,
    description: promptText('tools/calendar/fields#source.sourceurl.description'),
  },
};
const boundary = {
  type: 'object',
  additionalProperties: false,
  properties: {
    date: {
      ...string(10),
      description: promptText('tools/calendar/fields#boundary.date.description'),
    },
    dateTime: {
      ...string(40),
      description: promptText('tools/calendar/fields#boundary.datetime.description'),
    },
    timeZone: {
      ...string(100),
      description: promptText('tools/calendar/fields#boundary.timezone.description'),
    },
  },
  required: [],
};
const definition = (name, description, properties, required, readOnly = false) =>
  Object.freeze({
    name,
    description,
    parameters: { type: 'object', additionalProperties: false, properties, required },
    ...(readOnly ? { readOnly: true } : { idempotent: true }),
  });
export const CALENDAR_TOOLS = Object.freeze([
  definition(
    'list_calendar_events',
    promptText('tools/calendar/list_calendar_events#description'),
    {
      timeMin: { ...string(40), minLength: 1 },
      timeMax: { ...string(40), minLength: 1 },
      query: { ...string(300), minLength: 1 },
      resultMode: { type: 'string', enum: ['full', 'identities'] },
      limit: { type: 'integer', minimum: 1, maximum: 25 },
    },
    ['timeMin', 'timeMax'],
    true,
  ),
  definition(
    'read_calendar_event',
    promptText('tools/calendar/read_calendar_event#description'),
    { eventId: { ...string(1024), minLength: 5 } },
    ['eventId'],
    true,
  ),
  definition(
    'upsert_calendar_event',
    promptText('tools/calendar/upsert_calendar_event#description'),
    {
      ...source,
      title: { ...string(300), minLength: 1 },
      description: string(3000),
      location: string(500),
      start: boundary,
      end: boundary,
    },
    ['sourceKey', 'sourceUrl', 'title', 'start', 'end'],
  ),
  definition(
    'cancel_calendar_event',
    promptText('tools/calendar/cancel_calendar_event#description'),
    source,
    ['sourceKey', 'sourceUrl'],
  ),
]);
