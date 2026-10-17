import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';

// Start direct Node children, not npm/shell/watch wrappers, so every process we
// own can be stopped on either child's failure or on terminal interruption.
const root = fileURLToPath(new URL('../', import.meta.url));
const port = Number(process.env.PORT || 3001);
const children = new Map();
let stopping = false;

async function shutdown(code) {
  if (stopping) return;
  stopping = true;
  const active = [...children].filter(([, state]) => !state.exited);
  for (const [child] of active) child.kill('SIGTERM');
  const force = setTimeout(() => {
    for (const [child, state] of active) if (!state.exited) child.kill('SIGKILL');
  }, 2500);
  await Promise.all(active.map(([, state]) => state.finished));
  clearTimeout(force);
  process.exit(code);
}

for (const [signal, code] of [['SIGINT', 130], ['SIGTERM', 143], ['SIGHUP', 129]]) {
  process.on(signal, () => { void shutdown(code); });
}

function start(name, args) {
  const child = spawn(process.execPath, args, {
    cwd: root, env: { ...process.env, NODE_ENV: 'development' }, stdio: 'inherit',
  });
  const state = { exited: false };
  state.finished = new Promise(resolve => {
    child.once('error', () => {
      state.exited = true;
      resolve();
      if (!stopping) {
        console.error(`[dev] Could not start ${name}. Check the local Node installation.`);
        void shutdown(1);
      }
    });
    child.once('exit', (code, signal) => {
      state.exited = true;
      resolve();
      if (!stopping) {
        console.error(`[dev] ${name} stopped (${signal || `exit ${code}`}); stopping the development session.`);
        void shutdown(code === 0 ? 0 : 1);
      }
    });
  });
  children.set(child, state);
  return child;
}

async function checkPort() {
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be an integer from 1 to 65535.');
  await new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', error => reject(new Error(error.code === 'EADDRINUSE'
      ? `Assistant API port ${port} is already in use. Stop that server yourself or choose another PORT in .env. No existing process was stopped.`
      : `Assistant API cannot listen on port ${port}. Check your local port configuration.`)));
    probe.listen({ host: '127.0.0.1', port, exclusive: true }, () => probe.close(resolve));
  });
}

async function waitHealthy() {
  const deadline = Date.now() + 15000;
  while (!stopping && Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/healthz`, { signal: AbortSignal.timeout(750) });
      const health = await response.json();
      if (response.ok && health?.ok === true && health?.service === 'tech-nyu-api' && !stopping) return;
    } catch { /* The API may still be loading. Never print server configuration. */ }
    if (!stopping) await new Promise(resolve => setTimeout(resolve, 100));
  }
  if (!stopping) throw new Error('Assistant API did not become ready within 15 seconds. Check its startup output above.');
}

try {
  await checkPort();
  if (!stopping) {
    start('Assistant API', ['server/index.js']);
    await waitHealthy();
    if (!stopping) {
      console.log(`[dev] Assistant API ready at http://127.0.0.1:${port}`);
      start('Vite', ['node_modules/vite/bin/vite.js', ...process.argv.slice(2)]);
    }
  }
} catch (error) {
  if (!stopping) console.error(`[dev] ${error.message}`);
  await shutdown(1);
}
