import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createProvider} from '../server/providers/index.js';

const config={configured:true,provider:'openai-compatible',model:'gpt-6-luna',baseUrl:'https://api.openai.com/v1',apiKey:'PRIVATE_PROVIDER_CREDENTIAL',timeoutMs:1000};
const args={messages:[{role:'user',content:'PRIVATE_REQUEST_INPUT'}],system:'PRIVATE_SYSTEM_INPUT',tools:[]};
const context={agent:'planner',runId:randomUUID(),round:3};
const usage={prompt_tokens:91,completion_tokens:12,prompt_tokens_details:{cached_tokens:20},completion_tokens_details:{reasoning_tokens:4}};
const completed=(extra={})=>({id:'completion_1',service_tier:'default',choices:[{index:0,finish_reason:'stop',message:{role:'assistant',content:'Model answer',reasoning_content:'PRIVATE_HIDDEN_REASONING'}}],usage,...extra});
const toolCall=(id='tool_1',argument='{"buildingId":"bobst"}')=>({id,type:'function',function:{name:'read_map_events',arguments:argument}});
const frames=chunks=>chunks.map(chunk=>`data: ${typeof chunk==='string'?chunk:JSON.stringify(chunk)}\n\n`).join('');
const sse=chunks=>new Response(new ReadableStream({start(controller){
  const bytes=new TextEncoder().encode(frames(chunks));
  for(let i=0;i<bytes.length;i+=65536)controller.enqueue(bytes.slice(i,i+65536));
  controller.close();
}}),{headers:{'content-type':'text/event-stream','x-request-id':'request_stream'}});
const openaiStream=(extra=[])=>sse([
  {id:'completion_stream',choices:[{index:0,delta:{content:'First '},finish_reason:null}]},
  {choices:[{index:0,delta:{content:'answer'},finish_reason:'stop'}]},
  ...extra,'[DONE]',
]);
const collect=async iterator=>{let text='';for await(const chunk of iterator)text+=chunk;return text;};
function auditFixture(options={}) {
  const starts=[],finishes=[],sequence=[];
  const audit={configured:true,required:true,
    async startModel(row){starts.push(structuredClone(row));sequence.push('start');return {status:'ready'};},
    async finishModel(row){finishes.push(structuredClone(row));sequence.push('finish');return {status:'ready'};},...options};
  return {audit,starts,finishes,sequence};
}
function fixture(response,options={}) {
  const state=auditFixture(options.audit);
  let dispatches=0;
  const provider=createProvider({...config,...options.config},{audit:state.audit,fetchImpl:async(...params)=>{
    dispatches++;state.sequence.push('fetch');
    return typeof response==='function'?response(...params):response;
  }});
  return {...state,provider,get dispatches(){return dispatches;}};
}
function assertTerminal(state,status='succeeded') {
  assert.equal(state.starts.length,1);assert.equal(state.finishes.length,1);
  assert.deepEqual(state.sequence,['start','fetch','finish']);
  assert.equal(state.starts[0].callId,state.finishes[0].callId);
  assert.equal(state.finishes[0].status,status);
  assert.equal(state.starts[0].providerBaseHost,'api.openai.com');
  assert.match(state.starts[0].callId,/^[0-9a-f-]{36}$/);
  const serialized=JSON.stringify([state.starts,state.finishes]);
  for(const sentinel of ['PRIVATE_PROVIDER_CREDENTIAL','PRIVATE_REQUEST_INPUT','PRIVATE_SYSTEM_INPUT','PRIVATE_HIDDEN_REASONING','PRIVATE_NETWORK_ERROR','PRIVATE_HTTP_BODY'])assert.ok(!serialized.includes(sentinel),sentinel);
}

