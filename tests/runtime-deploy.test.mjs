import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {prepareRuntimeDeployment} from '../scripts/prepare-runtime-deploy.mjs';

test('web and worker upload contexts contain exact reachable code, pinned manifests, no private files and no worker frontend', async t => {
  const temp = await mkdtemp(join(tmpdir(), 'runtime-deployment-test-'));
  t.after(() => rm(temp, {recursive:true, force:true}));
  const contexts = [];
  for (const service of ['web', 'agent-worker']) {
    const result = await prepareRuntimeDeployment({service, temporaryRoot:temp}); contexts.push(result);
    assert.ok(result.files.includes(service === 'web' ? 'server/web.js' : 'server/automation/cli.js'));
    assert.equal(result.files.includes('server/miro/mcp-auth.js'),service === 'web');
    if(service==='agent-worker')assert(!result.files.some(name=>name.startsWith('server/miro/')||name.startsWith('tools/miro/')));
    assert.ok(result.files.includes('server/automation/adapters.js') === (service === 'agent-worker'));
    assert.equal(result.files.some(name => name.startsWith('dist/')), service === 'web');
    for (const name of result.files) assert.ok(!/(?:^|\/)(?:\.env[^/]*|\.git|node_modules|evidence|history|\.miro[^/]*)\b/.test(name), name);
    const manifest = JSON.parse(await readFile(join(result.directory, 'package.json'), 'utf8'));
    const lock = JSON.parse(await readFile(join(result.directory, 'package-lock.json'), 'utf8'));
    assert.equal(manifest.private, true); assert.equal(manifest.devDependencies, undefined);
    assert.deepEqual(lock.packages[''].dependencies, manifest.dependencies);
    for (const [name, version] of Object.entries(manifest.dependencies)) {
      assert.match(version, /^\d+\.\d+\.\d+$/);
      assert.equal(lock.packages[`node_modules/${name}`].version, version);
    }
    const dockerignore = await readFile(join(result.directory, '.dockerignore'), 'utf8');
    assert.ok(dockerignore.startsWith('**\n')); assert.ok(!dockerignore.includes('!.env'));
    const railway = JSON.parse(await readFile(join(result.directory, 'railway.json'), 'utf8'));
    assert.equal(railway.deploy.cronSchedule, null);
    assert.equal(railway.deploy.healthcheckPath, service === 'web' ? '/healthz' : undefined);
  }
  const again = await prepareRuntimeDeployment({service:'agent-worker', temporaryRoot:temp});
  assert.deepEqual(again.files, contexts[1].files);
  for (const name of again.files) assert.deepEqual(await readFile(join(again.directory, name)), await readFile(join(contexts[1].directory, name)), name);
});

test('runtime packaging rejects invalid service and repository-local upload directory', async () => {
  await assert.rejects(prepareRuntimeDeployment({service:'unknown'}), /deployment_service_invalid/);
  await assert.rejects(prepareRuntimeDeployment({temporaryRoot:resolve('.')}), /deployment_temporary_root_invalid/);
});
