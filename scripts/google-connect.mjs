import http from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { lstat, open, rename, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readGoogleConfig, GOOGLE_SCOPES, GOOGLE_CALENDAR_SCOPES, GOOGLE_CALLBACK } from '../server/google/config.js';
import { createGoogleOAuth, GoogleError, verifyGoogleToken } from '../server/google/oauth.js';
import { boundedGoogleBody } from '../server/google/client.js';

const OUTPUT = fileURLToPath(new URL('../.env.google', import.meta.url));
const same = (left, right) => typeof left === 'string' && Buffer.byteLength(left) === Buffer.byteLength(right)
  && timingSafeEqual(Buffer.from(left), Buffer.from(right));
const envLine = value => JSON.stringify(value);

async function existingOutput(force) {
  try {
    const stat = await lstat(OUTPUT);
    if (stat.isSymbolicLink() || !stat.isFile()) throw new GoogleError('unsafe_output_file');
    if (!force) throw new GoogleError('output_exists_use_force');
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
}

// Deliberately a local command, not a public Railway OAuth route. Secrets go to
// one ignored mode-0600 file; neither the auth code nor any token is printed.
export async function connectGoogle({ env = process.env, force = false, calendar = false, write = console.log } = {}) {
  const config = readGoogleConfig(env);
  if (!config.oauthConfigured) throw new GoogleError('setup_required_client_id_secret_expected_email_fixed_callback');
  await existingOutput(force);
  const oauth = createGoogleOAuth(config), state = randomBytes(32).toString('hex');
  const requiredScopes = calendar ? [...GOOGLE_SCOPES, ...GOOGLE_CALENDAR_SCOPES] : GOOGLE_SCOPES;
  const { codeVerifier, codeChallenge } = await oauth.generateCodeVerifierAsync();
  const expires = Date.now() + 5 * 60 * 1000;
  let used = false, server;
  const authorization = oauth.generateAuthUrl({ access_type: 'offline', prompt: 'consent',
    scope: requiredScopes, include_granted_scopes: false, state, code_challenge: codeChallenge,
    code_challenge_method: 'S256', login_hint: config.expectedAccountEmail });
  const responseHeaders = { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store',
    'content-security-policy': "default-src 'none'; frame-ancestors 'none'", 'referrer-policy': 'no-referrer' };
  await new Promise((resolveConsent, rejectConsent) => {
    const timer = setTimeout(() => { server.close(); rejectConsent(new GoogleError('authorization_expired')); }, 5 * 60 * 1000);
    const finish = error => { clearTimeout(timer); server.close(); error ? rejectConsent(error) : resolveConsent(); };
    server = http.createServer(async (request, response) => {
      // No logs, redirects, third-party assets, or request URL reflection.
      let url;
      try { url = new URL(request.url || '/', GOOGLE_CALLBACK); }
      catch { response.writeHead(400, responseHeaders).end('Invalid authorization callback.'); return; }
      const valid = request.method === 'GET' && request.headers.host === '127.0.0.1:8765'
        && url.origin === 'http://127.0.0.1:8765' && url.pathname === '/oauth2callback'
        && same(url.searchParams.get('state'), state) && !used && Date.now() < expires;
      if (!valid) { response.writeHead(400, responseHeaders).end('Invalid or expired authorization callback.'); return; }
      used = true;
      if (url.searchParams.get('error') || !url.searchParams.get('code') || url.searchParams.get('code').length > 4000) {
        response.writeHead(400, responseHeaders).end('Authorization was not granted.'); finish(new GoogleError('authorization_denied')); return;
      }
      try {
        const { tokens } = await oauth.getToken({ code: url.searchParams.get('code'), codeVerifier, redirect_uri: GOOGLE_CALLBACK });
        if (!tokens.refresh_token || !tokens.access_token) throw new GoogleError('refresh_token_missing_reauthorize');
        oauth.setCredentials(tokens);
        await verifyGoogleToken(oauth, tokens.access_token, config.expectedAccountEmail, async accessToken => {
          const signal = AbortSignal.timeout(15000);
          const profile = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
            headers: { Authorization: `Bearer ${accessToken}` }, redirect: 'error', signal });
          if (!profile.ok) { await profile.body?.cancel(); throw new GoogleError('account_verification_failed'); }
          try { return JSON.parse(await boundedGoogleBody(profile, { maxBytes: 10000, signal })); }
          catch { throw new GoogleError('account_verification_failed'); }
        }, undefined, requiredScopes);
        const values = { GOOGLE_CLIENT_ID: config.clientId, GOOGLE_CLIENT_SECRET: config.clientSecret,
          GOOGLE_EXPECTED_ACCOUNT_EMAIL: config.expectedAccountEmail, GOOGLE_REDIRECT_URI: GOOGLE_CALLBACK,
          GOOGLE_REFRESH_TOKEN: tokens.refresh_token };
        const content = '# Google connector secrets. Ignored; never commit or paste.\n'
          + Object.entries(values).map(([key, value]) => `${key}=${envLine(value)}`).join('\n') + '\n';
        await existingOutput(force);
        if (force) {
          const temporary = `${OUTPUT}.${randomBytes(8).toString('hex')}.tmp`;
          try {
            const file = await open(temporary, 'wx', 0o600);
            try { await file.writeFile(content); } finally { await file.close(); }
            await rename(temporary, OUTPUT);
          } finally { await unlink(temporary).catch(() => {}); }
        } else {
          const file = await open(OUTPUT, 'wx', 0o600);
          try { await file.writeFile(content); } finally { await file.close(); }
        }
        response.writeHead(200, responseHeaders).end('Google account connected. You may close this tab.');
        finish();
      } catch (error) {
        response.writeHead(400, responseHeaders).end('Authorization failed. Return to the terminal for the safe status.');
        finish(error instanceof GoogleError ? error : new GoogleError('authorization_failed'));
      }
    });
    server.once('error', () => finish(new GoogleError('loopback_unavailable')));
    server.listen(8765, '127.0.0.1', () => {
      write('Open this Google consent URL in a browser on this computer (expires in five minutes):');
      write(authorization);
    });
  });
  write('Connected and verified the expected account/scopes. Credentials saved to ignored .env.google (0600).');
  write('For Railway, copy these variables into service secrets using the Railway dashboard; restart the service. Never paste tokens into chat.');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const flags = process.argv.slice(2);
  if (flags.some(flag => !['--force', '--calendar'].includes(flag))) { console.error('Usage: npm run google:connect -- [--force] [--calendar]'); process.exitCode = 1; }
  else connectGoogle({ force: flags.includes('--force'), calendar: flags.includes('--calendar') }).catch(error => {
    console.error(`Google connection: ${error instanceof GoogleError ? error.code : 'authorization_failed'}.`);
    process.exitCode = 1;
  });
}
