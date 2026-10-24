import {DIAGNOSTIC_CODES,diagnosticCounts,safeDiagnosticTool,safeBatchFailures,toolDiagnostics} from './tool-diagnostics.js';
// Private returned-output audit. Prompts, tool read results and exception bodies never enter this API.
const DIAGNOSTIC_STATUS=Object.fromEntries(('unknown ready ok empty partial metadata_only pending deferred forbidden permission_denied access_denied channel_scope_denied forbidden_source cancelled aborted invalid_request invalid_tool_call invalid_completion invalid_result failed unavailable not_configured provider_unavailable request_timeout tool_failed team_request_required tool_result_error quota_exhausted budget_exhausted quota_state_unavailable reconciliation_deferred conflict stale not_found read_required context_limit unsupported_content result_too_large duplicate_call_skipped completed already_succeeded success succeeded applied started preflight_failed invalid_batch incomplete_batch call_limit audit_unavailable round_limit').split(' ').map(x=>[x,true]));
const TOOL_COUNT_KEYS=new Set('sequence requested created existing updated unchanged failed unattempted inputs handled remaining calls miroDeferred miroDeferredBoards messages'.split(' '));
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SECRET_KEY=/(?:password|passwd|secret|credential|authorization|cookie|api.?key|access.?token|refresh.?token|private.?key|service.?role|client.?secret|token|^key$)/i;
const MAX_OUTPUT=512*1024;
const USAGE_KEYS=['inputTokens','outputTokens','cacheReadTokens','cacheWriteTokens','reasoningTokens'];
const token=n=>Number.isSafeInteger(n)&&n>=0&&n<=1e12?n:null;
const safeName=(s,max=160)=>typeof s==='string'&&s.length<=max&&/^[a-zA-Z0-9_.:/-]+$/.test(s)?s:null;
const contextValue=c=>c&&['chat','planner'].includes(c.agent)&&UUID.test(c.runId)&&
 (c.round===undefined||Number.isInteger(c.round)&&c.round>=0&&c.round<=10000)?{agent:c.agent,runId:c.runId,round:c.round??null}:null;
