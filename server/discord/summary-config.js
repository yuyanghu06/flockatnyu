/** Request-only model configuration. Live chat owns its in-memory call/cost budget. */
export function readDiscordSummaryConfig(env = process.env) {
  const provider = env.LLM_PROVIDER || '', model = env.LLM_MODEL || '', apiKey = (env.LLM_API_KEY || '').trim();
  const baseUrl = (env.LLM_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/,'');
  return Object.freeze({configured:provider === 'openai-compatible' && model === 'gpt-6-luna' && baseUrl === 'https://api.openai.com/v1' && Boolean(apiKey),
    provider,model,apiKey,baseUrl,promptVersion:'discord-live-request-v1',
    maxInputBytes:49152,maxOutputTokens:6400,maxOutputBytes:32768,requestTimeoutMs:30000,maxRetries:2,
    inputPricePerMillion:0.10,outputPricePerMillion:0.50});
}
