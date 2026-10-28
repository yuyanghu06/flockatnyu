import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { plannerCostCases } from './fixtures/planner-cost-cases.mjs';

const arg = (name) =>
  process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const hash = (value) => createHash('sha256').update(value).digest('hex');
const bytes = (value) => Buffer.byteLength(JSON.stringify(value));
const copy = (value) => structuredClone(value);
const maxRequests = Number(arg('max-requests') ?? 64);
const perCaseCap = Number(arg('per-case-cap') ?? 10);
assert(Number.isInteger(maxRequests) && maxRequests > 0 && maxRequests <= 64);
assert(Number.isInteger(perCaseCap) && perCaseCap > 0 && perCaseCap <= 16);
const currentRoot = resolve(new URL('../', import.meta.url).pathname);
const selectedVersions = process.argv
  .filter((value) => value.startsWith('--version='))
  .map((value) => value.slice(10));
const roots = [
  {
    name: 'before',
    path: resolve(arg('before-root') ?? 'evidence/planner-cost-reduction-2026-10-28/before-source'),
  },
  { name: 'after', path: resolve(arg('after-root') ?? currentRoot) },
].filter((root) => !selectedVersions.length || selectedVersions.includes(root.name));
assert(roots.length, 'No matching source version; use --version=before or --version=after');
const selected = process.argv
  .filter((value) => value.startsWith('--case='))
  .map((value) => value.slice(7));
const scenarios = plannerCostCases.filter((row) => !selected.length || selected.includes(row.name));
assert(scenarios.length, 'No matching scenario');
if (!process.argv.includes('--live-model')) {
  console.log(
    JSON.stringify({
      networkRequests: 0,
      roots,
      cases: scenarios.map((row) => row.name),
      maxRequests,
      perCaseCap,
      instruction:
        'Wait for the implementation freeze, then run --live-model with private configured inference credentials.',
    }),
  );
  process.exit(0);
}

