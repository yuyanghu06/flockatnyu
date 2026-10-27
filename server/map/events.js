import {SOURCE_TOOL_TIMEOUT_MS} from "../shared/source-timeout.js";
import {mapAvatarProxy} from './avatars.js';
// Trusted normalized-event storage. Browser projections live in presence.js.
import {randomUUID} from 'node:crypto';
import {EVENT_TYPE_CODES} from './contracts.js';
export const EVENT_LIMITS = Object.freeze({buildings:100, people:500, events:2000, event_buildings:20000, event_people:20000,event_types:100});
export const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export const text = (value,max,min=0) => typeof value === 'string' && [...value].length >= min && [...value].length <= max;
export const buildingId = value => text(value,120,1) && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(value);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const snapshotFailures=new Set(['invalid_event_snapshot','invalid_event_types','invalid_event_type_reference','event_snapshot_too_large','duplicate_event_snapshot','invalid_event_building','invalid_event_write_response']);
const localFailures=new Set(['invalid_observation_time','invalid_provider_identity','invalid_provider']);
class MapDiagnosticError extends Error {
  constructor(message,stage,reason,httpStatus) {
    super(message);
    this.diagnostics=Object.freeze({stage,reason,...(Number.isInteger(httpStatus)&&httpStatus>=100&&httpStatus<=599?{httpStatus}:{})});
  }
}
function mapFailureDiagnostics(error,signal) {
  if(signal?.aborted)return {stage:'execution',reason:'aborted'};
  if(error instanceof MapDiagnosticError)return error.diagnostics;
  if(snapshotFailures.has(error?.message))return {stage:'response_parse',reason:'invalid_response'};
  if(localFailures.has(error?.message))return {stage:'local_validation',reason:'invalid_request'};
  if(error?.message==='map_work_cancelled')return {stage:'execution',reason:'timeout'};
  return {stage:'execution',reason:'exception'};
}

