import { promptText } from '../../prompt-loader/index.js';
import { projectCalendarReceipt } from '../calendar-receipt.js';
import { createCalendarOperations } from './calendar.js';
import { googleDiagnostics, googleError } from '../oauth.js';
import { validateArguments } from '../../automation/validation.js';
import {
  CHAT_CALENDAR_BATCH_TOOL,
  CHAT_CALENDAR_BATCH_UPDATE_TOOL,
  createCalendarBatch,
  updateCalendarBatch,
} from './calendar-batch.js';

const names = new Set(['list_calendar_events', 'read_calendar_event']);
const string = (maxLength) => ({ type: 'string', maxLength });
const boundary = {
  type: 'object',
  additionalProperties: false,
  properties: {
    date: {
      ...string(10),
      description: promptText('tools/calendar/fields#chat-boundary.date'),
    },
    dateTime: {
      ...string(40),
      description: promptText('tools/calendar/fields#chat-boundary.date-time'),
    },
    timeZone: {
      ...string(100),
      description: promptText('tools/calendar/fields#chat-boundary.time-zone'),
    },
  },
  required: [],
};
const eventFields = {
  title: { ...string(300), minLength: 1 },
  description: string(3000),
  location: string(500),
  start: boundary,
  end: boundary,
};
const define = (name, description, properties, required) =>
  Object.freeze({
    name,
    description,
    idempotent: true,
    parameters: { type: 'object', additionalProperties: false, properties, required },
  });
const writes = Object.freeze([
  CHAT_CALENDAR_BATCH_TOOL,
  CHAT_CALENDAR_BATCH_UPDATE_TOOL,
  define(
    'create_calendar_event',
    promptText('tools/calendar/create_calendar_event#description'),
    eventFields,
    ['title', 'start', 'end'],
  ),
  define(
    'update_calendar_event',
    promptText('tools/calendar/update_calendar_event#description'),
    { eventId: { ...string(1024), minLength: 5 }, ...eventFields },
    ['eventId'],
  ),
  define(
    'delete_calendar_event',
    promptText('tools/calendar/delete_calendar_event#description'),
    { eventId: { ...string(1024), minLength: 5 } },
    ['eventId'],
  ),
]);
const writeMethods = {
  create_calendar_event: 'createChatEvent',
  update_calendar_event: 'updateChatEvent',
  delete_calendar_event: 'cancelChatEvent',
};
const validEventId = (value) => typeof value === 'string' && /^[a-zA-Z0-9_-]{5,1024}$/.test(value);
const validEtag = (value) =>
  typeof value === 'string' && value.length > 0 && value.length <= 1000 && !/[\r\n]/.test(value);
const eligible = (principal) =>
  typeof principal?.id === 'string' && Boolean(principal.id) && principal.googleAccess === true;

