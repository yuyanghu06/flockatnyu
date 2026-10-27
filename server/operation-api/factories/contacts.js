import { bindOperationApi } from '../adapter.js';
import { createContactsOperationService } from '../../contacts/operations/service.js';

// Construct the backend before binding its named operations to private HTTP routes.
export function createContactsOperationApi(options) {
  return bindOperationApi(createContactsOperationService(options));
}
