import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {createManualDiscordStore} from '../server/discord/manual-scope.js';
import {createLiveDiscordRetrieval} from '../server/discord/live-retrieval.js';
import {createAutomationAdapters} from '../server/automation/adapters.js';
import {readAutomationConfig} from '../server/automation/config.js';

const guildId='100',categoryId='150',channelId='200',siblingId='201',threadId='202',sourceId=randomUUID(),siblingSource=randomUUID(),threadSource=randomUUID(),generation=randomUUID();
function fixture(selected=[channelId]) {
 const raw=(id,parent_id,type=0)=>({id,guild_id:guildId,parent_id,type,name:'synthetic-'+id});
 const live=[raw(categoryId,null,4),raw(channelId,categoryId),raw(siblingId,categoryId),raw(threadId,channelId,11)];
 const metadata={guildId,policyRevision:1,paused:false,discoveryEnabled:true,publishedGeneration:generation,publishedRevision:1,
  nodes:live.map(r=>({channelId:r.id,guildId,parentId:r.parent_id,type:r.type,sourceId:r.id===categoryId?null:r.id===channelId?sourceId:r.id===siblingId?siblingSource:threadSource,title:r.name,manualDisabled:false,withdrawn:false,accessStatus:'excluded',generation,policyRevision:1}))};
 let reads=0,onRead=null,permissionDenied=false;
 const counts={metadata:0,guildChannels:0,channelDetails:0,policy:0,catalogue:0};
 const store={configured:true,getManualScopeMetadata:async()=>{counts.metadata++;return {status:'ready',metadata:structuredClone(metadata)};},
  getPolicy:async()=>{counts.policy++;return {status:'ready',policy:{guildId,revision:1,paused:false,discoveryEnabled:true,excludedChannelIds:[channelId],excludedCategoryIds:[categoryId]}};},
  listSyncChannels:async()=>{counts.catalogue++;return {status:'ready',channels:[]};}};
 const client={configured:true,getGuildChannels:async()=>{counts.guildChannels++;return structuredClone(live);},getChannel:async({channelId:id})=>{counts.channelDetails++;if(permissionDenied)throw Object.assign(Error('permission_denied'),{code:'permission_denied'});return structuredClone(live.find(r=>r.id===id));},getCurrentApplication:async()=>({flags:1<<18}),
  getMessage:async({channelId:id})=>{reads++;onRead?.();return {id:'300',channel_id:id,guild_id:guildId,author:{id:'400',username:'Synthetic'},timestamp:'2026-10-22T16:00:00Z',content:'Synthetic queued context'};}};
 const config={configured:true,guildId},manual=createManualDiscordStore({store,client,guildId,channelIds:selected}),service=createLiveDiscordRetrieval({config,store:manual,client}),ordinary=createLiveDiscordRetrieval({config,store,client});
 const principal={id:'worker',allowedSourceIds:[sourceId,siblingSource,threadSource],liveDiscord:{mode:'local-operator',guildId}};
 return {metadata,live,store,manual,service,ordinary,config,client,principal,counts,get reads(){return reads;},set onRead(fn){onRead=fn;},set denied(v){permissionDenied=v;}};
}

test('real manual retrieval halves metadata reads while retaining a fresh initial and final authorization pair',async()=>{
 const paired=fixture(),args={principal:paired.principal,channelId,messageId:'300',context:false};
 assert.equal((await paired.service.readMessages(args)).status,'ready');
 assert.deepEqual({metadata:paired.counts.metadata,guildChannels:paired.counts.guildChannels,channelDetails:paired.counts.channelDetails},{metadata:2,guildChannels:3,channelDetails:3});
 const legacy=fixture(),legacyStore={configured:true,getPolicy:args=>legacy.manual.getPolicy(args),listSyncChannels:args=>legacy.manual.listSyncChannels(args)};
 const fallback=createLiveDiscordRetrieval({config:legacy.config,store:legacyStore,client:legacy.client});
 assert.equal((await fallback.readMessages({...args,principal:legacy.principal})).status,'ready');
 assert.deepEqual({metadata:legacy.counts.metadata,guildChannels:legacy.counts.guildChannels,channelDetails:legacy.counts.channelDetails},{metadata:4,guildChannels:5,channelDetails:5});
 assert.equal(paired.reads,1);assert.equal(legacy.reads,1);
});