function secretsFrom(env){
 const values=new Set();
 const collect=v=>{if(typeof v==='string'&&v.length>0){values.add(v);if(v.trim())values.add(v.trim());}};
 for(const [key,value]of Object.entries(env))if((SECRET_KEY.test(key)||key==='LLM_PROVIDERS_JSON'&&typeof value==='string'&&value.trim())&&typeof value==='string'){
  collect(value);
  try{const walk=(v,depth=0)=>{if(depth>8)return;if(v&&typeof v==='object')for(const [k,x]of Object.entries(v)){if(SECRET_KEY.test(k))collect(x);walk(x,depth+1);}};walk(JSON.parse(value));}catch{/* Non-JSON secret. */}
 }
 return [...values].sort((a,b)=>b.length-a.length);
}
function serializer(secretValues){return output=>{
 let truncated=false,redacted=false,budget=MAX_OUTPUT-4096,originalBytes=0;
 const seen=new WeakSet();
 const cleanText=(text,depth,parseEmbedded=true)=>{
  originalBytes+=Buffer.byteLength(text);
  // Redact BEFORE truncation so a cut cannot reveal a credential prefix.
  for(const value of secretValues)if(text.includes(value)){text=text.split(value).join('[REDACTED]');redacted=true;}
  // Tool arguments may contain JSON strings inside JSON strings. Apply the same
  // key policy after decoding, with the existing depth/size budget at every layer.
  if(parseEmbedded&&/^\s*[\[{"]/.test(text)){
   if(depth>=16||Buffer.byteLength(text)>MAX_OUTPUT){truncated=true;return '[TRUNCATED: encoded JSON limit]';}
   try{const decoded=JSON.parse(text);if(decoded!==null&&(typeof decoded==='object'||typeof decoded==='string'))text=JSON.stringify(walk(decoded,depth+1));}catch{/* Malformed fragments receive credential-pattern scrubbing below. */}
  }
  text=text.replace(/\bBearer\s+[^\s"'<>]+/gi,()=>{redacted=true;return 'Bearer [REDACTED]';})
   .replace(/\b(?:sk-[a-zA-Z0-9_-]{10,}|eyJ[a-zA-Z0-9_-]{12,}\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+)\b/g,()=>{redacted=true;return '[REDACTED]';})
   .replace(/(https?:\/\/)[^\s/@:]+:[^\s/@]+@/gi,(_,prefix)=>{redacted=true;return `${prefix}[REDACTED]@`;})
   .replace(/((?:api[_-]?key|access[_-]?token|refresh[_-]?token|private[_-]?key|service[_-]?role|client[_-]?secret|password|passwd|secret|credential|authorization|cookie|token|key)[\\"']*\s*[=:]\s*)([\\]*["'])([\s\S]*?)\2/gi,(_,prefix,quote)=>{redacted=true;return `${prefix}${quote}[REDACTED]${quote}`;})
   .replace(/((?:api[_-]?key|access[_-]?token|refresh[_-]?token|private[_-]?key|service[_-]?role|client[_-]?secret|password|passwd|secret|credential|authorization|cookie|token|key)[\\"']*\s*[=:]\s*[\\"']*)[^\s\\"'&,;}]+/gi,(_,prefix)=>{redacted=true;return `${prefix}[REDACTED]`;});
  const bytes=Buffer.byteLength(text);if(bytes>budget){truncated=true;const result=Buffer.from(text).subarray(0,Math.max(0,budget)).toString('utf8');budget=0;return result;}budget-=bytes;return text;
 };
 const walk=(value,depth)=>{
  if(depth>16||budget<=0){truncated=true;return '[TRUNCATED]';}
  if(value===null||typeof value==='boolean')return value;
  if(typeof value==='string')return cleanText(value,depth);
  if(typeof value==='number')return Number.isFinite(value)?value:null;
  if(typeof value!=='object')return null;
  if(seen.has(value)){truncated=true;return '[CIRCULAR]';}seen.add(value);
  if(Array.isArray(value)){const result=[];for(const x of value.slice(0,1000)){if(budget<=0){truncated=true;break;}budget-=8;result.push(walk(x,depth+1));}if(value.length>result.length)truncated=true;return result;}
  const result=Object.create(null);let n=0;
  for(const [key,x]of Object.entries(value)){if(n++>=1000||budget<=0){truncated=true;break;}const k=cleanText(key,depth,false).slice(0,256);budget-=16;if(SECRET_KEY.test(key)){result[k]='[REDACTED]';redacted=true;}else result[k]=walk(x,depth+1);}
  return result;
 };
 const value=walk(output??null,0);let storedBytes=Buffer.byteLength(JSON.stringify(value));
 // Key/JSON syntax overhead is separately bounded, including deeply nested structures.
 if(storedBytes>MAX_OUTPUT){truncated=true;return {value:'[TRUNCATED: serialization limit]',truncated,redacted,originalBytes,originalBytesScope:'visited_text_only',storedBytes:38};}
 return {value,truncated,redacted,originalBytes,originalBytesScope:'visited_text_only',storedBytes};
};}
export function estimateAuditCost({provider,model,providerBaseHost,serviceTier},usage){
 if(!['openai','openai-compatible'].includes(provider)||model!=='gpt-6-luna'||providerBaseHost!=='api.openai.com'||!['default','standard'].includes(serviceTier??'default')||
  token(usage?.inputTokens)===null||usage.inputTokens>272000||token(usage?.outputTokens)===null||token(usage?.cacheReadTokens)===null||token(usage?.cacheWriteTokens)===null||usage.cacheReadTokens+usage.cacheWriteTokens>usage.inputTokens)return null;
 return {estimatedCostUsd:((usage.inputTokens-usage.cacheReadTokens-usage.cacheWriteTokens)*0.10+usage.cacheReadTokens*0.01+usage.cacheWriteTokens*0.125+usage.outputTokens*0.50)/1e6,
  pricingBasis:{version:'2026-10-19',currency:'USD',perTokens:1000000,input:0.10,cacheRead:0.01,cacheWrite:0.125,output:0.50,source:'https://developers.openai.com/api/docs/models/gpt-6-luna'}};
}
export function createAuditLogger({env=process.env,fetchImpl=globalThis.fetch,now=()=>Date.now(),writeDiagnostic=entry=>console.error(JSON.stringify(entry))}={}){
 const required=env.NODE_ENV==='production'||String(env.MODEL_AUDIT_REQUIRED).toLowerCase()==='true';
 let base;try{const u=new URL(env.SUPABASE_URL);if(!u.username&&!u.password&&!u.search&&!u.hash&&['','/'].includes(u.pathname)&&(u.protocol==='https:'||u.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(u.hostname)))base=u.origin;}catch{/* Unconfigured. */}
 const key=typeof env.SUPABASE_SERVICE_ROLE_KEY==='string'?env.SUPABASE_SERVICE_ROLE_KEY.trim():'';
 const enabled=required||String(env.MODEL_AUDIT_ENABLED).toLowerCase()==='true';
 const configured=Boolean(enabled&&base&&key&&!/[\r\n]/.test(key)&&typeof fetchImpl==='function');
 const timeout=Math.max(250,Math.min(10000,Number(env.MODEL_AUDIT_TIMEOUT_MS)||3000));
 const secrets=secretsFrom(env),sanitize=serializer(secrets),calls=new Map();
 const metadata=(value,max)=>{const clean=safeName(value,max);return clean&&!secrets.some(secret=>clean.includes(secret))?clean:null;};
 const diagnostic=operation=>{try{void Promise.resolve(writeDiagnostic({event:'model_audit_persistence_failed',operation})).catch(()=>{});}catch{/* Diagnostics cannot leak or interrupt callers. */}};
 async function rpc(name,payload){
  if(!configured){if(required)diagnostic(name);return {status:required?'unavailable':'not_configured'};}
  const controller=new AbortController();let timer,reader;
  // Promise.race bounds even an injected fetch which does not honor AbortSignal.
  const pending=(async()=>{try{
   const response=await fetchImpl(`${base}/rest/v1/rpc/${name}`,{method:'POST',redirect:'error',signal:controller.signal,headers:{apikey:key,authorization:`Bearer ${key}`,'content-type':'application/json'},body:JSON.stringify({p_payload:payload})});
   if(!response.ok){await response.body?.cancel();throw new Error('unavailable');}
   if(!response.body)throw new Error('unavailable');reader=response.body.getReader();let bytes=0;const chunks=[];
   while(true){const r=await reader.read();if(r.done)break;bytes+=r.value.byteLength;if(bytes>4096)throw new Error('oversize');chunks.push(r.value);}
   const result=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(result?.status!=='ready')throw new Error('unavailable');return {status:'ready'};
  }catch{return {status:'unavailable'};}finally{try{await reader?.cancel();reader?.releaseLock();}catch{/* Reader teardown only. */}}})();
  const result=await Promise.race([pending,new Promise(resolve=>{timer=setTimeout(()=>{controller.abort();void reader?.cancel().catch(()=>{});resolve({status:'unavailable'});},timeout);})]);clearTimeout(timer);
  if(result.status!=='ready')diagnostic(name);return result;
 }
 return Object.freeze({configured,required,
  async startModel({callId,context,provider,model,operation,stream=false,providerBaseHost,serviceTier}={}){
   const c=contextValue(context);if(!UUID.test(callId)||!c||!metadata(provider)||!metadata(model)||!metadata(operation)||typeof stream!=='boolean')return {status:'unavailable'};
   if(calls.size>=10000&&!calls.has(callId)){for(const [id,x]of calls)if(x.finished||Number(now())-x.startedAt>=7*86400000)calls.delete(id);if(calls.size>=10000)return {status:'unavailable'};}
   const identity={callId,...c,provider,model,operation,stream,providerBaseHost:metadata(providerBaseHost,253),serviceTier:metadata(serviceTier,64)??'default'};
   const result=await rpc('agent_audit_start_model',identity);if(result.status==='ready'){calls.set(callId,{...identity,startedAt:Number(now())});}return result;
  },
  async finishModel({callId,status,responseId,providerRequestId,httpStatus,stopReason,usage,output,errorCode,serviceTier}={}){
   const identity=calls.get(callId);if(!identity)return {status:configured||required?'unavailable':'not_configured'};
   if(!['succeeded','failed','aborted','cancelled'].includes(status))return {status:'unavailable'};
   const normalizedUsage=Object.fromEntries(USAGE_KEYS.map(k=>[k,token(usage?.[k])]));
   const pricing=estimateAuditCost({...identity,serviceTier:serviceTier??identity.serviceTier},normalizedUsage);
   const result=await rpc('agent_audit_finish_model',{callId,agent:identity.agent,runId:identity.runId,round:identity.round,status,
    responseId:metadata(responseId,256),providerRequestId:metadata(providerRequestId,256),httpStatus:Number.isInteger(httpStatus)&&httpStatus>=100&&httpStatus<=599?httpStatus:null,
    stopReason:metadata(stopReason,128),errorCode:metadata(errorCode,128),usage:normalizedUsage,output:sanitize(output),
    estimatedCostUsd:pricing?.estimatedCostUsd??null,pricingBasis:pricing?.pricingBasis??null,serviceTier:metadata(serviceTier,64)??identity.serviceTier});
   if(result.status==='ready')identity.finished=true;return result;
  },
  async recordEvent({eventId,context,kind,tool,status,durationMs,counts,diagnostics}={}){
   const c=contextValue(context);if(!UUID.test(eventId)||!c||!['run_started','run_finished','tool_started','tool_finished'].includes(kind)||!diagnostics&&(!metadata(status,64)||tool!==undefined&&!metadata(tool,160)))return {status:'unavailable'};
   const encoded=diagnostics?diagnosticCounts(diagnostics):{};
   const safeCounts={...encoded};if(counts&&typeof counts==='object')for(const [k,v]of Object.entries(counts).slice(0,32-Object.keys(encoded).length))if((!diagnostics||TOOL_COUNT_KEYS.has(k))&&/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(k)&&!SECRET_KEY.test(k)&&Number.isSafeInteger(v)&&v>=0&&v<=1e9)if(!Object.hasOwn(encoded,k))safeCounts[k]=v;
   const safeTool=diagnostics&&tool!==undefined?safeDiagnosticTool(tool):tool;
   if(['tool_finished','run_finished'].includes(kind)&&diagnostics){
    const label=(dictionary,code)=>Object.keys(dictionary).find(name=>dictionary[name]===code)||'unknown';
    const safeStatus=Object.hasOwn(DIAGNOSTIC_STATUS,status)||Object.hasOwn(DIAGNOSTIC_CODES.reason,status)?status:'unknown';
    try{void Promise.resolve(writeDiagnostic({event:kind==='tool_finished'?'agent_tool_diagnostic':'agent_run_diagnostic',eventId,...c,...(kind==='tool_finished'?{tool:safeTool}:{}),...encoded,status:safeStatus,
      reason:label(DIAGNOSTIC_CODES.reason,encoded.reasonCode),stage:label(DIAGNOSTIC_CODES.stage,encoded.stageCode),outcome:label(DIAGNOSTIC_CODES.outcome,encoded.outcomeCode),durationMs:token(durationMs)})).catch(()=>{});}catch{/* Log outages never change tool execution. */}
   }
   if(kind==='tool_finished'&&diagnostics)for(const item of safeBatchFailures(diagnostics.batchFailures)){
    const itemCodes=diagnosticCounts(toolDiagnostics({result:{status:item.status,diagnostics:item},dispatched:item.dispatched===1}));
    try{void Promise.resolve(writeDiagnostic({event:'agent_tool_batch_item_diagnostic',eventId,...c,tool:safeTool,itemIndex:item.itemIndex,status:item.status,stage:item.stage,reason:item.reason,...itemCodes})).catch(()=>{});}catch{/* One diagnostic sink failure must not skip other rows. */}
   }
   return rpc('agent_audit_record_event',{eventId,...c,kind,tool:safeTool??null,status:diagnostics?(Object.hasOwn(DIAGNOSTIC_STATUS,status)||Object.hasOwn(DIAGNOSTIC_CODES.reason,status)?status:'unknown'):status,durationMs:token(durationMs),counts:safeCounts});
  },
  prune(){return rpc('agent_audit_prune',{});},
 });
}
