import { bindOperationApi } from '../adapter.js';
import { createAttioOperations } from '../../attio/operations/index.js';
import { ATTIO_TOOLS } from '../../attio/operations/contracts.js';

export const createAttioApi = (options) =>
  bindOperationApi(createAttioOperations(options), { catalogue: ATTIO_TOOLS });
