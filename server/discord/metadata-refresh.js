import {setTimeout as delay} from 'node:timers/promises';
import {runDiscordDiscovery} from './discovery.js';
import {collectorErrorFields} from './collector-diagnostics.js';

const fail=()=>{throw new Error('metadata_refresh_failed');};
const cancelled=signal=>{if(signal?.aborted)fail();};
// Continue only a currently authorized generation. Publishing readability remains
// exclusively the existing guarded completeDiscovery RPC's responsibility.
export function createDiscordMetadataRefresh({config,store,client,signal,discover=runDiscordDiscovery,wait=delay}={}) {
  const retryMs=5000,failureMs=60000,maxAttempts=3;
  let pending,nextDelay=retryMs;
  async function checkpoint(currentSignal) {
    cancelled(currentSignal);
    const [p,s]=await Promise.all([store.getPolicy({guildId:config.guildId,signal:currentSignal}),store.getDiscoveryState({guildId:config.guildId,signal:currentSignal})]);
    cancelled(currentSignal);
    if(p.status!=='ready'||p.policy?.guildId!==config.guildId||!Number.isSafeInteger(p.policy.revision)||p.policy.revision<1
      ||p.policy.paused||p.policy.discoveryEnabled!==true||s.status!=='ready')fail();
    if(s.state&&(s.state.policyRevision!==p.policy.revision||typeof s.state.generation!=='string'
      ||!['channels','active','archives','complete'].includes(s.state.phase)))fail();
    return {revision:p.policy.revision,state:s.state};
  }
  async function run(currentSignal) {
    let incomplete=false;
    try{
      let current=await checkpoint(currentSignal);
      const revision=current.revision;
      let generation=current.state&&current.state.phase!=='complete'?current.state.generation:undefined;
      for(let attempt=0;attempt<maxAttempts;attempt++) {
        if(attempt) {
          await wait(retryMs,undefined,{signal:currentSignal});
          current=await checkpoint(currentSignal);
          if(current.revision!==revision||current.state?.generation!==generation)fail();
          // Another actor may have safely published this same generation while
          // the continuation waited. Never start a fresh generation in its place.
          if(current.state.phase==='complete'){nextDelay=config.metadataRefreshMs;return {status:'ready',complete:true,channels:0};}
        }
        cancelled(currentSignal);
        const result=await discover({config,store,client,signal:currentSignal});
        // Discovery returns safe status codes rather than throwing. Retain only
        // a recognized code, never its result payload or provider details.
        const resultFailure=()=>new Error('metadata_refresh_failed',{cause:{code:collectorErrorFields({code:result?.code}).errorCode}});
        cancelled(currentSignal);
        if(typeof result?.generation!=='string'||generation&&result.generation!==generation)throw resultFailure();
        generation??=result.generation;
        current=await checkpoint(currentSignal);
        if(current.revision!==revision||current.state?.generation!==generation)fail();
        if(current.state.phase==='complete'){nextDelay=config.metadataRefreshMs;return {status:'ready',complete:true,channels:Number.isInteger(result.channels)?result.channels:0};}
        const retryable=result.status==='partial'&&result.code==='budget_exhausted'
          ||['partial','aborted'].includes(result.status)&&result.code==='aborted'&&!currentSignal?.aborted;
        if(!retryable)throw resultFailure();
        incomplete=true;nextDelay=retryMs;
      }
      throw new Error('metadata_refresh_pending');
    }catch(error){
      // Budget exhaustion gets another bounded invocation shortly; terminal
      // errors get a slower retry, never a tight internal retry loop.
      nextDelay=error?.message==='metadata_refresh_pending'&&incomplete?retryMs:failureMs;
      throw new Error(error?.message==='metadata_refresh_pending'?'metadata_refresh_pending':'metadata_refresh_failed',{cause:error});
    }
  }
  return Object.freeze({
    get nextDelayMs(){return nextDelay;},
    async initialDelayMs(){try{const current=await checkpoint(signal);return current.state?.phase==='complete'?config.metadataRefreshMs:retryMs;}catch{return failureMs;}},
    refresh({signal:callerSignal=signal}={}) {
      if(!pending){const currentSignal=AbortSignal.any([signal,callerSignal].filter(Boolean));pending=run(currentSignal).finally(()=>{pending=undefined;});}
      return pending;
    },
  });
}
