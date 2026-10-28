import { canonicalJson } from './validation.js';

export const TASK_RETRY_MS = 300000;
const outcomes = new Set(
  'completed not_needed pending deferred failed timeout stale aborted unavailable forbidden tool_failed incomplete_batch invalid_completion invalid_tool_call audit_unavailable preflight_failed context_limit round_limit call_limit not_configured'.split(
    ' ',
  ),
);
const intent = (task) => canonicalJson({ inputs: task.info.inputs, request: task.info.request });

// This is private runner bookkeeping, separate from saved-task reads. Only exact
// rows actually inspected by this cycle can acquire or finalize an attempt.
export function createTaskRetrySchedule({
  taskStore,
  getCycle,
  getTask,
  getScope,
  current,
  currentCycleTask,
  attemptedTasks,
  oldTaskRetries,
  now,
}) {
  const durable = ['listRetries', 'beginRetry', 'finishRetry'].every(
    (name) => typeof taskStore[name] === 'function',
  );
  const partial =
    !durable &&
    ['listRetries', 'beginRetry', 'finishRetry'].some(
      (name) => typeof taskStore[name] === 'function',
    );
  const persisted = new Map(),
    attempts = new Map();
  const args = () => ({ leaseToken: getCycle().leaseToken, allowedSourceIds: getScope() });
  const time = () => new Date(now()).getTime();
  const retryFor = (task) => persisted.get(task.uuid) ?? oldTaskRetries.get(task.uuid);
  function available(task) {
    const retry = retryFor(task);
    return (
      !retry ||
      retry.updatedAt !== task.updated_at ||
      retry.until <= time() ||
      Date.parse(task.expires_at) <= time() ||
      currentCycleTask(task)
    );
  }
  return {
    async begin(signal) {
      attempts.clear();
      persisted.clear();
      if (partial) return { status: 'not_configured' };
      if (!durable) return { status: 'ready' }; // Injected legacy fixture stores only.
      const result = await taskStore.listRetries({ ...args(), signal });
      if (result?.status !== 'ready') return result ?? { status: 'unavailable' };
      for (const row of result.retries)
        persisted.set(row.taskId, { ...row, until: Date.parse(row.retryAt) });
      return { status: 'ready' };
    },
    available,
    retryAt(task) {
      const retry = retryFor(task);
      return retry && retry.updatedAt === task.updated_at ? retry.until : time();
    },
    checkpoint(previous, next) {
      const attempt = attempts.get(previous.uuid);
      if (
        attempt &&
        (attempt.updatedAt === previous.updated_at ||
          attempt.checkpointUpdatedAt === previous.updated_at) &&
        intent(previous) === intent(next)
      )
        attempt.checkpointUpdatedAt = next.updated_at;
    },
    async recordTaskAttempt({ taskId, signal }) {
      if (partial) return { status: 'not_configured' };
      const cycle = getCycle(),
        task = getTask(taskId);
      if (!cycle || !task || !current(task) || !attemptedTasks.has(taskId))
        return { status: 'stale' };
      const previous = attempts.get(taskId);
      if (previous && [previous.updatedAt, previous.checkpointUpdatedAt].includes(task.updated_at))
        return { status: 'ready' };
      if (!durable) return { status: 'ready' };
      const result = await taskStore.beginRetry({
        ...args(),
        taskId,
        expectedUpdatedAt: task.updated_at,
        cycleId: cycle.id,
        signal,
      });
      if (result?.status !== 'ready') return result ?? { status: 'unavailable' };
      attempts.set(taskId, { updatedAt: task.updated_at, finalized: false });
      return { status: 'ready' };
    },
    async finishAttempt({ outcome, signal }) {
      if (!durable || !getCycle()) return { status: 'ready' };
      for (const [taskId, attempt] of attempts) {
        if (attempt.finalized) continue;
        const result = await taskStore.finishRetry({
          ...args(),
          taskId,
          expectedUpdatedAt: attempt.updatedAt,
          checkpointUpdatedAt: attempt.checkpointUpdatedAt,
          cycleId: getCycle().id,
          outcome: outcomes.has(outcome) ? outcome : 'failed',
          signal,
        });
        if (!['ready', 'not_found', 'conflict', 'expired'].includes(result?.status))
          return result ?? { status: 'unavailable' };
        // A missing/resolved or newer task is deliberately left eligible.
        attempt.finalized = true;
      }
      return { status: 'ready' };
    },
  };
}
