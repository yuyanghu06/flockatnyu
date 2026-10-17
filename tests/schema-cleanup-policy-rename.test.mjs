import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {vector} from '@electric-sql/pglite-pgvector';
import {createDiscordStore} from '../server/discord/store.js';
import {createDiscordLiveSummaryStore} from './fixtures/legacy-live-summary-store.mjs';
const guild='1203562091500404776',channel='1203562091982622814',source='22222222-2222-4222-8222-222222222222',member='local-development';
async function migration(n){const files=await readdir(new URL('../supabase/migrations/',import.meta.url));const file=files.find(f=>Number(f.slice(8,12))===n&&f.endsWith('.sql'));assert(file,'Missing migration '+n);return readFile(new URL('../supabase/migrations/'+file,import.meta.url),'utf8');}
async function rpc(db,name,args={}){const keys=Object.keys(args);return (await db.query('select public.'+name+'('+keys.map((k,i)=>k+' => $'+(i+1)).join(',')+') value',keys.map(k=>args[k]&&typeof args[k]==='object'&&!Array.isArray(args[k])?JSON.stringify(args[k]):args[k]))).rows[0].value;}
const live=(db,name,args)=>rpc(db,'discord_live_summary_'+name,args);
async function tx(db,fn){await db.exec('begin');try{await fn();}finally{await db.exec('rollback');}}
async function rows(db,table){return (await db.query(`select to_jsonb(t) value from public.${table} t order by to_jsonb(t)::text`)).rows;}
async function functions(db){return (await db.query("select oid,proname,pg_get_function_identity_arguments(oid) args,pg_get_function_result(oid) result,proacl,prosecdef,provolatile,proconfig,prosrc from pg_proc where pronamespace='public'::regnamespace order by oid")).rows;}
async function rejected(db,fn,code){await db.exec('savepoint rejection');await assert.rejects(fn,e=>e.code===code);await db.exec('rollback to savepoint rejection');}

