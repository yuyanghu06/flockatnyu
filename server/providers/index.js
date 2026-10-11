export class ProviderError extends Error {
  constructor(code = 'provider_unavailable') { super(code); this.code = code; }
}

// Incremental SSE parsing tolerates network chunk and CRLF boundaries, but bounds
// each event. Never return upstream error bodies or credentials to the caller.
export async function* parseSSE(body, signal) {
  if (!body) throw new ProviderError('invalid_provider_response');
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '', data = [], event = '', size = 0;
  const abort = () => { void reader.cancel().catch(() => {}); };
  signal?.addEventListener('abort', abort, { once: true });
  try {
    while (true) {
      if (signal?.aborted) throw new ProviderError('aborted');
      const { value, done } = await reader.read();
      if (signal?.aborted) throw new ProviderError('aborted');
      buffer += decoder.decode(value, { stream: !done });
      if (buffer.length > 262144) throw new ProviderError('invalid_provider_response');
      let newline;
      while ((newline = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newline).replace(/\r$/, '');
        buffer = buffer.slice(newline + 1);
        size += line.length;
        if (size > 262144) throw new ProviderError('invalid_provider_response');
        if (!line) {
          if (data.length) yield { event, data: data.join('\n') };
          data = []; event = ''; size = 0;
        } else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
        else if (line.startsWith('event:')) event = line.slice(6).trim();
      }
      if (done) break;
    }
    if (buffer.trim() || data.length) throw new ProviderError('incomplete_provider_response');
  } finally {
    signal?.removeEventListener('abort', abort);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export function createProvider(config, { fetchImpl = fetch } = {}) {
  return {
    async *stream({ messages, system, signal }) {
      if (!config.configured) throw new ProviderError('not_configured');
      const anthropic = config.provider === 'anthropic';
      const body = anthropic
        ? { model: config.model, system, messages, max_tokens: 2048, stream: true }
        : { model: config.model, messages: [{ role: 'system', content: system }, ...messages], stream: true, store: false };
      let response;
      try {
        response = await fetchImpl(`${config.baseUrl.replace(/\/$/, '')}/${anthropic ? 'messages' : 'chat/completions'}`, {
          method: 'POST', signal, redirect: 'error',
          headers: { 'content-type': 'application/json', accept: 'text/event-stream',
            ...(anthropic ? { 'x-api-key': config.apiKey, 'anthropic-version': '2023-06-01' } : { authorization: `Bearer ${config.apiKey}` }) },
          body: JSON.stringify(body),
        });
      } catch { throw new ProviderError(signal?.aborted ? 'aborted' : 'provider_unavailable'); }
      if (!response.ok) { await response.body?.cancel(); throw new ProviderError('provider_unavailable'); }
      if (!response.headers.get('content-type')?.includes('text/event-stream')) {
        await response.body?.cancel(); throw new ProviderError('invalid_provider_response');
      }
      let finished = false, started = false;
      for await (const frame of parseSSE(response.body, signal)) {
        if (!anthropic && frame.data === '[DONE]') {
          if (!finished) throw new ProviderError('incomplete_provider_response');
          return;
        }
        let chunk;
        try { chunk = JSON.parse(frame.data); } catch { throw new ProviderError('invalid_provider_response'); }
        if (!chunk || typeof chunk !== 'object' || chunk.error || chunk.type === 'error') throw new ProviderError('provider_unavailable');
        if (anthropic) {
          if (frame.event && frame.event !== chunk.type) throw new ProviderError('invalid_provider_response');
          if (chunk.type === 'message_start') started = true;
          if (chunk.type === 'message_delta' && chunk.delta?.stop_reason) {
            if (!['end_turn', 'stop_sequence'].includes(chunk.delta.stop_reason)) throw new ProviderError('incomplete_provider_response');
            finished = true;
          }
          if (chunk.type === 'message_stop') {
            if (!started || !finished) throw new ProviderError('incomplete_provider_response');
            return;
          }
          if (chunk.type === 'content_block_delta' && chunk.delta?.type === 'text_delta') {
            if (!started || typeof chunk.delta.text !== 'string') throw new ProviderError('invalid_provider_response');
            yield chunk.delta.text;
          }
        } else {
          if (!Array.isArray(chunk.choices)) throw new ProviderError('invalid_provider_response');
          for (const choice of chunk.choices) {
            if (choice.index !== 0) continue;
            if (choice.finish_reason) {
              if (choice.finish_reason !== 'stop') throw new ProviderError('incomplete_provider_response');
              finished = true;
            }
            const content = choice.delta?.content;
            if (content != null && typeof content !== 'string') throw new ProviderError('invalid_provider_response');
            if (content) yield content;
          }
        }
      }
      throw new ProviderError('incomplete_provider_response');
    },
  };
}
