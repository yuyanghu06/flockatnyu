import { createHash } from 'node:crypto';
import { sourceMailbox } from './mailbox.js';
import { boundedGoogleBody } from './client.js';
import { SOURCE_TOOL_TIMEOUT_MS } from '../source-timeout.js';

// Fixed application namespace. Identity depends only on the normalized sender
// address, so replay preserves the first observed name and creation timestamp.
const NAMESPACE = Buffer.from('82a3d9be58d54c739d06e8ec8e924ecd', 'hex');
const excludedLabels = new Set(['SENT', 'DRAFT', 'SPAM', 'TRASH']);

export function inboxSenderId(email) {
  const normalized = sourceMailbox(email);
  if (!normalized || normalized.length > 320 || /[\x00-\x1f\x7f]/.test(normalized)) throw new Error('invalid_sender');
  const bytes = createHash('sha1').update(NAMESPACE).update(normalized).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function parseInboxSender(message, { accountEmail } = {}) {
  const labels = message?.labelIds;
  if (!Array.isArray(labels) || !labels.every(label => typeof label === 'string')
    || !labels.includes('INBOX') || labels.some(label => excludedLabels.has(label))) return null;
  const headers = message?.payload?.headers;
  if (!Array.isArray(headers)) return null;
  const from = headers.filter(header => typeof header?.name === 'string' && header.name.toLowerCase() === 'from');
  if (from.length !== 1) return null;
  const email = sourceMailbox(from[0].value);
  const self = sourceMailbox(accountEmail);
  if (!email || email.length > 320 || /[\x00-\x1f\x7f]/.test(email) || !self || email === self) return null;
  const sender = { email };
  // Encoded words and complex address syntax are deliberately not decoded or
  // guessed. A usable mailbox can still be cached without a display name.
  const value = from[0].value.trim();
  const angle = value.lastIndexOf('<');
  if (angle > 0) {
    let name = value.slice(0, angle).trim();
    if (name.startsWith('"') && name.endsWith('"')) name = name.slice(1, -1).replace(/\\(["\\])/g, '$1');
    if (name && name.length <= 200 && !/[<>@\x00-\x1f\x7f]|=\?/.test(name)) {
      name = name.replace(/\s+/gu, ' ').trim();
      if (name) sender.name = name;
    }
  }
  return sender;
}

export function createContactsCache({ url, serviceRoleKey, fetchImpl = globalThis.fetch } = {}) {
  let origin;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) throw new Error();
    origin = parsed.origin;
  } catch { throw new Error('invalid_contacts_cache_config'); }
  if (!serviceRoleKey || typeof fetchImpl !== 'function') throw new Error('invalid_contacts_cache_config');
  async function cacheInboxSender({ message, accountEmail, signal } = {}) {
    const sender = parseInboxSender(message, { accountEmail });
    if (!sender) return { status: 'skipped' };
    const active = AbortSignal.any([AbortSignal.timeout(SOURCE_TOOL_TIMEOUT_MS), ...(signal ? [signal] : [])]);
    try {
      if (active.aborted) return { status: 'contact_cache_failed' };
      const response = await fetchImpl(`${origin}/rest/v1/contacts_cache?on_conflict=id`, {
        method: 'POST', redirect: 'error', signal: active,
        headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}`, 'Content-Type': 'application/json',
          Prefer: 'resolution=ignore-duplicates,return=minimal' },
        body: JSON.stringify({ id: inboxSenderId(sender.email), raw_input: sender }),
      });
      if (!response.ok) { await response.body?.cancel(); return { status: 'contact_cache_failed' }; }
      if (response.body) await boundedGoogleBody(response, { maxBytes: 4096, signal: active });
      if (active.aborted) return { status: 'contact_cache_failed' };
      return { status: 'ready' };
    } catch { return { status: 'contact_cache_failed' }; }
  }
  return Object.freeze({ cacheInboxSender });
}
