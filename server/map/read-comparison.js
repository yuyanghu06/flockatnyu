import {MAP_EVENT_SCHEMA,EVENT_PEOPLE_SCHEMA,EVENT_BUILDINGS_SCHEMA} from './contracts.js';
import {canonicalJson,plainObject} from '../automation/validation.js';
import {timestamp} from './events.js';

const eventDefaults={notes:'',type_id:'other',status:'confirmed',time_zone:'America/New_York'};
const personDefaults={attendance_status:'going',label:''};

function fields(row,schema,defaults={},submitted=false){
  if(!plainObject(row)||submitted&&Object.keys(row).some(key=>!Object.hasOwn(schema.properties,key)))return null;
  const output={};
  for(const key of Object.keys(schema.properties)){
    const value=row[key]??defaults[key]??null;
    if(value!==null&&typeof value!=='string')return null;
    output[key]=value;
  }
  return output;
}
function rows(values,schema,key,defaults,submitted){
  if(!Array.isArray(values))return null;
  const byId=new Map();
  for(const value of values){
    const row=fields(value,schema,defaults,submitted);if(!row||typeof row[key]!=='string')return null;
    const encoded=canonicalJson(row),prior=byId.get(row[key]);
    // Only identical proposed duplicates can collapse. Reads must be unique.
    if(prior!==undefined&&(!submitted||prior!==encoded))return null;
    byId.set(row[key],encoded);
  }
  return [...byId].sort(([a],[b])=>a.localeCompare(b));
}

// A pure comparison with an earlier authorized request-local snapshot. This
// says nothing about user intent or current database state, and never repairs,
// saves or authorizes anything. Timestamp/URL strings compare byte-for-byte.
export function compareDeduplicatedMapRead({event,buildings,people,expectedUpdatedAt,read}={}){
  if(!read?.event||event?.id!==read.event.id||expectedUpdatedAt!==read.event.updated_at||timestamp(expectedUpdatedAt)===null)return undefined;
  const proposedEvent=fields(event,MAP_EVENT_SCHEMA,eventDefaults,true),savedEvent=fields(read.event,MAP_EVENT_SCHEMA,eventDefaults);
  if(!proposedEvent||!savedEvent||canonicalJson(proposedEvent)!==canonicalJson(savedEvent))return undefined;
  const proposedPeople=rows(people,EVENT_PEOPLE_SCHEMA.items,'person_id',personDefaults,true),savedPeople=rows(read.people,EVENT_PEOPLE_SCHEMA.items,'person_id',personDefaults,false),
    proposedBuildings=rows(buildings,EVENT_BUILDINGS_SCHEMA.items,'building_id',{location_notes:''},true),savedBuildings=rows(read.buildings,EVENT_BUILDINGS_SCHEMA.items,'building_id',{location_notes:''},false);
  if(!proposedPeople||!savedPeople||!proposedBuildings||!savedBuildings
    ||proposedPeople.length===people.length&&proposedBuildings.length===buildings.length
    ||canonicalJson(proposedPeople)!==canonicalJson(savedPeople)||canonicalJson(proposedBuildings)!==canonicalJson(savedBuildings))return undefined;
  return {deduplicatedMatchesRead:true,basis:'request_local_authorized_read',readVersion:expectedUpdatedAt};
}
