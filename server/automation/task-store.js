import {plainObject,validUuid} from './validation.js';

const MAX_TASK_BYTES=262144;
// A complete 200-task snapshot can contain 50 MiB; never silently paginate or truncate it.
const MAX_RESPONSE_BYTES=54*1024*1024;
const statuses=new Set(['ready','pending','conflict','capacity','expired','stale','forbidden','invalid_request']);
const validScope=ids=>Array.isArray(ids)&&ids.length<=500&&ids.every(validUuid)
  &&new Set(ids.map(id=>id.toLowerCase())).size===ids.length;
const timestamp=value=>typeof value==='string'&&value.length<=64&&Number.isFinite(Date.parse(value));
function validInfo(info) {
  try {
    return plainObject(info)&&validScope(info.sourceIds)&&info.sourceIds.length>0
      &&Buffer.byteLength(JSON.stringify(info))<=MAX_TASK_BYTES;
  } catch { return false; }
}
const scoped=(info,ids)=>info.sourceIds.every(id=>ids.some(allowed=>allowed.toLowerCase()===id.toLowerCase()));
function validTask(task,ids) {
  return plainObject(task)&&validUuid(task.uuid)&&validInfo(task.info)&&scoped(task.info,ids)
    &&timestamp(task.created_at)&&timestamp(task.updated_at)&&timestamp(task.expires_at)
    &&Date.parse(task.updated_at)>=Date.parse(task.created_at)
    &&Date.parse(task.expires_at)>Date.parse(task.created_at)
    &&Date.parse(task.expires_at)<=Date.parse(task.created_at)+86400000;
}

// Trusted worker persistence only. Never register this store as a public/chat tool.
// SourceIds/context are supplied by the worker, not model-authored authorization.
export function createPendingTaskStore({env=process.env,fetchImpl=globalThis.fetch}={}) {
  let base;
  try {
    const url=new URL(env.SUPABASE_URL);
    if ((url.protocol==='https:'||url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname))
      &&!url.username&&!url.password&&!url.search&&!url.hash&&['','/'].includes(url.pathname)) base=url.origin;
  } catch { /* Invalid origins are never fetched. */ }
  const key=(env.SUPABASE_SERVICE_ROLE_KEY||'').trim();
  const configured=Boolean(base&&key&&!/[\r\n]/.test(key)&&typeof fetchImpl==='function');
  async function rpc(name,args,signal) {
    if(!configured)return {status:'not_configured'};
    if(signal?.aborted)return {status:'aborted'};
    let reader;
    const combined=AbortSignal.any([signal,AbortSignal.timeout(15000)].filter(Boolean));
    const cancel=()=>{void reader?.cancel().catch(()=>{});};
    combined.addEventListener('abort',cancel,{once:true});
    try {
      const response=await fetchImpl(`${base}/rest/v1/rpc/agent_pending_task_${name}`,{
        method:'POST',redirect:'error',signal:combined,
        headers:{apikey:key,authorization:`Bearer ${key}`,'content-type':'application/json'},body:JSON.stringify(args),
      });
      if(!response.ok||!response.body){await response.body?.cancel();return {status:[401,403].includes(response.status)?'forbidden':'unavailable'};}
      reader=response.body.getReader();const chunks=[];let bytes=0;
      while(true){
        if(combined.aborted)throw Error('aborted');
        const {value,done}=await reader.read();if(combined.aborted)throw Error('aborted');if(done)break;
        bytes+=value.byteLength;if(bytes>MAX_RESPONSE_BYTES)throw Error('response_too_large');chunks.push(value);
      }
      const data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));
      return plainObject(data)&&statuses.has(data.status)?data:{status:'unavailable'};
    }catch{return {status:signal?.aborted?'aborted':'unavailable'};}
    finally{combined.removeEventListener('abort',cancel);if(reader){await reader.cancel().catch(()=>{});reader.releaseLock();}}
  }
  return Object.freeze({configured,
    async list({leaseToken,allowedSourceIds,signal}={}) {
      if(!validScope(allowedSourceIds)||allowedSourceIds.length>0&&!validUuid(leaseToken))return {status:'invalid_request'};
      const result=await rpc('list',{p_token:validUuid(leaseToken)?leaseToken:null,p_allowed_source_ids:[...allowedSourceIds]},signal);
      if(result.status!=='ready')return {status:result.status};
      if(!Array.isArray(result.tasks)||result.tasks.length>200||result.tasks.some(task=>!validTask(task,allowedSourceIds))
        ||new Set(result.tasks.map(task=>task.uuid.toLowerCase())).size!==result.tasks.length)return {status:'unavailable'};
      return {status:'ready',tasks:result.tasks};
    },
    async save({leaseToken,allowedSourceIds,task,expectedUpdatedAt,signal}={}) {
      if(!validUuid(leaseToken)||!validScope(allowedSourceIds)||!allowedSourceIds.length||!plainObject(task)
        ||!validUuid(task.uuid)||!validInfo(task.info)||!scoped(task.info,allowedSourceIds)
        ||expectedUpdatedAt!==undefined&&!timestamp(expectedUpdatedAt)
        ||task.expires_at!==undefined&&!timestamp(task.expires_at))return {status:'invalid_request'};
      const result=await rpc('save',{p_token:leaseToken,p_allowed_source_ids:[...allowedSourceIds],p_task_id:task.uuid,p_info:task.info,
        p_expected_updated_at:expectedUpdatedAt??null,p_expires_at:task.expires_at??null},signal);
      if(result.status!=='ready')return {status:result.status};
      return validTask(result.task,allowedSourceIds)&&result.task.uuid.toLowerCase()===task.uuid.toLowerCase()
        ?{status:'ready',task:result.task}:{status:'unavailable'};
    },
    async resolve({leaseToken,allowedSourceIds,taskId,expectedUpdatedAt,signal}={}) {
      if(!validUuid(leaseToken)||!validScope(allowedSourceIds)||!allowedSourceIds.length||!validUuid(taskId)
        ||!timestamp(expectedUpdatedAt))return {status:'invalid_request'};
      const result=await rpc('resolve',{p_token:leaseToken,p_allowed_source_ids:[...allowedSourceIds],p_task_id:taskId,p_expected_updated_at:expectedUpdatedAt},signal);
      return {status:result.status};
    },
    async prune({signal}={}) {
      const result=await rpc('prune',{},signal);
      if(result.status!=='ready')return {status:result.status};
      return Number.isSafeInteger(result.pruned)&&result.pruned>=0&&result.pruned<=200
        ?{status:'ready',pruned:result.pruned}:{status:'unavailable'};
    },
  });
}
