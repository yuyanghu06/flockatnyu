const integer = (value,fallback,min,max) => value == null || value === '' ? fallback : Number.isInteger(Number(value)) ? Math.max(min,Math.min(max,Number(value))) : fallback;
const amount = (value,fallback,max) => value == null || value === '' ? fallback : Number.isFinite(Number(value)) && Number(value) > 0 ? Math.min(max,Number(value)) : fallback;
export function readDiscordSummaryConfig(env = process.env) {
  const provider = env.LLM_PROVIDER || '', model = env.LLM_MODEL || '', apiKey = (env.LLM_API_KEY || '').trim();
  const baseUrl = (env.LLM_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/,'');
  return Object.freeze({configured:provider === 'openai-compatible' && model === 'gpt-6-luna' && baseUrl === 'https://api.openai.com/v1' && Boolean(apiKey),
    provider,model,apiKey,baseUrl,guildId:env.DISCORD_GUILD_ID || '',promptVersion:'discord-calendar-retention-v3',embeddingsEnabled:false,
    concurrency:integer(env.DISCORD_SUMMARY_CONCURRENCY,4,1,4),maxGroups:integer(env.DISCORD_SUMMARY_MAX_GROUPS,25,1,1000),
    maxRequests:integer(env.DISCORD_SUMMARY_MAX_REQUESTS,100,1,1000),maxRuntimeMs:integer(env.DISCORD_SUMMARY_MAX_RUNTIME_MS,600000,100,3600000),
    maxInputBytes:49152,maxOutputTokens:6400,maxOutputBytes:32768,requestTimeoutMs:30000,maxRetries:2,
    maxOperationCostUsd:amount(env.DISCORD_SUMMARY_OPERATION_MAX_USD,5,5),maxRunCostUsd:amount(env.DISCORD_SUMMARY_RUN_MAX_USD,1,1),
    maxOperationRequests:10000,inputPricePerMillion:0.10,outputPricePerMillion:0.50});
}
