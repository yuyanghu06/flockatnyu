import {plainObject,validUuid} from './validation.js';

const MAX_TASK_BYTES=262144;
// A complete 200-task snapshot can contain 50 MiB; never silently paginate or truncate it.
const MAX_RESPONSE_BYTES=54*1024*1024;
const MAX_SINGLE_RESPONSE_BYTES=MAX_TASK_BYTES+16384;
const statuses=new Set(['ready','pending','conflict','capacity','expired','stale','forbidden','invalid_request','not_found']);
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
function validCatalogueTask(task,ids) {
  const request=task?.request;
  return plainObject(task)&&validUuid(task.uuid)&&timestamp(task.created_at)&&timestamp(task.updated_at)&&timestamp(task.expires_at)
    &&Object.keys(task).every(key=>['uuid','created_at','updated_at','expires_at','sourceIds','inputIds','modelEligible','summaryTruncated','request'].includes(key))
    &&Date.parse(task.updated_at)>=Date.parse(task.created_at)&&Date.parse(task.expires_at)>Date.parse(task.created_at)
    &&Date.parse(task.expires_at)<=Date.parse(task.created_at)+86400000
    &&validScope(task.sourceIds)&&task.sourceIds.length>0&&scoped(task,ids)
    &&Array.isArray(task.inputIds)&&task.inputIds.every(validUuid)
    &&new Set(task.inputIds.map(id=>id.toLowerCase())).size===task.inputIds.length
    &&typeof task.modelEligible==='boolean'&&typeof task.summaryTruncated==='boolean'
    &&plainObject(request)&&typeof request.summary==='string'&&[...request.summary].length<=100
    &&Object.keys(request).every(key=>['summary','operation','calendarKind','calendarEventId','personId','buildingId'].includes(key)
      &&typeof request[key]==='string'&&(key!=='calendarEventId'||[...request[key]].length<=1024));
}

