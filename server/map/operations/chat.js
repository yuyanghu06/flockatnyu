import { validateArguments, canonicalJson } from '../../automation/validation.js';
import {
  safePerson,
  text,
  uuid,
  validateSnapshot,
  boundedWork,
  timestamp,
  mapReadContext,
} from '../events.js';
import { validateChatRequestContext } from '../../chat/request-context.js';
import { validateDiscordUsers } from '../../chat/discord-context.js';
import { CHAT_MAP_SOURCE_ID, chatMapEventUrl } from '../source-access.js';
import { normalizeChatMapTimes, chatMapLocalDisplay, ChatMapTimeError } from '../chat-time.js';
import { EVENT_DEFAULT_DURATION_SECONDS, PRESENCE_DEFAULT_TTL_SECONDS } from '../contracts.js';

import { compareDeduplicatedMapRead } from '../read-comparison.js';
import { createTimeContext } from '../../shared/time-zone.js';
import {
  principalValid,
  normalized,
  readPrincipalScope,
  sha,
  idFor,
  provenanceKeys,
  personProvenanceKeys,
  canonicalUuid,
  forbidden,
  deduplicateParticipants,
  appliedSubmission,
} from './chat-helpers.js';

import { createChatMapSchema } from './chat-schema.js';
export function createChatMapOperationService({
  mapTools,
  store,
  env = process.env,
  publicOrigin = env.PUBLIC_ORIGIN,
  now = () => new Date(),
} = {}) {
  const tools = createChatMapSchema(mapTools);
  function createRequest(context = {}) {
    let requestContext;
    try {
      requestContext = validateChatRequestContext(context.requestContext);
    } catch {
      return {
        tools,
        execute: async () => ({ status: 'forbidden', reason: 'invalid_request_context' }),
        observe: (_name, result) => result,
      };
    }
    let discordUsers;
    try {
      discordUsers = validateDiscordUsers(context.discordUsers, requestContext);
    } catch {
      discordUsers = undefined;
    }
    const mappedActor = discordUsers?.users.find(
      (row) => row.discordUserId === requestContext?.actor.userId,
    );
    const discordActor = mappedActor
      ? {
          ...mappedActor,
          username: requestContext.actor.username,
          displayName: requestContext.actor.displayName,
        }
      : undefined;
    let reportedAt =
      timestamp(context.timeContext?.now) !== null
        ? context.timeContext.now
        : new Date(now()).toISOString();
    const snapshots = new Map(),
      completed = new Map();
    let latestReadContext;
    let history = Array.isArray(context.messages)
      ? context.messages
          .filter(
            (row) =>
              row && ['user', 'assistant'].includes(row.role) && typeof row.content === 'string',
          )
          .map(({ role, content }) => ({ role, content }))
      : [{ role: 'user', content: context.userMessage || '' }];
    let boundPrincipal = context.principal?.id;
    const requestIdentity = (principal) =>
      canonicalJson(
        requestContext
          ? {
              principal: principal.id,
              discordRequestId: requestContext.requestId,
              actorId: requestContext.actor.userId,
              channelId: requestContext.channelId,
              threadId: requestContext.threadId,
              sourceProfileId: requestContext.sourceProfileId,
            }
          : { principal: principal.id, date: reportedAt.slice(0, 10), messages: history },
      );
    const readRaw = async (signal) =>
      store?.configured === true
        ? validateSnapshot(await store.read({ observedAt: new Date(now()).toISOString(), signal }))
        : null;
    function observe(_name, result) {
      return result;
    }
    async function executeRaw(options = {}) {
      const { name, arguments: args = {}, principal, signal } = options;
      // A failed, denied or thrown later read must not make an older snapshot
      // look like the latest authorized observation. Keep raw write snapshots.
      if (name === 'read_map_events') latestReadContext = undefined;
      if (!principalValid(principal) || (boundPrincipal && boundPrincipal !== principal.id))
        return { status: 'forbidden' };
      if (signal?.aborted) return { status: 'aborted' };
      boundPrincipal = principal.id;
      const tool = tools.find((row) => row.name === name);
      if (!tool || !validateArguments(args, tool.parameters)) return { status: 'invalid_request' };
      if (mapTools?.configured !== true) return { status: 'not_configured' };
      try {
        if (name === 'lookup_map_person') {
          // Legacy injected tool fixtures can still use the provider lookup;
          // production supplies the same authenticated map store for all modes.
          if (store?.configured !== true)
            return args.provider && args.providerUserId
              ? mapTools.execute(options)
              : { status: 'not_configured' };
          return await boundedWork(async (workSignal) => {
            let person,
              reason = 'person_not_found';
            if (args.personName !== undefined) {
              const target = normalized(args.personName),
                data = await readRaw(workSignal),
                eligible = data.people.filter(
                  (row) =>
                    uuid(row.id) && row.is_trackable === true && text(row.display_name, 200, 1),
                );
              const exact = eligible.filter((row) => normalized(row.display_name) === target);
              const matches = exact.length
                ? exact
                : /\s/u.test(target)
                  ? []
                  : eligible.filter((row) => normalized(row.display_name).split(' ')[0] === target);
              person = matches.length === 1 ? matches[0] : null;
              reason = matches.length > 1 ? 'person_ambiguous' : 'person_not_found';
            } else {
              const provider = args.provider ?? (requestContext ? 'discord' : undefined),
                providerUserId =
                  args.providerUserId ??
                  (provider === 'discord' ? requestContext?.actor.userId : undefined);
              if (!provider || !providerUserId)
                return {
                  status: 'ready',
                  sourceStatus: 'ok',
                  person: null,
                  reason: 'person_name_required',
                };
              person = await store.lookup({ provider, providerUserId, signal: workSignal });
            }
            if (workSignal.aborted) return { status: 'aborted' };
            return {
              status: 'ready',
              sourceStatus: 'ok',
              person:
                person &&
                uuid(person.id) &&
                person.is_trackable === true &&
                text(person.display_name, 200, 1)
                  ? safePerson(person)
                  : null,
              ...(!person ? { reason } : {}),
            };
          }, signal);
        }
        if (name !== 'upsert_map_event') {
          const result = await mapTools.execute(options);
          if (
            name === 'read_map_events' &&
            result?.status === 'ready' &&
            typeof mapReadContext(result) === 'function'
          )
            latestReadContext = mapReadContext(result);
          if (name === 'read_map_events' && result?.status === 'ready')
            for (const event of result.events || [])
              snapshots.set(event.id, {
                event: structuredClone(event),
                people: structuredClone(
                  (result.event_people || []).filter((row) => row.event_id === event.id),
                ),
                buildings: structuredClone(
                  (result.event_buildings || []).filter((row) => row.event_id === event.id),
                ),
                principalScope: readPrincipalScope(principal),
                readContext: mapReadContext(result),
              });
          if (name === 'read_map_events' && result?.status === 'ready') {
            const byId = new Map((result.events || []).map((event) => [event.id, event]));
            return {
              ...result,
              events: (result.events || []).map((event) => ({
                ...event,
                local_display: chatMapLocalDisplay(event, null, context.timeContext?.timeZone),
              })),
              event_people: (result.event_people || []).map((person) => ({
                ...person,
                effective_local_display: byId.has(person.event_id)
                  ? chatMapLocalDisplay(
                      byId.get(person.event_id),
                      person,
                      context.timeContext?.timeZone,
                    )
                  : undefined,
              })),
            };
          }
          return result;
        }
        return await boundedWork(async (workSignal) => {
          let event = { ...args.event };
          for (const key of ['id', 'source_id'])
            if (event[key] !== undefined) event[key] = canonicalUuid(event[key]);
          const observed = event.id ? snapshots.get(event.id) : null;
          const prior = observed?.event ?? null,
            oldPeople = observed?.people ?? [];
          if (args.expectedUpdatedAt !== undefined && !prior) return { status: 'read_required' };
          if (prior)
            for (const key of provenanceKeys) if (event[key] === undefined) event[key] = prior[key];
          if (event.source_id !== undefined) event.source_id = canonicalUuid(event.source_id);
          // Keep an existing optional link when only attendance is changing.
          // Stored null already matches the shared service default on omission.
          if (prior && event.url === undefined && prior.url !== undefined && prior.url !== null)
            event.url = prior.url;
          if (
            !event.id &&
            event.source_id !== undefined &&
            event.source_id !== CHAT_MAP_SOURCE_ID &&
            typeof event.source_record_id === 'string'
          )
            event.id = idFor(canonicalJson([event.source_id, event.source_record_id]));
          const direct = event.source_id === undefined || event.source_id === CHAT_MAP_SOURCE_ID;
          event = normalizeChatMapTimes(event, {
            current: prior,
            timeZone: event.time_zone,
            timeKind: event.time_kind,
            ...(!prior && direct && event.kind === 'presence'
              ? { trustedPresenceStart: reportedAt }
              : {}),
          });
          // Distinguish a fresh current-location confirmation from an old one
          // before deriving its identity; no report parser or cache is involved.
          if (!prior && direct && event.kind === 'presence' && event.starts_at === undefined)
            event.starts_at = reportedAt;
          if (!prior && direct) {
            const identity = sha(
              canonicalJson({
                request: requestIdentity(principal),
                kind: event.kind,
                time_kind: event.time_kind,
                starts_at: event.starts_at ?? null,
                ends_at: event.ends_at ?? null,
                starts_on: event.starts_on ?? null,
                ends_on: event.ends_on ?? null,
                buildings: args.buildings.map((row) => row.building_id).sort(),
                people: [...new Set(args.people.map((row) => canonicalUuid(row.person_id)))].sort(),
              }),
            );
            event.id = idFor(identity);
            event.source_id = CHAT_MAP_SOURCE_ID;
            event.source_url = chatMapEventUrl(event.id, publicOrigin);
            event.source_record_id = `chat:${identity}`;
            event.reported_at = reportedAt;
          }
          const completedPeople = args.people.map((row) => {
            const personId = canonicalUuid(row.person_id),
              old = oldPeople.find((person) => canonicalUuid(person.person_id) === personId),
              participant = normalizeChatMapTimes(
                { ...row, person_id: personId },
                {
                  current: old,
                  timeZone: event.time_zone,
                  timeKind: event.time_kind === 'all_day' ? 'timed' : event.time_kind,
                },
              );
            if (participant.label === undefined)
              participant.label =
                observed?.principalScope === readPrincipalScope(principal) && old ? old.label : '';
            if (old)
              for (const key of personProvenanceKeys)
                if (participant[key] === undefined) participant[key] = old[key];
            if (participant.source_id !== undefined)
              participant.source_id = canonicalUuid(participant.source_id);
            const comparison = { ...participant };
            if (
              participant.source_id === undefined ||
              participant.source_id === CHAT_MAP_SOURCE_ID
            ) {
              const sourceUrl = chatMapEventUrl(event.id, publicOrigin);
              // Compare explicit source strings before chat-owned attribution
              // replaces them. Only omitted metadata receives the actual default.
              comparison.source_id = CHAT_MAP_SOURCE_ID;
              comparison.source_url ??= sourceUrl;
              comparison.reported_at ??= reportedAt;
              participant.source_id = CHAT_MAP_SOURCE_ID;
              participant.source_url = sourceUrl;
              participant.reported_at ??= reportedAt;
            }
            return { participant, comparison };
          });
          const unique = deduplicateParticipants(completedPeople);
          if (unique.status === 'invalid') return unique;
          const people = unique.people;
          if (
            !prior &&
            args.expectedUpdatedAt === undefined &&
            event.time_kind === 'timed' &&
            event.ends_at === undefined
          ) {
            const start = timestamp(event.starts_at),
              report = timestamp(event.reported_at);
            if (
              start !== null &&
              (event.kind === 'scheduled_event' ||
                (event.kind === 'presence' &&
                  start === report &&
                  report <= new Date(now()).getTime()))
            )
              event.ends_at = new Date(
                start +
                  (event.kind === 'presence'
                    ? PRESENCE_DEFAULT_TTL_SECONDS
                    : EVENT_DEFAULT_DURATION_SECONDS) *
                    1000,
              ).toISOString();
          }
          const signature = canonicalJson({
            event,
            buildings: args.buildings,
            people,
            expectedUpdatedAt: args.expectedUpdatedAt ?? null,
          });
          if (
            !prior &&
            event.source_id === CHAT_MAP_SOURCE_ID &&
            completed.has(event.source_record_id)
          ) {
            const previous = completed.get(event.source_record_id);
            return previous.signature === signature
              ? previous.result
              : { status: 'conflict', reason: 'source_already_written_read_existing_event' };
          }
          const expectedUpdatedAt = args.expectedUpdatedAt;
          if (workSignal.aborted) return { status: 'aborted' };
          let result = await mapTools.execute({
            ...options,
            arguments: {
              ...args,
              event,
              people,
              ...(expectedUpdatedAt !== undefined ? { expectedUpdatedAt } : {}),
            },
            readContext: observed?.readContext ?? latestReadContext,
            signal: workSignal,
          });
          if (
            result?.status === 'invalid' &&
            ['duplicate_participant_ids', 'duplicate_building_ids'].includes(result.reason) &&
            observed &&
            typeof observed.readContext === 'function' &&
            observed.readContext === latestReadContext &&
            observed.principalScope === readPrincipalScope(principal)
          ) {
            const readComparison = compareDeduplicatedMapRead({
              event,
              buildings: args.buildings,
              people,
              expectedUpdatedAt,
              read: observed,
            });
            if (readComparison) result = { ...result, readComparison };
          }
          if (
            result?.status === 'ready' &&
            result.sourceStatus === 'applied' &&
            uuid(result.event_id) &&
            timestamp(result.updated_at) !== null
          ) {
            const submitted = appliedSubmission(
              event,
              args.buildings,
              people,
              context.timeContext?.timeZone,
            );
            if (submitted) result = { ...result, mapSubmission: submitted };
          }
          if (
            result?.status === 'ready' &&
            result.sourceStatus === 'applied' &&
            event.source_id === CHAT_MAP_SOURCE_ID
          )
            completed.set(event.source_record_id, { signature, result });
          return result;
        }, signal);
      } catch (error) {
        return {
          status: signal?.aborted
            ? 'aborted'
            : error instanceof ChatMapTimeError
              ? 'invalid_request'
              : 'unavailable',
          ...(error instanceof ChatMapTimeError ? { reason: error.reason } : {}),
        };
      }
    }
    const execute = async (options) => {
      const result = await executeRaw(options);
      return {
        ...result,
        ...(discordUsers ? { discordUsers } : {}),
        ...(discordActor ? { discordActor } : {}),
      };
    };
    // Internal same-run input update. It never changes actor/source grants,
    // snapshots, successful identities, revisions or completed-write caches.
    function updateUserContext({ messages, timeContext } = {}) {
      const next = createTimeContext(timeContext);
      if (
        !next ||
        next.timeZone !== context.timeContext?.timeZone ||
        !Array.isArray(messages) ||
        messages.some(
          (row) =>
            !row || !['user', 'assistant'].includes(row.role) || typeof row.content !== 'string',
        )
      )
        return false;
      history = messages.map(({ role, content }) => ({ role, content }));
      reportedAt = next.now;
      context = { ...context, timeContext: next };
      return true;
    }
    return Object.freeze({ tools, execute, observe, updateUserContext });
  }
  return Object.freeze({
    configured: mapTools?.configured === true,
    tools,
    createRequest,
    execute: (options) =>
      options?.name === 'read_map_events'
        ? mapTools.execute(options)
        : Promise.resolve(forbidden()),
  });
}
