import {randomUUID} from 'node:crypto';

const snowflake = value => typeof value === 'string' && /^[0-9]{1,20}$/.test(value);
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const parents = new Set([0,5,15,16]), threads = new Set([10,11,12]);
const supported = new Set([0,4,5,10,11,12,15,16]);
const codes = new Set(['invalid_request','not_configured','policy_changed','paused','disabled','database_unavailable','concurrent_discovery','channel_scope_denied','invalid_response','invalid_cursor','permission_denied','invalid_token','not_found','rate_limited','discord_unavailable','aborted','discovery_failed']);
const raise = code => { throw Object.assign(new Error(codes.has(code) ? code : 'discovery_failed'),{code:codes.has(code) ? code : 'discovery_failed'}); };
const safeCode = code => codes.has(code) ? code : 'discovery_failed';
const idOf = channel => channel?.channelId ?? channel?.id;
const parentOf = channel => channel?.parentId ?? channel?.parent_id ?? null;
const guildOf = channel => channel?.guildId ?? channel?.guild_id;
export const DEFAULT_DISCORD_EXCLUSIONS = Object.freeze({
  excludedCategoryIds:Object.freeze(['1461311169586266165','1533053124606955600','1203562092213305371','1203562092376891445']),
  excludedChannelIds:Object.freeze(['1203562091982622819']),
});

/** Unknown/malformed ancestry is denied. Policy IDs do not need to be visible
 * in the current guild response to keep excluding future descendants. */
export function isDiscordChannelExcluded({channel,channels,policy} = {}) {
  if (!channel || !policy || !Array.isArray(policy.excludedCategoryIds) || !Array.isArray(policy.excludedChannelIds)) return true;
  const map = channels instanceof Map ? channels : new Map((Array.isArray(channels) ? channels : []).map(row => [idOf(row),row]));
  const excluded = new Set([...policy.excludedCategoryIds,...policy.excludedChannelIds]);
  const seen = new Set();
  let current = channel;
  while (current) {
    const id = idOf(current);
    if (!snowflake(id) || seen.has(id) || guildOf(current) !== policy.guildId || excluded.has(id)) return true;
    seen.add(id);
    const parentId = parentOf(current);
    if (threads.has(current.type)) {
      const parent = map.get(parentId);
      if (!snowflake(parentId) || !parent || !parents.has(parent.type)) return true;
      current = parent;
    } else if (parents.has(current.type)) {
      if (parentId == null) return false;
      const parent = map.get(parentId);
      if (!snowflake(parentId) || parent?.type !== 4) return true;
      current = parent;
    } else if (current.type === 4) {
      return parentId != null;
    } else return true;
  }
  return true;
}

function metadata(channel,guildId) {
  if (!channel || !snowflake(idOf(channel)) || guildOf(channel) !== guildId || !Number.isInteger(channel.type) || parentOf(channel) != null && !snowflake(parentOf(channel))) raise('channel_scope_denied');
  return {id:idOf(channel),guild_id:guildId,parent_id:parentOf(channel),type:channel.type,
    name:typeof (channel.name ?? channel.title) === 'string' ? (channel.name ?? channel.title).slice(0,300) : '',
    ...(threads.has(channel.type) ? {thread_metadata:{archive_timestamp:channel.thread_metadata?.archive_timestamp ?? null}} : {})};
}
const record = (channel,eligible,accessStatus) => ({channelId:channel.id,guildId:channel.guild_id,parentId:channel.parent_id,type:channel.type,title:channel.name || `Discord ${channel.id}`,eligible,accessStatus});
const integer = (value,fallback,min,max) => value == null ? fallback : Number.isInteger(value) && value >= min && value <= max ? value : (raise('invalid_request'));

/** Metadata-only discovery. Complete generations reconcile disappeared sources;
 * capped/failed generations retain durable per-endpoint archive checkpoints. */
