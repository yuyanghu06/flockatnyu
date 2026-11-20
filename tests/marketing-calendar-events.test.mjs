import test from 'node:test';
import assert from 'node:assert/strict';
import {
  readUpcomingMarketingEvents,
  skipReason,
  upcomingWindow,
} from '../server/marketing/calendar-events.js';
import { createCalendarClient } from '../server/google/calendar-client.js';
import { readCalendarConfig, CALENDAR_REQUIRED_SCOPES } from '../server/google/calendar-config.js';

const calendarId = 'club@group.calendar.google.com';
const timed = (id, dateTime, extra = {}) => ({
  eventId: id,
  title: `Event ${id}`,
  start: { dateTime, timeZone: 'America/New_York' },
  end: { dateTime, timeZone: 'America/New_York' },
  status: 'confirmed',
  url: `https://calendar.google.com/calendar/event?eid=${id}`,
  ...extra,
});

function fakeClient(handler) {
  const calls = [];
  return {
    calls,
    configured: true,
    calendarId,
    listEventsWindow: async (args) => {
      calls.push(args);
      return handler(args, calls.length);
    },
  };
}
const ready = (events) => ({ status: 'ready', events, coverage: { complete: true } });

test('window uses New York local midnights across the November DST change', () => {
  // 2026-11-01 02:00 EDT falls back to EST. 23:30 EDT on Oct 31 is still Oct 31 locally.
  const window = upcomingWindow({ now: new Date('2026-11-01T03:30:00Z'), lookaheadDays: 2 });
  assert.equal(window.startDate, '2026-10-31');
  assert.equal(window.endDate, '2026-11-02');
  assert.equal(window.timeMin, '2026-10-31T04:00:00.000Z'); // midnight EDT
  assert.equal(window.timeMax, '2026-11-02T05:00:00.000Z'); // midnight EST
});

test('drafts, cancellations, gray events and TBD/tentative titles are excluded', () => {
  assert.equal(skipReason(timed('a', '2026-11-20T15:00:00Z')), null);
  assert.equal(
    skipReason(timed('b', '2026-11-20T15:00:00Z', { status: 'cancelled' })),
    'not_confirmed',
  );
  assert.equal(
    skipReason(timed('c', '2026-11-20T15:00:00Z', { status: 'tentative' })),
    'not_confirmed',
  );
  assert.equal(skipReason(timed('d', '2026-11-20T15:00:00Z', { colorId: '8' })), 'gray_color');
  assert.equal(skipReason(timed('e', '2026-11-20T15:00:00Z', { colorId: '5' })), null);
  assert.equal(
    skipReason(timed('f', '2026-11-20T15:00:00Z', { title: '  [tbd] Hack night' })),
    'tentative_title',
  );
  assert.equal(
    skipReason(timed('g', '2026-11-20T15:00:00Z', { title: 'Tentative: Mixer' })),
    'tentative_title',
  );
  assert.equal(
    skipReason(timed('h', '2026-11-20T15:00:00Z', { title: 'Not tentative mixer' })),
    null,
  );
});

test('returns sorted confirmed events with local dates and reports what was skipped', async () => {
  const client = fakeClient(() =>
    ready([
      timed('late', '2026-11-21T03:30:00Z', { title: 'Late social', location: ' Bobst ' }), // Nov 20, 22:30 local
      {
        ...timed('allday', 'x'),
        start: { date: '2026-11-20' },
        end: { date: '2026-11-21' },
        title: 'Club day',
      },
      timed('gray', '2026-11-20T15:00:00Z', { colorId: '8' }),
      timed('gone', '2026-11-20T16:00:00Z', { status: 'cancelled' }),
      timed('early', '2026-11-20T15:00:00Z', { title: 'Workshop', colorId: '3' }),
    ]),
  );
  const result = await readUpcomingMarketingEvents({
    client,
    now: new Date('2026-11-19T17:00:00Z'),
  });
  assert.equal(result.status, 'ready');
  assert.equal(result.coverage.complete, true);
  assert.deepEqual(
    result.events.map((event) => [event.eventId, event.date, event.allDay]),
    [
      ['allday', '2026-11-20', true],
      ['early', '2026-11-20', false],
      ['late', '2026-11-20', false],
    ],
  );
  assert.equal(result.events[2].location, 'Bobst');
  assert.equal(result.events[1].colorId, '3');
  assert.deepEqual(result.skipped, { gray_color: 1, not_confirmed: 1 });
  assert.equal(client.calls.length, 1);
  assert.deepEqual(client.calls[0].principal, {
    id: 'service:marketing-events',
    calendarAccess: true,
    calendarId,
  });
  assert.equal(client.calls[0].timeMin, '2026-11-19T05:00:00.000Z');
});

