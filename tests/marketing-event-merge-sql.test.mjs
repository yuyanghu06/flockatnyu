import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const migrations = await Promise.all(
  ['202611190057_marketing_events.sql', '202611190058_marketing_event_details_merge.sql'].map(
    (name) => readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8'),
  ),
);
const call = async (db, name, payload) =>
  (await db.query(`select public.${name}($1::jsonb) as r`, [JSON.stringify(payload)])).rows[0].r;
const eventId = 'abc123def456_20261120';

async function setup() {
  const db = new PGlite();
  await db.exec('create role anon;create role authenticated;create role service_role bypassrls;');
  for (const sql of migrations) await db.exec(sql);
  await db.exec('set role service_role');
  const { token } = (
    await call(db, 'marketing_event_register', {
      events: [{ eventId, title: 'Hack Night', date: '2026-11-20' }],
    })
  ).tokens[0];
  return { db, token };
}

const merge = (db, payload) =>
  call(db, 'marketing_event_merge', { clear: [], updatedBy: '42', ...payload });
const core = { title: 'Hack Night', when: 'Fri', location: 'Bobst', description: 'Build.' };

test('core and extras merge into one record, each with its own version', async () => {
  const { db, token } = await setup();
  try {
    const first = await merge(db, {
      token,
      form: 'core',
      expectedVersion: 0,
      fields: core,
      clear: ['food'],
    });
    assert.equal(first.status, 'ready');
    assert.deepEqual(first.event, { token, eventId, title: 'Hack Night', date: '2026-11-20' });
    assert.deepEqual([first.details.version, first.details.versions], [1, { core: 1, extra: 0 }]);
    assert.deepEqual(first.cleared, []);
    const second = await merge(db, {
      token,
      form: 'extra',
      expectedVersion: 0,
      updatedBy: '43',
      fields: { assets: 'https://drive.example/x' },
    });
    assert.deepEqual(second.details.fields, { ...core, assets: 'https://drive.example/x' });
    assert.deepEqual([second.details.version, second.details.versions], [2, { core: 1, extra: 1 }]);
    const third = await merge(db, {
      token,
      form: 'core',
      expectedVersion: 1,
      fields: { location: 'Kimmel' },
    });
    assert.equal(third.details.fields.location, 'Kimmel');
    assert.deepEqual(third.details.versions, { core: 2, extra: 1 });
    const row = (
      await db.query(
        'select updated_by from public.marketing_event_details where calendar_event_id=$1',
        [eventId],
      )
    ).rows[0];
    assert.equal(row.updated_by, '42');
    const found = await call(db, 'marketing_event_lookup', { token });
    assert.deepEqual(found.details.fields, third.details.fields);
    assert.deepEqual(found.details.versions, { core: 2, extra: 1 });
  } finally {
    await db.close();
  }
});

test('clear removes saved optional fields and reports only those that existed', async () => {
  const { db, token } = await setup();
  try {
    await merge(db, {
      token,
      form: 'core',
      expectedVersion: 0,
      fields: { ...core, food: 'Pizza' },
    });
    await merge(db, {
      token,
      form: 'extra',
      expectedVersion: 0,
      fields: { collab: 'Wrong', notes: 'Keep' },
    });
    const result = await merge(db, {
      token,
      form: 'extra',
      expectedVersion: 1,
      fields: { notes: 'Keep' },
      clear: ['tagging', 'collab', 'assets'],
    });
    assert.deepEqual(result.details.fields, { ...core, food: 'Pizza', notes: 'Keep' });
    assert.deepEqual(result.cleared, ['collab']);
    // Clearing only, with nothing else submitted.
    const food = await merge(db, {
      token,
      form: 'core',
      expectedVersion: 1,
      fields: {},
      clear: ['food'],
    });
    assert.deepEqual(food.details.fields, { ...core, notes: 'Keep' });
    assert.deepEqual(food.cleared, ['food']);
  } finally {
    await db.close();
  }
});

test('clearing an event with nothing saved writes nothing', async () => {
  const { db, token } = await setup();
  try {
    const result = await merge(db, {
      token,
      form: 'extra',
      expectedVersion: 0,
      fields: {},
      clear: ['notes'],
    });
    assert.equal(result.status, 'ready');
    assert.equal(result.details, null);
    assert.equal(
      (await db.query('select count(*)::int as n from public.marketing_event_details')).rows[0].n,
      0,
    );
  } finally {
    await db.close();
  }
});

