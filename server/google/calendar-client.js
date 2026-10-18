import { createHash } from 'node:crypto';
import { readCalendarConfig, CALENDAR_REQUIRED_SCOPES } from './calendar-config.js';
import { boundedGoogleBody } from './client.js';
import { createGoogleOAuth, GoogleError, googleError, verifyGoogleToken, waitForGoogleAuth } from './oauth.js';

const ROOT = 'https://www.googleapis.com/calendar/v3';
const MANAGER = 'tech-nyu-update-agent-v1';
const hash = value => createHash('sha256').update(value).digest('hex');
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const eventIdValid = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{5,1024}$/.test(value);
const text = (value, max, required = false) => typeof value === 'string' && value.length <= max && (!required || value.trim().length > 0) && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value);
export const calendarEventId = (calendarId, sourceKey) => hash(JSON.stringify([calendarId, sourceKey]));

function dateValid(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const stamp = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(stamp) && new Date(stamp).toISOString().slice(0, 10) === value;
}
export function validCalendarInstant(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !dateValid(value.slice(0,10))) return false;
  const clock = value.slice(11,19).split(':').map(Number);
  const offset = value.endsWith('Z') ? [0,0] : value.slice(-5).split(':').map(Number);
  return clock[0] < 24 && clock[1] < 60 && clock[2] < 60 && offset[0] < 24 && offset[1] < 60 && Number.isFinite(Date.parse(value));
}
function boundary(value) {
  if (!object(value)) throw new GoogleError('invalid_request');
  if (Object.keys(value).length === 1 && dateValid(value.date)) return { date: value.date };
  if (Object.keys(value).length !== 2 || !validCalendarInstant(value.dateTime) || !text(value.timeZone, 100, true)) throw new GoogleError('invalid_request');
  try { new Intl.DateTimeFormat('en', { timeZone: value.timeZone }).format(); } catch { throw new GoogleError('invalid_request'); }
  return { dateTime: new Date(value.dateTime).toISOString(), timeZone: value.timeZone };
}
function managedFields(event) {
  return { summary: event.summary || '', description: event.description || '', location: event.location || '',
    start: boundary(event.start), end: boundary(event.end), status: event.status || 'confirmed', sourceUrl: event.source?.url || '' };
}
const fingerprint = event => hash(JSON.stringify(managedFields(event)));

// Only trusted runtime-owned Miro board/source pairs grant provenance. A model
// supplied HTTPS URL alone is never enough. Gmail/Discord writes are not exposed.
function provenance(args, principal) {
  const match = typeof args.sourceKey === 'string' && /^miro:([A-Za-z0-9_=-]{1,200}):([A-Za-z0-9_=-]{1,200})$/.exec(args.sourceKey);
  if (!match || !Array.isArray(principal?.calendarSources) || !Array.isArray(principal.allowedSourceIds)) throw new GoogleError('forbidden_source');
  const scope = principal.calendarSources.find(row => row?.boardId === match[1] && principal.allowedSourceIds.includes(row.sourceId));
  const expected = `https://miro.com/app/board/${encodeURIComponent(match[1])}/?moveToWidget=${encodeURIComponent(match[2])}`;
  if (!scope || args.sourceUrl !== expected) throw new GoogleError('forbidden_source');
  return { sourceHash: hash(args.sourceKey), sourceUrl: expected };
}

function displayBoundary(value) {
  if (!value) return null;
  if (dateValid(value.date)) return {date:value.date};
  if (!validCalendarInstant(value.dateTime)) throw new GoogleError('invalid_response');
  return {dateTime:new Date(value.dateTime).toISOString(),timeZone:typeof value.timeZone==='string'?value.timeZone.slice(0,100):null};
}
function eventOutput(event, calendarId) {
  if (!eventIdValid(event?.id)) throw new GoogleError('invalid_response');
  return { eventId: event.id, title: String(event.summary || '').slice(0, 300),
    description: String(event.description || '').slice(0, 1800), location: String(event.location || '').slice(0, 500),
    start: displayBoundary(event.start), end: displayBoundary(event.end),
    status: event.status || 'confirmed', managed: event.extendedProperties?.private?.updateAgentManager === MANAGER,
    url: `https://calendar.google.com/calendar/event?eid=${Buffer.from(`${event.id} ${calendarId}`).toString('base64url')}`,
    sourceUrl: typeof event.source?.url === 'string' ? event.source.url.slice(0, 1000) : '', partial: true };
}

