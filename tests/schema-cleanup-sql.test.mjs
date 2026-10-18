import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {vector} from '@electric-sql/pglite-pgvector';
import {createMiroStore} from './fixtures/retired-miro-rest/store.js';
import {runMiroSync} from './fixtures/retired-miro-rest/sync.js';
import {readMiroConfig} from './fixtures/retired-miro-rest/config.js';
import {createMiroTools} from './fixtures/retired-miro-rest/tools.js';
import {SUMMARY_FIELDS} from '../server/discord/summary-provider.js';
const guild='1203562091500404776',otherGuild='123456789012345678',channel='1203562091982622814',source='22222222-2222-4222-8222-222222222222',otherSource='44444444-4444-4444-8444-444444444444';
const legacyJob=randomUUID(),legacyResult=randomUUID(),legacyCertificate=randomUUID(),legacyOperation=randomUUID(),legacyReceipt=randomUUID(),messageId='1500000000000000001';
const hash='a'.repeat(64),summary=Object.fromEntries(SUMMARY_FIELDS.map(k=>[k,k==='overview'?[{text:'Preserved fixture fact',messageIds:[messageId]}]:[]]));
const citations=[{messageId,url:`https://discord.com/channels/${guild}/${channel}/${messageId}`}];
const retired=['discord_messages','discord_message_revisions','discord_sync_state','discord_memory_buckets','discord_memory_members','discord_summary_inputs','discord_summary_parts','discord_summary_part_coverage','discord_summary_part_children','knowledge_documents','knowledge_document_members','knowledge_chunks','knowledge_daily_summaries','knowledge_sync_state'];
const retained=['discord_admin_members','discord_channels','discord_guild_policies','discord_channel_metadata','discord_discovery_state','discord_live_summary_state','discord_live_summary_jobs','discord_live_summary_results','discord_live_summary_runs','discord_live_summary_requests','discord_summary_vectors','discord_summary_jobs','discord_summary_results','discord_summary_certificates','discord_summary_requests','discord_summary_operations','discord_summary_operation_jobs','discord_compaction_ledger','knowledge_sources','knowledge_source_members'];
function rpc(db,name,args={}){const keys=Object.keys(args);return db.query('select public.'+name+'('+keys.map((k,i)=>k+' => $'+(i+1)).join(',')+') value',keys.map(k=>args[k]&&typeof args[k]==='object'&&!Array.isArray(args[k])?JSON.stringify(args[k]):args[k])).then(r=>r.rows[0].value);}
const live=(db,name,args={})=>rpc(db,'discord_live_summary_'+name,args);
const migration=async n=>readFile(new URL('../supabase/migrations/'+(await readdir(new URL('../supabase/migrations/',import.meta.url))).find(f=>f.includes('00'+String(n).padStart(2,'0')+'_')),import.meta.url),'utf8');
async function apply(db,from,to){for(let n=from;n<=to;n++)await db.exec(await migration(n));}
async function tx(db,fn){await db.exec('begin');try{await fn();}finally{await db.exec('rollback');}}
async function rejectSql(db,fn,code){await db.exec('savepoint expected_error');await assert.rejects(fn,e=>e.code===code);await db.exec('rollback to savepoint expected_error');}
async function fingerprints(db,tables){const out={};for(const table of tables)out[table]=(await db.query(`select count(*)::int n,encode(sha256(convert_to(coalesce(string_agg(to_jsonb(t)::text,'' order by to_jsonb(t)::text),''),'UTF8')),'hex') hash from public.${table} t`)).rows[0];return out;}
async function seed(db){
 for(const [sid,gid,cid] of [[source,guild,channel],[otherSource,otherGuild,'123456789012345679']]){
  await db.query('insert into public.discord_guild_policies(guild_id,revision,paused,discovery_enabled) values($1,1,false,true)',[gid]);
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
async function expandFixture(db){
 await db.exec("insert into public.discord_admin_members(member_id) values('local-development')");
 await db.exec(`create temporary table fixture_ids as select n,gen_random_uuid() job,gen_random_uuid() certificate,gen_random_uuid() result from generate_series(1,721) n;
 insert into public.discord_summary_jobs select (jsonb_populate_record(null::public.discord_summary_jobs,to_jsonb(j)||jsonb_build_object('id',f.job,'period_key','fixture-'||f.n,'period_start',j.period_start-f.n*interval '7 days','period_end',j.period_end-f.n*interval '7 days'))).* from public.discord_summary_jobs j cross join fixture_ids f;
 insert into public.discord_summary_certificates select (jsonb_populate_record(null::public.discord_summary_certificates,to_jsonb(c)||jsonb_build_object('id',f.certificate,'job_id',f.job,'period_key','fixture-'||f.n,'range_start',c.range_start-f.n*interval '7 days','range_end',c.range_end-f.n*interval '7 days'))).* from public.discord_summary_certificates c cross join fixture_ids f;
 insert into public.discord_summary_results select (jsonb_populate_record(null::public.discord_summary_results,to_jsonb(r)||jsonb_build_object('id',f.result,'job_id',f.job,'certificate_id',f.certificate))).* from public.discord_summary_results r cross join fixture_ids f;
 insert into public.discord_compaction_ledger select (jsonb_populate_record(null::public.discord_compaction_ledger,to_jsonb(l)||jsonb_build_object('id',gen_random_uuid(),'certificate_id',f.certificate,'period_key','fixture-'||f.n,'range_start',l.range_start-f.n*interval '7 days','range_end',l.range_end-f.n*interval '7 days'))).* from public.discord_compaction_ledger l cross join fixture_ids f;
 insert into public.discord_summary_requests select (jsonb_populate_record(null::public.discord_summary_requests,to_jsonb(r)||jsonb_build_object('id',gen_random_uuid(),'input_tokens',n,'output_tokens',n+1,'status',case when n%3=0 then 'unknown' else 'succeeded' end))).* from public.discord_summary_requests r cross join generate_series(1,2244) n;
 insert into public.discord_summary_operation_jobs(operation_id,job_id,guild_id,ordinal) select operation_id,id,guild_id,row_number()over(order by id)-1 from public.discord_summary_jobs;`);
 await db.query("insert into public.discord_live_summary_jobs(source_id,guild_id,channel_id,channel_name,tier,period_key,period_start,period_end,provider,model,prompt_version,policy_revision) values($1,$2,$3,'Future pending','weekly','future-fixture',now()+interval '10 days',now()+interval '17 days','fixture','fixture','fixture',1)",[source,guild,channel]);
}
const boardData={schemaVersion:1,board:{id:'board1',name:'Full Calendar',team:{id:'team1'},customMetadata:{retained:true}},items:[{id:'sticky1',type:'sticky_note',data:{content:'Exact <b>source</b> & context'},position:{x:10,y:-5},unknown:{field:[1,2,3]}}],connectors:[{id:'edge1',startItem:{id:'sticky1'},endItem:{id:'frame1'}}],groups:[{id:'group1'}],tags:[{id:'tag1',title:'Legend'}],itemTags:{sticky1:[{id:'tag1'}]},groupItems:{group1:[{id:'sticky1'}]},coverage:{complete:true},captureStartedAt:'2026-01-01T00:00:00Z',captureFinishedAt:'2026-01-01T00:01:00Z'};
const boardFinish=(db,c,data=boardData)=>rpc(db,'miro_sync_finish',{p_board_id:'board1',p_lease_token:c.lease_token,p_config_revision:c.config_revision,p_snapshot:data,p_content_hash:hash});

test('001–014 actual SQL: exact cleanup preserves retained data and executes active paths',async t=>{
 const db=new PGlite({extensions:{vector}});
 try{
  await db.exec('create role anon;create role authenticated;create role service_role bypassrls;');
  await apply(db,1,12);await seed(db);await expandFixture(db);await db.exec('set role service_role');
  const board=await rpc(db,'miro_sync_register',{p_board_id:'board1',p_team_id:'team1'});
  await db.query("insert into public.knowledge_source_members(source_id,member_id,can_read) values($1,'local-development',true)",[board.source_id]);
  await boardFinish(db,await rpc(db,'miro_sync_claim',{p_board_id:'board1'}));
  // Include a pre-upgrade in-flight board lease, like a deployed old worker.
  const boardLease=await rpc(db,'miro_sync_claim',{p_board_id:'board1'});
  await live(db,'queue_embeddings',{p_guild_id:guild,p_limit:1000});
  const vectorClaim=await live(db,'claim_embedding',{p_guild_id:guild});
  assert.equal(await live(db,'save_embedding',{p_id:vectorClaim.id,p_lease_token:vectorClaim.lease_token,p_content_hash:vectorClaim.content_hash,p_vector:JSON.stringify(Array.from({length:1536},(_,i)=>i===0?1:0))}),true);
  const before=await fingerprints(db,retained);
  assert.equal(before.discord_summary_results.n,722);assert.equal(before.discord_summary_requests.n,2245);assert.equal(before.discord_summary_vectors.n,722);
  const envelopes=(await db.query("select id, public.discord_live_summary_envelope('legacy',id) data from public.discord_summary_results order by id")).rows;
  const sql13=await migration(13),sql14=await migration(14);
  await t.test('explicit no-CASCADE DDL; nonempty candidate aborts and preserves entire schema/data',async()=>{
   for(const sql of [sql13,sql14])assert(!/\b(?:drop|truncate)[^;]*\bcascade\b/i.test(sql));
   for(const table of ['discord_sync_state','knowledge_sync_state']){
    await db.query(`insert into public.${table}(source_id) values($1)`,[source]);
    await assert.rejects(db.exec(sql13),e=>e.code==='23514'&&e.message.includes(table));await db.exec('rollback');
    assert.equal((await db.query("select count(*)::int n from pg_class where relnamespace='public'::regnamespace and relkind='r' and (relname like 'discord_%' or relname like 'knowledge_%')")).rows[0].n,34);
    assert.equal((await db.query(`select count(*)::int n from public.${table}`)).rows[0].n,1);
    await db.query(`delete from public.${table} where source_id=$1`,[source]);assert.deepEqual(await fingerprints(db,retained),before);
   }
  });
  await t.test('active legacy dispatch blocks migration before deletion',async()=>{
   await db.query("update public.discord_summary_jobs set status='running',lease_token=gen_random_uuid(),lease_expires_at=now()+interval '5 minutes' where id=$1",[legacyJob]);
   await assert.rejects(db.exec(sql13),e=>e.code==='40001');await db.exec('rollback');
   assert.equal((await db.query("select to_regclass('public.discord_messages') is not null ok")).rows[0].ok,true);
   await db.query("update public.discord_summary_jobs set status='succeeded',lease_token=null,lease_expires_at=null where id=$1",[legacyJob]);
  });
  // Fixture mutation above intentionally changes job audit timestamps, so record
  // the exact final pre-upgrade image rather than assert the previous image.
  const finalBefore=await fingerprints(db,retained);
  const boardBefore=(await db.query("select source_id,team_id,enabled,config_revision,snapshot_config_revision,last_success_at,status,error_code,lease_token,lease_expires_at,snapshot from public.miro_boards")).rows[0];
  await db.exec('reset role');await db.exec(sql13);await db.exec(sql14);await db.exec('set role service_role');
  await t.test('exact14 absent, exact20 retained, all retained rows and canonical envelopes byte-equivalent',async()=>{
   const names=(await db.query("select relname from pg_class where relnamespace='public'::regnamespace and relkind='r' and (relname like 'discord_%' or relname like 'knowledge_%') order by relname")).rows.map(r=>r.relname);
   assert.deepEqual(names,[...retained].sort());for(const name of retired)assert(!names.includes(name));
   assert.deepEqual(await fingerprints(db,retained),finalBefore);
   assert.deepEqual((await db.query("select id, public.discord_live_summary_envelope('legacy',id) data from public.discord_summary_results order by id")).rows,envelopes);
   const columns=(await db.query("select column_name from information_schema.columns where table_schema='public' and table_name='miro_boards' order by column_name")).rows.map(r=>r.column_name);
   assert.deepEqual(columns,['board_id','source_id','data','team_id','enabled','config_revision','snapshot_config_revision','last_success_at','status','error_code','lease_token','lease_expires_at'].sort());
   const {data,...after}=(await db.query('select * from public.miro_boards')).rows[0];assert.deepEqual(data,boardData);const {snapshot,...prior}=boardBefore;assert.deepEqual(after,{board_id:'board1',...prior});
  });
  await t.test('no retained SQL function body references any dropped relation',async()=>{
   const funcs=(await db.query("select proname,prosrc from pg_proc where pronamespace='public'::regnamespace")).rows;
   for(const f of funcs)for(const table of retired)assert(!new RegExp('\\b'+table+'\\b').test(f.prosrc),f.proname+' references '+table);
  });
  await t.test('all21 retained tables forcedRLS/service-only; public functions invoker with no browser grants',async()=>{
   const tables=(await db.query("select relname,relrowsecurity,relforcerowsecurity,has_table_privilege('anon',oid,'SELECT,INSERT,UPDATE,DELETE') anon,has_table_privilege('authenticated',oid,'SELECT,INSERT,UPDATE,DELETE') authenticated from pg_class where relnamespace='public'::regnamespace and relkind='r'")).rows;
   assert.equal(tables.length,21);for(const row of tables)assert(row.relrowsecurity&&row.relforcerowsecurity&&!row.anon&&!row.authenticated,row.relname);
   const funcs=(await db.query("select proname,prosecdef,has_function_privilege('anon',oid,'EXECUTE') anon,has_function_privilege('authenticated',oid,'EXECUTE') authenticated,has_function_privilege('service_role',oid,'EXECUTE') service from pg_proc where pronamespace='public'::regnamespace")).rows;
   for(const f of funcs)assert(!f.prosecdef&&!f.anon&&!f.authenticated&&f.service,f.proname);
   for(const role of ['anon','authenticated']){await db.exec('set role '+role);await assert.rejects(db.query('select * from public.knowledge_sources'),e=>e.code==='42501');await assert.rejects(live(db,'status',{p_guild_id:guild}),e=>e.code==='42501');}await db.exec('set role service_role');
  });
  await t.test('Miro in-flight old worker publication, grants, source revisions, lease races, partial failure and deletion reconciliation',async()=>{
   assert.equal(await boardFinish(db,boardLease),true);
   const auth={p_member_id:'local-development',p_allowed_source_ids:[board.source_id],p_board_id:'board1'};
   assert.deepEqual((await rpc(db,'miro_get_authorized_board',auth)).data,boardData);
   assert.equal(await rpc(db,'miro_get_authorized_board',{...auth,p_allowed_source_ids:[source]}),null);
   assert.equal(await rpc(db,'miro_get_authorized_board',{...auth,p_member_id:randomUUID()}),null);
   await tx(db,async()=>{
    const claim=await rpc(db,'miro_sync_claim',{p_board_id:'board1'});assert(!('data' in claim));assert.equal(await rpc(db,'miro_sync_claim',{p_board_id:'board1'}),null);
    assert.equal(await boardFinish(db,{...claim,lease_token:randomUUID()}),false);
    await rejectSql(db,()=>boardFinish(db,claim,{...boardData,coverage:{complete:false}}),'22023');
    assert.equal(await rpc(db,'miro_sync_renew',{p_board_id:'board1',p_lease_token:claim.lease_token,p_config_revision:claim.config_revision}),true);
    assert.equal(await rpc(db,'miro_sync_fail',{p_board_id:'board1',p_lease_token:claim.lease_token,p_config_revision:claim.config_revision,p_error_code:'network_error'}),true);
    assert.deepEqual((await rpc(db,'miro_get_authorized_board',auth)).data,boardData);
    const next=await rpc(db,'miro_sync_claim',{p_board_id:'board1'});await db.query("update public.knowledge_sources set status='disabled' where id=$1",[board.source_id]);await db.query("update public.knowledge_sources set status='active' where id=$1",[board.source_id]);assert.equal(await boardFinish(db,next),false);assert.equal(await rpc(db,'miro_get_authorized_board',auth),null);
   });
   await tx(db,async()=>{const claim=await rpc(db,'miro_sync_claim',{p_board_id:'board1'});await db.exec("update public.miro_boards set enabled=false;update public.miro_boards set enabled=true");assert.equal(await boardFinish(db,claim),false);assert.equal(await rpc(db,'miro_get_authorized_board',auth),null);});
   await tx(db,async()=>{const a=await rpc(db,'miro_sync_claim',{p_board_id:'board1'});await db.exec("update public.miro_boards set lease_expires_at=clock_timestamp()-interval '1 second'");const b=await rpc(db,'miro_sync_claim',{p_board_id:'board1'});assert.notEqual(a.lease_token,b.lease_token);assert.equal(await boardFinish(db,a),false);assert.equal(await boardFinish(db,b,{...boardData,items:[]}),true);assert.deepEqual((await rpc(db,'miro_get_authorized_board',auth)).data.items,[]);});
  });
  await t.test('real Miro JS store/sync and assistant catalogue execute against simplified data schema',()=>tx(db,async()=>{
   const rpcCalls=[],errors=[];
   const store=createMiroStore({env:{SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'fixture'},fetchImpl:async(url,options)=>{
    assert.equal(options.redirect,'error');const method=url.split('/').at(-1);rpcCalls.push(method);
    try{return Response.json(await rpc(db,method,JSON.parse(options.body)));}catch(error){errors.push({method,code:error.code});return Response.json({code:error.code},{status:400});}
   }});
   const config=readMiroConfig({MIRO_SYNC_ENABLED:'true',MIRO_ACCESS_TOKEN:'fixture',MIRO_BOARD_IDS:'board1',MIRO_TEAM_ID:'team1'});
   const client={readBoard:async()=>boardData.board,listItems:async()=>({data:boardData.items}),readItem:async()=>boardData.items[0],listConnectors:async()=>({data:[]}),listGroups:async()=>({data:[]}),listTags:async()=>({data:[],offset:0,total:0}),readItemTags:async()=>({tags:[]})};
   const result=await runMiroSync({config,store,createClient:()=>client,log:()=>{}});assert.equal(result.succeeded,1,JSON.stringify({result,errors}));
   const principal={id:'local-development',allowedSourceIds:[board.source_id]};
   const read=await store.getAuthorizedBoard({boardId:'board1',principal});assert.equal(read.status,'ready');assert.deepEqual(read.data.data.items,boardData.items);assert(!Object.hasOwn(read.data,'snapshot'));
   const tools=createMiroTools({config,store,clientFactory:()=>client});const catalogue=await tools.execute({name:'list_miro_boards',arguments:{},principal});assert.equal(catalogue.status,'ready');assert.equal(catalogue.boardContext.boards[0].title,'Full Calendar');
   const liveRead=await tools.execute({name:'read_miro_board',arguments:{boardId:'board1'},principal});assert.equal(liveRead.status,'ready');assert(JSON.stringify(liveRead.boardContext).includes('Exact <b>source</b> & context'));
   assert(rpcCalls.includes('miro_sync_finish'));assert.equal(errors.length,0);
  }));
  await t.test('status, cutover, pending future job, retained legacy write guard and active summary publication/embedding/search execute',async()=>{
   assert.equal((await live(db,'status',{p_guild_id:guild})).legacySummaries,722);
   assert.equal((await live(db,'cutover',{p_guild_id:guild,p_expected_policy_revision:1,p_delete_raw:true})).remainingRawMessages,0);
   assert.equal((await db.query("select count(*)::int n from public.discord_live_summary_jobs where period_key='future-fixture' and status='pending'")).rows[0].n,1);
   await tx(db,async()=>{await rejectSql(db,()=>db.query("update public.discord_summary_jobs set status='running' where id=$1",[legacyJob]),'23514');await rejectSql(db,()=>db.query('update public.discord_summary_results set summary=summary where id=$1',[legacyResult]),'23514');});
   const planArgs={p_guild_id:guild,p_as_of:new Date().toISOString(),p_mode:'scheduled',p_provider:'openai-compatible',p_model:'gpt-6-luna',p_prompt_version:'test-v1'};
   assert((await live(db,'plan',planArgs)).planned>=2);assert.equal((await live(db,'plan',planArgs)).planned,0);
   const job=await live(db,'claim',{p_guild_id:guild,p_provider:'openai-compatible',p_model:'gpt-6-luna',p_prompt_version:'test-v1'});assert(job);
   const run=await live(db,'begin_run',{p_guild_id:guild,p_max_cost_usd:0.1,p_max_requests:2}),reservation=randomUUID();
   const reserve={p_run_id:run.id,p_reservation_id:reservation,p_job_id:job.id,p_lease_token:job.lease_token,p_vector_id:null,p_vector_lease:null,p_input_tokens:10,p_output_tokens:10,p_max_cost_usd:0.01};
   assert.equal((await live(db,'reserve',reserve)).dispatchAllowed,true);assert.equal((await live(db,'reserve',reserve)).dispatchAllowed,false);
   assert.equal(await live(db,'commit_usage',{p_reservation_id:reservation,p_status:'succeeded',p_usage:{inputTokens:8,outputTokens:9,costUsd:0.001}}),true);
   assert.equal(await live(db,'commit_usage',{p_reservation_id:reservation,p_status:'succeeded',p_usage:{inputTokens:8,outputTokens:9,costUsd:0.001}}),true);
   const finished=await live(db,'finish',{p_job_id:job.id,p_lease_token:job.lease_token,p_summary:summary,p_citations:citations,p_coverage:{complete:true,inputHash:hash,pages:1,inputBytes:30,messageCount:1}});assert(finished.summaryId);
   assert.equal(await live(db,'queue_embeddings',{p_guild_id:guild,p_limit:1000}),0);const item=await live(db,'claim_embedding',{p_guild_id:guild});assert(item);
   const vector=JSON.stringify(Array.from({length:1536},(_,i)=>i===0?1:0));
   assert.equal(await live(db,'save_embedding',{p_id:item.id,p_lease_token:randomUUID(),p_content_hash:item.content_hash,p_vector:vector}),false);assert.equal(await live(db,'save_embedding',{p_id:item.id,p_lease_token:item.lease_token,p_content_hash:'b'.repeat(64),p_vector:vector}),false);assert.equal(await live(db,'save_embedding',{p_id:item.id,p_lease_token:item.lease_token,p_content_hash:item.content_hash,p_vector:vector}),true);
   const search={p_member_id:'local-development',p_allowed_source_ids:[source],p_query:'fixture',p_limit:5,p_vector:null};assert.equal((await live(db,'search',search)).length,5);assert.equal((await live(db,'search',{...search,p_member_id:randomUUID()})).length,0);assert.equal((await live(db,'search',{...search,p_allowed_source_ids:[otherSource]})).length,0);
   assert.equal((await live(db,'status',{p_guild_id:guild})).rawMessages,0);
  });
  await t.test('admin channel/policy/discovery paths execute, preserve source ACL, and stale policy/exclusions fail closed',()=>tx(db,async()=>{
   const grants=await fingerprints(db,['knowledge_source_members']);
   await rejectSql(db,()=>rpc(db,'discord_configure_channel',{p_member_id:randomUUID(),p_channel:{}}),'42501');
   const c=await rpc(db,'discord_configure_channel',{p_member_id:'local-development',p_channel:{source_id:source,channel_id:channel,guild_id:guild,title:'Renamed',enabled:true,backfill_from:'2020-01-01T00:00:00Z'}});assert.equal(c.title,'Renamed');
   assert((await rpc(db,'discord_list_channels',{p_member_id:'local-development'})).length>=2);
   const policy={paused:false,discovery_enabled:true,excluded_category_ids:[],excluded_channel_ids:[],backfill_from:'2020-01-01T00:00:00Z'};
   await rejectSql(db,()=>rpc(db,'discord_configure_policy',{p_member_id:'local-development',p_guild_id:guild,p_policy:policy,p_expected_revision:2}),'40001');
   const p=await rpc(db,'discord_configure_policy',{p_member_id:'local-development',p_guild_id:guild,p_policy:policy,p_expected_revision:1});assert.equal(p.revision,2);assert.equal(await rpc(db,'discord_channel_allowed',{p_guild_id:guild,p_channel_id:channel}),false);
   const generation=randomUUID(),state={generation,policyRevision:2,phase:'channels'};
   assert.equal(await rpc(db,'discord_persist_discovery',{p_guild_id:guild,p_expected_policy_revision:2,p_expected_generation:null,p_expected_state:null,p_channels:[{channelId:channel,guildId:guild,parentId:null,type:0,eligible:true,accessStatus:'ready',title:'Renamed'}],p_state:state}),true);
   assert.equal(await rpc(db,'discord_complete_discovery',{p_guild_id:guild,p_generation:generation,p_expected_policy_revision:2,p_expected_state:state,p_state:{...state,phase:'complete'}}),true);
   assert.equal(await rpc(db,'discord_channel_allowed',{p_guild_id:guild,p_channel_id:channel}),true);
   const p3=await rpc(db,'discord_configure_policy',{p_member_id:'local-development',p_guild_id:guild,p_policy:{...policy,excluded_channel_ids:[channel]},p_expected_revision:2});assert.equal(p3.revision,3);assert.equal(await rpc(db,'discord_channel_allowed',{p_guild_id:guild,p_channel_id:channel}),false);assert.deepEqual(await fingerprints(db,['knowledge_source_members']),grants);
  }));
 }finally{await db.close();}
});
