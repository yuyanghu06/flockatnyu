import {createHash} from 'node:crypto';

const validId=value=>typeof value==='string'&&/^[a-zA-Z0-9_-]{5,1024}$/.test(value);
const normalizedTitle=value=>value.normalize('NFKC').trim().replace(/\s+/gu,' ').toLowerCase();
const text=(value,max,required=false)=>typeof value==='string'&&value.length<=max&&(!required||value.trim().length>0)
  &&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(value);
const dateValid=value=>typeof value==='string'&&/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value)
  &&value.slice(0,4)!=='0000'&&Number.isFinite(Date.parse(value+'T00:00:00Z'))
  &&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
const nextDate=value=>new Date(Date.parse(value+'T00:00:00Z')+86400000).toISOString().slice(0,10);
const canonicalUrl=(id,calendarId)=>`https://calendar.google.com/calendar/event?eid=${Buffer.from(`${id} ${calendarId}`).toString('base64url')}`;
const receipt=(value,calendarId)=>validId(value?.eventId)&&value.url===canonicalUrl(value.eventId,calendarId)
  &&['created','reconciled','unchanged','existing'].includes(value.outcome)
  ? {outcome:value.outcome,eventId:value.eventId,url:value.url}:null;

export const CHAT_CALENDAR_BATCH_TOOL=Object.freeze({name:'create_calendar_events',idempotent:true,
  description:'Create up to 50 requested all-day Calendar entries from clear source rows in one call. Supply title and literal YYYY-MM-DD date, optional description/location. The server calculates the exclusive next-day end and performs complete bounded per-date duplicate checks internally; no separate Calendar scan is needed. Exact existing title/date entries are skipped, unrelated overlaps are preserved. Skip blank/unassigned/TBD source rows before calling; do not block clear rows on another uncertain row. Each row returns its own receipt or failure. No attendees, recurrence, invitations or alternate calendar.',
  parameters:{type:'object',additionalProperties:false,required:['events'],properties:{events:{type:'array',minItems:1,maxItems:50,items:{type:'object',additionalProperties:false,required:['title','date'],properties:{
    title:{type:'string',minLength:1,maxLength:300},date:{type:'string',minLength:10,maxLength:10},
    description:{type:'string',maxLength:3000},location:{type:'string',maxLength:500},
  }}}}},
});

