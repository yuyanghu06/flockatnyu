import { attachmentErrors } from '../../../server/chat/attachments.js';

export const errorMessages = {
  ...attachmentErrors,
  access_denied: 'Access is not enabled for this request.',
  invalid_request: 'Send a valid, bounded chat conversation.',
  not_configured: 'The assistant model is not configured yet.',
  timeout: 'The assistant request timed out. Please try again.',
  aborted: 'The request was cancelled.',
  provider_unavailable: 'The assistant provider is unavailable. Please try again.',
  invalid_provider_response: 'The assistant returned an invalid response.',
  incomplete_provider_response: 'The assistant response was interrupted.',
};
export function errorRecord(code) {
  return {
    type: 'error',
    code,
    message: errorMessages[code] || errorMessages.provider_unavailable,
  };
}
export const ndjsonHeaders = {
  'content-type': 'application/x-ndjson; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
};

export async function readJSON(request, timeoutMs, maxBytes = 32768) {
  if (!request.headers.get('content-type')?.startsWith('application/json'))
    throw new Error('invalid');
  const reader = request.body?.getReader();
  if (!reader) throw new Error('invalid');
  const chunks = [];
  let length = 0,
    expired = false;
  const timer = setTimeout(() => {
    expired = true;
    void reader.cancel().catch(() => {});
  }, timeoutMs);
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (expired) throw new Error('invalid');
      if (done) break;
      length += value.byteLength;
      if (length > maxBytes) {
        void reader.cancel().catch(() => {});
        throw new Error('invalid');
      }
      chunks.push(value);
    }
  } finally {
    clearTimeout(timer);
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}

export const apiError = (c, code, status) =>
  c.json(
    { status: code, error: { message: errorMessages[code] || 'This operation is unavailable.' } },
    status,
  );
export const resultStatus = (status) =>
  ({
    forbidden: 403,
    forbidden_source: 403,
    invalid_request: 400,
    invalid: 400,
    conflict: 409,
    not_configured: 503,
    unavailable: 503,
    aborted: 408,
    stale: 409,
    rate_limited: 429,
    timeout: 504,
    not_found: 404,
    reauthorization_required: 401,
    permission_denied: 403,
    invalid_response: 502,
    response_too_large: 502,
    read_required: 409,
  })[status] || 200;
