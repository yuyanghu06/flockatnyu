import { bindOperationApi } from '../adapter.js';
import { createTregOperationService } from '../../treg/operations/service.js';

// Construct the backend before binding its named operations to private HTTP routes.
export function createTregOperationApi(options) {
  return bindOperationApi(createTregOperationService(options));
}
