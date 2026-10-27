import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, open, unlink } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { setTimeout as pause } from 'node:timers/promises';
import { createChatRunner } from '../../../server/chat/runner.js';
import { createProvider } from '../../../server/providers/index.js';
import { readConfig } from '../../../server/shared/config.js';
import { chatSourceFiles, operationSourceFiles } from '../chat-source-files.mjs';

const root = resolve(new URL('../../../', import.meta.url).pathname);
export const DEFAULT_LEDGER = resolve(
  root,
  'evidence/tool-operation-api-all-live-2026-10-27/inference-ledger.json',
);
const safeStatus = (value) =>
  typeof value === 'string' && /^[a-z_]{1,64}$/.test(value) ? value : 'unavailable';
async function underLock(path, action) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  let lock;
  for (let attempt = 0; attempt < 200; attempt++) {
    try {
      lock = await open(path + '.lock', 'wx', 0o600);
      break;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      await pause(20);
    }
  }
  if (!lock) throw Error('inference_ledger_lock_unavailable');
  try {
    return await action();
  } finally {
    await lock.close();
    await unlink(path + '.lock');
  }
}
export async function reserveInference({ group, maxRequests, ledgerPath = DEFAULT_LEDGER }) {
  assert(/^[a-z0-9-]{1,80}$/.test(group), 'Stable source-free group name required');
  assert(Number.isInteger(maxRequests) && maxRequests >= 1 && maxRequests <= 96);
  return underLock(ledgerPath, async () => {
    let ledger;
    try {
      ledger = JSON.parse(await readFile(ledgerPath, 'utf8'));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      ledger = { version: 1, hardCap: 96, requests: 0, groups: {}, dispatches: [] };
    }
    assert.equal(ledger.version, 1);
    assert.equal(ledger.hardCap, 96);
    const active = ledger.groups[group] ?? { requests: 0, cap: maxRequests };
    assert.equal(active.cap, maxRequests, 'Group cap cannot be reset between runs');
    if (ledger.requests >= ledger.hardCap || active.requests >= active.cap)
      throw Error('hard_inference_cap_reached');
    active.requests++;
    ledger.requests++;
    ledger.groups[group] = active;
    const sequence = ledger.requests;
    ledger.dispatches.push({
      sequence,
      group,
      groupSequence: active.requests,
      startedAt: new Date().toISOString(),
    });
    await writeFile(ledgerPath, JSON.stringify(ledger, null, 2) + '\n', { mode: 0o600 });
    return { sequence, groupSequence: active.requests };
  });
}
export function trackModelAdapter(adapter, executions) {
  if (!adapter) return adapter;
  const wrapped = {
    ...adapter,
    async execute(input) {
      const result = await adapter.execute(input);
      executions.push({
        name: input.name,
        status: safeStatus(result?.status),
        ...(result?.reason ? { reason: safeStatus(result.reason) } : {}),
      });
      return result;
    },
  };
  if (adapter.createRequest)
    wrapped.createRequest = (context) =>
      trackModelAdapter(adapter.createRequest(context), executions);
  return wrapped;
}
export async function createBoundedModelProvider({
  group,
  maxRequests,
  ledgerPath = DEFAULT_LEDGER,
  config = readConfig(),
  sourceFiles = [],
  fetchImpl = globalThis.fetch,
  onTurn = () => {},
}) {
  assert(config.configured, 'Configured inference unavailable; credentials remain private');
  const files = [
    ...new Set([
      ...(await chatSourceFiles()),
      ...(await operationSourceFiles()),
      'tests/fixtures/operation-api-all-model/chat-runner.mjs',
      ...sourceFiles,
    ]),
  ].sort();
  const hashes = async () =>
    Object.fromEntries(
      await Promise.all(
        files.map(async (file) => [
          file,
          createHash('sha256')
            .update(await readFile(resolve(root, file)))
            .digest('hex'),
        ]),
      ),
    );
  const pins = await hashes(),
    dispatches = [];
  const configured = config.providers?.length ? config.providers : [config];
  const endpoints = new Set(
    configured.map(
      (entry) =>
        `${entry.baseUrl.replace(/\/$/, '')}/${entry.provider === 'anthropic' ? 'messages' : 'chat/completions'}`,
    ),
  );
  const guardedFetch = async (url, options) => {
    assert(
      endpoints.has(String(url)),
      'Inference adapter may access only an exact configured inference endpoint',
    );
    assert.deepEqual(
      await hashes(),
      pins,
      'Frozen production/helper sources changed before inference',
    );
    const reservation = await reserveInference({ group, maxRequests, ledgerPath });
    const dispatch = { ...reservation, startedAt: new Date().toISOString() };
    dispatches.push(dispatch);
    try {
      const response = await fetchImpl(url, { ...options, redirect: 'error' });
      dispatch.httpStatus = response.status;
      return response;
    } catch {
      dispatch.failure = 'inference_transport_failed';
      throw Error('inference_transport_failed');
    }
  };
  const raw = createProvider(config, {
    fetchImpl: guardedFetch,
    writeDiagnostic: () => {},
    audit: {
      required: false,
      startModel: async () => ({ status: 'ready' }),
      finishModel: async () => ({ status: 'ready' }),
    },
  });
  const provider = {
    async toolTurn(input) {
      const turn = await raw.toolTurn(input);
      await onTurn(turn, input);
      return turn;
    },
    async *stream(input) {
      yield* raw.stream(input);
    },
  };
  return {
    provider,
    config,
    dispatches,
    pins,
    async pinsStable() {
      return JSON.stringify(await hashes()) === JSON.stringify(pins);
    },
  };
}

