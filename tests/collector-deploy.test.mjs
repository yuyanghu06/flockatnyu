import test from 'node:test';
import assert from 'node:assert/strict';
import {copyFile, lstat, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {prepareDiscordDeployment} from '../scripts/prepare-discord-deploy.mjs';
import {prepareGmailDeployment} from '../scripts/prepare-gmail-deploy.mjs';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const discordDependencies = {'@discordjs/rest': '2.6.3', '@discordjs/ws': '2.0.4'};
const gmailDependencies = {'@hono/node-server': '2.1.4', 'google-auth-library': '11.3.0', hono: '4.13.13'};
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'collector-fixture-'));
  t.after(() => rm(root, {recursive: true, force: true}));
  for (const service of ['discord-worker', 'gmail-events']) {
    await mkdir(join(root, 'deployment', service), {recursive: true});
    for (const name of ['Dockerfile', 'railway.json', 'package.json', 'package-lock.json']) {
      await copyFile(join(repository, 'deployment', service, name), join(root, 'deployment', service, name));
    }
  }
  await mkdir(join(root, 'server/discord'), {recursive: true});
  await mkdir(join(root, 'server/automation'), {recursive: true});
  await writeFile(join(root, 'server/discord/event-cli.js'), `import 'node:http';
import '@discordjs/rest';
import '@discordjs/ws';
import {value} from '../automation/events.js';
export * from './gateway.js';
throw new Error('source_must_never_execute_during_preparation');`);
  await writeFile(join(root, 'server/discord/gateway.js'), `import './event-cli.js'; export {};`);
  await writeFile(join(root, 'server/automation/events.js'), 'export const value = 1;');
  return root;
}
async function prepare(t, fn, options) {
  const result = await fn(options);
  t.after(() => rm(result.directory, {recursive: true, force: true}));
  return result;
}
async function filesIn(root, prefix = '') {
  const files = [];
  for (const entry of await readdir(join(root, prefix), {withFileTypes: true})) {
    const name = prefix ? `${prefix}/${entry.name}` : entry.name;
    assert.equal(entry.isSymbolicLink(), false);
    if (entry.isDirectory()) files.push(...await filesIn(root, name));
    else files.push(name);
  }
  return files.sort();
}

test('Discord packages only its static import closure, without executing sources or following unrelated symlinks', async t => {
  const root = await fixture(t);
  const secret = 'SECRET_MUST_NOT_ENTER_CONTEXT';
  for (const name of ['.env', 'package.json', 'server/discord/archived.js', 'server/automation/handler.js', 'server/unrelated.js']) {
    await writeFile(join(root, name), secret);
  }
  await mkdir(join(root, 'server/google'));
  await writeFile(join(root, 'server/google/secret.json'), secret);
  await symlink(join(root, '.env'), join(root, 'server/discord/unreachable.js'));
  const result = await prepare(t, prepareDiscordDeployment, {root});
  assert.deepEqual(result.modules, ['server/automation/events.js', 'server/discord/event-cli.js', 'server/discord/gateway.js']);
  assert.deepEqual(result.dependencies, discordDependencies);
  assert.deepEqual(await filesIn(result.directory), result.files);
  for (const name of result.files) assert.equal((await readFile(join(result.directory, name), 'utf8')).includes(secret), false);
  const manifest = JSON.parse(await readFile(join(result.directory, 'package.json'), 'utf8'));
  assert.equal(manifest.name, 'tech-nyu-discord-events');
  assert.deepEqual(manifest.dependencies, discordDependencies);
  const next = await prepare(t, prepareDiscordDeployment, {root});
  assert.notEqual(result.directory, next.directory);
  const ignore = await readFile(join(result.directory, '.dockerignore'), 'utf8');
  assert.match(ignore, /^\*\*\n/u);
  assert.match(ignore, /!server\/discord\/event-cli.js\n/u);
  assert.equal(ignore.includes('unreachable'), false);
});

test('reachable file and parent-directory symlinks fail closed', async t => {
  const root = await fixture(t);
  await writeFile(join(root, 'outside.js'), 'export const value = 1;');
  await rm(join(root, 'server/automation/events.js'));
  await symlink(join(root, 'outside.js'), join(root, 'server/automation/events.js'));
  await assert.rejects(prepareDiscordDeployment({root}), /deployment_symlink_denied/u);
  await rm(join(root, 'server/automation'), {recursive: true});
  await mkdir(join(root, 'outside'));
  await writeFile(join(root, 'outside/events.js'), 'export const value = 1;');
  await symlink(join(root, 'outside'), join(root, 'server/automation'));
  await assert.rejects(prepareDiscordDeployment({root}), /deployment_symlink_denied/u);
});

test('path escapes, other connectors, missing modules and unreviewed dependencies are rejected', async t => {
  const root = await fixture(t);
  for (const [source, error] of [
    ["import '../../.env';", /deployment_module_denied/u],
    ["import '../google/config.js';", /deployment_module_denied/u],
    ["import './missing.js';", /ENOENT/u],
    ["import 'three';", /deployment_dependency_denied/u],
    ["import 'node:fs';", /deployment_dependency_denied/u],
    ["import './gateway.js?query';", /deployment_module_denied/u],
    ["import './gateway%2ejs';", /deployment_module_denied/u],
    ["const x = import('./gateway.js');", /deployment_dynamic_import_denied/u],
    ["const x = import /* comment */ ('./gateway.js');", /deployment_dynamic_import_denied/u],
    ["const x = require('./gateway.js');", /deployment_dynamic_import_denied/u],
    ['export const = ;', /deployment_module_invalid/u],
  ]) {
    await writeFile(join(root, 'server/discord/event-cli.js'), source);
    await assert.rejects(prepareDiscordDeployment({root}), error);
  }
});

