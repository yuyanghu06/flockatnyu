import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {setTimeout as pause} from 'node:timers/promises';
import {createAutomationStore} from '../server/automation/store.js';
import {createAutomationHandler} from '../server/automation/handler.js';
import {readAutomationConfig} from '../server/automation/config.js';

const source=randomUUID(),token=randomUUID(),id=randomUUID();
const input={uuid:id,raw_response:{source:'discord',source_id:source,event_type:'message_created',event_id:'123',revision:'1',received_at:'2026-10-21T16:00:00Z',payload:{content:'PRIVATE_INPUT_BODY'}}};
const config={...readAutomationConfig({AGENT_AUTOMATION_ENABLED:'true'}),maxRunMs:1000};
function storeFixture(response=true){const calls=[];const store=createAutomationStore({env:{SUPABASE_URL:'https://db.invalid',SUPABASE_SERVICE_ROLE_KEY:'PRIVATE_SERVICE_KEY'},fetchImpl:async(url,init)=>{calls.push({name:new URL(url).pathname.split('/').at(-1),body:JSON.parse(init.body),signal:init.signal});return Response.json(response);}});return {store,calls};}
function handlerFixture({provider,prepareBatch,authorizeEvent,configPatch={},signal,release,fail,finish,inputs=[input],receipts=new Map(),execute}={}){
 const calls=[];const store={configured:true,requiresScopedClaims:true,async claim(){return {status:'ready',leaseToken:token,inputs};},async renew(){return {status:'ready'};},async release(args){calls.push({kind:'release',args});return release?release(args):{status:'ready'};},async fail(args){calls.push({kind:'fail',args});return fail?fail(args):{status:'ready'};},async finish(args){calls.push({kind:'finish',args});return finish?finish(args):{status:'ready'};},async action({actionKey,complete}){if(receipts.has(actionKey))return {status:'completed'};if(complete){receipts.set(actionKey,true);return {status:'completed'};}return {status:'execute'};}};
 const handler=createAutomationHandler({store,config:{...config,...configPatch},principal:{id:'worker',allowedSourceIds:[source]},authorizeEvent:authorizeEvent|| (async()=>true),prepareBatch,tools:[{name:'save_event',description:'Save fixture event',idempotent:true,parameters:{type:'object',properties:{title:{type:'string'}},required:['title'],additionalProperties:false},async execute(args,context){calls.push({kind:'execute',args,context});return execute?execute(args,context):{status:'ready'};}}],provider:{toolTurn:provider|| (async()=>({stopReason:'stop',toolCalls:[],text:''}))}});
 return {handler,calls,run:()=>handler.tick({signal})};
}

