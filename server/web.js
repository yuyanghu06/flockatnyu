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
const page = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Tech @ NYU — private access</title><body><main><h1>Tech @ NYU</h1><p>Enter the shared access password to continue.</p><form method="post" action="/login"><label>Password <input type="password" name="password" autocomplete="current-password" required maxlength="1024"></label><button type="submit">Continue</button></form></main></body></html>`;

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
    if (!siteAuth.session(request)) {
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
