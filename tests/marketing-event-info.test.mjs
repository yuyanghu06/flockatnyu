import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { WebSocketShardEvents as E } from '@discordjs/ws';
import { createMarketingInteractions } from '../server/marketing/interactions.js';
import { createDiscordGateway } from '../server/discord/gateway.js';

// Test-only Discord IDs, supplied through env like production.
const MARKETING_ROLE_IDS = {
  eventsLeads: '9100000000000000001',
  marketing: '9100000000000000002',
  leadership: '9100000000000000003',
};
const MARKETING_CHANNEL_IDS = {
  eventsTeam: '9200000000000000001',
  marketingAndContentTeam: '9200000000000000002',
};
const guildId = '1203562091517321216';
const env = {
  MARKETING_INTERACTIONS_ENABLED: 'true',
  DISCORD_BOT_TOKEN: 'synthetic-token',
  DISCORD_GUILD_ID: guildId,
  MARKETING_ALLOWED_ROLE_IDS: Object.values(MARKETING_ROLE_IDS).join(','),
  MARKETING_ALLOWED_CHANNEL_IDS: Object.values(MARKETING_CHANNEL_IDS).join(', '),
};
const now = () => new Date('2026-11-19T17:00:00Z');
const calendarEvent = (i, extra = {}) => ({
  eventId: `event${String(i).padStart(3, '0')}`,
  title: `Event ${i}`,
  start: { dateTime: `2026-11-${String(20 + (i % 9)).padStart(2, '0')}T23:00:00Z` },
  end: { dateTime: `2026-11-${String(20 + (i % 9)).padStart(2, '0')}T23:59:00Z` },
  status: 'confirmed',
  url: `https://calendar.google.com/calendar/event?eid=${i}`,
  ...extra,
});
const tokenOf = (eventId) =>
  eventId
    .padEnd(16, '0')
    .replace(/[^0-9a-f]/g, 'a')
    .slice(0, 16);

function fixture({
  events = [calendarEvent(1)],
  calendarStatus = 'ready',
  details = {},
  lookupStatus,
  env: fixtureEnv = env,
} = {}) {
  const f = { calls: [], calendarReads: 0, registered: [] };
  const calendar = {
    configured: true,
    calendarId: 'club@group.calendar.google.com',
    listEventsWindow: async () => {
      f.calendarReads++;
      return calendarStatus === 'ready'
        ? { status: 'ready', events, coverage: { complete: true } }
        : { status: calendarStatus, events: [] };
    },
  };
  const byToken = new Map();
  const store = {
    configured: true,
    register: async ({ events: rows }) => {
      f.registered.push(rows);
      return {
        status: 'ready',
        tokens: rows.map((row) => {
          const token = tokenOf(row.eventId);
          byToken.set(token, { token, eventId: row.eventId, title: row.title, date: row.date });
          return { eventId: row.eventId, token };
        }),
      };
    },
    lookup: async ({ token }) => {
      if (lookupStatus) return { status: lookupStatus };
      const event = byToken.get(token);
      if (!event) return { status: 'not_found' };
      return { status: 'ready', event, details: details[event.eventId] ?? null };
    },
  };
  const rest = {
    post: async (path, options) =>
      f.calls.push({ method: 'post', path, body: options.body, auth: options.auth }),
    patch: async (path, options) =>
      f.calls.push({ method: 'patch', path, body: options.body, auth: options.auth }),
  };
  f.dispatcher = createMarketingInteractions({ env: fixtureEnv, calendar, store, rest, now });
  return f;
}

let nextId = 1;
const interaction = ({
  type = 2,
  name = 'event-info',
  customId,
  values,
  roles = [MARKETING_ROLE_IDS.marketing],
  channelId = MARKETING_CHANNEL_IDS.eventsTeam,
  guild = guildId,
  message,
  channel,
} = {}) => ({
  t: 'INTERACTION_CREATE',
  d: {
    id: String(1000 + nextId++),
    application_id: '555',
    token: 'synthetic_interaction_token',
    type,
    guild_id: guild,
    channel_id: channelId,
    member: { user: { id: '42' }, roles },
    data: type === 2 ? { name, type: 1 } : { custom_id: customId, component_type: 3, values },
    ...(message ? { message } : {}),
    ...(channel ? { channel } : {}),
  },
});

