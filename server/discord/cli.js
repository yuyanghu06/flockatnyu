import {pathToFileURL} from 'node:url';
import {readDiscordConfig} from './config.js';
import {createDiscordClient} from './client.js';
import {createDiscordStore} from './store.js';
import {createEmbeddingProvider} from './embeddings.js';
import {runDiscordSync} from './sync.js';
import {runDiscordDiscovery} from './discovery.js';

export const FULL_HISTORY_FROM = '2015-01-01T00:00:00.000Z';
const snowflake = value => typeof value === 'string' && /^[0-9]{1,20}$/.test(value);
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const codes = new Set(['paused','disabled','policy_changed','discovery_incomplete','discovery_failed','memory_failed','invalid_request','invalid_operator','not_configured','database_not_configured','database_unavailable','forbidden','aborted','invalid_token','permission_denied','not_found','rate_limited','discord_unavailable','invalid_response','channel_scope_denied','message_content_required','no_channels','invalid_backfill','invalid_message','message_too_large','invalid_cursor','concurrent_sync','sync_failed','stalled','run_limit','selection_changed','registration_failed']);
const safeCode = code => codes.has(code) ? code : 'sync_failed';
const failure = (code, extra = {}) => ({status:code === 'aborted' ? 'aborted' : 'failed',code:safeCode(code),exitCode:1,...extra});
const fail = code => { throw Object.assign(new Error(safeCode(code)),{code:safeCode(code)}); };
const instant = value => new Date(typeof value === 'function' ? value() : value ?? Date.now());
const isoTime = value => typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/.test(value) && Number.isFinite(Date.parse(value));

/** Only non-secret operation flags are accepted. Invalid values are never echoed. */
export function parseDiscordCliArgs(argv = []) {
  if (!Array.isArray(argv) || !['preflight','register','backfill','sync','discover','policy','reset','classify'].includes(argv[0])) fail('invalid_request');
  const parsed = {command:argv[0],channelIds:[],from:FULL_HISTORY_FROM,maxRuns:100,paused:true};
  const seen = new Set();
  for (let i = 1; i < argv.length; i++) {
    const flag = argv[i], value = argv[++i];
    if (typeof value !== 'string' || !value || value.startsWith('--')) fail('invalid_request');
    if (flag === '--channel' && ['register','preflight'].includes(parsed.command)) {
      if (!snowflake(value)) fail('invalid_request');
      parsed.channelIds.push(value);
    } else if (flag === '--from' && ['register','policy'].includes(parsed.command) && !seen.has(flag)) {
      if (!isoTime(value)) fail('invalid_backfill');
      parsed.from = new Date(value).toISOString(); seen.add(flag);
    } else if (flag === '--max-runs' && parsed.command === 'backfill' && !seen.has(flag)) {
      if (!/^[1-9][0-9]*$/.test(value) || Number(value) > 10000) fail('invalid_request');
      parsed.maxRuns = Number(value); seen.add(flag);
    } else if (['--exclude-category','--exclude-channel'].includes(flag) && parsed.command === 'policy') {
      if (!snowflake(value)) fail('invalid_request');
      const key = flag === '--exclude-category' ? 'excludedCategoryIds' : 'excludedChannelIds';
      (parsed[key] ??= []).push(value);
    } else if (flag === '--paused' && parsed.command === 'policy' && !seen.has(flag)) {
      if (!['true','false'].includes(value)) fail('invalid_request');
      parsed.paused = value === 'true'; seen.add(flag);
    } else fail('invalid_request');
  }
  parsed.channelIds = [...new Set(parsed.channelIds)];
  if (parsed.channelIds.length > 100 || parsed.command === 'register' && !parsed.channelIds.length) fail('invalid_request');
  if (parsed.command !== 'policy') { delete parsed.excludedCategoryIds; delete parsed.excludedChannelIds; delete parsed.paused; }
  return parsed;
}

function dependencies(options) {
  const env = options.env ?? process.env;
  const config = options.config ?? readDiscordConfig(env);
  return {...options,env,config,store:options.store ?? createDiscordStore({env}),client:options.client ?? createDiscordClient({config}),
    embedder:options.embedder ?? createEmbeddingProvider({config:config.embedding}),runSync:options.runSync ?? runDiscordSync};
}

