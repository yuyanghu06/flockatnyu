import { promptText } from '../../prompt-loader/index.js';
import {
  DRIVE_PAGE_TOKEN_MAX_LENGTH,
  DRIVE_PAGE_TOKEN_PATTERN,
} from '../../automation/validation.js';
const query = { type: 'string', minLength: 1, maxLength: 500 };
const limit = { type: 'integer', minimum: 1, maximum: 5 };
const driveId = { type: 'string', pattern: '^[A-Za-z0-9_-]{1,200}$' };
const pageToken = {
  type: 'string',
  minLength: 1,
  maxLength: DRIVE_PAGE_TOKEN_MAX_LENGTH,
  pattern: DRIVE_PAGE_TOKEN_PATTERN,
};
const definition = (name, description, properties, required) =>
  Object.freeze({
    name,
    description,
    parameters: { type: 'object', additionalProperties: false, properties, required },
  });
export const GOOGLE_TOOLS = Object.freeze([
  definition('search_gmail', promptText('tools/gmail/search_gmail#description'), { query, limit }, [
    'query',
  ]),
  definition(
    'read_gmail',
    promptText('tools/gmail/read_gmail#description'),
    { messageId: { type: 'string', pattern: '^[a-fA-F0-9]{1,64}$' } },
    ['messageId'],
  ),
  definition(
    'search_drive',
    promptText('tools/drive/search_drive#description'),
    { query, limit, folderId: driveId, pageToken },
    ['query'],
  ),
  definition('read_drive', promptText('tools/drive/read_drive#description'), { fileId: driveId }, [
    'fileId',
  ]),
  definition(
    'list_drive_folder',
    promptText('tools/drive/list_drive_folder#description'),
    { folderId: driveId, pageToken, limit: { type: 'integer', minimum: 1, maximum: 50 } },
    ['folderId'],
  ),
]);
