import {uuid} from './events.js';

// Compatibility validation for existing stored attendance links only.
// Chat writes use the normal map tools; no attendance service is exposed.
export function chatAttendanceOrigin(value) {
  try {
    const url=new URL(value);
    return typeof value==='string' && !/[\s\x00-\x1f\x7f]/u.test(value) && url.protocol==='https:' && !url.username && !url.password
      && !url.search && !url.hash && ['', '/'].includes(url.pathname) ? url.origin : null;
  } catch { return null; }
}
export function chatAttendanceReference(sourceUrl,origin) {
  if(!origin || typeof sourceUrl!=='string')return null;
  try {
    const url=new URL(sourceUrl),match=/^#attendance-([0-9a-f-]{36})-([0-9a-f-]{36})$/.exec(url.hash),eventId=url.searchParams.get('event');
    if(!match || !uuid(eventId) || !uuid(match[1]) || !uuid(match[2]) || eventId!==eventId.toLowerCase()
      || sourceUrl!==`${origin}/?event=${eventId}#attendance-${match[1]}-${match[2]}`)return null;
    return {eventId,personId:match[1],requestId:match[2]};
  } catch { return null; }
}
