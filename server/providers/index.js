import { randomUUID } from 'node:crypto';
import { AttachmentError, providerChatMessages } from '../chat-attachments.js';
import { createAuditLogger } from '../model-audit.js';
import { abortableDelay, fallbackStatus, hardQuotaCode, retryDelay, transientStatus, transientTransport, untilAborted } from './retry.js';
// Private routing state cannot be authored by model output or an upstream body.
const operationBudget=Symbol('operationBudget'),fallbackFailures=new WeakSet();
const sharedBudget=(config,signal)=>{
  const timeoutMs=config.timeoutMs||30000;
  return {combined:AbortSignal.any([signal,AbortSignal.timeout(timeoutMs)].filter(Boolean)),deadline:performance.now()+timeoutMs};
};
export class ProviderError extends Error {
  constructor(code = 'provider_unavailable') { super(code); this.code = code; }
}
const responseFailureReasons=new Set(['invalid_json','response_too_large','invalid_response_shape','invalid_tool_shape','too_many_tool_calls','finish_reason_mismatch','malformed_tool_arguments','duplicate_call_id','reused_call_id']);
const responseFailure=(reason,code='invalid_provider_response')=>{
  const error=new ProviderError(code);
  error.diagnostics=Object.freeze({stage:'response_parse',reason:responseFailureReasons.has(reason)?reason:'invalid_response_shape'});
  return error;
};

