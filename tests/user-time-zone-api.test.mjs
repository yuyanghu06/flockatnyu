import test from 'node:test';
import assert from 'node:assert/strict';
import {createApp} from '../server/app.js';
import {readConfig} from '../server/config.js';
import {createLiveRetrievalTools} from '../tools/discord/index.js';
const config=readConfig({LLM_PROVIDER:'openai-compatible',LLM_MODEL:'offline-fixture',LLM_API_KEY:'fixture',DEV_LIVE_DISCORD_ENABLED:'true',DISCORD_GUILD_ID:'100'}),transport={incoming:{socket:{remoteAddress:'127.0.0.1'}}},messages=[{role:'user',content:'What happened today?'}];
function fixture({from='today',to='tomorrow',toolZone}={}){
 const prompts=[],reads=[];let plans=0,answers=0,clocks=0;
 const liveDiscordTools=createLiveRetrievalTools({guildId:'100',service:{readWindow:async args=>{reads.push(args);return {status:'ready',sources:[],coverage:{complete:true,matchedCount:0}};}}});
 const provider={planTools:async({system})=>{prompts.push({kind:'plan',system});return plans++===0?[{name:'read_discord_window',arguments:{channelId:'200',from,to,...(toolZone?{timeZone:toolZone}:{})}}]:[];},async *stream({system}){answers++;prompts.push({kind:'answer',system});yield 'No messages.';}};
 const app=createApp({config,provider,liveDiscordTools,liveDiscordService:{configured:true},now:()=>{clocks++;return new Date(clocks===1?'2026-10-15T01:00:00.000Z':'2026-10-17T01:00:00.000Z');}});
 return {app,prompts,reads,counts:()=>({plans,answers,clocks})};
}
const post=(app,value)=>app.request('http://localhost:3001/api/chat',{method:'POST',headers:{origin:'http://localhost:5173','content-type':'application/json'},body:JSON.stringify(value)},transport);
const stream=async response=>(await response.text()).trim().split('\n').map(JSON.parse);
test('real chat API captures one server clock and interprets today at western local date instead of UTC date',async()=>{
 const f=fixture(),response=await post(f.app,{messages,timeZone:'America/Los_Angeles'});assert.equal(response.status,200);const events=await stream(response);assert.equal(f.counts().clocks,1);assert.equal(f.counts().answers,1);assert.equal(f.reads.length,1);assert.equal(f.reads[0].from,'2026-10-14T07:00:00.000Z');assert.equal(f.reads[0].to,'2026-10-15T07:00:00.000Z');assert.equal(events.find(event=>event.type==='meta').retrieval[0].coverage.timeZone,'America/Los_Angeles');assert.equal(events.find(event=>event.type==='meta').retrieval[0].coverage.from,f.reads[0].from);
 for(const p of f.prompts){assert(p.system.includes('America/Los_Angeles'));assert(p.system.includes('2026-10-14'));assert(p.system.includes('18:00'));assert(!p.system.includes('2026-10-17'));}
});
test('legacy chat without browser zone uses UTC and exact UTC day; eastern zone crosses date independently',async()=>{
 for(const [timeZone,from,to,zone]of [[undefined,'2026-10-15T00:00:00.000Z','2026-10-16T00:00:00.000Z','UTC'],['Asia/Kolkata','2026-10-14T18:30:00.000Z','2026-10-15T18:30:00.000Z',null]]){const f=fixture(),response=await post(f.app,{messages,...(timeZone?{timeZone}:{})});assert.equal(response.status,200);const events=await stream(response);assert.equal(f.reads[0].from,from);assert.equal(f.reads[0].to,to);assert.equal(f.counts().clocks,1);if(zone)assert.equal(events.find(event=>event.type==='meta').retrieval[0].coverage.timeZone,zone);else assert(['Asia/Kolkata','Asia/Calcutta'].includes(events.find(event=>event.type==='meta').retrieval[0].coverage.timeZone));}
});
test('explicit tool zone overrides chat dates while answer retains user context and normalized coverage',async()=>{
 const f=fixture({from:'2026-03-08',to:'2026-03-09',toolZone:'America/New_York'}),response=await post(f.app,{messages,timeZone:'Asia/Kathmandu'});assert.equal(response.status,200);const events=await stream(response);assert.equal(f.reads[0].from,'2026-03-08T05:00:00.000Z');assert.equal(f.reads[0].to,'2026-03-09T04:00:00.000Z');assert.equal(events.find(event=>event.type==='meta').retrieval[0].coverage.timeZone,'America/New_York');const answer=f.prompts.find(p=>p.kind==='answer').system;assert(/Asia\/(Kathmandu|Katmandu)/.test(answer));assert(answer.includes('06:45'));assert(answer.includes('2026-03-08T05:00:00.000Z'));
});
test('explicit offset ISO timestamps remain exact instants through actual chat request',async()=>{
 const f=fixture({from:'2026-10-15T00:00:00+05:45',to:'2026-10-15T01:00:00+05:45'}),response=await post(f.app,{messages,timeZone:'America/Los_Angeles'});assert.equal(response.status,200);await stream(response);assert.equal(f.reads[0].from,'2026-10-14T18:15:00.000Z');assert.equal(f.reads[0].to,'2026-10-14T19:15:00.000Z');
});
test('invalid timezone body fails HTTP400 before planner, answer provider or tool execution',async()=>{
 for(const timeZone of [null,'','Invalid/Zone','+05:30','-0400','UTC+5',1,[],{}]){const f=fixture(),response=await post(f.app,{messages,timeZone});assert.equal(response.status,400,JSON.stringify(timeZone));assert.equal(f.counts().plans,0);assert.equal(f.counts().answers,0);assert.equal(f.reads.length,0);}
});
test('model-proposed invalid dates or explicit zones cannot reach service or broaden requested channel scope',async()=>{
 for(const options of [{from:'2026-02-30',to:'2026-03-01'},{from:'today',to:'today'},{toolZone:'+05:30'}]){const f=fixture(options),response=await post(f.app,{messages,timeZone:'America/New_York'});assert.equal(response.status,200);const events=await stream(response);assert.equal(f.reads.length,0);assert.equal(events.find(event=>event.type==='meta').retrieval[0].status,'invalid_request');assert.deepEqual(events.find(event=>event.type==='meta').sources,[]);}
});
test('direct tool API uses explicit IANA override without planner/provider or member-scope changes',async()=>{
 const f=fixture(),response=await f.app.request('http://localhost:3001/api/tools/read_discord_window',{method:'POST',headers:{origin:'http://localhost:5173','content-type':'application/json'},body:JSON.stringify({channelId:'200',from:'2026-03-08',to:'2026-03-09',timeZone:'America/New_York'})},transport);assert.equal(response.status,200);const result=await response.json();assert.equal(f.reads[0].from,'2026-03-08T05:00:00.000Z');assert.equal(f.reads[0].to,'2026-03-09T04:00:00.000Z');assert.equal(result.coverage.timeZone,'America/New_York');assert.equal(f.counts().plans,0);assert.equal(f.counts().answers,0);assert.equal(f.counts().clocks,1);
 const denied=fixture(),bad=await denied.app.request('http://localhost:3001/api/tools/read_discord_window',{method:'POST',headers:{origin:'http://localhost:5173','content-type':'application/json'},body:JSON.stringify({channelId:'200',from:'2026-03-08',to:'2026-03-09',timeZone:'+05:30'})},transport);assert.equal(bad.status,400);assert.equal(denied.reads.length,0);assert.equal(denied.counts().answers,0);
});
