import {readConfig} from '../config.js';
import {readGoogleConfig} from '../google/config.js';
import {createGoogleClient} from '../google/client.js';
import {sourceMailbox} from '../google/mailbox.js';
import {readCalendarConfig} from '../google/calendar-config.js';
import {createCalendarClient,calendarEventId} from '../google/calendar-client.js';
import {readMiroMcpConfig} from '../miro/mcp-config.js';
import {createMiroStore} from '../miro/store.js';
import {createMiroMcpClient} from '../miro/mcp-client.js';
import {readLiveDiscordConfig} from '../discord/live-config.js';
import {createDiscordStore} from '../discord/store.js';
import {createLiveDiscordClient} from '../discord/live-client.js';
import {createLiveDiscordRetrieval} from '../discord/live-retrieval.js';
import {isDiscordChannelExcluded} from '../discord/discovery.js';
import {createMiroMcpTools} from '../../tools/miro/mcp.js';
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
const itemId=value=>typeof value==='string'&&/^[A-Za-z0-9_=-]{1,200}$/.test(value);
const miroUrl=(board,id)=>`https://miro.com/app/board/${encodeURIComponent(board)}/?moveToWidget=${encodeURIComponent(id)}`;
const fail=code=>{throw new Error(code);};
const success=new Set(['ready','empty','partial','unsupported_content']);
// Only transient read-only navigation failures may defer one board. Access,
// configuration and malformed-content failures remain fatal preflight errors.
const navigationOutages=new Set(['tool_result_error','request_timeout','unavailable',
  'quota_exhausted','budget_exhausted','reconciliation_deferred','quota_state_unavailable']);
const safeRetryAt=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
  &&Number.isFinite(Date.parse(value))&&new Date(value).toISOString()===value?value:undefined;
