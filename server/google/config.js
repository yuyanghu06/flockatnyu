// Server only. Never serialize this config: it contains OAuth credentials.
export const GOOGLE_SCOPES = Object.freeze([
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/drive.readonly',
]);
export const GOOGLE_CALLBACK = 'http://127.0.0.1:8765/oauth2callback';

export function readGoogleConfig(env = process.env) {
  const value = key => typeof env[key] === 'string' ? env[key].trim() : '';
  const clientId = value('GOOGLE_CLIENT_ID');
  const clientSecret = value('GOOGLE_CLIENT_SECRET');
  const refreshToken = value('GOOGLE_REFRESH_TOKEN');
  const expectedAccountEmail = value('GOOGLE_EXPECTED_ACCOUNT_EMAIL').toLowerCase();
  const redirectUri = value('GOOGLE_REDIRECT_URI') || GOOGLE_CALLBACK;
  const oauthConfigured = Boolean(clientId && clientSecret && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(expectedAccountEmail) && redirectUri === GOOGLE_CALLBACK);
  return Object.freeze({ clientId, clientSecret, refreshToken, expectedAccountEmail, redirectUri,
    oauthConfigured, configured: oauthConfigured && Boolean(refreshToken),
  });
}
