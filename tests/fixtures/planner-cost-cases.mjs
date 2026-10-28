import assert from 'node:assert/strict';

// These cases exercise the production runner and adapters. The existing fixture
// replaces only source, Calendar/map and persistence boundaries with simulations.
export const plannerCostCases = [
  {
    name: 'clear-whole-event-attendance',
    setup: (lib) => lib.fixture({ backlog: 0, freshInputs: [lib.input()] }),
    verify(lib, fixture, result) {
      assert.equal(result.status, 'completed');
      assert.equal(result.handled, 1);
      lib.assertAdded(fixture);
      assert.equal(fixture.tasks.size, 0, 'A supported completed request must not remain pending');
    },
  },
  {
    name: 'acknowledgement-needs-no-update',
    setup: (lib) =>
      lib.fixture({
        backlog: 0,
        freshInputs: [lib.input(1, { author: '500', content: 'Thanks for sharing the slides!' })],
      }),
    verify(lib, fixture, result) {
      assert.equal(result.status, 'completed');
      assert.equal(result.handled, 1);
      assert.equal(fixture.writes.length, 0);
      assert.equal(fixture.calendarWrites.length, 0);
      assert.deepEqual(fixture.state, fixture.before);
      assert.equal(fixture.tasks.size, 0, 'An acknowledgement must not accumulate a new task');
    },
  },
  {
    name: 'partial-attendance-missing-times-stays-unfinished',
    setup: (lib) =>
      lib.fixture({
        backlog: 0,
        freshInputs: [
          lib.input(1, {
            content:
              "Please mark me attending only part of tonight's workshop. I cannot yet say when I arrive or leave; do not mark me for the entire event.",
          }),
        ],
      }),
    verify(lib, fixture) {
      lib.assertPreserved(fixture);
      assert.equal(fixture.writes.length, 0, 'Missing attendance boundaries must not be invented');
      assert(fixture.tasks.size > 0, 'The requested but unfinished update must remain saved');
      assert(
        [...fixture.tasks.values()].some((task) =>
          task.info.inputs.some((input) => input.uuid === fixture.originals[0].uuid),
        ),
        'Retained work must contain its exact original input',
      );
    },
  },
  {
    name: 'unavailable-source-preserves-task-and-ready-peer-finishes',
    setup(lib) {
      const blocked = lib.task(1, {
        current: true,
        large: false,
        original: lib.input(1, { author: '700' }),
        personId: null,
      });
      const ready = lib.task(2, {
        current: true,
        large: false,
        original: lib.input(2),
      });
      const fixture = lib.fixture({ backlog: 0, current: [blocked, ready] });
      const tool = fixture.adapters.tools.find(
        (candidate) => candidate.name === 'read_discord_messages',
      );
      const execute = tool.execute;
      tool.execute = async (args, context) =>
        args.messageId === '301' || args.url?.endsWith('/301')
          ? { status: 'unavailable', reason: 'source_unavailable' }
          : execute(args, context);
      fixture.costBlockedTask = blocked.uuid;
      fixture.costReadyTask = ready.uuid;
      return fixture;
    },
    verify(lib, fixture, result) {
      assert.equal(result.status, 'completed');
      lib.assertAdded(fixture);
      assert(fixture.tasks.has(fixture.costBlockedTask));
      assert(!fixture.tasks.has(fixture.costReadyTask));
      assert(
        fixture.tools.some(
          (row) => row.name === 'read_discord_messages' && row.result.status === 'unavailable',
        ),
      );
      const retained = fixture.tasks.get(fixture.costBlockedTask);
      assert.deepEqual(retained.info.inputs, fixture.initialTasks[0].info.inputs);
    },
  },
];
