import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite-pgvector';
import { createMapEventStore } from '../server/map/events.js';
import { createMapPresenceService } from '../server/map/presence.js';

const directory = new URL('../supabase/migrations/', import.meta.url);
const evidence = new URL('../evidence/683-broadway/backend/', import.meta.url);
const files = await readdir(directory);
async function migration(n) {
  const name = files.find(f => f.endsWith('.sql') && Number(f.slice(8, 12)) === n);
  assert(name, `Missing migration ${n}`); return readFile(new URL(name, directory), 'utf8');
}
const sql = await migration(37), id = '683-broadway';
const source = '22222222-2222-4222-8222-222222222222';
const report = { migration: '037', localOnly: true, checks: [], limitations: ['PGlite PostgreSQL fixtures only; no hosted schema or source changes.', 'Current frontend wording was not independently browser tested in this SQL pass.'] };
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
async function allRows(db) {
  const names = (await db.query("select relname from pg_class where relnamespace='public'::regnamespace and relkind='r' order by relname")).rows.map(r => r.relname);
  return Object.fromEntries(await Promise.all(names.map(async name => [name, (await db.query(`select to_jsonb(t) value from public."${name}" t order by to_jsonb(t)::text`)).rows])));
}
async function metadata(db) {
  return {
    tables: (await db.query("select relname,relacl::text,relrowsecurity,relforcerowsecurity from pg_class where relnamespace='public'::regnamespace and relkind='r' order by relname")).rows,
    columns: (await db.query("select table_name,column_name,ordinal_position,data_type,is_nullable,column_default from information_schema.columns where table_schema='public' order by table_name,ordinal_position")).rows,
    constraints: (await db.query("select conrelid::regclass::text relation,conname,contype,pg_get_constraintdef(oid) definition from pg_constraint where connamespace='public'::regnamespace order by relation,conname")).rows,
    indexes: (await db.query("select tablename,indexname,indexdef from pg_indexes where schemaname='public' order by tablename,indexname")).rows,
    triggers: (await db.query("select tgrelid::regclass::text relation,tgname,pg_get_triggerdef(oid) definition from pg_trigger where tgrelid in(select oid from pg_class where relnamespace='public'::regnamespace) order by relation,tgname")).rows,
    policies: (await db.query("select * from pg_policies where schemaname='public' order by tablename,policyname")).rows,
    functions: (await db.query("select p.oid::regprocedure::text signature,p.proacl::text acl,p.prosecdef,p.proconfig,pg_get_functiondef(p.oid) definition from pg_proc p where pronamespace='public'::regnamespace and prokind in('f','p') order by signature")).rows,
  };
}
async function fixture(include36 = false) {
  const db = new PGlite({ extensions: { vector } });
  await db.exec('create role anon;create role authenticated;create role service_role bypassrls;');
  for (let n = 1; n <= 35; n++) await db.exec(await migration(n));
  if (include36) await db.exec(await migration(36));
  await db.query("insert into public.knowledge_sources(id,kind,external_id,title,status) values($1,'manual','go-greek-sql-fixture','Synthetic preservation fixture','active')", [source]);
  const event = { name: 'Expired synthetic preservation event', notes: 'Fixture only', kind: 'scheduled_event', status: 'confirmed', time_kind: 'timed', starts_at: '2020-01-01T00:00:00Z', ends_at: '2020-01-01T01:00:00Z', source_id: source, source_url: 'https://example.test/fixture', source_record_id: 'go-greek-preservation-fixture', reported_at: '2020-01-01T00:00:00Z' };
  await db.query('select public.map_upsert_event($1::jsonb,$2::jsonb,$3::jsonb,null)', [JSON.stringify(event), JSON.stringify([{ building_id: 'bobst-library', location_notes: 'Synthetic room' }]), '[]']);
  return db;
}
async function rejected(db, fn, code) {
  await db.exec('begin');
  try { await assert.rejects(fn, e => e.code === code); } finally { await db.exec('rollback'); }
}
const check = async (t, name, fn) => t.test(name, async () => { await fn(); report.checks.push({ name, pass: true }); });

