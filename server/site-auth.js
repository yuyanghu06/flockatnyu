import {createHash, createHmac, randomBytes, timingSafeEqual} from 'node:crypto';

const COOKIE = '__Host-tech_session';
const digest = value => createHash('sha256').update(value).digest();
const equal = (a, b) => timingSafeEqual(digest(a), digest(b));
const unsafe = method => !['GET', 'HEAD', 'OPTIONS'].includes(method);

export function readSiteAuthConfig(env = process.env) {
  let origin;
  try {
    const url = new URL(env.PUBLIC_ORIGIN);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw Error();
    origin = url.origin;
  } catch { throw new Error('site_origin_invalid'); }
  const password = env.SITE_ACCESS_PASSWORD || '', signingSecret = env.SITE_SESSION_SECRET || '';
  if (password.length < 24 || password.length > 1024 || signingSecret.length < 32 || signingSecret.length > 1024 || /[\r\n\0]/.test(password + signingSecret)) throw new Error('site_credentials_invalid');
  const ttlSeconds = Number(env.SITE_SESSION_TTL_SECONDS || 43200);
  if (!Number.isInteger(ttlSeconds) || ttlSeconds < 300 || ttlSeconds > 86400) throw new Error('site_session_duration_invalid');
  return Object.freeze({origin, password, signingSecret, ttlSeconds,
    googleEnabled: env.SITE_GOOGLE_ENABLED === 'true', discordEnabled: env.SITE_DISCORD_ENABLED === 'true'});
}

/** A deliberately private shared operator session, never a member identity.
 * The existing local-operator label is a backend capability protocol; this
 * production grant comes only from a verified session and server configuration. */
export function createSiteAuth({config = readSiteAuthConfig(), apiConfig, now = Date.now} = {}) {
  const sign = body => createHmac('sha256', config.signingSecret).update(body).digest('base64url');
  const cookie = (token, maxAge) => `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
  function session(request) {
    if (unsafe(request.method) && request.headers.get('origin') !== config.origin) return false;
    if (request.headers.get('sec-fetch-site') === 'cross-site') return false;
    const matches = (request.headers.get('cookie') || '').split(';').map(v => v.trim()).filter(v => v.startsWith(`${COOKIE}=`));
    if (matches.length !== 1) return false;
    const token = matches[0].slice(COOKIE.length + 1);
    if (token.length > 512) return false;
    const [body, proof, extra] = token.split('.');
    if (!body || !proof || extra || !equal(sign(body), proof)) return false;
    try {
      const value = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
      const seconds = Math.floor(now() / 1000);
      return value.v === 1 && /^[a-f0-9]{32}$/.test(value.nonce) && Number.isInteger(value.iat) && Number.isInteger(value.exp)
        && value.iat <= seconds && value.exp > seconds && value.exp - value.iat === config.ttlSeconds;
    } catch { return false; }
  }
  function issue(password) {
    if (typeof password !== 'string' || !equal(password, config.password)) return null;
    const iat = Math.floor(now() / 1000);
    const body = Buffer.from(JSON.stringify({v:1, iat, exp:iat + config.ttlSeconds, nonce:randomBytes(16).toString('hex')})).toString('base64url');
    return cookie(`${body}.${sign(body)}`, config.ttlSeconds);
  }
  function principal(request) {
    if (!session(request)) return null;
    return {id:'private-shared-operator', allowedSourceIds:[...(apiConfig?.allowedSourceIds || [])], isAdmin:false,
      ...(config.googleEnabled ? {googleAccess:true} : {}),
      ...(config.discordEnabled && /^[0-9]{1,20}$/.test(apiConfig?.discordGuildId) ? {liveDiscord:{mode:'local-operator', guildId:apiConfig.discordGuildId}} : {})};
  }
  return Object.freeze({config, session, issue, principal, clearCookie:() => cookie('', 0),
    auth: c => principal(c.req.raw)});
}
