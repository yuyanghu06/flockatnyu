import test from 'node:test';
import assert from 'node:assert/strict';
import {createLiveDiscordRetrieval} from '../server/discord/live-retrieval.js';
import {createLiveDiscordClient} from '../server/discord/live-client.js';
const gid='100',parent='200',child='210',category='150';
const sid=n=>'22222222-2222-4222-8222-'+String(n).padStart(12,'0');
const hit=(channel_id,id=400)=>({id:String(id),channel_id,guild_id:gid,timestamp:'2026-10-01T12:00:00Z',author:{id:'300',username:'Fixture'},content:'SOURCE_'+channel_id+'_'+id,hit:true});
function fixture({threads=[child],messages=[hit(child),hit(parent,401)],mutate}={}){
 const sources=new Map([[parent,sid(1)],...threads.map((id,i)=>[id,sid(i+2)])]);
 const details=new Map([[parent,{id:parent,guild_id:gid,type:0,parent_id:category,name:'Parent'}],...threads.map(id=>[id,{id,guild_id:gid,type:11,parent_id:parent,name:'Thread'}])]);
 const state={rows:[...sources].map(([channelId,sourceId])=>({enabled:true,guildId:gid,channelId,sourceId})),policy:{guildId:gid,revision:1,paused:false,excludedChannelIds:[],excludedCategoryIds:[]},allow:[...sources.values()],calls:new Map(),searched:0,finalStatus:'ready'};
 const store={getPolicy:async()=>({status:'ready',policy:structuredClone(state.policy)}),listSyncChannels:async()=>({status:state.finalStatus,channels:structuredClone(state.rows)})};
 const client={configured:true,getCurrentApplication:async()=>({flags:1<<18}),getGuildChannels:async()=>[details.get(parent),{id:category,guild_id:gid,type:4,parent_id:null}],
  getChannel:async args=>{state.calls.set(args.channelId,(state.calls.get(args.channelId)||0)+1);if(state.denied===args.channelId)throw Object.assign(new Error('permission_denied'),{code:'permission_denied'});if(state.onChannel)await state.onChannel(args);return structuredClone(details.get(args.channelId));},
  searchMessages:async args=>{state.searched++;state.searchArgs=args;if(state.onSearch)await state.onSearch();return {messages,totalResults:messages.length};}};
 if(mutate)mutate({state,details,sources,client});
 const service=createLiveDiscordRetrieval({config:{configured:true,guildId:gid,maxChannels:16},store,client});
 return {state,details,sources,client,run:(overrides={})=>service.search({principal:{allowedSourceIds:state.allow,liveDiscord:{mode:'local-operator',guildId:gid}},query:'Fixture',channelIds:[parent],limit:8,...overrides})};
}
test('HTTP200 mixed23selected+2allowedthread hits preserve parent and own thread source IDs',async()=>{
 const f=fixture({threads:[child,'211'],messages:[hit(child),hit('211',401),...Array.from({length:23},(_,i)=>hit(parent,500+i))]});
 const r=await f.run();assert.equal(r.status,'ready');assert.equal(r.coverage.checkedThreadCount,2);assert.equal(r.coverage.matchedCount,25);assert.equal(r.coverage.complete,false);
 for(const row of r.sources)assert.equal(row.sourceId,f.sources.get(row.channelId));assert.deepEqual(f.state.searchArgs.channelIds,[parent]);
});
test('public announcement and private thread types use the same freshly checked parent boundary',async()=>{
 for(const type of [10,11,12]){const f=fixture({mutate:({details})=>{details.get(child).type=type;}});const r=await f.run();assert.equal(r.status,'ready',String(type));assert.equal(r.sources[0].sourceId,sid(2));}
});
test('private membership/bot denial discards every mixed source',async()=>{
 const f=fixture({mutate:({state,details})=>{details.get(child).type=12;state.denied=child;}});const r=await f.run();assert.equal(r.status,'permission_denied');assert.deepEqual(r.sources,[]);
});
test('unregistered, unallowlisted and explicitly excluded returned threads never expose content',async()=>{
 for(const mode of ['unregistered','unallowlisted','excluded']){const f=fixture({mutate:({state})=>{if(mode==='unregistered')state.rows=state.rows.filter(x=>x.channelId!==child);if(mode==='unallowlisted')state.allow=[sid(1)];if(mode==='excluded')state.policy.excludedChannelIds=[child];}});const r=await f.run();assert.equal(r.status,'channel_scope_denied',mode);assert.deepEqual(r.sources,[]);assert.equal(f.state.calls.get(child)||0,0);}
});
test('registered ordinary foreign channel, other parent, malformed parent and wrong guild fail closed',async()=>{
 for(const mode of ['ordinary','otherParent','missingParent','wrongGuild']){const f=fixture({mutate:({state,details})=>{const row=details.get(child);if(mode==='ordinary')row.type=0;if(mode==='otherParent'){row.parent_id='201';state.rows.push({enabled:true,guildId:gid,channelId:'201',sourceId:sid(99)});state.allow.push(sid(99));details.set('201',{id:'201',guild_id:gid,type:0,parent_id:category});}if(mode==='missingParent')row.parent_id=null;if(mode==='wrongGuild')row.guild_id='101';}});const r=await f.run();assert.equal(r.status,'channel_scope_denied',mode);assert.deepEqual(r.sources,[]);}
});
test('a checked thread cannot authorize another returned thread beneath it',async()=>{
 const f=fixture({threads:[child,'211'],mutate:({details})=>{details.get('211').parent_id=child;},messages:[hit(child),hit('211',401)]});const r=await f.run();assert.equal(r.status,'channel_scope_denied');assert.deepEqual(r.sources,[]);
});
test('one repeated thread is freshly checked only once per search',async()=>{
 const f=fixture({messages:Array.from({length:8},(_,i)=>hit(child,400+i))});const r=await f.run();assert.equal(r.status,'ready');assert.equal(f.state.calls.get(child),1);assert.equal(r.coverage.checkedThreadCount,1);
});
test('same-revision child withdrawal, UUID remap, policy change and final catalogue outage discard all evidence',async()=>{
 for(const mode of ['withdraw','remap','policy','outage']){const f=fixture({mutate:({state})=>{state.onChannel=async args=>{if(args.channelId!==child)return;if(mode==='withdraw')state.rows=state.rows.filter(x=>x.channelId!==child);if(mode==='remap')state.rows=state.rows.map(x=>x.channelId===child?{...x,sourceId:sid(99)}:x);if(mode==='policy')state.policy.revision=2;if(mode==='outage')state.finalStatus='unavailable';};}});const r=await f.run();assert.equal(r.status,mode==='outage'?'policy_unavailable':'policy_changed',mode);assert.deepEqual(r.sources,[]);assert(!JSON.stringify(r).includes('SOURCE_'));}
});
test('unique additional thread checks cap16 and disclose skipped thread coverage',async()=>{
 const ids=Array.from({length:17},(_,i)=>String(210+i));const f=fixture({threads:ids,messages:ids.map((id,i)=>hit(id,400+i))});const r=await f.run();assert.equal(r.status,'ready');assert.equal(r.coverage.checkedThreadCount,16);assert.equal(r.coverage.skippedThreadCount,1);assert.equal(r.coverage.reason,'thread_check_budget');assert.equal(r.coverage.channelCoverageComplete,false);assert.equal(f.state.calls.get(ids[16])||0,0);
});
test('over25hit responses and over16requested parents reject before extra thread checks',async()=>{
 const f=fixture({messages:Array.from({length:26},(_,i)=>hit(child,400+i))});assert.equal((await f.run()).status,'invalid_response');assert.equal(f.state.calls.get(child)||0,0);const g=fixture();assert.equal((await g.run({channelIds:Array.from({length:17},(_,i)=>String(200+i))})).status,'invalid_request');assert.equal(g.state.searched,0);assert.equal(g.state.calls.size,0);
});
test('real search decoder ignores unauthorized non-hit nested context rather than widening source scope',async()=>{
 const f=fixture({messages:[]});const wire=createLiveDiscordClient({config:{configured:true,guildId:gid,botToken:'fixture'},fetchImpl:async()=>Response.json({total_results:1,messages:[[{...hit(child),hit:true},{...hit('999',999),hit:false,content:'UNAUTHORIZED_CONTEXT'}]]})});
 f.client.searchMessages=wire.searchMessages;const r=await f.run();assert.equal(r.status,'ready');assert.equal(r.sources.length,1);assert.equal(r.sources[0].sourceId,sid(2));assert(!JSON.stringify(r).includes('UNAUTHORIZED_CONTEXT'));assert.equal(f.state.calls.get('999')||0,0);
});
test('fresh parent ancestry cannot move beneath an excluded category during search',async()=>{
 const f=fixture({mutate:({state,details,client})=>{state.policy.excludedCategoryIds=['151'];client.getGuildChannels=async()=>[details.get(parent),{id:category,guild_id:gid,type:4,parent_id:null},{id:'151',guild_id:gid,type:4,parent_id:null}];state.onSearch=async()=>{details.get(parent).parent_id='151';};}});const r=await f.run();assert.equal(r.status,'channel_scope_denied');assert.deepEqual(r.sources,[]);
});
test('fresh thread parent permission denial cannot return selected-channel or thread contents',async()=>{
 const f=fixture({mutate:({state})=>{state.onSearch=async()=>{state.denied=parent;};}});const r=await f.run();assert.equal(r.status,'permission_denied');assert.deepEqual(r.sources,[]);
});
