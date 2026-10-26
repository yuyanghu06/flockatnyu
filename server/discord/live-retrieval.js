import {SOURCE_TOOL_TIMEOUT_MS} from '../source-timeout.js';
import {isDiscordChannelExcluded} from './discovery.js';
import {discordSnowflakeAt} from './live-client.js';
import {DISCORD_SCOPES,discordChannelScope,explicitlyRequestedTeam} from './channel-scope.js';

const id = value => typeof value === 'string' && /^[0-9]{1,20}$/.test(value);
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const readable = new Set([0,5,10,11,12]);
const thread = new Set([10,11,12]);
const fail = code => { throw Object.assign(new Error(code), {code}); };
const codes = new Set(['not_configured','forbidden','invalid_request','policy_unavailable','policy_changed','paused','channel_scope_denied','team_request_required','permission_denied','not_found','invalid_token','rate_limited','indexing','discord_unavailable','invalid_response','invalid_cursor','aborted','budget_exhausted']);
const safe = error => codes.has(error?.code) ? error.code : 'discord_unavailable';
const bounded = (value, fallback, max) => Number.isInteger(value) && value > 0 ? Math.min(value,max) : fallback;
const iso = value => typeof value === 'string' && value.length <= 40 && /^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(value) && Number.isFinite(Date.parse(value)) && Date.parse(value) >= 1420070400000 ? new Date(value).toISOString() : null;
function cleanMessage(raw, channelId, guildId) {
  if (!id(raw?.id) || raw.channel_id !== channelId || raw.guild_id != null && raw.guild_id !== guildId || !id(raw.author?.id) || !iso(raw.timestamp) || typeof raw.content !== 'string' || raw.content.length > 100000) fail('invalid_response');
  return {id:raw.id, channel_id:channelId, guild_id:guildId,
    author:{id:raw.author.id, name:String(raw.author.global_name || raw.author.username || raw.author.id).slice(0,100)},
    timestamp:iso(raw.timestamp), edited_timestamp:iso(raw.edited_timestamp), content:raw.content,
    hasNonTextContent:Boolean(raw.attachments?.length || raw.embeds?.length || raw.sticker_items?.length || raw.components?.length || raw.poll),
    replyToMessageId:raw.message_reference?.channel_id === channelId && (!raw.message_reference.guild_id || raw.message_reference.guild_id === guildId) && id(raw.message_reference.message_id) ? raw.message_reference.message_id : null};
}
function envelope(messages, channels, {limit = 8, maxChars = 12000} = {}) {
  let budget = maxChars, trimmed = false;
  const sources = [];
  for (const message of messages) {
    if (sources.length >= limit || budget <= 0) { trimmed = true; break; }
    const full = message.content || (message.hasNonTextContent ? '[Non-text Discord content; attachment/embed bodies were not read.]' : '[No text content returned by Discord.]');
    const excerpt = full.slice(0,Math.min(1800,budget)); budget -= excerpt.length;
    if (excerpt.length < full.length) trimmed = true;
    const channel = channels.get(message.channel_id);
    sources.push({id:`discord:${message.channel_id}:${message.id}`, documentId:`discord:${message.channel_id}:${message.id}`,
      sourceId:channel?.sourceId ?? null, title:`#${channel?.name || message.channel_id} · ${message.author.name}`.slice(0,300),
      url:`https://discord.com/channels/${message.guild_id}/${message.channel_id}/${message.id}`, excerpt,
      kind:'discord', retrieval:'live', messageId:message.id, channelId:message.channel_id, guildId:message.guild_id,
      authorId:message.author.id, authorName:message.author.name, createdAt:message.timestamp,
      sourceUpdatedAt:message.edited_timestamp || message.timestamp, indexedAt:null, replyToMessageId:message.replyToMessageId});
  }
  return {sources, trimmed};
}

