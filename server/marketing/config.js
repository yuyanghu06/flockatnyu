import { readDiscordConfig } from '../discord/config.js';

// Non-secret Tech@NYU Discord IDs supplied by the user on 2026-11-19.
export const MARKETING_ROLE_IDS = Object.freeze({
  eventsLeads: '1203562091517321226',
  marketing: '1203562091517321229',
  leadership: '1203562091517321230',
});
export const MARKETING_CHANNEL_IDS = Object.freeze({
  eventsTeam: '1203562092213305370',
  marketingAndContentTeam: '1203562092213305366',
});
// Display names used in refusal messages. Channels from the test-server
// override have no known name and fall back to a Discord channel mention.
export const MARKETING_CHANNEL_NAMES = Object.freeze({
  [MARKETING_CHANNEL_IDS.eventsTeam]: 'events-team',
  [MARKETING_CHANNEL_IDS.marketingAndContentTeam]: 'marketing-and-content-team',
});
// Discord announcement, public and private thread channel types.
const THREAD_TYPES = Object.freeze([10, 11, 12]);

const snowflake = (value) => /^[0-9]{1,20}$/.test(value);
function idList(value, fallback) {
  if (typeof value !== 'string' || !value.trim()) return Object.freeze([...fallback]);
  const ids = [...new Set(value.split(',').map((part) => part.trim()))];
  return ids.length && ids.every(snowflake) ? Object.freeze(ids) : null;
}

// The interactions are opt-in per service so deploying this code alone never
// changes bot behavior. Optional overrides exist for a separate test server.
export function readMarketingConfig(env = process.env) {
  const discord = readDiscordConfig(env);
  const allowedRoleIds = idList(env.MARKETING_ALLOWED_ROLE_IDS, Object.values(MARKETING_ROLE_IDS));
  const allowedChannelIds = idList(
    env.MARKETING_ALLOWED_CHANNEL_IDS,
    Object.values(MARKETING_CHANNEL_IDS),
  );
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
