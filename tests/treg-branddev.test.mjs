import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Hono } from 'hono';
import { createTregLookupClient } from '../server/treg/lookups.js';
import { registerTregLookupApi } from '../src/api/treg/register.js';
import { createTregCallLogger } from '../server/treg/call-log.js';
import { createSiteAuth, readSiteAuthConfig } from '../server/auth/site-auth.js';
import { readConfig } from '../server/shared/config.js';

const requestId = '81000000-0000-4000-8000-000000000001';
const principal = { id: 'synthetic-branddev-member', allowedSourceIds: [] };
const token = 'synthetic-branddev-secret';
const origin = 'https://branddev-test.example.test';
const path = '/api/treg/companies/enrich';
const base = '/call/branddev.brand.retrieve';
const native = (brand = {}) => ({
  status: 'ok',
  brand: {
    title: 'Example Labs',
    domain: 'example.com',
    description: 'An explicit native description',
    private_extra: { keep: [null, 'PRIVATE_NATIVE_BRANDDEV'] },
    ...brand,
  },
  code: 200,
});

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'flock-branddev-test-'));
  const env = { TREG_TOKEN: token, TREG_CALL_LOG_DIR: directory };
  const logger = createTregCallLogger({ env });
  t.after(async () => {
    await logger.close();
    await rm(directory, { recursive: true, force: true });
  });
  const requests = [];
  const mode = {};
  const fetchImpl = async (input, init) => {
    const url = new URL(input);
    assert.equal(url.origin, 'https://treg.to');
    assert([base, `${base}-by-email`, `${base}-by-name`].includes(url.pathname));
    assert.equal(init.method, 'GET');
    assert.equal(init.redirect, 'error');
    assert.equal(init.body, undefined);
    const headers = new Headers(init.headers);
    assert.equal(headers.get('x-treg-token'), token);
    assert.equal(headers.get('x-treg-route-max-cost'), '0.10');
    assert.equal(headers.get('x-treg-route-waterfall'), '0');
    requests.push({ url, headers, signal: init.signal });
    if (mode.before) await mode.before();
    if (mode.throw) throw Error(`PRIVATE exception ${token}`);
    if (mode.reply) return mode.reply();
    return Response.json(mode.body ?? native(), {
      status: mode.status ?? 200,
      headers: {
        'x-treg-call-id': 'synthetic-branddev-call',
        'x-treg-cost-micro': '25340',
        ...mode.headers,
      },
    });
  };
  const client = createTregLookupClient({ env, callLogger: logger, fetchImpl });
  const config = readConfig({ NODE_ENV: 'production' });
  const site = createSiteAuth({
    config: readSiteAuthConfig({
      PUBLIC_ORIGIN: origin,
      SITE_ACCESS_PASSWORD: 'synthetic-test-password',
      SITE_SESSION_SECRET: 'synthetic-signing-secret-with-at-least-32-chars',
    }),
    apiConfig: config,
  });
  const cookie = site.issue('synthetic-test-password').split(';')[0];
  const app = new Hono();
  registerTregLookupApi({
    app,
    tregLookupClient: client,
    auth: site.auth,
    config,
    readJSON: async (request, _timeout, maximum) => {
      assert(request.headers.get('content-type')?.startsWith('application/json'));
      const data = await request.arrayBuffer();
      assert(data.byteLength <= maximum);
      return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(data));
    },
  });
  const lookup = (input, extra = {}) =>
    client.lookup({
      operation: 'company_enrich',
      input,
      requestId,
      principal,
      ...extra,
    });
  const http = async (input, { session = true, headers = {}, body } = {}) => {
    const response = await app.fetch(
      new Request(origin + path, {
        method: 'POST',
        headers: {
          origin,
          'content-type': 'application/json',
          ...(session ? { cookie } : {}),
          ...headers,
        },
        body: JSON.stringify(body ?? { requestId, input }),
      }),
    );
    return { status: response.status, body: await response.json() };
  };
  const logs = async () =>
    Promise.all(
      (await readdir(directory)).map(async (file) =>
        (await readFile(join(directory, file), 'utf8')).trim().split('\n').map(JSON.parse),
      ),
    );
  return { directory, client, logger, requests, mode, lookup, http, logs };
}

