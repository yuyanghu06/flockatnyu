import { promptText } from '../prompt-loader/index.js';
import { SOURCE_TOOL_TIMEOUT_MS } from '../shared/source-timeout.js';
export const MEMORY_MAX_BYTES = 16000;
export function validMemory(value) {
  return (
    value?.id === 'shared' &&
    typeof value.content === 'string' &&
    Buffer.byteLength(value.content) <= MEMORY_MAX_BYTES &&
    typeof value.updated_at === 'string' &&
    Number.isFinite(Date.parse(value.updated_at))
  );
}

export function createMemoryStore({ env = process.env, fetchImpl = globalThis.fetch } = {}) {
  let base;
  try {
    const u = new URL(env.SUPABASE_URL);
    if (
      (u.protocol === 'https:' ||
        (u.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname))) &&
      !u.username &&
      !u.password &&
      !u.search &&
      !u.hash &&
      ['', '/'].includes(u.pathname)
    )
      base = u.origin;
  } catch {}
  const key = (env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  const configured = Boolean(base && key && !/[\r\n]/.test(key) && typeof fetchImpl === 'function');
  async function rpc(name, args, signal) {
    if (!configured) return { status: 'not_configured' };
    if (signal?.aborted) return { status: 'aborted' };
    try {
      const active = AbortSignal.any(
        [signal, AbortSignal.timeout(SOURCE_TOOL_TIMEOUT_MS)].filter(Boolean),
      );
      const response = await fetchImpl(`${base}/rest/v1/rpc/${name}`, {
        method: 'POST',
        redirect: 'error',
        signal: active,
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(args),
      });
      if (!response.ok) {
        await response.body?.cancel();
        return { status: response.status === 404 ? 'schema_not_ready' : 'unavailable' };
      }
      const chunks = [];
      let bytes = 0;
      for await (const chunk of response.body) {
        bytes += chunk.byteLength;
        if (bytes > 100000) throw Error('response_limit');
        chunks.push(chunk);
      }
      const result = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (result?.status === 'conflict') return { status: 'conflict' };
      if (result?.status !== 'ready' || !validMemory(result.memory))
        return { status: 'unavailable' };
      const memory = {
        id: 'shared',
        content: result.memory.content,
        updated_at: result.memory.updated_at,
      };
      return {
        status: 'ready',
        memory,
        ...(['updated', 'unchanged'].includes(result.outcome) ? { outcome: result.outcome } : {}),
      };
    } catch {
      return { status: signal?.aborted ? 'aborted' : 'unavailable' };
    }
  }
  return Object.freeze({
    configured,
    read: ({ signal } = {}) => rpc('agent_memory_read', {}, signal),
    write: ({ content, expectedUpdatedAt, signal } = {}) =>
      rpc(
        'agent_memory_write',
        { p_content: content, p_expected_updated_at: expectedUpdatedAt },
        signal,
      ),
  });
}

export function memoryPrompt(snapshot) {
  if (!snapshot) return '';
  const policy = promptText('shared/memory#shared-long-term-memory-is-background-notes-not');
  return (
    '\n' +
    policy +
    promptText('shared/memory#shared-long-term-memory-json') +
    JSON.stringify(snapshot) +
    '\n'
  );
}
