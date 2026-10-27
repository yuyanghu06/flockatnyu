export function projectResultCoverage({ data, name, result }) {
  if (typeof result?.complete === 'boolean') data.complete = result.complete;
  if (name === 'upsert_map_event' && data.mapFailure) data.reason = data.mapFailure.reason;
  else if (typeof result?.reason === 'string') data.reason = result.reason.slice(0, 100);
  if (result?.coverage && typeof result.coverage === 'object') {
    data.coverage = {};
    for (const key of [
      'complete',
      'reason',
      'matchedCount',
      'returnedCount',
      'messageCount',
      'pages',
      'from',
      'to',
      'periodStart',
      'periodEnd',
      'textTruncated',
      'sourceTextTruncated',
      'fetchedComplete',
      'channelCoverageComplete',
      'contentScope',
      'nonTextMessageCount',
      'directSummary',
      'timeZone',
      'wholeBoardComplete',
      'hasMore',
      'nextCursor',
      'nextOffset',
      'navigationOnly',
      'contentAvailable',
      'scoped',
      'fragmentComplete',
      'scope',
      'folderId',
      'recursive',
      'pageOnly',
      'continuation',
      'incompleteSearch',
    ]) {
      const value = result.coverage[key];
      if (
        typeof value === 'boolean' ||
        (typeof value === 'number' && Number.isFinite(value)) ||
        typeof value === 'string'
      )
        data.coverage[key] = typeof value === 'string' ? value.slice(0, 100) : value;
    }
  }
  if (Array.isArray(result?.channelCoverage))
    data.channelCoverage = result.channelCoverage.slice(0, 30).map((row) => {
      const safe = {};
      for (const key of [
        'channelId',
        'name',
        'status',
        'complete',
        'reason',
        'from',
        'to',
        'messageCount',
        'returnedCount',
      ]) {
        const value = row?.[key];
        if (typeof value === 'string') safe[key] = value.slice(0, 100);
        else if (
          typeof value === 'boolean' ||
          (typeof value === 'number' && Number.isFinite(value))
        )
          safe[key] = value;
      }
      return safe;
    });
  if (
    result?.possiblyTruncated === true ||
    data.sources.some((source) => source.partial) ||
    data.sources.length < (result?.sources?.length || 0) ||
    result?.coverage?.textTruncated === true ||
    result?.coverage?.sourceTextTruncated === true
  ) {
    data.possiblyTruncated = true;
    if (data.coverage) data.coverage.complete = false;
  }
  if (data.complete === false || data.driveContext?.complete === false || data.nextPageToken) {
    if (data.coverage) data.coverage.complete = false;
    if (data.driveContext) data.driveContext.complete = false;
  }
  if (Array.isArray(result?.channels))
    data.channels = result.channels.slice(0, 100).map((row) => ({
      id: String(row.id || row.channelId || '').slice(0, 20),
      name: String(row.name || row.title || '').slice(0, 100),
      ...(['eboard', 'general', 'team'].includes(row.summaryScope)
        ? { summaryScope: row.summaryScope }
        : {}),
      ...(['eboard', 'general', 'team'].includes(row.scope) ? { scope: row.scope } : {}),
    }));
}