async function loadStates(store, channels, signal) {
  const states = new Map();
  for (const channel of channels) {
    if (signal?.aborted) fail('aborted');
    const loaded = await store.getSyncState({sourceId:channel.sourceId,signal});
    if (!['ready','empty'].includes(loaded.status)) fail(loaded.status === 'aborted' ? 'aborted' : 'database_unavailable');
    states.set(channel.sourceId,loaded.state ?? null);
  }
  return states;
}

async function prepare(options) {
  const deps = dependencies(options), {config,store,client,signal} = deps;
  if (signal?.aborted) fail('aborted');
  if (!config?.configured || client?.configured === false) fail('not_configured');
  if (!store?.configured) fail('database_not_configured');
  const policy = await readPolicy(deps);
  if (policy?.paused) fail('paused');
  const explicit = deps.channelIds ?? [];
  if (!Array.isArray(explicit) || explicit.length > 100 || !explicit.every(snowflake)) fail('invalid_request');
  // Authenticate both the application and guild before any database mutations.
  const application = await client.getCurrentApplication({signal});
  let flags;
  try { flags = BigInt(application?.flags_new ?? application?.flags ?? 0); } catch { fail('invalid_response'); }
  if ((flags & ((1n << 18n) | (1n << 19n))) === 0n) fail('message_content_required');
  const guild = await client.getGuild({signal});
  if (guild?.id !== config.guildId) fail('channel_scope_denied');
  const listed = await store.listSyncChannels({signal});
  if (listed.status !== 'ready' || !Array.isArray(listed.channels)) fail(listed.status === 'aborted' ? 'aborted' : 'database_unavailable');
  const channels = listed.channels.filter(channel => channel.enabled && channel.guildId === config.guildId);
  const selectedIds = explicit.length ? [...new Set(explicit)] : channels.map(channel => channel.channelId);
  if (!selectedIds.length) fail('no_channels');
  if (selectedIds.length > 10000 || !selectedIds.every(snowflake) || channels.some(channel => !uuid(channel.sourceId))) fail('invalid_request');
  if (policy && selectedIds.some(id => !channels.some(channel => channel.channelId === id))) fail('channel_scope_denied');
  const details = new Map();
  for (const channelId of selectedIds) {
    if (signal?.aborted) fail('aborted');
    const channel = await client.getChannel({channelId,signal});
    if (channel?.id !== channelId || channel.guild_id !== config.guildId || ![0,5,10,11,12].includes(channel.type)) fail('channel_scope_denied');
    // A direct history probe also catches private-thread membership failures.
    const probe = await client.getMessages({channelId,limit:1,signal});
    if (!Array.isArray(probe) || probe.length > 1) fail('invalid_response');
    details.set(channelId,channel);
  }
  const selected = channels.filter(channel => selectedIds.includes(channel.channelId));
  const states = await loadStates(store,selected,signal);
  return {...deps,channels:selected,details,states,selectedIds,policy};
}

async function readPolicy({store,config,signal}) {
  if (typeof store.getPolicy !== 'function') return null; // legacy test adapters
  const loaded = await store.getPolicy({guildId:config.guildId,signal});
  if (!['ready','empty','not_configured'].includes(loaded.status)) fail('database_unavailable');
  return loaded.policy ?? null;
}

async function discoverBeforeCollection(options) {
  const deps = dependencies(options);
  if (!deps.config?.configured || deps.client?.configured === false) fail('not_configured');
  if (!deps.store?.configured) fail('database_not_configured');
  const policy = await readPolicy(deps);
  if (!policy) return;
  if (policy.paused) fail('paused');
  if (!policy.discoveryEnabled) fail('disabled');
  const result = await (options.runDiscovery ?? runDiscordDiscovery)(deps);
  if (result.status !== 'ready' || !result.complete) fail(result.code === 'aborted' ? 'aborted' : 'discovery_incomplete');
}

async function classifyAfterCollection(ready,asOf) {
  if (!ready.policy || typeof ready.store.rebuildMemory !== 'function') return;
  const result = await ready.store.rebuildMemory({guildId:ready.config.guildId,expectedPolicyRevision:ready.policy.revision,asOf:asOf.toISOString(),signal:ready.signal});
  if (result.status !== 'ready') fail('memory_failed');
}

