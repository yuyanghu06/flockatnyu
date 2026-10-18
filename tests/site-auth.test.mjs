import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, rm, symlink, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createSiteAuth, readSiteAuthConfig} from '../server/site-auth.js';
import {createWebsite} from '../server/web.js';

const env = {PUBLIC_ORIGIN:'https://club.example', SITE_ACCESS_PASSWORD:'synthetic-password-for-tests-only', SITE_SESSION_SECRET:'synthetic-signing-secret-for-tests-only', SITE_GOOGLE_ENABLED:'true', SITE_DISCORD_ENABLED:'true'};
const apiConfig = {production:true, allowedSourceIds:['source-allowed'], discordGuildId:'123456789'};
const request = (path = '/', init = {}) => new Request(`https://club.example${path}`, init);

test('production access config requires fixed HTTPS origin and strong server secrets', () => {
  for (const override of [{PUBLIC_ORIGIN:'http://club.example'}, {PUBLIC_ORIGIN:'https://user:pass@club.example'}, {PUBLIC_ORIGIN:'https://club.example/path'}, {SITE_ACCESS_PASSWORD:'weak'}, {SITE_SESSION_SECRET:'short'}, {SITE_SESSION_TTL_SECONDS:'999999'}]) {
    assert.throws(() => readSiteAuthConfig({...env, ...override}));
  }
  assert.equal(readSiteAuthConfig(env).origin, 'https://club.example');
});

test('configured production passwords accept twelve or fourteen characters while shorter and empty credentials fail closed', async () => {
  for (const length of [12, 14]) {
    const password = 'x'.repeat(length);
    const config = readSiteAuthConfig({...env, NODE_ENV:'production', SITE_ACCESS_PASSWORD:password});
    const siteAuth = createSiteAuth({config, apiConfig});
    const app = createWebsite({siteAuth});
    assert.equal((await app.fetch(request('/api/status'))).status, 403);
    const response = await app.fetch(request('/login', {method:'POST', headers:{origin:env.PUBLIC_ORIGIN, 'content-type':'application/x-www-form-urlencoded'}, body:new URLSearchParams({password})}));
    assert.equal(response.status, 303);
    const cookie = response.headers.get('set-cookie');
    for (const flag of ['HttpOnly', 'Secure', 'SameSite=Strict', 'Path=/']) assert.ok(cookie.includes(flag));
    const authenticated = request('/api/status', {headers:{cookie:cookie.split(';')[0]}});
    assert.equal(siteAuth.principal(authenticated).isAdmin, false);
  }
  for (const SITE_ACCESS_PASSWORD of ['', 'x'.repeat(11)]) assert.throws(() => readSiteAuthConfig({...env, NODE_ENV:'production', SITE_ACCESS_PASSWORD}), /site_credentials_invalid/);
  for (const SITE_SESSION_SECRET of ['', 'x'.repeat(31)]) assert.throws(() => readSiteAuthConfig({...env, NODE_ENV:'production', SITE_ACCESS_PASSWORD:'x'.repeat(14), SITE_SESSION_SECRET}), /site_credentials_invalid/);
});

test('signed session resists forgery, expires, excludes secrets, and grants only configured nonadmin access', () => {
  let time = 1000000000000;
  const auth = createSiteAuth({config:readSiteAuthConfig(env), apiConfig, now:() => time});
  assert.equal(auth.issue('wrong'), null);
  const setCookie = auth.issue(env.SITE_ACCESS_PASSWORD), cookie = setCookie.split(';')[0];
  for (const flag of ['HttpOnly', 'Secure', 'SameSite=Strict', 'Path=/']) assert.ok(setCookie.includes(flag));
  assert.ok(!setCookie.includes(env.SITE_ACCESS_PASSWORD));
  assert.ok(!setCookie.includes(env.SITE_SESSION_SECRET));
  const headers = {cookie};
  assert.deepEqual(auth.principal(request('/api/tools', {headers})), {id:'private-shared-operator', allowedSourceIds:['source-allowed'], isAdmin:false, googleAccess:true, liveDiscord:{mode:'local-operator', guildId:'123456789'}});
  assert.equal(auth.session(request('/', {headers:{cookie:cookie + 'x'}})), false);
  assert.equal(auth.session(request('/', {headers:{cookie:`${cookie}; ${cookie}`}})), false);
  assert.equal(auth.session(request('/api/chat', {method:'POST', headers})), false);
  assert.equal(auth.session(request('/api/chat', {method:'POST', headers:{...headers, origin:'https://evil.example'}})), false);
  assert.equal(auth.session(request('/api/chat', {method:'POST', headers:{...headers, origin:env.PUBLIC_ORIGIN}})), true);
  assert.equal(auth.session(request('/', {headers:{...headers, 'sec-fetch-site':'cross-site'}})), false);
  time += 43200000;
  assert.equal(auth.session(request('/', {headers})), false);
});

