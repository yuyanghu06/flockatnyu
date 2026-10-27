import { ATTACHMENT_ONLY_CONTENT, AttachmentError, attachmentBudget, normalizeAttachments, MAX_CHAT_BODY_BYTES } from './chat-attachments.js';
export function safeSourceUrl(value) {
  try { const u = new URL(value); return ['http:', 'https:'].includes(u.protocol) ? u.href : null; } catch { return null; }
}
// A selected saved contact is a bounded selector, never a copied profile.
export function normalizeContactContext(value) {
  if (value === undefined) return undefined;
  const keys = ['id', 'first_name', 'last_name'];
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== keys.length
    || !keys.every(key => Object.hasOwn(value, key))
    || typeof value.id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.id)
    || !keys.slice(1).every(key => typeof value[key] === 'string' && value[key].length <= 200 && !value[key].includes('\0'))) {
    throw new Error('This contact cannot be added to the message.');
  }
  return { id: value.id.toLowerCase(), first_name: value.first_name, last_name: value.last_name };
}
const selectedContact = message => {
  if (message.contactContext !== undefined && message.role !== 'user') throw new Error('Contact context belongs to user messages only.');
  const contactContext = normalizeContactContext(message.contactContext);
  return contactContext === undefined ? {} : { contactContext };
};
export function boundedMessages(messages) {
  const candidates = messages.filter(m => ['user', 'assistant'].includes(m.role) && typeof m.content === 'string' && (m.content.trim() || m.role === 'user' && m.attachments?.length)).slice(-20);
  const result = [];
  let chars = 0, budget = attachmentBudget();
  const encoder = new TextEncoder();
  for (let i = candidates.length - 1; i >= 0; i--) {
    const candidate = candidates[i];
    if (candidate.attachments !== undefined && candidate.role !== 'user') throw new AttachmentError();
    const proposedBudget = { ...budget };
    let attachments;
    try { attachments = normalizeAttachments(candidate.attachments, proposedBudget); }
    catch (error) { if (result.length && error.code === 'attachment_total') break; throw error; }
    const message = { role: candidate.role, content: candidate.content.slice(0, 8000) || ATTACHMENT_ONLY_CONTENT, ...(attachments.length ? { attachments } : {}), ...selectedContact(candidate) };
    const proposed = [message, ...result];
    const textOnly = proposed.map(({ role, content, contactContext }) => ({ role, content, ...(contactContext ? { contactContext } : {}) }));
    if (chars + message.content.length > 16000 || encoder.encode(JSON.stringify({ messages: textOnly })).length > 32500 || encoder.encode(JSON.stringify({ messages: proposed })).length > MAX_CHAT_BODY_BYTES - 512) break;
    result.unshift(message); chars += message.content.length; budget = proposedBudget;
  }
  if (!result.length && candidates.length) {
    const last = candidates.at(-1);
    let content = last.content.slice(0, 8000) || ATTACHMENT_ONLY_CONTENT;
    const context = selectedContact(last);
    while (encoder.encode(JSON.stringify({ messages: [{ role: last.role, content, ...context }] })).length > 32500) content = content.slice(0, -100);
    const attachments = normalizeAttachments(last.attachments);
    result.push({ role: last.role, content, ...(attachments.length ? { attachments } : {}), ...context });
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
export async function streamAssistant({ messages, buildingId, requestId, signal, onEvent = () => {}, fetchImpl = fetch }) {
  if (requestId !== undefined && (typeof requestId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId))) throw new Error('Invalid chat request ID.');
  const body = { ...(requestId === undefined ? {} : { requestId: requestId.toLowerCase() }), messages: boundedMessages(messages), timeZone: browserTimeZone(), steering:true };
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
  let pending = '', reply = '', done = false, run, answerVersion=0, outputLength=0;
  const toolCalls = new Map(), steeringMessages=new Map();
  function line(value) {
    if (!value.trim()) return;
    let event;
    try { event = JSON.parse(value); } catch { throw new Error('The reply stream contained invalid data.'); }
    if (!event || typeof event !== 'object') throw new Error('The reply stream contained invalid data.');
    if (event.type === 'error') throw new Error(typeof event.message === 'string' ? event.message.slice(0, 1000) : 'The assistant could not finish this reply.');
    if (event.type === 'delta') {
      if (typeof event.text !== 'string') throw new Error('The reply stream contained invalid text.');
      reply += event.text;outputLength+=event.text.length;
      if (outputLength > 150000) throw new Error('The reply exceeded the supported length.');
    } else if(event.type==='run') {
      if(run||typeof event.runId!=='string'||!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(event.runId)
        ||typeof event.steeringToken!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(event.steeringToken))throw new Error('The reply stream contained invalid run information.');
      run={type:'run',runId:event.runId,steeringToken:event.steeringToken};event=run;
    } else if(event.type==='steering') {
      const prior=steeringMessages.get(event.messageId);
      if(!run||typeof event.messageId!=='string'||!/^[A-Za-z0-9_-]{1,80}$/.test(event.messageId)
        ||!Number.isInteger(event.sequence)||event.sequence<1||event.sequence>19||!['accepted','applied'].includes(event.status)
        ||(!prior&&event.status!=='accepted')||(prior&&(prior.sequence!==event.sequence||prior.status!=='accepted'||event.status!=='applied')))
        throw new Error('The reply stream contained an invalid injected-message update.');
      event={type:'steering',messageId:event.messageId,sequence:event.sequence,status:event.status};steeringMessages.set(event.messageId,event);
    } else if(event.type==='reset') {
      if(!run||!Number.isInteger(event.answerVersion)||event.answerVersion!==answerVersion+1)throw new Error('The reply stream contained an invalid answer update.');
      answerVersion=event.answerVersion;reply='';event={type:'reset',answerVersion};
    } else if (event.type === 'tool') {
      const previous = toolCalls.get(event.id);
      if (typeof event.id !== 'string' || !/^tool-(?:[1-9]|[12][0-9]|30)(?![\s\S])/.test(event.id) ||
          typeof event.name !== 'string' || !/^[a-zA-Z][a-zA-Z0-9_.:-]{0,63}$/.test(event.name) ||
          !['running', 'completed', 'partial', 'failed'].includes(event.status) ||
          (!previous && event.status !== 'running') || (previous && (previous.name !== event.name || previous.status !== 'running' || event.status === 'running'))) {
        throw new Error('The reply stream contained an invalid tool update.');
      }
      event = { type: 'tool', id: event.id, name: event.name, status: event.status };
      toolCalls.set(event.id, event);
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

// The token is issued only to the active reply stream. Never add it to history,
// model input, query strings or persistent browser storage.
export async function steerAssistant({runId,steeringToken,messageId,text,contactContext,signal,fetchImpl=fetch}) {
  if(typeof runId!=='string'||!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(runId)
    ||typeof steeringToken!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(steeringToken)
    ||typeof messageId!=='string'||!/^[A-Za-z0-9_-]{1,80}$/.test(messageId)
    ||typeof text!=='string'||!text.trim()||text.length>8000)throw new Error('This message cannot be added to the active reply.');
  const selected = normalizeContactContext(contactContext);
  let response;
  try{response=await fetchImpl(`/api/chat/${runId}/steer`,{method:'POST',signal,headers:{'Content-Type':'application/json','x-flock-steering-token':steeringToken},body:JSON.stringify({messageId,text,...(selected ? {contactContext:selected} : {})})});}
  catch(error){throw connectionError(error,signal);}
  if(!response.ok)throw new Error(response.status===409?'The active reply has ended. Your message is still queued.':response.status===413?'The active conversation is full. Your message is still queued.':response.status===403?'Access to the active reply is no longer available. Your message is still queued.':connectionMessage);
  let result;try{result=await response.json();}catch{throw new Error('Could not confirm adding this message. It is still queued.');}
  if(response.status!==202||result?.status!=='accepted'||result.messageId!==messageId||!Number.isInteger(result.sequence)||result.sequence<1||result.sequence>19)
    throw new Error('Could not confirm adding this message. It is still queued.');
  return result;
}
