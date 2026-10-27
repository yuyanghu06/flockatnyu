const timezone = 'America/New_York';
const formatter = new Intl.DateTimeFormat('en-US', { timeZone: timezone, hour: '2-digit', hourCycle: 'h23' });
const numericCounts = ['claimed', 'enriched', 'imported', 'existing', 'missed', 'deferred', 'requests', 'costMicro', 'jobCompleted', 'loggingFailures'];
const statuses = new Set(['ready', 'disabled', 'not_configured', 'schema_not_ready', 'forbidden', 'unavailable',
  'budget_exceeded', 'aborted', 'partial', 'invalid_request']);
const emptyCounts = () => Object.fromEntries([...numericCounts.map(key => [key, 0]), ['unknownCost', false]]);
const waitBetweenBatches = (milliseconds, { signal } = {}) => sleep(milliseconds, undefined, { signal });

// Railway cron is UTC. It starts both candidate hours; only the one that is
// 09:00 in New York may create a runtime or access saved data. Minutes are
// intentionally unrestricted because a cron container can start late.
export function isGmailEnrichmentScheduleTime(value = new Date()) {
  try {
    const date = value instanceof Date ? value : new Date(value);
    return Number.isFinite(date.getTime()) && formatter.formatToParts(date).find(part => part.type === 'hour')?.value === '09';
  } catch { return false; }
}

export function gmailEnrichmentDrainLimit(env = process.env) {
  const raw = env.GMAIL_ENRICHMENT_MAX_DRAIN_CYCLES;
  if (raw === undefined || raw === '') return 1000;
  return typeof raw === 'string' && /^[1-9][0-9]*$/.test(raw) && Number.isSafeInteger(Number(raw))
    && Number(raw) <= 1000 ? Number(raw) : null;
}

// Drain sequential batches, preserving the worker's per-cycle request/cost
// limits and the database's durable daily allowance. Never wait for retries.
export async function drainGmailEnrichment({ worker, signal, maxCycles = 1000, pauseMs = 5000, waitImpl = waitBetweenBatches } = {}) {
  const counts = emptyCounts(); let cycles = 0;
  const done = (status, stopReason) => ({ status, stopReason, cycles, counts });
  if (typeof worker?.once !== 'function' || !Number.isSafeInteger(maxCycles) || maxCycles < 1 || maxCycles > 1000
    || !Number.isSafeInteger(pauseMs) || pauseMs < 1000 || pauseMs > 300000 || typeof waitImpl !== 'function') return done('invalid_request', 'invalid_request');
  for (; cycles < maxCycles;) {
    if (signal?.aborted) return done('aborted', 'aborted');
    let result;
    try { result = await worker.once({ signal }); } catch { return done('unavailable', 'unavailable'); }
    cycles++;
    const status = statuses.has(result?.status) ? result.status : 'unavailable';
    const batch = result?.counts;
    if (batch !== undefined) {
      if (!batch || typeof batch !== 'object' || Array.isArray(batch) || typeof batch.unknownCost !== 'boolean'
        || numericCounts.some(key => !Number.isSafeInteger(batch[key]) || batch[key] < 0 || !Number.isSafeInteger(counts[key] + batch[key]))) return done('unavailable', 'invalid_response');
      for (const key of numericCounts) counts[key] += batch[key];
      counts.unknownCost ||= batch.unknownCost;
    } else if (status === 'ready') return done('unavailable', 'invalid_response');
    if (status !== 'ready') return done(status, status);
    if (signal?.aborted) return done('aborted', 'aborted');
    if (counts.loggingFailures) return done('partial', 'log_unavailable');
    if (counts.unknownCost) return done('ready', 'unknown_cost');
    if (!batch.claimed) return done('ready', 'empty');
    if (batch.jobCompleted === 0 && batch.deferred === 0) return done('partial', 'no_progress');
    // Keep batches sequential and reuse the existing poll interval as a pause.
    // Terminal outcomes above never wait or start another batch.
    if (cycles < maxCycles) {
      if (signal?.aborted) return done('aborted', 'aborted');
      try { await waitImpl(pauseMs, { signal }); }
      catch { return done(signal?.aborted ? 'aborted' : 'unavailable', signal?.aborted ? 'aborted' : 'unavailable'); }
      if (signal?.aborted) return done('aborted', 'aborted');
    }
  }
  return done('partial', 'cycle_limit');
}
import { setTimeout as sleep } from 'node:timers/promises';

