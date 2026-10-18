const integer = (value, fallback, min, max) => {
  const n = value === undefined || value === '' ? fallback : Number(value);
  if (!Number.isSafeInteger(n) || n < min || n > max) throw new Error('invalid_automation_config');
  return n;
};
export function readAutomationConfig(env = process.env) {
  const timezone = env.AGENT_AUTOMATION_TIMEZONE || 'America/New_York';
  try { new Intl.DateTimeFormat('en', {timeZone: timezone}); } catch { throw new Error('invalid_automation_config'); }
  return Object.freeze({
    enabled: env.AGENT_AUTOMATION_ENABLED === 'true', timezone,
    minEvents: integer(env.AGENT_AUTOMATION_MIN_EVENTS, 30, 1, 100),
    maxAgeSeconds: integer(env.AGENT_AUTOMATION_MAX_AGE_SECONDS, 1800, 1, 86400),
    cooldownSeconds: integer(env.AGENT_AUTOMATION_COOLDOWN_SECONDS, 60, 60, 86400),
    leaseSeconds: 120,
    maxInputs: integer(env.AGENT_AUTOMATION_MAX_INPUTS, 20, 1, 20),
    maxBytes: integer(env.AGENT_AUTOMATION_MAX_BYTES, 65536, 1024, 65536),
    maxRounds: integer(env.AGENT_AUTOMATION_MAX_ROUNDS, 16, 1, 16),
    maxCalls: integer(env.AGENT_AUTOMATION_MAX_CALLS, 32, 1, 32),
    maxRunMs: integer(env.AGENT_AUTOMATION_MAX_RUN_MS, 180000, 1000, 180000),
    pollMs: integer(env.AGENT_AUTOMATION_POLL_MS, 5000, 1000, 60000),
    adapterModule: env.AGENT_AUTOMATION_ADAPTER_MODULE || '',
  });
}
