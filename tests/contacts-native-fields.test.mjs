import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { fuzzystrmatch } from '@electric-sql/pglite/contrib/fuzzystrmatch';
import { Hono } from 'hono';
import { createContactsStore } from '../server/contacts.js';
import { registerContactsApi } from '../src/api/contacts/register.js';
import { createContactsTools } from '../tools/contacts/index.js';
import { assistantAnswerPrompt } from '../server/assistant-context.js';
import { createTregEnrichmentClient } from '../server/treg-enrich.js';
import { createGmailEnrichmentWorker } from '../server/gmail-enrichment/worker.js';
import { createGmailEnrichmentCacheStore } from '../server/gmail-enrichment/store.js';
import { gmailSourceId, gmailAccount } from './fixtures/gmail-enrichment.mjs';

// The provider body deliberately has the real incident's wrapper and no email.
// All names, addresses and private-looking fields below are invented fixtures.
const native = (first = 'Rae', last = 'Example') => ({ found: true, person: {
  first_name: first, last_name: last, full_name: `${first} ${last}`,
  experiences: [{ job_is_current: true, company_name: 'Do not infer this workplace' }],
  headline: 'Synthetic profile', extra_native: { untouched: [1, null, 'private fixture'] },
}, fair_usage: { request_id: 'synthetic-native-request', records_used: 1 } });
const principal = { id: 'synthetic-native-contact-member', allowedSourceIds: [] };
const fields = ['first_name', 'last_name', 'email', 'phone_number', 'workplace', 'notes'];
const rpcNames = ['probe', 'claim', 'renew', 'complete', 'defer'];
const response = body => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
const migration = file => readFile(new URL('../supabase/migrations/' + file, import.meta.url), 'utf8');
const columns = 'id,created_at::text,updated_at::text,raw_input,lookup_email';

