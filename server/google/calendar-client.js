import {SOURCE_TOOL_TIMEOUT_MS} from '../source-timeout.js';
import { createHash } from 'node:crypto';
import { readCalendarConfig, CALENDAR_REQUIRED_SCOPES } from './calendar-config.js';
import { boundedGoogleBody } from './client.js';
import { createGoogleOAuth, GoogleError, googleError, verifyGoogleToken, waitForGoogleAuth } from './oauth.js';
import { canonicalJson } from '../automation/validation.js';

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

// Only trusted runtime-owned source receipts grant provenance. URLs and model
// source claims alone never grant Calendar writes.
function provenance(args, principal) {
  if(typeof args.sourceKey==='string'&&args.sourceKey.startsWith('discord:')) {
    const match=/^discord:([0-9]{1,20}):([0-9]{1,20}):([0-9]{1,20})$/.exec(args.sourceKey);
    const expected=match?`https://discord.com/channels/${match[1]}/${match[2]}/${match[3]}`:null;
    const scope=match&&principal?.calendarSources?.find(row=>row.provider==='discord'&&row.guildId===match[1]&&row.channelId===match[2]&&row.messageId===match[3]
      &&principal.allowedSourceIds?.includes(row.sourceId));
    if(!scope||args.sourceUrl!==expected)throw new GoogleError('forbidden_source');
    return {sourceHash:hash(args.sourceKey),sourceUrl:expected,sourceTitle:'Discord source'};
  }
  const match = typeof args.sourceKey === 'string' && /^miro:([A-Za-z0-9_=-]{1,200}):([A-Za-z0-9_=-]{1,200})(?::row:([A-Za-z0-9_=-]{1,200}))?$/.exec(args.sourceKey);
  if (!match || !Array.isArray(principal?.calendarSources) || !Array.isArray(principal.allowedSourceIds)) throw new GoogleError('forbidden_source');
  const scope = principal.calendarSources.find(row => row?.boardId === match[1] && principal.allowedSourceIds.includes(row.sourceId));
  const expected = `https://miro.com/app/board/${encodeURIComponent(match[1])}/?moveToWidget=${encodeURIComponent(match[2])}`;
  if (!scope || args.sourceUrl !== expected) throw new GoogleError('forbidden_source');
  return { sourceHash: hash(args.sourceKey), sourceUrl: expected, sourceTitle:'Miro source' };
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
    createdAt: validCalendarInstant(event.created) ? new Date(event.created).toISOString() : null,
    updatedAt: validCalendarInstant(event.updated) ? new Date(event.updated).toISOString() : null,
    url: `https://calendar.google.com/calendar/event?eid=${Buffer.from(`${event.id} ${calendarId}`).toString('base64url')}`,
    sourceUrl: typeof event.source?.url === 'string' ? event.source.url.slice(0, 1000) : '', partial: true };
}

