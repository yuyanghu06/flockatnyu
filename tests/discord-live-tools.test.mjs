import test from 'node:test';
import assert from 'node:assert/strict';
import {readLiveDiscordConfig, liveDiscordStatus} from '../server/discord/live-config.js';
import {createLiveDiscordClient, discordSnowflakeAt} from '../server/discord/live-client.js';
import {createLiveDiscordRetrieval} from '../server/discord/live-retrieval.js';
import {createLiveRetrievalTools, validateLiveDiscordArguments} from '../tools/discord/index.js';

const guildId='100', channelId='200', categoryId='300';
const sourceId='22222222-2222-4222-8222-222222222222';
const principal={allowedSourceIds:[sourceId],liveDiscord:{mode:'local-operator',guildId}};
const from='2026-10-01T04:00:00.000Z',to='2026-10-08T04:00:00.000Z';
const config={configured:true,guildId,botToken:'fixture-secret',pacing:{minIntervalMs:0}};
const message=(at, extra={})=>({id:discordSnowflakeAt(at),channel_id:channelId,guild_id:guildId,author:{id:'400',username:'Member'},timestamp:at,content:'hello',...extra});
function fixture({policy={},details={},metadata,config:overrides={},getChannel,getMessages,getMessage,searchMessages,verifyRevision,listSyncChannels,applicationFlags=1<<18,continueShortPages=false}={}) {
  let policyCalls=0, reads=0;
  let pageSignal,lastPageSize;
  const channel={id:channelId,guild_id:guildId,type:0,parent_id:categoryId,name:'general',...details};
  const basePolicy={guildId,revision:1,paused:false,excludedChannelIds:[],excludedCategoryIds:[],...policy};
  const store=new Proxy({getPolicy:async()=>({status:'ready',policy:{...basePolicy,revision:++policyCalls>1 && verifyRevision ? verifyRevision : basePolicy.revision}}),listSyncChannels:listSyncChannels|| (async()=>({status:'ready',channels:[{enabled:true,guildId,channelId,sourceId}]}))},{get(target,key){if(key in target)return target[key];return ()=>{throw Error('Unexpected persistence: '+String(key));};}});
  const client={configured:true,getCurrentApplication:async()=>({flags:applicationFlags}),getGuildChannels:async()=>metadata||[channel,{id:categoryId,guild_id:guildId,type:4,parent_id:null,name:'public'}],getChannel:async args=>getChannel?getChannel(args):args.channelId===channelId ? channel : {id:args.channelId,guild_id:guildId,type:0,parent_id:categoryId},getMessages:async args=>{reads++;if(pageSignal!==args.signal){pageSignal=args.signal;lastPageSize=undefined;}if(!continueShortPages&&lastPageSize!==undefined&&lastPageSize<100)return [];const page=getMessages?await getMessages(args):[];lastPageSize=page.length;return page;},getMessage:async args=>{reads++;return getMessage?getMessage(args):message(from);},searchMessages:async args=>{reads++;return searchMessages?searchMessages(args):{messages:[],totalResults:0};}};
  return {service:createLiveDiscordRetrieval({config:{...config,...overrides},store,client}),reads:()=>reads};
}
test('live credentials are opt-in and status is secret-free',()=>{
  const c=readLiveDiscordConfig({DISCORD_BOT_TOKEN:'fixture-secret',DISCORD_GUILD_ID:guildId});assert(!c.configured);
  assert(!JSON.stringify(liveDiscordStatus(c)).includes('fixture-secret'));
  assert(readLiveDiscordConfig({DISCORD_LIVE_READ_ENABLED:'true',DISCORD_BOT_TOKEN:'fixture-secret',DISCORD_GUILD_ID:guildId}).configured);
});
test('no member access can be inferred from bot configuration or a matching guild',async()=>{
  for(const p of [null,{id:'member'},{liveDiscord:{mode:'member',guildId}},{liveDiscord:{mode:'local-operator',guildId:'101'}}]) {
    const f=fixture();assert.equal((await f.service.readWindow({channelId,from,to,principal:p})).status,'forbidden');assert.equal(f.reads(),0);
  }
});
test('message-content intent is independently required before any private-message read',async()=>{
  for(const applicationFlags of [0,1<<17,-1,null]){const f=fixture({applicationFlags});const r=await f.service.readWindow({channelId,from,to,principal});assert.equal(r.status,'permission_denied');assert.equal(f.reads(),0);}
  const f=fixture({applicationFlags:1<<19});assert.equal((await f.service.readWindow({channelId,from,to,principal})).status,'ready');
});
test('fresh channel/category exclusions, unknown ancestry and paused policy deny reads',async()=>{
  for(const opts of [{policy:{excludedChannelIds:[channelId]}},{policy:{excludedCategoryIds:[categoryId]}},{metadata:[{id:channelId,guild_id:guildId,type:0,parent_id:categoryId}]},{policy:{paused:true}},{details:{guild_id:'101'}}]) {
    const f=fixture(opts);const r=await f.service.readWindow({channelId,from,to,principal});assert(['paused','channel_scope_denied','invalid_response'].includes(r.status),r.status);assert.equal(f.reads(),0);assert.deepEqual(r.sources,[]);
  }
});
test('policy revision changes during retrieval discard all evidence',async()=>{
  const f=fixture({verifyRevision:2,getMessages:async()=>[message(from)]});const r=await f.service.readWindow({channelId,from,to,principal});assert.equal(r.status,'policy_changed');assert.deepEqual(r.sources,[]);
});
test('thread ancestry inherits channel and category exclusions before reading private content',async()=>{
  for(const policy of [{excludedChannelIds:['250']},{excludedCategoryIds:[categoryId]}]){
    const f=fixture({details:{type:12,parent_id:'250'},policy});const result=await f.service.readWindow({channelId,from,to,principal});assert.equal(result.status,'channel_scope_denied');assert.equal(f.reads(),0);
  }
});
test('fresh ordinary channel missing or malformed parent_id cannot erase inherited category exclusions',async()=>{
  const fresh={id:channelId,guild_id:guildId,type:0,name:'general'};
  for(const parent of [{},{parent_id:undefined},{parent_id:''},{parent_id:'not-a-snowflake'},{parent_id:300},{parent_id:false},{parent_id:{}}]){
    const f=fixture({policy:{excludedCategoryIds:[categoryId]},getChannel:async()=>({...fresh,...parent})});const r=await f.service.readWindow({channelId,from,to,principal});assert.equal(r.status,'channel_scope_denied');assert.equal(f.reads(),0);assert.deepEqual(r.sources,[]);
  }
  for(const parent_id of [null,categoryId]){const f=fixture({getChannel:async()=>({...fresh,parent_id})});assert.equal((await f.service.readWindow({channelId,from,to,principal})).status,'ready');}
});
test('fresh thread parent missing or malformed parent_id denies before any message API call',async()=>{
  const detail={id:channelId,guild_id:guildId,type:12,parent_id:'250',name:'thread'};
  for(const parent of [{},{parent_id:undefined},{parent_id:''},{parent_id:'not-a-snowflake'},{parent_id:300},{parent_id:false},{parent_id:{}}]){
    const f=fixture({details:detail,policy:{excludedCategoryIds:[categoryId]},getChannel:async({channelId:id})=>id===channelId?detail:{id:'250',guild_id:guildId,type:0,...parent}});const r=await f.service.readWindow({channelId,from,to,principal});assert.equal(r.status,'channel_scope_denied');assert.equal(f.reads(),0);assert.deepEqual(r.sources,[]);
  }
  for(const parent_id of [null,categoryId]){const f=fixture({details:detail,getChannel:async({channelId:id})=>id===channelId?detail:{id:'250',guild_id:guildId,type:0,parent_id}});assert.equal((await f.service.readWindow({channelId,from,to,principal})).status,'ready');}
});
test('window scan uses exclusive upper snowflake, includes exact lower boundary, excludes prior messages',async()=>{
  let cursor;const inside=message('2026-10-07T12:00:00.000Z');const f=fixture({getMessages:async args=>{cursor=args.before;return [inside,message(from),message('2026-10-01T03:59:59.999Z')];}});
  const r=await f.service.fetchWindow({channelId,from,to,principal});assert.equal(cursor,discordSnowflakeAt(to));assert.equal(r.status,'ready');assert.equal(r.coverage.complete,true);assert.deepEqual(r.messages.map(m=>m.id),[inside.id,discordSnowflakeAt(from)]);
  const publicResult=await f.service.readWindow({channelId,from,to,principal});assert(!('messages' in publicResult));assert.equal(publicResult.sources[0].url,`https://discord.com/channels/${guildId}/${channelId}/${inside.id}`);
});
test('full pages advance before cursor and empty subsequent page establishes completeness',async()=>{
  const page=Array.from({length:100},(_,i)=>message(new Date(Date.parse(to)-(i+1)*1000).toISOString()));const cursors=[];
  const f=fixture({getMessages:async({before})=>{cursors.push(before);return cursors.length===1?page:[];}});const r=await f.service.fetchWindow({channelId,from,to,principal});assert.equal(r.coverage.complete,true);assert.equal(r.messages.length,100);assert.deepEqual(cursors,[discordSnowflakeAt(to),page.at(-1).id]);
});
test('short pages continue to older messages until an actual empty page proves completeness',async()=>{
  const page1=[message('2026-10-07T12:00:00.000Z')],page2=[message('2026-10-05T12:00:00.000Z')];let count=0;const f=fixture({continueShortPages:true,getMessages:async()=>[page1,page2,[]][count++]});const r=await f.service.fetchWindow({channelId,from,to,principal});assert.equal(r.coverage.complete,true);assert.equal(count,3);assert.deepEqual(r.messages.map(m=>m.id),[page1[0].id,page2[0].id]);
});
test('cursor corruption never establishes complete coverage',async()=>{
  for(const page of [[message(from),message(from)],[message(to)]]) {const f=fixture({getMessages:async()=>page});const r=await f.service.fetchWindow({channelId,from,to,principal});assert.equal(r.status,'invalid_cursor');assert.deepEqual(r.sources,[]);}
});
test('message and text budgets disclose incomplete window instead of silently summarizing everything',async()=>{
  const f=fixture({config:{maxMessages:1},getMessages:async()=>[message(from)]});const r=await f.service.readWindow({channelId,from,to,principal});assert.equal(r.status,'partial');assert.equal(r.coverage.complete,false);
  const g=fixture({getMessages:async()=>[message(from,{content:'x'.repeat(1900),attachments:[{url:'https://bad.invalid/private'}],components:[{content:'COMPONENT-SECRET'}],poll:{question:{text:'POLL-SECRET'}},referenced_message:{content:'NESTED-SECRET'}})]});const s=await g.service.readWindow({channelId,from,to,principal});assert.equal(s.coverage.complete,false);assert.equal(s.coverage.textTruncated,true);assert.equal(s.coverage.nonTextMessageCount,1);assert.equal(s.coverage.contentScope,'top_level_text_only');for(const secret of ['NESTED-SECRET','COMPONENT-SECRET','POLL-SECRET','bad.invalid'])assert(!JSON.stringify(s).includes(secret));
});
test('successful empty scan is complete; cancellation makes no API read',async()=>{
  const f=fixture();assert.equal((await f.service.readWindow({channelId,from,to,principal})).coverage.complete,true);const abort=new AbortController();abort.abort();const before=f.reads();assert.equal((await f.service.readWindow({channelId,from,to,principal,signal:abort.signal})).status,'aborted');assert.equal(f.reads(),before);
});
test('live search post-filters author/time and rejects foreign-channel hits',async()=>{
  const f=fixture({searchMessages:async()=>({messages:[message(from),message(to),message(from,{id:'123',author:{id:'401'}})],totalResults:3})});const r=await f.service.search({principal,channelIds:[channelId],from,to,authorId:'400'});assert.equal(r.sources.length,1);assert.equal(r.coverage.complete,false);
  const g=fixture({searchMessages:async()=>({messages:[message(from,{channel_id:'201'})],totalResults:1})});assert.equal((await g.service.search({principal,channelIds:[channelId]})).status,'channel_scope_denied');
});
test('tool arguments reject arbitrary URLs, cross-guild links, unknown fields and ambiguous dates',async()=>{
  for(const args of [{url:'https://discord.com/channels/101/200/400'},{url:'https://discord.com/channels/100/200/400?x=1'},{url:'https://attacker.invalid/channels/100/200/400'},{channelId,sql:'select 1'}])assert.equal(validateLiveDiscordArguments('read_discord_messages',args,guildId),null);
  assert.deepEqual(validateLiveDiscordArguments('read_discord_window',{channelId,from:'2026-10-01',to},guildId),{channelId,from:'2026-10-01T00:00:00.000Z',to,timeZone:'UTC'});
  assert.equal(validateLiveDiscordArguments('read_discord_window',{channelId,from:'2026-10-01T12:00:00',to},guildId),null);
  assert.deepEqual(validateLiveDiscordArguments('read_discord_messages',{url:'https://discord.com/channels/100/200/400'},guildId),{channelId,messageId:'400'});
  const tools=createLiveRetrievalTools({guildId});assert.equal((await tools.execute({name:'execute_sql',arguments:{sql:'drop table sources'},principal})).status,'invalid_request');
});
test('HTTP live search retries indexing/rate limits and unwraps only actual nested hits',async()=>{
  const calls=[];let attempts=0;const client=createLiveDiscordClient({config,fetchImpl:async(url,options)=>{calls.push({url,options});if(++attempts<=2)return Response.json({retry_after:0},{status:attempts===1?202:429});return Response.json({total_results:1,messages:[[{...message(from),hit:true},{...message(from),hit:false,content:'NESTED SECRET'}]]});}});
  const r=await client.searchMessages({channelIds:[channelId],from,to,query:'event'});assert.equal(r.messages.length,1);assert.equal(calls.length,3);assert(calls.every(c=>c.options.method==='GET'&&c.options.redirect==='error'));assert(!JSON.stringify(r).includes('NESTED SECRET'));const url=new URL(calls[0].url);assert.equal(url.searchParams.get('min_id'),(BigInt(discordSnowflakeAt(from))-1n).toString());assert.equal(url.searchParams.get('max_id'),discordSnowflakeAt(to));
});
test('bot READ_MESSAGE_HISTORY absence is a denial, never successful empty history',async()=>{
  let messageReads=0;const client=createLiveDiscordClient({config,fetchImpl:async url=>{const path=new URL(url).pathname;if(path==='/api/v10/channels/200')return Response.json({id:channelId,guild_id:guildId,type:0});if(path.endsWith('/users/@me'))return Response.json({id:'500'});if(path.endsWith('/roles'))return Response.json([{id:guildId,permissions:'1024'}]);if(path.endsWith('/members/500'))return Response.json({roles:[]});messageReads++;return Response.json([]);}});
  await assert.rejects(client.getChannel({channelId}),{code:'permission_denied'});assert.equal(messageReads,0);
});
test('permanently indexing live search is bounded and upstream details remain private',async()=>{
  let count=0;const client=createLiveDiscordClient({config,fetchImpl:async()=>{count++;return Response.json({retry_after:0,private:'fixture-private-upstream'},{status:202});}});await assert.rejects(client.searchMessages({channelIds:[channelId]}),{code:'indexing'});assert.equal(count,4);
  const denied=createLiveDiscordClient({config,fetchImpl:async()=>new Response('fixture-private-upstream',{status:403})});await assert.rejects(denied.getMessages({channelId}),error=>error.code==='permission_denied'&&!error.message.includes('fixture-private-upstream'));
});

