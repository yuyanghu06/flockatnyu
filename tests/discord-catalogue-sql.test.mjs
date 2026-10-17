import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {vector} from '@electric-sql/pglite-pgvector';
import {SUMMARY_FIELDS} from '../server/discord/summary-provider.js';
import {createDiscordStore} from '../server/discord/store.js';
import {discordSnowflakeAt} from '../server/discord/live-client.js';
import {createLiveDiscordRetrieval} from '../server/discord/live-retrieval.js';
import {runDiscordDiscovery} from '../server/discord/discovery.js';
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
 for(const [sid,gid,cid] of [[source,guild,channel]]){
  await db.query('insert into public.discord_view_policies(guild_id,revision,paused,discovery_enabled) values($1,1,false,true)',[gid]);
  await db.query("insert into public.knowledge_sources(id,kind,external_id,title,status) values($1,'discord',$2,'Fixture','active')",[sid,cid]);
  await db.query("insert into public.discord_channels(source_id,channel_id,guild_id,title,enabled,policy_revision,backfill_from) values($1,$2,$3,'Fixture channel',true,1,'2020-01-01Z')",[sid,cid,gid]);
  const generation=randomUUID();await db.query("insert into public.discord_channel_metadata(guild_id,channel_id,channel_type,access_status,eligible,generation) values($1,$2,0,'ready',true,$3)",[gid,cid,generation]);
  await db.query("insert into public.discord_discovery_state(guild_id,policy_revision,generation,state) values($1,1,$2,'{\"phase\":\"complete\"}')",[gid,generation]);
 }
 await db.query("insert into public.discord_summary_operations(id,guild_id,policy_revision,provider,model,prompt_version,mode,as_of,due_identity,manifest_fingerprint,total_jobs,max_cost_usd,max_requests) values($1,$2,1,'openai-compatible','gpt-6-luna','legacy-v1','weekly',now(),'fixture',$3,1,1,100)",[legacyOperation,guild,hash]);
 await db.query("insert into public.discord_summary_jobs(id,source_id,guild_id,channel_id,channel_name,tier,period_key,period_start,period_end,input_record_count,represented_message_count,raw_message_count,summary_input_count,input_fingerprint,message_count,segment_count,input_chars,provider,model,prompt_version,policy_revision,status,operation_id) values($1,$2,$3,$4,'Fixture channel','weekly','weekly:2026-09-28','2026-09-28T04:00Z','2026-10-05T04:00Z',1,1,1,0,$5,1,1,30,'openai-compatible','gpt-6-luna','legacy-v1',1,'succeeded',$6)",[legacyJob,source,guild,channel,hash,legacyOperation]);
 await db.query("insert into public.discord_summary_certificates(id,job_id,source_id,channel_name,range_start,range_end,tier,period_key,represented_message_count,raw_message_count,summary_input_count,input_record_count,coverage_digest,input_fingerprint,summary_hash,provider,model,prompt_version) values($1,$2,$3,'Fixture channel','2026-09-28T04:00Z','2026-10-05T04:00Z','weekly','weekly:2026-09-28',1,1,0,1,$4,$4,encode(sha256(convert_to($5::jsonb::text,'UTF8')),'hex'),'openai-compatible','gpt-6-luna','legacy-v1')",[legacyCertificate,legacyJob,source,hash,JSON.stringify(summary)]);
 await db.query("insert into public.discord_summary_results(id,job_id,source_id,certificate_id,channel_name,summary,citations) values($1,$2,$3,$4,'Fixture channel',$5,$6)",[legacyResult,legacyJob,source,legacyCertificate,JSON.stringify(summary),JSON.stringify(citations)]);
 await db.query("insert into public.discord_compaction_ledger(source_id,certificate_id,range_start,range_end,tier,period_key,represented_message_count,coverage_digest) values($1,$2,'2026-09-28T04:00Z','2026-10-05T04:00Z','weekly','weekly:2026-09-28',1,$3)",[source,legacyCertificate,hash]);
 await db.query("insert into public.discord_summary_requests(id,operation_id,job_id,lease_token,max_cost_usd,status,input_tokens,output_tokens,actual_cost_usd) values($1,$2,$3,$4,0.001,'succeeded',10,10,0.0001)",[legacyReceipt,legacyOperation,legacyJob,randomUUID()]);
}
const boardData={schemaVersion:1,board:{id:'board1',name:'Keep Miro'},items:[{id:'s1',data:{content:'Exact source sentinel'},position:{x:1,y:2},unknown:{preserved:true}}],connectors:[],groups:[],tags:[],itemTags:{},groupItems:{},coverage:{complete:true},captureStartedAt:'2026-01-01T00:00:00Z',captureFinishedAt:'2026-01-01T00:01:00Z'};
async function rejectSql(db,fn,code){await db.exec('savepoint rejected');await assert.rejects(fn,e=>e.code===code);await db.exec('rollback to savepoint rejected');}
async function addPopulatedFixture(db){
 await seed(db);
 await db.query('insert into public.discord_summary_operation_jobs(operation_id,job_id,guild_id,ordinal) values($1,$2,$3,0)',[legacyOperation,legacyJob,guild]);
 const generation=(await db.query('select generation from public.discord_discovery_state where guild_id=$1',[guild])).rows[0].generation;
 await db.query("update public.discord_discovery_state set state=$2 where guild_id=$1",[guild,JSON.stringify({generation,policyRevision:1,phase:'complete',parents:[],tasks:[],checkpointSentinel:'retain-discovery'})]);
 await db.query("insert into public.discord_channel_metadata(guild_id,channel_id,channel_type,access_status,eligible,generation) select $1,(9000+i)::text,4,'metadata',false,$2 from generate_series(1,50)i",[guild,generation]);
 await db.query("insert into public.knowledge_sources(id,kind,external_id,title,status) select ('22222222-2222-4222-8222-'||lpad(i::text,12,'0'))::uuid,'discord',($1::bigint+i)::text,'Channel '||i,'active' from generate_series(1,218)i",[channel]);
 await db.query("insert into public.discord_channels(source_id,channel_id,guild_id,title,enabled,policy_revision,backfill_from) select ('22222222-2222-4222-8222-'||lpad(i::text,12,'0'))::uuid,($1::bigint+i)::text,$2,'Channel '||i,true,1,'2020-01-01Z' from generate_series(1,218)i",[channel,guild]);
 await db.query("insert into public.discord_channel_metadata(guild_id,channel_id,parent_id,channel_type,access_status,eligible,generation) select $1,($2::bigint+i)::text,(9001+i%50)::text,0,'ready',true,$3 from generate_series(1,218)i",[guild,channel,generation]);
 await db.query("insert into public.discord_live_summary_state(guild_id,summary_only,transitioned_at) values($1,true,now())",[guild]);
 const job=randomUUID();await db.query("insert into public.discord_live_summary_jobs(id,source_id,guild_id,channel_id,channel_name,tier,period_key,period_start,period_end,provider,model,prompt_version,policy_revision,status) values($1,$2,$3,$4,'Fixture','weekly','weekly:2026-09-28','2026-09-28T04:00Z','2026-10-05T04:00Z','openai-compatible','gpt-6-luna','fixture',1,'succeeded')",[job,source,guild,channel]);
 await db.query("insert into public.discord_live_summary_results(job_id,source_id,summary,citations,message_count,input_hash,page_count,input_bytes,empty_period) values($1,$2,$3,$4,1,$5,1,30,false)",[job,source,JSON.stringify(summary),JSON.stringify(citations),hash]);
 const run=await live(db,'begin_run',{p_guild_id:guild,p_max_cost_usd:0.1,p_max_requests:2});
 await db.query("insert into public.discord_live_summary_requests(id,run_id,job_id,max_cost_usd,input_tokens,output_tokens,status) values($1,$2,$3,0.001,10,10,'unknown')",[randomUUID(),run.id,job]);
 await live(db,'queue_embeddings',{p_guild_id:guild,p_limit:1000});
 await db.query("insert into public.knowledge_sources(kind,external_id,title,status) values('manual','keep-nondiscord','Preserve nonDiscord source','active')");
 await rpc(db,'miro_sync_register',{p_board_id:'board1'});const lease=await rpc(db,'miro_sync_claim',{p_board_id:'board1'});await rpc(db,'miro_sync_finish',{p_board_id:'board1',p_lease_token:lease.lease_token,p_config_revision:lease.config_revision,p_snapshot:boardData,p_content_hash:hash});
 return generation;
}
function transportFor(db){const calls=[],errors=[];const store=createDiscordStore({env:{SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'fixture'},fetchImpl:async(url,opts)=>{assert.equal(opts.redirect,'error');const name=url.split('/').at(-1);calls.push(name);try{return Response.json(await rpc(db,name,JSON.parse(opts.body)));}catch(e){errors.push({name,code:e.code});return Response.json({code:e.code},{status:400});}}});return {store,calls,errors};}

