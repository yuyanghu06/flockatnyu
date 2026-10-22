import {SOURCE_TOOL_TIMEOUT_MS} from '../source-timeout.js';
import {loadDiscordChatImages} from './chat-images.js';
import {validateDiscordRepliedMessage} from '../chat-discord-context.js';
const snowflake = value => typeof value === 'string' && /^[0-9]{1,20}$/.test(value);
const label = (value,max) => String(value || '').replace(/[\u0000-\u001f\u007f-\u009f]/g,' ').trim().slice(0,max);

/** Explicitly requested identity directory: these are the only selected fields.
 * No profile UUID, email, avatar, activity or account credential is retrieved. */
export function createDiscordUserDirectory({env=process.env,fetchImpl=globalThis.fetch} = {}) {
  let origin;
  try{const url=new URL(env.SUPABASE_URL);if(url.protocol==='https:'&&!url.username&&!url.password&&!url.search&&!url.hash&&url.pathname==='/')origin=url.origin;}catch{}
  const key=env.SUPABASE_SERVICE_ROLE_KEY;
  return {async read({signal} = {}) {
    if(!origin||!key)return {complete:false,reason:'directory_unavailable',users:[]};
    try {
      const params=new URLSearchParams({select:'discord_user_id,display_name',discord_user_id:'not.is.null',order:'discord_user_id',limit:'1001'});
      const response=await fetchImpl(`${origin}/rest/v1/map_people?${params}`,{method:'GET',redirect:'error',
        signal:AbortSignal.any([AbortSignal.timeout(SOURCE_TOOL_TIMEOUT_MS),...(signal?[signal]:[])]),
        headers:{apikey:key,authorization:`Bearer ${key}`,prefer:'count=exact'}});
      if(!response.ok){await response.body?.cancel();throw new Error('unavailable');}
      const reader=response.body.getReader();let size=0;const chunks=[];
      try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;
        if(size>1000000)throw new Error('oversized');chunks.push(part.value);}}
      finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
      const rows=JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if(!Array.isArray(rows)||rows.length>1001)throw new Error('invalid');
      const total=response.headers.get('content-range')?.match(/\/(\d+)$/)?.[1];
      let complete=total?Number(total)===rows.length:rows.length<1000;
      if(rows.length>1000)complete=false;
      const names=new Map(),conflicts=new Set();
      for(const row of rows.slice(0,1000)) {
        if(!row||Object.keys(row).some(key=>!['discord_user_id','display_name'].includes(key))
          || !snowflake(row.discord_user_id)||typeof row.display_name!=='string'||!label(row.display_name,200)) {complete=false;continue;}
        const name=label(row.display_name,200);
        if(names.has(row.discord_user_id)&&names.get(row.discord_user_id)!==name){conflicts.add(row.discord_user_id);complete=false;}
        names.set(row.discord_user_id,name);
      }
      for(const id of conflicts)names.delete(id);
      return {complete,reason:complete?null:'directory_partial',users:[...names].map(([discordUserId,name])=>({discordUserId,name}))};
    } catch {return {complete:false,reason:signal?.aborted?'aborted':'directory_unavailable',users:[]};}
  }};
}

/** Request-local originals only. History is anchored to the triggering Discord
 * snowflake, not a model-chosen window or a later inference clock. */
