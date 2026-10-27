import { promptText } from '../../prompt-loader/index.js';
import { CONTACT_FIELDS } from '../store.js';
import { CONTACT_SEARCH_PROPERTIES } from '../search.js';
const fields = {
  type: 'object',
  additionalProperties: false,
  properties: Object.fromEntries(
    Object.entries(CONTACT_FIELDS).map(([name, maxLength]) => [
      name,
      { type: 'string', maxLength },
    ]),
  ),
};
const contactId = { type: 'string', minLength: 36, maxLength: 36 };
const expectedUpdatedAt = { type: 'string', minLength: 1, maxLength: 50 };
const define = (name, description, properties, required = [], readOnly = true) =>
  Object.freeze({
    name,
    description,
    readOnly,
    parameters: { type: 'object', additionalProperties: false, properties, required },
  });
export const CONTACT_TOOLS = Object.freeze([
  define(
    'search_contacts',
    promptText('tools/contacts/search_contacts#description'),
    CONTACT_SEARCH_PROPERTIES,
  ),
  define('read_contact', promptText('tools/contacts/read_contact#description'), { contactId }, [
    'contactId',
  ]),
  define(
    'import_treg_contacts',
    promptText('tools/contacts/import_treg_contacts#description'),
    {
      resultIds: {
        type: 'array',
        minItems: 1,
        maxItems: 10,
        items: { type: 'string', minLength: 36, maxLength: 36 },
      },
    },
    ['resultIds'],
    false,
  ),
  define(
    'create_contact',
    promptText('tools/contacts/create_contact#description'),
    { fields },
    ['fields'],
    false,
  ),
  define(
    'update_contact',
    promptText('tools/contacts/update_contact#description'),
    { contactId, expectedUpdatedAt, fields },
    ['contactId', 'expectedUpdatedAt', 'fields'],
    false,
  ),
  define(
    'delete_contact',
    promptText('tools/contacts/delete_contact#description'),
    { contactId, expectedUpdatedAt },
    ['contactId', 'expectedUpdatedAt'],
    false,
  ),
]);
