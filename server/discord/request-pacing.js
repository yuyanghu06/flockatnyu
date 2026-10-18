import {createHash} from 'node:crypto';

const error=code=>Object.assign(new Error(code),{code});
export const discordPause=(ms,signal)=>new Promise((resolve,reject)=>{
  if(signal?.aborted)return reject(error('aborted'));
  const abort=()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);reject(error('aborted'));};
  const timer=setTimeout(()=>{signal?.removeEventListener('abort',abort);resolve();},ms);
  signal?.addEventListener('abort',abort,{once:true});
});

/** One process-local queue per bot/fetch transport. No source bodies or tokens
 * are kept in the registry. Cooldowns apply conservatively across all routes. */
export function createDiscordRequestPacer({minIntervalMs=750,now=Date.now,sleep=discordPause}={}) {
  let tail=Promise.resolve(),nextAt=0,blockedUntil=0,pending=0;
  const defer=ms=>{if(Number.isFinite(ms)&&ms>=0)blockedUntil=Math.max(blockedUntil,now()+ms);};
  async function run(work,{signal}={}) {
    if(signal?.aborted)throw error('aborted');
    if(pending>=256)throw error('budget_exhausted');
    pending++;
    const previous=tail;let release;
    tail=new Promise(resolve=>{release=resolve;});
    try {
      // Aborted queued work releases only its own slot AFTER the predecessor;
      // later callers must never overtake an in-flight request.
      let abort;
      try {await Promise.race([previous,new Promise((_,reject)=>{
        abort=()=>reject(error('aborted'));signal?.addEventListener('abort',abort,{once:true});
        if(signal?.aborted)abort();
      })]);}finally{signal?.removeEventListener('abort',abort);}
      while(Math.max(nextAt,blockedUntil)>now())await sleep(Math.min(60000,Math.max(nextAt,blockedUntil)-now()),signal);
      if(signal?.aborted)throw error('aborted');
      nextAt=now()+Math.max(0,minIntervalMs);
      return await work({defer,now});
    }finally{previous.then(()=>{pending--;release();},()=>{pending--;release();});}
  }
  return Object.freeze({run,defer});
}

const registry=new WeakMap();
export function sharedDiscordPacer({botToken='',fetchImpl,minIntervalMs=750}={}) {
  let bots=registry.get(fetchImpl);if(!bots){bots=new Map();registry.set(fetchImpl,bots);}
  const key=createHash('sha256').update(botToken).digest('hex');
  if(!bots.has(key))bots.set(key,createDiscordRequestPacer({minIntervalMs}));
  return bots.get(key);
}
const seconds=value=>value!==null&&value!==undefined&&String(value).trim()!==''&&Number.isFinite(Number(value))&&Number(value)>=0?Number(value)*1000:null;
export function discordRetryDelay(response,data,now=Date.now()) {
  const retry=response.headers?.get('retry-after');
  const header=seconds(retry)??(retry&&Number.isFinite(Date.parse(retry))?Math.max(0,Date.parse(retry)-now):null);
  const values=[header,seconds(data?.retry_after),seconds(response.headers?.get('x-ratelimit-reset-after'))].filter(value=>value!==null);
  return values.length?Math.max(...values):null;
}

/** Shared GET transport, retaining bounded retries and access-error handling. */
export function createPacedDiscordRequest({config,fetchImpl,requestPacer,indexing=false,ErrorClass=Error}={}) {
  const pacer=requestPacer||sharedDiscordPacer({botToken:config.botToken,fetchImpl,minIntervalMs:config.pacing?.minIntervalMs??750});
  return async function request(path,parentSignal) {
    if(!config.configured)throw new ErrorClass('not_configured');
    const timeout=new AbortController(),timer=setTimeout(()=>timeout.abort(),config.pacing?.requestBudgetMs??90000);timer.unref?.();
    const signal=parentSignal?AbortSignal.any([parentSignal,timeout.signal]):timeout.signal;
    let rateLimited=false;
    try {
      for(let attempt=0;attempt<4;attempt++) {
        const result=await pacer.run(async({defer,now})=>{
          const active=AbortSignal.any([signal,AbortSignal.timeout(15000)]);
          const response=await fetchImpl(`https://discord.com/api/v10${path}`,{...(indexing?{method:'GET'}:{}),headers:{Authorization:`Bot ${config.botToken}`},signal:active,redirect:'error'});
          if(!response.ok&&response.status!==429&&!(indexing&&response.status===202)) {
            await response.body?.cancel();
            throw new ErrorClass(({401:'invalid_token',403:'permission_denied',404:'not_found'})[response.status]||'discord_unavailable');
          }
          const raw=await response.text();if(raw.length>3000000)throw new ErrorClass('response_too_large');
          let data;try{data=JSON.parse(raw);}catch{if(response.status!==429)throw new ErrorClass('invalid_response');}
          if(response.status===429||indexing&&response.status===202) {
            if(response.status===429)rateLimited=true;
            const delay=discordRetryDelay(response,data,now())??Math.min(30000,1000*2**attempt);
            defer(Math.max(10,delay));
            return {retry:true,status:response.status};
          }
          if(response.headers?.get('x-ratelimit-remaining')==='0') {
            const delay=seconds(response.headers.get('x-ratelimit-reset-after'));
            const reset=seconds(response.headers.get('x-ratelimit-reset'));
            if(delay!==null)defer(delay);else if(reset!==null)defer(Math.max(0,reset-now()));
          }
          return {data};
        },{signal});
        if(!result.retry)return result.data;
        if(attempt===3)throw new ErrorClass(result.status===202?'indexing':'rate_limited');
      }
    }catch(cause){
      if(parentSignal?.aborted)throw new ErrorClass('aborted');
      if(timeout.signal.aborted)throw new ErrorClass(rateLimited?'rate_limited':'budget_exhausted');
      if(cause instanceof ErrorClass)throw cause;
      throw new ErrorClass(['aborted','budget_exhausted'].includes(cause?.code)?cause.code:'discord_unavailable');
    }finally{clearTimeout(timer);}
  };
}
