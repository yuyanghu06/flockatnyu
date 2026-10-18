import {validateArguments} from '../../server/automation/validation.js';
import {MAP_EVENT_SCHEMA,EVENT_BUILDINGS_SCHEMA,EVENT_PEOPLE_SCHEMA} from '../../server/map/contracts.js';
const text=maxLength=>({type:'string',minLength:1,maxLength});
const define=(name,description,properties,required=[],readOnly=true)=>Object.freeze({name,description,parameters:{type:'object',additionalProperties:false,properties,required},...(readOnly?{readOnly:true}:{idempotent:true})});
export const MAP_TOOLS=Object.freeze([
  define('read_map_events','Read currently authorized normalized map events, complete relationships, fixed buildings, safe trackable people and the full read-only event_types catalogue even when event filters match nothing. Choose an existing type_id from source evidence, other when unknown; preserve existing type on unrelated edits. Read before updating, retain updated_at for expectedUpdatedAt; merge partial evidence into a complete snapshot. Optional filters select an event or stable source identity.',{eventId:text(36),sourceId:text(36),sourceRecordId:text(200)}),
  define('lookup_map_person','Resolve one EXISTING trackable person by exact linked Discord user ID or email, using authorized original source evidence. No name matching, guesses, profile creation or relinking.',{provider:{type:'string',enum:['discord','email']},providerUserId:text(320),sourceId:text(36),sourceUrl:text(2048)},['provider','providerUserId','sourceId','sourceUrl']),
  define('upsert_map_event','Atomically create or update ONE normalized event and its complete building/people relationships. First read and merge existing state. For existing records send event.id and expectedUpdatedAt from current updated_at; omit token for creation. Stable source_record_id prevents duplicates. Every participant displays at every linked building; overlaps allowed. No profile/building creation or cross-event removal. Conflicts require reread, never a new identity.',{event:MAP_EVENT_SCHEMA,buildings:EVENT_BUILDINGS_SCHEMA,people:EVENT_PEOPLE_SCHEMA,expectedUpdatedAt:text(40)},['event','buildings','people'],false),
]);
const methods={read_map_events:'read',lookup_map_person:'lookup',upsert_map_event:'upsert'};
export function createMapTools({service}={}) {
  async function execute({name,arguments:args,principal,signal}={}) {
    const tool=MAP_TOOLS.find(row=>row.name===name);
    if(!tool||!validateArguments(args,tool.parameters))return {status:'invalid_request'};
    if(service?.configured!==true)return {status:'not_configured'};
    if(typeof principal?.id!=='string'||!principal.id||!Array.isArray(principal.allowedSourceIds))return {status:'forbidden'};
    try {
      const result=await service[methods[name]]({...args,principal,signal});
      return ['ok','applied'].includes(result?.status)?{...result,status:'ready',sourceStatus:result.status}:result;
    }catch{return {status:signal?.aborted?'aborted':'unavailable'};}
  }
  return Object.freeze({configured:service?.configured===true,tools:Object.freeze(MAP_TOOLS.map(tool=>Object.freeze({...tool,execute:(args,context)=>execute({name:tool.name,arguments:args,...context})}))),execute});
}
