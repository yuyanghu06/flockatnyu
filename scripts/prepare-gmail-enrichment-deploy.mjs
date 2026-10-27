import { lstat, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { builtinModules } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, posix, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const native = new Set(builtinModules.map(name => `node:${name.replace(/^node:/, '')}`));
const parseImports = `import {SourceTextModule} from 'node:vm';let text='';for await(const part of process.stdin)text+=part;process.stdout.write(JSON.stringify(new SourceTextModule(text).dependencySpecifiers));`;
const loader = /\b(?:import|require)\s*(?:(?:\/\*[\s\S]*?\*\/|\/\/[^\n]*\n)\s*)*\(/u;
async function input(root, name) {
  if (isAbsolute(name) || name.split('/').some(part => !part || part.startsWith('.'))) throw Error('deployment_input_denied');
  const parts = name.split('/');
  for (let i = 0; i <= parts.length; i++) {
    const stat = await lstat(join(root, ...parts.slice(0, i)));
    if (stat.isSymbolicLink() || (i < parts.length ? !stat.isDirectory() : !stat.isFile())) throw Error('deployment_input_denied');
  }
  return readFile(join(root, name));
}

// The independent service has no external runtime dependencies. Follow only its
// static server imports; never upload the checkout, private logs or email data.
export async function prepareGmailEnrichmentDeployment({ root = repository, temporaryRoot = tmpdir() } = {}) {
  root = resolve(root); temporaryRoot = resolve(temporaryRoot);
  const nested = relative(root, temporaryRoot);
  if (!nested || nested !== '..' && !nested.startsWith(`..${sep}`) && !isAbsolute(nested)) throw Error('deployment_temporary_root_invalid');
  const files = new Map();
  async function visit(name) {
    if (files.has(name)) return;
    if (!/^server\/[A-Za-z0-9_/-]+\.js$/.test(name)) throw Error('deployment_module_denied');
    const source = await input(root, name);
    if (loader.test(source.toString('utf8'))) throw Error('deployment_dynamic_import_denied');
    const imports = JSON.parse(execFileSync(process.execPath, ['--experimental-vm-modules', '--input-type=module', '-e', parseImports], {
      input: source, encoding: 'utf8', env: {}, maxBuffer: 1048576, stdio: ['pipe', 'pipe', 'pipe'] }));
    files.set(name, source);
    for (const specifier of imports) {
      if (native.has(specifier)) continue;
      if (!specifier.startsWith('./') && !specifier.startsWith('../') || /[\\?#%]/.test(specifier)) throw Error('deployment_dependency_denied');
      await visit(posix.normalize(posix.join(posix.dirname(name), specifier)));
    }
  }
  await visit('server/gmail-enrichment/cli.js');
  const manifest = { name: 'tech-nyu-gmail-enrichment', version: '0.1.0', private: true, type: 'module', dependencies: {} };
  files.set('package.json', Buffer.from(JSON.stringify(manifest, null, 2) + '\n'));
  files.set('package-lock.json', Buffer.from(JSON.stringify({ name: manifest.name, version: manifest.version, lockfileVersion: 3,
    requires: true, packages: { '': { name: manifest.name, version: manifest.version, dependencies: {} } } }, null, 2) + '\n'));
  for (const name of ['Dockerfile', 'railway.json', 'entrypoint.sh']) files.set(name, await input(root, `deployment/gmail-enrichment/${name}`));
  const allowed = new Set(['Dockerfile', 'package.json', 'package-lock.json', 'entrypoint.sh']);
  for (const name of files.keys()) {
    if (name === 'railway.json') continue;
    const parts = name.split('/');
    for (let i = 1; i < parts.length; i++) allowed.add(parts.slice(0, i).join('/') + '/');
    allowed.add(name);
  }
  files.set('.dockerignore', Buffer.from(`**\n${[...allowed].sort().map(name => `!${name}`).join('\n')}\n`));
  const directory = await mkdtemp(join(temporaryRoot, 'tech-nyu-gmail-enrichment-'));
  try { for (const [name, content] of files) { await mkdir(dirname(join(directory, name)), { recursive: true }); await writeFile(join(directory, name), content); } }
  catch (error) { await rm(directory, { recursive: true, force: true }); throw error; }
  return { directory, files: [...files.keys()].sort(), dependencies: {} };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { console.log(JSON.stringify(await prepareGmailEnrichmentDeployment())); }
  catch { console.error('{"status":"failed","code":"deployment_preparation_failed"}'); process.exitCode = 1; }
}
