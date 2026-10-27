import { promptText } from '../../prompt-loader/index.js';
const object = { type: 'string', minLength: 1, maxLength: 64, pattern: '^[a-z0-9_]{1,64}$' };
const recordId = { type: 'string', minLength: 36, maxLength: 36, pattern: '^[A-Fa-f0-9-]{36}$' };
const values = {
  type: 'object',
  properties: {},
  additionalProperties: true,
  description: promptText('tools/attio/fields#values.description'),
};
const define = (name, description, properties, required, readOnly = true) =>
  Object.freeze({
    name,
    description,
    readOnly,
    parameters: { type: 'object', additionalProperties: false, properties, required },
  });
export const ATTIO_TOOLS = Object.freeze([
  define(
    'search_attio_records',
    promptText('tools/attio/search_attio_records#description'),
    {
      object,
      query: { type: 'string', minLength: 1, maxLength: 256 },
      limit: { type: 'integer', minimum: 1, maximum: 20 },
    },
    ['object', 'query'],
  ),
  define(
    'read_attio_record',
    promptText('tools/attio/read_attio_record#description'),
    { object, recordId },
    ['object', 'recordId'],
  ),
  define(
    'list_attio_attributes',
    promptText('tools/attio/list_attio_attributes#description'),
    { object },
    ['object'],
  ),
  define(
    'create_attio_record',
    promptText('tools/attio/create_attio_record#description'),
    { object, values },
    ['object', 'values'],
    false,
  ),
  define(
    'update_attio_record',
    promptText('tools/attio/update_attio_record#description'),
    { object, recordId, values },
    ['object', 'recordId', 'values'],
    false,
  ),
]);
