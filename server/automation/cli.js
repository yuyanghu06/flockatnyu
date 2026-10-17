import {pathToFileURL,fileURLToPath} from 'node:url';
import {resolve,isAbsolute} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {readConfig} from '../config.js';
import {createProvider} from '../providers/index.js';
import {readAutomationConfig} from './config.js';
import {createAutomationStore} from './store.js';
import {createAutomationHandler} from './handler.js';
import {createEventUpdater} from './events.js';

// This explicit module is trusted server code, never an event-supplied URL.
export async function createAutomationRuntime({env=process.env,fetchImpl=globalThis.fetch,loadModule=url=>import(url),now}={}) {
  const config=readAutomationConfig(env);
  if(!config.enabled) return {status:'disabled',config};
  const modulePath=config.adapterModule;
  if(!modulePath||(!isAbsolute(modulePath)&&!modulePath.startsWith('./')&&!modulePath.startsWith('../'))||! /\.(mjs|js)$/.test(modulePath)||modulePath.includes('\0')) return {status:'not_configured',config};
  const store=createAutomationStore({env,fetchImpl});
  const modelConfig=readConfig(env);
  if(!store.configured||!modelConfig.configured) return {status:'not_configured',config};
  const provider=createProvider(modelConfig,{fetchImpl});
  let adapters;
  try {
    const module=await loadModule(pathToFileURL(resolve(modulePath)).href);
    if(typeof module.createAutomationAdapters!=='function') return {status:'not_configured',config};
    adapters=await module.createAutomationAdapters({env,config,store,provider});
  } catch { return {status:'not_configured',config}; }
  if(!adapters?.principal||!Array.isArray(adapters.tools)||!adapters.tools.length||typeof adapters.authorizeEvent!=='function') return {status:'not_configured',config};
  const handler=createAutomationHandler({store,provider,config,now,...adapters});
  const updater=createEventUpdater({store,config,now,...adapters,onEnqueued:()=>handler.tick()});
  return {status:'ready',config,store,handler,updater};
}
export async function main({args=process.argv.slice(2),env=process.env,signal,write=value=>process.stdout.write(`${JSON.stringify(value)}\n`),...dependencies}={}) {
  const mode=args[0]||'once';
  if(!['once','serve'].includes(mode)||args.length>1) {write({status:'invalid_command'});return 1;}
  let runtime;
  try {runtime=await createAutomationRuntime({env,...dependencies});} catch {write({status:'invalid_config'});return 1;}
  if(runtime.status!=='ready') {write({status:runtime.status});return runtime.status==='disabled'?0:1;}
  do {
    if(signal?.aborted) break;
    const result=await runtime.handler.tick({signal});
    // Status/counts only: neither source payloads nor provider errors are logged.
    write(result);
    if(mode==='once') return ['completed','empty','waiting','cooldown','busy'].includes(result.status)?0:1;
    try {await delay(runtime.config.pollMs,undefined,{signal});} catch {break;}
  } while(!signal?.aborted);
  return 0;
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1])) {
  const controller=new AbortController();
  process.once('SIGTERM',()=>controller.abort());process.once('SIGINT',()=>controller.abort());
  main({signal:controller.signal}).then(code=>{process.exitCode=code;}).catch(()=>{process.stderr.write('automation_unavailable\n');process.exitCode=1;});
}
