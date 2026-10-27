import { isDriveTool } from '../../skills/drive.js';
import { validDrivePageToken } from '../../automation/validation.js';

export function projectDriveResult({ data, name, args, result }) {
  if (isDriveTool(name) && validDrivePageToken(result?.nextPageToken))
    data.nextPageToken = result.nextPageToken;
  if (name === 'read_drive' && result?.status === 'ready' && result.driveContent) {
    const content = result.driveContent;
    let url;
    try {
      const parsed = new URL(content.url);
      if (
        parsed.protocol === 'https:' &&
        ['drive.google.com', 'docs.google.com'].includes(parsed.hostname) &&
        !parsed.username &&
        !parsed.password &&
        parsed.href.length <= 2048
      )
        url = parsed.href;
    } catch {}
    if (
      content.fileId === args?.fileId &&
      typeof content.fileId === 'string' &&
      /^[A-Za-z0-9_-]{1,200}$/.test(content.fileId) &&
      url &&
      ['first_sheet_only', 'text_only_bounded'].includes(content.contentStatus) &&
      typeof content.text === 'string' &&
      content.text.length <= 12000 &&
      typeof content.textTruncated === 'boolean' &&
      typeof content.firstSheetOnly === 'boolean' &&
      content.firstSheetOnly === (content.contentStatus === 'first_sheet_only')
    ) {
      data.driveContent = {
        fileId: content.fileId,
        url,
        contentStatus: content.contentStatus,
        text: content.text,
        textTruncated: content.textTruncated,
        firstSheetOnly: content.firstSheetOnly,
        partial: true,
      };
      if (content.textTruncated) data.possiblyTruncated = true;
    }
  }
  if (
    name === 'list_drive_folder' &&
    result?.driveContext &&
    ['ready', 'empty'].includes(result.status)
  ) {
    const directory = result.driveContext;
    const id = (value) => typeof value === 'string' && /^[A-Za-z0-9_-]{1,200}$/.test(value);
    const entries =
      Array.isArray(directory.entries) && directory.entries.length <= 50
        ? directory.entries.map((entry) => {
            if (
              !id(entry?.id) ||
              typeof entry.name !== 'string' ||
              entry.name.length > 300 ||
              typeof entry.mimeType !== 'string' ||
              entry.mimeType.length > 100 ||
              !Array.isArray(entry.parentIds) ||
              entry.parentIds.length > 100 ||
              !entry.parentIds.every(id)
            )
              return null;
            let url;
            try {
              url = new URL(entry.url);
              if (
                url.protocol !== 'https:' ||
                !['drive.google.com', 'docs.google.com'].includes(url.hostname) ||
                url.username ||
                url.password ||
                url.href.length > 2048
              )
                return null;
            } catch {
              return null;
            }
            return {
              id: entry.id,
              name: entry.name,
              mimeType: entry.mimeType,
              parentIds: [...entry.parentIds],
              url: url.href,
              ...(typeof entry.modifiedTime === 'string'
                ? { modifiedTime: entry.modifiedTime.slice(0, 50) }
                : {}),
            };
          })
        : null;
    if (
      id(directory.folderId) &&
      entries &&
      entries.every(Boolean) &&
      Buffer.byteLength(JSON.stringify(entries)) <= 64000
    ) {
      data.driveContext = {
        folderId: directory.folderId,
        entries,
        nextPageToken: data.nextPageToken || null,
        complete: directory.complete === true && !data.nextPageToken,
        navigationOnly: true,
      };
    } else {
      data.possiblyTruncated = true;
      data.complete = false;
    }
  }
}
