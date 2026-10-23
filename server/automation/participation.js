import {MAP_EVENT_SCHEMA,EVENT_BUILDINGS_SCHEMA,EVENT_PEOPLE_SCHEMA} from '../map/contracts.js';
import {uuid,timestamp,eventWindow,validEvent,validParticipation,validateSnapshot,buildingId,text} from '../map/events.js';
import {canonicalJson,plainObject} from './validation.js';

const object=(properties,required=[])=>({type:'object',additionalProperties:false,properties,required});
const id={type:'string',minLength:36,maxLength:36};
const endpoint=object({at:{type:'string',minLength:20,maxLength:40},anchor:{type:'string',enum:['event_start','event_end']},
  offsetMinutes:{type:'number',minimum:-525600,maximum:525600},inherit:{type:'boolean'} });
endpoint.description='Exactly one representation: {at: RFC3339 timestamp}, {anchor: event_start or event_end, offsetMinutes: elapsed minutes}, or {inherit:true}. EVERY NEW participant requires BOTH start and end, including explicit {inherit:true} for an inherited boundary. Omission preserves an existing participant override. Explicit inherit stores null. Approximate late arrival needs a supported start endpoint AND qualifying label; a label alone does not set time. Relative anchors require a timed event.';
export const PARTICIPATION_PARAMETERS=object({eventId:id,expectedUpdatedAt:{type:'string',minLength:20,maxLength:40},
  changes:{type:'array',minItems:1,maxItems:20,items:object({personId:id,sourceUrl:{type:'string',minLength:9,maxLength:2048},
    attendanceStatus:{type:'string',enum:['going','tentative','declined']},label:{type:'string',maxLength:400,description:'Preserve meaningful activity and approximate timing wording. A timing label does not set start/end; supply the supported changed endpoint too.'},start:endpoint,end:endpoint},['personId','sourceUrl','attendanceStatus'])}},['eventId','expectedUpdatedAt','changes']);

const keys=schema=>Object.keys(schema.properties);
const eventKeys=[...keys(MAP_EVENT_SCHEMA),'created_at','updated_at'];
const buildingKeys=['event_id',...keys(EVENT_BUILDINGS_SCHEMA.items)];
const personKeys=['event_id',...keys(EVENT_PEOPLE_SCHEMA.items),'created_at','updated_at'];
const pick=(row,fields)=>Object.fromEntries(fields.filter(key=>Object.hasOwn(row,key)).map(key=>[key,row[key]]));
const input=(row,schema)=>Object.fromEntries(keys(schema).filter(key=>row[key]!==undefined&&row[key]!==null).map(key=>[key,row[key]]));
const sorted=(rows,key,fields)=>rows.map(row=>pick(row,fields)).sort((a,b)=>a[key].localeCompare(b[key]));
const invalid=()=>{throw Error('invalid_participation_snapshot');};
const micros=value=>{
  if(timestamp(value)===null)return null;
  const fraction=/\.(\d{1,6})(?:Z|[+-])/.exec(value)?.[1]||'';
  return BigInt(timestamp(value))*1000n+BigInt(fraction.padEnd(6,'0').slice(3));
};

// The privileged snapshot proves completeness only. All outgoing facts come
// from the independently authorized view; raw rows never grant access or leak.
export function completeParticipationSnapshot(raw,authorized,eventId,expectedUpdatedAt) {
  validateSnapshot(raw);
  if(!uuid(eventId)||timestamp(expectedUpdatedAt)===null||!['ok','ready'].includes(authorized?.status)
    ||authorized.partial===true||authorized.possiblyTruncated===true||authorized.sourceStatus==='partial'||authorized.coverage?.complete===false
    ||!Array.isArray(authorized.events)||!Array.isArray(authorized.event_buildings)||!Array.isArray(authorized.event_people))invalid();
  const rawEvents=raw.events.filter(row=>row.id===eventId),events=authorized.events.filter(row=>row.id===eventId);
  if(rawEvents.length!==1||events.length!==1||!validEvent(rawEvents[0])||!validEvent(events[0]))invalid();
  const event=events[0],rawEvent=rawEvents[0];
  if(event.updated_at!==expectedUpdatedAt||rawEvent.updated_at!==expectedUpdatedAt)throw Error('participation_conflict');
  if(canonicalJson(pick(rawEvent,eventKeys))!==canonicalJson(pick(event,eventKeys)))invalid();
  const rawBuildings=raw.event_buildings.filter(row=>row.event_id===eventId),buildings=authorized.event_buildings.filter(row=>row.event_id===eventId);
  const rawPeople=raw.event_people.filter(row=>row.event_id===eventId),people=authorized.event_people.filter(row=>row.event_id===eventId);
  if(rawBuildings.some(row=>!buildingId(row.building_id)||!text(row.location_notes,500)||!raw.buildings.some(b=>b.id===row.building_id))
    ||rawPeople.some(row=>!validParticipation(row,event)||!raw.people.some(p=>p.id===row.person_id&&p.is_trackable===true)
      ||!authorized.people?.some(p=>p.id===row.person_id&&p.is_trackable===true))
    ||canonicalJson(sorted(rawBuildings,'building_id',buildingKeys))!==canonicalJson(sorted(buildings,'building_id',buildingKeys))
    ||canonicalJson(sorted(rawPeople,'person_id',personKeys))!==canonicalJson(sorted(people,'person_id',personKeys)))invalid();
  return {event:input(event,MAP_EVENT_SCHEMA),buildings:buildings.map(row=>input(row,EVENT_BUILDINGS_SCHEMA.items)),
    people:people.map(row=>input(row,EVENT_PEOPLE_SCHEMA.items)),expectedUpdatedAt};
}