test('manual retrieval never reuses a snapshot across tool calls or hides a changed source identity during final recheck',async()=>{
 const f=fixture(),args={principal:f.principal,channelId,messageId:'300',context:false};
 assert.equal((await f.service.readMessages(args)).status,'ready');assert.equal(f.counts.metadata,2);
 f.onRead=()=>{f.metadata.nodes.find(node=>node.channelId===channelId).sourceId=randomUUID();};
 const revoked=await f.service.readMessages(args);assert.notEqual(revoked.status,'ready');assert.deepEqual(revoked.sources,[]);
 assert.equal(f.reads,2);assert.equal(f.counts.metadata,4,'The next read still performs both current authorization boundaries');
 const before=f.counts.metadata;f.metadata.paused=true;
 assert.notEqual((await f.service.readMessages(args)).status,'ready');assert.equal(f.reads,2);assert.equal(f.counts.metadata,before+1,'Paused state is fetched before another original is read');
});

test('caller abort after source retrieval discards content and does not reuse the successful initial snapshot',async()=>{
 const f=fixture(),controller=new AbortController();f.onRead=()=>controller.abort();
 const result=await f.service.readMessages({principal:f.principal,channelId,messageId:'300',context:false,signal:controller.signal});
 assert.equal(result.status,'aborted');assert.deepEqual(result.sources,[]);assert.equal(f.reads,1);assert.equal(f.counts.metadata,1);
 const before=f.counts.metadata;
 const aborted=await f.manual.getAuthorizationSnapshot({guildId,signal:controller.signal});
 assert.equal(aborted.status,'aborted');assert.equal(aborted.policy,null);assert.deepEqual(aborted.channels,[]);assert.equal(f.counts.metadata,before);
});

function bundled(f,{manual=true,store=f.store}={}) {
 return createAutomationAdapters({env:{ASSISTANT_ALLOWED_SOURCE_IDS:sourceId},config:readAutomationConfig({AGENT_AUTOMATION_ENABLED:'true'}),
  dependencies:{googleConfig:{configured:false},googleClient:{configured:false},discordConfig:f.config,discordStore:store,discordClient:f.client,calendarConfig:{configured:false},calendarClient:{configured:false}},
  ...(manual?{manual:{force:true,channelIds:[channelId]}}:{}),fetchImpl:async()=>{throw Error('No external HTTP');}});
}
const queued=(id='300')=>({source:'discord',source_id:sourceId,event_type:'message_created',event_id:id,revision:'1',received_at:'2026-10-22T18:00:00Z',payload:{id,guild_id:guildId,channel_id:channelId,author:{id:'400'},content:'me'}});

test('bundled authorization reads fresh saved manual metadata without provider calls',async()=>{
 const f=fixture(),adapters=bundled(f),events=[queued('300'),queued('301'),queued('302')];
 await adapters.resolveClaimSourceIds({principal:adapters.principal});for(const key of Object.keys(f.counts))f.counts[key]=0;
 assert.equal(await adapters.authorizeEvents({events,principal:adapters.principal}),true);
 assert.deepEqual({metadata:f.counts.metadata,guildChannels:f.counts.guildChannels,channelDetails:f.counts.channelDetails},{metadata:1,guildChannels:0,channelDetails:0});
 assert.equal(await adapters.authorizeEvents({events,principal:adapters.principal}),true);assert.equal(f.counts.metadata,2);
 f.metadata.nodes.find(node=>node.channelId===channelId).manualDisabled=true;
 assert.equal(await adapters.authorizeEvents({events,principal:adapters.principal}),false,'The next saved-metadata boundary sees a published disable');
 assert.equal(f.counts.metadata,3);assert.equal(f.reads,0);assert.equal(f.counts.guildChannels,0);assert.equal(f.counts.channelDetails,0);
});

test('saved manual ancestry denies ancestor disables and withdrawal without granting siblings',async()=>{
 for(const field of ['manualDisabled','withdrawn']){
  const f=fixture(),a=bundled(f);await a.resolveClaimSourceIds({principal:a.principal});
  assert.deepEqual(a.principal.allowedSourceIds,[sourceId]);assert(!a.principal.allowedSourceIds.includes(siblingSource));
  assert.equal(await a.authorizeEvents({events:[queued()],principal:a.principal}),true);
  f.metadata.nodes.find(row=>row.channelId===categoryId)[field]=true;
  const before={guild:f.counts.guildChannels,channel:f.counts.channelDetails};assert.equal(await a.authorizeEvents({events:[queued()],principal:a.principal}),false);
  assert.deepEqual({guild:f.counts.guildChannels,channel:f.counts.channelDetails},before);assert(!a.principal.allowedSourceIds.includes(siblingSource));
 }
});