const { readConfig } = await import(pathToFileURL(resolve(currentRoot, 'server/shared/config.js')));
const config = readConfig();
assert(config.configured, 'Configured inference credentials unavailable; never printed');
assert.equal(
  config.model,
  'gpt-6-luna',
  'Use the actual configured model for this price comparison',
);
const endpoint = `${config.baseUrl.replace(/\/$/, '')}/chat/completions`;
assert.equal(
  new URL(endpoint).hostname,
  'api.openai.com',
  'This price comparison is scoped to direct OpenAI',
);
const evidenceDir = resolve(
  arg('evidence-dir') ?? `evidence/planner-cost-reduction-2026-10-28/testing/model-${Date.now()}`,
);
await mkdir(evidenceDir, { recursive: true, mode: 0o700 });
const reportFile = resolve(evidenceDir, 'comparison.json');
const originalFetch = globalThis.fetch;
const report = {
  mode: 'actual-configured-model-before-after',
  model: config.model,
  startedAt: new Date().toISOString(),
  maxRequests,
  perCaseCap,
  networkRequests: 0,
  cases: [],
  pins: {},
  limitations: [
    'All initial and follow-up model turns are actual inference; business services and persistence are simulated.',
    'Durable retry RPC behavior is verified separately using actual SQL in disposable PGlite.',
    'A small before/after sample cannot establish production savings or separate traffic/cache warm-up effects.',
    'Cases use a fixed trusted October 23 fixture clock and synthetic Discord messages; no live source or business writes.',
  ],
};
const persist = () =>
  writeFile(reportFile, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
async function sourceFiles(root) {
  const files = [];
  async function walk(path) {
    for (const entry of await readdir(resolve(root, path), { withFileTypes: true })) {
      const file = `${path}/${entry.name}`;
      if (entry.isDirectory()) await walk(file);
      else if (entry.isFile()) files.push(file);
    }
  }
  for (const path of ['server', 'tools', 'src/api/operations', 'prompts']) await walk(path);
  return [
    ...files,
    'tests/fixtures/planner-followup.mjs',
    'package.json',
    'package-lock.json',
  ].sort();
}
async function sourceHashes(root, files) {
  return Object.fromEntries(
    await Promise.all(files.map(async (file) => [file, hash(await readFile(resolve(root, file)))])),
  );
}
for (const root of roots) {
  root.files = await sourceFiles(root.path);
  report.pins[root.name] = await sourceHashes(root.path, root.files);
}
let active;
function measuredUsage(data) {
  const usage = data?.usage;
  if (!usage) return { usage: null, costUsd: null };
  const counts = {
    inputTokens: usage.prompt_tokens ?? null,
    outputTokens: usage.completion_tokens ?? null,
    cacheReadTokens: usage.prompt_tokens_details?.cached_tokens ?? null,
    cacheWriteTokens:
      usage.prompt_tokens_details?.cache_write_tokens ??
      usage.prompt_tokens_details?.cache_creation_tokens ??
      null,
    reasoningTokens: usage.completion_tokens_details?.reasoning_tokens ?? null,
  };
  const required = ['inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens'];
  const complete =
    required.every((key) => Number.isSafeInteger(counts[key]) && counts[key] >= 0) &&
    counts.inputTokens <= 272000 &&
    counts.cacheReadTokens + counts.cacheWriteTokens <= counts.inputTokens;
  const costUsd = complete
    ? ((counts.inputTokens - counts.cacheReadTokens - counts.cacheWriteTokens) * 0.1 +
        counts.cacheReadTokens * 0.01 +
        counts.cacheWriteTokens * 0.125 +
        counts.outputTokens * 0.5) /
      1e6
    : null;
  const components = complete
    ? {
        otherInputUsd:
          ((counts.inputTokens - counts.cacheReadTokens - counts.cacheWriteTokens) * 0.1) / 1e6,
        cacheReadUsd: (counts.cacheReadTokens * 0.01) / 1e6,
        cacheWriteUsd: (counts.cacheWriteTokens * 0.125) / 1e6,
        outputUsd: (counts.outputTokens * 0.5) / 1e6,
      }
    : null;
  return { usage: counts, costUsd, components };
}
globalThis.fetch = async (value, options = {}) => {
  assert.equal(
    String(value),
    endpoint,
    'Network is restricted to the exact configured inference endpoint',
  );
  assert(active, 'No inference outside an active scenario');
  assert.deepEqual(
    await sourceHashes(active.root.path, active.root.files),
    report.pins[active.root.name],
    'Pinned source changed before dispatch',
  );
  if (report.networkRequests >= maxRequests || active.networkRequests >= perCaseCap) {
    active.budgetStopped = true;
    await persist();
    throw Error('Hard inference dispatch cap reached');
  }
  report.networkRequests++;
  active.networkRequests++;
  const body = JSON.parse(options.body);
  const dispatch = {
    sequence: report.networkRequests,
    startedAt: new Date().toISOString(),
    requestBytes: bytes(body),
    toolsSha256: hash(JSON.stringify(body.tools)),
    systemMessages: body.messages
      .filter((row) => row.role === 'system')
      .map((row) => ({
        sha256: hash(JSON.stringify(row.content)),
        bytes: bytes(row.content),
        explicitBreakpoint:
          Array.isArray(row.content) &&
          row.content.some((part) => part.prompt_cache_breakpoint?.mode === 'explicit'),
      })),
  };
  active.dispatches.push(dispatch);
  await persist();
  try {
    const response = await originalFetch(value, { ...options, redirect: 'error' });
    dispatch.httpStatus = response.status;
    dispatch.finishedAt = new Date().toISOString();
    if (response.ok) {
      try {
        Object.assign(dispatch, measuredUsage(await response.clone().json()));
      } catch {
        dispatch.usage = null;
        dispatch.costUsd = null;
      }
    }
    await persist();
    return response;
  } catch (error) {
    dispatch.failure =
      error?.name === 'AbortError' ? 'inference_aborted' : 'inference_transport_failed';
    await persist();
    throw error;
  }
};
try {
  for (const root of roots) {
    const lib = await import(
      pathToFileURL(resolve(root.path, 'tests/fixtures/planner-followup.mjs'))
    );
    const { createProvider } = await import(
      pathToFileURL(resolve(root.path, 'server/providers/index.js'))
    );
    const provider = createProvider(config, {
      fetchImpl: globalThis.fetch,
      audit: {
        required: false,
        startModel: async () => ({ status: 'ready' }),
        finishModel: async () => ({ status: 'ready' }),
      },
      writeDiagnostic: () => {},
    });
    for (const scenario of scenarios) {
      active = {
        version: root.name,
        name: scenario.name,
        root,
        networkRequests: 0,
        dispatches: [],
        passed: false,
      };
      report.cases.push(active);
      const fixture = scenario.setup(lib);
      const started = performance.now();
      try {
        active.result = await fixture.run(provider, {
          initialProvider: (request) => provider.toolTurn(request),
        });
        scenario.verify(lib, fixture, active.result);
        active.passed = true;
      } catch (error) {
        active.failure = error.message;
        process.exitCode = 1;
      }
      Object.assign(active, {
        root: { name: root.name, path: root.path },
        elapsedMs: Math.round(performance.now() - started),
        attemptedWrites: fixture.attempts,
        appliedWrites: fixture.writes,
        calendarWrites: fixture.calendarWrites,
        initialState: fixture.before,
        finalState: fixture.state,
        originals: fixture.originals,
        initialTasks: fixture.initialTasks,
        finalTasks: [...fixture.tasks.values()],
        proposedTurns: fixture.proposals,
        toolCalls: fixture.tools,
        execution: fixture.execution,
        requestBytes: fixture.requests.map((request) => bytes({ ...request, signal: undefined })),
        knownCostUsd: active.dispatches.reduce((sum, row) => sum + (row.costUsd ?? 0), 0),
        unknownCostRequests: active.dispatches.filter(
          (row) => row.costUsd === null || row.costUsd === undefined,
        ).length,
      });
      await persist();
      console.log(
        JSON.stringify({
          version: active.version,
          case: active.name,
          passed: active.passed,
          networkRequests: active.networkRequests,
          knownCostUsd: active.knownCostUsd,
          ...(active.failure ? { failure: active.failure } : {}),
        }),
      );
    }
  }
} finally {
  globalThis.fetch = originalFetch;
  report.finishedAt = new Date().toISOString();
  report.versions = Object.fromEntries(
    roots.map((root) => {
      const cases = report.cases.filter((row) => row.version === root.name);
      const dispatches = cases.flatMap((row) => row.dispatches);
      return [
        root.name,
        {
          scenarios: cases.length,
          passed: cases.filter((row) => row.passed).length,
          networkRequests: dispatches.length,
          knownCostUsd: dispatches.reduce((sum, row) => sum + (row.costUsd ?? 0), 0),
          unknownCostRequests: dispatches.filter(
            (row) => row.costUsd === null || row.costUsd === undefined,
          ).length,
          components: Object.fromEntries(
            ['otherInputUsd', 'cacheReadUsd', 'cacheWriteUsd', 'outputUsd'].map((key) => [
              key,
              dispatches.reduce((sum, row) => sum + (row.components?.[key] ?? 0), 0),
            ]),
          ),
        },
      ];
    }),
  );
  report.pinsStable = true;
  for (const root of roots) {
    if (
      JSON.stringify(await sourceHashes(root.path, root.files)) !==
      JSON.stringify(report.pins[root.name])
    )
      report.pinsStable = false;
  }
  await persist();
}
console.log(
  JSON.stringify({
    evidence: reportFile,
    networkRequests: report.networkRequests,
    maxRequests,
    pinsStable: report.pinsStable,
    allPassed: report.cases.every((row) => row.passed),
  }),
);
