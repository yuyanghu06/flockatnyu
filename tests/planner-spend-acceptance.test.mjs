import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { summarizePlannerSpend } from '../server/audit/planner-spend-report.js';
import { collectPlannerSpend } from '../scripts/planner-spend-report.mjs';
import { createPendingTaskStore } from '../server/automation/task-store.js';
import { createAutomationHandler } from '../server/automation/handler.js';
import {
  fixture,
  input,
  task,
  ids,
  call as toolCall,
  turn,
  copy,
} from './fixtures/planner-followup.mjs';

const start = '2026-10-21T15:40:49.896Z';
const end = '2026-10-28T15:40:49.896Z';
const at = '2026-10-24T12:00:00.000Z';
const rates = { perTokens: 1000000, input: 0.1, cacheRead: 0.01, cacheWrite: 0.125, output: 0.5 };
const usage = {
  inputTokens: 1000,
  cacheReadTokens: 600,
  cacheWriteTokens: 200,
  outputTokens: 100,
  reasoningTokens: 50,
};
const knownCost = 0.000101;
const call = (id, overrides = {}) => ({
  call_id: id,
  run_id: `run-${id}`,
  agent: 'planner',
  operation: 'toolTurn',
  provider_base_host: 'api.openai.com',
  model: 'gpt-6-luna',
  status: 'succeeded',
  started_at: at,
  http_status: 200,
  usage,
  pricing_basis: rates,
  estimated_cost_usd: knownCost,
  ...overrides,
});
const event = (id, overrides = {}) => ({
  event_id: id,
  run_id: 'run-priced',
  agent: 'planner',
  kind: 'run_finished',
  status: 'completed',
  counts: {},
  created_at: at,
  ...overrides,
});

test('spending report separates known zero, unknown usage and excluded traffic without double-counting reasoning', () => {
  const calls = [
    call('priced'),
    call('zero', {
      usage: { inputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 0 },
      estimated_cost_usd: 0,
    }),
    call('unknown', {
      status: 'failed',
      http_status: 429,
      usage: null,
      estimated_cost_usd: null,
      pricing_basis: null,
    }),
    call('diagnostic', { operation: 'diagnostic_quota_probe', estimated_cost_usd: 10 }),
    call('chat', { agent: 'chat', estimated_cost_usd: 20 }),
    call('other-host', { provider_base_host: 'provider.example.test', estimated_cost_usd: 30 }),
    call('before', { started_at: '2026-10-21T15:40:49.895Z' }),
    call('after', { started_at: end }),
  ];
  const events = [
    event('resolution', { kind: 'tool_finished', tool: 'resolve_pending_task', status: 'ready' }),
    event('ending', {
      status: 'preflight_failed',
      counts: { handled: 2 },
      created_at: '2026-10-24T12:01:00Z',
    }),
    event('zero-ending', { run_id: 'run-zero', counts: { handled: 0 } }),
    event('chat-ending', { agent: 'chat', counts: { handled: 100 } }),
  ];
  const report = summarizePlannerSpend({ calls, events, start, end });
  assert.deepEqual(report.total, {
    requests: 3,
    pricedRequests: 2,
    unknownCostRequests: 1,
    costUsd: knownCost,
  });
  assert.deepEqual(report.components, {
    otherInputUsd: 0.00002,
    cacheReadUsd: 0.000006,
    cacheWriteUsd: 0.000025,
    outputUsd: 0.00005,
  });
  assert.equal(report.tokens.output, 100, 'Reasoning is already included in output');
  assert.equal(report.missingInputUsage, 1);
  assert.equal(report.rejected429WithoutUsage, 1);
  assert.equal(report.unreconciledPricedRequests, 0);
  assert.equal(report.byOutcome.preflight_failed.costUsd, knownCost);
  assert.equal(report.lifecycle.confirmedResolutionOperations, 1);
  assert.equal(report.lifecycle.reportedHandledInputs, 2);
  assert.equal(report.lifecycle.handledCountEvents, 2);
  assert.equal(report.costPerReportedHandledInputUsd, knownCost / 2);
  assert(report.limitations.some((row) => row.includes('earlier useful writes')));
  assert(
    !JSON.stringify(report).includes('run-priced'),
    'Output contains aggregate totals, not raw record IDs',
  );
});

test('unreconciled prices remain visible and duplicate records cannot inflate spending', () => {
  const invalid = call('invalid', {
    usage: { ...usage, cacheWriteTokens: 700 },
    estimated_cost_usd: 0.01,
  });
  const report = summarizePlannerSpend({ calls: [invalid], events: [], start, end });
  assert.equal(report.total.costUsd, 0.01);
  assert.equal(report.unreconciledPricedRequests, 1);
  assert.equal(
    Object.values(report.components).reduce((sum, value) => sum + value, 0),
    0,
  );
  assert.throws(
    () => summarizePlannerSpend({ calls: [call('same'), call('same')], events: [], start, end }),
    /Duplicate model call/,
  );
  assert.throws(
    () => summarizePlannerSpend({ calls: [], events: [event('same'), event('same')], start, end }),
    /Duplicate audit event/,
  );
});

