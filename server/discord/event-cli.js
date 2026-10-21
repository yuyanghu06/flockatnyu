import {createServer} from 'node:http';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {readDiscordEventConfig} from './event-config.js';
import {createDiscordStore} from './store.js';
import {createDiscordClient} from './client.js';
import {createDiscordMetadataRefresh} from './metadata-refresh.js';
import {createAutomationStore} from '../automation/store.js';
import {createDiscordEventState} from './event-state.js';
import {createDiscordEventListener} from './event-listener.js';
import {createDiscordGateway} from './gateway.js';
import {createDiscordChatTransport} from './chat-runtime.js';
import {logCollectorDiagnostic} from './collector-diagnostics.js';

export function collectorExitCode(status,currentExitCode) {
  return status==='stopped'?(currentExitCode??0):status==='disabled'?0:1;
}

export async function runDiscordEvents({args=process.argv.slice(2),env=process.env,
  write=value=>process.stdout.write(`${JSON.stringify(value)}\n`),createGateway=createDiscordGateway,
  createMetadataRefresh=createDiscordMetadataRefresh,createChatTransport=createDiscordChatTransport,
  createHttpServer=createServer,createState=createDiscordEventState,createListener=createDiscordEventListener}={}) {
  if(args.length!==1||args[0]!=='serve')return {status:'invalid_command'};
  const config=readDiscordEventConfig(env);
  if(!config.enabled)return {status:'disabled'};
  const store=createDiscordStore({env}),inputStore=createAutomationStore({env});
  if(!config.configured||!store.configured||!inputStore.configured)return {status:'not_configured'};
  const port=Number(env.PORT||3003);
  if(!Number.isInteger(port)||port<1||port>65535)return {status:'not_configured'};
  const diagnostic=entry=>logCollectorDiagnostic(write,entry);
  const log=value=>{try{Promise.resolve(write(value)).catch(()=>{});}catch{}};
  diagnostic({status:'collector_starting',stage:'startup',diagnosticsVersion:1});
  const client=createDiscordClient({config}),controller=new AbortController();
  let stopped=false,timer,gateway,server,chat,state,metadataRefresh;
  const refreshMetadata=async options=>{
    const result=await metadataRefresh.refresh(options);
    log({status:'catalogue_refreshed',channels:result.channels});
  };
  async function stop(failed=false,reason='requested'){
    if(stopped)return;stopped=true;clearTimeout(timer);controller.abort();
    if(failed)process.exitCode=1;
    diagnostic({status:'collector_stopping',stage:'shutdown',reason});
    process.removeListener('SIGTERM',onTerm);process.removeListener('SIGINT',onInterrupt);
    await Promise.resolve().then(()=>chat?.stop()).catch(error=>diagnostic({status:'collector_stopping',stage:'chat_shutdown',error,reason}));
    await Promise.resolve().then(()=>gateway?.stop()).catch(error=>diagnostic({status:'collector_stopping',stage:'gateway_shutdown',error,reason}));
    try{server?.close();}catch(error){diagnostic({status:'collector_stopping',stage:'server_shutdown',error,reason});}
    try{server?.closeAllConnections?.();}catch(error){diagnostic({status:'collector_stopping',stage:'server_shutdown',error,reason});}
  }
  const onTerm=()=>{void stop(false,'SIGTERM');},onInterrupt=()=>{void stop(false,'SIGINT');};
  let startupStage='checkpoint_load';
  try {
    state=createState({env});
    startupStage='startup';metadataRefresh=createMetadataRefresh({config,store,client,signal:controller.signal});
    try {chat=await createChatTransport({env,log,signal:controller.signal});}
    catch(error){diagnostic({status:'discord_chat_unavailable',stage:'chat_startup',error});}
    const listener=createListener({config:{...config,ignoredAuthorIds:chat?[chat.botUserId]:[]},store,inputStore,client,refreshMetadata});
    startupStage='gateway_create';
    gateway=await createGateway({config,listener,state,refreshMetadata,signal:controller.signal,log,
      ...(chat?{onDispatch:event=>chat.handle(event)}:{}),onFailure:()=>{void stop(true,'collector_failure');}});
    startupStage='server_startup';
    server=createHttpServer((request,response)=>{
      if(request.method!=='GET'||request.url!=='/healthz'){response.writeHead(404);response.end();return;}
      const health=gateway.status();response.writeHead(health.status==='ready'?200:503,{'content-type':'application/json'});
      response.end(JSON.stringify({service:'discord-events',...health}));
    });
    server.on('error',error=>{diagnostic({status:'server_unavailable',stage:'server_startup',error});void stop(true,'server_failure');});
    server.listen(port,'0.0.0.0');
    process.once('SIGTERM',onTerm);process.once('SIGINT',onInterrupt);
    try {await gateway.start();}catch(error){if(stopped||controller.signal.aborted)return {status:'stopped'};diagnostic({status:'collector_unavailable',stage:'gateway_connect',error});await stop(true,'startup_failure');return {status:'unavailable'};}
    if(stopped||controller.signal.aborted)return {status:'stopped'};
    const tick=async()=>{try{await refreshMetadata();}catch(error){if(!stopped&&!controller.signal.aborted)diagnostic({status:'metadata_refresh_failed',stage:'periodic_metadata_refresh',error});}finally{if(!stopped)timer=setTimeout(tick,metadataRefresh.nextDelayMs);}};
    startupStage='periodic_metadata_refresh';
    const firstRefreshDelay=await metadataRefresh.initialDelayMs();
    if(stopped||controller.signal.aborted)return {status:'stopped'};
    timer=setTimeout(tick,firstRefreshDelay);
    log({status:'listening'});return {status:'listening',stop};
  }catch(error){if(stopped||controller.signal.aborted)return {status:'stopped'};diagnostic({status:'collector_unavailable',stage:startupStage,error});await stop(true,'startup_failure');throw error;}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const diagnostic=entry=>logCollectorDiagnostic(value=>process.stderr.write(`${JSON.stringify(value)}\n`),entry);
  // Monitor only: Node retains its default fatal behavior, including native stderr.
  process.on('uncaughtExceptionMonitor',error=>diagnostic({status:'collector_unavailable',stage:'top_level',error}));
  runDiscordEvents().then(result=>{if(result.status!=='listening'){process.stdout.write(`${JSON.stringify(result)}\n`);process.exitCode=collectorExitCode(result.status,process.exitCode);}})
    .catch(error=>{diagnostic({status:'collector_unavailable',stage:'top_level',error});process.exitCode=1;});
}
