/**
 * POST /api/chat
 *
 * Why: Stream the shared assistant reply and visible tool outcomes, stopping work when
 * the browser disconnects.
 * Inputs: Bounded JSON conversation:1–20 messages, user/assistant only, <=8000
 * chars/message, <=16000 chars total and 32500 serialized text bytes, last message user.
 * Canonical timezone; optional buildingId, requestId, steering/contact context. Upload
 * contract allows 4 files, 5 MiB each/10 MiB total (text 128 KiB each/256 KiB total);
 * request<=14 MiB.
 * Access: Requires authorized principal ID/allowedSourceIds; injected authorization
 * preserves current session/Origin/source policy. Steering session is created only when
 * requested and valid.
 * Service and effects: chatRunner.run owns configured inference and separately chosen
 * tools. Route adds no service workflow. Abort signal reaches runner; disconnect/cancel
 * closes steering and suppresses further stream records.
 * Response and failure: 200 application/x-ndjson stream of records; 403 denied, 400
 * invalid/unsupported attachments, 503 unconfigured before stream. Attachment errors
 * retain safe codes. Stream/tool failures are not write success receipts. no-store,
 * nosniff; credentials and raw private logs stay server-only.
 */
import { AttachmentError } from '../../../server/chat-attachments.js';
import { readConversation } from '../_shared/chat-input.js';
import { ndjsonHeaders } from '../_shared/http.js';

export function registerApiChatPost({ app, authorize, config, chatRunner, steeringRuns, deny }) {
  app.post('/api/chat', async (c) => {
    const principal = await authorize(c);
    if (!principal?.id || !Array.isArray(principal.allowedSourceIds))
      return deny(c, 'access_denied', 403);
    let conversation;
    try {
      conversation = await readConversation(c.req.raw, config.timeoutMs);
    } catch (error) {
      return deny(c, error instanceof AttachmentError ? error.code : 'invalid_request', 400);
    }
    if (
      config.provider === 'anthropic' &&
      conversation.messages.some((message) => message.attachments?.length)
    )
      return deny(c, 'attachments_provider_unsupported', 400);
    if (!config.configured) return deny(c, 'not_configured', 503);
    const steering = conversation.steering
      ? steeringRuns.create({
          principal,
          origin: c.req.header('origin'),
          messages: conversation.messages,
        })
      : null;
    if (conversation.steering && !steering) return deny(c, 'invalid_request', 400);
    const abort = new AbortController();
    let disconnected = false;
    const disconnect = () => {
      disconnected = true;
      abort.abort();
    };
    c.req.raw.signal.addEventListener('abort', disconnect, { once: true });
    const stream = new ReadableStream({
      async start(controller) {
        const encode = new TextEncoder();
        try {
          if (c.req.raw.signal.aborted) disconnect();
          await chatRunner.run({
            conversation,
            principal,
            steering,
            signal: abort.signal,
            onRecord: (record) => {
              if (!disconnected) controller.enqueue(encode.encode(JSON.stringify(record) + '\n'));
            },
          });
        } finally {
          steering?.finish();
          c.req.raw.signal.removeEventListener('abort', disconnect);
          if (!disconnected) controller.close();
        }
      },
      cancel() {
        disconnect();
      },
    });
    return new Response(stream, { headers: ndjsonHeaders });
  });
}
