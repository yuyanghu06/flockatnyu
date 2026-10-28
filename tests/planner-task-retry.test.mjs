import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { createPendingTaskStore } from '../server/automation/task-store.js';
import { createTaskRetrySchedule } from '../server/automation/task-retry-schedule.js';

const migrations = [
  '202610170018_agent_input_cache.sql',
  '202610170019_agent_automation_state.sql',
  '202610180032_scoped_agent_claim.sql',
  '202610210036_agent_retry_quarantine.sql',
  '202610220038_agent_empty_scope_maintenance.sql',
  '202610220039_agent_pending_tasks.sql',
  '202610230045_agent_task_catalogue.sql',
  '202610280055_agent_task_retry_schedule.sql',
];

async function fixture() {
  const db = new PGlite(),
    source = randomUUID(),
    token = randomUUID(),
    cycleId = randomUUID();
  await db.exec('create role anon;create role authenticated;create role service_role bypassrls;');
  for (const name of migrations)
    await db.exec(
      await readFile(new URL('../supabase/migrations/' + name, import.meta.url), 'utf8'),
    );
  await db.query(
    "update public.agent_automation_state set data=jsonb_build_object('token',$1::text,'lease_until',clock_timestamp()+interval '1 hour') where key='runner'",
    [token],
  );
  const calls = [],
    env = { SUPABASE_URL: 'https://task-retry.invalid', SUPABASE_SERVICE_ROLE_KEY: 'fixture-only' };
  let failSave = false;
  const createStore = () =>
    createPendingTaskStore({
      env,
      writeDiagnostic() {},
      fetchImpl: async (url, request) => {
        const name = new URL(url).pathname.split('/').at(-1),
          args = JSON.parse(request.body);
        calls.push({ name, args });
        if (failSave && name.endsWith('_save')) return Response.json({}, { status: 503 });
        const entries = Object.entries(args),
          values = entries.map(([, v]) =>
            v && typeof v === 'object' && !Array.isArray(v) ? JSON.stringify(v) : v,
          );
        const result = (
          await db.query(
            `select public.${name}(${entries.map(([key], i) => `${key}=>$${i + 1}`).join(',')}) result`,
            values,
          )
        ).rows[0].result;
        return Response.json(result);
      },
    });
  const store = createStore(),
    now = new Date().toISOString();
  const info = {
    version: 1,
    sourceIds: [source],
    inputs: [
      {
        uuid: randomUUID(),
        raw_response: {
          source: 'discord',
          source_id: source,
          event_type: 'message_created',
          received_at: now,
          payload: {
            id: '300',
            guild_id: '100',
            channel_id: '200',
            author: { id: '400' },
            content: 'Preserve this original',
            timestamp: now,
          },
        },
      },
    ],
    request: { operation: 'source_review', summary: 'Review an unresolved original' },
    batchContext: {},
    executionHistory: [],
  };
  const created = await store.save({
    leaseToken: token,
    allowedSourceIds: [source],
    task: { uuid: randomUUID(), info },
  });
  assert.equal(created.status, 'ready');
  const task = created.task,
    common = {
      leaseToken: token,
      allowedSourceIds: [source],
      taskId: task.uuid,
      expectedUpdatedAt: task.updated_at,
      cycleId,
    };
  const row = async () =>
    (
      await db.query('select to_jsonb(t) data from public.agent_pending_tasks t where uuid=$1', [
        task.uuid,
      ])
    ).rows[0]?.data;
  const retry = async () =>
    (
      await db.query(
        'select to_jsonb(r) data from public.agent_pending_task_retries r where task_id=$1',
        [task.uuid],
      )
    ).rows[0]?.data;
  return {
    db,
    source,
    token,
    cycleId,
    task,
    store,
    common,
    calls,
    row,
    retry,
    createStore,
    failSave(value) {
      failSave = value;
    },
    schedule({
      current = task,
      cycle = cycleId,
      currentCycleTask = () => false,
      attempted = true,
      selectedStore = store,
    } = {}) {
      const state = { task: current };
      const schedule = createTaskRetrySchedule({
        taskStore: selectedStore,
        getCycle: () => ({ id: cycle, leaseToken: token }),
        getTask: (id) => (id === state.task?.uuid ? state.task : undefined),
        getScope: () => [source],
        current: Boolean,
        currentCycleTask,
        attemptedTasks: new Set(attempted ? [task.uuid] : []),
        oldTaskRetries: new Map(),
        now: () => new Date(),
      });
      return { schedule, state };
    },
  };
}

