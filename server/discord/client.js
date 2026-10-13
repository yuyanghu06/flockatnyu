const snowflake = value => typeof value === 'string' && /^[0-9]{1,20}$/.test(value);
export class DiscordError extends Error { constructor(code) { super(code); this.name = 'DiscordError'; this.code = code; } }
const pause = (ms, signal) => new Promise((resolve, reject) => {
  if (signal?.aborted) return reject(new DiscordError('aborted'));
  const aborted = () => { clearTimeout(timer); reject(new DiscordError('aborted')); };
  const timer = setTimeout(() => { signal?.removeEventListener('abort', aborted); resolve(); }, ms);
  signal?.addEventListener('abort', aborted, {once:true});
});
export function createDiscordClient({config, fetchImpl = globalThis.fetch} = {}) {
  const configured = Boolean(config?.configured && typeof fetchImpl === 'function');
  async function request(path, signal) {
    if (!configured) throw new DiscordError('not_configured');
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const timeout = AbortSignal.timeout(15000), combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
        const response = await fetchImpl(`https://discord.com/api/v10${path}`, {headers:{Authorization:`Bot ${config.botToken}`},signal:combined,redirect:'error'});
        if (response.status === 429) {
          const data = await response.json();
          const delay = Number(data.retry_after);
          if (!Number.isFinite(delay) || delay < 0 || delay > 30 || attempt === 3) throw new DiscordError('rate_limited');
          await pause(Math.max(10, delay * 1000), signal); continue;
        }
        if (!response.ok) throw new DiscordError(response.status === 401 ? 'invalid_token' : response.status === 403 ? 'permission_denied' : response.status === 404 ? 'not_found' : 'discord_unavailable');
        const raw = await response.text();
        if (raw.length > 3000000) throw new DiscordError('response_too_large');
        return JSON.parse(raw);
      } catch (error) { if (error instanceof DiscordError) throw error; throw new DiscordError(signal?.aborted ? 'aborted' : 'discord_unavailable'); }
    }
    throw new DiscordError('rate_limited');
  }
  let botId;
  const knownChannels = new Map();
  async function getCurrentApplication({signal} = {}) {
    const application = await request('/oauth2/applications/@me', signal);
    if (!snowflake(application?.id)) throw new DiscordError('invalid_response');
    return application;
  }
  async function getGuild({signal} = {}) {
    if (!snowflake(config?.guildId)) throw new DiscordError('channel_scope_denied');
    const guild = await request(`/guilds/${config.guildId}`, signal);
    if (guild?.id !== config.guildId) throw new DiscordError('channel_scope_denied');
    return guild;
  }
  function metadata(channel, parentId) {
    if (!channel || !snowflake(channel.id) || channel.guild_id !== config.guildId || !Number.isInteger(channel.type) || channel.parent_id != null && !snowflake(channel.parent_id) || parentId && channel.parent_id !== parentId) throw new DiscordError('channel_scope_denied');
    return {id:channel.id,guild_id:channel.guild_id,type:channel.type,parent_id:channel.parent_id ?? null,
      name:typeof channel.name === 'string' ? channel.name.slice(0,300) : '',
      ...([10,11,12].includes(channel.type) ? {thread_metadata:{archive_timestamp:channel.thread_metadata?.archive_timestamp ?? null}} : {})};
  }
  async function getGuildChannels({signal} = {}) {
    if (!snowflake(config?.guildId)) throw new DiscordError('channel_scope_denied');
    const channels = await request(`/guilds/${config.guildId}/channels`,signal);
    if (!Array.isArray(channels) || channels.length > 500) throw new DiscordError('invalid_response');
    const mapped = channels.map(channel => metadata(channel));
    for (const channel of mapped) knownChannels.set(channel.id,channel);
    return mapped;
  }
  async function getActiveThreads({signal} = {}) {
    if (!snowflake(config?.guildId)) throw new DiscordError('channel_scope_denied');
    const result = await request(`/guilds/${config.guildId}/threads/active`,signal);
    if (!Array.isArray(result?.threads) || result.threads.length > 10000) throw new DiscordError('invalid_response');
    const threads = result.threads.map(channel => metadata(channel));
    if (threads.some(channel => ![10,11,12].includes(channel.type) || !snowflake(channel.parent_id))) throw new DiscordError('channel_scope_denied');
    return {threads};
  }
  async function getArchivedThreads({channelId,kind = 'public',before,limit = 100,signal} = {}) {
    if (!snowflake(channelId) || !['public','private','joinedPrivate'].includes(kind) || !Number.isInteger(limit) || limit < 1 || limit > 100 || before != null && (kind === 'joinedPrivate' ? !snowflake(before) : typeof before !== 'string' || !Number.isFinite(Date.parse(before)))) throw new DiscordError('invalid_request');
    if (kind === 'private') {
      const channel = await getChannel({channelId,allowContainer:true,signal});
      if (channel.type !== 0) throw new DiscordError('channel_scope_denied');
      const permissions = BigInt(channel.botPermissions);
      if (!(permissions & 8n) && !(permissions & (1n << 34n))) throw new DiscordError('permission_denied');
    } else {
      // An empty foreign-guild archive must never look like a successful scan.
      const channel = knownChannels.get(channelId) ?? metadata(await request(`/channels/${channelId}`,signal));
      if (![0,5,15,16].includes(channel.type)) throw new DiscordError('channel_scope_denied');
      if (kind === 'joinedPrivate' && channel.type !== 0) throw new DiscordError('channel_scope_denied');
      knownChannels.set(channelId,channel);
    }
    const params = new URLSearchParams({limit:String(limit)});
    if (before != null) params.set('before',before);
    const endpoint = kind === 'joinedPrivate' ? 'users/@me/threads/archived/private' : `threads/archived/${kind}`;
    const result = await request(`/channels/${channelId}/${endpoint}?${params}`,signal);
    if (!Array.isArray(result?.threads) || result.threads.length > limit || typeof result.has_more !== 'boolean') throw new DiscordError('invalid_response');
    const threads = result.threads.map(channel => metadata(channel,channelId));
    if (threads.some(channel => ![10,11,12].includes(channel.type) || kind !== 'public' && channel.type !== 12 || kind === 'public' && channel.type === 12)) throw new DiscordError('channel_scope_denied');
    return {threads,hasMore:result.has_more};
  }
  async function getChannel({channelId, allowContainer = false, signal} = {}) {
    if (!snowflake(channelId)) throw new DiscordError('invalid_channel');
    const channel = await request(`/channels/${channelId}`, signal);
    if (channel.id !== channelId || channel.guild_id !== config.guildId || !(allowContainer ? [0,5,10,11,12,15,16] : [0,5,10,11,12]).includes(channel.type)) throw new DiscordError('channel_scope_denied');
    // History can otherwise return an empty array when READ_MESSAGE_HISTORY is
    // missing. Compute effective permissions before treating empty as success.
    if (!botId) botId = (await request('/users/@me', signal)).id;
    const [roles, member] = await Promise.all([request(`/guilds/${config.guildId}/roles`, signal), request(`/guilds/${config.guildId}/members/${botId}`, signal)]);
    const roleIds = new Set([config.guildId, ...member.roles]);
    let permissions = roles.filter(r => roleIds.has(r.id)).reduce((bits, r) => bits | BigInt(r.permissions), 0n);
    if (!(permissions & 8n)) {
      const target = [10,11,12].includes(channel.type) ? await request(`/channels/${channel.parent_id}`, signal) : channel;
      if (target.guild_id !== config.guildId || ([10,11,12].includes(channel.type) && target.id !== channel.parent_id)) throw new DiscordError('channel_scope_denied');
      const overwrites = target.permission_overwrites || [];
      const everyone = overwrites.find(o => o.id === config.guildId && o.type === 0);
      if (everyone) permissions = (permissions & ~BigInt(everyone.deny)) | BigInt(everyone.allow);
      let deny = 0n, allow = 0n;
      for (const o of overwrites) if (o.type === 0 && o.id !== config.guildId && roleIds.has(o.id)) { deny |= BigInt(o.deny); allow |= BigInt(o.allow); }
      permissions = (permissions & ~deny) | allow;
      const own = overwrites.find(o => o.type === 1 && o.id === botId);
      if (own) permissions = (permissions & ~BigInt(own.deny)) | BigInt(own.allow);
      if ((permissions & 1024n) === 0n || (permissions & 65536n) === 0n) throw new DiscordError('permission_denied');
    }
    // Ordinary readers need private-thread membership; moderators with
    // MANAGE_THREADS (or administrators) can view without joining. Discovery
    // never joins threads or changes their Discord permissions.
    if (channel.type === 12 && !(permissions & 8n) && !(permissions & (1n << 34n))) await request(`/channels/${channelId}/thread-members/@me`, signal);
    knownChannels.set(channelId,metadata(channel));
    return {...channel,botPermissions:permissions.toString()};
  }
  async function getMessages({channelId,before,limit = 100,signal} = {}) {
    if (!snowflake(channelId) || (before != null && !snowflake(before))) throw new DiscordError('invalid_channel');
    const params = new URLSearchParams({limit:String(Math.max(1,Math.min(100,Number.isInteger(limit)?limit:100)))});
    if (before) params.set('before',before);
    const messages = await request(`/channels/${channelId}/messages?${params}`,signal);
    if (!Array.isArray(messages)) throw new DiscordError('invalid_response');
    return messages;
  }
  async function getMessage({channelId,messageId,signal} = {}) {
    if (!snowflake(channelId) || !snowflake(messageId)) throw new DiscordError('invalid_message');
    return request(`/channels/${channelId}/messages/${messageId}`,signal);
  }
  return Object.freeze({configured,getCurrentApplication,getGuild,getGuildChannels,getActiveThreads,getArchivedThreads,getChannel,getMessages,getMessage});
}