test('001–017 populated catalogue migration, independent SQL and current JS live/discovery behavior',async t=>{
 const db=new PGlite({extensions:{vector}});
 try{
  await db.exec('create role anon;create role authenticated;create role service_role bypassrls;');for(let n=1;n<=16;n++)await db.exec(await migration(n));const generation=await addPopulatedFixture(db);
  const oldTables=(await db.query("select relname from pg_class where relnamespace='public'::regnamespace and relkind='r' and relname like 'discord_%' order by relname")).rows.map(r=>r.relname);
  for(const name of oldTables)assert((await tableRows(db,name)).length>0,name+' populated');
  const sourceRows=(await db.query("select to_jsonb(t) data from public.knowledge_sources t where kind<>'discord' order by id")).rows,miroRows=await tableRows(db,'miro_boards');
  const oldPolicy=(await tableRows(db,'discord_view_policies'))[0].data,oldState=(await tableRows(db,'discord_discovery_state'))[0].data,oldNodes=(await tableRows(db,'discord_channel_metadata')).map(r=>r.data),oldChannels=(await tableRows(db,'discord_channels')).map(r=>r.data);
  assert.equal(oldNodes.length,269);assert.equal(oldChannels.length,219);const sql=await migration(17);assert(!/\b(?:drop|truncate)[^;]*\bcascade\b/i.test(sql));
  await t.test('unmapped Discord source aborts retirement atomically instead of losing identity',async()=>{
   const orphan=randomUUID();await db.query("insert into public.knowledge_sources(id,kind,external_id,title) values($1,'discord','999999999999999999','Orphan')",[orphan]);await assert.rejects(db.exec(sql),e=>e.code==='23514');await db.exec('rollback');assert.equal((await db.query("select count(*)::int n from pg_class where relnamespace='public'::regnamespace and relkind='r'")).rows[0].n,19);assert.deepEqual(await tableRows(db,'miro_boards'),miroRows);await db.query('delete from public.knowledge_sources where id=$1',[orphan]);
  });await db.exec(sql);await db.exec('set role service_role');
  await t.test('exactly3tables: 16 populated Discord tables gone, policy269nodes219stableIDs retained, Miro/nonDiscord sources exact',async()=>{
   assert.deepEqual((await db.query("select relname from pg_class where relnamespace='public'::regnamespace and relkind='r' order by relname")).rows.map(r=>r.relname),['discord_view_policies','knowledge_sources','miro_boards']);
   assert.equal((await db.query("select count(*)::int n from public.knowledge_sources where kind='discord'")).rows[0].n,0);assert.deepEqual((await db.query("select to_jsonb(t) data from public.knowledge_sources t where kind<>'discord' order by id")).rows,sourceRows);assert.deepEqual(await tableRows(db,'miro_boards'),miroRows);
   const p=(await tableRows(db,'discord_view_policies'))[0].data;for(const [key,value]of Object.entries(oldPolicy))assert.deepEqual(p[key],value,key);assert.equal(p.channels.length,269);assert.equal(p.channels.filter(n=>n.source_id).length,219);assert.deepEqual(p.discovery_state,oldState);
   for(const prior of oldNodes){const current=p.channels.find(n=>n.channel_id===prior.channel_id);assert(current);for(const key of ['guild_id','parent_id','channel_type','access_status','eligible','generation'])assert.deepEqual(current[key]??null,prior[key]??null,prior.channel_id+':'+key);}
   for(const prior of oldChannels){const current=p.channels.find(n=>n.channel_id===prior.channel_id);for(const key of ['source_id','guild_id','title','enabled','policy_revision','backfill_from'])assert.deepEqual(current[key],prior[key],prior.channel_id+':'+key);}
   const functions=(await db.query("select proname,prosrc from pg_proc where pronamespace='public'::regnamespace")).rows;for(const f of functions)for(const table of oldTables.filter(n=>n!=='discord_view_policies'))assert(!new RegExp('\\b'+table+'\\b').test(f.prosrc),f.proname+' -> '+table);
  });
  await t.test('RPC array wire and compact getPolicy/current store plus real live bot read enforce source scope with no stored path',async()=>{
   const {store,calls,errors}=transportFor(db),policy=await rpc(db,'discord_get_policy',{p_guild_id:guild});assert(!Object.hasOwn(policy,'channels'));assert(!Object.hasOwn(policy,'discovery_state'));assert(JSON.stringify(policy).length<1000);
   assert.equal((await rpc(db,'discord_sync_channels')).length,219);assert.equal((await store.listSyncChannels()).channels.length,219);assert.equal((await store.getPolicy({guildId:guild})).status,'ready');
   let reads=0;const client={configured:true,getCurrentApplication:async()=>({flags:1<<18}),getGuildChannels:async()=>[{id:channel,guild_id:guild,type:0,parent_id:null,name:'Fixture'}],getChannel:async()=>({id:channel,guild_id:guild,type:0,parent_id:null,name:'Fixture'}),getMessages:async()=>{reads++;return reads===1?[{id:discordSnowflakeAt('2026-10-01T06:00:00Z'),channel_id:channel,guild_id:guild,timestamp:'2026-10-01T06:00:00Z',author:{id:'345678901234567890',username:'Fixture'},content:'LIVE_SENTINEL'}]:[];}};
   const service=createLiveDiscordRetrieval({config:{configured:true,guildId:guild},store,client}),principal={allowedSourceIds:[source],liveDiscord:{mode:'local-operator',guildId:guild}};
   const result=await service.readWindow({principal,channelId:channel,from:'2026-10-01T00:00:00Z',to:'2026-10-02T00:00:00Z'});assert.equal(result.status,'ready');assert.equal(result.sources[0].excerpt,'LIVE_SENTINEL');assert.equal(result.sources[0].sourceId,source);assert(calls.every(n=>['discord_get_policy','discord_sync_channels'].includes(n)));assert.equal(errors.length,0);assert(!JSON.stringify(await tableRows(db,'discord_view_policies')).includes('LIVE_SENTINEL'));
   const denied=await service.readWindow({principal:{...principal,allowedSourceIds:[randomUUID()]},channelId:channel,from:'2026-10-01T00:00:00Z',to:'2026-10-02T00:00:00Z'});assert.equal(denied.status,'channel_scope_denied');
  });
  await t.test('channel disable or reconfiguration during live read invalidates and discards previous evidence',async()=>{
   for(const enabled of [false,true])await tx(db,async()=>{
    const {store}=transportFor(db);let pages=0;
    const metadata={id:channel,guild_id:guild,type:0,parent_id:null,name:'Fixture'};
    const client={configured:true,getCurrentApplication:async()=>({flags:1<<18}),getGuildChannels:async()=>[metadata],getChannel:async()=>metadata,getMessages:async()=>{
     if(pages++)return [];const changed=await store.configureChannel({principal:{isAdmin:true},channel:{sourceId:source,channelId:channel,guildId:guild,title:'Changed during retrieval',enabled,backfillFrom:'2020-01-01T00:00:00Z'}});assert.equal(changed.status,'ready');return [{id:discordSnowflakeAt('2026-10-01T06:00:00Z'),channel_id:channel,guild_id:guild,timestamp:'2026-10-01T06:00:00Z',author:{id:'345678901234567890'},content:'MUST_DISCARD'}];
    }};
    const service=createLiveDiscordRetrieval({config:{configured:true,guildId:guild},store,client});const result=await service.readWindow({principal:{allowedSourceIds:[source],liveDiscord:{mode:'local-operator',guildId:guild}},channelId:channel,from:'2026-10-01T00:00:00Z',to:'2026-10-02T00:00:00Z'});assert.equal(result.status,'policy_changed');assert.deepEqual(result.sources,[]);assert(!JSON.stringify(result).includes('MUST_DISCARD'));
   });
  });
  await t.test('same-revision discovery withdrawal during live read discards previous evidence',()=>tx(db,async()=>{
   const {store}=transportFor(db);let pages=0;const metadata={id:channel,guild_id:guild,type:0,parent_id:null,name:'Fixture'};
   const client={configured:true,getCurrentApplication:async()=>({flags:1<<18}),getGuildChannels:async()=>[metadata],getChannel:async()=>metadata,getMessages:async()=>{
    if(pages++)return [];const prior=await rpc(db,'discord_get_discovery_state',{p_guild_id:guild}),next={generation:randomUUID(),policyRevision:1,phase:'channels',parents:[],tasks:[]};assert.equal(await rpc(db,'discord_persist_discovery',{p_guild_id:guild,p_expected_policy_revision:1,p_expected_generation:generation,p_expected_state:prior,p_channels:[],p_state:next}),true);return [{id:discordSnowflakeAt('2026-10-01T06:00:00Z'),channel_id:channel,guild_id:guild,timestamp:'2026-10-01T06:00:00Z',author:{id:'345678901234567890'},content:'STALE_EVIDENCE'}];
   }};
   const service=createLiveDiscordRetrieval({config:{configured:true,guildId:guild},store,client});const result=await service.readWindow({principal:{allowedSourceIds:[source],liveDiscord:{mode:'local-operator',guildId:guild}},channelId:channel,from:'2026-10-01T00:00:00Z',to:'2026-10-02T00:00:00Z'});assert.equal(result.status,'policy_changed');assert.deepEqual(result.sources,[]);
  }));
  await t.test('policy, hierarchy and revision reject paused/excluded/stale/unknown/cyclic catalogue entries',async()=>{
   for(const statement of ["update public.discord_view_policies set paused=true","update public.discord_view_policies set excluded_channel_ids=array['"+channel+"']","update public.discord_view_policies set revision=revision+1"]){await tx(db,async()=>{await db.exec(statement);assert.equal((await rpc(db,'discord_sync_channels')).length,statement.includes('excluded_channel_ids')?218:0);assert.equal(await rpc(db,'discord_channel_allowed',{p_guild_id:guild,p_channel_id:channel}),false);});}
   await tx(db,async()=>{await db.query("update public.discord_view_policies set excluded_category_ids=array['9002'] where guild_id=$1",[guild]);const ids=(await rpc(db,'discord_sync_channels')).map(r=>r.channel_id);assert(!ids.includes((BigInt(channel)+1n).toString()));assert(ids.includes(channel));});
   await tx(db,async()=>{await db.query("update public.discord_view_policies set channels=(select jsonb_agg(case when n->>'channel_id'=$2 then n||jsonb_build_object('parent_id',$2) else n end) from jsonb_array_elements(channels)n) where guild_id=$1",[guild,channel]);assert.equal(await rpc(db,'discord_channel_allowed',{p_guild_id:guild,p_channel_id:channel}),false);});
  });
  await t.test('discovery CAS partial/resume/completion never activates partial and disables removed nodes while preserving stable IDs/names',()=>tx(db,async()=>{
   const old=await rpc(db,'discord_get_discovery_state',{p_guild_id:guild}),gen=randomUUID(),next={generation:gen,policyRevision:1,phase:'channels',parents:[],tasks:[],cursor:'resume-sentinel'};
   const args={p_guild_id:guild,p_expected_policy_revision:1,p_expected_generation:generation,p_expected_state:old,p_channels:[{guildId:guild,channelId:channel,parentId:null,type:0,eligible:true,accessStatus:'ready',title:'New name'}],p_state:next};
   assert.equal(await rpc(db,'discord_persist_discovery',args),true);assert.deepEqual(await rpc(db,'discord_get_discovery_state',{p_guild_id:guild}),next);assert.equal((await rpc(db,'discord_sync_channels')).length,0);
   assert.equal(await rpc(db,'discord_persist_discovery',args),false);const p=(await tableRows(db,'discord_view_policies'))[0].data;assert.equal(p.channels.find(n=>n.channel_id===channel).source_id,source);
   const done={...next,phase:'complete'};assert.equal(await rpc(db,'discord_complete_discovery',{p_guild_id:guild,p_generation:gen,p_expected_policy_revision:1,p_expected_state:old,p_state:done}),false);assert.equal(await rpc(db,'discord_complete_discovery',{p_guild_id:guild,p_generation:gen,p_expected_policy_revision:1,p_expected_state:next,p_state:done}),true);
   const catalogue=await rpc(db,'discord_sync_channels');assert.equal(catalogue.length,1);assert.equal(catalogue[0].source_id,source);assert.equal(catalogue[0].title,'New name');const saved=(await tableRows(db,'discord_view_policies'))[0].data;assert.equal(saved.channels.filter(n=>n.source_id&&n.enabled).length,1);
   await rejectSql(db,()=>rpc(db,'discord_configure_channel',{p_member_id:null,p_channel:{source_id:source,channel_id:channel,guild_id:otherGuild,title:'Hijack',enabled:true,backfill_from:'2020-01-01T00:00:00Z'}}),'23514');
   await rejectSql(db,()=>rpc(db,'discord_persist_discovery',{...args,p_expected_generation:gen,p_expected_state:done,p_channels:[{guildId:otherGuild,channelId:channel,parentId:null,type:0,eligible:true,accessStatus:'ready',title:'Foreign'}]}),'23514');
  }));
  await t.test('current JS metadata discovery resumes limited run and fully publishes catalogue without raw/model hooks',()=>tx(db,async()=>{
   const {store,errors}=transportFor(db),metadata={id:channel,guild_id:guild,type:0,parent_id:null,name:'Current name',content:'DISCORD_RAW_MUST_NOT_STORE',payload:{content:'DISCORD_RAW_MUST_NOT_STORE'}},noRaw=()=>assert.fail('raw/provider hook called');let metadataCalls=0;
   const client={configured:true,getGuildChannels:async()=>{metadataCalls++;return [metadata];},getChannel:async()=>({...metadata,botPermissions:'66560'}),getActiveThreads:async()=>({threads:[]}),getArchivedThreads:async()=>({threads:[],hasMore:false}),getMessages:noRaw,getMessage:noRaw};
   const config={configured:true,guildId:guild};const first=await runDiscordDiscovery({config,store,client,limits:{maxPages:1}});assert.equal(first.status,'partial');assert.equal((await store.listSyncChannels()).channels.length,0);const checkpoint=(await store.getDiscoveryState({guildId:guild})).state;assert.notEqual(checkpoint.phase,'complete');
   const second=await runDiscordDiscovery({config,store,client});assert.equal(second.status,'ready',JSON.stringify({second,errors}));assert.equal(second.complete,true);assert.equal(metadataCalls,1);const rows=(await store.listSyncChannels()).channels;assert.equal(rows.length,1);assert.equal(rows[0].sourceId,source);assert.equal(rows[0].title,'Current name');assert(!JSON.stringify(await tableRows(db,'discord_view_policies')).includes('DISCORD_RAW_MUST_NOT_STORE'));assert.equal(errors.length,0);
  }));
  await t.test('all3tables force RLS and all active RPCs remain invoker/service only',async()=>{
   const tables=(await db.query("select relname,relrowsecurity,relforcerowsecurity,has_table_privilege('anon',oid,'SELECT,INSERT,UPDATE,DELETE') anon,has_table_privilege('authenticated',oid,'SELECT,INSERT,UPDATE,DELETE') authenticated from pg_class where relnamespace='public'::regnamespace and relkind='r'")).rows;assert.equal(tables.length,3);for(const row of tables)assert(row.relrowsecurity&&row.relforcerowsecurity&&!row.anon&&!row.authenticated,row.relname);
   for(const f of (await db.query("select proname,prosecdef,has_function_privilege('anon',oid,'EXECUTE') anon,has_function_privilege('authenticated',oid,'EXECUTE') authenticated,has_function_privilege('service_role',oid,'EXECUTE') service from pg_proc where pronamespace='public'::regnamespace")).rows)assert(!f.prosecdef&&!f.anon&&!f.authenticated&&f.service,f.proname);
   for(const role of ['anon','authenticated']){await db.exec('set role '+role);await assert.rejects(rpc(db,'discord_get_policy',{p_guild_id:guild}),e=>e.code==='42501');await assert.rejects(db.query('select * from public.discord_view_policies'),e=>e.code==='42501');}await db.exec('set role service_role');
  });
 }finally{await db.close();}
});