/** Policy/reset operations require the separately provisioned archive operator;
 * management output contains identifiers/counts, never message JSON or secrets. */
export async function runDiscordManagement(options = {}) {
  try {
    const deps = dependencies(options), {store,config,signal,env} = deps;
    if (signal?.aborted) fail('aborted');
    if (!store?.configured) fail('database_not_configured');
    if (!snowflake(config.guildId)) fail('not_configured');
    if (options.command === 'discover') {
      const result = await (options.runDiscovery ?? runDiscordDiscovery)(deps);
      return {...result,exitCode:result.status === 'ready' && result.complete ? 0 : 1};
    }
    const id = env.DISCORD_OPERATOR_MEMBER_ID;
    if (id !== 'local-development' && !uuid(id)) fail('invalid_operator');
    const principal = {id,isAdmin:true,allowedSourceIds:[]};
    const current = await readPolicy(deps);
    if (options.command === 'policy') {
      const result = await store.configurePolicy({principal,guildId:config.guildId,expectedRevision:current?.revision ?? null,signal,
        policy:{paused:options.paused ?? true,discoveryEnabled:true,
          excludedCategoryIds:options.excludedCategoryIds ?? current?.excludedCategoryIds ?? [],
          excludedChannelIds:options.excludedChannelIds ?? current?.excludedChannelIds ?? [],backfillFrom:options.from ?? current?.backfillFrom ?? FULL_HISTORY_FROM}});
      if (result.status !== 'ready') fail(result.status === 'forbidden' ? 'forbidden' : 'database_unavailable');
      return {status:'ready',exitCode:0,guildId:config.guildId,revision:result.policy.revision,paused:result.policy.paused,
        excludedCategories:result.policy.excludedCategoryIds.length,excludedChannels:result.policy.excludedChannelIds.length};
    }
    if (!current) fail('not_configured');
    const admin = await store.listChannels({principal,signal});
    if (admin.status !== 'ready') fail(admin.status === 'forbidden' ? 'forbidden' : 'database_unavailable');
    if (options.command === 'reset') {
      if (!current.paused) fail('invalid_request');
      const result = await store.resetArchive({principal,guildId:config.guildId,expectedPolicyRevision:current.revision,signal});
      if (result.status !== 'ready') fail('database_unavailable');
      return {status:'ready',exitCode:0,guildId:config.guildId,...result.result};
    }
    const result = await store.rebuildMemory({guildId:config.guildId,expectedPolicyRevision:current.revision,asOf:instant(options.now).toISOString(),signal});
    if (result.status !== 'ready') fail('memory_failed');
    return {status:'ready',exitCode:0,guildId:config.guildId,...result.result};
  } catch (error) { return failure(options.signal?.aborted ? 'aborted' : error?.code); }
}

export async function runDiscordPreflight(options = {}) {
  try {
    const ready = await prepare(options);
    return {status:'ready',exitCode:0,guildId:ready.config.guildId,channels:ready.selectedIds.length,database:'ready',messageContent:'enabled'};
  } catch (error) { return failure(options.signal?.aborted ? 'aborted' : error?.code); }
}

