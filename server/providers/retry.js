// Retry classification is deliberately restricted to fetch rejection and HTTP
// status. Never apply these helpers to successful response parsing or tool work.
const TRANSIENT_STATUS = new Set([408, 429, 500, 502, 503, 504]);
const TRANSPORT_CODES = new Set([
  'ECONNRESET', 'ECONNREFUSED', 'EPIPE', 'ETIMEDOUT', 'EAI_AGAIN',
  'ENETUNREACH', 'EHOSTUNREACH', 'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_SOCKET',
]);

export const transientStatus = (status, provider) => TRANSIENT_STATUS.has(status) || provider === 'anthropic' && status === 529;
// Only these observed machine-readable codes establish exhausted credits. A
// message mentioning quota, or an ordinary rate-limit code, does not qualify.
const HARD_QUOTA_CODES=new Set(['credit_balance_exhausted','insufficient_quota']);
export function hardQuotaCode(data) {
  for(const code of [data?.error?.code,data?.error?.type,data?.code,data?.type])if(HARD_QUOTA_CODES.has(code))return code;
  return null;
}
export const fallbackStatus=status=>[401,402,403,404,408,429].includes(status)||Number.isInteger(status)&&status>=500&&status<=599;
export function transientTransport(error) {
  // Native fetch wraps transport errors in cause. Unknown errors, permission,
  // certificate, malformed-URL and abort errors are intentionally not retried.
  if (error?.name === 'AbortError' || error?.name === 'TimeoutError') return false;
  return TRANSPORT_CODES.has(error?.code) || TRANSPORT_CODES.has(error?.cause?.code);
}

export function retryDelay(attempt, retryAfter, now = Date.now()) {
  const backoff = [1000, 3000][attempt - 1];
  if (backoff === undefined) return null;
  if (typeof retryAfter !== 'string' || retryAfter.length > 128) return backoff;
  const value = retryAfter.trim();
  let headerDelay;
  if (/^\d+$/.test(value)) headerDelay = Number(value) * 1000;
  // HTTP dates, unlike Date.parse's loose numeric inputs, carry an explicit GMT.
  else if (/GMT$/i.test(value)) headerDelay = Date.parse(value) - now;
  if (Number.isNaN(headerDelay) || headerDelay === undefined) return backoff;
  return Math.max(backoff, headerDelay);
}

export function abortableDelay(ms, signal) {
  return new Promise((resolve, reject) => {
    let timer;
    const abort = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); reject(signal?.reason); };
    if (signal?.aborted) { abort(); return; }
    timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve(); }, ms);
    signal?.addEventListener('abort', abort, { once: true });
  });
}

// Keep deadlines effective with injected transports/sleeps as well as fetch.
// The caller still checks the composed signal before every actual dispatch.
export function untilAborted(promise, signal, onLateValue) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const abort = () => { settled = true; signal.removeEventListener('abort', abort); reject(signal.reason); };
    if (signal.aborted) abort();
    else signal.addEventListener('abort', abort, { once: true });
    Promise.resolve(promise).then(value => {
      if (settled) { onLateValue?.(value); return; }
      settled = true; signal.removeEventListener('abort', abort); resolve(value);
    }, error => {
      if (settled) return;
      settled = true; signal.removeEventListener('abort', abort); reject(error);
    });
  });
}