test('all three dispatches durably start and retain identity, output, usage and safe metadata',async()=>{
  for(const operation of ['toolTurn','planTools','stream']) {
    const state=fixture(operation==='stream'?openaiStream([{choices:[],service_tier:'default',usage}]):Response.json(completed(),{headers:{'x-request-id':'request_json'}}));
    const request={...args,auditContext:context};
    if(operation==='stream')assert.equal(await collect(state.provider.stream(request)),'First answer');
    else if(operation==='planTools')assert.deepEqual(await state.provider.planTools(request),[]);
    else assert.equal((await state.provider.toolTurn(request)).text,'Model answer');
    assertTerminal(state);
    assert.deepEqual(state.starts[0].context,context);assert.equal(state.starts[0].operation,operation);
    assert.equal(state.starts[0].stream,operation==='stream');
    const terminal=state.finishes[0];assert.equal(terminal.httpStatus,200);assert.equal(terminal.stopReason,'stop');
    assert.equal(terminal.responseId,operation==='stream'?'completion_stream':'completion_1');
    assert.equal(terminal.providerRequestId,operation==='stream'?'request_stream':'request_json');
    assert.equal(terminal.serviceTier,'default');
    assert.deepEqual(terminal.usage,{inputTokens:91,outputTokens:12,cacheReadTokens:20,cacheWriteTokens:null,reasoningTokens:4});
    assert.equal(terminal.output.text,operation==='stream'?'First answer':'Model answer');
  }
});

test('OpenAI streaming requests usage and keeps consuming after finish_reason',async()=>{
  let request;
  const state=fixture((url,init)=>{request=JSON.parse(init.body);return openaiStream([{id:'terminal_id',choices:[],usage:{prompt_tokens:35,completion_tokens:7}}]);});
  assert.equal(await collect(state.provider.stream(args)),'First answer');
  assert.deepEqual(request.stream_options,{include_usage:true});
  assert.equal(state.finishes[0].responseId,'terminal_id');
  assert.equal(state.finishes[0].usage.inputTokens,35);assert.equal(state.finishes[0].usage.outputTokens,7);
  assert.equal(state.finishes[0].usage.reasoningTokens,null);
});

test('planning audits all proposals before the public two-proposal slice',async()=>{
  const calls=[toolCall('a'),toolCall('b'),toolCall('c')];
  const state=fixture(Response.json(completed({choices:[{finish_reason:'tool_calls',message:{role:'assistant',content:'Plan rationale',tool_calls:calls}}]})));
  assert.equal((await state.provider.planTools(args)).length,2);
  assertTerminal(state);assert.equal(state.finishes[0].output.toolCalls.length,3);
  assert.equal(state.finishes[0].output.toolCalls[2].id,'c');
  assert.equal(state.finishes[0].output.text,'Plan rationale');
});

test('provider response validation failures retain generated proposals, usage, refusals and stop reasons',async()=>{
  const cases=[
    ['toolTurn',completed({choices:[{finish_reason:'tool_calls',message:{role:'assistant',content:'Before invalid args',tool_calls:[toolCall('bad','broken JSON')]}}]}),'invalid_provider_response'],
    ['planTools',completed({choices:[{finish_reason:'tool_calls',message:{role:'assistant',content:'Before invalid args',tool_calls:[toolCall('bad','broken JSON')]}}]}),'invalid_provider_response'],
    ['toolTurn',completed({choices:[{finish_reason:'length',message:{role:'assistant',content:'Truncated model text'}}]}),'incomplete_provider_response'],
    ['toolTurn',completed({choices:[{finish_reason:'stop',message:{role:'assistant',content:'',refusal:'Model refusal'}}]}),'invalid_provider_response'],
  ];
  for(const [operation,data,code]of cases){
    const state=fixture(Response.json(data));
    await assert.rejects(state.provider[operation](args),{code});assertTerminal(state,'failed');
    assert.equal(state.finishes[0].usage.inputTokens,91);assert.equal(state.finishes[0].errorCode,code);
    if(data.choices[0].message.tool_calls)assert.equal(state.finishes[0].output.toolCalls[0].arguments,'broken JSON');
    if(data.choices[0].message.refusal)assert.equal(state.finishes[0].output.refusal,'Model refusal');
    assert.equal(state.finishes[0].stopReason,data.choices[0].finish_reason);
  }
});