/** Real configured model + unchanged chat runner. Adapters may use separately
 * guarded real providers or synthetic stores. No source bodies/arguments/answers
 * are persisted here; returned answer is available in memory to the caller. */
export async function runChatModel({
  name,
  group,
  maxRequests,
  ledgerPath = DEFAULT_LEDGER,
  adapters,
  principal,
  conversation,
  requestContext,
  discordUsers,
  discordContext,
  config = readConfig(),
  evidenceDir,
  sourceFiles = [],
  signal = AbortSignal.timeout(420000),
  now = () => new Date(),
  fetchImpl = globalThis.fetch,
}) {
  const proposals = [],
    executions = [],
    records = [],
    turns = [];
  const bounded = await createBoundedModelProvider({
    group,
    maxRequests,
    ledgerPath,
    config,
    sourceFiles,
    fetchImpl,
    onTurn(turn) {
      proposals.push(...turn.toolCalls.map((call) => ({ name: call.name })));
      turns.push({
        toolNames: turn.toolCalls.map((call) => call.name),
        textChars: turn.text?.length ?? 0,
      });
    },
  });
  const tracked = Object.fromEntries(
    Object.entries(adapters).map(([key, value]) => [key, trackModelAdapter(value, executions)]),
  );
  const runner = createChatRunner({
    config,
    provider: bounded.provider,
    ...tracked,
    now,
    audit: { recordEvent: async () => {} },
  });
  let outcome, failure;
  try {
    outcome = await runner.run({
      conversation,
      principal,
      requestContext,
      discordUsers,
      discordContext,
      signal,
      onRecord: (record) => records.push(record),
    });
  } catch {
    failure = 'runner_exception';
  }
  let answer = '';
  for (const record of records) {
    if (record.type === 'reset') answer = '';
    if (record.type === 'delta') answer += record.text;
  }
  const report = {
    name,
    group,
    kind: 'real-model-production-chat',
    model: config.model,
    provider: config.provider,
    networkDispatches: bounded.dispatches,
    proposals,
    executions,
    turns,
    outcome: {
      status: safeStatus(outcome?.status),
      ...(outcome?.code ? { code: safeStatus(outcome.code) } : {}),
    },
    ...(failure ? { failure } : {}),
    answerChars: answer.length,
    pins: bounded.pins,
    pinsStable: await bounded.pinsStable(),
    limitations: [
      'Actual model chose tool calls using the production chat runner; no scripted replies or forced tool choice.',
      'Provider/storage side effects depend on caller-supplied adapters. This helper records no credentials, source bodies, tool arguments or answer text.',
      'Initial memory injection and runner-origin operations are not counted as selected model tool calls.',
    ],
  };
  if (evidenceDir) {
    await mkdir(evidenceDir, { recursive: true, mode: 0o700 });
    await writeFile(resolve(evidenceDir, `${name}.json`), JSON.stringify(report, null, 2) + '\n', {
      mode: 0o600,
    });
  }
  return { outcome, answer, proposals, executions, records, report };
}
