import {lstat, mkdir, mkdtemp, readdir, copyFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Build a fresh allowlisted context; reject symlinks instead of following them. */
export async function prepareDiscordDeployment({root = repository, temporaryRoot = tmpdir()} = {}) {
  const inputs = ['package.json', 'package-lock.json', 'tools/check-api.mjs', 'deployment/discord-worker/Dockerfile'];
  async function backend(directory, relative = 'server') {
    const entries = await readdir(directory, {withFileTypes:true});
    for (const entry of entries) {
      const name = join(relative, entry.name), path = join(root, name);
      if (entry.isSymbolicLink()) throw new Error('deployment_symlink_denied');
      if (entry.isDirectory()) await backend(path, name);
      else if (entry.isFile() && entry.name.endsWith('.js')) inputs.push(name);
    }
  }
  if (!(await lstat(join(root, 'server'))).isDirectory() || (await lstat(join(root, 'server'))).isSymbolicLink()) throw new Error('deployment_input_invalid');
  await backend(join(root, 'server'));
  for (const name of inputs) {
    const stat = await lstat(join(root, name));
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('deployment_input_invalid');
  }
  const directory = await mkdtemp(join(temporaryRoot, 'tech-nyu-discord-'));
  for (const name of inputs) {
    const target = name === 'deployment/discord-worker/Dockerfile' ? 'Dockerfile' : name;
    await mkdir(dirname(join(directory, target)), {recursive:true});
    await copyFile(join(root, name), join(directory, target));
  }
  return {directory, files:inputs.length};
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { console.log(JSON.stringify(await prepareDiscordDeployment())); }
  catch { console.error(JSON.stringify({status:'failed',code:'deployment_preparation_failed'})); process.exitCode = 1; }
}
