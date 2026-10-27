import { promptText } from '../../prompt-loader/index.js';
// Renders trusted current-time instructions using the request timezone.
import { createTimeContext } from '../../shared/time-zone.js';

export function requestTimePrompt({ timeContext, timeZone, now } = {}) {
  const context = createTimeContext(timeContext ?? { timeZone, now });
  if (!context) throw new Error('Invalid request time context');
  return (
    promptText('shared/time#current-user-local-date') +
    context.localDate +
    promptText('shared/time#current-user-local-time') +
    context.localDateTime +
    promptText('shared/time#user-timezone') +
    context.timeZone +
    promptText('shared/time#current-utc-reference') +
    context.now +
    '. ' +
    promptText('shared/time#interpret-today-yesterday-tomorrow-and-other-calendar-relative') +
    promptText('shared/time#for-discord-read-tools-whose-schema-supports') +
    promptText('shared/time#from-is-inclusive-and-to-is-exclusive') +
    promptText('shared/time#keep-explicit-iso-timestamps-with-z-offset-as') +
    promptText('shared/time#render-human-facing-dates-and-times-in-the')
  );
}