function paginatedTransport({ expected = 1001, duplicate = false, missing = false } = {}) {
  const requests = [];
  const all = Array.from({ length: 1001 }, (_, index) =>
    call(`call-${index}`, {
      usage: { inputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 0 },
      estimated_cost_usd: 0,
    }),
  );
  const fetchImpl = async (value, options) => {
    const url = new URL(value);
    requests.push({ url, method: options.method ?? 'GET' });
    assert.equal(url.hostname, 'audit.example.test');
    assert.equal(options.redirect, 'error');
    assert.equal(url.searchParams.get('agent'), 'eq.planner');
    assert(url.searchParams.get('and').includes(end));
    const fields = url.searchParams.get('select').split(',');
    for (const forbidden of ['output', 'prompt', 'raw_response', 'info', '*'])
      assert(!fields.includes(forbidden));
    const model = url.pathname.endsWith('/agent_model_calls');
    const offset = Number(url.searchParams.get('offset'));
    let rows = model ? all.slice(offset, offset + 1000) : [];
    if (model && duplicate && offset === 1000) rows = [all[0]];
    if (model && missing && offset === 0) rows = all.slice(0, 999);
    return Response.json(rows, {
      headers: { 'content-range': `0-${Math.max(0, rows.length - 1)}/${model ? expected : 0}` },
    });
  };
  return { fetchImpl, requests };
}
const env = {
  SUPABASE_URL: 'https://audit.example.test',
  SUPABASE_SERVICE_ROLE_KEY: 'synthetic-report-key',
};

test('collector completely pages metadata only, with exact row counts and no business mutations', async () => {
  const transport = paginatedTransport();
  const report = await collectPlannerSpend({ env, fetchImpl: transport.fetchImpl, start, end });
  assert.equal(report.total.requests, 1001);
  assert.equal(report.total.pricedRequests, 1001);
  assert.equal(report.total.unknownCostRequests, 0);
  assert.deepEqual(
    report.collection.map((row) => [row.rows, row.exactCount, row.paginationComplete]),
    [
      [1001, 1001, true],
      [0, 0, true],
    ],
  );
  assert.equal(transport.requests.length, 3);
  assert(transport.requests.every((row) => row.method === 'GET'));
  assert.deepEqual(
    transport.requests.slice(0, 2).map((row) => row.url.searchParams.get('offset')),
    ['0', '1000'],
  );
  assert(!JSON.stringify(report).includes(env.SUPABASE_SERVICE_ROLE_KEY));
});

test('collector rejects a duplicate last page, missing page and count mismatch', async () => {
  for (const options of [{ duplicate: true }, { missing: true }, { expected: 1002 }]) {
    const transport = paginatedTransport(options);
    await assert.rejects(
      collectPlannerSpend({ env, fetchImpl: transport.fetchImpl, start, end }),
      /Incomplete audit pagination/,
    );
  }
});

