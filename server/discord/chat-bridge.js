import {createHash,timingSafeEqual} from 'node:crypto';
import {request as httpRequest} from 'node:http';
import {normalizeAttachments} from '../chat-attachments.js';
import {validateDiscordRecentContext} from '../chat-discord-context.js';

const snowflake = value => typeof value === 'string' && /^[0-9]{1,20}$/.test(value);
const hash = value => createHash('sha256').update(value).digest();
const json = (value,status=200) => new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
const error = (code,status) => json({status:code},status);
async function bounded(work,signal) {
  if(signal.aborted)throw new Error('aborted');
  let onAbort;
  try{return await Promise.race([Promise.resolve().then(work),new Promise((_,reject)=>{
    onAbort=()=>reject(new Error('aborted'));signal.addEventListener('abort',onAbort,{once:true});
  })]);}finally{signal.removeEventListener('abort',onAbort);}
}

async function readBody(request,maxBytes=48000) {
  if (request.headers.get('content-type')?.split(';')[0] !== 'application/json') throw new Error('invalid_request');
  const reader=request.body?.getReader();if(!reader)throw new Error('invalid_request');
  const chunks=[];let size=0;
  const timeout=setTimeout(()=>{void reader.cancel();},10000);
  try {
    while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;
      if(size>maxBytes)throw new Error('invalid_request');chunks.push(part.value);}
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } finally {clearTimeout(timeout);await reader.cancel().catch(()=>{});reader.releaseLock();}
}

/** Private bearer-authenticated service transport. Browser sessions and request
 * body principals cannot authorize it. Server-owned principals gate the same
 * assistant adapters as the website, with a separate Discord source subset. */
export function createDiscordChatBridge({enabled=false,secret='',access,runner,contextLoader,maxConcurrent=3,timeoutMs=1200000} = {}) {
  let active=0;
  const configured = enabled && typeof secret === 'string' && secret.length >= 32 && !/[\r\n]/.test(secret);
  async function handle(request) {
    const path=new URL(request.url).pathname;
    if (!['/internal/discord/authorize','/internal/discord/chat'].includes(path)) return error('not_found',404);
    if (!configured) return error('unavailable',503);
    if (request.method !== 'POST' || request.headers.has('origin')) return error('access_denied',403);
    const authorization=request.headers.get('authorization') || '';
    if (!timingSafeEqual(hash(authorization),hash(`Bearer ${secret}`))) return error('access_denied',403);
    if (active >= maxConcurrent) return error('busy',429);
    active++;
    const signal=AbortSignal.any([request.signal,AbortSignal.timeout(timeoutMs)]);
    try {
      let value;try{value=await readBody(request);}catch{return error('invalid_request',400);}
      if (!value || typeof value !== 'object' || Array.isArray(value)
        || Object.keys(value).some(key=>!['guildId','channelId','userId','requestId','conversation','sourceProfileId'].includes(key))
        || ![value.guildId,value.channelId,value.userId].every(snowflake)) return error('invalid_request',400);
      let approved;try{approved=await bounded(()=>access.authorize({...value,signal}),signal);}catch{return error('access_denied',403);}
      if (path.endsWith('/authorize')) return json({status:'ready',sourceProfileId:approved.sourceProfileId,threadId:approved.threadId});
      if (!snowflake(value.requestId) || value.sourceProfileId !== approved.sourceProfileId) return error('access_changed',409);
      const conversation=value.conversation;
      if (!conversation || Object.keys(conversation).some(key=>!['messages','timeZone'].includes(key))
        || !Array.isArray(conversation.messages) || !conversation.messages.length || conversation.messages.length > 20
        || conversation.messages.at(-1)?.role !== 'user'
        || conversation.messages.some(message=>!message || Object.keys(message).some(key=>!['role','content'].includes(key))
          || !['user','assistant'].includes(message.role) || typeof message.content !== 'string'
          || !message.content.trim() || message.content.length > 8000)
        || conversation.messages.reduce((sum,message)=>sum+message.content.length,0)>16000) return error('invalid_request',400);
      const requestContext={transport:'discord',actor:approved.actor,channelId:value.channelId,
        threadId:approved.threadId,requestId:value.requestId,sourceProfileId:approved.sourceProfileId};
      const context=contextLoader?await bounded(()=>contextLoader.load({guildId:value.guildId,channelId:value.channelId,
        requestId:value.requestId,actorId:approved.actor.userId,principal:approved.principal,signal}),signal):{};
      // Bytes never join server/system context, transport history or metadata.
      // Only this request's final user message receives normalized image inputs.
      const {imageAttachments,...sourceContext}=context;
      let modelConversation=conversation;
      if(imageAttachments!==undefined) {
        const attachments=normalizeAttachments(imageAttachments);
        const imageContext=validateDiscordRecentContext(sourceContext.discordContext,requestContext)?.imageContext;
        const ready=imageContext?.images.filter(row=>row.status==='ready')||[];
        if(attachments.length!==ready.length||attachments.some((file,index)=>!['image/png','image/jpeg','image/webp'].includes(file.mimeType)||file.name!==ready[index].name))throw new Error('invalid_image_context');
        if(attachments.length) {
          // Channel audience ACLs can change while CDN downloads are pending.
          // Rebuild the audience-bound profile before any model sees bytes.
          let beforeInference;
          try{beforeInference=await bounded(()=>access.authorize({...value,signal}),signal);}catch{return error('access_changed',409);}
          if(beforeInference.sourceProfileId!==approved.sourceProfileId)return error('access_changed',409);
          modelConversation={...conversation,messages:conversation.messages.map((message,index)=>index===conversation.messages.length-1?{...message,attachments}:{...message})};
        }
      }
      const records=[];let length=0;
      await bounded(()=>runner.run({conversation:modelConversation,principal:approved.principal,requestContext,
        discordContext:sourceContext.discordContext,discordUsers:sourceContext.discordUsers,signal,
        onRecord:record=>{if(signal.aborted)return;length+=JSON.stringify(record).length;if(length>200000)throw new Error('response_too_large');records.push(record);}}),signal);
      // A policy/catalogue change during inference prevents publication.
      let latest;try{latest=await bounded(()=>access.authorize({...value,signal}),signal);}catch{return error('access_changed',409);}
      if(latest.sourceProfileId!==approved.sourceProfileId) return error('access_changed',409);
      return new Response(records.map(record=>JSON.stringify(record)+'\n').join(''),{
        headers:{'content-type':'application/x-ndjson; charset=utf-8','cache-control':'no-store'}});
    } catch {return error(signal.aborted?'aborted':'unavailable',503);}
    finally {active--;}
  }
  return Object.freeze({handle});
}