export function createDiscordChatContextLoader({liveDiscordService,directory,fetchImpl=globalThis.fetch,maxRuntimeMs=SOURCE_TOOL_TIMEOUT_MS} = {}) {
  return {async load({guildId,channelId,requestId,actorId,principal,signal} = {}) {
    if(![guildId,channelId,requestId].every(snowflake))throw new Error('invalid_discord_context');
    const end=Number((BigInt(requestId)>>22n)+1420070400000n);
    if(!Number.isSafeInteger(end))throw new Error('invalid_discord_context');
    const from=new Date(end-3600000).toISOString(),to=new Date(end).toISOString();
    const contextSignal=AbortSignal.any([AbortSignal.timeout(maxRuntimeMs),...(signal?[signal]:[])]);
    const readReply=typeof liveDiscordService.fetchReplyContext==='function'&&snowflake(actorId);
    const readImages=readReply&&typeof liveDiscordService.verifyChatContextAccess==='function'
      &&principal?.liveDiscord?.transport==='discord-chat'&&principal.liveDiscord.invokingChannelId===channelId;
    const imageOpt=readImages?{includeImageAttachments:true}:{};
    const [result,discordUsers,replyResult]=await Promise.all([
      liveDiscordService.fetchWindow({principal,channelId,from,to,signal:contextSignal,userMessage:'',...imageOpt}).catch(()=>({status:'unavailable',messages:[]})),
      directory.read({signal:contextSignal}),
      readReply?liveDiscordService.fetchReplyContext({principal,channelId,requestId,actorId,signal:contextSignal,userMessage:'',...imageOpt}).catch(()=>({status:'unavailable'})):undefined,
    ]);
    let complete=result.status==='ready'&&result.coverage?.complete===true;
    let reason=complete?null:label(result.coverage?.reason||result.status||'context_unavailable',100).replace(/[^A-Za-z0-9:_-]/g,'_');
    if(!Array.isArray(result.messages)){complete=false;reason='invalid_context_response';}
    const messages=[];let chars=0;
    const seen=new Set();
    const rows=Array.isArray(result.messages)?result.messages:[];
    for(const row of rows) {
      if(!snowflake(row?.id)||row.channel_id!==channelId||row.guild_id!=null&&row.guild_id!==guildId||!snowflake(row.author?.id)
        || typeof row.content!=='string'||typeof row.timestamp!=='string'||!Number.isFinite(Date.parse(row.timestamp))
        || Date.parse(row.timestamp)<end-3600000||Date.parse(row.timestamp)>=end||seen.has(row.id)) {
        complete=false;reason='invalid_context_record';continue;
      }
      seen.add(row.id);
      if(messages.length>=2000||chars+row.content.length>120000||row.content.length>4000){complete=false;reason='context_budget';continue;}
      chars+=row.content.length;
      if(row.hasNonTextContent){complete=false;reason ||= 'non_text_content';}
      messages.push({id:row.id,channelId,authorId:row.author.id,authorName:label(row.author.name||row.author.id,100)||row.author.id,
        createdAt:new Date(row.timestamp).toISOString(),content:row.content});
    }
    messages.sort((a,b)=>a.createdAt.localeCompare(b.createdAt)||(BigInt(a.id)<BigInt(b.id)?-1:1));
    let repliedMessage;
    if(readReply) {
      const unavailable={status:'unavailable',reason:label(replyResult?.status||'reply_unavailable',100).replace(/[^A-Za-z0-9:_-]/g,'_')||'reply_unavailable',triggerMessageId:requestId,referencedMessageId:null,message:null};
      try {repliedMessage=validateDiscordRepliedMessage(replyResult?.status==='ready'?replyResult.repliedMessage:unavailable,{guildId,channelId,requestId});}
      catch {repliedMessage=validateDiscordRepliedMessage({...unavailable,reason:'invalid_reply_context'},{guildId,channelId,requestId});}
    }
    let imageResult;
    if(readImages) {
      if(replyResult?.triggerVerified===true) {
        const acceptedIds=new Set(messages.map(row=>row.id));
        const recent=Array.isArray(result.imageCandidates)?result.imageCandidates.filter(row=>acceptedIds.has(row?.messageId))
          .sort((a,b)=>BigInt(a.messageId)>BigInt(b.messageId)?-1:BigInt(a.messageId)<BigInt(b.messageId)?1:0):[];
        const direct=Array.isArray(replyResult.imageCandidates)?replyResult.imageCandidates:[];
        imageResult=await loadDiscordChatImages({candidates:[...direct,...recent],guildId,channelId,requestId,signal:contextSignal,fetchImpl,maxRuntimeMs});
        let verified;
        try{verified=await liveDiscordService.verifyChatContextAccess({principal,channelId,signal:contextSignal,userMessage:''});}catch{}
        if(verified?.status!=='ready'||contextSignal.aborted)imageResult={imageAttachments:[],imageContext:{status:'unavailable',reason:'access_changed',candidateCount:0,loadedCount:0,images:[]}};
      } else imageResult={imageAttachments:[],imageContext:{status:'unavailable',reason:'trigger_unverified',candidateCount:0,loadedCount:0,images:[]}};
    }
    return {discordContext:{guildId,channelId,from,to,complete,reason:complete?null:reason||'context_partial',messages,...(repliedMessage?{repliedMessage}:{}),
      ...(imageResult?{imageContext:imageResult.imageContext}:{})},discordUsers,...(imageResult?{imageAttachments:imageResult.imageAttachments}:{})};
  }};
}
