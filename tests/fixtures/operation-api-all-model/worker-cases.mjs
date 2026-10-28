import assert from 'node:assert/strict';
import { input, task, ids, copy, originalUrl, clubId, memberId } from '../planner-followup.mjs';
import { calendarEventId } from '../../../server/google/calendar-client.js';
import { workerFixture } from './worker-fixture.mjs';
const key = (original) => `discord:100:200:${original.raw_response.payload.id}`;
function sourceTask(n, original, summary, kind = 'club') {
  const value = task(n, {
    original,
    current: true,
    operation: 'source_review',
    large: false,
    summary,
  });
  value.info.request.calendarKind = kind;
  value.info.request.calendarEventId = calendarEventId(
    kind === 'club' ? clubId : memberId,
    key(original),
  );
  return value;
}
const scenarioNames = [
  'worker-club-followup',
  'worker-member-participation',
  'worker-task-fragments',
];
export const workerNames = scenarioNames;
export const workerExpected = {
  'worker-club-followup': [
    'upsert_calendar_event',
    'cancel_calendar_event',
    'sync_calendars_to_map',
    'read_pending_task',
    'resolve_pending_task',
    'finish_batch',
  ],
  'worker-member-participation': [
    'list_member_plans',
    'read_member_plan',
    'upsert_member_plan',
    'cancel_member_plan',
    'patch_map_participation',
    'finish_batch',
  ],
  'worker-task-fragments': [
    'defer_task',
    'read_pending_task',
    'read_context_fragment',
    'resolve_pending_task',
    'finish_batch',
  ],
};
export async function workerScenario(name) {
  assert(scenarioNames.includes(name));
  let freshInputs, pending, seed, verify;
  if (name === 'worker-club-followup') {
    const update = input(31, {
      content:
        'Confirmed club announcement: API workshop is rescheduled to Saturday October 24, 2026, 2–3 PM New York at Bobst Library. Please keep the map in sync with the revised Calendar schedule.',
    });
    const cancel = input(32, {
      content:
        'Confirmed club announcement: API orientation scheduled for Saturday October 24, 2026, 5–6 PM New York at Bobst Library is CANCELLED.',
    });
    freshInputs = [update, cancel];
    pending = [
      sourceTask(
        31,
        update,
        'Reconcile the rescheduled API workshop from its current original; update the Calendar then explicitly synchronize the map after this follow-up change.',
      ),
      sourceTask(
        32,
        cancel,
        'Cancel the existing source-owned API orientation from its explicit current cancellation original.',
      ),
    ];
    seed = [
      {
        original: update,
        options: {
          title: 'API workshop',
          start: '2026-10-24T17:00:00.000Z',
          end: '2026-10-24T18:00:00.000Z',
        },
      },
      {
        original: cancel,
        options: {
          title: 'API orientation',
          start: '2026-10-24T21:00:00.000Z',
          end: '2026-10-24T22:00:00.000Z',
        },
      },
    ];
    verify = (f) => {
      const rows = f.calendars.maps.get(clubId),
        updated = rows.get(calendarEventId(clubId, key(update))),
        cancelled = rows.get(calendarEventId(clubId, key(cancel)));
      assert.equal(updated.start.dateTime, '2026-10-24T18:00:00.000Z');
      assert.equal(updated.end.dateTime, '2026-10-24T19:00:00.000Z');
      assert.equal(cancelled.status, 'cancelled');
      assert(!f.tasks.has(pending[0].uuid));
      assert(!f.tasks.has(pending[1].uuid));
    };
  } else if (name === 'worker-member-participation') {
    const presence = input(41, {
      content: 'I am at Bobst now studying calculus until 8 PM New York today.',
    });
    const cancel = input(42, {
      content:
        'My personal Bobst study session tomorrow is CANCELLED. I will no longer be there. This cancels my existing personal plan, not the club workshop. Please check my existing personal calendar plan details before removing it.',
    });
    const attendance = input(43, {
      content:
        'I will attend the Friday workshop at Bobst tonight for the entire 7–9 PM New York event.',
    });
    const attendanceTask = task(43, {
      original: attendance,
      current: true,
      large: false,
      summary:
        'Add this original speaker to the existing Friday workshop for the full event. Preserve all event facts and the other participant.',
    });
    freshInputs = [presence, cancel, attendance];
    pending = [attendanceTask];
    seed = [
      {
        original: cancel,
        options: {
          member: true,
          title: 'Bobst study session',
          start: '2026-10-24T19:00:00.000Z',
          end: '2026-10-24T20:00:00.000Z',
        },
      },
    ];
    verify = (f) => {
      const rows = f.calendars.maps.get(memberId),
        active = rows.get(calendarEventId(memberId, key(presence))),
        cancelled = rows.get(calendarEventId(memberId, key(cancel)));
      assert(active, 'Personal presence must originate in Member Plans');
      assert.equal(active.end.dateTime, '2026-10-24T00:00:00.000Z');
      assert.equal(cancelled.status, 'cancelled');
      assert(
        f
          .state()
          .map.event_people.some(
            (row) => row.event_id === ids.event && row.person_id === ids.person,
          ),
      );
      assert(!f.tasks.has(attendanceTask.uuid));
    };
  } else {
    const unresolved = input(51, {
      content:
        'Please schedule our study meetup next week, but we have not decided the day, time, or location yet. Keep this pending until the organizers provide those essential details.',
    });
    const discussion = input(52, {
      content:
        'This was a general conversation with no scheduling, attendance or location request. '.repeat(
          205,
        ) + 'No action was requested and nothing needs to be changed.',
    });
    const reviewed = task(52, {
      original: discussion,
      current: true,
      operation: 'source_review',
      large: false,
      summary:
        'Review the complete saved original context; it was only general discussion without an actionable request. Close this task only after reviewing its actual original. Preserve unrelated unresolved meetup work.',
    });
    freshInputs = [unresolved, discussion];
    pending = [reviewed];
    seed = [];
    verify = (f) => {
      assert(!f.tasks.has(reviewed.uuid), 'Reviewed no-action discussion may close');
      const retained = [...f.tasks.values()].find((row) =>
        row.info.inputs.some((original) => original.uuid === unresolved.uuid),
      );
      assert(retained, 'Missing essential meetup details must remain saved');
      assert.equal(
        f.calendars.writes.length,
        f.setupWriteCount,
        'Ambiguity cannot create Calendar events',
      );
    };
  }
  const f = await workerFixture({ freshInputs, pending, seed });
  return {
    name,
    kind: 'worker',
    expected: workerExpected[name],
    f,
    state: f.state,
    calls: f.calls,
    proposals: f.proposals,
    run: f.run,
    verify(answer) {
      assert.equal(answer.result.status, 'completed');
      assert.equal(answer.result.followupStatus, 'completed');
      verify(f);
    },
    safeCoverage() {
      return f.executions
        .filter((row) => row.kind === 'tool_result')
        .map((row) => ({
          name: row.tool,
          origin: row.origin ?? 'model',
          status: row.result?.status ?? 'unknown',
          ...(row.result?.reason ? { reason: row.result.reason } : {}),
        }));
    },
    offline: async () => {
      await f.prepareOffline();
      for (const original of f.originals) {
        const current = await f.executeOffline(
          'read_discord_messages',
          { url: originalUrl(original), context: false },
          [original.uuid],
        );
        assert.equal(current.status, 'ready');
        assert(
          current.sources.some((source) => source.messageId === original.raw_response.payload.id),
          'Every queued exact original must be present in the synthetic provider',
        );
      }
      const listed = await f.executeOffline('list_member_plans', {
        timeMin: '2026-10-23T00:00:00.000Z',
        timeMax: '2026-10-25T00:00:00.000Z',
      });
      assert.equal(listed.status, 'ready');
      const read = await f.executeOffline('read_map_events', {});
      assert.equal(read.status, 'ready');
      assert.equal(
        f.tools.filter((row) => workerExpected[name].includes(row.name)).length,
        workerExpected[name].filter((value) => value !== 'finish_batch').length,
      );
      await f.enterFollowupOffline();
      const taskRead = await f.executeOffline('read_pending_task', { taskId: pending[0].uuid }, [
        pending[0].uuid,
      ]);
      assert.equal(taskRead.status, 'ready');
      if (name === 'worker-task-fragments') {
        assert(
          taskRead.fragment?.nextOffset,
          'Large compact task must require a real continuation',
        );
        let part = taskRead;
        while (part.fragment.nextOffset !== null) {
          part = await f.executeOffline(
            'read_context_fragment',
            { id: part.fragment.id, offset: part.fragment.nextOffset },
            [pending[0].uuid],
          );
          assert.equal(part.status, 'ready');
        }
      }
      f.adapters.cleanupBatch();
      return {
        fixture: 'ready',
        seededCalendarWrites: f.setupWriteCount,
        sourceInputs: freshInputs.length,
        taskCount: pending.length,
      };
    },
  };
}