export async function runDiscordDiscovery({config,store,client,now = new Date(),signal,limits = {}} = {}) {
  const result = {status:'not_configured',complete:false,pages:0,channels:0,eligible:0,excluded:0,denied:0,limitations:[]};
  let combined = signal;
  try {
    if (signal?.aborted) raise('aborted');
    if (!config?.configured || !snowflake(config.guildId) || !store?.configured || client?.configured === false) return result;
    const settings = config.discovery ?? {};
    const maxPages = integer(limits.maxPages ?? settings.maxPages,200,1,1000);
    const maxChannels = integer(limits.maxChannels ?? settings.maxChannels,2000,1,10000);
    const maxRuntimeMs = integer(limits.maxRuntimeMs ?? settings.maxRuntimeMs,120000,1,900000);
    const pageSize = integer(limits.pageSize ?? settings.pageSize,100,1,100);
    combined = signal ? AbortSignal.any([signal,AbortSignal.timeout(maxRuntimeMs)]) : AbortSignal.timeout(maxRuntimeMs);
    const loadedPolicy = await store.getPolicy({guildId:config.guildId,signal:combined});
    if (loadedPolicy.status !== 'ready' || !loadedPolicy.policy) raise(loadedPolicy.status === 'not_configured' ? 'not_configured' : 'database_unavailable');
    const policy = loadedPolicy.policy;
    if (policy.guildId !== config.guildId || !Number.isSafeInteger(policy.revision) || !Array.isArray(policy.excludedCategoryIds) || !Array.isArray(policy.excludedChannelIds) || ![...policy.excludedCategoryIds,...policy.excludedChannelIds].every(snowflake)) raise('invalid_request');
    // An explicit metadata preview is allowed while collection is paused. The
    // scheduled sync/backfill caller must check pause before invoking discovery.
    result.policyPaused = policy.paused === true;
    if (!policy.discoveryEnabled) return {...result,status:'disabled'};
    const loaded = await store.getDiscoveryState({guildId:config.guildId,signal:combined});
    if (!['ready','empty'].includes(loaded.status)) raise('database_unavailable');
    let previous = loaded.state ?? null;
    const at = new Date(typeof now === 'function' ? now() : now);
    if (!Number.isFinite(at.getTime())) raise('invalid_request');
    let state = previous && previous.phase !== 'complete' && previous.policyRevision === policy.revision ? structuredClone(previous) :
      {generation:randomUUID(),policyRevision:policy.revision,phase:'channels',parents:[],channelIndex:0,activeThreads:null,activeIndex:0,tasks:[],taskIndex:0,startedAt:at.toISOString()};
    if (!uuid(state.generation) || !['channels','active','archives'].includes(state.phase) || !Array.isArray(state.parents) || state.parents.length > 500 || !Array.isArray(state.tasks)) raise('invalid_response');
    result.generation = state.generation;
    const updateLimitations = snapshot => {
      result.limitations = snapshot.some(row => row.type === 0 && row.accessStatus === 'ready' && !row.canManageThreads) ? ['unjoined_private_archives_not_discovered'] : [];
    };
    updateLimitations(state.parents);
    const seen = new Set();
    async function save(channels,next) {
      if (combined.aborted) raise('aborted');
      const saved = await store.persistDiscovery({guildId:config.guildId,expectedPolicyRevision:policy.revision,
        expectedGeneration:previous?.generation ?? null,expectedState:previous,channels,state:next,signal:combined});
      if (saved.status !== 'ready') raise(saved.status === 'stale' ? 'concurrent_discovery' : saved.status === 'paused' ? 'paused' : saved.status === 'policy_changed' ? 'policy_changed' : 'database_unavailable');
      previous = structuredClone(next); state = next;
      updateLimitations(next.parents);
    }
    const capped = () => result.pages >= maxPages || result.channels >= maxChannels || combined.aborted;
    async function finish() {
      const next = {...state,phase:'complete',completedAt:at.toISOString()};
      const done = await store.completeDiscovery({guildId:config.guildId,generation:state.generation,expectedPolicyRevision:policy.revision,expectedState:previous,state:next,signal:combined});
      if (done.status !== 'ready') raise(done.status === 'stale' ? 'concurrent_discovery' : done.status === 'policy_changed' ? 'policy_changed' : 'database_unavailable');
      return {...result,status:'ready',complete:true};
    }
    async function inspect(channel,map) {
      if (isDiscordChannelExcluded({channel,channels:map,policy})) {
        result.excluded++;
        return record(channel,false,'excluded');
      }
      if (channel.type === 4) return record(channel,false,'metadata');
      if (threads.has(channel.type)) {
        const parent = map.get(channel.parent_id);
        if (parent?.accessStatus !== 'ready') { result.denied++; return record(channel,false,'permission_denied'); }
      }
      try {
        const detail = await client.getChannel({channelId:channel.id,allowContainer:true,signal:combined});
        if (detail?.id !== channel.id || detail.guild_id !== config.guildId || detail.type !== channel.type || parentOf(detail) !== channel.parent_id) raise('channel_scope_denied');
        let permissions = 0n;
        try { permissions = BigInt(detail.botPermissions ?? 0); } catch { raise('invalid_response'); }
        channel.canManageThreads = Boolean(permissions & 8n || permissions & (1n << 34n));
        result.eligible += channel.type === 15 || channel.type === 16 ? 0 : 1;
        return record(channel,channel.type !== 15 && channel.type !== 16,'ready');
      } catch (error) {
        if (['permission_denied','not_found'].includes(error?.code)) { result.denied++; return record(channel,false,error.code); }
        throw error;
      }
    }
    while (!capped()) {
      if (state.phase === 'channels') {
        if (!state.parents.length && !state.channelIndex) {
          const raw = await client.getGuildChannels({signal:combined}); result.pages++;
          if (!Array.isArray(raw) || raw.length > 500) raise('invalid_response');
          const snapshot = raw.map(row => metadata(row,config.guildId)).filter(row => supported.has(row.type) && !threads.has(row.type));
          if (new Set(snapshot.map(row => row.id)).size !== snapshot.length) raise('invalid_response');
          // Categories first; all metadata is saved before any thread registration.
          snapshot.sort((a,b) => (a.type === 4 ? 0 : 1) - (b.type === 4 ? 0 : 1));
          await save([], {...state,parents:snapshot,channelIndex:0,channelsLoaded:true});
        }
        const map = new Map(state.parents.map(row => [row.id,row]));
        const batch = [], nextParents = structuredClone(state.parents);
        let index = state.channelIndex ?? 0;
        while (index < nextParents.length && batch.length < 100 && result.channels < maxChannels && !combined.aborted) {
          const channel = nextParents[index], item = await inspect(channel,map);
          channel.accessStatus = item.accessStatus; map.set(channel.id,channel);
          batch.push(item); index++; result.channels++; seen.add(channel.id);
        }
        const next = {...state,parents:nextParents,channelIndex:index};
        if (index >= nextParents.length) {
          next.phase = 'active';
          next.tasks = nextParents.filter(row => parents.has(row.type) && row.accessStatus === 'ready' && !isDiscordChannelExcluded({channel:row,channels:map,policy})).flatMap(row => [
            {channelId:row.id,kind:'public',before:null},...(row.type === 0 ? [{channelId:row.id,kind:'joinedPrivate',before:null},...(row.canManageThreads ? [{channelId:row.id,kind:'private',before:null}] : [])] : [])]);
        }
        await save(batch,next);
      } else if (state.phase === 'active') {
        if (state.activeThreads == null) {
          const response = await client.getActiveThreads({signal:combined}); result.pages++;
          if (!Array.isArray(response?.threads) || response.threads.length > 10000) raise('invalid_response');
          const snapshot = response.threads.map(row => metadata(row,config.guildId));
          if (snapshot.some(row => !threads.has(row.type))) raise('channel_scope_denied');
          await save([], {...state,activeThreads:[...new Map(snapshot.map(row => [row.id,row])).values()],activeIndex:0});
        }
        const map = new Map(state.parents.map(row => [row.id,row])), batch = [];
        let index = state.activeIndex ?? 0;
        while (index < state.activeThreads.length && batch.length < 100 && result.channels < maxChannels && !combined.aborted) {
          const channel = state.activeThreads[index++];
          if (!seen.has(channel.id)) { batch.push(await inspect(channel,map)); seen.add(channel.id); result.channels++; }
        }
        await save(batch,{...state,activeIndex:index,...(index >= state.activeThreads.length ? {phase:'archives',activeThreads:[]} : {})});
      } else if (state.phase === 'archives') {
        if (state.taskIndex >= state.tasks.length) {
          return await finish();
        }
        const task = state.tasks[state.taskIndex];
        if (!snowflake(task.channelId) || !['public','joinedPrivate','private'].includes(task.kind)) raise('invalid_response');
        const map = new Map(state.parents.map(row => [row.id,row])), parent = map.get(task.channelId);
        if (!parent || parent.accessStatus !== 'ready' || isDiscordChannelExcluded({channel:parent,channels:map,policy})) raise('channel_scope_denied');
        const limit = Math.min(pageSize,maxChannels-result.channels);
        const response = await client.getArchivedThreads({...task,limit,signal:combined}); result.pages++;
        if (!Array.isArray(response?.threads) || response.threads.length > limit || typeof response.hasMore !== 'boolean') raise('invalid_response');
        const snapshot = response.threads.map(row => metadata(row,config.guildId));
        if (snapshot.some(row => row.parent_id !== task.channelId || !threads.has(row.type) || (task.kind === 'public' ? row.type === 12 : row.type !== 12))) raise('channel_scope_denied');
        const cursors = snapshot.map(row => task.kind === 'joinedPrivate' ? row.id : row.thread_metadata?.archive_timestamp);
        if (cursors.some(cursor => task.kind === 'joinedPrivate' ? !snowflake(cursor) || task.before != null && BigInt(cursor) >= BigInt(task.before) : typeof cursor !== 'string' || !Number.isFinite(Date.parse(cursor)) || task.before != null && Date.parse(cursor) >= Date.parse(task.before))) raise('invalid_cursor');
        if (response.hasMore && !snapshot.length) raise('invalid_cursor');
        const before = cursors.length ? task.kind === 'joinedPrivate' ? cursors.reduce((a,b) => BigInt(a) < BigInt(b) ? a : b) : new Date(Math.min(...cursors.map(Date.parse))).toISOString() : task.before;
        const batch = [];
        for (const channel of snapshot) if (!seen.has(channel.id)) { batch.push(await inspect(channel,map)); seen.add(channel.id); }
        result.channels += snapshot.length;
        const tasks = structuredClone(state.tasks); tasks[state.taskIndex].before = before;
        await save(batch,{...state,tasks,taskIndex:state.taskIndex + (response.hasMore ? 0 : 1)});
      }
    }
    // Publishing a finished generation needs no further Discord page and should
    // not be postponed just because its last page exactly met the budget.
    if (!combined.aborted && state.phase === 'archives' && state.taskIndex >= state.tasks.length) return await finish();
    return {...result,status:signal?.aborted ? 'aborted' : 'partial',code:combined.aborted ? 'aborted' : 'budget_exhausted'};
  } catch (error) {
    return {...result,status:signal?.aborted || combined?.aborted ? 'aborted' : 'failed',code:safeCode(error?.code)};
  }
}