test('ordinary adapter fallback reads one saved policy/catalogue pair and rejects paired failures without fallback grants',async()=>{
 const f=fixture(),policy={guildId,revision:1,paused:false,discoveryEnabled:true,excludedCategoryIds:[],excludedChannelIds:[]},channels=[{guildId,channelId,sourceId,enabled:true}];
 f.store.getPolicy=async()=>{f.counts.policy++;return {status:'ready',policy:structuredClone(policy)};};
 f.store.listSyncChannels=async()=>{f.counts.catalogue++;return {status:'ready',channels:structuredClone(channels)};};
 const adapters=bundled(f,{manual:false});assert.equal(await adapters.authorizeEvents({events:[queued()],principal:adapters.principal}),true);
 assert.equal(f.counts.policy,1);assert.equal(f.counts.catalogue,1);
 const pairedStore={...f.store,getAuthorizationSnapshot:async()=>({status:'forbidden',policy:null,channels:[]})};
 const denied=bundled(f,{manual:false,store:pairedStore}),before={policy:f.counts.policy,catalogue:f.counts.catalogue};
 assert.equal(await denied.authorizeEvents({events:[queued()],principal:denied.principal}),false);
 assert.deepEqual({policy:f.counts.policy,catalogue:f.counts.catalogue},before,'A failed paired snapshot cannot fall back to unrelated successful policy/catalogue reads');
});

test('manual exact whitelist reads a blacklisted source through real retrieval without changing ordinary access',async()=>{
 const f=fixture(),args={principal:f.principal,channelId,messageId:'300',context:false};
 assert.notEqual((await f.ordinary.readMessages(args)).status,'ready');assert.equal(f.reads,0);
 const result=await f.service.readMessages(args);assert.equal(result.status,'ready');assert.equal(result.sources[0].sourceId,sourceId);assert.equal(f.reads,1);
 assert.deepEqual(await f.manual.resolveSourceIds(),[sourceId]);
 for(const id of [siblingId,threadId])assert.notEqual((await f.service.readMessages({...args,channelId:id})).status,'ready');assert.equal(f.reads,1);
 assert.notEqual((await f.ordinary.readMessages(args)).status,'ready');assert.equal(f.reads,1);
});

test('exact thread whitelist validates ancestry but grants neither parent nor sibling sources',async()=>{
 const f=fixture([threadId]);assert.deepEqual(await f.manual.resolveSourceIds(),[threadSource]);
 assert.equal((await f.service.readMessages({principal:f.principal,channelId:threadId,messageId:'300',context:false})).status,'ready');
 assert.notEqual((await f.service.readMessages({principal:f.principal,channelId,messageId:'300',context:false})).status,'ready');
 f.metadata.nodes.find(n=>n.channelId===channelId).manualDisabled=true;await assert.rejects(f.manual.resolveSourceIds());
});

for(const [name,change] of [
 ['manual disable',f=>f.metadata.nodes.find(n=>n.channelId===channelId).manualDisabled=true],
 ['ancestor manual disable',f=>f.metadata.nodes.find(n=>n.channelId===categoryId).manualDisabled=true],
 ['withdrawn',f=>f.metadata.nodes.find(n=>n.channelId===channelId).withdrawn=true],
 ['paused',f=>f.metadata.paused=true],['discovery disabled',f=>f.metadata.discoveryEnabled=false],
 ['stale generation',f=>f.metadata.publishedGeneration=randomUUID()],['revision change',f=>f.metadata.policyRevision=2],
 ['wrong guild',f=>f.live.find(n=>n.id===channelId).guild_id='999'],['parent mismatch',f=>f.live.find(n=>n.id===channelId).parent_id=null],
 ['live permission revoked',f=>f.denied=true],['missing current node',f=>f.metadata.nodes=f.metadata.nodes.filter(n=>n.channelId!==channelId)],
])test('manual whitelist fails closed before source reads after '+name,async()=>{
 const f=fixture();change(f);await assert.rejects(f.manual.resolveSourceIds());const r=await f.service.readMessages({principal:f.principal,channelId,messageId:'300',context:false});assert.notEqual(r.status,'ready');assert.equal(f.reads,0);
});

test('manual current revocation after exact read discards in-flight evidence; nodes without UUID yield no invented source',async()=>{
 const f=fixture();f.onRead=()=>{f.metadata.nodes.find(n=>n.channelId===channelId).manualDisabled=true;};
 const r=await f.service.readMessages({principal:f.principal,channelId,messageId:'300',context:false});assert.notEqual(r.status,'ready');assert.deepEqual(r.sources,[]);assert.equal(f.reads,1);
 const g=fixture();g.metadata.nodes.find(n=>n.channelId===channelId).sourceId=null;assert.deepEqual(await g.manual.resolveSourceIds(),[]);
});

