import {SOURCE_TOOL_TIMEOUT_MS} from '../source-timeout.js';
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const snowflake = value => typeof value === 'string' && /^[0-9]{1,20}$/.test(value);
// Migration017 derives these stable RPC rows from the policy JSONB catalogue;
// source_id remains a scope identifier, without a knowledge_sources row.
const channelRow = r => ({sourceId:r.source_id,channelId:r.channel_id,guildId:r.guild_id,title:r.title,enabled:r.enabled,...(r.policy_revision!=null?{policyRevision:Number(r.policy_revision)}:{})});
const revision = value => Number.isSafeInteger(value) && value > 0;
const policyRow = r => r ? {guildId:r.guild_id,revision:Number(r.revision),paused:r.paused,discoveryEnabled:r.discovery_enabled,excludedCategoryIds:r.excluded_category_ids,excludedChannelIds:r.excluded_channel_ids} : null;
export function createDiscordStore({env = process.env,fetchImpl = globalThis.fetch} = {}) {
  let base;
  try { const u = new URL(env.SUPABASE_URL); if ((u.protocol === 'https:' || u.protocol === 'http:' && ['localhost','127.0.0.1','[::1]'].includes(u.hostname)) && !u.username && !u.password && !u.search && !u.hash) base = u.origin; } catch {}
  const key = (env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  const configured = Boolean(base && key && typeof fetchImpl === 'function');
  async function rpc(name,args,signal) {
    if (!configured) return {status:'not_configured'};
    if (signal?.aborted) return {status:'aborted'};
    try {
      const timeout = AbortSignal.timeout(SOURCE_TOOL_TIMEOUT_MS), combined = signal ? AbortSignal.any([signal,timeout]) : timeout;
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
    if (principal?.isAdmin !== true) return {status:'forbidden',channels:[]};
    const r = await rpc('discord_list_channels',{p_member_id:principal.id ?? null},signal);
    return r.status === 'ready' && Array.isArray(r.data) ? {status:'ready',channels:r.data.map(channelRow)} : {status:r.status === 'ready'?'unavailable':r.status,channels:[]};
  }
  async function configureChannel({principal,channel,signal} = {}) {
    if (principal?.isAdmin !== true) return {status:'forbidden'};
    if (!channel || !snowflake(channel.channelId) || !snowflake(channel.guildId) || channel.sourceId != null && !uuid(channel.sourceId) || typeof channel.title !== 'string' || !channel.title.trim() || channel.title.length > 300 || typeof channel.enabled !== 'boolean') return {status:'invalid_request'};
    const r = await rpc('discord_configure_channel',{p_member_id:principal.id ?? null,p_channel:{source_id:channel.sourceId??null,channel_id:channel.channelId,guild_id:channel.guildId,title:channel.title.trim(),enabled:channel.enabled,backfill_from:'2015-01-01T00:00:00.000Z'}},signal);
    return r.status === 'ready' && r.data?.source_id ? {status:'ready',channel:channelRow(r.data)} : {status:r.status==='ready'?'unavailable':r.status};
  }
  async function listSyncChannels({signal} = {}) {
    const r = await rpc('discord_sync_channels',{},signal);
    return r.status === 'ready' && Array.isArray(r.data) ? {status:'ready',channels:r.data.map(channelRow)} : {status:r.status==='ready'?'unavailable':r.status,channels:[]};
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
    if (principal?.isAdmin!==true) return {status:'forbidden'};
    if (!snowflake(guildId)||expectedRevision!=null&&!revision(expectedRevision)||!policy||typeof policy.paused!=='boolean'||typeof policy.discoveryEnabled!=='boolean'||![policy.excludedCategoryIds,policy.excludedChannelIds].every(v=>Array.isArray(v)&&v.length<=500&&v.every(snowflake))) return {status:'invalid_request'};
    const r=await rpc('discord_configure_policy',{p_member_id:principal.id ?? null,p_guild_id:guildId,p_expected_revision:expectedRevision,p_policy:{paused:policy.paused,discovery_enabled:policy.discoveryEnabled,excluded_category_ids:policy.excludedCategoryIds,excluded_channel_ids:policy.excludedChannelIds,backfill_from:'2015-01-01T00:00:00.000Z'}},signal);
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
  return Object.freeze({configured,listChannels,configureChannel,listSyncChannels,getPolicy,configurePolicy,getDiscoveryState,persistDiscovery,completeDiscovery});
}
