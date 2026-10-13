import test from 'node:test';
import assert from 'node:assert/strict';
import {readDiscordConfig} from '../server/discord/config.js';
import {createDiscordClient} from '../server/discord/client.js';
import {runDiscordDiscovery,isDiscordChannelExcluded} from '../server/discord/discovery.js';

const guildId='1203562091500404776', categoryId='1461311169586266165';
const channelId='1203562091982622814', excludedChannelId='1203562091982622819';
const threadId='1603562091982622814', privateId='1603562091982622815';
const token='fixture-discovery-secret-not-for-output';
const now=new Date('2026-10-11T20:00:00Z');
const config=readDiscordConfig({DISCORD_BOT_TOKEN:token,DISCORD_GUILD_ID:guildId,DISCORD_DISCOVERY_ENABLED:'true'});
const rawChannel=(id=channelId,extra={})=>({id,guild_id:guildId,type:0,name:'Fixture channel',parent_id:null,...extra});
const rawThread=(id=threadId,extra={})=>rawChannel(id,{type:11,parent_id:channelId,thread_metadata:{archive_timestamp:'2026-10-01T12:00:00.000Z'},...extra});
const policy=()=>({guildId,revision:1,paused:false,discoveryEnabled:true,excludedCategoryIds:[categoryId,'1533053124606955600','1203562092213305371','1203562092376891445'],excludedChannelIds:[excludedChannelId]});
function fixture({channels=[rawChannel()],active=[],archives={}}={}) {
  let state=null,completeState=null;const rows=new Map(),persists=[],requests=[],completes=[];
  const currentPolicy=policy();
  const store={configured:true,
    async getPolicy(){return {status:'ready',policy:currentPolicy};},
    async getDiscoveryState(){return {status:'ready',state:structuredClone(state)};},
    async persistDiscovery(args){
      assert.equal(args.guildId,guildId);assert.equal(args.expectedPolicyRevision,currentPolicy.revision);
      assert.deepEqual(args.expectedState,state,'must persist against last accepted state');
      persists.push(structuredClone(args));
      for(const c of args.channels) rows.set(c.channelId,structuredClone(c));
      state=structuredClone(args.state);return {status:'ready'};
    },
    async completeDiscovery(args){
      assert.equal(args.expectedPolicyRevision,currentPolicy.revision);assert.deepEqual(args.expectedState,state);
      completes.push(structuredClone(args));state=structuredClone(args.state);completeState=state;return {status:'ready'};
    },
  };
  const client={configured:true,
    async getGuildChannels(){requests.push({op:'channels'});return channels;},
    async getActiveThreads(){requests.push({op:'active'});return {threads:active};},
    async getChannel({channelId:id}){requests.push({op:'validate',id});const c=[...channels,...active,...Object.values(archives).flatMap(x=>x.flatMap(p=>p.threads))].find(c=>c.id===id);if(!c)throw Object.assign(new Error('fixture inaccessible'),{code:'not_found'});return c;},
    async getArchivedThreads(args){requests.push({op:'archive',...args});const pages=archives[`${args.channelId}:${args.kind}`]||[{threads:[],hasMore:false}];const index=requests.filter(r=>r.op==='archive'&&r.channelId===args.channelId&&r.kind===args.kind).length-1;return pages[index]||{threads:[],hasMore:false};},
    async getMessages(){assert.fail('discovery may not read message content');},
  };
  return {config,store,client,now:()=>now,rows,persists,requests,completes,currentPolicy,get state(){return state;},get completeState(){return completeState;}};
}
function sanitized(result){assert(!JSON.stringify(result).includes(token));assert(!JSON.stringify(result).includes('malicious-body'));return result;}
async function finish(f,limits={maxPages:100,maxChannels:1000,maxRuntimeMs:10000,pageSize:100}) {
  let result;
  for(let run=0;run<30;run++){result=sanitized(await runDiscordDiscovery({...f,limits}));if(result.status!=='partial')return result;}
  assert.fail('discovery failed to finish within bounded fixture runs');
}

test('blacklisted categories/channels exclude descendants; unknown ancestry and cycles fail closed',()=>{
  const root=rawChannel(categoryId,{type:4}),allowed=rawChannel(),blocked=rawChannel(excludedChannelId),inCategory=rawChannel('1403562091982622814',{parent_id:categoryId});
  const unknown=rawChannel('1403562091982622815',{parent_id:'999999999999999999'});
  const cycleA=rawChannel('1403562091982622816',{parent_id:'1403562091982622817'}),cycleB=rawChannel('1403562091982622817',{parent_id:cycleA.id});
  const channels=[root,allowed,blocked,inCategory,unknown,cycleA,cycleB];
  for(const c of [blocked,inCategory,rawThread(threadId,{parent_id:excludedChannelId}),unknown,cycleA]) assert.equal(isDiscordChannelExcluded({channel:c,channels,policy:policy()}),true,c.id);
  assert.equal(isDiscordChannelExcluded({channel:allowed,channels,policy:policy()}),false);
});

