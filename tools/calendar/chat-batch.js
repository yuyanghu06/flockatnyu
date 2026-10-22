import {createHash} from 'node:crypto';
import {googleDiagnostics,googleError} from '../../server/google/oauth.js';
import {batchTimingProperties,normalizeBatchTiming,validateBatchTiming,batchTimingFields,batchLocalDate} from './chat-boundaries.js';

const validId=value=>typeof value==='string'&&/^[a-zA-Z0-9_-]{5,1024}$/.test(value);
const normalizedTitle=value=>value.normalize('NFKC').trim().replace(/\s+/gu,' ').toLowerCase();
const text=(value,max,required=false)=>typeof value==='string'&&value.length<=max&&(!required||value.trim().length>0)&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(value);
const canonicalUrl=(id,calendarId)=>`https://calendar.google.com/calendar/event?eid=${Buffer.from(`${id} ${calendarId}`).toString('base64url')}`;
// Only provider-returned strings confirm saved location; absence remains unknown.
export const calendarReceiptLocation=value=>typeof value?.location==='string'
  ?{location:value.location.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').slice(0,500)}:{};
const fatal=new Set(['forbidden','permission_denied','reauthorization_required','account_mismatch','not_configured','aborted']);
const optionalFields={description:{type:'string',maxLength:3000},location:{type:'string',maxLength:500}};
const define=(name,description,properties,required)=>Object.freeze({name,description,idempotent:true,parameters:{type:'object',additionalProperties:false,required:['events'],properties:{events:{type:'array',minItems:1,maxItems:50,items:{type:'object',additionalProperties:false,required,properties}}}}});
export const CHAT_CALENDAR_BATCH_TOOL=define('create_calendar_events',
  'Create up to50 requested timed OR all-day events. Never discard known times or put them only in descriptions. Use compact {title,date,startTime:"HH:MM",endTime:"HH:MM",timeZone} for same-day timed rows; alternatively title+start/end RFC3339 boundaries. Date alone means truly all-day, with server exclusive next-day end. Do not mix date with canonical start/end. Backend performs bounded complete per-window duplicate checks; no separate Calendar scan. Exact title+times/date matches skip, unrelated overlaps remain. Wrong all-day versions of requested timed events require update_calendar_events using exact IDs, not duplicate creates. Skip unresolved source rows and report after clear rows. No attendees, recurrence or alternate calendar.',
  {title:{type:'string',minLength:1,maxLength:300},...batchTimingProperties,...optionalFields},['title']);
export const CHAT_CALENDAR_BATCH_UPDATE_TOOL=define('update_calendar_events',
  'Patch up to50 exact eventIds from prior receipts or a narrowed Calendar listing. Internally reads each exact ID for a fresh hidden revision then patches only supplied fields, preserving IDs/human fields; conflicts/unsupported rows fail independently. Use compact {eventId,date,startTime:"HH:MM",endTime:"HH:MM",timeZone} to correct timed schedules without expanding arguments. Canonical start/end may convert all-day/timed; never omit known times. Title-only matches do not select an eventId. No attendees, recurrence, invitations or alternate calendar.',
  {eventId:{type:'string',minLength:5,maxLength:1024},title:{type:'string',minLength:1,maxLength:300},...batchTimingProperties,...optionalFields},['eventId']);
function fields(value) {
  if(value.title!==undefined&&!text(value.title,300,true)||value.description!==undefined&&!text(value.description,3000)||value.location!==undefined&&!text(value.location,500))throw Error('invalid_event');
  return Object.fromEntries(['title','description','location'].filter(key=>value[key]!==undefined).map(key=>[key,value[key]]));
}
function receipt(value,calendarId,fallback) {
  if(!validId(value?.eventId)||value.url!==canonicalUrl(value.eventId,calendarId)||!['created','reconciled','unchanged','existing','updated'].includes(value.outcome))return null;
  try {return {outcome:value.outcome,eventId:value.eventId,url:value.url,...calendarReceiptLocation(value),...batchTimingFields(value.start&&value.end?value:fallback)};}catch{return null;}
}
function failureDiagnostics(value,reason='google_unavailable',stage='provider_request') {
  return {diagnostics:googleDiagnostics(value?.diagnostics??{stage,reason})};
}
function caughtFailure(error,signal) {
  const safe=googleError(error,signal);
  // Preserve batch's existing catch status; keep the underlying safe cause too.
  return {status:signal?.aborted?'aborted':'google_unavailable',diagnostics:safe.diagnostics};
}
function stoppedDiagnostics(diagnostics) {
  // A skipped row has no HTTP response of its own, even when an earlier row did.
  return failureDiagnostics(null,diagnostics?.reason||'aborted',diagnostics?.stage||'local_validation');
}
function finish(items,family) {
  const counts={requested:items.length,...(family==='update'?{updated:0,unchanged:0}:{created:0,existing:0}),failed:0,unattempted:0};
  for(const item of items)counts[item.status]++;
  const complete=!counts.failed&&!counts.unattempted;
  return {status:complete?'ready':'partial',sources:[],calendarBatchWrite:{complete,counts,items}};
}
function sameTiming(a,b) {
  return Boolean(a.start?.date)===Boolean(b.start?.date)&&['start','end'].every(key=>a[key]?.date? a[key].date===b[key]?.date
    :Number.isFinite(Date.parse(a[key]?.dateTime))&&Date.parse(a[key].dateTime)===Date.parse(b[key]?.dateTime));
}

export async function createCalendarBatch({client,events,principal,operationId,signal}) {
  const cache=new Map(),items=[];let pagesUsed=0,stopReason,stopDiagnostics;
  async function duplicateWindow(timing) {
    const date=batchLocalDate(timing),stamp=Date.parse(date+'T00:00:00Z');
    const window={timeMin:new Date(stamp-14*3600000).toISOString(),timeMax:new Date(Math.max(stamp+86400000+14*3600000,Date.parse(timing.end.date||timing.end.dateTime)+1)).toISOString()};
    const key=JSON.stringify(window);if(cache.has(key))return cache.get(key);
    const found=[],tokens=new Set();let pageToken,checked={status:'failed',reason:'duplicate_check_incomplete',...failureDiagnostics(null,'invalid_response','response_parse')};
    for(let page=0;page<20;page++) {
      if(signal?.aborted){checked={status:'unattempted',reason:'aborted',...stoppedDiagnostics()};break;}
      if(pagesUsed>=100){checked={status:'failed',reason:'duplicate_check_budget_exhausted',...failureDiagnostics(null,'context_limit','local_validation')};break;}
      pagesUsed++;let result;
      try {result=await client.listEvents({...window,limit:5,...(pageToken?{pageToken}:{}),principal,signal});}catch(error){result=caughtFailure(error,signal);}
      if(result?.status!=='ready'||!Array.isArray(result.events)||result.events.length>5){checked={status:'failed',reason:result?.status==='ready'?'invalid_response':result?.status||'google_unavailable',...failureDiagnostics(result,result?.status==='ready'?'invalid_response':result?.status,result?.status==='ready'?'response_parse':'provider_request')};break;}
      if(result.events.some(event=>!validId(event?.eventId)||typeof event.title!=='string'||!event.start||!event.end)){checked={status:'failed',reason:'invalid_response',...failureDiagnostics(null,'invalid_response','response_parse')};break;}
      found.push(...result.events);const next=result.nextPageToken;
      if(next===undefined||next===null){if(result.coverage?.complete===true)checked={status:'ready',events:found};break;}
      if(!text(next,2000,true)||tokens.has(next)){checked={status:'failed',reason:'duplicate_check_incomplete',...failureDiagnostics(null,'invalid_response','response_parse')};break;}
      tokens.add(next);pageToken=next;
    }
    cache.set(key,checked);return checked;
  }
  for(const [index,event] of events.entries()) {
    const base={index,title:event.title,...(event.date!==undefined?{date:event.date}:{})};
    if(signal?.aborted||stopReason){items.push({...base,status:'unattempted',reason:stopReason||'aborted',...stoppedDiagnostics(signal?.aborted?undefined:stopDiagnostics)});continue;}
    let timing,desired;
    try {timing=normalizeBatchTiming(event,true);desired={...fields(event),...timing};}catch(error){items.push({...base,status:'failed',reason:error.message==='ambiguous_local_time'||error.message==='nonexistent_local_time'?error.message:'invalid_event',...failureDiagnostics(null,timing?'invalid_request':'invalid_time_window','local_validation')});continue;}
    const checked=await duplicateWindow(timing);
    if(signal?.aborted){items.push({...base,status:'unattempted',reason:'aborted',...stoppedDiagnostics()});continue;}
    if(checked.status!=='ready'){if(fatal.has(checked.reason)){stopReason=checked.reason;stopDiagnostics=checked.diagnostics;}items.push({...base,status:checked.status,reason:checked.reason,...failureDiagnostics(checked)});continue;}
    const relevant=[...new Map(checked.events.filter(existing=>existing.status!=='cancelled'&&normalizedTitle(existing.title)===normalizedTitle(event.title)).map(existing=>[existing.eventId,existing])).values()];
    const matches=relevant.filter(existing=>sameTiming(existing,timing));
    if(matches.length>1){items.push({...base,status:'failed',reason:'ambiguous_existing_events',...failureDiagnostics(null,'invalid_request','local_validation')});continue;}
    if(matches.length===1){const saved=receipt({...matches[0],outcome:'existing'},client.calendarId,matches[0]);items.push(saved?{...base,...batchTimingFields(saved),status:'existing',calendarWrite:saved}:{...base,status:'failed',reason:'invalid_response',...failureDiagnostics(null,'invalid_response','response_parse')});continue;}
    // A known date-only version must be corrected by ID, never duplicated as a
    // timed copy merely because its boundary representation differs.
    if(timing.start.dateTime&&relevant.some(existing=>existing.start?.date===batchLocalDate(timing))){items.push({...base,status:'failed',reason:'existing_event_requires_update',...failureDiagnostics(null,'invalid_request','local_validation')});continue;}
    const identity=createHash('sha256').update(JSON.stringify(['chat-calendar-batch-v2',operationId,normalizedTitle(event.title),timing])).digest('hex');let result;
    try {result=await client.createChatEvent({...desired,operationId:identity,principal,signal});}catch(error){result=caughtFailure(error,signal);}
    const saved=result?.status==='ready'?receipt(result,client.calendarId,timing):null;
    if(!saved){const reason=result?.status==='ready'?'invalid_response':result?.status||'google_unavailable';if(fatal.has(reason)){stopReason=reason;stopDiagnostics=failureDiagnostics(result,reason,result?.status==='ready'?'response_parse':'provider_request').diagnostics;}items.push({...base,status:'failed',reason,...failureDiagnostics(result,reason,result?.status==='ready'?'response_parse':'provider_request')});continue;}
    const status=saved.outcome==='unchanged'?'existing':'created';items.push({...base,...batchTimingFields(saved),status,calendarWrite:saved});
    checked.events.push({eventId:saved.eventId,title:event.title,start:saved.start,end:saved.end,url:saved.url,...calendarReceiptLocation(saved),status:'confirmed'});
  }
  return finish(items,'create');
}

export async function updateCalendarBatch({client,events,principal,signal}) {
  const items=[];let stopReason,stopDiagnostics;
  for(const [index,event] of events.entries()) {
    const base={index,eventId:event.eventId,...(event.title!==undefined?{title:event.title}:{})};
    if(signal?.aborted||stopReason){items.push({...base,status:'unattempted',reason:stopReason||'aborted',...stoppedDiagnostics(signal?.aborted?undefined:stopDiagnostics)});continue;}
    let patch,validatingTiming=false;
    try {if(!validId(event.eventId))throw Error('invalid_event');const inputFields=fields(event);validatingTiming=true;const timing=normalizeBatchTiming(event);validatingTiming=false;patch={...inputFields,...timing};if(!Object.keys(patch).length)throw Error('invalid_event');}
    catch(error){items.push({...base,status:'failed',reason:['ambiguous_local_time','nonexistent_local_time'].includes(error.message)?error.message:'invalid_event',...failureDiagnostics(null,validatingTiming?'invalid_time_window':'invalid_request','local_validation')});continue;}
    let read;
    try {read=await client.readChatEvent({eventId:event.eventId,principal,signal});}catch(error){read=caughtFailure(error,signal);}
    const current=read?.events?.[0],revision=read?.chatRevision;
    let reason=read?.status!=='ready'?read?.status||'google_unavailable':!current?'not_found':null;
    if(!reason&&(read.events.length!==1||current.eventId!==event.eventId||revision?.eventId!==event.eventId||!text(revision.etag,1000,true)||/[\r\n]/.test(revision.etag)||typeof revision.unsupported!=='boolean'))reason='invalid_response';
    if(!reason&&revision.unsupported)reason='unsupported_event';
    if(reason){if(fatal.has(reason)){stopReason=reason;stopDiagnostics=failureDiagnostics(read,reason,reason==='invalid_response'?'response_parse':'provider_request').diagnostics;}items.push({...base,status:'failed',reason,...failureDiagnostics(read,reason,reason==='invalid_response'?'response_parse':'provider_request')});continue;}
    let desired;
    try {desired={...current,...patch};validateBatchTiming(desired,true);}catch{items.push({...base,status:'failed',reason:'invalid_event',...failureDiagnostics(null,'invalid_time_window','local_validation')});continue;}
    let result;
    try {result=await client.updateChatEvent({...patch,eventId:event.eventId,expectedEtag:revision.etag,principal,signal});}catch(error){result=caughtFailure(error,signal);}
    const saved=result?.status==='ready'&&result.eventId===event.eventId?receipt(result,client.calendarId,desired):null;
    if(!saved||!['updated','unchanged'].includes(saved.outcome)){reason=result?.status==='ready'?'invalid_response':result?.status||'google_unavailable';if(fatal.has(reason)){stopReason=reason;stopDiagnostics=failureDiagnostics(result,reason,result?.status==='ready'?'response_parse':'provider_request').diagnostics;}items.push({...base,status:'failed',reason,...failureDiagnostics(result,reason,result?.status==='ready'?'response_parse':'provider_request')});continue;}
    items.push({...base,title:patch.title??current.title,...batchTimingFields(saved),status:saved.outcome,calendarWrite:saved});
  }
  return finish(items,'update');
}

export function projectCalendarBatchWrite(value) {
  if(!value||!Array.isArray(value.items)||value.items.length<1||value.items.length>50||typeof value.complete!=='boolean')return null;
  const updating=Object.hasOwn(value.counts||{},'updated'),counts={requested:value.items.length,...(updating?{updated:0,unchanged:0}:{created:0,existing:0}),failed:0,unattempted:0},items=[];
  for(const [index,item] of value.items.entries()) {
    if(item.index!==index||!Object.hasOwn(counts,item.status)||item.status==='requested'||item.title!==undefined&&(typeof item.title!=='string'||item.title.length>300)||item.date!==undefined&&(typeof item.date!=='string'||item.date.length>10))return null;
    const row={index,status:item.status,...(item.title!==undefined?{title:item.title}:{}),...(item.date!==undefined?{date:item.date}:{}),...(validId(item.eventId)?{eventId:item.eventId}:{})};
    if(['created','existing','updated','unchanged'].includes(item.status)) {
      const saved=item.calendarWrite;
      if(!validId(saved?.eventId)||typeof saved.url!=='string'||!/^https:\/\/calendar\.google\.com\/calendar\/event\?eid=[A-Za-z0-9_-]+$/.test(saved.url)||!['created','reconciled','unchanged','existing','updated'].includes(saved.outcome))return null;
      try {const timing=batchTimingFields(item.start&&item.end?item:saved);Object.assign(row,timing);row.calendarWrite={outcome:saved.outcome,eventId:saved.eventId,url:saved.url,...calendarReceiptLocation(saved),...timing};}catch{return null;}
    }
    if(typeof item.reason==='string')row.reason=item.reason.slice(0,100);
    counts[item.status]++;items.push(row);
  }
  if(Object.keys(counts).some(key=>value.counts?.[key]!==counts[key])||value.complete!==(!counts.failed&&!counts.unattempted))return null;
  return {complete:value.complete,counts,items};
}
