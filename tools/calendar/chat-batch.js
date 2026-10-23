import {createHash} from 'node:crypto';
import {projectCalendarReceipt} from '../../server/google/calendar-receipt.js';
import {googleDiagnostics,googleError} from '../../server/google/oauth.js';
import {batchTimingProperties,normalizeBatchTiming,validateBatchTiming,savedBatchTimingFields} from './chat-boundaries.js';

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
  'Create up to50 requested timed OR all-day events. Never discard known times or put them only in descriptions. Use compact {title,date,startTime:"HH:MM",endTime:"HH:MM",timeZone} for same-day timed rows; alternatively title+start/end RFC3339 boundaries. Date alone means truly all-day, with server exclusive next-day end. Do not mix date with canonical start/end. This tool only creates the supplied rows; it does not list Calendar or match existing events. Use a separate list_calendar_events call to inspect potential duplicates and decide which rows to submit. Update an existing event by exact ID instead of submitting a replacement create. Skip unresolved source rows and report after clear rows. No attendees, recurrence or alternate calendar.',
  {title:{type:'string',minLength:1,maxLength:300},...batchTimingProperties,...optionalFields},['title']);
export const CHAT_CALENDAR_BATCH_UPDATE_TOOL=define('update_calendar_events',
  'Patch up to50 exact eventIds from prior receipts or a narrowed Calendar listing. Internally reads each exact ID for a fresh hidden revision then patches only supplied fields, preserving IDs/human fields; conflicts/unsupported rows fail independently. Use compact {eventId,date,startTime:"HH:MM",endTime:"HH:MM",timeZone} to correct timed schedules without expanding arguments. Canonical start/end may convert all-day/timed; never omit known times. Title-only matches do not select an eventId. No attendees, recurrence, invitations or alternate calendar.',
  {eventId:{type:'string',minLength:5,maxLength:1024},title:{type:'string',minLength:1,maxLength:300},...batchTimingProperties,...optionalFields},['eventId']);
