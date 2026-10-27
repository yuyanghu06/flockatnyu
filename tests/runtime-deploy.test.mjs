import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { prepareRuntimeDeployment } from '../scripts/prepare-runtime-deploy.mjs';
import { assistantPlanningPrompt } from '../server/chat/prompts/planning.js';
import { buildAutomationPrompt } from '../server/automation/prompt.js';

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
