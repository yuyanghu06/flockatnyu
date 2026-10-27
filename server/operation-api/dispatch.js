import { consumeInvocation, recordOutcome, invocationActive } from './invocation.js';

export const OPERATION_BODY_BYTES = 8 * 1024 * 1024;
const headers = {
  'content-type': 'application/json',
  'cache-control': 'private, no-store',
  'x-content-type-options': 'nosniff',
};
export const operationResponse = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers });
const reject = (status, reason, http = 400) =>
  operationResponse({ kind: 'rejected', value: { status, reason, sources: [] } }, http);

// Each fixed endpoint supplies its operation name. This function authenticates
// before parsing and never dispatches a second service operation implicitly.
export async function dispatchOperation(c, operation) {
  const request = c.req.raw;
  const binding = consumeInvocation(request, c.env?.operationOwner, operation);
  if (!binding) return reject('forbidden', 'untrusted_operation_request', 403);
  if (request.signal.aborted || binding.context.signal?.aborted)
    return reject('aborted', 'operation_aborted');
  let body;
  let result;
  try {
    const text = await request.text();
    if (Buffer.byteLength(text) > OPERATION_BODY_BYTES)
      return reject('invalid_request', 'operation_request_too_large', 413);
    body = JSON.parse(text);
    if (
      !body ||
      typeof body !== 'object' ||
      Array.isArray(body) ||
      !Object.hasOwn(body, 'arguments') ||
      Object.keys(body).some(
        (key) => !['arguments', 'phase', 'preparation', 'missingArguments'].includes(key),
      ) ||
      (body.phase !== undefined && !['execute', 'prepare'].includes(body.phase)) ||
      (body.preparation !== undefined && typeof body.preparation !== 'string') ||
      (body.missingArguments !== undefined &&
        (body.missingArguments !== true || body.arguments !== null))
    )
      return reject('invalid_request', 'invalid_operation_envelope');
    // Domain services retain their existing schema and authorization ordering.
    if (body.missingArguments) body.arguments = undefined;
  } catch {
    return reject('invalid_request', 'invalid_operation_json');
  }
  try {
    // Body parsing is asynchronous: cleanup may invalidate the bound session
    // after initial authentication. Recheck immediately before dispatch.
    if (!invocationActive(binding) || request.signal.aborted || binding.context.signal?.aborted)
      return reject('aborted', 'operation_session_expired');
    result = await binding.invoke(body);
  } catch (error) {
    // Preserve original service exceptions for required audit/lease stopping.
    recordOutcome(request, { error });
    return reject('tool_error', 'operation_failed', 500);
  }
  try {
    if (!invocationActive(binding))
      return reject(
        'tool_error',
        binding.definition.readOnly ? 'operation_session_expired' : 'write_outcome_unknown',
      );
    const encoded = JSON.stringify({
      kind: 'value',
      value: result.value,
      ...(result.value === undefined ? { missing: true } : {}),
      ...(result.preparation ? { preparation: result.preparation } : {}),
    });
    if (Buffer.byteLength(encoded) > OPERATION_BODY_BYTES)
      return reject(
        'tool_error',
        binding.definition.readOnly ? 'operation_response_too_large' : 'write_outcome_unknown',
        413,
      );
    // Symbols/read-context capabilities remain private. The client receives JSON;
    // only the server-side session may later resolve its original read result.
    recordOutcome(request, { raw: result.value });
    return new Response(encoded, { headers });
  } catch {
    // Execution may already have changed the provider. An unreadable result is
    // transport uncertainty, not a new service exception or permission to retry.
    return reject(
      'tool_error',
      binding.definition.readOnly ? 'operation_invalid_response' : 'write_outcome_unknown',
      500,
    );
  }
}
