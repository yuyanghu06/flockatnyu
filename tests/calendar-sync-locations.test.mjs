import test from 'node:test';
import assert from 'node:assert/strict';
import {
  locationFixture,
  buildings,
  principal,
  eventId,
  eventUrl,
} from './fixtures/calendar-sync-locations.mjs';
const { createCalendarMapSync, matchCalendarBuildings } = await import(
  process.env.CALENDAR_LOCATION_BASELINE_MODULE || '../server/automation/calendar-sync.js'
);

test('unique campus locations tolerate case, punctuation, spacing and ordinary typing errors', () => {
  for (const location of [
    'E-Lab',
    'e lab',
    'ELAB',
    'Leslie E—Lab room 101',
    'bObSt library, ROOM 3',
    'BobstLibrary',
    'Bobts',
    'Bobbst',
    'Stern School of Busniss',
  ]) {
    const target = /lab/i.test(location.replace(/[^a-z]/gi, ''))
      ? 'leslie-elab'
      : /Stern/.test(location)
        ? 'stern-school-of-business'
        : 'bobst-library';
    assert.deepEqual(
      matchCalendarBuildings(location, buildings),
      { status: 'matched', buildingIds: [target] },
      location,
    );
  }
});

test('matching respects short aliases, substring boundaries and spelling distance limits', () => {
  const catalogue = [...buildings, { id: 'gcasl', name: 'Global Center', aliases: ['KMC'] }];
  assert.deepEqual(matchCalendarBuildings('KMC', catalogue), {
    status: 'matched',
    buildingIds: ['gcasl'],
  });
  for (const location of [
    'SuperBobst',
    'DefinitelySuperStern',
    'eLba',
    'Bobt',
    'KMCX',
    'Unlisted Central Park venue',
    'Bxtst',
  ])
    assert.deepEqual(
      matchCalendarBuildings(location, catalogue),
      { status: 'unknown', buildingIds: [] },
      location,
    );
  const longName = [{ id: 'washington-square', name: 'Washington Square' }];
  assert.deepEqual(matchCalendarBuildings('Washingtxx Square', longName), {
    status: 'matched',
    buildingIds: ['washington-square'],
  });
  assert.deepEqual(matchCalendarBuildings('Washingtxx Squary', longName), {
    status: 'unknown',
    buildingIds: [],
  });
});

test('normalized collisions, multiple spelling candidates and uncertain alternatives remain ambiguous', () => {
  const collisions = [...buildings, { id: 'other-lab', name: 'Different Lab', aliases: ['E-Lab'] }];
  assert.deepEqual(matchCalendarBuildings('e lab', collisions), {
    status: 'ambiguous',
    buildingIds: [],
  });
  const near = [
    { id: 'a', name: 'Baker Hall' },
    { id: 'b', name: 'Baxer Hall' },
  ];
  assert.deepEqual(matchCalendarBuildings('Bayer Hall', near), {
    status: 'ambiguous',
    buildingIds: [],
  });
  for (const location of [
    'Bobst or Stern',
    'Bobst and Stern',
    'Maybe E-Lab',
    'E Lab?',
    'Stern (TBD)',
    'Either Bobst, room 3',
    'Bobst or an undecided off-campus venue',
  ])
    assert.deepEqual(
      matchCalendarBuildings(location, buildings),
      { status: 'ambiguous', buildingIds: [] },
      location,
    );
});

test('E-Lab Calendar projection reaches its existing building through the real map service', async () => {
  const f = locationFixture(createCalendarMapSync);
  const result = await f.sync();
  assert.equal(result.status, 'ready');
  assert.equal(result.complete, true);
  assert.equal(f.writes.length, 1);
  assert.deepEqual(
    f.state().event_buildings.map((row) => row.building_id),
    ['leslie-elab'],
  );
  assert.equal(f.state().events[0].source_record_id, eventId);
  assert.equal(f.state().events[0].source_url, eventUrl);
  assert.equal((await f.sync()).results[0].status, 'unchanged');
  assert.equal(f.writes.length, 1, 'A repeat must not rewrite the saved projection');
});

test('unmatched locations retain the scheduled event without links or an overall partial result', async () => {
  for (const location of ['Unlisted off-campus venue', '']) {
    const f = locationFixture(createCalendarMapSync, { location });
    const original = structuredClone(f.original),
      result = await f.sync();
    assert.equal(result.status, 'ready');
    assert.equal(result.complete, true);
    assert.deepEqual(result.unresolved, []);
    assert.equal(f.state().events.length, 1);
    assert.deepEqual(f.state().event_buildings, []);
    assert.equal(f.state().events[0].source_record_id, original.eventId);
    assert.equal(f.state().events[0].starts_at, original.start.dateTime);
    assert.equal(f.state().events[0].ends_at, original.end.dateTime);
    assert.deepEqual(f.original, original, 'Projection cannot alter its Calendar original');
    assert.equal((await f.sync()).results[0].status, 'unchanged');
    assert.equal(f.writes.length, 1);
  }
});

