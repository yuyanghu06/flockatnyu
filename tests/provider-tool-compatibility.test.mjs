import test from 'node:test';
import assert from 'node:assert/strict';
import {createProvider} from '../server/providers/index.js';
import {readConfig} from '../server/config.js';
const messages=[{role:'user',content:'Read the club Discord channel.'}];
const tool={name:'read_discord_window',description:'Read original channel messages.',parameters:{type:'object',properties:{channelId:{type:'string'}},required:['channelId'],additionalProperties:false}};
const makeConfig=extra=>readConfig({LLM_PROVIDER:'openai-compatible',LLM_MODEL:'gpt-6-luna',LLM_API_KEY:'fixture-only-secret',...extra});
const openaiResult={choices:[{message:{tool_calls:[{type:'function',function:{name:tool.name,arguments:'{"channelId":"200"}'}}]}}]};
test('official Luna and Sol function planning explicitly disables reasoning and returns usable tool calls',async()=>{
  for(const model of ['gpt-6-luna','gpt-6-sol'])for(const baseUrl of ['https://api.openai.com/v1','https://api.openai.com/v1/']){
    let captured;const provider=createProvider(makeConfig({LLM_MODEL:model,LLM_BASE_URL:baseUrl}),{fetchImpl:async(url,options)=>{captured={url,options,body:JSON.parse(options.body)};return captured.body.reasoning_effort==='none'?Response.json(openaiResult):Response.json({error:{message:'Function tools require reasoning_effort none'}},{status:400});}});
    const calls=await provider.planTools({messages,system:'Evidence policy',tools:[tool]});assert.deepEqual(calls,[{name:tool.name,arguments:{channelId:'200'}}]);assert.equal(captured.body.reasoning_effort,'none');assert.equal(captured.url,'https://api.openai.com/v1/chat/completions');assert.equal(captured.options.method,'POST');assert.equal(captured.options.redirect,'error');assert.equal(captured.body.stream,false);assert.equal(captured.body.store,false);assert.equal(captured.body.tool_choice,'auto');assert.deepEqual(captured.body.tools,[{type:'function',function:tool}]);assert.deepEqual(captured.body.messages,[{role:'system',content:'Evidence policy'},...messages]);
  }
});
test('other model names retain the existing Chat Completions planning payload without reasoning override',async()=>{
  for(const model of ['gpt-6-astra','gpt-5.4','custom-model','gpt-6-luna-custom']){
    let body;const provider=createProvider(makeConfig({LLM_MODEL:model}),{fetchImpl:async(_,options)=>{body=JSON.parse(options.body);return Response.json(openaiResult);}});await provider.planTools({messages,system:'Policy',tools:[tool]});assert.equal(Object.hasOwn(body,'reasoning_effort'),false);assert.equal(body.model,model);
  }
});
test('proxy and alternate API paths are never given the official Luna/Sol compatibility override',async()=>{
  for(const model of ['gpt-6-luna','gpt-6-sol'])for(const baseUrl of ['https://proxy.example.com/v1','https://api.openai.com.attacker.invalid/v1','https://api.openai.com/v2','http://api.openai.com/v1']){
    let body;const provider=createProvider(makeConfig({LLM_MODEL:model,LLM_BASE_URL:baseUrl}),{fetchImpl:async(_,options)=>{body=JSON.parse(options.body);return Response.json(openaiResult);}});await provider.planTools({messages,system:'Policy',tools:[tool]});assert.equal(Object.hasOwn(body,'reasoning_effort'),false);assert.equal(body.model,model);
  }
});
test('Anthropic planning uses its own tool schema and receives no OpenAI-specific override',async()=>{
  for(const model of ['claude-fixture','gpt-6-luna','gpt-6-sol']){
    let captured;const provider=createProvider(makeConfig({LLM_PROVIDER:'anthropic',LLM_MODEL:model}),{fetchImpl:async(url,options)=>{captured={url,body:JSON.parse(options.body)};return Response.json({content:[{type:'tool_use',name:tool.name,input:{channelId:'200'}}]});}});assert.deepEqual(await provider.planTools({messages,system:'Policy',tools:[tool]}),[{name:tool.name,arguments:{channelId:'200'}}]);assert.equal(captured.url,'https://api.anthropic.com/v1/messages');assert.equal(Object.hasOwn(captured.body,'reasoning_effort'),false);assert.deepEqual(captured.body.tools,[{name:tool.name,description:tool.description,input_schema:tool.parameters}]);assert.deepEqual(captured.body.messages,messages);assert.equal(captured.body.max_tokens,1024);
  }
});
test('answer streaming keeps model reasoning defaults even when planning for the same instance used none',async()=>{
  const sse='data: {"choices":[{"index":0,"delta":{"content":"Answer"},"finish_reason":null}]}\n\ndata: {"choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n';
  for(const model of ['gpt-6-luna','gpt-6-sol']){
    const bodies=[];const provider=createProvider(makeConfig({LLM_MODEL:model}),{fetchImpl:async(_,options)=>{const body=JSON.parse(options.body);bodies.push(body);return body.stream?new Response(sse,{headers:{'content-type':'text/event-stream'}}):Response.json(openaiResult);}});await provider.planTools({messages,system:'Plan',tools:[tool]});const chunks=[];for await(const chunk of provider.stream({messages,system:'Answer'}))chunks.push(chunk);assert.deepEqual(chunks,['Answer']);assert.equal(bodies[0].reasoning_effort,'none');assert.equal(Object.hasOwn(bodies[1],'reasoning_effort'),false);assert.equal(Object.hasOwn(bodies[1],'tools'),false);assert.equal(bodies[1].stream,true);assert.equal(bodies[1].store,false);
  }
});
test('planning HTTP failure remains sanitized after the compatibility adjustment',async()=>{
  const provider=createProvider(makeConfig({}),{fetchImpl:async()=>Response.json({error:{message:'fixture-only-secret private account details'}},{status:400})});await assert.rejects(provider.planTools({messages,system:'Policy',tools:[tool]}),error=>error.code==='provider_unavailable'&&!error.message.includes('fixture-only-secret'));
});
