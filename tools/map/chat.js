import {createHash} from 'node:crypto';
import {validateArguments,canonicalJson} from '../../server/automation/validation.js';
import {safePerson,text,uuid,validateSnapshot,boundedWork,timestamp} from '../../server/map/events.js';
import {validateChatRequestContext} from '../../server/chat-request-context.js';
import {validateDiscordUsers} from '../../server/chat-discord-context.js';
import {CHAT_MAP_SOURCE_ID,chatMapEventUrl} from '../../server/map/source-access.js';

const principalValid=principal=>text(principal?.id,200,1)&&Array.isArray(principal.allowedSourceIds)&&principal.allowedSourceIds.every(uuid);
const normalized=value=>value.normalize('NFC').trim().replace(/\s+/gu,' ').toLowerCase();
const strip=row=>Object.fromEntries(Object.entries(row||{}).filter(([key,value])=>!['event_id','created_at','updated_at'].includes(key)&&value!==null));
const sha=value=>createHash('sha256').update(value).digest('hex');
const idFor=value=>{const h=sha(value).slice(0,32);return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;};
const provenanceKeys=['source_id','source_url','source_record_id','reported_at'];
const personProvenanceKeys=['source_id','source_url','reported_at'];
const forbidden=()=>({status:'forbidden',reason:'request_local_map_write_required'});
const optionalProvenance=(schema,keys)=>({...schema,required:schema.required.filter(key=>!keys.includes(key)),properties:{...schema.properties,...Object.fromEntries(keys.filter(key=>schema.properties[key]).map(key=>[key,{...schema.properties[key],description:'Optional source metadata. Omit unchanged metadata on an existing event/participant so the adapter copies stored values; omit for a new direct-chat participant/report so the server supplies attribution. If included, copy exactly from the read result. Provider IDs/URLs are opaque: never decode, rebuild or re-encode them.'}]))}});

// Confirm the values actually submitted by this adapter only after an applied
// write. This is not an independent storage/provider readback; omitted defaults
// remain unknown. Keep large relationship sets explicitly incomplete.
function appliedSubmission(event,buildings,people) {
  const submitted={confirmedApplied:true,basis:'submitted_values_not_readback',event:structuredClone(event),buildings:[],people:[],complete:true};
  const fits=()=>Buffer.byteLength(JSON.stringify(submitted))<=31900;
  if(!fits())return undefined;
  for(const [key,rows] of [['buildings',buildings],['people',people]]) {
    for(const row of rows) {
      submitted[key].push(structuredClone(row));
      if(!fits()){submitted[key].pop();submitted.complete=false;break;}
    }
  }
  return submitted;
}