test('authorized /event-info defers ephemerally, then shows a dropdown of confirmed events', async () => {
  const f = fixture({
    events: [
      calendarEvent(1),
      calendarEvent(2, { colorId: '8' }),
      calendarEvent(3, { title: '[TBD] Mixer' }),
    ],
  });
  assert.deepEqual(await f.dispatcher.handle(interaction()), { status: 'handled' });
  assert.equal(f.calls[0].method, 'post');
  assert.match(f.calls[0].path, /^\/interactions\/\d+\/synthetic_interaction_token\/callback$/);
  assert.deepEqual(f.calls[0].body, { type: 5, data: { flags: 64 } });
  assert.equal(f.calls[0].auth, false);
  const edit = f.calls[1];
  assert.equal(edit.path, '/webhooks/555/synthetic_interaction_token/messages/@original');
  const menu = edit.body.components[0].components[0];
  assert.equal(menu.custom_id, 'mkt:info');
  assert.deepEqual(
    menu.options.map((o) => o.label),
    ['Event 1'],
  );
  assert.equal(menu.options[0].value, tokenOf('event001'));
  assert.deepEqual(edit.body.allowed_mentions, { parse: [] });
});

test('leadership and events leads roles are allowed in either team channel', async () => {
  for (const [role, channel] of [
    [MARKETING_ROLE_IDS.leadership, MARKETING_CHANNEL_IDS.marketingAndContentTeam],
    [MARKETING_ROLE_IDS.eventsLeads, MARKETING_CHANNEL_IDS.eventsTeam],
  ]) {
    const f = fixture();
    await f.dispatcher.handle(interaction({ roles: ['1', role], channelId: channel }));
    assert.equal(f.calls[0].body.type, 5);
    assert.equal(f.calendarReads, 1);
  }
});

