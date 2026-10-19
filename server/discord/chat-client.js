import {REST} from '@discordjs/rest';

const snowflake = value => typeof value === 'string' && /^[0-9]{1,20}$/.test(value);
const fail = code => Object.assign(new Error(code), {code});
export const discordNoMentions = Object.freeze({parse: Object.freeze([]), users: Object.freeze([]), roles: Object.freeze([]), replied_user: false});

/** Discord SDK handles bucket limits. Mutations disable transport retries: an
 * ambiguous network failure must not silently duplicate a public response. */
export function createDiscordChatClient({config, rest} = {}) {
  const configured = Boolean(config?.configured);
  const api = rest ?? new REST({version: '10', timeout: 15000, retries: 0}).setToken(config?.botToken ?? '');
  async function request(method, path, options = {}) {
    if (!configured) throw fail('not_configured');
    try { return await api[method](path, options); }
    catch (cause) {
      if (options.signal?.aborted) throw fail('aborted');
      const status = cause?.status;
      throw fail(({401: 'invalid_token', 403: 'permission_denied', 404: 'not_found', 429: 'rate_limited'})[status] || 'discord_unavailable');
    }
  }
  const channel = channelId => {if (!snowflake(channelId)) throw fail('invalid_channel');};
  const contentBody = content => {
    if (typeof content !== 'string' || !content.trim() || content.length > 2000) throw fail('invalid_message');
    return {content, allowed_mentions: discordNoMentions};
  };
  return Object.freeze({configured,
    async sendMessage({channelId, content, replyTo, signal} = {}) {
      channel(channelId);
      if (!snowflake(replyTo)) throw fail('invalid_reference');
      return request('post', `/channels/${channelId}/messages`, {signal, body: {...contentBody(content),
        message_reference: {message_id: replyTo, channel_id: channelId, fail_if_not_exists: true}}});
    },
    async sendTyping({channelId, signal} = {}) {channel(channelId); return request('post', `/channels/${channelId}/typing`, {signal});},
    async getMessage({channelId, messageId, signal} = {}) {
      channel(channelId); if (!snowflake(messageId)) throw fail('invalid_reference');
      return request('get', `/channels/${channelId}/messages/${messageId}`, {signal});
    },
    async getCurrentUser({signal} = {}) {return request('get', '/users/@me', {signal});},
    async getGuildMember({guildId, userId, signal} = {}) {
      if (!snowflake(guildId) || guildId !== config.guildId || !snowflake(userId)) throw fail('invalid_member');
      return request('get', `/guilds/${guildId}/members/${userId}`, {signal});
    },
    async getGuildChannelsMetadata({guildId = config?.guildId, signal} = {}) {
      if (!snowflake(guildId) || guildId !== config.guildId) throw fail('invalid_guild');
      const channels = await request('get', `/guilds/${guildId}/channels`, {signal});
      if (!Array.isArray(channels) || channels.length > 500 || channels.some(value => !snowflake(value?.id) || value.guild_id != null && value.guild_id !== guildId)) throw fail('invalid_response');
      return channels;
    },
    async getGuildRoles({guildId = config?.guildId, signal} = {}) {
      if (!snowflake(guildId) || guildId !== config.guildId) throw fail('invalid_guild');
      return request('get', `/guilds/${guildId}/roles`, {signal});
    },
    async getGuildMetadata({guildId = config?.guildId, signal} = {}) {
      if (!snowflake(guildId) || guildId !== config.guildId) throw fail('invalid_guild');
      return request('get', `/guilds/${guildId}`, {signal});
    },
    async getThreadMember({channelId,userId,signal} = {}) {
      channel(channelId); if (!snowflake(userId)) throw fail('invalid_member');
      return request('get', `/channels/${channelId}/thread-members/${userId}`, {signal});
    },
  });
}
