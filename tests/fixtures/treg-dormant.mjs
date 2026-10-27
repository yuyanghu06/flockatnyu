import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, rm, lstat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Hono } from 'hono';
import { createTregLookupClient } from '../../server/treg/lookups.js';
import { registerTregLookupApi } from '../../src/api/treg/register.js';
import { createTregCallLogger } from '../../server/treg/call-log.js';
import { readConfig } from '../../server/shared/config.js';
import { createSiteAuth, readSiteAuthConfig } from '../../server/auth/site-auth.js';

export const requestId = '71000000-0000-4000-8000-000000000001',
  requestId2 = '71000000-0000-4000-8000-000000000002';
export const principal = { id: 'synthetic-dormant-route-member', allowedSourceIds: [] };
export const token = 'synthetic-dormant-route-token',
  native = 'PRIVATE_NATIVE_LOOKUP_DETAIL';
export const contracts = {
  email_find: {
    service: 'treg.people.email.find',
    path: '/api/treg/people/email/find',
    input: { domain: 'example.com', full_name: 'Rae Example' },
    output: {
      email: 'rae@example.com',
      confidence: 0,
      first_name: 'Rae',
      last_name: 'Example',
      verified: false,
    },
  },
  email_verify: {
    service: 'treg.people.email.verify',
    path: '/api/treg/people/email/verify',
    input: { email: 'rae@example.com' },
    output: { valid: false, status: 'invalid', score: 0 },
  },
  phone_find: {
    service: 'treg.people.phone.find',
    path: '/api/treg/people/phone/find',
    input: { email: 'rae@example.com' },
    output: { phone: '+12025550123', line_type: 'mobile', country_code: 'US' },
  },
  company_enrich: {
    service: 'branddev.brand.retrieve',
    path: '/api/treg/companies/enrich',
    input: { domain: 'example.com' },
    output: {
      name: 'Example Labs',
      domain: 'example.com',
      description: 'Synthetic company',
      industry: 'Software',
      employees: '11-50',
      location: 'New York',
      linkedin_url: 'https://www.linkedin.com/company/example-labs',
    },
  },
};
export const envelope = (operation, output = contracts[operation].output) =>
  operation === 'company_enrich'
    ? {
        status: 'ok',
        brand: {
          title: output.name,
          ...(Object.hasOwn(output, 'domain') ? { domain: output.domain } : {}),
          ...(Object.hasOwn(output, 'description') ? { description: output.description } : {}),
          ...(Object.hasOwn(output, 'industry')
            ? { industries: { eic: [{ industry: output.industry }] } }
            : {}),
          ...(Object.hasOwn(output, 'employees')
            ? {
                employees:
                  typeof output.employees === 'number'
                    ? { exact: output.employees }
                    : { range: output.employees },
              }
            : {}),
          ...(Object.hasOwn(output, 'location') ? { address: { city: output.location } } : {}),
          ...(Object.hasOwn(output, 'linkedin_url')
            ? { socials: [{ type: 'linkedin', url: output.linkedin_url }] }
            : {}),
          unknown_native: native,
        },
        raw: { credentials: { token }, session_cookie: 'synthetic-private-cookie' },
      }
    : {
        output: { ...output, unknown_native: native },
        raw: {
          nested: { native, keep: [1, null] },
          credentials: { token },
          session_cookie: 'synthetic-private-cookie',
        },
        _treg: {
          served_by: 'synthetic.lookup',
          tried: [{ provider: 'synthetic.lookup', cost_micro: 1234 }],
        },
      };
export const json = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      'x-treg-served-by': body?.brand ? 'branddev.brand.retrieve' : 'synthetic.lookup',
      'x-treg-call-id': 'synthetic-call',
      'x-treg-cost-micro': '1234',
      ...headers,
    },
  });
export const publicOnly = (value) => {
  const text = JSON.stringify(value);
  for (const privateValue of [
    token,
    native,
    'synthetic-private-cookie',
    'callLog',
    'finishLog',
    'PRIVATE_PROVIDER_ERROR',
  ])
    assert(!text.includes(privateValue), `Private value ${privateValue} escaped its log boundary`);
};

