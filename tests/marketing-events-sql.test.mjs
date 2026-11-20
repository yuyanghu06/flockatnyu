import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const migration = await readFile(
  new URL('../supabase/migrations/202611190057_marketing_events.sql', import.meta.url),
  'utf8',
);
const call = async (db, name, payload) =>
  (await db.query(`select public.${name}($1::jsonb) as r`, [JSON.stringify(payload)])).rows[0].r;
const eventId = 'abc123def456_20261120';

async function setup() {
  const db = new PGlite();
  await db.exec(
    'create role anon;create role authenticated;create role service_role bypassrls;create table public.events(id int);insert into public.events values (7);',
  );
  await db.exec(migration);
  return db;
}

test('tables are service-only with forced RLS and leave the map events table alone', async () => {
  const db = await setup();
  try {
    for (const table of ['marketing_event_tokens', 'marketing_event_details']) {
      const row = (
        await db.query(
          `select relrowsecurity,relforcerowsecurity from pg_class where oid='public.${table}'::regclass`,
        )
      ).rows[0];
      assert.deepEqual(row, { relrowsecurity: true, relforcerowsecurity: true });
      for (const role of ['anon', 'authenticated'])
        assert.equal(
          (await db.query(`select has_table_privilege('${role}','public.${table}','select') as ok`))
            .rows[0].ok,
          false,
        );
    }
    for (const role of ['anon', 'authenticated'])
      assert.equal(
        (
          await db.query(
            `select has_function_privilege('${role}','public.marketing_event_lookup(jsonb)','execute') as ok`,
          )
        ).rows[0].ok,
        false,
      );
    assert.deepEqual((await db.query('select id from public.events')).rows, [{ id: 7 }]);
  } finally {
    await db.close();
  }
});

test('register returns stable tokens, updates titles, and lookup reports no details yet', async () => {
  const db = await setup();
  try {
    await db.exec('set role service_role');
    const first = await call(db, 'marketing_event_register', {
      events: [{ eventId, title: 'Hack Night', date: '2026-11-20' }],
    });
    assert.equal(first.status, 'ready');
    const token = first.tokens[0].token;
    assert.match(token, /^[0-9a-f]{16}$/);
    const again = await call(db, 'marketing_event_register', {
      events: [{ eventId, title: 'Hack Night (moved)', date: '2026-11-21' }],
    });
    assert.equal(again.tokens[0].token, token);
    const found = await call(db, 'marketing_event_lookup', { token });
    assert.deepEqual(found, {
      status: 'ready',
      event: { token, eventId, title: 'Hack Night (moved)', date: '2026-11-21' },
      details: null,
    });
    assert.equal(
      (await call(db, 'marketing_event_lookup', { token: '0000000000000000' })).status,
      'not_found',
    );
  } finally {
    await db.close();
  }
});

test('lookup returns saved details with their version', async () => {
  const db = await setup();
  try {
    const { token } = (
      await call(db, 'marketing_event_register', {
        events: [{ eventId, title: 'Hack Night', date: '2026-11-20' }],
      })
    ).tokens[0];
    await db.query(
      `insert into public.marketing_event_details(calendar_event_id,details,updated_by) values($1,$2::jsonb,'42')`,
      [eventId, JSON.stringify({ location: 'Bobst' })],
    );
    const found = await call(db, 'marketing_event_lookup', { token });
    assert.deepEqual(found.details.fields, { location: 'Bobst' });
    assert.equal(found.details.version, 1);
  } finally {
    await db.close();
  }
});

test('a token already owned by a different event is a conflict, never a redirect', async () => {
  const db = await setup();
  try {
    const token = (await db.query('select public.marketing_event_token($1) as t', [eventId]))
      .rows[0].t;
    await db.query(
      `insert into public.marketing_event_tokens(token,calendar_event_id,title,event_date) values($1,'someotherevent','Other','2026-11-20')`,
      [token],
    );
    const result = await call(db, 'marketing_event_register', {
      events: [{ eventId, title: 'Hack Night', date: '2026-11-20' }],
    });
    assert.deepEqual(result, { status: 'conflict' });
  } finally {
    await db.close();
  }
});

test('malformed payloads are rejected without partial writes', async () => {
  const db = await setup();
  try {
    const valid = { eventId, title: 'Hack Night', date: '2026-11-20' };
    for (const payload of [
      {},
      { events: [] },
      { events: Array.from({ length: 26 }, (_, i) => ({ ...valid, eventId: `event${i}x` })) },
      { events: [valid, { ...valid, eventId: 'bad id!' }] },
      { events: [{ ...valid, date: '2026-02-30' }] },
      { events: [{ ...valid, title: '' }] },
      { events: [{ ...valid, extra: 1 }] },
      { events: [valid], other: true },
    ])
      assert.equal((await call(db, 'marketing_event_register', payload)).status, 'invalid_request');
    assert.equal(
      (await db.query('select count(*)::int as n from public.marketing_event_tokens')).rows[0].n,
      0,
    );
    for (const payload of [{}, { token: 'XYZ' }, { token: '0000000000000000', x: 1 }])
      assert.equal((await call(db, 'marketing_event_lookup', payload)).status, 'invalid_request');
  } finally {
    await db.close();
  }
});