const evidenceKey=(sourceId,sourceUrl)=>canonicalJson([sourceId,sourceUrl]);
export function discordCalendarIntent(content,{cancel=false}={}) {
  if(typeof content!=='string'||!content.trim())return false;
  const text=content.toLowerCase();
  if(/\brsvp\s*[:=-]?\s*(?:yes|no|maybe|accepted|declined|going|not going)\b/.test(text))return false;
  if(/\b(?:i|we)(?:'m|'re| am| are)?\s+(?:plan(?:ning)?|intend(?:ing)?|want(?:ing)?|hope|hoping)\s+to\s+(?:attend|join|go)\b/.test(text))return false;
  if(/\b(?:not|never|no longer)\s+(?:cancelled|canceled|called off)\b/.test(text))return false;
  if(/\b(?:i(?:'m|'ll| am| will|’m)?|we(?:'re| are| will)?|[a-z]+ (?:is|are|will))\s+(?:not\s+)?(?:attend(?:ing)?|join(?:ing)?|go(?:ing)?|be there|can help)\b/.test(text))return false;
  if(/^\s*(?:i(?:'ll| will| am|'m|’m)?\s+(?:attend|join|go(?:ing)?|be there|study|studying)|count me in|rsvp\b|i can help)/i.test(text))return false;
  if(!/\b(?:tech\s*@?\s*nyu|club|eboard)\b/.test(text)||!/\b(?:event|meeting|workshop|hackathon|social|study (?:group|jam|session))\b/.test(text))return false;
  if(/\b(?:maybe|might|proposed|proposal)\b/.test(text)||/\b(?:cancelled|canceled|rescheduled)\s*\?/.test(text))return false;
  const cancelled=/\b(?:cancelled|canceled|called off)\b/.test(text);
  if(cancel)return cancelled&&!/\b(?:not|never|no longer|isn't|wasn't|hasn't|don't)\b|["“”]/.test(text);
  return !cancelled&&(/\b(?:scheduled|rescheduled|announc\w*|hosting|moved|updated|confirmed)\b/.test(text)
    ||/\b(?:tech\s*@?\s*nyu|club|eboard)\s*(?:event|meeting|workshop|hackathon|social|study (?:group|jam|session))\b/.test(text));
}

/** Bundled server-owned adapter. Construction does no network I/O. Dependencies
 * are an explicit fixture seam; event/model data never selects implementations. */
export function createAutomationAdapters({env=process.env,config,fetchImpl=globalThis.fetch,now=()=>new Date(),dependencies={}}={}) {
  const d=dependencies;
  const allowedSourceIds=Object.freeze([...new Set(readConfig(env).allowedSourceIds)]);
  const googleConfig=d.googleConfig||readGoogleConfig(env);
  const googleClient=d.googleClient||createGoogleClient({config:googleConfig,fetchImpl});
  const gmailSourceId=(env.AGENT_GMAIL_SOURCE_ID||'').trim();
  const googleAccess=googleConfig.configured===true&&validUuid(gmailSourceId)&&allowedSourceIds.includes(gmailSourceId);
  const calendarConfig=d.calendarConfig||readCalendarConfig(env);
  const calendarSourceId=calendarConfig.sourceId??(env.AGENT_CALENDAR_SOURCE_ID||'').trim();
  const calendarMapConfigured=validUuid(calendarSourceId)&&allowedSourceIds.includes(calendarSourceId);
  const calendarClient=d.calendarClient||createCalendarClient({config:calendarConfig,fetchImpl});
  const calendarTools=d.calendarTools||createCalendarTools({client:calendarClient});
  const miroConfig=d.miroConfig||readMiroMcpConfig(env);
  const miroStore=d.miroStore||createMiroStore({env,fetchImpl});
  const miroClient=d.miroClient||(!d.miroTools?createMiroMcpClient({config:miroConfig,fetchImpl,env,now,lane:'background'}):undefined);
  const miroTools=d.miroTools||createMiroMcpTools({config:miroConfig,store:miroStore,client:miroClient,now});
  const discordConfig=d.discordConfig||readLiveDiscordConfig(env);
  const discordStore=d.discordStore||createDiscordStore({env,fetchImpl});
  const discordClient=d.discordClient||createLiveDiscordClient({config:discordConfig,fetchImpl});
  const liveDiscordService=d.liveDiscordService||createLiveDiscordRetrieval({config:discordConfig,store:discordStore,client:discordClient});
  const discordTools=d.discordTools||createLiveRetrievalTools({service:liveDiscordService,guildId:discordConfig.guildId});
  const mapSourceAuthorizer=d.mapSourceAuthorizer||createMapSourceAuthorizer({liveDiscordService,miroStore,googleClient,gmailSourceId,calendarClient,calendarSourceId});
  const mapEventService=d.mapEventService||createMapEventService({store:d.mapEventStore||createMapEventStore({env,fetchImpl}),authorizeSource:mapSourceAuthorizer,now});
  const mapTools=createMapTools({service:mapEventService});
  const calendarSources=[];
  const principal=Object.freeze({id:'update-agent',allowedSourceIds,googleAccess,
    liveDiscord:Object.freeze({mode:'local-operator',guildId:discordConfig.guildId}),
    calendarAccess:true,calendarId:calendarConfig.calendarId,calendarSources});
  const fragments=createBoundedResults();
  const observed=new Map(), batchInputs=new Map(), linkedIdentities=new Map();
  const calendarOccurrences=new Map(), projected=new Set(), pendingCalendarReads=new Set(), unprojectableCalendar=new Set();
  const cancellationIntents=new Set(), fixedBuildings=new Map();
  const calendarWindows=new Map();
  const knownCalendarEvents=new Map();
  const deferredMiro=new Map();
  let prepared=false,reconciliationWindow,windowComplete=false,nextCalendarPage,catalogueRead=false;
  const cleanupBatch=()=>{prepared=false;calendarSources.length=0;observed.clear();batchInputs.clear();linkedIdentities.clear();fragments.clear();
    calendarOccurrences.clear();projected.clear();pendingCalendarReads.clear();unprojectableCalendar.clear();cancellationIntents.clear();fixedBuildings.clear();calendarWindows.clear();knownCalendarEvents.clear();deferredMiro.clear();reconciliationWindow=undefined;windowComplete=false;nextCalendarPage=undefined;catalogueRead=false;};
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

  function normalize(result) {
    if(!plainObject(result))fail('tool_failed');
    // Unsupported content is usable coverage only when the tool returned an
    // actual context/notice. An unsupported-content provider error stays failed.
    if(!success.has(result.status)||result.status==='unsupported_content'&&!result.boardContext)return result;
    return {...result,sourceStatus:result.status,status:'ready'};
  }
  function remember(result) {
    for(const source of result.sources||[]) {
      const scope=calendarSources.find(row=>row.boardId===source.boardId&&row.sourceId===source.sourceId);
      if(!scope||source.kind!=='miro'||source.retrievalMode!=='live'||!itemId(source.itemId)
        ||source.url!==miroUrl(source.boardId,source.itemId))continue;
      // Search hits and headings never authorize writes. Only the exact live
      // content identity supplied by our MCP adapter can support a mutation.
      if(source.contentAvailable!==true||!['item','table_row'].includes(source.evidenceKind)||typeof source.sourceKey!=='string')continue;
      const key=/^miro:([A-Za-z0-9_=-]{1,200}):([A-Za-z0-9_=-]{1,200})(?::row:([A-Za-z0-9_=-]{1,200}))?$/.exec(source.sourceKey);
      if(!key||key[1]!==source.boardId||key[2]!==source.itemId
        ||(source.evidenceKind==='table_row')!==Boolean(key[3]))continue;
      observed.set(source.sourceKey,{provider:'miro',sourceUrl:source.url,...scope});
    }
  }
  function deferMiro(boardId,result) {
    const retryAt=safeRetryAt(result.retryAt);
    const deferred={status:result.status,...(retryAt?{retryAt}:{})};
    deferredMiro.set(boardId,deferred);
    // Incomplete reconciliation cannot authorize later mutations from this board,
    // including observations made before a mid-batch quota response.
    for(const [key,scope] of observed)if(scope.provider==='miro'&&scope.boardId===boardId)observed.delete(key);
    return deferred;
  }
  function deferredRead(deferred) {
    return {status:'ready',sourceStatus:['tool_result_error','request_timeout','unavailable'].includes(deferred.status)?'unavailable':deferred.status,deferred:true,contentAvailable:false,reason:'miro_navigation_deferred',sources:[],
      ...(deferred.retryAt?{retryAt:deferred.retryAt}:{}),coverage:{complete:false,reason:'miro_navigation_deferred'},
      notice:'Miro reconciliation is deferred. Skip this board for the rest of this batch and until the governor allows another read; honor retryAt when present. Only unrelated authorized Discord/Calendar work may proceed. No Miro facts or successful synchronization were established.'};
  }
  async function readMiro(name,args,signal) {
    const scope=calendarSources.find(row=>row.boardId===args?.boardId);
    if(deferredMiro.has(args?.boardId)) {
      if(!scope||!await currentScope(scope,signal))return {status:'forbidden'};
      return deferredRead(deferredMiro.get(args.boardId));
    }
    const result=normalize(await miroTools.execute({name,arguments:args,principal,signal}));
    if(scope&&navigationOutages.has(result.status)) {
      if(!await currentScope(scope,signal))return {status:'forbidden'};
      return deferredRead(deferMiro(args.boardId,result));
    }
    if(result.status==='ready')remember(result);
    return fragments.bound(result);
  }
  async function currentScope(scope,signal) {
    const result=await miroStore.authorizedBoard({boardId:scope.boardId,principal,signal});
    return result?.status==='ready'&&result.data?.board_id===scope.boardId&&result.data.source_id===scope.sourceId&&allowedSourceIds.includes(scope.sourceId)
      &&(!miroConfig.teamId||result.data.team_id===miroConfig.teamId)
      &&(!Object.hasOwn(scope,'teamId')||(result.data.team_id??null)===scope.teamId);
  }
  async function boardOverview(scope,signal) {
    if(miroTools.transport!=='mcp'||typeof miroTools.prepareBoard!=='function')fail('preflight_failed');
    const overview=normalize(await miroTools.prepareBoard({boardId:scope.boardId,principal,signal}));
    if(navigationOutages.has(overview.status)) {
      if(!await currentScope(scope,signal))fail('forbidden');
      const deferred=deferMiro(scope.boardId,overview);
      return {result:{...deferredRead(deferred),status:'unavailable'},
        contextSummary:{format:'miro-navigation-unavailable-v1',status:'unavailable',reason:overview.status,
          ...(deferred.retryAt?{retryAt:deferred.retryAt}:{}),
          notice:'Miro reconciliation is deferred until the governor allows another read; honor retryAt when present. This is not an empty board, source evidence or successful synchronization.'}};
    }
    if(overview.status!=='ready'||!plainObject(overview.boardContext))fail('preflight_failed');
    return {result:fragments.bound(overview),contextSummary:overview.boardContext};
  }
  async function prepareBatch({inputs=[],principal:actor,signal}={}) {
    cleanupBatch();
    if(actor!==principal||!config?.enabled||signal?.aborted)fail(signal?.aborted?'aborted':'forbidden');
    if(!allowedSourceIds.length||allowedSourceIds.length>500||!allowedSourceIds.every(validUuid)
      ||!calendarConfig.configured||!calendarClient.configured||!miroConfig.configured||!miroStore.configured||!miroTools.configured)fail('not_configured');
    if(!Array.isArray(miroConfig.boardIds)||!miroConfig.boardIds.length||miroConfig.boardIds.length>8)fail('context_limit');
    const access=await calendarClient.preflight({signal});
    if(access?.status!=='ready'||access.calendarId!==principal.calendarId||!['writer','owner'].includes(access.accessRole))fail('preflight_failed');
    const catalogue=normalize(await miroTools.execute({name:'list_miro_boards',arguments:{},principal,signal}));
    const boards=catalogue.boardContext?.boards;
    if(catalogue.status!=='ready'||!Array.isArray(boards)||!boards.length||boards.length>8
      ||new Set(boards.map(board=>board.boardId)).size!==boards.length)fail('preflight_failed');
    for(const board of boards) {
      if(!miroConfig.boardIds.includes(board.boardId)||!validUuid(board.sourceId)||!allowedSourceIds.includes(board.sourceId)
        ||!await currentScope(board,signal))fail('forbidden');
      calendarSources.push(Object.freeze({boardId:board.boardId,sourceId:board.sourceId,
        ...(Object.hasOwn(board,'teamId')?{teamId:board.teamId}:{})}));
    }
    const clock=new Date(now()).getTime();
    const context={status:'ready',calendarId:principal.calendarId,
      calendarMap:{configured:calendarMapConfigured,...(calendarMapConfigured?{sourceId:calendarSourceId}:{}),
        notice:'Calendar map provenance requires the configured source UUID in the shared allowlist. Otherwise defer Calendar-to-map writes; never borrow a Miro, Gmail or Discord source UUID.'},
      reconciliationWindow:{timeMin:new Date(clock-86400000).toISOString(),timeMax:new Date(clock+8*86400000).toISOString(),
        notice:'Bounded rolling window covering active overlaps and the upcoming week. List every page in this exact window after Miro reconciliation; additional concretely supported event windows may be read separately.'},
      miro:{boards:[],coverage:{complete:false,
      reason:'live_mcp_context_per_authorized_board',notice:'Fresh bounded board navigation only. Search relevant content, then read canvas items or native table rows. Follow continuations; this is not a full-board scan or evidence of event absence.'}}};
    reconciliationWindow={timeMin:context.reconciliationWindow.timeMin,timeMax:context.reconciliationWindow.timeMax};
    miroClient?.beginBackgroundBatch?.();
    for(const board of boards) {
      const {result,contextSummary}=await boardOverview(board,signal);
      context.miro.boards.push({boardId:board.boardId,sourceId:board.sourceId,
        contextSummary,result});
      if(Buffer.byteLength(canonicalJson(context))>65536)fail('context_limit');
    }
    if(deferredMiro.size) {
      context.miro.deferredBoards=[...deferredMiro.keys()];
      context.miro.reconciliationStatus='deferred';context.miro.syncComplete=false;
      context.miro.coverage.reason='miro_navigation_deferred';
    }
    for(const scope of calendarSources)if(!await currentScope(scope,signal))fail('forbidden');
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
      if(!allowedSourceIds.includes(event?.source_id))return false;
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
      // live retrieval. Never discover/register or expand a source here.
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
      return !signal?.aborted&&latest?.status==='ready'&&canonicalJson(latest.policy)===canonicalJson(policy)&&validCatalogue(rows);
    }catch{return false;}
  }

  const requirePrepared=context=>prepared&&context?.principal===principal&&!context.signal?.aborted;
  async function supportingSource(sourceId,sourceUrl,context,{allowCalendar=true,sourceRecordId}={}) {
    if(!requirePrepared(context)||!Array.isArray(context.inputIds)||!context.inputIds.length
      ||!context.inputIds.every(id=>batchInputs.has(id)))return false;
    const scope=[...observed.values()].find(row=>row.sourceId===sourceId&&row.sourceUrl===sourceUrl);
    if(scope?.provider==='miro'&&await currentScope(scope,context.signal))return true;
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
  function rememberProjection(event,buildings) {
    if(catalogueRead&&matchesCalendarProjection(event,calendarOccurrences.get(event.source_record_id),buildings))projected.add(event.source_record_id);
  }
  async function validateCompletion({principal:actor,signal}={}) {
    if(!prepared||actor!==principal||signal?.aborted)return {status:'pending',reason:'batch_not_prepared'};
    const deferred=deferredMiro.size?{miroReconciliation:{status:'deferred',boardIds:[...deferredMiro.keys()],syncComplete:false}}:{};
    if(!calendarMapConfigured)return {status:'ready',...deferred};
    const nextActions=[];
    for(const eventId of pendingCalendarReads)if(nextActions.length<5)nextActions.push({name:'read_calendar_event',arguments:{eventId}});
    if(!windowComplete&&nextActions.length<5)nextActions.push({name:'list_calendar_events',arguments:{...reconciliationWindow,...(nextCalendarPage?{pageToken:nextCalendarPage}:{})}});
    for(const [eventId,event] of calendarOccurrences)if(!projected.has(eventId)&&nextActions.length<5)
      nextActions.push({name:'read_map_events',arguments:{sourceId:calendarSourceId,sourceRecordId:eventId},
        requiredProjection:{name:event.title,kind:'scheduled_event',source_record_id:eventId,source_url:event.url,reported_at:event.updatedAt||event.createdAt||null,time_zone:event.start?.timeZone||config.timezone,location:event.location,start:event.start,end:event.end}});
    return windowComplete&&!pendingCalendarReads.size&&!unprojectableCalendar.size&&[...calendarOccurrences.keys()].every(id=>projected.has(id))?{status:'ready',...deferred}:
      {status:'pending',...deferred,reason:'calendar_projection_incomplete',notice:'finish_batch did not complete. Perform these exact reads, then upsert missing/stale Calendar occurrences as complete scheduled_event map snapshots. Preserve source identity and original timestamps. Irrelevant triggering inputs do not waive this batch work.',nextActions,
        blockedCount:unprojectableCalendar.size,outstandingCount:pendingCalendarReads.size+unprojectableCalendar.size+[...calendarOccurrences.keys()].filter(id=>!projected.has(id)).length+(windowComplete?0:1)};
  }
  const stripManaged=event=>Object.fromEntries(Object.entries(event).filter(([key,value])=>!['created_at','updated_at'].includes(key)&&value!==null));
  const stripRelation=row=>Object.fromEntries(Object.entries(row).filter(([key,value])=>!['event_id','created_at','updated_at'].includes(key)&&value!==null));
  async function prepareMapArguments(args,context) {
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
    if(result?.status==='ready')rememberProjection(args.event,args.buildings);
    return result;
  }
  const tools=[...miroTools.tools.map(tool=>{
    const parameters=structuredClone(tool.parameters);
    if(parameters?.properties?.boardId&&Array.isArray(miroConfig.boardIds)&&miroConfig.boardIds.length&&miroConfig.boardIds.every(itemId))
      parameters.properties.boardId={...parameters.properties.boardId,enum:[...miroConfig.boardIds]};
    return {...tool,parameters,readOnly:true,execute:async(args,context)=>requirePrepared(context)?readMiro(tool.name,args,context.signal):{status:'forbidden'}};
  }),
    ...GOOGLE_TOOLS.filter(tool=>['search_gmail','read_gmail'].includes(tool.name)).map(tool=>({...tool,readOnly:true,
      execute:async(args,context)=>{
        if(!requirePrepared(context)||!googleAccess)return {status:'forbidden'};
        const result=normalize(await executeGoogleTool({name:tool.name,arguments:args,principal,client:googleClient,signal:context.signal}));
        if(tool.name==='read_gmail'&&result.status==='ready')for(const source of result.sources||[])
          if(source.kind==='gmail'&&source.externalId===args.messageId&&source.url===`https://mail.google.com/mail/u/0/#all/${args.messageId}`)
            observed.set(`gmail:${args.messageId}`,{provider:'gmail',sourceId:gmailSourceId,sourceUrl:source.url,sender:sourceMailbox(source.from)});
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
      if(tool.name==='list_calendar_events'&&args.pageToken!==undefined) {
        const previous=calendarWindows.get(canonicalJson([Date.parse(args.timeMin),Date.parse(args.timeMax)]));
        if(!previous||previous.complete||previous.nextPageToken!==args.pageToken) {
          const completion=await validateCompletion({principal,signal:context.signal});
          return {status:'invalid_request',reason:'unobserved_calendar_page_token',nextPageToken:previous?.nextPageToken??null,
            notice:'Only the exact nextPageToken returned for this same time window may be used. A null token means no further page was returned; use already observed events for projection. No HTTP request was made.',
            nextActions:completion.nextActions||[]};
        }
      }
      if(tool.readOnly!==true) {
        const scope=observed.get(args.sourceKey);
        if(!scope||scope.sourceUrl!==args.sourceUrl)return {status:'forbidden_source'};
        if(scope.provider==='miro') {
          if(!await currentScope(scope,context.signal))return {status:'forbidden_source'};
        } else if(scope.provider==='discord') {
          if(!await supportingSource(scope.sourceId,scope.sourceUrl,context,{allowCalendar:false})
            ||!discordCalendarIntent(scope.content,{cancel:tool.name==='cancel_calendar_event'}))return {status:'forbidden_source'};
          const latest=await liveDiscordService.readMessages({principal,channelId:scope.channelId,messageId:scope.messageId,context:false,limit:1,signal:context.signal});
          const original=latest?.sources?.find(row=>row.sourceId===scope.sourceId&&row.url===scope.sourceUrl&&row.guildId===scope.guildId&&row.channelId===scope.channelId&&row.messageId===scope.messageId);
          if(latest?.status!=='ready'||latest.coverage?.textTruncated!==false||!original||original.excerpt!==scope.content
            ||scope.authorId&&original.authorId!==scope.authorId)return {status:'forbidden_source'};
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
            if(![...calendarWindows.values()].some(window=>window.complete&&start>=window.from&&start<window.to))return {status:'forbidden_source'};
            // A separately known event cannot be overwritten or duplicated by
            // guessing a new source identity from a title/date or linked board.
            if([...knownCalendarEvents.values()].some(event=>event.sourceUrl!==scope.sourceUrl&&(
              event.sourceUrl&&scope.content.includes(event.sourceUrl)||event.title?.trim().toLowerCase()===args.title?.trim().toLowerCase()
              &&sameInstant(event.start?.dateTime||event.start?.date,args.start?.dateTime||args.start?.date))))return {status:'conflict'};
          }
        } else return {status:'forbidden_source'};
      }
      const result=normalize(await calendarTools.execute({name:tool.name,arguments:args,principal,signal:context.signal}));
      if(result.status==='ready'&&calendarMapConfigured) {
        if(tool.readOnly!==true&&typeof result.eventId==='string') {
          pendingCalendarReads.add(result.eventId);
          if(tool.name==='cancel_calendar_event')cancellationIntents.add(result.eventId);
        }
        if(tool.name==='read_calendar_event'&&cancellationIntents.has(args.eventId)&&Array.isArray(result.events)&&result.events.length===0) {
          // Exact verified absence after explicit supported cancellation means
          // the source authorizer also hides any old map record. No fabricated
          // map deletion or missing-source inference is needed.
          pendingCalendarReads.delete(args.eventId);calendarOccurrences.delete(args.eventId);projected.delete(args.eventId);
        }
        if(tool.name==='list_calendar_events'&&sameInstant(args.timeMin,reconciliationWindow.timeMin)&&sameInstant(args.timeMax,reconciliationWindow.timeMax)
          &&(args.pageToken===undefined||args.pageToken===nextCalendarPage)) {
          nextCalendarPage=result.nextPageToken||undefined;windowComplete=!result.nextPageToken&&result.coverage?.complete!==false;
        }
      }
      if(result.status==='ready'&&tool.name==='list_calendar_events') {
        const from=Date.parse(args.timeMin),to=Date.parse(args.timeMax),key=canonicalJson([from,to]);
        const prior=calendarWindows.get(key);
        if(args.pageToken===undefined||args.pageToken===prior?.nextPageToken)calendarWindows.set(key,{from,to,nextPageToken:result.nextPageToken||undefined,complete:!result.nextPageToken&&result.coverage?.complete!==false});
      }
      if(result.status==='ready'&&tool.readOnly===true)for(const event of result.events||[])if(typeof event?.eventId==='string')knownCalendarEvents.set(event.eventId,structuredClone(event));
      if(result.status==='ready'&&tool.readOnly===true&&calendarMapConfigured) {
        result.sources=[];
        for(const event of result.events||[]) {
          if(typeof event.eventId!=='string'||!/^[a-zA-Z0-9_-]{5,200}$/.test(event.eventId)){unprojectableCalendar.add(event.eventId??'invalid_event');continue;}
          const sourceUrl=`https://calendar.google.com/calendar/event?eid=${Buffer.from(`${event.eventId} ${principal.calendarId}`).toString('base64url')}`;
          if(event.url!==sourceUrl)continue;
          if(canonicalJson(calendarOccurrences.get(event.eventId)||null)!==canonicalJson(event))projected.delete(event.eventId);
          calendarOccurrences.set(event.eventId,structuredClone(event));
          if(tool.name==='read_calendar_event'&&args.eventId===event.eventId)pendingCalendarReads.delete(event.eventId);
          observed.set(`calendar:${event.eventId}`,{provider:'calendar',sourceId:calendarSourceId,sourceUrl,eventId:event.eventId});
          result.sources.push({kind:'google_calendar',retrieval:'live',sourceId:calendarSourceId,externalId:event.eventId,url:sourceUrl});
        }
      }
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
        for(const event of result.events||[])rememberProjection(event,(result.event_buildings||[]).filter(row=>row.event_id===event.id));
        if(args.sourceId===calendarSourceId&&Array.isArray(result.events)&&result.events.length===0&&calendarOccurrences.get(args.sourceRecordId)?.status==='cancelled')projected.add(args.sourceRecordId);
      }
      return fragments.bound(result);
    }})),
    {...fragments.tool,execute:(args,context)=>requirePrepared(context)?fragments.tool.execute(args,context):{status:'forbidden'}}];
  return {principal,tools,authorizeEvent,authorizeEvents,prepareBatch,cleanupBatch,validateCompletion};
}