function fields(value) {
  if(value.title!==undefined&&!text(value.title,300,true)||value.description!==undefined&&!text(value.description,3000)||value.location!==undefined&&!text(value.location,500))throw Error('invalid_event');
  return Object.fromEntries(['title','description','location'].filter(key=>value[key]!==undefined).map(key=>[key,value[key]]));
}
function receipt(value,calendarId) {
  if(!validId(value?.eventId)||value.url!==canonicalUrl(value.eventId,calendarId)||!['created','reconciled','unchanged','existing','updated'].includes(value.outcome))return null;
  return projectCalendarReceipt(value);
}
function savedRow(base,saved,status) {
  // Successful display fields describe returned provider state only. Requested
  // title/date remain useful on failed rows, never as saved-state fallback.
  const {title:_,date:__,...identity}=base;
  return {...identity,...(typeof saved.title==='string'?{title:saved.title}:{}),...savedBatchTimingFields(saved),status,calendarWrite:saved};
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
export async function createCalendarBatch({client,events,principal,operationId,signal}) {
  const items=[];let stopReason,stopDiagnostics;
  for(const [index,event] of events.entries()) {
    const base={index,title:event.title,...(event.date!==undefined?{date:event.date}:{})};
    if(signal?.aborted||stopReason){items.push({...base,status:'unattempted',reason:stopReason||'aborted',...stoppedDiagnostics(signal?.aborted?undefined:stopDiagnostics)});continue;}
    let timing,desired;
    try {timing=normalizeBatchTiming(event,true);desired={...fields(event),...timing};}catch(error){items.push({...base,status:'failed',reason:error.message==='ambiguous_local_time'||error.message==='nonexistent_local_time'?error.message:'invalid_event',...failureDiagnostics(null,timing?'invalid_request':'invalid_time_window','local_validation')});continue;}
    // Retry identity is local to this requested operation. Discovering unrelated
    // existing events and deciding what to create belongs to separate reads.
    const identity=createHash('sha256').update(JSON.stringify(['chat-calendar-batch-v2',operationId,normalizedTitle(event.title),timing])).digest('hex');let result;
    try {result=await client.createChatEvent({...desired,operationId:identity,principal,signal});}catch(error){result=caughtFailure(error,signal);}
    const saved=result?.status==='ready'?receipt(result,client.calendarId):null;
    if(!saved){const reason=result?.status==='ready'?'invalid_response':result?.status||'google_unavailable';if(fatal.has(reason)){stopReason=reason;stopDiagnostics=failureDiagnostics(result,reason,result?.status==='ready'?'response_parse':'provider_request').diagnostics;}items.push({...base,status:'failed',reason,...failureDiagnostics(result,reason,result?.status==='ready'?'response_parse':'provider_request')});continue;}
    const status=saved.outcome==='unchanged'?'existing':'created';items.push(savedRow(base,saved,status));
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
    const saved=result?.status==='ready'&&result.eventId===event.eventId?receipt(result,client.calendarId):null;
    if(!saved||!['updated','unchanged'].includes(saved.outcome)){reason=result?.status==='ready'?'invalid_response':result?.status||'google_unavailable';if(fatal.has(reason)){stopReason=reason;stopDiagnostics=failureDiagnostics(result,reason,result?.status==='ready'?'response_parse':'provider_request').diagnostics;}items.push({...base,status:'failed',reason,...failureDiagnostics(result,reason,result?.status==='ready'?'response_parse':'provider_request')});continue;}
    items.push(savedRow(base,saved,saved.outcome));
  }
  return finish(items,'update');
}

export function projectCalendarBatchWrite(value,{compact=false}={}) {
  if(!value||!Array.isArray(value.items)||value.items.length<1||value.items.length>50||typeof value.complete!=='boolean')return null;
  const updating=Object.hasOwn(value.counts||{},'updated'),counts={requested:value.items.length,...(updating?{updated:0,unchanged:0}:{created:0,existing:0}),failed:0,unattempted:0},items=[];
  for(const [index,item] of value.items.entries()) {
    if(item.index!==index||!Object.hasOwn(counts,item.status)||item.status==='requested'||item.title!==undefined&&(typeof item.title!=='string'||item.title.length>300)||item.date!==undefined&&(typeof item.date!=='string'||item.date.length>10))return null;
    const row={index,status:item.status,...(item.title!==undefined?{title:item.title}:{}),...(item.date!==undefined?{date:item.date}:{}),...(validId(item.eventId)?{eventId:item.eventId}:{})};
    if(item.details?.requestedFieldsOmitted===true)row.details={compacted:true,requestedFieldsOmitted:true};
    if(['created','existing','updated','unchanged'].includes(item.status)) {
      if(value.details?.receiptsOmitted===true&&item.receiptOmitted===true) {
        if(!validId(item.eventId)||!['created','reconciled','unchanged','existing','updated'].includes(item.outcome))return null;
        counts[item.status]++;items.push({index,status:item.status,eventId:item.eventId,outcome:item.outcome,receiptOmitted:true,reason:'context_limit'});continue;
      }
      const saved=item.calendarWrite;
      if(!validId(saved?.eventId)||typeof saved.url!=='string'||!/^https:\/\/calendar\.google\.com\/calendar\/event\?eid=[A-Za-z0-9_-]+$/.test(saved.url)||!['created','reconciled','unchanged','existing','updated'].includes(saved.outcome))return null;
      const projected=projectCalendarReceipt(saved,{compact});if(!projected)return null;
      delete row.title;delete row.date;
      if(!compact)Object.assign(row,...(typeof projected.title==='string'?[{title:projected.title}]:[]),savedBatchTimingFields(projected));
      row.calendarWrite=projected;
    }
    if(typeof item.reason==='string')row.reason=item.reason.slice(0,100);
    counts[item.status]++;items.push(row);
  }
  if(Object.keys(counts).some(key=>value.counts?.[key]!==counts[key])||value.complete!==(!counts.failed&&!counts.unattempted))return null;
  return {complete:value.complete,counts,items,...(value.details?.receiptsOmitted===true?{details:{compacted:true,reason:'context_limit',receiptsOmitted:true}}:{})};
}

export function compactCalendarBatchWrite(value) {
  const compacted=projectCalendarBatchWrite(value,{compact:true});
  if(!compacted||Buffer.byteLength(JSON.stringify(compacted))<=60000)return compacted;
  // Location and verbose field coverage are expendable before saved titles or
  // timings. This keeps50maximum writable titles with realistic provider IDs.
  const coreFields=new Set(['title','eventStatus','start','end','timeZone','allDay']);
  const thin={...compacted,items:compacted.items.map(item=>{
    if(!item.calendarWrite)return {index:item.index,status:item.status,...(item.eventId?{eventId:item.eventId}:{}),...(item.reason?{reason:item.reason}:{}),details:{compacted:true,requestedFieldsOmitted:true}};
    const saved={...item.calendarWrite},details={...saved.details,coverageOmitted:true};
    if(Object.hasOwn(saved,'location')) {delete saved.location;details.truncatedFields=[...new Set([...details.truncatedFields,'location'])];details.omittedFields=[...new Set([...(details.omittedFields||[]),'location'])];}
    details.missingFields=details.missingFields.filter(key=>coreFields.has(key));saved.details=details;
    return {index:item.index,status:item.status,calendarWrite:saved};
  })};
  if(Buffer.byteLength(JSON.stringify(thin))<=60000)return thin;
  // Fifty maximum-size provider IDs/URLs and titles cannot all fit a native
  //64KB result. Keep every exact saved identity/outcome; explicitly flag the
  // unavailable detailed receipts rather than silently dropping successful rows.
  return {complete:compacted.complete,counts:compacted.counts,details:{compacted:true,reason:'context_limit',receiptsOmitted:true},
    items:compacted.items.map(item=>item.calendarWrite?{index:item.index,status:item.status,
      eventId:item.calendarWrite.eventId,outcome:item.calendarWrite.outcome,receiptOmitted:true,reason:'context_limit'}:
      {index:item.index,status:item.status,...(item.eventId?{eventId:item.eventId}:{}),...(item.reason?{reason:item.reason}:{}),details:{compacted:true,requestedFieldsOmitted:true}})};
}