test('durable attempt timing survives an abrupt restart without changing saved task data', async () => {
  const f = await fixture();
  try {
    const before = await f.row(),
      { schedule } = f.schedule();
    assert.equal((await schedule.begin()).status, 'ready');
    assert.equal((await schedule.recordTaskAttempt({ taskId: f.task.uuid })).status, 'ready');
    const marked = await f.retry();
    assert.equal(marked.outcome, 'attempted');
    assert.equal(marked.finalized_at, null);
    assert(Date.parse(marked.retry_at) > Date.now());
    assert.deepEqual(await f.row(), before);
    const restarted = f.schedule({ cycle: randomUUID(), selectedStore: f.createStore() }).schedule;
    assert.equal((await restarted.begin()).status, 'ready');
    assert.equal(restarted.available(f.task), false, 'A new process sees the durable crash marker');
    assert.equal(
      (await f.store.beginRetry({ ...f.common, cycleId: randomUUID() })).status,
      'pending',
    );
    assert.deepEqual(await f.row(), before);
    const catalogue = await f.store.catalogue({
      leaseToken: f.token,
      allowedSourceIds: [f.source],
    });
    assert.equal(catalogue.status, 'ready');
    assert(
      !Object.hasOwn(catalogue.tasks[0], 'retry'),
      'Old catalogue wire shape remains compatible',
    );
  } finally {
    await f.db.close();
  }
});

test('checkpoint rejection still finalizes attempted-task timing once; repeated calls cannot extend it', async () => {
  const f = await fixture();
  try {
    const before = await f.row(),
      { schedule } = f.schedule();
    await schedule.begin();
    await schedule.recordTaskAttempt({ taskId: f.task.uuid });
    const firstMarker = await f.retry();
    await schedule.recordTaskAttempt({ taskId: f.task.uuid });
    assert.equal((await f.retry()).retry_at, firstMarker.retry_at);
    f.failSave(true);
    const rejected = await f.store.save({
      leaseToken: f.token,
      allowedSourceIds: [f.source],
      task: {
        uuid: f.task.uuid,
        info: { ...f.task.info, executionHistory: [{ kind: 'observed_result' }] },
      },
      expectedUpdatedAt: f.task.updated_at,
    });
    assert.equal(rejected.status, 'unavailable');
    assert.equal((await schedule.finishAttempt({ outcome: 'preflight_failed' })).status, 'ready');
    const finished = await f.retry();
    assert.equal(finished.outcome, 'preflight_failed');
    assert(finished.finalized_at);
    assert.deepEqual(await f.row(), before);
    await f.store.finishRetry({ ...f.common, outcome: 'completed' });
    assert.deepEqual(
      await f.retry(),
      finished,
      'Duplicate finalization cannot move the deadline or rewrite its result',
    );
  } finally {
    await f.db.close();
  }
});