test('live source allowlists deny missing/malformed/out-of-scope and unregistered channels before channel/content reads',async()=>{
 for(const allowedSourceIds of [undefined,[],['malformed'],Array(501).fill(sourceId),['33333333-3333-4333-8333-333333333333']]){
  let channelCalls=0;const f=fixture({getChannel:async()=>{channelCalls++;throw new Error('must not read channel');}});
  const result=await f.service.readWindow({channelId,from,to,principal:{...principal,allowedSourceIds}});
  assert(['forbidden','channel_scope_denied'].includes(result.status),result.status);assert.equal(channelCalls,0);assert.equal(f.reads(),0);
 }
 let channelCalls=0;const f=fixture({getChannel:async()=>{channelCalls++;throw new Error('unregistered channel read');}});
 const result=await f.service.readWindow({channelId:'201',from,to,principal});assert.equal(result.status,'channel_scope_denied');assert.equal(channelCalls,0);assert.equal(f.reads(),0);
});
test('backend operator capability and matching guild remain required alongside valid source allowlist',async()=>{
 for(const liveDiscord of [undefined,{mode:'member',guildId},{mode:'local-operator',guildId:'101'}]){let calls=0;const f=fixture({getChannel:async()=>{calls++;}});assert.equal((await f.service.readWindow({channelId,from,to,principal:{allowedSourceIds:[sourceId],liveDiscord}})).status,'forbidden');assert.equal(calls,0);assert.equal(f.reads(),0);}
});

