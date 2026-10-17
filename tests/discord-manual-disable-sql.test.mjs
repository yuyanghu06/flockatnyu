import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {vector} from '@electric-sql/pglite-pgvector';
import {createDiscordStore} from '../server/discord/store.js';
import {runDiscordDiscovery} from '../server/discord/discovery.js';

const guild='1203562091500404776',partialGuild='1203562091500404777';
const ids={category:'200',manual:'201',other:'202',unknown:'203',returned:'204',blockedCategory:'300',blockedChild:'301',blockedThread:'302',blockedChannel:'401',blockedChannelThread:'402'};
const source=randomUUID();
async function migration(number){const dir=new URL('../supabase/migrations/',import.meta.url);const file=(await readdir(dir)).find(f=>f.endsWith('.sql')&&Number(f.slice(8,12))===number);assert(file);return readFile(new URL(file,dir),'utf8');}
async function rpc(db,name,args={}){const keys=Object.keys(args);return(await db.query(`select public.${name}(${keys.map((key,i)=>key+' => $'+(i+1)).join(',')}) result`,keys.map(key=>args[key]!==null&&typeof args[key]==='object'?JSON.stringify(args[key]):args[key]))).rows[0].result;}
async function rows(db,name){return(await db.query(`select to_jsonb(t) value from public.${name} t order by to_jsonb(t)::text`)).rows;}
async function policy(db,gid=guild){return(await db.query('select to_jsonb(p) value from public.discord_view_policies p where guild_id=$1',[gid])).rows[0].value;}
const sync=db=>rpc(db,'discord_sync_channels');
function transport(db){return createDiscordStore({env:{SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'fixture'},fetchImpl:async(url,opts)=>Response.json(await rpc(db,url.split('/').at(-1),JSON.parse(opts.body)))});}
function node(channelId,generation,extra={}){return {guild_id:guild,channel_id:channelId,parent_id:null,channel_type:0,access_status:'ready',eligible:true,generation,title:'Fixture '+channelId,enabled:false,source_status:'disabled',source_id:randomUUID(),policy_revision:2,backfill_from:'2020-01-01T00:00:00Z',...extra};}
async function seed(db){
 const generation=randomUUID();
 const channels=[
  node(ids.category,generation,{channel_type:4,eligible:false,access_status:'metadata',source_id:null}),
  node(ids.manual,generation,{parent_id:ids.category,source_id:source}),
  node(ids.other,generation,{parent_id:ids.category,enabled:true}),
  node(ids.unknown,generation,{eligible:false,access_status:'unknown_ancestry'}),
  node(ids.returned,randomUUID()),
  node(ids.blockedCategory,generation,{channel_type:4,eligible:false,access_status:'metadata',source_id:null}),
  node(ids.blockedChild,generation,{parent_id:ids.blockedCategory}),
  node(ids.blockedThread,generation,{parent_id:ids.blockedChild,channel_type:11}),
  node(ids.blockedChannel,generation),
  node(ids.blockedChannelThread,generation,{parent_id:ids.blockedChannel,channel_type:11}),
 ];
 const state={guild_id:guild,policy_revision:1,generation,state:{generation,policyRevision:1,phase:'complete'}};
 await db.query('insert into public.discord_view_policies(guild_id,revision,paused,discovery_enabled,excluded_category_ids,excluded_channel_ids,channels,discovery_state) values($1,2,false,true,$2,$3,$4,$5)',[guild,[ids.blockedCategory],[ids.blockedChannel],JSON.stringify(channels),JSON.stringify(state)]);
 const partialGeneration=randomUUID(),partialState={guild_id:partialGuild,policy_revision:1,generation:partialGeneration,state:{generation:partialGeneration,policyRevision:1,phase:'active'}};
 await db.query('insert into public.discord_view_policies(guild_id,revision,paused,discovery_enabled,channels,discovery_state) values($1,1,false,true,$2,$3)',[partialGuild,JSON.stringify([node('501',partialGeneration,{guild_id:partialGuild,policy_revision:1})]),JSON.stringify(partialState)]);
 await db.exec("insert into public.knowledge_sources(kind,external_id,title,status) values('manual','m36-retain','Unrelated source','active');select public.miro_sync_register(p_board_id=>'m36-retained-board');insert into public.agent_input_cache(raw_response) values('{\"original\":{\"body\":\"keep-exact\"}}');insert into public.agent_automation_state values('subscription:gmail:m36','{\"historyId\":\"90071992547409931234\"}');");
}
async function schema(db){return {
 tables:(await db.query("select relname,relrowsecurity,relforcerowsecurity,relacl::text from pg_class where relnamespace='public'::regnamespace and relkind='r' order by relname")).rows,
 columns:(await db.query("select table_name,column_name,data_type,column_default,is_nullable from information_schema.columns where table_schema='public' order by table_name,ordinal_position")).rows,
 functions:(await db.query("select oid::regprocedure::text signature,prosecdef,proconfig,proacl::text from pg_proc where pronamespace='public'::regnamespace order by 1")).rows,
};}
async function configure(db,enabled){return rpc(db,'discord_configure_channel',{p_member_id:null,p_channel:{guild_id:guild,channel_id:ids.manual,source_id:source,title:'Manual channel',enabled,backfill_from:'2020-01-01T00:00:00Z'}});}
function discoveryClient(){
 const channels=[{id:ids.category,type:4,parent_id:null},{id:ids.manual,type:0,parent_id:ids.category},{id:ids.other,type:0,parent_id:ids.category},{id:ids.returned,type:0,parent_id:null},{id:ids.blockedCategory,type:4,parent_id:null},{id:ids.blockedChild,type:0,parent_id:ids.blockedCategory},{id:ids.blockedChannel,type:0,parent_id:null}].map(n=>({...n,guild_id:guild,name:'Refreshed '+n.id}));
 const threads=[{id:ids.blockedThread,type:11,parent_id:ids.blockedChild},{id:ids.blockedChannelThread,type:11,parent_id:ids.blockedChannel}].map(n=>({...n,guild_id:guild,name:'Thread '+n.id}));
 return {configured:true,getGuildChannels:async()=>channels,getChannel:async({channelId})=>({...[...channels,...threads].find(n=>n.id===channelId),botPermissions:'66560'}),getActiveThreads:async()=>({threads}),getArchivedThreads:async()=>({threads:[],hasMore:false}),getMessages:()=>assert.fail('Metadata discovery must not read messages')};
}
async function discover(db,limits){const result=await runDiscordDiscovery({config:{configured:true,guildId:guild},store:transport(db),client:discoveryClient(),limits});assert.equal(result.status,limits?'partial':'ready',JSON.stringify(result));return result;}

