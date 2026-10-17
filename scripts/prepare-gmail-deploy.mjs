import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {prepareCollectorDeployment} from './prepare-discord-deploy.mjs';

export function prepareGmailDeployment(options = {}) {
  return prepareCollectorDeployment({...options, service: 'gmail-events', entrypoint: 'server/google/subscription-cli.js',
    moduleRoots: ['server/google', 'server/automation'],
    dependencies: {'@hono/node-server': '2.1.4', 'google-auth-library': '11.3.0', hono: '4.13.13'}});
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { console.log(JSON.stringify(await prepareGmailDeployment())); }
  catch { console.error(JSON.stringify({status: 'failed', code: 'deployment_preparation_failed'})); process.exitCode = 1; }
}
