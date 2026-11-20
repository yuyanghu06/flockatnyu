import { readDiscordConfig } from '../discord/config.js';

// Discord announcement, public and private thread channel types.
const THREAD_TYPES = Object.freeze([10, 11, 12]);

const snowflake = (value) => /^[0-9]{1,20}$/.test(value);
// Comma-separated Discord IDs. Unset or blank means an empty list, which
// allows nobody. A malformed list returns null so the commands do not start.
function idList(value) {
  if (typeof value !== 'string' || !value.trim()) return Object.freeze([]);
  const ids = [...new Set(value.split(',').map((part) => part.trim()))];
  return ids.every(snowflake) ? Object.freeze(ids) : null;
}

// Who may use the commands comes only from the environment, so a test server
// or channel needs no code change:
//   MARKETING_ALLOWED_ROLE_IDS     member must have at least one of these roles
//   MARKETING_ALLOWED_CHANNEL_IDS  channels (and threads directly inside them)
// Both default to nothing, which denies everyone. The interactions are also
// opt-in per service (MARKETING_INTERACTIONS_ENABLED), so deploying this code
// alone never changes bot behavior.
export function readMarketingConfig(env = process.env) {
  const discord = readDiscordConfig(env);
  const allowedRoleIds = idList(env.MARKETING_ALLOWED_ROLE_IDS);
  const allowedChannelIds = idList(env.MARKETING_ALLOWED_CHANNEL_IDS);
  return Object.freeze({
    enabled: env.MARKETING_INTERACTIONS_ENABLED === 'true',
    configured: Boolean(discord.configured && allowedRoleIds && allowedChannelIds),
    botToken: discord.botToken,
    guildId: discord.guildId,
    allowedRoleIds: allowedRoleIds ?? Object.freeze([]),
    allowedChannelIds: allowedChannelIds ?? Object.freeze([]),
  });
}

// A thread counts as allowed when Discord's own channel object in the
// interaction says it is a thread whose parent is an allowed channel.
function inAllowedChannel(interaction, allowedChannelIds) {
  if (allowedChannelIds.includes(interaction.channel_id)) return true;
  const channel = interaction.channel;
  return Boolean(
    channel &&
    channel.id === interaction.channel_id &&
    THREAD_TYPES.includes(channel.type) &&
    allowedChannelIds.includes(channel.parent_id),
  );
}

// Uses only the member roles and channel Discord includes in the Gateway
// interaction; no extra Discord reads. Allowed: the configured channels and
// threads directly inside them.
export function authorizeMarketingInteraction(interaction, config) {
  if (interaction?.guild_id !== config.guildId) return { allowed: false, reason: 'guild' };
  if (!inAllowedChannel(interaction, config.allowedChannelIds))
    return { allowed: false, reason: 'channel' };
  const roles = Array.isArray(interaction.member?.roles) ? interaction.member.roles : [];
  if (!roles.some((role) => config.allowedRoleIds.includes(role)))
    return { allowed: false, reason: 'role' };
  return { allowed: true };
}