for(const operation of ['toolTurn','planTools','stream']) {
  test(`${operation}: HTTP, JSON/protocol and network failures finish with unknown usage and sanitized error`,async()=>{
    const cases=[
      [()=>new Response('PRIVATE_HTTP_BODY',{status:429,headers:{'x-request-id':'request_rejected'}}),'provider_unavailable',429],
      [()=>{throw new Error('PRIVATE_NETWORK_ERROR');},'provider_unavailable',null],
      [()=>operation==='stream'?sse(['not JSON']):new Response('not JSON'),'invalid_provider_response',200],
    ];
    for(const [response,code,status]of cases){
      const state=fixture(response);
      await assert.rejects(operation==='stream'?collect(state.provider.stream(args)):state.provider[operation](args),{code});
      assertTerminal(state,'failed');assert.equal(state.finishes[0].httpStatus,status);
      assert.deepEqual(Object.values(state.finishes[0].usage),[null,null,null,null,null]);
    }
  });
  test(`${operation}: failed required durable start prevents provider dispatch`,async()=>{
    for(const startModel of [async()=>({status:'unavailable'}),async()=>({status:'not_configured'}),async()=>{throw Error('private DB error');}]){
      const state=fixture(()=>{throw Error('must not dispatch');},{audit:{startModel}});
      await assert.rejects(operation==='stream'?collect(state.provider.stream(args)):state.provider[operation](args),{code:'audit_unavailable'});
      assert.equal(state.dispatches,0);assert.equal(state.finishes.length,0);
    }
  });
}

test('pre-dispatch invalid tool history never creates a paid-call record',async()=>{
  const state=fixture(()=>{throw Error('must not dispatch');});
  await assert.rejects(state.provider.toolTurn({...args,messages:[{role:'tool',toolCallId:'missing',content:'private read result'}]}),{code:'invalid_provider_request'});
  assert.equal(state.starts.length,0);assert.equal(state.dispatches,0);
});

test('default context is a fresh chat run and explicit simultaneous planner runs remain separate',async()=>{
  const state=fixture(()=>Response.json(completed()));
  await Promise.all([state.provider.planTools(args),state.provider.toolTurn({...args,auditContext:context}),state.provider.planTools(args)]);
  assert.equal(new Set(state.starts.map(row=>row.callId)).size,3);
  assert.equal(new Set(state.starts.map(row=>row.context.runId)).size,3);
  assert.equal(state.starts[0].context.agent,'chat');assert.deepEqual(state.starts[1].context,context);
});

test('Anthropic nonstream accounting keeps uncached/cache creation/cache reads distinct',async()=>{
  for(const operation of ['toolTurn','planTools']){
    const state=fixture(Response.json({id:'anthropic_1',stop_reason:'end_turn',content:[{type:'text',text:'Anthropic answer'}],usage:{input_tokens:10,output_tokens:20,cache_read_input_tokens:30,cache_creation_input_tokens:40}}),{config:{provider:'anthropic'}});
    await state.provider[operation](args);assertTerminal(state);
    assert.equal(state.finishes[0].responseId,'anthropic_1');
    assert.deepEqual(state.finishes[0].usage,{inputTokens:10,outputTokens:20,cacheReadTokens:30,cacheWriteTokens:40,reasoningTokens:null});
  }
});

test('Anthropic streaming merges cumulative usage without adding output deltas or erasing input/cache counters',async()=>{
  const state=fixture(sse([
    {type:'message_start',message:{id:'anthropic_stream',usage:{input_tokens:10,output_tokens:1,cache_read_input_tokens:20,cache_creation_input_tokens:30}}},
    {type:'content_block_delta',delta:{type:'text_delta',text:'Anthropic text'}},
    {type:'message_delta',delta:{},usage:{output_tokens:5}},
    {type:'message_delta',delta:{stop_reason:'end_turn'},usage:{output_tokens:8}},
    {type:'message_stop'},
  ]),{config:{provider:'anthropic'}});
  assert.equal(await collect(state.provider.stream(args)),'Anthropic text');assertTerminal(state);
  const terminal=state.finishes[0];assert.equal(terminal.responseId,'anthropic_stream');
  assert.deepEqual(terminal.usage,{inputTokens:10,outputTokens:8,cacheReadTokens:20,cacheWriteTokens:30,reasoningTokens:null});
});