export async function fixture(t, { env = {}, callLogger } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'flock-dormant-treg-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const configuration = {
    TREG_TOKEN: token,
    TREG_ORG: 'synthetic-org',
    TREG_CALL_LOG_DIR: join(root, 'calls'),
    ...env,
  };
  const logger = callLogger ?? createTregCallLogger({ env: configuration });
  t.after(() => logger.close?.());
  const requests = [],
    mode = {};
  const fetchImpl = async (value, init = {}) => {
    const url = new URL(value),
      operation = Object.keys(contracts).find(
        (key) =>
          url.origin === 'https://treg.to' &&
          (url.pathname === `/call/${contracts[key].service}` ||
            (key === 'company_enrich' &&
              [
                '/call/branddev.brand.retrieve-by-email',
                '/call/branddev.brand.retrieve-by-name',
              ].includes(url.pathname))),
      );
    assert(
      operation,
      'Only one of the four exact fixed lookup endpoints may receive simulated network',
    );
    assert.equal(init.redirect, 'error');
    assert.equal(init.method, operation === 'company_enrich' ? 'GET' : 'POST');
    if (init.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    requests.push({
      url: url.href,
      operation,
      body: init.body ? JSON.parse(init.body) : Object.fromEntries(url.searchParams),
      headers: new Headers(init.headers),
      signal: init.signal,
    });
    if (mode.throw) throw Error('PRIVATE_PROVIDER_ERROR ' + token);
    if (mode.before) await mode.before(requests.at(-1));
    if (mode.reply) return mode.reply(operation, init);
    return json(envelope(operation));
  };
  const client = createTregLookupClient({ env: configuration, callLogger: logger, fetchImpl });
  const lookup = (operation, args = {}) =>
    client.lookup({ operation, input: contracts[operation]?.input, requestId, principal, ...args });
  const logs = async () => {
    let names;
    try {
      names = await readdir(configuration.TREG_CALL_LOG_DIR);
    } catch {
      return [];
    }
    return Promise.all(
      names
        .filter((name) => name.endsWith('.jsonl'))
        .map(async (name) => ({
          name,
          mode: (await lstat(join(configuration.TREG_CALL_LOG_DIR, name))).mode & 0o777,
          events: (await readFile(join(configuration.TREG_CALL_LOG_DIR, name), 'utf8'))
            .trim()
            .split('\n')
            .map((line) => JSON.parse(line)),
        })),
    );
  };
  return { root, env: configuration, logger, client, requests, mode, lookup, logs };
}

// The registration deliberately accepts a JSON-reader seam, just like the
// existing import API. This fixture supplies a bounded transport reader; the
// route/client under test still perform auth and all operation validation.
async function readJSON(request, _timeout, maxBytes) {
  if (!request.headers.get('content-type')?.startsWith('application/json'))
    throw Error('Invalid content type');
  const body = await request.arrayBuffer();
  if (body.byteLength > maxBytes) throw Error('Too large');
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body));
}
export function optionalApi(client, { authOverride } = {}) {
  const config = readConfig({ NODE_ENV: 'production' }),
    origin = 'https://dormant.example.test';
  const siteAuth = createSiteAuth({
    config: readSiteAuthConfig({
      PUBLIC_ORIGIN: origin,
      SITE_ACCESS_PASSWORD: 'synthetic-dormant-password',
      SITE_SESSION_SECRET: 'synthetic-dormant-signing-secret-at-least-32',
    }),
    apiConfig: config,
  });
  const cookie = siteAuth.issue('synthetic-dormant-password').split(';')[0],
    app = new Hono();
  registerTregLookupApi({
    app,
    tregLookupClient: client,
    auth: authOverride ?? siteAuth.auth,
    config,
    readJSON,
  });
  const request = (
    operation,
    {
      body = { requestId, input: contracts[operation].input },
      headers = {},
      session = true,
      method = 'POST',
      query = '',
      signal,
    } = {},
  ) =>
    app.fetch(
      new Request(origin + contracts[operation].path + query, {
        method,
        headers: {
          origin,
          'content-type': 'application/json',
          ...(session ? { cookie } : {}),
          ...headers,
        },
        ...(method === 'GET'
          ? {}
          : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
        signal,
      }),
    );
  return { app, request, config, origin, siteAuth, cookie };
}
