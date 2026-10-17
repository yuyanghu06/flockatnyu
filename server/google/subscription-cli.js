import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { serve } from '@hono/node-server';
import { readGmailSubscriptionConfig, createGmailSubscription } from './subscription.js';
import { createGmailSubscriptionStore } from './subscription-store.js';
import { createGmailSubscriptionApp } from './subscription-app.js';
import { createAutomationStore } from '../automation/store.js';
import { createEventUpdater } from '../automation/events.js';

export function createGmailSubscriptionRuntime({ env = process.env, fetchImpl = globalThis.fetch, onDiagnostic } = {}) {
  const config = readGmailSubscriptionConfig(env);
  if (!config.enabled || !config.configured) return { config };
  const inputStore = createAutomationStore({ env, fetchImpl });
  if (!inputStore.configured) throw new Error('not_configured');
  const store = createGmailSubscriptionStore({ url: env.SUPABASE_URL, serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY, fetchImpl });
  // This principal is constructed only here, never from webhook input.
  const principal = Object.freeze({ googleAccess: true, allowedSourceIds: config.allowedSourceIds });
  const updater = createEventUpdater({ store: inputStore, principal, config: { enabled: config.enabled },
    authorizeEvent: ({ event, principal: actor }) => actor.googleAccess === true && actor.allowedSourceIds.includes(event.source_id)
      && event.source_id === config.sourceId && event.source === 'gmail'
      && ['email_received', 'email_received_metadata'].includes(event.event_type) });
  const subscription = createGmailSubscription({ config, store, fetchImpl, onDiagnostic, enqueueEvent: event => updater.enqueue(event) });
  const controller = new AbortController();
  return { config, subscription, controller, app: createGmailSubscriptionApp({ subscription, signal: controller.signal, onDiagnostic }) };
}

function publicResult(result) {
  const output = { status: result?.status || 'unavailable' };
  for (const field of ['queued', 'duplicates', 'messages', 'expiration']) if (Number.isSafeInteger(result?.[field])) output[field] = result[field];
  return output;
}

export async function runGmailSubscriptionCli(argv = process.argv.slice(2), { env = process.env, runtime,
  write = value => process.stdout.write(`${JSON.stringify(value)}\n`), serveImpl = serve } = {}) {
  const command = argv[0] || 'status';
  if (argv.length > 1 || !['status', 'watch', 'renew', 'sync', 'serve'].includes(command)) {
    write({ status: 'invalid_command' }); return { status: 'invalid_command' };
  }
  let current;
  const lastDiagnosticAt = new Map();
  const onDiagnostic = ({ reason, classification }) => {
    const currentTime = Date.now();
    if (lastDiagnosticAt.has(reason) && currentTime - lastDiagnosticAt.get(reason) < 60000) return;
    lastDiagnosticAt.set(reason, currentTime);
    write({ status: 'push_rejected', reason, classification: ['undefined', 'null', 'array', 'object', 'string', 'number', 'boolean', 'other'].includes(classification) ? classification : 'other' });
  };
  try { current = runtime || createGmailSubscriptionRuntime({ env, onDiagnostic }); }
  catch { write({ status: 'not_configured' }); return { status: 'not_configured' }; }
  const { config, subscription, app } = current;
  if (!config?.enabled || !config.configured || !subscription) {
    const result = { status: config?.enabled ? 'not_configured' : 'disabled' }; write(result); return result;
  }
  if (command === 'status') { const result = { status: 'configured' }; write(result); return result; }
  if (command !== 'serve') {
    const result = publicResult(await subscription[command]({})); write(result); return result;
  }
  const port = Number(env.PORT || 3002);
  if (!Number.isInteger(port) || port < 1 || port > 65535 || !app?.fetch) {
    write({ status: 'not_configured' }); return { status: 'not_configured' };
  }
  const controller = current.controller || new AbortController();
  let timer, stopped = false;
  const server = serveImpl({ fetch: app.fetch, port, hostname: env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1' });
  async function tick() {
    try { write(publicResult(await subscription.renew({ signal: controller.signal }))); }
    catch { if (!stopped) write({ status: 'unavailable' }); }
    finally { if (!stopped) timer = setTimeout(tick, config.reconcileMs); }
  }
  function stop() {
    if (stopped) return;
    stopped = true; clearTimeout(timer); controller.abort();
    process.removeListener('SIGTERM', stop); process.removeListener('SIGINT', stop);
    server.close();
    const closeTimer = setTimeout(() => server.closeAllConnections?.(), 10000); closeTimer.unref();
  }
  process.once('SIGTERM', stop); process.once('SIGINT', stop);
  server.on?.('error', () => { write({ status: 'server_unavailable' }); stop(); });
  write({ status: 'listening' });
  void tick();
  return { status: 'listening', stop };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await runGmailSubscriptionCli();
    if (!['configured', 'watching', 'ready', 'pending', 'listening'].includes(result.status)) process.exitCode = 1;
  } catch { process.stderr.write('{"status":"unavailable"}\n'); process.exitCode = 1; }
}
