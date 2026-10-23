import {WebSocketManager, WebSocketShardEvents} from '@discordjs/ws';
import {REST} from '@discordjs/rest';
import {logCollectorDiagnostic} from './collector-diagnostics.js';

const metadataEvents=new Set(['CHANNEL_CREATE','CHANNEL_UPDATE','CHANNEL_DELETE','THREAD_CREATE','THREAD_UPDATE','THREAD_DELETE']);
const messageEvents=new Set(['MESSAGE_CREATE','MESSAGE_UPDATE','MESSAGE_DELETE','MESSAGE_DELETE_BULK']);
function validSession(value) {
  if(!value||typeof value.sessionId!=='string'||value.sessionId.length>200||!Number.isSafeInteger(value.sequence)||value.sequence<0||value.shardId!==0||value.shardCount!==1)return false;
  try {const u=new URL(value.resumeURL);return u.protocol==='wss:'&&(u.hostname==='gateway.discord.gg'||/^gateway-[a-z0-9-]+\.discord\.gg$/.test(u.hostname))&&!u.username&&!u.password;}catch{return false;}
}

/** Gateway SDK owns heartbeat/reconnect; we persist only the sequence whose
 * queued events have reached Supabase. Restart replay is deduplicated by UUID. */
export async function createDiscordGateway({config,listener,state,refreshMetadata,reconcileMetadata,signal,onDispatch,
  createManager=options=>new WebSocketManager(options),createRest=token=>new REST({version:'10',timeout:15000,retries:2}).setToken(token),
  log=()=>{},onFailure=()=>{}}={}) {
  const diagnostic=entry=>logCollectorDiagnostic(log,entry);
  let checkpoint,latest=null,connected=false,failed=false,stopping=false,pending=0;
  try {checkpoint=await state.load(signal);}catch(error){diagnostic({status:'collector_failed',stage:'checkpoint_load',error});throw error;}
  if(checkpoint!==null&&(!checkpoint||!validSession(checkpoint.session))){const error=new Error('invalid_checkpoint');diagnostic({status:'collector_failed',stage:'checkpoint_validate',error});throw error;}
  latest=checkpoint?.session??null;
  const sessions=new Map(latest?[[0,latest]]:[]);
  let manager;
  try {manager=createManager({token:config.botToken,rest:createRest(config.botToken),intents:1|512|32768,
    shardCount:1,shardIds:[0],compression:null,
    retrieveSessionInfo:id=>sessions.get(id)??null,
    updateSessionInfo:(id,info)=>{if(info){if(!validSession(info)){const error=new Error('invalid_gateway_session');diagnostic({status:'collector_failed',stage:'gateway_session',error,shardId:id});throw error;}sessions.set(id,info);}else{sessions.delete(id);if(!stopping&&!failed)diagnostic({status:'session_reset',stage:'gateway_session',coverage:'possible_gap_no_backfill'});}}});
  }catch(error){diagnostic({status:'collector_failed',stage:'gateway_create',error});throw error;}
  let work=Promise.resolve();
  // Normal close1000/1001 invalidates Discord's session. The SDK's resumable
  // close4200 preserves it while this process exits; restart uses durable state.
  const closeOptions={code:4200,reason:'collector_restart'};
  const fatal=(error,stage,fields={})=>{
    if(failed||stopping||signal?.aborted)return;failed=true;connected=false;
    diagnostic({status:'collector_failed',stage,error,pending,maxPending:config.maxPending,...fields});
    try {void Promise.resolve(manager.destroy(closeOptions)).catch(()=>{});}finally {onFailure();}
  };
  manager.on(WebSocketShardEvents.Error,(error,shardId)=>fatal(error,'gateway_sdk',{shardId}));
  manager.on(WebSocketShardEvents.SocketError,(error,shardId)=>diagnostic({status:'gateway_socket_error',stage:'gateway_socket',error,shardId}));
  manager.on(WebSocketShardEvents.Closed,(code,shardId)=>{connected=false;diagnostic({status:'gateway_closed',stage:'gateway_closed',code:Number.isInteger(code)?code:0,shardId});});
  manager.on(WebSocketShardEvents.Ready,()=>{connected=true;diagnostic({status:'gateway_ready',stage:'gateway_connect'});});
  manager.on(WebSocketShardEvents.Resumed,()=>{connected=true;diagnostic({status:'gateway_resumed',stage:'gateway_connect'});});
  manager.on(WebSocketShardEvents.Dispatch,(event,shardId)=>{
    if(failed||stopping||signal?.aborted||shardId!==0)return;
    // Interaction work has its own limits/cancellation and cannot hold the
    // durable ingestion frontier behind model or delivery latency.
    if(onDispatch && event.t==='MESSAGE_CREATE') {
      void Promise.resolve().then(()=>onDispatch(event)).catch(error=>diagnostic({status:'discord_chat_dispatch_failed',stage:'chat_dispatch',error}));
    }
    if(++pending>config.maxPending){fatal(new Error('queue_overflow'),'queue_overflow',{eventType:event.t});return;}
    const session=sessions.get(0), snapshot=session?{...session,sequence:event.s}:null;
    let stage='event_ingestion';
    work=work.then(async()=>{
      if(failed||stopping||signal?.aborted)return;
      let result;
      if(messageEvents.has(event.t))result=await listener.handle({...event,signal});
      else if(metadataEvents.has(event.t)&&event.d?.guild_id===config.guildId){stage='event_metadata_refresh';if(reconcileMetadata)await reconcileMetadata({channelId:event.d.id,eventType:event.t,signal});else await refreshMetadata({signal});}
      if(failed||stopping||signal?.aborted)return;
      // Even an ignored Dispatch advances the consumed frontier, after all
      // prior source writes drain. Quiet guilds must not retain a pre-bootstrap
      // or pre-RESUMED sequence indefinitely. Only session metadata is stored.
      if(snapshot) {
        stage='checkpoint_validate';
        if(!validSession(snapshot))throw new Error('invalid_gateway_session');
        const next={session:snapshot};stage='checkpoint_save';await state.save(checkpoint,next,signal);checkpoint=next;
      }
      if(result?.status==='queued')diagnostic({status:'event_queued',stage:'event_ingestion'});
    }).catch(error=>fatal(error,stage,{eventType:event.t})).finally(()=>{pending--;});
  });
  return Object.freeze({
    async start(){try{if(signal?.aborted)throw new Error('aborted');await manager.connect();}catch(error){if(!signal?.aborted)diagnostic({status:'collector_failed',stage:'gateway_connect',error});throw error;}},
    status:()=>({status:failed?'failed':connected?'ready':'connecting',pending}),
    async drain(){await work;},
    async stop(){stopping=true;connected=false;await manager.destroy(closeOptions);await work.catch(()=>{});},
  });
}
