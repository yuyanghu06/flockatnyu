import {readConfig} from '../config.js';
import {readGoogleConfig} from '../google/config.js';
import {createGoogleClient} from '../google/client.js';
import {readCalendarConfig} from '../google/calendar-config.js';
import {createCalendarClient} from '../google/calendar-client.js';
import {readMiroConfig} from '../miro/config.js';
import {createMiroStore} from '../miro/store.js';
import {createMiroClient} from '../miro/client.js';
import {readLiveDiscordConfig} from '../discord/live-config.js';
import {createDiscordStore} from '../discord/store.js';
import {createLiveDiscordClient} from '../discord/live-client.js';
import {createLiveDiscordRetrieval} from '../discord/live-retrieval.js';
import {isDiscordChannelExcluded} from '../discord/discovery.js';
import {createMiroTools} from '../../tools/miro/index.js';
import {GOOGLE_TOOLS,executeGoogleTool} from '../../tools/google/index.js';
import {createLiveRetrievalTools} from '../../tools/discord/index.js';
import {createCalendarTools} from '../../tools/calendar/index.js';
import {createBoundedResults} from './bounded-result.js';
import {canonicalJson,plainObject,validUuid} from './validation.js';

const snowflake=value=>typeof value==='string'&&/^[0-9]{1,20}$/.test(value);
const itemId=value=>typeof value==='string'&&/^[A-Za-z0-9_=-]{1,200}$/.test(value);
const miroUrl=(board,id)=>`https://miro.com/app/board/${encodeURIComponent(board)}/?moveToWidget=${encodeURIComponent(id)}`;
const fail=code=>{throw new Error(code);};
const success=new Set(['ready','empty','partial','unsupported_content']);

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
  const calendarClient=d.calendarClient||createCalendarClient({config:calendarConfig,fetchImpl});
  const calendarTools=d.calendarTools||createCalendarTools({client:calendarClient});
  const miroConfig=d.miroConfig||readMiroConfig(env);
  const miroStore=d.miroStore||createMiroStore({env,fetchImpl});
  const miroClientFactory=d.miroClientFactory||(()=>createMiroClient({config:miroConfig,fetchImpl}));
  const miroTools=d.miroTools||createMiroTools({config:miroConfig,store:miroStore,
    clientFactory:miroClientFactory,now});
  const discordConfig=d.discordConfig||readLiveDiscordConfig(env);
  const discordStore=d.discordStore||createDiscordStore({env,fetchImpl});
  const discordClient=d.discordClient||createLiveDiscordClient({config:discordConfig,fetchImpl});
  const discordTools=d.discordTools||createLiveRetrievalTools({service:createLiveDiscordRetrieval({config:discordConfig,store:discordStore,client:discordClient}),guildId:discordConfig.guildId});
  const calendarSources=[];
  const principal=Object.freeze({id:'update-agent',allowedSourceIds,googleAccess,
    liveDiscord:Object.freeze({mode:'local-operator',guildId:discordConfig.guildId}),
    calendarAccess:true,calendarId:calendarConfig.calendarId,calendarSources});
  const fragments=createBoundedResults();
  const observed=new Map();let prepared=false;
  const cleanupBatch=()=>{prepared=false;calendarSources.length=0;observed.clear();fragments.clear();};

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
      if(scope&&source.kind==='miro'&&source.retrievalMode==='live'&&itemId(source.itemId)&&source.contentAvailable!==false
        &&source.url===miroUrl(source.boardId,source.itemId))observed.set(`miro:${source.boardId}:${source.itemId}`,{sourceUrl:source.url,...scope});
    }
  }
  async function readMiro(name,args,signal) {
    const result=normalize(await miroTools.execute({name,arguments:args,principal,signal}));
    if(result.status==='ready')remember(result);
    return fragments.bound(result);
  }
  async function currentScope(scope,signal) {
    const result=await miroStore.authorizedBoard({boardId:scope.boardId,principal,signal});
    return result?.status==='ready'&&result.data?.board_id===scope.boardId&&result.data.source_id===scope.sourceId&&allowedSourceIds.includes(scope.sourceId);
  }
  async function frameOverview(scope,signal) {
    const authorized=await miroStore.authorizedBoard({boardId:scope.boardId,principal,signal});
    if(authorized?.status!=='ready'||authorized.data?.board_id!==scope.boardId||authorized.data.source_id!==scope.sourceId)fail('forbidden');
    const client=miroClientFactory();
    const metadata=await client.readBoard(scope.boardId,{signal});
    if(String(metadata.id)!==scope.boardId||authorized.data.team_id&&String(metadata.team?.id)!==authorized.data.team_id)fail('forbidden');
    const page=await client.listItems(scope.boardId,{type:'frame',limit:50,signal});
    if(!Array.isArray(page.data)||page.data.length>50||page.data.some(frame=>!itemId(frame.id)||frame.type!=='frame')
      ||new Set(page.data.map(frame=>frame.id)).size!==page.data.length||page.cursor!=null&&(typeof page.cursor!=='string'||!page.cursor||page.cursor.length>8192)
      ||page.total!=null&&(!Number.isInteger(page.total)||page.total<page.data.length))fail('preflight_failed');
    const complete=!page.cursor&&!page.links?.next&&(!Number.isInteger(page.total)||page.data.length===page.total);
    if(!complete&&!page.cursor)fail('preflight_failed');
    const board={id:scope.boardId,title:metadata.name||metadata.title||'',url:`https://miro.com/app/board/${encodeURIComponent(scope.boardId)}/`,modifiedAt:metadata.modifiedAt||null};
    const coverage={complete,returnedCount:page.data.length,reason:'frame_catalogue_only',wholeBoardComplete:false};
    const result=fragments.bound({status:'ready',sourceStatus:complete?'ready':'partial',coverage,
      boardContext:{format:'miro-frame-catalogue-v1',board,items:page.data,nextCursor:page.cursor||null,
        notice:'Original live frame listing metadata only. Inspect items, headings, date cells and legends inside relevant frames. Duplicate month frames and future years may coexist; do not choose the first matching title.'}});
    // Keep every frame title/identity/layout visible together, even when the raw
    // listing needs lossless fragments. No slicing of text or silent omissions.
    const frameIndex=page.data.map(frame=>({id:frame.id,type:frame.type,data:frame.data||null,parent:frame.parent||null,position:frame.position||null,geometry:frame.geometry||null}));
    return {result,frameIndex};
  }
  async function prepareBatch({principal:actor,signal}={}) {
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
      calendarSources.push(Object.freeze({boardId:board.boardId,sourceId:board.sourceId}));
    }
    const context={status:'ready',calendarId:principal.calendarId,miro:{boards:[],coverage:{complete:false,
      reason:'live_frame_catalogue_per_authorized_board',notice:'Fresh bounded frame catalogues only (up to50frames per board, with cursors). Follow relevant board pages, items and relationships; this is not a full-board scan or evidence of event absence.'}}};
    for(const board of boards) {
      const {result,frameIndex}=await frameOverview(board,signal);
      if(result.status!=='ready')fail('preflight_failed');
      context.miro.boards.push({boardId:board.boardId,sourceId:board.sourceId,frameIndex,result});
      if(Buffer.byteLength(canonicalJson(context))>65536)fail('context_limit');
    }
    for(const scope of calendarSources)if(!await currentScope(scope,signal))fail('forbidden');
    if(signal?.aborted)fail('aborted');
    prepared=true;
    return context;
  }

  async function authorizeEvent({event,principal:actor,signal}={}) {
    if(actor!==principal||signal?.aborted||!allowedSourceIds.includes(event?.source_id))return false;
    if(event.source==='gmail')return googleAccess&&event.source_id===gmailSourceId
      &&['email_received','email_received_metadata'].includes(event.event_type);
    if(event.source!=='discord'||!discordConfig.configured||!['message_created','message_updated','message_deleted','messages_deleted'].includes(event.event_type))return false;
    const payload=event.payload,channelId=payload?.channel_id;
    if(!snowflake(channelId)||payload.guild_id!==discordConfig.guildId)return false;
    try {
      // Same current catalogue and live ancestry checks as the collector and
      // live retrieval. Never discover/register or expand a source here.
      const [policyResult,catalogue,metadata,channel]=await Promise.all([
        discordStore.getPolicy({guildId:discordConfig.guildId,signal}),discordStore.listSyncChannels({signal}),
        discordClient.getGuildChannels({signal}),discordClient.getChannel({channelId,signal})]);
      const policy=policyResult?.policy;
      if(policyResult?.status!=='ready'||policy?.guildId!==discordConfig.guildId||!Number.isSafeInteger(policy.revision)||policy.revision<1
        ||policy.paused||policy.discoveryEnabled===false||!Array.isArray(policy.excludedCategoryIds)||!Array.isArray(policy.excludedChannelIds)
        ||![...policy.excludedCategoryIds,...policy.excludedChannelIds].every(snowflake)
        ||catalogue?.status!=='ready'||!Array.isArray(catalogue.channels)||catalogue.channels.length>10000
        ||!catalogue.channels.some(row=>row.enabled===true&&row.guildId===discordConfig.guildId&&row.channelId===channelId&&row.sourceId===event.source_id))return false;
      const validMetadata=(row,expected)=>row?.id===expected&&snowflake(row.id)&&row.guild_id===discordConfig.guildId
        &&Number.isInteger(row.type)&&Object.hasOwn(row,'parent_id')&&(row.parent_id===null||snowflake(row.parent_id));
      if(!Array.isArray(metadata)||metadata.length>500||metadata.some(row=>!validMetadata(row,row?.id))
        ||new Set(metadata.map(row=>row.id)).size!==metadata.length||!validMetadata(channel,channelId)||![0,5,10,11,12].includes(channel.type))return false;
      const channels=new Map(metadata.map(row=>[row.id,row]));
      const listed=channels.get(channel.id);
      if(listed&&(listed.type!==channel.type||listed.parent_id!==channel.parent_id))return false;
      channels.set(channel.id,channel);
      if([10,11,12].includes(channel.type)) {
        const parent=await discordClient.getChannel({channelId:channel.parent_id,allowContainer:true,signal});
        if(!validMetadata(parent,channel.parent_id)||![0,5,15,16].includes(parent.type))return false;
        const listedParent=channels.get(parent.id);
        if(listedParent&&(listedParent.type!==parent.type||listedParent.parent_id!==parent.parent_id))return false;
        channels.set(parent.id,parent);
      }
      if(isDiscordChannelExcluded({channel,channels,policy}))return false;
      const [latest,rows]=await Promise.all([discordStore.getPolicy({guildId:discordConfig.guildId,signal}),discordStore.listSyncChannels({signal})]);
      return latest?.status==='ready'&&canonicalJson(latest.policy)===canonicalJson(policy)&&rows?.status==='ready'
        &&Array.isArray(rows.channels)&&rows.channels.some(row=>row.enabled===true&&row.guildId===discordConfig.guildId&&row.channelId===channelId&&row.sourceId===event.source_id);
    }catch{return false;}
  }

  const requirePrepared=context=>prepared&&context?.principal===principal&&!context.signal?.aborted;
  const tools=[...miroTools.tools.map(tool=>({...tool,readOnly:true,execute:async(args,context)=>requirePrepared(context)?readMiro(tool.name,args,context.signal):{status:'forbidden'}})),
    ...GOOGLE_TOOLS.filter(tool=>['search_gmail','read_gmail'].includes(tool.name)).map(tool=>({...tool,readOnly:true,
      execute:async(args,context)=>requirePrepared(context)&&googleAccess?fragments.bound(normalize(await executeGoogleTool({name:tool.name,arguments:args,principal,client:googleClient,signal:context.signal}))):{status:'forbidden'}})),
    ...discordTools.tools.map(tool=>({...tool,readOnly:true,execute:async(args,context)=>requirePrepared(context)?fragments.bound(normalize(await discordTools.execute({name:tool.name,arguments:args,principal,signal:context.signal,timeContext:{now:now().toISOString(),timeZone:config.timezone}}))):{status:'forbidden'}})),
    ...calendarTools.tools.map(tool=>({...tool,execute:async(args,context)=>{
      if(!requirePrepared(context))return {status:'forbidden'};
      if(tool.readOnly!==true) {
        const scope=observed.get(args.sourceKey);
        if(!scope||scope.sourceUrl!==args.sourceUrl||!await currentScope(scope,context.signal))return {status:'forbidden_source'};
      }
      return fragments.bound(normalize(await calendarTools.execute({name:tool.name,arguments:args,principal,signal:context.signal})));
    }})),
    {...fragments.tool,execute:(args,context)=>requirePrepared(context)?fragments.tool.execute(args,context):{status:'forbidden'}}];
  return {principal,tools,authorizeEvent,prepareBatch,cleanupBatch};
}
