import test from 'node:test';
import assert from 'node:assert/strict';
import {retrieveAssistantContext} from '../server/chat/context.js';
import {createApp} from '../server/runtime/app.js';
import {readConfig} from '../server/shared/config.js';
import {streamAssistant} from '../src/features/assistant/chat-client.js';
import {readGoogleConfig,GOOGLE_SCOPES} from '../server/google/config.js';
import {createGoogleClient} from '../server/google/client.js';
import {executeGoogleTool,GOOGLE_TOOLS} from '../tools/google/index.js';
import {createMiroMcpTools} from '../tools/miro/mcp.js';
const messages=[{role:'user',content:'Find a club resource'}];
const config=readConfig({LLM_PROVIDER:'openai-compatible',LLM_MODEL:'fixture',LLM_API_KEY:'fixture-only'});
const principal={id:'fixture',allowedSourceIds:[]};
const call={name:'search_discord',arguments:{query:'private fixture query'}};
const makeProvider=()=>({planTools:async()=>[call],async *stream(){yield 'Fixture answer';}});
const request={method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({messages})};
const update=(status,extra={})=>({type:'tool',id:'tool-1',name:'search_discord',status,...extra});
const stream=records=>new Response(records.map(JSON.stringify).join('\n')+'\n',{headers:{'content-type':'application/x-ndjson'}});

test('tool callbacks start before execution and expose only bounded names/statuses',async()=>{
 for(const [result,status] of [[{status:'ready'},'completed'],[{status:'ok'},'completed'],[{status:'empty'},'completed'],[{status:'partial'},'partial'],[{status:'metadata_only'},'partial'],...['forbidden','permission_denied','timeout','invalid_request','invalid_response'].map(status=>[{status},'failed']),[null,'failed']]){
  const events=[];const liveTools={tools:[{name:call.name}],execute:async({principal:p})=>{assert.equal(p,principal);assert.equal(events.at(-1).status,'running');if(result===null)throw Error('private failure');return {...result,authorization:'private-token',sources:[]};}};
  await retrieveAssistantContext({messages,principal,provider:makeProvider(),liveTools,onToolEvent:e=>events.push(e)});
  assert.deepEqual(events,[update('running'),update(status)]);assert(!JSON.stringify(events).includes('private'));
 }
});

for(const mode of ['planned','native'])test(`${mode} Google empty search and Miro empty catalogue complete without rewriting results or audit`,async()=>{
 const googleConfig=readGoogleConfig({GOOGLE_CLIENT_ID:'fixture',GOOGLE_CLIENT_SECRET:'fixture-only',GOOGLE_REFRESH_TOKEN:'fixture-only',GOOGLE_EXPECTED_ACCOUNT_EMAIL:'club@example.com'});
 let searches=0;
 const client=createGoogleClient({config:googleConfig,oauthClient:{setCredentials(){},getAccessToken:async()=>({token:'fixture-only'}),getTokenInfo:async()=>({scopes:GOOGLE_SCOPES})},
  fetchImpl:async url=>{
   const path=new URL(url).pathname;
   if(path.endsWith('/profile'))return Response.json({emailAddress:'club@example.com'});
   assert(path.endsWith('/files'));searches++;return Response.json({files:[]});
  }});
 const googleTools={tools:GOOGLE_TOOLS,execute:input=>executeGoogleTool({...input,client})};
 const miroTools=createMiroMcpTools({config:{configured:true,boardIds:[]},store:{configured:true},client:{configured:true,callTool:async()=>{assert.fail('Empty catalogue must not call Miro');}}});
 for(const [name,args,adapters] of [['search_drive',{query:'synthetic missing resource'},{googleTools}],['list_miro_boards',{},{miroTools}]]){
  const events=[],audits=[];let turns=0,returnedToModel=false;
  const next=input=>{
   if(events.some(event=>event.status==='completed')){
    const previous=mode==='native'?input.messages.filter(message=>message.role==='tool').map(message=>JSON.parse(message.content)):JSON.parse(input.system.split('\nUNTRUSTED PREVIOUS TOOL RESULTS (JSON):\n')[1]);
    assert(previous.some(result=>result.tool===name&&result.status==='empty'));returnedToModel=true;return [];
   }
   return [{id:`empty-${++turns}`,name,arguments:args}];
  };
  const provider=mode==='native'?{toolTurn:async input=>({text:'',toolCalls:next(input)})}:{planTools:async input=>next(input)};
  const context=await retrieveAssistantContext({messages,principal:{...principal,googleAccess:true,allowedSourceIds:['10000000-0000-4000-8000-000000000001']},provider,...adapters,onToolEvent:event=>events.push(event),onAuditEvent:async event=>audits.push(event)});
  assert.deepEqual(events,[{type:'tool',id:'tool-1',name,status:'running'},{type:'tool',id:'tool-1',name,status:'completed'}]);
  assert(returnedToModel);assert.equal(context.results.length,1);assert.equal(context.results[0].status,'empty');assert.deepEqual(context.results[0].sources,[]);
  assert.equal(context.status,'empty');assert.deepEqual(audits.filter(event=>event.kind==='tool_finished').map(event=>event.status),['empty']);
 }
 assert.equal(searches,1);
});

