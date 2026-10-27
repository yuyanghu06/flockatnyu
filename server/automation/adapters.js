import { promptText } from '../prompt-loader/index.js';
import {manualAuthorizationSnapshot} from './manual-authorization.js';
import {mapFactsChanged} from './map-facts.js';
import {randomUUID} from 'node:crypto';
import {readConfig} from "../shared/config.js";
import {readGoogleConfig} from '../google/config.js';
import {createGoogleClient} from '../google/client.js';
import {sourceMailbox} from '../google/mailbox.js';
import {readCalendarConfig,readMemberPlansConfig} from '../google/calendar-config.js';
import {createPendingTaskStore} from './task-store.js';
import {createStagedPipeline} from './staged-pipeline.js';
import {createCalendarMapSync,calendarMapName} from './calendar-sync.js';
import {createMemberPlansTools,validMemberParticipation} from './member-plans.js';
import {createCalendarClient,calendarEventId} from '../google/calendar-client.js';
import {projectCalendarReceipt} from '../google/calendar-receipt.js';
import {readLiveDiscordConfig} from '../discord/live-config.js';
import {createDiscordStore} from '../discord/store.js';
import {createLiveDiscordClient} from '../discord/live-client.js';
import {createLiveDiscordRetrieval} from '../discord/live-retrieval.js';
import {isDiscordChannelExcluded} from '../discord/discovery.js';
import {resolveDiscordSourceIds} from '../discord/source-scope.js';
import {createManualDiscordStore} from '../discord/manual-scope.js';
import {GOOGLE_TOOLS} from '../google/operations/google-definitions.js';
import {executeGoogleOperation as executeGoogleTool} from '../google/operations/google.js';
import {bindWorkerOperations,resetWorkerOperations} from '../operation-api/adapter.js';
import {createDiscordReadOperations as createLiveRetrievalTools} from '../discord/operations/reads.js';
import {createCalendarOperations as createCalendarTools} from '../google/operations/calendar.js';
import {createBoundedResults} from './bounded-result.js';
import {createMapOperationService as createMapTools} from '../map/operations/service.js';
import {createMapEventStore,createMapEventService,mapReadContext,timestamp} from '../map/events.js';
import {PARTICIPATION_PARAMETERS,completeParticipationSnapshot,mergeParticipationChanges,sameSavedParticipation,sameSavedParticipationSnapshot} from './participation.js';
import {withLocalTimeDisplay} from './local-time-display.js';
import {normalizeMemberPlanBoundary} from './local-clock-boundary.js';
import {createMapSourceAuthorizer} from '../map/source-access.js';
import {canonicalJson,plainObject,validUuid,validateArguments} from './validation.js';
import {resolveDateBoundary} from "../shared/time-zone.js";
const snowflake=value=>typeof value==='string'&&/^[0-9]{1,20}$/.test(value);
const personUuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const fail=code=>{throw new Error(code);};
const success=new Set(['ready','empty','partial','unsupported_content']);
const evidenceKey=(sourceId,sourceUrl)=>canonicalJson([sourceId,sourceUrl]);
export {discordCalendarIntent} from './operations/intent.js';
import {discordCalendarIntent} from './operations/intent.js';
/** Bundled server-owned adapter. Construction does no network I/O. Dependencies
 * are an explicit fixture seam; event/model data never selects implementations. */
