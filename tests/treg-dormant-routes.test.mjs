import test from 'node:test';
import assert from 'node:assert/strict';
import {
  requestId,
  requestId2,
  principal,
  token,
  native,
  contracts,
  envelope,
  json,
  publicOnly,
  fixture,
} from './fixtures/treg-dormant.mjs';
import { lstat } from 'node:fs/promises';
import { TREG_LOOKUP_CONTRACTS, validTregLookupInput } from '../server/treg/lookups.js';

test('Dormant Treg clients: four fixed operations preserve typed results, private native logs and no-fallback cost/idempotency boundaries', async (t) => {
  const f = await fixture(t);
  assert(Object.isFrozen(TREG_LOOKUP_CONTRACTS));
  for (const [operation, expected] of Object.entries(contracts)) {
    assert(Object.isFrozen(TREG_LOOKUP_CONTRACTS[operation]));
    assert.equal(TREG_LOOKUP_CONTRACTS[operation].service, expected.service);
    assert.equal(
      TREG_LOOKUP_CONTRACTS[operation].endpoint,
      `https://treg.to/call/${expected.service}`,
    );
    assert.equal(TREG_LOOKUP_CONTRACTS[operation].path, expected.path);
    const result = await f.lookup(operation);
    assert.equal(result.status, 'ready');
    assert.equal(result.operation, operation);
    assert.equal(result.hasResult, true);
    assert.deepEqual(result.output, expected.output);
    assert.deepEqual(result.usage, {
      callId: 'synthetic-call',
      provider: operation === 'company_enrich' ? 'branddev.brand.retrieve' : 'synthetic.lookup',
      costMicro: 1234,
    });
    publicOnly(result);
    const sent = f.requests.at(-1);
    assert.deepEqual(sent.body, expected.input);
    assert.equal(sent.headers.get('x-treg-token'), token);
    assert.equal(sent.headers.get('x-treg-org'), 'synthetic-org');
    assert.equal(sent.headers.get('x-treg-route-waterfall'), '0');
    assert.equal(Number(sent.headers.get('x-treg-route-max-cost')), 0.1);
    assert(sent.headers.get('idempotency-key'));
    assert(!sent.headers.get('x-treg-meta').includes('rae@example.com'));
  }
  assert.equal(f.requests.length, 4, 'Each lookup makes one request, without fallback');
  await f.lookup('email_find');
  assert.equal(
    f.requests[0].headers.get('idempotency-key'),
    f.requests.at(-1).headers.get('idempotency-key'),
  );
  await f.lookup('email_find', { principal: { ...principal, id: 'another-member' } });
  assert.notEqual(
    f.requests[0].headers.get('idempotency-key'),
    f.requests.at(-1).headers.get('idempotency-key'),
  );
  await f.lookup('email_find', { requestId: requestId2 });
  assert.notEqual(
    f.requests[0].headers.get('idempotency-key'),
    f.requests.at(-1).headers.get('idempotency-key'),
  );
  await f.lookup('email_find', { input: { domain: 'other.example', full_name: 'Rae Example' } });
  assert.notEqual(
    f.requests[0].headers.get('idempotency-key'),
    f.requests.at(-1).headers.get('idempotency-key'),
  );
  const entries = await f.logs();
  assert.equal(entries.length, 8);
  assert.equal((await lstat(f.env.TREG_CALL_LOG_DIR)).mode & 0o777, 0o700);
  assert(entries.every((log) => log.mode === 0o600));
  const text = JSON.stringify(entries);
  assert(text.includes(native), 'Complete extra/native provider fields remain in private logs');
  for (const privateValue of [token, 'synthetic-private-cookie'])
    assert(!text.includes(privateValue));
  for (const log of entries) {
    assert.deepEqual(
      log.events.map((event) => event.type),
      ['request', 'response', 'lookup_outcome'],
    );
    assert.equal(log.events[1].complete, true);
    assert.equal(log.events.at(-1).data.saved, false);
    assert.equal(log.events.at(-1).data.operation, 'lookup_only');
  }
});

