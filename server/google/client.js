import { readGoogleConfig } from './config.js';
import {validDrivePageToken} from '../automation/validation.js';
import { createGoogleOAuth, GoogleError, googleError, verifyGoogleToken, waitForGoogleAuth } from './oauth.js';

const GMAIL = 'https://gmail.googleapis.com/gmail/v1/users/me';
const DRIVE = 'https://www.googleapis.com/drive/v3';
const fileId = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,200}$/.test(value);
const mailId = value => typeof value === 'string' && /^[a-fA-F0-9]{1,64}$/.test(value);
const clean = (value, max = 500) => typeof value === 'string' ? value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').slice(0, max) : '';
const limitOf = value => value === undefined ? 5 : Number.isInteger(value) && value >= 1 && value <= 5 ? value : null;
const folderLimitOf = value => value === undefined ? 50 : Number.isInteger(value) && value >= 1 && value <= 50 ? value : null;
const pageTokenValid = value => value === undefined || validDrivePageToken(value);
const FIELD = 'id,name,mimeType,description,modifiedTime,size,webViewLink,parents';

export async function boundedGoogleBody(response, { maxBytes = 1500000, signal } = {}) {
  if (!response.body || Number(response.headers.get('content-length')) > maxBytes) {
    await response.body?.cancel(); throw new GoogleError('response_too_large');
  }
  const reader = response.body.getReader(), chunks = [];
  let bytes = 0;
  const abort = () => { void reader.cancel().catch(() => {}); };
  signal?.addEventListener('abort', abort, { once: true });
  try {
    while (true) {
      if (signal?.aborted) throw new GoogleError('aborted');
      const { value, done } = await reader.read();
      if (signal?.aborted) throw new GoogleError('aborted');
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) throw new GoogleError('response_too_large');
      chunks.push(value);
    }
    return Buffer.concat(chunks).toString('utf8');
  } finally { signal?.removeEventListener('abort', abort); await reader.cancel().catch(() => {}); reader.releaseLock(); }
}