test('store fail sends only fixed outcome and fenced lease and maps stale denial',async()=>{
 const f=storeFixture();assert.equal((await f.store.fail({leaseToken:token,outcome:'timeout'})).status,'ready');assert.deepEqual(f.calls[0].body,{p_token:token,p_outcome:'timeout'});assert.equal(f.calls[0].name,'agent_automation_fail');
 const stale=storeFixture(false);assert.equal((await stale.store.fail({leaseToken:token,outcome:'unavailable'})).status,'stale');
 for(const bad of [{leaseToken:'invalid',outcome:'timeout'},{leaseToken:token,outcome:'PRIVATE_ERROR'},{leaseToken:token,outcome:'shutdown'}])assert.equal((await f.store.fail(bad)).status,'invalid_request');assert.equal(f.calls.length,1);
});
test('store recovery validates exact UUID scope and hash before network',async()=>{
 const f=storeFixture();const args={inputId:id,allowedSourceIds:[source],expectedHash:'a'.repeat(32)};assert.equal((await f.store.requeue(args)).status,'ready');assert.deepEqual(f.calls[0].body,{p_input_id:id,p_allowed_source_ids:[source],p_expected_hash:'a'.repeat(32)});assert.equal(f.calls[0].name,'agent_automation_requeue');
 for(const patch of [{inputId:'invalid'},{allowedSourceIds:[]},{allowedSourceIds:[source,source]},{allowedSourceIds:['invalid']},{expectedHash:'x'},{expectedHash:'PRIVATE_SOURCE_TEXT'}])assert.equal((await f.store.requeue({...args,...patch})).status,'invalid_request');assert.equal(f.calls.length,1);
});
test('unsuccessful model and protocol runs settle exactly once with content-free outcomes',async()=>{
 for(const [provider,expected] of [[async()=>{throw Error('PRIVATE_PROVIDER_ERROR');},'unavailable'],[async()=>({stopReason:'stop',toolCalls:[]}), 'incomplete_batch'],[async()=>({stopReason:'tool_calls',toolCalls:[{id:'x',name:'unknown',arguments:{}}]}),'invalid_tool_call']]){
  const f=handlerFixture({provider});assert.equal((await f.run()).status,expected);const terminal=f.calls.filter(c=>['fail','release'].includes(c.kind));assert.equal(terminal.length,1);assert.equal(terminal[0].kind,'fail');assert.equal(terminal[0].args.leaseToken,token);assert.equal(terminal[0].args.outcome,expected);assert(!JSON.stringify(terminal).includes('PRIVATE_'));
 }
});
test('preflight and current-source revocation settle without model or write execution',async()=>{
 for(const patch of [{prepareBatch:async()=>({status:'unavailable'}),expected:'preflight_failed'},{authorizeEvent:async()=>false,expected:'forbidden'}]){
  const f=handlerFixture({...patch,provider:async()=>{throw Error('Model must not execute');}});assert.equal((await f.run()).status,patch.expected);assert.equal(f.calls.find(c=>c.kind==='fail').args.outcome,patch.expected);assert(!f.calls.some(c=>c.kind==='execute'));
 }
});
test('caller cancellation releases without failure and uses fresh cleanup signal',async()=>{
 const controller=new AbortController();const f=handlerFixture({signal:controller.signal,provider:async()=>{controller.abort();return new Promise(()=>{});}});assert.equal((await f.run()).status,'aborted');const terminal=f.calls.filter(c=>['fail','release'].includes(c.kind));assert.equal(terminal.length,1);assert.equal(terminal[0].kind,'release');assert.equal(terminal[0].args.signal.aborted,false);
});
test('internal run timeout records failure even though public outcome remains aborted',async()=>{
 const f=handlerFixture({configPatch:{maxRunMs:15},provider:async()=>new Promise(()=>{})});const controller=new AbortController();const watchdog=pause(300,null,{signal:controller.signal}).then(()=>{throw Error('run deadline ignored');},()=>{});
 try{const result=await Promise.race([f.run(),watchdog]);assert(['aborted','timeout'].includes(result.status));const terminal=f.calls.filter(c=>['fail','release'].includes(c.kind));assert.equal(terminal.length,1);assert.equal(terminal[0].kind,'fail');assert.equal(terminal[0].args.outcome,'timeout');}finally{controller.abort();}
});
test('successful finish is not followed by lease release or failure',async()=>{
 const f=handlerFixture({provider:async()=>({stopReason:'tool_calls',toolCalls:[{id:'finish',name:'finish_batch',arguments:{handledInputIds:[id]}}]})});assert.equal((await f.run()).status,'completed');assert.equal(f.calls.filter(c=>c.kind==='finish').length,1);assert(!f.calls.some(c=>['fail','release'].includes(c.kind)));
});
test('failed settlement does not fall back to shutdown release that would erase failure accounting',async()=>{
 const f=handlerFixture({fail:async()=>{throw Error('PRIVATE_DB_FAILURE');}});assert.equal((await f.run()).status,'incomplete_batch');assert.equal(f.calls.filter(c=>c.kind==='fail').length,1);assert.equal(f.calls.filter(c=>c.kind==='release').length,0);
});
test('action receipt prevents repeated mutation when a failed batch is retried as a singleton',async()=>{
 const extra={...structuredClone(input),uuid:randomUUID()},receipts=new Map();let writes=0;
 const action={id:'save',name:'save_event',arguments:{inputIds:[id],arguments:{title:'Study'}}};
 let turn=0;const first=handlerFixture({inputs:[input,extra],receipts,execute:async()=>{writes++;return {status:'ready'};},provider:async()=>++turn===1?{stopReason:'tool_calls',toolCalls:[action]}:{stopReason:'stop',toolCalls:[]}});
 assert.equal((await first.run()).status,'incomplete_batch');assert.equal(writes,1);
 let next=0;const second=handlerFixture({inputs:[input],receipts,execute:async()=>{writes++;return {status:'ready'};},provider:async()=>++next===1?{stopReason:'tool_calls',toolCalls:[action]}:{stopReason:'tool_calls',toolCalls:[{id:'finish',name:'finish_batch',arguments:{handledInputIds:[id]}}]}});
 assert.equal((await second.run()).status,'completed');assert.equal(writes,1);assert.equal(receipts.size,1);
});

