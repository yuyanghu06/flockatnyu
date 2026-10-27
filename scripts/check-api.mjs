import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { validatePromptAssets } from '../server/prompt-loader/index.js';
async function check(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) await check(path);
    else if (entry.name.endsWith('.js')) {
      const result = spawnSync(process.execPath, ['--check', path], { stdio: 'inherit' });
      if (result.status !== 0) process.exit(result.status || 1);
    }
  }
}
await check('server');
await check('tools');
await check('src/api');
// Validate real dependencies without opening a port or making external calls.
await import('../server/runtime/app.js');
await import('@hono/node-server');
validatePromptAssets();
console.log('API syntax and runtime dependencies verified.');
