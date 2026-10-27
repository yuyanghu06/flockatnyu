import { execFileSync } from 'node:child_process';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { prepareRuntimeDeployment } from './prepare-runtime-deploy.mjs';
import { prepareDiscordDeployment } from './prepare-discord-deploy.mjs';
import { prepareGmailDeployment } from './prepare-gmail-deploy.mjs';
import { prepareGmailEnrichmentDeployment } from './prepare-gmail-enrichment-deploy.mjs';

if (execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim()) {
  throw new Error('Release packages require a clean checkout of the checked commit.');
}
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const output = 'build/release';
await mkdir(output, { recursive: true });
const services = {
  web: () => prepareRuntimeDeployment({ service: 'web' }),
  'agent-worker': () => prepareRuntimeDeployment({ service: 'agent-worker' }),
  'discord-events': () => prepareDiscordDeployment(),
  'gmail-events': () => prepareGmailDeployment(),
  'gmail-enrichment': () => prepareGmailEnrichmentDeployment(),
};
const packages = [];
for (const [service, prepare] of Object.entries(services)) {
  const result = await prepare();
  const archive = `${service}-${commit}.tar.gz`;
  try {
    execFileSync('tar', ['-czf', `${output}/${archive}`, '-C', result.directory, '.']);
    packages.push({ service, archive, files: result.files.length });
  } finally {
    await rm(result.directory, { recursive: true, force: true });
  }
}
await writeFile(`${output}/manifest.json`, JSON.stringify({ commit, packages }, null, 2) + '\n');
console.log(`Prepared ${packages.length} source-only release packages for ${commit}.`);
