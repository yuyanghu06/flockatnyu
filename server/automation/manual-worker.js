import {sanitizeManualRunResult} from './manual-runs.js';

// One durable request runs one ordinary bounded cycle. The database runner lease
// remains the sole source of model/write authority across every worker process.
export function createManualRunDispatcher({store,createRuntime,env=process.env,fetchImpl=globalThis.fetch,now}={}) {
  let running=false;
  return Object.freeze({async tick({signal}={}){
    if(running)return {status:'manual_busy',reserved:true};
    running=true;let reserved=false;
    try{
      const request=await store.claim({signal});
      if(request.status==='empty')return {status:'no_manual_request',reserved:false};
      if(request.status==='busy')return {status:'manual_busy',reserved:true};
      if(request.status!=='ready')return {status:'manual_unavailable',reserved:false};
      reserved=true;
      let result;
      try{
        const runtime=await createRuntime({env,fetchImpl,now,manual:{channelIds:request.channelIds,force:true}});
        result=runtime.status==='ready'?await runtime.handler.tick({signal}):{status:runtime.status};
      }catch{result={status:signal?.aborted?'aborted':'unavailable'};}
      const ownership={runId:request.runId,requestToken:request.requestToken};
      if(result.status==='busy'||result.status==='aborted'||signal?.aborted){
        // Use a fresh bounded transport signal during shutdown to checkpoint the
        // request. It does not extend or release the separate processing lease.
        const saved=await store.requeue(ownership);
        return {status:saved.status==='ready'?'manual_requeued':'manual_unavailable',runId:request.runId,reserved:true};
      }
      const safe=sanitizeManualRunResult(result),saved=await store.finish({...ownership,result:safe});
      return {status:saved.status==='ready'?'manual_finished':'manual_unavailable',runId:request.runId,result:safe,reserved:true};
    }catch{return {status:'manual_unavailable',reserved};}
    finally{running=false;}
  }});
}