test('001–015 real SQL: policy rename preserves existing controls/data and current worker contracts',async t=>{
 const db=new PGlite({extensions:{vector}});
 try{
  await db.exec('create role anon;create role authenticated;create role service_role bypassrls;');for(let n=1;n<=14;n++)await db.exec(await migration(n));
  await db.exec("insert into public.discord_admin_members(member_id) values('local-development')");
  await db.query("insert into public.discord_guild_policies(guild_id,revision,paused,discovery_enabled,excluded_category_ids,excluded_channel_ids,backfill_from) values($1,7,false,true,array['444444444444444444'],array['555555555555555555'],'2020-01-01Z'),('123456789012345678',3,true,false,array['666666666666666666'],array['777777777777777777'],'2021-05-01Z')",[guild]);
  await db.query("insert into public.knowledge_sources(id,kind,external_id,title,status) values($1,'discord',$2,'Existing channel','active')",[source,channel]);
  await db.query("insert into public.discord_channels(source_id,channel_id,guild_id,title,enabled,policy_revision,backfill_from) values($1,$2,$3,'Existing channel',true,7,'2020-01-01Z')",[source,channel,guild]);
  await db.query("insert into public.knowledge_source_members(source_id,member_id,can_read,can_write) values($1,'local-development',true,false),($1,'33333333-3333-4333-8333-333333333333',false,true)",[source]);
  const generation=randomUUID(),state={generation,policyRevision:7,phase:'complete'};
  await db.query("insert into public.discord_channel_metadata(guild_id,channel_id,channel_type,access_status,eligible,generation) values($1,$2,0,'ready',true,$3)",[guild,channel,generation]);
  await db.query("insert into public.discord_discovery_state(guild_id,policy_revision,generation,state) values($1,7,$2,$3)",[guild,generation,JSON.stringify(state)]);
  await db.query("insert into public.discord_live_summary_state(guild_id,summary_only,transitioned_at) values($1,true,now())",[guild]);
  const tableNames=(await db.query("select relname from pg_class where relnamespace='public'::regnamespace and relkind='r' order by relname")).rows.map(r=>r.relname);
  const beforeRows=Object.fromEntries(await Promise.all(tableNames.map(async name=>[name,await rows(db,name)])));
  const beforeFunctions=await functions(db),beforeRoles=(await db.query("select rolname,rolconfig from pg_roles where rolname in ('anon','authenticated','service_role') order by rolname")).rows;
  const relationBefore=(await db.query("select oid,relacl,relrowsecurity,relforcerowsecurity from pg_class where oid='public.discord_guild_policies'::regclass")).rows[0];
  const budgetsBefore=(await db.query("select current_setting('statement_timeout') timeout,current_setting('work_mem') memory")).rows;
  const sql=await migration(15);assert(!/\b(?:drop|truncate)[^;]*\bcascade\b/i.test(sql));await db.exec(sql);await db.exec('set role service_role');
  await t.test('rename preserves same relation and every row, exactly21 tables and12 Miro columns',async()=>{
   assert.equal((await db.query("select to_regclass('public.discord_guild_policies') value")).rows[0].value,null);
   const afterTables=(await db.query("select relname from pg_class where relnamespace='public'::regnamespace and relkind='r' order by relname")).rows.map(r=>r.relname);
   assert.equal(afterTables.length,21);assert.deepEqual(afterTables,tableNames.map(n=>n==='discord_guild_policies'?'discord_view_policies':n).sort());
   assert.equal((await db.query("select count(*)::int n from information_schema.columns where table_schema='public' and table_name='miro_boards'")).rows[0].n,12);
   assert.deepEqual((await db.query("select oid,relacl,relrowsecurity,relforcerowsecurity from pg_class where oid='public.discord_view_policies'::regclass")).rows[0],relationBefore);
   for(const [name,contents] of Object.entries(beforeRows))assert.deepEqual(await rows(db,name==='discord_guild_policies'?'discord_view_policies':name),contents,name);
  });
  await t.test('every existing function signature/ACL/settings/body preserved except required relation rename; no dangling bodies',async()=>{
   const expected=beforeFunctions.map(f=>({...f,prosrc:f.prosrc.replaceAll('discord_guild_policies','discord_view_policies')}));assert.deepEqual(await functions(db),expected);
   for(const f of await functions(db))assert(!/\bdiscord_guild_policies\b/.test(f.prosrc),f.proname);
   assert.deepEqual((await db.query("select rolname,rolconfig from pg_roles where rolname in ('anon','authenticated','service_role') order by rolname")).rows,beforeRoles);
   assert.deepEqual((await db.query("select current_setting('statement_timeout') timeout,current_setting('work_mem') memory")).rows,budgetsBefore);
  });
  await t.test('renamed policy table and helpers remain service-only and force RLS',async()=>{
   const protections=(await db.query("select relname,relrowsecurity,relforcerowsecurity,has_table_privilege('anon',oid,'SELECT,INSERT,UPDATE,DELETE') anon,has_table_privilege('authenticated',oid,'SELECT,INSERT,UPDATE,DELETE') authenticated from pg_class where relnamespace='public'::regnamespace and relkind='r'")).rows;
   assert.equal(protections.length,21);for(const row of protections)assert(row.relrowsecurity&&row.relforcerowsecurity&&!row.anon&&!row.authenticated,row.relname);
   for(const role of ['anon','authenticated']){await db.exec('set role '+role);await assert.rejects(db.query('select * from public.discord_view_policies'),e=>e.code==='42501');await assert.rejects(rpc(db,'discord_get_policy',{p_guild_id:guild}),e=>e.code==='42501');}await db.exec('set role service_role');
  });
  await t.test('existing JS store/current RPC signatures fetch policy, configure channels and list metadata after rename',()=>tx(db,async()=>{
   const errors=[],calls=[],fetchImpl=async(url,options)=>{const name=url.split('/').at(-1);calls.push(name);try{const args=JSON.parse(options.body);if(name==='discord_sync_channels')return Response.json((await db.query('select * from public.discord_sync_channels()')).rows);if(name==='discord_list_channels')return Response.json((await db.query('select * from public.discord_list_channels($1)',[args.p_member_id])).rows);return Response.json(await rpc(db,name,args));}catch(error){errors.push({name,code:error.code});return Response.json({code:error.code},{status:400});}};
   const env={SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'fixture'},store=createDiscordStore({env,fetchImpl}),summaryStore=createDiscordLiveSummaryStore({env,fetchImpl});
   const policy=await store.getPolicy({guildId:guild});assert.equal(policy.status,'ready');assert.equal(policy.policy.revision,7);assert.deepEqual(policy.policy.excludedCategoryIds,['444444444444444444']);
   assert.equal((await store.configureChannel({principal:{id:member,isAdmin:true},channel:{sourceId:source,channelId:channel,guildId:guild,title:'Renamed channel',enabled:true,backfillFrom:'2020-01-01T00:00:00Z'}})).status,'ready');
   assert.equal((await store.listSyncChannels()).channels.length,1);assert.equal((await store.listChannels({principal:{id:member,isAdmin:true}})).channels.length,1);
   assert.equal((await summaryStore.getStatus({guildId:guild})).status,'ready');assert(calls.includes('discord_get_policy'));assert.equal(errors.length,0);
  }));
  await t.test('policy configuration/discovery/CAS/eligibility and weekly/monthly summary plan/status remain active',()=>tx(db,async()=>{
   const grants=await rows(db,'knowledge_source_members'),admins=await rows(db,'discord_admin_members');
   const policy={paused:false,discovery_enabled:true,excluded_category_ids:['444444444444444444'],excluded_channel_ids:[],backfill_from:'2020-01-01T00:00:00Z'};
   await rejected(db,()=>rpc(db,'discord_configure_policy',{p_member_id:randomUUID(),p_guild_id:guild,p_policy:policy,p_expected_revision:7}),'42501');
   await rejected(db,()=>rpc(db,'discord_configure_policy',{p_member_id:member,p_guild_id:guild,p_policy:policy,p_expected_revision:6}),'40001');
   const p=await rpc(db,'discord_configure_policy',{p_member_id:member,p_guild_id:guild,p_policy:policy,p_expected_revision:7});assert.equal(p.revision,8);assert.equal(await rpc(db,'discord_channel_allowed',{p_guild_id:guild,p_channel_id:channel}),false);
   const gen=randomUUID(),next={generation:gen,policyRevision:8,phase:'channels'};
   assert.equal(await rpc(db,'discord_persist_discovery',{p_guild_id:guild,p_expected_policy_revision:8,p_expected_generation:null,p_expected_state:null,p_channels:[{channelId:channel,guildId:guild,parentId:null,type:0,eligible:true,accessStatus:'ready',title:'Existing channel'}],p_state:next}),true);
   assert.equal(await rpc(db,'discord_complete_discovery',{p_guild_id:guild,p_generation:gen,p_expected_policy_revision:8,p_expected_state:next,p_state:{...next,phase:'complete'}}),true);assert.equal(await rpc(db,'discord_channel_allowed',{p_guild_id:guild,p_channel_id:channel}),true);
   const plan={p_guild_id:guild,p_as_of:new Date().toISOString(),p_mode:'scheduled',p_provider:'openai-compatible',p_model:'gpt-6-luna',p_prompt_version:'rename-test'};
   assert.equal((await live(db,'plan',plan)).planned,2);assert.equal((await live(db,'plan',plan)).planned,0);assert.equal((await live(db,'status',{p_guild_id:guild})).pendingJobs,2);
   const job=await live(db,'claim',{p_guild_id:guild,p_provider:'openai-compatible',p_model:'gpt-6-luna',p_prompt_version:'rename-test'});assert(job&&job.policy_revision===8);assert.equal(await live(db,'renew',{p_job_id:job.id,p_lease_token:job.lease_token}),true);
   assert.deepEqual(await rows(db,'knowledge_source_members'),grants);assert.deepEqual(await rows(db,'discord_admin_members'),admins);
  }));
 }finally{await db.close();}
});
