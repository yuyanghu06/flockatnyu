// Saved state comes exclusively from the provider response (including a
// reconciliation/unchanged GET), never from requested or pre-write fields.
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const id=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{5,1024}$/.test(value);
const instant=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)&&Number.isFinite(Date.parse(value));
const date=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
const outcomes=new Set(['created','updated','cancelled','unchanged','reconciled','existing','already_absent']);
const strings={title:300,description:3000,location:500,eventType:100,visibility:30,transparency:30,recurringEventId:1024};
const booleans=['guestsCanInviteOthers','guestsCanModify','guestsCanSeeOtherGuests','anyoneCanAddSelf','locked','privateCopy','endTimeUnspecified'];
const fields=[...Object.keys(strings),'eventStatus','start','end','timeZone','createdAt','updatedAt','allDay','originalStartTime','recurrence','attendees','organizer','creator','reminders',...booleans,'sequence'];
const known=new Set(fields);
const clean=value=>value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,'');
function timing(value) {
  if(!object(value))return undefined;
  if(date(value.date))return {date:value.date};
  if(!instant(value.dateTime))return undefined;
  let zone=null;
  if(typeof value.timeZone==='string'&&value.timeZone.length<=100) {
    try {new Intl.DateTimeFormat('en',{timeZone:value.timeZone});zone=value.timeZone;}catch{}
  }
  return {dateTime:new Date(value.dateTime).toISOString(),timeZone:zone};
}
function labels(value) {return Array.isArray(value)?value.filter(key=>known.has(key)):[];}
function person(value,mark) {
  if(!object(value))return undefined;
  const result={};
  for(const [key,max] of [['email',320],['displayName',200]])if(typeof value[key]==='string') {
    const text=clean(value[key]);result[key]=text.slice(0,max);if(text.length>max)mark();
  }
  for(const key of ['self','organizer','optional','resource'])if(typeof value[key]==='boolean')result[key]=value[key];
  if(['needsAction','declined','tentative','accepted'].includes(value.responseStatus))result.responseStatus=value.responseStatus;
  if(Number.isInteger(value.additionalGuests)&&value.additionalGuests>=0&&value.additionalGuests<=1000)result.additionalGuests=value.additionalGuests;
  return Object.keys(result).length?result:undefined;
}
export function projectCalendarReceipt(value,{compact=false}={}) {
  if(!object(value)||!outcomes.has(value.outcome)||!id(value.eventId)||typeof value.url!=='string'
    ||!/^https:\/\/calendar\.google\.com\/calendar\/event\?eid=[A-Za-z0-9_-]+$/.test(value.url)||value.url.length>2048)return null;
  const result={outcome:value.outcome,eventId:value.eventId,url:value.url};
  if(object(value.details)) {
    const absent=new Set(labels(value.details.missingFields));
    value={...value};for(const key of absent)delete value[key];
  }
  const truncated=new Set(labels(value.details?.truncatedFields)),omitted=new Set(labels(value.details?.omittedFields));
  const mark=key=>truncated.add(key);
  for(const [key,max] of Object.entries(strings))if(typeof value[key]==='string') {
    const text=clean(value[key]);result[key]=text.slice(0,max);if(text.length>max)mark(key);
  }
  if(['confirmed','tentative','cancelled','absent'].includes(value.eventStatus))result.eventStatus=value.eventStatus;
  for(const key of ['start','end','originalStartTime']) {const boundary=timing(value[key]);if(boundary)result[key]=boundary;}
  if(result.start&&result.end&&Boolean(result.start.date)===Boolean(result.end.date)) {
    result.allDay=Boolean(result.start.date);
    if(result.start.dateTime)result.timeZone=result.start.timeZone;
  }
  for(const key of ['createdAt','updatedAt'])if(instant(value[key]))result[key]=new Date(value[key]).toISOString();
  for(const key of booleans)if(typeof value[key]==='boolean')result[key]=value[key];
  if(Number.isSafeInteger(value.sequence)&&value.sequence>=0)result.sequence=value.sequence;
  if(Array.isArray(value.recurrence)) {
    result.recurrence=value.recurrence.slice(0,20).filter(row=>typeof row==='string').map(row=>{if(row.length>1000)mark('recurrence');return clean(row).slice(0,1000);});
    if(value.recurrence.length>20||result.recurrence.length!==value.recurrence.length)mark('recurrence');
  }
  for(const key of ['organizer','creator']) {const row=person(value[key],()=>mark(key));if(row)result[key]=row;}
  if(Array.isArray(value.attendees)) {
    result.attendees=value.attendees.slice(0,20).map(row=>person(row,()=>mark('attendees'))).filter(Boolean);
    if(value.attendees.length>20||result.attendees.length!==value.attendees.length)mark('attendees');
  }
  if(object(value.reminders)) {
    const reminders={};
    if(typeof value.reminders.useDefault==='boolean')reminders.useDefault=value.reminders.useDefault;
    if(Array.isArray(value.reminders.overrides)) {
      reminders.overrides=value.reminders.overrides.slice(0,10).filter(row=>object(row)&&['email','popup'].includes(row.method)&&Number.isInteger(row.minutes)&&row.minutes>=0&&row.minutes<=40320).map(row=>({method:row.method,minutes:row.minutes}));
      if(value.reminders.overrides.length>10||reminders.overrides.length!==value.reminders.overrides.length)mark('reminders');
    }
    if(Object.keys(reminders).length)result.reminders=reminders;
  }
  if(value.absent===true&&value.outcome==='already_absent'){result.absent=true;result.eventStatus='absent';}
  // A compacted receipt still distinguishes provider absence from details
  // deliberately omitted to keep all event identities and timings in context.
  const missing=new Set(labels(value.details?.missingFields));
  const core=new Set(['title','location','eventStatus','start','end','timeZone','allDay']);
  for(const key of fields)if(!Object.hasOwn(result,key)&&!omitted.has(key)&&!truncated.has(key)
    && (value.details?.coverageOmitted!==true||core.has(key)))missing.add(key);
  for(const key of Object.keys(result))missing.delete(key);
  const omit=key=>{if(Object.hasOwn(result,key)){delete result[key];omitted.add(key);truncated.add(key);}};
  if(compact)for(const key of fields)if(!['title','location','eventStatus','start','end','timeZone','allDay'].includes(key))omit(key);
  const coverage=()=>({missingFields:[...missing].sort(),truncatedFields:[...truncated].sort(),
    ...(omitted.size?{omittedFields:[...omitted].sort()}:{}),...(compact||value.details?.compacted===true?{compacted:true}:{}),
    ...(value.details?.coverageOmitted===true?{coverageOmitted:true}:{})});
  const bytes=()=>Buffer.byteLength(JSON.stringify({...result,details:coverage()}));
  // Leave space for wrapper status/identity metadata below the existing16KiB
  // direct-tool limit. Ancillary details go before any writable description.
  for(const key of ['recurrence','attendees','organizer','creator','reminders',...booleans,'sequence','originalStartTime','recurringEventId','createdAt','updatedAt','eventType','visibility','transparency'])if(bytes()>15000)omit(key);
  if(bytes()>15000)omit('location');
  // Maximum Unicode text plus unusually long provider IDs can exceed even a
  // core-only receipt budget. This exceptional truncation is always explicit.
  if(bytes()>15000&&typeof result.description==='string') {
    mark('description');
    const available=Math.max(0,15000-(bytes()-Buffer.byteLength(result.description))-100);
    let text='';for(const character of result.description){if(Buffer.byteLength(text+character)>available)break;text+=character;}
    result.description=text;
  }
  result.details=coverage();
  return result;
}
export function calendarEventReceipt(event,{calendarId,outcome,eventId,absent=false}={}) {
  const provider=object(event)?event:{};
  const identity=provider.id??eventId;
  if(!id(identity)||typeof calendarId!=='string'||!calendarId)return null;
  const value={...Object.fromEntries(fields.filter(key=>!['title','eventStatus','createdAt','updatedAt','allDay','timeZone'].includes(key)&&Object.hasOwn(provider,key)).map(key=>[key,provider[key]])),
    outcome,eventId:identity,url:`https://calendar.google.com/calendar/event?eid=${Buffer.from(`${identity} ${calendarId}`).toString('base64url')}`,
    ...(Object.hasOwn(provider,'summary')?{title:provider.summary}:{}),
    ...(Object.hasOwn(provider,'status')?{eventStatus:provider.status}:{}),
    ...(Object.hasOwn(provider,'created')?{createdAt:provider.created}:{}),
    ...(Object.hasOwn(provider,'updated')?{updatedAt:provider.updated}:{}),...(absent?{absent:true}:{})};
  return projectCalendarReceipt(value);
}
export const compactCalendarReceipt=value=>projectCalendarReceipt(value,{compact:true});
