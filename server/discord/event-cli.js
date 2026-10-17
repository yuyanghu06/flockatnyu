import {createServer} from 'node:http';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {readDiscordEventConfig} from './event-config.js';
import {createDiscordStore} from './store.js';
import {createDiscordClient} from './client.js';
import {runDiscordDiscovery} from './discovery.js';
import {createAutomationStore} from '../automation/store.js';
import {createDiscordEventState} from './event-state.js';
import {createDiscordEventListener} from './event-listener.js';
import {createDiscordGateway} from './gateway.js';

export async function runDiscordEvents({args=process.argv.slice(2),env=process.env,
  write=value=>process.stdout.write(`${JSON.stringify(value)}\n`),createGateway=createDiscordGateway}={}) {
  if(args.length!==1||args[0]!=='serve')return {status:'invalid_command'};
  const config=readDiscordEventConfig(env);
  if(!config.enabled)return {status:'disabled'};
  const store=createDiscordStore({env}),inputStore=createAutomationStore({env});
  if(!config.configured||!store.configured||!inputStore.configured)return {status:'not_configured'};
  const port=Number(env.PORT||3003);
  if(!Number.isInteger(port)||port<1||port>65535)return {status:'not_configured'};
  const client=createDiscordClient({config}),state=createDiscordEventState({env}),controller=new AbortController();
  let refreshing,stopped=false,timer,gateway,server;
  const refreshMetadata=({signal=controller.signal}={})=>{
    if(!refreshing)refreshing=runDiscordDiscovery({config,store,client,signal}).then(result=>{
      if(result.status!=='ready'||!result.complete)throw new Error('metadata_refresh_failed');
      write({status:'catalogue_refreshed',channels:result.channels});
    }).finally(()=>{refreshing=null;});
    return refreshing;
  };
  async function stop(failed=false){
    if(stopped)return;stopped=true;clearTimeout(timer);controller.abort();
    process.removeListener('SIGTERM',onStop);process.removeListener('SIGINT',onStop);
    await gateway?.stop().catch(()=>{});server?.close();server?.closeAllConnections?.();
    if(failed)process.exitCode=1;
  }
  const onStop=()=>{void stop();};
  const listener=createDiscordEventListener({config,store,inputStore,client,refreshMetadata});
  gateway=await createGateway({config,listener,state,refreshMetadata,signal:controller.signal,log:write,onFailure:()=>{void stop(true);}});
  server=createServer((request,response)=>{
    if(request.method!=='GET'||request.url!=='/healthz'){response.writeHead(404);response.end();return;}
    const health=gateway.status();response.writeHead(health.status==='ready'?200:503,{'content-type':'application/json'});
    response.end(JSON.stringify({service:'discord-events',...health}));
  });
  server.on('error',()=>{write({status:'server_unavailable'});void stop(true);});
  server.listen(port,'0.0.0.0');
  process.once('SIGTERM',onStop);process.once('SIGINT',onStop);
  try {await gateway.start();}catch{await stop(true);return {status:'unavailable'};}
  const tick=async()=>{try{await refreshMetadata();}catch{write({status:'metadata_refresh_failed'});}finally{if(!stopped)timer=setTimeout(tick,config.metadataRefreshMs);}};
  timer=setTimeout(tick,config.metadataRefreshMs);
  write({status:'listening'});return {status:'listening',stop};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  runDiscordEvents().then(result=>{if(result.status!=='listening'){process.stdout.write(`${JSON.stringify(result)}\n`);process.exitCode=result.status==='disabled'?0:1;}})
    .catch(()=>{process.stderr.write('{"status":"collector_unavailable"}\n');process.exitCode=1;});
}
