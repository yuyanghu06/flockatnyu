import { createGmailSendClient } from './google/gmail-send.js';
import { createGmailSendStore } from './gmail-send-store.js';
import { createGmailSendService } from './gmail-send-service.js';
import { createGmailSendTools } from '../tools/gmail-send/index.js';
import {SOURCE_TOOL_TIMEOUT_MS} from './source-timeout.js';
import {createManualRunStore} from './automation/manual-runs.js';
import { createApp } from './app.js';
import {createProvider} from './providers/index.js';
import {createChatRunner} from './chat-runner.js';
import {readDiscordChatConfig} from './discord/chat-config.js';
import {createDiscordChatAccess} from './discord/chat-access.js';
import {createDiscordDraftTools} from '../tools/discord/draft.js';
import {createDiscordChatClient} from './discord/chat-client.js';
import {createDiscordChatBridge} from './discord/chat-bridge.js';
import {createDiscordChatContextLoader,createDiscordUserDirectory} from './discord/chat-context.js';
import {createAuditLogger} from './model-audit.js';
import {startAuditMaintenance} from './audit-lifecycle.js';
import { readConfig } from './config.js';
import { createDiscordStore } from './discord/store.js';
import { readDiscordConfig } from './discord/config.js';
import { readLiveDiscordConfig } from './discord/live-config.js';
import { createLiveDiscordClient } from './discord/live-client.js';
import { createLiveDiscordRetrieval } from './discord/live-retrieval.js';
import { createLiveChatTools } from '../tools/discord/live-summary.js';
import { readGoogleConfig } from './google/config.js';
import { createGoogleClient } from './google/client.js';
import { GOOGLE_TOOLS, executeGoogleTool } from '../tools/google/index.js';
import { createCalendarClient } from './google/calendar-client.js';
import { createChatCalendarTools } from '../tools/calendar/chat.js';
import {readCalendarConfig,readMemberPlansConfig} from './google/calendar-config.js';
import { readDiscordLiveSummaryConfig } from './discord/live-summary-config.js';
import {readMiroMcpConfig} from './miro/mcp-config.js';
import {createMiroMcpClient} from './miro/mcp-client.js';
import {createMiroStore} from './miro/store.js';
import {createMiroMcpTools} from '../tools/miro/mcp.js';
import {createMapPresenceService} from './map/presence.js';
import {createMapAvatarService} from './map/avatars.js';
import {createMapSourceAuthorizer,withChatMapSource} from './map/source-access.js';
import {createMapEventStore,createMapEventService} from './map/events.js';
import {createMapTools} from '../tools/map/index.js';
import {createChatMapTools} from '../tools/map/chat.js';
import {createBugReportStore} from './bug-reports.js';
import {createBugReportTools} from '../tools/bug-reports/index.js';
import {createMemoryStore} from './memory.js';
import {createMemoryTools} from '../tools/memory/index.js';
import {createContactsStore} from './contacts.js';
import {createTregPeopleClient,createTregContactsImporter} from './treg-people.js';
import {createTregEnrichmentClient} from './treg-enrich.js';
import {createTregTools} from '../tools/treg/index.js';
import {createContactsTools} from '../tools/contacts/index.js';
import {readAttioConfig} from './attio/config.js';
import {createAttioClient} from './attio/client.js';
import {createAttioTools} from '../tools/attio/index.js';

