import {copyFile, lstat, mkdir, mkdtemp, readdir, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Only native Node Miro modules enter this service. Credentials, assets and
// unrelated application work never enter the upload context.
export async function prepareMiroDeployment({root = repository, temporaryRoot = tmpdir()} = {}) {
  for (const relative of ['server', 'deployment', 'deployment/miro-worker']) {
    const parent = await lstat(join(root, relative));
    if (!parent.isDirectory() || parent.isSymbolicLink()) throw new Error('deployment_input_invalid');
  }
  const moduleRoot = join(root, 'server/miro');
  const stat = await lstat(moduleRoot);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('deployment_input_invalid');
  const files = [];
  for (const entry of await readdir(moduleRoot, {withFileTypes: true})) {
    if (entry.isSymbolicLink()) throw new Error('deployment_symlink_denied');
    if (entry.isFile() && entry.name.endsWith('.js')) files.push(`server/miro/${entry.name}`);
    else if (entry.name !== 'info.md') throw new Error('deployment_input_invalid');
  }
  if (!files.includes('server/miro/cli.js')) throw new Error('deployment_input_invalid');
  files.sort();
  const docker = 'deployment/miro-worker/Dockerfile';
  for (const name of [...files, docker]) {
    const current = await lstat(join(root, name));
    if (!current.isFile() || current.isSymbolicLink()) throw new Error('deployment_input_invalid');
  }
  const directory = await mkdtemp(join(temporaryRoot, 'tech-nyu-miro-'));
  for (const name of [...files, docker]) {
    const target = join(directory, name === docker ? 'Dockerfile' : name);
    await mkdir(dirname(target), {recursive: true});
    await copyFile(join(root, name), target);
  }
  await writeFile(join(directory, 'package.json'), JSON.stringify({name: 'tech-nyu-miro-sync', private: true, type: 'module', engines: {node: '>=22.12.0'}}) + '\n');
  return {directory, files: [...files, 'Dockerfile', 'package.json']};
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { console.log(JSON.stringify(await prepareMiroDeployment())); }
  catch { console.error(JSON.stringify({status: 'failed', code: 'deployment_preparation_failed'})); process.exitCode = 1; }
}
