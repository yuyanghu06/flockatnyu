// Current-chat declarations are a separate provenance kind, never a provider identity.
import {randomUUID} from 'node:crypto';
import {createMapEventStore,createMapEventService,validateSnapshot,eventWindow,validEvent,text,uuid,timestamp,boundedWork} from './events.js';
import {requestsChatAttendance,chatAttendanceDeclarations} from './chat-intent.js';

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
const normalize=value=>value.normalize('NFC').trim().replace(/\s+/gu,' ').toLowerCase();
const escape=value=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const literal=(message,value)=>new RegExp(`(?<![\\p{L}\\p{N}])${escape(value)}(?![\\p{L}\\p{N}])`,'iu').test(message);
const eventTokens=value=>value.normalize('NFKC').toLowerCase().match(/[\p{L}\p{N}]+/gu)||[];
function eventPhraseMatches(candidate,query) {
  const compact=eventTokens(query).join('');
  if(!compact)return false;
  const tokens=eventTokens(candidate);
  // Formatting may split or join words, but a match cannot take part of a
  // candidate token or skip a word: AWS is never PAWS, Hack never Hackathon.
  for(let start=0;start<tokens.length;start++) {
    let joined='';
    for(let end=start;end<tokens.length&&joined.length<compact.length;end++) {
      joined+=tokens[end];
      if(joined===compact)return true;
    }
  }
  return false;
}
const dates=value=>/^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0,10)===value;
const dayAt=(at,zone)=>new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).format(at);
const addDays=(date,days)=>new Date(Date.parse(`${date}T00:00:00Z`)+days*86400000).toISOString().slice(0,10);
const weekdays=['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
function declarationDate(clause,reportedAt) {
  const found=new Set(clause.match(/\b\d{4}-\d{2}-\d{2}\b/gu)||[]),today=dayAt(Date.parse(reportedAt),'America/New_York');
  for(const match of clause.matchAll(/\b(today|tomorrow|(?:next\s+)?(?:sunday|monday|tuesday|wednesday|thursday|friday|saturday))\b/giu)) {
    const token=match[0].toLowerCase();
    if(token==='today'||token==='tomorrow')found.add(addDays(today,token==='today'?0:1));
    else {
      const target=weekdays.indexOf(token.replace(/^next\s+/u,'')),current=new Date(`${today}T00:00:00Z`).getUTCDay();
      let delta=(target-current+7)%7;if(delta===0&&token.startsWith('next '))delta=7;
      found.add(addDays(today,delta));
    }
  }
  return found.size>1 || [...found].some(value=>!dates(value)) ? {invalid:true} : {date:[...found][0]};
}
const eligible=(event,at)=>validEvent(event)&&event.kind==='scheduled_event'&&['confirmed','tentative'].includes(event.status)
  && !eventWindow(event).unknown && eventWindow(event).end>at && timestamp(event.updated_at)!==null;
const eventOnDate=(event,date)=>!date || (event.time_kind==='all_day' ? event.starts_on<=date&&event.ends_on>date
  : dayAt(eventWindow(event).start,event.time_zone)<=date&&dayAt(eventWindow(event).end-1,event.time_zone)>=date);
const strip=(row,relation=false)=>Object.fromEntries(Object.entries(row).filter(([key])=>!['created_at','updated_at',...(relation?['event_id']:[])].includes(key)));
const forbidden=reason=>({status:'forbidden',reason});
const safeEvent=event=>Object.fromEntries(['id','name','starts_at','ends_at','starts_on','ends_on','time_kind','time_zone','updated_at'].map(key=>[key,event[key]]));

export function createChatAttendanceService({env=process.env,store=createMapEventStore({env}),service=createMapEventService({store}),publicOrigin=env.PUBLIC_ORIGIN,now=()=>new Date(),timeoutMs=15000}={}) {
  const origin=chatAttendanceOrigin(publicOrigin),configured=Boolean(origin&&store?.configured===true&&service?.configured===true);
  function createRequest({userMessage='',principal:requestPrincipal,timeContext}={}) {
    // timeContext is supplied by the server request, never by tool arguments.
    const reportedAt=timestamp(timeContext?.now)!==null?timeContext.now:new Date(now()).toISOString();
    const requestId=randomUUID(),selections=new Map(),completed=new Map();
    let boundPrincipal=requestPrincipal?.id;
    const run=async(args,work)=>{
      if(typeof userMessage!=='string'||!requestsChatAttendance(userMessage))return forbidden('attendance_not_declared');
      if(!text(args?.principal?.id,200,1)||!Array.isArray(args.principal.allowedSourceIds))return forbidden('missing_principal');
      if(boundPrincipal&&boundPrincipal!==args.principal.id)return forbidden('request_principal_changed');
      boundPrincipal=args.principal.id;
      if(!configured)return {status:'not_configured'};
      try{return await boundedWork(signal=>work(signal),args.signal,timeoutMs);}catch{return {status:args.signal?.aborted?'aborted':'unavailable'};}
    };
    const readRaw=async signal=>validateSnapshot(await store.read({observedAt:new Date(now()).toISOString(),signal}));
    return Object.freeze({
      async find(args={}) {return run(args,async signal=>{
        if(!text(args.personName,200,1)||!text(args.eventQuery,200,1)||(args.date!==undefined&&!dates(args.date)))return {status:'invalid_request'};
        const personName=normalize(args.personName),query=normalize(args.eventQuery);
        if(!personName||!query||!literal(userMessage,personName)||!eventPhraseMatches(userMessage,query))return forbidden('use_current_declaration');
        const data=await readRaw(signal),roster=data.people.filter(person=>uuid(person.id)&&person.is_trackable===true&&text(person.display_name,200,1));
        let matches=roster.filter(person=>normalize(person.display_name)===personName);
        if(!matches.length&&!/\s/u.test(personName))matches=roster.filter(person=>normalize(person.display_name).split(' ')[0]===personName);
        const declarationClauses=chatAttendanceDeclarations(userMessage).filter(clause=>eventPhraseMatches(clause,query)
          && new RegExp(`^${escape(personName)}\\s+(?:will|is|plans)\\b`,'iu').test(clause));
        if(!declarationClauses.length)return forbidden('person_attendance_not_declared');
        const constraints=declarationClauses.map(clause=>declarationDate(clause,reportedAt));
        if(constraints.some(value=>value.invalid)||new Set(constraints.map(value=>value.date)).size!==1)return {status:'invalid_request',reason:'ambiguous_attendance_date'};
        const date=constraints[0].date;
        if(args.date!==undefined&&args.date!==date)return forbidden('date_not_in_current_declaration');
        const result=await service.read({principal:args.principal,signal});
        if(result.status!=='ok')return result;
        const events=result.events.filter(event=>eligible(event,Date.parse(reportedAt))&&eventOnDate(event,date)&&eventPhraseMatches(event.name,query));
        const unique=matches.length===1&&events.length===1;
        if(unique) {
          const event=events[0],person=matches[0];
          selections.set(`${event.id}/${person.id}`,{updatedAt:event.updated_at,sourceId:event.source_id,sourceUrl:event.source_url,personName,query,date});
        }
        return {status:'ok',attendanceTargets:{people:matches.map(({id,display_name})=>({id,display_name})),events:events.map(safeEvent),complete:true,
          selection:unique?'unique':!matches.length||!events.length?'not_found':'ambiguous'}};
      });},
      async set(args={}) {return run(args,async signal=>{
        if(!uuid(args.eventId)||!uuid(args.personId)||timestamp(args.expectedUpdatedAt)===null)return {status:'invalid_request'};
        const key=`${args.eventId}/${args.personId}`,selection=selections.get(key);
        if(!selection)return forbidden('attendance_targets_not_resolved');
        if(selection.updatedAt!==args.expectedUpdatedAt)return {status:'conflict',reason:'reread_attendance_targets'};
        if(completed.has(key))return completed.get(key);
        const raw=await readRaw(signal),person=raw.people.find(row=>row.id===args.personId&&row.is_trackable===true);
        if(!person||!(normalize(person.display_name)===selection.personName||normalize(person.display_name).split(' ')[0]===selection.personName))return forbidden('roster_changed');
        // First-name uniqueness must remain true after the initial target lookup.
        const exact=raw.people.filter(row=>row.is_trackable===true&&normalize(row.display_name)===selection.personName);
        const currentMatches=exact.length?exact:raw.people.filter(row=>row.is_trackable===true&&normalize(row.display_name).split(' ')[0]===selection.personName);
        if(currentMatches.length!==1||currentMatches[0].id!==person.id)return forbidden('roster_ambiguous');
        const result=await service.read({principal:args.principal,eventId:args.eventId,signal});
        if(result.status!=='ok')return result;
        const event=result.events.find(row=>row.id===args.eventId);
        if(!event||event.source_id!==selection.sourceId||event.source_url!==selection.sourceUrl)return forbidden('event_source_changed');
        if(event.updated_at!==args.expectedUpdatedAt)return {status:'conflict',reason:'reread_attendance_targets'};
        if(!eligible(event,new Date(now()).getTime())||!eventPhraseMatches(event.name,selection.query)||!eventOnDate(event,selection.date))return forbidden('event_no_longer_matches');
        // A filtered read must never turn into an accidental participant removal.
        if(raw.event_people.filter(row=>row.event_id===event.id).length!==result.event_people.length
          ||raw.event_buildings.filter(row=>row.event_id===event.id).length!==result.event_buildings.length)return forbidden('incomplete_event_snapshot');
        const previous=result.event_people.find(row=>row.person_id===person.id);
        const participant={...(previous?strip(previous,true):{person_id:person.id,label:'',starts_at:null,ends_at:null}),
          attendance_status:'going',presence_basis:'planned',source_id:event.source_id,
          source_url:`${origin}/?event=${event.id}#attendance-${person.id}-${requestId}`,reported_at:reportedAt};
        const people=result.event_people.filter(row=>row.person_id!==person.id).map(row=>strip(row,true));people.push(participant);
        const written=await service.upsert({principal:args.principal,event:strip(event),buildings:result.event_buildings.map(row=>strip(row,true)),people,expectedUpdatedAt:args.expectedUpdatedAt,signal});
        if(written.status!=='applied')return written;
        const response={status:'applied',attendanceWrite:{outcome:'applied',eventId:event.id,personId:person.id,updatedAt:written.updated_at}};
        completed.set(key,response);return response;
      });},
    });
  }
  return Object.freeze({configured,createRequest});
}
