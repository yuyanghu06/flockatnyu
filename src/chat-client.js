export function safeSourceUrl(value) {
  try { const u = new URL(value); return ['http:', 'https:'].includes(u.protocol) ? u.href : null; } catch { return null; }
}
export function boundedMessages(messages) {
  const candidates = messages.filter(m => ['user', 'assistant'].includes(m.role) && typeof m.content === 'string' && m.content.trim()).slice(-20);
  const result = [];
  let chars = 0;
  const encoder = new TextEncoder();
  for (let i = candidates.length - 1; i >= 0; i--) {
    const message = { role: candidates[i].role, content: candidates[i].content.slice(0, 8000) };
    const proposed = [message, ...result];
    // Reserve room for building context, browser time zone and the JSON envelope.
    if (chars + message.content.length > 16000 || encoder.encode(JSON.stringify({ messages: proposed })).length > 32500) break;
    result.unshift(message);
    chars += message.content.length;
  }
  if (!result.length && candidates.length) {
    const last = candidates.at(-1);
    let content = last.content.slice(0, 8000);
    while (encoder.encode(JSON.stringify({ messages: [{ role: last.role, content }] })).length > 32500) content = content.slice(0, -100);
    result.push({ role: last.role, content });
  }
  return result;
}
const connectionMessage = 'The assistant API is unavailable. Check your connection and try again. For local development, run npm run dev to start the app and API together.';
function connectionError(error, signal) {
  return signal?.aborted || error?.name === 'AbortError'
    ? new DOMException('Stopped', 'AbortError') : new Error(connectionMessage);
}
function httpError(status) {
  if (status === 401 || status === 403) return new Error('Access denied. Member access is required to use the assistant.');
  if (status === 429) return new Error('The assistant is busy. Please wait a moment and try again.');
  return new Error(connectionMessage);
}
export async function getAssistantStatus({ signal, fetchImpl = fetch, timeoutMs = 8000 } = {}) {
  const controller = new AbortController();
  let timer, cancel;
  const interrupted = new Promise((_, reject) => {
    cancel = () => { controller.abort(); reject(new DOMException('Stopped', 'AbortError')); };
    if (signal?.aborted) cancel();
    else signal?.addEventListener('abort', cancel, { once: true });
    const duration = Number.isFinite(timeoutMs) ? Math.min(30000, Math.max(1, timeoutMs)) : 8000;
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error('The connection check timed out. Try again. For local development, run npm run dev to start the app and API together.'));
    }, duration);
  });
  const check = async () => {
    let r;
    try { r = await fetchImpl('/api/status', { signal: controller.signal, headers: { Accept: 'application/json' }, cache: 'no-store' }); }
    catch (error) { throw connectionError(error, controller.signal); }
    if (!r.ok) throw httpError(r.status);
    let d;
    try { d = await r.json(); } catch { throw new Error(connectionMessage); }
    if (typeof d?.chat?.configured !== 'boolean' || typeof d?.access?.allowed !== 'boolean') throw new Error('The assistant API returned an invalid status.');
    return d;
  };
  try { return await Promise.race([interrupted, check()]); }
  finally { clearTimeout(timer); signal?.removeEventListener('abort', cancel); }
}
// Read at send time so travel or an OS/browser zone change affects the next chat.
// UTC is the explicit fallback when the browser cannot report its local zone.
export function browserTimeZone() {
  try {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return typeof timeZone === 'string' && timeZone.length > 0 && timeZone.length <= 100 ? timeZone : 'UTC';
  } catch { return 'UTC'; }
}
// EOF never counts as successful completion.
export async function streamAssistant({ messages, buildingId, signal, onEvent = () => {}, fetchImpl = fetch }) {
  const body = { messages: boundedMessages(messages), timeZone: browserTimeZone() };
  if (typeof buildingId === 'string' && buildingId) body.buildingId = buildingId;
  let r;
  try { r = await fetchImpl('/api/chat', { method: 'POST', signal, headers: { 'Content-Type': 'application/json', Accept: 'application/x-ndjson' }, body: JSON.stringify(body) }); }
  catch (error) { throw connectionError(error, signal); }
  if (!r.ok) {
    if ([401, 403, 429, 500, 502, 504].includes(r.status)) throw httpError(r.status);
    let detail;
    try { const d = await r.json(); detail = d?.error?.message ?? d?.message; } catch { /* Report HTTP status. */ }
    throw new Error(typeof detail === 'string' ? detail.slice(0, 1000) : connectionMessage);
  }
  if (!r.headers.get('content-type')?.toLowerCase().includes('application/x-ndjson') || !r.body) throw new Error('The assistant API did not return a reply stream.');
  const reader = r.body.getReader(), decoder = new TextDecoder();
  let pending = '', reply = '', done = false;
  function line(value) {
    if (!value.trim()) return;
    let event;
    try { event = JSON.parse(value); } catch { throw new Error('The reply stream contained invalid data.'); }
    if (!event || typeof event !== 'object') throw new Error('The reply stream contained invalid data.');
    if (event.type === 'error') throw new Error(typeof event.message === 'string' ? event.message.slice(0, 1000) : 'The assistant could not finish this reply.');
    if (event.type === 'delta') {
      if (typeof event.text !== 'string') throw new Error('The reply stream contained invalid text.');
      reply += event.text;
      if (reply.length > 150000) throw new Error('The reply exceeded the supported length.');
    } else if (event.type === 'done') done = true;
    else if (event.type !== 'meta') throw new Error('The reply stream contained an unknown event.');
    onEvent(event);
  }
  try {
    while (!done) {
      if (signal?.aborted) throw new DOMException('Stopped', 'AbortError');
      let chunk;
      try { chunk = await reader.read(); } catch (error) { throw connectionError(error, signal); }
      pending += decoder.decode(chunk.value, { stream: !chunk.done });
      if (pending.length > 1000000) throw new Error('The reply stream exceeded the supported size.');
      let split;
      while (!done && (split = pending.indexOf('\n')) >= 0) { line(pending.slice(0, split)); pending = pending.slice(split + 1); }
      if (chunk.done) { if (!done && pending.trim()) line(pending); break; }
    }
    if (!done) throw new Error('The connection ended before the reply finished. You can try again.');
    return reply;
  } finally { try { await reader.cancel(); } catch { /* Preserve request error. */ } reader.releaseLock(); }
}