test('size-bounded windows are split and spanning events are deduplicated', async () => {
  const spanning = timed('span', '2026-12-01T15:00:00Z');
  const client = fakeClient((args, n) =>
    n === 1
      ? {
          status: 'partial',
          events: [spanning],
          coverage: { complete: false, reason: 'context_limit' },
        }
      : ready([spanning, timed(`half${n}`, args.timeMin)]),
  );
  const result = await readUpcomingMarketingEvents({
    client,
    now: new Date('2026-11-19T17:00:00Z'),
  });
  assert.equal(result.status, 'ready');
  assert.equal(client.calls.length, 3);
  assert.equal(client.calls[1].timeMax, client.calls[2].timeMin);
  assert.deepEqual(result.events.map((event) => event.eventId).sort(), ['half2', 'half3', 'span']);
});

test('access revocation on a later window withholds earlier results', async () => {
  const client = fakeClient((args, n) =>
    n === 1
      ? { status: 'partial', events: [], coverage: { complete: false, reason: 'event_limit' } }
      : n === 2
        ? ready([timed('first', args.timeMin)])
        : { status: 'permission_denied', events: [] },
  );
  const result = await readUpcomingMarketingEvents({
    client,
    now: new Date('2026-11-19T17:00:00Z'),
  });
  assert.equal(result.status, 'permission_denied');
  assert.deepEqual(result.events, []);
});

test('a transient later failure keeps earlier events but marks coverage incomplete', async () => {
  const client = fakeClient((args, n) =>
    n === 1
      ? { status: 'partial', events: [], coverage: { complete: false, reason: 'event_limit' } }
      : n === 2
        ? ready([timed('first', args.timeMin)])
        : { status: 'google_unavailable', events: [] },
  );
  const result = await readUpcomingMarketingEvents({
    client,
    now: new Date('2026-11-19T17:00:00Z'),
  });
  assert.equal(result.status, 'partial');
  assert.equal(result.coverage.complete, false);
  assert.equal(result.coverage.reason, 'google_unavailable');
  assert.deepEqual(
    result.events.map((event) => event.eventId),
    ['first'],
  );
});

test('unconfigured client reports not_configured instead of an empty calendar', async () => {
  const result = await readUpcomingMarketingEvents({ client: { configured: false } });
  assert.equal(result.status, 'not_configured');
  assert.equal(result.coverage.complete, false);
});

test('the real client requests and returns Google colorId', async () => {
  const env = {
    GOOGLE_CLIENT_ID: 'synthetic-client',
    GOOGLE_CLIENT_SECRET: 'synthetic-secret',
    GOOGLE_REFRESH_TOKEN: 'synthetic-refresh',
    GOOGLE_EXPECTED_ACCOUNT_EMAIL: 'club@example.com',
    GOOGLE_CALENDAR_ID: calendarId,
  };
  const urls = [];
  const json = (body) => new Response(JSON.stringify(body), { status: 200 });
  const fetchImpl = async (url) => {
    urls.push(String(url));
    if (String(url).includes('/gmail/v1/users/me/profile'))
      return json({ emailAddress: 'club@example.com' });
    if (String(url).includes('/calendarList/'))
      return json({ id: calendarId, accessRole: 'reader' });
    return json({
      items: [
        {
          id: 'graycal1',
          summary: 'Draft',
          status: 'confirmed',
          colorId: '8',
          start: { date: '2026-11-20' },
          end: { date: '2026-11-21' },
        },
      ],
    });
  };
  const oauthClient = {
    setCredentials() {},
    getAccessToken: async () => ({ token: 'synthetic-access' }),
    getTokenInfo: async () => ({
      email: 'club@example.com',
      scopes: [...CALENDAR_REQUIRED_SCOPES],
    }),
  };
  const client = createCalendarClient({ config: readCalendarConfig(env), fetchImpl, oauthClient });
  const result = await client.listEventsWindow({
    timeMin: '2026-11-19T05:00:00Z',
    timeMax: '2026-11-21T05:00:00Z',
    limit: 25,
    principal: { id: 'service:marketing-events', calendarAccess: true, calendarId },
  });
  if (result.status !== 'ready') return assert.fail(`unexpected status ${result.status}`);
  assert.equal(result.events[0].colorId, '8');
  assert(
    urls.some((url) => url.includes('/events?') && decodeURIComponent(url).includes('colorId')),
  );
});
