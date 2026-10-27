import { GOOGLE_TOOLS } from './google-definitions.js';
import { googleError } from '../oauth.js';
export async function executeGoogleOperation({ name, arguments: args, principal, client, signal }) {
  if (typeof principal?.id !== 'string' || !principal.id || principal.googleAccess !== true)
    return { status: 'forbidden', sources: [] };
  const tool = GOOGLE_TOOLS.find((tool) => tool.name === name);
  if (
    !tool ||
    !args ||
    typeof args !== 'object' ||
    Array.isArray(args) ||
    Object.keys(args).some((key) => !Object.hasOwn(tool.parameters.properties, key)) ||
    tool.parameters.required.some((key) => !Object.hasOwn(args, key))
  )
    return { status: 'invalid_request', sources: [] };
  if (!client?.configured) return { status: 'not_configured', sources: [] };
  const method = {
    search_gmail: 'searchGmail',
    read_gmail: 'readGmail',
    search_drive: 'searchDrive',
    read_drive: 'readDrive',
    list_drive_folder: 'listDriveFolder',
  }[name];
  try {
    return await client[method]({ ...args, signal });
  } catch (error) {
    return {
      status: signal?.aborted ? 'aborted' : 'google_unavailable',
      sources: [],
      diagnostics: googleError(error, signal).diagnostics,
    };
  }
}

export function createGoogleOperations({ client } = {}) {
  return Object.freeze({
    tools: GOOGLE_TOOLS,
    execute: (input) => executeGoogleOperation({ ...input, client }),
  });
}
