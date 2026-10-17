import { Hono } from 'hono';
import { createGmailPushDiagnostics } from './subscription.js';

export function createGmailSubscriptionApp({ subscription, maxBodyBytes = 16384, signal: lifetimeSignal, onDiagnostic } = {}) {
  if (!subscription?.handlePush) throw new Error('invalid_subscription_app');
  const diagnose = createGmailPushDiagnostics(onDiagnostic);
  const app = new Hono();
  app.get('/healthz', c => c.json({ status: 'ready', service: 'gmail-subscription' }));
  app.post('/webhooks/gmail', async c => {
    const request = c.req.raw;
    if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') || '')) { diagnose('http_content_type'); return c.json({ status: 'invalid_push' }, 400); }
    if (Number(request.headers.get('content-length')) > maxBodyBytes) { diagnose('http_body_too_large'); return c.json({ status: 'payload_too_large' }, 413); }
    const reader = request.body?.getReader();
    if (!reader) { diagnose('http_body_missing'); return c.json({ status: 'invalid_push' }, 400); }
    const chunks = [];
    let bytes = 0;
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(65000), ...(lifetimeSignal ? [lifetimeSignal] : [])]);
    const abort = () => { void reader.cancel().catch(() => {}); };
    signal.addEventListener('abort', abort, { once: true });
    let body;
    try {
      while (true) {
        if (signal.aborted) { diagnose('http_body_aborted'); return c.json({ status: 'aborted' }, 503); }
        const { value, done } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > maxBodyBytes) { diagnose('http_body_too_large'); return c.json({ status: 'payload_too_large' }, 413); }
        chunks.push(value);
      }
      body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch { diagnose('http_json_invalid'); return c.json({ status: 'invalid_push' }, 400); }
    finally { signal.removeEventListener('abort', abort); await reader.cancel().catch(() => {}); reader.releaseLock(); }
    try {
      const result = await subscription.handlePush({ authorization: request.headers.get('authorization'), body, signal });
      const status = ['ready', 'duplicate'].includes(result?.status) ? 200 : result?.status === 'unauthorized' ? 401
        : result?.status === 'account_mismatch' ? 403 : result?.status === 'invalid_push' ? 400 : 503;
      // Only expose enumerated status/counts, never upstream errors or content.
      return c.json({ status: result?.status || 'unavailable', ...(Number.isSafeInteger(result?.queued) ? { queued: result.queued } : {}) }, status);
    } catch { return c.json({ status: 'unavailable' }, 503); }
  });
  app.onError((_error, c) => c.json({ status: 'unavailable' }, 503));
  return app;
}
