import { Hono } from 'hono';
import { readConfig } from './config.js';
import { createProvider } from './providers/index.js';
import { createAuditLogger } from './model-audit.js';
import { createChatRunner } from './chat-runner.js';
import { withDiscordSourceScope } from './discord/source-scope.js';
import { createManualPlannerAuth } from './automation/manual-auth.js';
import { createChatSteeringRegistry } from './chat-steering.js';
import { developmentAuth } from '../src/api/_shared/development-auth.js';
import { errorRecord, ndjsonHeaders, readJSON } from '../src/api/_shared/http.js';
import { registerApiRoutes } from '../src/api/register.js';

export { developmentAuth } from '../src/api/_shared/development-auth.js';

const unavailableDiscord = {
  configured: false,
  async search() {
    return { status: 'not_configured', sources: [] };
  },
  async listChannels() {
    return { status: 'not_configured', channels: [] };
  },
};
export function createApp({
  config = readConfig(),
  audit = createAuditLogger(),
  provider = createProvider(config, { audit }),
  discordStore = unavailableDiscord,
  discordConfig = {},
  liveDiscordTools = null,
  liveDiscordService = null,
  googleTools = null,
  googleClient = null,
  gmailSendTools = null,
  gmailSendService = null,
  miroTools = null,
  attioTools = null,
  bugReportTools = null,
  memoryTools = null,
  contactsTools = null,
  contactsStore = null,
  tregContactsImporter = null,
  tregTools = null,
  mapTools = null,
  mapPresenceService = null,
  mapAvatarService = null,
  plannerRuns = null,
  plannerAuth = createManualPlannerAuth(),
  auth = developmentAuth,
  now = () => new Date(),
} = {}) {
  const app = new Hono();
  const steeringRuns = createChatSteeringRegistry({ now });
  const chatRunner = createChatRunner({
    config,
    provider,
    audit,
    liveDiscordTools,
    googleTools,
    gmailSendTools,
    miroTools,
    bugReportTools,
    memoryTools,
    contactsTools,
    tregTools,
    mapTools,
    attioTools,
    now,
  });
  const deny = (c, code, status) =>
    c.body(JSON.stringify(errorRecord(code)) + '\n', status, ndjsonHeaders);
  const authorize = async (c) => {
    try {
      return await withDiscordSourceScope({
        principal: await auth(c, config),
        store: discordStore,
        guildId: config.discordGuildId,
        signal: c.req.raw.signal,
      });
    } catch {
      return null;
    }
  };
  registerApiRoutes({
    app,
    authorize,
    config,
    auth,
    readJSON,
    now,
    contactsStore,
    gmailSendService,
    tregContactsImporter,
    discordStore,
    discordConfig,
    liveDiscordService,
    miroTools,
    attioTools,
    contactsTools,
    tregTools,
    googleClient,
    plannerRuns,
    plannerAuth,
    mapAvatarService,
    mapPresenceService,
    liveDiscordTools,
    googleTools,
    gmailSendTools,
    bugReportTools,
    memoryTools,
    mapTools,
    chatRunner,
    steeringRuns,
    deny,
  });
  app.onError((_, c) => deny(c, 'provider_unavailable', 500));
  return app;
}