export function createRuntimeServices({ config = readConfig() } = {}) {
const audit=createAuditLogger();
startAuditMaintenance(audit);
const discordConfig = readDiscordConfig();
const discordStore = createDiscordStore(), liveConfig = readLiveDiscordConfig();
const discordClient = createLiveDiscordClient({config:liveConfig});
const liveDiscordService = createLiveDiscordRetrieval({ config: liveConfig, store: discordStore, client: discordClient });
const summaryConfig = readDiscordLiveSummaryConfig();
const liveDiscordTools = createLiveChatTools({ service: liveDiscordService, guildId: liveConfig.guildId, config: summaryConfig });
const googleClient = createGoogleClient({ config: readGoogleConfig() });
const calendarConfig = readCalendarConfig();
const calendarClient = createCalendarClient({config:calendarConfig});
const memberPlansConfig = readMemberPlansConfig();
const memberPlansClient = createCalendarClient({config:memberPlansConfig});
const chatCalendarTools = createChatCalendarTools({ client:calendarClient, sourceId:calendarConfig.sourceId });
const googleTools = {
  tools: [...GOOGLE_TOOLS, ...chatCalendarTools.tools],
  execute: options => chatCalendarTools.tools.some(tool => tool.name === options.name)
    ? chatCalendarTools.execute(options)
    : executeGoogleTool({ ...options, client: googleClient }),
  createRequest: context => {
    const calendar = chatCalendarTools.createRequest(context);
    return {
      tools: [...GOOGLE_TOOLS, ...calendar.tools],
      execute: options => calendar.tools.some(tool => tool.name === options.name)
        ? calendar.execute(options)
        : executeGoogleTool({ ...options, client: googleClient }),
    };
  },
};
const miroStore = createMiroStore();
const miroConfig = readMiroMcpConfig();
const miroTools = createMiroMcpTools({config: miroConfig, store: miroStore, client: createMiroMcpClient({config: miroConfig})});
const mapStore = createMapEventStore();
const mapAvatarService = createMapAvatarService();
const authorizeMapSource = createMapSourceAuthorizer({liveDiscordService, miroStore, googleClient, store:mapStore,allowChatMapUpdates:true,
  gmailSourceId:process.env.AGENT_GMAIL_SOURCE_ID?.trim(),calendarClient,calendarSourceId:calendarConfig.sourceId,calendarTargets:memberPlansConfig.configured?[{client:memberPlansClient,sourceId:memberPlansConfig.sourceId}]:[]});
const sourcePresenceService = createMapPresenceService({store:mapStore,production:config.production, authorizeSource:authorizeMapSource});
// Only authenticated web/Discord calls receive declaration access. The worker
// keeps its independent source grants and original-evidence checks.
const mapPresenceService = {...sourcePresenceService,
  read:options=>sourcePresenceService.read({...options,principal:withChatMapSource(options?.principal)})};
const sourceMapService = createMapEventService({store:mapStore,authorizeSource:authorizeMapSource,timeoutMs:SOURCE_TOOL_TIMEOUT_MS});
const mapService = {configured:sourceMapService.configured,
  ...Object.fromEntries(['read','lookup','upsert'].map(method=>[method,options=>sourceMapService[method]({...options,principal:withChatMapSource(options?.principal)})]))};
const mapTools = createChatMapTools({mapTools:createMapTools({service:mapService}),
  store:mapStore,publicOrigin:process.env.PUBLIC_ORIGIN});
const bugReportTools = createBugReportTools({store: createBugReportStore()});
const memoryTools = createMemoryTools({store: createMemoryStore()});
const gmailSendService = createGmailSendService({client:createGmailSendClient(),store:createGmailSendStore()});
const gmailSendTools = createGmailSendTools({service:gmailSendService});
const contactsStore = createContactsStore();
const contactsTools = createContactsTools({store: contactsStore});
const tregPeopleClient = createTregPeopleClient();
const tregContactsImporter = createTregContactsImporter({client:tregPeopleClient,contactsStore});
const tregTools = createTregTools({peopleClient:tregPeopleClient,enrichmentClient:createTregEnrichmentClient({feature:'chat-contact-enrichment'})});
const attioConfig = readAttioConfig();
const attioTools = createAttioTools({config:attioConfig,client:createAttioClient({config:attioConfig})});
const plannerRuns = createManualRunStore();
return {config,audit,provider:createProvider(config,{audit}),mapPresenceService,mapAvatarService,mapTools,plannerRuns,discordStore,discordConfig,discordClient,
  liveDiscordService,liveDiscordTools,googleTools,googleClient,gmailSendService,gmailSendTools,miroTools,bugReportTools,memoryTools,contactsTools,contactsStore,tregContactsImporter,tregTools,attioTools};
}

export function createRuntimeApp({config=readConfig(),auth,services,allowedOrigins} = {}) {
  const runtime=services || createRuntimeServices({config});
  return createApp({...runtime,...(allowedOrigins?{config:{...runtime.config,allowedOrigins:[...allowedOrigins]}}:{}),...(auth?{auth}:{})});
}

export function createRuntimeDiscordChatBridge({services,env=process.env} = {}) {
  const chatConfig=readDiscordChatConfig(env);
  if(!chatConfig.enabled) return createDiscordChatBridge();
  const access=createDiscordChatAccess({config:{...chatConfig,allowedSourceIds:services.config.allowedSourceIds,
    googleEnabled:env.SITE_GOOGLE_ENABLED==='true'},
    store:services.discordStore,client:services.discordClient,memberClient:createDiscordChatClient({config:chatConfig})});
  // Discord uses the same assistant adapters and action gates as the website.
  // Its live Discord source subset remains scoped to the reply destination.
  const discordDraftTools=createDiscordDraftTools({guildId:chatConfig.guildId,store:services.discordStore,access,
    metadataClient:{getGuildChannels:options=>services.discordClient.getGuildChannels(options),
      getActiveThreads:options=>services.discordClient.getActiveThreads(options)}});
  const runner=createDiscordChatRunner({services,chatConfig,discordDraftTools});
  const contextLoader=createDiscordChatContextLoader({liveDiscordService:services.liveDiscordService,
    directory:createDiscordUserDirectory({env})});
  return createDiscordChatBridge({enabled:true,secret:env.DISCORD_CHAT_BRIDGE_SECRET,access,runner,contextLoader,
    maxConcurrent:chatConfig.maxConcurrent,timeoutMs:chatConfig.requestTimeoutMs});
}

export function createDiscordChatRunner({services,chatConfig,discordDraftTools} = {}) {
  return createChatRunner({...services,gmailSendTools:null,discordDraftTools,config:{...services.config,requestTimeoutMs:chatConfig.requestTimeoutMs}});
}