export function safeHttps(value) {
  if (!text(value,2048,1) || /[\s\x00-\x1f\x7f]/u.test(value)) return null;
  try { const u=new URL(value); return u.protocol==='https:' && !u.username && !u.password ? u.href : null; } catch { return null; }
}
export function safeAvatar(value,personId) {
  const proxy=mapAvatarProxy(value,personId);if(proxy)return proxy;
  if (!text(value,2048,1) || !/^\/assets\/avatars\/[^/?#\\\s]+\.png$/.test(value)) return null;
  try { const file=decodeURIComponent(value.slice(16)); return file && !/[\/\\\x00-\x1f\x7f]/.test(file) && file!=='..' ? value : null; } catch { return null; }
}
export const safePerson = person => ({id:person.id,display_name:person.display_name,avatar_url:safeAvatar(person.avatar_url,person.id),is_trackable:true});
export function timestamp(value) {
  if (typeof value!=='string' || !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,6})?(?:Z|[+-](?:0\d|1[0-5]):[0-5]\d)$/.test(value) || !calendarDate(value.slice(0,10))) return null;
  const at=Date.parse(value); return Number.isFinite(at) ? at : null;
}
function calendarDate(value) {
  return typeof value==='string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0,10)===value;
}
function formatter(zone) { return new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}); }
// Solve local midnight using the zone's actual offset on that date, including DST.
function midnight(value, zone) {
  const target=Date.parse(`${value}T00:00:00Z`), fmt=formatter(zone);
  let instant=target;
  for(let i=0;i<6;i++) {
    const p=Object.fromEntries(fmt.formatToParts(instant).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
    const local=Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute,+p.second);
    const difference=target-local;
    if(difference===0)return instant;
    instant+=difference;
  }
  return null;
}
export function eventWindow(event) {
  try {
    if (!text(event.time_zone,100,1)) return null;
    formatter(event.time_zone);
    if(event.time_kind==='unknown') return event.starts_at==null && event.ends_at==null && event.starts_on==null && event.ends_on==null ? {unknown:true} : null;
    if(event.time_kind==='timed') {
      const start=timestamp(event.starts_at), end=timestamp(event.ends_at);
      return start!==null && end!==null && end>start && event.starts_on==null && event.ends_on==null ? {start,end,allDay:false} : null;
    }
    if(event.time_kind==='all_day' && event.starts_at==null && event.ends_at==null && calendarDate(event.starts_on) && calendarDate(event.ends_on) && event.ends_on>event.starts_on) {
      const start=midnight(event.starts_on,event.time_zone),end=midnight(event.ends_on,event.time_zone);
      return start!==null && end!==null && end>start ? {start,end,allDay:true} : null;
    }
  } catch {}
  return null;
}
export function validEvent(event) {
  return object(event) && uuid(event.id) && text(event.name,200,1) && event.name.trim().length>0 && text(event.notes,4000) &&
    ['presence','personal_plan','scheduled_event'].includes(event.kind) && EVENT_TYPE_CODES.includes(event.type_id) && ['confirmed','tentative','cancelled','superseded'].includes(event.status) &&
    uuid(event.source_id) && safeHttps(event.source_url) && text(event.source_record_id,200,1) &&
    (event.url==null || event.url==='' || safeHttps(event.url)) && timestamp(event.reported_at)!==null && Boolean(eventWindow(event));
}
export function validParticipation(participant, event) {
  if(!object(participant) || participant.event_id!==event.id || !uuid(participant.person_id) ||
    !['going','tentative','declined'].includes(participant.attendance_status) || !['planned','reported'].includes(participant.presence_basis) ||
    !text(participant.label,200) || !uuid(participant.source_id) || !safeHttps(participant.source_url) || timestamp(participant.reported_at)===null) return null;
  return participationWindow(participant,eventWindow(event));
}
function participationWindow(participant,w) {
  if(!w)return null;
  if(w.unknown)return participant.starts_at==null && participant.ends_at==null ? w : null;
  const start=participant.starts_at==null ? w.start : timestamp(participant.starts_at), end=participant.ends_at==null ? w.end : timestamp(participant.ends_at);
  return start!==null && end!==null && end>start && start>=w.start && end<=w.end ? {start,end,allDay:w.allDay} : null;
}
export const MAP_WRITE_VALIDATION_FIELDS=Object.freeze({duplicate_participant_ids:'people',duplicate_building_ids:'buildings',invalid_event_window:'event',invalid_participant_window:'people'});
const invalidWrite=(reason,indices)=>({status:'invalid',reason,field:MAP_WRITE_VALIDATION_FIELDS[reason],...(indices?{indices}:{}),diagnostics:{stage:'local_validation',reason}});
function duplicateIndices(rows,key,valid){
  const seen=new Map();
  for(const [index,row]of rows.entries()){
    const value=row[key];if(!valid(value))continue;
    if(seen.has(value))return [seen.get(value),index];
    seen.set(value,index);
  }
  return null;
}
export function validateSnapshot(data) {
  if(!object(data))throw Error('invalid_event_snapshot');
  for(const [key,max] of Object.entries(EVENT_LIMITS))if(!Array.isArray(data[key]) || data[key].length>max)throw Error('invalid_event_snapshot');
  const types=new Set(),icons=new Set();
  for(const type of data.event_types) {
    if(!object(type)||!EVENT_TYPE_CODES.includes(type.code)||!EVENT_TYPE_CODES.includes(type.icon_key)||!text(type.name,100,1)||type.name.trim()!==type.name||!text(type.description,500)||!Number.isInteger(type.sort_order)||type.sort_order<0||type.sort_order>1000||types.has(type.code)||icons.has(type.icon_key))throw Error('invalid_event_types');
    types.add(type.code);icons.add(type.icon_key);
  }
  if(!types.has('other')||data.events.some(event=>!types.has(event?.type_id)))throw Error('invalid_event_type_reference');
  if(Buffer.byteLength(JSON.stringify(data),'utf8')>16777216)throw Error('event_snapshot_too_large');
  for(const [key,id] of [['buildings',x=>x.id],['people',x=>x.id?.toLowerCase()],['events',x=>x.id?.toLowerCase()],['event_buildings',x=>`${x.event_id}/${x.building_id}`],['event_people',x=>`${x.event_id}/${x.person_id?.toLowerCase()}`]]) {
    const seen=new Set();for(const row of data[key]) { if(!object(row))throw Error('invalid_event_snapshot'); const value=id(row);if(!value || seen.has(value))throw Error('duplicate_event_snapshot');seen.add(value); }
  }
  if(data.buildings.some(x=>!buildingId(x.id)||!text(x.name,200,1)))throw Error('invalid_event_building');
  return data;
}
export async function boundedWork(work, signal, timeoutMs=SOURCE_TOOL_TIMEOUT_MS) {
  if(signal?.aborted)throw new MapDiagnosticError('map_work_cancelled','execution','aborted');
  const controller=new AbortController(),abort=()=>controller.abort();
  let listener;
  const cancelled=new Promise((_,reject)=>{listener=()=>reject(new MapDiagnosticError('map_work_cancelled','execution',signal?.aborted?'aborted':'timeout'));controller.signal.addEventListener('abort',listener,{once:true});});
  signal?.addEventListener('abort',abort,{once:true});
  const timer=setTimeout(abort,Number.isFinite(timeoutMs)?Math.min(SOURCE_TOOL_TIMEOUT_MS,Math.max(50,timeoutMs)):SOURCE_TOOL_TIMEOUT_MS);
  try { if(signal?.aborted)abort();return await Promise.race([Promise.resolve().then(()=>{if(controller.signal.aborted)throw new MapDiagnosticError('map_work_cancelled','execution',signal?.aborted?'aborted':'timeout');return work(controller.signal);}),cancelled]); }
  finally {clearTimeout(timer);signal?.removeEventListener('abort',abort);controller.signal.removeEventListener('abort',listener);controller.abort();}
}
async function boundedJson(response, signal) {
  const max=16777216;
  if(!response.body || Number(response.headers.get('content-length'))>max) {
    await response.body?.cancel().catch(()=>{});
    throw new MapDiagnosticError('event_request_failed','response_parse','invalid_response',response.status);
  }
  const reader=response.body.getReader(),chunks=[];let size=0;
  const cancel=()=>{void reader.cancel().catch(()=>{});};signal.addEventListener('abort',cancel,{once:true});
  try {
    while(true) {
      if(signal.aborted)throw Error('map_work_cancelled');
      const {value,done}=await reader.read();
      if(signal.aborted)throw Error('map_work_cancelled');
      if(done)break;size+=value.byteLength;
      if(size>max)throw new MapDiagnosticError('event_response_too_large','response_parse','invalid_response',response.status);
      chunks.push(value);
    }
    let parsed;
    try {parsed=JSON.parse(Buffer.concat(chunks).toString('utf8'));}
    catch {throw new MapDiagnosticError('event_request_failed','response_parse','invalid_response',response.status);}
    if(!response.ok) {
      const error=new MapDiagnosticError('event_request_failed','provider_request','http_error',response.status);
      if(['40001','23514','23503','23505','22023'].includes(parsed?.code))error.code=parsed.code;
      throw error;
    }
    return parsed;
  } finally {signal.removeEventListener('abort',cancel);await reader.cancel().catch(()=>{});reader.releaseLock();}
}

