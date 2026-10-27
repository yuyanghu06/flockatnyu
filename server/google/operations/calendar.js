import { validateArguments } from '../../automation/validation.js';
import { projectCalendarReceipt } from '../calendar-receipt.js';
import { googleError } from '../oauth.js';
import { collectCalendarWindow } from '../calendar-client.js';
import { CALENDAR_TOOLS } from './calendar-definitions.js';
const methods = {
  list_calendar_events: 'listEvents',
  read_calendar_event: 'readEvent',
  upsert_calendar_event: 'upsertEvent',
  cancel_calendar_event: 'cancelEvent',
};
export function createCalendarOperations({ client } = {}) {
  async function execute({ name, arguments: args, principal, signal } = {}) {
    const tool = CALENDAR_TOOLS.find((tool) => tool.name === name);
    if (!tool || !validateArguments(args, tool.parameters))
      return { status: 'invalid_request', events: [] };
    if (!client?.configured) return { status: 'not_configured', events: [] };
    if (
      typeof principal?.id !== 'string' ||
      !principal.id ||
      principal.calendarAccess !== true ||
      principal.calendarId !== client.calendarId
    )
      return { status: 'forbidden', events: [] };
    try {
      const result =
        name === 'list_calendar_events'
          ? await (typeof client.listEventsWindow === 'function'
              ? client.listEventsWindow({ ...args, principal, signal })
              : collectCalendarWindow({ client, ...args, principal, signal }))
          : await client[methods[name]]({ ...args, principal, signal });
      if (
        ['upsert_calendar_event', 'cancel_calendar_event'].includes(name) &&
        result?.status === 'ready'
      ) {
        const receipt = projectCalendarReceipt(result);
        return receipt
          ? {
              status: 'ready',
              outcome: receipt.outcome,
              eventId: receipt.eventId,
              url: receipt.url,
              calendarWrite: receipt,
            }
          : { status: 'invalid_response', events: [] };
      }
      return Buffer.byteLength(JSON.stringify(result)) <= 16384
        ? result
        : { status: 'context_limit', events: [] };
    } catch (error) {
      return {
        status: signal?.aborted ? 'aborted' : 'google_unavailable',
        events: [],
        diagnostics: googleError(error, signal).diagnostics,
      };
    }
  }
  const tools = CALENDAR_TOOLS.map((tool) =>
    Object.freeze({
      ...tool,
      execute: (args, context) => execute({ name: tool.name, arguments: args, ...context }),
    }),
  );
  return Object.freeze({
    configured: client?.configured === true,
    tools: Object.freeze(tools),
    execute,
  });
}