test('wrong role or wrong channel gets an immediate ephemeral refusal and no Calendar read', async () => {
  for (const [options, pattern] of [
    [
      { roles: ['999'] },
      /^You don't have a role that can use this command\. It works in <#9200000000000000001> or <#9200000000000000002>\.$/,
    ],
    [{ roles: [] }, /You don't have a role/],
    [
      { channelId: '777' },
      /^This command only works in <#9200000000000000001> or <#9200000000000000002>, or in a thread inside one of them\.$/,
    ],
    // A thread under some other channel, and a non-thread claiming an allowed parent.
    [
      { channelId: '777', channel: { id: '777', type: 11, parent_id: '888' } },
      /only works in <#9200000000000000001>/,
    ],
    [
      {
        channelId: '777',
        channel: { id: '777', type: 0, parent_id: MARKETING_CHANNEL_IDS.eventsTeam },
      },
      /only works in <#9200000000000000001>/,
    ],
    [
      {
        channelId: '777',
        channel: { id: '778', type: 11, parent_id: MARKETING_CHANNEL_IDS.eventsTeam },
      },
      /only works in <#9200000000000000001>/,
    ],
  ]) {
    const f = fixture();
    await f.dispatcher.handle(interaction(options));
    assert.equal(f.calls.length, 1);
    assert.equal(f.calls[0].body.type, 4);
    assert.equal(f.calls[0].body.data.flags, 64);
    assert.match(f.calls[0].body.data.content, pattern);
    assert.equal(f.calendarReads, 0);
    assert.equal(f.registered.length, 0);
  }
});

test('threads inside an allowed channel are allowed, for the command and the dropdown', async () => {
  for (const type of [10, 11, 12]) {
    const channel = { id: '777', type, parent_id: MARKETING_CHANNEL_IDS.marketingAndContentTeam };
    const f = fixture();
    await f.dispatcher.handle(interaction({ channelId: '777', channel }));
    assert.equal(f.calls[0].body.type, 5);
    assert.equal(f.calendarReads, 1);
    const token = f.calls[1].body.components[0].components[0].options[0].value;
    await f.dispatcher.handle(
      interaction({ type: 3, customId: 'mkt:info', values: [token], channelId: '777', channel }),
    );
    assert.equal(f.calls[2].body.type, 6);
    assert.match(f.calls[3].body.content, /no details submitted yet/);
  }
});

test('other guilds, other commands and unknown components are ignored without a response', async () => {
  const f = fixture();
  assert.deepEqual(await f.dispatcher.handle(interaction({ guild: '1' })), { status: 'ignored' });
  assert.deepEqual(await f.dispatcher.handle(interaction({ name: 'ask' })), { status: 'ignored' });
  assert.deepEqual(
    await f.dispatcher.handle(interaction({ type: 3, customId: 'other:thing', values: ['x'] })),
    { status: 'ignored' },
  );
  assert.deepEqual(await f.dispatcher.handle({ t: 'MESSAGE_CREATE', d: {} }), {
    status: 'ignored',
  });
  assert.equal(f.calls.length, 0);
});

test('more than 25 events offers the first 25 and says so', async () => {
  const f = fixture({ events: Array.from({ length: 30 }, (_, i) => calendarEvent(i)) });
  await f.dispatcher.handle(interaction());
  const edit = f.calls[1].body;
  assert.equal(edit.components[0].components[0].options.length, 25);
  assert.match(edit.content, /first 25 of 30/);
  assert.equal(f.registered[0].length, 25);
});

test('Calendar failure and an empty calendar are reported honestly', async () => {
  const failed = fixture({ calendarStatus: 'permission_denied' });
  await failed.dispatcher.handle(interaction());
  assert.match(failed.calls[1].body.content, /couldn't read the club calendar/);
  assert.equal(failed.calls[1].body.components, undefined);
  const empty = fixture({ events: [] });
  await empty.dispatcher.handle(interaction());
  assert.match(empty.calls[1].body.content, /no confirmed upcoming events/);
});

test('picking an event with no submission says no details submitted yet', async () => {
  const f = fixture();
  await f.dispatcher.handle(interaction());
  const components = f.calls[1].body.components;
  await f.dispatcher.handle(
    interaction({
      type: 3,
      customId: 'mkt:info',
      values: [tokenOf('event001')],
      message: { components },
    }),
  );
  assert.deepEqual(f.calls[2].body, { type: 6 });
  const shown = f.calls[3].body;
  assert.match(shown.content, /\*\*Event 1\*\* \(2026-11-21\): no details submitted yet\./);
  assert.deepEqual(shown.components, components);
});

test('picking an event with a submission shows its details', async () => {
  const f = fixture({
    details: {
      event001: {
        fields: { title: 'Hack Night', location: 'Bobst', description: 'Build things', food: '' },
        version: 2,
        updatedAt: '2026-11-18T20:00:00Z',
      },
    },
  });
  await f.dispatcher.handle(interaction());
  await f.dispatcher.handle(
    interaction({ type: 3, customId: 'mkt:info', values: [tokenOf('event001')] }),
  );
  const embed = f.calls[3].body.embeds[0];
  assert.equal(embed.title, 'Hack Night');
  assert.deepEqual(embed.fields, [
    { name: 'Location', value: 'Bobst' },
    { name: 'Description', value: 'Build things' },
  ]);
  assert.equal(embed.footer.text, 'Still missing: when');
});

test('a stale or unknown token and a database outage are explained, not shown as empty', async () => {
  const stale = fixture();
  await stale.dispatcher.handle(
    interaction({ type: 3, customId: 'mkt:info', values: ['ffffffffffffffff'] }),
  );
  assert.match(stale.calls[1].body.content, /lost track of that event/);
  const down = fixture({ lookupStatus: 'unavailable' });
  await down.dispatcher.handle(
    interaction({ type: 3, customId: 'mkt:info', values: ['ffffffffffffffff'] }),
  );
  assert.match(down.calls[1].body.content, /couldn't load the details/);
});

test('the dropdown re-checks access before showing details', async () => {
  const f = fixture();
  await f.dispatcher.handle(
    interaction({ type: 3, customId: 'mkt:info', values: [tokenOf('event001')], roles: ['999'] }),
  );
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].body.type, 4);
});

test('roles and channels come only from env, and unset lists deny everyone', async () => {
  for (const unset of [
    { MARKETING_ALLOWED_ROLE_IDS: undefined },
    { MARKETING_ALLOWED_CHANNEL_IDS: undefined },
    { MARKETING_ALLOWED_ROLE_IDS: ' ', MARKETING_ALLOWED_CHANNEL_IDS: '' },
  ]) {
    const f = fixture({ env: { ...env, ...unset } });
    await f.dispatcher.handle(interaction());
    assert.equal(f.calls.length, 1);
    assert.equal(f.calls[0].body.type, 4);
    assert.equal(f.calendarReads, 0);
  }
  const none = fixture({ env: { ...env, MARKETING_ALLOWED_CHANNEL_IDS: undefined } });
  await none.dispatcher.handle(interaction());
  assert.equal(none.calls[0].body.data.content, "This command isn't enabled in any channel yet.");
  // A test channel and role are just env values.
  const test = fixture({
    env: {
      ...env,
      MARKETING_ALLOWED_ROLE_IDS: '9300000000000000001',
      MARKETING_ALLOWED_CHANNEL_IDS: '9400000000000000001',
    },
  });
  await test.dispatcher.handle(interaction({ channelId: '9400000000000000001' }));
  assert.match(test.calls[0].body.data.content, /You don't have a role/);
  await test.dispatcher.handle(
    interaction({ roles: ['9300000000000000001'], channelId: '9400000000000000001' }),
  );
  assert.equal(test.calls[1].body.type, 5);
  assert.equal(test.calendarReads, 1);
});

test('disabled, unconfigured or malformed interactions do not start', () => {
  for (const bad of [
    { MARKETING_ALLOWED_ROLE_IDS: '123,abc' },
    { MARKETING_ALLOWED_CHANNEL_IDS: '1,,2' },
  ]) {
    const logs = [];
    assert.equal(
      createMarketingInteractions({
        env: { ...env, ...bad },
        calendar: { configured: true },
        store: { configured: true },
        log: (entry) => logs.push(entry),
      }),
      null,
    );
    assert.equal(logs[0].status, 'interactions_unavailable');
  }
  assert.equal(
    createMarketingInteractions({ env: { ...env, MARKETING_INTERACTIONS_ENABLED: 'false' } }),
    null,
  );
  const logs = [];
  assert.equal(
    createMarketingInteractions({
      env,
      calendar: { configured: false },
      store: { configured: true },
      log: (entry) => logs.push(entry),
    }),
    null,
  );
  assert.equal(logs[0].status, 'interactions_unavailable');
});

test('Gateway sends interactions to the dispatcher only, never chat or ingestion, and a stuck handler does not block the checkpoint', async () => {
  const session = {
    sessionId: 'synthetic',
    resumeURL: 'wss://gateway.discord.gg',
    sequence: 1,
    shardId: 0,
    shardCount: 1,
  };
  const f = {
    manager: new EventEmitter(),
    checkpoints: [],
    messages: [],
    chat: [],
    interactions: [],
    logs: [],
  };
  f.manager.connect = async () => {};
  f.manager.destroy = async () => {};
  const gateway = await createDiscordGateway({
    config: { guildId: '100', botToken: 'synthetic', maxPending: 10 },
    listener: { handle: async (event) => f.messages.push(event) },
    state: {
      load: async () => ({ session }),
      save: async (_, next) => f.checkpoints.push(next.session.sequence),
    },
    refreshMetadata: async () => {},
    createRest: () => ({}),
    createManager: (options) => {
      f.options = options;
      return f.manager;
    },
    onDispatch: (event) => f.chat.push(event),
    onInteraction: (event) => {
      f.interactions.push(event);
      return new Promise(() => {});
    },
    log: (event) => f.logs.push(event),
  });
  f.options.updateSessionInfo(0, session);
  f.manager.emit(E.Dispatch, { t: 'INTERACTION_CREATE', s: 2, d: { guild_id: '100' } }, 0);
  f.manager.emit(
    E.Dispatch,
    { t: 'MESSAGE_CREATE', s: 3, d: { guild_id: '100', channel_id: '1', id: '2' } },
    0,
  );
  await gateway.drain();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(
    f.interactions.map((e) => e.t),
    ['INTERACTION_CREATE'],
  );
  assert.deepEqual(
    f.chat.map((e) => e.t),
    ['MESSAGE_CREATE'],
  );
  assert.deepEqual(
    f.messages.map((e) => e.t),
    ['MESSAGE_CREATE'],
  );
  assert.deepEqual(f.checkpoints, [2, 3]);
  await gateway.stop();
});
