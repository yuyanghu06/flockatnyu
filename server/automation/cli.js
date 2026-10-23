import {pathToFileURL,fileURLToPath} from 'node:url';
import {resolve,isAbsolute} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {readConfig} from '../config.js';
import {createProvider} from '../providers/index.js';
import {createAuditLogger} from '../model-audit.js';
import {startAuditMaintenance} from '../audit-lifecycle.js';
import {readAutomationConfig} from './config.js';
import {createAutomationStore} from './store.js';
import {createAutomationHandler} from './handler.js';
import {createEventUpdater} from './events.js';
import {plainObject} from './validation.js';
import {createManualRunStore,validateManualRunInput} from './manual-runs.js';
import {createManualRunDispatcher} from './manual-worker.js';

// This explicit module is trusted server code, never an event-supplied URL.
export async function createAutomationRuntime({env=process.env,fetchImpl=globalThis.fetch,loadModule=url=>import(url),now,onProgress,manual,audit=createAuditLogger({env,fetchImpl})}={}) {
  const config=readAutomationConfig(env);
  if(!config.enabled) return {status:'disabled',config};
  const modulePath=config.adapterModule;
  if(manual!==undefined&&(!plainObject(manual)||manual.force!==true||Object.keys(manual).some(key=>!['channelIds','force'].includes(key))||!validateManualRunInput({channelIds:manual.channelIds})||modulePath))return {status:'not_configured',config};
  if(modulePath&&((!isAbsolute(modulePath)&&!modulePath.startsWith('./')&&!modulePath.startsWith('../'))||! /\.(mjs|js)$/.test(modulePath)||modulePath.includes('\0'))) return {status:'not_configured',config};
  const ordinaryStore=createAutomationStore({env,fetchImpl});
  const store=manual?Object.freeze({...ordinaryStore,claim:ordinaryStore.claimForced}):ordinaryStore;
  const modelConfig=readConfig(env);
  if(!store.configured||!modelConfig.configured) return {status:'not_configured',config};
  const provider=createProvider(modelConfig,{fetchImpl,audit});
  let adapters;
  try {
    const module=modulePath?await loadModule(pathToFileURL(resolve(modulePath)).href):await import('./adapters.js');
    if(typeof module.createAutomationAdapters!=='function') return {status:'not_configured',config};
    adapters=await module.createAutomationAdapters({env,config,store,provider,fetchImpl,now,...(manual?{manual}:{} )});
  } catch { return {status:'not_configured',config}; }
  if(!adapters?.principal||!Array.isArray(adapters.tools)||!adapters.tools.length||typeof adapters.authorizeEvent!=='function') return {status:'not_configured',config};
  const handler=createAutomationHandler({store,provider,config,now,...adapters,onProgress,audit});
  const updater=createEventUpdater({store,config,now,...adapters,onEnqueued:()=>handler.tick()});
  if(!manual)startAuditMaintenance(audit);
  return {status:'ready',config,store,handler,updater,audit};
}
export async function main({args=process.argv.slice(2),env=process.env,signal,write=value=>process.stdout.write(`${JSON.stringify(value)}\n`),...dependencies}={}) {
  const mode=args[0]||'once';
  if(!['once','serve'].includes(mode)||args.length>1) {write({status:'invalid_command'});return 1;}
  let runtime;
  try {runtime=await createAutomationRuntime({env,...dependencies,...(env.AGENT_AUTOMATION_LOG_PROGRESS==='true'?{onProgress:event=>write({kind:'agent_progress',...event})}:{})});} catch {write({status:'invalid_config'});return 1;}
  if(runtime.status!=='ready') {write({status:runtime.status});return runtime.status==='disabled'?0:1;}
  const manualDispatcher=mode==='serve'?createManualRunDispatcher({store:createManualRunStore({env,fetchImpl:dependencies.fetchImpl}),createRuntime:options=>createAutomationRuntime({...dependencies,...options,audit:runtime.audit,...(env.AGENT_AUTOMATION_LOG_PROGRESS==='true'?{onProgress:event=>write({kind:'agent_progress',...event})}:{})}),env,fetchImpl:dependencies.fetchImpl,now:dependencies.now}):null;
  do {
    if(signal?.aborted) break;
    const manualResult=manualDispatcher?await manualDispatcher.tick({signal}):null;
    if(manualResult&&manualResult.status!=='no_manual_request')write({kind:'manual_planner',...manualResult});
    const result=manualResult?.reserved?null:await runtime.handler.tick({signal});
    // Status/counts only: neither source payloads nor provider errors are logged.
    if(result)write(result);
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
