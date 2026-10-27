// Renders trusted current-time instructions using the request timezone.
import { createTimeContext } from '../../shared/time-zone.js';

export function requestTimePrompt({ timeContext, timeZone, now } = {}) {
  const context = createTimeContext(timeContext ?? { timeZone, now });
  if (!context) throw new Error('Invalid request time context');
  return (
    'Current user-local date: ' +
    context.localDate +
    '. Current user-local time: ' +
    context.localDateTime +
    '. User timezone: ' +
    context.timeZone +
    '. Current UTC reference: ' +
    context.now +
    '. ' +
    'Interpret today, yesterday, tomorrow and other calendar-relative dates in this user timezone unless the user explicitly names another timezone. ' +
    'For Discord read tools whose schema supports local date boundaries, date-only values or today/yesterday/tomorrow may represent whole days. Calendar timeMin/timeMax must be explicit RFC3339 timestamps with the correct local UTC offset, never date-only or relative words. ' +
    'from is inclusive and to is exclusive. A whole day ends at the next calendar day, which may be 23 or 25 hours later. ' +
    'Keep explicit ISO timestamps with Z/offset as their exact instants. Set a tool timeZone override only for an explicitly user-named IANA timezone. ' +
    'Render human-facing dates and times in the user timezone, and name any explicitly requested alternate timezone. '
  );
}
