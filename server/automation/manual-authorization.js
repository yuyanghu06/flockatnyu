import { validUuid } from './validation.js';

const denied = () => ({ status: 'forbidden' });
const snowflake = (value) => typeof value === 'string' && /^[0-9]{1,20}$/.test(value);

// Saved metadata only. Ancestors explain a selected channel's ancestry; they
// never acquire source grants or cause provider calls here.
export function manualAuthorizationSnapshot({ result, guildId, channelIds }) {
  const data = result?.metadata;
  if (
    result?.status !== 'ready' ||
    data?.guildId !== guildId ||
    data.paused ||
    data.discoveryEnabled === false ||
    !Array.isArray(data.nodes) ||
    data.publishedRevision !== data.policyRevision
  )
    return denied();
  const nodes = new Map();
  for (const row of data.nodes) {
    if (
      !snowflake(row?.channelId) ||
      nodes.has(row.channelId) ||
      row.guildId !== guildId ||
      !Number.isInteger(row.type) ||
      (row.parentId !== null && !snowflake(row.parentId)) ||
      typeof row.manualDisabled !== 'boolean' ||
      typeof row.withdrawn !== 'boolean' ||
      row.generation !== data.publishedGeneration
    )
      return denied();
    nodes.set(row.channelId, row);
  }
  for (const id of channelIds) {
    const selected = nodes.get(id);
    if (!validUuid(selected?.sourceId) || selected.policyRevision !== data.policyRevision)
      return denied();
    const seen = new Set();
    let current = id;
    while (current !== null) {
      const row = nodes.get(current);
      if (
        !row ||
        seen.has(current) ||
        seen.size >= 9 ||
        row.manualDisabled ||
        row.withdrawn ||
        !['ready', 'metadata', 'excluded'].includes(row.accessStatus)
      )
        return denied();
      seen.add(current);
      current = row.parentId;
    }
  }
  return {
    status: 'ready',
    policy: {
      guildId,
      revision: data.policyRevision,
      paused: false,
      discoveryEnabled: true,
      excludedCategoryIds: [],
      excludedChannelIds: [],
    },
    channels: data.nodes.map((row) => ({
      ...row,
      guildId,
      enabled:
        channelIds.includes(row.channelId) &&
        validUuid(row.sourceId) &&
        !row.manualDisabled &&
        !row.withdrawn,
    })),
  };
}
