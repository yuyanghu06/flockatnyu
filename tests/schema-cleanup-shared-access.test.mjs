import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {vector} from '@electric-sql/pglite-pgvector';
import {SUMMARY_FIELDS} from '../server/discord/summary-provider.js';
import {createDiscordStore} from '../server/discord/store.js';
import {createDiscordLiveSummaryStore} from './fixtures/legacy-live-summary-store.mjs';
import {createMiroStore} from './fixtures/retired-miro-rest/store.js';
const guild='1203562091500404776',otherGuild='123456789012345678',channel='1203562091982622814',source='22222222-2222-4222-8222-222222222222',otherSource='44444444-4444-4444-8444-444444444444';
const legacyJob=randomUUID(),legacyResult=randomUUID(),legacyCertificate=randomUUID(),legacyOperation=randomUUID(),legacyReceipt=randomUUID(),messageId='1500000000000000001';
const hash='a'.repeat(64),summary=Object.fromEntries(SUMMARY_FIELDS.map(k=>[k,k==='overview'?[{text:'Preserved fixture fact',messageIds:[messageId]}]:[]]));
const citations=[{messageId,url:`https://discord.com/channels/${guild}/${channel}/${messageId}`}];
async function migration(n){const files=await readdir(new URL('../supabase/migrations/',import.meta.url));const file=files.find(f=>Number(f.slice(8,12))===n&&f.endsWith('.sql'));assert(file,'Missing migration '+n);return readFile(new URL('../supabase/migrations/'+file,import.meta.url),'utf8');}
async function rpc(db,name,args={}){const keys=Object.keys(args);return (await db.query('select public.'+name+'('+keys.map((k,i)=>k+' => $'+(i+1)).join(',')+') value',keys.map(k=>args[k]&&typeof args[k]==='object'&&!Array.isArray(args[k])?JSON.stringify(args[k]):args[k]))).rows[0].value;}
const live=(db,name,args)=>rpc(db,'discord_live_summary_'+name,args);
async function tx(db,fn){await db.exec('begin');try{await fn();}finally{await db.exec('rollback');}}
async function tableRows(db,name){return (await db.query(`select to_jsonb(t) data from public.${name} t order by to_jsonb(t)::text`)).rows;}
async function seed(db){
 for(const [sid,gid,cid] of [[source,guild,channel],[otherSource,otherGuild,'123456789012345679']]){
  await db.query('insert into public.discord_view_policies(guild_id,revision,paused,discovery_enabled) values($1,1,false,true)',[gid]);
  await db.query("insert into public.knowledge_sources(id,kind,external_id,title,status) values($1,'discord',$2,'Fixture','active')",[sid,cid]);
  await db.query("insert into public.discord_channels(source_id,channel_id,guild_id,title,enabled,policy_revision,backfill_from) values($1,$2,$3,'Fixture channel',true,1,'2020-01-01Z')",[sid,cid,gid]);
  const generation=randomUUID();await db.query("insert into public.discord_channel_metadata(guild_id,channel_id,channel_type,access_status,eligible,generation) values($1,$2,0,'ready',true,$3)",[gid,cid,generation]);
  await db.query("insert into public.discord_discovery_state(guild_id,policy_revision,generation,state) values($1,1,$2,'{\"phase\":\"complete\"}')",[gid,generation]);
  await db.query('insert into public.knowledge_source_members(source_id,member_id,can_read) values($1,$2,true)',[sid,'local-development']);
 }
 await db.query("insert into public.discord_summary_operations(id,guild_id,policy_revision,provider,model,prompt_version,mode,as_of,due_identity,manifest_fingerprint,total_jobs,max_cost_usd,max_requests) values($1,$2,1,'openai-compatible','gpt-6-luna','legacy-v1','weekly',now(),'fixture',$3,1,1,100)",[legacyOperation,guild,hash]);
 await db.query("insert into public.discord_summary_jobs(id,source_id,guild_id,channel_id,channel_name,tier,period_key,period_start,period_end,input_record_count,represented_message_count,raw_message_count,summary_input_count,input_fingerprint,message_count,segment_count,input_chars,provider,model,prompt_version,policy_revision,status,operation_id) values($1,$2,$3,$4,'Fixture channel','weekly','weekly:2026-09-28','2026-09-28T04:00Z','2026-10-05T04:00Z',1,1,1,0,$5,1,1,30,'openai-compatible','gpt-6-luna','legacy-v1',1,'succeeded',$6)",[legacyJob,source,guild,channel,hash,legacyOperation]);
 await db.query("insert into public.discord_summary_certificates(id,job_id,source_id,channel_name,range_start,range_end,tier,period_key,represented_message_count,raw_message_count,summary_input_count,input_record_count,coverage_digest,input_fingerprint,summary_hash,provider,model,prompt_version) values($1,$2,$3,'Fixture channel','2026-09-28T04:00Z','2026-10-05T04:00Z','weekly','weekly:2026-09-28',1,1,0,1,$4,$4,encode(sha256(convert_to($5::jsonb::text,'UTF8')),'hex'),'openai-compatible','gpt-6-luna','legacy-v1')",[legacyCertificate,legacyJob,source,hash,JSON.stringify(summary)]);
 await db.query("insert into public.discord_summary_results(id,job_id,source_id,certificate_id,channel_name,summary,citations) values($1,$2,$3,$4,'Fixture channel',$5,$6)",[legacyResult,legacyJob,source,legacyCertificate,JSON.stringify(summary),JSON.stringify(citations)]);
 await db.query("insert into public.discord_compaction_ledger(source_id,certificate_id,range_start,range_end,tier,period_key,represented_message_count,coverage_digest) values($1,$2,'2026-09-28T04:00Z','2026-10-05T04:00Z','weekly','weekly:2026-09-28',1,$3)",[source,legacyCertificate,hash]);
 await db.query("insert into public.discord_summary_requests(id,operation_id,job_id,lease_token,max_cost_usd,status,input_tokens,output_tokens,actual_cost_usd) values($1,$2,$3,$4,0.001,'succeeded',10,10,0.0001)",[legacyReceipt,legacyOperation,legacyJob,randomUUID()]);
}
const boardData={schemaVersion:1,board:{id:'board1',name:'Shared calendar'},items:[{id:'sticky1',data:{content:'Retain exact source'},position:{x:10,y:20}}],connectors:[],groups:[],tags:[],itemTags:{},groupItems:{},coverage:{complete:true},captureStartedAt:'2026-01-01T00:00:00Z',captureFinishedAt:'2026-01-01T00:01:00Z'};