// The adapter supplies the fixed client/actor, never model-selected targets or
// grants. Every mutation still runs through createChatEvent's ACL/idempotency gate.
export async function createCalendarBatch({client,events,principal,operationId,signal}) {
  const cache=new Map(),items=[];let pagesUsed=0,stopReason;
  const fatal=new Set(['forbidden','permission_denied','reauthorization_required','account_mismatch','not_configured','aborted']);
  async function duplicateWindow(date) {
    if(cache.has(date))return cache.get(date);
    const stamp=Date.parse(date+'T00:00:00Z');
    // Cover all IANA offsets without deriving event dates from UTC timestamps.
    const window={timeMin:new Date(stamp-14*3600000).toISOString(),timeMax:new Date(stamp+86400000+14*3600000).toISOString()};
    const found=[],tokens=new Set();let pageToken;
    let checked={status:'failed',reason:'duplicate_check_incomplete'};
    for(let page=0;page<20;page++) {
      if(signal?.aborted){checked={status:'unattempted',reason:'aborted'};break;}
      if(pagesUsed>=100){checked={status:'failed',reason:'duplicate_check_budget_exhausted'};break;}
      pagesUsed++;
      let result;
      try {result=await client.listEvents({...window,limit:5,...(pageToken?{pageToken}:{}),principal,signal});}
      catch {result={status:signal?.aborted?'aborted':'google_unavailable'};}
      if(result?.status!=='ready'||!Array.isArray(result.events)||result.events.length>5) {
        checked={status:'failed',reason:result?.status==='ready'?'invalid_response':result?.status||'google_unavailable'};break;
      }
      if(result.events.some(event=>!validId(event?.eventId)||typeof event.title!=='string'||!event.start||!event.end)) {
        checked={status:'failed',reason:'invalid_response'};break;
      }
      found.push(...result.events);
      const next=result.nextPageToken;
      if(next===undefined||next===null) {
        if(result.coverage?.complete===true)checked={status:'ready',events:found};
        break;
      }
      if(!text(next,2000,true)||tokens.has(next)){checked={status:'failed',reason:'duplicate_check_incomplete'};break;}
      tokens.add(next);pageToken=next;
    }
    cache.set(date,checked);return checked;
  }
  for(const [index,event] of events.entries()) {
    const base={index,title:event.title,date:event.date};
    if(signal?.aborted||stopReason){items.push({...base,status:'unattempted',reason:stopReason||'aborted'});continue;}
    let end;
    if(!text(event.title,300,true)||!dateValid(event.date)||!dateValid(end=nextDate(event.date))
      ||event.description!==undefined&&!text(event.description,3000)||event.location!==undefined&&!text(event.location,500)) {
      items.push({...base,status:'failed',reason:'invalid_event'});continue;
    }
    const checked=await duplicateWindow(event.date);
    if(signal?.aborted){items.push({...base,status:'unattempted',reason:'aborted'});continue;}
    if(checked.status!=='ready'){
      if(fatal.has(checked.reason))stopReason=checked.reason;
      items.push({...base,status:checked.status,reason:checked.reason});continue;
    }
    const matches=[...new Map(checked.events.filter(existing=>existing.status!=='cancelled'
      &&normalizedTitle(existing.title)===normalizedTitle(event.title)
      &&existing.start?.date===event.date&&existing.end?.date===end).map(existing=>[existing.eventId,existing])).values()];
    if(matches.length>1){items.push({...base,status:'failed',reason:'ambiguous_existing_events'});continue;}
    if(matches.length===1) {
      const existing=receipt({...matches[0],outcome:'existing'},client.calendarId);
      items.push(existing?{...base,status:'existing',calendarWrite:existing}:{...base,status:'failed',reason:'invalid_response'});continue;
    }
    const identity=createHash('sha256').update(JSON.stringify(['chat-calendar-batch-v1',operationId,event.date,normalizedTitle(event.title)])).digest('hex');
    let result;
    try {result=await client.createChatEvent({title:event.title,...(event.description!==undefined?{description:event.description}:{}),...(event.location!==undefined?{location:event.location}:{}),start:{date:event.date},end:{date:end},operationId:identity,principal,signal});}
    catch {result={status:signal?.aborted?'aborted':'google_unavailable'};}
    const saved=result?.status==='ready'?receipt(result,client.calendarId):null;
    if(!saved){
      const reason=result?.status==='ready'?'invalid_response':result?.status||'google_unavailable';
      if(fatal.has(reason))stopReason=reason;
      items.push({...base,status:'failed',reason});continue;
    }
    const status=saved.outcome==='unchanged'?'existing':'created';
    items.push({...base,status,calendarWrite:saved});
    checked.events.push({eventId:saved.eventId,title:event.title,start:{date:event.date},end:{date:end},url:saved.url,status:'confirmed'});
  }
  const counts={requested:events.length,created:0,existing:0,failed:0,unattempted:0};
  for(const item of items)counts[item.status]++;
  const complete=counts.failed===0&&counts.unattempted===0;
  return {status:complete?'ready':'partial',sources:[],calendarBatchWrite:{complete,counts,items}};
}

// Allowlist only the batch contract, including successful receipts in partial
// outcomes. This projection is also used when native context must be bounded.
export function projectCalendarBatchWrite(value) {
  if(!value||!Array.isArray(value.items)||value.items.length<1||value.items.length>50||typeof value.complete!=='boolean')return null;
  const counts={requested:value.items.length,created:0,existing:0,failed:0,unattempted:0},items=[];
  for(const [index,item] of value.items.entries()) {
    if(item.index!==index||!['created','existing','failed','unattempted'].includes(item.status)||typeof item.title!=='string'||item.title.length>300
      ||typeof item.date!=='string'||item.date.length>10)return null;
    const row={index,title:item.title,date:item.date,status:item.status};
    if(['created','existing'].includes(item.status)) {
      const saved=item.calendarWrite;
      if(!validId(saved?.eventId)||typeof saved.url!=='string'||!/^https:\/\/calendar\.google\.com\/calendar\/event\?eid=[A-Za-z0-9_-]+$/.test(saved.url)
        ||!['created','reconciled','unchanged','existing'].includes(saved.outcome))return null;
      row.calendarWrite={outcome:saved.outcome,eventId:saved.eventId,url:saved.url};
    }
    if(typeof item.reason==='string')row.reason=item.reason.slice(0,100);
    counts[item.status]++;items.push(row);
  }
  if(Object.keys(counts).some(key=>value.counts?.[key]!==counts[key])||value.complete!==(counts.failed===0&&counts.unattempted===0))return null;
  return {complete:value.complete,counts,items};
}
