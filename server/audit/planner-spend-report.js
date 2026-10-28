// Private operational accounting only. Never pass model outputs or source bodies here.
const number = (value) =>
  value !== null && value !== undefined && Number.isFinite(Number(value)) && Number(value) >= 0
    ? Number(value)
    : null;
const timestamp = (value) => (typeof value === 'string' ? Date.parse(value) : NaN);
const group = () => ({ requests: 0, pricedRequests: 0, unknownCostRequests: 0, costUsd: 0 });
const add = (target, cost) => {
  target.requests++;
  if (cost === null) target.unknownCostRequests++;
  else {
    target.pricedRequests++;
    target.costUsd += cost;
  }
};
const round = (value) => Math.round(value * 1e12) / 1e12;
const rounded = (value) => {
  if (Array.isArray(value)) return value.map(rounded);
  if (value && typeof value === 'object')
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, rounded(item)]));
  return typeof value === 'number' ? round(value) : value;
};

export function summarizePlannerSpend({
  calls,
  events,
  start,
  end,
  timeZone = 'America/New_York',
}) {
  const lower = timestamp(start),
    upper = timestamp(end);
  if (!Number.isFinite(lower) || !Number.isFinite(upper) || lower >= upper)
    throw new Error('Invalid spending window');
  if (!Array.isArray(calls) || !Array.isArray(events)) throw new Error('Invalid audit metadata');
  const date = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const inside = (value) => timestamp(value) >= lower && timestamp(value) < upper;
  const finalEvents = new Map(),
    seenEvents = new Set(),
    seenCalls = new Set();
  const operationCounts = Object.create(null),
    endings = Object.create(null);
  let reportedHandledInputs = 0,
    handledCountEvents = 0,
    confirmedResolutionOperations = 0;
  for (const event of events) {
    if (event.agent !== 'planner' || !inside(event.created_at)) continue;
    if (seenEvents.has(event.event_id)) throw new Error('Duplicate audit event');
    seenEvents.add(event.event_id);
    if (event.kind === 'run_finished') {
      const prior = finalEvents.get(event.run_id);
      if (!prior || timestamp(event.created_at) > timestamp(prior.created_at))
        finalEvents.set(event.run_id, event);
    }
    if (event.kind === 'tool_started')
      operationCounts[event.tool ?? 'unknown'] =
        (operationCounts[event.tool ?? 'unknown'] ?? 0) + 1;
    if (
      event.kind === 'tool_finished' &&
      event.tool === 'resolve_pending_task' &&
      event.status === 'ready'
    )
      confirmedResolutionOperations++;
  }
  for (const event of finalEvents.values()) {
    endings[event.status] = (endings[event.status] ?? 0) + 1;
  }
  const total = group(),
    byDay = Object.create(null),
    byOutcome = Object.create(null),
    byModel = Object.create(null),
    runs = new Set();
  const components = { otherInputUsd: 0, cacheReadUsd: 0, cacheWriteUsd: 0, outputUsd: 0 };
  const tokens = { input: 0, cacheRead: 0, cacheWrite: 0, output: 0 };
  let missingInputUsage = 0,
    rejected429WithoutUsage = 0,
    unreconciledPricedRequests = 0;
  for (const call of calls) {
    if (
      call.agent !== 'planner' ||
      call.operation !== 'toolTurn' ||
      call.provider_base_host !== 'api.openai.com' ||
      !inside(call.started_at)
    )
      continue;
    if (seenCalls.has(call.call_id)) throw new Error('Duplicate model call');
    seenCalls.add(call.call_id);
    runs.add(call.run_id);
    const cost = number(call.estimated_cost_usd);
    const day = date.format(new Date(call.started_at));
    const outcome = finalEvents.get(call.run_id)?.status ?? 'no_terminal_event_in_window';
    for (const target of [
      total,
      (byDay[day] ??= group()),
      (byOutcome[outcome] ??= group()),
      (byModel[call.model] ??= group()),
    ])
      add(target, cost);
    const usage = call.usage ?? {},
      basis = call.pricing_basis ?? {};
    if (number(usage.inputTokens) === null) {
      missingInputUsage++;
      if (call.http_status === 429) rejected429WithoutUsage++;
    }
    for (const [key, field] of Object.entries({
      input: 'inputTokens',
      cacheRead: 'cacheReadTokens',
      cacheWrite: 'cacheWriteTokens',
      output: 'outputTokens',
    }))
      tokens[key] += number(usage[field]) ?? 0;
    if (cost === null) continue;
    const counts = ['inputTokens', 'cacheReadTokens', 'cacheWriteTokens', 'outputTokens'].map(
      (key) => number(usage[key]),
    );
    const rates = ['input', 'cacheRead', 'cacheWrite', 'output'].map((key) => number(basis[key]));
    if (
      counts.includes(null) ||
      rates.includes(null) ||
      basis.perTokens !== 1000000 ||
      counts[1] + counts[2] > counts[0]
    ) {
      unreconciledPricedRequests++;
      continue;
    }
    const parts = [
      (counts[0] - counts[1] - counts[2]) * rates[0],
      counts[1] * rates[1],
      counts[2] * rates[2],
      counts[3] * rates[3],
    ].map((value) => value / 1e6);
    if (Math.abs(parts.reduce((sum, value) => sum + value, 0) - cost) > 1e-9) {
      unreconciledPricedRequests++;
      continue;
    }
    Object.keys(components).forEach((key, index) => {
      components[key] += parts[index];
    });
  }
  for (const [runId, event] of finalEvents) {
    if (
      runs.has(runId) &&
      Number.isSafeInteger(event.counts?.handled) &&
      event.counts.handled >= 0
    ) {
      reportedHandledInputs += event.counts.handled;
      handledCountEvents++;
    }
  }
  return rounded({
    window: { start, end, timeZone },
    scope: 'Production planner, direct OpenAI, regular toolTurn attempts',
    total,
    distinctRunsWithModelCalls: runs.size,
    tokens,
    components,
    byDay,
    byOutcome,
    byModel,
    missingInputUsage,
    rejected429WithoutUsage,
    unreconciledPricedRequests,
    lifecycle: {
      recordedRunEndings: endings,
      reportedHandledInputs,
      handledCountEvents,
      confirmedResolutionOperations,
      toolStarts: operationCounts,
    },
    costPerReportedHandledInputUsd: reportedHandledInputs
      ? total.costUsd / reportedHandledInputs
      : null,
    limitations: [
      'Recorded estimates are not an invoice; missing usage is unknown rather than zero.',
      'Chat, diagnostic probes, local evaluations and non-OpenAI providers are excluded.',
      'Handled-input and resolution-operation counts are not distinct inputs/tasks or proof of correct business outcomes.',
      'Final run outcomes do not establish whether earlier useful writes succeeded.',
      'Tool frequencies do not allocate dollars to source services or planner phases.',
    ],
  });
}
