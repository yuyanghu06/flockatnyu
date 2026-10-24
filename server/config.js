const supportedProviders=new Set(['openai-compatible','anthropic']);
const validProviderUrl=value=>{
  if(typeof value!=='string'||!value.trim()||/[\x00-\x20\x7f?#]/.test(value))return false;
  try {const url=new URL(value);return ['http:','https:'].includes(url.protocol)&&!url.username&&!url.password&&!url.search&&!url.hash;}
  catch {return false;}
};
function providerList(value,provider,model) {
  if(value===undefined||typeof value==='string'&&!value.trim())return undefined;
  try {
    const entries=typeof value==='string'?JSON.parse(value):null;
    if(!Array.isArray(entries)||!entries.length||entries.length>8)return null;
    return Object.freeze(entries.map(entry=>{
      if(!entry||typeof entry!=='object'||Array.isArray(entry)
        ||Object.keys(entry).some(key=>!['baseUrl','apiKey','provider','model'].includes(key)))throw Error('invalid_provider_list');
      const next={provider:entry.provider===undefined?provider:entry.provider,model:entry.model===undefined?model:entry.model,
        baseUrl:entry.baseUrl,apiKey:entry.apiKey};
      if(!supportedProviders.has(next.provider)||typeof next.model!=='string'||!next.model.trim()||/[\r\n]/.test(next.model)
        ||typeof next.apiKey!=='string'||!next.apiKey.trim()||/[\r\n]/.test(next.apiKey)||!validProviderUrl(next.baseUrl))throw Error('invalid_provider_list');
      return Object.freeze(next);
    }));
  }catch{return null;}
}

export function readConfig(env = process.env) {
  const inheritedProvider = env.LLM_PROVIDER || '', inheritedModel = env.LLM_MODEL || '';
  const providers=providerList(env.LLM_PROVIDERS_JSON,inheritedProvider,inheritedModel);
  const provider = providers?.[0]?.provider??inheritedProvider;
  const model = providers?.[0]?.model??inheritedModel;
  const apiKey = providers?.[0]?.apiKey??(env.LLM_API_KEY || '');
  const production = env.NODE_ENV === 'production';
  const timeout = Number(env.LLM_TIMEOUT_MS || 30000);
  const requestTimeout = Number(env.ASSISTANT_REQUEST_TIMEOUT_MS || 420000);
  const baseUrl = providers?.[0]?.baseUrl??(env.LLM_BASE_URL || (provider === 'anthropic' ? 'https://api.anthropic.com/v1' : 'https://api.openai.com/v1'));
  let validUrl = false;
  try { const url = new URL(baseUrl); validUrl = ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && !url.search && !url.hash; } catch {}
  return Object.freeze({ provider, model, apiKey, baseUrl,...(providers?{providers}:{}),
    configured: providers!==null&&supportedProviders.has(provider) && Boolean(model && apiKey && validUrl),
    timeoutMs: Number.isFinite(timeout) ? Math.min(120000, Math.max(100, timeout)) : 30000,
    requestTimeoutMs: Number.isFinite(requestTimeout) ? Math.min(600000, Math.max(100, requestTimeout)) : 420000,
    production, host: production ? (env.HOST || '0.0.0.0') : '127.0.0.1',
    port: Number(env.PORT || 3001),
    allowedSourceIds: Object.freeze((env.ASSISTANT_ALLOWED_SOURCE_IDS || env.DEV_ALLOWED_SOURCE_IDS || '').split(',').map(s => s.trim()).filter(Boolean)),
    devAdminEnabled: !production && env.DEV_ADMIN_ENABLED === 'true',
    devLiveDiscordEnabled: !production && env.DEV_LIVE_DISCORD_ENABLED === 'true',
    devGoogleEnabled: !production && env.DEV_GOOGLE_ENABLED === 'true',
    discordGuildId: env.DISCORD_GUILD_ID || '',
    retrievalToolsEnabled: env.LLM_RETRIEVAL_TOOLS_ENABLED !== 'false',
  });
}
