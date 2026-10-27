import { canonicalJson } from '../../server/automation/validation.js';
import { createMapEventService } from '../../server/map/events.js';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  createPresenceFixture,
  presenceInputs,
  source,
  clubSource,
  clubId,
  stamp,
  originalUrl,
} from './planner-presence.mjs';

export const call = (name, id, args, inputIds = []) => ({
  id,
  name,
  arguments: name === 'finish_batch' ? { handledInputIds: args } : { inputIds, arguments: args },
});
export const turn = (...toolCalls) => ({ toolCalls, text: '', stopReason: 'tool_calls' });
export function bindings(request) {
  const message = request.messages.findLast((row) => {
    if (row.role !== 'user') return false;
    try {
      return Boolean(JSON.parse(row.content).referenceBindings);
    } catch {
      return false;
    }
  });
  return JSON.parse(message.content).referenceBindings;
}
export const feedback = (request, id) =>
  JSON.parse(
    request.messages.findLast((row) => row.role === 'tool' && row.toolCallId === id).content,
  );

// All people, source originals and storage are synthetic. The production runner,
// adapters, task fragments and participation checks execute unchanged.
export function resourceFixture({ savedTasks = true } = {}) {
  const inputs = presenceInputs(Array(5).fill('I will attend the entire workshop at Bobst.'));
  const roster = inputs.map((input, i) => {
    input.raw_response.payload.author.id = String(400 + i * 100);
    return {
      id: `30000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
      display_name: `Synthetic attendee ${i + 1}`,
      discord_user_id: input.raw_response.payload.author.id,
      is_trackable: true,
    };
  });
  const providerEventId = 'syntheticworkshop';
  const eventId = '70000000-0000-4000-8000-000000000002';
  const eventUrl = `https://calendar.google.com/calendar/event?eid=${Buffer.from(`${providerEventId} ${clubId}`).toString('base64url')}`;
  const pending = inputs.map((input, i) => ({
    uuid: `50000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
    created_at: stamp,
    updated_at: stamp,
    expires_at: '2026-10-28T15:00:00.000Z',
    info: {
      version: 1,
      sourceIds: [source],
      inputs: [structuredClone(input)],
      request: {
        summary: 'Add this original speaker to the whole workshop.',
        operation: 'participation',
        calendarKind: 'club',
        calendarEventId: providerEventId,
        personId: roster[i].id,
      },
      batchContext: { observedSyntheticContext: 'Observed unrelated context. '.repeat(1000) },
      executionHistory: [
        {
          kind: 'model_result',
          stage: 'initial',
          result: { text: 'The own participation is not saved yet.' },
        },
      ],
    },
  }));
  const eventIdForSnapshot = eventId;
  const helperId = randomUUID();
  const f = createPresenceFixture({
    inputs,
    pending: savedTasks ? pending : [],
    mapServiceFactory: ({ mapRows, mapEventService: simulated, buildings, clock }) => {
      const store = {
        configured: true,
        read: async () => {
          const row = mapRows.get(eventIdForSnapshot);
          return {
            events: row ? [structuredClone(row.event)] : [],
            event_buildings: row
              ? row.buildings.map((value) => ({
                  ...structuredClone(value),
                  event_id: row.event.id,
                }))
              : [],
            event_people: row
              ? row.people.map((value) => ({ ...structuredClone(value), event_id: row.event.id }))
              : [],
            people: [
              ...roster,
              { id: helperId, display_name: 'Existing helper', is_trackable: true },
            ],
            buildings,
            event_types: ['study', 'other'].map((code) => ({
              code,
              name: code,
              description: '',
              icon_key: code,
              sort_order: 0,
            })),
          };
        },
        lookup: async (args) =>
          structuredClone(
            roster.find((row) => row.discord_user_id === args.providerUserId) ?? null,
          ),
        upsert: async (args) => {
          const created = mapRows.get(args.event.id)?.event.created_at;
          const result = await simulated.upsert(args);
          if (result.status === 'applied')
            mapRows.get(args.event.id).event.created_at = created ?? stamp;
          return result;
        },
      };
      const authorize = async () => true;
      return {
        mapEventStore: store,
        mapEventService: createMapEventService({
          store,
          authorizeSource: authorize,
          now: () => new Date(clock),
        }),
        mapSourceAuthorizer: authorize,
      };
    },
  });
  const event = {
    id: eventId,
    name: 'Synthetic workshop',
    notes: 'Human note: keep the side entrance.',
    kind: 'scheduled_event',
    type_id: 'study',
    status: 'confirmed',
    time_kind: 'timed',
    starts_at: '2026-10-28T19:00:00.000Z',
    ends_at: '2026-10-28T21:00:00.000Z',
    starts_on: null,
    ends_on: null,
    time_zone: 'America/New_York',
    source_id: clubSource,
    source_url: eventUrl,
    source_record_id: providerEventId,
    url: eventUrl,
    reported_at: stamp,
    created_at: stamp,
    updated_at: stamp,
  };
  const existingPerson = {
    person_id: helperId,
    attendance_status: 'going',
    presence_basis: 'planned',
    label: 'Human helper; preserve exactly',
    starts_at: null,
    ends_at: null,
    source_id: clubSource,
    source_url: eventUrl,
    reported_at: stamp,
  };
  f.mapRows.set(eventId, {
    event,
    buildings: [{ building_id: 'bobst-library', location_notes: 'Room 204; keep this room.' }],
    people: [existingPerson],
  });
  const before = structuredClone(f.mapRows.get(eventId));
  const counters = [];
  for (const tool of f.adapters.tools) {
    const prepare = tool.prepareArguments,
      execute = tool.execute;
    tool.prepareArguments = async (...args) => {
      counters.push({ kind: 'prepare', name: tool.name });
      return prepare ? prepare(...args) : args[0];
    };
    tool.execute = async (...args) => {
      counters.push({ kind: 'execute', name: tool.name });
      return execute(...args);
    };
  }
  if (!savedTasks) {
    const prepare = f.adapters.prepareBatch;
    f.adapters.prepareBatch = async (args) => ({
      ...(await prepare(args)),
      syntheticObservedContext: 'Observed unrelated context. '.repeat(100),
    });
  }
  return { ...f, roster, eventId, providerEventId, before, pending, counters };
}

export async function completeResourceTasks(f, { malformedTwice = false } = {}) {
  const chains = new Map(),
    proposals = [],
    malformed = [];
  let stage = malformedTwice ? 'lookup' : 'initial',
    initialRefs,
    badRounds = 0,
    followupTurns = 0,
    transcriptPeak = 0,
    rejectedAt;
  const roots = new Map();
  const own = (input) => originalUrl(input);
  const defer = (i) => ({
    summary: 'Add the original speaker to the whole workshop.',
    operation: 'participation',
    calendarKind: 'club',
    calendarEventId: f.providerEventId,
    personId: f.roster[i].id,
  });
  const parseResults = (request) => {
    for (const message of request.messages.filter((row) => row.role === 'tool')) {
      if (!roots.has(message.toolCallId)) continue;
      const owner = roots.get(message.toolCallId),
        result = JSON.parse(message.content),
        chain = chains.get(owner);
      if (chain.seen.has(message.toolCallId)) continue;
      chain.seen.add(message.toolCallId);
      assert.equal(result.status, 'ready');
      if (!result.fragment) {
        chain.task = result.task;
        chain.next = null;
        continue;
      }
      const fragment = result.fragment;
      assert.equal(fragment.offset, chain.text.length);
      chain.text += fragment.data;
      chain.pieces++;
      chain.next = fragment.nextOffset;
      chain.fragmentId = fragment.id;
      if (chain.next === null) chain.task = JSON.parse(chain.text).task;
    }
  };
  const provider = {
    toolTurn: async (request) => {
      const refs = bindings(request);
      transcriptPeak = Math.max(
        transcriptPeak,
        Buffer.byteLength(JSON.stringify(request.messages)),
      );
      if (refs.phase === 'followup') followupTurns++;
      let calls;
      if (stage === 'lookup') {
        initialRefs = refs.inputIds.map((row) => row.ref);
        calls = f.inputs.map((input, i) =>
          call(
            'lookup_map_person',
            `initial_identity_${i}`,
            {
              provider: 'discord',
              providerUserId: input.raw_response.payload.author.id,
              sourceId: source,
              sourceUrl: own(input),
            },
            [initialRefs[i]],
          ),
        );
        stage = 'malformed';
      } else if (stage === 'malformed') {
        if (badRounds) {
          const errors = malformed.at(-1).map((item) => feedback(request, item.id));
          assert(errors.slice(0, 4).every((row) => row.reason === 'unattempted'));
          assert.equal(errors[4].reason, 'invalid_arguments');
          assert.deepEqual(errors[4].exactPersonIds.choices, [f.roster[4].id]);
          assert.equal(f.tasks.size, 0);
          assert.equal(
            f.counters.length,
            rejectedAt,
            'Rejected reply dispatches and prepares nothing',
          );
        }
        if (badRounds < 2) {
          calls = f.inputs.map((_, i) =>
            call(
              'defer_task',
              `bad_${badRounds}_${i}`,
              { ...defer(i), ...(i === 4 ? { personId: f.roster[i].id.slice(0, -1) } : {}) },
              [initialRefs[i]],
            ),
          );
          malformed.push(structuredClone(calls));
          badRounds++;
          rejectedAt = f.counters.length;
        } else {
          calls = f.inputs.map((_, i) =>
            call('defer_task', `corrected_${i}`, defer(i), [initialRefs[i]]),
          );
          stage = 'initial';
        }
      } else if (stage === 'initial') {
        calls = [
          call(
            'finish_batch',
            'finish_initial',
            refs.handledInputIds.map((row) => row.ref),
          ),
        ];
        stage = 'roots';
      } else if (stage === 'roots') {
        assert.equal(refs.inputIds.length, 5);
        calls = refs.inputIds.map((row, i) => {
          chains.set(row.uuid, { ref: row.ref, text: '', pieces: 0, seen: new Set() });
          const id = `root_${i}`;
          roots.set(id, row.uuid);
          return call('read_pending_task', id, { taskId: row.ref, detail: 'full' }, [row.ref]);
        });
        stage = 'fragments';
      } else if (stage === 'fragments') {
        parseResults(request);
        const unfinished = [...chains.entries()].filter(([, chain]) => chain.next !== null);
        if (unfinished.length) {
          calls = unfinished.map(([owner, chain], i) => {
            const id = `fragment_${followupTurns}_${i}`;
            roots.set(id, owner);
            return call('read_context_fragment', id, { id: chain.fragmentId, offset: chain.next }, [
              chain.ref,
            ]);
          });
        } else {
          for (const [owner, chain] of chains)
            assert.deepEqual(
              chain.task,
              f.tasks.get(owner),
              'Every exact full task is reconstructed before writing',
            );
          calls = f.inputs.flatMap((input, i) => {
            const chain = [...chains.values()].find(
              (row) => row.task.info.inputs[0].uuid === input.uuid,
            );
            return [
              call('read_discord_messages', `source_${i}`, { url: own(input), context: false }, [
                chain.ref,
              ]),
              call(
                'lookup_map_person',
                `person_${i}`,
                {
                  provider: 'discord',
                  providerUserId: input.raw_response.payload.author.id,
                  sourceId: source,
                  sourceUrl: own(input),
                },
                [chain.ref],
              ),
            ];
          });
          calls.push(
            call(
              'read_map_events',
              'map_read',
              { eventId: f.eventId },
              [...chains.values()].map((row) => row.ref),
            ),
          );
          stage = 'patch';
        }
      } else if (stage === 'patch') {
        calls = [
          call(
            'patch_map_participation',
            'grouped',
            {
              eventId: f.eventId,
              expectedUpdatedAt: f.mapRows.get(f.eventId).event.updated_at,
              changes: f.inputs.map((input, i) => ({
                personId: f.roster[i].id,
                sourceUrl: own(input),
                attendanceStatus: 'going',
                start: { inherit: true },
                end: { inherit: true },
              })),
            },
            [...chains.values()].map((row) => row.ref),
          ),
        ];
        stage = 'resolve';
      } else if (stage === 'resolve') {
        assert.equal(
          feedback(request, 'grouped').sourceStatus,
          'applied',
          JSON.stringify(feedback(request, 'grouped')),
        );
        calls = [...chains.values()].map((chain, i) =>
          call(
            'resolve_pending_task',
            `resolve_${i}`,
            { taskId: chain.ref, outcome: 'completed' },
            [chain.ref],
          ),
        );
        stage = 'finish';
      } else {
        calls = [call('finish_batch', 'finish_followup', [])];
        stage = 'done';
      }
      proposals.push(structuredClone(calls));
      return turn(...calls);
    },
  };
  const result = await f.run(provider);
  assert.equal(result.status, 'completed');
  assert.equal(result.followupStatus, 'completed');
  assert.equal(result.handled, 5);
  assert.equal(f.tasks.size, 0);
  assert.equal(chains.size, 5);
  assert([...chains.values()].every((chain) => chain.pieces >= 3));
  assert(followupTurns <= 10);
  assert(transcriptPeak <= 262144);
  assert.equal(
    f.chronology.filter((row) => row.kind === 'map_write' && row.event.id === f.eventId).length,
    1,
  );
  const after = f.mapRows.get(f.eventId);
  assert.deepEqual({ ...after.event, updated_at: f.before.event.updated_at }, f.before.event);
  assert.deepEqual(after.buildings, f.before.buildings);
  assert.deepEqual(
    after.people.find((row) => row.person_id === f.before.people[0].person_id),
    f.before.people[0],
  );
  for (const [i, input] of f.inputs.entries()) {
    const person = after.people.find((row) => row.person_id === f.roster[i].id);
    assert(person);
    assert.equal(person.source_url, own(input));
    assert.equal(person.attendance_status, 'going');
  }
  if (malformedTwice)
    for (const chain of chains.values()) {
      const history = chain.task.info.executionHistory;
      for (const rejected of malformed)
        assert(
          history.some(
            (row) =>
              row.kind === 'model_result' &&
              canonicalJson(row.result.toolCalls) === canonicalJson(rejected),
          ),
          'Both rejected proposals remain in every saved full task history: ' +
            JSON.stringify(
              history.map((row) => ({
                kind: row.kind,
                tool: row.tool,
                ids: row.result?.toolCalls?.map((call) => call.id),
              })),
            ),
        );
    }
  return { result, chains, proposals, malformed, transcriptPeak, followupTurns };
}
