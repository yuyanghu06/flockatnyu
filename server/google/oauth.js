import {SOURCE_TOOL_TIMEOUT_MS} from "../shared/source-timeout.js";
import { OAuth2Client } from 'google-auth-library';
import { GOOGLE_SCOPES } from './config.js';

const DIAGNOSTIC_STAGES = new Set(['local_validation', 'oauth', 'account_verification', 'calendar_acl', 'provider_request', 'response_parse']);
const DIAGNOSTIC_REASONS = new Set(['google_unavailable', 'aborted', 'timeout', 'reauthorization_required', 'permission_denied',
  'not_found', 'rate_limited', 'invalid_request', 'invalid_response', 'response_too_large', 'account_mismatch', 'forbidden',
  'forbidden_source', 'context_limit', 'unmanaged_event', 'human_modified', 'unsupported_event', 'cancelled_event', 'conflict',
  'gone', 'not_configured', 'http_error', 'network_error', 'invalid_json', 'missing_scope', 'missing_access_token', 'invalid_time_window']);

// Diagnostics are an internal fixed vocabulary, never arbitrary exception text.
export function googleDiagnostics({ stage, reason, httpStatus } = {}) {
  return Object.freeze({ stage: DIAGNOSTIC_STAGES.has(stage) ? stage : 'provider_request',
    reason: DIAGNOSTIC_REASONS.has(reason) ? reason : 'google_unavailable',
    ...(Number.isInteger(httpStatus) && httpStatus >= 100 && httpStatus <= 599 ? { httpStatus } : {}) });
}
export class GoogleError extends Error {
  constructor(code = 'google_unavailable', diagnostics = {}) {
    super(code); this.name = 'GoogleError'; this.code = code;
    this.diagnostics = googleDiagnostics({ stage: code === 'invalid_request' || code === 'forbidden' || code === 'forbidden_source'
      ? 'local_validation' : code === 'invalid_response' || code === 'response_too_large' ? 'response_parse' : 'provider_request',
      reason: code, ...diagnostics });
  }
}

export function createGoogleOAuth(config) {
  return new OAuth2Client({ clientId: config.clientId, clientSecret: config.clientSecret,
    redirectUri: config.redirectUri, transporterOptions: { timeout: SOURCE_TOOL_TIMEOUT_MS, retryConfig: { retry: 0 },
      size: 65536, maxContentLength: 65536, maxRedirects: 0 } });
}

export function googleError(error, signal, diagnostics = {}) {
  if (error instanceof GoogleError) return error;
  if (signal?.aborted) return new GoogleError('aborted', { ...diagnostics, reason: 'aborted' });
  // Inspect only machine-readable fields. Never return/log upstream bodies.
  const code = error?.response?.data?.error;
  return new GoogleError(code === 'invalid_grant' || error?.response?.status === 401
    ? 'reauthorization_required' : 'google_unavailable', { ...diagnostics,
      reason: code === 'invalid_grant' || error?.response?.status === 401 ? 'reauthorization_required'
        : Number.isInteger(error?.response?.status) ? 'http_error' : 'network_error', httpStatus: error?.response?.status });
}

export function hasGoogleScopes(scopes, requiredScopes = GOOGLE_SCOPES) {
  return Array.isArray(scopes) && Array.isArray(requiredScopes) && requiredScopes.every(scope => scopes.includes(scope));
}

// Google getAccessToken/getTokenInfo do not accept AbortSignal. Bound their
// transport separately and stop the caller promptly on cancellation without
// mutating shared transporter defaults during concurrent requests.
export async function waitForGoogleAuth(operation, signal, stage) {
  if (signal?.aborted) throw new GoogleError('aborted', { stage });
  let abort;
  const cancelled = new Promise((_, reject) => {
    abort = () => reject(new GoogleError('aborted', { stage }));
    signal?.addEventListener('abort', abort, { once: true });
  });
  try { return await Promise.race([operation(), cancelled]); }
  catch (error) { throw stage ? googleError(error, signal, { stage }) : error; }
  finally { signal?.removeEventListener('abort', abort); }
}

export async function verifyGoogleToken(oauth, accessToken, expectedEmail, readProfile, signal, requiredScopes = GOOGLE_SCOPES, diagnosticErrors = false) {
  const info = await waitForGoogleAuth(() => oauth.getTokenInfo(accessToken), signal, diagnosticErrors ? 'account_verification' : undefined);
  if (!hasGoogleScopes(info.scopes, requiredScopes)) throw new GoogleError('reauthorization_required', { stage: 'account_verification', reason: 'missing_scope' });
  if (signal?.aborted) throw new GoogleError('aborted', { stage: 'account_verification' });
  const profile = await readProfile(accessToken);
  if (typeof profile?.emailAddress !== 'string' || profile.emailAddress.toLowerCase() !== expectedEmail.toLowerCase()) {
    throw new GoogleError('account_mismatch', { stage: 'account_verification' });
  }
  return true;
}