test('early consumer return records cancelled partial output with unknown usage',async()=>{
  const state=fixture(openaiStream([{choices:[],usage}]));
  const iterator=state.provider.stream(args);
  assert.deepEqual(await iterator.next(),{done:false,value:'First '});
  await iterator.return();assertTerminal(state,'cancelled');
  assert.equal(state.finishes[0].output.text,'First ');assert.equal(state.finishes[0].usage.inputTokens,null);
});

test('caller abort after partial text records aborted output and finishes independently of the signal',async()=>{
  const abort=new AbortController();const state=fixture(openaiStream());
  const iterator=state.provider.stream({...args,signal:abort.signal});
  assert.equal((await iterator.next()).value,'First ');abort.abort();
  await assert.rejects(iterator.next(),{code:'aborted'});assertTerminal(state,'aborted');
  assert.equal(state.finishes[0].output.text,'First ');assert.equal(state.finishes[0].errorCode,'aborted');
});

test('incomplete and malformed streams retain prior text and available usage',async()=>{
  for(const tail of [[],['not JSON'],[{choices:[{index:0,delta:{content:'Truncated same frame'},finish_reason:'length'}]}]]){
    const state=fixture(sse([{id:'partial',choices:[{index:0,delta:{content:'Partial'},finish_reason:null}],usage:{prompt_tokens:11}},...tail]));
    await assert.rejects(collect(state.provider.stream(args)));
    assertTerminal(state,'failed');assert.ok(state.finishes[0].output.text.startsWith('Partial'));
    assert.equal(state.finishes[0].usage.inputTokens,11);assert.equal(state.finishes[0].usage.outputTokens,null);
    if(tail[0]?.choices)assert.equal(state.finishes[0].output.text,'PartialTruncated same frame');
  }
});

test('OpenAI streaming captures refusals and tool proposals without hidden reasoning',async()=>{
  const state=fixture(sse([
    {choices:[{index:0,delta:{refusal:'Cannot comply',reasoning_content:'PRIVATE_HIDDEN_REASONING',tool_calls:[{index:0,id:'proposal',function:{name:'read_map_events',arguments:'{"buildingId":'}}]},finish_reason:null}]},
    {choices:[{index:0,delta:{tool_calls:[{index:0,function:{arguments:'"bobst"}'}}]},finish_reason:'tool_calls'}]},
  ]));
  await assert.rejects(collect(state.provider.stream(args)),{code:'incomplete_provider_response'});assertTerminal(state,'failed');
  assert.equal(state.finishes[0].output.refusal,'Cannot comply');
  assert.deepEqual(state.finishes[0].output.toolCalls,[{id:'proposal',name:'read_map_events',arguments:{buildingId:'bobst'}}]);
});

test('retained streaming output has a byte bound and explicit truncation without changing yielded text',async()=>{
  const parts=Array.from({length:9},()=> 'é'.repeat(32768));
  const state=fixture(sse([
    ...parts.map(content=>({choices:[{index:0,delta:{content},finish_reason:null}]})),
    {choices:[{index:0,delta:{},finish_reason:'stop'}]},'[DONE]',
  ]));
  const text=await collect(state.provider.stream(args));assertTerminal(state);
  assert.equal(text,parts.join(''));const output=state.finishes[0].output;
  assert.equal(output.truncated,true);assert.equal(output.originalBytes,Buffer.byteLength(text));
  assert.equal(Buffer.byteLength(output.text),512*1024);assert.equal(output.storedBytes,512*1024);
  assert.ok(!output.text.includes('\ufffd'));
});