test('complete guild discovery deduplicates active/archived threads and persists exclusions without granting visibility',async()=>{
  const blocked=rawChannel(excludedChannelId),hidden=rawChannel('1403562091982622814',{parent_id:categoryId});
  const f=fixture({channels:[rawChannel(categoryId,{type:4}),rawChannel(),blocked,hidden],active:[rawThread(),rawThread('1603562091982622816',{parent_id:excludedChannelId})],archives:{[`${channelId}:public`]:[{threads:[rawThread()],hasMore:false}],[`${channelId}:joinedPrivate`]:[{threads:[rawThread(privateId,{type:12})],hasMore:false}]}});
  const result=await finish(f);assert.equal(result.status,'ready',JSON.stringify(result));assert.equal(f.completes.length,1);
  assert.equal(f.rows.get(channelId).eligible,true);assert.equal(f.rows.get(threadId).eligible,true);assert.equal(f.rows.get(privateId).eligible,true);
  assert.equal(f.rows.get(excludedChannelId).eligible,false);assert.equal(f.rows.get(hidden.id).eligible,false);
  assert(!f.requests.some(r=>r.op==='archive'&&[excludedChannelId,hidden.id].includes(r.channelId)));
  assert(!f.requests.some(r=>r.op==='archive'&&r.kind==='private'),'ordinary bot discovery must not request all private threads');
  for(const c of f.rows.values()) {assert.equal(c.guildId,guildId);assert(!('allowedMemberIds' in c));assert(!('readerIds' in c));}
});

test('bounded discovery resumes archived pagination from durable generation and cursor',async()=>{
  const second=rawThread('1603562091982622813',{thread_metadata:{archive_timestamp:'2026-09-01T12:00:00.000Z'}});
  const f=fixture({archives:{[`${channelId}:public`]:[{threads:[rawThread()],hasMore:true},{threads:[second],hasMore:false}]}});
  const first=sanitized(await runDiscordDiscovery({...f,limits:{maxPages:1,maxChannels:10,maxRuntimeMs:10000,pageSize:1}}));
  assert.equal(first.status,'partial');assert.equal(f.completes.length,0);assert(f.state);
  const generation=f.state.generation;
  assert.equal((await finish(f,{maxPages:1,maxChannels:10,maxRuntimeMs:10000,pageSize:1})).status,'ready');
  assert(f.persists.every(p=>p.state.generation===generation));assert.equal(f.rows.get(second.id).eligible,true);
  const pages=f.requests.filter(r=>r.op==='archive'&&r.kind==='public');assert.equal(pages[1].before,'2026-10-01T12:00:00.000Z');
});

test('incomplete or failed inventory never reconciles unseen existing sources',async()=>{
  for(const kind of ['partial','failure','wrongguild']) {
    const f=fixture({active:[rawThread()]});
    if(kind==='failure')f.client.getActiveThreads=async()=>{throw Object.assign(new Error(`${token} malicious-body`),{code:'discord_unavailable'});};
    if(kind==='wrongguild')f.client.getGuildChannels=async()=>[rawChannel(channelId,{guild_id:'999999999999999999'})];
    const result=sanitized(await runDiscordDiscovery({...f,limits:{maxPages:kind==='partial'?1:100,maxChannels:100,maxRuntimeMs:10000}}));
    assert.notEqual(result.status,'ready',kind);assert.equal(f.completes.length,0,kind);
  }
});

test('archive pagination cannot loop forever on stalled cursor or reordered page',async()=>{
  const repeated={threads:[rawThread()],hasMore:true};
  const f=fixture({archives:{[`${channelId}:public`]:[repeated,repeated,repeated]}});
  const result=await finish(f);assert.notEqual(result.status,'ready',JSON.stringify(result));assert.equal(f.completes.length,0);
  assert(f.requests.filter(r=>r.op==='archive'&&r.kind==='public').length<=2,'stalled pagination must stop promptly');
});

test('disabled and aborted discovery perform no Discord inventory calls; paused metadata preview reads no messages',async()=>{
  for(const kind of ['disabled','aborted']) {
    const f=fixture(),controller=new AbortController();
    if(kind==='paused')f.currentPolicy.paused=true;if(kind==='disabled')f.currentPolicy.discoveryEnabled=false;if(kind==='aborted')controller.abort();
    const result=sanitized(await runDiscordDiscovery({...f,signal:controller.signal}));assert.notEqual(result.status,'ready');assert.equal(f.requests.length,0);assert.equal(f.completes.length,0);
  }
  const f=fixture();f.currentPolicy.paused=true;
  const result=await finish(f);assert.equal(result.status,'ready');assert.equal(result.policyPaused,true);
});

