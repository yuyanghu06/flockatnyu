import { validateDiscordUsers } from '../discord-context.js';

export function projectDiscordIdentity({ data, name, result, requestContext }) {
  if (
    ['read_map_events', 'lookup_map_person', 'upsert_map_event'].includes(name) &&
    result?.discordUsers
  ) {
    try {
      data.discordUsers = validateDiscordUsers(result.discordUsers, requestContext);
      const actor = requestContext?.actor,
        person = data.discordUsers?.users.find((row) => row.discordUserId === actor?.userId);
      if (person)
        data.discordActor = {
          discordUserId: actor.userId,
          name: person.name,
          username: actor.username,
          displayName: actor.displayName,
        };
    } catch {
      /* Invalid label tables never become model context or permissions. */
    }
  }
}
export function projectDiscordDraft({ data, name, args, result }) {
  if (name === 'draft_discord_message') {
    // This model-facing projection is deliberately absent from NDJSON metadata.
    // Do not pass through arbitrary adapter fields or draft arguments.
    data.sources = [];
    const target = (value) =>
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      ['guildId', 'channelId'].every(
        (key) => typeof value[key] === 'string' && /^[0-9]{1,20}$/.test(value[key]),
      ) &&
      typeof value.name === 'string' &&
      value.name.length <= 100 &&
      value.url === `https://discord.com/channels/${value.guildId}/${value.channelId}`
        ? { guildId: value.guildId, channelId: value.channelId, name: value.name, url: value.url }
        : undefined;
    if (result?.sent === false) data.sent = false;
    const draft = result?.discordDraft,
      destination = target(draft?.target);
    if (
      result?.status === 'ready' &&
      result.sent === false &&
      draft?.sent === false &&
      destination &&
      typeof draft.content === 'string' &&
      draft.content.trim() &&
      draft.content.length <= 2000 &&
      draft.content === args?.content
    )
      data.discordDraft = { sent: false, target: destination, content: draft.content };
    if (
      result?.status === 'ambiguous' &&
      result.sent === false &&
      Array.isArray(result.discordDraftCandidates) &&
      result.discordDraftCandidates.length >= 2 &&
      result.discordDraftCandidates.length <= 10
    ) {
      const candidates = result.discordDraftCandidates.map(target);
      if (candidates.every(Boolean)) data.discordDraftCandidates = candidates;
    }
  }
}