test('037 owner catalogue registration preserves all existing data and access boundaries', async t => {
  const db = await fixture();
  try {
    const before = await allRows(db), schema = await metadata(db);
    assert.equal(before.map_buildings.length, 9); assert.equal(before.events.length, 1); assert.equal(before.event_buildings.length, 1);
    await db.exec(sql);
    await check(t, 'Adds exactly the requested Go Greek row; every prior row and timestamp, relationship, table, policy and routine remains unchanged', async () => {
      const after = await allRows(db);
      assert.deepEqual(Object.keys(after), Object.keys(before));
      for (const [table, rows] of Object.entries(before)) {
        if (table === 'map_buildings') assert.deepEqual(after[table].filter(r => r.value.id !== id), rows);
        else assert.deepEqual(after[table], rows, table);
      }
      assert.equal(after.map_buildings.length, 10);
      const target = after.map_buildings.find(r => r.value.id === id).value;
      assert.equal(target.name, 'Go Greek'); assert.deepEqual(target.aliases, ['683 Broadway']);
      assert(Number.isFinite(Date.parse(target.updated_at)));
      assert.deepEqual(await metadata(db), schema);
      report.beforeDataHash = digest(before); report.preservedDataHash = digest(Object.fromEntries(Object.entries(after).map(([table, rows]) => [table, table === 'map_buildings' ? rows.filter(r => r.value.id !== id) : rows])));
      assert.equal(report.preservedDataHash, report.beforeDataHash);
      report.row = target;
    });
    await check(t, 'Exact replay leaves the new row and all existing timestamps byte-for-byte unchanged', async () => {
      const beforeReplay = await allRows(db); await db.exec(sql); assert.deepEqual(await allRows(db), beforeReplay);
    });
    await check(t, 'Service cannot insert, update or delete catalogue rows; browser roles cannot SELECT or call the map snapshot', async () => {
      for (const role of ['anon', 'authenticated']) {
        await rejected(db, () => db.exec(`set local role ${role}; select * from public.map_buildings`), '42501');
        await rejected(db, () => db.exec(`set local role ${role}; select public.map_read_events()`), '42501');
      }
      for (const statement of ["insert into public.map_buildings(id,name,aliases) values('not-authorized','Other','{}')", "update public.map_buildings set name='Changed' where id='683-broadway'", "delete from public.map_buildings where id='683-broadway'"]) {
        await rejected(db, () => db.exec(`set local role service_role; ${statement}`), '42501');
      }
      const privileges = (await db.query("select has_table_privilege('service_role','public.map_buildings','SELECT') reads,has_table_privilege('service_role','public.map_buildings','INSERT') inserts,has_table_privilege('service_role','public.map_buildings','UPDATE') updates,has_table_privilege('service_role','public.map_buildings','DELETE') deletes")).rows[0];
      assert.deepEqual(privileges, { reads: true, inserts: false, updates: false, deletes: false }); report.privileges = privileges;
    });
    await check(t, 'Real service SQL snapshot and production presence projection return Go Greek successfully with empty activities', async () => {
      await db.exec('begin;set local role service_role');
      try {
        const snapshot = (await db.query('select public.map_read_events($1) value', ['2026-10-21T20:00:00Z'])).rows[0].value;
        assert.equal(snapshot.buildings.length, 10); const row = snapshot.buildings.find(b => b.id === id); assert.equal(row.name, 'Go Greek');
        assert(!snapshot.event_buildings.some(b => b.building_id === id));
        let calls = 0;
        const store = createMapEventStore({ env: { SUPABASE_URL: 'https://sql-fixture.example.test', SUPABASE_SERVICE_ROLE_KEY: 'synthetic-not-a-real-key' }, fetchImpl: async (url, options) => {
          calls++; assert.equal(new URL(url).pathname, '/rest/v1/rpc/map_read_events');
          const body = JSON.parse(options.body), result = (await db.query('select public.map_read_events($1) value', [body.p_at])).rows[0].value;
          return Response.json(result);
        } });
        const result = await createMapPresenceService({ store, production: true, now: () => new Date('2026-10-21T20:00:00Z') }).read({ principal: { id: 'synthetic-member', allowedSourceIds: [] } });
        assert.equal(calls, 1); assert.equal(result.status, 'ok'); assert.equal(result.buildings.length, 10);
        assert.deepEqual(result.buildings.find(b => b.id === id), { id, name: 'Go Greek', people: [], events: [] }); report.emptyProjection = result.buildings.find(b => b.id === id);
      } finally { await db.exec('rollback'); }
    });
    await check(t, 'Owner cleanup deletes only an unreferenced target, and fixture rollback restores it exactly', async () => {
      const stable = await allRows(db); await db.exec('begin');
      try {
        const deleted = (await db.query('delete from public.map_buildings where id=$1 returning id', [id])).rows; assert.deepEqual(deleted, [{ id }]);
        const after = await allRows(db);
        for (const [table, rows] of Object.entries(stable)) assert.deepEqual(after[table], table === 'map_buildings' ? rows.filter(r => r.value.id !== id) : rows);
      } finally { await db.exec('rollback'); }
      assert.deepEqual(await allRows(db), stable);
    });
    await check(t, 'Existing event-building FK rejects linked target deletion without cascading loss', async () => {
      const stable = await allRows(db); await db.exec('begin');
      try {
        const eventId = stable.events[0].value.id;
        await db.query("insert into public.event_buildings(event_id,building_id,location_notes) values($1,$2,'Fixture only')", [eventId, id]);
        await db.exec('savepoint linked');
        await assert.rejects(() => db.query('delete from public.map_buildings where id=$1', [id]), e => { report.linkedDeleteSqlState = e.code; return ['23503', '23001'].includes(e.code) && e.constraint === 'event_buildings_building_id_fkey'; });
        await db.exec('rollback to savepoint linked;release savepoint linked');
        assert.equal((await db.query('select count(*)::int n from public.event_buildings where building_id=$1', [id])).rows[0].n, 1);
        assert.equal((await db.query('select count(*)::int n from public.events')).rows[0].n, stable.events.length);
      } finally { await db.exec('rollback'); }
      assert.deepEqual(await allRows(db), stable);
    });
    for (const conflict of ['name', 'aliases']) await check(t, `Conflicting existing ${conflict} aborts migration atomically and is never overwritten`, async () => {
      await db.query('update public.map_buildings set name=$1,aliases=$2 where id=$3', [conflict === 'name' ? 'Human maintained name' : 'Go Greek', conflict === 'aliases' ? ['Human maintained alias'] : ['683 Broadway'], id]);
      const conflictSnapshot = await allRows(db);
      try { await assert.rejects(() => db.exec(sql), e => e.code === '23514'); } finally { await db.exec('rollback'); }
      assert.deepEqual(await allRows(db), conflictSnapshot); assert.deepEqual(await metadata(db), schema);
    });
  } finally { await db.close(); }
});

test('037 also remains additive and replay-safe after local optional036 fixture', async () => {
  const db = await fixture(true);
  try {
    const before = await allRows(db), schema = await metadata(db); await db.exec(sql); const after = await allRows(db);
    for (const [table, rows] of Object.entries(before)) assert.deepEqual(table === 'map_buildings' ? after[table].filter(r => r.value.id !== id) : after[table], rows);
    assert.deepEqual(await metadata(db), schema); await db.exec(sql); assert.deepEqual(await allRows(db), after);
    report.checks.push({ name: 'Optional local036 compatibility and idempotency', pass: true });
  } finally { await db.close(); await mkdir(evidence, { recursive: true }); await writeFile(new URL('sql-verification.json', evidence), JSON.stringify(report, null, 2) + '\n'); }
});
