import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const absolute = (text, base, replacements = {}) => text.replace(/from (['"])(\.[^'"]+)\1/g, (_match, _quote, path) => `from ${JSON.stringify(replacements[path] ?? new URL(path, base).href)}`);
const oldRoot = process.env.EXPLICIT_WINDOW_BASELINE_DIR;
const dataUrl = text => 'data:text/javascript;base64,' + Buffer.from(text).toString('base64');
async function moduleUrl(name, replacements = {}) {
  const url = new URL(`../server/automation/${name}.js`, import.meta.url);
  return oldRoot ? dataUrl(absolute(await readFile(`${oldRoot}/${name}.js`, 'utf8'), url, replacements)) : url.href;
}
const participationUrl = await moduleUrl('participation');
const adapterUrl = await moduleUrl('adapters', { './participation.js': participationUrl });
const handlerUrl = await moduleUrl('handler');
const { completeParticipationSnapshot, mergeParticipationChanges } = await import(participationUrl);
const { createAutomationHandler } = await import(handlerUrl);
const { readAutomationConfig } = await import('../server/automation/config.js');

// Reuse only the inert real-component constructor; no imported test runs and no
// live service transport is available. Production implementations stay separate.
const fixtureText = await readFile(new URL('./staged-runtime-integration.test.mjs', import.meta.url), 'utf8');
const start = fixtureText.indexOf('async function participationFixture('), end = fixtureText.indexOf('\nconst participationCall=', start);
assert(start >= 0 && end > start);
const dependencies = [
  ['createAutomationAdapters', adapterUrl], ['createAutomationHandler', handlerUrl],
  ['readAutomationConfig', new URL('../server/automation/config.js', import.meta.url).href],
  ['createCalendarClient', new URL('../server/google/calendar-client.js', import.meta.url).href],
  ['readCalendarConfig,readMemberPlansConfig,CALENDAR_REQUIRED_SCOPES', new URL('../server/google/calendar-config.js', import.meta.url).href],
  ['createMapEventService', new URL('../server/map/events.js', import.meta.url).href],
  ['createCalendarMapSync', new URL('../server/automation/calendar-sync.js', import.meta.url).href],
  ['createLiveRetrievalTools', new URL('../tools/discord/index.js', import.meta.url).href],
];
const { participationFixture } = await import(dataUrl("import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';\n" + dependencies.map(([names, url]) => `import {${names}} from ${JSON.stringify(url)};`).join('\n') + "\nconst clubId='club@group.calendar.google.com',memberId='members@group.calendar.google.com';\n" + fixtureText.slice(start, end) + '\nexport {participationFixture};'));

const source = randomUUID(), calendarSource = randomUUID(), eventId = randomUUID(), actor = randomUUID(), late = randomUUID(), helper = randomUUID();
const revision = '2026-10-23T00:24:17.653692+00:00';
const url = id => `https://discord.com/channels/100/200/${id}`;
function sample({ existing = false, allDay = false } = {}) {
  const event = { id: eventId, name: 'Human event', notes: 'Keep human notes', kind: 'scheduled_event', type_id: 'other', status: 'confirmed', time_kind: allDay ? 'all_day' : 'timed', starts_at: allDay ? null : '2026-10-23T19:00:00Z', ends_at: allDay ? null : '2026-10-23T21:00:00Z', starts_on: allDay ? '2026-10-23' : null, ends_on: allDay ? '2026-10-24' : null, time_zone: 'America/New_York', source_id: calendarSource, source_url: 'https://calendar.google.com/calendar/event?eid=exact', source_record_id: 'exact123', reported_at: '2026-10-22T15:00:00Z', updated_at: revision };
  const people = [{ event_id: eventId, person_id: helper, attendance_status: 'going', presence_basis: 'planned', label: 'Human helper', starts_at: null, ends_at: null, source_id: source, source_url: url('290'), reported_at: '2026-10-22T18:00:00Z' }];
  if (existing) people.push({ event_id: eventId, person_id: actor, attendance_status: 'going', presence_basis: 'planned', label: 'Earlier label', starts_at: '2026-10-23T19:30:00Z', ends_at: '2026-10-23T20:30:00Z', source_id: source, source_url: url('291'), reported_at: '2026-10-22T18:01:00Z' });
  const raw = { events: [event], event_buildings: [{ event_id: eventId, building_id: 'bobst-library', location_notes: 'Room204' }], event_people: people, buildings: [{ id: 'bobst-library', name: 'Bobst' }], people: [actor, late, helper].map(id => ({ id, display_name: id, is_trackable: true })), event_types: [{ code: 'other', name: 'Other', description: '', icon_key: 'other', sort_order: 0 }] };
  return completeParticipationSnapshot(raw, { status: 'ok', ...structuredClone(raw) }, eventId, revision);
}
const proposed = (personId = actor, extra = {}) => ({ personId, sourceUrl: url(personId === late ? '303' : '301'), attendanceStatus: 'going', ...extra });
const provenance = () => new Map([actor, late].map(id => [id, { source_id: source, source_url: url(id === late ? '303' : '301'), reported_at: '2026-10-23T02:00:00Z' }]));
const ownCall = (name, id, args, inputIds) => ({ id, name, arguments: name === 'finish_batch' ? { handledInputIds: args } : { inputIds, arguments: args } });
const turn = (...toolCalls) => ({ stopReason: 'tool_calls', toolCalls, text: '' });

test('new people require both literal endpoints and one missing row rejects the entire merge unchanged', () => {
  const base = sample(), before = structuredClone(base);
  const missing = mergeParticipationChanges(base, [proposed(actor, { start: { inherit: true }, end: { inherit: true } }), proposed(late, { label: 'Arriving around4PM', end: { inherit: true } })], provenance());
  assert.deepEqual(missing, { status: 'invalid_request', reason: 'new_participation_window_required', missingWindows: [{ personId: late, missingFields: ['start'] }] });
  const both = mergeParticipationChanges(base, [proposed(actor), proposed(late, { label: 'Arriving around4PM' })], provenance());
  assert.deepEqual(both, { status: 'invalid_request', reason: 'new_participation_window_required', missingWindows: [{ personId: actor, missingFields: ['start', 'end'] }, { personId: late, missingFields: ['start', 'end'] }] });
  assert.deepEqual(base, before); assert.equal(missing.arguments, undefined);
});

test('explicit late start and full-event inheritance preserve event, prior people, source and approximate label', () => {
  const base = sample(), before = structuredClone(base);
  const result = mergeParticipationChanges(base, [proposed(actor, { start: { inherit: true }, end: { inherit: true } }), proposed(late, { start: { at: '2026-10-23T20:00:00Z' }, end: { inherit: true }, label: 'Arriving around4PM' })], provenance());
  assert.equal(result.status, 'ready'); assert.deepEqual(result.arguments.event, before.event); assert.deepEqual(result.arguments.buildings, before.buildings); assert.deepEqual(result.arguments.people.find(row => row.person_id === helper), before.people[0]);
  const saved = result.arguments.people.find(row => row.person_id === late); assert.equal(saved.starts_at, '2026-10-23T20:00:00Z'); assert.equal(saved.ends_at ?? null, null); assert.equal(saved.source_url, url('303')); assert.match(saved.label, /around/);
  const full = result.arguments.people.find(row => row.person_id === actor); assert.equal(full.starts_at ?? null, null); assert.equal(full.ends_at ?? null, null); assert.deepEqual(base, before);
});

test('existing omissions preserve overrides and all-day new people may explicitly inherit both bounds', () => {
  const base = sample({ existing: true });
  const result = mergeParticipationChanges(base, [proposed(actor, { label: 'Updated attendance' })], provenance());
  assert.equal(result.status, 'ready'); const own = result.arguments.people.find(row => row.person_id === actor); assert.equal(own.starts_at, '2026-10-23T19:30:00Z'); assert.equal(own.ends_at, '2026-10-23T20:30:00Z');
  const allDay = mergeParticipationChanges(sample({ allDay: true }), [proposed(actor, { start: { inherit: true }, end: { inherit: true } })], provenance());
  assert.equal(allDay.status, 'ready'); assert.equal(allDay.arguments.event.starts_on, '2026-10-23'); assert.equal(allDay.arguments.people.find(row => row.person_id === actor).starts_at ?? null, null);
});

test('real adapter rejects missing windows with zero writes or completion proof, then applies an explicit correction', async () => {
  const f = await participationFixture(); await f.prime([0, 1]); const ids = f.pending.slice(0, 2).map(row => row.uuid), before = f.clone([...f.mapRows.values()]);
  const bad = f.patch(); for (const change of bad.changes) { delete change.start; delete change.end; }
  const rejected = await f.execute('patch_map_participation', bad, ids);
  assert.deepEqual(rejected, { status: 'invalid_request', reason: 'new_participation_window_required', missingWindows: bad.changes.map(change => ({ personId: change.personId, missingFields: ['start', 'end'] })) });
  assert.equal(f.chronology.filter(row => row.kind === 'map_attempt' || row.kind === 'map_write' || row.kind === 'calendar_write').length, 0); assert.deepEqual([...f.mapRows.values()], before);
  assert.notEqual((await f.execute('resolve_pending_task', { taskId: ids[0], outcome: 'completed' }, [ids[0]])).status, 'ready');
  const corrected = f.patch(); corrected.changes[0].start = { at: '2026-10-23T20:00:00Z' }; corrected.changes[0].end = { inherit: true }; corrected.changes[0].label = 'Around4PM';
  assert.equal((await f.execute('patch_map_participation', corrected, ids)).sourceStatus, 'applied');
  const saved = [...f.mapRows.values()][0]; assert.equal(Date.parse(saved.people.find(row => row.person_id === f.ids[0]).starts_at), Date.parse('2026-10-23T20:00:00Z')); assert.deepEqual(saved.buildings, before[0].buildings); assert.deepEqual(saved.people.find(row => row.person_id === f.ids[2]), before[0].people[0]);
  for (const id of ids) assert.equal((await f.execute('resolve_pending_task', { taskId: id, outcome: 'completed' }, [id])).status, 'ready');
  assert.equal(f.chronology.filter(row => row.kind === 'map_write').length, 1); assert.equal(f.network.length, 0);
});

test('explicit endpoints do not bypass unread task, source revocation or stale revision guards', async () => {
  for (const kind of ['unread', 'revoked', 'stale']) {
    const f = await participationFixture(); if (kind === 'unread') { await f.prepare(); await f.followup(); } else await f.prime([0]);
    if (kind === 'revoked') f.control.revoked = true;
    const args = f.patch([0]); if (kind === 'stale') args.expectedUpdatedAt = '2026-10-22T18:00:00.000Z';
    const before = f.clone([...f.mapRows.values()]); const result = await f.execute('patch_map_participation', args, [f.pending[0].uuid]);
    assert.notEqual(result.status, 'ready', kind); assert.equal(result.receiptId, undefined); assert.deepEqual([...f.mapRows.values()], before); assert.equal(f.chronology.filter(row => row.kind === 'map_attempt').length, 0);
  }
});

async function feedbackRun(body) {
  const f = await participationFixture(), requests = []; let round = 0;
  const args = f.patch([0]); delete args.changes[0].start; delete args.changes[0].end;
  const tools = f.adapters.tools.map(tool => tool.name === 'patch_map_participation' ? { ...tool, execute: async () => typeof body === 'function' ? body(args) : body } : tool);
  const store = { configured: true, claim: async () => ({ status: 'ready', leaseToken: randomUUID(), inputs: f.clone(f.inputs) }), renew: async () => ({ status: 'ready' }), release: async () => {}, action: async ({ complete }) => ({ status: complete ? 'completed' : 'execute' }), finish: async () => ({ status: 'ready' }) };
  const provider = { toolTurn: async request => { requests.push(request); const index = round++, ids = [f.pending[0].uuid];
    if (index === 0) return turn(ownCall('finish_batch', 'initial', f.inputs.map(row => row.uuid)));
    if (index === 1) return turn(ownCall('read_pending_task', 'read', { taskId: ids[0] }, ids));
    if (index === 2) return turn(ownCall('read_discord_messages', 'original', { channelId: '200', messageId: '300', context: false }, ids), ownCall('lookup_map_person', 'identity', { provider: 'discord', providerUserId: '400', sourceId: f.source, sourceUrl: url('300') }, ids));
    if (index === 3) return turn(ownCall('patch_map_participation', 'bad', args, ids));
    return { text: 'Pending correction', toolCalls: [], stopReason: 'stop' }; } };
  await createAutomationHandler({ ...f.adapters, tools, store, config: readAutomationConfig({ AGENT_AUTOMATION_ENABLED: 'true' }), provider, now: () => new Date('2026-10-22T18:30:00Z') }).tick();
  const feedback = JSON.parse(requests.at(-1).messages.at(-1).content); return { feedback, f };
}

test('handler reconstructs only validated missing endpoints and never exposes failed bodies or unrelated metadata', async () => {
  const valid = await feedbackRun(args => ({ status: 'invalid_request', reason: 'new_participation_window_required', missingWindows: [{ personId: args.changes[0].personId, missingFields: ['start', 'end'] }] }));
  assert.equal(valid.feedback.reason, 'new_participation_window_required'); assert.equal(valid.feedback.status, 'tool_error'); assert.deepEqual(valid.feedback.missingWindows[0].missingFields, ['start', 'end']); assert.equal(valid.f.chronology.filter(row => row.kind === 'map_write').length, 0);
  for (const body of [args => ({ status: 'invalid_request', reason: 'new_participation_window_required', missingWindows: [{ personId: randomUUID(), missingFields: ['start', 'end'] }], raw: 'PRIVATE_FAILED_BODY' }), args => ({ status: 'invalid_request', reason: 'new_participation_window_required', missingWindows: [{ personId: args.changes[0].personId, missingFields: ['start'] }], message: 'PRIVATE_FAILED_BODY' }), () => ({ status: 'unavailable', reason: 'unrelated', raw: 'PRIVATE_FAILED_BODY', missingWindows: [{ personId: randomUUID(), missingFields: ['start'] }] })]) {
    const { feedback } = await feedbackRun(body); assert.equal(feedback.missingWindows, undefined); assert(!JSON.stringify(feedback).includes('PRIVATE_FAILED_BODY'));
  }
});