// Railway private networking avoids public proxy request/idle limits. Native
// HTTP has no fetch headers deadline; the composed request signal bounds all I/O.
function postInternal(url,{body,headers,signal,requestImpl}) {
  return new Promise((resolve,reject)=>{
    const request=requestImpl(url,{method:'POST',headers,signal,agent:false},response=>{
      response.on('error',reject);
      response.on('aborted',()=>reject(new Error('discord_chat_unavailable')));
      if(response.statusCode<200||response.statusCode>=300){
        reject(new Error('discord_chat_unavailable'));response.destroy();return;
      }
      const chunks=[];let bytes=0;
      response.on('data',chunk=>{
        bytes+=chunk.length;
        if(bytes>250000){reject(new Error('discord_chat_invalid_response'));response.destroy();return;}
        chunks.push(chunk);
      });
      response.on('end',()=>response.complete
        ?resolve(Buffer.concat(chunks).toString('utf8')):reject(new Error('discord_chat_unavailable')));
    });
    request.on('error',reject);
    request.end(body);
  });
}

export function createDiscordChatRemote({baseUrl,secret,fetchImpl=globalThis.fetch,internalRequestImpl=httpRequest,timeoutMs=1230000} = {}) {
  let base,internal=false;
  try {
    const url=new URL(baseUrl);
    if(!url.username&&!url.password&&!url.search&&!url.hash&&url.pathname==='/'){
      if(url.protocol==='https:')base=url.origin;
      else {
        const match=typeof baseUrl==='string'&&/^http:\/\/[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.railway\.internal:([1-9][0-9]{0,4})\/?$/.exec(baseUrl);
        if(match&&Number(match[1])<=65535){base=url.origin;internal=true;}
      }
    }
  }catch{}
  const configured=Boolean(base&&typeof secret==='string'&&secret.length>=32&&!/[\r\n]/.test(secret));
  async function post(path,value,signal) {
    if(!configured)throw new Error('discord_chat_not_configured');
    const requestSignal=AbortSignal.any([AbortSignal.timeout(timeoutMs),...(signal?[signal]:[])]);
    const headers={authorization:`Bearer ${secret}`,'content-type':'application/json'},body=JSON.stringify(value);
    if(internal)return postInternal(`${base}/internal/discord/${path}`,{body,headers,signal:requestSignal,requestImpl:internalRequestImpl});
    const response=await fetchImpl(`${base}/internal/discord/${path}`,{method:'POST',redirect:'error',
      headers,body,signal:requestSignal});
    if(!response.ok){await response.body?.cancel();throw new Error('discord_chat_unavailable');}
    const reader=response.body.getReader();const chunks=[];let bytes=0;
    try{while(true){const part=await reader.read();if(part.done)break;bytes+=part.value.byteLength;
      if(bytes>250000)throw new Error('discord_chat_invalid_response');chunks.push(part.value);}return Buffer.concat(chunks).toString('utf8');}
    finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
  }
  return Object.freeze({configured,
    async authorize({guildId,channelId,userId,signal}) {
      const result=JSON.parse(await post('authorize',{guildId,channelId,userId},signal));
      if(result.status!=='ready'||typeof result.sourceProfileId!=='string')throw new Error('discord_chat_denied');
      return {...result,principal:{id:`discord:${guildId}:${userId}`,allowedSourceIds:[]}};
    },
    async runChat({conversation,requestContext,signal,onRecord}) {
      const text=await post('chat',{guildId:requestContext.actor.guildId,channelId:requestContext.channelId,
        userId:requestContext.actor.userId,requestId:requestContext.requestId,sourceProfileId:requestContext.sourceProfileId,conversation},signal);
      for(const line of text.split('\n'))if(line)await onRecord(JSON.parse(line));
    },
  });
}