test('symlinked service inputs, invalid manifests and temporary output in the checkout are rejected', async t => {
  const root = await fixture(t);
  await assert.rejects(prepareDiscordDeployment({root, temporaryRoot: root}), /deployment_temporary_root_invalid/u);
  const name = join(root, 'deployment/discord-worker/package.json');
  const manifest = JSON.parse(await readFile(name, 'utf8'));
  manifest.dependencies = {three: '0.186.1'};
  await writeFile(name, JSON.stringify(manifest));
  await assert.rejects(prepareDiscordDeployment({root}), /deployment_manifest_invalid/u);
  await rm(name);
  await symlink(join(repository, 'deployment/discord-worker/package.json'), name);
  await assert.rejects(prepareDiscordDeployment({root}), /deployment_symlink_denied/u);
});

test('actual Gmail closure contains its callback and cache updater, excludes agent/model/Discord/Miro/map code', async t => {
  const result = await prepare(t, prepareGmailDeployment, {});
  assert.deepEqual(result.dependencies, gmailDependencies);
  assert.deepEqual(result.modules, [
    'server/automation/events.js', 'server/automation/store.js', 'server/automation/validation.js',
    'server/google/client.js', 'server/google/config.js', 'server/google/oauth.js', 'server/google/subscription-app.js',
    'server/google/subscription-cli.js', 'server/google/subscription-store.js', 'server/google/subscription.js', 'server/source-timeout.js',
  ]);
  assert.deepEqual(await filesIn(result.directory), result.files);
  for (const name of result.modules) assert.deepEqual(await readFile(join(result.directory, name)), await readFile(join(repository, name)));
  const manifest = JSON.parse(await readFile(join(result.directory, 'package.json'), 'utf8'));
  assert.deepEqual(manifest.dependencies, gmailDependencies);
  assert.equal(manifest.devDependencies, undefined);
  const lock = JSON.parse(await readFile(join(result.directory, 'package-lock.json'), 'utf8'));
  assert.deepEqual(lock.packages[''].dependencies, gmailDependencies);
  for (const [name, metadata] of Object.entries(lock.packages)) {
    assert.equal(metadata.dev, undefined);
    if (name) {
      assert.match(metadata.resolved, /^https:\/\/registry.npmjs.org\//u);
      assert.match(metadata.integrity, /^sha512-/u);
    }
    assert.equal(/three|clipper|vite|playwright|gltf|pglite/u.test(name), false);
  }
});

test('actual Discord Gateway closure contains event ingestion and excludes retired workers and other services', async t => {
  const result = await prepare(t, prepareDiscordDeployment, {});
  assert.deepEqual(result.dependencies, discordDependencies);
  assert.deepEqual(result.modules, [
    'server/automation/events.js', 'server/automation/store.js', 'server/automation/validation.js',
    'server/discord/chat-adapter.js', 'server/discord/chat-bridge.js', 'server/discord/chat-client.js',
    'server/discord/chat-config.js', 'server/discord/chat-delivery.js', 'server/discord/chat-runtime.js',
    'server/discord/client.js', 'server/discord/config.js', 'server/discord/discovery.js',
    'server/discord/event-cli.js', 'server/discord/event-config.js', 'server/discord/event-listener.js',
    'server/discord/event-state.js', 'server/discord/gateway.js', 'server/discord/metadata-refresh.js', 'server/discord/request-pacing.js', 'server/discord/store.js', 'server/source-timeout.js',
  ]);
  assert.deepEqual(await filesIn(result.directory), result.files);
  for (const name of result.modules) assert.deepEqual(await readFile(join(result.directory, name)), await readFile(join(repository, name)));
  const lock = JSON.parse(await readFile(join(result.directory, 'package-lock.json'), 'utf8'));
  assert.deepEqual(lock.packages[''].dependencies, discordDependencies);
  for (const [name, metadata] of Object.entries(lock.packages)) {
    assert.equal(metadata.dev, undefined);
    if (name) {
      assert.match(metadata.resolved, /^https:\/\/registry.npmjs.org\//u);
      assert.match(metadata.integrity, /^sha512-/u);
    }
    assert.equal(/google|hono|three|clipper|vite|playwright|gltf|pglite/u.test(name), false);
  }
});

test('service deployment configs explicitly separate continuous collectors from retired daily discovery', async () => {
  for (const [service, entrypoint] of [['discord-worker', 'server/discord/event-cli.js'], ['gmail-events', 'server/google/subscription-cli.js']]) {
    const path = join(repository, 'deployment', service);
    const config = JSON.parse(await readFile(join(path, 'railway.json'), 'utf8'));
    assert.deepEqual(config.build, {builder: 'DOCKERFILE', dockerfilePath: 'Dockerfile'});
    assert.deepEqual(config.deploy, {startCommand: `node ${entrypoint} serve`, healthcheckPath: '/healthz',
      healthcheckTimeout: 60, cronSchedule: null, restartPolicyType: 'ON_FAILURE', restartPolicyMaxRetries: 3});
    const docker = await readFile(join(path, 'Dockerfile'), 'utf8');
    assert.match(docker, /npm ci --omit=dev --ignore-scripts/u);
    assert.match(docker, /USER node/u);
    assert.equal(docker.includes('build:api'), false);
    assert.equal(docker.includes('COPY server ./server'), false);
    assert.equal((await lstat(join(path, 'package-lock.json'))).isFile(), true);
  }
});