/** RAM-only live reads scoped by server configuration and current channel policy. */
export function createLiveDiscordRetrieval({config, store, client} = {}) {
  const configured = Boolean(config?.configured && id(config.guildId) && store?.getPolicy && store?.listSyncChannels && client?.getChannel && client?.getGuildChannels && client?.getCurrentApplication && client?.configured !== false);
  const maxChannels = bounded(config?.maxChannels,16,30);
  const maxPages = bounded(config?.maxPages,20,100), maxMessages = bounded(config?.maxMessages,2000,10000);
  const maxRuntimeMs = bounded(config?.maxRuntimeMs,SOURCE_TOOL_TIMEOUT_MS,120000), maxInputChars = bounded(config?.maxInputChars,500000,2000000);
  async function readAuthorizationPair(signal) {
    if('getAuthorizationSnapshot' in store) {
      if(typeof store.getAuthorizationSnapshot!=='function')fail('policy_unavailable');
      const snapshot=await store.getAuthorizationSnapshot({guildId:config.guildId,signal});
      return [snapshot,snapshot];
    }
    return Promise.all([store.getPolicy({guildId:config.guildId,signal}),store.listSyncChannels({signal})]);
  }
  async function context(principal, signal, userMessage) {
    if (principal?.liveDiscord?.mode !== 'local-operator' || principal.liveDiscord.guildId !== config?.guildId) fail('forbidden');
    const allowed = principal.allowedSourceIds;
    if (!Array.isArray(allowed) || !allowed.length || allowed.length > 500 || !allowed.every(uuid)) fail('forbidden');
    let allowedSources = new Set(allowed);
    if (principal.liveDiscord.transport === 'discord-chat') {
      const scoped = principal.liveDiscord.allowedSourceIds;
      if (!Array.isArray(scoped) || !scoped.length || scoped.length > 500 || !scoped.every(uuid)) fail('forbidden');
      // Full shared sources authorize the other assistant adapters. Discord
      // reads additionally require the current destination's audience subset.
      allowedSources = new Set(scoped.filter(sourceId => allowedSources.has(sourceId)));
      if (!allowedSources.size) fail('forbidden');
    }
    if (!configured) fail('not_configured');
    if (signal?.aborted) fail('aborted');
    const [[policyResult,catalogueResult],metadata,application] = await Promise.all([
      readAuthorizationPair(signal), client.getGuildChannels({signal}), client.getCurrentApplication({signal})]);
    if (!Number.isSafeInteger(application?.flags) || application.flags < 0 || !(BigInt(application.flags) & ((1n << 18n) | (1n << 19n)))) fail('permission_denied');
    const policy = policyResult?.policy;
    if (policyResult?.status !== 'ready' || !policy || policy.guildId !== config.guildId || !Number.isSafeInteger(policy.revision) || policy.revision < 1 || !Array.isArray(policy.excludedChannelIds) || !Array.isArray(policy.excludedCategoryIds) || [...policy.excludedChannelIds,...policy.excludedCategoryIds].some(value => !id(value))) fail('policy_unavailable');
    if (policy.paused) fail('paused');
    if (catalogueResult?.status !== 'ready' || !Array.isArray(catalogueResult.channels) || catalogueResult.channels.length > 10000 || !Array.isArray(metadata) || metadata.length > 500) fail('policy_unavailable');
    const channels = new Map();
    for (const row of metadata) {
      if (!id(row?.id) || row.guild_id !== config.guildId || !Number.isInteger(row.type) || row.parent_id != null && !id(row.parent_id) || channels.has(row.id)) fail('invalid_response');
      channels.set(row.id,{...row,name:String(row.name || '').slice(0,100)});
    }
    const catalogue = catalogueResult.channels.filter(row => row?.enabled === true && row.guildId === config.guildId && id(row.channelId) && allowedSources.has(row.sourceId));
    const registered = new Map(catalogue.map(row => [row.channelId,row]));
    const checkedSources = new Map();
    async function check(channelId) {
      if (!id(channelId)) fail('invalid_request');
      if (!registered.has(channelId)) fail('channel_scope_denied');
      if (policy.excludedChannelIds.includes(channelId) || policy.excludedCategoryIds.includes(channelId)) fail('channel_scope_denied');
      const detail = await client.getChannel({channelId,signal});
      if (detail?.id !== channelId || detail.guild_id !== config.guildId || !readable.has(detail.type) || !Object.hasOwn(detail,'parent_id') || detail.parent_id !== null && !id(detail.parent_id)) fail('channel_scope_denied');
      channels.set(channelId,{id:detail.id,guild_id:detail.guild_id,type:detail.type,parent_id:detail.parent_id ?? null,name:String(detail.name || '').slice(0,100),sourceId:registered.get(channelId)?.sourceId ?? null});
      if (thread.has(detail.type)) {
        if (!id(detail.parent_id)) fail('channel_scope_denied');
        const parent = await client.getChannel({channelId:detail.parent_id,allowContainer:true,signal});
        if (parent?.id !== detail.parent_id || parent.guild_id !== config.guildId || ![0,5,15,16].includes(parent.type) || !Object.hasOwn(parent,'parent_id') || parent.parent_id !== null && !id(parent.parent_id)) fail('channel_scope_denied');
        channels.set(parent.id,{id:parent.id,guild_id:parent.guild_id,type:parent.type,parent_id:parent.parent_id ?? null,name:String(parent.name || '').slice(0,100),sourceId:registered.get(parent.id)?.sourceId ?? null});
      }
      if (isDiscordChannelExcluded({channel:channels.get(channelId),channels,policy})) fail('channel_scope_denied');
      // Only the service-built Discord principal can implicitly read the exact
      // channel/thread where it was invoked. A thread does not implicitly opt
      // into its team parent or siblings. Website and other team reads retain
      // the existing current-user explicit-request requirement.
      const invokingDestination = principal.liveDiscord.transport === 'discord-chat'
        && id(principal.liveDiscord.invokingChannelId) && principal.liveDiscord.invokingChannelId === channelId;
      if (typeof userMessage === 'string' && discordChannelScope(channels.get(channelId),channels) === 'team'
        && !invokingDestination && !explicitlyRequestedTeam(userMessage,channels.get(channelId),channels)) fail('team_request_required');
      checkedSources.set(channelId,registered.get(channelId).sourceId);
      return channels.get(channelId);
    }
    async function verify() {
      const [latest, refreshed] = await readAuthorizationPair(signal);
      if (latest?.status !== 'ready' || latest.policy?.revision !== policy.revision || latest.policy?.paused || JSON.stringify(latest.policy.excludedChannelIds) !== JSON.stringify(policy.excludedChannelIds) || JSON.stringify(latest.policy.excludedCategoryIds) !== JSON.stringify(policy.excludedCategoryIds)) fail('policy_changed');
      if (refreshed?.status !== 'ready' || !Array.isArray(refreshed.channels) || refreshed.channels.length > 10000) fail('policy_unavailable');
      const current = new Map(refreshed.channels.filter(row => row?.enabled === true && row.guildId === config.guildId
        && allowedSources.has(row.sourceId)).map(row => [row.channelId,row.sourceId]));
      // Discovery can withdraw channels without changing the policy revision.
      // Discard in-flight evidence unless every consumed source remains allowed.
      for (const [channelId,sourceId] of checkedSources) if (current.get(channelId) !== sourceId) fail('policy_changed');
    }
    return {policy,catalogue,registered,channels,check,verify};
  }
  async function run(args, operation) {
    const signal = args?.signal ? AbortSignal.any([args.signal,AbortSignal.timeout(maxRuntimeMs)]) : AbortSignal.timeout(maxRuntimeMs);
    try {
      const ctx = await context(args?.principal,signal,args?.userMessage);
      const result = await operation(ctx,signal);
      await ctx.verify();
      if(signal.aborted)fail('aborted');
      return result;
    } catch (error) {
      const status = signal.aborted ? 'aborted' : safe(error);
      return {status,sources:[],coverage:{complete:false,matchedCount:0,returnedCount:0,reason:status}};
    }
  }
  async function getCatalogue(args = {}) {
    if (args.scope != null && !DISCORD_SCOPES.includes(args.scope)) return {status:'invalid_request',sources:[],channels:[]};
    if (args.query != null && (typeof args.query !== 'string' || args.query.length > 100)) return {status:'invalid_request',sources:[],channels:[]};
    return run(args, async (ctx,signal) => {
      const normalize = value => String(value || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
      const query = normalize(args.query);
      const matchesQuery = row => {
        if (!query || normalize(row.title).includes(query)) return true;
        let channel = ctx.channels.get(row.channelId); const seen = new Set();
        while (channel && !seen.has(channel.id)) {
          seen.add(channel.id);
          if (normalize(channel.name).includes(query)) return true;
          channel = ctx.channels.get(channel.parent_id);
        }
        return false;
      };
      const matching = ctx.catalogue.filter(row => (!ctx.channels.has(row.channelId)||!isDiscordChannelExcluded({channel:ctx.channels.get(row.channelId),channels:ctx.channels,policy:ctx.policy}))
        && (!args.scope || args.scope === 'all' || discordChannelScope(ctx.channels.get(row.channelId),ctx.channels) === args.scope)
        && matchesQuery(row));
      const channels = [], candidates = matching.slice(0,maxChannels); let deniedCount=0, teamDenied=0;
      for (const row of candidates) {
        try { const checked = await ctx.check(row.channelId); channels.push({channelId:checked.id,name:checked.name,sourceId:checked.sourceId,scope:discordChannelScope(checked,ctx.channels)}); }
        catch (error) { if (!['permission_denied','channel_scope_denied','team_request_required','not_found'].includes(error.code)) throw error; deniedCount++; if(error.code==='team_request_required')teamDenied++; }
      }
      return {status:!channels.length&&teamDenied?'team_request_required':'ready',sources:[],channels,complete:matching.length <= maxChannels&&deniedCount===0,reason:matching.length > maxChannels ? 'channel_budget' : deniedCount ? 'channel_access_limited' : null};
    });
  }
  async function search(args = {}) {
    if (args.scope != null && !DISCORD_SCOPES.includes(args.scope)) return {status:'invalid_request',sources:[]};
    if (args.query != null && (typeof args.query !== 'string' || args.query.length > 500) || args.authorId != null && !id(args.authorId) || args.mode != null && !['latest','relevance'].includes(args.mode) || args.channelIds != null && (!Array.isArray(args.channelIds) || !args.channelIds.length || args.channelIds.length > maxChannels || args.channelIds.some(value => !id(value))) || args.from != null && !iso(args.from) || args.to != null && !iso(args.to) || args.from && args.to && iso(args.from) >= iso(args.to) || args.limit != null && (!Number.isInteger(args.limit) || args.limit < 1 || args.limit > 8)) return {status:'invalid_request',sources:[]};
    return run(args, async (ctx,signal) => {
      const requested = args.channelIds ? [...new Set(args.channelIds)] : ctx.catalogue.filter(row => !args.scope || args.scope === 'all' || discordChannelScope(ctx.channels.get(row.channelId),ctx.channels) === args.scope).map(row => row.channelId);
      const selected = requested.slice(0,maxChannels), checkedIds = [];
      for (const channelId of selected) {
        try { await ctx.check(channelId); checkedIds.push(channelId); }
        catch (error) { if (args.channelIds || !['permission_denied','channel_scope_denied','team_request_required','not_found'].includes(error.code)) throw error; }
      }
      if (!checkedIds.length) fail('channel_scope_denied');
      const result = await client.searchMessages({query:args.query || '',channelIds:checkedIds,authorId:args.authorId,from:args.from,to:args.to,mode:args.mode || (args.query ? 'relevance' : 'latest'),signal});
      if (!Array.isArray(result?.messages) || result.messages.length > 25 || !Number.isSafeInteger(result.totalResults) || result.totalResults < 0) fail('invalid_response');
      // Discord's parent-channel filter can return hits from its threads. The
      // original checked parents remain the only expansion boundary: a newly
      // checked thread cannot authorize an unrelated channel or another branch.
      const searchChannelIds = new Set(checkedIds), checkedThreads = new Set(), skippedThreads = new Set();
      const maxThreadChecks = Math.min(maxChannels,25);
      const seen = new Set(), messages = [];
      for (const raw of result.messages) {
        if (!searchChannelIds.has(raw?.channel_id) && !checkedThreads.has(raw?.channel_id)) {
          if (!ctx.registered.has(raw?.channel_id)) fail('channel_scope_denied');
          if (skippedThreads.has(raw.channel_id)) continue;
          if (checkedThreads.size >= maxThreadChecks) { skippedThreads.add(raw.channel_id); continue; }
          // No message body is normalized or exposed before the registered
          // source passes the same fresh bot/ancestry checks as a direct read.
          const detail = await ctx.check(raw.channel_id);
          if (!thread.has(detail.type) || !searchChannelIds.has(detail.parent_id)) fail('channel_scope_denied');
          checkedThreads.add(raw.channel_id);
        }
        const message = cleanMessage(raw,raw.channel_id,config.guildId);
        if (seen.has(message.id)) continue; seen.add(message.id);
        if (args.from && message.timestamp < iso(args.from) || args.to && message.timestamp >= iso(args.to) || args.authorId && message.author.id !== args.authorId) continue;
        messages.push(message);
      }
      const resultEnvelope = envelope(messages,ctx.channels,{limit:args.limit || 5});
      return {status:'ready',sources:resultEnvelope.sources,retrieval:'live',coverage:{complete:false,matchedCount:result.totalResults,returnedCount:resultEnvelope.sources.length,reason:skippedThreads.size ? 'thread_check_budget' : 'bounded_search',channelCoverageComplete:requested.length <= maxChannels && !skippedThreads.size,checkedChannelCount:checkedIds.length + checkedThreads.size,checkedThreadCount:checkedThreads.size,skippedThreadCount:skippedThreads.size,textTruncated:resultEnvelope.trimmed}};
    });
  }
  async function readMessages(args = {}) {
    if (!id(args.channelId) || args.messageId != null && !id(args.messageId) || args.limit != null && (!Number.isInteger(args.limit) || args.limit < 1 || args.limit > 8)) return {status:'invalid_request',sources:[]};
    return run(args, async (ctx,signal) => {
      await ctx.check(args.channelId);
      const limit = args.limit || 5;
      let raw;
      if(args.messageId&&args.context===false) {
        try {raw=[await client.getMessage({channelId:args.channelId,messageId:args.messageId,signal})];}
        catch(error) {
          // Only the exact message GET is terminal absence. Channel, role,
          // membership and final access failures still follow the normal path.
          if(error?.code!=='not_found')throw error;
          return {status:'ready',outcome:'source_missing',sources:[],retrieval:'live',
            missingOriginal:{provider:'discord',guildId:config.guildId,channelId:args.channelId,messageId:args.messageId,
              sourceUrl:`https://discord.com/channels/${config.guildId}/${args.channelId}/${args.messageId}`},
            coverage:{complete:true,matchedCount:0,returnedCount:0,reason:'exact_original_missing',textTruncated:false}};
        }
      } else raw=await client.getMessages({channelId:args.channelId,around:args.messageId,limit,signal});
      if (!Array.isArray(raw) || raw.length > limit) fail('invalid_response');
      const messages = raw.map(message => cleanMessage(message,args.channelId,config.guildId));
      if (args.messageId && args.context === false && messages[0]?.id !== args.messageId) fail('invalid_response');
      const value = envelope(messages,ctx.channels,{limit});
      return {status:'ready',sources:value.sources,retrieval:'live',coverage:{complete:false,matchedCount:messages.length,returnedCount:value.sources.length,reason:args.messageId ? 'message_context' : 'latest_messages',textTruncated:value.trimmed}};
    });
  }
  // The trigger and direct reply target are fetched live on the web service.
  // Embedded referenced_message payloads and collector transport data are never
  // accepted as originals, and a target's own reference is never followed.
  const wantsImages = args => args.includeImageAttachments === true
    && args.principal?.liveDiscord?.transport === 'discord-chat'
    && args.principal.liveDiscord.invokingChannelId === args.channelId;
  // Internal descriptors are opt-in and never part of ordinary source envelopes,
  // read tools or automation. URL/body validation occurs before any download.
  function imageCandidates(raw,origin) {
    if(!Array.isArray(raw.attachments))return [];
    return raw.attachments.slice(0,40).map(file=>({guildId:config.guildId,channelId:raw.channel_id,messageId:raw.id,
      attachmentId:file?.id,name:file?.filename,mimeType:file?.content_type,size:file?.size,url:file?.url,origin}));
  }
  async function verifyChatContextAccess(args={}) {
    if(!id(args.channelId)||!wantsImages({...args,includeImageAttachments:true}))return {status:'forbidden'};
    return run(args,async ctx=>{await ctx.check(args.channelId);return {status:'ready'};});
  }
  async function fetchReplyContext(args={}) {
    if(!id(args.channelId)||!id(args.requestId)||!id(args.actorId))return {status:'invalid_request',sources:[]};
    return run(args,async(ctx,signal)=>{
      await ctx.check(args.channelId);
      if(signal.aborted)fail('aborted');
      let candidates=[],triggerVerified=false;
      const images=()=>wantsImages(args)?{imageCandidates:candidates,triggerVerified}:{};
      const unavailable=reason=>({status:'ready',sources:[],...images(),repliedMessage:{status:'unavailable',reason,triggerMessageId:args.requestId,referencedMessageId:null,message:null}});
      if(typeof client.getMessage!=='function')return unavailable('reply_unavailable');
      const raw=await client.getMessage({channelId:args.channelId,messageId:args.requestId,signal});
      const trigger=cleanMessage(raw,args.channelId,config.guildId);
      if(trigger.id!==args.requestId||trigger.author.id!==args.actorId)fail('invalid_response');
      if(wantsImages(args)){triggerVerified=true;candidates=imageCandidates(raw,'trigger');}
      if(signal.aborted)fail('aborted');
      const reference=raw.message_reference;
      if(reference===undefined||reference===null)return {status:'ready',sources:[],...images(),repliedMessage:{status:'none',reason:null,triggerMessageId:args.requestId,referencedMessageId:null,message:null}};
      if(!reference||typeof reference!=='object'||Array.isArray(reference)
        ||reference.type!==undefined&&reference.type!==0||!id(reference.message_id)
        ||reference.channel_id!==undefined&&reference.channel_id!==args.channelId
        ||reference.guild_id!==undefined&&reference.guild_id!==config.guildId
        ||BigInt(reference.message_id)>=BigInt(args.requestId))return unavailable('invalid_reply_reference');
      const targetRaw=await client.getMessage({channelId:args.channelId,messageId:reference.message_id,signal});
      if(signal.aborted)fail('aborted');
      const target=cleanMessage(targetRaw,args.channelId,config.guildId);
      if(target.id!==reference.message_id||Date.parse(target.timestamp)>Date.parse(trigger.timestamp))fail('invalid_response');
      if(wantsImages(args))candidates.push(...imageCandidates(targetRaw,'reply'));
      candidates=candidates.slice(0,40);
      const base={triggerMessageId:args.requestId,referencedMessageId:target.id};
      if(target.content.length>10000)return {status:'ready',sources:[],...images(),repliedMessage:{...base,status:'partial',reason:'reply_text_budget',message:null}};
      const authorName=String(target.author.name||target.author.id).replace(/[\u0000-\u001f\u007f-\u009f]/g,' ').trim().slice(0,100)||target.author.id;
      const message={id:target.id,channelId:args.channelId,authorId:target.author.id,authorName,
        createdAt:target.timestamp,editedAt:target.edited_timestamp,content:target.content,
        url:`https://discord.com/channels/${config.guildId}/${args.channelId}/${target.id}`,
        hasNonTextContent:target.hasNonTextContent,textTruncated:false};
      return {status:'ready',sources:[],...images(),repliedMessage:{...base,status:target.hasNonTextContent?'partial':'ready',reason:target.hasNonTextContent?'non_text_content':null,message}};
    });
  }
  async function fetchWindow(args = {}) {
    const from = iso(args.from), to = iso(args.to);
    if (!id(args.channelId) || !from || !to || from >= to) return {status:'invalid_request',sources:[],messages:[],coverage:{complete:false,reason:'invalid_request',matchedCount:0,returnedCount:0}};
    return run(args, async (ctx,signal) => {
      const channel = await ctx.check(args.channelId);
      const messages = [], seen = new Set(), candidates=[];
      let before = discordSnowflakeAt(to), pages = 0, chars = 0, complete = false, reason = 'page_budget';
      outer: while (pages < maxPages && messages.length < maxMessages) {
        const limit = Math.min(100,maxMessages - messages.length);
        const page = await client.getMessages({channelId:args.channelId,before,limit,signal}); pages++;
        if (!Array.isArray(page) || page.length > limit) fail('invalid_response');
        if (!page.length) { complete = true; reason = null; break; }
        let previous = BigInt(before), reachedFrom = false;
        for (const raw of page) {
          const message = cleanMessage(raw,args.channelId,config.guildId), current = BigInt(message.id);
          if (current >= previous || seen.has(message.id)) fail('invalid_cursor');
          previous = current; seen.add(message.id);
          if (message.timestamp < from) { reachedFrom = true; continue; }
          if (reachedFrom || message.timestamp >= to) fail('invalid_response');
          if (chars + message.content.length > maxInputChars) { reason = 'input_budget'; break outer; }
          chars += message.content.length; messages.push(message);
          if(wantsImages(args)&&candidates.length<40)candidates.push(...imageCandidates(raw,'recent').slice(0,40-candidates.length));
        }
        before = previous.toString();
        if (reachedFrom) { complete = true; reason = null; break; }
        if (messages.length >= maxMessages) reason = 'message_budget';
      }
      const value = envelope(messages,ctx.channels);
      return {status:complete ? 'ready' : 'partial',retrieval:'live',channel:{channelId:channel.id,name:channel.name,sourceId:channel.sourceId},messages,sources:value.sources,...(wantsImages(args)?{imageCandidates:candidates}:{}),
        coverage:{complete,from,to,pages,matchedCount:messages.length,returnedCount:messages.length,reason,sourceTextTruncated:value.trimmed,contentScope:'top_level_text_only',nonTextMessageCount:messages.filter(message => message.hasNonTextContent).length,snapshot:false}};
    });
  }
  async function readWindow(args = {}) {
    const result = await fetchWindow({...args,includeImageAttachments:false});
    const {messages, ...out} = result;
    if (!messages) return out;
    const sourceChars = out.sources.reduce((n,source) => n + source.excerpt.length,0);
    const fullChars = messages.reduce((n,message) => n + message.content.length,0);
    const trimmed = out.coverage.sourceTextTruncated || messages.length > out.sources.length || fullChars > sourceChars;
    return {...out,coverage:{...out.coverage,fetchedComplete:out.coverage.complete,complete:out.coverage.complete && !trimmed,returnedCount:out.sources.length,textTruncated:trimmed,reason:trimmed ? 'source_budget' : out.coverage.reason}};
  }
  return Object.freeze({configured,search,readMessages,readWindow,fetchWindow,fetchReplyContext,verifyChatContextAccess,getCatalogue});
}
