const snowflake = value => typeof value === 'string' && /^[0-9]{1,20}$/.test(value);
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const unavailable = () => Object.assign(new Error('discord_scope_unavailable'), {code:'discord_scope_unavailable'});
const validSources = ids => Array.isArray(ids) && ids.length <= 500 && ids.every(uuid);

/** Only the service-only published catalogue may add Discord source UUIDs.
 * Migration035 keeps pending discoveries out and withdraws observed revocations.
 * Retrieval still verifies current policy, ancestry, permissions and team intent. */
export async function resolveDiscordSourceIds({store,guildId,signal} = {}) {
  if (!snowflake(guildId) || !store?.getPolicy || !store?.listSyncChannels || signal?.aborted) throw unavailable();
  const [loaded,catalogue] = await Promise.all([
    store.getPolicy({guildId,signal}), store.listSyncChannels({signal}),
  ]);
  const policy = loaded?.policy;
  if (signal?.aborted || loaded?.status !== 'ready' || policy?.guildId !== guildId
    || !Number.isSafeInteger(policy.revision) || policy.revision < 1
    || typeof policy.paused !== 'boolean' || typeof policy.discoveryEnabled !== 'boolean'
    || ![policy.excludedChannelIds,policy.excludedCategoryIds].every(ids => Array.isArray(ids) && ids.length <= 500 && ids.every(snowflake))) throw unavailable();
  if (policy.paused || !policy.discoveryEnabled) return [];
  if (catalogue?.status !== 'ready' || !Array.isArray(catalogue.channels) || catalogue.channels.length > 10000) throw unavailable();
  const ids = new Set(), channels = new Set();
  for (const row of catalogue.channels) {
    if (!row || !snowflake(row.guildId) || !snowflake(row.channelId) || !uuid(row.sourceId) || typeof row.enabled !== 'boolean') throw unavailable();
    if (row.guildId !== guildId || !row.enabled) continue;
    if (row.policyRevision != null && row.policyRevision !== policy.revision || channels.has(row.channelId) || ids.has(row.sourceId)) throw unavailable();
    channels.add(row.channelId); ids.add(row.sourceId);
  }
  if (ids.size > 500) throw unavailable();
  return [...ids].sort();
}

/** Called only after backend authentication; request bodies cannot supply grants.
 * A Discord outage cannot disable unrelated source adapters. No cache is kept. */
export async function withDiscordSourceScope({principal,store,guildId,signal} = {}) {
  if (principal?.liveDiscord?.mode !== 'local-operator' || principal.liveDiscord.guildId !== guildId
    || !validSources(principal.allowedSourceIds)) return principal;
  try {
    let dynamic = await resolveDiscordSourceIds({store,guildId,signal});
    if (principal.liveDiscord.transport === 'discord-chat') {
      if (!validSources(principal.liveDiscord.allowedSourceIds)) return principal;
      const audience = new Set(principal.liveDiscord.allowedSourceIds);
      dynamic = dynamic.filter(id => audience.has(id));
    }
    const allowedSourceIds = [...new Set([...principal.allowedSourceIds,...dynamic])].sort();
    if (allowedSourceIds.length > 500) return principal;
    return {...principal,allowedSourceIds};
  } catch { return principal; }
}
