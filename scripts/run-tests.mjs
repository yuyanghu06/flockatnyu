import { readdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';

// Discover only deterministic suites. Browser/model/live scripts have separate commands.
const frontendSuites = [
  'camera-focus.mjs',
  'keyboard-pan.mjs',
  'map-interactions.mjs',
  'map-startup.mjs',
  'startup-visual.mjs',
  'map-memory.mjs',
  'global-center-geometry.mjs',
  'map-presentation.mjs',
  'park-vegetation.mjs',
  'union-square-context.mjs',
];
const files = [
  ...(await readdir('tests')).filter((name) => name.endsWith('.test.mjs')).sort(),
  ...frontendSuites,
].map((name) => `tests/${name}`);
const child = spawn(process.execPath, ['--test', '--test-concurrency=4', ...files], {
  stdio: 'inherit',
  env: process.env,
});
child.on('error', () => {
  console.error('Could not start the offline test runner.');
  process.exitCode = 1;
});
child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
