import { readGoogleConfig, GOOGLE_SCOPES, GOOGLE_CALENDAR_SCOPES } from './config.js';

export const CALENDAR_REQUIRED_SCOPES = Object.freeze([...GOOGLE_SCOPES, ...GOOGLE_CALENDAR_SCOPES]);
export function readCalendarConfig(env = process.env) {
  const google = readGoogleConfig(env);
  const calendarId = typeof env.GOOGLE_CALENDAR_ID === 'string' ? env.GOOGLE_CALENDAR_ID.trim() : '';
  const targetConfigured = calendarId !== 'primary' && /^[A-Za-z0-9_.+@-]{3,254}$/.test(calendarId) && calendarId.includes('@');
  return Object.freeze({ ...google, calendarId, targetConfigured, configured: google.configured && targetConfigured });
}
