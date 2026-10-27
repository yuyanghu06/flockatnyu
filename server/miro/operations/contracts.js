import { promptText } from '../../prompt-loader/index.js';
const id = { type: 'string', minLength: 1, maxLength: 200, pattern: '^[A-Za-z0-9_=-]+$' };
const integer = (minimum, maximum) => ({ type: 'integer', minimum, maximum });
const fragment = {
  offset: integer(0, 33554432),
  expectedHash: { type: 'string', pattern: '^[a-f0-9]{64}$', maxLength: 64 },
};
const scope = {
  type: 'object',
  additionalProperties: false,
  properties: {
    x: integer(-100000000, 100000000),
    y: integer(-100000000, 100000000),
    width: integer(1, 10000000),
    height: integer(1, 10000000),
  },
  required: ['x', 'y', 'width', 'height'],
};
const define = (name, description, properties, required = []) =>
  Object.freeze({
    name,
    description,
    parameters: { type: 'object', additionalProperties: false, properties, required },
  });
export const MIRO_MCP_TOOLS = Object.freeze([
  define('list_miro_boards', promptText('tools/miro/list_miro_boards#description'), {}),
  define(
    'read_miro_board',
    promptText('tools/miro/read_miro_board#description'),
    {
      boardId: id,
      mode: { type: 'string', enum: ['overview', 'search'] },
      patterns: {
        type: 'array',
        items: { type: 'string', minLength: 1, maxLength: 500 },
        minItems: 1,
        maxItems: 10,
      },
      resultMode: { type: 'string', enum: ['matches', 'areas'] },
      targetId: id,
      cursor: integer(0, 10000000),
      ...fragment,
    },
    ['boardId'],
  ),
  define(
    'read_miro_item',
    promptText('tools/miro/read_miro_item#description'),
    {
      boardId: id,
      itemId: id,
      itemIds: { type: 'array', items: id, minItems: 1, maxItems: 10 },
      type: { type: 'string', enum: ['canvas', 'table'] },
      scope,
      limit: integer(1, 10),
      cursor: { type: 'string', minLength: 1, maxLength: 8192 },
      ...fragment,
    },
    ['boardId', 'itemId', 'type'],
  ),
]);
