import {validateArguments} from '../../server/automation/validation.js';
import {requestsChatAttendance} from '../../server/map/chat-intent.js';

const text=maxLength=>({type:'string',minLength:1,maxLength});
export const CHAT_ATTENDANCE_TOOLS=Object.freeze([
  {name:'find_map_attendance_targets',description:'Resolve a literal named person and existing scheduled event from THIS user message declaring attendance, including going to help. No source/Discord reference is needed. Use the literal person name and stated event phrase; event casing, spaces and punctuation may vary (Hackday matches Hack Day), but partial words and invented event words never match. Optional date is YYYY-MM-DD and must match its stated weekday/date in America/New_York. Return only existing trackable roster names and currently authorized unexpired scheduled events. Continue only for selection unique; otherwise ask for clarification. This cannot identify me or create an event.',readOnly:true,
    parameters:{type:'object',additionalProperties:false,properties:{personName:text(200),eventQuery:text(200),date:text(10)},required:['personName','eventQuery']}},
  {name:'set_map_attendance',description:'Set the uniquely resolved named person as going on the uniquely resolved existing map event. First call find_map_attendance_targets in this request; use its exact event id, person id and updated_at. Only attendance and its chat provenance change; preserve existing timing, event facts and all other participants. No Calendar edits or profile creation. Conflict requires fresh find/read; acknowledge only an applied attendanceWrite receipt.',idempotent:true,
    parameters:{type:'object',additionalProperties:false,properties:{eventId:text(36),personId:text(36),expectedUpdatedAt:text(40)},required:['eventId','personId','expectedUpdatedAt']}},
]);
const forbidden=()=>({status:'forbidden',reason:'request_local_attendance_required'});
export function createChatAttendanceTools({service}={}) {
  function createRequest(context={}) {
    const request=service?.createRequest(context);
    const tools=service?.configured===true&&requestsChatAttendance(context.userMessage)?CHAT_ATTENDANCE_TOOLS:[];
    async function execute({name,arguments:args,principal,signal}={}) {
      const tool=CHAT_ATTENDANCE_TOOLS.find(row=>row.name===name);
      if(!tool||!validateArguments(args,tool.parameters))return {status:'invalid_request'};
      if(service?.configured!==true||!request)return {status:'not_configured'};
      try {
        const result=await request[name==='find_map_attendance_targets'?'find':'set']({...args,principal,signal});
        return ['ok','applied'].includes(result?.status)?{...result,status:'ready',sourceStatus:result.status}:result;
      } catch {return {status:signal?.aborted?'aborted':'unavailable'};}
    }
    return Object.freeze({tools,execute,observe:(_name,result)=>result});
  }
  return Object.freeze({configured:service?.configured===true,tools:CHAT_ATTENDANCE_TOOLS,createRequest,execute:async()=>forbidden()});
}