export function createCalendarClient({ config = readCalendarConfig(), fetchImpl = globalThis.fetch, oauthClient } = {}) {
  const configured = Boolean(config.configured && config.calendarId && config.calendarId !== 'primary' && typeof fetchImpl === 'function');
  const oauth = oauthClient || createGoogleOAuth(config);
  if (configured) oauth.setCredentials({ refresh_token: config.refreshToken });
  const target = `${ROOT}/calendars/${encodeURIComponent(config.calendarId || '')}/events`;
  let lastStatus = configured ? 'configured' : 'not_configured';
  let oauthVerified = false;
  async function request(url, token, signal, { method = 'GET', body, etag } = {}) {
    // Every URL is constructed below from fixed Google API origins and encoded IDs.
    const response = await fetchImpl(url, { method, redirect: 'error', signal,
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}), ...(etag ? { 'If-Match': etag } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}) });
    if (!response.ok) {
      await response.body?.cancel();
      throw new GoogleError(({401:'reauthorization_required',403:'permission_denied',404:'not_found',409:'conflict',410:'gone',412:'conflict',429:'rate_limited'})[response.status] || 'google_unavailable');
    }
    try { return JSON.parse(await boundedGoogleBody(response, { maxBytes: 131072, signal })); }
    catch (error) { if (error instanceof GoogleError) throw error; throw new GoogleError('invalid_response'); }
  }
  async function verify(token, signal, write = false) {
    await verifyGoogleToken(oauth, token, config.expectedAccountEmail,
      t => request('https://gmail.googleapis.com/gmail/v1/users/me/profile', t, signal), signal, CALENDAR_REQUIRED_SCOPES);
    const acl = await request(`${ROOT}/users/me/calendarList/${encodeURIComponent(config.calendarId)}`, token, signal);
    if (acl.id !== config.calendarId || !['owner','writer', ...(write ? [] : ['reader','freeBusyReader'])].includes(acl.accessRole)) throw new GoogleError('permission_denied');
    oauthVerified = true;
    return acl;
  }
  function gate(principal) {
    if (typeof principal?.id !== 'string' || !principal.id || principal.calendarAccess !== true || principal.calendarId !== config.calendarId) throw new GoogleError('forbidden');
  }
  async function run(signal, operation, principal, { write = false, preflight = false } = {}) {
    if (!configured) return { status:'not_configured', events:[] };
    const timeout = AbortSignal.timeout(20000), active = signal ? AbortSignal.any([signal, timeout]) : timeout;
    try {
      if (!preflight) gate(principal);
      if (active.aborted) throw new GoogleError('aborted');
      const access = await waitForGoogleAuth(() => oauth.getAccessToken(), active);
      if (!access?.token) throw new GoogleError('reauthorization_required');
      const acl = await verify(access.token, active, write);
      const result = await operation(access.token, active, acl);
      if (Buffer.byteLength(JSON.stringify(result)) > 16384) throw new GoogleError('context_limit');
      lastStatus = 'ready'; return result;
    } catch (error) {
      const safe = timeout.aborted && !signal?.aborted ? new GoogleError('timeout') : googleError(error, signal);
      lastStatus = safe.code;
      if (['account_mismatch','reauthorization_required'].includes(safe.code)) oauthVerified = false;
      return { status:safe.code, events:[] };
    }
  }
  async function current(id, token, signal) {
    try {
      const event = await request(`${target}/${encodeURIComponent(id)}`, token, signal);
      if (event.id !== id) throw new GoogleError('invalid_response');
      return event;
    } catch (error) { if (error.code === 'not_found') return null; throw error; }
  }
  function owned(event, identity) {
    const privateData = event.extendedProperties?.private;
    if (privateData?.updateAgentManager !== MANAGER || privateData.updateAgentSource !== identity.sourceHash || event.source?.url !== identity.sourceUrl) throw new GoogleError('unmanaged_event');
    if (event.attendees?.length || event.recurrence?.length || event.recurringEventId || event.eventType && event.eventType !== 'default') throw new GoogleError('human_modified');
    if (privateData.updateAgentHash !== fingerprint(event)) throw new GoogleError('human_modified');
    if (typeof event.etag !== 'string' || !event.etag || event.etag.length > 1000 || /[\r\n]/.test(event.etag)) throw new GoogleError('invalid_response');
  }
  async function preflight({ signal } = {}) {
    return run(signal, async (_token, _active, acl) => ({status:'ready',calendarId:config.calendarId,accessRole:acl.accessRole}), undefined, {write:true,preflight:true});
  }
  async function listCalendars({ signal, pageToken } = {}) {
    if (pageToken !== undefined && !text(pageToken, 2000, true)) return {status:'invalid_request',calendars:[]};
    return run(signal, async (token, active) => {
      const params = new URLSearchParams({maxResults:'20',fields:'items(id,summary,accessRole),nextPageToken'});
      if(pageToken) params.set('pageToken',pageToken);
      const page = await request(`${ROOT}/users/me/calendarList?${params}`, token, active);
      if (!Array.isArray(page.items) || page.items.length > 20) throw new GoogleError('invalid_response');
      return {status:'ready',calendars:page.items.map(row=>({id:String(row.id).slice(0,254),title:String(row.summary||'').slice(0,300),accessRole:row.accessRole})),nextPageToken:page.nextPageToken||null};
    }, undefined, {preflight:true});
  }
  async function listEvents({timeMin,timeMax,pageToken,limit=5,principal,signal}={}) {
    if (!validCalendarInstant(timeMin) || !validCalendarInstant(timeMax) || Date.parse(timeMax)<=Date.parse(timeMin) || Date.parse(timeMax)-Date.parse(timeMin)>366*86400000 || !Number.isInteger(limit) || limit<1 || limit>5 || pageToken!==undefined&&!text(pageToken,2000,true)) return {status:'invalid_request',events:[]};
    return run(signal, async (token, active) => {
      const params = new URLSearchParams({timeMin,timeMax,maxResults:String(limit),singleEvents:'true',orderBy:'startTime',showDeleted:'false',fields:'items(id,summary,description,location,start,end,status,source,extendedProperties),nextPageToken'});
      if(pageToken) params.set('pageToken',pageToken);
      const page = await request(`${target}?${params}`, token, active);
      const items=page.items===undefined?[]:page.items;
      if (!Array.isArray(items)||items.length>limit||page.nextPageToken!==undefined&&!text(page.nextPageToken,2000,true)) throw new GoogleError('invalid_response');
      return {status:'ready',events:items.map(event=>eventOutput(event,config.calendarId)),nextPageToken:page.nextPageToken||null,coverage:{complete:!page.nextPageToken,windowOnly:true}};
    },principal);
  }
  async function readEvent({eventId,principal,signal}={}) {
    if(!eventIdValid(eventId)) return {status:'invalid_request',events:[]};
    return run(signal,async(token,active)=>{const event=await current(eventId,token,active);return {status:'ready',events:event?[eventOutput(event,config.calendarId)]:[]};},principal);
  }
  async function mutate(args, cancel) {
    const {principal,signal}=args||{};
    return run(signal,async(token,active)=>{
      const identity=provenance(args,principal), id=calendarEventId(config.calendarId,args.sourceKey);
      let desired;
      if (!cancel) {
        if (!text(args.title,300,true)||args.description!==undefined&&!text(args.description,3000)||args.location!==undefined&&!text(args.location,500)) throw new GoogleError('invalid_request');
        const start=boundary(args.start),end=boundary(args.end);
        if (Boolean(start.date)!==Boolean(end.date)||Date.parse(end.date||end.dateTime)<=Date.parse(start.date||start.dateTime)) throw new GoogleError('invalid_request');
        desired={summary:args.title,description:args.description||'',location:args.location||'',start,end,status:'confirmed',source:{url:identity.sourceUrl,title:'Miro source'}};
      }
      const existing=await current(id,token,active);
      if (!existing && cancel) return {status:'ready',outcome:'already_absent',eventId:id};
      if (existing) {
        owned(existing,identity);
        if (cancel) desired={...managedFields(existing),source:{url:identity.sourceUrl,title:'Miro source'},status:'cancelled'};
        if (!cancel && existing.status==='cancelled') throw new GoogleError('cancelled_event');
        if (cancel && existing.status==='cancelled'||!cancel&&fingerprint(existing)===fingerprint(desired)) return {status:'ready',outcome:'unchanged',eventId:id};
      }
      // managedFields uses sourceUrl for hashing only; never send it as a field.
      if (cancel) { delete desired.sourceUrl; desired.start=boundary(existing.start);desired.end=boundary(existing.end); }
      const desiredHash=fingerprint(desired);
      desired.extendedProperties={private:{...(existing?.extendedProperties?.private||{}),updateAgentManager:MANAGER,updateAgentSource:identity.sourceHash,updateAgentHash:desiredHash}};
      gate(principal);provenance(args,principal);
      // Recheck scopes/account and exact-calendar ACL immediately before mutation.
      await verify(token,active,true);
      if(active.aborted) throw new GoogleError('aborted');
      let outcome=existing?(cancel?'cancelled':'updated'):'created';
      try {
        const response=await request(existing?`${target}/${id}?sendUpdates=none`:`${target}?sendUpdates=none`,token,active,
          {method:existing?'PATCH':'POST',body:existing?desired:{id,...desired,reminders:{useDefault:false}},etag:existing?.etag});
        if(response.id!==id) throw new GoogleError('invalid_response');
      } catch(error) {
        // A deterministic ID closes the lost-response / queue-receipt gap. Do
        // not repeat a write blindly: verify the remote desired state instead.
        if(active.aborted) throw error;
        const reconciled=await current(id,token,active);
        if(!reconciled) throw error;
        owned(reconciled,identity);
        if(fingerprint(reconciled)!==desiredHash) throw new GoogleError('conflict');
        outcome='reconciled';
      }
      return {status:'ready',outcome,eventId:id};
    },principal,{write:true});
  }
  return Object.freeze({configured,calendarId:config.calendarId,status:()=>({configured,oauthVerified,status:lastStatus}),preflight,listCalendars,listEvents,readEvent,
    upsertEvent:args=>mutate(args,false),cancelEvent:args=>mutate(args,true)});
}
