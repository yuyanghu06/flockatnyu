import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, posix, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { prepareRuntimeDeployment } from '../scripts/prepare-runtime-deploy.mjs';
import { assistantPlanningPrompt } from '../server/chat/prompts/planning.js';
import { buildAutomationPrompt } from '../server/automation/prompt.js';

// Project the reviewed COPY syntax, rather than treating an upload context as
// proof that its files also reach the image. Dependencies model npm ci using
// already-installed pinned packages; application files come only from COPY.
async function projectRuntimeImage(result, docker, temporaryRoot) {
  const root = await mkdtemp(join(temporaryRoot, 'runtime-image-'));
  const workdir = docker.match(/^WORKDIR (\/\S+)$/m)?.[1];
  assert.equal(workdir, '/app');
  const copied = new Set();
  for (const line of docker.split('\n').filter((line) => line.startsWith('COPY '))) {
    const parts = line.slice(5).trim().split(/\s+/);
    assert(
      parts.length >= 2 && parts.every((part) => !/[\[\]*?]/.test(part) && !part.startsWith('--')),
      'unsupported COPY syntax needs an explicit projection',
    );
    const destination = parts.pop();
    for (const source of parts) {
      const names = result.files.filter((name) => name === source || name.startsWith(`${source}/`));
      assert(names.length > 0, `COPY source missing from upload: ${source}`);
      for (const name of names) {
        const isFile = name === source;
        const directoryTarget =
          parts.length > 1 || destination.endsWith('/') || destination === '.';
        const suffix = isFile
          ? directoryTarget
            ? basename(source)
            : ''
          : name.slice(source.length + 1);
        const path = join(root, posix.resolve(workdir, destination, suffix).slice(1));
        await mkdir(dirname(path), { recursive: true });
        await writeFile(path, await readFile(join(result.directory, name)));
        copied.add(name);
      }
    }
  }
  const dependencies = fileURLToPath(new URL('../node_modules/', import.meta.url));
  for (const [name, version] of Object.entries(result.dependencies)) {
    const installed = JSON.parse(await readFile(join(dependencies, name, 'package.json'), 'utf8'));
    assert.equal(installed.version, version, `installed ${name} matches the package pin`);
  }
  await symlink(dependencies, join(root, 'app/node_modules'), 'dir');
  return { directory: join(root, 'app'), copied };
}

function importRuntimeImage(image, service) {
  const modules =
    service === 'web'
      ? [['server/runtime/app.js', 'createApp']]
      : [
          ['server/automation/adapters.js', 'createAutomationAdapters'],
          ['server/automation/handler.js', 'createAutomationHandler'],
        ];
  const program = `
    import assert from 'node:assert/strict';
    import http from 'node:http';
    import https from 'node:https';
    import net from 'node:net';
    import tls from 'node:tls';
    import { syncBuiltinESMExports } from 'node:module';
    let networkAttempts = 0;
    const deny = () => { networkAttempts++; throw new Error('runtime_image_network_denied'); };
    globalThis.fetch = deny;
    http.request = http.get = https.request = https.get = deny;
    net.connect = net.createConnection = net.Socket.prototype.connect = deny;
    net.Server.prototype.listen = tls.connect = deny;
    syncBuiltinESMExports();
    const modules = ${JSON.stringify(modules.map(([name, exported]) => [pathToFileURL(join(image.directory, name)).href, exported]))};
    for (const [name, exported] of modules) {
      const module = await import(name);
      assert.equal(typeof module[exported], 'function');
    }
    assert.equal(networkAttempts, 0);
    process.stdout.write(JSON.stringify({ status: 'ready', modules: modules.length, networkAttempts }));
  `;
  return JSON.parse(
    execFileSync(process.execPath, ['--input-type=module', '-e', program], {
      cwd: image.directory,
      env: {},
      encoding: 'utf8',
      timeout: 10000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }),
  );
}

