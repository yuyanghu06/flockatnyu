// Session metadata only. Message bodies belong exclusively in the pending queue.
export function createDiscordEventState({env = process.env, fetchImpl = globalThis.fetch} = {}) {
  const url = new URL(env.SUPABASE_URL);
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash
    || !env.SUPABASE_SERVICE_ROLE_KEY || /[\r\n]/.test(env.SUPABASE_SERVICE_ROLE_KEY)) throw new Error('not_configured');
  const key = `subscription:discord:${env.DISCORD_GUILD_ID}`;
  async function rpc(name, args, signal) {
    const active = AbortSignal.any([AbortSignal.timeout(15000), ...(signal ? [signal] : [])]);
    const response = await fetchImpl(`${url.origin}/rest/v1/rpc/${name}`, {method:'POST',redirect:'error',signal:active,
      headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,authorization:`Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,'content-type':'application/json'},body:JSON.stringify(args)});
    if (!response.ok) { await response.body?.cancel(); throw Object.assign(new Error('checkpoint_unavailable'),{httpStatus:response.status}); }
    const reader = response.body.getReader(); const chunks=[];let bytes=0;
    try { while(true) { const {value,done}=await reader.read();if(done)break;
      bytes+=value.byteLength;if(bytes>16384)throw new Error('checkpoint_response_too_large');chunks.push(value); }
      try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new Error('checkpoint_invalid_response');}
    } finally { await reader.cancel().catch(()=>{});reader.releaseLock(); }
  }
  return Object.freeze({
    load: signal => rpc('agent_subscription_get_state',{p_key:key},signal),
    async save(expected,next,signal) {
      if(await rpc('agent_subscription_cas_state',{p_key:key,p_expected:expected,p_next:next},signal)!==true)throw new Error('checkpoint_conflict');
    },
  });
}