// The stable catalogue lets the model interpret user intent. Backend grants,
// fixed targeting and request-local revisions still govern actual execution.
export function createChatCalendarOperations({ client, sourceId } = {}) {
  const calendar = createCalendarOperations({ client });
  const tools = Object.freeze([
    ...calendar.tools.filter((tool) => names.has(tool.name)),
    ...writes,
  ]);
  async function read(
    { name, arguments: args, principal, signal } = {},
    readerCalendar = calendar,
    observe,
  ) {
    if (!names.has(name)) return { status: 'invalid_request', sources: [] };
    if (!eligible(principal)) {
      return { status: 'forbidden', sources: [] };
    }
    const reader = { id: principal.id, calendarAccess: true, calendarId: client?.calendarId };
    const result = await readerCalendar.execute({
      name,
      arguments: args,
      principal: reader,
      signal,
    });
    if (!['ready', 'partial'].includes(result.status))
      return {
        status: result.status,
        sources: [],
        ...(result.diagnostics ? { diagnostics: googleDiagnostics(result.diagnostics) } : {}),
      };
    observe?.(result);
    const events = result.events || [];
    const identities = name === 'list_calendar_events' && args?.resultMode === 'identities';
    const trustedSource =
      typeof sourceId === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sourceId) &&
      principal.allowedSourceIds?.includes(sourceId)
        ? { sourceId }
        : {};
    return {
      status: result.status,
      ...(result.diagnostics ? { diagnostics: googleDiagnostics(result.diagnostics) } : {}),
      sources: events.map((event) => ({
        id: `calendar:${event.eventId}`,
        kind: 'google_calendar',
        externalId: event.eventId,
        ...trustedSource,
        title: event.title || promptText('tools/calendar/results#sources.title'),
        url: event.url,
        retrievalMode: 'live',
        excerpt: JSON.stringify(event),
        partial: identities || event.partial === true,
      })),
      calendarContext: {
        events,
        notice:
          (identities
            ? promptText('tools/calendar/results#identities-mode')
            : promptText('tools/calendar/results#full-mode')) +
          promptText('tools/calendar/results#coverage'),
      },
      coverage: {
        ...result.coverage,
        complete: result.status === 'ready' && result.coverage?.complete !== false,
        returnedCount: events.length,
        contentScope: identities ? 'event_identities' : 'selected_event_fields',
        reason:
          result.coverage?.reason ||
          (name === 'list_calendar_events' ? 'requested_window_only' : 'single_event_only'),
      },
    };
  }
  function createRequest({ principal, operationId } = {}) {
    const revisions = new Map();
    // Capture only trusted authorization fields. Model arguments cannot select
    // a target, grant access, choose a revision or replace the current user.
    const actor = {
      id: principal?.id,
      googleAccess: principal?.googleAccess,
      allowedSourceIds: Array.isArray(principal?.allowedSourceIds)
        ? [...principal.allowedSourceIds]
        : [],
    };
    const readerCalendar = createCalendarOperations({
      client: {
        ...client,
        readEvent: (args) =>
          typeof client?.readChatEvent === 'function'
            ? client.readChatEvent(args)
            : client.readEvent(args),
      },
    });
    async function execute({ name, arguments: args, signal } = {}) {
      if (names.has(name)) {
        if (name === 'read_calendar_event') revisions.delete(args?.eventId);
        return read(
          { name, arguments: args, principal: actor, signal },
          readerCalendar,
          (result) => {
            const revision = result.chatRevision;
            if (
              name === 'read_calendar_event' &&
              revision?.eventId === args?.eventId &&
              result.events?.length === 1 &&
              result.events[0].eventId === args.eventId &&
              validEtag(revision.etag) &&
              typeof revision.unsupported === 'boolean'
            )
              revisions.set(args.eventId, { ...revision });
          },
        );
      }
      const tool = writes.find((tool) => tool.name === name);
      if (
        !tool ||
        !validateArguments(args, tool.parameters) ||
        (name === 'update_calendar_event' && Object.keys(args).length < 2)
      )
        return { status: 'invalid_request', sources: [] };
      if (!eligible(actor)) return { status: 'forbidden', sources: [] };
      if (!client?.configured) return { status: 'not_configured', sources: [] };
      const isCreate = ['create_calendar_event', 'create_calendar_events'].includes(name);
      if (
        isCreate &&
        (typeof operationId !== 'string' || !operationId.trim() || operationId.length > 200)
      )
        return { status: 'forbidden', sources: [] };
      const writer = {
        id: actor.id,
        calendarAccess: true,
        calendarId: client.calendarId,
        calendarChatWrite: true,
      };
      if (name === 'create_calendar_events')
        return createCalendarBatch({
          client,
          events: args.events,
          principal: writer,
          operationId,
          signal,
        });
      if (name === 'update_calendar_events')
        return updateCalendarBatch({ client, events: args.events, principal: writer, signal });
      const revision = revisions.get(args.eventId);
      if (name !== 'create_calendar_event' && !revision)
        return { status: 'read_required', sources: [] };
      if (revision?.unsupported) return { status: 'unsupported_event', sources: [] };
      try {
        const method = client[writeMethods[name]];
        if (typeof method !== 'function') return { status: 'not_configured', sources: [] };
        const result = await method({
          ...args,
          principal: writer,
          signal,
          ...(name === 'create_calendar_event' ? { operationId } : { expectedEtag: revision.etag }),
        });
        if (result?.status !== 'ready')
          return {
            status: result?.status || 'google_unavailable',
            sources: [],
            ...(result?.diagnostics ? { diagnostics: googleDiagnostics(result.diagnostics) } : {}),
          };
        const expectedUrl = validEventId(result.eventId)
          ? `https://calendar.google.com/calendar/event?eid=${Buffer.from(`${result.eventId} ${client.calendarId}`).toString('base64url')}`
          : null;
        if (
          !expectedUrl ||
          result.url !== expectedUrl ||
          !['created', 'updated', 'cancelled', 'unchanged', 'reconciled'].includes(
            result.outcome,
          ) ||
          (name !== 'create_calendar_event' && result.eventId !== args.eventId)
        )
          return { status: 'invalid_response', sources: [] };
        if (args.eventId) revisions.delete(args.eventId);
        const receipt = projectCalendarReceipt(result);
        if (!receipt) return { status: 'invalid_response', sources: [] };
        return { status: 'ready', sources: [], calendarWrite: receipt };
      } catch (error) {
        const safe = googleError(error, signal);
        return { status: safe.code, sources: [], diagnostics: safe.diagnostics };
      }
    }
    return Object.freeze({ configured: calendar.configured, tools, execute });
  }
  return Object.freeze({
    configured: calendar.configured,
    tools: Object.freeze(tools),
    execute: read,
    createRequest,
  });
}
