import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createMapEventService,
  createMapEventStore,
  mapReadContext,
} from '../server/map/events.js';
import {
  createMapSourceAuthorizer,
  withChatMapSource,
  CHAT_MAP_SOURCE_ID,
  chatMapEventUrl,
} from '../server/map/source-access.js';
import { createMapTools } from '../tools/map/index.js';
import { createChatMapTools } from '../tools/map/chat.js';

const at = '2026-10-23T16:00:00.000Z',
  next = '2026-10-23T16:01:00.000Z';
const sid = '22222222-2222-2222-2222-222222222222',
  dsid = '22222222-2222-2222-2222-222222222223';
const eid = '33333333-3333-3333-3333-333333333333',
  pid = '11111111-1111-1111-1111-111111111111',
  priorId = '11111111-1111-1111-1111-111111111112';
const calendarId = 'club@example.com',
  providerId = 'club0001',
  origin = 'https://flock.example';
const calendarUrl = `https://calendar.google.com/calendar/event?eid=${Buffer.from(`${providerId} ${calendarId}`).toString('base64url')}`;
const principal = {
  id: 'member',
  allowedSourceIds: [sid, dsid],
  googleAccess: true,
  calendarAccess: true,
  calendarId,
  liveDiscord: { guildId: '100' },
  mapSourceBindings: [
    { sourceId: sid, provider: 'calendar', calendarId },
    { sourceId: dsid, provider: 'discord', guildId: '100', channelId: '200' },
  ],
};
const event = () => ({
  id: eid,
  name: 'Saved event',
  notes: 'Keep these notes',
  kind: 'scheduled_event',
  type_id: 'meeting',
  status: 'confirmed',
  time_kind: 'timed',
  starts_at: '2026-10-23T19:00:00Z',
  ends_at: '2026-10-23T21:00:00Z',
  starts_on: null,
  ends_on: null,
  time_zone: 'America/New_York',
  source_id: sid,
  source_url: calendarUrl,
  source_record_id: providerId,
  url: calendarUrl,
  reported_at: at,
  updated_at: at,
});
const person = (id, name) => ({ id, display_name: name, is_trackable: true, avatar_url: null });
const snapshot = () => ({
  event_types: ['other', 'meeting'].map((code, i) => ({
    code,
    name: code,
    description: '',
    icon_key: code,
    sort_order: i,
  })),
  buildings: [{ id: 'bobst-library', name: 'Bobst' }],
  people: [person(pid, 'Alice'), person(priorId, 'Existing person')],
  events: [event()],
  event_buildings: [{ event_id: eid, building_id: 'bobst-library', location_notes: 'Room 2' }],
  event_people: [],
});
const strip = (row) =>
  Object.fromEntries(
    Object.entries(row).filter(
      ([key, value]) =>
        ![
          'event_id',
          'updated_at',
          'created_at',
          'local_display',
          'effective_local_display',
        ].includes(key) && value !== null,
    ),
  );