test('permission loss becomes ineligible metadata while incomplete policy generation cannot complete',async()=>{
  const f=fixture();f.client.getChannel=async()=>{throw Object.assign(new Error('fixture denied'),{code:'permission_denied'});};
  assert.equal((await finish(f)).status,'ready');assert.equal(f.rows.get(channelId).eligible,false);assert.equal(f.rows.get(channelId).accessStatus,'permission_denied');
  const race=fixture();race.store.persistDiscovery=async()=>({status:'stale'});
  const result=await finish(race);assert.notEqual(result.status,'ready');assert.equal(race.completes.length,0);
});

test('channel and active-thread inventory exceeding a run budget resumes without dropping sources',async()=>{
  const channels=Array.from({length:110},(_,i)=>rawChannel((BigInt(channelId)+BigInt(i+100)).toString()));
  const f=fixture({channels});
  assert.equal((await runDiscordDiscovery({...f,limits:{maxChannels:30,maxPages:100,maxRuntimeMs:10000}})).status,'partial');
  assert.equal(f.completes.length,0);
  assert.equal((await finish(f,{maxChannels:30,maxPages:100,maxRuntimeMs:10000})).status,'ready');
  assert.equal(f.rows.size,110);assert([...f.rows.values()].every(c=>c.eligible));
  assert.equal(f.requests.filter(r=>r.op==='channels').length,1,'durable metadata snapshot prevents inventory restart');
  assert(f.persists.every(p=>p.channels.length<=100),'RPC batch limit respected');
});

test('joined private archives paginate by snowflake while public archives use timestamps',async()=>{
  const second=rawThread('1503562091982622815',{type:12});
  const f=fixture({archives:{[`${channelId}:joinedPrivate`]:[{threads:[rawThread(privateId,{type:12})],hasMore:true},{threads:[second],hasMore:false}]}});
  assert.equal((await finish(f)).status,'ready');
  const pages=f.requests.filter(r=>r.op==='archive'&&r.kind==='joinedPrivate');assert.equal(pages[1].before,privateId);
  assert.equal(f.rows.get(second.id).eligible,true);
});

test('existing thread-management permission discovers unjoined private archives and deduplicates joined sources',async()=>{
  for(const permissions of ['8',(1n<<34n).toString()]) {
    const unjoined=rawThread('1603562091982622817',{type:12});
    const f=fixture({channels:[rawChannel(channelId,{botPermissions:permissions})],archives:{
      [`${channelId}:joinedPrivate`]:[{threads:[rawThread(privateId,{type:12})],hasMore:false}],
      [`${channelId}:private`]:[{threads:[unjoined,rawThread(privateId,{type:12})],hasMore:false}],
    }});
    const result=await finish(f);assert.equal(result.status,'ready',JSON.stringify(result));
    assert(f.requests.some(r=>r.op==='archive'&&r.kind==='private'));assert.equal(f.rows.get(unjoined.id).eligible,true);
    assert.equal(f.rows.size,3);assert(!result.limitations.includes('unjoined_private_archives_not_discovered'));
  }
});

test('client discovery uses guild-scoped read-only endpoints with bounded archive queries and safe validation',async()=>{
  const requests=[];
  const client=createDiscordClient({config,fetchImpl:async(url,options)=>{
    requests.push({url,options});
    if(url.endsWith(`/guilds/${guildId}/channels`))return Response.json([rawChannel()]);
    if(url.endsWith(`/guilds/${guildId}/threads/active`))return Response.json({threads:[rawThread()]});
    return Response.json({threads:[],has_more:false});
  }});
  assert.equal((await client.getGuildChannels())[0].guild_id,guildId);
  assert.equal((await client.getActiveThreads()).threads.length,1);
  await client.getArchivedThreads({channelId,kind:'public',before:'2026-10-01T12:00:00.000Z',limit:100});
  await client.getArchivedThreads({channelId,kind:'joinedPrivate',before:privateId,limit:2});
  assert.equal(new URL(requests[2].url).searchParams.get('limit'),'100');
  assert(new URL(requests[2].url).pathname.endsWith('/threads/archived/public'));
  assert(new URL(requests[3].url).pathname.endsWith('/users/@me/threads/archived/private'));
  assert.equal(new URL(requests[3].url).searchParams.get('before'),privateId);
  for(const r of requests){assert.equal(r.options.method,undefined);assert.equal(r.options.redirect,'error');}
  const count=requests.length;
  await assert.rejects(client.getArchivedThreads({channelId,kind:'public',limit:101}));assert.equal(requests.length,count);
  await assert.rejects(client.getArchivedThreads({channelId,kind:'joinedPrivate',before:'bad-cursor'}));assert.equal(requests.length,count);
});
