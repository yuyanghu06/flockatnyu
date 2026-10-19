import {WebSocketManager, WebSocketShardEvents} from '@discordjs/ws';
import {REST} from '@discordjs/rest';

const metadataEvents=new Set(['CHANNEL_CREATE','CHANNEL_UPDATE','CHANNEL_DELETE','THREAD_CREATE','THREAD_UPDATE','THREAD_DELETE']);
const messageEvents=new Set(['MESSAGE_CREATE','MESSAGE_UPDATE','MESSAGE_DELETE','MESSAGE_DELETE_BULK']);
function validSession(value) {
  if(!value||typeof value.sessionId!=='string'||value.sessionId.length>200||!Number.isSafeInteger(value.sequence)||value.sequence<0||value.shardId!==0||value.shardCount!==1)return false;
  try {const u=new URL(value.resumeURL);return u.protocol==='wss:'&&(u.hostname==='gateway.discord.gg'||/^gateway-[a-z0-9-]+\.discord\.gg$/.test(u.hostname))&&!u.username&&!u.password;}catch{return false;}
}

/** Gateway SDK owns heartbeat/reconnect; we persist only the sequence whose
 * queued events have reached Supabase. Restart replay is deduplicated by UUID. */
export async function createDiscordGateway({config,listener,state,refreshMetadata,signal,onDispatch,
  createManager=options=>new WebSocketManager(options),createRest=token=>new REST({version:'10',timeout:15000,retries:2}).setToken(token),
  log=()=>{},onFailure=()=>{}}={}) {
  let checkpoint=await state.load(signal), latest=null, connected=false, failed=false, stopping=false, pending=0;
  if(checkpoint!==null&&(!checkpoint||!validSession(checkpoint.session)))throw new Error('invalid_checkpoint');
  latest=checkpoint?.session??null;
  const sessions=new Map(latest?[[0,latest]]:[]);
  const manager=createManager({token:config.botToken,rest:createRest(config.botToken),intents:1|512|32768,
    shardCount:1,shardIds:[0],compression:null,
    retrieveSessionInfo:id=>sessions.get(id)??null,
    updateSessionInfo:(id,info)=>{if(info){if(!validSession(info))throw new Error('invalid_gateway_session');sessions.set(id,info);}else{sessions.delete(id);if(!stopping&&!failed)log({status:'session_reset',coverage:'possible_gap_no_backfill'});}}});
  let work=Promise.resolve();
  // Normal close1000/1001 invalidates Discord's session. The SDK's resumable
  // close4200 preserves it while this process exits; restart uses durable state.
  const closeOptions={code:4200,reason:'collector_restart'};
  const fatal=()=>{if(failed||stopping)return;failed=true;connected=false;log({status:'collector_failed'});void manager.destroy(closeOptions).catch(()=>{});onFailure();};
  manager.on(WebSocketShardEvents.Error,fatal);
  manager.on(WebSocketShardEvents.Closed,code=>{connected=false;log({status:'gateway_closed',code:Number.isInteger(code)?code:0});});
  manager.on(WebSocketShardEvents.Ready,()=>{connected=true;log({status:'gateway_ready'});});
  manager.on(WebSocketShardEvents.Resumed,()=>{connected=true;log({status:'gateway_resumed'});});
  manager.on(WebSocketShardEvents.Dispatch,(event,shardId)=>{
    if(failed||stopping||shardId!==0)return;
    // Interaction work has its own limits/cancellation and cannot hold the
    // durable ingestion frontier behind model or delivery latency.
    if(onDispatch && event.t==='MESSAGE_CREATE') {
      void Promise.resolve().then(()=>onDispatch(event)).catch(()=>log({status:'discord_chat_dispatch_failed'}));
    }
    if(++pending>config.maxPending){fatal();return;}
    const session=sessions.get(0), snapshot=session?{...session,sequence:event.s}:null;
    work=work.then(async()=>{
      if(failed||stopping)return;
      let result;
      if(messageEvents.has(event.t))result=await listener.handle({...event,signal});
      else if(metadataEvents.has(event.t)&&event.d?.guild_id===config.guildId)await refreshMetadata({signal});
      if(failed||stopping)return;
      // Even an ignored Dispatch advances the consumed frontier, after all
      // prior source writes drain. Quiet guilds must not retain a pre-bootstrap
      // or pre-RESUMED sequence indefinitely. Only session metadata is stored.
      if(snapshot) {
        if(!validSession(snapshot))throw new Error('invalid_gateway_session');
        const next={session:snapshot};await state.save(checkpoint,next,signal);checkpoint=next;
      }
      if(result?.status==='queued')log({status:'event_queued'});
    }).catch(fatal).finally(()=>{pending--;});
  });
  return Object.freeze({
    async start(){if(signal?.aborted)throw new Error('aborted');await manager.connect();},
    status:()=>({status:failed?'failed':connected?'ready':'connecting',pending}),
    async drain(){await work;},
    async stop(){stopping=true;connected=false;await manager.destroy(closeOptions);await work.catch(()=>{});},
  });
}
