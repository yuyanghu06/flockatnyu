// Applies bounded service projections in the original order; no provider call or data write occurs here.
import { boundedSources } from './sources.js';

import { projectDiscordIdentity, projectDiscordDraft } from './results/discord.js';

import { projectAttioResult } from './results/attio.js';
import { projectGmailResult } from './results/gmail.js';
import { projectContactImport, projectContactsResult } from './results/contacts.js';

import { projectTregResult } from './results/treg.js';
import { projectDriveResult } from './results/drive.js';
import { projectCalendarWrites, projectCalendarRead } from './results/calendar.js';
import { projectMemoryResult } from './results/memory.js';
import { projectMapResult } from './results/map.js';

import { projectMiroResult } from './results/miro.js';
import { projectResultCoverage } from './results/coverage.js';

export function publicResult(name, args, result, requestContext, schemaFailure) {
  const safeArgs = {};
  for (const key of [
    'query',
    'channelId',
    'channelIds',
    'authorId',
    'from',
    'to',
    'messageId',
    'fileId',
    'folderId',
    'url',
    'limit',
    'mode',
    'context',
    'timeZone',
    'boardId',
    'itemId',
    'type',
    'targetId',
    'resultMode',
    'cursor',
    'offset',
    'patterns',
    'expectedHash',
    'itemIds',
    'scope',
    'eventId',
    'sourceId',
    'sourceRecordId',
    'provider',
    'providerUserId',
    'sourceUrl',
    'timeMin',
    'timeMax',
    'pageToken',
    'personName',
    'eventQuery',
    'date',
    'personId',
    'expectedUpdatedAt',
    'object',
    'recordId',
    'contactId',
  ]) {
    if (name === 'list_calendar_events' && key === 'pageToken') continue;
    const value = args?.[key];
    if (typeof value === 'string')
      safeArgs[key] = value.slice(
        0,
        key === 'query'
          ? 500
          : key === 'cursor'
            ? 8192
            : key === 'pageToken'
              ? 2048
              : key === 'eventId'
                ? 1024
                : key === 'providerUserId'
                  ? 320
                  : key === 'sourceUrl'
                    ? 2048
                    : 200,
      );
    else if (typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value)))
      safeArgs[key] = value;
    else if (key === 'itemIds' && Array.isArray(value))
      safeArgs[key] = value
        .filter((v) => typeof v === 'string')
        .slice(0, 10)
        .map((v) => v.slice(0, 200));
    else if (key === 'patterns' && Array.isArray(value))
      safeArgs[key] = value
        .filter((v) => typeof v === 'string')
        .slice(0, 10)
        .map((v) => v.slice(0, 500));
    else if (key === 'channelIds' && Array.isArray(value))
      safeArgs[key] = value
        .filter((v) => typeof v === 'string')
        .slice(0, 20)
        .map((v) => v.slice(0, 20));
  }
  if (args?.scope && typeof args.scope === 'object' && !Array.isArray(args.scope)) {
    const scope = Object.fromEntries(
      ['x', 'y', 'width', 'height']
        .filter((key) => Number.isSafeInteger(args.scope[key]))
        .map((key) => [key, args.scope[key]]),
    );
    if (Object.keys(scope).length === 4) safeArgs.scope = scope;
  }
  if (safeArgs.url) {
    try {
      const url = new URL(safeArgs.url),
        match = /^\/channels\/([0-9]{1,20})\/([0-9]{1,20})\/([0-9]{1,20})$/.exec(url.pathname);
      if (
        url.origin === 'https://discord.com' &&
        !url.username &&
        !url.password &&
        !url.search &&
        !url.hash &&
        match
      ) {
        safeArgs.guildId = match[1];
        safeArgs.channelId = match[2];
        safeArgs.messageId = match[3];
      }
    } catch {
      /* Invalid URLs never add normalized Discord scope. */
    }
  }
  const data = {
    tool: name,
    arguments: safeArgs,
    status: String(result?.status || 'unavailable').slice(0, 80),
    sources: boundedSources(result?.sources || []),
  };
  projectDiscordIdentity({ data, name, args, result, requestContext, schemaFailure });
  projectDiscordDraft({ data, name, args, result, requestContext, schemaFailure });
  projectAttioResult({ data, name, args, result, requestContext, schemaFailure });
  if (name === 'send_gmail')
    return projectGmailResult({ data, name, args, result, requestContext, schemaFailure });
  if (name === 'import_treg_contacts')
    return projectContactImport({ data, name, args, result, requestContext, schemaFailure });
  projectContactsResult({ data, name, args, result, requestContext, schemaFailure });
  projectTregResult({ data, name, args, result, requestContext, schemaFailure });
  projectDriveResult({ data, name, args, result, requestContext, schemaFailure });
  projectCalendarWrites({ data, name, args, result, requestContext, schemaFailure });
  projectMemoryResult({ data, name, args, result, requestContext, schemaFailure });
  projectMapResult({ data, name, args, result, requestContext, schemaFailure });
  projectCalendarRead({ data, name, args, result, requestContext, schemaFailure });
  projectMiroResult({ data, name, args, result, requestContext, schemaFailure });
  projectResultCoverage({ data, name, args, result, requestContext, schemaFailure });
  return data;
}
