import {readConfig} from '../config.js';
import {readGoogleConfig} from '../google/config.js';
import {createGoogleClient} from '../google/client.js';
import {sourceMailbox} from '../google/mailbox.js';
import {readCalendarConfig,readMemberPlansConfig} from '../google/calendar-config.js';
import {createPendingTaskStore} from './task-store.js';
import {createStagedPipeline} from './staged-pipeline.js';
import {createCalendarMapSync,calendarMapName} from './calendar-sync.js';
import {createMemberPlansTools} from './member-plans.js';
import {createCalendarClient,calendarEventId} from '../google/calendar-client.js';
import {projectCalendarReceipt} from '../google/calendar-receipt.js';
import {readLiveDiscordConfig} from '../discord/live-config.js';
import {createDiscordStore} from '../discord/store.js';
import {createLiveDiscordClient} from '../discord/live-client.js';
import {createLiveDiscordRetrieval} from '../discord/live-retrieval.js';
import {isDiscordChannelExcluded} from '../discord/discovery.js';
import {resolveDiscordSourceIds} from '../discord/source-scope.js';
import {createManualDiscordStore} from '../discord/manual-scope.js';
import {GOOGLE_TOOLS,executeGoogleTool} from '../../tools/google/index.js';
import {createLiveRetrievalTools} from '../../tools/discord/index.js';
import {createCalendarTools} from '../../tools/calendar/index.js';
import {createBoundedResults} from './bounded-result.js';
import {createMapTools} from '../../tools/map/index.js';
import {createMapEventStore,createMapEventService} from '../map/events.js';
import {createMapSourceAuthorizer} from '../map/source-access.js';
import {canonicalJson,plainObject,validUuid} from './validation.js';
import {resolveDateBoundary} from '../time-zone.js';