test('actual retry SQL survives a crashed client, fences later attempts and preserves task content', async () => {
  const db = new PGlite();
  const token = randomUUID(),
    cycleId = randomUUID();
  try {
    await db.exec('create role anon;create role authenticated;create role service_role bypassrls;');
    for (const migration of [
      '202610170018_agent_input_cache.sql',
      '202610170019_agent_automation_state.sql',
      '202610180032_scoped_agent_claim.sql',
      '202610210036_agent_retry_quarantine.sql',
      '202610220038_agent_empty_scope_maintenance.sql',
      '202610220039_agent_pending_tasks.sql',
      '202610230045_agent_task_catalogue.sql',
      '202610280055_agent_task_retry_schedule.sql',
    ])
      await db.exec(
        await readFile(new URL(`../supabase/migrations/${migration}`, import.meta.url), 'utf8'),
      );
    await db.query(
      "update public.agent_automation_state set data=jsonb_build_object('token',$1::text,'lease_until',clock_timestamp()+interval '1 hour') where key='runner'",
      [token],
    );
    const clock = (await db.query('select clock_timestamp() now')).rows[0].now;
    const saved = task(1, { large: false });
    saved.created_at = saved.updated_at = new Date(clock).toISOString();
    saved.expires_at = new Date(Date.parse(saved.created_at) + 86400000).toISOString();
    await db.query(
      'insert into public.agent_pending_tasks(uuid,info,created_at,updated_at,expires_at) values($1,$2,$3,$4,$5)',
      [
        saved.uuid,
        JSON.stringify(saved.info),
        saved.created_at,
        saved.updated_at,
        saved.expires_at,
      ],
    );
    const readTask = async () =>
      (
        await db.query('select to_jsonb(t) row from public.agent_pending_tasks t where uuid=$1', [
          saved.uuid,
        ])
      ).rows[0].row;
    const readRetry = async () =>
      (
        await db.query(
          'select to_jsonb(r) row from public.agent_pending_task_retries r where task_id=$1',
          [saved.uuid],
        )
      ).rows[0]?.row;
    const before = await readTask();
    const transportCalls = [];
    const fetchImpl = async (value, options) => {
      const name = new URL(value).pathname.split('/').at(-1);
      assert(['agent_pending_task_retry_catalogue', 'agent_pending_task_retry'].includes(name));
      const args = JSON.parse(options.body),
        keys = Object.keys(args);
      transportCalls.push(name);
      await db.exec('set role service_role');
      try {
        const result = await db.query(
          `select public.${name}(${keys.map((key, index) => `${key}=>$${index + 1}`).join(',')}) result`,
          Object.values(args),
        );
        return Response.json(result.rows[0].result);
      } finally {
        await db.exec('reset role');
      }
    };
    const makeStore = () => createPendingTaskStore({ env, fetchImpl, writeDiagnostic: () => {} });
    const store = makeStore();
    const args = {
      leaseToken: token,
      allowedSourceIds: [ids.source],
      taskId: saved.uuid,
      expectedUpdatedAt: saved.updated_at,
      cycleId,
    };
    assert.equal((await store.beginRetry(args)).status, 'ready');
    const first = await readRetry();
    assert.deepEqual(
      await readTask(),
      before,
      'Attempt bookkeeping must not rewrite task JSON/version/expiry',
    );
    assert(!JSON.stringify(first).includes('raw_response'));
    assert.equal(first.task_updated_at, before.updated_at);
    assert.equal(first.expires_at, before.expires_at);
    assert(Date.parse(first.retry_at) - Date.parse(first.attempted_at) <= 300000);

    // No finish hook ran: a new client represents an abrupt process death.
    const restarted = makeStore();
    const retained = await restarted.listRetries({
      leaseToken: token,
      allowedSourceIds: [ids.source],
    });
    assert.equal(retained.status, 'ready');
    assert.equal(retained.retries.length, 1);
    assert.equal(
      (await restarted.beginRetry({ ...args, cycleId: randomUUID() })).status,
      'pending',
    );
    assert.deepEqual(await readRetry(), first);
    assert.equal((await restarted.beginRetry(args)).status, 'ready');
    assert.deepEqual(
      await readRetry(),
      first,
      'Same-cycle duplicate reads must not extend waiting',
    );

    assert.equal(
      (await restarted.finishRetry({ ...args, outcome: 'preflight_failed' })).status,
      'ready',
    );
    const finalized = await readRetry();
    assert.equal(finalized.outcome, 'preflight_failed');
    assert.equal(
      (await restarted.finishRetry({ ...args, outcome: 'preflight_failed' })).status,
      'ready',
    );
    assert.deepEqual(
      await readRetry(),
      finalized,
      'Duplicate terminal handling must not extend waiting',
    );
    assert.deepEqual(
      await readTask(),
      before,
      'Failed checkpoint scheduling preserves the original task',
    );
    assert.equal(
      (await restarted.beginRetry({ ...args, leaseToken: randomUUID() })).status,
      'stale',
    );
    assert.equal(
      (await restarted.finishRetry({ ...args, allowedSourceIds: [ids.club], outcome: 'failed' }))
        .status,
      'forbidden',
    );
    assert.deepEqual(await readRetry(), finalized);

    for (const role of ['anon', 'authenticated', 'service_role']) {
      assert.equal(
        (
          await db.query(
            "select has_table_privilege($1,'public.agent_pending_task_retries','SELECT') allowed",
            [role],
          )
        ).rows[0].allowed,
        false,
      );
      assert.equal(
        (
          await db.query(
            "select has_function_privilege($1,'public.agent_pending_task_retry_catalogue(uuid,uuid[])','EXECUTE') allowed",
            [role],
          )
        ).rows[0].allowed,
        role === 'service_role',
      );
    }
    assert.deepEqual(
      (await restarted.listRetries({ leaseToken: token, allowedSourceIds: [ids.club] })).retries,
      [],
    );

    // Exact freshly claimed original work is eligible before the ordinary wait.
    await db.query(
      "update public.agent_automation_state set data=data||jsonb_build_object('snapshot',jsonb_build_object($1::text,md5($2::jsonb::text)),'sources',jsonb_build_object($1::text,$3::text)) where key='runner'",
      [saved.info.inputs[0].uuid, JSON.stringify(saved.info.inputs[0].raw_response), ids.source],
    );
    const freshCycle = randomUUID();
    assert.equal((await restarted.beginRetry({ ...args, cycleId: freshCycle })).status, 'ready');
    await db.query(
      "update public.agent_automation_state set data=data-'snapshot'-'sources' where key='runner'",
    );

    // A history-only checkpoint can carry the retry marker to its exact new version.
    await db.query(
      'update public.agent_pending_tasks set info=jsonb_set(info,\'{executionHistory}\',\'[{"kind":"tool_result","result":{"status":"unavailable"}}]\'),updated_at=clock_timestamp() where uuid=$1',
      [saved.uuid],
    );
    const historyOnly = await readTask();
    assert.equal(
      (
        await restarted.finishRetry({
          ...args,
          cycleId: freshCycle,
          checkpointUpdatedAt: historyOnly.updated_at,
          outcome: 'failed',
        })
      ).status,
      'ready',
    );
    assert.equal((await readRetry()).task_updated_at, historyOnly.updated_at);
    assert.deepEqual(await readTask(), historyOnly);

    // A human intent change has a new exact version and must be immediately eligible.
    await db.query(
      "update public.agent_pending_tasks set info=jsonb_set(info,'{request,summary}','\"Human revision: arrive at eight, preserve this change\"'),updated_at=clock_timestamp() where uuid=$1",
      [saved.uuid],
    );
    const revised = await readTask();
    assert.deepEqual(
      (await restarted.listRetries({ leaseToken: token, allowedSourceIds: [ids.source] })).retries,
      [],
    );
    const revisedArgs = { ...args, expectedUpdatedAt: revised.updated_at, cycleId: randomUUID() };
    assert.equal((await restarted.beginRetry(revisedArgs)).status, 'ready');
    const revisedMarker = await readRetry();
    assert.equal(
      (
        await restarted.finishRetry({
          ...args,
          cycleId: freshCycle,
          checkpointUpdatedAt: historyOnly.updated_at,
          outcome: 'failed',
        })
      ).status,
      'conflict',
    );
    assert.deepEqual(await readRetry(), revisedMarker);
    assert.deepEqual(await readTask(), revised);

    await db.query(
      "update public.agent_automation_state set data=jsonb_set(data,'{lease_until}',to_jsonb(clock_timestamp()-interval '1 minute')) where key='runner'",
    );
    assert.equal(
      (await restarted.finishRetry({ ...revisedArgs, outcome: 'failed' })).status,
      'stale',
    );
    assert.deepEqual(await readRetry(), revisedMarker);
    await db.query('delete from public.agent_pending_tasks where uuid=$1', [saved.uuid]);
    assert.equal(
      (await db.query('select count(*)::int n from public.agent_pending_task_retries')).rows[0].n,
      0,
      'Metadata cascades with the temporary task',
    );
    assert(transportCalls.every((name) => name.startsWith('agent_pending_task_retry')));
  } finally {
    await db.close();
  }
});