test('BrandDev selectors use fixed GET endpoints, deterministic precedence and only effective supplied identifiers', async (t) => {
  const f = await fixture(t);
  const cases = [
    [{ domain: 'WWW.Example.COM' }, base, 'domain', 'example.com'],
    [
      { website: 'https://WWW.Example.COM/about?utm_source=synthetic#part' },
      base,
      'domain',
      'example.com',
    ],
    [{ email: 'Exact@Example.com' }, `${base}-by-email`, 'email', 'Exact@Example.com'],
    [{ name: 'Example Labs' }, `${base}-by-name`, 'name', 'Example Labs'],
    [
      {
        domain: 'example.com',
        website: 'https://other.example',
        email: 'other@other.example',
        name: 'MS',
        linkedin_handle: 'example',
      },
      base,
      'domain',
      'example.com',
    ],
    [
      { website: 'https://example.com/about', email: 'other@other.example', name: 'Example' },
      base,
      'domain',
      'example.com',
    ],
    [
      { email: 'Exact@Example.com', name: 'Example' },
      `${base}-by-email`,
      'email',
      'Exact@Example.com',
    ],
  ];
  for (const [input, endpoint, key, value] of cases) {
    const result = await f.lookup(input);
    assert.equal(result.status, 'ready');
    const request = f.requests.at(-1);
    assert.equal(request.url.pathname, endpoint);
    assert.deepEqual([...request.url.searchParams], [[key, value]]);
    assert.equal(result.usage.provider, endpoint.replace('/call/', ''));
  }
  assert.equal(f.requests.length, cases.length);
  const sent = f.requests.length;
  for (const input of [
    { name: 'MS' },
    { linkedin_handle: 'example' },
    { linkedin_url: 'https://www.linkedin.com/company/example' },
    { domain: 'example.com', email: 'not-an-address' },
    { domain: 'example.com', website: 'javascript:alert(1)' },
    { domain: 'example.com', linkedin_url: 'https://attacker.example/company/x' },
    { domain: 'example.com', name: ' leading space' },
    { domain: 'example.com', token: 'injected' },
  ])
    assert.equal((await f.lookup(input)).status, 'invalid_request');
  assert.equal(f.requests.length, sent, 'Validate every supplied field before any paid request');
});

test('BrandDev idempotency binds method, variant, actor and effective native input without unused selector noise', async (t) => {
  const f = await fixture(t);
  await f.lookup({ domain: 'WWW.Example.COM', name: 'Unused Name' });
  const key = () => f.requests.at(-1).headers.get('idempotency-key');
  const first = key();
  await f.lookup({ website: 'https://example.com/path' });
  assert.equal(key(), first, 'Equivalent effective GET domain lookup reuses its key');
  await f.lookup({ domain: 'example.com', name: 'Another unused name' });
  assert.equal(key(), first);
  await f.lookup({ domain: 'other.example' });
  assert.notEqual(key(), first);
  await f.lookup({ domain: 'example.com' }, { principal: { ...principal, id: 'another-actor' } });
  assert.notEqual(key(), first);
  await f.lookup({ name: 'example.com' });
  assert.notEqual(key(), first);
  await f.lookup({ domain: 'example.com' }, { requestId: '81000000-0000-4000-8000-000000000002' });
  assert.notEqual(key(), first);
});

