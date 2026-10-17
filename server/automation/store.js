import {plainObject,validUuid} from './validation.js';
export function createAutomationStore({env = process.env,fetchImpl = globalThis.fetch} = {}) {
  let base;
  try {
    const url = new URL(env.SUPABASE_URL);
    if ((url.protocol === 'https:' || url.protocol === 'http:' && ['localhost','127.0.0.1','[::1]'].includes(url.hostname)) && !url.username && !url.password && !url.search && !url.hash && ['','/'].includes(url.pathname)) base = url.origin;
  } catch { /* Invalid origins are never fetched. */ }
  const key = (env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  const configured = Boolean(base && key && !/[\r\n]/.test(key) && typeof fetchImpl === 'function');
  async function rpc(name,args,signal) {
    if (!configured) return {status:'not_configured'};
    if (signal?.aborted) return {status:'aborted'};
    let reader;
    const combined = AbortSignal.any([signal,AbortSignal.timeout(15000)].filter(Boolean));
    const cancel=()=>{void reader?.cancel().catch(()=>{});};
    combined.addEventListener('abort',cancel,{once:true});
    try {
      const response = await fetchImpl(`${base}/rest/v1/rpc/${name}`, {method:'POST',redirect:'error',signal:combined,
        headers:{apikey:key,authorization:`Bearer ${key}`,'content-type':'application/json'},body:JSON.stringify(args)});
      if (!response.ok || !response.body) { await response.body?.cancel(); return {status:[401,403].includes(response.status) ? 'forbidden' : 'unavailable'}; }
      reader = response.body.getReader(); const chunks=[]; let bytes=0;
      while (true) {
        if(combined.aborted) throw new Error('aborted');
        const {value,done} = await reader.read(); if(combined.aborted) throw new Error('aborted');if (done) break;
        bytes += value.byteLength; if (bytes>131072) throw new Error('response_too_large');chunks.push(value);
      }
      const data = JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));
      return {status:'ready',data};
    } catch { return {status:signal?.aborted ? 'aborted' : 'unavailable'}; }
    finally { combined.removeEventListener('abort',cancel);if (reader) { await reader.cancel().catch(()=>{});reader.releaseLock(); } }
  }
  const leaseCall = async (name,{leaseToken,signal,...extra}={}) => {
    if (!validUuid(leaseToken)) return {status:'invalid_request'};
    const result=await rpc(`agent_automation_${name}`,{p_token:leaseToken,...extra},signal);
    return result.status==='ready' ? {status:result.data===true?'ready':'stale'} : result;
  };
  const objectCall = async (name,args,signal) => {
    const result = await rpc(name,args,signal);
    return result.status==='ready' && plainObject(result.data) && typeof result.data.status==='string' ? result.data : result.status==='ready' ? {status:'unavailable'} : result;
  };
  return Object.freeze({configured,
    enqueue({inputId,envelope,signal}={}) {
      if (!validUuid(inputId) || !plainObject(envelope)) return Promise.resolve({status:'invalid_request'});
      return objectCall('agent_automation_enqueue',{p_input_id:inputId,p_envelope:envelope},signal);
    },
    async claim({config,signal}={}) {
      if (!config) return {status:'invalid_request'};
      const result=await objectCall('agent_automation_claim',{p_min_events:config.minEvents,p_max_age_seconds:config.maxAgeSeconds,
        p_cooldown_seconds:config.cooldownSeconds,p_lease_seconds:config.leaseSeconds,p_max_inputs:config.maxInputs,p_max_bytes:config.maxBytes},signal);
      if (result.status==='ready' && (!validUuid(result.leaseToken) || !Array.isArray(result.inputs) || !result.inputs.length || result.inputs.length>20 || result.inputs.some(r=>!validUuid(r.uuid)||!plainObject(r.raw_response)))) return {status:'unavailable'};
      return result;
    },
    renew({leaseToken,leaseSeconds=120,signal}={}) { return leaseCall('renew',{leaseToken,p_lease_seconds:leaseSeconds,signal}); },
    action({leaseToken,actionKey,complete=false,signal}={}) {
      if (!validUuid(leaseToken) || typeof actionKey!=='string' || !/^[a-f0-9]{64}$/.test(actionKey) || typeof complete!=='boolean') return Promise.resolve({status:'invalid_request'});
      return objectCall('agent_automation_action',{p_token:leaseToken,p_action_key:actionKey,p_complete:complete},signal);
    },
    finish({leaseToken,handledInputIds,signal}={}) {
      if (!Array.isArray(handledInputIds)||!handledInputIds.length||handledInputIds.length>20||!handledInputIds.every(validUuid)||new Set(handledInputIds).size!==handledInputIds.length) return Promise.resolve({status:'invalid_request'});
      return leaseCall('finish',{leaseToken,p_handled_ids:handledInputIds,signal});
    },
    release({leaseToken,signal}={}) { return leaseCall('release',{leaseToken,signal}); },
  });
}