// Trusted worker persistence only. Never register this store as a public/chat tool.
// SourceIds/context are supplied by the worker, not model-authored authorization.
export function createPendingTaskStore({env=process.env,fetchImpl=globalThis.fetch,writeDiagnostic=record=>console.info(JSON.stringify(record))}={}) {
  let base;
  try {
    const url=new URL(env.SUPABASE_URL);
    if ((url.protocol==='https:'||url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname))
      &&!url.username&&!url.password&&!url.search&&!url.hash&&['','/'].includes(url.pathname)) base=url.origin;
  } catch { /* Invalid origins are never fetched. */ }
  const key=(env.SUPABASE_SERVICE_ROLE_KEY||'').trim();
  const configured=Boolean(base&&key&&!/[\r\n]/.test(key)&&typeof fetchImpl==='function');
  const publish=record=>{try{Promise.resolve(writeDiagnostic?.(Object.freeze({event:'planner_task_storage',...record}))).catch(()=>{});}catch{/* Diagnostic failures never change storage outcomes. */}};
  async function rpc(name,args,signal,validateResult) {
    if(!configured)return {status:'not_configured'};
    if(signal?.aborted)return {status:'aborted'};
    let reader,httpStatus,bytes=0;
    const started=performance.now();
    const combined=AbortSignal.any([signal,AbortSignal.timeout(15000)].filter(Boolean));
    const cancel=()=>{void reader?.cancel().catch(()=>{});};
    combined.addEventListener('abort',cancel,{once:true});
    const done=(status,{reason=status==='ready'?'none':status,category=status==='forbidden'?'permission_denied':reason,stage='provider_request'}={})=>{
      const diagnostics={operation:name,category,reason,stage,elapsedMs:Math.max(0,Math.round(performance.now()-started)),responseBytes:bytes,
        ...(Number.isInteger(httpStatus)&&httpStatus>=100&&httpStatus<=599?{httpStatus}:{})};
      publish({status,...diagnostics});
      return status==='ready'?null:{status,diagnostics};
    };
    try {
      const response=await fetchImpl(`${base}/rest/v1/rpc/agent_pending_task_${name}`,{
        method:'POST',redirect:'error',signal:combined,
        headers:{apikey:key,authorization:`Bearer ${key}`,'content-type':'application/json'},body:JSON.stringify(args),
      });
      httpStatus=response.status;
      if(!response.body)return done([401,403].includes(httpStatus)?'forbidden':'unavailable',{
        reason:[401,403].includes(httpStatus)?'forbidden':'invalid_response',
        category:[401,403].includes(httpStatus)?'permission_denied':'invalid_response',stage:'response_parse'});
      reader=response.body.getReader();const chunks=[];
      const maxBytes=!response.ok?32768:['read','save'].includes(name)?MAX_SINGLE_RESPONSE_BYTES:MAX_RESPONSE_BYTES;
      while(true){
        if(combined.aborted)throw Error('aborted');
        const {value,done:complete}=await reader.read();if(combined.aborted)throw Error('aborted');if(complete)break;
        bytes+=value.byteLength;if(bytes>maxBytes)return done('unavailable',{reason:'response_too_large',stage:'response_parse'});chunks.push(value);
      }
      let data;
      try{data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));}
      catch{return done([401,403].includes(httpStatus)?'forbidden':'unavailable',{
        reason:[401,403].includes(httpStatus)?'forbidden':response.ok?'invalid_json':'http_error',
        category:[401,403].includes(httpStatus)?'permission_denied':response.ok?'invalid_json':'http_error',stage:'response_parse'});}
      if(!response.ok) {
        const forbidden=[401,403].includes(httpStatus)||data?.code==='42501';
        return done(forbidden?'forbidden':'unavailable',{reason:forbidden?'forbidden':data?.code==='57014'?'timeout':'http_error',
          category:forbidden?'permission_denied':data?.code==='57014'?'database_timeout':'http_error'});
      }
      if(!plainObject(data)||!statuses.has(data.status))return done('unavailable',{reason:'invalid_response',stage:'response_parse'});
      if(data.status!=='ready')return done(data.status);
      if(validateResult&&!validateResult(data))return done('unavailable',{reason:'invalid_response',stage:'response_parse'});
      done('ready');return data;
    }catch{return done(signal?.aborted?'aborted':'unavailable',{reason:signal?.aborted?'aborted':combined.aborted?'request_timeout':'network_error'});}
    finally{combined.removeEventListener('abort',cancel);if(reader){await reader.cancel().catch(()=>{});reader.releaseLock();}}
  }
  return Object.freeze({configured,
    async catalogue({leaseToken,allowedSourceIds,signal}={}) {
      if(!validScope(allowedSourceIds)||allowedSourceIds.length>0&&!validUuid(leaseToken))return {status:'invalid_request'};
      const result=await rpc('catalogue',{p_token:validUuid(leaseToken)?leaseToken:null,p_allowed_source_ids:[...allowedSourceIds]},signal,
        data=>Array.isArray(data.tasks)&&data.tasks.length<=200&&data.tasks.every(task=>validCatalogueTask(task,allowedSourceIds))
          &&new Set(data.tasks.map(task=>task.uuid.toLowerCase())).size===data.tasks.length);
      if(result.status!=='ready')return result;
      return {status:'ready',tasks:result.tasks};
    },
    async read({leaseToken,allowedSourceIds,taskId,signal}={}) {
      if(!validUuid(leaseToken)||!validScope(allowedSourceIds)||!validUuid(taskId))return {status:'invalid_request'};
      const result=await rpc('read',{p_token:leaseToken,p_allowed_source_ids:[...allowedSourceIds],p_task_id:taskId},signal,
        data=>validTask(data.task,allowedSourceIds)&&data.task.uuid.toLowerCase()===taskId.toLowerCase());
      if(result.status!=='ready')return result;
      return {status:'ready',task:result.task};
    },
    async list({leaseToken,allowedSourceIds,signal}={}) {
      if(!validScope(allowedSourceIds)||allowedSourceIds.length>0&&!validUuid(leaseToken))return {status:'invalid_request'};
      const result=await rpc('list',{p_token:validUuid(leaseToken)?leaseToken:null,p_allowed_source_ids:[...allowedSourceIds]},signal,
        data=>Array.isArray(data.tasks)&&data.tasks.length<=200&&data.tasks.every(task=>validTask(task,allowedSourceIds))
          &&new Set(data.tasks.map(task=>task.uuid.toLowerCase())).size===data.tasks.length);
      if(result.status!=='ready')return {status:result.status};
      return {status:'ready',tasks:result.tasks};
    },
    async save({leaseToken,allowedSourceIds,task,expectedUpdatedAt,signal}={}) {
      if(!validUuid(leaseToken)||!validScope(allowedSourceIds)||!allowedSourceIds.length||!plainObject(task)
        ||!validUuid(task.uuid)||!validInfo(task.info)||!scoped(task.info,allowedSourceIds)
        ||expectedUpdatedAt!==undefined&&!timestamp(expectedUpdatedAt)
        ||task.expires_at!==undefined&&!timestamp(task.expires_at))return {status:'invalid_request'};
      const result=await rpc('save',{p_token:leaseToken,p_allowed_source_ids:[...allowedSourceIds],p_task_id:task.uuid,p_info:task.info,
        p_expected_updated_at:expectedUpdatedAt??null,p_expires_at:task.expires_at??null},signal,
        data=>validTask(data.task,allowedSourceIds)&&data.task.uuid.toLowerCase()===task.uuid.toLowerCase());
      if(result.status!=='ready')return result.diagnostics?{status:result.status,diagnostics:result.diagnostics}:{status:result.status};
      return {status:'ready',task:result.task};
    },
    async resolve({leaseToken,allowedSourceIds,taskId,expectedUpdatedAt,signal}={}) {
      if(!validUuid(leaseToken)||!validScope(allowedSourceIds)||!allowedSourceIds.length||!validUuid(taskId)
        ||!timestamp(expectedUpdatedAt))return {status:'invalid_request'};
      const result=await rpc('resolve',{p_token:leaseToken,p_allowed_source_ids:[...allowedSourceIds],p_task_id:taskId,p_expected_updated_at:expectedUpdatedAt},signal);
      return result.diagnostics?{status:result.status,diagnostics:result.diagnostics}:{status:result.status};
    },
    async prune({signal}={}) {
      const result=await rpc('prune',{},signal,data=>Number.isSafeInteger(data.pruned)&&data.pruned>=0&&data.pruned<=200);
      if(result.status!=='ready')return {status:result.status};
      return {status:'ready',pruned:result.pruned};
    },
  });
}