test('history-only checkpoint forwarding is explicit; new human intent stays eligible', async () => {
  const f = await fixture();
  try {
    const { schedule, state } = f.schedule();
    await schedule.begin();
    await schedule.recordTaskAttempt({ taskId: f.task.uuid });
    const next = await f.store.save({
      leaseToken: f.token,
      allowedSourceIds: [f.source],
      task: {
        uuid: f.task.uuid,
        info: {
          ...f.task.info,
          executionHistory: [{ kind: 'tool_result', result: { status: 'unavailable' } }],
        },
      },
      expectedUpdatedAt: f.task.updated_at,
    });
    assert.equal(next.status, 'ready');
    assert.equal(
      (await f.store.finishRetry({ ...f.common, outcome: 'completed' })).status,
      'conflict',
    );
    schedule.checkpoint(f.task, next.task);
    state.task = next.task;
    assert.equal((await schedule.finishAttempt({ outcome: 'completed' })).status, 'ready');
    assert.equal((await f.retry()).task_updated_at, next.task.updated_at);
    const changed = await f.store.save({
      leaseToken: f.token,
      allowedSourceIds: [f.source],
      task: {
        uuid: f.task.uuid,
        info: {
          ...next.task.info,
          request: { ...next.task.info.request, summary: 'A human changed the task' },
        },
      },
      expectedUpdatedAt: next.task.updated_at,
    });
    assert.equal(changed.status, 'ready');
    const retries = await f.store.listRetries({
      leaseToken: f.token,
      allowedSourceIds: [f.source],
    });
    assert.deepEqual(retries.retries, [], 'Old retry metadata cannot hide a newer task version');
    const restarted = f.schedule({ current: changed.task, cycle: randomUUID() }).schedule;
    await restarted.begin();
    assert(restarted.available(changed.task));
    assert.equal(
      (
        await f.store.finishRetry({
          ...f.common,
          checkpointUpdatedAt: changed.task.updated_at,
          outcome: 'completed',
        })
      ).status,
      'conflict',
      'Even a supplied version cannot defer changed intent',
    );
  } finally {
    await f.db.close();
  }
});

test('current claimed originals and changed versions bypass old timing without guessing source bindings', async () => {
  const f = await fixture();
  try {
    await f.store.beginRetry(f.common);
    const otherCycle = randomUUID();
    assert.equal(
      (await f.store.beginRetry({ ...f.common, cycleId: otherCycle })).status,
      'pending',
    );
    await f.db.query(
      "update public.agent_automation_state set data=data||jsonb_build_object('snapshot',jsonb_build_object($1::text,md5($2::jsonb::text)),'sources',jsonb_build_object($1::text,$3::text)) where key='runner'",
      [f.task.info.inputs[0].uuid, JSON.stringify(f.task.info.inputs[0].raw_response), f.source],
    );
    assert.equal((await f.store.beginRetry({ ...f.common, cycleId: otherCycle })).status, 'ready');
    assert.equal((await f.retry()).cycle_id, otherCycle);
    const current = f.schedule({ currentCycleTask: () => true, cycle: otherCycle }).schedule;
    await current.begin();
    assert(current.available(f.task));
    await f.db.query(
      "update public.agent_automation_state set data=data||jsonb_build_object('snapshot',jsonb_build_object($1::text,'wrong-hash')) where key='runner'",
      [f.task.info.inputs[0].uuid],
    );
    assert.equal(
      (await f.store.beginRetry({ ...f.common, cycleId: randomUUID() })).status,
      'pending',
    );
  } finally {
    await f.db.close();
  }
});

