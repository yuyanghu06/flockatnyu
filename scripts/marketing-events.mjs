// Prints confirmed upcoming club Calendar events as the marketing tools see them.
// Read-only: it lists events through the existing club Calendar client and
// never writes to Google or the database.
//
//   npm run marketing:events            # next 60 local days
//   npm run marketing:events -- --days 14
//   npm run marketing:events -- --json
import { createCalendarClient } from '../server/google/calendar-client.js';
import { readCalendarConfig } from '../server/google/calendar-config.js';
import {
  MARKETING_LOOKAHEAD_DAYS,
  readUpcomingMarketingEvents,
} from '../server/marketing/calendar-events.js';

const args = process.argv.slice(2);
const daysIndex = args.indexOf('--days');
const lookaheadDays = daysIndex >= 0 ? Number(args[daysIndex + 1]) : MARKETING_LOOKAHEAD_DAYS;
const json = args.includes('--json');

const client = createCalendarClient({ config: readCalendarConfig(process.env) });
const result = await readUpcomingMarketingEvents({ client, lookaheadDays });

if (json) {
  console.log(JSON.stringify(result, null, 2));
} else {
  const { window } = result;
  if (window)
    console.log(
      `Window: ${window.startDate} to ${window.endDate} (${window.timeZone}, end exclusive)`,
    );
  console.log(
    `Status: ${result.status}${result.coverage?.reason ? ` (${result.coverage.reason})` : ''}`,
  );
  if (result.skipped && Object.keys(result.skipped).length)
    console.log(`Skipped: ${JSON.stringify(result.skipped)}`);
  console.log(`Events: ${result.events.length}\n`);
  for (const event of result.events) {
    console.log(`${event.date}  ${event.when}  ${event.title}`);
    if (event.location) console.log(`    Location: ${event.location}`);
    console.log(`    ${event.url}`);
  }
}
if (result.status !== 'ready') process.exitCode = 1;
