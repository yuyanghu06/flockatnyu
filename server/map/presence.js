import {SOURCE_TOOL_TIMEOUT_MS} from '../source-timeout.js';
// Service-only projections from normalized events; no legacy JSON fallback.
import {createMapEventStore, validateSnapshot, validEvent, validParticipation, eventWindow, authorizeProvenance, boundedWork, text, uuid, safeAvatar} from './events.js';
export const MAP_DEBUG_SOURCE_ID = 'a7969a7a-53cc-4c75-9736-95dd386f1c5e';
export const MAP_DEBUG_SOURCE_URL = 'https://example.invalid/tech-nyu/map-debug/bobst-fixture-v1';
export const MAP_DEBUG_EVENTS_SOURCE_ID = '742d78b8-6d13-4f4a-a692-342617080bae';
export const MAP_DEBUG_EVENTS_SOURCE_URL = 'https://example.invalid/tech-nyu/map-debug/bobst-events-v1';
// Explicitly user-requested local map plans; not a general source-policy bypass.
export const MAP_LOCAL_PLAN_SOURCE_ID = '34ee17b6-8e0a-48c7-9ad9-c1d9b3f26ca5';
export const MAP_LOCAL_PLAN_SOURCE_URL = 'https://example.invalid/tech-nyu/map-local-plans/yuyang-v1';
export const MAP_LOCAL_PLAN_PERSON_ID = '135da55d-f0e8-5fec-50e9-c860f26e6782';

const localPlanBuildings = new Set(['stern-school-of-business','courant-institute','nyu-john-a-paulson-center']);
export const createMapPresenceStore = createMapEventStore;
const unavailable=()=>({status:'unavailable',buildings:[]});
// Fixed worker count bounds external checks without queueing one promise per row.
async function concurrentChecks(items,check,signal) {
  const results=new Array(items.length);let next=0;
  await Promise.all(Array.from({length:Math.min(4,items.length)},async()=>{
    while(next<items.length) {
      if(signal.aborted)throw Error('map_work_cancelled');
      const index=next++;results[index]=await check(items[index]);
      if(signal.aborted)throw Error('map_work_cancelled');
    }
  }));
  return results;
}
const personView=person=>({id:person.id,displayName:person.display_name,avatarUrl:safeAvatar(person.avatar_url,person.id)});