async function fixture(t, { beforeUpgrade } = {}) {
  const db = new PGlite({ extensions: { pg_trgm, fuzzystrmatch } });
  t.after(() => db.close());
  await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create role contact_public_probe;');
  for (const file of ['202610260047_contacts.sql', '202610260048_contacts_search.sql', '202610260049_contacts_cache.sql', '202610260050_gmail_contact_enrichment.sql']) await db.exec(await migration(file));
  if (beforeUpgrade) await beforeUpgrade(db);
  await db.exec(await migration('202610270051_contacts_native_fields.sql'));
  await db.exec(await migration('202610270054_contacts_exa_fields.sql'));
  await db.exec('set role service_role');
  const calls = [], dispatches = [], logs = [];
  const rpc = async (name, payload) => (await db.query(`select public.gmail_enrichment_${name}($1::jsonb) result`, [JSON.stringify(payload)])).rows[0].result;
  const fetchImpl = async (input, init = {}) => {
    const url = new URL(input), method = init.method ?? 'GET', body = init.body ? JSON.parse(init.body) : undefined;
    assert.equal(url.origin, 'https://native-contacts.example.test', 'No real service request is allowed');
    assert.equal(new Headers(init.headers).get('authorization'), 'Bearer synthetic-local-contact-key');
    calls.push({ path: url.pathname, query: url.searchParams, method, body: structuredClone(body) });
    const operation = rpcNames.find(name => url.pathname === `/rest/v1/rpc/gmail_enrichment_${name}`);
    if (operation) return response(await rpc(operation, body.p_payload));
    if (url.pathname === '/rest/v1/rpc/contacts_search') {
      const keys = ['p_query', 'p_limit', 'p_offset', 'p_name', 'p_workplace', 'p_email_presence', 'p_phone_presence', 'p_sort'];
      return response((await db.query(`select ${columns} from public.contacts_search(${keys.map((key, i) => `${key}=>$${i + 1}`).join(',')})`, keys.map(key => body[key]))).rows);
    }
    if (url.pathname === '/rest/v1/rpc/contacts_match_email') return response((await db.query(`select ${columns} from public.contacts_match_email($1)`, [body.p_email])).rows);
    assert.equal(url.pathname, '/rest/v1/contacts');
    const id = url.searchParams.get('id')?.replace(/^eq\./, ''), stamp = url.searchParams.get('updated_at')?.replace(/^eq\./, '');
    if (method === 'GET') {
      assert(id, 'All non-RPC reads in this fixture are exact contact reads');
      return response((await db.query(`select ${columns} from public.contacts where id=$1`, [id])).rows);
    }
    if (method === 'PATCH') return response((await db.query(`with saved as (update public.contacts set raw_input=$3::jsonb where id=$1 and updated_at=$2::timestamptz returning *) select ${columns} from saved`, [id, stamp, JSON.stringify(body.raw_input)])).rows);
    if (method === 'POST') {
      if (body.id) return response((await db.query(`with saved as (insert into public.contacts(id,raw_input) values($1,$2::jsonb) on conflict(id) do nothing returning *) select ${columns} from saved`, [body.id, JSON.stringify(body.raw_input)])).rows);
      return response((await db.query(`with saved as (insert into public.contacts(raw_input) values($1::jsonb) returning *) select ${columns} from saved`, [JSON.stringify(body.raw_input)])).rows);
    }
    throw Error('Unexpected contact persistence operation');
  };
  const env = { SUPABASE_URL: 'https://native-contacts.example.test', SUPABASE_SERVICE_ROLE_KEY: 'synthetic-local-contact-key' };
  const store = createContactsStore({ env, fetchImpl }), cacheStore = createGmailEnrichmentCacheStore({ env, fetchImpl });
  const app = new Hono();
  registerContactsApi({ app, contactsStore: store, auth: async () => principal, config: { timeoutMs: 10000 }, readJSON: request => request.json() });
  const request = async (path = '/api/contacts', { method = 'GET', body } = {}) => {
    const result = await app.request('https://contacts.example.test' + path, { method, headers: { origin: 'https://contacts.example.test', 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: result.status, data: await result.json() };
  };
  const seed = async (email = 'rae@example.com') => {
    const id = randomUUID();
    await db.query('insert into public.contacts_cache(id,raw_input) values($1,$2::jsonb)', [id, JSON.stringify({ email, name: 'Original sender', intake_extra: { keep: true } })]);
    return id;
  };
  const owner = async sql => { await db.exec('reset role'); try { return await db.exec(sql); } finally { await db.exec('set role service_role'); } };
  const snapshot = async () => (await db.query('select id,created_at::text,raw_input from public.contacts_cache order by id')).rows;
  const run = async (profiles = {}) => {
    const enrichmentClient = createTregEnrichmentClient({ env: { TREG_TOKEN: 'synthetic-local-provider-key' },
      callLogger: { begin: async () => ({ status: 'ready', session: { logId: randomUUID(), append: async (type, data) => { logs.push({ type, data: structuredClone(data) }); return { status: 'ready' }; } } }) },
      fetchImpl: async (input, init) => {
        assert.equal(String(input), 'https://treg.to/call/treg.people.enrich');
        const payload = JSON.parse(init.body); assert.deepEqual(Object.keys(payload), ['email']); dispatches.push(payload);
        const raw = profiles[payload.email] ?? native();
        return new Response(JSON.stringify({ output: { full_name: raw.person?.full_name ?? 'Unknown Native' }, raw, _treg: { served_by: 'synthetic.people.reverse' } }), { status: 200, headers: { 'x-treg-served-by': 'synthetic.people.reverse', 'x-treg-cost-micro': '495', 'x-treg-call-id': 'synthetic-native-call' } });
      } });
    return createGmailEnrichmentWorker({ cacheStore, enrichmentClient, config: { enabled: true, configured: true, sourceIds: [gmailSourceId], account: gmailAccount, scope: 'sender', maxRequests: 5, maxItems: 5, maxCycleCostMicro: 500000, maxDailyCostMicro: 1000000, perCallMaxCostMicro: 100000, leaseSeconds: 120 } }).once();
  };
  return { db, store, request, seed, owner, snapshot, run, calls, dispatches, logs };
}

test('native contacts: actual lookup/client/worker/SQL retains lookup emails and native bodies, and the API renders both existing names', async t => {
  const h = await fixture(t); await h.seed(); await h.seed('morgan@example.com');
  const before = await h.snapshot();
  await h.owner("create function public.synthetic_cache_readonly() returns trigger language plpgsql as $$begin raise exception 'Sender cache must remain unchanged';end$$;create trigger synthetic_cache_readonly before insert or update or delete on public.contacts_cache for each statement execute function public.synthetic_cache_readonly();");
  const profiles = { 'rae@example.com': native(), 'morgan@example.com': native('Morgan', 'Second') }, result = await h.run(profiles);
  assert.equal(result.status, 'ready'); assert.equal(result.counts.imported, 2); assert.equal(result.counts.jobCompleted, 2);
  assert.equal(h.dispatches.length, 2); assert.deepEqual(await h.snapshot(), before);
  const rows = (await h.db.query(`select ${columns} from public.contacts order by lookup_email`)).rows;
  for (const row of rows) assert.deepEqual(row.raw_input, profiles[row.lookup_email], 'Store the exact native provider object without flattening or adding email');
  assert(!JSON.stringify(result).includes('@example.com'), 'Worker public status has no contact payload');
  const list = await h.request(); assert.equal(list.status, 200); assert.equal(list.data.contacts.length, 2);
  for (const row of list.data.contacts) {
    assert.deepEqual(Object.keys(row.fields), fields); assert(row.fields.first_name); assert(row.fields.last_name);
    assert.equal(row.fields.email, rows.find(value => value.id === row.id).lookup_email);
    assert.equal(row.fields.workplace, '', 'A company in an experience is not a supported workplace field');
    const detail = await h.request(`/api/contacts/${row.id}`); assert.equal(detail.status, 200); assert.deepEqual(detail.data.contact.fields, row.fields);
  }
  assert(!/lookup_email|private fixture|fair_usage|extra_native|headline/.test(JSON.stringify(list.data)), 'Native/profile/bookkeeping fields stay private');
  const jobs = (await h.db.query('select to_jsonb(j) data from public.contacts_enrichment_jobs j')).rows;
  assert(!/first_name|full_name|raw_input|extra_native|rae@example.com|morgan@example.com/.test(JSON.stringify(jobs)), 'Job records remain metadata-only');
  assert.equal((await h.run()).counts.imported, 0); assert.equal(h.dispatches.length, 2, 'Completed jobs are not looked up again');
});

test('native contacts: whole-table search, email presence and manual clears agree across SQL, API and model-facing tools', async t => {
  const h = await fixture(t); await h.seed(); await h.run();
  const original = (await h.db.query(`select ${columns} from public.contacts`)).rows[0];
  for (let i = 0; i < 12; i++) await h.db.query('insert into public.contacts(raw_input) values($1::jsonb)', [JSON.stringify({ first_name: `Unrelated ${i}`, email: `unrelated${i}@example.com` })]);
  for (const query of ['?query=Rae%20Example', '?query=rae%40example.com', '?name=Rae%20Example&emailPresence=yes&sort=name_asc', '?query=Rae&phonePresence=no']) {
    const found = await h.request('/api/contacts' + query); assert.equal(found.status, 200); assert.deepEqual(found.data.contacts.map(row => row.id), [original.id], query);
  }
  const tools = createContactsTools({ store: h.store }).createRequest({ principal, userMessage: 'Update this contact as requested.' });
  const read = await tools.execute({ name: 'read_contact', arguments: { contactId: original.id } }); assert.equal(read.status, 'ready');
  const modelPrompt = assistantAnswerPrompt({ results: [{ tool: 'read_contact', arguments: { contactId: original.id }, ...read }] });
  assert(modelPrompt.includes('rae@example.com')); assert(modelPrompt.includes('Rae')); assert(!/private fixture|extra_native|fair_usage|lookup_email/.test(modelPrompt));
  const patch = await h.request(`/api/contacts/${original.id}`, { method: 'PATCH', body: { expectedUpdatedAt: original.updated_at, fields: { first_name: 'Human', email: '', notes: 'Keep my notes' } } });
  assert.equal(patch.status, 200); assert.equal(patch.data.contact.fields.first_name, 'Human'); assert.equal(patch.data.contact.fields.email, '');
  const saved = (await h.db.query(`select ${columns} from public.contacts where id=$1`, [original.id])).rows[0];
  assert.deepEqual(saved.raw_input, { ...original.raw_input, first_name: 'Human', email: '', notes: 'Keep my notes' }); assert.equal(saved.lookup_email, 'rae@example.com');
  assert.notEqual(saved.updated_at, original.updated_at);
  assert.deepEqual((await h.request('/api/contacts?name=Human%20Example&emailPresence=no')).data.contacts.map(row => row.id), [original.id]);
  assert.deepEqual((await h.request('/api/contacts?query=rae%40example.com')).data.contacts, [], 'Cleared email does not silently reappear from the lookup field');
  const stale = await tools.execute({ name: 'update_contact', arguments: { contactId: original.id, expectedUpdatedAt: original.updated_at, fields: { notes: 'Do not overwrite newer human notes' } } });
  assert.equal(stale.status, 'conflict');
  const fresh = await tools.execute({ name: 'read_contact', arguments: { contactId: original.id } });
  const changed = await tools.execute({ name: 'update_contact', arguments: { contactId: original.id, expectedUpdatedAt: fresh.contact.updated_at, fields: { last_name: '' } } });
  assert.equal(changed.status, 'ready');
  const final = await h.request(`/api/contacts/${original.id}`); assert.equal(final.data.contact.fields.last_name, ''); assert.equal(final.data.contact.fields.notes, 'Keep my notes');
  assert.deepEqual((await h.db.query('select raw_input->\'person\' person,lookup_email from public.contacts where id=$1', [original.id])).rows[0], { person: original.raw_input.person, lookup_email: original.lookup_email });
});

test('native contacts: duplicate imports preserve human/native records through both completion and saved-contact importer', async t => {
  const h = await fixture(t), id = randomUUID(), raw = { ...native('Preserve', 'Human'), notes: 'Keep all edits' };
  await h.db.query('insert into public.contacts(id,raw_input,lookup_email) values($1,$2::jsonb,$3)', [id, JSON.stringify(raw), 'rae@example.com']);
  const before = (await h.db.query(`select ${columns} from public.contacts`)).rows;
  await h.seed(); const result = await h.run(); assert.equal(result.counts.existing, 1); assert.equal(result.counts.imported, 0);
  assert.deepEqual((await h.db.query(`select ${columns} from public.contacts`)).rows, before, 'Duplicate completion never changes human raw JSON, fallback email or timestamp');
  const imported = await h.store.importContact({ contactId: randomUUID(), rawInput: native('Replacement', 'Must not save'), email: 'RAE@example.com' });
  assert.equal(imported.status, 'ready'); assert.equal(imported.operation, 'existing'); assert.equal(imported.contact.id, id);
  assert.deepEqual((await h.db.query(`select ${columns} from public.contacts`)).rows, before);
  assert(h.calls.some(call => call.path === '/rest/v1/rpc/contacts_match_email'), 'Importer uses the real service-only effective email match');
});

test('native contacts: migration is nonrewriting, unknown formats stay saved, and field helpers remain private', async t => {
  const id = randomUUID(), original = { unexpected: { native: ['keep', null] }, first_name: null, notes: 'An unsupported person shape' }; let before;
  const h = await fixture(t, { beforeUpgrade: async db => {
    await db.query('insert into public.contacts(id,raw_input) values($1,$2::jsonb)', [id, JSON.stringify(original)]);
    before = (await db.query('select id,created_at::text,updated_at::text,raw_input from public.contacts')).rows;
  } });
  assert.deepEqual((await h.db.query('select id,created_at::text,updated_at::text,raw_input from public.contacts')).rows, before);
  const read = await h.request(`/api/contacts/${id}`); assert.equal(read.status, 200); assert.equal(read.data.contact.fields.first_name, ''); assert.equal(read.data.contact.fields.notes, original.notes);
  const raw = { ...native('Hidden', 'Native'), first_name: null, email: null, last_name: '', phone_number: false };
  await h.db.query('update public.contacts set raw_input=$2::jsonb,lookup_email=$3 where id=$1', [id, JSON.stringify(raw), 'fallback@example.com']);
  const cleared = await h.request(`/api/contacts/${id}`); for (const key of ['first_name', 'last_name', 'email', 'phone_number']) assert.equal(cleared.data.contact.fields[key], '', `Own ${key} suppresses native fallback`);
  assert.deepEqual((await h.request('/api/contacts?emailPresence=no')).data.contacts.map(row => row.id), [id]);
  await h.db.exec('reset role');
  const grants = (await h.db.query("select proname,has_function_privilege('anon',oid,'execute') anon,has_function_privilege('authenticated',oid,'execute') authenticated,has_function_privilege('contact_public_probe',oid,'execute') public_probe,has_function_privilege('service_role',oid,'execute') service from pg_proc where pronamespace='public'::regnamespace and proname in ('contact_fields','contacts_match_email','contacts_search','gmail_enrichment_complete')")).rows;
  assert.equal(grants.length, 4); assert(grants.every(row => !row.anon && !row.authenticated && !row.public_probe && row.service));
  for (const role of ['anon', 'authenticated', 'contact_public_probe']) {
    await h.db.exec(`begin;set local role ${role}`);
    try { await assert.rejects(() => h.db.query('select * from public.contacts_match_email($1)', ['fallback@example.com']), error => error.code === '42501'); } finally { await h.db.exec('rollback'); }
  }
});

test('native contacts: Apollo wrappers, flat contacts, unknown records and Unicode bounds have matching SQL/API behavior', async t => {
  const h = await fixture(t), empty = Object.fromEntries(fields.map(key => [key, '']));
  const cases = [
    { raw: { person: { first_name: 'Apollo', last_name: 'Example', email: 'native@example.com', phone_number: '+1 555 0100', workplace: 'Native workplace', notes: 'Native note' }, extra: 'keep' }, expected: { first_name: 'Apollo', last_name: 'Example', email: 'native@example.com', phone_number: '+1 555 0100', workplace: 'Native workplace', notes: 'Native note' } },
    { raw: { first_name: 'Flat', last_name: 'Contact', email: 'flat@example.com', phone_number: '00123', workplace: 'Manual workplace', notes: 'Manual note', legacy: [1, null] }, expected: { first_name: 'Flat', last_name: 'Contact', email: 'flat@example.com', phone_number: '00123', workplace: 'Manual workplace', notes: 'Manual note' } },
    { raw: { ...native('😀'.repeat(100), '漢'.repeat(200)), phone_number: 'x'.repeat(100) }, expected: { ...empty, first_name: '😀'.repeat(100), last_name: '漢'.repeat(200), email: 'lookup@example.com', phone_number: 'x'.repeat(100) } },
    { raw: { ...native('😀'.repeat(101), '漢'.repeat(201)), notes: '😀'.repeat(2001), phone_number: 'x'.repeat(101) }, expected: { ...empty, email: 'lookup@example.com' } },
    ...[false, null, 'true', 1].map(found => ({ raw: { ...native('Suppressed', 'Person'), found }, expected: { ...empty, email: 'lookup@example.com' } })),
  ];
  for (const entry of cases) {
    const id = randomUUID();
    await h.db.query('insert into public.contacts(id,raw_input,lookup_email) values($1,$2::jsonb,$3)', [id, JSON.stringify(entry.raw), 'lookup@example.com']);
    const api = await h.request(`/api/contacts/${id}`); assert.equal(api.status, 200); assert.deepEqual(api.data.contact.fields, entry.expected);
    const sql = (await h.db.query('select public.contact_fields(raw_input,lookup_email) fields from public.contacts where id=$1', [id])).rows[0].fields;
    assert.deepEqual(sql, entry.expected, 'SQL search and API use the same supported values and UTF-16 limits');
    assert.deepEqual((await h.db.query('select raw_input from public.contacts where id=$1', [id])).rows[0].raw_input, entry.raw);
  }
  const sorted = await h.request('/api/contacts?sort=name_asc&limit=1'), next = await h.request('/api/contacts?sort=name_asc&limit=1&offset=1');
  assert.equal(sorted.data.contacts[0].fields.first_name, 'Apollo'); assert.equal(next.data.contacts[0].fields.first_name, 'Flat'); assert.equal(sorted.data.coverage.nextOffset, 1);
  const raw = { unknown_native: { name: 'Do not split', nested_email: 'Do not guess' }, values: [1, null] };
  await h.seed('unknown@example.com'); const imported = await h.run({ 'unknown@example.com': raw }); assert.equal(imported.counts.imported, 1, 'Valid unknown native records are retained');
  const saved = (await h.db.query(`select ${columns} from public.contacts where lookup_email=$1`, ['unknown@example.com'])).rows[0]; assert.deepEqual(saved.raw_input, raw);
  const unknown = await h.request(`/api/contacts/${saved.id}`); assert.deepEqual(unknown.data.contact.fields, { ...empty, email: 'unknown@example.com' });
});

test('Exa Contacts: migration preserves rows and SQL search agrees with explicit native fields, ambiguity, manual clears and Unicode bounds',async t=>{
  const empty=Object.fromEntries(fields.map(field=>[field,'']));
  const make=(properties,extra={})=>({url:'https://www.linkedin.com/in/synthetic-exa-person',title:'Never split this title',entities:[{type:'person',properties}],extra_native:{preserve:[null,'original']},...extra});
  const current=(name,extra={})=>({dates:{to:null},company:{name},...extra});
  const properties={firstName:'Renée',lastName:'Native',workHistory:[{dates:{to:'2024-01-01'},company:{name:'Former Co'}},current('Exa Workplace')]};
  const seedId=randomUUID(),seedRaw=make(properties);let previous;
  const h=await fixture(t,{beforeUpgrade:async db=>{
    await db.query('insert into public.contacts(id,raw_input) values($1,$2::jsonb)',[seedId,JSON.stringify(seedRaw)]);
    previous=(await db.query('select id,created_at::text,updated_at::text,raw_input from public.contacts')).rows;
  }});
  assert.deepEqual((await h.db.query('select id,created_at::text,updated_at::text,raw_input from public.contacts')).rows,previous,'Neither migration rewrites native rows or timestamps');
  const cases=[
    {raw:seedRaw,expected:{...empty,first_name:'Renée',last_name:'Native',workplace:'Exa Workplace',email:'lookup@example.com'}},
    {raw:make(properties,{first_name:'Human',last_name:'',workplace:null,email:''}),expected:{...empty,first_name:'Human'}},
    {raw:make(properties,{person:{first_name:'Person',last_name:'Priority',workplace:'Existing Native',email:'native@example.com'}}),expected:{...empty,first_name:'Person',last_name:'Priority',workplace:'Existing Native',email:'native@example.com'}},
    {raw:make({...properties,workHistory:[current('One'),current('Two')]}),expected:{...empty,first_name:'Renée',last_name:'Native',email:'lookup@example.com'}},
    {raw:make({...properties,workHistory:[current('Known'),{dates:{to:null}}]}),expected:{...empty,first_name:'Renée',last_name:'Native',email:'lookup@example.com'}},
    {raw:make({...properties,workHistory:[{company:{name:'No end date'}}]}),expected:{...empty,first_name:'Renée',last_name:'Native',email:'lookup@example.com'}},
    {raw:make({name:'Never Split Full Name',workHistory:[current('Known Company')]}),expected:{...empty,workplace:'Known Company',email:'lookup@example.com'}},
    {raw:make(properties,{entities:[{type:'person',properties},{type:'person',properties:{firstName:'Other'}}]}),expected:{...empty,email:'lookup@example.com'}},
    {raw:make(properties,{entities:[{type:'person',properties},{type:'person',properties:null}]}),expected:{...empty,email:'lookup@example.com'}},
    {raw:make({firstName:'😀'.repeat(100),lastName:'漢'.repeat(200),workHistory:[current('😀'.repeat(250))]}),expected:{...empty,first_name:'😀'.repeat(100),last_name:'漢'.repeat(200),workplace:'😀'.repeat(250),email:'lookup@example.com'}},
    {raw:make({firstName:'😀'.repeat(101),lastName:'漢'.repeat(201),workHistory:[current('😀'.repeat(251))]}),expected:{...empty,email:'lookup@example.com'}},
    ...[null,[],{type:'person'},'not-an-array'].map(entities=>({raw:make(properties,{entities}),expected:{...empty,email:'lookup@example.com'}})),
  ];
  for(const {raw,expected}of cases){
    const id=randomUUID();await h.db.query('insert into public.contacts(id,raw_input,lookup_email) values($1,$2::jsonb,$3)',[id,JSON.stringify(raw),'lookup@example.com']);
    const api=await h.request(`/api/contacts/${id}`);assert.equal(api.status,200);assert.deepEqual(api.data.contact.fields,expected);
    const sql=(await h.db.query('select public.contact_fields(raw_input,lookup_email) fields from public.contacts where id=$1',[id])).rows[0].fields;assert.deepEqual(sql,expected);
    assert.deepEqual((await h.db.query('select raw_input from public.contacts where id=$1',[id])).rows[0].raw_input,raw);
  }
  const match=await h.request('/api/contacts?name=Ren%C3%A9e%20Native&workplace=Exa%20Workplace');assert.equal(match.status,200);assert.equal(match.data.contacts.length,2,'SQL search sees both pre-migration and freshly inserted native Exa rows');
  const humanId=randomUUID(),humanRaw={...seedRaw,email:'exa-preserve@example.com',notes:'Keep my edited note',workplace:'Human workplace'};
  await h.db.query('insert into public.contacts(id,raw_input) values($1,$2::jsonb)',[humanId,JSON.stringify(humanRaw)]);
  const humanBefore=(await h.db.query(`select ${columns} from public.contacts where id=$1`,[humanId])).rows;
  const result=await h.store.importContact({contactId:randomUUID(),rawInput:seedRaw,email:'EXA-PRESERVE@example.com'});assert.equal(result.status,'ready');assert.equal(result.operation,'existing');assert.equal(result.contact.id,humanId);
  assert.deepEqual((await h.db.query(`select ${columns} from public.contacts where id=$1`,[humanId])).rows,humanBefore,'Duplicate import preserves raw Exa body, explicit human fields and timestamps');
  await h.owner(await migration('202610270054_contacts_exa_fields.sql'));
  assert.deepEqual((await h.db.query('select id,created_at::text,updated_at::text,raw_input from public.contacts where id=$1',[seedId])).rows,previous,'Reapplying read projection leaves prior native row unchanged');
});
