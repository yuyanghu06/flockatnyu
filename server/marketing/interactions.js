// Builds the marketing interaction dispatcher for the discord-events service.
// Returns null when disabled or not configured, so the collector and chat keep
// running without it.
import { REST } from '@discordjs/rest';
import { createCalendarClient } from '../google/calendar-client.js';
import { readCalendarConfig } from '../google/calendar-config.js';
import {
  createInteractionDispatcher,
  createInteractionResponder,
} from '../discord/interactions.js';
import { readMarketingConfig } from './config.js';
import { createMarketingStore } from './store.js';
import { createEventInfoHandlers } from './event-info.js';
import { INFO_SELECT_ID } from './views.js';

export function createMarketingInteractions({
  env = process.env,
  log = () => {},
  calendar,
  store,
  rest,
  now,
} = {}) {
  const config = readMarketingConfig(env);
  if (!config.enabled) return null;
  calendar ??= createCalendarClient({ config: readCalendarConfig(env) });
  store ??= createMarketingStore({ env });
  if (!config.configured || !calendar.configured || !store.configured) {
    log({ status: 'interactions_unavailable', stage: 'interaction_startup' });
    return null;
  }
  rest ??= new REST({ version: '10', timeout: 15000, retries: 0 }).setToken(config.botToken);
  const eventInfo = createEventInfoHandlers({ config, calendar, store, ...(now ? { now } : {}) });
  const dispatcher = createInteractionDispatcher({
    guildId: config.guildId,
    commands: { 'event-info': eventInfo.command },
    components: { [INFO_SELECT_ID]: eventInfo.select },
    responder: createInteractionResponder({ rest }),
    log,
  });
  log({ status: 'interactions_ready', stage: 'interaction_startup' });
  return dispatcher;
}