// Chat and the worker share the same read/lookup/upsert operations. Intent and
// missing conversational facts are model decisions; source authorization, fixed
// catalogues, field validation and optimistic revisions remain service checks.
export function createChatMapTools({mapTools,store,env=process.env,publicOrigin=env.PUBLIC_ORIGIN,now=()=>new Date()}={}) {
  const tools=(mapTools?.tools||[]).map(tool=>{
    if(tool.name==='read_map_events')return {...tool,description:tool.description+' For genuine event/program/venue-and-day attendance, first match an existing authorized event by title, local date and location. A unique timed match supplies its hours, including a follow-up saying the entire time. ISO times ending in Z or +00:00 are UTC; convert for the actual date and user timezone when reporting, never relabel UTC as local. Null/omitted participant start/end inherits the corresponding event boundary, so existing going participation with both inherited already covers the full event and needs no write to restate it. If no usable map match exists, use normal Calendar list/read tools before asking for hours or proposing a new activity; failed/partial reads do not establish absence. For scheduled-event attendance, retain the exact existing event.id returned by this authorized map read. If no corresponding map event.id is returned, Calendar may supply hours/context but STOP map writes and report attendance unsaved; never create/project a Calendar occurrence or invent IDs/provenance merely for attendance.'};
    if(tool.name==='lookup_map_person')return {...tool,
      description:'Resolve one existing trackable map person by a stated personName (unique exact full name or unique first name), or use empty arguments for the server-verified Discord speaker. Unknown or ambiguous identity returns no person; ask the user who they mean. Optional exact provider/providerUserId remains supported. No original source link or separate linked-author receipt is needed. Never create profiles or guess IDs.',
      parameters:{...tool.parameters,required:[],properties:{...tool.parameters.properties,personName:{type:'string',minLength:1,maxLength:200}}}};
    if(tool.name==='upsert_map_event')return {...tool,
      description:'Create or update one complete map event and its building/people relationships only for an actual user request or genuine attendance/location report, including an answer to your clarification of that request. Do NOT write for quoted/reported/example text, hypothetical or summary-only/meaning questions, or explicit do-not-save requests; names/dates and verified actor identity do not grant action intent. A genuine cannot-attend report may update declined participation. Read state and resolve the person first. For event/program/venue-and-day attendance, use the existing event match after map lookup and normal Calendar fallback when needed. A unique timed match supplies its hours; a timing clarification saying the entire time inherits that exact event window, never all-day dates by itself. ATTENDANCE REQUIRES an exact existing event.id returned by a current authorized read_map_events result. A Calendar eventId cannot substitute for a map event.id. With a Calendar-only match and no readable corresponding map event.id, DO NOT CALL this tool: stop map writes and explain the known hours and attendance unsaved. Never create/project/reconstruct the occurrence, retry creation, or invent IDs/source metadata/reported_at merely for an RSVP. Explicitly separate or explicitly all-day personal plans remain valid. For an existing going participant, null/omitted starts_at and ends_at inherit the event boundaries and already cover the entire event; do not call this tool merely to restate that interval. If another attendance change is necessary, preserve event starts_at/ends_at byte-for-byte as read, never reinterpret UTC Z/+00:00 times as local or fabricate a timing correction. Use exact event.id and the parent EVENT record updated_at as expectedUpdatedAt, never a participant/relationship updated_at; preserve ALL event facts, buildings, other participants, labels and time overrides. Multiple matching titles/dates require clarification BEFORE writing unless the user supplied a uniquely distinguishing time/place/detail; never choose first/rank/best guess. Omit unchanged event/participant source metadata and existing event.url so the adapter retains stored values; omit new participant provenance for server chat attribution. Unless the user genuinely requests a link change, copy any supplied provider ID/URL or event.url byte-for-byte from the read: never decode, rebuild or re-encode opaque Calendar eid/base64 strings. Ask about unclear identity/event details. Only an applied receipt confirms saving.',
      parameters:{...tool.parameters,properties:{...tool.parameters.properties,
        event:optionalProvenance(tool.parameters.properties.event,provenanceKeys),
        people:{...tool.parameters.properties.people,items:{...optionalProvenance(tool.parameters.properties.people.items,personProvenanceKeys),properties:{...optionalProvenance(tool.parameters.properties.people.items,personProvenanceKeys).properties,person_id:{...tool.parameters.properties.people.items.properties.person_id,description:'Existing trackable roster UUID returned by lookup_map_person; resolve a stated name or verified Discord actor, never invent a person ID.'}}}}}}};
    return tool;
  });
  function createRequest(context={}) {
    let requestContext;try{requestContext=validateChatRequestContext(context.requestContext);}catch{return {tools,execute:async()=>({status:'forbidden',reason:'invalid_request_context'}),observe:(_name,result)=>result};}
    let discordUsers;try{discordUsers=validateDiscordUsers(context.discordUsers,requestContext);}catch{discordUsers=undefined;}
    const mappedActor=discordUsers?.users.find(row=>row.discordUserId===requestContext?.actor.userId);
    const discordActor=mappedActor?{...mappedActor,username:requestContext.actor.username,displayName:requestContext.actor.displayName}:undefined;
    const reportedAt=timestamp(context.timeContext?.now)!==null?context.timeContext.now:new Date(now()).toISOString();
    const snapshots=new Map(),completed=new Map();
    const history=Array.isArray(context.messages)?context.messages.filter(row=>row&&['user','assistant'].includes(row.role)&&typeof row.content==='string').map(({role,content})=>({role,content})): [{role:'user',content:context.userMessage||''}];
    let boundPrincipal=context.principal?.id;
    const requestIdentity=principal=>canonicalJson(requestContext?{principal:principal.id,discordRequestId:requestContext.requestId,actorId:requestContext.actor.userId,channelId:requestContext.channelId,threadId:requestContext.threadId,sourceProfileId:requestContext.sourceProfileId}:{principal:principal.id,date:reportedAt.slice(0,10),messages:history});
    const readRaw=async signal=>store?.configured===true?validateSnapshot(await store.read({observedAt:new Date(now()).toISOString(),signal})):null;
    function observe(_name,result){return result;}
    async function executeRaw(options={}) {
      const {name,arguments:args={},principal,signal}=options;
      if(!principalValid(principal)||boundPrincipal&&boundPrincipal!==principal.id)return {status:'forbidden'};
      if(signal?.aborted)return {status:'aborted'};
      boundPrincipal=principal.id;
      const tool=tools.find(row=>row.name===name);
      if(!tool||!validateArguments(args,tool.parameters))return {status:'invalid_request'};
      if(mapTools?.configured!==true)return {status:'not_configured'};
      try {
        if(name==='lookup_map_person') {
          // Legacy injected tool fixtures can still use the provider lookup;
          // production supplies the same authenticated map store for all modes.
          if(store?.configured!==true)return args.provider&&args.providerUserId?mapTools.execute(options):{status:'not_configured'};
          return await boundedWork(async workSignal=>{
            let person=null,reason='person_not_found';
            if(args.personName!==undefined) {
              const target=normalized(args.personName),data=await readRaw(workSignal),eligible=data.people.filter(row=>uuid(row.id)&&row.is_trackable===true&&text(row.display_name,200,1));
              const exact=eligible.filter(row=>normalized(row.display_name)===target);
              const matches=exact.length?exact:/\s/u.test(target)?[]:eligible.filter(row=>normalized(row.display_name).split(' ')[0]===target);
              person=matches.length===1?matches[0]:null;reason=matches.length>1?'person_ambiguous':'person_not_found';
            }else {
              const provider=args.provider??(requestContext?'discord':undefined),providerUserId=args.providerUserId??(provider==='discord'?requestContext?.actor.userId:undefined);
              if(!provider||!providerUserId)return {status:'ready',sourceStatus:'ok',person:null,reason:'person_name_required'};
              person=await store.lookup({provider,providerUserId,signal:workSignal});
            }
            if(workSignal.aborted)return {status:'aborted'};
            return {status:'ready',sourceStatus:'ok',person:person&&uuid(person.id)&&person.is_trackable===true&&text(person.display_name,200,1)?safePerson(person):null,...(!person?{reason}:{})};
          },signal);
        }
        if(name!=='upsert_map_event') {
          const result=await mapTools.execute(options);
          if(name==='read_map_events'&&result?.status==='ready')for(const event of result.events||[])snapshots.set(event.id,{event,people:(result.event_people||[]).filter(row=>row.event_id===event.id)});
          return result;
        }
        return await boundedWork(async workSignal=>{
          const data=await readRaw(workSignal),event={...args.event};
          const prior=event.id?(data?.events.find(row=>row.id===event.id)??snapshots.get(event.id)?.event):null;
          const oldPeople=prior?(data?.event_people.filter(row=>row.event_id===prior.id)??snapshots.get(prior.id)?.people??[]):[];
          if(prior)for(const key of provenanceKeys)if(event[key]===undefined)event[key]=prior[key];
          // Keep an existing optional link when only attendance is changing.
          // Stored null already matches the shared service default on omission.
          if(prior&&event.url===undefined&&prior.url!==undefined&&prior.url!==null)event.url=prior.url;
          if(!event.id&&event.source_id!==undefined&&event.source_id!==CHAT_MAP_SOURCE_ID&&typeof event.source_record_id==='string')event.id=idFor(canonicalJson([event.source_id,event.source_record_id]));
          const direct=event.source_id===undefined||event.source_id===CHAT_MAP_SOURCE_ID;
          // Distinguish a fresh current-location confirmation from an old one
          // before deriving its identity; no report parser or cache is involved.
          if(!prior&&direct&&event.kind==='presence'&&event.starts_at===undefined)event.starts_at=reportedAt;
          if(!prior&&direct) {
            const identity=sha(canonicalJson({request:requestIdentity(principal),kind:event.kind,time_kind:event.time_kind,starts_at:event.starts_at??null,ends_at:event.ends_at??null,starts_on:event.starts_on??null,ends_on:event.ends_on??null,buildings:args.buildings.map(row=>row.building_id).sort(),people:args.people.map(row=>row.person_id).sort()}));
            event.id=idFor(identity);event.source_id=CHAT_MAP_SOURCE_ID;event.source_url=chatMapEventUrl(event.id,publicOrigin);event.source_record_id=`chat:${identity}`;event.reported_at=reportedAt;
          }
          const people=args.people.map(row=>{
            const participant={...row},old=oldPeople.find(person=>person.person_id===row.person_id);
            if(old)for(const key of personProvenanceKeys)if(participant[key]===undefined)participant[key]=old[key];
            if(participant.source_id===undefined||participant.source_id===CHAT_MAP_SOURCE_ID) {
              participant.source_id=CHAT_MAP_SOURCE_ID;participant.source_url=chatMapEventUrl(event.id,publicOrigin);participant.reported_at??=reportedAt;
            }
            return participant;
          });
          const signature=canonicalJson({event,buildings:args.buildings,people,expectedUpdatedAt:args.expectedUpdatedAt??null});
          if(!prior&&event.source_id===CHAT_MAP_SOURCE_ID&&completed.has(event.source_record_id)) {
            const previous=completed.get(event.source_record_id);
            return previous.signature===signature?previous.result:{status:'conflict',reason:'source_already_written_read_existing_event'};
          }
          let expectedUpdatedAt=args.expectedUpdatedAt;
          const replay=!prior&&event.source_id===CHAT_MAP_SOURCE_ID?data?.events.find(row=>row.id===event.id&&row.source_id===event.source_id&&row.source_record_id===event.source_record_id):null;
          if(replay) {
            const proposed={...event};
            if(proposed.ends_at===undefined&&proposed.kind==='presence'&&proposed.starts_at===proposed.reported_at)proposed.ends_at=new Date(Date.parse(proposed.starts_at)+7200000).toISOString();
            const byId=(rows,key)=>rows.map(strip).sort((a,b)=>String(a[key]).localeCompare(String(b[key])));
            if(canonicalJson(strip(replay))!==canonicalJson(strip(proposed))
              ||canonicalJson(byId(data.event_buildings.filter(row=>row.event_id===event.id),'building_id'))!==canonicalJson(byId(args.buildings,'building_id'))
              ||canonicalJson(byId(data.event_people.filter(row=>row.event_id===event.id),'person_id'))!==canonicalJson(byId(people,'person_id'))
              ||timestamp(replay.updated_at)===null)return {status:'conflict',reason:'existing_activity_changed_read_existing_event'};
            // An identical persisted retry still uses the shared conditional
            // write and current authorization, never an invented success.
            if(event.ends_at===undefined&&proposed.ends_at!==undefined)event.ends_at=proposed.ends_at;
            expectedUpdatedAt=replay.updated_at;
          }
          if(workSignal.aborted)return {status:'aborted'};
          let result=await mapTools.execute({...options,arguments:{...args,event,people,...(expectedUpdatedAt!==undefined?{expectedUpdatedAt}:{})},signal:workSignal});
          if(result?.status==='ready'&&result.sourceStatus==='applied'&&uuid(result.event_id)&&timestamp(result.updated_at)!==null) {
            const submitted=appliedSubmission(event,args.buildings,people);
            if(submitted)result={...result,mapSubmission:submitted};
          }
          if(result?.status==='ready'&&result.sourceStatus==='applied'&&event.source_id===CHAT_MAP_SOURCE_ID)completed.set(event.source_record_id,{signature,result});
          return result;
        },signal);
      }catch{return {status:signal?.aborted?'aborted':'unavailable'};}
    }
    const execute=async options=>{const result=await executeRaw(options);return {...result,...(discordUsers?{discordUsers}:{}),...(discordActor?{discordActor}:{})};};
    return Object.freeze({tools,execute,observe});
  }
  return Object.freeze({configured:mapTools?.configured===true,tools,createRequest,
    execute:options=>options?.name==='read_map_events'?mapTools.execute(options):Promise.resolve(forbidden())});
}
