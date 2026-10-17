import test from 'node:test';
import assert from 'node:assert/strict';
import {createLiveChatTools} from '../tools/discord/live-summary.js';
import {retrieveAssistantContext} from '../server/assistant-context.js';
import {SUMMARY_FIELDS} from '../server/discord/summary-provider.js';
const guildId='100',channelId='200',from='2026-10-01T04:00:00.000Z',to='2026-10-08T04:00:00.000Z';
const principal={id:'local-development',liveDiscord:{mode:'local-operator',guildId}};
const config={configured:true,maxInputBytes:49152,maxReduceLevels:16};
const summary=ids=>({...Object.fromEntries(SUMMARY_FIELDS.map(field=>[field,[]])),overview:[{text:'All supplied evidence summarized.',messageIds:ids.slice(0,12)}]});
const makeMessages=(count=9,size=30)=>Array.from({length:count},(_,i)=>({id:String(1000+i),timestamp:from,content:`msg${i}:`+'x'.repeat(size),author:{id:'400',name:'Member'},replyToMessageId:null}));
const sourcesFor=messages=>messages.slice(0,8).map(m=>({id:m.id,url:`https://discord.com/channels/${guildId}/${channelId}/${m.id}`,excerpt:m.content.slice(0,1800),title:'Member'}));
function fixture({messages=makeMessages(),status='ready',coverage={},providerHandler,fetchHandler,configuration=config,providerConfigured=true,cost=0.001}={}){
  const mapInputs=[],calls=[],reservations=[];let fetched=0,rawRead=0,dispatched=0;
  const fetchedResult={status,messages,sources:sourcesFor(messages),channel:{name:'general'},coverage:{complete:status==='ready',from,to,matchedCount:messages.length,returnedCount:messages.length,sourceTextTruncated:messages.length>8,...coverage}};
  const service={async fetchWindow(args){fetched++;assert.deepEqual(args.principal,principal);return fetchHandler?fetchHandler(args):fetchedResult;},async readWindow(){rawRead++;return {status:'ready',sources:sourcesFor(messages),coverage:{complete:messages.length<=8}};}};
  const provider={configured:providerConfigured,async summarize(args){calls.push(args);if(args.stage==='map')mapInputs.push(...args.input);if(providerHandler)return providerHandler(args);const reservation=await args.beforeDispatch({maxCostUsd:cost,inputTokens:100,outputTokens:10});reservations.push(reservation);if(reservation.status!=='ready')return reservation;dispatched++;assert.equal((await args.afterDispatch({reservation,status:'succeeded',usage:{inputTokens:100,outputTokens:10}})).status,'ready');return {status:'ready',summary:summary(args.allowedMessageIds)};}};
  const tools=createLiveChatTools({service,guildId,config:configuration,provider});
  return {tools,execute:extras=>tools.execute({name:'read_discord_window',arguments:{channelId,from,to},principal,...extras}),calls,mapInputs,reservations,fetched:()=>fetched,rawRead:()=>rawRead,dispatched:()=>dispatched};
}
test('small complete windows and empty windows return originals without any summary model call',async()=>{
  for(const count of [0,1,8]){const f=fixture({messages:makeMessages(count),coverage:{sourceTextTruncated:false}});const r=await f.execute();assert.equal(r.status,'ready');assert.equal(r.sources.length,count);assert.equal(r.coverage.complete,true);assert.equal(f.calls.length,0);assert(!('messages' in r));}
});
test('large complete windows summarize every original in RAM and return original citation provenance',async()=>{
  const messages=makeMessages(30);const f=fixture({messages});const r=await f.execute();assert.equal(r.status,'ready');assert.equal(r.coverage.complete,true);assert.equal(r.coverage.directSummary,true);assert.equal(r.coverage.sourceTextTruncated,false);assert.equal(r.coverage.returnedCount,30);assert.deepEqual(f.mapInputs.map(m=>m.messageId),messages.map(m=>m.id));assert.equal(r.sources[0].retrievalMode,'live_bot_summary');assert.equal(r.sources[0].periodStart,from);assert.equal(r.sources[0].periodEnd,to);assert.equal(r.sources[0].url,`https://discord.com/channels/${guildId}/${channelId}/1000`);assert(!('messages' in r));assert.equal(f.rawRead(),0);
});
test('complete fetch with long original triggers direct summary even with <=8 messages',async()=>{
  const f=fixture({messages:makeMessages(2,6000),coverage:{sourceTextTruncated:true}});const r=await f.execute();assert.equal(r.coverage.directSummary,true);assert.equal(f.mapInputs.length,2);assert(f.mapInputs[0].content.length>1800);
});
test('map/reduce path consumes all original messages and carries original IDs through reduction',async()=>{
  const messages=makeMessages(12,500);const f=fixture({messages,configuration:{...config,maxInputBytes:1600}});const r=await f.execute();assert.equal(r.status,'ready');assert.equal(f.mapInputs.length,messages.length);assert(f.calls.some(c=>c.stage==='reduce'));const validIds=new Set(messages.map(m=>m.id));for(const c of f.calls)assert(c.allowedMessageIds.every(id=>validIds.has(id)));assert(f.dispatched()<=12);
});
test('partial fetch and bot access denial never invoke the summarizer',async()=>{
  for(const status of ['partial','permission_denied','forbidden','channel_scope_denied','not_configured']){const f=fixture({status,coverage:{complete:false,reason:status}});const r=await f.execute();assert.equal(r.status,status);assert.equal(r.coverage.complete,false);assert.equal(f.calls.length,0);assert(!('messages' in r));}
});
test('unknown arguments fail validation before fetching or paying for model work',async()=>{
  const f=fixture();const r=await f.execute({arguments:{channelId,from,to,sql:'delete from messages',principal:{isAdmin:true}}});assert.equal(r.status,'invalid_request');assert.equal(f.fetched(),0);assert.equal(f.calls.length,0);
});
test('missing summary configuration uses bounded live read without model calls',async()=>{
  for(const opts of [{configuration:{...config,configured:false}},{providerConfigured:false}]){const f=fixture(opts);const r=await f.execute();assert.equal(r.status,'ready');assert.equal(f.calls.length,0);assert.equal(f.fetched(),0);assert.equal(f.rawRead(),1);assert.equal(r.coverage.complete,false);}
});
test('foreign model citations remain partial without persisted fallback',async()=>{
  const f=fixture({providerHandler:async()=>({status:'ready',summary:summary(['999999'])})});const result=await f.execute();assert.equal(result.status,'partial');assert.equal(result.coverage.complete,false);assert(!result.sources.some(s=>s.url.endsWith('/999999')));
  let fallback=0,round=0;const retrieved=await retrieveAssistantContext({messages:[{role:'user',content:'Summarize general last week'}],principal,liveTools:f.tools,provider:{planTools:async()=>round++===0?[{name:'read_discord_window',arguments:{channelId,from,to}}]:[]},fallback:async()=>{fallback++;return {status:'ready',sources:[{id:'stored',url:'https://example.com/summary',excerpt:'Stored weekly evidence',tier:'weekly',periodStart:from,periodEnd:to}]};}});assert.equal(fallback,0);assert(!retrieved.sources.some(s=>s.retrievalMode==='stored_summary_fallback'));assert.equal(retrieved.results[0].coverage.complete,false);
});
test('summary provider failure returns explicitly partial original evidence without persistence hooks',async()=>{
  const f=fixture({providerHandler:async()=>{throw Error('fixture-provider-private-key');}});const r=await f.execute({store:new Proxy({},{get(){throw Error('Database persistence forbidden');}})});assert.equal(r.status,'partial');assert.equal(r.coverage.complete,false);assert.equal(r.coverage.reason,'live_summary_unavailable');assert(!JSON.stringify(r).includes('fixture-provider-private-key'));assert(r.sources.length<=8);
});
test('request-local maximum 12 dispatched summaries stops a larger window instead of runaway model work',async()=>{
  const f=fixture({messages:makeMessages(20,500),configuration:{...config,maxInputBytes:900}});const r=await f.execute();assert.equal(r.status,'partial');assert.equal(r.coverage.complete,false);assert.equal(f.dispatched(),12);assert.equal(f.reservations.at(-1).status,'budget_exhausted');
});
test('request-local $0.10 reservation budget stops calls independently of the count cap',async()=>{
  const f=fixture({messages:makeMessages(20,500),configuration:{...config,maxInputBytes:900},cost:0.06});const r=await f.execute();assert.equal(r.status,'partial');assert.equal(f.dispatched(),1);assert.equal(f.reservations.at(-1).status,'budget_exhausted');
});
test('summary cancellation propagates promptly and does not silently replace evidence with fallback',async()=>{
  const abort=new AbortController();const f=fixture({providerHandler:async()=>{abort.abort();return {status:'aborted'};}});await assert.rejects(f.execute({signal:abort.signal}),{name:'AbortError'});
});
test('fully summarized live window does not authorize stored-summary fallback',async()=>{
  const f=fixture();let fallback=0,round=0;const r=await retrieveAssistantContext({messages:[{role:'user',content:'Summarize last week'}],principal,liveTools:f.tools,provider:{planTools:async()=>round++===0?[{name:'read_discord_window',arguments:{channelId,from,to}}]:[]},fallback:async()=>{fallback++;throw Error('No fallback after live summary');}});assert.equal(fallback,0);assert(r.sources.some(s=>s.retrievalMode==='live_bot_summary'));assert.equal(r.results[0].coverage.complete,true);
});
test('two windows in the same request share a reservation budget while a new request gets its own budget',async()=>{
  const f=fixture({cost:0.06}),signal=new AbortController().signal;
  assert.equal((await f.execute({signal})).status,'ready');
  assert.equal((await f.execute({signal,arguments:{channelId,from:'2026-10-08T04:00:00.000Z',to:'2026-10-15T04:00:00.000Z'}})).status,'partial');assert.equal(f.dispatched(),1);
  assert.equal((await f.execute({signal:new AbortController().signal})).status,'ready');assert.equal(f.dispatched(),2);
});
test('the 12-call cap applies across separate windows sharing one request signal',async()=>{
  const f=fixture({messages:makeMessages(8,500),configuration:{...config,maxInputBytes:900},coverage:{sourceTextTruncated:true}}),signal=new AbortController().signal;
  await f.execute({signal});await f.execute({signal,arguments:{channelId,from:'2026-10-08T04:00:00.000Z',to:'2026-10-15T04:00:00.000Z'}});assert.equal(f.dispatched(),12);assert.equal(f.reservations.at(-1).status,'budget_exhausted');
});
test('live-summary identities distinguish different periods of the same channel',async()=>{
  const f=fixture(),signal=new AbortController().signal;const a=await f.execute({signal});const nextFrom='2026-10-08T04:00:00.000Z',nextTo='2026-10-15T04:00:00.000Z';const b=await f.execute({signal,arguments:{channelId,from:nextFrom,to:nextTo}});assert.notEqual(a.sources[0].id,b.sources[0].id);assert(b.sources[0].id.includes(nextFrom));assert(b.sources[0].id.includes(nextTo));
});
