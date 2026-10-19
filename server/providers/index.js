import { randomUUID } from 'node:crypto';
import { AttachmentError, providerChatMessages } from '../chat-attachments.js';
import { createAuditLogger } from '../model-audit.js';
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
    await reader.cancel().catch(() => {});
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

export function createProvider(config, { fetchImpl = fetch, audit = createAuditLogger() } = {}) {
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
        stopReason: state.stopReason, serviceTier: state.serviceTier, usage: state.usage, output: state.output, errorCode: state.errorCode || null });
      if (result?.status === 'unavailable' || audit.required && result?.status !== 'ready') throw new Error('audit_unavailable');
    } catch {
      // Keep the original provider result/failure; its durable start stays unresolved.
      console.warn(JSON.stringify({ event: 'model_audit_finish_failed', callId: state.callId, status: 'unavailable' }));
    }
  };
  const failCall = (state, error, signal) => {
    const safe = error instanceof ProviderError ? error : new ProviderError(signal?.aborted ? 'aborted' : 'provider_unavailable');
    state.status = safe.code === 'aborted' ? 'aborted' : 'failed'; state.errorCode = safe.code;
    return safe;
  };
  const noteResponse = (state, response) => {
    state.httpStatus = response.status;
    state.providerRequestId = response.headers.get('x-request-id') || response.headers.get('request-id');
  };

  return {
    async toolTurn({messages,system,tools,signal,auditContext}) {
      if (!config.configured) throw new ProviderError('not_configured');
      const anthropic=config.provider==='anthropic';
      if (!Array.isArray(messages)||!Array.isArray(tools)||tools.length>25||typeof system!=='string') throw new ProviderError('invalid_provider_request');
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
          if(!Array.isArray(calls)||calls.length>8||message.role!=='assistant'&&calls.length) throw new ProviderError('invalid_provider_request');
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
      const combined=AbortSignal.any([signal,AbortSignal.timeout(config.timeoutMs||30000)].filter(Boolean));
      const auditState = newCall('toolTurn', auditContext);
      await startCall(auditState);
      let reader;
      const cancel=()=>{void reader?.cancel().catch(()=>{});};
      combined.addEventListener('abort',cancel,{once:true});
      try {
        if (combined.aborted) throw new ProviderError(signal?.aborted ? 'aborted' : 'provider_unavailable');
        const response=await fetchImpl(`${config.baseUrl.replace(/\/$/,'')}/${anthropic?'messages':'chat/completions'}`,{method:'POST',redirect:'error',signal:combined,
          headers:{'content-type':'application/json',accept:'application/json',...(anthropic?{'x-api-key':config.apiKey,'anthropic-version':'2023-06-01'}:{authorization:`Bearer ${config.apiKey}`})},body:JSON.stringify(body)});
        noteResponse(auditState, response);
        if(!response.ok||!response.body) { await response.body?.cancel();throw new ProviderError('provider_unavailable'); }
        reader=response.body.getReader();const chunks=[];let bytes=0;
        while(true) {if(combined.aborted)throw new ProviderError(signal?.aborted?'aborted':'provider_unavailable');const {value,done}=await reader.read();if(combined.aborted)throw new ProviderError(signal?.aborted?'aborted':'provider_unavailable');if(done)break;bytes+=value.byteLength;if(bytes>65536)throw new ProviderError('invalid_provider_response');chunks.push(value);}
        let data;try {data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));} catch {throw new ProviderError('invalid_provider_response');}
        captureResponse(auditState, data, anthropic);
        if(data?.error) throw new ProviderError('provider_unavailable');
        const reason=anthropic?data.stop_reason:data.choices?.[0]?.finish_reason;
        if(!(anthropic?['tool_use','end_turn','stop_sequence']:['tool_calls','stop']).includes(reason)) throw new ProviderError('incomplete_provider_response');
        let rawCalls,text;
        if(anthropic) {
          if(!Array.isArray(data.content)||data.content.some(c=>!c||!['text','tool_use'].includes(c.type)||c.type==='text'&&typeof c.text!=='string')) throw new ProviderError('invalid_provider_response');
          rawCalls=data.content.filter(c=>c.type==='tool_use');text=data.content.filter(c=>c.type==='text').map(c=>c.text).join('');
        } else {
          if(data.choices?.length!==1||data.choices[0].message?.role!=='assistant'||data.choices[0].message.refusal) throw new ProviderError('invalid_provider_response');
          rawCalls=data.choices[0].message.tool_calls||[];text=data.choices[0].message.content??'';
        }
        if(!Array.isArray(rawCalls)||rawCalls.length>8||typeof text!=='string'||Boolean(rawCalls.length)!==['tool_calls','tool_use'].includes(reason)) throw new ProviderError('invalid_provider_response');
        const callIds=new Set();
        const toolCalls=rawCalls.map(c=>{
          let args;try {args=anthropic?c.input:JSON.parse(c.function.arguments);} catch {throw new ProviderError('invalid_provider_response');}
          const name=anthropic?c.name:c.function?.name;
          if(!anthropic&&c.type!=='function'||typeof c.id!=='string'||!/^[a-zA-Z0-9_-]{1,200}$/.test(c.id)||callIds.has(c.id)||seen.has(c.id)||typeof name!=='string'||!/^[a-zA-Z][a-zA-Z0-9_.:-]{0,63}$/.test(name)||!args||typeof args!=='object'||Array.isArray(args)) throw new ProviderError('invalid_provider_response');
          callIds.add(c.id);return {id:c.id,name,arguments:args};
        });
        auditState.status = 'succeeded';
        return {toolCalls,text,stopReason:reason};
      } catch(e) {throw failCall(auditState,e,signal);}
      finally {combined.removeEventListener('abort',cancel);try {if(reader){await reader.cancel().catch(()=>{});reader.releaseLock();}} finally {await finishCall(auditState);}}
    },
    async planTools({ messages, system, tools, signal, auditContext }) {
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
      const auditState = newCall('planTools', auditContext);
      await startCall(auditState);
      let response;
      try {
        if (signal?.aborted) throw new ProviderError('aborted');
        response = await fetchImpl(`${config.baseUrl.replace(/\/$/, '')}/${anthropic ? 'messages' : 'chat/completions'}`, {
          method: 'POST', signal, redirect: 'error',
          headers: { 'content-type': 'application/json', accept: 'application/json',
            ...(anthropic ? { 'x-api-key': config.apiKey, 'anthropic-version': '2023-06-01' } : { authorization: `Bearer ${config.apiKey}` }) },
          body: JSON.stringify(body),
        });
        noteResponse(auditState, response);
        if (!response.ok || !response.body) { await response.body?.cancel(); throw new ProviderError('provider_unavailable'); }
        const reader = response.body.getReader(), decoder = new TextDecoder('utf-8', { fatal: true });
        let raw = '';
        const cancel = () => { void reader.cancel().catch(() => {}); };
        signal?.addEventListener('abort', cancel, { once: true });
        try {
          while (true) {
            if (signal?.aborted) throw new ProviderError('aborted');
            const { value, done } = await reader.read();
            if (signal?.aborted) throw new ProviderError('aborted');
            raw += decoder.decode(value, { stream: !done });
            if (raw.length > 65536) throw new ProviderError('invalid_provider_response');
            if (done) break;
          }
        } finally { signal?.removeEventListener('abort', cancel); await reader.cancel().catch(() => {}); reader.releaseLock(); }
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
      } catch (error) { throw failCall(auditState, error, signal); }
      finally { await finishCall(auditState); }
    },
    async *stream({ messages, system, signal, auditContext }) {
      if (!config.configured) throw new ProviderError('not_configured');
      const anthropic = config.provider === 'anthropic';
      let nativeMessages;
      try { nativeMessages = providerChatMessages(messages, config.provider); } catch (error) { throw new ProviderError(error instanceof AttachmentError ? error.code : 'invalid_provider_request'); }
      const body = anthropic
        ? { model: config.model, system, messages: nativeMessages, max_tokens: 2048, stream: true }
        : { model: config.model, messages: [{ role: 'system', content: system }, ...nativeMessages], stream: true, store: false, stream_options: { include_usage: true } };
      const auditState = newCall('stream', auditContext, true);
      await startCall(auditState);
      let response;
      try {
        if (signal?.aborted) throw new ProviderError('aborted');
        response = await fetchImpl(`${config.baseUrl.replace(/\/$/, '')}/${anthropic ? 'messages' : 'chat/completions'}`, {
          method: 'POST', signal, redirect: 'error',
          headers: { 'content-type': 'application/json', accept: 'text/event-stream',
            ...(anthropic ? { 'x-api-key': config.apiKey, 'anthropic-version': '2023-06-01' } : { authorization: `Bearer ${config.apiKey}` }) },
          body: JSON.stringify(body),
        });
        noteResponse(auditState, response);
        if (!response.ok) { await response.body?.cancel(); throw new ProviderError('provider_unavailable'); }
        if (!response.headers.get('content-type')?.includes('text/event-stream')) {
          await response.body?.cancel(); throw new ProviderError('invalid_provider_response');
        }
        let finished = false, started = false;
        for await (const frame of parseSSE(response.body, signal)) {
          if (signal?.aborted) throw new ProviderError('aborted');
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
      } catch (error) { throw failCall(auditState, error, signal); }
      finally {
        if (auditState.status === 'cancelled' && signal?.aborted) { auditState.status = 'aborted'; auditState.errorCode = 'aborted'; }
        await finishCall(auditState);
      }
    },
  };
}
