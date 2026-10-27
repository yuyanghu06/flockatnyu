import { bindOperationApi } from '../adapter.js';
import { createAttioOperations } from '../../attio/operations/index.js';

export const createAttioApi = (options) => bindOperationApi(createAttioOperations(options));
