import { createGoogleOperations } from './google.js';
import { createChatCalendarOperations } from './chat-calendar.js';

// Chat exposes Google reads and Calendar operations in one catalogue. Compose
// their server services first so each call crosses exactly one private endpoint.
export function createCombinedGoogleOperations({ client, calendarClient, sourceId } = {}) {
  const google = createGoogleOperations({ client });
  const calendar = createChatCalendarOperations({ client: calendarClient, sourceId });
  function combine(currentCalendar) {
    return Object.freeze({
      ...currentCalendar,
      tools: Object.freeze([...google.tools, ...currentCalendar.tools]),
      execute: (options) =>
        currentCalendar.tools.some((tool) => tool.name === options.name)
          ? currentCalendar.execute(options)
          : google.execute(options),
      ...(typeof currentCalendar.createRequest === 'function'
        ? { createRequest: (context) => combine(currentCalendar.createRequest(context)) }
        : {}),
    });
  }
  return combine(calendar);
}