test('production capabilities require their own server flags, regardless of development settings', () => {
  const auth = createSiteAuth({config:readSiteAuthConfig({...env, SITE_GOOGLE_ENABLED:'false', SITE_DISCORD_ENABLED:'false'}),
    apiConfig:{...apiConfig, devAdminEnabled:true, devGoogleEnabled:true, devLiveDiscordEnabled:true}});
  const cookie = auth.issue(env.SITE_ACCESS_PASSWORD).split(';')[0];
  const actor = auth.principal(request('/api/tools', {headers:{cookie}}));
  assert.deepEqual(actor, {id:'private-shared-operator', allowedSourceIds:['source-allowed'], isAdmin:false});
});

test('website gates static/API, protects mutations, denies traversal/symlinks and never trusts user principal', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'site-gate-test-'));
  t.after(() => rm(directory, {recursive:true, force:true}));
  await writeFile(join(directory, 'index.html'), '<h1>Private</h1>');
  await mkdir(join(directory, 'assets'));
  await writeFile(join(directory, 'assets', 'bundle.js'), 'console.log("fixture");');
  await writeFile(join(directory, '.env'), 'DO_NOT_SERVE');
  await symlink(join(directory, '.env'), join(directory, 'assets', 'leak.js'));
  const siteAuth = createSiteAuth({config:readSiteAuthConfig(env), apiConfig});
  let calls = 0;
  const app = createWebsite({siteAuth, distRoot:directory, apiApp:{fetch:async req => {
    calls++;
    return Response.json(siteAuth.principal(req));
  }}});
  assert.equal((await app.fetch(request('/healthz'))).status, 200);
  assert.equal((await app.fetch(request('/'))).status, 303);
  assert.equal((await app.fetch(request('/assets/bundle.js'))).status, 303);
  assert.equal((await app.fetch(request('/api/status'))).status, 403);
  assert.equal(calls, 0);
  assert.equal((await app.fetch(request('/login?password=' + env.SITE_ACCESS_PASSWORD))).headers.get('set-cookie'), null);
  const login = await app.fetch(request('/login', {method:'POST', headers:{origin:env.PUBLIC_ORIGIN, 'content-type':'application/x-www-form-urlencoded'}, body:new URLSearchParams({password:env.SITE_ACCESS_PASSWORD})}));
  assert.equal(login.status, 303);
  const cookie = login.headers.get('set-cookie').split(';')[0], headers = {cookie};
  assert.match(await (await app.fetch(request('/', {headers}))).text(), /Private/);
  assert.equal((await app.fetch(request('/assets/bundle.js', {headers}))).headers.get('cache-control'), 'private, max-age=31536000, immutable');
  for (const path of ['/.env', '/%2eenv', '/assets/%2e%2e%2f.env', '/assets/leak.js', '/assets/%5c.env']) assert.equal((await app.fetch(request(path, {headers}))).status, 404, path);
  assert.equal((await app.fetch(request('/api/chat', {method:'POST', headers:{...headers, 'x-user-id':'admin', 'x-admin':'true'}}))).status, 403);
  const actor = await (await app.fetch(request('/api/tools?principal=admin', {headers:{...headers, authorization:'Bearer attacker', 'x-user-id':'admin'}}))).json();
  assert.equal(actor.isAdmin, false); assert.equal(actor.id, 'private-shared-operator');
  const logout = await app.fetch(request('/logout', {method:'POST', headers:{...headers, origin:env.PUBLIC_ORIGIN}}));
  assert.equal(logout.status, 303); assert.match(logout.headers.get('set-cookie'), /Max-Age=0/);
});

