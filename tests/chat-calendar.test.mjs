import test from 'node:test';
import assert from 'node:assert/strict';
import { createChatCalendarTools } from '../tools/calendar/chat.js';
import { retrieveAssistantContext, assistantAnswerPrompt } from '../server/assistant-context.js';
import { createApp } from '../server/app.js';

const principal = { id: 'chat-reader', googleAccess: true, allowedSourceIds: [] };
const window = { timeMin: '2026-10-18T00:00:00-04:00', timeMax: '2026-10-19T00:00:00-04:00' };
const event = { eventId: 'meeting_123', title: 'Club meeting', description: 'Agenda '.repeat(250),
  start: { dateTime: '2026-10-18T18:00:00-04:00', timeZone: 'America/New_York' },
  end: { dateTime: '2026-10-18T19:00:00-04:00', timeZone: 'America/New_York' },
  location: 'Club room', url: 'https://calendar.google.com/calendar/event?eid=synthetic', partial: true };
function fixture({ status = 'ready', nextPageToken = 'second-page', events = [event] } = {}) {
  const calls = [];
  const read = async args => { calls.push(args); return { status, events, nextPageToken,
    coverage: { complete: !nextPageToken, windowOnly: true } }; };
  const tools = createChatCalendarTools({ client: { configured: true, calendarId: 'club@example.com',
    listEvents: read, readEvent: read, upsertEvent: () => assert.fail('chat write'), cancelEvent: () => assert.fail('chat cancellation') } });
  return { tools, calls };
}

test('Calendar catalogue is stable while stateless writes remain denied and reads enforce Google scope', async () => {
  const { tools, calls } = fixture();
  const expected=['list_calendar_events','read_calendar_event','create_calendar_event','update_calendar_event','delete_calendar_event'];
  assert.deepEqual(tools.tools.map(tool => tool.name), expected);
  assert(tools.tools.filter(tool=>tool.name.startsWith('list_')||tool.name.startsWith('read_')).every(tool => tool.readOnly === true));
  const explicit=tools.createRequest({userMessage:'Create a calendar event for tomorrow.',principal,operationId:'synthetic-request'});
  assert.deepEqual(explicit.tools.map(tool=>tool.name),expected);
  const ordinary=tools.createRequest({userMessage:'What is on the calendar tomorrow?',principal,operationId:'synthetic-read'});
  assert.deepEqual(ordinary.tools.map(tool=>tool.name),expected);
  for (const name of ['upsert_calendar_event', 'cancel_calendar_event', 'create_calendar_event','update_calendar_event','delete_calendar_event']) {
    assert.equal((await tools.execute({ name, arguments: {}, principal })).status, 'invalid_request');
  }
  for (const actor of [undefined, { id: 'reader' }, { ...principal, googleAccess: false }]) {
    assert.equal((await tools.execute({ name: 'list_calendar_events', arguments: window, principal: actor })).status, 'forbidden');
  }
  assert.equal((await tools.execute({ name: 'list_calendar_events', arguments: { ...window, calendarId: 'other@example.com' }, principal })).status, 'invalid_request');
  assert.equal(calls.length, 0);
  const result = await tools.execute({ name: 'list_calendar_events', arguments: window,
    principal: { ...principal, calendarId: 'other@example.com', calendarSources: ['untrusted'] } });
  assert.equal(result.status, 'ready');
  assert.deepEqual(calls[0].principal, { id: principal.id, calendarAccess: true, calendarId: 'club@example.com' });
});

test('Calendar content, links and pagination survive the actual chat planning and answer serialization', async () => {
  const { tools, calls } = fixture(); let round = 0;
  const provider = { planTools: async ({ system, tools: definitions }) => {
    assert(definitions.some(tool => tool.name === 'list_calendar_events'));
    if (round++ === 0) return [{ name: 'list_calendar_events', arguments: window }];
    assert(system.includes('second-page'));
    assert(system.includes(event.description));
    return [{ name: 'list_calendar_events', arguments: { ...window, pageToken: 'second-page' } }];
  } };
  const context = await retrieveAssistantContext({ messages: [{ role: 'user', content: 'What is on today?' }],
    principal, provider, googleTools: tools, now: '2026-10-18T16:00:00Z', timeZone: 'America/New_York' });
  assert.equal(calls.length, 2); assert.equal(calls[1].pageToken, 'second-page');
  const result = context.results[0];
  assert.deepEqual(result.calendarContext.events[0], event);
  assert.equal(result.calendarContext.nextPageToken, 'second-page');
  assert.equal(result.coverage.complete, false);
  assert.equal(context.sources[0].url, event.url);
  const prompt = assistantAnswerPrompt({ ...context, now: '2026-10-18T16:00:00Z', timeZone: 'America/New_York' });
  assert(prompt.includes(event.start.dateTime)); assert(prompt.includes(event.location));
});

test('Calendar read errors remain errors, and successful empty pages preserve explicit coverage', async () => {
  const failed = fixture({ status: 'permission_denied' });
  assert.deepEqual(await failed.tools.execute({ name: 'list_calendar_events', arguments: window, principal }), { status: 'permission_denied', sources: [] });
  const empty = fixture({ events: [], nextPageToken: null });
  const result = await empty.tools.execute({ name: 'list_calendar_events', arguments: window, principal });
  assert.equal(result.status, 'ready'); assert.equal(result.coverage.complete, true);
  assert.deepEqual(result.calendarContext.events, []); assert.deepEqual(result.sources, []);
});

test('protected inventory exposes every Calendar tool while stateless execution retains its read-only boundary', async () => {
  const { tools } = fixture();
  const app = createApp({ config: { production: false }, googleTools: tools, auth: () => principal });
  const inventory = await (await app.request('/api/tools')).json();
  assert.deepEqual(inventory.tools.map(tool => tool.name), ['list_calendar_events','read_calendar_event','create_calendar_event','update_calendar_event','delete_calendar_event']);
  const response = await app.request('/api/tools/read_calendar_event', { method: 'POST',
    headers: { 'content-type': 'application/json' }, body: JSON.stringify({ eventId: event.eventId }) });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.calendarContext.events[0].eventId, event.eventId);
  for(const name of ['create_calendar_event','update_calendar_event','delete_calendar_event']){
    const response=await app.request('/api/tools/'+name,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({eventId:event.eventId})});
    assert(response.status>=400);assert.notEqual((await response.json()).status,'ready');
  }
  const denied = await app.request('/api/tools/upsert_calendar_event', { method: 'POST',
    headers: { 'content-type': 'application/json' }, body: '{}' });
  assert.equal(denied.status, 503);
});
