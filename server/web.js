import {createReadStream} from 'node:fs';
import {lstat} from 'node:fs/promises';
import {resolve, relative, sep, extname} from 'node:path';
import {Readable} from 'node:stream';
import {fileURLToPath} from 'node:url';
import {serve} from '@hono/node-server';
import {readConfig} from './config.js';
import {createRuntimeApp} from './runtime-app.js';
import {createSiteAuth} from './site-auth.js';
import {createMiroTokenBroker} from './miro/token-broker.js';

const types = {'.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8',
  '.json':'application/json', '.svg':'image/svg+xml', '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg',
  '.webp':'image/webp', '.ico':'image/x-icon', '.glb':'model/gltf-binary', '.gltf':'model/gltf+json',
  '.bin':'application/octet-stream', '.ktx2':'image/ktx2', '.woff2':'font/woff2', '.woff':'font/woff', '.md':'text/plain; charset=utf-8'};
// Native same-origin form posts need their Origin preserved for the strict
// login/CSRF checks. no-referrer makes browser navigation POST origins opaque.
const headers = {'cache-control':'no-store', 'x-content-type-options':'nosniff', 'referrer-policy':'same-origin',
  'strict-transport-security':'max-age=31536000', 'x-frame-options':'DENY',
  'content-security-policy':"frame-ancestors 'none'; base-uri 'self'; form-action 'self'"};
const page = `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Flock@NYU — private access</title>
<link rel="icon" type="image/x-icon" sizes="16x16 32x32 48x48" href="/favicon.ico?v=raised-at-80">
<link rel="icon" type="image/svg+xml" sizes="any" href="/favicon.svg?v=raised-at-80">
<style>
  html, body { margin: 0; width: 100%; height: 100%; background: #fff; }
  form { position: fixed; inset: 0; display: grid; place-items: center; }
  input { position: absolute; inset: 0; box-sizing: border-box; width: 100%; height: 100%; margin: 0; padding: 0; border: 0; opacity: 0; cursor: text; font-size: 16px; }
  .terminal { position: absolute; left: 46%; top: 50%; transform: translate(-50%, -50%); display: grid; gap: 20px; font: 400 clamp(22px, 3vw, 40px)/1.2 "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace; letter-spacing: 0; pointer-events: none; }
  .clock { color: #777369; font-size: clamp(14px, 1.5vw, 20px); letter-spacing: -.02em; white-space: nowrap; }
  .prompt { position: relative; display: flex; align-items: center; width: calc(15ch + 1.55em); min-height: 1.2em; }
  .prefix { flex: 0 0 auto; margin-right: .55em; color: #79aeb7; }
  .masked { flex: 0 1 auto; min-width: 0; overflow: hidden; color: #343434; white-space: pre; }
  .cursor { flex: 0 0 auto; width: .55em; height: 1em; background: #62645f; animation: blink 1.1s steps(1, end) infinite; }
  .placeholder { position: absolute; left: calc(1ch + 1.55em); color: #a19d93; white-space: nowrap; }
  input:not(:placeholder-shown) ~ .terminal .placeholder { visibility: hidden; }
  @keyframes blink { 0%, 49% { opacity: 1; } 50%, 100% { opacity: 0; } }
  @media (prefers-reduced-motion: reduce) { .cursor { animation: none; } }
</style>
<body>
<form method="post" action="/login">
  <input type="password" name="password" aria-label="Password" placeholder="enter password" autocomplete="current-password" autofocus required maxlength="1024">
  <span class="terminal"><time class="clock" aria-label="Current date and time"></time><span class="prompt" aria-hidden="true"><span class="prefix">~</span><span class="masked"></span><span class="cursor"></span><span class="placeholder">enter password</span></span></span>
</form>
<script>
  const clock = document.querySelector('.clock');
  const format = new Intl.DateTimeFormat('en-US', {weekday: 'short', month: 'short', day: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'});
  function tick() {
    const now = new Date();
    const parts = Object.fromEntries(format.formatToParts(now).map(part => [part.type, part.value]));
    clock.textContent = parts.weekday + ' ' + parts.month + ' ' + parts.day + ' ' + parts.hour + ':' + parts.minute + ':' + parts.second + ' ' + parts.year;
    clock.dateTime = now.toISOString();
  }
  tick();
  setInterval(tick, 1000);
  const password = document.querySelector('input');
  const masked = document.querySelector('.masked');
  function maskPassword() {
    masked.textContent = '*'.repeat(password.value.length);
    masked.scrollLeft = masked.scrollWidth;
  }
  password.addEventListener('input', maskPassword);
  password.addEventListener('change', maskPassword);
  password.addEventListener('keydown', event => {
    if (event.key !== 'Enter' || event.isComposing) return;
    event.preventDefault();
    password.form.requestSubmit();
  });
  window.addEventListener('pageshow', maskPassword);
  maskPassword();
</script>
</body>
</html>`;

