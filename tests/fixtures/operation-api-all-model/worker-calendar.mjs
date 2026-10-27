import assert from 'node:assert/strict';
import { createCalendarClient } from '../../../server/google/calendar-client.js';
import {
  readCalendarConfig,
  readMemberPlansConfig,
  CALENDAR_REQUIRED_SCOPES,
} from '../../../server/google/calendar-config.js';
import {
  ids,
  now,
  stamp,
  zone,
  clubId,
  memberId,
  eventId,
  eventUrl,
  originalUrl,
} from '../planner-followup.mjs';
export function workerCalendars(snapshot) {
  const env = {
    AGENT_AUTOMATION_STAGED_ENABLED: 'true',
    ASSISTANT_ALLOWED_SOURCE_IDS: [ids.source, ids.club, ids.member].join(','),
    GOOGLE_CLIENT_ID: 'synthetic',
    GOOGLE_CLIENT_SECRET: 'synthetic',
    GOOGLE_REFRESH_TOKEN: 'synthetic',
    GOOGLE_EXPECTED_ACCOUNT_EMAIL: 'club@example.test',
    GOOGLE_CALENDAR_ID: clubId,
    AGENT_CALENDAR_SOURCE_ID: ids.club,
    GOOGLE_MEMBER_PLANS_CALENDAR_ID: memberId,
    AGENT_MEMBER_PLANS_SOURCE_ID: ids.member,
    AGENT_MEMBER_PLANS_SIGNING_KEY: 'synthetic-member-signing-key-32-characters',
  };
  const calendarConfig = readCalendarConfig(env),
    memberConfig = readMemberPlansConfig(env);
  const maps = new Map([
      [clubId, new Map()],
      [memberId, new Map()],
    ]),
    requests = [],
    writes = [];
  let version = 0;
  const existing = snapshot.events[0];
  maps.get(clubId).set(eventId, {
    id: eventId,
    summary: existing.name,
    description: existing.notes,
    location: 'Bobst Library room 101',
    status: 'confirmed',
    start: { dateTime: existing.starts_at, timeZone: zone },
    end: { dateTime: existing.ends_at, timeZone: zone },
    created: stamp,
    updated: stamp,
    etag: '"human"',
    htmlLink: eventUrl,
  });
  const fetchImpl = async (input, init = {}) => {
    const url = new URL(input),
      method = init.method ?? 'GET';
    requests.push({ method, path: url.pathname });
    if (url.hostname === 'gmail.googleapis.com')
      return Response.json({ emailAddress: 'club@example.test' });
    assert.equal(url.origin, 'https://www.googleapis.com');
    if (url.pathname.includes('/calendarList/'))
      return Response.json({
        id: decodeURIComponent(url.pathname.split('/calendarList/')[1]),
        accessRole: 'owner',
      });
    const match = /\/calendars\/([^/]+)\/events(?:\/([^/]+))?$/.exec(url.pathname);
    assert(match);
    const calendarId = decodeURIComponent(match[1]),
      id = match[2] && decodeURIComponent(match[2]),
      rows = maps.get(calendarId);
    assert(rows, 'Calendar target remains pinned');
    if (method === 'GET')
      return id
        ? rows.has(id)
          ? Response.json(rows.get(id))
          : Response.json({}, { status: 404 })
        : Response.json({ items: [...rows.values()] });
    assert(['POST', 'PATCH'].includes(method));
    assert.equal(url.searchParams.get('sendUpdates'), 'none');
    const body = JSON.parse(init.body),
      key = id || body.id;
    if (method === 'PATCH' && new Headers(init.headers).get('if-match') !== rows.get(key)?.etag)
      return Response.json({}, { status: 412 });
    if (method === 'POST' && rows.has(key)) return Response.json({}, { status: 409 });
    const saved = {
      ...rows.get(key),
      ...body,
      id: key,
      created: rows.get(key)?.created ?? stamp,
      updated: now,
      etag: `"v${++version}"`,
    };
    rows.set(key, saved);
    writes.push({ method, calendarId, eventId: key, body: structuredClone(body) });
    return Response.json(saved);
  };
  const oauthClient = {
    setCredentials() {},
    getAccessToken: async () => ({ token: 'synthetic' }),
    getTokenInfo: async () => ({ scopes: CALENDAR_REQUIRED_SCOPES }),
  };
  const calendarClient = createCalendarClient({ config: calendarConfig, fetchImpl, oauthClient }),
    memberClient = createCalendarClient({ config: memberConfig, fetchImpl, oauthClient });
  function originalPrincipal(original, calendarId) {
    const payload = original.raw_response.payload;
    return {
      id: 'fixture-seed',
      calendarAccess: true,
      calendarId,
      allowedSourceIds: [ids.source],
      calendarSources: [
        {
          provider: 'discord',
          sourceId: ids.source,
          guildId: payload.guild_id,
          channelId: payload.channel_id,
          messageId: payload.id,
        },
      ],
    };
  }
  async function seed(
    original,
    {
      member = false,
      title = 'API cancelled workshop',
      start = '2026-10-24T19:00:00.000Z',
      end = '2026-10-24T20:00:00.000Z',
    } = {},
  ) {
    const client = member ? memberClient : calendarClient,
      principal = originalPrincipal(original, client.calendarId);
    const payload = original.raw_response.payload,
      participation = {
        sourceId: ids.source,
        sourceUrl: originalUrl(original),
        personId: ids.person,
        provider: 'discord',
        providerUserId: payload.author.id,
        reportedAt: payload.timestamp,
        label: 'Studying',
      };
    const args = {
      sourceKey: `discord:${payload.guild_id}:${payload.channel_id}:${payload.id}`,
      sourceUrl: originalUrl(original),
      title,
      description: 'Preserve source-owned event',
      location: 'Bobst Library',
      start: { dateTime: start, timeZone: zone },
      end: { dateTime: end, timeZone: zone },
      principal: member ? { ...principal, memberPlanReceipts: [participation] } : principal,
      ...(member
        ? { activityKind: 'personal_plan', typeId: 'study', trustedParticipation: participation }
        : {}),
    };
    const result = await (member ? client.upsertMemberPlan(args) : client.upsertEvent(args));
    assert.equal(result.status, 'ready', 'Source-owned fixture setup must succeed');
    return result.eventId;
  }
  return {
    env,
    calendarConfig,
    memberConfig,
    calendarClient,
    memberClient,
    maps,
    writes,
    requests,
    seed,
  };
}
