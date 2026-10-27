import { promptText } from '../prompt-loader/index.js';
// Reports currently registered tool names and validated operation receipts, never inferred permission.
import { calendarWriteNames, contactWriteOperations } from './constants.js';

export function toolCapabilitySummary(tools, principal, results) {
  return {
    registeredToolNames: [
      ...new Set(
        tools
          .map((tool) => tool.name)
          .filter(
            (name) => typeof name === 'string' && /^[a-zA-Z][a-zA-Z0-9_.:-]{0,63}$/.test(name),
          ),
      ),
    ],
    googleAccessGranted: principal?.googleAccess === true,
    gmailSends: results
      .filter((result) => result.tool === 'send_gmail')
      .map((result) => ({
        tool: result.tool,
        status: result.status,
        sent: result.sent,
        receipt: result.gmailSend || null,
      })),
    contactMutations: results
      .filter(
        (result) =>
          Object.hasOwn(contactWriteOperations, result.tool) ||
          result.tool === 'import_treg_contacts',
      )
      .map((result) => ({
        tool: result.tool,
        status: result.status,
        receipt: result.contactWrite || result.contactImport || null,
      })),
    attioMutations: results
      .filter((result) => ['create_attio_record', 'update_attio_record'].includes(result.tool))
      .map((result) => ({
        tool: result.tool,
        status: result.status,
        receipt: result.attioWrite || null,
      })),
    calendarMutations: results
      .filter((result) => calendarWriteNames.has(result.tool))
      .map((result) => ({
        tool: result.tool,
        status: result.status,
        receipt: result.calendarWrite || null,
        ...(result.calendarBatchWrite
          ? {
              batchReceipt: {
                complete: result.calendarBatchWrite.complete,
                counts: result.calendarBatchWrite.counts,
                itemsInToolResults: true,
              },
            }
          : {}),
      })),
  };
}
export function toolCapabilityPrompt(capabilities) {
  if (!capabilities) return '';
  return (
    promptText('shared/capabilities#trusted-tool-capabilities-and-execution-json') +
    JSON.stringify(capabilities) +
    '\n' +
    promptText('shared/capabilities#this-server-owned-catalogue-and-actual-execution-record')
  );
}
