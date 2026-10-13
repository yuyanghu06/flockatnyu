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
    // Leave space for the optional building context and JSON request envelope.
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
export async function getAssistantStatus({ signal, fetchImpl = fetch } = {}) {
  const r = await fetchImpl('/api/status', { signal, headers: { Accept: 'application/json' }, cache: 'no-store' });
  if (!r.ok) throw new Error('Assistant status is unavailable (HTTP ' + r.status + ').');
  let d;
  try { d = await r.json(); } catch { throw new Error('The assistant API is unavailable here. Start the configured application server.'); }
  if (typeof d?.chat?.configured !== 'boolean' || typeof d?.access?.allowed !== 'boolean') throw new Error('The assistant API returned an invalid status.');
  return d;
}
// EOF never counts as successful completion.
export async function streamAssistant({ messages, buildingId, signal, onEvent = () => {}, fetchImpl = fetch }) {
  const body = { messages: boundedMessages(messages) };
  if (typeof buildingId === 'string' && buildingId) body.buildingId = buildingId;
  const r = await fetchImpl('/api/chat', { method: 'POST', signal, headers: { 'Content-Type': 'application/json', Accept: 'application/x-ndjson' }, body: JSON.stringify(body) });
  if (!r.ok) {
    let detail;
    try { const d = await r.json(); detail = d?.error?.message ?? d?.message; } catch { /* Report HTTP status. */ }
    throw new Error(typeof detail === 'string' ? detail.slice(0, 1000) : 'The assistant request failed (HTTP ' + r.status + ').');
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
      const chunk = await reader.read();
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