// Plain text only. HTML is stripped into inert text and never sent to a renderer.
function htmlText(html) {
  return html.replace(/<(script|style|head)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]*>/g, ' ')
    .replace(/&(?:amp|lt|gt|quot|apos|nbsp);/g, entity => ({ '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'", '&nbsp;': ' ' })[entity]);
}

function mailBody(payload) {
  const plain = [], html = [];
  let count = 0;
  function visit(part, depth = 0) {
    if (!part || depth > 12 || ++count > 100 || part.filename || part.body?.attachmentId) return;
    if (['text/plain', 'text/html'].includes(part.mimeType) && typeof part.body?.data === 'string' && part.body.data.length <= 1000000) {
      const decoded = Buffer.from(part.body.data, 'base64url').toString('utf8');
      (part.mimeType === 'text/plain' ? plain : html).push(decoded);
    }
    for (const child of (Array.isArray(part.parts) ? part.parts : []).slice(0, 100)) visit(child, depth + 1);
  }
  visit(payload);
  return clean(plain.length ? plain.join('\n') : htmlText(html.join('\n')), 12000);
}

function gmailSource(message, includeBody = false) {
  if (!mailId(message?.id)) throw new GoogleError('invalid_response');
  const headers = Array.isArray(message.payload?.headers) ? message.payload.headers : [];
  const header = name => clean(headers.find(h => typeof h.name === 'string' && h.name.toLowerCase() === name)?.value, 500);
  const snippet = clean(message.snippet, 1500);
  const body = includeBody ? mailBody(message.payload) : '';
  return { id: `gmail:${message.id}`, externalId: message.id, kind: 'gmail', title: header('subject') || '(No subject)',
    url: `https://mail.google.com/mail/u/0/#all/${message.id}`, excerpt: body || snippet || '(No text preview available)',
    from: header('from'), to: header('to'), date: header('date'), partial: true,
    contentStatus: includeBody ? body ? 'text_only_bounded' : 'snippet_only' : 'snippet_only' };
}

function driveSource(file) {
  if (!fileId(file?.id)) throw new GoogleError('invalid_response');
  if (file.parents !== undefined && (!Array.isArray(file.parents) || file.parents.length > 100 || !file.parents.every(fileId))) throw new GoogleError('invalid_response');
  let link = file.mimeType === 'application/vnd.google-apps.folder' ? `https://drive.google.com/drive/folders/${file.id}` : `https://drive.google.com/file/d/${file.id}/view`;
  try { const url = new URL(file.webViewLink); if (url.protocol === 'https:' && ['drive.google.com', 'docs.google.com'].includes(url.hostname) && !url.username && !url.password) link = url.href; } catch {}
  const title = clean(file.name, 300) || '(Untitled file)';
  return { id: `drive:${file.id}`, externalId: file.id, kind: 'google_drive', title, url: link,
    excerpt: clean(file.description, 1500) || `${title} (${clean(file.mimeType, 100)})`,
    mimeType: clean(file.mimeType, 100), sourceUpdatedAt: clean(file.modifiedTime, 50), parents: [...(file.parents || [])], partial: true, contentStatus: 'metadata_only' };
}

export function createGoogleClient({ config = readGoogleConfig(), fetchImpl = globalThis.fetch, oauthClient } = {}) {
  const configured = Boolean(config.configured && typeof fetchImpl === 'function');
  const oauth = oauthClient || createGoogleOAuth(config);
  if (configured) oauth.setCredentials({ refresh_token: config.refreshToken });
  let oauthVerified = false, lastStatus = configured ? 'configured' : 'not_configured';
  let verifiedToken = null;

  async function request(url, accessToken, signal, text = false, maxBytes = 1500000) {
    // URLs are assembled only by the methods below; no model-provided URLs.
    const response = await fetchImpl(url, { method: 'GET', redirect: 'error', signal,
      headers: { Authorization: `Bearer ${accessToken}`, Accept: text ? 'text/plain' : 'application/json' } });
    if (!response.ok) {
      await response.body?.cancel();
      throw new GoogleError(response.status === 401 ? 'reauthorization_required' : response.status === 403 ? 'permission_denied'
        : response.status === 404 ? 'not_found' : response.status === 429 ? 'rate_limited' : 'google_unavailable');
    }
    const raw = await boundedGoogleBody(response, { maxBytes, signal });
    if (text) return raw;
    try { return JSON.parse(raw); } catch { throw new GoogleError('invalid_response'); }
  }

  async function run(signal, operation) {
    if (!configured) return { status: 'not_configured', sources: [] };
    const timeout = AbortSignal.timeout(20000), combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
    try {
      if (combined.aborted) throw new GoogleError('aborted');
      const result = await waitForGoogleAuth(() => oauth.getAccessToken(), combined);
      const accessToken = result?.token;
      if (!accessToken) throw new GoogleError('reauthorization_required');
      if (accessToken !== verifiedToken) {
        await verifyGoogleToken(oauth, accessToken, config.expectedAccountEmail,
          token => request(`${GMAIL}/profile`, token, combined), combined);
        verifiedToken = accessToken; oauthVerified = true;
      }
      const output = await operation(accessToken, combined);
      const sources = Array.isArray(output) ? output : output.sources;
      lastStatus = 'ready';
      return { ...(Array.isArray(output) ? {} : output), status: sources.length ? 'ready' : 'empty', sources };
    } catch (error) {
      const safe = timeout.aborted && !signal?.aborted ? new GoogleError('timeout') : googleError(error, signal);
      lastStatus = safe.code;
      if (['reauthorization_required', 'account_mismatch'].includes(safe.code)) { oauthVerified = false; verifiedToken = null; }
      return { status: safe.code, sources: [] };
    }
  }

  async function searchGmail({ query, limit, signal } = {}) {
    const count = limitOf(limit);
    if (typeof query !== 'string' || !query.trim() || query.length > 500 || !count) return { status: 'invalid_request', sources: [] };
    const result = await run(signal, async (token, active) => {
      const params = new URLSearchParams({ q: query.trim(), maxResults: String(count), includeSpamTrash: 'false' });
      const list = await request(`${GMAIL}/messages?${params}`, token, active);
      if (list.messages !== undefined && !Array.isArray(list.messages)) throw new GoogleError('invalid_response');
      const sources = [];
      for (const message of (list.messages || []).slice(0, count)) {
        if (!mailId(message?.id)) throw new GoogleError('invalid_response');
        const params = new URLSearchParams({ format: 'metadata' });
        for (const name of ['Subject', 'From', 'To', 'Date']) params.append('metadataHeaders', name);
        const hydrated = await request(`${GMAIL}/messages/${message.id}?${params}`, token, active);
        if (hydrated?.id !== message.id) throw new GoogleError('invalid_response');
        sources.push(gmailSource(hydrated));
      }
      return sources;
    });
    return { ...result, possiblyTruncated: result.sources.length === count };
  }

  async function readGmail({ messageId, signal } = {}) {
    if (!mailId(messageId)) return { status: 'invalid_request', sources: [] };
    return run(signal, async (token, active) => {
      const message = await request(`${GMAIL}/messages/${messageId}?format=full`, token, active);
      if (message?.id !== messageId) throw new GoogleError('invalid_response');
      return [gmailSource(message, true)];
    });
  }

  async function drivePage({ params, count, pageToken, folderId, signal, scope }) {
    const result = await run(signal, async (token, active) => {
      const data = await request(`${DRIVE}/files?${params}`, token, active);
      if (!Array.isArray(data.files) || data.files.length > count || !pageTokenValid(data.nextPageToken)
        || data.incompleteSearch !== undefined && typeof data.incompleteSearch !== 'boolean') throw new GoogleError('invalid_response');
      const nextPageToken = data.nextPageToken ?? null;
      const complete = !pageToken && !nextPageToken && data.incompleteSearch !== true;
      return { sources: data.files.map(driveSource), nextPageToken, partial: !complete, possiblyTruncated: !complete,
        coverage: { scope, ...(folderId ? { folderId } : {}), complete, recursive: false, pageOnly: true,
          continuation: pageToken !== undefined, incompleteSearch: data.incompleteSearch === true } };
    });
    // A failed/unauthorized listing does not establish an empty directory or a
    // complete search, and an opaque cursor never establishes recursive coverage.
    if (!['ready', 'empty'].includes(result.status)) return { ...result, partial: true, possiblyTruncated: true,
      coverage: { scope, ...(folderId ? { folderId } : {}), complete: false, recursive: false, pageOnly: true } };
    return result;
  }

  function driveListParams(q, count, pageToken) {
    const params = new URLSearchParams({ q, pageSize: String(count), fields: `nextPageToken,incompleteSearch,files(${FIELD})`,
      orderBy: 'modifiedTime desc', spaces: 'drive', supportsAllDrives: 'true', includeItemsFromAllDrives: 'true' });
    if (pageToken !== undefined) params.set('pageToken', pageToken);
    return params;
  }

  async function searchDrive({ query, limit, folderId, pageToken, signal } = {}) {
    const count = limitOf(limit);
    if (typeof query !== 'string' || !query.trim() || query.length > 500 || !count
      || folderId !== undefined && !fileId(folderId) || !pageTokenValid(pageToken)) return { status: 'invalid_request', sources: [] };
    const literal = query.trim().replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    const q = `trashed = false and (fullText contains '${literal}')${folderId ? ` and '${folderId}' in parents` : ''}`;
    return drivePage({ params: driveListParams(q, count, pageToken), count, pageToken, folderId, signal, scope: folderId ? 'direct_child_search' : 'authorized_drive_search' });
  }

  async function listDriveFolder({ folderId, pageToken, limit, signal } = {}) {
    const count = folderLimitOf(limit);
    if (!fileId(folderId) || !count || !pageTokenValid(pageToken)) return { status: 'invalid_request', sources: [] };
    const result = await drivePage({ params: driveListParams(`trashed = false and '${folderId}' in parents`, count, pageToken), count, pageToken, folderId, signal, scope: 'direct_children' });
    if (!['ready', 'empty'].includes(result.status)) return { ...result, coverage: { ...result.coverage, navigationOnly: true } };
    return { ...result, sources: [], coverage: { ...result.coverage, navigationOnly: true },
      driveContext: { folderId, entries: result.sources.map(source => ({ id: source.externalId, name: source.title,
        mimeType: source.mimeType, parentIds: source.parents, modifiedTime: source.sourceUpdatedAt, url: source.url })),
        nextPageToken: result.nextPageToken, complete: result.coverage.complete } };
  }

  async function readDrive({ fileId: id, signal } = {}) {
    if (!fileId(id)) return { status: 'invalid_request', sources: [] };
    return run(signal, async (token, active) => {
      const file = await request(`${DRIVE}/files/${id}?${new URLSearchParams({ fields: FIELD, supportsAllDrives: 'true' })}`, token, active);
      if (file.id !== id) throw new GoogleError('invalid_response');
      const source = driveSource(file);
      const mime = { 'application/vnd.google-apps.document': 'text/plain', 'application/vnd.google-apps.presentation': 'text/plain',
        'application/vnd.google-apps.spreadsheet': 'text/csv' }[file.mimeType];
      let content;
      if (mime) content = await request(`${DRIVE}/files/${id}/export?${new URLSearchParams({ mimeType: mime })}`, token, active, true, 250000);
      else if (typeof file.mimeType === 'string' && (file.mimeType.startsWith('text/') || file.mimeType === 'application/json')) {
        if (!Number.isFinite(Number(file.size)) || Number(file.size) > 250000) return [{ ...source, contentStatus: 'too_large' }];
        content = await request(`${DRIVE}/files/${id}?alt=media&supportsAllDrives=true`, token, active, true, 250000);
      } else return [{ ...source, contentStatus: 'unsupported_binary' }];
      if (file.mimeType === 'text/html') content = htmlText(content);
      const firstSheet = file.mimeType === 'application/vnd.google-apps.spreadsheet';
      const sourceText=clean(content,content.length),boundedText=sourceText.slice(0,12000),contentStatus=firstSheet?'first_sheet_only':'text_only_bounded';
      const driveContent={fileId:id,url:source.url,contentStatus,text:boundedText,
        textTruncated:sourceText.length>12000,firstSheetOnly:firstSheet,partial:true};
      return {sources:[{...source,excerpt:`${firstSheet?'[FIRST SHEET ONLY; partial spreadsheet export]\n':''}${boundedText||'(No text content)'}`,
        contentStatus,textTruncated:driveContent.textTruncated,partial:true}],driveContent};
    });
  }

  return Object.freeze({ configured, status: () => ({ configured, oauthVerified, status: lastStatus }), searchGmail, readGmail, searchDrive, listDriveFolder, readDrive });
}