test('BrandDev native fields reach authenticated HTTP without guessed website/founding fields or changed private data', async (t) => {
  const f = await fixture(t);
  const body = native({
    industries: {
      eic: [{ industry: 'Technology' }, { industry: 'Technology' }, { industry: 'Research' }],
    },
    address: { city: 'New York', state_province: 'New York', country: 'United States' },
    employees: { exact: 6244, range: '501 to 1000' },
    socials: [{ type: 'LinkedIn', url: 'https://www.linkedin.com/company/example' }],
    website: 'https://native-extra.example',
    founded: 2020,
  });
  f.mode.body = body;
  const result = await f.http({ domain: 'example.com' });
  assert.equal(result.status, 200);
  assert.deepEqual(result.body.output, {
    name: 'Example Labs',
    domain: 'example.com',
    description: 'An explicit native description',
    industry: 'Technology; Research',
    location: 'New York, New York, United States',
    employees: 'exact: 6244; range: 501 to 1000',
    linkedin_url: 'https://www.linkedin.com/company/example',
  });
  const logs = await f.logs();
  assert.deepEqual(logs[0].find((event) => event.type === 'response').data.body, body);
  assert.equal(logs[0].at(-1).data.saved, false);
  for (const secret of [token, 'PRIVATE_NATIVE_BRANDDEV', 'native-extra.example']) {
    assert(!JSON.stringify(result.body).includes(secret));
  }
  assert.equal(
    f.requests.length,
    1,
    'No Contacts write, enrichment, source read, fallback or extra lookup',
  );
});

test('BrandDev employee numbers retain safe bounds and range text while malformed known values fail once', async (t) => {
  const f = await fixture(t);
  const valid = [
    [{ exact: 15610 }, '15610'],
    [{ exact: 221000 }, '221000'],
    [{ exact: 0 }, '0'],
    [{ exact: Number.MAX_SAFE_INTEGER }, '9007199254740991'],
    [{ range: '11-50' }, '11-50'],
    [{ range: '' }, ''],
    [{ exact: null, range: null }, null],
  ];
  for (const [employees, expected] of valid) {
    f.mode.body = native({ employees });
    const result = await f.http({ domain: 'example.com' });
    assert.equal(result.status, 200);
    assert.equal(result.body.output.employees, expected);
  }
  const invalid = [
    { exact: -1 },
    { exact: 0.5 },
    { exact: Number.MAX_SAFE_INTEGER + 1 },
    { exact: true },
    { exact: '42' },
    { exact: [] },
    { range: 42 },
    { range: false },
    [],
    42,
  ];
  for (const employees of invalid) {
    f.mode.body = native({ employees });
    const before = f.requests.length;
    const result = await f.http({ domain: 'example.com' });
    assert.equal(result.status, 502, JSON.stringify(employees));
    assert.deepEqual(result.body, { status: 'invalid_response' });
    assert.equal(f.requests.length, before + 1);
  }
  const raw = (await f.logs()).map(
    (events) => events.find((event) => event.type === 'response').data.body,
  );
  for (const count of [15610, 221000, 0, Number.MAX_SAFE_INTEGER]) {
    assert(
      raw.some(
        (value) =>
          typeof value.brand.employees?.exact === 'number' && value.brand.employees.exact === count,
      ),
    );
  }
});

test('BrandDev missing, null and ambiguous optional values remain honest instead of being guessed', async (t) => {
  const f = await fixture(t);
  f.mode.body = native();
  const omitted = await f.lookup({ domain: 'example.com' });
  assert.deepEqual(omitted.output, {
    name: 'Example Labs',
    domain: 'example.com',
    description: 'An explicit native description',
  });
  f.mode.body = native({ title: null });
  const miss = await f.lookup({ domain: 'example.com' });
  assert.equal(miss.status, 'ready');
  assert.equal(miss.hasResult, false);
  f.mode.body = native({
    socials: [
      { type: 'linkedin', url: 'https://www.linkedin.com/company/one' },
      { type: 'linkedin', url: 'https://www.linkedin.com/company/two' },
    ],
  });
  assert.equal((await f.lookup({ domain: 'example.com' })).output.linkedin_url, undefined);
  f.mode.body = native({ employees: null, address: null, industries: null, description: null });
  const nulls = await f.lookup({ domain: 'example.com' });
  assert.equal(nulls.status, 'ready');
  assert.deepEqual(nulls.output, {
    name: 'Example Labs',
    domain: 'example.com',
    description: null,
    employees: null,
    location: null,
    industry: null,
  });
  for (const body of [
    { status: 'ok', brand: {} },
    native({ title: '' }),
    native({ title: 42 }),
    native({ domain: 42 }),
    native({ description: [] }),
    native({ address: { city: 42 } }),
    native({ industries: { eic: [{ industry: 42 }] } }),
    native({ socials: [{ type: 'linkedin', url: 42 }] }),
    { status: 'error', brand: native().brand },
    native({ socials: [{ type: 'linkedin', url: 'https://attacker.example/company/x' }] }),
    native({ socials: [{ type: 'linkedin', url: 'javascript:alert(1)' }] }),
  ]) {
    f.mode.body = body;
    assert.equal((await f.lookup({ domain: 'example.com' })).status, 'invalid_response');
  }
});

