import assert from 'node:assert/strict';
import { createMapEventService, validateSnapshot } from '../../server/map/events.js';

export const sourceId = '12000000-0000-4000-8000-000000000001';
export const personId = '32000000-0000-4000-8000-000000000001';
export const calendarId = 'synthetic-location@group.calendar.google.com';
export const eventId = 'locationfixture01';
export const stamp = '2026-10-27T18:00:00.000Z';
export const eventUrl = `https://calendar.google.com/calendar/event?eid=${Buffer.from(`${eventId} ${calendarId}`).toString('base64url')}`;
export const principal = {
  id: 'location-test-worker',
  googleAccess: true,
  allowedSourceIds: [sourceId],
};
export const window = { timeMin: '2026-10-27T00:00:00Z', timeMax: '2026-10-30T00:00:00Z' };
export const buildings = [
  { id: 'bobst-library', name: 'Bobst Library', aliases: ['Bobst', '70 Washington Square South'] },
  { id: 'leslie-elab', name: 'Leslie eLab', aliases: ['eLab', '16 Washington Place'] },
  { id: 'stern-school-of-business', name: 'Stern School of Business', aliases: ['Stern'] },
];
const copy = (value) => structuredClone(value);
export function locationFixture(
  createCalendarMapSync,
  { location = 'E-Lab', catalogue = buildings } = {},
) {
  const original = {
    eventId,
    title: 'Synthetic location workshop',
    description: 'Preserve the human workshop description.',
    location,
    start: { dateTime: '2026-10-28T18:00:00.000Z', timeZone: 'America/New_York' },
    end: { dateTime: '2026-10-28T20:00:00.000Z', timeZone: 'America/New_York' },
    status: 'confirmed',
    createdAt: stamp,
    updatedAt: stamp,
    url: eventUrl,
  };
  let state = validateSnapshot({
    buildings: copy(catalogue),
    people: [{ id: personId, display_name: 'Synthetic participant', is_trackable: true }],
    event_types: [
      { code: 'other', name: 'Other', description: '', icon_key: 'other', sort_order: 0 },
    ],
    events: [],
    event_buildings: [],
    event_people: [],
  });
  let version = 0;
  const control = {},
    calls = [],
    writes = [],
    attempts = [];
  const store = {
    configured: true,
    async read() {
      calls.push('map.store.read');
      if (control.mapReadFailure) throw Error('synthetic_storage_failure');
      return copy(state);
    },
    async lookup() {
      throw Error('sync_must_not_lookup_people');
    },
    async upsert(args) {
      const write = copy({
        event: args.event,
        buildings: args.buildings,
        people: args.people,
        expectedUpdatedAt: args.expectedUpdatedAt,
      });
      attempts.push(write);
      control.beforeWrite?.(state);
      if (control.writeStatus) return { status: control.writeStatus };
      const old = state.events.find((row) => row.id === args.event.id);
      if (old ? old.updated_at !== args.expectedUpdatedAt : args.expectedUpdatedAt != null)
        return { status: 'conflict' };
      const saved = {
        ...copy(args.event),
        created_at: old?.created_at ?? stamp,
        updated_at: `2026-10-27T18:00:${String(++version).padStart(2, '0')}.123456+00:00`,
      };
      const next = {
        ...state,
        events: [...state.events.filter((row) => row.id !== saved.id), saved],
        event_buildings: [
          ...state.event_buildings.filter((row) => row.event_id !== saved.id),
          ...args.buildings.map((row) => ({ ...copy(row), event_id: saved.id })),
        ],
        event_people: [
          ...state.event_people.filter((row) => row.event_id !== saved.id),
          ...args.people.map((row) => ({ ...copy(row), event_id: saved.id })),
        ],
      };
      validateSnapshot(next);
      state = next;
      writes.push(write);
      return { status: 'applied', event_id: saved.id, updated_at: saved.updated_at };
    },
  };
  const authorizeSource = Object.assign(() => control.mapAuthorized !== false, { localOnly: true });
  const mapService = createMapEventService({ store, authorizeSource, now: () => new Date(stamp) });
  const client = {
    configured: true,
    calendarId,
    async listEventsWindow() {
      calls.push('calendar.list');
      return {
        status: control.listStatus ?? 'ready',
        events: [copy(original)],
        coverage: { complete: control.listStatus !== 'partial' },
      };
    },
    async readEvent({ eventId: id }) {
      calls.push('calendar.read');
      return {
        status: control.exactStatus ?? 'ready',
        events: control.exactStatus ? [] : id === eventId ? [copy(original)] : [],
      };
    },
  };
  const projection = createCalendarMapSync({
    targets: [{ client, sourceId, kind: 'club' }],
    mapService,
    loadBuildings: async () => copy(catalogue),
    now: () => new Date(stamp),
  });
  return {
    original,
    store,
    client,
    mapService,
    control,
    calls,
    attempts,
    writes,
    state: () => copy(state),
    editSaved: (edit) => {
      edit(state);
      validateSnapshot(state);
    },
    addParticipant() {
      assert.equal(state.events.length, 1);
      state.event_people.push({
        event_id: state.events[0].id,
        person_id: personId,
        attendance_status: 'going',
        presence_basis: 'planned',
        label: 'Keep participant notes',
        starts_at: '2026-10-28T18:15:00.000Z',
        ends_at: '2026-10-28T19:45:00.000Z',
        source_id: sourceId,
        source_url: eventUrl,
        reported_at: stamp,
      });
      validateSnapshot(state);
    },
    sync: (extra = {}) => projection.sync({ principal, window, ...extra }),
  };
}