test('runner stops paid turns when exact-read attempt bookkeeping fails, while retaining unfinished work', async () => {
  const original = input(),
    saved = task(1, { original, current: true, large: false });
  const f = fixture({ backlog: 0, current: [saved] });
  const before = copy([...f.tasks.values()]);
  let modelTurns = 0,
    markerCalls = 0;
  const endings = [];
  const pipeline = {
    ...f.adapters.pipeline,
    recordTaskAttempt: async () => {
      markerCalls++;
      return { status: 'unavailable' };
    },
    finishAttempt: async ({ outcome }) => {
      endings.push(outcome);
      return { status: 'ready' };
    },
  };
  const provider = {
    toolTurn: async () => {
      modelTurns++;
      if (modelTurns === 1)
        return turn(toolCall('finish_batch', 'initial-finish', [original.uuid]));
      if (modelTurns === 2)
        return turn(
          toolCall('read_pending_task', 'exact-read', { taskId: saved.uuid }, [saved.uuid]),
        );
      throw Error('A third paid turn would violate the storage failure stop');
    },
  };
  const result = await createAutomationHandler({
    ...f.adapters,
    pipeline,
    store: f.store,
    config: f.config,
    provider,
    now: () => new Date('2026-10-23T22:30:00Z'),
  }).tick();
  assert.equal(result.status, 'preflight_failed');
  assert.equal(modelTurns, 2);
  assert.equal(markerCalls, 1);
  assert(endings.includes('preflight_failed'));
  assert.deepEqual([...f.tasks.values()], before);
  assert.equal(f.writes.length, 0);
  assert.equal(f.calendarWrites.length, 0);
});
