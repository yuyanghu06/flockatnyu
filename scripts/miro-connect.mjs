import http from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { auth } from '@modelcontextprotocol/sdk/client/auth.js';
import { readMiroMcpConfig, MIRO_MCP_ENDPOINT, MIRO_MCP_SCOPES, MIRO_MCP_CALLBACK } from '../server/miro/mcp-config.js';
import { MiroMcpError, miroMcpErrorCode, createMiroMcpOAuthProvider, createBoundedMiroMcpFetch, readMiroMcpCredentials } from '../server/miro/mcp-auth.js';

const same = (a, b) => typeof a === 'string' && Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const headers = { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store',
  'content-security-policy': "default-src 'none'; frame-ancestors 'none'", 'referrer-policy': 'no-referrer' };

export async function connectMiro({ env = process.env, write = console.log, openBrowser = true } = {}) {
  const config = { ...readMiroMcpConfig(env), persistAuth: true };
  if (config.issues.some(issue => !['auth_required', 'missing_board_scope'].includes(issue))) throw new MiroMcpError('invalid_config');
  await readMiroMcpCredentials(config.authFile);
  const state = randomBytes(32).toString('hex');
  let used = false, server, timer;
  const fetchFn = createBoundedMiroMcpFetch({ config });
  const provider = createMiroMcpOAuthProvider({ config, interactive: true, state,
    redirectToAuthorization: url => {
      write('Authorize the read-only Miro connection in the browser (expires in five minutes).');
      write(String(url));
      if (openBrowser) {
        const command = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'rundll32' : 'xdg-open';
        const args = process.platform === 'win32' ? ['url.dll,FileProtocolHandler', String(url)] : [String(url)];
        const child = spawn(command, args, { stdio: 'ignore', detached: true });
        child.on('error', () => {}); child.unref();
      }
    } });
  await new Promise((resolveConsent, rejectConsent) => {
    let settled = false;
    const finish = (error, response) => {
      const close = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        server.close();
        // Browsers can preconnect without issuing a request. Those sockets can
        // survive close(); release them after the callback response has flushed.
        server.closeAllConnections();
        error ? rejectConsent(error) : resolveConsent();
      };
      if (response && !response.writableFinished && !response.destroyed) {
        response.once('finish', close);
        response.once('close', close);
      } else close();
    };
    server = http.createServer(async (request, response) => {
      let url;
      try { url = new URL(request.url || '/', MIRO_MCP_CALLBACK); }
      catch { response.writeHead(400, headers).end('Invalid callback.'); return; }
      if (request.method !== 'GET' || request.headers.host !== '127.0.0.1:8766' || url.origin !== 'http://127.0.0.1:8766'
        || url.pathname !== '/oauth2callback' || used || !same(url.searchParams.get('state'), state)) {
        response.writeHead(400, headers).end('Invalid or expired callback.'); return;
      }
      used = true;
      const code = url.searchParams.get('code');
      if (url.searchParams.has('error') || !code || code.length > 4096) {
        response.writeHead(400, headers).end('Authorization was not granted.'); finish(new MiroMcpError('authorization_denied'), response); return;
      }
      try {
        const result = await auth(provider, { serverUrl: MIRO_MCP_ENDPOINT, authorizationCode: code, scope: MIRO_MCP_SCOPES, fetchFn });
        if (result !== 'AUTHORIZED') throw new MiroMcpError('authorization_failed');
        const tokens = await provider.tokens();
        if (!tokens?.refresh_token) throw new MiroMcpError('refresh_token_missing');
        response.writeHead(200, headers).end('Miro connected. You may close this tab.'); finish(undefined, response);
      } catch (error) {
        response.writeHead(400, headers).end('Authorization failed. Return to the terminal for the safe status.');
        finish(error instanceof MiroMcpError ? error : new MiroMcpError('authorization_failed'), response);
      }
    });
    server.once('error', () => finish(new MiroMcpError('loopback_unavailable')));
    timer = setTimeout(() => finish(new MiroMcpError('authorization_expired')), 300000);
    server.listen(8766, '127.0.0.1', async () => {
      try {
        const result = await auth(provider, { serverUrl: MIRO_MCP_ENDPOINT, scope: MIRO_MCP_SCOPES, fetchFn });
        if (result === 'AUTHORIZED') finish();
      } catch (error) { finish(error instanceof MiroMcpError ? error : new MiroMcpError('authorization_failed')); }
    });
  });
  const grantedScope = (await provider.tokens())?.scope;
  if (typeof grantedScope === 'string') write(`Miro reported OAuth scopes: ${grantedScope.replace(/[^a-zA-Z0-9:_. -]/g, '').slice(0, 200)}.`);
  write('Miro app credentials saved privately (0600). Both backend agents can use this connection.');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const flags = process.argv.slice(2);
  if (flags.some(flag => flag !== '--no-open')) { console.error('Usage: node scripts/miro-connect.mjs [--no-open]'); process.exitCode = 1; }
  else connectMiro({ openBrowser: !flags.includes('--no-open') }).catch(error => {
    console.error(`Miro connection: ${miroMcpErrorCode(error)}.`); process.exitCode = 1;
  });
}