test('moving to an unknown location clears only stale building links using the saved exact version', async () => {
  const f = locationFixture(createCalendarMapSync, { location: 'Bobst room 3' });
  assert.equal((await f.sync()).status, 'ready');
  f.addParticipant();
  const before = f.state(),
    version = before.events[0].updated_at;
  f.original.location = 'Unlisted off-campus venue';
  const original = structuredClone(f.original),
    result = await f.sync(),
    after = f.state();
  assert.equal(result.status, 'ready');
  assert.equal(result.complete, true);
  assert.deepEqual(result.unresolved, []);
  assert.equal(f.writes.length, 2);
  assert.equal(f.writes[1].expectedUpdatedAt, version);
  assert.deepEqual(f.writes[1].buildings, []);
  assert.deepEqual(after.event_buildings, []);
  assert.deepEqual(after.event_people, before.event_people);
  assert.deepEqual(
    { ...after.events[0], notes: before.events[0].notes, updated_at: version },
    before.events[0],
  );
  assert.deepEqual(f.original, original);
});

test('an unchanged manually resolved unknown location keeps its exact links and attendance', async () => {
  const f = locationFixture(createCalendarMapSync, { location: 'Unlisted off-campus venue' });
  await f.sync();
  f.addParticipant();
  f.editSaved((state) =>
    state.event_buildings.push({
      event_id: state.events[0].id,
      building_id: 'stern-school-of-business',
      location_notes: 'Manually confirmed room; retain this note',
    }),
  );
  const before = f.state();
  f.original.title = 'Updated workshop title';
  const result = await f.sync(),
    after = f.state();
  assert.equal(result.status, 'ready');
  assert.deepEqual(after.event_buildings, before.event_buildings);
  assert.deepEqual(after.event_people, before.event_people);
  assert.equal(after.events[0].name, 'Updated workshop title');
});

test('a concurrent human edit prevents stale unknown-location replacement', async () => {
  const f = locationFixture(createCalendarMapSync, { location: 'Bobst' });
  await f.sync();
  f.addParticipant();
  const before = f.state();
  f.original.location = 'Unlisted off-campus venue';
  f.control.beforeWrite = (state) => {
    state.events[0].updated_at = '2026-10-27T18:00:01.123457+00:00';
    state.events[0].notes = 'Concurrent human edit must survive';
  };
  const result = await f.sync();
  assert.equal(result.status, 'partial');
  assert(result.unresolved.some((row) => row.reason === 'map_conflict'));
  assert.equal(f.writes.length, 1);
  assert.equal(f.attempts[1].expectedUpdatedAt, before.events[0].updated_at);
  assert.equal(f.state().events[0].notes, 'Concurrent human edit must survive');
  assert.deepEqual(f.state().event_buildings, before.event_buildings);
  assert.deepEqual(f.state().event_people, before.event_people);
});

test('ambiguous multi-building locations still return partial and never create guessed links', async () => {
  const f = locationFixture(createCalendarMapSync, { location: 'Bobst or Stern' });
  const result = await f.sync();
  assert.equal(result.status, 'partial');
  assert.equal(result.complete, false);
  assert(result.unresolved.some((row) => row.reason === 'ambiguous_location'));
  assert.deepEqual(f.state().event_buildings, []);
});

test('unknown location does not hide authorization, provider, map, version or attendance failures', async () => {
  const cases = [
    ['source authorization', { actor: { ...principal, allowedSourceIds: [] } }],
    ['provider exact read', { exactStatus: 'permission_denied' }],
    ['provider incomplete window', { listStatus: 'partial' }],
    ['map authorization', { mapAuthorized: false }],
    ['map read', { mapReadFailure: true }],
    ['map write', { writeStatus: 'unavailable' }],
  ];
  for (const [name, control] of cases) {
    const f = locationFixture(createCalendarMapSync, { location: 'Unlisted off-campus venue' });
    Object.assign(f.control, control);
    const result = await f.sync(control.actor ? { principal: control.actor } : {});
    assert.equal(result.status, 'partial', name);
    assert.equal(result.complete, false, name);
    assert(
      result.unresolved.some((row) => row.reason !== 'unknown_location'),
      name,
    );
  }
  const f = locationFixture(createCalendarMapSync, { location: 'Bobst' });
  await f.sync();
  f.addParticipant();
  const before = f.state(),
    count = f.writes.length;
  f.original.location = 'Unlisted off-campus venue';
  f.original.end.dateTime = '2026-10-28T19:00:00.000Z';
  const result = await f.sync();
  assert.equal(result.status, 'partial');
  assert(result.unresolved.some((row) => row.reason === 'participation_time_conflict'));
  assert.equal(f.writes.length, count);
  assert.deepEqual(f.state(), before);
});