function eventIdentityOutput(event,calendarId) {
  if(!eventIdValid(event?.id))throw new GoogleError('invalid_response');
  return {eventId:event.id,title:String(event.summary||'').slice(0,300),start:displayBoundary(event.start),end:displayBoundary(event.end),
    status:event.status||'confirmed',url:`https://calendar.google.com/calendar/event?eid=${Buffer.from(`${event.id} ${calendarId}`).toString('base64url')}`};
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
      throw new GoogleError(({400:'invalid_request',401:'reauthorization_required',403:'permission_denied',404:'not_found',409:'conflict',410:'gone',412:'conflict',429:'rate_limited'})[response.status] || 'google_unavailable');
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
    const timeout = AbortSignal.timeout(SOURCE_TOOL_TIMEOUT_MS), active = signal ? AbortSignal.any([signal, timeout]) : timeout;
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
  async function listEvents({timeMin,timeMax,pageToken,query,resultMode='full',limit=5,principal,signal}={}) {
    if (!validCalendarInstant(timeMin) || !validCalendarInstant(timeMax) || Date.parse(timeMax)<=Date.parse(timeMin) || Date.parse(timeMax)-Date.parse(timeMin)>366*86400000 || !Number.isInteger(limit) || limit<1 || limit>25 || !['full','identities'].includes(resultMode) || query!==undefined&&!text(query,300,true) || pageToken!==undefined&&!text(pageToken,2000,true)) return {status:'invalid_request',events:[]};
    return run(signal, async (token, active) => {
      const params = new URLSearchParams({timeMin,timeMax,maxResults:String(limit),singleEvents:'true',orderBy:'startTime',showDeleted:'false',fields:resultMode==='identities'?'items(id,summary,start,end,status),nextPageToken':'items(id,summary,description,location,start,end,status,source,extendedProperties,created,updated),nextPageToken'});
      if(pageToken) params.set('pageToken',pageToken);
      if(query!==undefined)params.set('q',query);
      const page = await request(`${target}?${params}`, token, active);
      const items=page.items===undefined?[]:page.items;
      if (!Array.isArray(items)||items.length>limit||page.nextPageToken!==undefined&&!text(page.nextPageToken,2000,true)) throw new GoogleError('invalid_response');
      return {status:'ready',events:items.map(event=>resultMode==='identities'?eventIdentityOutput(event,config.calendarId):eventOutput(event,config.calendarId)),nextPageToken:page.nextPageToken||null,coverage:{complete:!page.nextPageToken,windowOnly:true,...(resultMode==='identities'?{contentScope:'event_identities'}:{})}};
    },principal);
  }
  async function readEvent({eventId,principal,signal}={}) {
    if(!eventIdValid(eventId)) return {status:'invalid_request',events:[]};
    return run(signal,async(token,active)=>{const event=await current(eventId,token,active);return {status:'ready',events:event?[eventOutput(event,config.calendarId)]:[]};},principal);
  }
  const etagValid = value => typeof value==='string' && value.length>0 && value.length<=1000 && !/[\r\n]/.test(value);
  const chatUnsupported = event => Boolean(event.attendees?.length || event.recurrence?.length || event.recurringEventId || event.eventType && event.eventType!=='default');
  function chatGate(principal) {
    gate(principal);
    if (principal.calendarChatWrite!==true) throw new GoogleError('forbidden');
  }
  // Revision metadata is internal to the request wrapper, never a model-supplied
  // grant. Lists do not confer edit authority; an exact live read is required.
  async function readChatEvent({eventId,principal,signal}={}) {
    if(!eventIdValid(eventId))return {status:'invalid_request',events:[]};
    return run(signal,async(token,active)=>{
      const event=await current(eventId,token,active);
      return {status:'ready',events:event?[eventOutput(event,config.calendarId)]:[],
        chatRevision:event?{eventId,etag:etagValid(event.etag)?event.etag:null,unsupported:chatUnsupported(event)}:null};
    },principal);
  }
  function chatFields(args,create=false) {
    const patch={};
    if(create||Object.hasOwn(args,'title')){
      if(!text(args.title,300,true))throw new GoogleError('invalid_request');
      patch.summary=args.title;
    }
    for(const [key,max] of [['description',3000],['location',500]])if(Object.hasOwn(args,key)){
      if(!text(args[key],max))throw new GoogleError('invalid_request');patch[key]=args[key];
    }
    for(const key of ['start','end'])if(create||Object.hasOwn(args,key))patch[key]=boundary(args[key]);
    if(!Object.keys(patch).length)throw new GoogleError('invalid_request');
    return patch;
  }
  function chatTimes(event) {
    const start=displayBoundary(event.start),end=displayBoundary(event.end);
    if(!start||!end||Boolean(start.date)!==Boolean(end.date)||Date.parse(end.date||end.dateTime)<=Date.parse(start.date||start.dateTime))throw new GoogleError('invalid_response');
  }
  function chatMatches(event,patch) {
    return Object.entries(patch).every(([key,value])=>{
      if(key==='start'||key==='end')return canonicalJson(displayBoundary(event[key]))===canonicalJson(displayBoundary(value));
      return event[key]===value;
    });
  }
  function chatReceipt(event,outcome) {
    if(chatUnsupported(event))throw new GoogleError('unsupported_event');
    chatTimes(event);
    const output=eventOutput(event,config.calendarId);
    return {status:'ready',outcome,eventId:output.eventId,url:output.url,start:output.start,end:output.end,...(output.start.timeZone?{timeZone:output.start.timeZone}:{}),...(output.updatedAt?{updatedAt:output.updatedAt}:{})};
  }
  async function createChatEvent(args={}) {
    if(!object(args)||Object.keys(args).some(key=>!['title','description','location','start','end','operationId','principal','signal'].includes(key)))return {status:'invalid_request',events:[]};
    const {principal,signal,operationId}=args;
    try{chatGate(principal);}catch{return {status:'forbidden',events:[]};}
    return run(signal,async(token,active)=>{
      chatGate(principal);
      if(!text(operationId,200,true))throw new GoogleError('invalid_request');
      const desired={...chatFields(args,true),status:'confirmed'};
      try{chatTimes(desired);}catch{throw new GoogleError('invalid_request');}
      const identity=hash(canonicalJson(['chat-calendar-v1',config.calendarId,operationId,desired]));
      const id=identity;
      const matches=event=>!chatUnsupported(event)&&event.extendedProperties?.private?.chatRequestHash===identity&&chatMatches(event,desired);
      const existing=await current(id,token,active);
      if(existing){if(!matches(existing))throw new GoogleError('conflict');return chatReceipt(existing,'unchanged');}
      chatGate(principal);await verify(token,active,true);
      if(active.aborted)throw new GoogleError('aborted');
      let response,outcome='created';
      try{
        response=await request(`${target}?sendUpdates=none`,token,active,{method:'POST',body:{id,...desired,reminders:{useDefault:false},extendedProperties:{private:{chatRequestHash:identity}}}});
        if(response.id!==id||!matches(response))throw new GoogleError('invalid_response');
        chatTimes(response);
      }catch(error){
        if(active.aborted||error instanceof GoogleError&&!['google_unavailable','conflict','invalid_response'].includes(error.code))throw error;
        // Never repeat an ambiguous insert: inspect its deterministic identity.
        response=await current(id,token,active);
        if(!response)throw error;
        if(!matches(response))throw new GoogleError('conflict');
        outcome='reconciled';
      }
      return chatReceipt(response,outcome);
    },principal,{write:true});
  }
  async function mutateChatEvent(args={},cancel=false) {
    if(!object(args)||Object.keys(args).some(key=>!['eventId','expectedEtag','principal','signal',...(cancel?[]:['title','description','location','start','end'])].includes(key)))return {status:'invalid_request',events:[]};
    const {eventId,expectedEtag,principal,signal}=args;
    try{chatGate(principal);}catch{return {status:'forbidden',events:[]};}
    return run(signal,async(token,active)=>{
      chatGate(principal);
      if(!eventIdValid(eventId)||!etagValid(expectedEtag))throw new GoogleError('invalid_request');
      const existing=await current(eventId,token,active);
      if(!existing)throw new GoogleError('not_found');
      if(!etagValid(existing.etag))throw new GoogleError('invalid_response');
      if(existing.etag!==expectedEtag)throw new GoogleError('conflict');
      if(chatUnsupported(existing))throw new GoogleError('unsupported_event');
      if(!cancel&&existing.status==='cancelled')throw new GoogleError('cancelled_event');
      const patch=cancel?{status:'cancelled'}:chatFields(args);
      try{chatTimes({...existing,...patch});}catch{throw new GoogleError('invalid_request');}
      if(chatMatches(existing,patch))return chatReceipt(existing,'unchanged');
      chatGate(principal);await verify(token,active,true);
      if(active.aborted)throw new GoogleError('aborted');
      // Patch only requested fields. In particular, never reseal autonomous
      // updateAgentHash metadata: the worker must detect this explicit human edit.
      // Google PATCH merges nested objects. Explicitly remove the incompatible
      // representation when converting date-only events to timed or vice versa.
      const wirePatch={...patch};
      for(const key of ['start','end'])if(patch[key]) {
        if(patch[key].dateTime&&existing[key]?.date)wirePatch[key]={...patch[key],date:null};
        else if(patch[key].date&&existing[key]?.dateTime)wirePatch[key]={...patch[key],dateTime:null,timeZone:null};
      }
      const response=await request(`${target}/${encodeURIComponent(eventId)}?sendUpdates=none`,token,active,{method:'PATCH',body:wirePatch,etag:expectedEtag});
      if(response.id!==eventId||!chatMatches(response,patch))throw new GoogleError('invalid_response');
      return chatReceipt(response,cancel?'cancelled':'updated');
    },principal,{write:true});
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
        desired={summary:args.title,description:args.description||'',location:args.location||'',start,end,status:'confirmed',source:{url:identity.sourceUrl,title:identity.sourceTitle}};
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
  return Object.freeze({configured,calendarId:config.calendarId,status:()=>({configured,oauthVerified,status:lastStatus}),preflight,listCalendars,listEvents,readEvent,readChatEvent,createChatEvent,
    updateChatEvent:args=>mutateChatEvent(args,false),cancelChatEvent:args=>mutateChatEvent(args,true),
    upsertEvent:args=>mutate(args,false),cancelEvent:args=>mutate(args,true)});
}

export {boundary as normalizeCalendarBoundary};
