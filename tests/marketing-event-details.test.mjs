import test from 'node:test';
import assert from 'node:assert/strict';
import { createMarketingInteractions } from '../server/marketing/interactions.js';
import { MARKETING_COMMANDS } from '../server/marketing/commands.js';

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
const TOKEN = 'abcdef0123456789';
const calendarEvent = {
  eventId: 'hacknight20261120',
  title: 'Hack Night',
  start: { dateTime: '2026-11-20T23:00:00Z' },
  end: { dateTime: '2026-11-21T01:00:00Z' },
  status: 'confirmed',
};

// In-memory stand-in for the merge RPC with the same semantics as migration
// 202611190058: submitted fields overwrite, `clear` removes, other keys are
// kept, and a stale expectedVersion for the same form is refused.
function fixture({ saved = null, lookupStatus, mergeStatus } = {}) {
  const f = { calls: [], merges: [], saved };
  const event = {
    token: TOKEN,
    eventId: calendarEvent.eventId,
    title: 'Hack Night',
    date: '2026-11-20',
  };
  const calendar = {
    configured: true,
    calendarId: 'club@group.calendar.google.com',
    listEventsWindow: async () => ({
      status: 'ready',
      events: [calendarEvent],
      coverage: { complete: true },
    }),
  };
  const store = {
    configured: true,
    register: async () => ({
      status: 'ready',
      tokens: [{ eventId: calendarEvent.eventId, token: TOKEN }],
    }),
    lookup: async ({ token, signal }) => {
      f.lookupSignal = signal;
      if (lookupStatus) return { status: lookupStatus };
      if (token !== TOKEN) return { status: 'not_found' };
      return { status: 'ready', event, details: f.saved };
    },
    merge: async (request) => {
      f.merges.push(request);
      if (mergeStatus) return { status: mergeStatus };
      if (request.token !== TOKEN) return { status: 'not_found' };
      if (request.expectedVersion !== (f.saved?.versions?.[request.form] ?? 0))
        return { status: 'conflict' };
      if (!f.saved && !Object.keys(request.fields).length)
        return { status: 'ready', event, details: null };
      const fields = { ...(f.saved?.fields ?? {}), ...request.fields };
      const cleared = request.clear
        .filter((key) => Object.hasOwn(f.saved?.fields ?? {}, key))
        .sort();
      for (const key of request.clear) delete fields[key];
      f.saved = {
        fields,
        version: (f.saved?.version ?? 0) + 1,
        versions: {
          core: (f.saved?.versions?.core ?? 0) + (request.form === 'core' ? 1 : 0),
          extra: (f.saved?.versions?.extra ?? 0) + (request.form === 'extra' ? 1 : 0),
        },
        updatedAt: '2026-11-19T17:00:01Z',
      };
      return { status: 'ready', event, details: f.saved, cleared };
    },
  };
  const rest = {
    post: async (path, options) => f.calls.push({ method: 'post', path, body: options.body }),
    patch: async (path, options) => f.calls.push({ method: 'patch', path, body: options.body }),
  };
  f.dispatcher = createMarketingInteractions({ env, calendar, store, rest, now });
  return f;
}

let nextId = 1;
function interaction({
  type,
  data,
  roles = [MARKETING_ROLE_IDS.eventsLeads],
  channelId = MARKETING_CHANNEL_IDS.eventsTeam,
}) {
  return {
    t: 'INTERACTION_CREATE',
    d: {
      id: String(5000 + nextId++),
      application_id: '555',
      token: 'synthetic_interaction_token',
      type,
      guild_id: guildId,
      channel_id: channelId,
      member: { user: { id: '42' }, roles },
      data,
    },
  };
}
const command = (extras, options = {}) =>
  interaction({
    type: 2,
    data: {
      name: 'event-details',
      type: 1,
      ...(extras === undefined ? {} : { options: [{ name: 'extras', type: 5, value: extras }] }),
    },
    ...options,
  });
const pick = (kind, values = [TOKEN], options = {}) =>
  interaction({
    type: 3,
    data: { custom_id: `mkt:pick:${kind}`, component_type: 3, values },
    ...options,
  });
const submit = (kind, values, { version = 0, ...options } = {}) =>
  interaction({
    type: 5,
    data: {
      custom_id: `mkt:${kind}:${TOKEN}:${version}`,
      components: Object.entries(values).map(([id, value]) => ({
        type: 1,
        components: [{ type: 4, custom_id: id, value }],
      })),
    },
    ...options,
  });
