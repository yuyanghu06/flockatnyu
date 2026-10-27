import { validUuid } from '../automation/validation.js';
import {
  contactContextOfMessage,
  contactTextMessages,
  contactMessagesForModel,
} from './contact-context.js';
import { randomUUID } from 'node:crypto';
import { ProviderError } from '../providers/index.js';
import { createTimeContext } from '../shared/time-zone.js';
import { retrieveAssistantContext, assistantAnswerPrompt } from './context.js';
import { validateChatRequestContext } from './request-context.js';
import { attachmentErrors } from './attachments.js';
import { validateDiscordRecentContext, validateDiscordUsers } from './discord-context.js';

const errors = {
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
const errorRecord = (code) => ({
  type: 'error',
  code,
  message: errors[code] || errors.provider_unavailable,
});
function validConversation(value) {
  if (
    !value ||
    !Array.isArray(value.messages) ||
    !value.messages.length ||
    value.messages.length > 20 ||
    value.messages.at(-1)?.role !== 'user' ||
    (value.requestId !== undefined && !validUuid(value.requestId)) ||
    (value.buildingId !== undefined &&
      (typeof value.buildingId !== 'string' || !/^[a-z0-9-]{1,80}$/.test(value.buildingId)))
  )
    return false;
  let length = 0;
  for (const message of value.messages) {
    if (
      !message ||
      !['user', 'assistant'].includes(message.role) ||
      typeof message.content !== 'string' ||
      !message.content.trim() ||
      message.content.length > 8000
    )
      return false;
    try {
      contactContextOfMessage(message);
    } catch {
      return false;
    }
    length += message.content.length;
  }
  const textBytes = Buffer.byteLength(
    JSON.stringify({ messages: contactTextMessages(value.messages) }),
  );
  return length <= 16000 && textBytes <= 32500;
}
// Shared request execution for the website and trusted Discord transport. This
// does not authorize a transport; callers construct the principal server-side.
export function createChatRunner({
  config,
  provider,
  audit,
  liveDiscordTools,
  googleTools,
  gmailSendTools,
  miroTools,
  bugReportTools,
  memoryTools,
  contactsTools,
  tregTools,
  mapTools,
  attioTools,
  discordDraftTools,
  now = () => new Date(),
}) {
  return {
    async run({
      conversation,
      principal,
      requestContext,
      discordContext,
      discordUsers,
      steering,
      signal,
      onRecord = () => {},
    }) {
      const send = (record) => onRecord(record);
      const reject = (code) => {
        send(errorRecord(code));
        return { status: 'failed', code };
      };
      if (!principal?.id || !Array.isArray(principal.allowedSourceIds))
        return reject('access_denied');
      if (!validConversation(conversation)) return reject('invalid_request');
      try {
        requestContext = validateChatRequestContext(requestContext);
        discordContext = validateDiscordRecentContext(discordContext, requestContext);
        discordUsers = validateDiscordUsers(discordUsers, requestContext);
      } catch {
        return reject('invalid_request');
      }
      const timeContext = createTimeContext({ timeZone: conversation.timeZone, now: now() });
      if (!timeContext) return reject('invalid_request');
      if (!config.configured) return reject('not_configured');
      if (
        config.provider === 'anthropic' &&
        conversation.messages.some((message) => message.attachments?.length)
      )
        return reject('attachments_provider_unsupported');
      const auditContext = { agent: 'chat', runId: steering?.runId ?? randomUUID() },
        started = performance.now();
      const auditEvent = async (event) => {
        try {
          await audit?.recordEvent({ eventId: randomUUID(), context: auditContext, ...event });
        } catch {
          /* Provider dispatch independently enforces durable model logging. */
        }
      };
      const abort = new AbortController();
      let timedOut = false,
        cancelled = signal?.aborted === true;
      const disconnect = () => {
        cancelled = true;
        abort.abort();
      };
      signal?.addEventListener('abort', disconnect, { once: true });
      let abortListener;
      const aborted = new Promise((_, reject) => {
        abortListener = () => reject(new ProviderError(timedOut ? 'timeout' : 'aborted'));
        abort.signal.addEventListener('abort', abortListener, { once: true });
      });
      // A rejection can precede the first raced adapter if cancellation occurs
      // during operational audit I/O. Attach a handler immediately.
      void aborted.catch(() => {});
      const wait = (promise) => Promise.race([promise, aborted]);
      const timeout = setTimeout(() => {
        timedOut = true;
        abort.abort();
      }, config.requestTimeoutMs ?? config.timeoutMs);
      let status = 'failed',
        code;
      try {
        await auditEvent({
          kind: 'run_started',
          status: 'started',
          counts: { messages: conversation.messages.length },
        });
        if (cancelled || signal?.aborted) disconnect();
        if (abort.signal.aborted) throw new ProviderError(timedOut ? 'timeout' : 'aborted');
        // One mutable conversation and one retrieval closure live for this run.
        // Steering changes user input, not execution ownership, receipts or budgets.
        const messages = steering ? structuredClone(conversation.messages) : conversation.messages;
        if (steering) {
          steering.bind(send);
          send({ type: 'run', runId: steering.runId, steeringToken: steering.steeringToken });
        }
        let retrieval = await wait(
          retrieveAssistantContext({
            messages,
            principal,
            provider,
            liveTools: liveDiscordTools,
            googleTools,
            gmailSendTools,
            requestId: conversation.requestId?.toLowerCase(),
            miroTools,
            bugReportTools,
            memoryTools,
            contactsTools,
            tregTools,
            mapTools,
            attioTools,
            discordDraftTools,
            buildingId: conversation.buildingId,
            signal: abort.signal,
            steering,
            timeContext,
            requestContext,
            discordContext,
            discordUsers,
            planning: config.retrievalToolsEnabled !== false,
            auditContext,
            onAuditEvent: auditEvent,
            onToolEvent: (event) => {
              if (!abort.signal.aborted) send(event);
            },
          }),
        );
        let outputLength = 0,
          answerVersion = 0;
        const reset = () => send({ type: 'reset', answerVersion: ++answerVersion });
        while (true) {
          if (steering?.hasPending()) retrieval = await wait(retrieval.resume());
          const currentTime = retrieval.timeContext ?? timeContext,
            sources = retrieval.sources;
          send({
            type: 'meta',
            sources,
            timeZone: currentTime.timeZone,
            now: currentTime.now,
            knowledgeStatus: retrieval.status,
            retrieval: retrieval.results.map((result) => ({
              tool: result.tool,
              status: result.status,
              coverage: result.coverage,
            })),
          });
          const answerAbort = new AbortController(),
            parentAbort = () => answerAbort.abort();
          abort.signal.addEventListener('abort', parentAbort, { once: true });
          if (abort.signal.aborted) parentAbort();
          const superseded = Symbol('steering');
          let answering = true,
            interrupted = false;
          const changed = steering?.waitForInput().then(() => {
            if (answering) answerAbort.abort();
            return superseded;
          });
          const answerStream = provider.stream({
            messages: contactMessagesForModel(messages),
            system: assistantAnswerPrompt({
              sources,
              results: retrieval.results,
              toolCapabilities: retrieval.toolCapabilities,
              memory: retrieval.memory,
              timeContext: currentTime,
              requestContext,
              discordContext,
              discordUsers,
            }),
            signal: answerAbort.signal,
            timeContext: currentTime,
            auditContext,
          });
          const iterator = answerStream[Symbol.asyncIterator]();
          try {
            while (true) {
              const next = wait(iterator.next()),
                step = changed ? await Promise.race([next, changed]) : await next;
              if (step === superseded) {
                interrupted = true;
                break;
              }
              const { value, done } = step;
              if (done) break;
              if (typeof value !== 'string' || (outputLength += value.length) > 100000)
                throw new ProviderError('invalid_provider_response');
              if (value) send({ type: 'delta', text: value });
            }
          } catch (error) {
            if (steering?.hasPending() && !abort.signal.aborted) interrupted = true;
            else throw error;
          } finally {
            answering = false;
            answerAbort.abort();
            abort.signal.removeEventListener('abort', parentAbort);
            try {
              void Promise.resolve(iterator.return?.()).catch(() => {});
            } catch {}
          }
          if (interrupted || steering?.hasPending()) {
            reset();
            retrieval = await wait(retrieval.resume());
            continue;
          }
          // Closing admission and checking the inbox are synchronous. No accepted
          // message can disappear between the final empty check and done.
          if (steering && !steering.closeIfEmpty()) {
            reset();
            retrieval = await wait(retrieval.resume());
            continue;
          }
          send({ type: 'done' });
          status = 'succeeded';
          break;
        }
      } catch (error) {
        status = timedOut ? 'timeout' : cancelled ? 'aborted' : 'failed';
        code = timedOut
          ? 'timeout'
          : cancelled
            ? 'aborted'
            : error instanceof ProviderError && errors[error.code]
              ? error.code
              : 'provider_unavailable';
        send(errorRecord(code));
      } finally {
        steering?.finish();
        clearTimeout(timeout);
        abort.abort();
        abort.signal.removeEventListener('abort', abortListener);
        signal?.removeEventListener('abort', disconnect);
        await auditEvent({
          kind: 'run_finished',
          status,
          durationMs: Math.round(performance.now() - started),
        });
      }
      return { status, ...(code ? { code } : {}), runId: auditContext.runId };
    },
  };
}