test('wrong lease, revoked scope, stale versions and expiry cannot write timing; resolution cascades', async () => {
  const f = await fixture();
  try {
    const before = await f.row();
    assert.equal(
      (await f.store.beginRetry({ ...f.common, leaseToken: randomUUID() })).status,
      'stale',
    );
    assert.equal(
      (await f.store.beginRetry({ ...f.common, allowedSourceIds: [randomUUID()] })).status,
      'forbidden',
    );
    assert.equal(
      (await f.store.beginRetry({ ...f.common, expectedUpdatedAt: '2000-01-01T00:00:00Z' })).status,
      'conflict',
    );
    assert.equal(await f.retry(), undefined);
    assert.deepEqual(await f.row(), before);
    assert.equal(
      (await f.schedule({ attempted: false }).schedule.recordTaskAttempt({ taskId: f.task.uuid }))
        .status,
      'stale',
    );
    await f.store.beginRetry(f.common);
    const marker = await f.retry();
    await f.db.query(
      "update public.agent_automation_state set data=jsonb_set(data,'{lease_until}',to_jsonb((clock_timestamp()-interval '1 second')::text)) where key='runner'",
    );
    assert.equal((await f.store.finishRetry({ ...f.common, outcome: 'aborted' })).status, 'stale');
    assert.deepEqual(await f.retry(), marker);
    await f.db.query(
      "update public.agent_automation_state set data=jsonb_set(data,'{lease_until}',to_jsonb((clock_timestamp()+interval '1 hour')::text)) where key='runner'",
    );
    assert.equal(
      (
        await f.store.resolve({
          leaseToken: f.token,
          allowedSourceIds: [f.source],
          taskId: f.task.uuid,
          expectedUpdatedAt: f.task.updated_at,
        })
      ).status,
      'ready',
    );
    assert.equal(await f.row(), undefined);
    assert.equal(await f.retry(), undefined);
  } finally {
    await f.db.close();
  }
});

test('expiry and service-only grants preserve the original task lifetime', async () => {
  const f = await fixture();
  try {
    await f.store.beginRetry(f.common);
    await f.db.query(
      "update public.agent_pending_tasks set created_at=clock_timestamp()-interval '25 hours',updated_at=clock_timestamp()-interval '2 hours',expires_at=clock_timestamp()-interval '1 hour' where uuid=$1",
      [f.task.uuid],
    );
    assert.equal((await f.store.beginRetry(f.common)).status, 'expired');
    assert.equal(
      (await f.store.finishRetry({ ...f.common, outcome: 'completed' })).status,
      'expired',
    );
    assert.deepEqual(
      (await f.store.listRetries({ leaseToken: f.token, allowedSourceIds: [f.source] })).retries,
      [],
    );
    await f.db.exec('set role authenticated');
    await assert.rejects(
      f.db.query('select * from public.agent_pending_task_retries'),
      /permission denied/,
    );
    await assert.rejects(
      f.db.query('select public.agent_pending_task_retry_catalogue($1,$2)', [f.token, [f.source]]),
      /permission denied/,
    );
    await f.db.exec('reset role');
    assert.equal((await f.store.prune()).pruned, 1);
    assert.equal(await f.row(), undefined);
    assert.equal(await f.retry(), undefined);
  } finally {
    await f.db.close();
  }
});

test('missing migration or invalid retry metadata fails before another model can use a task', async () => {
  const env = {
    SUPABASE_URL: 'https://task-retry.invalid',
    SUPABASE_SERVICE_ROLE_KEY: 'fixture-only',
  };
  const store = createPendingTaskStore({
    env,
    writeDiagnostic() {},
    fetchImpl: async () => Response.json({}, { status: 404 }),
  });
  assert.equal(
    (await store.listRetries({ leaseToken: randomUUID(), allowedSourceIds: [randomUUID()] }))
      .status,
    'unavailable',
  );
  const invalid = createPendingTaskStore({
    env,
    writeDiagnostic() {},
    fetchImpl: async () =>
      Response.json({ status: 'ready', retries: [{ taskId: randomUUID(), updatedAt: 'bad' }] }),
  });
  assert.equal(
    (await invalid.listRetries({ leaseToken: randomUUID(), allowedSourceIds: [randomUUID()] }))
      .status,
    'unavailable',
  );
  const schedule = createTaskRetrySchedule({
    taskStore: { listRetries: async () => ({ status: 'ready', retries: [] }) },
    getCycle: () => ({}),
    getTask: () => null,
    getScope: () => [],
    current: Boolean,
    currentCycleTask: () => false,
    attemptedTasks: new Set(),
    oldTaskRetries: new Map(),
    now: () => new Date(),
  });
  assert.equal(
    (await schedule.begin()).status,
    'not_configured',
    'Partially wired production scheduling must not fall back silently',
  );
});
