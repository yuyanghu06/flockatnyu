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
  for (const override of [{PUBLIC_ORIGIN:'http://club.example'}, {PUBLIC_ORIGIN:'https://user:pass@club.example'}, {PUBLIC_ORIGIN:'https://club.example/path'}, {SITE_ACCESS_PASSWORD:'weak'}, {SITE_SESSION_SECRET:'short'}, {SITE_SESSION_TTL_SECONDS:'2592001'}]) {
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

test('explicit domain aliases support login and authenticated writes without changing canonical provenance', async () => {
  const alias = 'https://custom.example';
  const config = readSiteAuthConfig({...env, SITE_ALLOWED_ORIGINS:` ${alias},${env.PUBLIC_ORIGIN}/ `});
  assert.equal(config.origin, env.PUBLIC_ORIGIN);
  assert.deepEqual(config.allowedOrigins, [env.PUBLIC_ORIGIN, alias]);
  assert.ok(Object.isFrozen(config.allowedOrigins));
  const siteAuth = createSiteAuth({config, apiConfig});
  const app = createWebsite({siteAuth, apiApp:{fetch:async req => Response.json(siteAuth.principal(req))}});
  for (const origin of [env.PUBLIC_ORIGIN, alias]) {
    const login = await app.fetch(new Request(`${origin}/login`, {method:'POST', headers:{origin, 'sec-fetch-site':'same-origin', 'content-type':'application/x-www-form-urlencoded'}, body:new URLSearchParams({password:env.SITE_ACCESS_PASSWORD})}));
    assert.equal(login.status, 303);
    const setCookie = login.headers.get('set-cookie');
    assert.ok(setCookie); assert.ok(!setCookie.includes('Domain='));
    const cookie = setCookie.split(';')[0];
    const write = await app.fetch(new Request(`${origin}/api/chat`, {method:'POST', headers:{origin, cookie, 'sec-fetch-site':'same-origin'}}));
    assert.equal(write.status, 200); assert.equal((await write.json()).isAdmin, false);
    for (const headers of [{origin:'https://evil.example'}, {origin:'https://custom.example.evil.example'}, {origin:'null'}, {}, {origin, 'sec-fetch-site':'cross-site'}]) {
      const denied = await app.fetch(new Request(`${origin}/api/chat`, {method:'POST', headers:{cookie,...headers}}));
      assert.equal(denied.status, 403);
      const deniedLogin = await app.fetch(new Request(`${origin}/login`, {method:'POST', headers:{'content-type':'application/x-www-form-urlencoded',...headers}, body:new URLSearchParams({password:env.SITE_ACCESS_PASSWORD})}));
      assert.equal(deniedLogin.status, 403); assert.equal(deniedLogin.headers.get('set-cookie'), null);
    }
    assert.equal((await app.fetch(new Request(`${origin}/api/status`))).status, 403);
  }
  const defaultAuth = createSiteAuth({config:readSiteAuthConfig(env), apiConfig});
  assert.equal(defaultAuth.allowsOrigin(alias), false);
  assert.equal(defaultAuth.allowsOrigin(env.PUBLIC_ORIGIN), true);
});

test('domain alias configuration rejects broad, malformed and insecure values', () => {
  for (const SITE_ALLOWED_ORIGINS of ['*', 'https://*.example', 'http://custom.example', 'https://user:pass@custom.example', 'https://custom.example/path', 'https://custom.example?x=1', 'https://custom.example#x', 'https://custom.example,', ',https://custom.example', 'https:custom.example', 'https://custom.\nexample', 'null', Array(17).fill('https://custom.example').join(','), 'x'.repeat(4097)]) {
    assert.throws(() => readSiteAuthConfig({...env, SITE_ALLOWED_ORIGINS}), /site_allowed_origins_invalid/, SITE_ALLOWED_ORIGINS);
  }
  for (const SITE_ALLOWED_ORIGINS of ['', '  ']) assert.deepEqual(readSiteAuthConfig({...env, SITE_ALLOWED_ORIGINS}).allowedOrigins, [env.PUBLIC_ORIGIN]);
});

test('signed session resists forgery, expires, excludes secrets, and grants only configured nonadmin access', () => {
  let time = 1000000000000;
  const auth = createSiteAuth({config:readSiteAuthConfig({...env, SITE_SESSION_TTL_SECONDS:'43200'}), apiConfig, now:() => time});
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

test('session duration defaults to thirty days and preserves explicitly configured shorter durations within bounds',()=>{
 assert.equal(readSiteAuthConfig(env).ttlSeconds,2592000);
 for(const duration of [300,43200,86400,2592000])assert.equal(readSiteAuthConfig({...env,SITE_SESSION_TTL_SECONDS:String(duration)}).ttlSeconds,duration);
 for(const duration of ['299','2592001','43200.5','NaN','Infinity','-1','0'])assert.throws(()=>readSiteAuthConfig({...env,SITE_SESSION_TTL_SECONDS:duration}),/site_session_duration_invalid/);
});

test('password login issues a persistent thirty-day host-only cookie and server rejects it at the matching expiry',async()=>{
 let time=Date.parse('2026-10-19T16:30:00.000Z');
 const config=readSiteAuthConfig(env),siteAuth=createSiteAuth({config,apiConfig,now:()=>time});
 const app=createWebsite({siteAuth});
 const login=await app.fetch(request('/login',{method:'POST',headers:{origin:env.PUBLIC_ORIGIN,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({password:env.SITE_ACCESS_PASSWORD})}));
 assert.equal(login.status,303);
 const setCookie=login.headers.get('set-cookie'),cookie=setCookie.split(';')[0];
 assert.match(setCookie,/^__Host-tech_session=/);assert.match(setCookie,/(?:^|; )Max-Age=2592000(?:;|$)/);
 assert.match(setCookie,/(?:^|; )Expires=Wed, 18 Nov 2026 16:30:00 GMT(?:;|$)/);
 for(const flag of ['HttpOnly','Secure','SameSite=Strict','Path=/'])assert.ok(setCookie.includes(flag));assert.ok(!/Domain=/i.test(setCookie));
 const payload=JSON.parse(Buffer.from(cookie.split('=')[1].split('.')[0],'base64url').toString('utf8'));
 assert.equal(payload.exp-payload.iat,2592000);assert.equal(payload.exp*1000,Date.parse('2026-11-18T16:30:00.000Z'));
 // A fresh server instance accepts the persisted browser cookie without an in-memory session.
 const restarted=createSiteAuth({config,apiConfig,now:()=>time});time=payload.exp*1000-1000;
 assert.equal(restarted.session(request('/',{headers:{cookie}})),true);assert.equal(restarted.principal(request('/',{headers:{cookie}})).isAdmin,false);
 time=payload.exp*1000;assert.equal(restarted.session(request('/',{headers:{cookie}})),false);
});

test('logout removes the persistent host cookie with matching flags, zero max-age and a past expiry',async()=>{
 const siteAuth=createSiteAuth({config:readSiteAuthConfig(env),apiConfig});const app=createWebsite({siteAuth});
 const cookie=siteAuth.issue(env.SITE_ACCESS_PASSWORD).split(';')[0];
 const denied=await app.fetch(request('/logout',{method:'POST',headers:{cookie,origin:'https://foreign.example'}}));assert.equal(denied.status,403);assert.equal(denied.headers.get('set-cookie'),null);
 const logout=await app.fetch(request('/logout',{method:'POST',headers:{cookie,origin:env.PUBLIC_ORIGIN}}));assert.equal(logout.status,303);
 const cleared=logout.headers.get('set-cookie');assert.match(cleared,/^__Host-tech_session=;/);assert.match(cleared,/Max-Age=0(?:;|$)/);assert.match(cleared,/Expires=Thu, 01 Jan 1970 00:00:00 GMT/);
 for(const flag of ['HttpOnly','Secure','SameSite=Strict','Path=/'])assert.ok(cleared.includes(flag));assert.ok(!/Domain=/i.test(cleared));
 assert.equal(siteAuth.session(request('/',{headers:{cookie:cleared.split(';')[0]}})),false);
});
