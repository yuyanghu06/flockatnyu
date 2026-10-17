import {pathToFileURL} from 'node:url';
import {readDiscordConfig} from './config.js';
import {createDiscordClient} from './client.js';
import {createDiscordStore} from './store.js';
import {runDiscordDiscovery} from './discovery.js';

const snowflake = value => typeof value === 'string' && /^[0-9]{1,20}$/.test(value);
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const codes = new Set(['paused','invalid_request','not_configured','database_not_configured','database_unavailable','forbidden','aborted','invalid_token','permission_denied','not_found','rate_limited','discord_unavailable','invalid_response','channel_scope_denied','message_content_required','no_channels','registration_failed','operation_failed']);
const safeCode = code => codes.has(code) ? code : 'operation_failed';
const failure = (code, extra = {}) => ({status:code === 'aborted' ? 'aborted' : 'failed',code:safeCode(code),exitCode:1,...extra});
const fail = code => { throw Object.assign(new Error(safeCode(code)),{code:safeCode(code)}); };
/** Only non-secret operation flags are accepted. Invalid values are never echoed. */
export function parseDiscordCliArgs(argv = []) {
  if (!Array.isArray(argv) || !['preflight','register','discover','policy'].includes(argv[0])) fail('invalid_request');
  const parsed = {command:argv[0],channelIds:[],paused:true};
  const seen = new Set();
  for (let i = 1; i < argv.length; i++) {
    const flag = argv[i], value = argv[++i];
    if (typeof value !== 'string' || !value || value.startsWith('--')) fail('invalid_request');
    if (flag === '--channel' && ['register','preflight'].includes(parsed.command)) {
      if (!snowflake(value)) fail('invalid_request');
      parsed.channelIds.push(value);
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
  return {...options,env,config,store:options.store ?? createDiscordStore({env}),client:options.client ?? createDiscordClient({config})};
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
  return {...deps,channels:selected,details,selectedIds,policy};
}

async function readPolicy({store,config,signal}) {
  if (typeof store.getPolicy !== 'function') return null; // legacy test adapters
  const loaded = await store.getPolicy({guildId:config.guildId,signal});
  if (!['ready','empty','not_configured'].includes(loaded.status)) fail('database_unavailable');
  return loaded.policy ?? null;
}

/** Trusted server CLI management. Database credentials stay server-side;
 * discovery never retrieves original message content. */
export async function runDiscordManagement(options = {}) {
  if (!['policy','discover'].includes(options.command)) return failure('invalid_request');
  try {
    const deps = dependencies(options), {store,config,signal} = deps;
    if (signal?.aborted) fail('aborted');
    if (!store?.configured) fail('database_not_configured');
    if (!snowflake(config.guildId)) fail('not_configured');
    if (options.command === 'discover') {
      const result = await (options.runDiscovery ?? runDiscordDiscovery)(deps);
      return {...result,exitCode:result.status === 'ready' && result.complete ? 0 : 1};
    }
    const id = 'server-operator';
    const principal = {id,isAdmin:true,allowedSourceIds:[]};
    const current = await readPolicy(deps);
    if (options.command === 'policy') {
      const result = await store.configurePolicy({principal,guildId:config.guildId,expectedRevision:current?.revision ?? null,signal,
        policy:{paused:options.paused ?? true,discoveryEnabled:true,
          excludedCategoryIds:options.excludedCategoryIds ?? current?.excludedCategoryIds ?? [],
          excludedChannelIds:options.excludedChannelIds ?? current?.excludedChannelIds ?? []}});
      if (result.status !== 'ready') fail(result.status === 'forbidden' ? 'forbidden' : 'database_unavailable');
      return {status:'ready',exitCode:0,guildId:config.guildId,revision:result.policy.revision,paused:result.policy.paused,
        excludedCategories:result.policy.excludedCategoryIds.length,excludedChannels:result.policy.excludedChannelIds.length};
    }
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
    const operator = 'server-operator';
    if (!Array.isArray(options.channelIds) || !options.channelIds.length) fail('invalid_request');
    const ready = await prepare(options), principal = {id:operator,isAdmin:true,allowedSourceIds:[]};
    // Only the trusted server CLI creates this administrative context.
    const existing = await ready.store.listChannels({principal,signal:ready.signal});
    if (existing.status !== 'ready' || !Array.isArray(existing.channels)) fail(existing.status === 'forbidden' ? 'forbidden' : 'database_unavailable');
    for (const channelId of ready.selectedIds) {
      const old = existing.channels.find(channel => channel.channelId === channelId);
      if (old && old.guildId !== ready.config.guildId) fail('channel_scope_denied');
    }
    // Validate every selected channel before the first configure write. No read
    // access is expanded; threads are only those explicitly supplied by ID.
    for (const channelId of ready.selectedIds) {
      if (ready.signal?.aborted) fail('aborted');
      const detail = ready.details.get(channelId), old = existing.channels.find(channel => channel.channelId === channelId);
      const saved = await ready.store.configureChannel({principal,signal:ready.signal,channel:{channelId,guildId:ready.config.guildId,
        title:typeof detail.name === 'string' && detail.name.trim() ? detail.name.slice(0,300) : `Discord ${channelId}`,
        enabled:true,...(old?.sourceId ? {sourceId:old.sourceId} : {})}});
      if (saved.status !== 'ready') fail(saved.status === 'forbidden' ? 'forbidden' : saved.status === 'aborted' ? 'aborted' : 'registration_failed');
      registered++;
    }
    return {status:'ready',exitCode:0,registered};
  } catch (error) { return failure(options.signal?.aborted ? 'aborted' : error?.code,{registered}); }
}

export async function runDiscordCli({argv = process.argv.slice(2),...options} = {}) {
  try {
    const args = parseDiscordCliArgs(argv), input = {...options,...args};
    if (['policy','discover'].includes(args.command)) return runDiscordManagement(input);
    if (args.command === 'preflight') return runDiscordPreflight(input);
    if (args.command === 'register') return registerDiscordChannels(input);
    return failure('invalid_request');
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
