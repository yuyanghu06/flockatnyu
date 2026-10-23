import {plainObject,validUuid} from './validation.js';

const snowflake=value=>typeof value==='string'&&/^[0-9]{1,20}$(?![\s\S])/.test(value);
const states=new Set(['queued','running','completed','failed']);
const outcomes=new Set(['completed','empty','disabled','not_configured','forbidden','stale','timeout','round_limit','call_limit','invalid_batch','incomplete_batch','invalid_tool_call','invalid_completion','tool_failed','context_limit','preflight_failed','audit_unavailable','unavailable','input_too_large','aborted']);
const timestamp=value=>typeof value==='string'&&value.length<=64&&Number.isFinite(Date.parse(value));
export function validateManualRunInput(value) {
  if(!plainObject(value)||Object.keys(value).some(key=>key!=='channelIds'))return null;
  const ids=value.channelIds??[];
  if(value.channelIds===null||!Array.isArray(ids)||ids.length>30||!ids.every(snowflake)||new Set(ids).size!==ids.length)return null;
  return {channelIds:[...ids]};
}
// Persist only a finite outcome and bounded numerical counts, never tool/model text.
export function sanitizeManualRunResult(value) {
  if(!plainObject(value)||!outcomes.has(value.status))return {status:'unavailable'};
  const result={status:value.status};
  for(const key of ['handled','remaining','calls'])if(Number.isSafeInteger(value[key])&&value[key]>=0&&value[key]<=10000)result[key]=value[key];
  return result;
}
function publicRun(value) {
  if(!plainObject(value)||!validUuid(value.runId)||!states.has(value.state)||!timestamp(value.createdAt)||!timestamp(value.updatedAt)||!timestamp(value.expiresAt))return null;
  const run={runId:value.runId,state:value.state,createdAt:value.createdAt,updatedAt:value.updatedAt,expiresAt:value.expiresAt};
  for(const key of ['startedAt','finishedAt'])if(value[key]!==null&&value[key]!==undefined){if(!timestamp(value[key]))return null;run[key]=value[key];}
  if(value.result!==null&&value.result!==undefined)run.result=sanitizeManualRunResult(value.result);
  return run;
}
export function createManualRunStore({env=process.env,fetchImpl=globalThis.fetch}={}) {
  let base;
  try{const url=new URL(env.SUPABASE_URL);if((url.protocol==='https:'||url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname))&&!url.username&&!url.password&&!url.search&&!url.hash&&['','/'].includes(url.pathname))base=url.origin;}catch{}
  const key=(env.SUPABASE_SERVICE_ROLE_KEY||'').trim();
  const configured=Boolean(base&&key&&!/[\r\n]/.test(key)&&typeof fetchImpl==='function');
  async function rpc(name,args,signal){
    if(!configured)return {status:'not_configured'};
    if(signal?.aborted)return {status:'aborted'};
    let reader;const combined=AbortSignal.any([signal,AbortSignal.timeout(15000)].filter(Boolean));
    const cancel=()=>{void reader?.cancel().catch(()=>{});};combined.addEventListener('abort',cancel,{once:true});
    try{
      const response=await fetchImpl(`${base}/rest/v1/rpc/agent_manual_run_${name}`,{method:'POST',redirect:'error',signal:combined,headers:{apikey:key,authorization:`Bearer ${key}`,'content-type':'application/json'},body:JSON.stringify(args)});
      if(!response.ok||!response.body){await response.body?.cancel();return {status:[401,403].includes(response.status)?'forbidden':'unavailable'};}
      reader=response.body.getReader();const chunks=[];let bytes=0;
      while(true){if(combined.aborted)throw Error();const {done,value}=await reader.read();if(combined.aborted)throw Error();if(done)break;bytes+=value.byteLength;if(bytes>16384)throw Error();chunks.push(value);}
      const data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));
      return plainObject(data)&&['ready','queued','empty','busy','capacity','stale','not_found','invalid_request'].includes(data.status)?data:{status:'unavailable'};
    }catch{return {status:signal?.aborted?'aborted':'unavailable'};}
    finally{combined.removeEventListener('abort',cancel);if(reader){await reader.cancel().catch(()=>{});reader.releaseLock();}}
  }
  return Object.freeze({configured,
    async start({channelIds=[],signal}={}){const input=validateManualRunInput({channelIds});if(!input)return {status:'invalid_request'};const result=await rpc('start',{p_channel_ids:input.channelIds},signal);return result.status==='queued'?(validUuid(result.runId)?{status:'queued',runId:result.runId}:{status:'unavailable'}):{status:result.status};},
    async read({runId,signal}={}){if(!validUuid(runId))return {status:'invalid_request'};const result=await rpc('read',{p_run_id:runId},signal);if(result.status!=='ready')return {status:result.status};const run=publicRun(result.run);return run&&run.runId.toLowerCase()===runId.toLowerCase()?{status:'ready',run}:{status:'unavailable'};},
    async claim({signal}={}){const result=await rpc('claim',{},signal);if(result.status!=='ready')return {status:result.status};const input=validateManualRunInput({channelIds:result.channelIds});return validUuid(result.runId)&&validUuid(result.requestToken)&&input?{status:'ready',runId:result.runId,requestToken:result.requestToken,channelIds:input.channelIds}:{status:'unavailable'};},
    async finish({runId,requestToken,result,signal}={}){if(!validUuid(runId)||!validUuid(requestToken))return {status:'invalid_request'};const response=await rpc('finish',{p_run_id:runId,p_token:requestToken,p_result:sanitizeManualRunResult(result)},signal);return {status:response.status};},
    async requeue({runId,requestToken,signal}={}){if(!validUuid(runId)||!validUuid(requestToken))return {status:'invalid_request'};const response=await rpc('requeue',{p_run_id:runId,p_token:requestToken},signal);return {status:response.status};},
  });
}