test('Dormant Treg result semantics: misses, invalid/unknown verification and asynchronous pending never invent positive results or poll', async (t) => {
  const f = await fixture(t);
  for (const [operation, output] of [
    ['email_find', { email: null, confidence: null }],
    ['phone_find', { phone: null, line_type: null }],
    ['company_enrich', { name: null, domain: null }],
    ['email_verify', { valid: null, status: null, score: null }],
  ]) {
    // Absent metadata differs from a literal empty header value.
    f.mode.reply = () =>
      new Response(
        JSON.stringify({
          output,
          raw: { selected_provider_miss: true },
          _treg: { served_by: null },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    if (operation === 'company_enrich')
      f.mode.reply = () =>
        new Response(JSON.stringify(envelope(operation, output)), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
    const result = await f.lookup(operation);
    assert.equal(result.status, 'ready');
    assert.equal(result.hasResult, false);
    assert.deepEqual(result.output, output);
    assert.deepEqual(result.usage, {
      callId: null,
      provider: contracts[operation].service,
      costMicro: null,
    });
  }
  for (const status of ['invalid', 'unknown', 'accept_all']) {
    f.mode.reply = () =>
      json({
        output: { valid: status === 'invalid' ? false : null, status, score: 0 },
        raw: { native },
        _treg: { served_by: 'synthetic.lookup' },
      });
    const result = await f.lookup('email_verify');
    assert.equal(result.status, 'ready');
    assert.equal(result.hasResult, true);
    assert.deepEqual(result.output, {
      valid: status === 'invalid' ? false : null,
      status,
      score: 0,
    });
    assert(!Object.hasOwn(result.output, 'deliverable'));
  }
  f.mode.reply = () => json(envelope('company_enrich', { name: 'Example Labs', description: '' }));
  const optionalBlank = await f.lookup('company_enrich');
  assert.equal(optionalBlank.status, 'ready');
  assert.deepEqual(
    optionalBlank.output,
    { name: 'Example Labs', description: '' },
    'An empty optional description is preserved without becoming a blank primary result',
  );
  for (const operation of Object.keys(contracts)) {
    const before = f.requests.length;
    f.mode.reply = () =>
      new Response(
        JSON.stringify({ output: null, raw: null, _treg: { outcome: 'pending', served_by: null } }),
        { status: 202, headers: { 'content-type': 'application/json' } },
      );
    const result = await f.lookup(operation);
    assert.deepEqual(result, {
      status: 'pending',
      operation,
      usage: { callId: null, provider: contracts[operation].service, costMicro: null },
    });
    assert.equal(
      f.requests.length,
      before + 1,
      'Pending never starts automatic polling or another provider',
    );
  }
});

test('Dormant Treg selectors: supported alternatives pass; malformed, incomplete, injected and overbound inputs never dispatch', async (t) => {
  const f = await fixture(t),
    valid = {
      email_find: [
        { domain: 'example.com', full_name: 'Rae Example' },
        { domain: 'example.com', first_name: 'Rae', last_name: 'Example' },
        { linkedin_url: 'https://www.linkedin.com/in/rae-example' },
        { linkedin_handle: 'rae-example' },
      ],
      email_verify: [{ email: 'Rae@Example.com' }],
      phone_find: [
        { email: 'rae@example.com' },
        { linkedin_url: 'https://linkedin.com/in/rae-example' },
        { domain: 'example.com', full_name: 'Rae Example' },
        { domain: 'example.com', first_name: 'Rae', last_name: 'Example' },
      ],
      company_enrich: [
        { domain: 'example.com' },
        { website: 'https://example.com/about' },
        { name: 'Example Labs' },
        { domain: 'example.com', linkedin_url: 'https://www.linkedin.com/company/example-labs' },
        { domain: 'example.com', linkedin_handle: 'example-labs' },
        { email: 'company@example.com' },
      ],
    };
  valid.email_find.push(
    { domain: 'example.com', first_name: 'x'.repeat(200), last_name: 'y'.repeat(200) },
    { domain: 'example.com', full_name: 'x'.repeat(400) },
    { linkedin_handle: 'x'.repeat(200) },
  );
  valid.company_enrich.push(
    { name: 'x'.repeat(400) },
    { website: 'https://example.com/' + 'x'.repeat(2028) },
  );
  for (const [operation, inputs] of Object.entries(valid))
    for (const input of inputs) {
      assert(validTregLookupInput(operation, input));
      assert.equal((await f.lookup(operation, { input })).status, 'ready');
    }
  const before = f.requests.length;
  for (const operation of Object.keys(contracts))
    for (const input of [
      {},
      null,
      [],
      { ...contracts[operation].input, endpoint: 'https://attacker.example' },
      { ...contracts[operation].input, waterfall: true },
      { ...contracts[operation].input, cost: 1 },
      { ...contracts[operation].input, requestId },
      { ...contracts[operation].input, token: 'injected' },
    ]) {
      assert.equal(validTregLookupInput(operation, input), false);
      assert.equal((await f.lookup(operation, { input })).status, 'invalid_request');
    }
  for (const [operation, input] of [
    ['email_find', { domain: 'example.com' }],
    ['email_find', { first_name: 'Rae', last_name: 'Example' }],
    ['email_find', { domain: 'example.com', first_name: 'Rae' }],
    ['phone_find', { linkedin_handle: 'rae-example' }],
    ['email_verify', { email: 'Rae <rae@example.com>' }],
    ['email_verify', { email: 'rae@example.com ' }],
    ['email_verify', { email: 'not-email' }],
    ['email_verify', { email: 'x'.repeat(321) }],
    ['company_enrich', { domain: 'https://example.com' }],
    ['company_enrich', { domain: 'example.com/path' }],
    ['company_enrich', { domain: 'x'.repeat(254) }],
    ['company_enrich', { website: 'http://example.com' }],
    ['company_enrich', { website: 'https://user:pass@example.com' }],
    ['company_enrich', { website: 'https:example.com' }],
    ['company_enrich', { website: 'https://example.com\\@attacker.example' }],
    ['company_enrich', { website: 'https://example.com:8443' }],
    ['email_find', { linkedin_url: 'https://attacker.example/in/rae' }],
    ['email_find', { linkedin_url: 'https://www.linkedin.com/company/example-labs' }],
    ['company_enrich', { linkedin_url: 'https://linkedin.com/in/rae-example' }],
    ['email_find', { linkedin_url: 'https://www.linkedin.com/in/rae?token=x' }],
    ['email_find', { linkedin_handle: '@rae' }],
    ['email_find', { linkedin_handle: 'a/b' }],
    ['email_find', { linkedin_handle: 'x'.repeat(201) }],
    ['email_find', { domain: 'example.com', first_name: 'x'.repeat(201), last_name: 'Example' }],
    ['email_find', { domain: 'example.com', full_name: 'x'.repeat(401) }],
    ['company_enrich', { name: 'x'.repeat(401) }],
    ['company_enrich', { name: ' ' }],
    ['company_enrich', { name: 'MS' }],
    ['company_enrich', { linkedin_url: 'https://www.linkedin.com/company/example-labs' }],
    ['company_enrich', { linkedin_handle: 'example-labs' }],
    ['company_enrich', { name: ' Example' }],
    ['company_enrich', { name: 'Bad\nName' }],
    ['company_enrich', { website: 'https://example.com/' + 'x'.repeat(2049) }],
  ]) {
    assert.equal(validTregLookupInput(operation, input), false, JSON.stringify(input).slice(0, 90));
    assert.equal((await f.lookup(operation, { input })).status, 'invalid_request');
  }
  assert.equal((await f.lookup('unknown')).status, 'invalid_request');
  assert.equal((await f.lookup('email_find', { requestId: 'not-uuid' })).status, 'invalid_request');
  assert.equal((await f.lookup('email_find', { principal: {} })).status, 'forbidden');
  assert.equal((await f.lookup('email_find', { signal: AbortSignal.abort() })).status, 'aborted');
  assert.equal(f.requests.length, before);
  const missing = await fixture(t, { env: { TREG_TOKEN: '' } });
  assert.equal((await missing.lookup('email_find')).status, 'not_configured');
  assert.equal(missing.requests.length, 0);
});

test('Dormant lookups fail honestly once: malformed outputs/usage, provider errors, cancellation and oversized bodies never fall back', async (t) => {
  const f = await fixture(t);
  const malformed = [
    ['email_find', { output: { email: 17 } }],
    ['email_find', { output: { email: 'rae@example.com', confidence: 1.01 } }],
    ['email_find', { output: { email: 'rae@example.com', verified: 'yes' } }],
    ['email_find', { output: { email: '' } }],
    ['email_find', { output: { email: ' ' } }],
    ['phone_find', { output: { phone: ' ' } }],
    ['company_enrich', { status: 'ok', brand: { title: '' } }],
    ['email_verify', { output: { valid: null, status: '' } }],
    ['email_verify', { output: { valid: 'true', status: 'valid' } }],
    ['email_verify', { output: { valid: true } }],
    ['email_verify', { output: { valid: null, status: 'unknown', score: 0.5 } }],
    ['phone_find', { output: { phone: 123 } }],
    ['company_enrich', { status: 'ok', brand: { title: 'Example', employees: { exact: -42 } } }],
    ['company_enrich', { status: 'ok', brand: { title: 'Example', description: 42 } }],
  ];
  for (const [operation, body] of malformed) {
    const before = f.requests.length;
    f.mode.reply = () =>
      json({ ...body, raw: { native }, _treg: { served_by: 'synthetic.lookup' } });
    const result = await f.lookup(operation);
    assert.equal(result.status, 'invalid_response');
    assert(!Object.hasOwn(result, 'output'));
    publicOnly(result);
    assert.equal(f.requests.length, before + 1);
  }
  for (const [status, expected] of [
    [402, 'budget_exceeded'],
    [429, 'rate_limited'],
    [500, 'unavailable'],
  ]) {
    const before = f.requests.length;
    f.mode.reply = () =>
      json({ error: 'PRIVATE_PROVIDER_ERROR ' + token, raw: { native } }, status);
    const result = await f.lookup('phone_find');
    assert.equal(result.status, expected);
    publicOnly(result);
    assert.equal(f.requests.length, before + 1);
  }
  f.mode.reply = () => new Response('not-json', { status: 200 });
  assert.equal((await f.lookup('email_find')).status, 'invalid_response');
  f.mode.reply = () =>
    json(envelope('email_find'), 200, { 'x-treg-served-by': 'different.provider' });
  assert.equal((await f.lookup('email_find')).status, 'invalid_response');
  f.mode.reply = () => json(envelope('email_find'), 200, { 'x-treg-cost-micro': 'not-cost' });
  assert.equal((await f.lookup('email_find')).status, 'invalid_response');
  f.mode.reply = () =>
    new Response(
      JSON.stringify({
        output: contracts.email_find.output,
        raw: { native },
        _treg: { served_by: null },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  assert.equal(
    (await f.lookup('email_find')).status,
    'invalid_response',
    'A positive match needs an observed provider label; fixed-service fallback is for misses/pending only',
  );
  for (const response of [
    () => json({ output: null, raw: null, _treg: {} }, 202),
    () =>
      json(
        { output: null, raw: null, _treg: { outcome: 'pending', served_by: 'synthetic.lookup' } },
        200,
      ),
  ]) {
    f.mode.reply = response;
    assert.equal(
      (await f.lookup('email_find')).status,
      'invalid_response',
      'Pending requires the actual asynchronous202 envelope',
    );
  }
  f.mode.reply = () => new Response('x'.repeat(600000), { status: 200 });
  assert.equal((await f.lookup('company_enrich')).status, 'response_too_large');
  const captured = (await f.logs())
    .flatMap((log) => log.events)
    .find((event) => event.type === 'response' && event.data.truncated);
  assert(captured);
  assert.equal(captured.complete, false);
  delete f.mode.reply;
  f.mode.throw = true;
  const before = f.requests.length;
  const failed = await f.lookup('email_find');
  assert.equal(failed.status, 'unavailable');
  publicOnly(failed);
  assert.equal(f.requests.length, before + 1);
  delete f.mode.throw;
  const abort = new AbortController();
  f.mode.before = () => abort.abort();
  assert.equal((await f.lookup('email_find', { signal: abort.signal })).status, 'aborted');
  const text = JSON.stringify(await f.logs());
  assert(
    text.includes('PRIVATE_PROVIDER_ERROR'),
    'Safe private error details remain available only in full-call logs',
  );
  assert(!text.includes(token));
});
