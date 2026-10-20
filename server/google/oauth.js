import {SOURCE_TOOL_TIMEOUT_MS} from '../source-timeout.js';
import { OAuth2Client } from 'google-auth-library';
import { GOOGLE_SCOPES } from './config.js';

export class GoogleError extends Error {
  constructor(code = 'google_unavailable') { super(code); this.name = 'GoogleError'; this.code = code; }
}

export function createGoogleOAuth(config) {
  return new OAuth2Client({ clientId: config.clientId, clientSecret: config.clientSecret,
    redirectUri: config.redirectUri, transporterOptions: { timeout: SOURCE_TOOL_TIMEOUT_MS, retryConfig: { retry: 0 },
      size: 65536, maxContentLength: 65536, maxRedirects: 0 } });
}

export function googleError(error, signal) {
  if (error instanceof GoogleError) return error;
  if (signal?.aborted) return new GoogleError('aborted');
  // Inspect only machine-readable fields. Never return/log upstream bodies.
  const code = error?.response?.data?.error;
  return new GoogleError(code === 'invalid_grant' || error?.response?.status === 401
    ? 'reauthorization_required' : 'google_unavailable');
}

export function hasGoogleScopes(scopes, requiredScopes = GOOGLE_SCOPES) {
  return Array.isArray(scopes) && Array.isArray(requiredScopes) && requiredScopes.every(scope => scopes.includes(scope));
}

// Google getAccessToken/getTokenInfo do not accept AbortSignal. Bound their
// transport separately and stop the caller promptly on cancellation without
// mutating shared transporter defaults during concurrent requests.
export async function waitForGoogleAuth(operation, signal) {
  if (signal?.aborted) throw new GoogleError('aborted');
  let abort;
  const cancelled = new Promise((_, reject) => {
    abort = () => reject(new GoogleError('aborted'));
    signal?.addEventListener('abort', abort, { once: true });
  });
  try { return await Promise.race([operation(), cancelled]); }
  finally { signal?.removeEventListener('abort', abort); }
}

export async function verifyGoogleToken(oauth, accessToken, expectedEmail, readProfile, signal, requiredScopes = GOOGLE_SCOPES) {
  const info = await waitForGoogleAuth(() => oauth.getTokenInfo(accessToken), signal);
  if (!hasGoogleScopes(info.scopes, requiredScopes)) throw new GoogleError('reauthorization_required');
  if (signal?.aborted) throw new GoogleError('aborted');
  const profile = await readProfile(accessToken);
  if (typeof profile?.emailAddress !== 'string' || profile.emailAddress.toLowerCase() !== expectedEmail.toLowerCase()) {
    throw new GoogleError('account_mismatch');
  }
  return true;
}