function boundary(value,event) {
  if(!plainObject(value))invalid();
  const fields=Object.keys(value).sort().join(',');
  if(fields==='inherit'&&value.inherit===true)return null;
  if(fields==='at'&&timestamp(value.at)!==null)return value.at;
  if(fields!=='anchor,offsetMinutes'||event.time_kind!=='timed'||!['event_start','event_end'].includes(value.anchor)
    ||!Number.isFinite(value.offsetMinutes)||Math.abs(value.offsetMinutes)>525600)invalid();
  const anchor=event[value.anchor==='event_start'?'starts_at':'ends_at'];
  if(timestamp(anchor)===null)invalid();
  if(value.offsetMinutes===0)return anchor;
  // Elapsed arithmetic uses the actual anchor instant, never wall-clock retags.
  const offset=value.offsetMinutes*60000000;
  if(!Number.isSafeInteger(offset))invalid();
  const instant=micros(anchor)+BigInt(offset);
  const millis=instant>=0n?instant/1000n:(instant-999n)/1000n;
  const remainder=instant-millis*1000n,iso=new Date(Number(millis)).toISOString();
  return remainder===0n?iso:iso.replace('Z',`${remainder.toString().padStart(3,'0')}Z`);
}
const business=(row,event)=>{
  const inherited=event.time_kind==='all_day'?eventWindow(event):null;
  if(event.time_kind==='all_day'&&!inherited)invalid();
  const effective=field=>{
    const value=row[field]??(event.time_kind==='timed'?event[field]:null);
    if(value!=null)return micros(value)?.toString();
    return inherited?(BigInt(inherited[field==='starts_at'?'start':'end'])*1000n).toString():null;
  };
  return {attendance_status:row.attendance_status,presence_basis:row.presence_basis,label:row.label,
    starts_at:effective('starts_at'),ends_at:effective('ends_at')};
};
export function mergeParticipationChanges(snapshot,changes,provenance) {
  if(!Array.isArray(changes)||changes.length<1||changes.length>20||new Set(changes.map(row=>row.personId)).size!==changes.length)invalid();
  // Completeness is proved by the independently authorized snapshot, not by
  // source text or labels. Reject the whole proposal before merging any row.
  const missingWindows=[];
  for(const change of changes) {
    if(!uuid(change.personId))invalid();
    if(snapshot.people.some(row=>row.person_id===change.personId))continue;
    const missingFields=['start','end'].filter(field=>!Object.hasOwn(change,field));
    if(missingFields.length)missingWindows.push({personId:change.personId,missingFields});
  }
  if(missingWindows.length)return {status:'invalid_request',reason:'new_participation_window_required',missingWindows};
  const result=structuredClone(snapshot),changed=[];
  for(const change of changes) {
    const source=provenance.get(change.personId),index=result.people.findIndex(row=>row.person_id===change.personId),prior=result.people[index];
    if(!uuid(change.personId)||!source||source.source_url!==change.sourceUrl
      ||!['going','tentative','declined'].includes(change.attendanceStatus)||change.label!==undefined&&!text(change.label,200))invalid();
    const person={...(prior||{person_id:change.personId,presence_basis:'planned',label:''}),attendance_status:change.attendanceStatus};
    if(change.label!==undefined)person.label=change.label;
    for(const [field,patch] of [['starts_at','start'],['ends_at','end']])if(Object.hasOwn(change,patch)) {
      const value=boundary(change[patch],result.event);
      if(value===null)delete person[field];else person[field]=value;
    }
    if(prior&&canonicalJson(business(prior,result.event))===canonicalJson(business(person,result.event)))continue;
    Object.assign(person,source);
    if(!validParticipation({...person,event_id:result.event.id},result.event))invalid();
    if(index<0)result.people.push(person);else result.people[index]=person;
    changed.push(change.personId);
  }
  // A selected task must correspond to an actual changed person. Leave no-op
  // tasks pending rather than minting action proof by rewriting provenance.
  if(changed.length!==changes.length)return {status:'pending',reason:'unchanged_participation'};
  if(result.people.length>500)invalid();
  return {status:'ready',arguments:result,changedPersonIds:changed};
}

export function sameSavedParticipation(actual,expected) {
  if(!actual||!expected)return false;
  return keys(EVENT_PEOPLE_SCHEMA.items).every(key=>['starts_at','ends_at','reported_at'].includes(key)
    ?actual[key]==null&&expected[key]==null||micros(actual[key])!==null&&micros(actual[key])===micros(expected[key])
    :canonicalJson(actual[key]??null)===canonicalJson(expected[key]??null));
}

export function sameSavedParticipationSnapshot(actual,expected) {
  if(!actual||!expected)return false;
  const sameEvent=keys(MAP_EVENT_SCHEMA).every(key=>['starts_at','ends_at','reported_at'].includes(key)
    ?actual.event[key]==null&&expected.event[key]==null||micros(actual.event[key])!==null&&micros(actual.event[key])===micros(expected.event[key])
    :canonicalJson(actual.event[key]??null)===canonicalJson(expected.event[key]??null));
  return sameEvent&&canonicalJson(sorted(actual.buildings,'building_id',keys(EVENT_BUILDINGS_SCHEMA.items)))===canonicalJson(sorted(expected.buildings,'building_id',keys(EVENT_BUILDINGS_SCHEMA.items)))
    &&actual.people.length===expected.people.length&&expected.people.every(person=>sameSavedParticipation(actual.people.find(row=>row.person_id===person.person_id),person));
}