test('changed action scope reaches real Calendar client twice but deterministic provenance creates one event',async()=>{
 const {createCalendarClient}=await import('../server/google/calendar-client.js');
 const {readCalendarConfig,CALENDAR_REQUIRED_SCOPES}=await import('../server/google/calendar-config.js');
 const target='fixture@group.calendar.google.com',events=new Map();let mutations=0,executions=0;
 const calendarPrincipal={id:'worker',calendarAccess:true,calendarId:target,allowedSourceIds:[source],calendarSources:[{boardId:'board_1',sourceId:source}]};
 const calendarArgs={sourceKey:'miro:board_1:item_1',sourceUrl:'https://miro.com/app/board/board_1/?moveToWidget=item_1',title:'Study',start:{date:'2026-10-22'},end:{date:'2026-10-23'}};
 const client=createCalendarClient({config:readCalendarConfig({GOOGLE_CLIENT_ID:'fixture',GOOGLE_CLIENT_SECRET:'fixture',GOOGLE_REFRESH_TOKEN:'fixture',GOOGLE_EXPECTED_ACCOUNT_EMAIL:'club@example.test',GOOGLE_CALENDAR_ID:target}),oauthClient:{setCredentials(){},getAccessToken:async()=>({token:'fixture'}),getTokenInfo:async()=>({scopes:CALENDAR_REQUIRED_SCOPES})},fetchImpl:async(value,init)=>{
  const url=new URL(value);if(url.hostname==='gmail.googleapis.com')return Response.json({emailAddress:'club@example.test'});
  if(url.pathname.includes('/calendarList/'))return Response.json({id:target,accessRole:'writer'});
  const match=/\/calendars\/([^/]+)\/events(?:\/([^/]+))?$/.exec(url.pathname);assert(match);assert.equal(decodeURIComponent(match[1]),target);const eventId=match[2]&&decodeURIComponent(match[2]);
  if(init.method==='GET')return events.has(eventId)?Response.json(events.get(eventId)):Response.json({}, {status:404});
  assert.equal(init.method,'POST','An identical retry may not patch or insert again');assert.equal(url.searchParams.get('sendUpdates'),'none');mutations++;const body=JSON.parse(init.body);const saved={...body,etag:'"fixture-1"'};events.set(body.id,saved);return Response.json(saved);
 }});
 const extra={...structuredClone(input),uuid:randomUUID()},receipts=new Map();const observedKeys=[];
 const execute=async(_,context)=>{executions++;observedKeys.push(context.idempotencyKey);return client.upsertEvent({...calendarArgs,principal:calendarPrincipal,idempotencyKey:context.idempotencyKey});};
 let round=0;const first=handlerFixture({inputs:[input,extra],receipts,execute,provider:async()=>++round===1?{stopReason:'tool_calls',toolCalls:[{id:'save',name:'save_event',arguments:{inputIds:[id,extra.uuid],arguments:{title:'Study'}}}]}:{stopReason:'stop',toolCalls:[]}});
 assert.equal((await first.run()).status,'incomplete_batch');assert.equal(mutations,1);
 let retryRound=0;const retry=handlerFixture({inputs:[input],receipts,execute,provider:async()=>++retryRound===1?{stopReason:'tool_calls',toolCalls:[{id:'save',name:'save_event',arguments:{inputIds:[id],arguments:{title:'Study'}}}]}:{stopReason:'tool_calls',toolCalls:[{id:'finish',name:'finish_batch',arguments:{handledInputIds:[id]}}]}});
 assert.equal((await retry.run()).status,'completed');assert.equal(executions,2,'Changed queue scope reaches adapter instead of reusing receipt');assert.notEqual(observedKeys[0],observedKeys[1]);assert.equal(mutations,1);assert.equal(events.size,1);
});
