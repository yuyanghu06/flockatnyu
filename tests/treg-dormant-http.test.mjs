import test from 'node:test';
import assert from 'node:assert/strict';
import {
  requestId,
  principal,
  token,
  native,
  contracts,
  envelope,
  json,
  publicOnly,
  fixture,
  optionalApi,
} from './fixtures/treg-dormant.mjs';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createTregLookupClient } from '../server/treg/lookups.js';
import { createTregCallLogger } from '../server/treg/call-log.js';
import { createTregPeopleClient } from '../server/treg/people.js';
import { createTregEnrichmentClient } from '../server/treg/enrich.js';
import { createTregTools } from '../tools/treg/index.js';
import { createApp } from '../server/runtime/app.js';

test('Dormant lookup HTTP handlers: explicit opt-in registration enforces session/origin, strict JSON and operation projection', async (t) => {
  const f = await fixture(t),
    api = optionalApi(f.client);
  for (const operation of Object.keys(contracts)) {
    const response = await api.request(operation);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('cache-control'), /private.*no-store/);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    const result = await response.json();
    assert.deepEqual(result.output, contracts[operation].output);
    publicOnly(result);
  }
  const before = f.requests.length;
  for (const options of [
    { session: false },
    { headers: { origin: 'https://attacker.example' } },
    { headers: { origin: 'null' } },
    { headers: { 'sec-fetch-site': 'cross-site' } },
  ])
    assert.equal((await api.request('email_find', options)).status, 403);
  assert.equal(
    (
      await api.app.fetch(
        new Request(api.origin + contracts.email_find.path, {
          method: 'POST',
          headers: { cookie: api.cookie, 'content-type': 'application/json' },
          body: JSON.stringify({ requestId, input: contracts.email_find.input }),
        }),
      )
    ).status,
    403,
    'A valid session does not bypass the missing-Origin check',
  );
  for (const options of [
    { query: '?extra=1' },
    { body: [] },
    { body: null },
    { body: { requestId, input: contracts.email_find.input, extra: true } },
    { body: { requestId: 'invalid', input: contracts.email_find.input } },
    { body: { requestId, input: { domain: 'example.com' } } },
    { body: 'invalid JSON' },
    {
      body: { requestId, input: contracts.email_find.input },
      headers: { 'content-type': 'text/plain' },
    },
    { body: 'x'.repeat(20000) },
  ])
    assert.equal((await api.request('email_find', options)).status, 400);
  assert.equal((await api.request('email_find', { method: 'GET' })).status, 404);
  assert.equal(f.requests.length, before);
  f.mode.reply = () =>
    new Response(JSON.stringify({ output: null, _treg: { outcome: 'pending', served_by: null } }), {
      status: 202,
      headers: { 'content-type': 'application/json' },
    });
  const pending = await api.request('email_find');
  assert.equal(pending.status, 202);
  assert.equal((await pending.json()).status, 'pending');
  const denied = optionalApi(f.client, {
    authOverride: async () => {
      throw Error('PRIVATE authentication failure');
    },
  });
  assert.equal((await denied.request('email_find')).status, 403);
  const injected = {
    configured: true,
    lookup: async () => ({
      status: 'ready',
      operation: 'email_find',
      hasResult: true,
      output: { email: 'rae@example.com', unknown_native: native },
      usage: { callId: 'safe-call', provider: 'synthetic.lookup', costMicro: null },
      raw: native,
      token,
    }),
  };
  const projected = await optionalApi(injected).request('email_find');
  assert.equal(projected.status, 200);
  const safe = await projected.json();
  assert.deepEqual(safe.output, { email: 'rae@example.com' });
  publicOnly(safe);
  for (const patch of [
    { output: { email: 17 } },
    { output: { email: '' } },
    { hasResult: false },
    { usage: { callId: 'safe', provider: 'synthetic.lookup', costMicro: -1 } },
  ]) {
    const unsafe = optionalApi({
      configured: true,
      lookup: async () => ({ ...(await injected.lookup()), ...patch }),
    });
    const response = await unsafe.request('email_find');
    assert.equal(response.status, 502);
    assert.deepEqual(await response.json(), { status: 'invalid_response' });
  }
});

test('Company public responses remain string/null typed even when an injected client bypasses native validation', async (t) => {
  const ready = (output) => ({
    configured: true,
    lookup: async () => ({
      status: 'ready',
      operation: 'company_enrich',
      hasResult: true,
      output,
      usage: { callId: 'safe-count-call', provider: 'branddev.brand.retrieve', costMicro: 0 },
    }),
  });
  for (const employees of [
    42,
    0,
    Number.MAX_SAFE_INTEGER,
    -1,
    0.5,
    Number.MAX_SAFE_INTEGER + 1,
    true,
    false,
    [],
    [42],
    { count: 42 },
  ]) {
    const response = await optionalApi(ready({ name: 'Synthetic Company', employees })).request(
      'company_enrich',
    );
    assert.equal(response.status, 502);
    assert.deepEqual(await response.json(), { status: 'invalid_response' });
  }
  for (const employees of ['42', '11-50', '', null]) {
    const response = await optionalApi(ready({ name: 'Synthetic Company', employees })).request(
      'company_enrich',
    );
    assert.equal(response.status, 200);
    assert.equal((await response.json()).output.employees, employees);
  }
});

