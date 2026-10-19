import {randomUUID} from 'node:crypto';
import {ProviderError} from './providers/index.js';
import {createTimeContext} from './time-zone.js';
import {retrieveAssistantContext,assistantAnswerPrompt} from './assistant-context.js';
import {validateChatRequestContext} from './chat-request-context.js';
import {attachmentErrors} from './chat-attachments.js';
import {validateDiscordRecentContext,validateDiscordUsers} from './chat-discord-context.js';

const errors = {
  ...attachmentErrors,
  access_denied:'Access is not enabled for this request.', invalid_request:'Send a valid, bounded chat conversation.',
  not_configured:'The assistant model is not configured yet.', timeout:'The assistant request timed out. Please try again.',
  aborted:'The request was cancelled.', provider_unavailable:'The assistant provider is unavailable. Please try again.',
  invalid_provider_response:'The assistant returned an invalid response.', incomplete_provider_response:'The assistant response was interrupted.',
};
const errorRecord = code => ({type:'error',code,message:errors[code] || errors.provider_unavailable});
function validConversation(value) {
  if (!value || !Array.isArray(value.messages) || !value.messages.length || value.messages.length > 20
    || value.messages.at(-1)?.role !== 'user'
    || value.buildingId !== undefined && (typeof value.buildingId !== 'string' || !/^[a-z0-9-]{1,80}$/.test(value.buildingId))) return false;
  let length = 0;
  for (const message of value.messages) {
    if (!message || !['user','assistant'].includes(message.role) || typeof message.content !== 'string'
      || !message.content.trim() || message.content.length > 8000) return false;
    length += message.content.length;
  }
  const textBytes = Buffer.byteLength(JSON.stringify({messages:value.messages.map(({role,content})=>({role,content}))}));
  return length <= 16000 && textBytes <= 32500;
}
// Shared request execution for the website and trusted Discord transport. This
// does not authorize a transport; callers construct the principal server-side.
export function createChatRunner({config,provider,audit,liveDiscordTools,googleTools,miroTools,bugReportTools,memoryTools,mapTools,now=()=>new Date()}) {
  return {async run({conversation,principal,requestContext,discordContext,discordUsers,signal,onRecord=()=>{}}) {
    const send = record => onRecord(record);
    const reject = code => { send(errorRecord(code)); return {status:'failed',code}; };
    if (!principal?.id || !Array.isArray(principal.allowedSourceIds)) return reject('access_denied');
    if (!validConversation(conversation)) return reject('invalid_request');
    try {
      requestContext = validateChatRequestContext(requestContext);
      discordContext = validateDiscordRecentContext(discordContext,requestContext);
      discordUsers = validateDiscordUsers(discordUsers,requestContext);
    }
    catch { return reject('invalid_request'); }
    const timeContext = createTimeContext({timeZone:conversation.timeZone,now:now()});
    if (!timeContext) return reject('invalid_request');
    if (!config.configured) return reject('not_configured');
    if (config.provider === 'anthropic' && conversation.messages.some(message=>message.attachments?.length)) return reject('attachments_provider_unsupported');
    const auditContext = {agent:'chat',runId:randomUUID()}, started = performance.now();
    const auditEvent = async event => {
      try { await audit?.recordEvent({eventId:randomUUID(),context:auditContext,...event}); }
      catch { /* Provider dispatch independently enforces durable model logging. */ }
    };
    const abort = new AbortController(); let timedOut = false, cancelled = signal?.aborted === true;
    const disconnect = () => { cancelled = true; abort.abort(); };
    signal?.addEventListener('abort',disconnect,{once:true});
    let abortListener;
    const aborted = new Promise((_,reject) => {
      abortListener = () => reject(new ProviderError(timedOut?'timeout':'aborted'));
      abort.signal.addEventListener('abort',abortListener,{once:true});
    });
    // A rejection can precede the first raced adapter if cancellation occurs
    // during operational audit I/O. Attach a handler immediately.
    void aborted.catch(()=>{});
    const wait = promise => Promise.race([promise,aborted]);
    const timeout = setTimeout(()=>{timedOut=true;abort.abort();},config.requestTimeoutMs ?? config.timeoutMs);
    let status = 'failed', code;
    try {
      await auditEvent({kind:'run_started',status:'started',counts:{messages:conversation.messages.length}});
      if (cancelled || signal?.aborted) disconnect();
      if (abort.signal.aborted) throw new ProviderError(timedOut?'timeout':'aborted');
      const retrieval = await wait(retrieveAssistantContext({messages:conversation.messages,principal,provider,
        liveTools:liveDiscordTools,googleTools,miroTools,bugReportTools,memoryTools,mapTools,buildingId:conversation.buildingId,
        signal:abort.signal,timeContext,requestContext,discordContext,discordUsers,planning:config.retrievalToolsEnabled!==false,
        auditContext,onAuditEvent:auditEvent,onToolEvent:event=>{if(!abort.signal.aborted)send(event);} }));
      const sources = retrieval.sources;
      send({type:'meta',sources,timeZone:timeContext.timeZone,now:timeContext.now,knowledgeStatus:retrieval.status,
        retrieval:retrieval.results.map(result=>({tool:result.tool,status:result.status,coverage:result.coverage}))});
      const iterator = provider.stream({messages:conversation.messages,
        system:assistantAnswerPrompt({sources,results:retrieval.results,memory:retrieval.memory,timeContext,requestContext,discordContext,discordUsers}),
        signal:abort.signal,timeContext,auditContext})[Symbol.asyncIterator]();
      let outputLength = 0;
      try {
        while (true) {
          const {value,done} = await wait(iterator.next());
          if (done) break;
          if (typeof value !== 'string' || (outputLength += value.length) > 100000) throw new ProviderError('invalid_provider_response');
          if (value) send({type:'delta',text:value});
        }
      } finally {
        abort.abort();
        // Some injected adapters have no return() or return synchronously.
        try { void Promise.resolve(iterator.return?.()).catch(()=>{}); } catch {}
      }
      send({type:'done'}); status='succeeded';
    } catch (error) {
      status = timedOut?'timeout':cancelled?'aborted':'failed';
      code = timedOut?'timeout':cancelled?'aborted':error instanceof ProviderError && errors[error.code]?error.code:'provider_unavailable';
      send(errorRecord(code));
    } finally {
      clearTimeout(timeout); abort.abort();
      abort.signal.removeEventListener('abort',abortListener);
      signal?.removeEventListener('abort',disconnect);
      await auditEvent({kind:'run_finished',status,durationMs:Math.round(performance.now()-started)});
    }
    return {status,...(code?{code}:{}),runId:auditContext.runId};
  }};
}
