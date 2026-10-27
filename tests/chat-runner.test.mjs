import test from 'node:test';
import assert from 'node:assert/strict';
import {createChatRunner} from '../server/chat/runner.js';
import {createApp} from '../server/runtime/app.js';
import {ProviderError} from '../server/providers/index.js';
const config={configured:true,provider:'openai-compatible',timeoutMs:1000,retrievalToolsEnabled:true};
const principal={id:'server-discord',allowedSourceIds:['source']};
const conversation={messages:[{role:'user',content:'Hello'}],timeZone:'America/New_York'};
const context=()=>({transport:'discord',actor:{provider:'discord',userId:'123',guildId:'456',username:'person',displayName:'Person'},channelId:'789',threadId:null,requestId:'101',sourceProfileId:'eboard:123'});
function setup(options={}){
 const events=[],records=[],requests=[];
 const provider={async planTools(request){requests.push(['plan',request]);return [];},async *stream(request){requests.push(['stream',request]);yield 'Hello';}};
 const runner=createChatRunner({config,audit:{recordEvent:async event=>{events.push(event);}},provider,now:()=>new Date('2026-10-19T16:00:00Z'),...options});
 return {events,records,requests,runner,run:args=>runner.run({conversation,principal,onRecord:record=>records.push(record),...args})};
}
test('shared runner sends both phases actor context without placing it in user text or audit events',async()=>{
 const f=setup({liveDiscordTools:{tools:[{name:'read_fixture'}]}}),requestContext=context();
 assert.equal((await f.run({requestContext})).status,'succeeded');
 assert.deepEqual(f.records.map(x=>x.type),['meta','delta','done']);assert.equal(f.requests.length,2);
 for(const [,request] of f.requests){assert.ok(request.system.includes(JSON.stringify(requestContext)));assert.deepEqual(request.messages,conversation.messages);}
 assert.equal(new Set(f.requests.map(([,r])=>r.auditContext.runId)).size,1);
 assert.deepEqual(f.events.map(x=>[x.kind,x.status]),[['run_started','started'],['run_finished','succeeded']]);
 assert.equal(JSON.stringify(f.events).includes('username'),false);assert.equal(JSON.stringify(f.events).includes('Hello'),false);
});
test('website route preserves protocol and never accepts browser-supplied actor context',async()=>{
 const systems=[],app=createApp({config,auth:()=>principal,provider:{async *stream({system}){systems.push(system);yield 'Web answer';}}});
 const response=await app.request('/api/chat',{method:'POST',headers:{'content-type':'application/json','x-discord-user-id':'123'},body:JSON.stringify({...conversation,requestContext:context(),actor:context().actor})});
 assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/application\/x-ndjson/);
 assert.deepEqual((await response.text()).trim().split('\n').map(JSON.parse).map(x=>x.type),['meta','delta','done']);
 assert.doesNotMatch(systems[0],/SERVER-VERIFIED DISCORD|"userId":"123"/);
});
test('trusted-context and principal failures do not invoke providers or audit',async()=>{
 const f=setup(),bad=context();bad.actor.extra='admin';
 assert.equal((await f.run({requestContext:bad})).code,'invalid_request');
 assert.equal((await f.run({principal:{id:'untrusted'}})).code,'access_denied');
 assert.equal(f.requests.length,0);assert.equal(f.events.length,0);
});
test('provider failures remain sanitized and retain failed run outcome',async()=>{
 const f=setup({provider:{async *stream(){throw Error('PRIVATE_EXCEPTION');}}});
 assert.equal((await f.run()).status,'failed');assert.equal(f.records.at(-1).code,'provider_unavailable');
 assert.equal(f.events.at(-1).status,'failed');assert.equal(JSON.stringify([...f.records,...f.events]).includes('PRIVATE_EXCEPTION'),false);
});
test('timeout ends a nonsettling source call and records timeout plus aborted tool',async()=>{
 const f=setup({config:{...config,requestTimeoutMs:15},provider:{async planTools(){return [{name:'read_fixture',arguments:{}}];}},liveDiscordTools:{tools:[{name:'read_fixture'}],execute:()=>new Promise(()=>{})}});
 assert.equal((await f.run()).status,'timeout');assert.equal(f.records.at(-1).code,'timeout');
 assert.equal(f.events.find(x=>x.kind==='tool_finished').status,'aborted');assert.equal(f.events.find(x=>x.kind==='run_finished').status,'timeout');
});
test('external cancellation ends a nonsettling provider and records aborted outcome',async()=>{
 const controller=new AbortController();let started;
 const began=new Promise(resolve=>{started=resolve;});
 const f=setup({provider:{stream:()=>({[Symbol.asyncIterator](){return this;},next(){started();return new Promise(()=>{});}})}});
 const done=f.run({signal:controller.signal});await began;controller.abort();
 assert.equal((await done).status,'aborted');assert.equal(f.records.at(-1).code,'aborted');assert.equal(f.events.at(-1).status,'aborted');
});
test('already-aborted requests skip provider dispatch while recording a terminal run',async()=>{
 const controller=new AbortController();controller.abort();const f=setup();
 assert.equal((await f.run({signal:controller.signal})).status,'aborted');assert.equal(f.requests.length,0);assert.equal(f.events.at(-1).status,'aborted');
});
test('output limits and structured provider failures keep original public error codes',async()=>{
 for(const [provider,code] of [[{async *stream(){yield 'x'.repeat(100001);}},'invalid_provider_response'],[{async *stream(){throw new ProviderError('incomplete_provider_response');}},'incomplete_provider_response']]){
  const f=setup({provider});assert.equal((await f.run()).status,'failed');assert.equal(f.records.at(-1).code,code);assert.equal(f.events.at(-1).status,'failed');
 }
});

test('runner enforces conversation character and encoded text budgets before model calls',async()=>{
 const f=setup();
 for(const messages of [[{role:'user',content:'x'.repeat(8001)}],[{role:'user',content:'漢'.repeat(8000)},{role:'user',content:'漢'.repeat(8000)}]]){
  assert.equal((await f.run({conversation:{messages}})).code,'invalid_request');
 }
 assert.equal(f.requests.length,0);assert.equal(f.events.length,0);
});
