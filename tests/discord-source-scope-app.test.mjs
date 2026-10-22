import test from 'node:test';
import assert from 'node:assert/strict';
import {createApp} from '../server/app.js';
const guildId='100',source=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
function setup() {
 const state={enabled:true,available:true,seen:[]};
 const principal={id:'verified-operator',allowedSourceIds:[source(99)],googleAccess:true,liveDiscord:{mode:'local-operator',guildId}};
 const capture=({principal})=>{state.seen.push(principal);return {status:'ready',sources:[]};};
 const tools={tools:[{name:'discord_fixture',description:'Fixture',parameters:{type:'object',properties:{}}}],execute:async options=>capture(options)};
 const app=createApp({config:{configured:true,provider:'openai-compatible',timeoutMs:1000,discordGuildId:guildId,retrievalToolsEnabled:true},
  auth:()=>state.principal===undefined?principal:state.principal,
  discordStore:{getPolicy:async()=>({status:state.available?'ready':'unavailable',policy:{guildId,revision:1,paused:false,discoveryEnabled:true,excludedChannelIds:[],excludedCategoryIds:[]}}),
   listSyncChannels:async()=>({status:'ready',channels:[{guildId,channelId:'200',sourceId:source(1),enabled:state.enabled}]})},
  liveDiscordTools:tools,mapPresenceService:{read:async options=>capture(options)},
  provider:{async planTools(){return [{name:'discord_fixture',arguments:{}}];},async *stream(){yield 'Fixture answer';}},audit:{recordEvent:async()=>{}}});
 return {state,app,principal};
}
const json=value=>({method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(value)});
test('authenticated website tools, map and chat receive newly published Discord UUIDs without static configuration',async()=>{
 const f=setup();
 assert.equal((await f.app.request('/api/tools/discord-fixture',json({}))).status,200);
 assert.equal((await f.app.request('/api/map/presence')).status,200);
 const response=await f.app.request('/api/chat',json({messages:[{role:'user',content:'Read channel updates'}],timeZone:'America/New_York'}));
 assert.equal(response.status,200);assert.match(await response.text(),/Fixture answer/);assert.equal(f.state.seen.length,3);
 for(const principal of f.state.seen){assert.deepEqual(principal.allowedSourceIds,[source(1),source(99)]);assert.equal(principal.googleAccess,true);}
 assert.deepEqual(f.principal.allowedSourceIds,[source(99)]);
});
test('a new request immediately reflects manual disable and Discord outages preserve unrelated adapters',async()=>{
 const f=setup();await f.app.request('/api/tools/discord-fixture',json({}));f.state.enabled=false;
 await f.app.request('/api/tools/discord-fixture',json({}));assert.deepEqual(f.state.seen.at(-1).allowedSourceIds,[source(99)]);
 f.state.enabled=true;f.state.available=false;await f.app.request('/api/map/presence');assert.deepEqual(f.state.seen.at(-1).allowedSourceIds,[source(99)]);
});
test('browser-supplied principal cannot enable Discord for authenticated sessions without its server grant',async()=>{
 const f=setup();f.state.principal={id:'no-discord',allowedSourceIds:[source(99)]};
 await f.app.request('/api/tools/discord-fixture',json({principal:f.principal,allowedSourceIds:[source(1)],liveDiscord:f.principal.liveDiscord}));
 assert.deepEqual(f.state.seen.at(-1),f.state.principal);f.state.principal=null;
 assert.equal((await f.app.request('/api/tools/discord-fixture',json({principal:f.principal}))).status,403);assert.equal(f.state.seen.length,1);
});
