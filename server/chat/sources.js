// Copies only bounded, safe source excerpts into model context; arbitrary adapter fields remain private.
import { maxSources, maxExcerpt, maxExcerptChars } from './constants.js';

export function boundedSources(rows) {
  const seen = new Set(),
    output = [];
  let remaining = maxExcerptChars;
  for (const row of rows) {
    if (
      !row ||
      typeof row !== 'object' ||
      typeof row.excerpt !== 'string' ||
      remaining <= 0 ||
      output.length >= maxSources
    )
      continue;
    let url;
    try {
      const parsed = new URL(row.url);
      if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password)
        continue;
      url = parsed.href;
    } catch {
      continue;
    }
    const identity = row.sourceKey || row.id || url;
    if (seen.has(identity)) continue;
    seen.add(identity);
    const excerpt = row.excerpt.slice(0, Math.min(maxExcerpt, remaining));
    if (!excerpt) continue;
    remaining -= excerpt.length;
    // Never pass arbitrary adapter fields (or credentials) into model context.
    const source = {
      id: String(identity).slice(0, 615),
      title: String(row.title || 'Source').slice(0, 300),
      url,
      excerpt,
    };
    for (const key of [
      'kind',
      'retrievalMode',
      'sourceId',
      'channelId',
      'guildId',
      'messageId',
      'authorId',
      'authorName',
      'createdAt',
      'fetchedAt',
      'sourceUpdatedAt',
      'periodStart',
      'periodEnd',
      'tier',
      'externalId',
      'contentStatus',
      'boardId',
      'itemId',
      'evidenceKind',
      'mimeType',
      'from',
      'to',
      'date',
      'timeZone',
    ]) {
      if (typeof row[key] === 'string') source[key] = row[key].slice(0, 300);
    }
    if (typeof row.sourceKey === 'string') source.sourceKey = row.sourceKey.slice(0, 615);
    if (typeof row.contentAvailable === 'boolean') source.contentAvailable = row.contentAvailable;
    if (row.retrieval === 'live') source.retrievalMode = 'live';
    if (row.partial === true || excerpt.length < row.excerpt.length) source.partial = true;
    if (Array.isArray(row.citationUrls))
      source.citationUrls = row.citationUrls
        .filter(
          (value) =>
            typeof value === 'string' &&
            /^https:\/\/discord\.com\/channels\/[0-9]{1,20}\/[0-9]{1,20}\/[0-9]{1,20}$/.test(value),
        )
        .slice(0, 12);
    output.push(source);
  }
  return output;
}