export async function registerDiscordChannels(options = {}) {
  let registered = 0;
  try {
    const env = options.env ?? process.env;
    const operator = env.DISCORD_OPERATOR_MEMBER_ID;
    if (operator !== 'local-development' && !uuid(operator)) fail('invalid_operator');
    const now = instant(options.now);
    const from = options.from ?? FULL_HISTORY_FROM;
    if (!isoTime(from) || !Number.isFinite(now.getTime()) || Date.parse(from) < Date.parse(FULL_HISTORY_FROM) || Date.parse(from) >= now.getTime()) fail('invalid_backfill');
    if (!Array.isArray(options.channelIds) || !options.channelIds.length) fail('invalid_request');
    const ready = await prepare(options), principal = {id:operator,isAdmin:true,allowedSourceIds:[]};
    // This guarded RPC proves the operator was already provisioned as an admin.
    const existing = await ready.store.listChannels({principal,signal:ready.signal});
    if (existing.status !== 'ready' || !Array.isArray(existing.channels)) fail(existing.status === 'forbidden' ? 'forbidden' : 'database_unavailable');
    for (const channelId of ready.selectedIds) {
      const old = existing.channels.find(channel => channel.channelId === channelId);
      if (old && old.guildId !== ready.config.guildId) fail('channel_scope_denied');
    }
    // Validate every selected channel before the first configure write. No read
    // grants are created; threads are only those explicitly supplied by ID.
    for (const channelId of ready.selectedIds) {
      if (ready.signal?.aborted) fail('aborted');
      const detail = ready.details.get(channelId), old = existing.channels.find(channel => channel.channelId === channelId);
      const saved = await ready.store.configureChannel({principal,signal:ready.signal,channel:{channelId,guildId:ready.config.guildId,
        title:typeof detail.name === 'string' && detail.name.trim() ? detail.name.slice(0,300) : `Discord ${channelId}`,
        enabled:true,backfillFrom:new Date(from).toISOString(),...(old?.sourceId ? {sourceId:old.sourceId} : {})}});
      if (saved.status !== 'ready') fail(saved.status === 'forbidden' ? 'forbidden' : saved.status === 'aborted' ? 'aborted' : 'registration_failed');
      registered++;
    }
    return {status:'ready',exitCode:0,registered,backfillFrom:new Date(from).toISOString()};
  } catch (error) { return failure(options.signal?.aborted ? 'aborted' : error?.code,{registered}); }
}

const fingerprint = state => JSON.stringify([state?.status ?? null,state?.before ?? null,state?.windowFrom ?? null,state?.windowTo ?? null,state?.lastSuccessAt ?? null]);
const reached = (state,target) => state?.status === 'succeeded' && Number.isFinite(Date.parse(state.lastSuccessAt)) && Date.parse(state.lastSuccessAt) >= target.getTime();
const counts = () => ({runs:0,channelsProcessed:0,pages:0,messages:0,scanned:0,embedded:0});
function addCounts(total,result) {
  for (const key of ['channelsProcessed','pages','messages','scanned','embedded']) if (Number.isSafeInteger(result[key]) && result[key] >= 0) total[key] += result[key];
}

async function invokeSync(ready,store,now) {
  // The generic worker records per-source failures and can continue to another
  // source. Launch commands cancel that run at its first failed operation.
  const cancellation = new AbortController();
  const signal = ready.signal ? AbortSignal.any([ready.signal,cancellation.signal]) : cancellation.signal;
  const client = {...ready.client}, guardedStore = {...store};
  for (const name of ['getChannel','getMessages','getMessage']) if (typeof client[name] === 'function') {
    const operation = client[name];
    client[name] = async args => {
      try { return await operation.call(ready.client,args); }
      catch (error) { cancellation.abort(); throw error; }
    };
  }
  for (const name of ['listSyncChannels','getSyncState','persistPage','listEmbeddingWork','saveEmbedding']) if (typeof store[name] === 'function') {
    guardedStore[name] = async args => {
      try {
        const result = await store[name](args);
        const allowed = name === 'getSyncState' ? ['ready','empty'] : name === 'saveEmbedding' ? ['ready','stale'] : ['ready'];
        if (!allowed.includes(result?.status)) cancellation.abort();
        return result;
      } catch (error) { cancellation.abort(); throw error; }
    };
  }
  return ready.runSync({config:ready.config,store:guardedStore,client,embedder:ready.embedder,now,signal});
}

/** Resume bounded jobs against one fixed target. Progress is proven by saved
 * cursors/watermarks rather than the count of already-idempotent message writes. */
