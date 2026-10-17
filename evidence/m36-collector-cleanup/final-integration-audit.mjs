import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync} from 'node:fs';
import {readFile, readdir, rm} from 'node:fs/promises';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {SourceTextModule} from 'node:vm';
import {prepareDiscordDeployment} from '../../tools/prepare-discord-deploy.mjs';
import {prepareGmailDeployment} from '../../tools/prepare-gmail-deploy.mjs';
import {prepareMiroDeployment} from '../../tools/prepare-miro-deploy.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
async function files(directory, prefix = '') {
  const found = [];
  for (const entry of await readdir(join(directory, prefix), {withFileTypes: true})) {
    assert.equal(entry.isSymbolicLink(), false, `symlink: ${prefix}/${entry.name}`);
    const name = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) found.push(...await files(directory, name));
    else found.push(name);
  }
  return found.sort();
}
const retired = execFileSync('git', ['diff', '--name-only', '--diff-filter=D', '--', 'server'], {cwd: root, encoding: 'utf8'})
  .trim().split('\n').filter(Boolean);
const missing = [], retiredEdges = [], dynamicNonliteral = [];
let sourceCount = 0, localEdges = 0;
for (const folder of ['server', 'src', 'tools']) {
  for (const name of await files(join(root, folder))) {
    if (!/\.(?:m?js)$/u.test(name)) continue;
    const relative = `${folder}/${name}`, path = join(root, relative);
    const source = await readFile(path, 'utf8');
    sourceCount++;
    const specifiers = [...new SourceTextModule(source).dependencySpecifiers];
    for (const match of source.matchAll(/\bimport\s*\(\s*(['"])([^'"]+)\1\s*\)/gu)) specifiers.push(match[2]);
    if (/\bimport\s*\(\s*(?!['"])/u.test(source)) dynamicNonliteral.push(relative);
    for (const specifier of specifiers) {
      if (!specifier.startsWith('.')) continue;
      localEdges++;
      const target = resolve(dirname(path), specifier.split(/[?#]/u)[0]);
      if (!existsSync(target)) missing.push({source: relative, specifier});
      if (retired.some(item => join(root, item) === target)) retiredEdges.push({source: relative, specifier});
    }
  }
}
assert.deepEqual(missing, [], 'missing local imports');
assert.deepEqual(retiredEdges, [], 'retired production import edges');
console.log(JSON.stringify({audit: 'production-local-imports', sourceCount, localEdges, retiredFiles: retired, missing, retiredEdges, dynamicNonliteral}));

for (const [service, prepare, allowedRoots, forbiddenDeps] of [
  ['discord', prepareDiscordDeployment, ['server/discord/', 'server/automation/'], /google|hono|three|clipper|vite|playwright|gltf|pglite/u],
  ['gmail', prepareGmailDeployment, ['server/google/', 'server/automation/'], /discord|three|clipper|vite|playwright|gltf|pglite/u],
  ['miro', prepareMiroDeployment, ['server/miro/'], /.+/u],
]) {
  const context = await prepare();
  try {
    const actualFiles = await files(context.directory);
    assert.deepEqual(actualFiles, [...context.files].sort());
    const modules = actualFiles.filter(name => name.endsWith('.js'));
    for (const name of modules) {
      assert.ok(allowedRoots.some(prefix => name.startsWith(prefix)), `cross-connector module: ${name}`);
      assert.ok(!retired.includes(name), `retired module: ${name}`);
      assert.ok(!/\/(?:handler|provider|summary-cli|summary-schedule|summaries|embeddings|memory|sync)\.js$/u.test(name) || service === 'miro', `archive/agent module: ${name}`);
      assert.deepEqual(await readFile(join(context.directory, name)), await readFile(join(root, name)));
    }
    for (const name of actualFiles) assert.ok(!/(?:^|\/)(?:\.env(?:\..*)?|credentials?[^/]*|tokens?[^/]*|secrets?[^/]*)$/iu.test(name), `secret-named file: ${name}`);
    const manifest = JSON.parse(await readFile(join(context.directory, 'package.json'), 'utf8'));
    assert.equal(manifest.devDependencies, undefined);
    let lockedPackages = 0;
    if (actualFiles.includes('package-lock.json')) {
      const lock = JSON.parse(await readFile(join(context.directory, 'package-lock.json'), 'utf8'));
      for (const [name, metadata] of Object.entries(lock.packages)) {
        if (!name) continue;
        lockedPackages++;
        assert.equal(forbiddenDeps.test(name), false, `cross-connector dependency: ${name}`);
        assert.equal(metadata.dev, undefined);
        assert.match(metadata.resolved, /^https:\/\/registry.npmjs.org\//u);
        assert.match(metadata.integrity, /^sha512-/u);
      }
    } else assert.deepEqual(manifest.dependencies ?? {}, {});
    const hashes = {};
    for (const name of actualFiles) hashes[name] = createHash('sha256').update(await readFile(join(context.directory, name))).digest('hex');
    console.log(JSON.stringify({audit: 'prepared-context', service, files: actualFiles, modules: modules.length, directDependencies: manifest.dependencies ?? {}, lockedPackages, sha256: hashes}));
  } finally { await rm(context.directory, {recursive: true, force: true}); }
}
console.log('PASS: static imports and isolated deployment contexts');