export function createAutomationAdapters({env=process.env,config,fetchImpl=globalThis.fetch,now=()=>new Date(),dependencies={},manual}={}) {
  const d=dependencies;
  if(manual!==undefined&&(!plainObject(manual)||manual.force!==true||!Array.isArray(manual.channelIds)
    ||manual.channelIds.length>30||manual.channelIds.some(value=>!snowflake(value))
    ||new Set(manual.channelIds).size!==manual.channelIds.length))fail('invalid_request');
  const manualWhitelist=Boolean(manual?.channelIds.length);
  const stagedEnabled=env.AGENT_AUTOMATION_STAGED_ENABLED==='true';
  let workerOperations,activeLeaseToken,staged,preparedContext,synchronizer,calendarMutationVersion=0,syncCycleId;
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
  // An injected filtered service must supply its matching raw-store seam for
  // participation patches. Never substitute a different production store.
  const mapEventStore=d.mapEventStore||(d.mapEventService?null:createMapEventStore({env,fetchImpl,...(stagedEnabled?{getLeaseToken:()=>activeLeaseToken}:{})}));
  const mapEventService=d.mapEventService||createMapEventService({store:mapEventStore,authorizeSource:mapSourceAuthorizer,now});
  const mapTools=createMapTools({service:mapEventService});
  const calendarSources=[];
  const sourceBindings=new Map(targets.filter(row=>validUuid(row.sourceId)).map(row=>[row.sourceId,
    {sourceId:row.sourceId,provider:'calendar',calendarId:row.client.calendarId}]));
  if(validUuid(gmailSourceId))sourceBindings.set(gmailSourceId,{sourceId:gmailSourceId,provider:'gmail'});
  const rememberSourceBindings=rows=>{
    for(const [id,row] of sourceBindings)if(row.provider==='discord')sourceBindings.delete(id);
    for(const row of rows||[])if(row?.enabled===true&&row.guildId===discordConfig.guildId&&validUuid(row.sourceId)
      &&allowedSourceIds.includes(row.sourceId)&&snowflake(row.channelId))sourceBindings.set(row.sourceId,
        {sourceId:row.sourceId,provider:'discord',guildId:row.guildId,channelId:row.channelId});
  };
  const principal=Object.freeze({id:'update-agent',get allowedSourceIds(){return allowedSourceIds;},get mapSourceBindings(){return [...sourceBindings.values()].map(row=>({...row}));},googleAccess,
    liveDiscord:Object.freeze({mode:'local-operator',guildId:discordConfig.guildId}),
    calendarAccess:true,calendarId:calendarConfig.calendarId,calendarSources,...(stagedEnabled?{calendarTargets:targets.map(target=>({calendarId:target.client.calendarId,sourceId:target.sourceId}))}:{})});
  const fragments=createBoundedResults();
  const observed=new Map(), batchInputs=new Map(), linkedIdentities=new Map(),participationProofs=new Map();
  const calendarOccurrences=new Map(), pendingCalendarReads=new Set();
  const fixedBuildings=new Map();
  const calendarWindows=new Map();
  const knownCalendarEvents=new Map();
  const mutatedCalendarIds=new Map([['club',new Set()],['member',new Set()]]);
  let prepared=false,catalogueRead=false,memberPreparationRun={},memberPreparations=new WeakMap();
  const memberBoundaryCopies=new Map(),issuedMemberPreparations=new WeakSet(),participationMapReads=new Map();
  const initialWriteCoverage=new Map();
  // Exact-original absence belongs only to this prepared cycle. It is never a
  // general source grant, provider failure or model-supplied completion claim.
  const missingOriginals=new Map();
  const personChoiceReceipts=new Map();let personChoiceRun={};
  const mapSnapshots=new Map(),mapContexts=new Map();let latestMapContext;
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
  const cleanupBatch=()=>{if(workerOperations)resetWorkerOperations(workerOperations);staged?.cleanup();activeLeaseToken=undefined;preparedContext=undefined;prepared=false;calendarMutationVersion=0;syncCycleId=undefined;calendarSources.length=0;observed.clear();batchInputs.clear();linkedIdentities.clear();participationProofs.clear();fragments.clear();
    memberPreparationRun={};memberPreparations=new WeakMap();memberBoundaryCopies.clear();participationMapReads.clear();initialWriteCoverage.clear();missingOriginals.clear();personChoiceReceipts.clear();personChoiceRun={};mapSnapshots.clear();mapContexts.clear();latestMapContext=undefined;
    calendarOccurrences.clear();pendingCalendarReads.clear();fixedBuildings.clear();calendarWindows.clear();knownCalendarEvents.clear();taskEvidence.clear();for(const ids of mutatedCalendarIds.values())ids.clear();catalogueRead=false;};
  function rememberDiscord(source) {
    if(source.guildId!==discordConfig.guildId||!snowflake(source.channelId)||!snowflake(source.messageId)
      ||!validUuid(source.sourceId)||!allowedSourceIds.includes(source.sourceId)
      ||source.url!==`https://discord.com/channels/${source.guildId}/${source.channelId}/${source.messageId}`)return;
    for(const [id,witness]of missingOriginals)if(witness.sourceId===source.sourceId&&witness.sourceUrl===source.url)missingOriginals.delete(id);
    const sourceKey=`discord:${source.guildId}:${source.channelId}:${source.messageId}`;
    observed.set(sourceKey,{provider:'discord',sourceKey,sourceId:source.sourceId,sourceUrl:source.url,authorId:source.authorId,
      guildId:source.guildId,channelId:source.channelId,messageId:source.messageId,content:source.content??source.excerpt??'',reportedAt:source.sourceUpdatedAt||source.createdAt||null});
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
      messageId:source.externalId,sender,content:source.excerpt,reportedAt:Number.isFinite(Date.parse(source.date))?new Date(source.date).toISOString():null,signature:gmailSignature(source)};
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
    if(!allowedSourceIds.length||allowedSourceIds.length>500||!allowedSourceIds.every(validUuid))fail('not_configured');
    syncCycleId=randomUUID();
    const clock=new Date(now()).getTime();
    const context={status:'ready',calendarId:principal.calendarId,
      calendarMap:{configured:calendarMapConfigured,...(calendarMapConfigured?{sourceId:calendarSourceId}:{}),
        notice:promptText("agents/update/context#calendar-map-provenance")},
      ...(stagedEnabled?{reconciliationWindow:{timeMin:new Date(clock-86400000).toISOString(),timeMax:new Date(clock+8*86400000).toISOString(),
        notice:promptText("agents/update/context#calendar-map-window")}}:{})};
    if(signal?.aborted)fail('aborted');
    if(!Array.isArray(inputs)||inputs.length>20)fail('invalid_batch');
    if(inputs.some(row=>!validUuid(row?.uuid)||!plainObject(row.raw_response))
      ||inputs.length&&!await authorizeEvents({events:inputs.map(row=>row.raw_response),principal,signal}))fail('forbidden');
    for(const row of inputs) {
      batchInputs.set(row.uuid,structuredClone(row.raw_response));
      const event=row.raw_response,p=event.payload;
      if(event.source==='discord'&&['message_created','message_updated'].includes(event.event_type)&&p?.id===event.event_id&&typeof p.content==='string')
        rememberDiscord({sourceId:event.source_id,guildId:p.guild_id,channelId:p.channel_id,messageId:p.id,authorId:p.author?.id,content:p.content,
          url:`https://discord.com/channels/${p.guild_id}/${p.channel_id}/${p.id}`,createdAt:p.timestamp,sourceUpdatedAt:p.edited_timestamp||p.timestamp});
    }
    prepared=true;
    preparedContext=context;
    context.sourceHints=inputs.flatMap(input=>{
      const binding=nativePersonBinding(input);if(!binding)return [];
      return [{originalInputId:input.uuid,sourceId:binding.sourceId,sourceUrl:binding.sourceUrl,...binding.identity,
        read:{tool:binding.identity.provider==='discord'?'read_discord_messages':'read_gmail',arguments:binding.identity.provider==='discord'
          ?{url:binding.sourceUrl,context:false}:{messageId:input.raw_response.payload.id}},
        lookup:{tool:'lookup_map_person',arguments:{sourceId:binding.sourceId,sourceUrl:binding.sourceUrl,...binding.identity}},
        notice:promptText("agents/update/context#input-source-hints")}];
    });
    if(stagedEnabled)context.memberPlans={configured:memberConfig.configured===true&&memberClient.configured===true&&validUuid(memberSourceId)&&staticSourceIds.includes(memberSourceId),calendarId:memberClient.calendarId,sourceId:memberSourceId};
    return context;
  }

  async function authorizeEvent({event,principal:actor,signal}={}) {
    return authorizeEvents({events:[event],principal:actor,signal});
  }
  async function readDiscordAuthorizationPair(signal) {
    if(manualWhitelist) {
      const result=await ordinaryDiscordStore.getManualScopeMetadata({guildId:discordConfig.guildId,channelIds:manual.channelIds,signal});
      const snapshot=manualAuthorizationSnapshot({result,guildId:discordConfig.guildId,channelIds:manual.channelIds});
      return [snapshot,snapshot];
    }
    if('getAuthorizationSnapshot' in discordStore) {
      if(typeof discordStore.getAuthorizationSnapshot!=='function')fail('not_configured');
      const snapshot=await discordStore.getAuthorizationSnapshot({guildId:discordConfig.guildId,signal});
      return [snapshot,snapshot];
    }
    return Promise.all([discordStore.getPolicy({guildId:discordConfig.guildId,signal}),discordStore.listSyncChannels({signal})]);
  }
  // Queue ownership and source scope are checked against saved policy data.
  // Live provider permissions belong to the explicit provider tool, never a
  // hidden operation around an unrelated map/Calendar/cache call.
  async function authorizeEvents({events,principal:actor,signal}={}) {
    if(actor!==principal||signal?.aborted||!Array.isArray(events)||!events.length||events.length>20)return false;
    const bindings=new Map();
    for(const event of events) {
      if(!validUuid(event?.source_id)||!allowedSourceIds.includes(event.source_id))return false;
      if(event.source==='gmail') {
        if(!googleAccess||event.source_id!==gmailSourceId||!['email_received','email_received_metadata'].includes(event.event_type))return false;
      } else {
        const channelId=event.payload?.channel_id;
        if(event.source!=='discord'||!discordConfig.configured||!snowflake(channelId)||event.payload.guild_id!==discordConfig.guildId
          ||!['message_created','message_updated','message_deleted','messages_deleted'].includes(event.event_type)
          ||bindings.has(channelId)&&bindings.get(channelId)!==event.source_id)return false;
        bindings.set(channelId,event.source_id);
      }
    }
    if(!bindings.size)return !signal?.aborted;
    try {
      const [policyResult,catalogue]=await readDiscordAuthorizationPair(signal);
      const policy=policyResult?.policy;
      if(signal?.aborted||policyResult?.status!=='ready'||policy?.guildId!==discordConfig.guildId||policy.paused
        ||policy.discoveryEnabled===false||!Array.isArray(catalogue?.channels))return false;
      const rows=new Map(catalogue.channels.map(row=>[row.channelId,row]));
      rememberSourceBindings(catalogue.channels);
      const authorized=[...bindings].every(([channelId,sourceId])=>{
        const row=rows.get(channelId);
        if(row?.enabled!==true||row.guildId!==discordConfig.guildId||row.sourceId!==sourceId)return false;
        const channel={id:channelId,guild_id:discordConfig.guildId,parent_id:row.parentId??row.parent_id??null,type:row.type??0};
        const channels=new Map([...rows].map(([id,item])=>[id,{id,guild_id:discordConfig.guildId,parent_id:item.parentId??item.parent_id??null,type:item.type??0}]));
        return !isDiscordChannelExcluded({channel,channels,policy});
      });
      if(authorized)currentDiscordSourceIds=[...new Set([...currentDiscordSourceIds,...bindings.values()])];
      return authorized;
    } catch {return false;}
  }

  const expandedContext=context=>{
    if(!stagedEnabled||!Array.isArray(context?.inputIds))return context;
    return {...context,inputIds:[...new Set(context.inputIds.flatMap(id=>taskEvidence.get(id)?.map(row=>row.uuid)||[id]))]};
  };
  const taskEvidence=new Map();
  const requirePrepared=context=>prepared&&context?.principal===principal&&!context.signal?.aborted;
  function nativePersonBinding(input) {
    const event=input?.raw_response,p=event?.payload;
    if(!validUuid(event?.source_id)||!allowedSourceIds.includes(event.source_id)||p?.id!==event.event_id)return null;
    if(event.source==='discord'&&['message_created','message_updated'].includes(event.event_type)
      &&p.guild_id===discordConfig.guildId&&[p.guild_id,p.channel_id,p.id,p.author?.id].every(snowflake))
      return {input,sourceId:event.source_id,sourceUrl:`https://discord.com/channels/${p.guild_id}/${p.channel_id}/${p.id}`,
        identity:{provider:'discord',providerUserId:p.author.id}};
    if(event.source==='gmail'&&['email_received','email_received_metadata'].includes(event.event_type)&&event.source_id===gmailSourceId) {
      const from=Array.isArray(p.payload?.headers)?p.payload.headers.filter(row=>typeof row?.name==='string'&&row.name.toLowerCase()==='from'):[];
      const sender=from.length===1?sourceMailbox(from[0].value):null;
      if(sender)return {input,sourceId:event.source_id,sourceUrl:`https://mail.google.com/mail/u/0/#all/${p.id}`,
        identity:{provider:'email',providerUserId:sender}};
    }
    return null;
  }
  function getPersonIdChoices({principal:actor,inputIds,phase,signal}={}) {
    const context={principal:actor,inputIds,signal};
    if(!requirePrepared(context)||!staged||phase!==staged.phase)return [];
    const originals=staged.getBoundOriginals(context),bindings=originals?.map(nativePersonBinding);
    if(!bindings?.length||bindings.some(row=>!row))return [];
    const history=staged.getExecutionLog(),choices=new Set();
    for(const binding of bindings) {
      const receipt=personChoiceReceipts.get(canonicalJson([phase,binding.sourceId,binding.sourceUrl]));
      if(!receipt||receipt.run!==personChoiceRun||receipt.principal!==actor||receipt.phase!==phase
        ||canonicalJson(receipt.identity)!==canonicalJson(binding.identity)
        ||!receipt.originals.some(input=>canonicalJson(input)===canonicalJson(binding.input))
        ||canonicalJson(linkedIdentities.get(receipt.personId)?.get(evidenceKey(binding.sourceId,binding.sourceUrl)))!==canonicalJson(binding.identity)
        ||!history.some(row=>row.kind==='tool_result'&&row.tool==='lookup_map_person'&&row.stage===phase
          &&row.callId===receipt.callId&&row.result?.status==='ready'&&!row.result.fragment&&row.result.person?.id===receipt.personId
          &&canonicalJson(row.arguments)===canonicalJson(receipt.arguments)
          &&canonicalJson([...(row.inputIds||[])].sort())===canonicalJson([...receipt.inputIds].sort())))return [];
      choices.add(receipt.personId);
    }
    // Multiple distinct speakers/people make an invalid singular person field
    // ambiguous. This hint never selects a person or splits the saved task.
    return choices.size===1?[...choices]:[];
  }
  function initialWriteInputs({context,sourceId,sourceUrl,sourceKey,original,authorId}) {
    if(!requirePrepared(context)||staged?.phase!=='initial'||!Array.isArray(context.inputIds)||!original
      ||typeof original.content!=='string'||!original.content.trim())return [];
    const selected=[];
    for(const uuid of context.inputIds) {
      const event=batchInputs.get(uuid),p=event?.payload;
      if(event?.source_id!==sourceId||!allowedSourceIds.includes(sourceId)||p?.id!==event.event_id)continue;
      if(event.source==='discord') {
        const instant=value=>typeof value==='string'&&value.length<=40&&/^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(value)
          &&Number.isFinite(Date.parse(value))&&Date.parse(value)>=1420070400000?new Date(value).toISOString():null;
        const created=instant(p.timestamp),edited=p.edited_timestamp==null?null:instant(p.edited_timestamp);
        if(!['message_created','message_updated'].includes(event.event_type)||p.guild_id!==discordConfig.guildId
          ||![p.guild_id,p.channel_id,p.id,p.author?.id].every(snowflake)||p.author.id!==authorId
          ||sourceKey!==`discord:${p.guild_id}:${p.channel_id}:${p.id}`||sourceUrl!==`https://discord.com/channels/${p.guild_id}/${p.channel_id}/${p.id}`
          ||p.content!==original.content||!created||p.edited_timestamp!=null&&!edited
          ||(edited||created)!==instant(original.reportedAt))continue;
      } else if(event.source==='gmail') {
        const headers=p.payload?.headers,from=Array.isArray(headers)?headers.filter(row=>typeof row?.name==='string'&&row.name.toLowerCase()==='from'):[];
        if(!['email_received','email_received_metadata'].includes(event.event_type)||sourceId!==gmailSourceId
          ||sourceKey!==`gmail:${p.id}`||sourceUrl!==`https://mail.google.com/mail/u/0/#all/${p.id}`
          ||from.length!==1||sourceMailbox(from[0].value)!==authorId)continue;
      } else continue;
      selected.push({uuid,raw_response:structuredClone(event)});
    }
    return selected;
  }
  function recordInitialWrite(inputs,result,kind,sourceKey) {
    if(staged?.phase!=='initial'||result?.status!=='ready')return;
    const receipt=projectCalendarReceipt(result.calendarWrite??result),target=targets.find(row=>row.kind===kind);
    if(!target||!receipt||!['created','updated','cancelled'].includes(receipt.outcome)
      ||receipt.eventId!==calendarEventId(target.client.calendarId,sourceKey)
      ||result.eventId!==receipt.eventId||result.url!==receipt.url)return;
    for(const input of inputs)initialWriteCoverage.set(input.uuid,structuredClone(input));
  }
  async function supportingSource(sourceId,sourceUrl,context,{allowCalendar=true,sourceRecordId}={}) {
    context=expandedContext(context);
    if(!requirePrepared(context)||!allowedSourceIds.includes(sourceId))return false;
    const scope=[...observed.values()].find(row=>row.sourceId===sourceId&&row.sourceUrl===sourceUrl);
    return Boolean(scope&&['discord','gmail','calendar'].includes(scope.provider)
      &&(scope.provider!=='calendar'||allowCalendar&&(sourceRecordId===undefined||sourceRecordId===scope.eventId)));
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
  // Tools use exactly the model's proposal; source/Calendar matching belongs
  // in prompts and explicit reads, never argument repair or hidden fetches.
  async function prepareMapArguments(args) {return args;}
  async function writeMap(args,context) {return writeStagedMap(args,expandedContext(context));}
  function observedParticipation(participation) {
    if(!participation||!allowedSourceIds.includes(participation.sourceId))return null;
    const scope=[...observed.values()].find(row=>row.sourceId===participation.sourceId&&row.sourceUrl===participation.sourceUrl);
    const identity=scope?.provider==='discord'?{provider:'discord',providerUserId:scope.authorId}
      :scope?.provider==='gmail'?{provider:'email',providerUserId:scope.sender}:null;
    const linked=linkedIdentities.get(participation.personId)?.get(evidenceKey(participation.sourceId,participation.sourceUrl));
    if(!scope||!identity||!linked||canonicalJson(identity)!==canonicalJson(linked)
      ||participation.provider!==identity.provider||participation.providerUserId!==identity.providerUserId
      ||typeof scope.content!=='string'||!scope.content.trim()||!Number.isFinite(Date.parse(scope.reportedAt)))return null;
    return {content:scope.content,reportedAt:scope.reportedAt};
  }
  async function validateMemberParticipation({principal:actor,participation,signal}) {
    if(actor!==principal||signal?.aborted)return false;
    const original=observedParticipation(participation);
    return Boolean(original&&Date.parse(original.reportedAt)===Date.parse(participation.reportedAt));
  }
  // Signed Calendar metadata already binds the saved original and identity.
  // The separately named sync validates current local grants, not old source
  // messages or identity lookups from whichever unrelated cycle is now running.
  function validateStoredMemberParticipation({principal:actor,participation,event,signal}) {
    if(actor!==principal||signal?.aborted||event?.managed!==true||!validMemberParticipation(participation)
      ||!event.memberPlan||canonicalJson(event.memberPlan.participation)!==canonicalJson(participation)
      ||event.sourceUrl!==participation.sourceUrl||!allowedSourceIds.includes(participation.sourceId))return false;
    if(participation.provider==='discord') {
      const match=/^https:\/\/discord\.com\/channels\/([0-9]{1,20})\/([0-9]{1,20})\/([0-9]{1,20})$/.exec(participation.sourceUrl);
      return Boolean(match&&match[1]===discordConfig.guildId&&principal.mapSourceBindings.some(row=>row.sourceId===participation.sourceId
        &&row.provider==='discord'&&row.guildId===match[1]&&row.channelId===match[2]));
    }
    return participation.provider==='email'&&googleAccess&&participation.sourceId===gmailSourceId
      &&/^https:\/\/mail\.google\.com\/mail\/u\/0\/#all\/[a-fA-F0-9]{1,64}$/.test(participation.sourceUrl);
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
  function observedCalendar(sourceId,eventId) {
    const target=targets.find(row=>row.sourceId===sourceId);
    const scope=observed.get(`${target?.kind==='member'?'membercalendar':'calendar'}:${eventId}`);
    const original=target?.kind==='member'?knownCalendarEvents.get(`member:${eventId}`):calendarOccurrences.get(eventId);
    return scope&&original?{target,original}:null;
  }
  async function writeStagedMap(args,context,capability=null) {
    if(!requirePrepared(context))return {status:'forbidden'};
    const target=targets.find(row=>row.sourceId===args.event?.source_id);
    if(!target&&stagedEnabled)return {status:'forbidden_source'};
    const previous=args.event?.id?mapSnapshots.get(args.event.id):null;
    const current=previous?.events.find(row=>row.id===args.event.id);
    if(args.event?.id&&(!current||current.updated_at!==args.expectedUpdatedAt))return {status:current?'conflict':'read_required'};
    const projection=target?observedCalendar(target.sourceId,args.event.source_record_id):null;
    const factsChanged=mapFactsChanged({current,previousBuildings:previous?.event_buildings,event:args.event,buildings:args.buildings});
    if(factsChanged&&!target&&!await supportingSource(args.event?.source_id,args.event?.source_url,context,{sourceRecordId:args.event?.source_record_id}))return {status:'forbidden_source'};
    if(factsChanged&&target) {
      const original=projection?.original;
      if(!original||original.eventId!==args.event.source_record_id||original.url!==args.event.source_url
        ||args.event.kind!==(target.kind==='member'?original.memberPlan?.activityKind:'scheduled_event')
        ||args.event.status!==(original.status||'confirmed'))return {status:'forbidden_source'};
      if(original.start?.date) {
        if(args.event.time_kind!=='all_day'||args.event.starts_on!==original.start.date||args.event.ends_on!==original.end?.date)return {status:'forbidden_source'};
      } else if(original.start&&(!sameInstant(args.event.starts_at,original.start.dateTime)||!sameInstant(args.event.ends_at,original.end?.dateTime)))return {status:'forbidden_source'};
      if(original.title&&args.event.name!==calendarMapName(original,current))return {status:'forbidden_source'};
    }
    if(current&&(current.source_id!==args.event.source_id||current.source_record_id!==args.event.source_record_id))return {status:'invalid_request'};
    for(const person of args.people||[]) {
      const prior=previous?.event_people.find(row=>row.person_id===person.person_id);
      if(prior&&canonicalJson(stripRelation(prior))===canonicalJson(person))continue;
      if(!await supportingSource(person.source_id,person.source_url,context,{allowCalendar:false})||!linkedParticipant(person,context))return {status:'forbidden_source'};
    }
    if(previous?.event_people.some(row=>!args.people?.some(person=>person.person_id===row.person_id)))return {status:'forbidden_source'};
    const readContext=mapContexts.get(args.event?.id)||latestMapContext;
    let result=capability?await mapEventService.upsertPreservedEvent({...args,principal,signal:context.signal,capability,readContext,mode:'participation'})
      :await mapTools.execute({name:'upsert_map_event',arguments:args,principal,signal:context.signal,readContext});
    if(result?.status==='applied')result={...result,status:'ready',sourceStatus:'applied'};
    if(result?.status==='ready'&&result.sourceStatus==='applied'&&staged?.phase==='initial') {
      for(const id of context.inputIds||[]) {
        const event=batchInputs.get(id),p=event?.payload;
        const url=event?.source==='discord'?`https://discord.com/channels/${p.guild_id}/${p.channel_id}/${p.id}`:event?.source==='gmail'?`https://mail.google.com/mail/u/0/#all/${p.id}`:null;
        if(url&&(args.people?.some(row=>row.source_url===url)||projection?.original?.sourceUrl===url))initialWriteCoverage.set(id,{uuid:id,raw_response:structuredClone(event)});
      }
    }
    return result;
  }
  async function completeParticipationRead(eventId,expectedUpdatedAt,signal) {
    const authorized=mapSnapshots.get(eventId),readContext=mapContexts.get(eventId);
    if(!authorized||typeof mapEventService.preparePreservedEvent==='function'&&!readContext)throw Error('participation_read_required');
    if(typeof mapEventService.preparePreservedEvent==='function') {
      const prepared=await mapEventService.preparePreservedEvent({eventId,expectedUpdatedAt,principal,signal,readContext});
      if(prepared?.status!=='ok')throw Error(prepared?.status==='conflict'?'participation_conflict':'invalid_participation_snapshot');
      return {snapshot:completeParticipationSnapshot(prepared.raw,authorized,eventId,expectedUpdatedAt),capability:prepared.capability};
    }
    return {snapshot:completeParticipationSnapshot(authorized,authorized,eventId,expectedUpdatedAt),capability:null};
  }
  function nativeParticipationObservation(binding,sourceId,sourceUrl) {
    const event=binding.original?.raw_response,p=event?.payload;
    if(event?.source!=='discord'||!['message_created','message_updated'].includes(event.event_type)
      ||event.source_id!==sourceId||!validUuid(sourceId)||p?.guild_id!==discordConfig.guildId
      ||![p?.guild_id,p?.channel_id,p?.id,p?.author?.id].every(snowflake)||p.id!==event.event_id
      ||sourceUrl!==`https://discord.com/channels/${p.guild_id}/${p.channel_id}/${p.id}`
      ||binding.identity.provider!=='discord'||binding.identity.providerUserId!==p.author.id
      ||typeof p.content!=='string'||!p.content.trim()||p.content.length>100000)return null;
    // Match live cleanMessage's UTC spelling, using only provider times. An
    // invalid supplied edit timestamp cannot be replaced with a creation time.
    const iso=value=>typeof value==='string'&&value.length<=40&&/^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(value)
      &&Number.isFinite(Date.parse(value))&&Date.parse(value)>=1420070400000?new Date(value).toISOString():null;
    const created=iso(p.timestamp),edited=p.edited_timestamp==null?null:iso(p.edited_timestamp);
    if(!created||p.edited_timestamp!=null&&!edited)return null;
    return {provider:'discord',sourceId,sourceUrl,authorId:p.author.id,content:p.content,reportedAt:edited||created};
  }
  async function patchParticipation(args,context) {
    if(!requirePrepared(context)||staged?.phase!=='followup')return {status:'forbidden'};
    if(!validateArguments(args,PARTICIPATION_PARAMETERS))return {status:'invalid_request'};
    try {
      const {snapshot,capability}=await completeParticipationRead(args.eventId,args.expectedUpdatedAt,context.signal);
      const target=targets.find(row=>row.sourceId===snapshot.event.source_id);
      if(!target)return {status:'forbidden_source'};
      const selection={context,calendarKind:target.kind,calendarEventId:snapshot.event.source_record_id,changes:args.changes};
      const bindings=staged.participationTasks(selection);
      if(!bindings)return {status:'invalid_request',reason:'participation_task_not_ready'};
      const provenance=new Map();
      for(const binding of bindings) {
        const sourceId=binding.original.raw_response.source_id,sourceUrl=binding.sourceUrl;
        let observation=[...observed.values()].find(row=>row.sourceId===sourceId&&row.sourceUrl===sourceUrl);
        if(!observation||observation.reportedAt==null) {
          const native=nativeParticipationObservation(binding,sourceId,sourceUrl);
          if(!native||observation&&(observation.provider!=='discord'||observation.sourceId!==native.sourceId
            ||observation.sourceUrl!==native.sourceUrl||observation.authorId!==native.authorId||observation.content!==native.content))return {status:'forbidden_source'};
          // This candidate is local to this patch. It never becomes a source
          // observation or Calendar input; the live read below must match it.
          observation=observation?{...observation,reportedAt:native.reportedAt}:native;
        }
        const identity=providerIdentity(sourceId,sourceUrl,context);
        const person={person_id:binding.personId,source_id:sourceId,source_url:sourceUrl};
        if(!observation||!identity||!linkedParticipant(person,context)
          ||binding.identity.provider!==identity.provider
          ||binding.identity.providerUserId!==undefined&&binding.identity.providerUserId!==identity.providerUserId
          ||!await supportingSource(sourceId,sourceUrl,context,{allowCalendar:false}))return {status:'forbidden_source'};
        const original=await observedParticipation({sourceId,sourceUrl,personId:binding.personId,...identity},context.signal);
        if(!original||original.content!==observation.content||original.reportedAt!==observation.reportedAt)return {status:'forbidden_source'};
        for(const kind of ['original','identity'])await staged.recordParticipationOutcome({context,binding,dependency:dependencyKey(binding,kind),reason:null});
        provenance.set(binding.personId,{source_id:sourceId,source_url:sourceUrl,reported_at:original.reportedAt});
      }
      const merged=mergeParticipationChanges(snapshot,args.changes,provenance);
      if(merged.status!=='ready') {
        if(merged.reason==='unchanged_participation'&&await staged.verifyParticipationTasks(selection,bindings)) {
          for(const binding of bindings) {
            const single=mergeParticipationChanges(snapshot,args.changes.filter(change=>change.personId===binding.personId),provenance);
            if(single.reason==='unchanged_participation')await staged.recordParticipationOutcome({context,binding,dependency:dependencyKey(binding,'map'),reason:'unchanged_participation'});
          }
          return {status:'ready',outcome:'no_change_needed',reason:'already_correct',changed:false,eventId:args.eventId,
            taskIds:bindings.map(binding=>binding.taskId),resolutionOptions:bindings.map(binding=>({taskId:binding.taskId,outcome:'no_change_needed',reason:'already_correct'})),
            message:promptText("tools/map/participation#already-correct")};
        }
        return merged;
      }
      // Last task-store check before the existing business-write path. A newer
      // task must be explicitly reread, never silently rebound by this tool.
      if(!await staged.verifyParticipationTasks(selection,bindings))return {status:'conflict'};
      const result=await writeStagedMap(merged.arguments,context,capability);
      if(result?.status!=='ready'||result.sourceStatus!=='applied'||result.event_id!==args.eventId||timestamp(result.updated_at)===null)return result?.status==='ready'?{status:'pending',reason:'unconfirmed_participation'}:result;
      if(!requirePrepared(context))return {status:'forbidden'};
      const receiptId=randomUUID();
      participationProofs.set(receiptId,{eventId:args.eventId,arguments:structuredClone(args),calendarKind:target.kind,calendarEventId:snapshot.event.source_record_id,
        sourceId:target.sourceId,bindings:bindings.map(({taskId,updatedAt,personId,sourceUrl})=>({taskId,updatedAt,personId,sourceUrl})),
        people:merged.arguments.people.filter(row=>merged.changedPersonIds.includes(row.person_id))});
      return {status:'ready',sourceStatus:'applied',receiptId,eventId:args.eventId,updatedAt:result.updated_at,
        changedPersonIds:merged.changedPersonIds,taskIds:bindings.map(row=>row.taskId)};
    } catch(error) {
      if(context.signal?.aborted)return {status:'aborted'};
      return {status:error?.message==='participation_conflict'?'conflict':error?.message==='participation_read_required'?'read_required':error?.message==='invalid_participation_snapshot'?'forbidden_source':'unavailable'};
    }
  }
  function buildMemberTools(memberTools) {
    const str=maxLength=>({type:'string',minLength:1,maxLength});
    const boundary={type:'object',additionalProperties:false,description:promptText("tools/member-plans/descriptions#endpoint"),properties:{date:str(10),localDateTime:{...str(30),description:promptText("tools/member-plans/descriptions#endpoint.local-date-time")},dateTime:{...str(40),description:promptText("tools/member-plans/descriptions#endpoint.unchanged")},timeZone:str(100)},required:[]};
    const source={sourceKey:{...str(615),description:promptText("tools/member-plans/descriptions#source-key")},sourceUrl:{...str(1200),description:promptText("tools/member-plans/descriptions#source-url")},sourceId:{...str(36),description:promptText("tools/member-plans/descriptions#source-id")},personId:{...str(36),description:promptText("tools/member-plans/descriptions#person-id")}};
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
    const copyKey=(sourceUrl,personId)=>canonicalJson([sourceUrl,personId]);
    const scope=context=>canonicalJson([...(context.inputIds||[])].sort());
    const sameOwnedPlan=(event,args)=>event?.managed===true&&event.status!=='cancelled'&&event.eventId===calendarEventId(memberClient.calendarId,args.sourceKey)
      &&event.sourceUrl===args.sourceUrl&&event.memberPlan?.participation?.sourceUrl===args.sourceUrl
      &&event.memberPlan.participation.personId===args.personId&&event.memberPlan.participation.sourceId===args.sourceId;
    async function verifyCopies(args,copies,context) {
      if(!copies)return;
      if(memberBoundaryCopies.get(copyKey(args.sourceUrl,args.personId))!==copies)fail('invalid_request');
      let fresh;
      try {fresh=await memberClient.readEvent({eventId:copies.eventId,principal:{...principal,calendarId:memberClient.calendarId},signal:context.signal});}
      catch {memberBoundaryCopies.delete(copyKey(args.sourceUrl,args.personId));fail('invalid_request');}
      const event=fresh?.status==='ready'&&fresh.events?.length===1&&fresh.events[0];
      if(fresh?.coverage?.complete===false||!sameOwnedPlan(event,args)||event.updatedAt!==copies.updatedAt
        ||canonicalJson(event.start)!==canonicalJson(copies.start)||canonicalJson(event.end)!==canonicalJson(copies.end)) {
        memberBoundaryCopies.delete(copyKey(args.sourceUrl,args.personId));fail('invalid_request');
      }
    }
    async function prepareTimedMemberArguments(args,context,parameters) {
      if(!requirePrepared(context)||!Array.isArray(context.inputIds)||!context.inputIds.length||!validateArguments(args,parameters))fail('invalid_request');
      const bound=await prepareMemberArguments(args,context),rawCopies=['start','end'].some(key=>bound[key]?.dateTime!==undefined);
      const copies=rawCopies?memberBoundaryCopies.get(copyKey(bound.sourceUrl,bound.personId)):null;
      if(rawCopies&&!copies)fail('invalid_request');
      await verifyCopies(bound,copies,context);
      const result={...bound};
      for(const key of ['start','end'])if(Object.hasOwn(bound,key))result[key]=normalizeMemberPlanBoundary(bound[key],{currentBoundary:copies?.[key]});
      issuedMemberPreparations.add(result);
      memberPreparations.set(result,{run:memberPreparationRun,principal:context.principal,scope:scope(context),phase:staged?.phase,
        arguments:canonicalJson(result),copies});
      return result;
    }
    async function acceptTimedMemberArguments(args,context,parameters) {
      const receipt=memberPreparations.get(args);
      if(!receipt&&issuedMemberPreparations.has(args))fail('invalid_request');
      if(!receipt)return prepareTimedMemberArguments(args,context,parameters).then(prepared=>acceptTimedMemberArguments(prepared,context,parameters));
      memberPreparations.delete(args);
      if(receipt.run!==memberPreparationRun||receipt.principal!==context.principal||receipt.scope!==scope(context)
        ||receipt.phase!==staged?.phase||receipt.arguments!==canonicalJson(args)||!requirePrepared(context))fail('invalid_request');
      await verifyCopies(args,receipt.copies,context);
      return args;
    }
    const definitions=[
      {name:'list_member_plans',readOnly:true,phases:['initial','followup'],description:promptText("tools/member-plans/descriptions#list"),parameters:{type:'object',additionalProperties:false,properties:{timeMin:str(40),timeMax:str(40)},required:['timeMin','timeMax']}},
      {name:'read_member_plan',readOnly:true,phases:['initial','followup'],description:promptText("tools/member-plans/descriptions#read"),parameters:{type:'object',additionalProperties:false,properties:{eventId:str(1024)},required:['eventId']}},
      {name:'upsert_member_plan',idempotent:true,phases:['initial','followup'],description:promptText("tools/member-plans/descriptions#upsert"),parameters:{type:'object',additionalProperties:false,properties:{...source,title:str(200),description:{type:'string',maxLength:3000},location:{type:'string',maxLength:500},activityKind:{type:'string',enum:['presence','personal_plan']},typeId:{type:'string',enum:['study','meeting','event','social','other']},label:{type:'string',maxLength:200},start:boundary,end:boundary},required:['sourceUrl','personId','title','activityKind']}},
      {name:'cancel_member_plan',idempotent:true,phases:['initial','followup'],description:promptText("tools/member-plans/descriptions#cancel"),parameters:{type:'object',additionalProperties:false,properties:source,required:['sourceUrl','personId']}},
    ];
    return definitions.map(tool=>({...tool,...(!tool.readOnly?{prepareArguments:tool.name==='upsert_member_plan'?(args,context)=>prepareTimedMemberArguments(args,context,tool.parameters):prepareMemberArguments}:{}),execute:async(args,context)=>{
      if(!requirePrepared(context))return {status:'forbidden'};
      if(tool.readOnly) {
        const options={...args,principal:{...principal,calendarId:memberClient.calendarId},signal:context.signal};
        if(tool.name==='read_member_plan')for(const [key,copy] of memberBoundaryCopies)if(copy.eventId===args.eventId)memberBoundaryCopies.delete(key);
        const result=await (tool.name==='list_member_plans'?memberClient.listEventsWindow(options):memberClient.readEvent(options));
        if(tool.name==='read_member_plan')await observeCalendar(context,args,result,'member');
        if(['ready','partial'].includes(result.status))for(const event of result.events||[]){observed.set(`membercalendar:${event.eventId}`,{provider:'calendar',sourceId:memberSourceId,sourceUrl:event.url,eventId:event.eventId});knownCalendarEvents.set(`member:${event.eventId}`,structuredClone(event));}
        if(tool.name==='read_member_plan'&&result.status==='ready'&&result.coverage?.complete!==false)for(const event of result.events||[]) {
          const person=event.memberPlan?.participation;
          if(event.managed===true&&person?.sourceUrl===event.sourceUrl&&validUuid(person.personId)&&validUuid(person.sourceId))
            memberBoundaryCopies.set(copyKey(event.sourceUrl,person.personId),{eventId:event.eventId,updatedAt:event.updatedAt,
              start:structuredClone(event.start),end:structuredClone(event.end)});
        }
        return fragments.bound(withLocalTimeDisplay(result));
      }
      if(tool.name==='upsert_member_plan')args=await acceptTimedMemberArguments(args,context,tool.parameters);
      args=await prepareMemberArguments(args,context);
      if(!await supportingSource(args.sourceId,args.sourceUrl,context,{allowCalendar:false}))return {status:'forbidden_source'};
      const identity=providerIdentity(args.sourceId,args.sourceUrl,context);
      const linked=linkedIdentities.get(args.personId)?.get(evidenceKey(args.sourceId,args.sourceUrl));
      if(!identity||!linked||canonicalJson(identity)!==canonicalJson(linked))return {status:'forbidden_source'};
      const participation={sourceId:args.sourceId,sourceUrl:args.sourceUrl,provider:identity.provider,providerUserId:identity.providerUserId,personId:args.personId,reportedAt:'',label:args.label||''};
      const original=await observedParticipation(participation,context.signal);
      if(!original)return {status:'forbidden_source'};
      participation.reportedAt=original.reportedAt;
      const cancel=tool.name==='cancel_member_plan';
      const clean=Object.fromEntries(Object.entries(args).filter(([key])=>!['sourceId','personId','label'].includes(key)));
      const coverage=initialWriteInputs({context,sourceId:args.sourceId,sourceUrl:args.sourceUrl,sourceKey:args.sourceKey,
        original,authorId:identity.providerUserId});
      memberBoundaryCopies.delete(copyKey(args.sourceUrl,args.personId));
      const result=await (cancel?memberTools.cancel(clean,{principal,signal:context.signal,receipt:participation}):memberTools.upsert(clean,{principal,signal:context.signal,receipt:participation}));
      recordInitialWrite(coverage,result,'member',args.sourceKey);
      if(result.status==='ready'&&['created','updated','cancelled'].includes((result.calendarWrite??result).outcome))calendarMutationVersion++;
      if(result.status==='ready'&&typeof result.eventId==='string')mutatedCalendarIds.get('member').add(result.eventId);
      return fragments.bound(result);
    }}));
  }
  // Stop-only evidence comes from matching normal backend reads, never model
  // reasons or public tool-error text. These witnesses cannot resolve a task.
  const dependencyKey=(binding,kind)=>canonicalJson(['original','identity'].includes(kind)
    ?[kind,binding.original.raw_response.source_id,binding.sourceUrl]
    :[kind,binding.task.info.request.calendarKind,binding.task.info.request.calendarEventId]);
  async function participationOutcome(context,kind,select,reason) {
    for(const binding of staged?.participationDependencies(context)||[])if(select(binding))
      await staged.recordParticipationOutcome({context,binding,dependency:dependencyKey(binding,kind),reason:typeof reason==='function'?reason(binding):reason});
  }
  function exactDiscordRead(args) {
    if(args?.context!==false)return null;
    if(snowflake(args.channelId)&&snowflake(args.messageId))return {guildId:discordConfig.guildId,channelId:args.channelId,messageId:args.messageId};
    if(typeof args.url!=='string')return null;
    try {
      const url=new URL(args.url),match=/^\/channels\/([0-9]{1,20})\/([0-9]{1,20})\/([0-9]{1,20})$/.exec(url.pathname);
      if(url.origin==='https://discord.com'&&!url.search&&!url.hash&&!url.username&&!url.password&&match&&match[1]===discordConfig.guildId)
        return {guildId:match[1],channelId:match[2],messageId:match[3]};
    } catch { /* Invalid requests never become absence evidence. */ }
    return null;
  }
  function observeMissingOriginal(context,args,result) {
    if(!requirePrepared(context)||!staged)return;
    const requested=exactDiscordRead(args);if(!requested)return;
    const originals=staged.getBoundOriginals(context)||[];
    for(const input of originals) {
      const event=input.raw_response,p=event?.payload;
      if(event?.source!=='discord'||!allowedSourceIds.includes(event.source_id)||p?.guild_id!==requested.guildId
        ||p.channel_id!==requested.channelId||p.id!==requested.messageId)continue;
      missingOriginals.delete(input.uuid);
      const absent=result?.missingOriginal;
      if(result?.status==='ready'&&result.outcome==='source_missing'&&result.coverage?.complete===true
        &&result.coverage.reason==='exact_original_missing'&&absent?.provider==='discord'
        &&absent.guildId===p.guild_id&&absent.channelId===p.channel_id&&absent.messageId===p.id
        &&absent.sourceUrl===`https://discord.com/channels/${p.guild_id}/${p.channel_id}/${p.id}`)
        missingOriginals.set(input.uuid,{snapshot:canonicalJson(input),sourceId:event.source_id,sourceUrl:absent.sourceUrl});
    }
  }
  const confirmedMissingInput=input=>Boolean(input&&allowedSourceIds.includes(input.raw_response?.source_id)
    &&missingOriginals.get(input.uuid)?.sourceId===input.raw_response.source_id&&missingOriginals.get(input.uuid)?.snapshot===canonicalJson(input));
  function currentOriginalObserved(input) {
    const binding=nativePersonBinding(input);if(!binding||!allowedSourceIds.includes(binding.sourceId))return false;
    return [...observed.values()].some(row=>row.sourceId===binding.sourceId&&row.sourceUrl===binding.sourceUrl
      &&(binding.identity.provider==='discord'?row.provider==='discord'&&row.authorId===binding.identity.providerUserId
        :row.provider==='gmail'&&row.sender===binding.identity.providerUserId));
  }
  function noChangeEvidence({task,reason,history}) {
    if(!['already_correct','no_actionable_request'].includes(reason)||!task.info.inputs.length||!task.info.inputs.every(currentOriginalObserved))return false;
    const actionTools=new Set(['upsert_map_event','patch_map_participation','upsert_calendar_event','cancel_calendar_event','upsert_member_plan','cancel_member_plan']);
    const related=history.filter(row=>row.kind==='tool_result'&&row.inputIds?.includes(task.uuid));
    // A failed/pending action is not silently renamed to a successful review.
    // The verified unchanged-participation result is an intentional no-op.
    if(related.some(row=>actionTools.has(row.tool)&&row.result?.reason!=='unchanged_participation'
      &&(!['ready','already_succeeded'].includes(row.result?.status)||row.result?.sourceStatus==='partial')))return false;
    if(reason==='no_actionable_request')return true;
    const request=task.info.request,target=targets.find(row=>row.kind===request.calendarKind);
    // Keep the map UUID/provider identity association after an unavailable
    // reread removes its writable snapshot. It is only used to match reads,
    // never as evidence that the old event facts are still current.
    const mapEventIds=new Set();
    if(target&&request.calendarEventId) {
      const remember=result=>{for(const event of result?.events||[])if(event.source_id===target.sourceId&&event.source_record_id===request.calendarEventId)mapEventIds.add(event.id);};
      for(const row of history)if(row.kind==='tool_result'&&row.tool==='read_map_events'&&['ready','partial'].includes(row.result?.status))remember(row.result);
      for(const snapshot of mapSnapshots.values())remember(snapshot);
      const previous=participationMapReads.get(canonicalJson([request.calendarKind,request.calendarEventId]));
      if(previous)mapEventIds.add(previous.eventId);
    }
    const calendarKind=row=>['read_member_plan','list_member_plans'].includes(row.tool)?'member':['read_calendar_event','list_calendar_events'].includes(row.tool)?'club':null;
    const latestState=related.findLast(row=>{
      const args=row.arguments||{};
      if(row.tool==='read_map_events')return (!target||!args.sourceId||args.sourceId===target.sourceId)
        &&(!request.calendarEventId||!args.sourceRecordId||args.sourceRecordId===request.calendarEventId)
        &&(!target||!request.calendarEventId||!args.eventId||mapEventIds.has(args.eventId));
      const kind=calendarKind(row);
      return kind&&(!request.calendarKind||kind===request.calendarKind)
        &&(!request.calendarEventId||!args.eventId||args.eventId===request.calendarEventId);
    });
    if(!latestState||latestState.result?.status!=='ready'||latestState.result.partial===true||latestState.result.possiblyTruncated===true
      ||latestState.result.coverage?.complete===false)return false;
    // The latest matching read must itself support the decision. An unrelated
    // successful exact read cannot revive older facts after this target failed.
    if(!Array.isArray(latestState.result.events))return false;
    if(latestState.tool==='read_map_events')return !request.calendarEventId||Boolean(target&&(
      latestState.result.events.some(event=>event.source_id===target.sourceId&&event.source_record_id===request.calendarEventId)
      ||latestState.arguments?.sourceId===target.sourceId&&latestState.arguments?.sourceRecordId===request.calendarEventId));
    if(latestState.arguments?.resultMode==='identities')return false;
    return !request.calendarEventId||latestState.result.events.some(event=>event.eventId===request.calendarEventId)
      ||latestState.arguments?.eventId===request.calendarEventId&&latestState.result.events.length===0;
  }
  async function observeOriginal(context,args,result,provider) {
    if(result?.status==='ready'&&result.coverage?.textTruncated!==true)for(const source of result.sources||[]) {
      const sourceId=provider==='gmail'?gmailSourceId:source.sourceId,sourceUrl=source.url||source.sourceUrl;
      if(validUuid(sourceId)&&allowedSourceIds.includes(sourceId)&&typeof sourceUrl==='string'
        &&(provider==='gmail'?sourceUrl===`https://mail.google.com/mail/u/0/#all/${args.messageId}`
          :source.guildId===discordConfig.guildId&&sourceUrl===`https://discord.com/channels/${source.guildId}/${source.channelId}/${source.messageId}`))
        staged?.invalidateParticipationOutcome({context,dependency:canonicalJson(['original',sourceId,sourceUrl])});
    }
    const selected=binding=>{
      const event=binding.original.raw_response,p=event.payload;
      return provider===event.source&&(provider==='discord'?(args.context!==true&&(args.url===binding.sourceUrl
        ||args.channelId===p.channel_id&&args.messageId===p.id)):args.messageId===p.id);
    };
    if(result?.status==='invalid_request')return;
    await participationOutcome(context,'original',selected,binding=>{
      const source=result?.sources?.find(row=>(row.url||row.sourceUrl)===binding.sourceUrl&&(provider==='gmail'||row.sourceId===binding.original.raw_response.source_id));
      if(result?.status!=='ready'||result.coverage?.textTruncated===true||!source)return 'source_unavailable';
      if(provider==='discord') {
        const native=nativeParticipationObservation(binding,binding.original.raw_response.source_id,binding.sourceUrl);
        if(!native||source.authorId!==native.authorId||(source.content??source.excerpt)!==native.content
          ||(source.sourceUpdatedAt||source.createdAt)!==native.reportedAt)return 'source_changed';
      }
      return null;
    });
  }
  async function observeCalendar(context,args,result,kind) {
    if(result?.status==='ready'&&result.coverage?.complete!==false&&result.events?.some(event=>event.eventId===args.eventId))
      staged?.invalidateParticipationOutcome({context,dependency:canonicalJson(['calendar',kind,args.eventId])});
    if(result?.status==='invalid_request')return;
    await participationOutcome(context,'calendar',binding=>binding.task.info.request.calendarKind===kind
      &&binding.task.info.request.calendarEventId===args.eventId,binding=>{
        const event=result?.status==='ready'&&result.events?.find(row=>row.eventId===binding.task.info.request.calendarEventId);
        return !event||result.coverage?.complete===false?'calendar_unavailable':event.status==='cancelled'?'calendar_cancelled':null;
      });
  }
  async function observeMap(context,args,result) {
    if(result?.status==='ready'&&result.partial!==true&&result.possiblyTruncated!==true&&result.coverage?.complete!==false)for(const event of result.events||[]) {
      const target=targets.find(row=>row.sourceId===event.source_id);
      if(target&&typeof event.source_record_id==='string')staged?.invalidateParticipationOutcome({context,dependency:canonicalJson(['map',target.kind,event.source_record_id])});
    }
    if(result?.status==='invalid_request')return;
    await participationOutcome(context,'map',binding=>{
      const request=binding.task.info.request,target=targets.find(row=>row.kind===request.calendarKind);
      const key=canonicalJson([request.calendarKind,request.calendarEventId]),prior=participationMapReads.get(key);
      return target&&(!args.sourceId||args.sourceId===target.sourceId)&&(!args.sourceRecordId||args.sourceRecordId===request.calendarEventId)
        &&(!args.eventId||args.eventId===prior?.eventId||result?.events?.some(row=>row.id===args.eventId&&row.source_id===target.sourceId&&row.source_record_id===request.calendarEventId));
    },binding=>{
      if(result?.status!=='ready'||result.partial===true||result.possiblyTruncated===true||result.coverage?.complete===false)return 'map_unavailable';
      const request=binding.task.info.request,target=targets.find(row=>row.kind===request.calendarKind);
      const event=result.events?.find(row=>row.source_id===target.sourceId&&row.source_record_id===request.calendarEventId);
      if(!event)return 'map_missing';
      participationMapReads.set(canonicalJson([request.calendarKind,request.calendarEventId]),{eventId:event.id,updatedAt:event.updated_at});
      return event.status==='cancelled'?'calendar_cancelled':null;
    });
  }
  const tools=[
    ...GOOGLE_TOOLS.map(tool=>({...tool,readOnly:true,
      execute:async(args,context)=>{
        if(!requirePrepared(context)||!googleAccess)return {status:'forbidden'};
        const result=normalize(await executeGoogleTool({name:tool.name,arguments:args,principal,client:googleClient,signal:context.signal}));
        if(tool.name==='read_gmail') {
          await observeOriginal(context,args,result,'gmail');
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
      let result;
      try {result=normalize(await discordTools.execute({name:tool.name,arguments:args,principal,signal:context.signal,timeContext:{now:now().toISOString(),timeZone:config.timezone}}));}
      catch(error) {if(tool.name==='read_discord_messages'){observeMissingOriginal(context,args,null);await observeOriginal(context,args,null,'discord');}throw error;}
      if(tool.name==='read_discord_messages'){observeMissingOriginal(context,args,result);await observeOriginal(context,args,result,'discord');}
      if(tool.name==='read_discord_messages'&&(result.status!=='ready'||result.outcome==='source_missing'))for(const [key,row] of observed)if(row.provider==='discord'&&(args.url===row.sourceUrl||args.channelId===row.channelId&&args.messageId===row.messageId))observed.delete(key);
      // Only returned originals can support follow-up facts, not catalogue
      // metadata or model-supplied URLs. Recheck current live access on use.
      if(result.status==='ready'&&result.coverage?.textTruncated!==true&&tool.name!=='list_discord_channels')for(const source of result.sources||[])
        if(source.kind==='discord'&&source.retrieval==='live'&&source.guildId===discordConfig.guildId
          &&snowflake(source.channelId)&&snowflake(source.messageId)&&validUuid(source.sourceId)
          &&allowedSourceIds.includes(source.sourceId)
          &&source.url===`https://discord.com/channels/${source.guildId}/${source.channelId}/${source.messageId}`)
          rememberDiscord(source);
      return fragments.bound(result);
    }})),
    ...calendarTools.tools.map(tool=>({...tool,execute:async(args,context)=>{
      if(!requirePrepared(context))return {status:'forbidden'};
      let coverage=[];
      if(tool.readOnly!==true) {
        const scope=observed.get(args.sourceKey);
        if(!scope||scope.sourceUrl!==args.sourceUrl||!allowedSourceIds.includes(scope.sourceId)||!['discord','gmail'].includes(scope.provider))return {status:'forbidden_source'};
        coverage=initialWriteInputs({context,sourceId:scope.sourceId,sourceUrl:scope.sourceUrl,sourceKey:args.sourceKey,
          original:scope,authorId:scope.provider==='discord'?scope.authorId:scope.sender});
      }
      const result=normalize(await calendarTools.execute({name:tool.name,arguments:args,principal,signal:context.signal}));
      if(tool.readOnly!==true){recordInitialWrite(coverage,result,'club',args.sourceKey);if(result.status==='ready'&&['created','updated','cancelled'].includes((result.calendarWrite??result).outcome))calendarMutationVersion++;}
      if(tool.name==='read_calendar_event')await observeCalendar(context,args,result,'club');
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
      return fragments.bound(tool.readOnly===true?withLocalTimeDisplay(result):result);
    }})),
    ...mapTools.tools.map(tool=>({...tool,...(tool.name==='upsert_map_event'?{prepareArguments:prepareMapArguments,
      ...(stagedEnabled?{parameters:(()=>{const schema=structuredClone(tool.parameters),ids=targets.map(target=>target.sourceId).filter(id=>validUuid(id)&&staticSourceIds.includes(id));
        if(ids.length)schema.properties.event.properties.source_id.enum=[...new Set(ids)];return schema;})()}:{} )}:{}),execute:async(args,context)=>{
      if(!requirePrepared(context))return {status:'forbidden'};
      let identity;
      const choiceRun=personChoiceRun,choicePhase=staged?.phase;
      const choiceKey=tool.name==='lookup_map_person'&&staged?canonicalJson([choicePhase,args.sourceId,args.sourceUrl]):null;
      const choiceOriginals=choiceKey&&staged.getBoundOriginals(context);
      if(choiceKey)personChoiceReceipts.delete(choiceKey);
      if(tool.name==='lookup_map_person') {
        if(!await supportingSource(args.sourceId,args.sourceUrl,context,{allowCalendar:false}))return {status:'forbidden_source'};
        identity=providerIdentity(args.sourceId,args.sourceUrl,context);
        if(!identity||args.provider!==identity.provider
          ||(args.provider==='email'&&typeof args.providerUserId==='string'?args.providerUserId.toLowerCase():args.providerUserId)!==identity.providerUserId)return {status:'forbidden_source'};
      }
      const result=tool.name==='upsert_map_event'?await writeMap(args,context):await mapTools.execute({name:tool.name,arguments:args,principal,signal:context.signal});
      if(tool.name==='lookup_map_person'&&result?.status==='ready'&&personUuid(result.person?.id))
        staged?.invalidateParticipationOutcome({context,dependency:canonicalJson(['identity',args.sourceId,args.sourceUrl])});
      if(tool.name==='lookup_map_person'&&result?.status!=='invalid_request')await participationOutcome(context,'identity',binding=>
        binding.sourceUrl===args.sourceUrl&&binding.original.raw_response.source_id===args.sourceId
          &&binding.identity.provider===args.provider&&binding.identity.providerUserId===args.providerUserId,
        result?.status==='ready'&&personUuid(result.person?.id)?null:'identity_unavailable');
      if(tool.name==='read_map_events') {
        if(result?.status==='ready') {
          const receipt=mapReadContext(result);if(receipt)latestMapContext=receipt;
          for(const event of result.events||[]) {mapSnapshots.set(event.id,structuredClone(result));if(receipt)mapContexts.set(event.id,receipt);}
        } else if(args.eventId) {mapSnapshots.delete(args.eventId);mapContexts.delete(args.eventId);}
        await observeMap(context,args,result);
      }
      if(tool.name==='lookup_map_person'&&result?.status==='ready'&&personUuid(result.person?.id)) {
        const receipts=linkedIdentities.get(result.person.id)||new Map();
        receipts.set(evidenceKey(args.sourceId,args.sourceUrl),identity);linkedIdentities.set(result.person.id,receipts);
        if(choiceKey&&choiceRun===personChoiceRun&&choicePhase===staged.phase&&context.phase===choicePhase
          &&typeof context.callId==='string'&&/^[a-zA-Z0-9_-]{1,200}$/.test(context.callId)) {
          const originals=(choiceOriginals||[]).filter(input=>{
            const binding=nativePersonBinding(input);
            return binding&&binding.sourceId===args.sourceId&&binding.sourceUrl===args.sourceUrl
              &&canonicalJson(binding.identity)===canonicalJson(identity);
          });
          if(originals.length)personChoiceReceipts.set(choiceKey,{run:choiceRun,principal:context.principal,phase:choicePhase,
            callId:context.callId,inputIds:[...context.inputIds],arguments:structuredClone(args),identity:structuredClone(identity),
            personId:result.person.id,originals:structuredClone(originals)});
        }
      }
      if(tool.name==='read_map_events'&&result?.status==='ready') {
        if(Array.isArray(result.buildings))catalogueRead=true;
        for(const building of result.buildings||[])if(typeof building.id==='string'&&typeof building.name==='string')fixedBuildings.set(building.id,building.name);
      }
      if(tool.name==='read_map_events'&&result?.status==='ready')return fragments.bound({...result,
        participationTargets:(result.events||[]).map(event=>{const target=targets.find(row=>row.sourceId===event.source_id);return {mapEventId:event.id,
          sourceId:event.source_id,eligible:Boolean(target),...(target?{calendarKind:target.kind,calendarEventId:event.source_record_id}:{reason:'not_a_pinned_calendar_event'})};}),
        participationTargetNotice:promptText("tools/map/participation#target-hints")});
      return fragments.bound(result);
    }})),
    {...fragments.tool,execute:(args,context)=>requirePrepared(context)
      ?staged?staged.readTaskFragment(args,context,fragments.tool.execute):fragments.tool.execute(args,context):{status:'forbidden'}}];
  if(stagedEnabled) {
    for(const tool of tools) {
      if(['upsert_calendar_event','cancel_calendar_event'].includes(tool.name))tool.phases=['initial','followup'];
      if(tool.name==='upsert_map_event')tool.phases=['initial','followup'];
    }
    const memberTools=createMemberPlansTools({client:memberClient,sourceId:memberSourceId,authorizeParticipation:validateMemberParticipation});
    tools.push(...buildMemberTools(memberTools),{name:'patch_map_participation',phases:['followup'],idempotent:true,
      description:promptText("tools/map/participation#description"),
      parameters:PARTICIPATION_PARAMETERS,execute:patchParticipation});
    const taskStore=pendingTaskStore;
    const synchronize=synchronizer=d.synchronize||createCalendarMapSync({targets,mapService:mapEventService,loadBuildings:d.loadBuildings||loadBuildingAliases,authorizeParticipation:validateStoredMemberParticipation,now});
    // Explicit user-selected exception: synchronization has its own registered
    // operation, arguments, result and audit entry. Calendar writes never call it.
    tools.push({name:'sync_calendars_to_map',idempotent:true,phases:['initial','followup'],getActionVersion:()=>`${syncCycleId}:${calendarMutationVersion}`,
      description:promptText("tools/worker/sync#description"),
      parameters:{type:'object',additionalProperties:false,properties:{},required:[]},execute:async(_args,context)=>{
        if(!requirePrepared(context))return {status:'forbidden'};
        const result=await synchronize.sync({principal,window:preparedContext.reconciliationWindow,signal:context.signal,
          extraEventIds:Object.fromEntries([...mutatedCalendarIds].map(([kind,ids])=>[kind,[...ids]])),
          onApiResult:entry=>staged.pipeline.recordApiResult(entry)});
        const status=result?.status||'unavailable';
        return {...fragments.bound({...result,status,sourceStatus:status}),status};
      }});
    staged=createStagedPipeline({taskStore,principal,getAllowedSourceIds:()=>[...new Set([...currentDiscordSourceIds,
      ...[calendarSourceId,memberSourceId,...(googleAccess?[gmailSourceId]:[])].filter(id=>validUuid(id)&&staticSourceIds.includes(id))])],verifyMissingInput:({input})=>confirmedMissingInput(input),verifyResolution:({task,outcome,reason,history})=>{
      if(outcome==='source_missing')return task.info.inputs.length>0&&task.info.inputs.every(confirmedMissingInput);
      if(outcome==='no_change_needed')return noChangeEvidence({task,reason,history});
      if(outcome!=='completed')return false;
      const request=task.info.request;
      const originalUrls=task.info.inputs.map(({raw_response:e})=>e.source==='discord'?`https://discord.com/channels/${e.payload.guild_id}/${e.payload.channel_id}/${e.payload.id}`:`https://mail.google.com/mail/u/0/#all/${e.payload.id}`);
      for(const row of history) {
        if(row.kind!=='tool_result'||!row.inputIds?.includes(task.uuid)||row.result?.status!=='ready')continue;
        if(row.tool==='patch_map_participation') {
          const proof=participationProofs.get(row.result.receiptId),binding=proof?.bindings.find(item=>item.taskId===task.uuid);
          if(proof&&binding&&binding.updatedAt===task.updated_at&&binding.personId===request.personId
            &&proof.calendarKind===request.calendarKind&&proof.calendarEventId===request.calendarEventId
            &&row.result.sourceStatus==='applied'&&row.result.eventId===proof.eventId
            &&canonicalJson(row.arguments)===canonicalJson(proof.arguments))return true;
          continue;
        }
        if(row.tool==='upsert_map_event') {
          if(row.result.sourceStatus!=='applied')continue;
          const event=row.arguments?.event,target=targets.find(item=>item.sourceId===event?.source_id);
          if(!target||request.calendarKind&&request.calendarKind!==target.kind||request.calendarEventId&&request.calendarEventId!==event.source_record_id
            ||row.result.event_id!==event.id||request.personId&&!row.arguments.people?.some(person=>person.person_id===request.personId&&originalUrls.includes(person.source_url))
            ||request.buildingId&&!row.arguments.buildings?.some(building=>building.building_id===request.buildingId))continue;
          if(['participation','location'].includes(request.operation)||originalUrls.some(url=>row.arguments.people?.some(person=>person.source_url===url)))return true;
        }
        const kind=['upsert_member_plan','cancel_member_plan'].includes(row.tool)?'member':['upsert_calendar_event','cancel_calendar_event'].includes(row.tool)?'club':null;
        if(request.operation!=='source_review'||!kind||request.calendarKind&&request.calendarKind!==kind
          ||!originalUrls.includes(row.arguments?.sourceUrl)||kind==='member'&&request.personId&&request.personId!==row.arguments.personId)continue;
        const target=targets.find(item=>item.kind===kind),receipt=projectCalendarReceipt(row.result.calendarWrite??row.result);
        const cancelled=['cancel_calendar_event','cancel_member_plan'].includes(row.tool);
        const confirmedCancellation=cancelled&&receipt&&(
          receipt.outcome==='already_absent'&&receipt.eventStatus==='absent'
          ||['cancelled','unchanged'].includes(receipt.outcome)&&receipt.eventStatus==='cancelled');
        if(!receipt||!['created','updated','cancelled'].includes(receipt.outcome)&&!confirmedCancellation
          ||receipt.eventId!==calendarEventId(target.client.calendarId,row.arguments.sourceKey)
          ||receipt.url!==`https://calendar.google.com/calendar/event?eid=${Buffer.from(`${receipt.eventId} ${target.client.calendarId}`).toString('base64url')}`
          ||request.calendarEventId&&request.calendarEventId!==receipt.eventId)continue;
        return true;
      }
      return false;
    },bindTask:async(task,signal)=>{
      if(signal?.aborted)fail('aborted');
      taskEvidence.set(task.uuid,task.info.inputs);
      for(const row of task.info.inputs)batchInputs.set(row.uuid,structuredClone(row.raw_response));
    },getEvidenceReferences:()=>[...observed.values()].filter(row=>validUuid(row.sourceId)&&row.sourceUrl).map(row=>({sourceId:row.sourceId,sourceUrl:row.sourceUrl})),
    getInitialWriteCoverage:()=>[...initialWriteCoverage.values()].map(row=>structuredClone(row)),fragments,now});
    const begin=staged.pipeline.beginCycle;
    staged.pipeline.beginCycle=async args=>{participationProofs.clear();personChoiceReceipts.clear();personChoiceRun={};activeLeaseToken=args.leaseToken;await begin(args);staged.pipeline.setBatchContext(preparedContext);};
    tools.push(...staged.tools);
    workerOperations=bindWorkerOperations(tools);
    return {principal,tools:workerOperations,authorizeEvent,authorizeEvents,resolveClaimSourceIds,prepareBatch,cleanupBatch,validateCompletion,getPersonIdChoices,pipeline:staged.pipeline};
  }
  workerOperations=bindWorkerOperations(tools);
  return {principal,tools:workerOperations,authorizeEvent,authorizeEvents,resolveClaimSourceIds,prepareBatch,cleanupBatch,validateCompletion};
}