test('020 real SQL: manual disable survives discovery without changing schema, source identities or access controls',async t=>{
 const db=new PGlite({extensions:{vector}});
 try{
  await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create role manual_disable_public_probe;');
  for(let n=1;n<=19;n++)await db.exec(await migration(n));
  await seed(db);await configure(db,false); // Exercise the deployed017 admin-disable RPC before upgrading.
  assert.equal(await rpc(db,'discord_channel_allowed',{p_guild_id:guild,p_channel_id:ids.returned,p_allow_paused:true}),true,'Stale root passes017 ancestry helper;020 generation check must prevent a false manual disable');
  const beforeSchema=await schema(db),beforePolicy=await policy(db),beforePartial=await policy(db,partialGuild),unrelated={};
  for(const name of ['knowledge_sources','miro_boards','agent_input_cache','agent_automation_state'])unrelated[name]=await rows(db,name);
  await db.exec(await migration(20));
  await db.exec('set role service_role');

  await t.test('forward migration preserves exactly five tables, columns, ACLs, unrelated data and every source UUID',async()=>{
   await db.exec('reset role');assert.deepEqual(await schema(db),beforeSchema);
   assert.deepEqual(beforeSchema.tables.map(r=>r.relname),['agent_automation_state','agent_input_cache','discord_view_policies','knowledge_sources','miro_boards']);
   for(const [name,expected]of Object.entries(unrelated))assert.deepEqual(await rows(db,name),expected,name);
   const expected=structuredClone(beforePolicy);expected.channels.find(n=>n.channel_id===ids.manual).manual_disabled=true;
   assert.deepEqual(await policy(db),expected);assert.deepEqual(await policy(db,partialGuild),beforePartial,'Partial generation is not evidence of manual intent');
   await db.exec('set role service_role');
  });
  await t.test('legacy backfill distinguishes manual disable from blacklist, unknown ancestry and transient discovery disable',async()=>{
   const p=await policy(db),flagged=p.channels.filter(n=>n.manual_disabled).map(n=>n.channel_id);assert.deepEqual(flagged,[ids.manual]);
   assert.equal((await policy(db,partialGuild)).channels[0].manual_disabled,undefined);
   await discover(db);const nodes=(await policy(db)).channels;assert.equal(nodes.find(n=>n.channel_id===ids.manual).enabled,false);assert.equal(nodes.find(n=>n.channel_id===ids.manual).source_status,'disabled');assert.equal(nodes.find(n=>n.channel_id===ids.manual).source_id,source);
   assert.deepEqual((await sync(db)).map(n=>n.channel_id),[ids.other,ids.returned]);
  });
  await t.test('stale disappeared nodes are not backfilled as manual disables and reactivate when rediscovered',async()=>{
   const p=await policy(db),n=p.channels.find(n=>n.channel_id===ids.returned);assert.equal(n.manual_disabled,undefined);assert.equal(n.enabled,true);assert.equal(n.source_status,'active');assert((await sync(db)).some(row=>row.source_id===n.source_id));
  });
  await t.test('explicit enable clears intent; capped refresh publishes nothing until completion and keeps UUIDs',async()=>{
   const old=await policy(db),identities=new Map(old.channels.map(n=>[n.channel_id,n.source_id]));
   const result=await configure(db,true);assert.equal(result.manual_disabled,false);assert.equal((await sync(db)).length,0);
   await discover(db,{maxPages:1});assert.equal((await sync(db)).length,0);const partial=await policy(db);assert.notEqual(partial.discovery_state.state.phase,'complete');assert.equal(partial.channels.find(n=>n.channel_id===ids.manual).manual_disabled,false);
   await discover(db);assert.deepEqual((await sync(db)).map(n=>n.channel_id).sort(),[ids.manual,ids.other,ids.returned]);
   for(const n of (await policy(db)).channels)assert.equal(n.source_id,identities.get(n.channel_id),n.channel_id);
  });
  await t.test('explicit disable remains disabled through partial, resumed and repeated full JS discovery refreshes',async()=>{
   assert.equal((await configure(db,false)).manual_disabled,true);await discover(db,{maxPages:1});assert.equal((await sync(db)).length,0);
   await discover(db);await discover(db);assert.deepEqual((await sync(db)).map(n=>n.channel_id),[ids.other,ids.returned]);
   const n=(await policy(db)).channels.find(n=>n.channel_id===ids.manual);assert.equal(n.source_id,source);assert.equal(n.manual_disabled,true);assert.equal(n.enabled,false);assert.equal(n.source_status,'disabled');
  });
  await t.test('blacklist inheritance stays independent of explicit enable and manual intent',async()=>{
   await configure(db,true);await discover(db);let p=await policy(db);
   for(const id of [ids.blockedChild,ids.blockedThread,ids.blockedChannel,ids.blockedChannelThread]){const n=p.channels.find(n=>n.channel_id===id);assert.equal(n.enabled,false,id);assert.equal(n.source_status,'disabled',id);assert.equal(n.manual_disabled,undefined,id);}
   const blocked=p.channels.find(n=>n.channel_id===ids.blockedChild);
   await rpc(db,'discord_configure_channel',{p_member_id:null,p_channel:{guild_id:guild,channel_id:ids.blockedChild,source_id:blocked.source_id,title:blocked.title,enabled:true}});await discover(db);
   assert(!(await sync(db)).some(n=>n.channel_id===ids.blockedChild),'Explicit enable cannot bypass category blacklist');
   p=await policy(db);await rpc(db,'discord_configure_policy',{p_member_id:null,p_guild_id:guild,p_expected_revision:p.revision,p_policy:{paused:false,discovery_enabled:true,excluded_category_ids:[],excluded_channel_ids:[]}});await discover(db);
   assert((await sync(db)).some(n=>n.channel_id===ids.blockedChild),'Removing blacklist resumes eligible channel without a fabricated manual disable');
   assert((await sync(db)).some(n=>n.channel_id===ids.blockedThread),'Removing category blacklist resumes descendant thread');
  });
  await t.test('partial discovery rows without manual intent can complete normally after migration',async()=>{
   const p=await policy(db,partialGuild),previous=p.discovery_state.state,generation=previous.generation;
   await rpc(db,'discord_complete_discovery',{p_guild_id:partialGuild,p_generation:generation,p_expected_policy_revision:1,p_expected_state:previous,p_state:{...previous,phase:'complete'}});
   assert((await sync(db)).some(n=>n.channel_id==='501'));
  });
  await t.test('replacement RPCs remain service-only security invokers; public roles cannot configure or publish',async()=>{
   for(const f of (await db.query("select oid::regprocedure::text signature,prosecdef from pg_proc where pronamespace='public'::regnamespace and proname in ('discord_configure_channel','discord_complete_discovery')")).rows){assert.equal(f.prosecdef,false);for(const role of ['anon','authenticated','manual_disable_public_probe','service_role'])assert.equal((await db.query("select has_function_privilege($1,$2,'EXECUTE') allowed",[role,f.signature])).rows[0].allowed,role==='service_role');}
   for(const role of ['anon','authenticated','manual_disable_public_probe']){await db.exec('set role '+role);await assert.rejects(configure(db,false),e=>e.code==='42501');await assert.rejects(db.query('select * from public.discord_view_policies'),e=>e.code==='42501');}await db.exec('set role service_role');
  });
 }finally{await db.close();}
});
