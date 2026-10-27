// Model-facing definitions and a private HTTP endpoint client; execution state lives in the server.
import { createTregOperationApi } from '../../server/operation-api/factories/treg.js';
export { TREG_TOOLS } from '../../server/treg/operations/schema.js';
export { projectTregUsage, projectTregFields } from '../../server/treg/operations/projections.js';
export function createTregTools(options) {
  return createTregOperationApi(options);
}
