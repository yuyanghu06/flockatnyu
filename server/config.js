export function readConfig(env = process.env) {
  const provider = env.LLM_PROVIDER || '';
  const model = env.LLM_MODEL || '';
  const apiKey = env.LLM_API_KEY || '';
  const production = env.NODE_ENV === 'production';
  const timeout = Number(env.LLM_TIMEOUT_MS || 30000);
  const baseUrl = env.LLM_BASE_URL || (provider === 'anthropic' ? 'https://api.anthropic.com/v1' : 'https://api.openai.com/v1');
  let validUrl = false;
  try { const url = new URL(baseUrl); validUrl = ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && !url.search && !url.hash; } catch {}
  return Object.freeze({ provider, model, apiKey, baseUrl,
    configured: ['openai-compatible', 'anthropic'].includes(provider) && Boolean(model && apiKey && validUrl),
    timeoutMs: Number.isFinite(timeout) ? Math.min(120000, Math.max(100, timeout)) : 30000,
    production, host: production ? (env.HOST || '0.0.0.0') : '127.0.0.1',
    port: Number(env.PORT || 3001),
    allowedSourceIds: Object.freeze((env.DEV_ALLOWED_SOURCE_IDS || '').split(',').map(s => s.trim()).filter(Boolean)),
    devAdminEnabled: !production && env.DEV_ADMIN_ENABLED === 'true',
    retrievalToolsEnabled: env.LLM_RETRIEVAL_TOOLS_ENABLED !== 'false',
  });
}