const inputsOf = (modal) => modal.components.map((row) => row.components[0]);
// Submits the form exactly as Discord would after the user edits the prefill.
async function openAndSubmit(f, kind, edit) {
  await f.dispatcher.handle(pick(kind));
  const modal = f.calls.at(-1).body.data;
  const values = Object.fromEntries(inputsOf(modal).map((i) => [i.custom_id, i.value ?? '']));
  const [, , token, version] = modal.custom_id.split(':');
  assert.equal(token, TOKEN);
  await f.dispatcher.handle(submit(kind, { ...values, ...edit }, { version: Number(version) }));
  return f.calls.at(-1).body;
}

test('/event-details offers the core picker, and extras:true offers the extras picker', async () => {
  for (const [extras, kind, prompt] of [
    [undefined, 'core', /Which event are you filling in\?/],
    [false, 'core', /filling in/],
    [true, 'extra', /Which event are you adding extras to\?/],
  ]) {
    const f = fixture();
    await f.dispatcher.handle(command(extras));
    assert.deepEqual(f.calls[0].body, { type: 5, data: { flags: 64 } });
    assert.match(f.calls[1].body.content, prompt);
    const menu = f.calls[1].body.components[0].components[0];
    assert.equal(menu.custom_id, `mkt:pick:${kind}`);
    assert.deepEqual(
      menu.options.map((o) => [o.label, o.value]),
      [['Hack Night', TOKEN]],
    );
  }
});

test('picking an event opens the modal pre-filled from saved details and its version', async () => {
  const empty = fixture();
  await empty.dispatcher.handle(pick('core'));
  assert.equal(empty.calls.length, 1);
  assert.equal(empty.calls[0].body.type, 9);
  const modal = empty.calls[0].body.data;
  assert.equal(modal.custom_id, `mkt:core:${TOKEN}:0`);
  assert.deepEqual(
    inputsOf(modal).map((input) => [input.custom_id, input.required, input.value]),
    [
      ['title', true, 'Hack Night'],
      ['when', true, undefined],
      ['location', true, undefined],
      ['description', true, undefined],
      ['food', false, undefined],
    ],
  );
  assert.ok(empty.lookupSignal instanceof AbortSignal);

  const saved = fixture({
    saved: {
      fields: { title: 'Hack Night: AI', location: 'Bobst LL1', notes: 'x' },
      version: 5,
      versions: { core: 3, extra: 2 },
    },
  });
  await saved.dispatcher.handle(pick('extra'));
  // Each form carries its own version, not the overall count.
  assert.equal(saved.calls[0].body.data.custom_id, `mkt:extra:${TOKEN}:2`);
  assert.deepEqual(
    inputsOf(saved.calls[0].body.data).map((input) => [
      input.custom_id,
      input.required,
      input.value,
    ]),
    [
      ['assets', false, undefined],
      ['collab', false, undefined],
      ['tagging', false, undefined],
      ['notes', false, 'x'],
    ],
  );
  await saved.dispatcher.handle(pick('core'));
  assert.equal(saved.calls[1].body.data.custom_id, `mkt:core:${TOKEN}:3`);
  const core = inputsOf(saved.calls[1].body.data);
  assert.equal(core[0].value, 'Hack Night: AI');
  assert.equal(core[2].value, 'Bobst LL1');
});

test("core then extras submissions merge, keeping the other form's fields", async () => {
  const f = fixture();
  const first = await openAndSubmit(f, 'core', {
    title: '  Hack Night  ',
    when: 'Fri Nov 20, 6-8 PM',
    location: 'Bobst LL1',
    description: 'Build something.',
  });
  assert.deepEqual(f.merges[0], {
    token: TOKEN,
    form: 'core',
    expectedVersion: 0,
    updatedBy: '42',
    fields: {
      title: 'Hack Night',
      when: 'Fri Nov 20, 6-8 PM',
      location: 'Bobst LL1',
      description: 'Build something.',
    },
    clear: ['food'],
  });
  assert.match(
    first.content,
    /^Saved the marketing details for \*\*Hack Night\*\* \(2026-11-20\)\./,
  );
  assert.match(first.content, /extras:True/);
  assert.doesNotMatch(first.content, /Cleared/);
  assert.equal(first.embeds[0].footer, undefined);
  assert.deepEqual(first.components, []);

  assert.equal(f.merges[0].form, 'core');
  const second = await openAndSubmit(f, 'extra', { assets: 'https://drive.example/x' });
  assert.equal(f.merges[1].form, 'extra');
  // The core save did not advance the extras form's version.
  assert.equal(f.merges[1].expectedVersion, 0);
  assert.deepEqual(f.merges[1].fields, { assets: 'https://drive.example/x' });
  assert.equal(f.saved.fields.location, 'Bobst LL1');
  assert.doesNotMatch(second.content, /extras:True/);
  assert.deepEqual(
    second.embeds[0].fields.map((field) => field.name),
    ['Date & time', 'Location', 'Description', 'Assets (link)'],
  );
});

