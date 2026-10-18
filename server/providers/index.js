import { AttachmentError, providerChatMessages } from '../chat-attachments.js';
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
    async toolTurn({messages,system,tools,signal}) {
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
      let reader;
      const cancel=()=>{void reader?.cancel().catch(()=>{});};
      combined.addEventListener('abort',cancel,{once:true});
      try {
        const response=await fetchImpl(`${config.baseUrl.replace(/\/$/,'')}/${anthropic?'messages':'chat/completions'}`,{method:'POST',redirect:'error',signal:combined,
          headers:{'content-type':'application/json',accept:'application/json',...(anthropic?{'x-api-key':config.apiKey,'anthropic-version':'2023-06-01'}:{authorization:`Bearer ${config.apiKey}`})},body:JSON.stringify(body)});
        if(!response.ok||!response.body) { await response.body?.cancel();throw new ProviderError('provider_unavailable'); }
        reader=response.body.getReader();const chunks=[];let bytes=0;
        while(true) {if(combined.aborted)throw new ProviderError(signal?.aborted?'aborted':'provider_unavailable');const {value,done}=await reader.read();if(combined.aborted)throw new ProviderError(signal?.aborted?'aborted':'provider_unavailable');if(done)break;bytes+=value.byteLength;if(bytes>65536)throw new ProviderError('invalid_provider_response');chunks.push(value);}
        let data;try {data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));} catch {throw new ProviderError('invalid_provider_response');}
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
        return {toolCalls,text,stopReason:reason};
      } catch(e) {throw e instanceof ProviderError?e:new ProviderError(signal?.aborted?'aborted':'provider_unavailable');}
      finally {combined.removeEventListener('abort',cancel);if(reader){await reader.cancel().catch(()=>{});reader.releaseLock();}}
    },
    async planTools({ messages, system, tools, signal }) {
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
      let response;
      try {
        response = await fetchImpl(`${config.baseUrl.replace(/\/$/, '')}/${anthropic ? 'messages' : 'chat/completions'}`, {
          method: 'POST', signal, redirect: 'error',
          headers: { 'content-type': 'application/json', accept: 'application/json',
            ...(anthropic ? { 'x-api-key': config.apiKey, 'anthropic-version': '2023-06-01' } : { authorization: `Bearer ${config.apiKey}` }) },
          body: JSON.stringify(body),
        });
      } catch { throw new ProviderError(signal?.aborted ? 'aborted' : 'provider_unavailable'); }
      if (!response.ok || !response.body) { await response.body?.cancel(); throw new ProviderError('provider_unavailable'); }
      const reader = response.body.getReader(), decoder = new TextDecoder('utf-8', { fatal: true });
      let raw = '';
      try {
        while (true) {
          if (signal?.aborted) throw new ProviderError('aborted');
          const { value, done } = await reader.read();
          raw += decoder.decode(value, { stream: !done });
          if (raw.length > 65536) throw new ProviderError('invalid_provider_response');
          if (done) break;
        }
      } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
      let data;
      try { data = JSON.parse(raw); } catch { throw new ProviderError('invalid_provider_response'); }
      if (data?.error) throw new ProviderError('provider_unavailable');
      const calls = anthropic ? data.content?.filter(item => item.type === 'tool_use') : data.choices?.[0]?.message?.tool_calls || [];
      if (!Array.isArray(calls) || calls.length > 8) throw new ProviderError('invalid_provider_response');
      return calls.slice(0, 2).map(call => {
        let args;
        try { args = anthropic ? call.input : JSON.parse(call.function.arguments); } catch { throw new ProviderError('invalid_provider_response'); }
        if (!args || typeof args !== 'object' || Array.isArray(args)) throw new ProviderError('invalid_provider_response');
        return { name: anthropic ? call.name : call.function.name, arguments: args };
      });
    },
    async *stream({ messages, system, signal }) {
      if (!config.configured) throw new ProviderError('not_configured');
      const anthropic = config.provider === 'anthropic';
      let nativeMessages;
      try { nativeMessages = providerChatMessages(messages, config.provider); } catch (error) { throw new ProviderError(error instanceof AttachmentError ? error.code : 'invalid_provider_request'); }
      const body = anthropic
        ? { model: config.model, system, messages: nativeMessages, max_tokens: 2048, stream: true }
        : { model: config.model, messages: [{ role: 'system', content: system }, ...nativeMessages], stream: true, store: false };
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