export async function runDiscordBackfill(options = {}) {
  const total = counts();
  try {
    const maxRuns = options.maxRuns ?? 100;
    if (!Number.isInteger(maxRuns) || maxRuns < 1 || maxRuns > 10000) fail('invalid_request');
    const target = instant(options.now);
    if (!Number.isFinite(target.getTime())) fail('invalid_request');
    await discoverBeforeCollection(options);
    const ready = await prepare({...options,channelIds:[]});
    let states = ready.states;
    for (let run = 0; run < maxRuns; run++) {
      if (ready.signal?.aborted) fail('aborted');
      const pending = ready.channels.filter(channel => !reached(states.get(channel.sourceId),target));
      if (!pending.length) { await classifyAfterCollection(ready,target); return {status:'ready',exitCode:0,...total,complete:true,targetAt:target.toISOString()}; }
      const pendingIds = new Set(pending.map(channel => channel.sourceId));
      const scopedStore = {...ready.store,listSyncChannels:async args => {
        const list = await ready.store.listSyncChannels(args);
        if (list.status !== 'ready') return list;
        const channels = list.channels.filter(channel => channel.enabled && channel.guildId === ready.config.guildId && pendingIds.has(channel.sourceId));
        if (channels.length !== pending.length) return {status:'selection_changed',channels:[]};
        return {status:'ready',channels};
      }};
      const result = await invokeSync(ready,scopedStore,target);
      total.runs++; addCounts(total,result);
      if (ready.signal?.aborted || result.errors?.some(error => error.code === 'aborted')) fail('aborted');
      if (result.errors?.length) fail(result.errors[0]?.code);
      if (!['ready','partial'].includes(result.status)) fail(result.status);
      if (!['disabled','ready',undefined].includes(result.embeddingStatus)) fail(result.embeddingStatus);
      const next = await loadStates(ready.store,ready.channels,ready.signal);
      if (pending.every(channel => fingerprint(states.get(channel.sourceId)) === fingerprint(next.get(channel.sourceId)))) fail('stalled');
      states = next;
    }
    const complete = ready.channels.every(channel => reached(states.get(channel.sourceId),target));
    await classifyAfterCollection(ready,target);
    return {status:complete ? 'ready' : 'partial',...(complete ? {} : {code:'run_limit'}),exitCode:complete ? 0 : 1,...total,complete,targetAt:target.toISOString()};
  } catch (error) { return failure(options.signal?.aborted ? 'aborted' : error?.code,{...total,complete:false}); }
}

export async function runDiscordOneShot(options = {}) {
  try {
    await discoverBeforeCollection(options);
    const ready = await prepare({...options,channelIds:[]});
    const selected = new Set(ready.channels.map(channel => channel.sourceId));
    const scopedStore = {...ready.store,listSyncChannels:async args => {
      const list = await ready.store.listSyncChannels(args);
      if (list.status !== 'ready') return list;
      const channels = list.channels.filter(channel => channel.enabled && channel.guildId === ready.config.guildId && selected.has(channel.sourceId));
      return channels.length ? {status:'ready',channels} : {status:'no_channels',channels:[]};
    }};
    const result = await invokeSync(ready,scopedStore,instant(options.now));
    const total = counts(); total.runs = 1; addCounts(total,result);
    if (ready.signal?.aborted || result.errors?.some(error => error.code === 'aborted')) return failure('aborted',total);
    if (result.errors?.length) return failure(result.errors[0]?.code,total);
    if (!['disabled','ready',undefined].includes(result.embeddingStatus)) return failure(result.embeddingStatus,total);
    if (!['ready','partial'].includes(result.status)) return failure(result.status,total);
    if (!result.channelsProcessed || !result.pages) return failure('stalled',total);
    await classifyAfterCollection(ready,instant(options.now));
    return {status:result.status,exitCode:result.status === 'ready' ? 0 : 1,...total,complete:result.status === 'ready'};
  } catch (error) { return failure(options.signal?.aborted ? 'aborted' : error?.code); }
}

export async function runDiscordCli({argv = process.argv.slice(2),...options} = {}) {
  try {
    const args = parseDiscordCliArgs(argv), input = {...options,...args};
    if (['policy','reset','classify','discover'].includes(args.command)) return runDiscordManagement(input);
    if (args.command === 'preflight') return runDiscordPreflight(input);
    if (args.command === 'register') return registerDiscordChannels(input);
    if (args.command === 'backfill') return runDiscordBackfill(input);
    return runDiscordOneShot(input);
  } catch (error) { return failure(error?.code); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const controller = new AbortController();
  const stop = () => controller.abort();
  process.once('SIGTERM',stop); process.once('SIGINT',stop);
  const result = await runDiscordCli({signal:controller.signal});
  console.log(JSON.stringify(result));
  process.exitCode = result.exitCode;
  process.removeListener('SIGTERM',stop); process.removeListener('SIGINT',stop);
}