// Incremental SSE parsing tolerates network chunk and CRLF boundaries, but bounds
// each event. Never return upstream error bodies or credentials to the caller.
export async function* parseSSE(body, signal) {
  if (!body) throw new ProviderError('invalid_provider_response');
  const reader = body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let buffer = '', data = [], event = '', size = 0;
  const abort = () => { void reader.cancel().catch(() => {}); };
  signal?.addEventListener('abort', abort, { once: true });
  try {
    while (true) {
      if (signal?.aborted) throw new ProviderError('aborted');
      const { value, done } = await reader.read();
      if (signal?.aborted) throw new ProviderError('aborted');
      try { buffer += decoder.decode(value, { stream: !done }); }
      catch { throw new ProviderError('invalid_provider_response'); }
      if (buffer.length > 262144) throw new ProviderError('invalid_provider_response');
      let newline;
      while ((newline = buffer.indexOf('\n')) !== -1) {
        if (signal?.aborted) throw new ProviderError('aborted');
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
    await (signal ? untilAborted(reader.cancel(), signal) : reader.cancel()).catch(() => {});
    reader.releaseLock();
  }
}

// Audit only model-produced fields. Provider envelopes, request messages and
// hidden reasoning never cross the output boundary. Missing usage stays unknown.
const emptyUsage = () => ({ inputTokens: null, outputTokens: null, cacheReadTokens: null, cacheWriteTokens: null, reasoningTokens: null });
const tokenCount = value => Number.isSafeInteger(value) && value >= 0 ? value : null;
function mergeUsage(previous, usage, anthropic) {
  if (!usage || typeof usage !== 'object') return previous;
  const next = anthropic ? {
    inputTokens: tokenCount(usage.input_tokens), outputTokens: tokenCount(usage.output_tokens),
    cacheReadTokens: tokenCount(usage.cache_read_input_tokens), cacheWriteTokens: tokenCount(usage.cache_creation_input_tokens), reasoningTokens: null,
  } : {
    inputTokens: tokenCount(usage.prompt_tokens), outputTokens: tokenCount(usage.completion_tokens),
    cacheReadTokens: tokenCount(usage.prompt_tokens_details?.cached_tokens), cacheWriteTokens: tokenCount(usage.prompt_tokens_details?.cache_write_tokens ?? usage.prompt_tokens_details?.cache_creation_tokens),
    reasoningTokens: tokenCount(usage.completion_tokens_details?.reasoning_tokens),
  };
  // Anthropic message_delta counters are cumulative, not increments.
  return Object.fromEntries(Object.keys(previous).map(key => [key, next[key] ?? previous[key]]));
}
function proposalArguments(value) {
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return value; }
}
function captureResponse(state, data, anthropic) {
  if (!data || typeof data !== 'object') return;
  if (typeof data.id === 'string') state.responseId = data.id;
  if (typeof data.service_tier === 'string') state.serviceTier = data.service_tier;
  state.usage = mergeUsage(state.usage, data.usage, anthropic);
  const choice = data.choices?.[0];
  const message = choice?.message;
  const blocks = Array.isArray(data.content) ? data.content : [];
  const text = anthropic ? blocks.filter(block => block?.type === 'text' && typeof block.text === 'string').map(block => block.text).join('') : message?.content;
  if (typeof text === 'string') state.output.text = text;
  const calls = anthropic ? blocks.filter(block => block?.type === 'tool_use') : message?.tool_calls;
  if (Array.isArray(calls)) state.output.toolCalls = calls.map(call => ({
    ...(typeof call?.id === 'string' ? { id: call.id } : {}),
    ...(typeof (anthropic ? call?.name : call?.function?.name) === 'string' ? { name: anthropic ? call.name : call.function.name } : {}),
    // Preserve malformed generated argument strings for diagnosing validation failures.
    ...(anthropic ? { arguments: call?.input } : typeof call?.function?.arguments === 'string' ? { arguments: proposalArguments(call.function.arguments) } : {}),
  }));
  if (typeof message?.refusal === 'string') state.output.refusal = message.refusal;
  const reason = anthropic ? data.stop_reason : choice?.finish_reason;
  if (typeof reason === 'string') state.stopReason = reason;
}
const OUTPUT_LIMIT = 512 * 1024;
function appendOutput(state, key, text, target = state.output) {
  if (typeof text !== 'string') return;
  state.output.originalBytes = (state.output.originalBytes || 0) + Buffer.byteLength(text);
  const remaining = OUTPUT_LIMIT - (state.output.storedBytes || 0);
  let fragment = text;
  if (Buffer.byteLength(fragment) > remaining) {
    const bytes = Buffer.from(fragment);
    let end = Math.max(0, remaining);
    // Do not split a multibyte codepoint in retained output.
    while (end > 0 && (bytes[end] & 0xc0) === 0x80) end--;
    fragment = bytes.subarray(0, end).toString('utf8');
    state.output.truncated = true;
  }
  state.output.storedBytes = (state.output.storedBytes || 0) + Buffer.byteLength(fragment);
  target[key] = (target[key] || '') + fragment;
}

function captureToolDelta(state, index, delta) {
  if (!Number.isInteger(index) || index < 0 || index >= 32) { state.output.truncated = true; return; }
  const calls = state.output.toolCalls ||= [];
  const target = calls[index] ||= {};
  for (const key of ['id', 'name', 'arguments']) appendOutput(state, key, delta[key], target);
}

function createSingleProvider(config, { fetchImpl = fetch, audit = createAuditLogger(), retrySleep = abortableDelay, writeDiagnostic=entry=>console.warn(JSON.stringify(entry)) } = {}) {
  const newCall = (operation, context, stream = false) => ({
    callId: randomUUID(), operation, context: context || { agent: 'chat', runId: randomUUID() }, stream,
    status: 'cancelled', usage: emptyUsage(), output: {}, responseId: null,
    providerRequestId: null, httpStatus: null, stopReason: null, serviceTier: null,
  });
  const startCall = async state => {
    let result;
    try {
      result = await audit.startModel({ callId: state.callId, context: state.context,
        provider: config.provider, model: config.model, operation: state.operation, stream: state.stream,
        providerBaseHost: new URL(config.baseUrl).hostname });
    } catch { result = { status: 'unavailable' }; }
    if (audit.required && result?.status !== 'ready') throw new ProviderError('audit_unavailable');
  };
  const finishCall = async state => {
    try {
      // Decode complete generated JSON arguments for key-based secret filtering.
      for (const proposal of state.output.toolCalls || []) {
        if (proposal && typeof proposal.arguments === 'string') proposal.arguments = proposalArguments(proposal.arguments);
      }
      const result = await audit.finishModel({ callId: state.callId, status: state.status,
        responseId: state.responseId, providerRequestId: state.providerRequestId, httpStatus: state.httpStatus,
        stopReason: state.stopReason, serviceTier: state.serviceTier, usage: state.usage, output: state.output, errorCode: state.upstreamErrorCode || state.errorCode || null });
      if (result?.status === 'unavailable' || audit.required && result?.status !== 'ready') throw new Error('audit_unavailable');
    } catch {
      // Keep the original provider result/failure; its durable start stays unresolved.
      console.warn(JSON.stringify({ event: 'model_audit_finish_failed', callId: state.callId, status: 'unavailable' }));
    }
  };
  const failCall = (state, error, signal, combined) => {
    const safe = signal?.aborted ? new ProviderError('aborted') : combined?.aborted ? new ProviderError('provider_unavailable')
      : error instanceof ProviderError ? error : new ProviderError('provider_unavailable');
    fallbackFailures.delete(safe); // Only the current dispatch can grant routing after normalization.
    state.status = safe.code === 'aborted' ? 'aborted' : 'failed'; state.errorCode = safe.code;
    if(safe.diagnostics&&responseFailureReasons.has(safe.diagnostics.reason)) {
      state.output.diagnostics=safe.diagnostics;
      try {void Promise.resolve(writeDiagnostic({event:'agent_model_failure',diagnosticsVersion:1,
        agent:state.context?.agent==='planner'?'planner':'chat',runId:typeof state.context?.runId==='string'&&/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(state.context.runId)?state.context.runId:null,round:Number.isInteger(state.context?.round)&&state.context.round>=0&&state.context.round<=10000?state.context.round:null,
        callId:state.callId,operation:state.operation,status:state.status,errorCode:safe.code,
        ...safe.diagnostics,...(Number.isInteger(state.httpStatus)?{httpStatus:state.httpStatus}:{})})).catch(()=>{});}catch{/* Diagnostics never change the original model outcome. */}
    }
    return safe;
  };
  const noteResponse = (state, response) => {
    state.httpStatus = response.status;
    state.providerRequestId = response.headers.get('x-request-id') || response.headers.get('request-id');
  };
  const budget = signal => sharedBudget(config,signal);
  const cancelResponse = async (response, signal) => {
    try { await untilAborted(response?.body?.cancel(), signal); }
    catch { /* Discard error bodies; cleanup cannot extend the operation deadline. */ }
  };
  async function quotaCode(response,combined) {
    // Inspect only rejected429 envelopes, never successful generated text. Keep
    // just an approved fixed code; discard every body byte after classification.
    let reader;
    try {
      if(!response.body)return null;
      reader=response.body.getReader();const chunks=[];let bytes=0;
      while(true) {
        const {value,done}=await untilAborted(reader.read(),combined);
        if(done)break;
        bytes+=value.byteLength;if(bytes>16384)return null;chunks.push(value);
      }
      return hardQuotaCode(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks))));
    }catch{return null;}
    finally {if(reader){await untilAborted(reader.cancel(),combined).catch(()=>{});reader.releaseLock();}}
  }
  const dispatch = async ({ operation, context, body, signal, combined, deadline, stream = false }) => {
    // One operation owns one fallback run ID, including every rejected attempt.
    const callContext = context || { agent: 'chat', runId: randomUUID() };
    const anthropic = config.provider === 'anthropic';
    const init = { method: 'POST', redirect: 'error', signal: combined,
      headers: { 'content-type': 'application/json', accept: stream ? 'text/event-stream' : 'application/json',
        ...(anthropic ? { 'x-api-key': config.apiKey, 'anthropic-version': '2023-06-01' } : { authorization: `Bearer ${config.apiKey}` }) },
      body: JSON.stringify(body) };
    for (let attempt = 1; attempt <= 3; attempt++) {
      const state = newCall(operation, callContext, stream);
      await startCall(state);
      let response, retryable = false, fallbackEligible = false, failure;
      try {
        if (combined.aborted || performance.now() >= deadline) throw new ProviderError(signal?.aborted ? 'aborted' : 'provider_unavailable');
        // Only this fetch rejection is eligible for transport retries. Parsing,
        // validation and streaming occur outside this loop and cannot replay.
        try {
          response = await untilAborted(fetchImpl(`${config.baseUrl.replace(/\/$/, '')}/${anthropic ? 'messages' : 'chat/completions'}`, init), combined,
            value => { void cancelResponse(value, combined); });
        } catch (error) { retryable = transientTransport(error);fallbackEligible=retryable;throw error; }
        noteResponse(state, response);
        if (combined.aborted) { await cancelResponse(response, combined); throw new ProviderError(signal?.aborted ? 'aborted' : 'provider_unavailable'); }
        if (response.ok) return { response, auditState: state };
        state.upstreamErrorCode=response.status===429?await quotaCode(response,combined):null;
        retryable = !state.upstreamErrorCode&&transientStatus(response.status, config.provider);
        fallbackEligible=fallbackStatus(response.status);
        await cancelResponse(response, combined);
        throw new ProviderError('provider_unavailable');
      } catch (error) { failure = failCall(state, error, signal, combined); }
      await finishCall(state);
      const delay = retryable ? retryDelay(attempt, response?.headers.get('retry-after')) : null;
      if (signal?.aborted) throw new ProviderError('aborted');
      if (delay === null || combined.aborted || delay >= deadline - performance.now()) {
        if(fallbackEligible&&!combined.aborted)fallbackFailures.add(failure);
        throw failure;
      }
      try { await untilAborted(retrySleep(delay, combined), combined); }
      catch { throw new ProviderError(signal?.aborted ? 'aborted' : 'provider_unavailable'); }
      if (combined.aborted || performance.now() >= deadline) throw new ProviderError(signal?.aborted ? 'aborted' : 'provider_unavailable');
    }
  };

  return {
    async toolTurn({messages,system,tools,signal,auditContext,maxToolCalls=8,[operationBudget]:suppliedBudget}) {
      if (!config.configured) throw new ProviderError('not_configured');
      const anthropic=config.provider==='anthropic';
      if (!Number.isInteger(maxToolCalls)||maxToolCalls<1||maxToolCalls>16||!Array.isArray(messages)||!Array.isArray(tools)||tools.length>64||typeof system!=='string') throw new ProviderError('invalid_provider_request');
      const native=[];let pending=new Set();const seen=new Set();
      for(const message of messages) {
        if(message.role==='tool') {
          if(!pending.has(message.toolCallId)||typeof message.content!=='string') throw new ProviderError('invalid_provider_request');
          pending.delete(message.toolCallId);
          if(anthropic) {
            const block={type:'tool_result',tool_use_id:message.toolCallId,content:message.content};
            if(native.at(-1)?.role==='user'&&Array.isArray(native.at(-1).content)) native.at(-1).content.push(block);
            else native.push({role:'user',content:[block]});
          } else native.push({role:'tool',tool_call_id:message.toolCallId,content:message.content});
        } else {
          if(pending.size||!['user','assistant'].includes(message.role)||typeof message.content!=='string') throw new ProviderError('invalid_provider_request');
          const calls=message.toolCalls||[];
          if(!Array.isArray(calls)||calls.length>maxToolCalls||message.role!=='assistant'&&calls.length) throw new ProviderError('invalid_provider_request');
          for(const call of calls) {
            if(typeof call.id!=='string'||!/^[a-zA-Z0-9_-]{1,200}$/.test(call.id)||seen.has(call.id)) throw new ProviderError('invalid_provider_request');
            seen.add(call.id);pending.add(call.id);
          }
          if(anthropic&&calls.length) native.push({role:'assistant',content:[...(message.content?[{type:'text',text:message.content}]:[]),...calls.map(c=>({type:'tool_use',id:c.id,name:c.name,input:c.arguments}))]});
          else if(!anthropic&&calls.length) native.push({role:'assistant',content:message.content||null,tool_calls:calls.map(c=>({id:c.id,type:'function',function:{name:c.name,arguments:JSON.stringify(c.arguments)}}))});
          else native.push({role:message.role,content:message.content});
        }
      }
      if(pending.size) throw new ProviderError('invalid_provider_request');
      const definitions=tools.map(t=>anthropic?{name:t.name,description:t.description,input_schema:t.parameters}:{type:'function',function:{name:t.name,description:t.description,parameters:t.parameters}});
      const body=anthropic?{model:config.model,system,messages:native,tools:definitions,max_tokens:2048,stream:false}
        :{model:config.model,messages:[{role:'system',content:system},...native],tools:definitions,tool_choice:'auto',max_completion_tokens:2048,stream:false,store:false,
          ...(['gpt-6-luna','gpt-6-sol'].includes(config.model)&&config.baseUrl.replace(/\/$/,'')==='https://api.openai.com/v1'?{reasoning_effort:'none'}:{})};
      if(Buffer.byteLength(JSON.stringify(body))>350000) throw new ProviderError('invalid_provider_request');
      const { combined, deadline } = suppliedBudget??budget(signal);
      const { response, auditState } = await dispatch({ operation: 'toolTurn', context: auditContext, body, signal, combined, deadline });
      let reader;
      const cancel=()=>{void reader?.cancel().catch(()=>{});};
      combined.addEventListener('abort',cancel,{once:true});
      try {
        if(!response.body) throw new ProviderError('provider_unavailable');
        reader=response.body.getReader();const chunks=[];let bytes=0;
        while(true) {if(combined.aborted)throw new ProviderError(signal?.aborted?'aborted':'provider_unavailable');const {value,done}=await reader.read();if(combined.aborted)throw new ProviderError(signal?.aborted?'aborted':'provider_unavailable');if(done)break;bytes+=value.byteLength;if(bytes>65536)throw responseFailure('response_too_large');chunks.push(value);}
        let data;try {data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));} catch {throw responseFailure('invalid_json');}
        captureResponse(auditState, data, anthropic);
        if(data?.error) throw new ProviderError('provider_unavailable');
        const reason=anthropic?data.stop_reason:data.choices?.[0]?.finish_reason;
        if(!(anthropic?['tool_use','end_turn','stop_sequence']:['tool_calls','stop']).includes(reason)) throw new ProviderError('incomplete_provider_response');
        let rawCalls,text;
        if(anthropic) {
          if(!Array.isArray(data.content)||data.content.some(c=>!c||!['text','tool_use'].includes(c.type)||c.type==='text'&&typeof c.text!=='string')) throw responseFailure('invalid_response_shape');
          rawCalls=data.content.filter(c=>c.type==='tool_use');text=data.content.filter(c=>c.type==='text').map(c=>c.text).join('');
        } else {
          if(data.choices?.length!==1||data.choices[0].message?.role!=='assistant'||data.choices[0].message.refusal) throw responseFailure('invalid_response_shape');
          rawCalls=data.choices[0].message.tool_calls||[];text=data.choices[0].message.content??'';
        }
        if(!Array.isArray(rawCalls))throw responseFailure('invalid_tool_shape');
        if(rawCalls.length>maxToolCalls)throw responseFailure('too_many_tool_calls');
        if(typeof text!=='string')throw responseFailure('invalid_response_shape');
        if(Boolean(rawCalls.length)!==['tool_calls','tool_use'].includes(reason))throw responseFailure('finish_reason_mismatch');
        const callIds=new Set();
        const toolCalls=rawCalls.map(c=>{
          let args;try {args=anthropic?c.input:JSON.parse(c.function.arguments);} catch {throw responseFailure('malformed_tool_arguments');}
          const name=anthropic?c.name:c.function?.name;
          if(!anthropic&&c.type!=='function'||typeof c.id!=='string'||!/^[a-zA-Z0-9_-]{1,200}$/.test(c.id)||typeof name!=='string'||!/^[a-zA-Z][a-zA-Z0-9_.:-]{0,63}$/.test(name)||!args||typeof args!=='object'||Array.isArray(args))throw responseFailure('invalid_tool_shape');
          if(callIds.has(c.id))throw responseFailure('duplicate_call_id');
          if(seen.has(c.id))throw responseFailure('reused_call_id');
          callIds.add(c.id);return {id:c.id,name,arguments:args};
        });
        auditState.status = 'succeeded';
        return {toolCalls,text,stopReason:reason};
      } catch(e) {throw failCall(auditState,e,signal,combined);}
      finally {combined.removeEventListener('abort',cancel);try {if(reader){await untilAborted(reader.cancel(),combined).catch(()=>{});reader.releaseLock();}} finally {await finishCall(auditState);}}
    },
    async planTools({ messages, system, tools, signal, auditContext,[operationBudget]:suppliedBudget }) {
      if (!config.configured) throw new ProviderError('not_configured');
      const anthropic = config.provider === 'anthropic';
      let nativeMessages;
      try { nativeMessages = providerChatMessages(messages, config.provider); } catch (error) { throw new ProviderError(error instanceof AttachmentError ? error.code : 'invalid_provider_request'); }
      const toolDefinitions = tools.map(tool => anthropic
        ? { name: tool.name, description: tool.description, input_schema: tool.parameters }
        : { type: 'function', function: { name: tool.name, description: tool.description, parameters: tool.parameters } });
      const body = anthropic
        ? { model: config.model, system, messages: nativeMessages, tools: toolDefinitions, max_tokens: 1024, stream: false }
        : { model: config.model, messages: [{ role: 'system', content: system }, ...nativeMessages], tools: toolDefinitions, tool_choice: 'auto', stream: false, store: false,
          // These models require none for Chat Completions function calls.
          // Answer streaming retains the configured model's default reasoning.
          ...(['gpt-6-luna', 'gpt-6-sol'].includes(config.model) && config.baseUrl.replace(/\/$/, '') === 'https://api.openai.com/v1'
            ? { reasoning_effort: 'none' } : {}) };
      const { combined, deadline } = suppliedBudget??budget(signal);
      const { response, auditState } = await dispatch({ operation: 'planTools', context: auditContext, body, signal, combined, deadline });
      try {
        if (!response.body) throw new ProviderError('provider_unavailable');
        const reader = response.body.getReader(), decoder = new TextDecoder('utf-8', { fatal: true });
        let raw = '';
        const cancel = () => { void reader.cancel().catch(() => {}); };
        combined.addEventListener('abort', cancel, { once: true });
        try {
          while (true) {
            if (combined.aborted) throw new ProviderError(signal?.aborted ? 'aborted' : 'provider_unavailable');
            const { value, done } = await reader.read();
            if (combined.aborted) throw new ProviderError(signal?.aborted ? 'aborted' : 'provider_unavailable');
            raw += decoder.decode(value, { stream: !done });
            if (raw.length > 65536) throw new ProviderError('invalid_provider_response');
            if (done) break;
          }
        } finally { combined.removeEventListener('abort', cancel); await untilAborted(reader.cancel(), combined).catch(() => {}); reader.releaseLock(); }
        let data;
        try { data = JSON.parse(raw); } catch { throw new ProviderError('invalid_provider_response'); }
        captureResponse(auditState, data, anthropic);
        if (data?.error) throw new ProviderError('provider_unavailable');
        const calls = anthropic ? data.content?.filter(item => item.type === 'tool_use') : data.choices?.[0]?.message?.tool_calls || [];
        if (!Array.isArray(calls) || calls.length > 8) throw new ProviderError('invalid_provider_response');
        const result = calls.slice(0, 2).map(call => {
          let args;
          try { args = anthropic ? call.input : JSON.parse(call.function.arguments); } catch { throw new ProviderError('invalid_provider_response'); }
          if (!args || typeof args !== 'object' || Array.isArray(args)) throw new ProviderError('invalid_provider_response');
          return { name: anthropic ? call.name : call.function.name, arguments: args };
        });
        auditState.status = 'succeeded';
        return result;
      } catch (error) { throw failCall(auditState, error, signal, combined); }
      finally { await finishCall(auditState); }
    },
    async *stream({ messages, system, signal, auditContext,[operationBudget]:suppliedBudget }) {
      if (!config.configured) throw new ProviderError('not_configured');
      const anthropic = config.provider === 'anthropic';
      let nativeMessages;
      try { nativeMessages = providerChatMessages(messages, config.provider); } catch (error) { throw new ProviderError(error instanceof AttachmentError ? error.code : 'invalid_provider_request'); }
      const body = anthropic
        ? { model: config.model, system, messages: nativeMessages, max_tokens: 2048, stream: true }
        : { model: config.model, messages: [{ role: 'system', content: system }, ...nativeMessages], stream: true, store: false, stream_options: { include_usage: true } };
      const { combined, deadline } = suppliedBudget??budget(signal);
      const { response, auditState } = await dispatch({ operation: 'stream', context: auditContext, body, signal, combined, deadline, stream: true });
      try {
        if (!response.headers.get('content-type')?.includes('text/event-stream')) {
          await cancelResponse(response, combined); throw new ProviderError('invalid_provider_response');
        }
        let finished = false, started = false;
        for await (const frame of parseSSE(response.body, combined)) {
          if (combined.aborted) throw new ProviderError(signal?.aborted ? 'aborted' : 'provider_unavailable');
          if (!anthropic && frame.data === '[DONE]') {
            if (!finished) throw new ProviderError('incomplete_provider_response');
            auditState.status = 'succeeded';
            return;
          }
          let chunk;
          try { chunk = JSON.parse(frame.data); } catch { throw new ProviderError('invalid_provider_response'); }
          if (!chunk || typeof chunk !== 'object') throw new ProviderError('provider_unavailable');
          if (typeof chunk.id === 'string') auditState.responseId = chunk.id;
          if (typeof chunk.service_tier === 'string') auditState.serviceTier = chunk.service_tier;
          auditState.usage = mergeUsage(auditState.usage, chunk.usage, anthropic);
          if (chunk.error || chunk.type === 'error') throw new ProviderError('provider_unavailable');
          if (anthropic) {
            if (frame.event && frame.event !== chunk.type) throw new ProviderError('invalid_provider_response');
            if (chunk.type === 'message_start') {
              started = true;
              if (typeof chunk.message?.id === 'string') auditState.responseId = chunk.message.id;
              auditState.usage = mergeUsage(auditState.usage, chunk.message?.usage, true);
            }
            if (chunk.type === 'content_block_start' && chunk.content_block?.type === 'tool_use') {
              captureToolDelta(auditState, chunk.index, { id: chunk.content_block.id, name: chunk.content_block.name });
            }
            if (chunk.type === 'content_block_delta' && chunk.delta?.type === 'input_json_delta') {
              captureToolDelta(auditState, chunk.index, { arguments: chunk.delta.partial_json });
            }
            if (chunk.type === 'message_delta' && chunk.delta?.stop_reason) {
              auditState.stopReason = chunk.delta.stop_reason;
              if (!['end_turn', 'stop_sequence'].includes(chunk.delta.stop_reason)) throw new ProviderError('incomplete_provider_response');
              finished = true;
            }
            if (chunk.type === 'message_stop') {
              if (!started || !finished) throw new ProviderError('incomplete_provider_response');
              auditState.status = 'succeeded';
              return;
            }
            if (chunk.type === 'content_block_delta' && chunk.delta?.type === 'text_delta') {
              if (!started || typeof chunk.delta.text !== 'string') throw new ProviderError('invalid_provider_response');
              appendOutput(auditState, 'text', chunk.delta.text);
              yield chunk.delta.text;
            }
          } else {
            if (!Array.isArray(chunk.choices)) throw new ProviderError('invalid_provider_response');
            for (const choice of chunk.choices) {
              if (choice.index !== 0) continue;
              const content = choice.delta?.content;
              if (typeof content === 'string') appendOutput(auditState, 'text', content);
              if (typeof choice.delta?.refusal === 'string') appendOutput(auditState, 'refusal', choice.delta.refusal);
              if (Array.isArray(choice.delta?.tool_calls)) for (const call of choice.delta.tool_calls) {
                captureToolDelta(auditState, call.index, { id: call.id, name: call.function?.name, arguments: call.function?.arguments });
              }
              if (choice.finish_reason) {
                auditState.stopReason = choice.finish_reason;
                if (choice.finish_reason !== 'stop') throw new ProviderError('incomplete_provider_response');
                finished = true;
              }
              if (content != null && typeof content !== 'string') throw new ProviderError('invalid_provider_response');
              if (content) yield content;
            }
          }
        }
        throw new ProviderError('incomplete_provider_response');
      } catch (error) { throw failCall(auditState, error, signal, combined); }
      finally {
        if (auditState.status === 'cancelled' && signal?.aborted) { auditState.status = 'aborted'; auditState.errorCode = 'aborted'; }
        await finishCall(auditState);
      }
    },
  };
}

export function createProvider(config,dependencies={}) {
  if(!Array.isArray(config.providers))return createSingleProvider(config,dependencies);
  const adapters=config.providers.map(entry=>createSingleProvider({...config,...entry,configured:config.configured},dependencies));
  const prepare=args=>{
    if(!config.configured||!adapters.length)throw new ProviderError('not_configured');
    return {...args,auditContext:args.auditContext||{agent:'chat',runId:randomUUID()},[operationBudget]:sharedBudget(config,args.signal)};
  };
  const canAdvance=(error,args)=>fallbackFailures.has(error)&&!args[operationBudget].combined.aborted
    &&performance.now()<args[operationBudget].deadline;
  const routed=operation=>async request=>{
    const args=prepare(request);
    for(let index=0;index<adapters.length;index++) {
      try{return await adapters[index][operation](args);}
      catch(error){if(index===adapters.length-1||!canAdvance(error,args))throw error;}
    }
  };
  return {toolTurn:routed('toolTurn'),planTools:routed('planTools'),async *stream(request){
    const args=prepare(request);
    for(let index=0;index<adapters.length;index++) {
      try{yield* adapters[index].stream(args);return;}
      catch(error){if(index===adapters.length-1||!canAdvance(error,args))throw error;}
    }
  }};
}
