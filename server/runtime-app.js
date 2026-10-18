import { createApp } from './app.js';
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
import {readCalendarConfig} from './google/calendar-config.js';
import { readDiscordLiveSummaryConfig } from './discord/live-summary-config.js';
import {readMiroMcpConfig} from './miro/mcp-config.js';
import {createMiroMcpClient} from './miro/mcp-client.js';
import {createMiroStore} from './miro/store.js';
import {createMiroMcpTools} from '../tools/miro/mcp.js';
import {createMapPresenceService} from './map/presence.js';
import {createMapSourceAuthorizer} from './map/source-access.js';
import {createMapEventService} from './map/events.js';
import {createMapTools} from '../tools/map/index.js';
import {createChatMapTools} from '../tools/map/chat.js';
import {createBugReportStore} from './bug-reports.js';
import {createBugReportTools} from '../tools/bug-reports/index.js';
import {createMemoryStore} from './memory.js';
import {createMemoryTools} from '../tools/memory/index.js';

export function createRuntimeApp({ config = readConfig(), auth } = {}) {
const discordConfig = readDiscordConfig();
const discordStore = createDiscordStore(), liveConfig = readLiveDiscordConfig();
const liveDiscordService = createLiveDiscordRetrieval({ config: liveConfig, store: discordStore, client: createLiveDiscordClient({ config: liveConfig }) });
const summaryConfig = readDiscordLiveSummaryConfig();
const liveDiscordTools = createLiveChatTools({ service: liveDiscordService, guildId: liveConfig.guildId, config: summaryConfig });
const googleClient = createGoogleClient({ config: readGoogleConfig() });
const calendarConfig = readCalendarConfig();
const calendarClient = createCalendarClient({config:calendarConfig});
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
const authorizeMapSource = createMapSourceAuthorizer({liveDiscordService, miroStore, googleClient,
  gmailSourceId:process.env.AGENT_GMAIL_SOURCE_ID?.trim(),calendarClient,calendarSourceId:calendarConfig.sourceId});
const mapPresenceService = createMapPresenceService({production:config.production, authorizeSource:authorizeMapSource});
const mapTools = createChatMapTools({mapTools:createMapTools({service:createMapEventService({authorizeSource:authorizeMapSource})}),
  gmailSourceId:process.env.AGENT_GMAIL_SOURCE_ID?.trim()});
const bugReportTools = createBugReportTools({store: createBugReportStore()});
const memoryTools = createMemoryTools({store: createMemoryStore()});
const app = createApp({ ...(auth ? {auth} : {}), config, mapPresenceService, mapTools, discordStore, discordConfig, liveDiscordService, liveDiscordTools, googleTools, googleClient, miroTools, bugReportTools, memoryTools });
return app;
}