test('bundled manual adapters claim only whitelist sources and disable Gmail; empty list retains normal published sources plus explicit Gmail',async()=>{
 const f=fixture(),gmail=randomUUID(),calendar=randomUUID(),member=randomUUID(),other=randomUUID();
 f.store.listSyncChannels=async()=>({status:'ready',channels:[{guildId,channelId:siblingId,sourceId:siblingSource,enabled:true,policyRevision:1}]});
 const config=readAutomationConfig({AGENT_AUTOMATION_ENABLED:'true'}),env={ASSISTANT_ALLOWED_SOURCE_IDS:[gmail,calendar,member,other].join(','),AGENT_GMAIL_SOURCE_ID:gmail,AGENT_CALENDAR_SOURCE_ID:calendar,AGENT_MEMBER_PLANS_SOURCE_ID:member};
 const deps={googleConfig:{configured:true},googleClient:{configured:true},discordConfig:f.config,discordStore:f.store,discordClient:f.client,calendarConfig:{configured:false},calendarClient:{configured:false}};
 const selected=createAutomationAdapters({env,config,dependencies:deps,manual:{force:true,channelIds:[channelId]},fetchImpl:async()=>{throw Error('No external reads');}});
 assert.deepEqual(await selected.resolveClaimSourceIds({principal:selected.principal}),[sourceId]);assert.equal(selected.principal.googleAccess,false);assert(!selected.principal.allowedSourceIds.includes(gmail));assert(!selected.principal.allowedSourceIds.includes(other));
 const normal=createAutomationAdapters({env,config,dependencies:deps,manual:{force:true,channelIds:[]},fetchImpl:async()=>{throw Error('No external reads');}});
 assert.deepEqual(await normal.resolveClaimSourceIds({principal:normal.principal}),[siblingSource,gmail]);assert.equal(normal.principal.googleAccess,true);
 const snapshots=[],staged=createAutomationAdapters({env:{...env,AGENT_AUTOMATION_STAGED_ENABLED:'true'},config,
  dependencies:{...deps,memberConfig:{configured:false,sourceId:member},memberClient:{configured:false,calendarId:'synthetic-members@group.calendar.google.com'},taskStore:{prune:async()=>({status:'ready'}),catalogue:async args=>{snapshots.push(args);return {status:'ready',tasks:[]};},read:async()=>({status:'not_found'})}},
  manual:{force:true,channelIds:[channelId]},fetchImpl:async()=>{throw Error('No external reads');}});
 await staged.resolveClaimSourceIds({principal:staged.principal});
 await staged.pipeline.beginCycle({leaseToken:randomUUID(),inputs:[],recordExecution:()=>{},getExecutionLog:()=>[]});
 assert.deepEqual(snapshots[0].allowedSourceIds.sort(),[sourceId,calendar,member].sort());
 assert(!snapshots[0].allowedSourceIds.some(id=>[gmail,other,siblingSource,threadSource].includes(id)));
});

test('043 actual SQL returns only selected metadata ancestry, no sibling/content; RPC is service-only and read-only',async()=>{
 const db=new PGlite();try {
  await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create table public.discord_view_policies(guild_id text primary key,revision int,paused boolean,discovery_enabled boolean,discovery_state jsonb,channels jsonb);grant select on public.discord_view_policies to service_role;');
  const f=fixture(),rows=f.metadata.nodes.map(n=>({channel_id:n.channelId,parent_id:n.parentId,channel_type:n.type,source_id:n.sourceId,title:n.title,manual_disabled:n.manualDisabled,discovery_withdrawn:n.withdrawn,access_status:n.accessStatus,generation:n.generation,policy_revision:n.policyRevision,raw_message:'PRIVATE_SENTINEL'}));
  await db.query('insert into public.discord_view_policies values($1,1,false,true,$2,$3)',[guildId,JSON.stringify({published:{generation,policy_revision:1}}),JSON.stringify(rows)]);
  await db.exec(await readFile(new URL('../supabase/migrations/202610220043_discord_manual_scope.sql',import.meta.url),'utf8'));
  const rpc=async ids=>(await db.query('select public.discord_manual_scope_metadata($1,$2) result',[guildId,ids])).rows[0].result;
  for(const role of ['anon','authenticated','service_role'])assert.equal((await db.query("select has_function_privilege($1,'public.discord_manual_scope_metadata(text,text[])','EXECUTE') allowed",[role])).rows[0].allowed,role==='service_role');
  const before=(await db.query('select * from public.discord_view_policies')).rows;await db.exec('set role service_role');
  const result=await rpc([threadId]);assert.deepEqual(result.nodes.map(n=>n.channel_id).sort(),[categoryId,channelId,threadId]);assert(!JSON.stringify(result).includes('PRIVATE_SENTINEL'));assert(!JSON.stringify(result).includes(siblingSource));
  for(const ids of [null,[],[channelId,channelId],['200\n'],Array.from({length:31},(_,i)=>String(i))])await assert.rejects(rpc(ids),e=>e.code==='23514');
  await db.exec('reset role');assert.deepEqual((await db.query('select * from public.discord_view_policies')).rows,before);
 }finally{await db.close();}
});