export function createMapEventStore({env=process.env,fetchImpl=globalThis.fetch,timeoutMs=SOURCE_TOOL_TIMEOUT_MS,getLeaseToken}={}) {
  let origin=null;try{const u=new URL(env.SUPABASE_URL);if(u.protocol==='https:'&&!u.username&&!u.password&&!u.search&&!u.hash&&['','/'].includes(u.pathname))origin=u.origin;}catch{}
  const key=env.SUPABASE_SERVICE_ROLE_KEY?.trim(),configured=Boolean(origin&&key);
  const request=(path,body,signal)=>boundedWork(async requestSignal=>{
    if(!configured)throw Error('events_not_configured');
    let response;
    try {response=await fetchImpl(`${origin}/rest/v1/${path}`,{method:body===undefined?'GET':'POST',headers:{apikey:key,Authorization:`Bearer ${key}`,'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)}),redirect:'error',signal:requestSignal});}
    catch {throw new MapDiagnosticError('event_request_failed','provider_request',requestSignal.aborted?'aborted':'exception');}
    return boundedJson(response,requestSignal);
  },signal,timeoutMs);
  return Object.freeze({configured,
    async read({observedAt,signal}={}) {if(timestamp(observedAt)===null)throw Error('invalid_observation_time');return validateSnapshot(await request('rpc/map_read_events',{p_at:observedAt},signal));},
    async lookup({provider,providerUserId,signal}={}) {
      if(provider==='discord' && (!/^[1-9][0-9]{0,19}$/.test(providerUserId)||BigInt(providerUserId)>18446744073709551615n))throw Error('invalid_provider_identity');
      if(provider==='email' && (!text(providerUserId,320,3)||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(providerUserId)))throw Error('invalid_provider_identity');
      if(!['discord','email'].includes(provider))throw Error('invalid_provider');
      const identity=provider==='email'?providerUserId.replace(/[\\%_]/g,'\\$&'):providerUserId;
      // Email is inspected only inside this adapter to verify an exact match:
      // PostgREST treats '*' as an ilike wildcard even in an otherwise valid email.
      const params=new URLSearchParams({select:`id,display_name,avatar_url,is_trackable${provider==='email'?',email':''}`,is_trackable:'eq.true',limit:'2',[provider==='discord'?'discord_user_id':'email']:`${provider==='email'?'ilike':'eq'}.${identity}`});
      const rows=await request(`map_people?${params}`,undefined,signal);if(!Array.isArray(rows)||rows.length!==1||!uuid(rows[0].id)||rows[0].is_trackable!==true||!text(rows[0].display_name,200,1))return null;
      if(provider==='email'&&(typeof rows[0].email!=='string'||rows[0].email.toLowerCase()!==providerUserId.toLowerCase()))return null;
      return safePerson(rows[0]);
    },
    async upsert({event,buildings,people,expectedUpdatedAt=null,signal}={}) {
      try {
        const leaseToken=typeof getLeaseToken==='function'?getLeaseToken():undefined;
        if(getLeaseToken&&!uuid(leaseToken))return {status:'conflict'};
        const result=await request(getLeaseToken?'rpc/map_automation_upsert_event':'rpc/map_upsert_event',{
          ...(getLeaseToken?{p_token:leaseToken}:{}),p_event:event,p_buildings:buildings,p_people:people,p_expected_updated_at:expectedUpdatedAt},signal);
        if(!object(result)||!['applied','conflict'].includes(result.status)||(result.status==='applied'&&(!uuid(result.event_id)||timestamp(result.updated_at)===null)))throw Error('invalid_event_write_response');return result;
      }catch(error){if(error.code==='40001')return {status:'conflict'};if(['23514','23503','23505','22023'].includes(error.code))return {status:'invalid'};throw error;}
    },
  });
}
// Optional custom source policy must explicitly be a synchronous local checker.
// Never dispatch a legacy provider authorizer from a database map operation.
export function authorizeProvenance({principal,sourceId,sourceUrl,authorizeSource,signal,buildingId:location,eventId,personId}) {
  if(signal?.aborted||!uuid(sourceId)||!safeHttps(sourceUrl)||!Array.isArray(principal?.allowedSourceIds)
    ||!principal.allowedSourceIds.some(id=>typeof id==='string'&&id.toLowerCase()===sourceId.toLowerCase()))return false;
  return authorizeSource?.localOnly===true
    ?authorizeSource({principal,sourceId,sourceUrl,buildingId:location,eventId,personId,signal})===true:true;
}
// The receipt is server-only: JSON/model outputs never contain the raw snapshot.
const readContextKey=Symbol('mapReadContext');
export const mapReadContext=result=>result?.[readContextKey];
function attachReadContext(result,context) {
  Object.defineProperty(result,readContextKey,{value:context,enumerable:true});return result;
}
const principalValid=principal=>text(principal?.id,200,1)&&Array.isArray(principal.allowedSourceIds)&&principal.allowedSourceIds.every(uuid);
const eventKeys=new Set(['id','name','notes','kind','type_id','status','time_kind','starts_at','ends_at','starts_on','ends_on','time_zone','source_id','source_url','source_record_id','url','reported_at']);
const safeEventType=({code,name,description,icon_key,sort_order})=>({code,name,description,icon_key,sort_order});
const personKeys=new Set(['event_id','person_id','attendance_status','presence_basis','label','starts_at','ends_at','source_id','source_url','reported_at']);
const buildingKeys=new Set(['event_id','building_id','location_notes']);
const onlyKeys=(row,keys)=>object(row)&&Object.keys(row).every(key=>keys.has(key));
// Local policy evaluation does not require provider concurrency or API calls.
const readChecks=async(rows,check,signal)=>{
  if(signal.aborted)throw Error('map_work_cancelled');
  return rows.map(row=>check(row));
};
// Private carry-forward comparisons use business facts, not relationship
// creation/update stamps regenerated by the existing replacement RPC.
const selected=(row,keys)=>Object.fromEntries([...keys].map(key=>[key,row[key]??null]));
const businessFacts=(row,keys)=>JSON.stringify(Object.fromEntries([...keys].map(key=>{
  const value=row[key]??null;
  if(value!==null&&['starts_at','ends_at','reported_at'].includes(key)&&timestamp(value)!==null) {
    const fraction=/\.(\d{1,6})(?:Z|[+-])/.exec(value)?.[1]||'';
    return [key,(BigInt(timestamp(value))*1000n+BigInt(fraction.padEnd(6,'0').slice(3))).toString()];
  }
  return [key,value];
})));
const sortedFacts=(rows,keys)=>rows.map(row=>businessFacts(row,keys)).sort();
const targetFacts=(data,eventId)=>JSON.stringify({
  event:data.events.filter(row=>row.id===eventId).map(row=>businessFacts(row,eventKeys)),
  buildings:sortedFacts(data.event_buildings.filter(row=>row.event_id===eventId),buildingKeys),
  people:sortedFacts(data.event_people.filter(row=>row.event_id===eventId),personKeys),
});
const targetVersion=(data,eventId)=>JSON.stringify([targetFacts(data,eventId),data.events.find(row=>row.id===eventId)?.updated_at,
  data.event_people.filter(row=>row.event_id===eventId).map(row=>{
    const person=data.people.find(person=>person.id===row.person_id);
    return JSON.stringify(selected(person||{},['id','display_name','is_trackable']));
  }).sort()]);
export function createMapEventService({store=createMapEventStore(),authorizeSource=null,now=()=>new Date(),timeoutMs=SOURCE_TOOL_TIMEOUT_MS}={}) {
  const allowed=(principal,row,signal)=>authorizeProvenance({principal,sourceId:row.source_id,sourceUrl:row.source_url,eventId:row.event_id||row.id,personId:row.person_id,authorizeSource,signal});
  const run=async(args,work)=>{
    if(!principalValid(args?.principal))return {status:'forbidden'};
    if(store?.configured!==true)return {status:'not_configured'};
    try{return await boundedWork(signal=>work(signal),args.signal,timeoutMs);}catch(error){return {status:'unavailable',diagnostics:mapFailureDiagnostics(error,args.signal)};}
  };
  const snapshot=async signal=>validateSnapshot(await store.read({observedAt:new Date(now()).toISOString(),signal}));
  const contexts=new WeakMap();
  const principalScope=principal=>JSON.stringify({id:principal.id,sources:[...principal.allowedSourceIds].map(id=>id.toLowerCase()).sort(),
    google:principal.googleAccess===true,calendar:principal.calendarAccess===true,calendarId:principal.calendarId??null,
    targets:principal.calendarTargets??null,guild:principal.liveDiscord?.guildId??null,
    bindings:Array.isArray(principal.mapSourceBindings)?principal.mapSourceBindings.map(row=>Object.fromEntries(Object.keys(row).sort().map(key=>[key,row[key]]))).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))):null});
  const contextData=args=>{
    const context=typeof args.readContext==='function'?contexts.get(args.readContext):null;
    return context&&context.scope===principalScope(args.principal)?context:null;
  };
  const write=async(args,signal,preservation=null,mode=null)=>{
      const {expectedUpdatedAt=null,principal}=args;
      if(!onlyKeys(args.event,eventKeys)||!Array.isArray(args.buildings)||!Array.isArray(args.people))return {status:'invalid'};
      const event={notes:'',type_id:'other',status:'confirmed',time_zone:'America/New_York',starts_at:null,ends_at:null,starts_on:null,ends_on:null,url:null,...args.event,id:args.event.id??randomUUID()};
      for(const key of ['id','source_id'])if(uuid(event[key]))event[key]=event[key].toLowerCase();
      if(expectedUpdatedAt===null&&event.time_kind==='timed'&&event.ends_at==null) {
        const start=timestamp(event.starts_at),report=timestamp(event.reported_at);
        if(start!==null&&(event.kind==='scheduled_event'||(event.kind==='presence'&&start===report&&report<=new Date(now()).getTime())))event.ends_at=new Date(start+7200000).toISOString();
      }
      const buildings=args.buildings.map(b=>({location_notes:'',...b,event_id:event.id}));
      const people=args.people.map(p=>({attendance_status:'going',label:'',starts_at:null,ends_at:null,...p,event_id:event.id}));
      if(preservation) {
        if(people.some(person=>preservation.people.some(old=>old.person_id===person.person_id)))return {status:'forbidden'};
        people.push(...preservation.people.map(person=>({...person})));
      }
      for(const p of people)for(const key of ['person_id','source_id'])if(uuid(p[key]))p[key]=p[key].toLowerCase();
      const duplicatePeople=duplicateIndices(people,'person_id',uuid),duplicateBuildings=duplicateIndices(buildings,'building_id',buildingId);
      if(duplicatePeople)return invalidWrite('duplicate_participant_ids',duplicatePeople.every(index=>index<args.people.length)?duplicatePeople:undefined);
      if(duplicateBuildings)return invalidWrite('duplicate_building_ids',duplicateBuildings);
      const window=eventWindow(event);if(!window)return invalidWrite('invalid_event_window');
      const invalidPersonWindow=people.findIndex(person=>!participationWindow(person,window));
      if(invalidPersonWindow!==-1)return invalidWrite('invalid_participant_window',invalidPersonWindow<args.people.length?[invalidPersonWindow]:undefined);
      if(!validEvent(event)||!text(event.source_record_id,200,1)||buildings.length>100||people.length>500||
        args.buildings.some(b=>!onlyKeys(b,new Set(['building_id','location_notes'])))||args.people.some(p=>!onlyKeys(p,new Set([...personKeys].filter(x=>x!=='event_id'))))||
        (expectedUpdatedAt!==null&&timestamp(expectedUpdatedAt)===null)||
        buildings.some(b=>!onlyKeys(b,buildingKeys)||b.event_id!==event.id||!buildingId(b.building_id)||!text(b.location_notes,500))||
        people.some(p=>!onlyKeys(p,personKeys)||!validParticipation(p,event)))return {status:'invalid'};
      const context=contextData(args),data=context?.raw??null,old=data?.events.find(x=>x.id===event.id);
      if(expectedUpdatedAt!==null&&!data)return {status:'read_required'};
      const knownBuildings=data&&new Set(data.buildings.map(x=>x.id)),knownPeople=data&&new Set(data.people.filter(p=>p.is_trackable===true).map(p=>p.id));
      if(!Object.hasOwn(args.event,'type_id'))event.type_id=old?.type_id??'other';
      if(data&&!data.event_types.some(type=>type.code===event.type_id))return {status:'invalid'};
      if(data&&(buildings.some(b=>!knownBuildings.has(b.building_id))||people.some(p=>!knownPeople.has(p.person_id))))return {status:'invalid'};
      if(data&&(old ? expectedUpdatedAt===null || timestamp(old.updated_at)!==timestamp(expectedUpdatedAt) : expectedUpdatedAt!==null))return {status:'conflict'};
      if(old&&(old.source_id!==event.source_id||old.source_record_id!==event.source_record_id))return {status:'invalid'};
      if(preservation) {
        if(!old||old.updated_at!==expectedUpdatedAt||targetVersion(data,event.id)!==preservation.version
          ||!preservation.people.every(person=>authorizeSource.canPreserveChatParticipation?.({event:old,person})===true))return {status:'conflict'};
        if(mode==='participation'&&(businessFacts(event,eventKeys)!==businessFacts(old,eventKeys)
          ||JSON.stringify(sortedFacts(buildings,buildingKeys))!==JSON.stringify(sortedFacts(data.event_buildings.filter(row=>row.event_id===event.id),buildingKeys))))return {status:'forbidden'};
        if(mode==='calendar'&&(event.kind!==old.kind||event.source_url!==old.source_url))return {status:'forbidden'};
      }
      const protectedIds=new Set(preservation?.people.map(person=>person.person_id)||[]);
      const provenance=[event,...people.filter(person=>!protectedIds.has(person.person_id)),...(old?[old,...data.event_people.filter(p=>p.event_id===event.id&&!protectedIds.has(p.person_id))]:[])];
      const writeAuthorizer=context?.readAuthorizer?.forContext?.({principal,signal})??context?.readAuthorizer??authorizeSource;
      for(const row of provenance)if(!authorizeProvenance({principal,sourceId:row.source_id,sourceUrl:row.source_url,eventId:row.event_id||row.id,personId:row.person_id,authorizeSource:writeAuthorizer,signal}))return {status:'forbidden'};
      // The existing database transaction validates the current revision and
      // fixed catalogues atomically. Readback is a separate explicit map read.
      return store.upsert({event,buildings:buildings.map(({event_id,...b})=>b),people:people.map(({event_id,...p})=>p),expectedUpdatedAt,signal});
  };
  const capabilities=new WeakMap();
  const service={configured:store?.configured===true,
    // Service-only preparation. Protected relation facts never leave this
    // closure; even the returned raw completeness evidence is filtered.
    async preparePreservedEvent(args={}) {return run(args,async signal=>{
      const {eventId,expectedUpdatedAt,principal,mode='participation'}=args;
      if(!['participation','calendar'].includes(mode)||!uuid(eventId)||timestamp(expectedUpdatedAt)===null)return {status:'invalid'};
      const context=contextData(args);
      if(!context)return {status:'read_required'};
      const raw=context.raw,old=raw.events.find(row=>row.id===eventId),authorized=context.authorized;
      if(!old||old.updated_at!==expectedUpdatedAt||!authorized.events.some(row=>row.id===eventId&&row.updated_at===expectedUpdatedAt))return {status:'conflict'};
      const rows=raw.event_people.filter(row=>row.event_id===eventId),visibleIds=new Set(authorized.event_people.filter(row=>row.event_id===eventId).map(row=>row.person_id));
      if(rows.some(row=>!validParticipation(row,old)||!raw.people.some(person=>person.id===row.person_id&&person.is_trackable===true&&text(person.display_name,200,1))))return {status:'forbidden'};
      const protectedRows=rows.filter(row=>!visibleIds.has(row.person_id));
      if(protectedRows.some(person=>authorizeSource?.canPreserveChatParticipation?.({event:old,person})!==true))return {status:'forbidden'};
      const safeRaw={events:raw.events.filter(row=>row.id===eventId),event_buildings:raw.event_buildings.filter(row=>row.event_id===eventId),
        event_people:rows.filter(row=>visibleIds.has(row.person_id)),people:authorized.people,buildings:raw.buildings,event_types:raw.event_types};
      const selectedAuthorized={...authorized,events:authorized.events.filter(row=>row.id===eventId),event_buildings:authorized.event_buildings.filter(row=>row.event_id===eventId),event_people:authorized.event_people.filter(row=>row.event_id===eventId)};
      if(targetFacts(safeRaw,eventId)!==targetFacts(selectedAuthorized,eventId))return {status:'forbidden'};
      let capability=null;
      if(protectedRows.length) {
        capability=Object.freeze(()=>{});
        capabilities.set(capability,{principalScope:principalScope(principal),eventId,expectedUpdatedAt,mode,version:targetVersion(raw,eventId),
          readContext:args.readContext,people:protectedRows.map(row=>selected(row,personKeys))});
      }
      return {status:'ok',raw:structuredClone(safeRaw),authorized:structuredClone(selectedAuthorized),capability};
    });},
    async upsertPreservedEvent(args={}) {return run(args,async signal=>{
      const capability=args.capability,preservation=typeof capability==='function'?capabilities.get(capability):null;
      if(!preservation)return {status:'forbidden'};
      capabilities.delete(capability);
      if(preservation.principalScope!==principalScope(args.principal)||preservation.eventId!==args.event?.id
        ||preservation.expectedUpdatedAt!==args.expectedUpdatedAt||preservation.mode!==args.mode)return {status:'forbidden'};
      return write({...args,readContext:preservation.readContext},signal,preservation,args.mode);
    });},
    async lookup(args={}) {return run(args,async signal=>{
      if(!['discord','email'].includes(args.provider)||!text(args.providerUserId,320,1))return {status:'invalid'};
      if(args.provider==='discord'&&(!/^[1-9][0-9]{0,19}$/.test(args.providerUserId)||BigInt(args.providerUserId)>18446744073709551615n))return {status:'invalid'};
      if(args.provider==='email'&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(args.providerUserId))return {status:'invalid'};
      if(!await allowed(args.principal,{source_id:args.sourceId,source_url:args.sourceUrl},signal))return {status:'forbidden'};
      const person=await store.lookup({provider:args.provider,providerUserId:args.providerUserId,signal});return {status:'ok',person:person&&uuid(person.id)&&person.is_trackable===true&&text(person.display_name,200,1)?safePerson(person):null};
    });},
    async read(args={}) {return run(args,async signal=>{
      if((args.eventId!==undefined&&!uuid(args.eventId))||(args.sourceId!==undefined&&!uuid(args.sourceId))||(args.sourceRecordId!==undefined&&!text(args.sourceRecordId,200,1)))return {status:'invalid'};
      const data=structuredClone(await snapshot(signal)),events=[],event_people=[],event_buildings=[];
      const readAuthorizer=typeof authorizeSource?.createReadScope==='function'?await authorizeSource.createReadScope({principal:args.principal,snapshot:data,signal}):authorizeSource;
      const readAllowed=row=>authorizeProvenance({principal:args.principal,sourceId:row.source_id,sourceUrl:row.source_url,eventId:row.event_id||row.id,personId:row.person_id,authorizeSource:readAuthorizer,signal});
      const buildingsByEvent=new Map(),peopleByEvent=new Map();
      for(const row of data.event_buildings) {
        if(!buildingsByEvent.has(row.event_id))buildingsByEvent.set(row.event_id,[]);
        buildingsByEvent.get(row.event_id).push(row);
      }
      for(const row of data.event_people) {
        if(!peopleByEvent.has(row.event_id))peopleByEvent.set(row.event_id,[]);
        peopleByEvent.get(row.event_id).push(row);
      }
      const candidates=data.events.filter(event=>validEvent(event)&&(!args.eventId||event.id===args.eventId)&&(!args.sourceId||event.source_id===args.sourceId)&&(!args.sourceRecordId||event.source_record_id===args.sourceRecordId));
      const eventPermissions=await readChecks(candidates,readAllowed,signal),participants=[];
      for(let index=0;index<candidates.length;index++) {
        if(!eventPermissions[index])continue;
        const event=candidates[index];
        events.push(Object.fromEntries([...eventKeys,'created_at','updated_at'].filter(k=>k in event).map(k=>[k,event[k]])));
        event_buildings.push(...(buildingsByEvent.get(event.id)??[]).filter(x=>buildingId(x.building_id)&&text(x.location_notes,500)).map(({event_id,building_id,location_notes})=>({event_id,building_id,location_notes})));
        participants.push(...(peopleByEvent.get(event.id)??[]).filter(p=>validParticipation(p,event)));
      }
      const participantPermissions=await readChecks(participants,readAllowed,signal);
      for(let index=0;index<participants.length;index++)if(participantPermissions[index])event_people.push(Object.fromEntries([...personKeys,'created_at','updated_at'].filter(k=>k in participants[index]).map(k=>[k,participants[index][k]])));
      const personIds=new Set(event_people.map(x=>x.person_id));
      const result={status:'ok',events,event_buildings,event_people,event_types:data.event_types.map(safeEventType),buildings:data.buildings.map(({id,name})=>({id,name})),people:data.people.filter(p=>personIds.has(p.id)&&uuid(p.id)&&p.is_trackable===true&&text(p.display_name,200,1)).map(safePerson)};
      const receipt=Object.freeze(()=>{});
      contexts.set(receipt,{scope:principalScope(args.principal),raw:data,authorized:structuredClone(result),readAuthorizer});
      return attachReadContext(result,receipt);
    });},
    async upsert(args={}) {return run(args,signal=>write(args,signal));},
  };
  return Object.freeze(service);
}
