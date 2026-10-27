import { plainObject } from '../../../server/automation/validation.js';

const statuses = Object.freeze({
  ready: 200,
  pending: 202,
  forbidden: 403,
  invalid_request: 400,
  not_configured: 503,
  unavailable: 503,
  aborted: 408,
  rate_limited: 429,
  budget_exceeded: 402,
  invalid_response: 502,
  response_too_large: 502,
  log_unavailable: 503,
});
const label = (value) =>
  typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,159}$/.test(value);
function usage(value) {
  return (
    plainObject(value) &&
    (value.callId === null || label(value.callId)) &&
    label(value.provider) &&
    (value.costMicro === null || (Number.isSafeInteger(value.costMicro) && value.costMicro >= 0))
  );
}
const fields = Object.freeze({
  email_find: ['email', 'confidence', 'first_name', 'last_name', 'verified'],
  email_verify: ['valid', 'status', 'score'],
  phone_find: ['phone', 'line_type', 'country_code'],
  company_enrich: [
    'name',
    'domain',
    'website',
    'description',
    'industry',
    'employees',
    'location',
    'linkedin_url',
    'founded',
  ],
});
function projectResult(result, operation) {
  if (!plainObject(result) || result.operation !== operation || !usage(result.usage)) return null;
  const safeUsage = {
    callId: result.usage.callId,
    provider: result.usage.provider,
    costMicro: result.usage.costMicro,
  };
  if (result.status === 'pending') return { status: 'pending', operation, usage: safeUsage };
  if (
    result.status !== 'ready' ||
    typeof result.hasResult !== 'boolean' ||
    !plainObject(result.output)
  )
    return null;
  const output = Object.fromEntries(
    fields[operation]
      .filter((key) => Object.hasOwn(result.output, key))
      .map((key) => [key, result.output[key]]),
  );
  // The client validates provider types; the HTTP boundary independently checks
  // injected clients so unknown provider objects never become response fields.
  const required =
    operation === 'email_find'
      ? ['email']
      : operation === 'email_verify'
        ? ['valid', 'status']
        : operation === 'phone_find'
          ? ['phone']
          : ['name'];
  if (required.some((key) => !Object.hasOwn(output, key))) return null;
  for (const [key, value] of Object.entries(output)) {
    if (value === null) continue;
    if (['valid', 'verified'].includes(key)) {
      if (typeof value !== 'boolean') return null;
    } else if (key === 'confidence') {
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1)
        return null;
    } else if (['score', 'founded'].includes(key)) {
      if (!Number.isSafeInteger(value)) return null;
    } else if (typeof value !== 'string' || value.length > 512000) return null;
  }
  const primary =
    operation === 'email_find'
      ? 'email'
      : operation === 'phone_find'
        ? 'phone'
        : operation === 'company_enrich'
          ? 'name'
          : 'status';
  if (output[primary] !== null && !output[primary].trim()) return null;
  if (result.hasResult !== (output[primary] !== null)) return null;
  return { status: 'ready', operation, hasResult: result.hasResult, output, usage: safeUsage };
}
export { statuses, projectResult };
