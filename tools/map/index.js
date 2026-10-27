// Model-facing definitions and a private HTTP endpoint client; execution state lives in the server.
import { createMapOperationApi } from '../../server/operation-api/factories/map.js';
export { MAP_TOOLS } from '../../server/map/operations/schema.js';
export function createMapTools(options) {
  return createMapOperationApi(options);
}
