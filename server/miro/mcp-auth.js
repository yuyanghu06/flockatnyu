import { randomBytes } from 'node:crypto';
import { lstat, open, readFile, rename, unlink } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { MIRO_MCP_CALLBACK, MIRO_MCP_ENDPOINT, MIRO_MCP_SCOPES } from './mcp-config.js';

export class MiroMcpError extends Error {
  constructor(code) { super(code); this.name = 'MiroMcpError'; this.code = code; }
}
export const miroMcpErrorCode = error => error instanceof MiroMcpError ? error.code : 'mcp_upstream_error';
const object = value => value && typeof value === 'object' && !Array.isArray(value);

// A short-lived local lock serializes API and worker sessions sharing a token
// file. Locks contain no credentials. Abandoned locks expire beyond the maximum
// bounded operation duration; a live operation never runs beyond that duration.
export async function acquireMiroMcpAuthLock(path, { signal } = {}) {
  const lockPath = `${path}.lock`;
  const owner = randomBytes(16).toString('hex');
  while (!signal?.aborted) {
    try {
      const file = await open(lockPath, 'wx', 0o600);
      try { await file.writeFile(owner); } finally { await file.close(); }
      return async () => {
        try { if (await readFile(lockPath, 'utf8') === owner) await unlink(lockPath); } catch {}
      };
    } catch (error) {
      if (error.code !== 'EEXIST') throw new MiroMcpError('auth_lock_failed');
      try {
        const stat = await lstat(lockPath);
        if (stat.isFile() && !stat.isSymbolicLink() && Date.now() - stat.mtimeMs > 180000) await unlink(lockPath);
      } catch (error) { if (error.code !== 'ENOENT') throw new MiroMcpError('auth_lock_failed'); }
      try { await delay(100, undefined, { signal }); } catch { throw new MiroMcpError('aborted'); }
    }
  }
  throw new MiroMcpError('aborted');
}

export async function readMiroMcpCredentials(path) {
  try {
    const stat = await lstat(path);
    if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o077) || stat.size > 65536) throw new MiroMcpError('unsafe_auth_file');
    const value = JSON.parse(await readFile(path, 'utf8'));
    if (!object(value) || value.endpoint !== MIRO_MCP_ENDPOINT) throw new MiroMcpError('invalid_auth_file');
    return value;
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    if (error instanceof MiroMcpError) throw error;
    throw new MiroMcpError('invalid_auth_file');
  }
}

export async function saveMiroMcpCredentials(path, value) {
  const temporary = `${path}.${randomBytes(12).toString('hex')}.tmp`;
  try {
    // Refuse symlink/non-private destinations rather than following them.
    await readMiroMcpCredentials(path);
    const file = await open(temporary, 'wx', 0o600);
    try { await file.writeFile(JSON.stringify({ ...value, endpoint: MIRO_MCP_ENDPOINT }) + '\n'); }
    finally { await file.close(); }
    await rename(temporary, path);
  } catch (error) {
    if (error instanceof MiroMcpError) throw error;
    throw new MiroMcpError('auth_storage_failed');
  } finally { await unlink(temporary).catch(() => {}); }
}

// App-owned credentials only. This never reads a desktop MCP client's storage.
export function createMiroMcpOAuthProvider({ config, interactive = false, redirectToAuthorization, state, now = () => new Date() } = {}) {
  let stored, verifier, pending = Promise.resolve();
  const environmentCredentials = Boolean(config.refreshToken || config.accessToken);
  const load = async () => {
    if (!environmentCredentials || config.persistAuth) stored = await readMiroMcpCredentials(config.authFile);
    return stored ||= {};
  };
  const persist = async () => {
    // Env-only deployments keep refreshed tokens in memory. For rotating refresh
    // tokens, configure a writable persistent MIRO_MCP_AUTH_FILE volume.
    if (!environmentCredentials || config.persistAuth) await saveMiroMcpCredentials(config.authFile, stored);
  };
  const update = fn => {
    const next = pending.then(async () => { await load(); fn(stored); await persist(); });
    pending = next.catch(() => {}); return next;
  };
  return {
    redirectUrl: MIRO_MCP_CALLBACK,
    clientMetadata: { client_name: 'Tech NYU Miro reader', redirect_uris: [MIRO_MCP_CALLBACK],
      grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], token_endpoint_auth_method: 'none', scope: MIRO_MCP_SCOPES },
    state: () => state,
    async clientInformation() {
      const saved = await load();
      return saved.clientInformation || (config.clientId ? { client_id: config.clientId,
        ...(config.clientSecret ? { client_secret: config.clientSecret } : {}), issuer: MIRO_MCP_ENDPOINT } : undefined);
    },
    ...(interactive ? { saveClientInformation: value => update(saved => { saved.clientInformation = value; }) } : {}),
    async tokens() {
      const saved = await load();
      return saved.tokens || (environmentCredentials ? { access_token: config.accessToken || 'refresh-required',
        token_type: 'Bearer', ...(config.refreshToken ? { refresh_token: config.refreshToken } : {}), issuer: MIRO_MCP_ENDPOINT } : undefined);
    },
    tokensSavedAt: async () => (await load()).tokensSavedAt ?? null,
    saveTokens: value => update(saved => {
      if (!value.access_token) throw new MiroMcpError('missing_access_token');
      // The provider may return broader scopes than the read-only consent
      // request. The transport's fixed read-tool allowlist is the enforcement
      // boundary; the CLI reports the actual scope without printing tokens.
      saved.tokens = value;
      saved.tokensSavedAt = new Date(now()).toISOString();
    }),
    async redirectToAuthorization(url) {
      if (!interactive || typeof redirectToAuthorization !== 'function') throw new MiroMcpError('auth_required');
      await redirectToAuthorization(url);
    },
    saveCodeVerifier(value) { verifier = value; },
    codeVerifier() { if (!verifier) throw new MiroMcpError('pkce_missing'); return verifier; },
    invalidateCredentials: scope => update(saved => {
      if (['all', 'client'].includes(scope)) delete saved.clientInformation;
      if (['all', 'tokens'].includes(scope)) { delete saved.tokens; delete saved.tokensSavedAt; }
      if (['all', 'verifier'].includes(scope)) verifier = undefined;
    }),
  };
}

// Used by the transport and OAuth discovery/exchange so every upstream response
// (JSON or SSE) has an enforced byte budget and an operation cancellation signal.
export function createBoundedMiroMcpFetch({ fetchImpl = globalThis.fetch, config, signal } = {}) {
  return async (input, init = {}) => {
    const url = new URL(input instanceof Request ? input.url : input);
    if (url.origin !== new URL(MIRO_MCP_ENDPOINT).origin || url.username || url.password) throw new MiroMcpError('endpoint_not_allowed');
    const combined = AbortSignal.any([signal, init.signal, AbortSignal.timeout(config.requestTimeoutMs)].filter(Boolean));
    const response = await fetchImpl(input, { ...init, redirect: 'error', signal: combined });
    if (Number(response.headers.get('content-length')) > config.maxResponseBytes) {
      await response.body?.cancel(); throw new MiroMcpError('response_byte_limit');
    }
    if (!response.body) return response;
    let bytes = 0;
    const body = response.body.pipeThrough(new TransformStream({ transform(chunk, controller) {
      if (combined.aborted) throw new MiroMcpError('aborted');
      bytes += chunk.byteLength;
      if (bytes > config.maxResponseBytes) throw new MiroMcpError('response_byte_limit');
      controller.enqueue(chunk);
    } }), { signal: combined });
    return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
  };
}
