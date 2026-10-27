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
  define(
    'list_miro_boards',
    'List only the server-authorized board catalogue. This is navigation metadata, not live content or Calendar write evidence.',
    {},
  ),
  define(
    'read_miro_board',
    'Read live Miro MCP navigation: overview lists containers; mode=search finds related patterns (e.g. HP) together using resultMode=matches or areas. Search includes native grids/table content, but an empty date search does not mean no calendar events: dates may be separate day cells. For date questions, first search the exact month/year heading using patterns=["<requested month and year>"] and resultMode=areas (substitute the requested month/year), then verify the returned section and calendar grid with read_miro_item(type=canvas). Duplicate month labels can belong to different calendars; use live section headings and spatial bounds. Overview samples may omit required frames; repeated-title summaries have no IDs. Conflicting outer/inner years require corroboration; neither alone resolves the date. Search alone is not event evidence. Follow nextCursor and fragment continuations; no whole-board completeness claim.',
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
    'Read actual Miro MCP content. type=canvas: omit limit/cursor; returns inert SVG containing the item plus surrounding calendar grid/date headings; itemIds can select several related notes together, or scope narrows a large frame. type=table: omit scope/itemIds; use limit/cursor. Reads native data-table columns and rows with stable rowId (use canvas for calendar grids). Follow table nextCursor or JSON fragment nextOffset/expectedHash without changing arguments. Only concrete content-backed sourceKey values authorize later writes; never use a frame/table identity for multiple events.',
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