export function createWebsite({apiApp, siteAuth, miroTokenBroker, distRoot = resolve('dist'), now = Date.now} = {}) {
  const root = resolve(distRoot);
  // Bounded process-wide login throttle. It trusts no caller-supplied IP header.
  let attempts = 0, reset = now() + 900000;
  const reply = (body, status = 200, extra = {}) => new Response(body, {status, headers:{...headers, ...extra}});
  return {async fetch(request, ...args) {
    const url = new URL(request.url);
    if (url.pathname === '/healthz' && request.method === 'GET') return reply('{"ok":true}', 200, {'content-type':'application/json'});
    // This server-to-server route owns a separate bearer check. Browser
    // sessions never authorize it and its secret never enters the browser.
    if (url.pathname === '/internal/miro/token') return miroTokenBroker?.handle
      ? miroTokenBroker.handle(request) : reply('{"status":"unavailable"}', 503, {'content-type':'application/json'});
    if (url.pathname === '/login') {
      if (request.method === 'GET') return reply(page, 200, {'content-type':'text/html; charset=utf-8'});
      if (request.method !== 'POST') return reply('Method not allowed', 405);
      if (request.headers.get('origin') !== siteAuth.config.origin || request.headers.get('sec-fetch-site') === 'cross-site') return reply('Access denied', 403);
      if (now() >= reset) {attempts = 0; reset = now() + 900000;}
      if (request.headers.get('content-type')?.split(';')[0] !== 'application/x-www-form-urlencoded') return reply('Invalid request', 400);
      const reader = request.body?.getReader();
      if (!reader) return reply('Invalid request', 400);
      let text = '', bytes = 0, expired = false;
      const decoder = new TextDecoder('utf-8', {fatal:true});
      const timer = setTimeout(() => {expired = true; void reader.cancel().catch(() => {});}, 10000);
      try {
        while (true) {
          const part = await reader.read(); if (expired) return reply('Invalid request', 408); if (part.done) break;
          bytes += part.value.byteLength;
          if (bytes > 4096) {void reader.cancel().catch(() => {}); return reply('Invalid request', 400);}
          text += decoder.decode(part.value, {stream:true});
        }
        text += decoder.decode();
      } catch {return reply('Invalid request', 400);} finally {clearTimeout(timer); reader.releaseLock();}
      const form = new URLSearchParams(text);
      const sessionCookie = form.getAll('password').length === 1 ? siteAuth.issue(form.get('password')) : null;
      if (!sessionCookie) {
        // Correct credentials remain usable after a flood of bad guesses. A
        // global early rejection would let strangers lock out all operators.
        if (++attempts > 20) return reply('Please try again later.', 429, {'retry-after':String(Math.max(1, Math.ceil((reset - now()) / 1000)))});
        return reply('Access denied. Return to sign in and try again.', 403);
      }
      return reply(null, 303, {'location':'/', 'set-cookie':sessionCookie});
    }
    const publicIcon = ['/favicon.ico', '/favicon.svg'].includes(url.pathname) && ['GET', 'HEAD'].includes(request.method);
    if (!publicIcon && !siteAuth.session(request)) {
      if (url.pathname.startsWith('/api/') || !['GET', 'HEAD'].includes(request.method)) return reply('{"status":"access_denied"}', 403, {'content-type':'application/json'});
      return reply(null, 303, {'location':'/login'});
    }
    if (url.pathname === '/logout') {
      if (request.method !== 'POST') return reply('Method not allowed', 405);
      return reply(null, 303, {'location':'/login', 'set-cookie':siteAuth.clearCookie()});
    }
    if (url.pathname.startsWith('/api/')) {
      const response = await apiApp.fetch(request, ...args);
      const next = new Headers(response.headers);
      for (const [key,value] of Object.entries(headers)) next.set(key,value);
      return new Response(response.body, {status:response.status, headers:next});
    }
    if (!['GET', 'HEAD'].includes(request.method)) return reply('Method not allowed', 405);
    let path;
    try {
      const decoded = decodeURIComponent(url.pathname);
      if (decoded.includes('\\') || decoded.includes('\0') || decoded.split('/').some(p => p.startsWith('.'))) return reply('Not found', 404);
      path = resolve(root, `.${decoded === '/' ? '/index.html' : decoded}`);
      const rel = relative(root, path);
      if (!rel || rel.startsWith(`..${sep}`) || rel === '..' || !types[extname(path)]) return reply('Not found', 404);
      const parts = rel.split(sep);
      for (let i = 0; i <= parts.length; i++) {
        const stat = await lstat(resolve(root, ...parts.slice(0, i)));
        if (stat.isSymbolicLink() || (i < parts.length ? !stat.isDirectory() : !stat.isFile())) return reply('Not found', 404);
      }
      const stat = await lstat(path);
      return reply(request.method === 'HEAD' ? null : Readable.toWeb(createReadStream(path)), 200,
        {'content-type':types[extname(path)], 'content-length':String(stat.size),
          'cache-control': decoded.startsWith('/assets/') ? 'private, max-age=31536000, immutable' : 'no-store'});
    } catch {return reply('Not found', 404);}
  }};
}

export function startWebsite() {
  const config = readConfig();
  if (!config.production) throw new Error('site_requires_production');
  const siteAuth = createSiteAuth({apiConfig:config});
  const app = createWebsite({siteAuth, miroTokenBroker:createMiroTokenBroker(), apiApp:createRuntimeApp({config, auth:siteAuth.auth})});
  return serve({fetch:app.fetch, hostname:config.host, port:config.port});
}
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {startWebsite();} catch {process.stderr.write('website_startup_failed\n'); process.exitCode = 1;}
}
