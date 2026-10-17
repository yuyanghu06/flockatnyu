// Calendar interpretation belongs to the request, independently of authorization.
const formatters = new Map();
export function canonicalTimeZone(value) {
  if (value === undefined) return 'UTC';
  if (typeof value !== 'string' || !value || value.length > 100 || value.trim() !== value
    || !/^[A-Za-z][A-Za-z0-9_+.-]*(?:\/[A-Za-z0-9_+.-]+)*$/.test(value)
    || /^(?:UTC|GMT)[+-]/i.test(value)) return null;
  try { return new Intl.DateTimeFormat('en', { timeZone: value }).resolvedOptions().timeZone; }
  catch { return null; }
}
function formatter(timeZone) {
  if (!formatters.has(timeZone)) {
    if (formatters.size >= 32) formatters.delete(formatters.keys().next().value);
    formatters.set(timeZone, new Intl.DateTimeFormat('en-GB', { timeZone, calendar: 'iso8601', numberingSystem: 'latn',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }));
  }
  return formatters.get(timeZone);
}
function localParts(instant, timeZone) {
  const parts = Object.fromEntries(formatter(timeZone).formatToParts(instant).map(part => [part.type, part.value]));
  const localDate = `${parts.year.padStart(4, '0')}-${parts.month}-${parts.day}`;
  return { localDate, localDateTime: `${localDate}T${parts.hour}:${parts.minute}:${parts.second}` };
}
export function createTimeContext({ timeZone, now = new Date() } = {}) {
  const zone = canonicalTimeZone(timeZone);
  if (!zone || !(now instanceof Date) && !['string', 'number'].includes(typeof now)) return null;
  const instant = now instanceof Date ? new Date(now.getTime()) : new Date(now);
  if (!Number.isFinite(instant.getTime())) return null;
  return Object.freeze({ timeZone: zone, now: instant.toISOString(), ...localParts(instant, zone) });
}
function calendarDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match || Number(match[1]) < 1) return null;
  const date = new Date(0);
  date.setUTCFullYear(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  date.setUTCHours(0, 0, 0, 0);
  return date.getUTCFullYear() === Number(match[1]) && date.getUTCMonth() + 1 === Number(match[2])
    && date.getUTCDate() === Number(match[3]) ? date : null;
}
function addCalendarDays(value, days) {
  const date = calendarDate(value);
  if (!date) return null;
  date.setUTCDate(date.getUTCDate() + days);
  return date.getUTCFullYear() >= 1 && date.getUTCFullYear() <= 9999 ? date.toISOString().slice(0, 10) : null;
}
function startOfCalendarDay(value, timeZone) {
  const nominal = calendarDate(value);
  if (!nominal) return null;
  // Search the first real instant belonging to this local calendar day. This
  // handles midnight gaps, overlaps and non-hour offsets; skipped days fail.
  let low = nominal.getTime() - 36 * 3600000, high = nominal.getTime() + 36 * 3600000;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (localParts(new Date(middle), timeZone).localDate < value) low = middle + 1;
    else high = middle;
  }
  return localParts(new Date(low), timeZone).localDate === value ? new Date(low).toISOString() : null;
}
function explicitInstant(value) {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match || !calendarDate(match[1]) || Number(match[2]) > 23 || Number(match[3]) > 59
    || Number(match[4] || 0) > 59 || match[6] !== 'Z' && (Number(match[6].slice(1, 3)) > 23 || Number(match[6].slice(4)) > 59)) return null;
  const instant = new Date(value);
  return Number.isFinite(instant.getTime()) ? instant.toISOString() : null;
}
export function resolveDateBoundary(value, { timeZone, now = new Date() } = {}) {
  const zone = canonicalTimeZone(timeZone);
  if (!zone || typeof value !== 'string' || value.length > 40) return null;
  if (['today', 'yesterday', 'tomorrow'].includes(value)) {
    const context = createTimeContext({ timeZone: zone, now });
    if (!context) return null;
    const date = addCalendarDays(context.localDate, value === 'yesterday' ? -1 : value === 'tomorrow' ? 1 : 0);
    return date ? startOfCalendarDay(date, zone) : null;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return startOfCalendarDay(value, zone);
  return explicitInstant(value);
}