test('live catalogue omits configured channels outside the trusted source allowlist before channel detail calls',async()=>{
 let channelCalls=0;const f=fixture({getChannel:async()=>{channelCalls++;throw new Error('out-of-scope detail');}});
 const result=await f.service.getCatalogue({principal:{...principal,allowedSourceIds:['33333333-3333-4333-8333-333333333333']}});assert.equal(result.status,'ready');assert.deepEqual(result.channels,[]);assert.equal(channelCalls,0);assert.equal(f.reads(),0);
});

test('same-revision catalogue withdrawal, disable, guild change or UUID change discards previously read evidence',async()=>{
 const replacement='33333333-3333-4333-8333-333333333333';
 for(const change of [[],[{enabled:false,guildId,channelId,sourceId}],[{enabled:true,guildId:'101',channelId,sourceId}],[{enabled:true,guildId,channelId,sourceId:replacement}]]){
  let reads=0;const f=fixture({getMessages:async()=>[message(from)],listSyncChannels:async()=>({status:'ready',channels:reads++===0?[{enabled:true,guildId,channelId,sourceId}]:change})});const r=await f.service.readWindow({channelId,from,to,principal:{...principal,allowedSourceIds:[sourceId,replacement]}});assert.equal(r.status,'policy_changed');assert.deepEqual(r.sources,[]);assert.equal(r.coverage.complete,false);
 }
});
test('final catalogue failure discards evidence instead of treating stale registration as authorized',async()=>{
 let reads=0;const f=fixture({getMessages:async()=>[message(from)],listSyncChannels:async()=>reads++===0?{status:'ready',channels:[{enabled:true,guildId,channelId,sourceId}]}:{status:'unavailable',channels:[]}});const r=await f.service.readWindow({channelId,from,to,principal});assert.equal(r.status,'policy_unavailable');assert.deepEqual(r.sources,[]);assert.equal(r.coverage.complete,false);
});
