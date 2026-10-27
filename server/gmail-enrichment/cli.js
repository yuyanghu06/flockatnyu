import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { readGmailEnrichmentConfig } from './config.js';
import { createGmailEnrichmentWorker } from './worker.js';
import { createDailyTregEnrichmentClient } from './treg.js';
import { createTregCallLogger } from "../treg/call-log.js";
import { createGmailEnrichmentCacheStore } from './store.js';
import { isGmailEnrichmentScheduleTime, gmailEnrichmentDrainLimit, drainGmailEnrichment } from './schedule.js';

// The collector writes contacts_cache. This independent runtime uses only its
// fixed enrichment RPCs; it does not import a Gmail collector or read a mailbox.
export function createGmailEnrichmentRuntime({ env = process.env, fetchImpl = globalThis.fetch, cacheStore } = {}) {
  const config = readGmailEnrichmentConfig(env);
  const callLogger = createTregCallLogger({ env });
  const enrichmentClient = createDailyTregEnrichmentClient({ env, fetchImpl, callLogger });
  const cache = cacheStore || createGmailEnrichmentCacheStore({ env, fetchImpl });
  const worker = createGmailEnrichmentWorker({ config, cacheStore: cache, enrichmentClient });
  return { config, worker, close: () => callLogger.close() };
}
const publicResult = result => ({ status: result?.status || 'unavailable', ...(result?.counts ? { counts: result.counts } : {}),
  ...(result?.stopReason ? { stopReason: result.stopReason } : {}), ...(Number.isSafeInteger(result?.cycles) ? { cycles: result.cycles } : {}) });
export async function runGmailEnrichmentCli({ argv = process.argv.slice(2), env = process.env, runtime, now = () => new Date(),
  createRuntime = createGmailEnrichmentRuntime, waitImpl, write = value => process.stdout.write(JSON.stringify(value) + '\n') } = {}) {
  const [command = 'status'] = argv;
  if (argv.length > 1 || !['status', 'once', 'serve', 'drain', 'scheduled'].includes(command)) return { status: 'invalid_request' };
  if (command === 'scheduled' && !isGmailEnrichmentScheduleTime(now())) {
    const result = { status: 'skipped_schedule' }; write(result); return result;
  }
  const maxCycles = ['drain', 'scheduled'].includes(command) ? gmailEnrichmentDrainLimit(env) : 1000;
  if (maxCycles === null) { const result = { status: 'invalid_request' }; write(result); return result; }
  const activeRuntime = runtime || createRuntime({ env });
  const { worker, config } = activeRuntime;
  if (command !== 'serve') {
    const controller = new AbortController();
    const abort = () => controller.abort();
    process.once('SIGTERM', abort); process.once('SIGINT', abort);
    try {
      const result = ['drain', 'scheduled'].includes(command)
        ? await drainGmailEnrichment({ worker, signal: controller.signal, maxCycles, pauseMs: config.pollMs, waitImpl })
        : await worker[command]({ signal: controller.signal });
      const output = publicResult(result); write(output); return output;
    } finally {
      process.removeListener('SIGTERM', abort); process.removeListener('SIGINT', abort);
      await activeRuntime.close?.();
    }
  }
  const readiness = await worker.status();
  if (readiness.status !== 'ready') { write(publicResult(readiness)); await activeRuntime.close?.(); return publicResult(readiness); }
  let stopped = false, timer, pending;
  const controller = new AbortController();
  async function tick() {
    if (stopped) return;
    try { write(publicResult(await worker.once({ signal: controller.signal }))); }
    catch { write({ status: 'unavailable' }); }
    finally { if (!stopped) timer = setTimeout(() => { pending = tick(); }, config.pollMs); }
  }
  async function stop() {
    if (stopped) return;
    stopped = true; clearTimeout(timer); controller.abort();
    process.removeListener('SIGTERM', stop); process.removeListener('SIGINT', stop);
    await pending?.catch(() => {});
    try { await activeRuntime.close?.(); } catch { write({ status: 'unavailable' }); }
  }
  process.once('SIGTERM', stop); process.once('SIGINT', stop);
  write({ status: 'listening' }); pending = tick();
  return { status: 'listening', stop };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await runGmailEnrichmentCli();
    if (!['ready', 'listening', 'disabled', 'skipped_schedule', 'budget_exceeded'].includes(result.status)) process.exitCode = 1;
  } catch { process.stderr.write('{"status":"unavailable"}\n'); process.exitCode = 1; }
}
