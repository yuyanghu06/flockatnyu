import {pathToFileURL} from 'node:url';
import {readMiroConfig} from './config.js';
import {createMiroStore} from './store.js';
import {preflightMiro, runMiroSync} from './sync.js';
export async function runMiroCli({args = process.argv.slice(2),env = process.env,signal,write = value => console.log(JSON.stringify(value)),...overrides} = {}) {
  const [command = 'scheduled', ...rest] = args;
  if (rest.length || !['scheduled','sync','preflight'].includes(command)) { write({status:'invalid_command',commands:['scheduled','sync','preflight']}); return 2; }
  const config = readMiroConfig(env), store = createMiroStore({env});
  try {
    const result = command === 'preflight' ? await preflightMiro({config,store,signal,...overrides}) : await runMiroSync({config,store,mode:command,signal,log:write,...overrides});
    write(result);
    return ['ready','disabled','outside_schedule'].includes(result.status) ? 0 : 1;
  } catch { write({status:signal?.aborted ? 'aborted' : 'failed'}); return 1; }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const controller = new AbortController();
  const stop = () => controller.abort();
  process.once('SIGTERM',stop); process.once('SIGINT',stop);
  process.exitCode = await runMiroCli({signal:controller.signal});
  process.removeListener('SIGTERM',stop); process.removeListener('SIGINT',stop);
}
