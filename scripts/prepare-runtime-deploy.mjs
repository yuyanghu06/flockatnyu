import {lstat, mkdir, mkdtemp, readFile, readdir, rm, writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {builtinModules} from 'node:module';
import {tmpdir} from 'node:os';
import {dirname, extname, isAbsolute, join, posix, relative, resolve, sep} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const native = new Set(builtinModules.map(name => `node:${name.replace(/^node:/, '')}`));
const approvedDependencies = new Set(['@hono/node-server', 'hono', '@modelcontextprotocol/sdk', 'saxes', 'google-auth-library', '@discordjs/rest']);
const parseImports = `import {SourceTextModule} from 'node:vm'; let text=''; for await (const part of process.stdin) text+=part; process.stdout.write(JSON.stringify(new SourceTextModule(text).dependencySpecifiers));`;
const dynamicLoader = /\b(?:import|require)\s*(?:(?:\/\*[\s\S]*?\*\/|\/\/[^\n]*\n)\s*)*\(/u;
const assets = new Set(['.html', '.js', '.css', '.json', '.svg', '.png', '.jpg', '.jpeg', '.webp', '.ico', '.glb', '.gltf', '.bin', '.ktx2', '.woff', '.woff2', '.md']);

async function input(root, name) {
  if (isAbsolute(name) || name.split('/').some(part => !part || part.startsWith('.'))) throw new Error('deployment_input_denied');
  const parts = name.split('/');
  for (let i = 0; i <= parts.length; i++) {
    const stat = await lstat(join(root, ...parts.slice(0, i)));
    if (stat.isSymbolicLink() || (i < parts.length ? !stat.isDirectory() : !stat.isFile())) throw new Error('deployment_input_denied');
  }
  return readFile(join(root, name));
}

/** Source-only temporary contexts. Only reachable reviewed runtime modules and
 * explicitly typed frontend build output enter uploads; secrets never do. The
 * sole dynamic loader is the trusted automation CLI, whose default adapter is
 * included explicitly. Nondefault adapter modules are not packaged. */
export async function prepareRuntimeDeployment({root = repository, temporaryRoot = tmpdir(), service = 'web'} = {}) {
  if (!['web', 'agent-worker'].includes(service)) throw new Error('deployment_service_invalid');
  root = resolve(root);
  const relativeTemp = relative(root, resolve(temporaryRoot));
  if (!relativeTemp || relativeTemp !== '..' && !relativeTemp.startsWith(`..${sep}`) && !isAbsolute(relativeTemp)) throw new Error('deployment_temporary_root_invalid');
  const files = new Map(), externals = new Set();
  async function visit(name) {
    if (files.has(name)) return;
    if (!/^(?:server|tools)\/[A-Za-z0-9_/-]+\.js$/.test(name)) throw new Error('deployment_module_denied');
    const source = await input(root, name);
    if (dynamicLoader.test(source.toString('utf8')) && name !== 'server/automation/cli.js') throw new Error('deployment_dynamic_import_denied');
    const imports = JSON.parse(execFileSync(process.execPath, ['--experimental-vm-modules', '--input-type=module', '-e', parseImports], {
      input:source, encoding:'utf8', maxBuffer:1048576, env:{}, stdio:['pipe', 'pipe', 'pipe'],
    }));
    files.set(name, source);
    for (const specifier of imports) {
      if (native.has(specifier)) continue;
      if (specifier.startsWith('./') || specifier.startsWith('../')) {
        if (/[\\?#%]/.test(specifier)) throw new Error('deployment_module_denied');
        await visit(posix.normalize(posix.join(posix.dirname(name), specifier)));
      } else {
        const dependency = specifier.startsWith('@') ? specifier.split('/').slice(0, 2).join('/') : specifier.split('/')[0];
        if (!approvedDependencies.has(dependency)) throw new Error('deployment_dependency_denied');
        externals.add(dependency);
      }
    }
  }
  await visit(service === 'web' ? 'server/web.js' : 'server/automation/cli.js');
  if (service === 'agent-worker') await visit('server/automation/adapters.js');
  if (service === 'web') {
    async function scan(directory) {
      // Refuse symlinked directories before traversing them.
      const stat = await lstat(join(root, directory));
      if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('deployment_asset_denied');
      for (const item of await readdir(join(root, directory), {withFileTypes:true})) {
        const name = `${directory}/${item.name}`;
        if (item.name.startsWith('.') || item.isSymbolicLink()) throw new Error('deployment_asset_denied');
        if (item.isFile() && item.name === 'info.md') continue;
        if (item.isDirectory()) await scan(name);
        else if (item.isFile() && assets.has(extname(name))) files.set(name, await input(root, name));
        else throw new Error('deployment_asset_denied');
      }
    }
    await scan('dist');
    if (!files.has('dist/index.html')) throw new Error('deployment_frontend_missing');
  }
  const lock = JSON.parse(await input(root, 'package-lock.json'));
  const dependencies = Object.fromEntries([...externals].sort().map(name => {
    const version = lock.packages?.[`node_modules/${name}`]?.version;
    if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('deployment_dependency_invalid');
    return [name, version];
  }));
  // Retain exact integrity records while pruning unrelated frontend/dev roots.
  const manifest = {name:`tech-nyu-${service}`, version:'0.1.0', private:true, type:'module', dependencies};
  const packages = {'':{name:manifest.name, version:manifest.version, dependencies}};
  const pending = Object.keys(dependencies).map(name => `node_modules/${name}`);
  while (pending.length) {
    const path = pending.pop(); if (packages[path]) continue;
    const entry = lock.packages?.[path];
    if (!entry || entry.link || !entry.integrity || !entry.resolved?.startsWith('https://registry.npmjs.org/')) throw new Error('deployment_lock_invalid');
    const copy = {...entry}; delete copy.dev; delete copy.devOptional;
    packages[path] = copy;
    for (const dependency of Object.keys({...entry.dependencies, ...entry.optionalDependencies, ...entry.peerDependencies})) {
      let cursor = path, found;
      while (cursor) {
        const candidate = `${cursor}/node_modules/${dependency}`;
        if (lock.packages[candidate]) {found = candidate; break;}
        const index = cursor.lastIndexOf('/node_modules/'); cursor = index < 0 ? '' : cursor.slice(0, index);
      }
      found ||= `node_modules/${dependency}`;
      if (lock.packages[found]) pending.push(found);
      else if (!entry.peerDependenciesMeta?.[dependency]?.optional && !entry.optionalDependencies?.[dependency]) throw new Error('deployment_dependency_missing');
    }
  }
  files.set('package.json', Buffer.from(JSON.stringify(manifest, null, 2) + '\n'));
  files.set('package-lock.json', Buffer.from(JSON.stringify({name:manifest.name, version:manifest.version, lockfileVersion:3, requires:true, packages}, null, 2) + '\n'));
  for (const name of ['Dockerfile', 'railway.json']) files.set(name, await input(root, `deployment/${service}/${name}`));
  if(service === 'web')files.set('entrypoint.sh', await input(root, 'deployment/web/entrypoint.sh'));
  const allowed = new Set(['Dockerfile', 'package.json', 'package-lock.json']);
  for (const name of files.keys()) {
    if (name === 'railway.json') continue;
    const parts = name.split('/');
    for (let i = 1; i < parts.length; i++) allowed.add(parts.slice(0, i).join('/') + '/');
    allowed.add(name);
  }
  files.set('.dockerignore', Buffer.from(`**\n${[...allowed].sort().map(name => `!${name}`).join('\n')}\n`));
  const directory = await mkdtemp(join(resolve(temporaryRoot), `tech-nyu-${service}-`));
  try {
    for (const [name, content] of files) {
      await mkdir(dirname(join(directory, name)), {recursive:true}); await writeFile(join(directory, name), content);
    }
  } catch (error) {await rm(directory, {recursive:true, force:true}); throw error;}
  return {directory, files:[...files.keys()].sort(), dependencies};
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {console.log(JSON.stringify(await prepareRuntimeDeployment({service:process.argv[2] || 'web'})));}
  catch {console.error('{"status":"failed","code":"deployment_preparation_failed"}'); process.exitCode = 1;}
}
