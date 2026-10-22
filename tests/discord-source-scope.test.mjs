import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveDiscordSourceIds,withDiscordSourceScope} from '../server/discord/source-scope.js';
const guildId='100',source=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
function fixture() {
 const state={policy:{guildId,revision:3,paused:false,discoveryEnabled:true,excludedChannelIds:[],excludedCategoryIds:[]},
  channels:[{guildId,channelId:'200',sourceId:source(1),enabled:true,policyRevision:3}],calls:[]};
 const store={getPolicy:async args=>{state.calls.push(['policy',args]);return {status:'ready',policy:state.policy};},
  listSyncChannels:async args=>{state.calls.push(['catalogue',args]);return {status:'ready',channels:state.channels};}};
 const principal={id:'trusted',allowedSourceIds:[source(99)],googleAccess:true,liveDiscord:{mode:'local-operator',guildId}};
 return {state,store,principal,resolve:args=>resolveDiscordSourceIds({store,guildId,...args}),enrich:args=>withDiscordSourceScope({principal,store,guildId,...args})};
}
test('resolves fresh enabled same-guild published sources and preserves other grants',async()=>{
 const f=fixture();f.state.channels.push({guildId:'999',channelId:'300',sourceId:source(2),enabled:true},{guildId,channelId:'400',sourceId:source(3),enabled:false});
 assert.deepEqual(await f.resolve(),[source(1)]);const approved=await f.enrich();assert.deepEqual(approved.allowedSourceIds,[source(1),source(99)]);assert.equal(approved.googleAccess,true);assert.deepEqual(f.principal.allowedSourceIds,[source(99)]);
 f.state.channels[0].enabled=false;assert.deepEqual((await f.enrich()).allowedSourceIds,[source(99)]);
 f.state.channels.push({guildId,channelId:'500',sourceId:source(4),enabled:true});assert.ok((await f.enrich()).allowedSourceIds.includes(source(4)));
});
for(const [label,mutate] of [
 ['paused',p=>p.paused=true],['discovery disabled',p=>p.discoveryEnabled=false],
])test(`${label} contributes no dynamic grants`,async()=>{const f=fixture();mutate(f.state.policy);assert.deepEqual(await f.resolve(),[]);assert.deepEqual((await f.enrich()).allowedSourceIds,[source(99)]);});
for(const [label,mutate] of [
 ['wrong guild',s=>s.policy.guildId='999'],['missing policy',s=>s.policy=null],['malformed pause',s=>s.policy.paused='false'],
 ['missing discovery flag',s=>delete s.policy.discoveryEnabled],['invalid exclusion',s=>s.policy.excludedChannelIds=['bad']],
 ['invalid UUID',s=>s.channels[0].sourceId='bad'],['invalid channel',s=>s.channels[0].channelId='bad'],
 ['stale revision',s=>s.channels[0].policyRevision=2],['malformed catalogue',s=>s.channels=null],
 ['duplicate channel',s=>s.channels.push({...s.channels[0],sourceId:source(2)})],
 ['duplicate source',s=>s.channels.push({...s.channels[0],channelId:'201'})],
 ['over capacity',s=>s.channels=Array.from({length:501},(_,i)=>({guildId,channelId:String(1000+i),sourceId:source(i),enabled:true}))],
])test(`malformed scope fails closed: ${label}`,async()=>{
 const f=fixture();mutate(f.state);await assert.rejects(f.resolve);assert.equal(await f.enrich(),f.principal);
});
test('store outage and cancellation retain unrelated principal without granting Discord',async()=>{
 const f=fixture();f.store.getPolicy=async()=>({status:'unavailable'});await assert.rejects(f.resolve);assert.equal(await f.enrich(),f.principal);
 f.store.getPolicy=async()=>{throw Error('private');};assert.equal(await f.enrich(),f.principal);
 const abort=new AbortController();abort.abort();assert.equal(await f.enrich({signal:abort.signal}),f.principal);
});
test('only backend-granted matching guild local operator principals receive discovery scope',async()=>{
 const f=fixture();for(const principal of [null,{id:'visitor',allowedSourceIds:[]},{...f.principal,liveDiscord:{mode:'member',guildId}},{...f.principal,liveDiscord:{mode:'local-operator',guildId:'999'}},{...f.principal,allowedSourceIds:['invalid']}])assert.equal(await f.enrich({principal}),principal);
 assert.equal(f.state.calls.length,0);assert.deepEqual((await f.enrich({principal:{...f.principal,allowedSourceIds:[]}})).allowedSourceIds,[source(1)]);
});
test('Discord transport dynamic additions stay within its approved audience',async()=>{
 const f=fixture();const principal={...f.principal,liveDiscord:{...f.principal.liveDiscord,transport:'discord-chat',allowedSourceIds:[source(2)]}};
 assert.deepEqual((await f.enrich({principal})).allowedSourceIds,[source(99)]);
 principal.liveDiscord.allowedSourceIds=[source(1)];assert.deepEqual((await f.enrich({principal})).allowedSourceIds,[source(1),source(99)]);
});
test('combined static and dynamic source bound cannot exceed principal/RPC capacity',async()=>{
 const f=fixture(),principal={...f.principal,allowedSourceIds:Array.from({length:500},(_,i)=>source(i+2))};assert.equal(await f.enrich({principal}),principal);
});
