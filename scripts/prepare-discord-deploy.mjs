import {lstat, mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {dirname, isAbsolute, join, posix, resolve, relative, sep} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sharedModules = new Set(['server/source-timeout.js']);
const nativeModules = new Set(['node:crypto', 'node:http', 'node:path', 'node:timers/promises', 'node:url']);
// Node parses imports without executing source or resolving/loading its packages.
const parseImports = `import {SourceTextModule} from 'node:vm';
let source = ''; for await (const part of process.stdin) source += part;
try { process.stdout.write(JSON.stringify(new SourceTextModule(source).dependencySpecifiers)); }
catch { process.exitCode = 1; }`;
const dynamicLoader = /\b(?:import|require)\s*(?:(?:\/\*[\s\S]*?\*\/|\/\/[^\n]*\n)\s*)*\(/u;

async function input(root, name) {
  if (name.startsWith('/') || name.split('/').some(part => !part || part === '..' || part === '.')) throw new Error('deployment_input_invalid');
  const parts = name.split('/');
  for (let index = 0; index <= parts.length; index++) {
    const path = join(root, ...parts.slice(0, index));
    const stat = await lstat(path);
    if (stat.isSymbolicLink()) throw new Error('deployment_symlink_denied');
    if (index < parts.length ? !stat.isDirectory() : !stat.isFile()) throw new Error('deployment_input_invalid');
  }
  return readFile(join(root, name));
}

/** Shared static-ESM packager. Only reachable .js modules in explicit service
 * roots and exact reviewed manifests/config enter a fresh temporary directory.
 * Dynamic loading is conservatively rejected, including loader-looking text in
 * comments/strings; supporting it requires a separate explicit packaging review. */
export async function prepareCollectorDeployment({root = repository, temporaryRoot = tmpdir(), service, entrypoint, moduleRoots, dependencies}) {
  root = resolve(root);
  const outputRoot = resolve(temporaryRoot);
  const withinRepository = relative(root, outputRoot);
  if (!withinRepository || withinRepository !== '..' && !withinRepository.startsWith(`..${sep}`) && !isAbsolute(withinRepository)) throw new Error('deployment_temporary_root_invalid');
  const sources = new Map(), external = new Set();
  async function visit(name) {
    if (sources.has(name)) return;
    if (!name.endsWith('.js') || (!sharedModules.has(name) && !moduleRoots.some(prefix => name.startsWith(`${prefix}/`)))) throw new Error('deployment_module_denied');
    const source = await input(root, name);
    if (dynamicLoader.test(source.toString('utf8'))) throw new Error('deployment_dynamic_import_denied');
    let imports;
    try {
      imports = JSON.parse(execFileSync(process.execPath, ['--experimental-vm-modules', '--input-type=module', '-e', parseImports], {
        input: source, encoding: 'utf8', maxBuffer: 1024 * 1024,
        env: {}, stdio: ['pipe', 'pipe', 'pipe'],
      }));
    } catch { throw new Error('deployment_module_invalid'); }
    sources.set(name, source);
    for (const specifier of imports) {
      if (nativeModules.has(specifier)) continue;
      if (Object.hasOwn(dependencies, specifier)) { external.add(specifier); continue; }
      if (!specifier.startsWith('./') && !specifier.startsWith('../')) throw new Error('deployment_dependency_denied');
      if (/[\\?#%]/u.test(specifier)) throw new Error('deployment_module_denied');
      await visit(posix.normalize(posix.join(posix.dirname(name), specifier)));
    }
  }
  await visit(entrypoint);
  if (Object.keys(dependencies).some(name => !external.has(name))) throw new Error('deployment_dependency_unused');
  const assets = new Map();
  for (const name of ['Dockerfile', 'package.json', 'package-lock.json', 'railway.json']) {
    assets.set(name, await input(root, `deployment/${service}/${name}`));
  }
  const manifest = JSON.parse(assets.get('package.json'));
  const lock = JSON.parse(assets.get('package-lock.json'));
  if (manifest.type !== 'module' || manifest.private !== true || manifest.devDependencies || manifest.scripts ||
      JSON.stringify(manifest.dependencies ?? {}) !== JSON.stringify(dependencies) ||
      Object.values(dependencies).some(version => !/^\d+\.\d+\.\d+$/u.test(version)) ||
      lock.lockfileVersion !== 3 || lock.name !== manifest.name ||
      JSON.stringify(lock.packages?.['']?.dependencies ?? {}) !== JSON.stringify(dependencies)) throw new Error('deployment_manifest_invalid');
  const files = [...assets.keys(), ...sources.keys(), '.dockerignore'].sort();
  // An additional exact-file Docker allowlist protects against files added later.
  const allow = new Set(['Dockerfile', 'package.json', 'package-lock.json']);
  for (const name of sources.keys()) {
    const parts = name.split('/');
    for (let index = 1; index < parts.length; index++) allow.add(`${parts.slice(0, index).join('/')}/`);
    allow.add(name);
  }
  assets.set('.dockerignore', Buffer.from(`**\n${[...allow].sort().map(name => `!${name}`).join('\n')}\n`));
  const directory = await mkdtemp(join(outputRoot, `tech-nyu-${service}-`));
  try {
    for (const [name, contents] of [...assets, ...sources]) {
      await mkdir(dirname(join(directory, name)), {recursive: true});
      await writeFile(join(directory, name), contents);
    }
  } catch (error) { await rm(directory, {recursive: true, force: true}); throw error; }
  return {directory, files, modules: [...sources.keys()].sort(), dependencies: {...dependencies}};
}

export function prepareDiscordDeployment(options = {}) {
  return prepareCollectorDeployment({...options, service: 'discord-worker', entrypoint: 'server/discord/event-cli.js',
    moduleRoots: ['server/discord', 'server/automation'],
    dependencies: {'@discordjs/rest': '2.6.3', '@discordjs/ws': '2.0.4'}});
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { console.log(JSON.stringify(await prepareDiscordDeployment())); }
  catch { console.error(JSON.stringify({status: 'failed', code: 'deployment_preparation_failed'})); process.exitCode = 1; }
}