test('unregistered and duplicate calls do not create phantom progress entries',async()=>{
 let executions=0;const events=[];
 await retrieveAssistantContext({messages,principal,provider:{planTools:async()=>[{name:'unknown',arguments:{}},call,call]},liveTools:{tools:[{name:call.name}],execute:async()=>{executions++;return {status:'ready',sources:[]};}},onToolEvent:e=>events.push(e)});
 assert.equal(executions,1);assert.equal(events.length,2);assert(events.every(e=>e.name==='search_discord'));
});

test('chat NDJSON streams running before a deferred tool finishes, then result and answer',async()=>{
 let release;const gate=new Promise(r=>{release=r;});
 const app=createApp({config,auth:()=>principal,provider:makeProvider(),liveDiscordTools:{tools:[{name:call.name}],execute:async()=>{await gate;return {status:'ready',sources:[],credential:'private-token'};}}});
 const response=await app.request('/api/chat',request);const reader=response.body.getReader(),decoder=new TextDecoder();
 try{
  const first=await reader.read();assert.deepEqual(JSON.parse(decoder.decode(first.value).trim()),update('running'));
  release();let text='';while(true){const chunk=await reader.read();if(chunk.done)break;text+=decoder.decode(chunk.value,{stream:true});}
  const events=text.trim().split('\n').map(JSON.parse);assert.deepEqual(events.map(e=>e.type),['tool','meta','delta','done']);assert.deepEqual(events[0],update('completed'));assert(!text.includes('private-token'));assert(!text.includes('private fixture query'));
 }finally{release();await reader.cancel();}
});

test('client accepts tool updates across arbitrary byte boundaries without adding them to answer text',async()=>{
 const records=[update('running',{arguments:{secret:'private-token'}}),update('completed'),{type:'delta',text:'Hello 🌱'},{type:'done'}],events=[];
 const bytes=new TextEncoder().encode(records.map(JSON.stringify).join('\n'));
 const answer=await streamAssistant({messages,fetchImpl:async()=>new Response(new ReadableStream({start(c){for(const byte of bytes)c.enqueue(new Uint8Array([byte]));c.close();}}),{headers:{'content-type':'application/x-ndjson'}}),onEvent:e=>events.push(e)});
 assert.equal(answer,'Hello 🌱');assert.deepEqual(events[0],update('running'));assert(!JSON.stringify(events).includes('private-token'));
});

test('client rejects malformed, out-of-order or renamed tool progress',async()=>{
 const cases=[
  [update('completed')], ...['tool-0','tool-31','tool-100','tool-01','tool-1.5','tool-1x','tool--1','tool-30\\n',30,null].map(id=>[update('running',{id})]), [update('running',{name:'<img>'})], [update('invented')],
  [update('running'),update('running')], [update('running'),update('completed',{name:'read_gmail'})],
  [update('running'),update('completed'),update('completed')],
 ];
 for(const records of cases)await assert.rejects(streamAssistant({messages,fetchImpl:async()=>stream([...records,{type:'done'}])}),/invalid tool update/);
});

test('tool progress never turns an interrupted reply into a successful answer',async()=>{
 await assert.rejects(streamAssistant({messages,fetchImpl:async()=>stream([update('running')])}),/before the reply finished/);
 await assert.rejects(streamAssistant({messages,fetchImpl:async()=>stream([update('running'),{type:'error',message:'Fixture unavailable'}])}),/Fixture unavailable/);
});

test('client accepts all thirty bounded tool calls for source fallback and map updates',async()=>{
 const records=[];
 for(let i=1;i<=30;i++)records.push(update('running',{id:`tool-${i}`}),update('completed',{id:`tool-${i}`}));
 records.push({type:'delta',text:'Updated from the retrieved source.'},{type:'done'});
 const events=[];
 assert.equal(await streamAssistant({messages,fetchImpl:async()=>stream(records),onEvent:event=>events.push(event)}),'Updated from the retrieved source.');
 assert.equal(events.filter(event=>event.type==='tool').length,60);
 assert.equal(events.filter(event=>event.type==='tool').at(-1).id,'tool-30');
});
