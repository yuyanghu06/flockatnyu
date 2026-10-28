import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { readConfig } from '../server/shared/config.js';
import {
  workerNames,
  workerExpected,
  workerScenario,
} from './fixtures/operation-api-all-model/worker-cases.mjs';
import {
  createBoundedModelProvider,
  DEFAULT_LEDGER,
} from './fixtures/operation-api-all-model/chat-runner.mjs';

const arg = (name) =>
  process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const selected = process.argv
  .filter((value) => value.startsWith('--case='))
  .map((value) => value.slice(7));
const names = workerNames.filter((name) => !selected.length || selected.includes(name));
assert(names.length);
const folder = resolve(
  arg('evidence-dir') ??
    `evidence/tool-operation-api-all-live-2026-10-27/model/worker-${Date.now()}`,
);
if (!process.argv.includes('--live-model') && !process.argv.includes('--self-check')) {
  console.log(
    JSON.stringify({
      names,
      expected: workerExpected,
      group: 'worker',
      groupCap: 16,
      globalCap: 96,
      inferenceRequests: 0,
      note: 'Production worker handler/adapters; synthetic source/Calendar/map/task boundaries. --live-model requires root GO.',
    }),
  );
  process.exit();
}
if (process.argv.includes('--self-check')) {
  for (const name of names) {
    const scenario = await workerScenario(name);
    console.log(
      JSON.stringify({ case: name, ...(await scenario.offline()), inferenceRequests: 0 }),
    );
  }
  process.exit();
}
const config = readConfig();
assert(config.configured);
const group = 'worker',
  maxRequests = 16,
  ledgerPath = resolve(arg('ledger') ?? DEFAULT_LEDGER);
await mkdir(folder, { recursive: true, mode: 0o700 });
const report = {
  model: config.model,
  group,
  maxRequests,
  globalCap: 96,
  network: 'Only configured inference endpoints; business transports/storage are synthetic',
  cases: [],
  expectedNames: [...new Set(Object.values(workerExpected).flat())],
  selectedNames: [],
  successfulNames: [],
  missingNames: [],
  limitations: [
    'Real model chooses all initial/follow-up calls using the unchanged production worker handler.',
    'Automatic initial finish-to-sync does not count as a selected model call. Synthetic setup calls do not count.',
    'This is live inference with simulated business providers/storage, not live queue processing or a deployed worker check.',
  ],
};
const persist = () =>
  writeFile(resolve(folder, 'report.json'), JSON.stringify(report, null, 2) + '\n', {
    mode: 0o600,
  });
await persist();
for (const name of names) {
  const scenario = await workerScenario(name),
    entry = { name, expected: scenario.expected, passed: false, proposals: [], executions: [] };
  report.cases.push(entry);
  const bounded = await createBoundedModelProvider({
    group,
    maxRequests,
    ledgerPath,
    config,
    sourceFiles: [
      'tests/operation-api-all-model.mjs',
      'tests/fixtures/operation-api-all-model/worker-cases.mjs',
      'tests/fixtures/operation-api-all-model/worker-fixture.mjs',
      'tests/fixtures/operation-api-all-model/worker-calendar.mjs',
      'tests/fixtures/planner-followup.mjs',
      'tests/fixtures/planner-selected-fixes.mjs',
    ],
    onTurn: async (turn) => {
      entry.proposals.push({ toolNames: turn.toolCalls.map((call) => call.name), text: turn.text });
      await persist();
    },
  });
  try {
    const caseCap = name === 'worker-task-fragments' ? 4 : 6;
    const capped = {
      toolTurn: async (input) => {
        if (bounded.dispatches.length >= caseCap) {
          entry.evaluationCapStopped = true;
          throw Error('evaluation_case_cap_reached');
        }
        return bounded.provider.toolTurn(input);
      },
    };
    const outcome = await scenario.run(capped, AbortSignal.timeout(180000));
    entry.outcome = outcome;
    scenario.verify(outcome);
    const proposed = new Set(entry.proposals.flatMap((turn) => turn.toolNames));
    entry.executions = scenario.safeCoverage();
    for (const expected of scenario.expected)
      assert(proposed.has(expected), `Actual model did not select ${expected}`);
    for (const expected of scenario.expected)
      assert(
        entry.executions.some(
          (row) =>
            row.name === expected &&
            row.origin !== 'runner' &&
            ['ready', 'completed'].includes(row.status),
        ),
        `No successful model-origin execution of ${expected}`,
      );
    entry.passed = true;
  } catch (error) {
    entry.failure = String(error.message).slice(0, 1000);
    process.exitCode = 1;
  }
  entry.executions = scenario.safeCoverage();
  entry.actualTurns = scenario.proposals;
  entry.finalState = scenario.state();
  entry.networkDispatches = bounded.dispatches;
  entry.pins = bounded.pins;
  entry.pinsStable = await bounded.pinsStable();
  const allSelected = new Set(
    report.cases.flatMap((row) => row.proposals.flatMap((turn) => turn.toolNames)),
  );
  const successes = new Set(
    report.cases.flatMap((row) =>
      row.executions
        .filter(
          (call) =>
            call.origin !== 'runner' &&
            ['ready', 'completed'].includes(call.status) &&
            allSelected.has(call.name),
        )
        .map((call) => call.name),
    ),
  );
  report.selectedNames = [...allSelected].sort();
  report.successfulNames = [...successes].sort();
  report.missingNames = report.expectedNames.filter((tool) => !successes.has(tool));
  await persist();
  console.log(
    JSON.stringify({
      case: name,
      passed: entry.passed,
      inferenceRequests: bounded.dispatches.length,
      selectedNames: [...new Set(entry.proposals.flatMap((turn) => turn.toolNames))],
      ...(entry.failure ? { failure: entry.failure } : {}),
    }),
  );
  const ledger = JSON.parse(await readFile(ledgerPath));
  if (ledger.groups[group]?.requests >= maxRequests) break;
}
report.finishedAt = new Date().toISOString();
await persist();
console.log(
  JSON.stringify({
    evidence: resolve(folder, 'report.json'),
    selectedNames: report.selectedNames,
    successfulNames: report.successfulNames,
    missingNames: report.missingNames,
    passed: report.cases.length === names.length && report.cases.every((entry) => entry.passed),
  }),
);