/** Source UUID allowlisting and positive current policy are independently required. */
export function createMapPresenceService({store=createMapPresenceStore(),production=process.env.NODE_ENV==='production',authorizeSource=null,now=()=>new Date(),timeoutMs=SOURCE_TOOL_TIMEOUT_MS}={}) {
  return Object.freeze({configured:store?.configured===true,
    async read({principal,signal}={}) {
      if(!text(principal?.id,200,1)||!Array.isArray(principal.allowedSourceIds))return {status:'forbidden',buildings:[]};
      if(store?.configured!==true)return {status:'not_configured',buildings:[]};
      try {return await boundedWork(async readSignal=>{
        const date=new Date(now()),at=date.getTime();if(!Number.isFinite(at))throw Error('invalid_observation_time');
        const observedAt=date.toISOString(),data=validateSnapshot(await store.read({observedAt,signal:readSignal}));
        const readAuthorizer=typeof authorizeSource?.createReadScope==='function'?await authorizeSource.createReadScope({principal,snapshot:data,signal:readSignal}):authorizeSource;
        const eventTypes=new Map(data.event_types.map(type=>[type.code,type]));
        const people=new Map(data.people.filter(p=>uuid(p.id)&&text(p.display_name,200,1)&&p.is_trackable===true).map(p=>[p.id,p]));
        const linksByEvent=new Map(),peopleByEvent=new Map();
        for(const link of data.event_buildings) {if(!linksByEvent.has(link.event_id))linksByEvent.set(link.event_id,[]);linksByEvent.get(link.event_id).push(link);}
        for(const person of data.event_people) {if(!peopleByEvent.has(person.event_id))peopleByEvent.set(person.event_id,[]);peopleByEvent.get(person.event_id).push(person);}
        const upcoming=[],buildings=data.buildings.map(b=>({id:b.id,name:b.name,people:[],events:[]}));
        let projectedBytes=Buffer.byteLength(JSON.stringify(buildings),'utf8')+100;
        const reserve=value=>{projectedBytes+=Buffer.byteLength(JSON.stringify(value),'utf8')+1;if(projectedBytes>16777216)throw Error('map_projection_too_large');};
        const byBuilding=new Map(buildings.map(b=>[b.id,b]));
        const authorize=async(row,event,building,person=null)=>{
          const {source_id:id,source_url:url}=row;
          const local=!production&&principal.id==='local-development';
          if(id===MAP_DEBUG_EVENTS_SOURCE_ID||url===MAP_DEBUG_EVENTS_SOURCE_URL) {
            return local&&building.id==='bobst-library'&&id===MAP_DEBUG_EVENTS_SOURCE_ID&&url===MAP_DEBUG_EVENTS_SOURCE_URL&&
              event.kind==='scheduled_event'&&event.source_record_id?.startsWith('bobst-ui-debug-v1-')&&event.name.startsWith('[UI TEST] ');
          }
          if(id===MAP_LOCAL_PLAN_SOURCE_ID||url===MAP_LOCAL_PLAN_SOURCE_URL) {
            return local&&id===MAP_LOCAL_PLAN_SOURCE_ID&&url===MAP_LOCAL_PLAN_SOURCE_URL&&localPlanBuildings.has(building.id)&&
              event.kind==='personal_plan'&&event.source_id===id&&event.source_url===url&&
              (!person||person.id===MAP_LOCAL_PLAN_PERSON_ID)&&(!row.presence_basis||row.presence_basis==='planned');
          }
          if(id===MAP_DEBUG_SOURCE_ID||url===MAP_DEBUG_SOURCE_URL) {
            return local&&building.id==='bobst-library'&&id===MAP_DEBUG_SOURCE_ID&&url===MAP_DEBUG_SOURCE_URL&&
              ['presence','personal_plan'].includes(event.kind)&&event.source_id===id&&event.source_url===url&&
              (!row.presence_basis||row.presence_basis==='planned');
          }
          return authorizeProvenance({principal,sourceId:id,sourceUrl:url,buildingId:building.id,eventId:event.id,personId:person?.id,authorizeSource:readAuthorizer,signal:readSignal});
        };
        const current=new Map(buildings.map(b=>[b.id,new Map()])),labelTimes=new WeakMap();
        // Stable order makes overlap labels independent of database row order.
        const sorted=[...data.events].sort((a,b)=>(Date.parse(b.reported_at)||0)-(Date.parse(a.reported_at)||0)||String(a.id).localeCompare(String(b.id)));
        const projections=[];
        for(const event of sorted) {
          if(!validEvent(event)||!['confirmed','tentative'].includes(event.status))continue;
          const window=eventWindow(event);if(window.unknown||window.end<=at)continue;
          const candidates=[];
          for(const p of peopleByEvent.get(event.id)??[]) {
            const person=people.get(p.person_id),effective=validParticipation(p,event);
            if(person&&effective&&!effective.unknown&&p.attendance_status!=='declined')candidates.push({person,p,effective});
          }
          const links=(linksByEvent.get(event.id)??[]).filter(b=>text(b.location_notes,500));
          for(const link of links) {
            const building=byBuilding.get(link.building_id);
            if(building)projections.push({event,window,candidates,link,building});
          }
        }
        const visible=await concurrentChecks(projections,({event,building})=>authorize(event,event,building),readSignal);
        for(let index=0;index<projections.length;index++) {
          if(!visible[index])continue;
          const {event,window,candidates,link,building}=projections[index];
          const permissions=await concurrentChecks(candidates,candidate=>authorize(candidate.p,event,building,candidate.person),readSignal);
          const authorized=candidates.filter((_,index)=>permissions[index]);
          const displayParticipants=event.kind==='scheduled_event'?authorized:authorized.filter(({effective})=>effective.end>at);
          if(event.kind==='scheduled_event'||displayParticipants.length>0) {
            const type=eventTypes.get(event.type_id);
            const presentation={id:event.id,title:event.name,kind:event.kind,type:{code:type.code,name:type.name,iconKey:type.icon_key},startsAt:new Date(window.start).toISOString(),endsAt:new Date(window.end).toISOString(),
              timeZone:event.time_zone,allDay:window.allDay,status:event.status,description:event.notes,location:link.location_notes,url:event.url||null,
              attendees:displayParticipants.map(({person})=>personView(person)).sort((a,b)=>a.id.localeCompare(b.id))};
            if(building.events.length>=2000)throw Error('map_projection_too_large');reserve(presentation);building.events.push(presentation);
          }
          if(event.status!=='confirmed')continue;
          for(const {person,p,effective} of authorized) {
            if(p.attendance_status!=='going'||effective.end<=at)continue;
            const times={validFrom:new Date(effective.start).toISOString(),expiresAt:new Date(effective.end).toISOString()};
            if(effective.start>at) {
              if(upcoming.length>=50000)throw Error('map_projection_too_large');
              const plan={personId:person.id,buildingId:building.id,buildingName:building.name,label:p.label,...times};reserve(plan);upcoming.push(plan);continue;
            }
            const activity={eventId:event.id,name:event.name,label:p.label,...times};
            const existing=current.get(building.id).get(person.id);
            if(existing) {
              reserve(activity);
              existing.activities.push(activity);
              if(p.label.trim()!==''&&(existing.label.trim()===''||Date.parse(p.reported_at)>labelTimes.get(existing))) {
                existing.label=p.label;
                labelTimes.set(existing,Date.parse(p.reported_at));
              }
              existing.validFrom=new Date(Math.min(Date.parse(existing.validFrom),effective.start)).toISOString();
              existing.expiresAt=new Date(Math.max(Date.parse(existing.expiresAt),effective.end)).toISOString();
              continue;
            }
            const occupant={...personView(person),status:p.presence_basis==='reported'?'self_reported':'planned',label:p.label,...times,activities:[activity]};
            labelTimes.set(occupant,p.label.trim()!==''?Date.parse(p.reported_at):-Infinity);
            if(current.get(building.id).size>=500)throw Error('map_projection_too_large');reserve(occupant);current.get(building.id).set(person.id,occupant);
          }
        }
        for(const building of buildings) {
          building.people=[...current.get(building.id).values()].sort((a,b)=>a.id.localeCompare(b.id)).map(p=>{if(p.activities.length===1)delete p.activities;return p;});
          building.events.sort((a,b)=>Date.parse(a.startsAt)-Date.parse(b.startsAt)||a.id.localeCompare(b.id));
        }
        upcoming.sort((a,b)=>Date.parse(a.validFrom)-Date.parse(b.validFrom)||a.personId.localeCompare(b.personId)||a.buildingId.localeCompare(b.buildingId));
        const result={status:'ok',observedAt,buildings,upcoming};
        if(Buffer.byteLength(JSON.stringify(result),'utf8')>16777216)throw Error('map_projection_too_large');
        return result;
      },signal,timeoutMs);}catch{return unavailable();}
    },
  });
}
