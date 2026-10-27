// Model-facing definitions and a private HTTP endpoint client; execution state lives in the server.
import { createContactsOperationApi } from '../../server/operation-api/factories/contacts.js';
export { CONTACT_TOOLS } from '../../server/contacts/operations/schema.js';
export { CONTACT_FIELDS } from '../../server/contacts/store.js';
export function createContactsTools(options) {
  return createContactsOperationApi(options);
}
