import { readGoogleConfig, GOOGLE_SCOPES, GOOGLE_CALENDAR_SCOPES } from './config.js';

export const CALENDAR_REQUIRED_SCOPES = Object.freeze([...GOOGLE_SCOPES, ...GOOGLE_CALENDAR_SCOPES]);
export function readCalendarConfig(env = process.env) {
  const google = readGoogleConfig(env);
  const calendarId = typeof env.GOOGLE_CALENDAR_ID === 'string' ? env.GOOGLE_CALENDAR_ID.trim() : '';
  const sourceId = typeof env.AGENT_CALENDAR_SOURCE_ID === 'string' ? env.AGENT_CALENDAR_SOURCE_ID.trim() : '';
  const targetConfigured = calendarId !== 'primary' && /^[A-Za-z0-9_.+@-]{3,254}$/.test(calendarId) && calendarId.includes('@');
  return Object.freeze({ ...google, calendarId, sourceId, targetConfigured, configured: google.configured && targetConfigured });
}

// A separately pinned target shares OAuth/account verification, never source grants.
export function readMemberPlansConfig(env = process.env) {
  const config=readCalendarConfig({...env,GOOGLE_CALENDAR_ID:env.GOOGLE_MEMBER_PLANS_CALENDAR_ID,AGENT_CALENDAR_SOURCE_ID:env.AGENT_MEMBER_PLANS_SOURCE_ID});
  const signingKey=typeof env.AGENT_MEMBER_PLANS_SIGNING_KEY==='string'?env.AGENT_MEMBER_PLANS_SIGNING_KEY:'';
  const club=readCalendarConfig(env);
  const distinct=config.calendarId!==club.calendarId&&config.sourceId!==club.sourceId;
  const validSource=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(config.sourceId);
  return Object.freeze({...config,signingKey,configured:config.configured&&distinct&&validSource&&signingKey.length>=32});
}