test('finish write failure remains visible and preserves both successful result and original provider failure',async()=>{
  const messages=[];const previous=console.warn;console.warn=value=>messages.push(value);
  try {
    for(const response of [Response.json(completed()),new Response('PRIVATE_HTTP_BODY',{status:500})]){
      const state=fixture(response,{audit:{async finishModel(){throw Error('PRIVATE_DATABASE_ERROR');}}});
      if(response.ok)assert.deepEqual(await state.provider.planTools(args),[]);
      else await assert.rejects(state.provider.planTools(args),{code:'provider_unavailable'});
    }
    const statusState=fixture(Response.json(completed()),{audit:{async finishModel(){return {status:'unavailable'};}}});
    assert.deepEqual(await statusState.provider.planTools(args),[]);
    assert.equal(messages.length,3);
    for(const message of messages){assert.equal(JSON.parse(message).event,'model_audit_finish_failed');assert.ok(!message.includes('PRIVATE'));}
  } finally {console.warn=previous;}
});

test('durable start is awaited before any provider request',async()=>{
  let release;const ready=new Promise(resolve=>{release=resolve;});
  const state=fixture(Response.json(completed()),{audit:{async startModel(){await ready;return {status:'ready'};}}});
  const pending=state.provider.planTools(args);
  await new Promise(resolve=>setImmediate(resolve));assert.equal(state.dispatches,0);
  release();assert.deepEqual(await pending,[]);assert.equal(state.dispatches,1);
});

test('model-reported errors retain available accounting but never persist raw error bodies',async()=>{
  for(const operation of ['toolTurn','planTools','stream']){
    const errorResponse={id:'errored_call',error:{message:'PRIVATE_HTTP_BODY'},usage};
    const state=fixture(operation==='stream'?sse([errorResponse]):Response.json(errorResponse));
    await assert.rejects(operation==='stream'?collect(state.provider.stream(args)):state.provider[operation](args),{code:'provider_unavailable'});
    assertTerminal(state,'failed');assert.equal(state.finishes[0].responseId,'errored_call');
    assert.equal(state.finishes[0].usage.inputTokens,91);assert.deepEqual(state.finishes[0].output,{});
  }
});

test('OpenAI cache-write tokens remain separate from cached input and missing usage',async()=>{
  const state=fixture(Response.json(completed({usage:{prompt_tokens:100,completion_tokens:10,prompt_tokens_details:{cached_tokens:25,cache_write_tokens:9,cache_creation_tokens:999}}})));
  await state.provider.planTools(args);assertTerminal(state);
  assert.deepEqual(state.finishes[0].usage,{inputTokens:100,outputTokens:10,cacheReadTokens:25,cacheWriteTokens:9,reasoningTokens:null});
});

test('nonstream body cancellation records aborted status and releases pending readers',async()=>{
  for(const operation of ['toolTurn','planTools']){
    const abort=new AbortController();let bodyStarted;const bodyReady=new Promise(resolve=>{bodyStarted=resolve;});let cancelled=false;
    const state=fixture(()=>new Response(new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode('{'));bodyStarted();},cancel(){cancelled=true;}})));
    const pending=state.provider[operation]({...args,signal:abort.signal});
    await bodyReady;await new Promise(resolve=>setImmediate(resolve));abort.abort();
    await assert.rejects(pending,{code:'aborted'});assertTerminal(state,'aborted');assert.equal(cancelled,true);
  }
});

test('toolTurn timeout is recorded as failed with unknown usage',async()=>{
  const state=fixture((url,{signal})=>new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(Error('private fixture fallback')),1000);
    signal.addEventListener('abort',()=>{clearTimeout(timer);reject(Error('PRIVATE_NETWORK_ERROR'));},{once:true});
  }),{config:{timeoutMs:10}});
  await assert.rejects(state.provider.toolTurn(args),{code:'provider_unavailable'});assertTerminal(state,'failed');
  assert.equal(state.finishes[0].usage.inputTokens,null);
});

test('abort during durable-start persistence never begins a provider request',async()=>{
  for(const operation of ['toolTurn','planTools','stream']){
    const abort=new AbortController();
    const state=fixture(()=>{throw Error('must not dispatch');},{audit:{async startModel(){abort.abort();return {status:'ready'};}}});
    await assert.rejects(operation==='stream'?collect(state.provider.stream({...args,signal:abort.signal})):state.provider[operation]({...args,signal:abort.signal}),{code:'aborted'});
    assert.equal(state.dispatches,0);assert.equal(state.finishes.length,1);assert.equal(state.finishes[0].status,'aborted');
  }
});
