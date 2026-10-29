import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { fuzzystrmatch } from '@electric-sql/pglite/contrib/fuzzystrmatch';
import { Hono } from 'hono';
import { createContactsStore } from '../server/contacts/store.js';
import { contactFields, CONTACT_FIELDS } from '../server/contacts/fields.js';
import { registerContactsApi } from '../src/api/contacts/register.js';
import { createContactsTools } from '../tools/contacts/index.js';
import { contactPrincipal, contactRow } from './fixtures/contacts-store.mjs';

const id = (n) => `46000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const args = [
  'p_query',
  'p_limit',
  'p_offset',
  'p_name',
  'p_workplace',
  'p_email_presence',
  'p_phone_presence',
  'p_sort',
];
const defaults = ['', 10, 0, '', '', 'any', 'any', 'auto'];
const columns = 'id,created_at::text,updated_at::text,raw_input,lookup_email';
const summaryColumns = 'id,created_at::text,updated_at::text,fields';
const migration = (name) =>
  readFile(new URL('../supabase/migrations/' + name, import.meta.url), 'utf8');

function largeNativeRows() {
  const rows = Array.from({ length: 15 }, (_, index) => ({
    ...contactRow(id(index + 1), {
      first_name: `Contact ${String(index).padStart(2, '0')}`,
      last_name: 'Example',
      workplace: index % 2 ? 'Example Labs' : 'Other Studio',
      email: index % 2 ? `person${index}@example.com` : '',
      phone_number: index % 3 ? '' : '00123',
      notes: 'Original human notes',
      native_private: {
        text: 'private-fixture-native-' + 'x'.repeat(50_000),
        retain: [null, 3, { source: true }],
      },
    }),
    created_at: `2026-10-${String(index + 1).padStart(2, '0')}T12:00:00.123456+00:00`,
    lookup_email: null,
  }));
  rows[0].raw_input = {
    found: true,
    person: { first_name: 'Rae', last_name: 'Example', workplace: 'Example Labs' },
    notes: 'Original human notes',
    native_private: rows[0].raw_input.native_private,
  };
  rows[0].lookup_email = 'rae@example.com';
  rows[1].raw_input = {
    entities: [
      {
        type: 'person',
        properties: {
          firstName: 'Morgan',
          lastName: 'Example',
          workHistory: [{ company: { name: 'Example Labs' }, dates: { to: null } }],
        },
      },
    ],
    email: '',
    native_private: rows[1].raw_input.native_private,
  };
  rows[1].lookup_email = 'manually-cleared@example.com';
  Object.assign(rows[2].raw_input, {
    first_name: 'Avery',
    last_name: 'Chen',
    workplace: 'Northstar Labs',
  });
  Object.assign(rows[3].raw_input, {
    first_name: 'Avrey',
    last_name: 'Literal',
    workplace: 'Other Studio',
  });
  return rows;
}

async function fixture(t) {
  const db = new PGlite({ extensions: { pg_trgm, fuzzystrmatch } });
  t.after(() => db.close());
  await db.exec(
    'create role anon;create role authenticated;create role public_probe;create role service_role bypassrls;',
  );
  for (const file of [
    '202610260047_contacts.sql',
    '202610260048_contacts_search.sql',
    '202610260049_contacts_cache.sql',
    '202610260050_gmail_contact_enrichment.sql',
    '202610270051_contacts_native_fields.sql',
    '202610270054_contacts_exa_fields.sql',
  ]) {
    await db.exec(await migration(file));
  }
  const rows = largeNativeRows();
  for (const row of rows)
    await db.query(
      'insert into public.contacts(id,created_at,updated_at,raw_input,lookup_email) values($1,$2,$3,$4::jsonb,$5)',
      [row.id, row.created_at, row.updated_at, JSON.stringify(row.raw_input), row.lookup_email],
    );
  const snapshot = async () =>
    (await db.query(`select ${columns} from public.contacts order by id`)).rows;
  const before = await snapshot();
  await db.exec(await migration('202610280056_contacts_search_fields.sql'));
  assert.deepEqual(
    await snapshot(),
    before,
    'Applying the new read function preserves raw rows and exact timestamps',
  );
  await db.exec('set role service_role');
  const sqlSearch = async (name = 'contacts_search_fields', options = {}) =>
    (
      await db.query(
        `select ${name === 'contacts_search' ? columns : summaryColumns} from public.${name}(${args.map((key, i) => `${key}=>$${i + 1}`).join(',')})`,
        args.map((key, i) => options[key] ?? defaults[i]),
      )
    ).rows;
  const calls = [],
    writes = [],
    wire = [];
  const mode = {};
  const fetchImpl = async (input, init = {}) => {
    const url = new URL(input),
      method = init.method ?? 'GET';
    assert.equal(
      url.origin,
      'https://contacts-summary.example.test',
      'All service access stays local',
    );
    const payload = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ path: url.pathname, method, body: payload });
    let responseRows;
    if (url.pathname === '/rest/v1/rpc/contacts_search_fields') {
      assert.equal(method, 'POST');
      responseRows = await sqlSearch('contacts_search_fields', payload);
      if (mode.leakRaw) responseRows[0].raw_input = { private: 'must-never-be-exposed' };
      if (mode.invalidFields) responseRows[0].fields.notes = { unexpected: true };
    } else {
      assert.equal(
        url.pathname,
        '/rest/v1/contacts',
        'Search must not fall back to downloading full native rows',
      );
      assert.equal(
        url.searchParams.get('select'),
        'id,created_at,updated_at,raw_input,lookup_email',
      );
      const target = url.searchParams.get('id')?.replace(/^eq\./, '');
      assert(target, 'Only exact full-row reads/writes are admitted');
      if (method === 'GET')
        responseRows = (
          await db.query(`select ${columns} from public.contacts where id=$1`, [target])
        ).rows;
      else if (method === 'PATCH') {
        const version = url.searchParams.get('updated_at')?.replace(/^eq\./, '');
        assert(version, 'Writes require the exact observed version');
        writes.push({ target, version, rawInput: structuredClone(payload.raw_input) });
        responseRows = (
          await db.query(
            `with saved as (update public.contacts set raw_input=$3::jsonb
          where id=$1 and updated_at=$2::timestamptz returning *) select ${columns} from saved`,
            [target, version, JSON.stringify(payload.raw_input)],
          )
        ).rows;
      } else throw Error('Unexpected service operation');
    }
    const encoded = JSON.stringify(responseRows);
    wire.push({ path: url.pathname, bytes: Buffer.byteLength(encoded), rows: responseRows.length });
    return new Response(encoded, { headers: { 'content-type': 'application/json' } });
  };
  const store = createContactsStore({
    env: {
      SUPABASE_URL: 'https://contacts-summary.example.test',
      SUPABASE_SERVICE_ROLE_KEY: 'synthetic-summary-key',
    },
    fetchImpl,
  });
  const app = new Hono();
  registerContactsApi({
    app,
    contactsStore: store,
    auth: async () => contactPrincipal,
    config: { timeoutMs: 10_000 },
    readJSON: (request) => request.json(),
  });
  const request = async (path) => {
    const response = await app.request('https://contacts-http.example.test' + path);
    return { http: response.status, body: await response.json() };
  };
  return { db, rows, snapshot, before, sqlSearch, store, request, calls, writes, wire, mode };
}

test('Contacts summaries fix oversized native search pages without changing raw records or write authority', async (t) => {
  const h = await fixture(t);
  await t.test(
    'large pages cross the old cap, while supported summaries retain paging and native projections',
    async () => {
      const legacy = await h.sqlSearch('contacts_search');
      assert(
        Buffer.byteLength(JSON.stringify(legacy)) > 300_000,
        'The fixture reproduces a genuinely oversized native page',
      );
      assert.equal(
        legacy.length,
        11,
        'Database includes one extra candidate to establish another page',
      );
      const page = await h.store.search({ limit: 10 });
      assert.equal(page.status, 'ready');
      assert.equal(page.contacts.length, 10);
      assert.deepEqual(page.coverage, { complete: false, nextOffset: 10 });
      assert(
        h.wire.at(-1).bytes < 20_000,
        'Only bounded supported fields cross the search transport',
      );
      const second = await h.store.search({ limit: 10, offset: 10 });
      assert.equal(second.status, 'ready');
      assert.deepEqual(second.coverage, { complete: true, nextOffset: null });
      const all = [...page.contacts, ...second.contacts];
      assert.equal(all.length, 15);
      assert.equal(new Set(all.map((row) => row.id)).size, 15);
      for (const summary of all) {
        assert.deepEqual(Object.keys(summary).sort(), ['created_at', 'fields', 'id', 'updated_at']);
        assert.deepEqual(Object.keys(summary.fields).sort(), Object.keys(CONTACT_FIELDS).sort());
        const saved = h.before.find((row) => row.id === summary.id);
        assert.deepEqual(summary.fields, contactFields(saved));
        assert.equal(summary.updated_at, saved.updated_at);
        assert.equal(summary.created_at, saved.created_at);
      }
      assert.deepEqual(all.find((row) => row.id === id(1)).fields, {
        first_name: 'Rae',
        last_name: 'Example',
        email: 'rae@example.com',
        phone_number: '',
        workplace: 'Example Labs',
        notes: 'Original human notes',
      });
      assert.equal(all.find((row) => row.id === id(2)).fields.workplace, 'Example Labs');
      assert.equal(
        all.find((row) => row.id === id(2)).fields.email,
        '',
        'Manual clear suppresses lookup-email fallback',
      );
      assert.deepEqual(await h.snapshot(), h.before);
    },
  );
  await t.test(
    'full-table filters, fuzzy ranking and all sort/page orders match the existing search exactly',
    async () => {
      const cases = [
        {},
        { p_sort: 'name_asc' },
        { p_sort: 'name_desc' },
        { p_sort: 'oldest' },
        { p_sort: 'newest' },
        { p_query: 'Avrey', p_sort: 'relevance' },
        { p_query: 'Avery Chne' },
        {
          p_name: 'Example',
          p_workplace: 'Example Labs',
          p_email_presence: 'yes',
          p_phone_presence: 'no',
        },
        { p_email_presence: 'no', p_phone_presence: 'yes' },
        { p_query: 'rae@example.com' },
        { p_query: 'No such person 991' },
        { p_sort: 'name_asc', p_limit: 1, p_offset: 4 },
        { p_limit: 10, p_offset: 10 },
      ];
      for (const options of cases) {
        const legacy = await h.sqlSearch('contacts_search', options);
        const summary = await h.sqlSearch('contacts_search_fields', options);
        assert.deepEqual(
          summary,
          legacy.map((row) => ({
            id: row.id,
            created_at: row.created_at,
            updated_at: row.updated_at,
            fields: contactFields(row),
          })),
          JSON.stringify(options),
        );
      }
      for (const options of [
        { p_limit: 11 },
        { p_offset: -1 },
        { p_sort: 'unknown' },
        { p_email_presence: 'maybe' },
      ]) {
        await assert.rejects(() => h.sqlSearch('contacts_search_fields', options));
      }
      assert.deepEqual(await h.snapshot(), h.before);
    },
  );
  await t.test('only the service role can execute the additive summary read', async () => {
    for (const role of ['anon', 'authenticated', 'public_probe']) {
      await h.db.exec(`begin;set local role ${role}`);
      try {
        await assert.rejects(
          () => h.db.query('select * from public.contacts_search_fields()'),
          (error) => error.code === '42501',
        );
      } finally {
        await h.db.exec('rollback');
      }
    }
    assert.equal((await h.sqlSearch()).length, 11);
    assert.deepEqual(await h.snapshot(), h.before);
  });
  await t.test(
    'browser API and model-facing search retain their six-field contracts and reject leaked/malformed rows',
    async () => {
      const result = await h.request('/api/contacts?limit=10');
      assert.equal(result.http, 200);
      assert.equal(result.body.contacts.length, 10);
      assert.deepEqual(result.body.coverage, { complete: false, nextOffset: 10 });
      const tools = createContactsTools({ store: h.store }).createRequest({
        principal: contactPrincipal,
        userMessage: 'Find saved people.',
      });
      const found = await tools.execute({ name: 'search_contacts', arguments: {} });
      assert.equal(found.status, 'ready');
      assert.equal(found.contacts.length, 5);
      assert.deepEqual(found.coverage, { complete: false, nextOffset: 5 });
      assert(
        !/native_private|private-fixture-native|lookup_email/.test(
          JSON.stringify([result.body, found]),
        ),
      );
      assert.deepEqual(
        Object.keys(found.contacts[0].raw_input).sort(),
        Object.keys(CONTACT_FIELDS).sort(),
      );
      assert(
        h.calls
          .filter((row) => row.path.includes('/rpc/'))
          .every((row) => row.path.endsWith('/contacts_search_fields')),
      );
      for (const key of ['leakRaw', 'invalidFields']) {
        h.mode[key] = true;
        assert.equal((await h.store.search()).status, 'invalid_response');
        const failed = await h.request('/api/contacts');
        assert.equal(failed.http, 503);
        assert(!JSON.stringify(failed.body).includes('must-never-be-exposed'));
        delete h.mode[key];
      }
      assert.deepEqual(await h.snapshot(), h.before);
    },
  );
  await t.test(
    'search never authorizes writes; exact reads preserve native data and optimistic conflicts preserve human edits',
    async () => {
      const tools = createContactsTools({ store: h.store }).createRequest({
        principal: contactPrincipal,
        userMessage: 'Change the selected saved contact notes.',
      });
      const found = await tools.execute({
        name: 'search_contacts',
        arguments: { query: 'Rae Example' },
      });
      const target = found.contacts[0];
      assert.equal(target.id, id(1));
      const update = (version) => ({
        name: 'update_contact',
        arguments: {
          contactId: target.id,
          expectedUpdatedAt: version,
          fields: { notes: 'Requested new notes' },
        },
      });
      assert.equal((await tools.execute(update(target.updated_at))).status, 'read_required');
      assert.equal(h.writes.length, 0);
      const read = await tools.execute({
        name: 'read_contact',
        arguments: { contactId: target.id },
      });
      assert.equal(read.status, 'ready');
      const updated = await tools.execute(update(read.contact.updated_at));
      assert.equal(updated.status, 'ready');
      const original = h.before.find((row) => row.id === target.id),
        saved = (await h.snapshot()).find((row) => row.id === target.id);
      assert.deepEqual(saved.raw_input, { ...original.raw_input, notes: 'Requested new notes' });
      assert.equal(saved.lookup_email, original.lookup_email);
      assert.equal(saved.created_at, original.created_at);
      assert.notEqual(saved.updated_at, original.updated_at);
      const stale = createContactsTools({ store: h.store }).createRequest({
        principal: contactPrincipal,
        userMessage: 'Change the notes.',
      });
      const observed = await stale.execute({
        name: 'read_contact',
        arguments: { contactId: target.id },
      });
      await h.db.query(
        "update public.contacts set raw_input=jsonb_set(raw_input,'{phone_number}',to_jsonb('Human correction'::text)) where id=$1",
        [target.id],
      );
      const human = await h.snapshot();
      assert.equal((await stale.execute(update(observed.contact.updated_at))).status, 'conflict');
      assert.deepEqual(
        await h.snapshot(),
        human,
        'A stale full snapshot must never replace the later human correction',
      );
      assert.equal(h.writes.length, 2, 'One successful write and one conditional stale attempt');
      assert(h.writes.every((row) => row.rawInput.native_private.text.length > 50_000));
    },
  );
  await t.test(
    'pathological escaped display fields still fail safely at the unchanged response guard',
    async () => {
      await h.db.exec('begin');
      try {
        const maximum = Object.fromEntries(
          Object.entries(CONTACT_FIELDS).map(([key, limit]) => [key, '\u0001'.repeat(limit)]),
        );
        await h.db.query('update public.contacts set raw_input=$1::jsonb', [
          JSON.stringify(maximum),
        ]);
        const result = await h.store.search({ limit: 10 });
        assert.equal(result.status, 'response_too_large');
        assert(h.wire.at(-1).bytes > 256_000);
      } finally {
        await h.db.exec('rollback');
      }
    },
  );
});