const snowflake=value=>typeof value==='string'&&/^[0-9]{1,20}$/.test(value);
const personUuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const fail=code=>{throw new Error(code);};
const success=new Set(['ready','empty','partial','unsupported_content']);
const evidenceKey=(sourceId,sourceUrl)=>canonicalJson([sourceId,sourceUrl]);
export function discordCalendarIntent(content,{cancel=false}={}) {
  if(typeof content!=='string'||!content.trim())return false;
  const text=content.toLowerCase();
  if(/\brsvp\s*[:=-]?\s*(?:yes|no|maybe|accepted|declined|going|not going)\b/.test(text))return false;
  if(/\b(?:i|we)(?:'m|'re| am| are)?\s+(?:plan(?:ning)?|intend(?:ing)?|want(?:ing)?|hope|hoping)\s+to\s+(?:attend|join|go)\b/.test(text))return false;
  if(/\b(?:not|never|no longer)\s+(?:cancelled|canceled|called off)\b/.test(text))return false;
  if(/\b(?:i(?:'m|'ll| am| will|’m)?|we(?:'re| are| will)?|[a-z]+ (?:is|are|will))\s+(?:not\s+)?(?:attend(?:ing)?|join(?:ing)?|go(?:ing)?|be there|can help)\b/.test(text))return false;
  if(/^\s*(?:i(?:'ll| will| am|'m|’m)?\s+(?:attend|join|go(?:ing)?|be there|study|studying)|count me in|rsvp\b|i can help)/i.test(text))return false;
  if(/^\s*(?:co[- ]?working\b|studying\b|i(?:'m|’m| am|m)?\s+(?:at|here|heading|working)\b)/i.test(text))return false;
  if(/\b(?:maybe|might|proposed|proposal)\b/.test(text)||/\b(?:cancelled|canceled|rescheduled)\s*\?/.test(text))return false;
  const cancelled=/\b(?:cancel(?:led|ed)?|called off)\b/.test(text);
  if(cancel)return cancelled&&!/\b(?:not|never|no longer|isn't|wasn't|hasn't|don't)\b|["“”?]/.test(text);
  // Semantic event interpretation belongs to the planner. Backend checks retain
  // exact originals, ownership, duplicate coverage and narrow unsafe negatives.
  return !cancelled;
}

/** Bundled server-owned adapter. Construction does no network I/O. Dependencies
 * are an explicit fixture seam; event/model data never selects implementations. */
export function createAutomationAdapters({env=process.env,config,fetchImpl=globalThis.fetch,now=()=>new Date(),dependencies={},manual}={}) {
  const d=dependencies;
  if(manual!==undefined&&(!plainObject(manual)||manual.force!==true||!Array.isArray(manual.channelIds)
    ||manual.channelIds.length>30||manual.channelIds.some(value=>!snowflake(value))
    ||new Set(manual.channelIds).size!==manual.channelIds.length))fail('invalid_request');
  const manualWhitelist=Boolean(manual?.channelIds.length);
  const stagedEnabled=env.AGENT_AUTOMATION_STAGED_ENABLED==='true';
  let activeLeaseToken,staged,preparedContext,synchronizer;
  const pendingTaskStore=stagedEnabled?(d.taskStore||createPendingTaskStore({env,fetchImpl})):null;
  const staticSourceIds=Object.freeze([...new Set(readConfig(env).allowedSourceIds)]);
  let allowedSourceIds=manualWhitelist?Object.freeze([]):staticSourceIds;
  let currentDiscordSourceIds=[];
  const setDiscordSourceIds=ids=>{allowedSourceIds=Object.freeze([...new Set([
    ...(manualWhitelist?staticSourceIds.filter(id=>id===calendarSourceId||id===memberSourceId):staticSourceIds),...ids])]);};
  const googleConfig=d.googleConfig||readGoogleConfig(env);
  const googleClient=d.googleClient||createGoogleClient({config:googleConfig,fetchImpl});
  const gmailSourceId=(env.AGENT_GMAIL_SOURCE_ID||'').trim();
  const googleAccess=!manualWhitelist&&googleConfig.configured===true&&validUuid(gmailSourceId)&&staticSourceIds.includes(gmailSourceId);
  const calendarConfig=d.calendarConfig||readCalendarConfig(env);
  const calendarSourceId=calendarConfig.sourceId??(env.AGENT_CALENDAR_SOURCE_ID||'').trim();
  const calendarMapConfigured=validUuid(calendarSourceId)&&staticSourceIds.includes(calendarSourceId);
  const calendarClient=d.calendarClient||createCalendarClient({config:calendarConfig,fetchImpl});
  const calendarTools=d.calendarTools||createCalendarTools({client:calendarClient});
  const memberConfig=d.memberConfig||readMemberPlansConfig(env);
  const memberClient=d.memberClient||createCalendarClient({config:memberConfig,fetchImpl});
  const memberSourceId=memberConfig.sourceId;
  const targets=[{client:calendarClient,sourceId:calendarSourceId,kind:'club'},
    ...(stagedEnabled?[{client:memberClient,sourceId:memberSourceId,kind:'member'}]:[])];
  const discordConfig=d.discordConfig||readLiveDiscordConfig(env);
  const discordClient=d.discordClient||createLiveDiscordClient({config:discordConfig,fetchImpl});
  const ordinaryDiscordStore=d.discordStore||createDiscordStore({env,fetchImpl});
  const discordStore=manualWhitelist?createManualDiscordStore({store:ordinaryDiscordStore,client:discordClient,
    guildId:discordConfig.guildId,channelIds:manual.channelIds}):ordinaryDiscordStore;
  const liveDiscordService=d.liveDiscordService||createLiveDiscordRetrieval({config:discordConfig,store:discordStore,client:discordClient});
  const discordTools=d.discordTools||createLiveRetrievalTools({service:liveDiscordService,guildId:discordConfig.guildId});
  const mapSourceAuthorizer=d.mapSourceAuthorizer||createMapSourceAuthorizer({liveDiscordService,googleClient,gmailSourceId,calendarClient,calendarSourceId,calendarTargets:stagedEnabled?[{client:memberClient,sourceId:memberSourceId}]:[]});
  const mapEventService=d.mapEventService||createMapEventService({store:d.mapEventStore||createMapEventStore({env,fetchImpl,...(stagedEnabled?{getLeaseToken:()=>activeLeaseToken}:{})}),authorizeSource:mapSourceAuthorizer,now});
  const mapTools=createMapTools({service:mapEventService});
  const calendarSources=[];
  const principal=Object.freeze({id:'update-agent',get allowedSourceIds(){return allowedSourceIds;},googleAccess,
    liveDiscord:Object.freeze({mode:'local-operator',guildId:discordConfig.guildId}),
    calendarAccess:true,calendarId:calendarConfig.calendarId,calendarSources,...(stagedEnabled?{calendarTargets:targets.map(target=>({calendarId:target.client.calendarId,sourceId:target.sourceId}))}:{})});
  const fragments=createBoundedResults();
  const observed=new Map(), batchInputs=new Map(), linkedIdentities=new Map();
  const calendarOccurrences=new Map(), pendingCalendarReads=new Set();
  const fixedBuildings=new Map();
  const calendarWindows=new Map();
  const knownCalendarEvents=new Map();
  const mutatedCalendarIds=new Map([['club',new Set()],['member',new Set()]]);
  let prepared=false,catalogueRead=false;
  async function resolveClaimSourceIds({principal:actor,signal}={}) {
    if(actor!==principal||signal?.aborted)fail(signal?.aborted?'aborted':'forbidden');
    if(stagedEnabled&&await pendingTaskStore.prune({signal}).then(result=>result.status!=='ready'))fail('not_configured');
    // Old static Discord UUIDs are never claim authority. Only the live guarded
    // catalogue supplies Discord claims; Gmail retains its exact static grant.
    setDiscordSourceIds([]);
    let discordIds=[];
    if(discordConfig.configured) {
      try {discordIds=manualWhitelist?await discordStore.resolveSourceIds({signal}):await resolveDiscordSourceIds({store:discordStore,guildId:discordConfig.guildId,signal});}
      catch(error){if(manualWhitelist)throw error;if(signal?.aborted)fail('aborted');}
    }else if(manualWhitelist)fail('not_configured');
    if(signal?.aborted)fail('aborted');
    setDiscordSourceIds(discordIds);
    currentDiscordSourceIds=[...discordIds];
    return [...new Set([...discordIds,...(googleAccess?[gmailSourceId]:[])])];
  }
  const cleanupBatch=()=>{staged?.cleanup();activeLeaseToken=undefined;preparedContext=undefined;prepared=false;calendarSources.length=0;observed.clear();batchInputs.clear();linkedIdentities.clear();fragments.clear();
    calendarOccurrences.clear();pendingCalendarReads.clear();fixedBuildings.clear();calendarWindows.clear();knownCalendarEvents.clear();taskEvidence.clear();for(const ids of mutatedCalendarIds.values())ids.clear();catalogueRead=false;};
  function rememberDiscord(source) {
    if(source.guildId!==discordConfig.guildId||!snowflake(source.channelId)||!snowflake(source.messageId)
      ||!validUuid(source.sourceId)||!allowedSourceIds.includes(source.sourceId)
      ||source.url!==`https://discord.com/channels/${source.guildId}/${source.channelId}/${source.messageId}`)return;
    const sourceKey=`discord:${source.guildId}:${source.channelId}:${source.messageId}`;
    observed.set(sourceKey,{provider:'discord',sourceKey,sourceId:source.sourceId,sourceUrl:source.url,authorId:source.authorId,
      guildId:source.guildId,channelId:source.channelId,messageId:source.messageId,content:source.content??source.excerpt??''});
    if(!calendarSources.some(row=>row.provider==='discord'&&row.messageId===source.messageId&&row.channelId===source.channelId))
      calendarSources.push(Object.freeze({provider:'discord',sourceId:source.sourceId,guildId:source.guildId,channelId:source.channelId,messageId:source.messageId}));
  }

  const gmailSignature=source=>canonicalJson([source.excerpt,source.from,source.title??null,source.date??null]);
  async function observedGmail(source,context) {
    if(!googleAccess||source?.kind!=='gmail'||!/^[a-fA-F0-9]{1,64}$/.test(source.externalId||'')
      ||source.url!==`https://mail.google.com/mail/u/0/#all/${source.externalId}`
      ||source.contentStatus!=='text_only_bounded'||typeof source.excerpt!=='string'||!source.excerpt.trim())return null;
    const sender=sourceMailbox(source.from);
    if(!sender)return null;
    context=expandedContext(context);
    const originals=(context.inputIds||[]).map(id=>batchInputs.get(id)).filter(event=>event?.source==='gmail'
      &&event.source_id===gmailSourceId&&event.event_id===source.externalId&&event.payload?.id===source.externalId);
    if(!originals.length)return null;
    for(const event of originals) {
      if(!await authorizeEvent({event,principal,signal:context.signal}))return null;
      const headers=event.payload?.payload?.headers;
      if(Array.isArray(headers)) {
        const from=headers.filter(header=>typeof header?.name==='string'&&header.name.toLowerCase()==='from');
        if(from.length!==1||sourceMailbox(from[0].value)!==sender)return null;
      }
    }
    return {provider:'gmail',sourceKey:`gmail:${source.externalId}`,sourceId:gmailSourceId,sourceUrl:source.url,
      messageId:source.externalId,sender,content:source.excerpt,signature:gmailSignature(source)};
  }
  function normalize(result) {
    if(!plainObject(result))fail('tool_failed');
    // Normalization retains original status/coverage; it grants no evidence.
    if(!success.has(result.status))return result;
    return {...result,sourceStatus:result.status,status:'ready'};
  }
  async function prepareBatch({inputs=[],principal:actor,signal}={}) {
    cleanupBatch();
    if(actor!==principal||!config?.enabled||signal?.aborted)fail(signal?.aborted?'aborted':'forbidden');
    if(!allowedSourceIds.length||allowedSourceIds.length>500||!allowedSourceIds.every(validUuid)
      ||!calendarConfig.configured||!calendarClient.configured)fail('not_configured');
    if(stagedEnabled&&(!memberConfig.configured||!validUuid(memberSourceId)||!staticSourceIds.includes(memberSourceId)))fail('not_configured');
    if(stagedEnabled){const memberAccess=await memberClient.preflight({signal});if(memberAccess?.status!=='ready'||memberAccess.calendarId!==memberClient.calendarId||!['owner','writer'].includes(memberAccess.accessRole))fail('preflight_failed');}
    const access=await calendarClient.preflight({signal});
    if(access?.status!=='ready'||access.calendarId!==principal.calendarId||!['writer','owner'].includes(access.accessRole))fail('preflight_failed');
    const clock=new Date(now()).getTime();
    const context={status:'ready',calendarId:principal.calendarId,
      calendarMap:{configured:calendarMapConfigured,...(calendarMapConfigured?{sourceId:calendarSourceId}:{}),
        notice:'Calendar map provenance requires its configured source UUID. Do not borrow an input source UUID.'},
      ...(stagedEnabled?{reconciliationWindow:{timeMin:new Date(clock-86400000).toISOString(),timeMax:new Date(clock+8*86400000).toISOString(),
        notice:'Deterministic API projection window; no model-driven rolling scan is required.'}}:{})};
    if(signal?.aborted)fail('aborted');
    if(!Array.isArray(inputs)||inputs.length>20)fail('invalid_batch');
    if(inputs.some(row=>!validUuid(row?.uuid)||!plainObject(row.raw_response))
      ||inputs.length&&!await authorizeEvents({events:inputs.map(row=>row.raw_response),principal,signal}))fail('forbidden');
    for(const row of inputs) {
      batchInputs.set(row.uuid,structuredClone(row.raw_response));
      const event=row.raw_response,p=event.payload;
      if(event.source==='discord'&&['message_created','message_updated'].includes(event.event_type)&&p?.id===event.event_id&&typeof p.content==='string')
        rememberDiscord({sourceId:event.source_id,guildId:p.guild_id,channelId:p.channel_id,messageId:p.id,authorId:p.author?.id,content:p.content,
          url:`https://discord.com/channels/${p.guild_id}/${p.channel_id}/${p.id}`});
    }
    prepared=true;
    preparedContext=context;
    if(stagedEnabled)context.memberPlans={configured:true,calendarId:memberClient.calendarId,sourceId:memberSourceId};
    return context;
  }

  async function authorizeEvent({event,principal:actor,signal}={}) {
    return authorizeEvents({events:[event],principal:actor,signal});
  }
  // All sharing is local to ONE authorization boundary. A later round/tool/action
  // always obtains fresh policy, catalogue and live metadata, including rechecks.
  async function authorizeEvents({events,principal:actor,signal}={}) {
    if(actor!==principal||signal?.aborted||!Array.isArray(events)||!events.length||events.length>20)return false;
    const bindings=new Map();
    for(const event of events) {
      if(!validUuid(event?.source_id))return false;
      if(event.source==='gmail') {
        if(!googleAccess||event.source_id!==gmailSourceId||!['email_received','email_received_metadata'].includes(event.event_type))return false;
        continue;
      }
      if(event.source!=='discord'||!discordConfig.configured||!['message_created','message_updated','message_deleted','messages_deleted'].includes(event.event_type))return false;
      const channelId=event.payload?.channel_id;
      if(!snowflake(channelId)||event.payload.guild_id!==discordConfig.guildId)return false;
      if(bindings.has(channelId)&&bindings.get(channelId)!==event.source_id)return false;
      bindings.set(channelId,event.source_id);
    }
    if(!bindings.size)return !signal?.aborted;
    try {
      // Same current catalogue and live ancestry checks as the collector and
      // live retrieval. Grant only exact existing source/channel bindings; this
      // also supports trusted enqueue calls before the first processing tick.
      const [policyResult,catalogue,metadata]=await Promise.all([
        discordStore.getPolicy({guildId:discordConfig.guildId,signal}),discordStore.listSyncChannels({signal}),
        discordClient.getGuildChannels({signal})]);
      const policy=policyResult?.policy?structuredClone(policyResult.policy):null;
      const validCatalogue=result=>result?.status==='ready'&&Array.isArray(result.channels)&&result.channels.length<=10000
        &&[...bindings].every(([channelId,sourceId])=>result.channels.some(row=>row.enabled===true&&row.guildId===discordConfig.guildId&&row.channelId===channelId&&row.sourceId===sourceId));
      if(signal?.aborted||policyResult?.status!=='ready'||policy?.guildId!==discordConfig.guildId||!Number.isSafeInteger(policy.revision)||policy.revision<1
        ||policy.paused||policy.discoveryEnabled===false||!Array.isArray(policy.excludedCategoryIds)||!Array.isArray(policy.excludedChannelIds)
        ||![...policy.excludedCategoryIds,...policy.excludedChannelIds].every(snowflake)||!validCatalogue(catalogue))return false;
      const validMetadata=(row,expected)=>row?.id===expected&&snowflake(row.id)&&row.guild_id===discordConfig.guildId
        &&Number.isInteger(row.type)&&Object.hasOwn(row,'parent_id')&&(row.parent_id===null||snowflake(row.parent_id));
      if(!Array.isArray(metadata)||metadata.length>500||metadata.some(row=>!validMetadata(row,row?.id))
        ||new Set(metadata.map(row=>row.id)).size!==metadata.length)return false;
      const channels=new Map(metadata.map(row=>[row.id,row])),checked=new Map();
      const readChannel=async(channelId,allowContainer=false)=>{
        if(checked.has(channelId))return checked.get(channelId);
        if(signal?.aborted)return null;
        const channel=await discordClient.getChannel({channelId,allowContainer,signal});
        if(!validMetadata(channel,channelId))return null;
        const listed=channels.get(channelId);
        if(listed&&(listed.type!==channel.type||listed.parent_id!==channel.parent_id))return null;
        channels.set(channelId,channel);checked.set(channelId,channel);
        return channel;
      };
      for(const channelId of bindings.keys()) {
        const channel=await readChannel(channelId);
        if(!channel||![0,5,10,11,12].includes(channel.type))return false;
        if([10,11,12].includes(channel.type)) {
          const parent=await readChannel(channel.parent_id,true);
          if(!parent||![0,5,15,16].includes(parent.type))return false;
        }
        if(isDiscordChannelExcluded({channel,channels,policy}))return false;
      }
      const [latest,rows]=await Promise.all([discordStore.getPolicy({guildId:discordConfig.guildId,signal}),discordStore.listSyncChannels({signal})]);
      if(signal?.aborted||latest?.status!=='ready'||canonicalJson(latest.policy)!==canonicalJson(policy)||!validCatalogue(rows))return false;
      setDiscordSourceIds([...allowedSourceIds.filter(id=>!staticSourceIds.includes(id)),...bindings.values()]);
      currentDiscordSourceIds=[...new Set([...currentDiscordSourceIds,...bindings.values()])];
      return true;
    }catch{return false;}
  }

  const expandedContext=context=>{
    if(!stagedEnabled||!Array.isArray(context?.inputIds))return context;
    return {...context,inputIds:[...new Set(context.inputIds.flatMap(id=>taskEvidence.get(id)?.map(row=>row.uuid)||[id]))]};
  };
  const taskEvidence=new Map();
  const requirePrepared=context=>prepared&&context?.principal===principal&&!context.signal?.aborted;
  async function supportingSource(sourceId,sourceUrl,context,{allowCalendar=true,sourceRecordId}={}) {
    context=expandedContext(context);
    if(!requirePrepared(context)||!Array.isArray(context.inputIds)||!context.inputIds.length
      ||!context.inputIds.every(id=>batchInputs.has(id)))return false;
    const scope=[...observed.values()].find(row=>row.sourceId===sourceId&&row.sourceUrl===sourceUrl);
    if(scope&&['discord','gmail','calendar'].includes(scope.provider)
      &&(scope.provider!=='calendar'||allowCalendar&&(sourceRecordId===undefined||sourceRecordId===scope.eventId))
      &&await mapSourceAuthorizer({principal,sourceId,sourceUrl,signal:context.signal}))return true;
    for(const id of context.inputIds) {
      const event=batchInputs.get(id),p=event.payload;
      if(event.source_id!==sourceId)continue;
      // Only original non-deletion inputs can support new facts. Metadata-only
      // email requires its body-read before it can support a map change.
      const expected=event.source==='discord'&&['message_created','message_updated'].includes(event.event_type)
        &&snowflake(p?.id)&&p.id===event.event_id&&snowflake(p?.channel_id)&&p.guild_id===discordConfig.guildId
        ?`https://discord.com/channels/${p.guild_id}/${p.channel_id}/${p.id}`
        :event.source==='gmail'&&event.event_type==='email_received'&&typeof p?.id==='string'&&p.id===event.event_id
          ?`https://mail.google.com/mail/u/0/#all/${p.id}`:null;
      if(expected===sourceUrl&&await authorizeEvent({event,principal,signal:context.signal})
        &&await mapSourceAuthorizer({principal,sourceId,sourceUrl,signal:context.signal}))return true;
      if(event.source==='gmail'&&event.event_type==='email_received_metadata'&&p?.id===event.event_id&&event.source_id===gmailSourceId
        &&observed.get(`gmail:${p?.id}`)?.sourceUrl===sourceUrl
        &&await authorizeEvent({event,principal,signal:context.signal})
        &&await mapSourceAuthorizer({principal,sourceId,sourceUrl,signal:context.signal}))return true;
    }
    return false;
  }
  function providerIdentity(sourceId,sourceUrl,context) {
    context=expandedContext(context);
    const scope=[...observed.values()].find(row=>row.sourceId===sourceId&&row.sourceUrl===sourceUrl);
    if(scope?.provider==='discord'&&snowflake(scope.authorId))return {provider:'discord',providerUserId:scope.authorId};
    if(scope?.provider==='gmail'&&scope.sender)return {provider:'email',providerUserId:scope.sender};
    for(const id of context.inputIds||[]) {
      const event=batchInputs.get(id),p=event?.payload;
      if(event?.source_id!==sourceId)continue;
      if(event.source==='discord'&&['message_created','message_updated'].includes(event.event_type)
        &&p?.id===event.event_id&&sourceUrl===`https://discord.com/channels/${p.guild_id}/${p.channel_id}/${p.id}`&&snowflake(p.author?.id))
        return {provider:'discord',providerUserId:p.author.id};
      if(event.source==='gmail'&&event.event_type==='email_received'&&p?.id===event.event_id
        &&sourceUrl===`https://mail.google.com/mail/u/0/#all/${p.id}`) {
        const from=Array.isArray(p.payload?.headers)?p.payload.headers.filter(header=>typeof header?.name==='string'&&header.name.toLowerCase()==='from'):[];
        const address=from.length===1?sourceMailbox(from[0].value):null;
        if(address)return {provider:'email',providerUserId:address};
      }
    }
    return null;
  }
  function linkedParticipant(person,context) {
    const receipt=linkedIdentities.get(person.person_id)?.get(evidenceKey(person.source_id,person.source_url));
    const identity=providerIdentity(person.source_id,person.source_url,context);
    return receipt&&identity&&canonicalJson(receipt)===canonicalJson(identity);
  }
  const sameInstant=(a,b)=>typeof a==='string'&&typeof b==='string'&&Number.isFinite(Date.parse(a))&&Date.parse(a)===Date.parse(b);
  function matchesCalendarProjection(event,original,buildings=[]) {
    if(!original||event.source_id!==calendarSourceId||event.source_record_id!==original.eventId||event.source_url!==original.url
      ||event.kind!=='scheduled_event'||event.status!==(original.status||'confirmed'))return false;
    // Sparse cancellation tombstones establish cancellation, not replacement
    // titles/times. Existing authorized snapshots preserve those facts.
    if(original.status==='cancelled'&&(!original.start||!original.end))return typeof event.id==='string';
    if(event.name!==original.title||event.time_zone!==(original.start?.timeZone||config.timezone)
      ||!sameInstant(event.reported_at,original.updatedAt||original.createdAt))return false;
    const location=typeof original.location==='string'?original.location.trim():'';
    if(location) {
      const exact=[...fixedBuildings].filter(([id,name])=>[id,name].some(value=>value.toLowerCase()===location.toLowerCase()));
      if(exact.length?!exact.some(([id])=>buildings.some(row=>row.building_id===id)):
        !event.notes?.includes(location)&&!buildings.some(row=>row.location_notes?.includes(location)))return false;
    }
    if(original.start?.date&&original.end?.date)return event.time_kind==='all_day'&&event.starts_on===original.start.date&&event.ends_on===original.end.date;
    return event.time_kind==='timed'&&sameInstant(event.starts_at,original.start?.dateTime)&&sameInstant(event.ends_at,original.end?.dateTime);
  }
  const calendarWindowKey=args=>canonicalJson([Date.parse(args.timeMin),Date.parse(args.timeMax),args.query??null,args.resultMode||'full',args.limit??5]);
  async function validateCompletion({principal:actor,signal}={}) {
    return prepared&&actor===principal&&!signal?.aborted?{status:'ready'}:{status:'pending',reason:'batch_not_prepared'};
  }
  const stripManaged=event=>Object.fromEntries(Object.entries(event).filter(([key,value])=>!['created_at','updated_at'].includes(key)&&value!==null));
  const stripRelation=row=>Object.fromEntries(Object.entries(row).filter(([key,value])=>!['event_id','created_at','updated_at'].includes(key)&&value!==null));
  async function prepareMapArguments(args,context) {
    context=expandedContext(context);
    if(!requirePrepared(context))return args;
    const observedCalendar=args.event?.source_id===calendarSourceId?calendarOccurrences.get(args.event?.source_record_id):null;
    if(calendarMapConfigured&&observedCalendar
      &&Array.isArray(context.inputIds)&&context.inputIds.length&&context.inputIds.every(id=>batchInputs.has(id))
      &&await mapSourceAuthorizer({principal,sourceId:calendarSourceId,sourceUrl:observedCalendar.url,signal:context.signal})) {
      const prepared=structuredClone(args);prepared.event.source_url=observedCalendar.url;
      // Calendar owns this fact timestamp; the map's updated_at is only the
      // optimistic-write token. Sparse cancellations preserve prior known facts.
      const reportedAt=observedCalendar.updatedAt||observedCalendar.createdAt;
      if(!(observedCalendar.status==='cancelled'&&(!observedCalendar.start||!observedCalendar.end))
        &&typeof reportedAt==='string'&&Number.isFinite(Date.parse(reportedAt)))prepared.event.reported_at=reportedAt;
      if(Object.hasOwn(prepared.event,'url'))prepared.event.url=observedCalendar.url;
      for(const fact of [observedCalendar.location,observedCalendar.managed?observedCalendar.sourceUrl:null])
        if(typeof fact==='string'&&fact&&!prepared.event.notes?.includes(fact))prepared.event.notes=[prepared.event.notes||'',fact].filter(Boolean).join('\n');
      return prepared;
    }
    return args;
  }
  async function writeMap(args,context) {
    context=expandedContext(context);
    if(stagedEnabled)return writeStagedMap(args,context);
    args=await prepareMapArguments(args,context);
    let previous;
    if(args.event?.id) {
      const current=await mapEventService.read({eventId:args.event.id,principal,signal:context.signal});
      if(!['ok','ready'].includes(current?.status))return current;
      previous={event:current.events?.find(row=>row.id===args.event.id),people:current.event_people||[],buildings:current.event_buildings||[]};
      if(!previous.event)return {status:'forbidden_source'};
      if(previous.event.updated_at!==args.expectedUpdatedAt)return {status:'conflict'};
    }
    const eventUnchanged=previous&&canonicalJson(stripManaged(previous.event))===canonicalJson(args.event);
    const orderedBuildings=rows=>rows.map(stripRelation).sort((a,b)=>a.building_id.localeCompare(b.building_id));
    const buildingsUnchanged=previous&&canonicalJson(orderedBuildings(previous.buildings))===canonicalJson(orderedBuildings(args.buildings||[]));
    if(args.event?.source_id===calendarSourceId&&(!catalogueRead||pendingCalendarReads.has(args.event?.source_record_id)))return {status:'forbidden_source'};
    const calendarOriginal=args.event?.source_id===calendarSourceId?calendarOccurrences.get(args.event?.source_record_id):null;
    if(calendarOriginal?.status==='cancelled'&&(!calendarOriginal.start||!calendarOriginal.end)) {
      const preserve=row=>Object.fromEntries(Object.entries(stripManaged(row)).filter(([key])=>key!=='status'));
      if(!previous||!buildingsUnchanged||canonicalJson(preserve(previous.event))!==canonicalJson(preserve(args.event)))return {status:'forbidden_source'};
    }
    if((!eventUnchanged||!buildingsUnchanged)&&!await supportingSource(args.event?.source_id,args.event?.source_url,context,{sourceRecordId:args.event?.source_record_id}))return {status:'forbidden_source'};
    let supportedChange=!eventUnchanged;
    for(const person of args.people||[]) {
      const prior=previous?.people.find(row=>row.person_id===person.person_id);
      if(prior&&canonicalJson(stripRelation(prior))===canonicalJson(person))continue;
      if(!await supportingSource(person.source_id,person.source_url,context,{allowCalendar:false})||!linkedParticipant(person,context))return {status:'forbidden_source'};
      supportedChange=true;
    }
    // Removing existing participants is unsupported by merely omitting them.
    // Retain rows and mark explicit declines/end overrides with fresh evidence.
    if(previous?.people.some(row=>!args.people.some(person=>person.person_id===row.person_id)))return {status:'forbidden_source'};
    if(!supportedChange&&!await supportingSource(args.event?.source_id,args.event?.source_url,context,{sourceRecordId:args.event?.source_record_id}))return {status:'forbidden_source'};
    if(args.event?.source_id===calendarSourceId&&calendarOccurrences.has(args.event.source_record_id)
      &&!matchesCalendarProjection(args.event,calendarOccurrences.get(args.event.source_record_id),args.buildings))return {status:'forbidden_source'};
    const result=await mapTools.execute({name:'upsert_map_event',arguments:args,principal,signal:context.signal});
    return result;
  }
  async function freshParticipation(participation,signal) {
    if(!participation||!validUuid(participation.sourceId)||!allowedSourceIds.includes(participation.sourceId))return null;
    let original;
    if(participation.provider==='discord') {
      const match=/^https:\/\/discord.com\/channels\/([0-9]+)\/([0-9]+)\/([0-9]+)$/.exec(participation.sourceUrl||'');
      if(!match||match[1]!==discordConfig.guildId)return null;
      const result=await liveDiscordService.readMessages({principal,channelId:match[2],messageId:match[3],context:false,limit:1,signal});
      const source=result?.sources?.find(row=>row.sourceId===participation.sourceId&&row.url===participation.sourceUrl&&row.authorId===participation.providerUserId);
      if(result?.status!=='ready'||result.coverage?.textTruncated!==false||!source)return null;
      original={content:source.content??source.excerpt,reportedAt:source.sourceUpdatedAt||source.createdAt};
    } else if(participation.provider==='email'&&participation.sourceId===gmailSourceId) {
      const match=/^https:\/\/mail.google.com\/mail\/u\/0\/#all\/([a-fA-F0-9]+)$/.exec(participation.sourceUrl||'');
      if(!match)return null;
      const result=await googleClient.readGmail({messageId:match[1],signal});
      const source=result?.sources?.find(row=>row.url===participation.sourceUrl&&sourceMailbox(row.from)===participation.providerUserId.toLowerCase());
      if(result?.status!=='ready'||!source)return null;
      original={content:source.excerpt||source.text||'',reportedAt:source.date?new Date(source.date).toISOString():null};
    }
    if(!original||typeof original.content!=='string'||!original.content.trim()||!Number.isFinite(Date.parse(original.reportedAt)))return null;
    const lookup=await mapEventService.lookup({principal,provider:participation.provider,providerUserId:participation.providerUserId,
      sourceId:participation.sourceId,sourceUrl:participation.sourceUrl,signal});
    return ['ok','ready'].includes(lookup.status)&&lookup.person?.id===participation.personId?original:null;
  }
  async function validateMemberParticipation({principal:actor,participation,signal}) {
    if(actor!==principal)return false;
    const original=await freshParticipation(participation,signal);
    return Boolean(original&&Date.parse(original.reportedAt)===Date.parse(participation.reportedAt));
  }
  async function loadBuildingAliases({signal}) {
    const origin=new URL(env.SUPABASE_URL).origin,key=env.SUPABASE_SERVICE_ROLE_KEY;
    const response=await fetchImpl(`${origin}/rest/v1/rpc/map_read_building_aliases`,{method:'POST',redirect:'error',signal,
      headers:{apikey:key,authorization:`Bearer ${key}`,'content-type':'application/json'},body:'{}'});
    if(!response.ok)throw Error('building_catalogue_unavailable');
    const rows=await response.json();
    if(!Array.isArray(rows)||rows.length>100)throw Error('building_catalogue_unavailable');
    return rows;
  }
  async function syncAfterMutation(kind,eventId,signal) {
    const target=targets.find(row=>row.kind===kind);
    const result=await target.client.readEvent({eventId,principal:{...principal,calendarId:target.client.calendarId},signal});
    const event=result?.events?.find(row=>row.eventId===eventId);
    if(result.status!=='ready'||!event?.start||!event.end)return {status:'partial',reason:'exact_read_required',eventId};
    const from=event.start.dateTime||`${event.start.date}T00:00:00Z`,to=event.end.dateTime||`${event.end.date}T00:00:00Z`;
    const response=await synchronizer.sync({principal,window:{timeMin:from,timeMax:to},signal,
      onApiResult:entry=>staged.pipeline.recordApiResult(entry)});
    return fragments.bound({...response,status:'ready',sourceStatus:response.status});
  }
  async function writeStagedMap(args,context) {
    if(!requirePrepared(context))return {status:'forbidden'};
    const target=targets.find(row=>row.sourceId===args.event?.source_id);
    // Only existing Calendar projections may be amended by the follow-up agent.
    // All personal activity creation must travel through Member Plans + API sync.
    if(!target||!args.event.id)return {status:'forbidden_source'};
    const result=await target.client.readEvent({eventId:args.event.source_record_id,principal:{...principal,calendarId:target.client.calendarId},signal:context.signal});
    const original=result?.status==='ready'&&result.events?.find(row=>row.eventId===args.event.source_record_id);
    if(!original||original.url!==args.event.source_url
      ||args.event.kind!==(target.kind==='club'?'scheduled_event':original.memberPlan?.activityKind)
      ||args.event.status!==(original.status||'confirmed'))return {status:'forbidden_source'};
    if(original.start?.date) {
      if(args.event.time_kind!=='all_day'||args.event.starts_on!==original.start.date||args.event.ends_on!==original.end?.date)return {status:'forbidden_source'};
    } else if(args.event.time_kind!=='timed'||!sameInstant(args.event.starts_at,original.start?.dateTime)||!sameInstant(args.event.ends_at,original.end?.dateTime))return {status:'forbidden_source'};
    const previous=await mapEventService.read({eventId:args.event.id,principal,signal:context.signal});
    const current=previous?.events?.find(row=>row.id===args.event.id);
    if(!['ok','ready'].includes(previous?.status)||!current||current.source_id!==target.sourceId||current.source_record_id!==original.eventId)return {status:'forbidden_source'};
    if(args.event.name!==calendarMapName(original,current))return {status:'forbidden_source'};
    if(current.updated_at!==args.expectedUpdatedAt)return {status:'conflict'};
    const protectedFacts=['id','name','notes','kind','type_id','status','time_kind','starts_at','ends_at','starts_on','ends_on','time_zone','source_id','source_url','source_record_id','url','reported_at'];
    if(protectedFacts.some(key=>canonicalJson(current[key]??null)!==canonicalJson(args.event[key]??null)))return {status:'forbidden_source'};
    for(const person of args.people||[]) {
      const prior=previous.event_people.find(row=>row.person_id===person.person_id);
      if(prior&&canonicalJson(stripRelation(prior))===canonicalJson(person))continue;
      if(!await supportingSource(person.source_id,person.source_url,context,{allowCalendar:false})||!linkedParticipant(person,context))return {status:'forbidden_source'};
    }
    if(previous.event_people.some(row=>!args.people?.some(person=>person.person_id===row.person_id)))return {status:'forbidden_source'};
    return mapTools.execute({name:'upsert_map_event',arguments:args,principal,signal:context.signal});
  }
  function buildMemberTools(memberTools) {
    const str=maxLength=>({type:'string',minLength:1,maxLength});
    const boundary={type:'object',additionalProperties:false,properties:{date:str(10),dateTime:str(40),timeZone:str(100)},required:[]};
    const source={sourceKey:{...str(615),description:'Server derives the exact original source key from sourceUrl; omit when uncertain.'},sourceUrl:{...str(1200),description:'Exact original Discord/Gmail URL already read in this cycle.'},sourceId:{...str(36),description:'Original message source UUID, never Member Plans calendar UUID. Server derives it from the exact URL and successful identity receipt; omit.'},personId:{...str(36),description:'Exact person UUID returned by lookup_map_person for this original speaker/source.'}};
    async function prepareMemberArguments(args,context) {
      if(!requirePrepared(context))return args;
      const matches=[];
      for(const [key,identity] of linkedIdentities.get(args.personId)||[]) {
        const [sourceId,sourceUrl]=JSON.parse(key);
        if(sourceUrl!==args.sourceUrl||!await supportingSource(sourceId,sourceUrl,context,{allowCalendar:false}))continue;
        const current=providerIdentity(sourceId,sourceUrl,context);
        if(current&&canonicalJson(current)===canonicalJson(identity))matches.push({sourceId,identity});
      }
      if(matches.length!==1)return args;
      const original=new URL(args.sourceUrl),match=/^\/channels\/([0-9]+)\/([0-9]+)\/([0-9]+)$/.exec(original.pathname);
      const sourceKey=match?`discord:${match[1]}:${match[2]}:${match[3]}`:matches[0].identity.provider==='email'?`gmail:${original.hash.slice(5)}`:null;
      return sourceKey?{...args,sourceId:matches[0].sourceId,sourceKey}:args;
    }
    const definitions=[
      {name:'list_member_plans',readOnly:true,phases:['initial','followup'],description:'Read the separately pinned Member Plans calendar. Use actual returned event IDs; no arbitrary calendar target.',parameters:{type:'object',additionalProperties:false,properties:{timeMin:str(40),timeMax:str(40)},required:['timeMin','timeMax']}},
      {name:'read_member_plan',readOnly:true,phases:['initial','followup'],description:'Read one exact Member Plans event by returned ID.',parameters:{type:'object',additionalProperties:false,properties:{eventId:str(1024)},required:['eventId']}},
      {name:'upsert_member_plan',idempotent:true,phases:['initial','followup'],description:'Create/update an explicit personal plan or current presence on Member Plans. First read the exact current original and lookup_map_person for its actual author/sender. personId must match that receipt. Server binds source UUID/key from exact original URL and lookup; omit sourceId/sourceKey. Presence defaults original report time through two hours later; personal plans need supported start/end. No map-only events, invitations or attendees.',parameters:{type:'object',additionalProperties:false,properties:{...source,title:str(200),description:{type:'string',maxLength:3000},location:{type:'string',maxLength:500},activityKind:{type:'string',enum:['presence','personal_plan']},typeId:{type:'string',enum:['study','meeting','event','social','other']},label:{type:'string',maxLength:200},start:boundary,end:boundary},required:['sourceUrl','personId','title','activityKind']}},
      {name:'cancel_member_plan',idempotent:true,phases:['initial','followup'],description:'Cancel only the same source-owned Member Plans activity with explicit current original cancellation evidence; never cancel from absence or an RSVP decline. Server binds sourceId/sourceKey from original URL and successful identity receipt.',parameters:{type:'object',additionalProperties:false,properties:source,required:['sourceUrl','personId']}},
    ];
    return definitions.map(tool=>({...tool,...(!tool.readOnly?{prepareArguments:prepareMemberArguments}:{}),execute:async(args,context)=>{
      if(!requirePrepared(context))return {status:'forbidden'};
      if(tool.readOnly) {
        const options={...args,principal:{...principal,calendarId:memberClient.calendarId},signal:context.signal};
        const result=await (tool.name==='list_member_plans'?memberClient.listEventsWindow(options):memberClient.readEvent(options));
        if(['ready','partial'].includes(result.status))for(const event of result.events||[])observed.set(`membercalendar:${event.eventId}`,{provider:'calendar',sourceId:memberSourceId,sourceUrl:event.url,eventId:event.eventId});
        return fragments.bound(result);
      }
      args=await prepareMemberArguments(args,context);
      if(!await supportingSource(args.sourceId,args.sourceUrl,context,{allowCalendar:false}))return {status:'forbidden_source'};
      const identity=providerIdentity(args.sourceId,args.sourceUrl,context);
      const linked=linkedIdentities.get(args.personId)?.get(evidenceKey(args.sourceId,args.sourceUrl));
      if(!identity||!linked||canonicalJson(identity)!==canonicalJson(linked))return {status:'forbidden_source'};
      const participation={sourceId:args.sourceId,sourceUrl:args.sourceUrl,provider:identity.provider,providerUserId:identity.providerUserId,personId:args.personId,reportedAt:'',label:args.label||''};
      const original=await freshParticipation(participation,context.signal);
      if(!original)return {status:'forbidden_source'};
      participation.reportedAt=original.reportedAt;
      const cancel=tool.name==='cancel_member_plan';
      if(cancel&&!/\b(?:cancel(?:led|ed)?|no longer|left|leaving|won't|will not)\b/i.test(original.content))return {status:'forbidden_source'};
      if(!cancel&&!/\b(?:i|i'm|i’ll|i'll|we|we're|my)\b/i.test(original.content))return {status:'forbidden_source'};
      const clean=Object.fromEntries(Object.entries(args).filter(([key])=>!['sourceId','personId','label'].includes(key)));
      const result=await (cancel?memberTools.cancel(clean,{principal,signal:context.signal,receipt:participation}):memberTools.upsert(clean,{principal,signal:context.signal,receipt:participation}));
      if(result.status==='ready'&&typeof result.eventId==='string'){mutatedCalendarIds.get('member').add(result.eventId);
        if(staged?.phase==='followup')result.followupSync=await syncAfterMutation('member',result.eventId,context.signal);}
      return fragments.bound(result);
    }}));
  }
  const tools=[
    ...GOOGLE_TOOLS.map(tool=>({...tool,readOnly:true,
      execute:async(args,context)=>{
        if(!requirePrepared(context)||!googleAccess)return {status:'forbidden'};
        const result=normalize(await executeGoogleTool({name:tool.name,arguments:args,principal,client:googleClient,signal:context.signal}));
        if(tool.name==='read_gmail') {
          // A failed/stale reread must not leave an earlier body grant usable.
          observed.delete(`gmail:${args.messageId}`);
          const index=calendarSources.findIndex(row=>row.provider==='gmail'&&row.messageId===args.messageId);
          if(index>=0)calendarSources.splice(index,1);
          if(result.status==='ready')for(const source of result.sources||[]) {
            if(source.externalId!==args.messageId)continue;
            const scope=await observedGmail(source,context);
            if(!scope)continue;
            observed.set(scope.sourceKey,scope);
            calendarSources.push(Object.freeze({provider:'gmail',sourceId:gmailSourceId,messageId:scope.messageId}));
          }
        }
        return fragments.bound(result);
      }})),
    ...discordTools.tools.map(tool=>({...tool,readOnly:true,execute:async(args,context)=>{
      if(!requirePrepared(context))return {status:'forbidden'};
      const result=normalize(await discordTools.execute({name:tool.name,arguments:args,principal,signal:context.signal,timeContext:{now:now().toISOString(),timeZone:config.timezone}}));
      // Only returned originals can support follow-up facts, not catalogue
      // metadata or model-supplied URLs. Recheck current live access on use.
      if(result.status==='ready'&&tool.name!=='list_discord_channels')for(const source of result.sources||[])
        if(source.kind==='discord'&&source.retrieval==='live'&&source.guildId===discordConfig.guildId
          &&snowflake(source.channelId)&&snowflake(source.messageId)&&validUuid(source.sourceId)
          &&allowedSourceIds.includes(source.sourceId)
          &&source.url===`https://discord.com/channels/${source.guildId}/${source.channelId}/${source.messageId}`)
          rememberDiscord(source);
      return fragments.bound(result);
    }})),
    ...calendarTools.tools.map(tool=>({...tool,execute:async(args,context)=>{
      if(!requirePrepared(context))return {status:'forbidden'};
      if(tool.readOnly!==true) {
        const scope=observed.get(args.sourceKey);
        if(!scope||scope.sourceUrl!==args.sourceUrl)return {status:'forbidden_source'};
        if(!['discord','gmail'].includes(scope.provider)
          ||!await supportingSource(scope.sourceId,scope.sourceUrl,context,{allowCalendar:false})
          ||!discordCalendarIntent(scope.content,{cancel:tool.name==='cancel_calendar_event'}))return {status:'forbidden_source'};
        if(scope.provider==='discord') {
          const latest=await liveDiscordService.readMessages({principal,channelId:scope.channelId,messageId:scope.messageId,context:false,limit:1,signal:context.signal});
          const original=latest?.sources?.find(row=>row.sourceId===scope.sourceId&&row.url===scope.sourceUrl&&row.guildId===scope.guildId&&row.channelId===scope.channelId&&row.messageId===scope.messageId);
          if(latest?.status!=='ready'||latest.coverage?.textTruncated!==false||!original||(original.content??original.excerpt)!==scope.content
            ||scope.authorId&&original.authorId!==scope.authorId)return {status:'forbidden_source'};
        } else {
          const latest=await googleClient.readGmail({messageId:scope.messageId,signal:context.signal});
          const original=latest?.status==='ready'&&latest.sources?.find(source=>source.externalId===scope.messageId&&source.url===scope.sourceUrl);
          const current=original&&await observedGmail(original,context);
          if(!current||current.sender!==scope.sender||current.signature!==scope.signature)return {status:'forbidden_source'};
        }
        if(tool.name==='upsert_calendar_event') {
          if(/\b(?:rescheduled|moved|updated|correction)\b/i.test(scope.content)) {
            let existing=[...knownCalendarEvents.values()].find(event=>event.sourceUrl===scope.sourceUrl&&event.managed===true);
            if(!existing) {
              const current=await calendarClient.readEvent({eventId:calendarEventId(principal.calendarId,args.sourceKey),principal,signal:context.signal});
              existing=current?.status==='ready'&&current.events?.find(event=>event.sourceUrl===scope.sourceUrl&&event.managed===true);
            }
            if(!existing)return {status:'conflict'};
          }
          const start=Date.parse(args.start?.dateTime||resolveDateBoundary(args.start?.date,{timeZone:config.timezone,now:now().toISOString()}));
          if(![...calendarWindows.values()].some(window=>window.complete&&window.query===undefined&&window.resultMode==='full'&&start>=window.from&&start<window.to))return {status:'forbidden_source'};
          // A separately known event cannot be overwritten or duplicated by
          // guessing a new source identity from a title/date or linked board.
          if([...knownCalendarEvents.values()].some(event=>event.sourceUrl!==scope.sourceUrl&&(
            event.sourceUrl&&scope.content.includes(event.sourceUrl)||event.title?.trim().toLowerCase()===args.title?.trim().toLowerCase()
            &&sameInstant(event.start?.dateTime||event.start?.date,args.start?.dateTime||args.start?.date))))return {status:'conflict'};
        }
      }
      const result=normalize(await calendarTools.execute({name:tool.name,arguments:args,principal,signal:context.signal}));
      if(result.status==='ready'&&calendarMapConfigured) {
        if(tool.readOnly!==true&&typeof result.eventId==='string') {
          pendingCalendarReads.add(result.eventId);
          if(stagedEnabled)mutatedCalendarIds.get('club').add(result.eventId);
        }
      }
      if(['ready','partial'].includes(result.status)&&tool.name==='list_calendar_events') {
        const from=Date.parse(args.timeMin),to=Date.parse(args.timeMax);
        calendarWindows.set(calendarWindowKey(args),{from,to,query:args.query,resultMode:args.resultMode||'full',
          complete:result.status==='ready'&&result.coverage?.complete===true});
      }
      if(['ready','partial'].includes(result.status)&&tool.readOnly===true)for(const event of result.events||[])if(typeof event?.eventId==='string'&&(!(tool.name==='list_calendar_events'&&args.resultMode==='identities')||!knownCalendarEvents.has(event.eventId)))knownCalendarEvents.set(event.eventId,structuredClone(event));
      if(['ready','partial'].includes(result.status)&&tool.readOnly===true&&calendarMapConfigured) {
        result.sources=[];
        for(const event of result.events||[]) {
          if(typeof event.eventId!=='string'||!/^[a-zA-Z0-9_-]{5,200}$/.test(event.eventId))continue;
          const sourceUrl=`https://calendar.google.com/calendar/event?eid=${Buffer.from(`${event.eventId} ${principal.calendarId}`).toString('base64url')}`;
          if(event.url!==sourceUrl)continue;
          // Identity-only listings cannot supply full projection facts.
          if(tool.name==='list_calendar_events'&&args.resultMode==='identities')continue;
          calendarOccurrences.set(event.eventId,structuredClone(event));
          if(tool.name==='read_calendar_event'&&args.eventId===event.eventId)pendingCalendarReads.delete(event.eventId);
          observed.set(`calendar:${event.eventId}`,{provider:'calendar',sourceId:calendarSourceId,sourceUrl,eventId:event.eventId});
          result.sources.push({kind:'google_calendar',retrieval:'live',sourceId:calendarSourceId,externalId:event.eventId,url:sourceUrl});
        }
      }
      if(stagedEnabled&&staged?.phase==='followup'&&tool.readOnly!==true&&result.status==='ready'&&result.eventId)result.followupSync=await syncAfterMutation('club',result.eventId,context.signal);
      return fragments.bound(result);
    }})),
    ...mapTools.tools.map(tool=>({...tool,...(tool.name==='upsert_map_event'?{prepareArguments:prepareMapArguments}:{}),execute:async(args,context)=>{
      if(!requirePrepared(context))return {status:'forbidden'};
      let identity;
      if(tool.name==='lookup_map_person') {
        if(!await supportingSource(args.sourceId,args.sourceUrl,context,{allowCalendar:false}))return {status:'forbidden_source'};
        identity=providerIdentity(args.sourceId,args.sourceUrl,context);
        if(!identity||args.provider!==identity.provider
          ||(args.provider==='email'&&typeof args.providerUserId==='string'?args.providerUserId.toLowerCase():args.providerUserId)!==identity.providerUserId)return {status:'forbidden_source'};
      }
      const result=tool.name==='upsert_map_event'?await writeMap(args,context):await mapTools.execute({name:tool.name,arguments:args,principal,signal:context.signal});
      if(tool.name==='lookup_map_person'&&result?.status==='ready'&&personUuid(result.person?.id)) {
        const receipts=linkedIdentities.get(result.person.id)||new Map();
        receipts.set(evidenceKey(args.sourceId,args.sourceUrl),identity);linkedIdentities.set(result.person.id,receipts);
      }
      if(tool.name==='read_map_events'&&result?.status==='ready') {
        if(Array.isArray(result.buildings))catalogueRead=true;
        for(const building of result.buildings||[])if(typeof building.id==='string'&&typeof building.name==='string')fixedBuildings.set(building.id,building.name);
      }
      return fragments.bound(result);
    }})),
    {...fragments.tool,execute:(args,context)=>requirePrepared(context)?fragments.tool.execute(args,context):{status:'forbidden'}}];
  if(stagedEnabled) {
    for(const tool of tools) {
      if(['upsert_calendar_event','cancel_calendar_event'].includes(tool.name))tool.phases=['initial','followup'];
      if(tool.name==='upsert_map_event')tool.phases=['followup'];
    }
    const memberTools=createMemberPlansTools({client:memberClient,sourceId:memberSourceId,authorizeParticipation:validateMemberParticipation});
    tools.push(...buildMemberTools(memberTools));
    const taskStore=pendingTaskStore;
    const synchronize=synchronizer=d.synchronize||createCalendarMapSync({targets,mapService:mapEventService,loadBuildings:d.loadBuildings||loadBuildingAliases,authorizeParticipation:validateMemberParticipation,now});
    staged=createStagedPipeline({taskStore,principal,getAllowedSourceIds:()=>[...new Set([...currentDiscordSourceIds,
      ...[calendarSourceId,memberSourceId,...(googleAccess?[gmailSourceId]:[])].filter(id=>validUuid(id)&&staticSourceIds.includes(id))])],verifyResolution:async({task,outcome,history,signal})=>{
      if(outcome==='obsolete')return false; // Uncertain tasks expire; reads alone never prove dismissal.
      const request=task.info.request;
      if(request.operation==='source_review') {
        const originalUrls=task.info.inputs.map(({raw_response:e})=>e.source==='discord'?`https://discord.com/channels/${e.payload.guild_id}/${e.payload.channel_id}/${e.payload.id}`:`https://mail.google.com/mail/u/0/#all/${e.payload.id}`);
        const originalKeys=new Map(task.info.inputs.flatMap(({raw_response:e})=>{
          const p=e.payload;
          if(p?.id!==e.event_id)return [];
          if(e.source==='discord')return [[`https://discord.com/channels/${p.guild_id}/${p.channel_id}/${p.id}`,`discord:${p.guild_id}:${p.channel_id}:${p.id}`]];
          return e.source==='gmail'?[[`https://mail.google.com/mail/u/0/#all/${p.id}`,`gmail:${p.id}`]]:[];
        }));
        for(const row of history)if(row.kind==='tool_result'&&row.inputIds?.includes(task.uuid)&&row.result?.status==='ready') {
          const cancellationKind=row.tool==='cancel_calendar_event'?'club':row.tool==='cancel_member_plan'?'member':null;
          if(cancellationKind) {
            const target=targets.find(target=>target.kind===cancellationKind),args=row.arguments;
            if(!target||!originalUrls.includes(args?.sourceUrl)||originalKeys.get(args.sourceUrl)!==args.sourceKey
              ||request.calendarKind!==undefined&&request.calendarKind!==cancellationKind
              ||cancellationKind==='member'&&request.personId!==undefined&&args.personId!==request.personId)continue;
            const eventId=calendarEventId(target.client.calendarId,args.sourceKey);
            const receipt=projectCalendarReceipt(row.result.calendarWrite??row.result);
            const url=`https://calendar.google.com/calendar/event?eid=${Buffer.from(`${eventId} ${target.client.calendarId}`).toString('base64url')}`;
            if(!receipt||receipt.eventId!==eventId||receipt.url!==url
              ||row.result.eventId!==undefined&&row.result.eventId!==eventId
              ||row.result.url!==undefined&&row.result.url!==url
              ||request.calendarEventId!==undefined&&request.calendarEventId!==eventId)continue;
            const absent=receipt.outcome==='already_absent'&&receipt.absent===true&&receipt.eventStatus==='absent';
            const cancelled=['cancelled','reconciled','unchanged'].includes(receipt.outcome)&&receipt.eventStatus==='cancelled';
            if(!absent&&!cancelled)continue;
            const actual=await target.client.readEvent({eventId,principal:{...principal,calendarId:target.client.calendarId},signal});
            if(signal?.aborted||actual?.status!=='ready'||!Array.isArray(actual.events)||actual.coverage?.complete===false
              ||actual.partial===true||actual.possiblyTruncated===true||actual.sourceStatus==='partial')continue;
            if(absent&&actual.events.length===0)return true;
            // Sparse tombstones without the exact original source do not prove
            // that this task's source-owned cancellation was completed.
            if(cancelled&&actual.events.length===1&&actual.events[0]?.eventId===eventId
              &&actual.events[0].status==='cancelled'&&actual.events[0].sourceUrl===args.sourceUrl)return true;
            continue;
          }
          const target=targets.find(target=>row.tool==='upsert_member_plan'?target.kind==='member':row.tool==='upsert_calendar_event'?target.kind==='club':false);
          if(target&&row.result.eventId&&originalUrls.includes(row.arguments?.sourceUrl)) {
            const actual=await target.client.readEvent({eventId:row.result.eventId,principal:{...principal,calendarId:target.client.calendarId},signal});
            if(actual.status==='ready'&&actual.events?.some(event=>event.sourceUrl===row.arguments.sourceUrl))return true;
          }
          if(row.tool==='upsert_map_event'&&row.arguments?.event?.id) {
            const actual=await mapEventService.read({principal,eventId:row.arguments.event.id,signal});
            if(actual.status==='ok'&&actual.event_people?.some(person=>originalUrls.includes(person.source_url)&&row.arguments.people?.some(p=>p.person_id===person.person_id&&p.source_url===person.source_url)))return true;
          }
        }
        return false;
      }
      const target=targets.find(row=>row.kind===request?.calendarKind);
      if(!target)return false;
      if(!request.calendarEventId)return false;
      const snapshot=await mapEventService.read({principal,sourceId:target.sourceId,sourceRecordId:request.calendarEventId,signal});
      const event=snapshot?.status==='ok'&&snapshot.events?.find(row=>row.source_id===target.sourceId&&row.source_record_id===request.calendarEventId);
      if(!event)return false;
      if(request.operation==='participation')return validUuid(request.personId)&&snapshot.event_people?.some(person=>person.event_id===event.id&&person.person_id===request.personId)
        &&history.some(row=>row.kind==='tool_result'&&row.tool==='upsert_map_event'&&row.inputIds?.includes(task.uuid)
          &&row.arguments?.event?.id===event.id&&row.arguments.people?.some(person=>person.person_id===request.personId)&&row.result?.status==='ready');
      if(request.operation==='location')return snapshot.event_buildings?.some(building=>building.event_id===event.id&&(!request.buildingId||building.building_id===request.buildingId))
        &&history.some(row=>row.kind==='tool_result'&&row.tool==='upsert_map_event'&&row.arguments?.event?.id===event.id&&row.result?.status==='ready');
      return false;
    },bindTask:async(task,signal)=>{
      if(signal?.aborted)fail('aborted');
      taskEvidence.set(task.uuid,task.info.inputs);
      for(const row of task.info.inputs)batchInputs.set(row.uuid,structuredClone(row.raw_response));
    },runSync:async({signal,recordExecution})=>{
      const onApiResult=entry=>recordExecution({kind:'api_response',stage:'deterministic',...entry});
      const result=await synchronize.sync({principal,window:preparedContext.reconciliationWindow,signal,onApiResult,
        onResult:result=>recordExecution({kind:'api_result',stage:'deterministic',tool:'calendar_map_sync',result})});
      // Exact successful mutations outside the rolling window are projected too.
      for(const target of targets)for(const id of mutatedCalendarIds.get(target.kind)||[]) {
        const exact=await target.client.readEvent({eventId:id,principal:{...principal,calendarAccess:true,calendarId:target.client.calendarId},signal});
        const original=exact?.events?.find(event=>event.eventId===id);
        if(exact.status!=='ready'||!original?.start||!original.end)continue;
        const from=original.start.dateTime||new Date(`${original.start.date}T00:00:00Z`).toISOString();
        const to=original.end.dateTime||new Date(`${original.end.date}T00:00:00Z`).toISOString();
        if(Date.parse(from)>=Date.parse(preparedContext.reconciliationWindow.timeMin)&&Date.parse(to)<=Date.parse(preparedContext.reconciliationWindow.timeMax))continue;
        const extra=await createCalendarMapSync({targets:[target],mapService:mapEventService,loadBuildings:d.loadBuildings||loadBuildingAliases,authorizeParticipation:validateMemberParticipation,now})
          .sync({principal,window:{timeMin:from,timeMax:to},signal,onApiResult,onResult:result=>recordExecution({kind:'api_result',stage:'deterministic',tool:'calendar_map_sync',result})});
        result.results.push(...extra.results);result.unresolved.push(...extra.unresolved);result.complete=result.complete&&extra.complete;
      }
      result.status=result.complete?'ready':'partial';return result;
    },getEvidenceReferences:()=>[...observed.values()].filter(row=>validUuid(row.sourceId)&&row.sourceUrl).map(row=>({sourceId:row.sourceId,sourceUrl:row.sourceUrl})),fragments,now});
    const begin=staged.pipeline.beginCycle;
    staged.pipeline.beginCycle=async args=>{activeLeaseToken=args.leaseToken;await begin(args);staged.pipeline.setBatchContext(preparedContext);};
    tools.push(...staged.tools);
    return {principal,tools,authorizeEvent,authorizeEvents,resolveClaimSourceIds,prepareBatch,cleanupBatch,validateCompletion,pipeline:staged.pipeline};
  }
  return {principal,tools,authorizeEvent,authorizeEvents,resolveClaimSourceIds,prepareBatch,cleanupBatch,validateCompletion};
}