test('deleting a pre-filled optional answer clears it; required fields cannot be blanked', async () => {
  const f = fixture({
    saved: {
      fields: {
        title: 'T',
        when: 'W',
        location: 'L',
        description: 'D',
        food: 'Pizza',
        collab: 'Wrong club',
        notes: 'Keep',
      },
      version: 3,
      versions: { core: 1, extra: 2 },
    },
  });
  const reply = await openAndSubmit(f, 'extra', { collab: '' });
  assert.deepEqual(f.merges[0].clear, ['assets', 'collab', 'tagging']);
  assert.deepEqual(f.merges[0].fields, { notes: 'Keep' });
  assert.equal(f.saved.fields.collab, undefined);
  assert.equal(f.saved.fields.notes, 'Keep');
  assert.equal(f.saved.fields.food, 'Pizza');
  // Only the answer that was actually saved is reported as cleared.
  assert.match(reply.content, /Cleared: collab\./);

  const food = await openAndSubmit(f, 'core', { food: '   ' });
  assert.deepEqual(f.merges[1].clear, ['food']);
  assert.equal(f.saved.fields.food, undefined);
  assert.match(food.content, /Cleared: food\./);

  // Discord enforces required inputs; a crafted blank one is refused, not saved.
  await f.dispatcher.handle(submit('core', { title: 'T', location: '' }, { version: 5 }));
  assert.equal(f.merges.length, 2);
  assert.match(f.calls.at(-1).body.content, /couldn't read that form/);
});

test('a form opened before someone else saved the same form is refused and shows the answers to copy', async () => {
  const f = fixture({
    saved: { fields: { title: 'T', collab: 'Old' }, version: 1, versions: { core: 0, extra: 1 } },
  });
  await f.dispatcher.handle(pick('extra'));
  const stale = f.calls.at(-1).body.data;
  // Another member saves the extras form in between.
  await openAndSubmit(f, 'extra', { collab: 'New club' });
  const [, , , version] = stale.custom_id.split(':');
  await f.dispatcher.handle(
    submit(
      'extra',
      { assets: 'https://drive.example/a_b*c', collab: '', tagging: '', notes: 'Bring ```code```' },
      { version: Number(version) },
    ),
  );
  const reply = f.calls.at(-1).body;
  assert.match(
    reply.content,
    /Someone else saved this form for the event after you opened it, so nothing was saved\..*your answers are below to copy in/,
  );
  assert.equal(reply.embeds[0].title, 'Your answers (not saved)');
  assert.deepEqual(
    reply.embeds[0].fields.map((field) => [field.name, field.value]),
    [
      ['Assets (Drive link, etc.)', '```\nhttps://drive.example/a_b*c\n```'],
      ['Club collab', '(left blank)'],
      ['Tag or collaborator on the post?', '(left blank)'],
      ['Anything else marketing should know', '```\nBring `\u200b``code`\u200b``\n```'],
    ],
  );
  assert.equal(f.saved.fields.collab, 'New club');
  assert.equal(f.saved.versions.extra, 2);
});

test('a core save never invalidates an open extras form, and vice versa', async () => {
  const f = fixture({
    saved: { fields: { title: 'T', notes: 'N' }, version: 2, versions: { core: 1, extra: 1 } },
  });
  // One person opens the extras form and another opens the core form.
  await f.dispatcher.handle(pick('extra'));
  const extras = f.calls.at(-1).body.data;
  await f.dispatcher.handle(pick('core'));
  const core = f.calls.at(-1).body.data;
  const versionOf = (modal) => Number(modal.custom_id.split(':')[3]);
  // The core form saves first, then the extras form opened before it.
  await f.dispatcher.handle(
    submit(
      'core',
      { title: 'T', when: 'Fri', location: 'Bobst', description: 'D', food: '' },
      { version: versionOf(core) },
    ),
  );
  assert.match(f.calls.at(-1).body.content, /^Saved/);
  await f.dispatcher.handle(
    submit(
      'extra',
      { assets: '', collab: '', tagging: '', notes: 'Updated' },
      { version: versionOf(extras) },
    ),
  );
  assert.match(f.calls.at(-1).body.content, /^Saved/);
  assert.deepEqual(f.saved.fields, {
    title: 'T',
    when: 'Fri',
    location: 'Bobst',
    description: 'D',
    notes: 'Updated',
  });
  assert.deepEqual(f.saved.versions, { core: 2, extra: 2 });
});

test('the summary of a partial core save says which required fields are still missing', async () => {
  const f = fixture();
  // Discord enforces required inputs, but a hand-crafted payload may omit them.
  await f.dispatcher.handle(submit('core', { title: 'Hack Night', when: 'Fri' }));
  assert.equal(f.calls[1].body.embeds[0].footer.text, 'Still missing: location, description');
});

test('a form submits only its own fields; foreign, duplicated, over-long or empty input is not saved', async () => {
  const f = fixture();
  await f.dispatcher.handle(
    submit('extra', { notes: 'ok', title: 'Hijacked', location: 'Elsewhere' }),
  );
  assert.deepEqual(f.merges[0].fields, { notes: 'ok' });
  assert.deepEqual(f.merges[0].clear, []);

  await f.dispatcher.handle(submit('core', { title: 'x'.repeat(121) }, { version: 1 }));
  assert.equal(f.merges.length, 1);
  assert.match(f.calls.at(-1).body.content, /couldn't read that form/);

  await f.dispatcher.handle(submit('extra', {}, { version: 1 }));
  assert.equal(f.merges.length, 1);
  assert.match(f.calls.at(-1).body.content, /form was empty\. Saved details are unchanged/);

  // Clearing everything on an event with nothing saved writes nothing.
  const blank = fixture();
  await blank.dispatcher.handle(
    submit('extra', { assets: '', collab: '', tagging: '', notes: '' }),
  );
  assert.equal(blank.saved, null);
  assert.match(blank.calls.at(-1).body.content, /nothing was saved before/);

  const bad = fixture();
  for (const customId of [`mkt:core:${TOKEN}`, `mkt:core:${TOKEN}:x`, `mkt:core:${TOKEN}:01`]) {
    await bad.dispatcher.handle(
      interaction({ type: 5, data: { custom_id: customId, components: [] } }),
    );
    assert.match(bad.calls.at(-1).body.content, /couldn't read that form/);
  }
  assert.equal(bad.merges.length, 0);
});

test('failed saves are reported honestly and never confirmed', async () => {
  for (const [status, pattern] of [
    ['not_found', /lost track of that event/],
    ['too_large', /too long to save/],
    ['unavailable', /couldn't confirm the save\. Check with \/event-info/],
    ['aborted', /couldn't confirm the save/],
    ['schema_not_ready', /couldn't save the details right now, so nothing was saved/],
    ['forbidden', /nothing was saved/],
  ]) {
    const f = fixture({ mergeStatus: status });
    await f.dispatcher.handle(submit('core', { title: 'Hack Night' }));
    assert.match(f.calls[1].body.content, pattern);
    assert.doesNotMatch(f.calls[1].body.content, /^Saved/);
  }
});

test('a slow or failed prefill read never opens an empty form', async () => {
  for (const [options, pattern] of [
    [{ lookupStatus: 'not_found' }, /lost track/],
    [{ lookupStatus: 'unavailable' }, /couldn't load that event's saved details in time/],
    [{ lookupStatus: 'aborted' }, /Pick it again/],
  ]) {
    const f = fixture(options);
    await f.dispatcher.handle(pick('core'));
    assert.equal(f.calls.length, 1);
    assert.equal(f.calls[0].body.type, 4);
    assert.equal(f.calls[0].body.data.flags, 64);
    assert.match(f.calls[0].body.data.content, pattern);
  }
  const bad = fixture();
  await bad.dispatcher.handle(pick('core', ['not-a-token']));
  await bad.dispatcher.handle(pick('other'));
  assert.deepEqual(
    bad.calls.map((call) => call.body.type),
    [4, 4],
  );
});

test('access is checked on the command, the pick and the submission', async () => {
  const outsider = { roles: ['999'] };
  const wrongChannel = { channelId: '777' };
  for (const event of [
    command(undefined, outsider),
    pick('core', [TOKEN], outsider),
    submit('core', { title: 'x' }, outsider),
    submit('extra', { notes: 'x' }, wrongChannel),
  ]) {
    const f = fixture();
    await f.dispatcher.handle(event);
    assert.equal(f.calls.length, 1);
    assert.equal(f.calls[0].body.type, 4);
    assert.match(f.calls[0].body.data.content, /<#9200000000000000001>/);
    assert.equal(f.merges.length, 0);
  }
});

test('the registered command definition has only the optional extras switch', () => {
  assert.deepEqual(MARKETING_COMMANDS['event-details'], {
    name: 'event-details',
    type: 1,
    description: 'Fill in marketing details for an upcoming event',
    contexts: [0],
    options: [
      {
        type: 5,
        name: 'extras',
        description: 'Open the extras form (assets, collab, tagging, notes) instead',
        required: false,
      },
    ],
  });
});