test('Dormant lookups require durable logs before dispatch and before reporting success', async (t) => {
  const blocked = await fixture(t);
  await writeFile(join(blocked.root, 'not-directory'), 'Not a log directory');
  const badLogger = createTregCallLogger({
    env: {},
    directory: join(blocked.root, 'not-directory'),
  });
  t.after(() => badLogger.close());
  const client = createTregLookupClient({
    env: blocked.env,
    callLogger: badLogger,
    fetchImpl: async () => {
      throw Error('Must not dispatch before logging');
    },
  });
  assert.equal(
    (
      await client.lookup({
        operation: 'email_find',
        input: contracts.email_find.input,
        requestId,
        principal,
      })
    ).status,
    'log_unavailable',
  );
  for (const failedType of ['response', 'lookup_outcome']) {
    const f = await fixture(t),
      wrapper = {
        begin: async (data) => {
          const result = await f.logger.begin(data);
          return {
            ...result,
            session: {
              ...result.session,
              append: async (type, body) =>
                type === failedType
                  ? { status: 'log_unavailable' }
                  : result.session.append(type, body),
            },
          };
        },
      };
    const local = createTregLookupClient({
      env: f.env,
      callLogger: wrapper,
      fetchImpl: async () => json(envelope('email_find')),
    });
    const result = await local.lookup({
      operation: 'email_find',
      input: contracts.email_find.input,
      requestId,
      principal,
    });
    assert.equal(result.status, 'log_unavailable');
    assert(!Object.hasOwn(result, 'output'));
    publicOnly(result);
  }
  const f = await fixture(t),
    controller = new AbortController(),
    delayed = {
      begin: async (data) => {
        const result = await f.logger.begin(data);
        return {
          ...result,
          session: {
            ...result.session,
            append: async (type, body) => {
              const outcome = await result.session.append(type, body);
              if (type === 'lookup_outcome') controller.abort();
              return outcome;
            },
          },
        };
      },
    };
  const interrupted = createTregLookupClient({
    env: f.env,
    callLogger: delayed,
    fetchImpl: async () => json(envelope('email_find')),
  });
  assert.deepEqual(
    await interrupted.lookup({
      operation: 'email_find',
      input: contracts.email_find.input,
      requestId,
      principal,
      signal: controller.signal,
    }),
    { status: 'aborted' },
    'Cancellation while durable completion is awaited must never return ready',
  );
  assert.equal((await f.logs())[0].events.at(-1).data.status, 'aborted');
  let deadline;
  t.mock.method(AbortSignal, 'timeout', () => deadline.signal);
  for (const phase of ['provider', 'completion'])
    for (const pending of [false, true]) {
      deadline = new AbortController();
      const f = await fixture(t),
        logging = {
          begin: async (data) => {
            const result = await f.logger.begin(data);
            return {
              ...result,
              session: {
                ...result.session,
                append: async (type, body) => {
                  const outcome = await result.session.append(type, body);
                  if (phase === 'completion' && type === 'lookup_outcome') deadline.abort();
                  return outcome;
                },
              },
            };
          },
        };
      const client = createTregLookupClient({
        env: f.env,
        callLogger: logging,
        fetchImpl: async () => {
          if (phase === 'provider') deadline.abort();
          return pending
            ? json(
                { output: null, _treg: { outcome: 'pending', served_by: 'synthetic.lookup' } },
                202,
              )
            : json(envelope('email_find'));
        },
      });
      const result = await client.lookup({
        operation: 'email_find',
        input: contracts.email_find.input,
        requestId,
        principal,
      });
      assert.deepEqual(
        result,
        { status: 'unavailable' },
        `The combined timeout signal must prevent ${pending ? 'pending' : 'ready'} after ${phase}`,
      );
      const events = (await f.logs())[0].events;
      assert.equal(events.at(-1).data.status, 'unavailable');
      if (phase === 'provider') {
        const response = events.find((event) => event.type === 'response');
        assert.equal(response.complete, false);
        assert.equal(response.data.error, 'timeout');
      }
    }
});

test('Four new lookup routes remain dormant in the actual app and existing Treg catalogue stays exactly two tools', async (t) => {
  const f = await fixture(t),
    api = optionalApi(f.client),
    existingFetch = async () => {
      throw Error('No existing lookup should dispatch during boundary inspection');
    };
  const tools = createTregTools({
    peopleClient: createTregPeopleClient({
      env: f.env,
      fetchImpl: existingFetch,
      callLogger: f.logger,
    }),
    enrichmentClient: createTregEnrichmentClient({
      env: f.env,
      fetchImpl: existingFetch,
      callLogger: f.logger,
    }),
  });
  const app = createApp({
    config: api.config,
    provider: {},
    auth: api.siteAuth.auth,
    tregTools: tools,
    audit: { recordEvent: async () => {} },
  });
  for (const { path, input } of Object.values(contracts)) {
    const response = await app.fetch(
      new Request(api.origin + path, {
        method: 'POST',
        headers: { origin: api.origin, cookie: api.cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ requestId, input }),
      }),
    );
    assert.equal(response.status, 404, 'Default app must never register a dormant handler');
  }
  const catalogue = await app.fetch(
    new Request(api.origin + '/api/tools', { headers: { cookie: api.cookie } }),
  );
  assert.equal(catalogue.status, 200);
  assert.deepEqual(
    (await catalogue.json()).tools
      .filter((tool) => tool.name.includes('treg'))
      .map((tool) => tool.name)
      .sort(),
    ['enrich_treg_people', 'search_treg_people'],
  );
  assert.equal(f.requests.length, 0);
});