test('a stale form is a conflict, but a save of the other form never makes it stale', async () => {
  const { db, token } = await setup();
  try {
    await merge(db, { token, form: 'extra', expectedVersion: 0, fields: { collab: 'Old' } });
    // Two extras forms opened at extra version 1; one saves first.
    assert.equal(
      (await merge(db, { token, form: 'extra', expectedVersion: 1, fields: { collab: 'New' } }))
        .status,
      'ready',
    );
    const stale = await merge(db, {
      token,
      form: 'extra',
      expectedVersion: 1,
      fields: {},
      clear: ['collab'],
    });
    assert.deepEqual(stale, { status: 'conflict', version: 2 });
    // Core saves leave the extras version alone, and vice versa.
    assert.equal(
      (await merge(db, { token, form: 'core', expectedVersion: 0, fields: core })).status,
      'ready',
    );
    assert.equal(
      (await merge(db, { token, form: 'extra', expectedVersion: 2, fields: { notes: 'N' } }))
        .status,
      'ready',
    );
    assert.equal(
      (await merge(db, { token, form: 'core', expectedVersion: 1, fields: { when: 'Sat' } }))
        .status,
      'ready',
    );
    const found = await call(db, 'marketing_event_lookup', { token });
    assert.deepEqual(found.details.fields, { ...core, when: 'Sat', collab: 'New', notes: 'N' });
    assert.deepEqual([found.details.version, found.details.versions], [5, { core: 2, extra: 3 }]);
    // A first save expecting an earlier save of that form is also a conflict.
    const other = (
      await call(db, 'marketing_event_register', {
        events: [{ eventId: 'otherevent1', title: 'O', date: '2026-11-21' }],
      })
    ).tokens[0].token;
    assert.deepEqual(
      await merge(db, { token: other, form: 'core', expectedVersion: 3, fields: core }),
      { status: 'conflict', version: 0 },
    );
  } finally {
    await db.close();
  }
});

test('invalid, foreign-form and oversized merges change nothing', async () => {
  const { db, token } = await setup();
  try {
    await merge(db, { token, form: 'extra', expectedVersion: 0, fields: { notes: 'ok' } });
    const valid = { token, form: 'extra', expectedVersion: 1, fields: { notes: 'ok' } };
    for (const payload of [
      {},
      { ...valid, fields: {}, clear: [] },
      { ...valid, fields: { notes: '   ' } },
      { ...valid, fields: { notes: 7 } },
      { ...valid, fields: { notes: 'x'.repeat(1001) } },
      { ...valid, fields: { status: 'approved' } },
      // Each form may only touch its own fields.
      { ...valid, fields: { title: 'Hijacked' } },
      { ...valid, form: 'core', fields: { notes: 'x' } },
      { ...valid, clear: ['food'] },
      { ...valid, form: 'core', clear: ['title'] },
      { ...valid, form: 'core', clear: ['location'] },
      { ...valid, form: 'other' },
      { token, expectedVersion: 1, fields: { notes: 'ok' } },
      { ...valid, clear: ['notes'] },
      { ...valid, fields: {}, clear: ['collab', 'collab'] },
      { ...valid, clear: [1] },
      { ...valid, clear: 'collab' },
      { ...valid, expectedVersion: -1 },
      { ...valid, expectedVersion: 1.5 },
      { ...valid, expectedVersion: '1' },
      { token, form: 'extra', fields: { notes: 'ok' } },
      { ...valid, updatedBy: 'someone' },
      { ...valid, token: 'XYZ' },
      { ...valid, extra: true },
    ])
      assert.equal(
        (await merge(db, payload)).status,
        'invalid_request',
        JSON.stringify(payload).slice(0, 80),
      );
    assert.equal((await merge(db, { ...valid, token: '0000000000000000' })).status, 'not_found');
    const big = Object.fromEntries(
      ['title', 'when', 'location', 'description', 'food'].map((key) => [key, 'y'.repeat(1000)]),
    );
    assert.equal(
      (await merge(db, { ...valid, form: 'core', expectedVersion: 0, fields: big })).status,
      'ready',
    );
    // Each field fits, but nine 1000-character fields of two-byte text overflow 16 KiB.
    const wide = Object.fromEntries(
      ['assets', 'collab', 'tagging', 'notes'].map((key) => [key, 'é'.repeat(1000)]),
    );
    const wideCore = Object.fromEntries(Object.keys(big).map((key) => [key, 'é'.repeat(1000)]));
    assert.equal((await merge(db, { ...valid, fields: wide })).status, 'ready');
    assert.equal(
      (await merge(db, { ...valid, form: 'core', expectedVersion: 1, fields: wideCore })).status,
      'too_large',
    );
    const found = await call(db, 'marketing_event_lookup', { token });
    assert.deepEqual(found.details.versions, { core: 1, extra: 2 });
    assert.equal(found.details.fields.title, 'y'.repeat(1000));
  } finally {
    await db.close();
  }
});

test('merge is service-only', async () => {
  const { db } = await setup();
  try {
    for (const role of ['anon', 'authenticated'])
      assert.equal(
        (
          await db.query(
            `select has_function_privilege('${role}','public.marketing_event_merge(jsonb)','execute') as ok`,
          )
        ).rows[0].ok,
        false,
      );
  } finally {
    await db.close();
  }
});