test('web and worker upload contexts contain exact reachable code, pinned manifests, no private files and no worker frontend', async (t) => {
  const temp = await mkdtemp(join(tmpdir(), 'runtime-deployment-test-'));
  t.after(() => rm(temp, { recursive: true, force: true }));
  const contexts = [];
  for (const service of ['web', 'agent-worker']) {
    const result = await prepareRuntimeDeployment({ service, temporaryRoot: temp });
    contexts.push(result);
    assert.ok(
      result.files.includes(service === 'web' ? 'server/web.js' : 'server/automation/cli.js'),
    );
    assert.equal(result.files.includes('server/miro/mcp-auth.js'), service === 'web');
    if (service === 'agent-worker')
      assert(
        !result.files.some(
          (name) => name.startsWith('server/miro/') || name.startsWith('tools/miro/'),
        ),
      );
    assert.ok(
      result.files.includes('server/automation/adapters.js') === (service === 'agent-worker'),
    );
    assert.equal(
      result.files.some((name) => name.startsWith('dist/')),
      service === 'web',
    );
    assert.equal(result.files.includes('src/api/chat/post.js'), service === 'web');
    assert.equal(result.files.includes('src/api/gmail/send/post.js'), service === 'web');
    for (const dormant of [
      'src/api/treg/register.js',
      'src/api/treg/people/email/find/post.js',
      'src/api/treg/people/email/verify/post.js',
      'src/api/treg/people/phone/find/post.js',
      'src/api/treg/companies/enrich/post.js',
    ]) {
      assert.equal(
        result.files.includes(dormant),
        false,
        'dormant routes stay out of deployed runtime',
      );
    }
    assert.ok(
      !result.files.some((name) => name.startsWith('src/') && !name.startsWith('src/api/')),
      'browser sources never enter the runtime context',
    );
    // Authored history.js is runtime code; private history directories stay excluded.
    for (const name of result.files)
      assert.ok(
        !/(?:^|\/)(?:\.env[^/]*|\.git|node_modules|evidence|history|\.miro[^/]*)(?:\/|$)/.test(
          name,
        ),
        name,
      );
    const manifest = JSON.parse(await readFile(join(result.directory, 'package.json'), 'utf8'));
    const lock = JSON.parse(await readFile(join(result.directory, 'package-lock.json'), 'utf8'));
    assert.equal(manifest.private, true);
    assert.equal(manifest.devDependencies, undefined);
    assert.deepEqual(lock.packages[''].dependencies, manifest.dependencies);
    for (const [name, version] of Object.entries(manifest.dependencies)) {
      assert.match(version, /^\d+\.\d+\.\d+$/);
      assert.equal(lock.packages[`node_modules/${name}`].version, version);
    }
    const dockerignore = await readFile(join(result.directory, '.dockerignore'), 'utf8');
    assert.ok(dockerignore.startsWith('**\n'));
    assert.ok(!dockerignore.includes('!.env'));
    const railway = JSON.parse(await readFile(join(result.directory, 'railway.json'), 'utf8'));
    assert.equal(railway.deploy.cronSchedule, null);
    assert.equal(railway.deploy.healthcheckPath, service === 'web' ? '/healthz' : undefined);
    const docker = await readFile(join(result.directory, 'Dockerfile'), 'utf8');
    assert.match(docker, /^COPY prompts \.\/prompts$/m);
    const image = await projectRuntimeImage(result, docker, temp);
    assert.deepEqual(
      importRuntimeImage(image, service),
      {
        status: 'ready',
        modules: service === 'web' ? 1 : 2,
        networkAttempts: 0,
      },
      `${service}: runtime imports from the actual Docker COPY filesystem with network denied`,
    );
    for (const name of result.files.filter(
      (name) => !['Dockerfile', '.dockerignore', 'railway.json'].includes(name),
    ))
      assert(
        image.copied.has(name),
        `${service}: reachable runtime file omitted from Docker COPY: ${name}`,
      );
    const module =
      service === 'web' ? 'server/chat/prompts/planning.js' : 'server/automation/prompt.js';
    const name = service === 'web' ? 'assistantPlanningPrompt' : 'buildAutomationPrompt';
    const input =
      service === 'web'
        ? { now: '2026-10-27T12:00:00Z', timeZone: 'America/New_York' }
        : { now: '2026-10-27T12:00:00Z', timezone: 'America/New_York', phase: 'followup' };
    const expected =
      service === 'web' ? assistantPlanningPrompt(input) : buildAutomationPrompt(input);
    const program = `const module=await import(${JSON.stringify(pathToFileURL(join(result.directory, module)).href)});process.stdout.write(module[${JSON.stringify(name)}](${JSON.stringify(input)}));`;
    assert.equal(
      execFileSync(process.execPath, ['--input-type=module', '-e', program], {
        cwd: temp,
        env: {},
        encoding: 'utf8',
      }),
      expected,
      `${service}: packaged prompt imports and renders entirely from its own context`,
    );
  }
  const again = await prepareRuntimeDeployment({ service: 'agent-worker', temporaryRoot: temp });
  assert.deepEqual(again.files, contexts[1].files);
  for (const name of again.files)
    assert.deepEqual(
      await readFile(join(again.directory, name)),
      await readFile(join(contexts[1].directory, name)),
      name,
    );
});

test('runtime packaging rejects invalid service and repository-local upload directory', async () => {
  await assert.rejects(
    prepareRuntimeDeployment({ service: 'unknown' }),
    /deployment_service_invalid/,
  );
  await assert.rejects(
    prepareRuntimeDeployment({ temporaryRoot: resolve('.') }),
    /deployment_temporary_root_invalid/,
  );
});

test('runtime packaging rejects a reachable browser source even when imported by the web server', async (t) => {
  const fixture = await mkdtemp(join(tmpdir(), 'runtime-browser-boundary-'));
  t.after(() => rm(fixture, { recursive: true, force: true }));
  await mkdir(join(fixture, 'server'));
  await writeFile(join(fixture, 'server/web.js'), "import '../src/app/main.js';\n");
  await assert.rejects(
    prepareRuntimeDeployment({ root: fixture, temporaryRoot: tmpdir(), service: 'web' }),
    /deployment_module_denied/,
  );
});
