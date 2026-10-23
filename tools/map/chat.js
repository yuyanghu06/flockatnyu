import {createHash} from 'node:crypto';
import {validateArguments,canonicalJson} from '../../server/automation/validation.js';
import {safePerson,text,uuid,validateSnapshot,boundedWork,timestamp,mapReadContext} from '../../server/map/events.js';
import {validateChatRequestContext} from '../../server/chat-request-context.js';
import {validateDiscordUsers} from '../../server/chat-discord-context.js';
import {CHAT_MAP_SOURCE_ID,chatMapEventUrl} from '../../server/map/source-access.js';
import {chatMapTimeSchema,normalizeChatMapTimes,chatMapLocalDisplay,ChatMapTimeError} from '../../server/map/chat-time.js';
import {EVENT_DEFAULT_DURATION_SECONDS,PRESENCE_DEFAULT_TTL_SECONDS} from '../../server/map/contracts.js';
import {chatMapTargetChoicePrompt} from '../../server/chat-behavior.js';
import {compareDeduplicatedMapRead} from '../../server/map/read-comparison.js';

const principalValid=principal=>text(principal?.id,200,1)&&Array.isArray(principal.allowedSourceIds)&&principal.allowedSourceIds.every(uuid);
export const normalizeChatMapPersonName=value=>value.normalize('NFC').trim().replace(/\s+/gu,' ').toLowerCase();
const normalized=normalizeChatMapPersonName;
const readPrincipalScope=principal=>JSON.stringify({id:principal.id,sources:principal.allowedSourceIds,google:principal.googleAccess===true,calendar:principal.calendarAccess===true,
  calendarId:principal.calendarId??null,targets:principal.calendarTargets??null,guild:principal.liveDiscord?.guildId??null,bindings:principal.mapSourceBindings??null});
const sha=value=>createHash('sha256').update(value).digest('hex');
const idFor=value=>{const h=sha(value).slice(0,32);return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;};
const provenanceKeys=['source_id','source_url','source_record_id','reported_at'];
const personProvenanceKeys=['source_id','source_url','reported_at'];
const forbidden=()=>({status:'forbidden',reason:'request_local_map_write_required'});
const optionalProvenance=(schema,keys)=>({...schema,required:schema.required.filter(key=>!keys.includes(key)),properties:{...schema.properties,...Object.fromEntries(keys.filter(key=>schema.properties[key]).map(key=>[key,{...schema.properties[key],description:'Optional source metadata. Omit unchanged metadata on an existing event/participant so the adapter copies stored values; omit for a new direct-chat participant/report so the server supplies attribution. If included, copy exactly from the read result. Provider IDs/URLs are opaque: never decode, rebuild or re-encode them.'}]))}});

