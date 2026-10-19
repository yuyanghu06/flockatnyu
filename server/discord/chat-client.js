import {REST} from '@discordjs/rest';

const snowflake = value => typeof value === 'string' && /^[0-9]{1,20}$/.test(value);
const validToken = value => typeof value === 'string' && /^[A-Za-z0-9_.-]{1,2048}$/.test(value);
const fail = code => Object.assign(new Error(code), {code});
export const discordNoMentions = Object.freeze({parse: Object.freeze([]), users: Object.freeze([]), roles: Object.freeze([]), replied_user: false});
export const discordAskCommand = Object.freeze({name: 'ask', type: 1,
  description: 'Ask Flock about club activities and resources.',
  options: [{name: 'question', description: 'What would you like to ask Flock?', type: 3, required: true, max_length: 6000}]});

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
  const interaction = (applicationId, token) => {if (!snowflake(applicationId) || !validToken(token)) throw fail('invalid_interaction');};
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
    async ackInteraction({interactionId, token, signal} = {}) {
      interaction(interactionId, token);
      return request('post', `/interactions/${interactionId}/${token}/callback`, {signal, auth: false, body: {type: 5}});
    },
    async editInteraction({applicationId, token, content, signal} = {}) {
      interaction(applicationId, token);
      return request('patch', `/webhooks/${applicationId}/${token}/messages/@original`, {signal, auth: false, body: contentBody(content)});
    },
    async sendInteractionFollowup({applicationId, token, content, signal} = {}) {
      interaction(applicationId, token);
      return request('post', `/webhooks/${applicationId}/${token}`, {signal, auth: false, body: contentBody(content)});
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
    async registerAskCommand({applicationId, guildId = config?.guildId, signal} = {}) {
      if (!snowflake(applicationId) || !snowflake(guildId) || guildId !== config.guildId) throw fail('invalid_command_scope');
      const path = `/applications/${applicationId}/guilds/${guildId}/commands`;
      const commands = await request('get', path, {signal});
      if (!Array.isArray(commands)) throw fail('invalid_response');
      const ask = commands.find(command => command.name === 'ask' && command.type === 1);
      if (ask && !snowflake(ask.id)) throw fail('invalid_response');
      // Never bulk replace the guild command catalogue.
      return request(ask ? 'patch' : 'post', ask ? `${path}/${ask.id}` : path, {signal, body: discordAskCommand});
    },
  });
}
