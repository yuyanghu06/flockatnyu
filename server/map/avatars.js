// Private roster portraits: storage references never cross the authenticated API.
import {createHash} from 'node:crypto';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_IMAGE_BYTES=4*1024*1024;
const MAX_DIMENSION=4096;
const BUCKET='map-avatars';
const validPersonId=value=>typeof value==='string'&&value.length===36&&UUID.test(value);
function storageOrigin(env) {
  try {
    const value=env.SUPABASE_URL?.trim(),url=new URL(value);
    return url.protocol==='https:'&&!url.username&&!url.password&&!url.search&&!url.hash&&
      (value===url.origin||value===url.origin+'/')?url.origin:null;
  } catch {return null;}
}
export function avatarProxyPath(personId) {
  return validPersonId(personId)?`/api/map/people/${personId.toLowerCase()}/avatar`:null;
}
function storageReference(value,personId,env) {
  const origin=storageOrigin(env),id=validPersonId(personId)?personId.toLowerCase():null;
  if(!origin||!id||typeof value!=='string')return null;
  const prefix=`${origin}/storage/v1/object/authenticated/${BUCKET}/${id}/`;
  return value.length===prefix.length+68&&value.startsWith(prefix)&&/^[0-9a-f]{64}\.png$/.test(value.slice(prefix.length))?value:null;
}
export function mapAvatarProxy(value,personId,env=process.env) {
  const path=avatarProxyPath(personId);
  return path&&(value===path||storageReference(value,personId,env))?path:null;
}
async function readBytes(response,signal,max) {
  if(!response.body||Number(response.headers.get('content-length'))>max) {
    await response.body?.cancel().catch(()=>{});throw Error('avatar_unavailable');
  }
  const reader=response.body.getReader(),chunks=[];let length=0;
  const cancel=()=>{void reader.cancel().catch(()=>{});};
  signal.addEventListener('abort',cancel,{once:true});
  try {
    while(true) {
      if(signal.aborted)throw Error('avatar_cancelled');
      const {value,done}=await reader.read();
      if(signal.aborted)throw Error('avatar_cancelled');
      if(done)break;
      length+=value.byteLength;if(length>max)throw Error('avatar_too_large');
      chunks.push(value);
    }
    const bytes=new Uint8Array(length);let offset=0;
    for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
    return bytes;
  } finally {
    signal.removeEventListener('abort',cancel);
    await reader.cancel().catch(()=>{});reader.releaseLock();
  }
}
function validPng(bytes) {
  if(bytes.length<33||![137,80,78,71,13,10,26,10].every((value,index)=>bytes[index]===value))return false;
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  if(view.getUint32(8)!==13||String.fromCharCode(...bytes.subarray(12,16))!=='IHDR')return false;
  const width=view.getUint32(16),height=view.getUint32(20);
  return width>0&&height>0&&width<=MAX_DIMENSION&&height<=MAX_DIMENSION;
}
export function createMapAvatarService({env=process.env,fetchImpl=globalThis.fetch,timeoutMs=15000,maxConcurrent=4}={}) {
  const origin=storageOrigin(env),key=env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const configured=Boolean(origin&&key);
  const deadline=Number.isFinite(timeoutMs)?Math.max(1,Math.min(60000,timeoutMs)):15000;
  const capacity=Number.isInteger(maxConcurrent)?Math.max(1,Math.min(4,maxConcurrent)):4;
  let active=0;
  const waiters=[];
  const release=()=>{
    active--;
    while(waiters.length) {
      const waiter=waiters.shift();
      waiter.signal.removeEventListener('abort',waiter.abort);
      if(waiter.signal.aborted){waiter.reject(Error('avatar_cancelled'));continue;}
      active++;waiter.resolve(release);break;
    }
  };
  const acquire=signal=>{
    if(signal.aborted)return Promise.reject(Error('avatar_cancelled'));
    if(active<capacity){active++;return Promise.resolve(release);}
    if(waiters.length>=64)return Promise.resolve(null);
    return new Promise((resolve,reject)=>{
      const waiter={signal,resolve,reject,abort:null};
      waiter.abort=()=>{
        const index=waiters.indexOf(waiter);if(index!==-1)waiters.splice(index,1);
        signal.removeEventListener('abort',waiter.abort);reject(Error('avatar_cancelled'));
      };
      waiters.push(waiter);signal.addEventListener('abort',waiter.abort,{once:true});
      if(signal.aborted)waiter.abort();
    });
  };
  const headers={apikey:key,Authorization:`Bearer ${key}`};
  return Object.freeze({configured,async read({personId,principal,signal}={}) {
    // Authentication and shape checks happen before any database/storage I/O.
    if(typeof principal?.id!=='string'||!principal.id.trim()||principal.id.length>200||!Array.isArray(principal.allowedSourceIds))return {status:'forbidden'};
    if(!validPersonId(personId))return {status:'invalid'};
    if(!configured||signal?.aborted)return {status:'unavailable'};
    const id=personId.toLowerCase(),controller=new AbortController();
    const abort=()=>controller.abort();signal?.addEventListener('abort',abort,{once:true});
    let rejectCancelled,releaseSlot;
    const timer=setTimeout(abort,deadline);
    try {
      if(signal?.aborted)abort();
      releaseSlot=await acquire(controller.signal);
      if(!releaseSlot)return {status:'unavailable'};
      if(controller.signal.aborted)throw Error('avatar_cancelled');
      const cancelled=new Promise((_,reject)=>{rejectCancelled=()=>reject(Error('avatar_cancelled'));controller.signal.addEventListener('abort',rejectCancelled,{once:true});});
      const work=(async()=>{
      const params=new URLSearchParams({select:'id,avatar_url,is_trackable',id:`eq.${id}`,limit:'2'});
      const profile=await fetchImpl(`${origin}/rest/v1/map_people?${params}`,{headers,redirect:'error',signal:controller.signal});
      if(!profile.ok){await profile.body?.cancel().catch(()=>{});return {status:profile.status===404?'not_found':'unavailable'};}
      const rows=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await readBytes(profile,controller.signal,16384)));
      if(!Array.isArray(rows)||rows.length!==1||rows[0]?.id!==id||rows[0].is_trackable!==true)return {status:'not_found'};
      const url=storageReference(rows[0].avatar_url,id,{SUPABASE_URL:origin});if(!url)return {status:'not_found'};
      if(controller.signal.aborted)throw Error('avatar_cancelled');
      const response=await fetchImpl(url,{headers,redirect:'error',signal:controller.signal});
      if(!response.ok){await response.body?.cancel().catch(()=>{});return {status:response.status===404?'not_found':'unavailable'};}
      if(response.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='image/png') {
        await response.body?.cancel().catch(()=>{});return {status:'unavailable'};
      }
      const bytes=await readBytes(response,controller.signal,MAX_IMAGE_BYTES);
      const digest=createHash('sha256').update(bytes).digest('hex');
      return validPng(bytes)&&url.endsWith(`/${digest}.png`)?{status:'ok',bytes,contentType:'image/png'}:{status:'unavailable'};
    })();
      // Ignored cancellation retains its active slot until work really settles.
      // FIFO waiters share their original deadline and cannot start after abort.
      const heldRelease=releaseSlot;releaseSlot=null;
      void work.finally(heldRelease).catch(()=>{});
      return await Promise.race([work,cancelled]);
    } catch{return {status:'unavailable'};}
    finally {
      releaseSlot?.();clearTimeout(timer);signal?.removeEventListener('abort',abort);
      if(rejectCancelled)controller.signal.removeEventListener('abort',rejectCancelled);
      controller.abort();
    }
  }});
}
