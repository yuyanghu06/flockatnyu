import assert from 'node:assert/strict';
import { selectedFixture } from '../planner-selected-fixes.mjs';
import { ids, copy, now, mapSnapshot } from '../planner-followup.mjs';
import { createAutomationAdapters } from '../../../server/automation/adapters.js';
import { createAutomationHandler } from '../../../server/automation/handler.js';
import { readAutomationConfig } from '../../../server/automation/config.js';
import { createLiveRetrievalTools } from '../../../tools/discord/index.js';
import { createMapEventService, validateSnapshot } from '../../../server/map/events.js';
import { createMapSourceAuthorizer } from '../../../server/map/source-access.js';
import { workerCalendars } from './worker-calendar.mjs';
export async function workerFixture({ freshInputs, pending = [], seed = [] }) {
  const sources = selectedFixture({ pending, freshInputs, backlog: 0 });
  // The reused source fixture prioritizes pending originals by default. This
  // full-cycle fixture must also expose every separately queued fresh original.
  sources.originals.splice(0, sources.originals.length, ...copy(freshInputs));
  let state = copy(mapSnapshot()),
    version = 0;
  const before = copy(state),
    mapWrites = [],
    attempts = [],
    calls = [],
    executions = [],
    proposals = [],
    records = [];
  const calendars = workerCalendars(state);
  for (const row of seed) await calendars.seed(row.original, row.options);
  const setupWriteCount = calendars.writes.length;
  const rawStore = {
    configured: true,
    read: async () => copy(state),
    lookup: async ({ provider, providerUserId }) =>
      copy(
        provider === 'discord'
          ? (state.people.find((row) => row.discord_user_id === providerUserId) ?? null)
          : null,
      ),
    async upsert(args) {
      const { event, buildings, people, expectedUpdatedAt } = args,
        old = state.events.find((row) => row.id === event.id);
      attempts.push(copy({ event, buildings, people, expectedUpdatedAt }));
      if (old ? old.updated_at !== expectedUpdatedAt : expectedUpdatedAt != null)
        return { status: 'conflict' };
      const saved = {
        ...copy(event),
        created_at: old?.created_at ?? now,
        updated_at: new Date(Date.parse(now) + ++version).toISOString(),
      };
      const next = {
        ...state,
        events: [...state.events.filter((row) => row.id !== event.id), saved],
        event_buildings: [
          ...state.event_buildings.filter((row) => row.event_id !== event.id),
          ...buildings.map((row) => ({ ...copy(row), event_id: event.id })),
        ],
        event_people: [
          ...state.event_people.filter((row) => row.event_id !== event.id),
          ...people.map((row) => ({ ...copy(row), event_id: event.id })),
        ],
      };
      validateSnapshot(next);
      state = next;
      mapWrites.push(copy({ event, buildings, people, expectedUpdatedAt }));
      return { status: 'applied', event_id: event.id, updated_at: saved.updated_at };
    },
  };
  const authorizer = createMapSourceAuthorizer({
    calendarClient: calendars.calendarClient,
    calendarSourceId: ids.club,
    calendarTargets: [{ client: calendars.memberClient, sourceId: ids.member }],
    liveDiscordService: sources.liveDiscordService,
  });
  const mapService = createMapEventService({
    store: rawStore,
    authorizeSource: authorizer,
    now: () => new Date(now),
  });
  const config = readAutomationConfig({ AGENT_AUTOMATION_ENABLED: 'true' });
  const adapters = createAutomationAdapters({
    env: calendars.env,
    config,
    now: () => new Date(now),
    fetchImpl: async () => {
      throw Error('unexpected_runtime_network');
    },
    dependencies: {
      googleConfig: { configured: false },
      googleClient: { configured: false },
      ...calendars,
      discordConfig: { configured: true, guildId: '100' },
      discordStore: sources.discordStore,
      discordClient: sources.discordClient,
      liveDiscordService: sources.liveDiscordService,
      discordTools: createLiveRetrievalTools({
        service: sources.liveDiscordService,
        guildId: '100',
      }),
      mapEventService: mapService,
      mapEventStore: rawStore,
      mapSourceAuthorizer: authorizer,
      taskStore: sources.taskStore,
      loadBuildings: async () => state.buildings,
    },
  });
  const tools = adapters.tools.map((tool) => ({
    ...tool,
    async execute(args, context) {
      const result = await tool.execute(args, context);
      calls.push({
        name: tool.name,
        origin: context.origin === 'runner' ? 'runner' : 'model',
        phase: context.phase,
        arguments: copy(args),
        result: copy(result),
      });
      return result;
    },
  }));
  const pipeline = {
    ...adapters.pipeline,
    recordExecution: async (row) => executions.push(copy(row)),
  };
  const store = {
    configured: true,
    claim: async () => ({
      status: 'ready',
      leaseToken: '60000000-0000-4000-8000-000000000001',
      inputs: copy(freshInputs),
    }),
    renew: async () => ({ status: 'ready' }),
    release: async () => {},
    fail: async () => {},
    action: async ({ complete }) => ({ status: complete ? 'completed' : 'execute' }),
    finish: async () => ({ status: 'ready' }),
  };
  return {
    adapters,
    originals: copy(freshInputs),
    tools,
    pipeline,
    store,
    config,
    calls,
    executions,
    proposals,
    records,
    calendars,
    mapWrites,
    attempts,
    tasks: sources.tasks,
    before,
    setupWriteCount,
    state: () => ({
      map: copy(state),
      calendars: Object.fromEntries(
        [...calendars.maps].map(([key, rows]) => [key, copy([...rows.values()])]),
      ),
      tasks: copy([...sources.tasks.values()]),
      calendarWrites: calendars.writes.slice(setupWriteCount),
      mapWrites: copy(mapWrites),
    }),
    async run(provider, signal) {
      const observed = {
        async toolTurn(request) {
          const turn = await provider.toolTurn(request);
          proposals.push({
            phase: request.system.includes('FOLLOWUP phase') ? 'followup' : 'initial',
            toolCalls: copy(turn.toolCalls),
            text: turn.text,
          });
          return turn;
        },
      };
      const result = await createAutomationHandler({
        ...adapters,
        tools,
        pipeline,
        store,
        config,
        provider: observed,
        now: () => new Date(now),
        audit: { recordEvent: async (row) => records.push(copy(row)) },
      }).tick({ signal });
      return { result, text: '' };
    },
    async prepareOffline() {
      await adapters.prepareBatch({ principal: adapters.principal, inputs: copy(freshInputs) });
      await adapters.pipeline.beginCycle({
        leaseToken: '60000000-0000-4000-8000-000000000001',
        inputs: copy(freshInputs),
        getExecutionLog: () => copy(executions),
        recordExecution: async (row) => executions.push(copy(row)),
      });
    },
    async enterFollowupOffline() {
      return adapters.pipeline.afterInitial({
        principal: adapters.principal,
        handledInputIds: freshInputs.map((row) => row.uuid),
        inputs: copy(freshInputs),
        executionLog: copy(executions),
      });
    },
    async executeOffline(name, args, inputIds = freshInputs.map((row) => row.uuid)) {
      const tool = tools.find((row) => row.name === name);
      assert(tool, 'Production tool must exist');
      const context = {
        principal: adapters.principal,
        inputIds,
        phase: adapters.pipeline.phase,
        callId: 'offline_fixture_' + calls.length,
      };
      const prepared = tool.prepareArguments ? await tool.prepareArguments(args, context) : args;
      return tool.execute(prepared, context);
    },
  };
}