// Confirm the values actually submitted by this adapter only after an applied
// write. This is not an independent storage/provider readback; omitted defaults
// remain unknown. Keep large relationship sets explicitly incomplete.
function appliedSubmission(event,buildings,people,timeZone) {
  const submitted={confirmedApplied:true,basis:'submitted_values_not_readback',event:{...structuredClone(event),local_display:chatMapLocalDisplay(event,null,timeZone)},buildings:[],people:[],complete:true};
  const fits=()=>Buffer.byteLength(JSON.stringify(submitted))<=31900;
  if(!fits())return undefined;
  for(const [key,rows] of [['buildings',buildings],['people',people]]) {
    for(const row of rows) {
      submitted[key].push({...structuredClone(row),...(key==='people'?{effective_local_display:chatMapLocalDisplay(event,row,timeZone)}:{})});
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
    if(tool.name==='read_map_events')return {...tool,description:tool.description+' '+chatMapTargetChoicePrompt};
    if(tool.name==='lookup_map_person')return {...tool,
      description:'Resolve one existing trackable map person by a stated personName (unique exact full name or unique first name), or use empty arguments for the server-verified Discord speaker. Reuse successful IDs already returned in this request and existing unchanged participants from the current map snapshot after a failed write; do not look up the whole roster again. A changed person or genuinely unresolved identity may need a new lookup. Unknown or ambiguous identity returns no person; ask the user who they mean. Optional exact provider/providerUserId remains supported. No original source link or separate linked-author receipt is needed. Never create profiles or guess IDs.',
      parameters:{...tool.parameters,required:[],properties:{...tool.parameters.properties,personName:{type:'string',minLength:1,maxLength:200}}}};
    if(tool.name==='upsert_map_event'){
      const eventSchema=chatMapTimeSchema(optionalProvenance(tool.parameters.properties.event,provenanceKeys));
      eventSchema.properties.id={...eventSchema.properties.id,description:'Existing map event ID from the current authorized read, used only after USER-SUPPLIED facts identify a unique target. A returned ID or an ID you selected for a filtered read is not user selection. If multiple events still match, propose no calls for that ambiguous action; when no other work remains, end tool selection with zero calls so the answer stage asks which entry. Never choose the first ID. Omit id for a new event so the service assigns it.'};
      eventSchema.properties.url={...eventSchema.properties.url,description:'For EXISTING-event attendance or recovery OMIT url so the adapter retains the exact saved link. Include only for a genuine USER-requested link change or a new supported event link. Existing URLs and opaque IDs must never be decoded, reconstructed, re-encoded or repaired. Do not copy this optional field into attendance/recovery arguments.'};
      return {...tool,
      description:'Before an existing-event write, identify a unique user target across ALL observed candidates. If several still fit, propose ZERO calls for that action, including further reads/lookups/writes. If no unrelated requested work remains, END tool selection with zero calls; the separate answer stage asks which entry. Result order or an ID you chose to read cannot select the target. Recovery applies only after this target is unambiguous. Argument shape is {event: event fields, buildings: building rows, people: participant rows, expectedUpdatedAt: the parent event updated_at}. expectedUpdatedAt is a TOP-LEVEL sibling of event, buildings and people, NEVER a field inside event. New or changed times use starts_local/ends_local, no offset, in event.time_zone; the server converts. Raw starts_at/ends_at are byte-exact SAME event/person preservation copies from a map read in this request only. Omit display-only local_display/effective_local_display. Write one complete event/building/participant snapshot to the map database. This tool performs no source fetch, identity lookup or Calendar operation. Existing-event updates use the exact parent event id and expectedUpdatedAt from an explicit map read in this request. Omitted unchanged source metadata and event.url are retained from that local read; direct-chat provenance is filled internally. Preserve all unrequested event and relationship facts. Only an applied result confirms saving; conflicts require a separate read.',
      parameters:{...tool.parameters,properties:{...tool.parameters.properties,
        event:eventSchema,
        people:{...tool.parameters.properties.people,items:chatMapTimeSchema({...optionalProvenance(tool.parameters.properties.people.items,personProvenanceKeys),properties:{...optionalProvenance(tool.parameters.properties.people.items,personProvenanceKeys).properties,person_id:{...tool.parameters.properties.people.items.properties.person_id,description:'Existing trackable roster UUID returned by lookup_map_person; resolve a stated name or verified Discord actor, never invent a person ID.'}}})}}}};
    }
    return tool;
  });
  function createRequest(context={}) {
    let requestContext;try{requestContext=validateChatRequestContext(context.requestContext);}catch{return {tools,execute:async()=>({status:'forbidden',reason:'invalid_request_context'}),observe:(_name,result)=>result};}
    let discordUsers;try{discordUsers=validateDiscordUsers(context.discordUsers,requestContext);}catch{discordUsers=undefined;}
    const mappedActor=discordUsers?.users.find(row=>row.discordUserId===requestContext?.actor.userId);
    const discordActor=mappedActor?{...mappedActor,username:requestContext.actor.username,displayName:requestContext.actor.displayName}:undefined;
    const reportedAt=timestamp(context.timeContext?.now)!==null?context.timeContext.now:new Date(now()).toISOString();
    const snapshots=new Map(),completed=new Map();let latestReadContext;
    const history=Array.isArray(context.messages)?context.messages.filter(row=>row&&['user','assistant'].includes(row.role)&&typeof row.content==='string').map(({role,content})=>({role,content})): [{role:'user',content:context.userMessage||''}];
    let boundPrincipal=context.principal?.id;
    const requestIdentity=principal=>canonicalJson(requestContext?{principal:principal.id,discordRequestId:requestContext.requestId,actorId:requestContext.actor.userId,channelId:requestContext.channelId,threadId:requestContext.threadId,sourceProfileId:requestContext.sourceProfileId}:{principal:principal.id,date:reportedAt.slice(0,10),messages:history});
    const readRaw=async signal=>store?.configured===true?validateSnapshot(await store.read({observedAt:new Date(now()).toISOString(),signal})):null;
    function observe(_name,result){return result;}
    async function executeRaw(options={}) {
      const {name,arguments:args={},principal,signal}=options;
      // A failed, denied or thrown later read must not make an older snapshot
      // look like the latest authorized observation. Keep raw write snapshots.
      if(name==='read_map_events')latestReadContext=undefined;
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
          if(name==='read_map_events'&&result?.status==='ready'&&typeof mapReadContext(result)==='function')latestReadContext=mapReadContext(result);
          if(name==='read_map_events'&&result?.status==='ready')for(const event of result.events||[])snapshots.set(event.id,{event:structuredClone(event),people:structuredClone((result.event_people||[]).filter(row=>row.event_id===event.id)),
            buildings:structuredClone((result.event_buildings||[]).filter(row=>row.event_id===event.id)),principalScope:readPrincipalScope(principal),readContext:mapReadContext(result)});
          if(name==='read_map_events'&&result?.status==='ready'){
            const byId=new Map((result.events||[]).map(event=>[event.id,event]));
            return {...result,events:(result.events||[]).map(event=>({...event,local_display:chatMapLocalDisplay(event,null,context.timeContext?.timeZone)})),
              event_people:(result.event_people||[]).map(person=>({...person,effective_local_display:byId.has(person.event_id)?chatMapLocalDisplay(byId.get(person.event_id),person,context.timeContext?.timeZone):undefined}))};
          }
          return result;
        }
        return await boundedWork(async workSignal=>{
          let event={...args.event};const observed=event.id?snapshots.get(event.id):null;
          const prior=observed?.event??null,oldPeople=observed?.people??[];
          if(args.expectedUpdatedAt!==undefined&&!prior)return {status:'read_required'};
          if(prior)for(const key of provenanceKeys)if(event[key]===undefined)event[key]=prior[key];
          // Keep an existing optional link when only attendance is changing.
          // Stored null already matches the shared service default on omission.
          if(prior&&event.url===undefined&&prior.url!==undefined&&prior.url!==null)event.url=prior.url;
          if(!event.id&&event.source_id!==undefined&&event.source_id!==CHAT_MAP_SOURCE_ID&&typeof event.source_record_id==='string')event.id=idFor(canonicalJson([event.source_id,event.source_record_id]));
          const direct=event.source_id===undefined||event.source_id===CHAT_MAP_SOURCE_ID;
          event=normalizeChatMapTimes(event,{current:prior,timeZone:event.time_zone,timeKind:event.time_kind,
            ...(!prior&&direct&&event.kind==='presence'?{trustedPresenceStart:reportedAt}:{})});
          // Distinguish a fresh current-location confirmation from an old one
          // before deriving its identity; no report parser or cache is involved.
          if(!prior&&direct&&event.kind==='presence'&&event.starts_at===undefined)event.starts_at=reportedAt;
          if(!prior&&direct) {
            const identity=sha(canonicalJson({request:requestIdentity(principal),kind:event.kind,time_kind:event.time_kind,starts_at:event.starts_at??null,ends_at:event.ends_at??null,starts_on:event.starts_on??null,ends_on:event.ends_on??null,buildings:args.buildings.map(row=>row.building_id).sort(),people:args.people.map(row=>row.person_id).sort()}));
            event.id=idFor(identity);event.source_id=CHAT_MAP_SOURCE_ID;event.source_url=chatMapEventUrl(event.id,publicOrigin);event.source_record_id=`chat:${identity}`;event.reported_at=reportedAt;
          }
          const people=args.people.map(row=>{
            const old=oldPeople.find(person=>person.person_id===row.person_id),participant=normalizeChatMapTimes(row,{current:old,timeZone:event.time_zone,timeKind:event.time_kind==='all_day'?'timed':event.time_kind});
            if(old)for(const key of personProvenanceKeys)if(participant[key]===undefined)participant[key]=old[key];
            if(participant.source_id===undefined||participant.source_id===CHAT_MAP_SOURCE_ID) {
              participant.source_id=CHAT_MAP_SOURCE_ID;participant.source_url=chatMapEventUrl(event.id,publicOrigin);participant.reported_at??=reportedAt;
            }
            return participant;
          });
          if(!prior&&args.expectedUpdatedAt===undefined&&event.time_kind==='timed'&&event.ends_at===undefined){
            const start=timestamp(event.starts_at),report=timestamp(event.reported_at);
            if(start!==null&&(event.kind==='scheduled_event'||event.kind==='presence'&&start===report&&report<=new Date(now()).getTime()))
              event.ends_at=new Date(start+(event.kind==='presence'?PRESENCE_DEFAULT_TTL_SECONDS:EVENT_DEFAULT_DURATION_SECONDS)*1000).toISOString();
          }
          const signature=canonicalJson({event,buildings:args.buildings,people,expectedUpdatedAt:args.expectedUpdatedAt??null});
          if(!prior&&event.source_id===CHAT_MAP_SOURCE_ID&&completed.has(event.source_record_id)) {
            const previous=completed.get(event.source_record_id);
            return previous.signature===signature?previous.result:{status:'conflict',reason:'source_already_written_read_existing_event'};
          }
          const expectedUpdatedAt=args.expectedUpdatedAt;
          if(workSignal.aborted)return {status:'aborted'};
          let result=await mapTools.execute({...options,arguments:{...args,event,people,...(expectedUpdatedAt!==undefined?{expectedUpdatedAt}:{})},readContext:observed?.readContext??latestReadContext,signal:workSignal});
          if(result?.status==='invalid'&&['duplicate_participant_ids','duplicate_building_ids'].includes(result.reason)
            &&observed&&typeof observed.readContext==='function'&&observed.readContext===latestReadContext&&observed.principalScope===readPrincipalScope(principal)){
            const readComparison=compareDeduplicatedMapRead({event,buildings:args.buildings,people,expectedUpdatedAt,read:observed});
            if(readComparison)result={...result,readComparison};
          }
          if(result?.status==='ready'&&result.sourceStatus==='applied'&&uuid(result.event_id)&&timestamp(result.updated_at)!==null) {
            const submitted=appliedSubmission(event,args.buildings,people,context.timeContext?.timeZone);
            if(submitted)result={...result,mapSubmission:submitted};
          }
          if(result?.status==='ready'&&result.sourceStatus==='applied'&&event.source_id===CHAT_MAP_SOURCE_ID)completed.set(event.source_record_id,{signature,result});
          return result;
        },signal);
      }catch(error){return {status:signal?.aborted?'aborted':error instanceof ChatMapTimeError?'invalid_request':'unavailable',...(error instanceof ChatMapTimeError?{reason:error.reason}:{})};}
    }
    const execute=async options=>{const result=await executeRaw(options);return {...result,...(discordUsers?{discordUsers}:{}),...(discordActor?{discordActor}:{})};};
    return Object.freeze({tools,execute,observe});
  }
  return Object.freeze({configured:mapTools?.configured===true,tools,createRequest,
    execute:options=>options?.name==='read_map_events'?mapTools.execute(options):Promise.resolve(forbidden())});
}
