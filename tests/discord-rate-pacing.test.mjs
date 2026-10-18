import test from 'node:test';
import assert from 'node:assert/strict';
import {getEventListeners} from 'node:events';
import {createDiscordClient} from '../server/discord/client.js';
import {createLiveDiscordClient} from '../server/discord/live-client.js';
import {createDiscordRequestPacer,discordPause,discordRetryDelay} from '../server/discord/request-pacing.js';
import {readDiscordConfig} from '../server/discord/config.js';
import {readLiveDiscordConfig} from '../server/discord/live-config.js';
import {createLiveChatTools} from '../tools/discord/live-summary.js';

const config={configured:true,guildId:'100',botToken:'synthetic-rate-test'};
function clockPacer(interval=750){let clock=0;const waits=[];return {now:()=>clock,waits,pacer:createDiscordRequestPacer({minIntervalMs:interval,now:()=>clock,sleep:async(ms,signal)=>{assert(!signal?.aborted);waits.push(ms);clock+=ms;}})};}
test('base/live clients for the same bot transport serialize metadata and content requests with gentle spacing',async()=>{
 const f=clockPacer(),starts=[];let active=0,max=0;
 const fetchImpl=async url=>{starts.push(f.now());active++;max=Math.max(max,active);await Promise.resolve();active--;return Response.json(url.includes('/guilds/')?{id:'100'}:[]);};
 const base=createDiscordClient({config,fetchImpl,requestPacer:f.pacer}),live=createLiveDiscordClient({config,fetchImpl,requestPacer:f.pacer});
 await Promise.all([base.getGuild(),live.getMessages({channelId:'200'}),base.getMessages({channelId:'201'})]);
 assert.equal(max,1);assert.deepEqual(starts,[0,750,1500]);
});
test('shared default registry coordinates distinct clients, while a different bot has an independent queue',async()=>{
 const starts=[];const fetchImpl=async()=>{starts.push(performance.now());return Response.json([]);};
 const c={...config,pacing:{minIntervalMs:15}};
 const a=createDiscordClient({config:c,fetchImpl}),b=createLiveDiscordClient({config:c,fetchImpl});
 await Promise.all([a.getMessages({channelId:'200'}),b.getMessages({channelId:'201'})]);
 assert(starts[1]-starts[0]>=10);
 const independent=createLiveDiscordClient({config:{...c,botToken:'different-synthetic-bot'},fetchImpl});await independent.getMessages({channelId:'202'});
});
test('429 headers and JSON cooldowns over thirty seconds postpone every queued route without retry bursts',async()=>{
 const f=clockPacer(),starts=[];let count=0;
 const fetchImpl=async()=>{starts.push(f.now());return ++count===1?Response.json({retry_after:40},{status:429,headers:{'Retry-After':'65','X-RateLimit-Reset-After':'60'}}):Response.json([]);};
 const a=createLiveDiscordClient({config,fetchImpl,requestPacer:f.pacer}),b=createDiscordClient({config,fetchImpl,requestPacer:f.pacer});
 await Promise.all([a.getMessages({channelId:'200'}),b.getMessages({channelId:'201'})]);
 assert.equal(starts.length,3);assert(starts[1]>=65000);assert(starts[2]-starts[1]>=750);assert(f.waits.includes(60000));
});
test('successful exhausted bucket responses proactively delay following reads; numeric and HTTP-date Retry-After work',async()=>{
 const f=clockPacer(),starts=[];let count=0;
 const fetchImpl=async()=>{starts.push(f.now());return Response.json([],{headers:++count===1?{'X-RateLimit-Remaining':'0','X-RateLimit-Reset-After':'2.5'}:{}});};
 const a=createDiscordClient({config,fetchImpl,requestPacer:f.pacer});await a.getMessages({channelId:'200'});await a.getMessages({channelId:'200'});
 assert.deepEqual(starts,[0,2500]);
 assert.equal(discordRetryDelay(new Response('',{headers:{'Retry-After':'3'}}),{retry_after:2},0),3000);
 assert.equal(discordRetryDelay(new Response('',{headers:{'Retry-After':'Thu, 01 Jan 1970 00:00:05 GMT'}}),{},1000),4000);
});
test('malformed/HTML 429s retain bounded backoff and sanitized upstream classification',async()=>{
 const f=clockPacer();let count=0;
 const a=createDiscordClient({config,requestPacer:f.pacer,fetchImpl:async()=>{count++;return new Response('PRIVATE UPSTREAM',{status:429,headers:{'Retry-After':'1'}});}});
 await assert.rejects(a.getMessages({channelId:'200'}),{code:'rate_limited',message:'rate_limited'});assert.equal(count,4);assert(f.waits.every(wait=>wait>=1000));
});
test('queued cancellation never overtakes a running request, never dispatches aborted work, and removes listeners',async()=>{
 const p=createDiscordRequestPacer({minIntervalMs:0});let release;const calls=[];
 const first=p.run(async()=>{calls.push('first');await new Promise(resolve=>{release=resolve;});});
 while(!release)await Promise.resolve();
 const controller=new AbortController();const second=p.run(async()=>calls.push('aborted'),{signal:controller.signal});
 const third=p.run(async()=>calls.push('third'));controller.abort();await assert.rejects(second,{code:'aborted'});assert.deepEqual(calls,['first']);
 release();await Promise.all([first,third]);assert.deepEqual(calls,['first','third']);assert.equal(getEventListeners(controller.signal,'abort').length,0);
});
test('long cooldown cancellation and local waiting deadline are bounded without mislabeling them as upstream 429',async()=>{
 const controller=new AbortController();const sleep=discordPause(60000,controller.signal);controller.abort();await assert.rejects(sleep,{code:'aborted'});assert.equal(getEventListeners(controller.signal,'abort').length,0);
 const p=createDiscordRequestPacer({minIntervalMs:0});let release,reads=0;
 const fetchImpl=async()=>{reads++;await new Promise(resolve=>{release=resolve;});return Response.json([]);};
 const a=createDiscordClient({config,fetchImpl,requestPacer:p});const first=a.getMessages({channelId:'200'});while(!release)await Promise.resolve();
 const b=createDiscordClient({config:{...config,pacing:{requestBudgetMs:5}},fetchImpl,requestPacer:p});
 const releaseTimer=setTimeout(()=>release(),40);
 await assert.rejects(b.getMessages({channelId:'201'}),{code:'budget_exhausted'});assert.equal(reads,1);await first;clearTimeout(releaseTimer);
});
test('summary channel scans are sequential and preserve truthful per-channel failures and partial coverage',async()=>{
 let active=0,max=0;const order=[];
 const service={getCatalogue:async()=>({status:'ready',complete:true,channels:[{channelId:'200',name:'one'},{channelId:'201',name:'two'}]}),
  readWindow:async({channelId})=>{active++;max=Math.max(max,active);order.push(channelId);await Promise.resolve();active--;return {status:channelId==='201'?'rate_limited':'ready',sources:[],coverage:{complete:channelId==='200',returnedCount:0,reason:channelId==='201'?'rate_limited':null}};}};
 const tools=createLiveChatTools({service,guildId:'100',config:{configured:false},provider:{configured:false}});
 const result=await tools.execute({name:'read_discord_summary',arguments:{scope:'eboard'},principal:{id:'test'},timeContext:{now:'2026-10-18T16:00:00Z',timeZone:'America/New_York'}});
 assert.equal(max,1);assert.deepEqual(order,['200','201']);assert.equal(result.status,'partial');assert.equal(result.coverage.complete,false);assert.equal(result.channelCoverage[1].status,'rate_limited');assert.equal(result.sources.length,0);
});
test('production pacing and longer scan defaults keep existing message/page caps',()=>{
 const base=readDiscordConfig({}),live=readLiveDiscordConfig({});assert.equal(base.pacing.minIntervalMs,750);assert.equal(live.pacing.minIntervalMs,750);assert.equal(live.maxRuntimeMs,120000);
 assert.equal(live.maxPages,20);assert.equal(live.maxMessages,2000);assert.equal(live.maxChannels,16);
});
