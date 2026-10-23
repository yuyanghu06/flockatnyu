import {createHash} from 'node:crypto';
import {canonicalJson} from './validation.js';
import {collectCalendarWindow,validCalendarInstant} from '../google/calendar-client.js';
import {uuid,validParticipation,eventWindow} from '../map/events.js';
const instant=value=>validCalendarInstant(value)?new Date(value).toISOString():null;
const normalize=value=>String(value||'').normalize('NFKC').toLowerCase().replace(/\bst\.?\b/g,'street').replace(/\bave\.?\b/g,'avenue').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const eventFields=['id','name','notes','kind','type_id','status','time_kind','starts_at','ends_at','starts_on','ends_on','time_zone','source_id','source_url','source_record_id','url','reported_at'];
const personFields=['person_id','attendance_status','presence_basis','label','starts_at','ends_at','source_id','source_url','reported_at'];
const failureReasons=new Set(['aborted','map_read_failed','building_catalogue_unavailable','missing_calendar_timestamp','invalid_calendar_time','calendar_identity_too_long','calendar_exact_read_failed','calendar_identity_mismatch','member_participation_unverified','participation_time_conflict','map_conflict','map_write_failed']);
const safeReason=error=>failureReasons.has(error?.message)?error.message:'execution_failed';
const pick=(row,keys)=>Object.fromEntries(keys.filter(key=>key in row).map(key=>[key,row[key]]));
const stableId=(sourceId,eventId)=>{const hex=createHash('sha256').update(canonicalJson([sourceId,eventId])).digest('hex');return `${hex.slice(0,8)}-${hex.slice(8,12)}-4${hex.slice(13,16)}-a${hex.slice(17,20)}-${hex.slice(20,32)}`;};
export function matchCalendarBuildings(location,buildings=[]) {
  const haystack=` ${normalize(location)} `,hits=new Set();
  if(!haystack.trim())return {status:'unknown',buildingIds:[]};
  const aliases=new Map();
  for(const row of buildings)for(const label of [row.id,row.name,...(Array.isArray(row.aliases)?row.aliases:[])]) {
    const key=normalize(label);if(key.length<3)continue;
    if(!aliases.has(key))aliases.set(key,new Set());aliases.get(key).add(row.id);
  }
  for(const [alias,ids] of aliases)if(haystack.includes(` ${alias} `)) {
    if(ids.size>1)return {status:'ambiguous',buildingIds:[]};
    hits.add([...ids][0]);
  }
  if(hits.size>1||hits.size&&(/(?:^| )(?:or|either|tbd|maybe|tentative|unknown|to be determined|to be confirmed)(?: |$)/.test(normalize(location))||String(location).includes('?')))return {status:'ambiguous',buildingIds:[]};
  return {status:hits.size?'matched':'unknown',buildingIds:[...hits].sort()};
}
export function calendarMapName(original,old) {
  const title=typeof original?.title==='string'&&original.title.trim()?original.title:typeof old?.name==='string'&&old.name.trim()?old.name:'Calendar event';
  return [...title].slice(0,200).join('');
}
function projectEvent(original,target,old) {
  const cancelled=original.status==='cancelled';
  const report=instant(original.updatedAt)||instant(original.createdAt);
  if(!old&&cancelled)return null;
  if(!report&&!cancelled)throw Error('missing_calendar_timestamp');
  const location=typeof original.location==='string'?original.location:'';
  const notes=[original.description||'',location?`Location: ${location}`:''].filter(Boolean).join('\n\n');
  const event={...(old?pick(old,eventFields):{}),id:old?.id||stableId(target.sourceId,original.eventId),
    name:calendarMapName(original,old),notes:notes.slice(0,4000),kind:target.kind==='member'?(original.memberPlan?.activityKind||old?.kind||'personal_plan'):'scheduled_event',
    type_id:old?.type_id||original.memberPlan?.typeId||'other',status:cancelled?'cancelled':original.status==='tentative'?'tentative':'confirmed',
    starts_at:null,ends_at:null,starts_on:null,ends_on:null,time_zone:original.start?.timeZone||old?.time_zone||'America/New_York',
    source_id:target.sourceId,source_url:original.url,source_record_id:original.eventId,url:original.url,reported_at:report||old.reported_at};
  if(cancelled&&(!original.start||!original.end))return {...old,status:'cancelled',reported_at:report||old.reported_at};
  if(original.start?.date&&original.end?.date){event.time_kind='all_day';event.starts_on=original.start.date;event.ends_on=original.end.date;}
  else {event.time_kind='timed';event.starts_at=instant(original.start?.dateTime);event.ends_at=instant(original.end?.dateTime);}
  if(!eventWindow(event))throw Error('invalid_calendar_time');
  return event;
}
// One run owns API traversal and optimistic projection. It never infers deletion
// from absence and never discards participants to force a Calendar edit through.
export function createCalendarMapSync({targets=[],mapService,loadBuildings,authorizeParticipation,now=()=>new Date()}={}) {
  async function sync({principal,window,signal,onResult,onApiResult}={}) {
    const results=[],unresolved=[];
    const api=async(name,args,work)=>{const result=await work();if(onApiResult)await onApiResult({name,arguments:args,result});return result;};
    const emit=async value=>{results.push(value);if(onResult)await onResult(value);};
    if(!principal?.id||!Array.isArray(principal.allowedSourceIds))return {status:'forbidden',complete:false,results,unresolved};
    if(!validCalendarInstant(window?.timeMin)||!validCalendarInstant(window?.timeMax)||Date.parse(window.timeMax)<=Date.parse(window.timeMin))return {status:'invalid_request',complete:false,results,unresolved};
    let complete=true;
    for(const target of targets) {
      const {client,sourceId}=target,base={calendarId:client?.calendarId,sourceId,kind:target.kind};
      if(signal?.aborted){complete=false;unresolved.push({...base,reason:'aborted'});break;}
      if(!client?.configured||!uuid(sourceId)||!principal.allowedSourceIds.includes(sourceId)||!['club','member'].includes(target.kind)
        ||!(principal.googleAccess===true||principal.calendarAccess===true&&principal.calendarId===client.calendarId||principal.calendarTargets?.some(row=>row.sourceId===sourceId&&row.calendarId===client.calendarId))) {
        complete=false;unresolved.push({...base,reason:'forbidden_source'});continue;
      }
      const calendarPrincipal={...principal,calendarAccess:true,calendarId:client.calendarId};
      try {
        const initial=await api('map.read_events',{sourceId},()=>mapService.read({principal,sourceId,signal}));
        if(initial?.status!=='ok')throw Error('map_read_failed');
        const buildings=loadBuildings?await api('map.read_building_aliases',{},()=>loadBuildings({principal,signal})):initial.buildings;
        if(!Array.isArray(buildings)||buildings.length>100)throw Error('building_catalogue_unavailable');
        const observations=new Map();let windows=0;
        async function collect(timeMin,timeMax,depth=0) {
          if(signal?.aborted||++windows>63){complete=false;return false;}
          const result=await api('calendar.list_window',{calendarId:client.calendarId,timeMin,timeMax},()=>typeof client.listEventsWindow==='function'?client.listEventsWindow({timeMin,timeMax,limit:25,principal:calendarPrincipal,signal}):collectCalendarWindow({client,timeMin,timeMax,limit:25,principal:calendarPrincipal,signal}));
          if(result.status==='partial'&&['context_limit','event_limit','page_limit'].includes(result.coverage?.reason)&&depth<6&&Date.parse(timeMax)-Date.parse(timeMin)>60000) {
            const midpoint=new Date(Math.floor((Date.parse(timeMin)+Date.parse(timeMax))/2)).toISOString();
            const left=await collect(timeMin,midpoint,depth+1),right=await collect(midpoint,timeMax,depth+1);return left&&right;
          }
          if(['ready','partial'].includes(result.status))for(const event of result.events||[])observations.set(event.eventId,event);
          return result.status==='ready'&&result.coverage?.complete!==false;
        }
        if(!await collect(window.timeMin,window.timeMax)){complete=false;unresolved.push({...base,reason:'calendar_window_incomplete'});}
        // Exact checks catch cancellation and moves outside the rolling window;
        // missing provider rows never authorize deleting prior projections.
        for(const old of initial.events||[])if(!observations.has(old.source_record_id)) {
          const oldWindow=eventWindow(old);
          if(old.status==='cancelled'||!oldWindow||oldWindow.end<=Date.parse(window.timeMin)||oldWindow.start>=Date.parse(window.timeMax))continue;
          const check=await api('calendar.read_event',{calendarId:client.calendarId,eventId:old.source_record_id},()=>client.readEvent({eventId:old.source_record_id,principal:calendarPrincipal,signal}));
          if(check.status==='ready')for(const row of check.events||[])observations.set(row.eventId,row);
          else {complete=false;unresolved.push({...base,eventId:old.source_record_id,reason:'calendar_exact_read_failed'});}
        }
        for(const listed of observations.values()) {
          const item={...base,eventId:listed.eventId};
          try {
            if(signal?.aborted)throw Error('aborted');
            if(typeof listed.eventId!=='string'||listed.eventId.length>200)throw Error('calendar_identity_too_long');
            const exact=await api('calendar.read_event',{calendarId:client.calendarId,eventId:listed.eventId},()=>client.readEvent({eventId:listed.eventId,principal:calendarPrincipal,signal}));
            const original=exact.status==='ready'&&exact.events?.find(row=>row.eventId===listed.eventId);
            if(!original)throw Error('calendar_exact_read_failed');
            const canonicalUrl=`https://calendar.google.com/calendar/event?eid=${Buffer.from(`${original.eventId} ${client.calendarId}`).toString('base64url')}`;
            if(original.url!==canonicalUrl)throw Error('calendar_identity_mismatch');
            const snapshot=await api('map.read_events',{sourceId,sourceRecordId:original.eventId},()=>mapService.read({principal,sourceId,sourceRecordId:original.eventId,signal}));
            if(snapshot?.status!=='ok'||snapshot.events.length>1)throw Error('map_read_failed');
            const old=snapshot.events[0],projected=projectEvent(original,target,old);
            if(!projected){await emit({...item,status:'unchanged'});continue;}
            const event=pick(projected,eventFields);
            const previousBuildings=(snapshot.event_buildings||[]).filter(row=>row.event_id===old?.id).map(row=>pick(row,['building_id','location_notes']));
            const location=original.location||'';
            const locationUnchanged=Boolean(old&&(old.notes===location||old.notes?.endsWith(`Location: ${location}`)||!location&&!old.notes?.includes('Location: ')));
            const match=matchCalendarBuildings(location,buildings);
            const relationships=locationUnchanged&&previousBuildings.length?previousBuildings:match.buildingIds.map(building_id=>({building_id,location_notes:location.slice(0,500)}));
            if(match.status==='ambiguous'&&!locationUnchanged){complete=false;unresolved.push({...item,reason:'ambiguous_location',location});}
            else if(match.status==='unknown'&&location&&!relationships.length){complete=false;unresolved.push({...item,reason:'unknown_location',location});}
            const people=(snapshot.event_people||[]).filter(row=>row.event_id===old?.id).map(row=>pick(row,personFields));
            if(target.kind==='member'&&original.status!=='cancelled') {
              const participation=original.memberPlan?.participation;
              if(!participation||typeof authorizeParticipation!=='function'||await authorizeParticipation({principal,participation,event:original,signal})!==true)throw Error('member_participation_unverified');
              const next={person_id:participation.personId,attendance_status:'going',presence_basis:original.memberPlan.activityKind==='presence'?'reported':'planned',label:participation.label||'',starts_at:null,ends_at:null,source_id:participation.sourceId,source_url:participation.sourceUrl,reported_at:participation.reportedAt};
              const index=people.findIndex(row=>row.person_id===next.person_id);
              if(index<0)people.push(next);
              else if(people[index].source_id===next.source_id&&people[index].source_url===next.source_url)people[index]=next;
            }
            if(people.some(row=>!validParticipation({...row,event_id:event.id},event)))throw Error('participation_time_conflict');
            item.mapEventId=event.id;
            const normalizedRows=rows=>rows.map(row=>canonicalJson(row)).sort();
            if(old&&canonicalJson(pick(old,eventFields))===canonicalJson(event)
              &&canonicalJson(normalizedRows(previousBuildings))===canonicalJson(normalizedRows(relationships))
              &&canonicalJson(normalizedRows((snapshot.event_people||[]).map(row=>pick(row,personFields))))===canonicalJson(normalizedRows(people))) {
              await emit({...item,status:'unchanged'});continue;
            }
            if(target.kind==='member'&&original.status!=='cancelled'&&await authorizeParticipation({principal,participation:original.memberPlan.participation,event:original,signal})!==true)throw Error('member_participation_unverified');
            if(signal?.aborted)throw Error('aborted');
            const response=await api('map.upsert_event',{event,buildings:relationships,people,expectedUpdatedAt:old?.updated_at||null},()=>mapService.upsert({principal,event,buildings:relationships,people,expectedUpdatedAt:old?.updated_at||null,signal}));
            if(!['applied','unchanged'].includes(response?.status))throw Error(response?.status==='conflict'?'map_conflict':'map_write_failed');
            await emit({...item,status:response.status,updatedAt:response.updated_at});
          }catch(error){complete=false;const row={...item,status:'deferred',reason:safeReason(error)};unresolved.push(row);await emit(row);}
        }
      }catch(error){complete=false;unresolved.push({...base,reason:safeReason(error)});}
    }
    return {status:complete?'ready':'partial',complete,results,unresolved,observedAt:new Date(now()).toISOString()};
  }
  return Object.freeze({sync});
}