test('BrandDev auth, upstream errors, cancellation and private logging keep existing operation boundaries', async (t) => {
  const f = await fixture(t);
  for (const options of [
    { session: false },
    { headers: { origin: 'https://attacker.example' } },
    { headers: { 'sec-fetch-site': 'cross-site' } },
  ])
    assert.equal((await f.http({ domain: 'example.com' }, options)).status, 403);
  assert.equal(f.requests.length, 0);
  for (const [status, expected] of [
    [402, 'budget_exceeded'],
    [429, 'rate_limited'],
    [500, 'unavailable'],
  ]) {
    f.mode.status = status;
    f.mode.body = { error: `PRIVATE ${token}` };
    const before = f.requests.length;
    const result = await f.lookup({ domain: 'example.com' });
    assert.equal(result.status, expected);
    assert.equal(f.requests.length, before + 1);
    assert(!JSON.stringify(result).includes(token));
  }
  delete f.mode.status;
  delete f.mode.body;
  const before = f.requests.length;
  assert.equal(
    (await f.lookup({ domain: 'example.com' }, { signal: AbortSignal.abort() })).status,
    'aborted',
  );
  assert.equal(f.requests.length, before);
  for (const reply of [
    () => new Response('not JSON'),
    () => new Response('x'.repeat(512001)),
    () => Response.json(native(), { headers: { 'x-treg-cost-micro': 'bad' } }),
  ]) {
    f.mode.reply = reply;
    assert.notEqual((await f.lookup({ domain: 'example.com' })).status, 'ready');
  }
  const text = JSON.stringify(await f.logs());
  assert(!text.includes(token));
  assert(text.includes('PRIVATE_NATIVE_BRANDDEV'));
});

test('BrandDev mandatory logging and metadata checks prevent false successes and keep failed lookups isolated', async (t) => {
  const f = await fixture(t);
  let dispatches = 0;
  const blocked = createTregLookupClient({
    env: { TREG_TOKEN: token },
    callLogger: { begin: async () => ({ status: 'log_unavailable' }) },
    fetchImpl: async () => {
      dispatches++;
      return Response.json(native());
    },
  });
  const input = {
    operation: 'company_enrich',
    input: { domain: 'example.com' },
    requestId,
    principal,
  };
  assert.equal((await blocked.lookup(input)).status, 'log_unavailable');
  assert.equal(dispatches, 0);
  for (const failedType of ['response', 'lookup_outcome']) {
    const local = createTregLookupClient({
      env: { TREG_TOKEN: token },
      callLogger: {
        begin: async (request) => {
          const result = await f.logger.begin(request);
          return {
            ...result,
            session: {
              ...result.session,
              append: (type, data) =>
                type === failedType
                  ? { status: 'log_unavailable' }
                  : result.session.append(type, data),
            },
          };
        },
      },
      fetchImpl: async () => {
        dispatches++;
        return Response.json(native());
      },
    });
    assert.equal((await local.lookup(input)).status, 'log_unavailable');
  }
  assert.equal(dispatches, 2, 'Each failed completion makes at most its one authorized request');
  for (const headers of [
    { 'x-treg-call-id': 'bad call ID' },
    { 'x-treg-served-by': 'bad provider label' },
  ]) {
    f.mode.reply = () => Response.json(native(), { headers });
    assert.equal((await f.lookup({ domain: 'example.com' })).status, 'invalid_response');
  }
  f.mode.reply = () =>
    Response.json(
      { ...native(), _treg: { served_by: 'different.provider' } },
      {
        headers: { 'x-treg-served-by': 'branddev.brand.retrieve' },
      },
    );
  assert.equal((await f.lookup({ domain: 'example.com' })).status, 'invalid_response');
});
