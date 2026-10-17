import test from 'node:test';
import assert from 'node:assert/strict';
import {createApp} from '../server/app.js';
import {readConfig} from '../server/config.js';
import {createLiveRetrievalTools} from '../tools/discord/index.js';
import {GOOGLE_TOOLS,executeGoogleTool} from '../tools/google/index.js';
const env={LLM_PROVIDER:'openai-compatible',LLM_MODEL:'offline-fixture',LLM_API_KEY:'fixture-private-key',DEV_LIVE_DISCORD_ENABLED:'true',DEV_GOOGLE_ENABLED:'true',DISCORD_GUILD_ID:'100'};
const config=readConfig(env),transport={incoming:{socket:{remoteAddress:'127.0.0.1'}}};
const source={id:'discord:200:400',title:'Member',url:'https://discord.com/channels/100/200/400',excerpt:'Club meeting is Friday',channelId:'200',retrieval:'live'};
const body=JSON.stringify({messages:[{role:'user',content:'What did general discuss last week?'}]});
const request=(app,path,extra={})=>app.request(`http://localhost:3001${path}`,{method:'POST',headers:{'content-type':'application/json',origin:'http://localhost:5173'},body,...extra},transport);
const events=async response=>(await response.text()).trim().split('\n').map(JSON.parse);
test('HTTP stream executes live tools first and exposes actual evidence to answer provider without archive access',async()=>{
  const order=[];let round=0;const liveDiscordTools=createLiveRetrievalTools({guildId:'100',service:{readWindow:async({principal,channelId,from,to})=>{assert.equal(principal.liveDiscord.mode,'local-operator');assert.equal(channelId,'200');assert(from<to);order.push('live');return {status:'ready',sources:[source],coverage:{complete:true,from,to,matchedCount:1}};}}});
  const app=createApp({config,repository:{configured:true,search(){throw Error('Archive retrieval forbidden');}},discordStore:new Proxy({configured:true},{get:(target,key)=>key in target?target[key]:()=>{throw Error('No raw reads or writes');}}),liveDiscordTools,liveDiscordService:{configured:true},summaryFallback:async()=>{throw Error('No fallback after complete live read');},provider:{planTools:async()=>round++===0?[{name:'read_discord_window',arguments:{channelId:'200',from:'2026-10-01T04:00:00Z',to:'2026-10-08T04:00:00Z'}}]:[],async *stream({system}){order.push('answer');assert(system.includes('Club meeting is Friday'));assert(system.includes('messages retrieved LIVE'));assert(!system.includes('FALLBACK ONLY'));yield 'Friday [source](https://discord.com/channels/100/200/400)';}}});
  const response=await request(app,'/api/chat');assert.equal(response.status,200);const records=await events(response);assert.deepEqual(order,['live','answer']);assert.deepEqual(records.map(r=>r.type),['meta','delta','done']);assert.equal(records[0].sources[0].retrievalMode,'live');assert.equal(records[0].retrieval[0].coverage.complete,true);assert(!JSON.stringify(records).includes('fixture-private-key'));
});
test('production auth and spoofed loopback headers cannot grant Discord or Google tools',async()=>{
  for(const production of [true,false]){
    let calls=0;const app=createApp({config:readConfig({...env,...(production?{NODE_ENV:'production'}:{})}),liveDiscordTools:{tools:[{name:'search_discord'}],execute:()=>{calls++;return {status:'ready',sources:[]};}}});
    const response=await app.request('http://localhost:3001/api/tools/search_discord',{method:'POST',headers:{origin:'http://localhost:5173','content-type':'application/json','x-forwarded-for':'127.0.0.1','x-real-ip':'127.0.0.1'},body:'{}'},production?transport:{incoming:{socket:{remoteAddress:'203.0.113.1'}}});assert.equal(response.status,403);assert.equal(calls,0);
    const status=await app.request('http://localhost:3001/api/status',{},production?transport:undefined);const data=await status.json();assert.equal(data.access.allowed,false);assert.equal(data.discord.liveAllowed,false);assert.equal(data.google.allowed,false);
  }
});
test('explicit local flags determine per-connector access and status remains secret-free',async()=>{
  const app=createApp({config,liveDiscordService:{configured:true},googleClient:{status:()=>({configured:false,oauthVerified:false,status:'not_configured'})}});const response=await app.request('http://localhost:3001/api/status',{},transport);const status=await response.json();assert.equal(status.discord.liveAllowed,true);assert.equal(status.discord.retrieval,'live_only');assert(!Object.hasOwn(status.discord,'storedSummaries'));assert.equal(status.google.allowed,true);assert.equal(status.google.configured,false);assert(!JSON.stringify(status).includes('fixture-private-key'));
  const disabled=createApp({config:readConfig({...env,DEV_GOOGLE_ENABLED:'false',DEV_LIVE_DISCORD_ENABLED:'false'})});const status2=await (await disabled.request('http://localhost:3001/api/status',{},transport)).json();assert.equal(status2.discord.liveAllowed,false);assert.equal(status2.google.allowed,false);
});
test('HTTP tools expose read-only definitions and reject unknown SQL/send/write names',async()=>{
  const liveDiscordTools=createLiveRetrievalTools({guildId:'100'});const app=createApp({config,liveDiscordTools,googleTools:{tools:GOOGLE_TOOLS,execute:options=>executeGoogleTool({...options,client:{configured:false}})}});
  const list=await (await app.request('http://localhost:3001/api/tools',{},transport)).json();assert.equal(list.policy.discord,'live_only');assert(!Object.hasOwn(list.policy,'supabase'));assert.equal(list.tools.length,8);assert(list.tools.every(t=>!/(send|write|sql|delete|post)/.test(t.name)));
  for(const name of ['execute_sql','send_gmail','delete_drive','post_discord'])assert.equal((await request(app,`/api/tools/${name}`,{body:'{}'})).status,503);
  assert.equal((await request(app,'/api/tools/read_discord_messages',{body:JSON.stringify({url:'https://discord.com/channels/101/200/400'})})).status,400);
  assert.equal((await request(app,'/api/tools/search_gmail',{body:JSON.stringify({query:'budget'})})).status,503);
});
test('HTTP permission-denied tools never use summaries or invent retrieved sources',async()=>{
  let fallback=0;const app=createApp({config,liveDiscordTools:{tools:[{name:'read_discord_window'}],execute:async()=>({status:'permission_denied',sources:[],coverage:{complete:false}})},summaryFallback:async()=>{fallback++;return {status:'ready',sources:[source]};},provider:{planTools:async()=>[{name:'read_discord_window',arguments:{channelId:'200',from:'2026-10-01T04:00:00Z',to:'2026-10-08T04:00:00Z'}}],async *stream({system}){assert(system.includes('No club knowledge was retrieved'));yield 'Cannot access that channel.';}}});const records=await events(await request(app,'/api/chat'));assert.equal(fallback,0);assert.deepEqual(records[0].sources,[]);assert.equal(records[0].knowledgeStatus,'forbidden');
});
test('HTTP live failure never reaches an injected persisted fallback or exposes non-live facts',async()=>{
 let fallbackCalls=0;const app=createApp({config,liveDiscordTools:{tools:[{name:'read_discord_window'}],execute:async()=>({status:'discord_unavailable',sources:[]})},summaryFallback:async()=>{fallbackCalls++;return {status:'ready',sources:[{...source,excerpt:'INVENTED_STORED_SENTINEL'}]};},provider:{planTools:async()=>[{name:'read_discord_window',arguments:{channelId:'200',from:'2026-10-01T04:00:00Z',to:'2026-10-08T04:00:00Z'}}],async *stream({system}){assert(!system.includes('INVENTED_STORED_SENTINEL'));assert(!system.includes('FALLBACK ONLY'));assert(system.includes('No club knowledge was retrieved'));yield 'Live messages are currently unavailable.';}}});const records=await events(await request(app,'/api/chat'));assert.equal(fallbackCalls,0);assert.deepEqual(records[0].sources,[]);
});
test('ordinary authenticated readers cannot reach catalogue administrative writes or reads',async()=>{
 let calls=0;const app=createApp({config,auth:()=>({id:'reader',allowedSourceIds:[]}),discordStore:{configured:true,listChannels(){calls++;},configureChannel(){calls++;}}});
 const get=await app.request('http://localhost:3001/api/admin/discord',{},transport);assert.equal(get.status,403);
 const put=await app.request('http://localhost:3001/api/admin/discord/channels',{method:'PUT',headers:{origin:'http://localhost:5173','content-type':'application/json'},body:JSON.stringify({channelId:'200'})},transport);assert.equal(put.status,403);assert.equal(calls,0);
});