test('001–016 actual SQL shared access removes only authorized memberships and preserves scoped runtime',async t=>{
 const db=new PGlite({extensions:{vector}});
 try{
  await db.exec('create role anon;create role authenticated;create role service_role bypassrls;');for(let n=1;n<=15;n++)await db.exec(await migration(n));await seed(db);
  await db.exec("insert into public.discord_admin_members(member_id) values('local-development')");
  const board=await rpc(db,'miro_sync_register',{p_board_id:'board1'}),claim=await rpc(db,'miro_sync_claim',{p_board_id:'board1'});
  assert.equal(await rpc(db,'miro_sync_finish',{p_board_id:'board1',p_lease_token:claim.lease_token,p_config_revision:claim.config_revision,p_snapshot:boardData,p_content_hash:hash}),true);
  await db.query("insert into public.knowledge_source_members(source_id,member_id,can_read) values($1,'local-development',true)",[board.source_id]);
  assert.equal((await tableRows(db,'knowledge_source_members')).length,3);assert.equal((await tableRows(db,'discord_admin_members')).length,1);
  await live(db,'queue_embeddings',{p_guild_id:guild,p_limit:1000});
  const all=(await db.query("select relname from pg_class where relnamespace='public'::regnamespace and relkind='r' order by relname")).rows.map(r=>r.relname),kept=all.filter(n=>!['knowledge_source_members','discord_admin_members'].includes(n));
  const before=Object.fromEntries(await Promise.all(kept.map(async n=>[n,await tableRows(db,n)])));
  const fnBefore=(await db.query("select oid,proname,pg_get_function_identity_arguments(oid) args,pg_get_function_result(oid) result,proacl,prosecdef,provolatile,proconfig from pg_proc where pronamespace='public'::regnamespace order by oid")).rows;
  const sql=await migration(16);assert(!/\b(?:drop|truncate)[^;]*\bcascade\b/i.test(sql));await db.exec(sql);await db.exec('set role service_role');
  await t.test('exactly19 tables; both populated membership tables removed and all other rows/functions metadata preserved',async()=>{
   const names=(await db.query("select relname from pg_class where relnamespace='public'::regnamespace and relkind='r' order by relname")).rows.map(r=>r.relname);assert.equal(names.length,19);assert.deepEqual(names,kept);
   for(const name of ['knowledge_source_members','discord_admin_members','discord_guild_policies'])assert.equal((await db.query('select to_regclass($1) value',['public.'+name])).rows[0].value,null);
   for(const [name,contents]of Object.entries(before))assert.deepEqual(await tableRows(db,name),contents,name);
   assert.deepEqual((await db.query("select oid,proname,pg_get_function_identity_arguments(oid) args,pg_get_function_result(oid) result,proacl,prosecdef,provolatile,proconfig from pg_proc where pronamespace='public'::regnamespace order by oid")).rows,fnBefore);
   for(const f of (await db.query("select proname,prosrc from pg_proc where pronamespace='public'::regnamespace")).rows)assert(!/\b(knowledge_source_members|discord_admin_members|discord_guild_policies)\b/.test(f.prosrc),f.proname);
   assert.equal((await db.query("select count(*)::int n from information_schema.columns where table_schema='public' and table_name='miro_boards'")).rows[0].n,12);
  });
  const search={p_member_id:null,p_allowed_source_ids:[source],p_query:'fixture',p_limit:5},legacy={p_member_id:null,p_allowed_source_ids:[source]},miro={p_member_id:null,p_allowed_source_ids:[board.source_id],p_board_id:'board1'};
  await t.test('ignored old member wire args accept null/empty/unknown without memberships; exact source allowlist still required',async()=>{
   for(const member of [null,'',randomUUID(),'not-a-member']){
    assert.equal((await live(db,'search',{...search,p_member_id:member})).length,1);
    assert.equal((await rpc(db,'discord_summary_list_results',{...legacy,p_member_id:member})).length,1);
    assert.deepEqual((await rpc(db,'miro_get_authorized_board',{...miro,p_member_id:member})).data,boardData);
   }
   for(const ids of [null,[],[otherSource],[randomUUID()]]){assert.equal((await live(db,'search',{...search,p_allowed_source_ids:ids})).length,0);assert.equal((await rpc(db,'discord_summary_list_results',{...legacy,p_allowed_source_ids:ids})).length,0);assert.equal(await rpc(db,'miro_get_authorized_board',{...miro,p_allowed_source_ids:ids}),null);}
   assert.equal((await live(db,'search',{...search,p_allowed_source_ids:Array(501).fill(source)})).length,0);assert.equal((await rpc(db,'discord_summary_list_results',{...legacy,p_allowed_source_ids:Array(101).fill(source)})).length,0);assert.equal(await rpc(db,'miro_get_authorized_board',{...miro,p_allowed_source_ids:Array(1001).fill(board.source_id)}),null);
  });
  await t.test('source disabled, channel disabled, policy pause/exclusions/incomplete revision still deny retrieval',async()=>{
   for(const sql of ["update public.knowledge_sources set status='disabled' where id=$1","update public.discord_channels set enabled=false where source_id=$1"]){await tx(db,async()=>{await db.query(sql,[source]);assert.equal((await live(db,'search',search)).length,0);assert.equal((await rpc(db,'discord_summary_list_results',legacy)).length,0);});}
   for(const sql of ["update public.discord_view_policies set paused=true where guild_id=$1","update public.discord_view_policies set excluded_channel_ids=array['"+channel+"'] where guild_id=$1","update public.discord_view_policies set revision=revision+1 where guild_id=$1"]){await tx(db,async()=>{await db.query(sql,[guild]);assert.equal((await live(db,'search',search)).length,0);assert.equal((await rpc(db,'discord_summary_list_results',legacy)).length,0);});}
   await tx(db,async()=>{await db.query("update public.knowledge_sources set status='disabled' where id=$1",[board.source_id]);assert.equal(await rpc(db,'miro_get_authorized_board',miro),null);});
   await tx(db,async()=>{await db.exec("update public.miro_boards set enabled=false where board_id='board1'");assert.equal(await rpc(db,'miro_get_authorized_board',miro),null);});
   await tx(db,async()=>{await db.exec("update public.miro_boards set config_revision=config_revision+1 where board_id='board1'");assert.equal(await rpc(db,'miro_get_authorized_board',miro),null);});
  });
  await t.test('all19tables force RLS and every RPC remains service-only; no browser admin path',async()=>{
   const tables=(await db.query("select relname,relrowsecurity,relforcerowsecurity,has_table_privilege('anon',oid,'SELECT,INSERT,UPDATE,DELETE') anon,has_table_privilege('authenticated',oid,'SELECT,INSERT,UPDATE,DELETE') authenticated from pg_class where relnamespace='public'::regnamespace and relkind='r'")).rows;assert.equal(tables.length,19);for(const row of tables)assert(row.relrowsecurity&&row.relforcerowsecurity&&!row.anon&&!row.authenticated,row.relname);
   for(const f of (await db.query("select proname,prosecdef,has_function_privilege('anon',oid,'EXECUTE') anon,has_function_privilege('authenticated',oid,'EXECUTE') authenticated,has_function_privilege('service_role',oid,'EXECUTE') service from pg_proc where pronamespace='public'::regnamespace")).rows)assert(!f.prosecdef&&!f.anon&&!f.authenticated&&f.service,f.proname);
   for(const role of ['anon','authenticated']){await db.exec('set role '+role);await assert.rejects(rpc(db,'discord_configure_policy',{p_member_id:null,p_guild_id:guild,p_policy:{}}),e=>e.code==='42501');await assert.rejects(db.query('select * from public.knowledge_sources'),e=>e.code==='42501');}await db.exec('set role service_role');
  });
  await t.test('service admin/discovery configuration and existing JS store wire calls execute without membership rows',()=>tx(db,async()=>{
   const errors=[],fetchImpl=async(url,options)=>{const name=url.split('/').at(-1),args=JSON.parse(options.body);try{if(name==='discord_sync_channels')return Response.json((await db.query('select * from public.discord_sync_channels()')).rows);if(name==='discord_list_channels')return Response.json((await db.query('select * from public.discord_list_channels($1)',[args.p_member_id])).rows);return Response.json(await rpc(db,name,args));}catch(error){errors.push({name,code:error.code});return Response.json({code:error.code},{status:400});}};
   const env={SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'fixture'},store=createDiscordStore({env,fetchImpl}),summaries=createDiscordLiveSummaryStore({env,fetchImpl}),miroStore=createMiroStore({env,fetchImpl}),principal={allowedSourceIds:[source,board.source_id],isAdmin:true};
   assert.equal((await store.listChannels({principal})).status,'ready');assert.equal((await store.configureChannel({principal,channel:{sourceId:source,channelId:channel,guildId:guild,title:'Shared channel',enabled:true,backfillFrom:'2020-01-01T00:00:00Z'}})).status,'ready');
   assert.equal((await summaries.search({principal,query:'fixture'})).status,'ready');assert.equal((await miroStore.getAuthorizedBoard({principal,boardId:'board1'})).status,'ready');
   const policy={paused:false,discovery_enabled:true,excluded_category_ids:[],excluded_channel_ids:[],backfill_from:'2020-01-01T00:00:00Z'};const saved=await rpc(db,'discord_configure_policy',{p_member_id:null,p_guild_id:guild,p_policy:policy,p_expected_revision:1});assert.equal(saved.revision,2);
   const gen=randomUUID(),state={generation:gen,policyRevision:2,phase:'channels'};
   assert.equal(await rpc(db,'discord_persist_discovery',{p_guild_id:guild,p_expected_policy_revision:2,p_expected_generation:null,p_expected_state:null,p_channels:[{channelId:channel,guildId:guild,parentId:null,type:0,eligible:true,accessStatus:'ready',title:'Shared channel'}],p_state:state}),true);
   assert.equal(await rpc(db,'discord_complete_discovery',{p_guild_id:guild,p_generation:gen,p_expected_policy_revision:2,p_expected_state:state,p_state:{...state,phase:'complete'}}),true);
   assert.equal((await live(db,'cutover',{p_guild_id:guild,p_expected_policy_revision:2,p_delete_raw:false})).summaryOnly,true);const plan={p_guild_id:guild,p_as_of:new Date().toISOString(),p_mode:'scheduled',p_provider:'openai-compatible',p_model:'gpt-6-luna',p_prompt_version:'shared-test'};assert.equal((await live(db,'plan',plan)).planned,2);assert.equal((await live(db,'status',{p_guild_id:guild})).pendingJobs,2);assert.equal(errors.length,0);
  }));
 }finally{await db.close();}
});
