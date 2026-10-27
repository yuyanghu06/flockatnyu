export { GOOGLE_TOOLS } from '../../server/google/operations/google-definitions.js';
import { createGoogleApi } from '../../server/operation-api/factories/google.js';
export function executeGoogleTool({ client, ...input }) {
  return createGoogleApi({ client }).execute(input);
}
