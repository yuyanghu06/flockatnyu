import {readDiscordConfig} from './config.js';
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const snowflake = value => typeof value === 'string' && /^[0-9]{1,20}$/.test(value);
const member = value => value === 'local-development' || uuid(value);
const timestamp = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
const channelRow = r => ({sourceId:r.source_id,channelId:r.channel_id,guildId:r.guild_id,title:r.title,enabled:r.enabled,backfillFrom:r.backfill_from,...(r.policy_revision!=null?{policyRevision:Number(r.policy_revision)}:{})});
const revision = value => Number.isSafeInteger(value) && value > 0;
const policyRow = r => r ? {guildId:r.guild_id,revision:Number(r.revision),paused:r.paused,discoveryEnabled:r.discovery_enabled,excludedCategoryIds:r.excluded_category_ids,excludedChannelIds:r.excluded_channel_ids,backfillFrom:r.backfill_from} : null;
const stateRow = r => r ? {sourceId:r.source_id,lastSuccessAt:r.last_success_at,windowFrom:r.window_from,windowTo:r.window_to,before:r.before_cursor,status:r.status} : null;
function scope(principal) { return member(principal?.id) && Array.isArray(principal.allowedSourceIds) && principal.allowedSourceIds.length > 0 && principal.allowedSourceIds.length <= 100 && principal.allowedSourceIds.every(uuid) ? {member:principal.id,sources:[...new Set(principal.allowedSourceIds)]} : null; }
export function createDiscordStore({env = process.env,fetchImpl = globalThis.fetch} = {}) {
  let base;
  try { const u = new URL(env.SUPABASE_URL); if ((u.protocol === 'https:' || u.protocol === 'http:' && ['localhost','127.0.0.1','[::1]'].includes(u.hostname)) && !u.username && !u.password && !u.search && !u.hash) base = u.origin; } catch {}
  const key = (env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  const configured = Boolean(base && key && typeof fetchImpl === 'function'), embedding = readDiscordConfig(env).embedding;
  async function rpc(name,args,signal) {
    if (!configured) return {status:'not_configured'};
    if (signal?.aborted) return {status:'aborted'};
    try {
      const timeout = AbortSignal.timeout(name==='discord_rebuild_memory'?65000:12000), combined = signal ? AbortSignal.any([signal,timeout]) : timeout;
      const response = await fetchImpl(`${base}/rest/v1/rpc/${name}`,{method:'POST',headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify(args),signal:combined,redirect:'error'});
      if (!response.ok) {
        if (response.status===400) {
          try { const error=await response.json(); if (error.code==='40001') return {status:'stale'}; if (error.code==='23514') return {status:'invalid_request'}; } catch {}
        }
        return {status:response.status === 401 || response.status === 403 ? 'forbidden' : response.status === 409 ? 'stale' : 'unavailable'};
      }
      const raw = await response.text(); if (raw.length > 3000000) return {status:'unavailable'};
      return {status:'ready',data:raw?JSON.parse(raw):null};
    } catch { return {status:signal?.aborted?'aborted':'unavailable'}; }
  }
  async function listChannels({principal,signal} = {}) {
    if (!member(principal?.id) || principal.isAdmin !== true) return {status:'forbidden',channels:[]};
    const r = await rpc('discord_list_channels',{p_member_id:principal.id},signal);
    return r.status === 'ready' && Array.isArray(r.data) ? {status:'ready',channels:r.data.map(channelRow)} : {status:r.status === 'ready'?'unavailable':r.status,channels:[]};
  }
  async function configureChannel({principal,channel,signal} = {}) {
    if (!member(principal?.id) || principal.isAdmin !== true) return {status:'forbidden'};
    if (!channel || !snowflake(channel.channelId) || !snowflake(channel.guildId) || channel.sourceId != null && !uuid(channel.sourceId) || typeof channel.title !== 'string' || !channel.title.trim() || channel.title.length > 300 || typeof channel.enabled !== 'boolean' || channel.backfillFrom != null && (!timestamp(channel.backfillFrom) || Date.parse(channel.backfillFrom) > Date.now())) return {status:'invalid_request'};
    const r = await rpc('discord_configure_channel',{p_member_id:principal.id,p_channel:{source_id:channel.sourceId??null,channel_id:channel.channelId,guild_id:channel.guildId,title:channel.title.trim(),enabled:channel.enabled,backfill_from:timestamp(channel.backfillFrom)||'2026-01-01T05:00:00.000Z'}},signal);
    return r.status === 'ready' && r.data?.source_id ? {status:'ready',channel:channelRow(r.data)} : {status:r.status==='ready'?'unavailable':r.status};
  }
  async function listSyncChannels({signal} = {}) {
    const r = await rpc('discord_sync_channels',{},signal);
    return r.status === 'ready' && Array.isArray(r.data) ? {status:'ready',channels:r.data.map(channelRow)} : {status:r.status==='ready'?'unavailable':r.status,channels:[]};
  }
  async function getSyncState({sourceId,signal} = {}) {
    if (!uuid(sourceId)) return {status:'invalid_request'};
    const r = await rpc('discord_get_sync_state',{p_source_id:sourceId},signal);
    return {status:r.status,state:r.status === 'ready'?stateRow(r.data):null};
  }
  async function persistPage({channel,messages,state,signal} = {}) {
    if (!uuid(channel?.sourceId) || !Array.isArray(messages) || messages.length > 100 || messages.some(m => !snowflake(m.messageId) || m.channelId !== channel.channelId || m.guildId !== channel.guildId) || !state) return {status:'invalid_request'};
    const r = await rpc('discord_persist_page',{p_source_id:channel.sourceId,p_messages:messages.map(m => ({message_id:m.messageId,channel_id:m.channelId,guild_id:m.guildId,author_id:m.authorId,created_at:m.createdAt,edited_at:m.editedAt,reply_to_message_id:m.replyToMessageId,content:m.content,embedding_text:m.embeddingText,payload:m.payload,content_hash:m.contentHash,url:m.url})),p_state:{last_success_at:state.lastSuccessAt,window_from:state.windowFrom,window_to:state.windowTo,before_cursor:state.before,status:state.status,expected_before:state.expectedBefore,expected_window_to:state.expectedWindowTo,expected_last_success_at:state.expectedLastSuccessAt,...(state.expectedPolicyRevision!=null||channel.policyRevision!=null?{expected_policy_revision:state.expectedPolicyRevision??channel.policyRevision}:{})}},signal);
    return {status:r.status==='ready'?(r.data===true?'ready':'stale'):r.status};
  }
  async function listEmbeddingWork({limit = 16,signal} = {}) {
    if (!embedding.configured) return {status:'not_configured',messages:[]};
    const r = await rpc('discord_embedding_work',{p_limit:Math.max(1,Math.min(64,limit)),p_model:embedding.model,p_provider:embedding.provider},signal);
    return r.status === 'ready' && Array.isArray(r.data) ? {status:'ready',messages:r.data.map(m => ({messageId:m.message_id,contentHash:m.content_hash,content:m.content,embeddingText:m.embedding_text}))} : {status:r.status==='ready'?'unavailable':r.status,messages:[]};
  }
  async function saveEmbedding({messageId,contentHash,model,provider,vector,signal} = {}) {
    if (!snowflake(messageId) || typeof contentHash !== 'string' || !/^[0-9a-f]{64}$/.test(contentHash) || !model || !provider || !Array.isArray(vector) || vector.length !== 1536 || vector.some(v => typeof v !== 'number' || !Number.isFinite(v))) return {status:'invalid_request'};
    const r = await rpc('discord_save_embedding',{p_message_id:messageId,p_content_hash:contentHash,p_model:model,p_provider:provider,p_vector:JSON.stringify(vector)},signal);
    return {status:r.status==='ready'?(r.data===true?'ready':'stale'):r.status};
  }
  async function search({query = '',channelIds = [],authorId = null,authorName = null,from = null,to = null,mode = 'text',vector = null,principal,limit = 5,signal} = {}) {
    if (mode === 'relevance') mode = 'text';
    const auth = scope(principal); if (!auth) return {status:'forbidden',sources:[]};
    if (typeof query !== 'string' || query.length > 500 || !Array.isArray(channelIds) || channelIds.length > 100 || !channelIds.every(snowflake) || authorId != null && !snowflake(authorId) || authorName != null && (typeof authorName !== 'string' || !authorName.trim() || authorName.length > 100) || from != null && !timestamp(from) || to != null && !timestamp(to) || from && to && Date.parse(from)>=Date.parse(to) || !['text','latest','semantic'].includes(mode) || mode === 'semantic' && (!embedding.configured || !Array.isArray(vector) || vector.length !== 1536 || vector.some(v => typeof v !== 'number' || !Number.isFinite(v))) || !query.trim() && !from && !to && !authorId && !authorName && mode !== 'latest') return {status:'invalid_request',sources:[]};
    const count = Number.isInteger(limit)?Math.max(1,Math.min(8,limit)):5;
    const r = await rpc('discord_search',{p_member_id:auth.member,p_allowed_source_ids:auth.sources,p_query:query.trim(),p_channel_ids:channelIds,p_author_id:authorId,p_author_name:authorName?.trim()??null,p_from:timestamp(from),p_to:timestamp(to),p_mode:mode,p_vector:mode==='semantic'?JSON.stringify(vector):null,p_model:embedding.model||null,p_provider:embedding.provider||null,p_limit:count},signal);
    if (r.status !== 'ready' || !Array.isArray(r.data)) return {status:r.status==='ready'?'unavailable':r.status,sources:[]};
    let budget = 12000;
    const sources = [];
    for (const row of r.data.slice(0,count)) {
      if (!uuid(row.id) || !auth.sources.includes(row.source_id) || !snowflake(row.message_id) || !snowflake(row.channel_id) || channelIds.length && !channelIds.includes(row.channel_id)) continue;
      const excerpt = typeof row.excerpt==='string'?row.excerpt.slice(0,Math.min(1800,budget)):''; budget -= excerpt.length; if (!excerpt) continue;
      const url = `https://discord.com/channels/${row.guild_id}/${row.channel_id}/${row.message_id}`;
      sources.push({id:row.id,documentId:row.id,sourceId:row.source_id,title:String(row.title||'Discord message').slice(0,300),url,excerpt,sourceUpdatedAt:timestamp(row.edited_at||row.created_at),indexedAt:timestamp(row.indexed_at),kind:'discord',messageId:row.message_id,channelId:row.channel_id,authorId:row.author_id,createdAt:timestamp(row.created_at),replyToMessageId:row.reply_to_message_id||null});
    }
    return {status:sources.length?'ready':'empty',sources};
  }
  async function getPolicy({guildId,signal} = {}) {
    if (!snowflake(guildId)) return {status:'invalid_request',policy:null};
    const r=await rpc('discord_get_policy',{p_guild_id:guildId},signal);
    if (r.status!=='ready') return {status:r.status,policy:null};
    if (r.data==null) return {status:'not_configured',policy:null};
    const policy=policyRow(r.data);
    return policy?.guildId===guildId&&revision(policy.revision)?{status:'ready',policy}:{status:'unavailable',policy:null};
  }
  async function configurePolicy({principal,guildId,policy,expectedRevision=null,signal} = {}) {
    if (!member(principal?.id)||principal.isAdmin!==true) return {status:'forbidden'};
    if (!snowflake(guildId)||expectedRevision!=null&&!revision(expectedRevision)||!policy||typeof policy.paused!=='boolean'||typeof policy.discoveryEnabled!=='boolean'||![policy.excludedCategoryIds,policy.excludedChannelIds].every(v=>Array.isArray(v)&&v.length<=500&&v.every(snowflake))||policy.backfillFrom!=null&&!timestamp(policy.backfillFrom)) return {status:'invalid_request'};
    const r=await rpc('discord_configure_policy',{p_member_id:principal.id,p_guild_id:guildId,p_expected_revision:expectedRevision,p_policy:{paused:policy.paused,discovery_enabled:policy.discoveryEnabled,excluded_category_ids:policy.excludedCategoryIds,excluded_channel_ids:policy.excludedChannelIds,backfill_from:timestamp(policy.backfillFrom)||'2015-01-01T00:00:00.000Z'}},signal);
    return r.status==='ready'&&r.data?.guild_id===guildId?{status:'ready',policy:policyRow(r.data)}:{status:r.status==='ready'?'unavailable':r.status};
  }
  async function getDiscoveryState({guildId,signal} = {}) {
    if (!snowflake(guildId)) return {status:'invalid_request',state:null};
    const r=await rpc('discord_get_discovery_state',{p_guild_id:guildId},signal);
    return {status:r.status,state:r.status==='ready'?r.data:null};
  }
  async function persistDiscovery({guildId,expectedPolicyRevision,expectedGeneration=null,expectedState=null,channels=[],state,signal} = {}) {
    if (!snowflake(guildId)||!revision(expectedPolicyRevision)||expectedGeneration!=null&&!uuid(expectedGeneration)||!Array.isArray(channels)||channels.length>100||!state||!uuid(state.generation)||state.policyRevision!==expectedPolicyRevision||JSON.stringify(state).length>3000000||channels.some(c=>!snowflake(c.channelId)||c.guildId!==guildId||c.parentId!=null&&!snowflake(c.parentId)||typeof c.title!=='string'||!c.title.trim()||c.title.length>300||typeof c.eligible!=='boolean')) return {status:'invalid_request'};
    const r=await rpc('discord_persist_discovery',{p_guild_id:guildId,p_expected_policy_revision:expectedPolicyRevision,p_expected_generation:expectedGeneration,p_expected_state:expectedState,p_channels:channels,p_state:state},signal);
    return {status:r.status==='ready'?(r.data===true?'ready':'stale'):r.status};
  }
  async function completeDiscovery({guildId,generation,expectedPolicyRevision,expectedState=null,state,signal} = {}) {
    if (!snowflake(guildId)||!uuid(generation)||!revision(expectedPolicyRevision)||state?.phase!=='complete'||state.generation!==generation||state.policyRevision!==expectedPolicyRevision) return {status:'invalid_request'};
    const r=await rpc('discord_complete_discovery',{p_guild_id:guildId,p_generation:generation,p_expected_policy_revision:expectedPolicyRevision,p_expected_state:expectedState,p_state:state},signal);
    return {status:r.status==='ready'?(r.data===true?'ready':'stale'):r.status};
  }
  async function resetArchive({principal,guildId,expectedPolicyRevision,signal} = {}) {
    if (!member(principal?.id)||principal.isAdmin!==true) return {status:'forbidden'};
    if (!snowflake(guildId)||!revision(expectedPolicyRevision)) return {status:'invalid_request'};
    const r=await rpc('discord_reset_archive',{p_member_id:principal.id,p_guild_id:guildId,p_expected_revision:expectedPolicyRevision},signal);
    return {status:r.status,result:r.status==='ready'?r.data:null};
  }
  async function rebuildMemory({guildId,expectedPolicyRevision,asOf=new Date().toISOString(),signal} = {}) {
    if (!snowflake(guildId)||!revision(expectedPolicyRevision)||!timestamp(asOf)) return {status:'invalid_request'};
    const r=await rpc('discord_rebuild_memory',{p_guild_id:guildId,p_expected_revision:expectedPolicyRevision,p_as_of:timestamp(asOf)},signal);
    return {status:r.status,result:r.status==='ready'?r.data:null};
  }
  async function listMemory({principal,tier=null,after=null,limit=20,signal} = {}) {
    const auth=scope(principal); if (!auth) return {status:'forbidden',buckets:[]};
    if (tier!=null&&!['daily','weekly','monthly'].includes(tier)||after!=null&&!uuid(after)||!Number.isInteger(limit)||limit<1||limit>100) return {status:'invalid_request',buckets:[]};
    const r=await rpc('discord_memory_list',{p_member_id:auth.member,p_allowed_source_ids:auth.sources,p_tier:tier,p_after:after,p_limit:limit},signal);
    const buckets=r.status==='ready'&&Array.isArray(r.data)?r.data.filter(b=>uuid(b.id)&&auth.sources.includes(b.source_id)).map(b=>({id:b.id,sourceId:b.source_id,tier:b.tier,periodStart:b.period_start,periodEnd:b.period_end,timezone:b.timezone,asOf:b.as_of,policyRevision:Number(b.policy_revision),messageCount:Number(b.message_count)})):[];
    return {status:r.status==='ready'&&!Array.isArray(r.data)?'unavailable':r.status,buckets};
  }
  async function pageMemory({principal,bucketId,after=null,limit=50,signal} = {}) {
    const auth=scope(principal); if (!auth) return {status:'forbidden',messages:[]};
    if (!uuid(bucketId)||after!=null&&!snowflake(after)||!Number.isInteger(limit)||limit<1||limit>100) return {status:'invalid_request',messages:[]};
    const r=await rpc('discord_memory_page',{p_member_id:auth.member,p_allowed_source_ids:auth.sources,p_bucket_id:bucketId,p_after:after,p_limit:limit},signal);
    const messages=r.status==='ready'&&Array.isArray(r.data)?r.data.filter(m=>snowflake(m.message_id)&&auth.sources.includes(m.source_id)).map(m=>({messageId:m.message_id,sourceId:m.source_id,createdAt:m.created_at,url:m.url,payload:m.payload})):[];
    return {status:r.status==='ready'&&!Array.isArray(r.data)?'unavailable':r.status,messages};
  }
  return Object.freeze({configured,listChannels,configureChannel,listSyncChannels,getSyncState,persistPage,listEmbeddingWork,saveEmbedding,search,getPolicy,configurePolicy,getDiscoveryState,persistDiscovery,completeDiscovery,resetArchive,rebuildMemory,listMemory,pageMemory});
}