test('login icons are public only at exact read-only paths and retain safe static-file checks', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'site-icons-test-'));
  t.after(() => rm(directory, {recursive:true, force:true}));
  await writeFile(join(directory, 'favicon.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
  await writeFile(join(directory, 'favicon.ico'), new Uint8Array([0, 0, 1, 0]));
  const siteAuth = createSiteAuth({config:readSiteAuthConfig(env), apiConfig});
  const app = createWebsite({siteAuth, distRoot:directory});
  const html = await (await app.fetch(request('/login'))).text();
  assert.match(html, /href="\/favicon\.svg\?v=raised-at-80"/);
  assert.match(html, /href="\/favicon\.ico\?v=raised-at-80"/);
  for (const extension of ['svg', 'ico']) {
    const icon = await app.fetch(request(`/favicon.${extension}?v=raised-at-80`));
    assert.equal(icon.status, 200);
    assert.equal(icon.headers.get('set-cookie'), null);
    assert.match(icon.headers.get('content-type'), extension === 'svg' ? /image\/svg\+xml/ : /image\/x-icon/);
    assert.ok((await icon.arrayBuffer()).byteLength > 0);
    const head = await app.fetch(request(`/favicon.${extension}`, {method:'HEAD'}));
    assert.equal(head.status, 200); assert.equal(await head.text(), '');
    assert.equal((await app.fetch(request(`/favicon.${extension}`, {method:'POST'}))).status, 403);
  }
  for (const path of ['/', '/assets/favicon.svg', '/favicon.svg/other', '/favicon.svg%00', '/%66avicon.svg']) {
    assert.equal((await app.fetch(request(path))).status, 303, path);
  }
  assert.equal((await app.fetch(request('/api/tools'))).status, 403);
  await rm(join(directory, 'favicon.svg'));
  await symlink(join(directory, 'favicon.ico'), join(directory, 'favicon.svg'));
  assert.equal((await app.fetch(request('/favicon.svg'))).status, 404);
});

test('login denies foreign origin, oversized payloads, duplicate passwords and bounded repeated guesses', async () => {
  const siteAuth = createSiteAuth({config:readSiteAuthConfig(env), apiConfig});
  const app = createWebsite({siteAuth});
  const post = (body, origin = env.PUBLIC_ORIGIN) => app.fetch(request('/login', {method:'POST', headers:{origin, 'content-type':'application/x-www-form-urlencoded'}, body}));
  assert.equal((await post('password=' + env.SITE_ACCESS_PASSWORD, 'https://evil.example')).status, 403);
  assert.equal((await post('password=' + 'x'.repeat(5000))).status, 400);
  assert.equal((await post(new URLSearchParams([['password',env.SITE_ACCESS_PASSWORD], ['password',env.SITE_ACCESS_PASSWORD]]))).status, 403);
  for (let i = 0; i < 19; i++) await post('password=wrong');
  assert.equal((await post('password=wrong')).status, 429);
});

test('login page preserves same-origin navigation proof while opaque and foreign origins remain denied', async () => {
  const siteAuth = createSiteAuth({config:readSiteAuthConfig(env), apiConfig});
  const app = createWebsite({siteAuth});
  const page = await app.fetch(request('/login'));
  assert.equal(page.headers.get('referrer-policy'), 'same-origin');
  assert.match(await page.text(), /<form method="post" action="\/login">/);
  const body = new URLSearchParams({password:env.SITE_ACCESS_PASSWORD});
  for (const origin of ['null', 'https://foreign.example']) {
    const denied = await app.fetch(request('/login', {method:'POST', headers:{origin, 'content-type':'application/x-www-form-urlencoded'}, body}));
    assert.equal(denied.status, 403); assert.equal(denied.headers.get('set-cookie'), null);
  }
  const accepted = await app.fetch(request('/login', {method:'POST', headers:{origin:env.PUBLIC_ORIGIN, 'content-type':'application/x-www-form-urlencoded'}, body}));
  assert.equal(accepted.status, 303); assert.ok(accepted.headers.get('set-cookie'));
});

test('internal Miro token route delegates exclusively to its separate server bearer gate', async () => {
  const siteAuth = createSiteAuth({config:readSiteAuthConfig(env), apiConfig});
  let delegated = 0;
  const app = createWebsite({siteAuth, miroTokenBroker:{handle:async req => {
    delegated++; assert.equal(req.headers.get('authorization'), 'Bearer synthetic-broker-proof');
    return Response.json({status:'broker-fixture'}, {headers:{'cache-control':'no-store'}});
  }}});
  const response = await app.fetch(request('/internal/miro/token', {method:'POST', headers:{authorization:'Bearer synthetic-broker-proof'}}));
  assert.equal(response.status, 200); assert.equal(delegated, 1);
  assert.equal(response.headers.get('set-cookie'), null);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const unavailable = createWebsite({siteAuth});
  assert.equal((await unavailable.fetch(request('/internal/miro/token', {method:'POST'}))).status, 503);
});