function fixture({ protectedPrior = false } = {}) {
  const data = snapshot(),
    calls = [],
    writes = [];
  let sourceCalls = 0;
  if (protectedPrior)
    data.event_people.push({
      event_id: eid,
      person_id: priorId,
      attendance_status: 'going',
      presence_basis: 'planned',
      label: 'Preserve old label',
      starts_at: null,
      ends_at: null,
      source_id: CHAT_MAP_SOURCE_ID,
      source_url: chatMapEventUrl(eid, origin),
      reported_at: at,
    });
  const store = createMapEventStore({
    env: { SUPABASE_URL: 'https://synthetic.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'test-only' },
    fetchImpl: async (url, options) => {
      const parsed = new URL(url);
      assert.equal(parsed.origin, 'https://synthetic.supabase.co');
      calls.push(parsed.pathname);
      if (parsed.pathname.endsWith('/map_read_events')) return Response.json(structuredClone(data));
      if (parsed.pathname.endsWith('/map_people')) return Response.json([person(pid, 'Alice')]);
      assert(parsed.pathname.endsWith('/map_upsert_event'));
      const args = JSON.parse(options.body);
      writes.push(args);
      if (args.p_expected_updated_at !== data.events[0].updated_at)
        return Response.json({ status: 'conflict' });
      data.events = [{ ...args.p_event, updated_at: next }];
      data.event_buildings = args.p_buildings.map((row) => ({ ...row, event_id: eid }));
      data.event_people = args.p_people.map((row) => ({ ...row, event_id: eid }));
      return Response.json({ status: 'applied', event_id: eid, updated_at: next });
    },
  });
  const unavailable = () => {
    sourceCalls++;
    throw Error('unrelated source must not run');
  };
  const authorizeSource = createMapSourceAuthorizer({
    publicOrigin: origin,
    allowChatMapUpdates: true,
    calendarSourceId: sid,
    calendarClient: { calendarId, configured: false, readEvent: unavailable },
    liveDiscordService: { readMessages: unavailable },
    googleClient: { readGmail: unavailable },
    miroStore: { authorizedBoard: unavailable },
  });
  const service = createMapEventService({ store, authorizeSource, now: () => new Date(at) }),
    rawReads = [];
  const map = createMapTools({
    service: {
      ...service,
      async read(options) {
        const result = await service.read(options);
        rawReads.push(result);
        return result;
      },
    },
  });
  return {
    data,
    calls,
    writes,
    store,
    service,
    map,
    rawReads,
    get sourceCalls() {
      return sourceCalls;
    },
  };
}

test('real map store read, exact lookup and write dispatch only their own database operation', async () => {
  const f = fixture(),
    read = await f.map.execute({ name: 'read_map_events', arguments: { eventId: eid }, principal });
  assert.equal(read.status, 'ready');
  assert.equal(mapReadContext(read), undefined);
  assert.equal(Object.getOwnPropertySymbols(read).length, 0);
  assert.equal(f.rawReads.length, 1);
  const readContext = mapReadContext(f.rawReads[0]);
  assert.equal(typeof readContext, 'function');
  assert.deepEqual(f.calls, ['/rest/v1/rpc/map_read_events']);
  assert(!JSON.stringify(read).includes('mapReadContext'));
  const lookup = await f.map.execute({
    name: 'lookup_map_person',
    arguments: {
      provider: 'discord',
      providerUserId: '123',
      sourceId: dsid,
      sourceUrl: 'https://discord.com/channels/100/200/300',
    },
    principal,
  });
  assert.equal(lookup.person.id, pid);
  const before = f.calls.length,
    result = await f.map.execute({
      name: 'upsert_map_event',
      arguments: {
        event: { ...strip(read.events[0]), notes: 'Requested note' },
        buildings: [{ building_id: 'bobst-library', location_notes: 'Room 2' }],
        people: [],
        expectedUpdatedAt: at,
      },
      principal,
      readContext,
    });
  assert.equal(result.status, 'ready');
  assert.equal(result.sourceStatus, 'applied');
  assert.deepEqual(f.calls.slice(before), ['/rest/v1/rpc/map_upsert_event']);
  assert.equal(f.sourceCalls, 0);
});

test('map update without a local explicit-read receipt does not secretly read storage', async () => {
  const f = fixture(),
    result = await f.map.execute({
      name: 'upsert_map_event',
      arguments: { event: strip(event()), buildings: [], people: [], expectedUpdatedAt: at },
      principal,
    });
  assert.equal(result.status, 'read_required');
  assert.deepEqual(f.calls, []);
  assert.equal(f.sourceCalls, 0);
});

test('DB transaction rejects a concurrent revision without any hidden refresh or readback', async () => {
  const f = fixture(),
    read = await f.service.read({ principal });
  f.data.events[0].updated_at = next;
  const before = f.calls.length,
    result = await f.service.upsert({
      principal,
      event: strip(read.events[0]),
      buildings: [],
      people: [],
      expectedUpdatedAt: at,
      readContext: mapReadContext(read),
    });
  assert.equal(result.status, 'conflict');
  assert.deepEqual(f.calls.slice(before), ['/rest/v1/rpc/map_upsert_event']);
  assert.equal(f.sourceCalls, 0);
});

test('chat write reuses the explicit read for omitted provenance without another DB read or lookup', async () => {
  const f = fixture(),
    actor = withChatMapSource(principal),
    chat = createChatMapTools({
      mapTools: f.map,
      store: f.store,
      publicOrigin: origin,
      now: () => new Date(at),
    }).createRequest({ principal: actor, timeContext: { now: at } });
  const read = await chat.execute({
    name: 'read_map_events',
    arguments: { eventId: eid },
    principal: actor,
  });
  const proposed = strip(read.events[0]);
  for (const key of ['source_id', 'source_url', 'source_record_id', 'reported_at', 'url'])
    delete proposed[key];
  const before = f.calls.length,
    result = await chat.execute({
      name: 'upsert_map_event',
      arguments: {
        event: proposed,
        buildings: [{ building_id: 'bobst-library', location_notes: 'Room 2' }],
        people: [
          {
            person_id: pid,
            attendance_status: 'going',
            presence_basis: 'planned',
            label: 'Joining',
          },
        ],
        expectedUpdatedAt: at,
      },
      principal: actor,
    });
  assert.equal(result.status, 'ready');
  assert.equal(result.sourceStatus, 'applied');
  assert.deepEqual(f.calls.slice(before), ['/rest/v1/rpc/map_upsert_event']);
  assert.equal(f.writes[0].p_event.source_url, calendarUrl);
  assert.equal(f.writes[0].p_people[0].source_id, CHAT_MAP_SOURCE_ID);
  assert.equal(f.sourceCalls, 0);
});

test('private prior chat participation is retained by local preparation and one conditional DB write', async () => {
  const f = fixture({ protectedPrior: true }),
    read = await f.service.read({ principal, eventId: eid });
  assert.deepEqual(read.event_people, []);
  assert(!JSON.stringify(read).includes('Preserve old label'));
  const before = f.calls.length,
    prepared = await f.service.preparePreservedEvent({
      principal,
      eventId: eid,
      expectedUpdatedAt: at,
      mode: 'participation',
      readContext: mapReadContext(read),
    });
  assert.equal(prepared.status, 'ok');
  assert.equal(typeof prepared.capability, 'function');
  assert.deepEqual(prepared.raw.event_people, []);
  assert.equal(f.calls.length, before);
  const result = await f.service.upsertPreservedEvent({
    principal,
    event: strip(read.events[0]),
    buildings: [{ building_id: 'bobst-library', location_notes: 'Room 2' }],
    people: [
      {
        person_id: pid,
        attendance_status: 'going',
        presence_basis: 'planned',
        label: 'New RSVP',
        starts_at: null,
        ends_at: null,
        source_id: dsid,
        source_url: 'https://discord.com/channels/100/200/300',
        reported_at: at,
      },
    ],
    expectedUpdatedAt: at,
    capability: prepared.capability,
    mode: 'participation',
  });
  assert.equal(result.status, 'applied');
  assert.deepEqual(f.calls.slice(before), ['/rest/v1/rpc/map_upsert_event']);
  assert.deepEqual(f.writes[0].p_people.map((row) => row.person_id).sort(), [pid, priorId]);
  assert.equal(
    f.writes[0].p_people.find((row) => row.person_id === priorId).label,
    'Preserve old label',
  );
  assert.equal(f.sourceCalls, 0);
});

test('read receipts cannot cross map service instances or principal source scopes', async () => {
  const f = fixture(),
    read = await f.service.read({ principal }),
    other = fixture(),
    args = {
      event: strip(event()),
      buildings: [],
      people: [],
      expectedUpdatedAt: at,
      readContext: mapReadContext(read),
    };
  assert.equal((await other.service.upsert({ ...args, principal })).status, 'read_required');
  assert.equal(
    (await f.service.upsert({ ...args, principal: { ...principal, id: 'another' } })).status,
    'read_required',
  );
  assert.equal(
    (await f.service.upsert({ ...args, principal: { ...principal, allowedSourceIds: [sid] } }))
      .status,
    'read_required',
  );
  assert.equal(f.writes.length, 0);
  assert.equal(other.writes.length, 0);
});

test('legacy provider authorization hooks are never invoked from a DB map read', async () => {
  let callbacks = 0,
    reads = 0;
  const service = createMapEventService({
    store: {
      configured: true,
      read: async () => {
        reads++;
        return snapshot();
      },
    },
    authorizeSource: () => {
      callbacks++;
      throw Error('Legacy hook would fetch another provider');
    },
  });
  const read = await service.read({ principal });
  assert.equal(read.status, 'ok');
  assert.equal(read.events.length, 1);
  assert.equal(reads, 1);
  assert.equal(callbacks, 0);
  assert.deepEqual(
    (await service.read({ principal: { ...principal, allowedSourceIds: [] } })).events,
    [],
  );
  assert.equal(callbacks, 0);
});

test('a changed exact source-channel binding invalidates the locally cached read context', async () => {
  const f = fixture(),
    actor = { ...principal, mapSourceBindings: structuredClone(principal.mapSourceBindings) },
    read = await f.service.read({ principal: actor });
  actor.mapSourceBindings.find((row) => row.provider === 'discord').channelId = '999';
  const before = f.calls.length,
    result = await f.service.upsert({
      principal: actor,
      event: strip(event()),
      buildings: [],
      people: [],
      expectedUpdatedAt: at,
      readContext: mapReadContext(read),
    });
  assert.equal(result.status, 'read_required');
  assert.equal(f.calls.length, before);
  assert.equal(f.writes.length, 0);
});
