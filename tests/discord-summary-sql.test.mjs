import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {vector} from '@electric-sql/pglite-pgvector';
import {createDiscordSummaryStore} from './fixtures/legacy-summary-store.mjs';
import {readDiscordSummaryConfig} from './fixtures/legacy-summary-config.mjs';
import {SUMMARY_FIELDS} from '../server/discord/summary-provider.js';
import {runDiscordSummaries} from './fixtures/legacy-summaries.mjs';
import {normalizeMessage} from './fixtures/legacy-message.mjs';

// Supersedes the prior daily/forever-original SQL fixture. Baseline191 evidence
// remains under its original report/log names. Only verified retention is tested.
const files=['202610120001_knowledge.sql','202610120002_discord_archive.sql','202610120003_discord_discovery_memory.sql','202610120004_discord_memory_rebuild_performance.sql','202610120005_discord_memory_runtime_budget.sql','202610120006_discord_memory_summaries.sql','202610120007_discord_summary_planning_performance.sql','202610120008_discord_summary_planning_budget.sql','202610120009_discord_summary_sliced_planning.sql'];
const guild='1203562091500404776',otherGuild='123456789012345678',channel='1203562091982622814',secondChannel='1203562091982622815';
const sources=['22222222-2222-4222-8222-222222222222','44444444-4444-4444-8444-444444444444','55555555-5555-4555-8555-555555555555'];
const admin='11111111-1111-4111-8111-111111111111',reader='33333333-3333-4333-8333-333333333333',generation='66666666-6666-4666-8666-666666666666';
const firstAsOf='2025-10-12T12:00:00Z',nextAsOf='2025-10-20T12:00:00Z',closeAsOf='2025-11-01T12:00:00Z',tailAsOf='2025-11-03T13:00:00Z';
const cfg=readDiscordSummaryConfig({LLM_PROVIDER:'openai-compatible',LLM_MODEL:'gpt-6-luna',LLM_API_KEY:'fixture-private',DISCORD_GUILD_ID:guild});
const summary=ids=>Object.fromEntries(SUMMARY_FIELDS.map(field=>[field,field==='overview'?[{text:'Supported fixture facts, with stated uncertainty.',messageIds:ids.slice(0,Math.min(3,ids.length))}]:[]]));
async function apply(db,count=files.length){for(const file of files.slice(0,count))await db.exec(await readFile(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));}
function rpc(db,name,args={}){
  const keys=Object.keys(args),values=keys.map(key=>args[key]&&typeof args[key]==='object'&&!Array.isArray(args[key])?JSON.stringify(args[key]):args[key]);
  return db.query('select public.'+name+'('+keys.map((key,i)=>key+' => $'+(i+1)).join(',')+') value',values).then(r=>r.rows[0].value);
}
function storeFor(db){
  const errors=[];
  const store=createDiscordSummaryStore({env:{SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'fixture-private'},fetchImpl:async(url,options)=>{
    assert.equal(options.redirect,'error');const name=url.split('/').at(-1);assert(/^discord_summary_[a-z_]+$/.test(name));
    try{return Response.json(await rpc(db,name,JSON.parse(options.body)));}
    catch(error){errors.push({name,code:error.code,message:error.message});return Response.json({code:error.code},{status:error.code==='42501'?403:['40001','23514'].includes(error.code)?400:500});}
  }});
  return {...store,testErrors:errors};
}
function modelFor(calls=[]){
  return {configured:true,async summarize(args){
    calls.push(args);const reservation=await args.beforeDispatch({inputTokens:100,outputTokens:100,maxCostUsd:0.00006});
    if(reservation.status!=='ready')return reservation;
    const usage={inputTokens:100,outputTokens:100,cachedInputTokens:0,costUsd:0.00006};
    if((await args.afterDispatch({reservation,status:'succeeded',usage})).status!=='ready')return {status:'usage_commit_failed'};
    return {status:'ready',summary:summary(args.allowedMessageIds),usage,reservationId:reservation.reservationId};
  }};
}
async function addSource(db,id,cid,gid=guild,{complete=true}={}){
  await db.query("insert into public.discord_guild_policies(guild_id,revision,paused,discovery_enabled) values($1,1,false,true) on conflict do nothing",[gid]);
  await db.query("insert into public.knowledge_sources(id,kind,external_id,title,status) values($1,'discord',$2,'Fixture source','active')",[id,cid]);
  await db.query("insert into public.discord_channels(source_id,channel_id,guild_id,title,enabled,policy_revision,backfill_from) values($1,$2,$3,$4,true,1,'2015-01-01T00:00:00Z')",[id,cid,gid,'Fixture channel '+cid]);
  await db.query("insert into public.discord_channel_metadata(guild_id,channel_id,channel_type,access_status,eligible,generation) values($1,$2,0,'ready',true,$3)",[gid,cid,generation]);
  await db.query("insert into public.discord_discovery_state(guild_id,policy_revision,generation,state) values($1,1,$2,jsonb_build_object('phase','complete')) on conflict do nothing",[gid,generation]);
  if(complete)await db.query("insert into public.discord_sync_state(source_id,last_success_at,status) values($1,'2025-11-03T16:00:00Z','succeeded')",[id]);
}
async function insertOriginal(db,{index,source=sources[0],cid=channel,gid=guild,created,content='Original fixture '+index,text=content,extra={}}){
  const id=String(1500000000000000000n+BigInt(index));
  const payload={id,channel_id:cid,guild_id:gid,timestamp:created,content,author:{id:'345678901234567890',username:'Fixture author'},...extra};
  await db.query('insert into public.discord_messages(message_id,source_id,channel_id,guild_id,author_id,created_at,content,embedding_text,payload,content_hash,url,channel_name) values($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,(select title from public.discord_channels where source_id=$2))',[id,source,cid,gid,'345678901234567890',created,content,text,JSON.stringify(payload),createHash('sha256').update(text).digest('hex'),'https://discord.com/channels/'+gid+'/'+cid+'/'+id]);
  return normalizeMessage(payload,{channelId:cid,guildId:gid});
}
async function seed(db){
  await db.query('insert into public.discord_admin_members(member_id) values($1)',[admin]);
  await addSource(db,sources[0],channel);await addSource(db,sources[1],secondChannel);await addSource(db,sources[2],'123456789012345679',otherGuild);
  const originals=new Map();
  for(const row of [
    {index:1,created:'2025-09-20T12:00:00Z',content:'Prior month planning'},
    {index:2,created:'2025-10-01T12:00:00Z',content:'Meeting resource https://example.com/agenda.pdf'},
    {index:3,created:'2025-10-04T12:00:00Z',content:'',text:'Embed-only announcement and component deadline',extra:{embeds:[{title:'Announcement title',description:'Room204 deadline'}],components:[{type:10,content:'Component-only deadline'},{type:2,label:'Apply',url:'https://example.com/apply'},{type:13,file:{url:'https://example.com/component-agenda.pdf'}}]}},
    {index:4,source:sources[1],cid:secondChannel,created:'2025-10-01T14:00:00Z',content:'Other source fact'},
    {index:5,source:sources[2],cid:'123456789012345679',gid:otherGuild,created:'2025-10-01T15:00:00Z',content:'Unrelated guild fact'},
    {index:6,created:'2025-09-21T12:00:00Z',content:'😀'.repeat(5000),text:'😀'.repeat(20000)+'\u0001\u001f"\\'.repeat(1500)},
    {index:7,created:'2025-10-12T12:00:00Z',content:'Recent raw retained until next Monday'},
    {index:8,created:'2025-10-06T06:00:00Z',content:'Early Monday prefix'},
    {index:9,created:'2025-10-06T18:00:00Z',content:'Disjoint later prefix extension'},
  ])originals.set(row.index,await insertOriginal(db,row));
  await db.query("insert into public.discord_message_revisions(message_id,payload,content_hash) values('1500000000000000001','{}',$1)",['a'.repeat(64)]);
  await db.exec('set role service_role');
  await rpc(db,'discord_rebuild_memory',{p_guild_id:guild,p_expected_revision:1,p_as_of:firstAsOf});
  await rpc(db,'discord_rebuild_memory',{p_guild_id:otherGuild,p_expected_revision:1,p_as_of:firstAsOf});
  return originals;
}
function plan(mode='bootstrap',asOf=firstAsOf,dueIdentity=mode+':'+asOf){return {guildId:guild,provider:cfg.provider,model:cfg.model,promptVersion:cfg.promptVersion,mode,asOf,dueIdentity};}
async function snapshot(db){
  return (await db.query("select (select coalesce(jsonb_agg(message_id||':'||md5(payload::text) order by message_id),'[]') from public.discord_messages) raw,(select coalesce(jsonb_agg(certificate_id::text||':'||md5(summary::text) order by certificate_id),'[]') from public.discord_summary_results) results,(select coalesce(jsonb_agg(certificate_id::text||':'||range_start::text||':'||range_end::text order by certificate_id),'[]') from public.discord_compaction_ledger where active) ledger")).rows[0];
}
async function run(db,{mode='bootstrap',asOf=firstAsOf,operationId,provider=modelFor(),store=storeFor(db),...rest}={}){
  return runDiscordSummaries({config:{...cfg,concurrency:1},store,provider,mode,asOf,operationId,...rest});
}
async function noTempFor(db,jobIds){
  for(const table of ['discord_summary_inputs','discord_summary_parts','discord_summary_part_coverage','discord_summary_part_children']){
    assert.equal((await db.query('select count(*)::int n from public.'+table+' where job_id=any($1::uuid[])',[jobIds])).rows[0].n,0,table+' must not retain consumed content');
  }
}
async function drainPlanning(store,operationId){let result=await store.getOperation({operationId});for(let n=0;result.operation.planningComplete===false&&n<1000;n++){result=await store.prepareOperation({operationId,expectedCursor:result.operation.planningCursor});assert.equal(result.status,'ready',JSON.stringify(result));}assert.equal(result.operation.planningComplete,true);return result.operation;}
async function expectDeniedWithoutChanges(db,args,mutation,expected='stale'){
  await db.exec('begin');try{
    await mutation();const before=await snapshot(db);await db.exec('savepoint deny_publication');
    assert.equal((await storeFor(db).finishJob(args)).status,expected);
    await db.exec('rollback to savepoint deny_publication');assert.deepEqual(await snapshot(db),before);
  }finally{await db.exec('rollback');}
}

test('genuine009 retention replaces source content only after certified publication and survives raw pruning',async t=>{
  const db=new PGlite({extensions:{vector}});
  try{
    await db.exec('create role anon;create role authenticated;create role service_role bypassrls;');await apply(db);const originals=await seed(db),store=storeFor(db),calls=[];
    let initial,extension,closed,terminal;
    await t.test('eleven retention tables and all helper/RPCs are forced-RLS, invoker and browser-denied',async()=>{
      const tables=(await db.query("select count(*)::int n,count(*) filter(where not relrowsecurity or not relforcerowsecurity or has_table_privilege('anon',oid,'SELECT,INSERT,UPDATE,DELETE') or has_table_privilege('authenticated',oid,'SELECT,INSERT,UPDATE,DELETE'))::int invalid from pg_class where relnamespace='public'::regnamespace and relkind='r' and (relname like 'discord_summary_%' or relname='discord_compaction_ledger')")).rows[0];assert.deepEqual(tables,{n:11,invalid:0});
      const functions=(await db.query("select count(*) filter(where prosecdef or has_function_privilege('anon',oid,'EXECUTE') or has_function_privilege('authenticated',oid,'EXECUTE') or not has_function_privilege('service_role',oid,'EXECUTE'))::int invalid from pg_proc where pronamespace='public'::regnamespace and proname like 'discord_summary_%'")).rows[0];assert.equal(functions.invalid,0);
      const budgets=(await db.query("select proname,proconfig from pg_proc where pronamespace='public'::regnamespace and proname in('discord_summary_preview','discord_summary_begin_operation','discord_summary_finish_job') order by proname")).rows;assert.equal(budgets.length,3);for(const fn of budgets){assert(fn.proconfig.includes('statement_timeout=60s'));assert(fn.proconfig.includes('work_mem=16MB'));}
      assert.equal((await db.query('select count(*)::int n from public.knowledge_source_members')).rows[0].n,0);
    });
    await t.test('bootstrap selects historical monthly directly and retains all of the current NY Monday–Sunday week raw',async()=>{
      const preview=await store.preview(plan());assert.equal(preview.status,'ready');assert.equal(preview.groupCount,3);assert.equal(preview.messageCount,5);assert.equal(preview.waitingSourceCount,0);
      const rows=(await db.query('select tier,period_start,period_end,represented_message_count from public.discord_summary_manifest($1,$2,$3)',[guild,'bootstrap',firstAsOf])).rows;
      assert.equal(rows.filter(r=>r.tier==='monthly').length,1);assert.equal(rows.filter(r=>r.tier==='weekly').length,2);assert(!rows.some(r=>r.tier==='daily'));
      assert(rows.filter(r=>r.tier==='weekly').every(r=>new Date(r.period_end)<=new Date('2025-10-06T04:00:00Z')));
      const input=(await db.query("select public.discord_summary_input(m) value from public.discord_messages m where message_id='1500000000000000003'")).rows[0].value;
      assert(input.textEvidence.includes('Room204'));assert(input.textEvidence.includes('Component-only deadline'));assert(input.links.includes('https://example.com/apply'));assert(input.links.includes('https://example.com/component-agenda.pdf'));
      assert.equal(input.channelId,channel);assert.equal(input.channelName,'Fixture channel '+channel);
      await db.exec('begin');try{await db.query("update public.discord_messages set channel_name='spoofed-row-name',payload=payload||'{\"channel_name\":\"spoofed-message-name\"}' where message_id='1500000000000000003'");const canonical=(await db.query("select public.discord_summary_input(m) value from public.discord_messages m where message_id='1500000000000000003'")).rows[0].value;assert.equal(canonical.channelName,'Fixture channel '+channel);}finally{await db.exec('rollback');}
    });
    await t.test('author/reply/extracted component text and retained URL-only changes invalidate immutable input fingerprints',async()=>{
      const fingerprint=async()=> (await db.query("select input_fingerprint from public.discord_summary_manifest($1,'bootstrap',$2) where source_id=$3 and tier='weekly' and period_start='2025-10-01T04:00:00Z'",[guild,firstAsOf,sources[0]])).rows[0].input_fingerprint;
      const initialHash=await fingerprint();
      for(const change of ["author_id='345678901234567899'","reply_to_message_id='1500000000000000002'","embedding_text=embedding_text||' changed extracted deadline'","payload=jsonb_set(payload,'{components,1,url}','\"https://example.com/changed-apply\"')"]){
        await db.exec('begin');try{await db.exec("update public.discord_messages set "+change+" where message_id='1500000000000000003'");assert.notEqual(await fingerprint(),initialHash);}finally{await db.exec('rollback');}
      }
    });
    await t.test('unfinished, missing or old-policy discovery cannot report an empty successful retention operation',async()=>{
      for(const mutation of [()=>db.query("update public.discord_discovery_state set state='{\"phase\":\"archives\"}' where guild_id=$1",[guild]),()=>db.query('delete from public.discord_discovery_state where guild_id=$1',[guild]),()=>db.query('update public.discord_discovery_state set policy_revision=2 where guild_id=$1',[guild])]){
        await db.exec('begin');try{await mutation();const before=await snapshot(db),result=await run(db,{store});assert.equal(result.status,'partial');assert.equal(result.code,'wait_for_sync');assert.equal(result.requests,0);assert.deepEqual(await snapshot(db),before);}finally{await db.exec('rollback');}
      }
    });
    await t.test('completed discovery with every source explicitly excluded permits a harmless zero-job operation',async()=>{
      await db.exec('begin');try{
        await db.query('update public.discord_guild_policies set excluded_channel_ids=$1 where guild_id=$2',[[channel,secondChannel],guild]);
        const before=await snapshot(db),result=await run(db,{store});assert.equal(result.status,'ready');assert.equal(result.groups,0);assert.equal(result.requests,0);assert.deepEqual(await snapshot(db),before);
      }finally{await db.exec('rollback');}
    });
    await t.test('refusal and incomplete coverage leave every original, prior revision and summary untouched',async()=>{
      const before=await snapshot(db),refused={configured:true,async summarize(){return {status:'provider_refusal'};}};
      const result=await run(db,{provider:refused});assert.equal(result.status,'failed');assert.deepEqual(await snapshot(db),before);
      const op=await store.beginOperation({...plan(),expectedPolicyRevision:1});await drainPlanning(store,op.operationId);const claim=await store.claimJob({operationId:op.operationId,ownerId:'coverage-fixture'});
      assert.equal(claim.status,'ready');
      const receipt=randomUUID();await store.reserveRequest({jobId:claim.job.jobId,leaseToken:claim.job.leaseToken,reservationId:receipt,maxCostUsd:0.001,inputTokens:100,outputTokens:100});
      await store.commitUsage({reservationId:receipt,status:'succeeded',usage:{inputTokens:100,outputTokens:100,cachedInputTokens:0,costUsd:0.00006}});
      const page=await store.getInputs({jobId:claim.job.jobId,leaseToken:claim.job.leaseToken,messageLimit:1}),record=page.records[0];
      const part={stage:'map',ordinal:0,inputHash:'a'.repeat(64),reservationId:receipt,summary:summary(record.citationMessageIds),coverage:[{inputId:record.inputId,kind:record.kind,segmentIndex:0,segmentCount:record.segments.length}],childParts:[]};
      assert.equal((await store.savePart({jobId:claim.job.jobId,leaseToken:claim.job.leaseToken,part})).status,'ready',JSON.stringify(store.testErrors));
      const finish={jobId:claim.job.jobId,leaseToken:claim.job.leaseToken,summary:{...part.summary,citations:[]},finalPart:{stage:'map',ordinal:0,inputHash:part.inputHash},coverage:{inputRecordCount:claim.job.inputRecordCount,representedMessageCount:claim.job.representedMessageCount,segmentCount:claim.job.segmentCount,inputFingerprint:claim.job.inputFingerprint,mapPartCount:1}};
      assert.equal((await store.finishJob(finish)).status,'invalid_request');assert.deepEqual(await snapshot(db),before);
      await store.failJob({jobId:claim.job.jobId,leaseToken:claim.job.leaseToken,code:'summary_failed'});
      await db.query('delete from public.discord_summary_parts where job_id=$1',[claim.job.jobId]);
    });
    await t.test('valid publication rejects pause/blacklist/lease/raw changes first, then atomically removes raw/revisions/temp and repairs raw groups',async()=>{
      const guarded={...store,finishJob:async args=>{
        terminal=args;
        const job=(await db.query('select source_id,channel_id from public.discord_summary_jobs where id=$1',[args.jobId])).rows[0];
        await expectDeniedWithoutChanges(db,args,()=>db.query('update public.discord_guild_policies set paused=true where guild_id=$1',[guild]));
        await expectDeniedWithoutChanges(db,args,()=>db.query('update public.discord_guild_policies set excluded_channel_ids=array[$1] where guild_id=$2',[job.channel_id,guild]));
        await expectDeniedWithoutChanges(db,args,()=>db.query('update public.discord_channels set enabled=false where source_id=$1',[job.source_id]));
        await expectDeniedWithoutChanges(db,args,()=>db.query("update public.knowledge_sources set status='disabled' where id=$1",[job.source_id]));
        await expectDeniedWithoutChanges(db,args,()=>db.query("update public.discord_channels set title='renamed authoritative channel' where source_id=$1",[job.source_id]));
        await expectDeniedWithoutChanges(db,args,()=>db.query("update public.discord_summary_jobs set lease_expires_at=now()-interval '1 second' where id=$1",[args.jobId]));
        await expectDeniedWithoutChanges(db,args,()=>db.query("update public.discord_messages set content=content||' changed' where message_id=(select raw_message_id from public.discord_summary_inputs where job_id=$1 and kind='raw' order by ordinal limit 1)",[args.jobId]));
        const published=await store.finishJob(args);assert.equal(published.status,'ready');assert.equal(published.result.channelId,job.channel_id);assert.equal(published.result.channelName,'Fixture channel '+job.channel_id);return published;
      }};
      initial=await run(db,{store:guarded,provider:modelFor(calls)});assert.equal(initial.status,'ready',JSON.stringify({initial,errors:store.testErrors}));
      assert.equal(initial.groups,3);assert.equal(initial.processedRecords,5);assert.equal(initial.representedOriginals,5);
      assert.equal((await db.query('select count(*)::int n from public.discord_messages')).rows[0].n,4);
      assert.equal((await db.query('select count(*)::int n from public.discord_message_revisions')).rows[0].n,0);
      const jobs=(await db.query('select id from public.discord_summary_jobs where status=$1',['succeeded'])).rows.map(row=>row.id);await noTempFor(db,jobs);
      assert.equal((await db.query('select count(*)::int n from public.discord_memory_buckets b where message_count<>(select count(*) from public.discord_memory_members mm where mm.bucket_id=b.id)')).rows[0].n,0);
      assert.equal((await db.query("select count(*)::int n from public.discord_summary_jobs where tier='daily'")).rows[0].n,0);
    });
    await t.test('post-prune certificates, paginated source ACL reads and terminal retry remain valid without any raw or part reread',async()=>{
      const before=await snapshot(db),retried=await store.finishJob(terminal);assert.equal(retried.status,'ready');assert.equal(retried.result.cached,true);assert.deepEqual(await snapshot(db),before);
      const lastJob=(await db.query('select channel_id,channel_name from public.discord_summary_jobs where id=$1',[terminal.jobId])).rows[0];assert.equal(retried.result.channelId,lastJob.channel_id);assert.equal(retried.result.channelName,lastJob.channel_name);
      const cached=await run(db,{operationId:initial.operationId,provider:{configured:true,summarize:async()=>{throw new Error('must not dispatch');}}});assert.equal(cached.status,'ready');assert.equal(cached.requests,0);
      assert.equal((await store.listSummaries({principal:{id:reader,allowedSourceIds:[sources[0]]}})).summaries.length,0);
      await db.query('insert into public.knowledge_source_members(source_id,member_id,can_read) values($1,$2,true)',[sources[0],reader]);
      assert.equal((await store.listSummaries({principal:{id:reader,allowedSourceIds:[sources[1]]}})).summaries.length,0);
      const rows=[];let after=null;
      for(let i=0;i<6;i++){const page=await store.listSummaries({principal:{id:reader,allowedSourceIds:[sources[0]]},limit:1,after});assert.equal(page.status,'ready');if(!page.summaries.length)break;rows.push(...page.summaries);after=page.summaries.at(-1).summaryId;}
      assert.equal(rows.length,2);assert.equal(new Set(rows.map(row=>row.summaryId)).size,2);
      for(const row of rows){assert.equal(row.channelId,channel);assert.equal(row.channelName,'Fixture channel '+channel);assert.equal(row.sourceId,sources[0]);for(const citation of row.citations)assert.equal(citation.url,'https://discord.com/channels/'+guild+'/'+channel+'/'+citation.messageId);}
    });
    await t.test('next Monday compacts the entire completed calendar week once rather than extending an elapsed-day prefix',async()=>{
      const capture=[];extension=await run(db,{mode:'weekly',asOf:nextAsOf,provider:modelFor(capture)});assert.equal(extension.status,'ready',JSON.stringify(extension));assert.equal(extension.groups,1);
      assert.equal(extension.processedRecords,3);assert.equal(extension.representedOriginals,3);
      const recordText=capture.filter(call=>call.stage==='map').flatMap(call=>call.input.records);
      assert.equal(recordText.filter(record=>record.kind==='verified_summary').length,0);assert.equal(recordText.filter(record=>record.kind==='raw').length,3);
      assert.equal((await db.query('select count(*)::int n from public.discord_messages where guild_id=$1',[guild])).rows[0].n,0);
      const cert=(await db.query("select c.represented_message_count,c.raw_message_count,c.summary_input_count,c.input_record_count,c.dependencies from public.discord_summary_certificates c join public.discord_compaction_ledger l on l.certificate_id=c.id and l.active where c.source_id=$1 and c.period_key='weekly:2025-10-06'",[sources[0]])).rows[0];
      assert.equal(Number(cert.represented_message_count),3);assert.equal(Number(cert.raw_message_count),3);assert.equal(cert.summary_input_count,0);assert.equal(cert.input_record_count,3);assert.deepEqual(cert.dependencies,[]);
      assert.equal((await db.query('select count(*)::int n from public.discord_compaction_ledger a join public.discord_compaction_ledger b on a.id<b.id and a.source_id=b.source_id and a.active and b.active and a.range_start<b.range_end and b.range_start<a.range_end')).rows[0].n,0);
    });
    await t.test('monthly first consolidates completed weeks while preserving its crossing current-week tail; rollback and cache remain atomic',async()=>{
      originals.set(10,await insertOriginal(db,{index:10,created:'2025-10-22T12:00:00Z',content:'Completed week raw monthly closure'}));
      originals.set(11,await insertOriginal(db,{index:11,created:'2025-10-30T12:00:00Z',content:'Current cross-month week remains raw'}));
      const before=await snapshot(db),capture=[];
      await db.exec("reset role;create function public.fixture_reject_prune() returns trigger language plpgsql as $$ begin raise exception 'fixture_after_delete_rejected';end $$;create trigger fixture_reject_prune after delete on public.discord_messages for each row execute function public.fixture_reject_prune();set role service_role;");
      const failed=await run(db,{mode:'monthly',asOf:closeAsOf,provider:modelFor(capture),maxGroups:1});assert.equal(failed.status,'failed');assert.deepEqual(await snapshot(db),before);
      assert(failed.requests>0);
      await db.exec('reset role;drop trigger fixture_reject_prune on public.discord_messages;drop function public.fixture_reject_prune();set role service_role;');
      const monthlyRecords=capture.filter(call=>call.stage==='map').flatMap(call=>call.input.records);
      assert.equal(monthlyRecords.filter(record=>record.kind==='verified_summary').length,2);assert.equal(monthlyRecords.filter(record=>record.kind==='raw').length,1);
      const requestsBefore=(await db.query('select count(*)::int n from public.discord_summary_requests')).rows[0].n;
      const guardedMonthly={...store,finishJob:async args=>{
        const child=(await db.query("select certificate_id from public.discord_summary_inputs where job_id=$1 and kind='verified_summary' limit 1",[args.jobId])).rows[0];
        if(child){
          await expectDeniedWithoutChanges(db,args,()=>db.query('update public.discord_compaction_ledger set active=false where certificate_id=$1',[child.certificate_id]));
          await expectDeniedWithoutChanges(db,args,()=>db.query("update public.discord_summary_results set summary=jsonb_set(summary,'{overview,0,text}','\"Altered prior evidence\"') where certificate_id=$1",[child.certificate_id]));
          if((await db.query("select exists(select 1 from public.discord_summary_inputs where job_id=$1 and kind='raw') raw",[args.jobId])).rows[0].raw)await expectDeniedWithoutChanges(db,args,()=>db.query('update public.discord_summary_inputs set range_end=(select period_end from public.discord_summary_jobs where id=$1) where job_id=$1 and certificate_id=$2',[args.jobId,child.certificate_id]),'invalid_request');
        }
        return store.finishJob(args);
      }};
      closed=await run(db,{mode:'monthly',asOf:closeAsOf,operationId:failed.operationId,provider:modelFor(),store:guardedMonthly});assert.equal(closed.status,'ready',JSON.stringify(closed));assert(closed.cachedParts>0);
      assert.equal((await db.query('select count(*)::int n from public.discord_summary_requests')).rows[0].n,requestsBefore+1,'failed source must reuse cache; only untouched second source dispatches');
      const active=(await db.query('select c.* from public.discord_summary_certificates c join public.discord_compaction_ledger l on l.certificate_id=c.id and l.active order by c.source_id,c.period_key')).rows;
      assert(active.every(cert=>cert.tier==='monthly'));assert.equal(active.length,3);
      const october=active.find(cert=>cert.source_id===sources[0]&&cert.period_key==='monthly:2025-10');
      assert.equal(Number(october.represented_message_count),6);assert.equal(Number(october.raw_message_count),1);assert.equal(october.summary_input_count,2);assert.equal(october.input_record_count,3);assert.equal(october.dependencies.length,2);
      assert.match(october.coverage_digest,/^[0-9a-f]{64}$/);assert(october.dependencies.every(child=>/^[0-9a-f]{64}$/.test(child.coverageDigest)));
      assert.equal((await db.query("select count(*)::int n from public.discord_summary_results r join public.discord_summary_certificates c on c.id=r.certificate_id where c.tier='weekly'")).rows[0].n,0);
      assert.equal((await db.query('select count(*)::int n from public.discord_messages')).rows[0].n,2);
      assert.equal(new Date(october.range_end).toISOString(),'2025-10-27T04:00:00.000Z');
      assert.equal((await db.query("select count(*)::int n from public.discord_messages where message_id='1500000000000000011'")).rows[0].n,1);
      await noTempFor(db,(await db.query('select id from public.discord_summary_jobs where guild_id=$1',[guild])).rows.map(row=>row.id));
    });
    await t.test('missed cross-month tail is still folded by a later routine slot rather than abandoned beyond the immediately prior month',async()=>{
      await db.exec('begin');try{
        await db.query("update public.discord_sync_state set last_success_at='2025-12-02T16:00:00Z' where source_id in(select source_id from public.discord_channels where guild_id=$1)",[guild]);
        const capture=[],result=await run(db,{mode:'weekly',asOf:'2025-12-01T13:00:00Z',provider:modelFor(capture)});assert.equal(result.status,'ready',JSON.stringify(result));assert.equal(result.groups,2);
        assert(capture.every(call=>call.input.context.tier==='monthly'));assert(capture.some(call=>call.stage==='map'&&call.input.records.some(record=>record.kind==='verified_summary')));
        const finished=(await db.query("select c.* from public.discord_summary_certificates c join public.discord_compaction_ledger l on l.certificate_id=c.id and l.active where c.source_id=$1 and c.period_key='monthly:2025-10'",[sources[0]])).rows;
        assert.equal(finished.length,1);assert.equal(Number(finished[0].represented_message_count),7);assert.equal(new Date(finished[0].range_end).toISOString(),'2025-11-01T04:00:00.000Z');assert.equal((await db.query('select count(*)::int n from public.discord_messages where guild_id=$1',[guild])).rows[0].n,0);
      }finally{await db.exec('rollback');}
    });
    await t.test('following Monday folds the protected previous-month tail and monthly certificate into ONE final monthly result per channel',async()=>{
      const before=(await db.query("select c.id from public.discord_summary_certificates c join public.discord_compaction_ledger l on l.certificate_id=c.id and l.active where c.source_id=$1 and c.period_key='monthly:2025-10'",[sources[0]])).rows[0].id;
      const capture=[],result=await run(db,{mode:'weekly',asOf:tailAsOf,provider:modelFor(capture)});assert.equal(result.status,'ready',JSON.stringify(result));
      const records=capture.filter(call=>call.stage==='map').flatMap(call=>call.input.records);assert.equal(records.filter(record=>record.kind==='raw').length,1);assert(records.some(record=>record.kind==='verified_summary'));
      const active=(await db.query("select c.* from public.discord_summary_certificates c join public.discord_compaction_ledger l on l.certificate_id=c.id and l.active where c.source_id=$1 and c.period_key='monthly:2025-10'",[sources[0]])).rows;
      assert.equal(active.length,1);assert.equal(Number(active[0].represented_message_count),7);assert.equal(Number(active[0].raw_message_count),1);assert.equal(active[0].summary_input_count,1);assert.equal(new Date(active[0].range_end).toISOString(),'2025-11-01T04:00:00.000Z');assert.equal(active[0].dependencies[0].certificateId,before);
      assert.equal((await db.query('select count(*)::int n from public.discord_summary_results where certificate_id=$1',[before])).rows[0].n,0);
      assert.equal((await db.query('select count(*)::int n from public.discord_messages where guild_id=$1',[guild])).rows[0].n,0);
      const retiredRetry=await store.finishJob(terminal),lastJob=(await db.query('select channel_id,channel_name from public.discord_summary_jobs where id=$1',[terminal.jobId])).rows[0];assert.equal(retiredRetry.status,'ready');assert.equal(retiredRetry.result.cached,true);assert.equal(retiredRetry.result.superseded,true);assert.equal(retiredRetry.result.channelId,lastJob.channel_id);assert.equal(retiredRetry.result.channelName,lastJob.channel_name);
      assert.equal((await db.query('select count(*)::int n from public.discord_compaction_ledger a join public.discord_compaction_ledger b on a.id<b.id and a.source_id=b.source_id and a.active and b.active and a.range_start<b.range_end and b.range_start<a.range_end')).rows[0].n,0);
    });
    await t.test('compacted overlap/late collector pages cannot resurrect raw but keep boolean compatibility and advance checkpoints',async()=>{
      const old=(await db.query('select * from public.discord_sync_state where source_id=$1',[sources[0]])).rows[0];
      const message=originals.get(1),json={message_id:message.messageId,channel_id:channel,guild_id:guild,author_id:message.authorId,created_at:message.createdAt,edited_at:null,reply_to_message_id:null,content:message.content,embedding_text:message.embeddingText,payload:message.payload,content_hash:message.contentHash,url:message.url};
      const state={status:'running',last_success_at:old.last_success_at,window_from:'2025-09-01T04:00:00Z',window_to:'2025-11-04T16:00:00Z',before_cursor:message.messageId,expected_before:old.before_cursor,expected_window_to:old.window_to,expected_last_success_at:old.last_success_at,expected_policy_revision:1};
      const foreignId=originals.get(5).messageId,crossSource={...json,message_id:foreignId,payload:{...json.payload,id:foreignId},url:'https://discord.com/channels/'+guild+'/'+channel+'/'+foreignId};
      await assert.rejects(rpc(db,'discord_persist_page',{p_source_id:sources[0],p_messages:[crossSource],p_state:state}),/Message identity mismatch/);
      assert.equal(await rpc(db,'discord_persist_page',{p_source_id:sources[0],p_messages:[json],p_state:state}),true);
      assert.equal((await db.query('select count(*)::int n from public.discord_messages where guild_id=$1',[guild])).rows[0].n,0);
      const next={...state,status:'succeeded',last_success_at:'2025-11-04T16:00:00Z',window_from:null,window_to:null,before_cursor:null,expected_before:message.messageId,expected_window_to:state.window_to};
      assert.equal(await rpc(db,'discord_persist_page',{p_source_id:sources[0],p_messages:[json],p_state:next}),true);
      assert.equal(await rpc(db,'discord_persist_page',{p_source_id:sources[0],p_messages:[json],p_state:state}),false,'stale pre-compaction CAS cannot overwrite newer cursor');
      assert.equal(new Date((await db.query('select last_success_at from public.discord_sync_state where source_id=$1',[sources[0]])).rows[0].last_success_at).toISOString(),'2025-11-04T16:00:00.000Z');
      assert.equal((await db.query('select count(*)::int n from public.discord_message_revisions')).rows[0].n,0);
      const rawRebuild=await rpc(db,'discord_rebuild_memory',{p_guild_id:guild,p_expected_revision:1,p_as_of:closeAsOf});assert.equal(rawRebuild.messages,0);
      assert.equal((await store.listSummaries({principal:{id:reader,allowedSourceIds:[sources[0]]}})).summaries.length,2);
    });
    await t.test('new source without a ledger ingests old history normally; incomplete history reports waiting and preserves raw',async()=>{
      const fresh='77777777-7777-4777-8777-777777777777',cid='1203562091982622820';
      await addSource(db,fresh,cid,guild,{complete:false});
      const emptyPreview=await store.preview(plan('bootstrap',closeAsOf));assert.equal(emptyPreview.waitingSourceCount,1);
      const emptyWaiting=await run(db,{asOf:closeAsOf,provider:modelFor()});assert.equal(emptyWaiting.status,'partial');assert.equal(emptyWaiting.code,'wait_for_sync');assert.equal(emptyWaiting.requests,0);
      const normalized=normalizeMessage({id:'1500000000000000020',channel_id:cid,guild_id:guild,timestamp:'2025-09-20T10:00:00Z',content:'New-source history',author:{id:'345678901234567890',username:'New-source fixture'}},{channelId:cid,guildId:guild});
      const json={message_id:normalized.messageId,channel_id:cid,guild_id:guild,author_id:normalized.authorId,created_at:normalized.createdAt,content:normalized.content,embedding_text:normalized.embeddingText,payload:normalized.payload,content_hash:normalized.contentHash,url:normalized.url};
      const partial={status:'running',last_success_at:null,window_from:'2015-01-01T00:00:00Z',window_to:'2025-11-03T16:00:00Z',before_cursor:normalized.messageId,expected_before:null,expected_window_to:null,expected_last_success_at:null,expected_policy_revision:1};
      assert.equal(await rpc(db,'discord_persist_page',{p_source_id:fresh,p_messages:[json],p_state:partial}),true);
      assert.equal((await db.query('select channel_id,channel_name from public.discord_messages where message_id=$1',[normalized.messageId])).rows[0].channel_name,'Fixture channel '+cid);
      const before=await snapshot(db),preview=await store.preview(plan('bootstrap',closeAsOf));assert.equal(preview.waitingSourceCount,1);assert.equal(preview.blockedGroupCount,1);
      const waiting=await run(db,{asOf:closeAsOf,provider:modelFor()});assert.equal(waiting.status,'partial');assert.equal(waiting.code,'wait_for_sync');assert.equal(waiting.requests,0);assert.deepEqual(await snapshot(db),before);
      assert.equal((await db.query('select count(*)::int n from public.discord_messages where source_id=$1',[fresh])).rows[0].n,1);
      await db.query("update public.discord_sync_state set status='succeeded',last_success_at='2025-11-03T16:00:00Z',window_from=null,window_to=null,before_cursor=null where source_id=$1",[fresh]);
      const caught=await run(db,{mode:'weekly',asOf:tailAsOf,provider:modelFor()});assert.equal(caught.status,'ready',JSON.stringify(caught));assert.equal(caught.groups,1);assert.equal(caught.representedOriginals,1);
      const historical=(await db.query('select c.tier,c.period_key,c.channel_name from public.discord_summary_certificates c join public.discord_compaction_ledger l on l.certificate_id=c.id and l.active where c.source_id=$1',[fresh])).rows[0];assert.deepEqual(historical,{tier:'monthly',period_key:'monthly:2025-09',channel_name:'Fixture channel '+cid});
      assert.equal((await db.query('select count(*)::int n from public.discord_messages where source_id=$1',[fresh])).rows[0].n,0);
    });
    await t.test('current blacklist/ACL scope hides retained output and authorized reset preserves unrelated guild/config/operator/grants',async()=>{
      await db.exec('begin');try{
        await db.query('update public.discord_guild_policies set excluded_channel_ids=array[$1] where guild_id=$2',[channel,guild]);
        assert.equal((await store.listSummaries({principal:{id:reader,allowedSourceIds:[sources[0]]}})).summaries.length,0);
      }finally{await db.exec('rollback');}
      const unrelatedStore=storeFor(db),unrelated=await runDiscordSummaries({config:{...cfg,guildId:otherGuild,concurrency:1},store:unrelatedStore,provider:modelFor(),mode:'bootstrap',asOf:firstAsOf});assert.equal(unrelated.status,'ready');
      const before=(await db.query('select count(*)::int n from public.discord_compaction_ledger l join public.discord_channels c on c.source_id=l.source_id where c.guild_id=$1',[otherGuild])).rows[0].n;assert(before>0);
      await db.query('update public.discord_guild_policies set paused=true where guild_id=$1',[guild]);
      await assert.rejects(rpc(db,'discord_reset_archive',{p_member_id:reader,p_guild_id:guild,p_expected_revision:1}),/Admin access denied/);
      const reset=await rpc(db,'discord_reset_archive',{p_member_id:admin,p_guild_id:guild,p_expected_revision:1});assert.equal(reset.policy_revision,2);
      assert.equal((await db.query('select count(*)::int n from public.discord_compaction_ledger l join public.discord_channels c on c.source_id=l.source_id where c.guild_id=$1',[guild])).rows[0].n,0);
      assert.equal((await db.query('select count(*)::int n from public.discord_compaction_ledger l join public.discord_channels c on c.source_id=l.source_id where c.guild_id=$1',[otherGuild])).rows[0].n,before);
      assert.equal((await db.query('select count(*)::int n from public.discord_admin_members')).rows[0].n,1);assert.equal((await db.query('select count(*)::int n from public.knowledge_source_members')).rows[0].n,1);assert.equal((await db.query('select count(*)::int n from public.discord_channels')).rows[0].n,4);
    });
  }finally{await db.close();}
});

test('stale monthly cached content is pruned by its verified replacement; ordinary bounded pauses exceed ten claims safely',async()=>{
  const db=new PGlite({extensions:{vector}});
  try{
    await db.exec('create role anon;create role authenticated;create role service_role bypassrls;');await apply(db);await addSource(db,sources[0],channel);
    for(const index of [101,103,104])await insertOriginal(db,{index,created:'2025-09-20T12:00:00Z',content:'Original monthly wording',text:'😀'.repeat(40000)});await db.exec('set role service_role');
    const store=storeFor(db),before=await snapshot(db),first=await run(db,{store,maxRequests:1});assert.equal(first.status,'partial');assert.equal(first.groups,0);assert.deepEqual(await snapshot(db),before);
    const oldJob=(await db.query('select id from public.discord_summary_jobs')).rows[0].id;
    assert((await db.query('select count(*)::int n from public.discord_summary_parts where job_id=$1',[oldJob])).rows[0].n>0);
    await db.query("update public.discord_messages set author_id='345678901234567899',reply_to_message_id='1500000000000000100',content='Changed monthly wording' where message_id='1500000000000000101'");
    const repaired=await run(db,{operationId:first.operationId,store,maxRequests:1});assert.equal(repaired.status,'partial');assert.equal(repaired.complete,false);assert.equal(repaired.requests,1);assert.equal(repaired.replans,1);assert.equal(repaired.groups,0);assert.equal((await db.query('select count(*)::int n from public.discord_messages')).rows[0].n,3);assert.equal((await db.query('select status from public.discord_summary_jobs where id=$1',[oldJob])).rows[0].status,'stale');
    const frozen=(await store.getOperation({operationId:first.operationId})).operation;const fresh=await store.beginOperation({...plan(frozen.mode,frozen.asOf,frozen.dueIdentity),expectedPolicyRevision:1});assert.equal(fresh.operationId,first.operationId,'automatic charged recovery retains the original operation budget');
    let result,claims=0;
    do{result=await run(db,{store,operationId:fresh.operationId,maxRequests:1});claims++;assert(['ready','partial'].includes(result.status),JSON.stringify({result,errors:store.testErrors}));}while(result.status==='partial'&&claims<40);
    assert.equal(result.status,'ready');assert(claims>10,'fixture must exercise more than ten normal budget pauses');
    await noTempFor(db,(await db.query('select id from public.discord_summary_jobs')).rows.map(row=>row.id));
    assert.equal((await db.query('select count(*)::int n from public.discord_messages')).rows[0].n,0);
    assert.equal((await db.query('select failure_count from public.discord_summary_jobs where id<>$1',[oldJob])).rows[0].failure_count,0);
    assert((await db.query('select count(*)::int n from public.discord_summary_requests')).rows[0].n>10,'charged dispatch accounting must survive content cleanup');
  }finally{await db.close();}
});

test('exact durable dispatch cap still permits free cached finalization after transient publication failure',async()=>{
  const db=new PGlite({extensions:{vector}});
  try{
    await db.exec('create role anon;create role authenticated;create role service_role bypassrls;');await apply(db);await addSource(db,sources[0],channel);await insertOriginal(db,{index:102,created:'2025-09-20T12:00:00Z'});await db.exec('set role service_role');
    const store=storeFor(db),op=await store.beginOperation({...plan(),expectedPolicyRevision:1,maxRequests:1,maxCostUsd:0.00006});
    const first=await run(db,{operationId:op.operationId,store:{...store,finishJob:async()=>({status:'database_unavailable'})}});assert.equal(first.status,'failed');assert.equal(first.requests,1);
    const before=(await store.getOperation({operationId:op.operationId})).operation;assert.equal(before.requests,before.maxRequests);assert.equal(before.costUsd,before.maxCostUsd);
    const resumed=await run(db,{operationId:op.operationId,store,provider:{configured:true,summarize:async()=>{throw new Error('cache-only finalization must not dispatch');}}});
    assert.equal(resumed.status,'ready',JSON.stringify(resumed));assert.equal(resumed.requests,0);assert.equal(resumed.cachedParts,1);assert.equal((await db.query('select count(*)::int n from public.discord_messages')).rows[0].n,0);
  }finally{await db.close();}
});

test('008 changes EXACTLY two planning statement timeouts while preserving complete function/schema/role metadata',async()=>{
  const db=new PGlite({extensions:{vector}});
  try{
    await db.exec('create role anon;create role authenticated;create role service_role bypassrls;');await apply(db,7);
    for(const [index,hash] of [[5,'b514fe4e4775045a05f2dfe58834e7f2b7fd699a4c563e2252ccabf808a2549d'],[6,'2678385838b31764e46d0818a4a1316a456732b09e9607e72d82c856345f715b']])assert.equal(createHash('sha256').update(await readFile(new URL('../supabase/migrations/'+files[index],import.meta.url))).digest('hex'),hash,'applied migrations must remain immutable');
    const capture=async()=>({
      functions:(await db.query("select to_jsonb(p)-'proconfig'-'prosrc' metadata,p.proconfig,encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') body_hash from pg_proc p where pronamespace='public'::regnamespace order by oid")).rows.map(row=>({...row,proconfig:row.proconfig?.slice().sort()??null})),
      tables:(await db.query("select oid::text,relname,relowner,relkind,relpersistence,relnatts,relrowsecurity,relforcerowsecurity,relacl::text,reloptions from pg_class where relnamespace='public'::regnamespace order by oid")).rows,
      columns:(await db.query("select table_name,column_name,ordinal_position,data_type,udt_schema,udt_name,is_nullable,column_default from information_schema.columns where table_schema='public' order by table_name,ordinal_position")).rows,
      constraints:(await db.query("select oid::text,conname,conrelid::text,contype,pg_get_constraintdef(oid) definition from pg_constraint where connamespace='public'::regnamespace order by oid")).rows,
      roles:(await db.query("select to_jsonb(r)-'rolpassword' metadata from pg_roles r where rolname in('anon','authenticated','service_role') order by rolname")).rows,
      settings:(await db.query("select name,setting,source,context from pg_settings where name in('statement_timeout','work_mem') order by name")).rows,
    });
    const before=await capture();await db.exec(await readFile(new URL('../supabase/migrations/'+files[7],import.meta.url),'utf8'));const after=await capture(),expected=structuredClone(before);
    const targets=['discord_summary_begin_operation','discord_summary_preview'];
    for(const fn of expected.functions)if(targets.includes(fn.metadata.proname)){assert(fn.proconfig.includes('statement_timeout=60s'));assert(fn.proconfig.includes('work_mem=16MB'));fn.proconfig=fn.proconfig.map(setting=>setting==='statement_timeout=60s'?'statement_timeout=180s':setting).sort();}
    assert.deepEqual(after,expected,'only the two local function timeout values may change');
    assert.deepEqual(after.functions.filter((fn,i)=>JSON.stringify(fn)!==JSON.stringify(before.functions[i])).map(fn=>fn.metadata.proname).sort(),targets);
    const finish=after.functions.find(fn=>fn.metadata.proname==='discord_summary_finish_job');assert(finish.proconfig.includes('statement_timeout=60s'));assert(finish.proconfig.includes('work_mem=16MB'));
    console.log('PERFORMANCE_008_DELTA '+JSON.stringify({changedFunctions:targets,planningSqlMs:180000,finishSqlMs:60000,workMem:'16MB',bodiesSignaturesPrivilegesRolesUnchanged:true}));
  }finally{await db.close();}
});

test('SQL calendar boundaries preserve Sunday DST/cross-month raw and select only completed NY weeks',async()=>{
  const db=new PGlite({extensions:{vector}});
  try{
    await db.exec('create role anon;create role authenticated;create role service_role bypassrls;');await apply(db);await addSource(db,sources[0],channel);await db.exec('set role service_role');
    const cases=[
      {asOf:'2025-03-10T12:00:00Z',start:'2025-03-10T04:00:00Z',prior:'2025-03-09T07:30:00Z',periodStart:'2025-03-03T05:00:00Z',hours:167},
      {asOf:'2025-11-02T13:00:00Z',start:'2025-10-27T04:00:00Z',prior:'2025-10-26T23:59:00Z',monthlyEnd:'2025-10-27T04:00:00Z',fold:['2025-11-02T05:30:00Z','2025-11-02T06:30:00Z']},
      {asOf:'2025-03-01T13:00:00Z',start:'2025-02-24T05:00:00Z',prior:'2025-02-23T23:59:00Z',monthlyEnd:'2025-02-24T05:00:00Z'},
    ];
    for(const [caseIndex,item] of cases.entries()){
      await db.exec('begin');try{
        const base=300+caseIndex*10;
        await insertOriginal(db,{index:base,created:item.prior});await insertOriginal(db,{index:base+1,created:item.start});await insertOriginal(db,{index:base+2,created:item.asOf});
        for(const [offset,created] of (item.fold??[]).entries())await insertOriginal(db,{index:base+3+offset,created});
        const rows=(await db.query("select * from public.discord_summary_manifest($1,'bootstrap',$2)",[guild,item.asOf])).rows;
        assert.equal(rows.length,1);assert.equal(Number(rows[0].represented_message_count),1);assert.equal(new Date(rows[0].period_end).toISOString(),new Date(item.monthlyEnd??item.start).toISOString());
        if(item.hours){assert.equal(rows[0].tier,'weekly');assert.equal(new Date(rows[0].period_start).toISOString(),new Date(item.periodStart).toISOString());assert.equal((Date.parse(rows[0].period_end)-Date.parse(rows[0].period_start))/3600000,item.hours);}else assert.equal(rows[0].tier,'monthly');
        const result=await run(db,{asOf:item.asOf});assert.equal(result.status,'ready',JSON.stringify(result));assert.equal(result.representedOriginals,1);
        const raw=(await db.query('select created_at from public.discord_messages')).rows;assert.equal(raw.length,2+(item.fold?.length??0));assert(raw.every(row=>new Date(row.created_at)>=new Date(item.start)));
      }finally{await db.exec('rollback');}
    }
  }finally{await db.close();}
});

test('007 preserves complete manifests, fingerprints, canonical input pages, cached identities and catalogue permissions',async()=>{
  const db=new PGlite({extensions:{vector}});
  try{
    const applied006=await readFile(new URL('../supabase/migrations/'+files[5],import.meta.url));assert.equal(createHash('sha256').update(applied006).digest('hex'),'b514fe4e4775045a05f2dfe58834e7f2b7fd699a4c563e2252ccabf808a2549d','applied006 must remain immutable');
    await db.exec('create role anon;create role authenticated;create role service_role bypassrls;');await apply(db,6);await seed(db);
    const original=(await db.query("select pg_get_functiondef('public.discord_summary_manifest(text,text,timestamptz)'::regprocedure) definition")).rows[0].definition;
    const optimized=await readFile(new URL('../supabase/migrations/'+files[6],import.meta.url),'utf8');
    const catalogue=async()=>({
      functions:(await db.query("select oid::text,proname,prosecdef,provolatile,proconfig,proacl::text,pg_get_function_identity_arguments(oid) args,pg_get_function_result(oid) result,case when proname='discord_summary_manifest' then null else encode(sha256(convert_to(prosrc,'UTF8')),'hex') end body_hash from pg_proc where pronamespace='public'::regnamespace order by oid")).rows,
      tables:(await db.query("select oid::text,relname,relrowsecurity,relforcerowsecurity,relacl::text from pg_class where relnamespace='public'::regnamespace and relkind='r' order by oid")).rows,
      roles:(await db.query("select rolname,rolconfig,rolbypassrls,rolsuper from pg_roles where rolname in('anon','authenticated','service_role') order by rolname")).rows,
    });
    const capture=async job=>{
      const manifests=[];for(const mode of ['bootstrap','weekly','monthly'])for(const asOf of [firstAsOf,nextAsOf,closeAsOf,tailAsOf,'2025-12-01T13:00:00Z'])manifests.push({mode,asOf,rows:(await db.query('select * from public.discord_summary_manifest($1,$2,$3) order by source_id,tier,period_start',[guild,mode,asOf])).rows});
      const raw=(await db.query('select message_id,public.discord_summary_input(m) canonical from public.discord_messages m order by message_id')).rows;
      const retained=(await db.query('select c.id,public.discord_summary_verified_input(c.id) canonical from public.discord_summary_certificates c join public.discord_compaction_ledger l on l.certificate_id=c.id and l.active order by c.id')).rows;
      const pages=[];if(job){let after=null;for(let n=0;n<100;n++){const page=await storeFor(db).getInputs({jobId:job.jobId,leaseToken:job.leaseToken,after,messageLimit:1,charLimit:8000});assert.equal(page.status,'ready');pages.push(page);if(page.done)break;after=page.nextCursor;}assert(pages.at(-1)?.done);}
      return {manifests,raw,retained,pages,catalogue:await catalogue()};
    };
    async function compare(stage,job){
      await db.exec('reset role');await db.exec(original);await db.exec('set role service_role');const before=await capture(job);
      await db.exec('reset role');await db.exec(optimized);await db.exec('set role service_role');const after=await capture(job);
      assert.deepEqual(after,before,stage+' full public output and canonical input equality');
      console.log('PERFORMANCE_007_PARITY '+stage+' '+JSON.stringify({manifestCases:after.manifests.length,rawCanonicalRecords:after.raw.length,verifiedRecords:after.retained.length,inputPages:after.pages.length}));
    }
    await compare('originals');
    assert.equal((await run(db)).status,'ready');await compare('published and cached');
    assert.equal((await run(db,{mode:'weekly',asOf:nextAsOf})).status,'ready');
    await insertOriginal(db,{index:410,created:'2025-10-22T12:00:00Z'});await insertOriginal(db,{index:411,created:'2025-10-30T12:00:00Z'});
    const store=storeFor(db),op=await store.beginOperation({...plan('monthly',closeAsOf),expectedPolicyRevision:1}),claim=await store.claimJob({operationId:op.operationId,ownerId:'007-parity'});assert.equal(claim.status,'ready');
    await compare('mixed monthly raw plus verified prefix',claim.job);
    await store.failJob({jobId:claim.job.jobId,leaseToken:claim.job.leaseToken,code:'aborted'});
    assert.equal((await run(db,{mode:'monthly',asOf:closeAsOf,operationId:op.operationId})).status,'ready');await compare('partial monthly crossing-week tail');
    assert.equal((await run(db,{mode:'weekly',asOf:tailAsOf})).status,'ready');await compare('closed month post-prune cache');
  }finally{await db.close();}
});

test('representative108836 originals/216sources/779 raw groups plan and6397-original publication fit scoped RPC budgets',async()=>{
  const db=new PGlite({extensions:{vector}}),timings={},artifactDir=await mkdtemp(join(tmpdir(),'discord-summary-scale-'));
  console.log('RETENTION_SCALE_ARTIFACTS '+JSON.stringify({directory:artifactDir}));
  try{
    // This historical scale fixture seeds authoritative names directly. Applying
    // 006 first avoids depending on its wall-clock current-week upgrade backfill.
    await db.exec('create role anon;create role authenticated;create role service_role bypassrls;');await apply(db,6);
    const asOf='2026-10-11T21:02:08.697Z';
    await db.query("insert into public.discord_guild_policies(guild_id,revision,paused,discovery_enabled) values($1,1,false,true)",[guild]);
    await db.query("create temporary table scale_sources as select n,('12345678-1234-4234-8234-'||lpad(n::text,12,'0'))::uuid id,(1203562091982600000::bigint+n)::text cid from generate_series(1,216) n");
    await db.query("insert into public.knowledge_sources(id,kind,external_id,title,status) select id,'discord',cid,'Scale source','active' from scale_sources");
    await db.query("insert into public.discord_channels(source_id,channel_id,guild_id,title,enabled,policy_revision,backfill_from) select id,cid,$1,'Scale source',true,1,'2015-01-01'::timestamptz from scale_sources",[guild]);
    await db.query("insert into public.discord_channel_metadata(guild_id,channel_id,channel_type,access_status,eligible,generation) select $1,cid,0,'ready',true,$2 from scale_sources",[guild,generation]);
    await db.query("insert into public.discord_discovery_state(guild_id,policy_revision,generation,state) values($1,1,$2,'{\"phase\":\"complete\"}')",[guild,generation]);
    await db.query("insert into public.discord_sync_state(source_id,last_success_at,status) select id,$1,'succeeded' from scale_sources",[asOf]);
    await db.exec(`create temporary table scale_groups as
      select g,((g-1)%213)+1 source_n,('2024-01-15T12:00:00Z'::timestamptz+((g-1)/213)*interval '1 month') created,
    case when g=1 then 6397 when g=2 then 3000 else (96050/671)+case when g-3<(96050%671) then 1 else 0 end end amount from generate_series(1,673) g
      union all select 673+g,g,'2026-10-01T12:00:00Z'::timestamptz,(1620/22)+case when g-1<(1620%22) then 1 else 0 end from generate_series(1,22) g
      union all select 695+g,129+g,'2026-10-09T12:00:00Z'::timestamptz,(1769/84)+case when g-1<(1769%84) then 1 else 0 end from generate_series(1,84) g;
      create temporary table scale_rows as select row_number() over(order by g.g,rows.n) serial,s.id source_id,s.cid channel_id,g.created from scale_groups g join scale_sources s on s.n=g.source_n cross join lateral generate_series(1,g.amount) rows(n);`);
    await db.query(`with packets as(select serial,source_id,channel_id,created,
      jsonb_build_object('id',(1600000000000000000::bigint+serial)::text,'channel_id',channel_id,'guild_id',$1::text,'timestamp',created,'content',repeat('x',52),'author',jsonb_build_object('id','345678901234567890','username','Scale fixture'),'nonce','') packet from scale_rows)
      insert into public.discord_messages(message_id,source_id,channel_id,guild_id,author_id,created_at,content,embedding_text,payload,content_hash,url,channel_name)
      select (1600000000000000000::bigint+serial)::text,source_id,channel_id,$1,'345678901234567890',created,repeat('x',52),repeat('x',52),
      jsonb_set(packet,'{nonce}',to_jsonb(left(repeat(md5(serial::text),32),955+case when serial<=61620 then 1 else 0 end-octet_length(packet::text)))),
      encode(sha256(convert_to(repeat('x',52),'UTF8')),'hex'),'https://discord.com/channels/'||$1||'/'||channel_id||'/'||(1600000000000000000::bigint+serial)::text,
      (select c.title from public.discord_channels c where c.source_id=packets.source_id) from packets`,[guild]);
    await db.exec('set role service_role');const beginRebuild=performance.now();const rebuild=await rpc(db,'discord_rebuild_memory',{p_guild_id:guild,p_expected_revision:1,p_as_of:asOf});timings.rawRebuildMs=performance.now()-beginRebuild;assert.equal(rebuild.messages,108836);assert.equal((await db.query('select count(*)::int n from public.discord_memory_buckets')).rows[0].n,779);
    await db.exec('reset role');
    await db.exec('analyze public.knowledge_sources;analyze public.discord_channels;analyze public.discord_sync_state;analyze public.discord_messages;analyze public.discord_channel_metadata;analyze public.discord_discovery_state;');await db.exec('set role service_role');
    assert.deepEqual((await db.query('select count(*)::int originals,count(distinct source_id)::int sources,sum(octet_length(embedding_text))::int text_bytes,count(*) filter(where embedding is not null)::int vectors from public.discord_messages')).rows[0],{originals:108836,sources:213,text_bytes:5659472,vectors:0});assert.equal((await db.query('select count(*)::int n from public.discord_channels')).rows[0].n,216);
    assert.deepEqual((await db.query("select count(*)::int raw,count(*) filter(where m.channel_name is distinct from c.title)::int wrong_name from public.discord_messages m join public.discord_channels c on c.source_id=m.source_id where m.created_at>='2026-10-05T04:00:00Z'")).rows[0],{raw:1769,wrong_name:0});
    assert.equal(Number((await db.query('select sum(octet_length(payload::text)) bytes from public.discord_messages')).rows[0].bytes),104000000);
    async function savePlan(filename){const body=(await db.query("select prosrc from pg_proc where pronamespace='public'::regnamespace and proname='discord_summary_manifest'")).rows[0].prosrc.replace(/\bp_guild_id\b/g,'$1::text').replace(/\bp_mode\b/g,'$2::text').replace(/\bp_as_of\b/g,'$3::timestamptz');const output=(await db.query('explain(format json,verbose,costs) '+body,[guild,'bootstrap',asOf])).rows[0]['QUERY PLAN'];await writeFile(join(artifactDir,filename),JSON.stringify(output,null,2)+'\n');return output[0].Plan;}
    const beforePlan=await savePlan('sliced-planning-scale-before-plan.json');await db.exec('reset role');for(const file of files.slice(6))await db.exec(await readFile(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));await db.exec('set role service_role');const afterPlan=await savePlan('sliced-planning-scale-after-plan.json');
    function fullOriginalMaterializations(node){const here=node['Node Type']==='Materialize'&&node['Plan Width']>=1000&&(node.Output??[]).some(expression=>/\bm(?:_\d+)?\.\*/.test(expression));return Number(here)+(node.Plans??[]).reduce((total,child)=>total+fullOriginalMaterializations(child),0);}
    assert.equal(fullOriginalMaterializations(afterPlan),0,'analyzed wide-payload plan must not materialize/replay full originals at an eligible-source join');console.log('PERFORMANCE_007_PLAN '+JSON.stringify({beforeFullOriginalMaterializations:fullOriginalMaterializations(beforePlan),afterFullOriginalMaterializations:fullOriginalMaterializations(afterPlan),payloadBytes:104000000}));
    const store=storeFor(db),options={...plan('bootstrap',asOf),expectedPolicyRevision:1};console.log('RETENTION_ARCHIVE_READY '+JSON.stringify(timings));
    const manifestBody=(await db.query("select prosrc from pg_proc where pronamespace='public'::regnamespace and proname='discord_summary_manifest'")).rows[0].prosrc.replace(/\bp_guild_id\b/g,'$1::text').replace(/\bp_mode\b/g,'$2::text').replace(/\bp_as_of\b/g,'$3::timestamptz');
    const explain=(await db.query('explain(verbose,costs) '+manifestBody,[guild,'bootstrap',asOf])).rows.map(row=>row['QUERY PLAN']).join('\n');await writeFile(join(artifactDir,'sliced-planning-scale-explain.txt'),explain+'\n');
    let start=performance.now();const preview=await store.preview(options);timings.previewMs=performance.now()-start;
    assert.equal(preview.status,'ready',JSON.stringify(store.testErrors));assert.equal(preview.groupCount,695);assert.equal(preview.inputChars,null);assert.equal(preview.segmentCount,null);assert.equal(preview.messageCount,107067);assert.equal(preview.waitingSourceCount,0);assert(timings.previewMs<60000);console.log('RETENTION_PREVIEW '+JSON.stringify(timings));
    start=performance.now();const op=await store.beginOperation(options);timings.beginMs=performance.now()-start;assert.equal(op.status,'ready',JSON.stringify(store.testErrors));assert(timings.beginMs<60000);
    start=performance.now();const retry=await store.beginOperation(options);timings.repeatBeginMs=performance.now()-start;assert.equal(retry.operationId,op.operationId);assert(timings.repeatBeginMs<60000);console.log('RETENTION_PLAN '+JSON.stringify(timings));
    assert.equal(op.operation.planningComplete,false);assert.equal(op.operation.planningTotal,695);assert.equal(op.operation.planningCursor,0);
    const slices=[];let current=op.operation;start=performance.now();
    while(!current.planningComplete){const began=performance.now(),cursor=current.planningCursor;const prepared=await store.prepareOperation({operationId:op.operationId,expectedCursor:cursor});const elapsedMs=performance.now()-began;assert.equal(prepared.status,'ready',JSON.stringify({prepared,errors:store.testErrors}));assert.equal(prepared.operation.planningCursor,cursor+1);assert(elapsedMs<55000,'every period must fit prepare SQL budget');const unit=(await db.query('select j.source_id,j.channel_id,j.channel_name,j.tier,j.period_key,j.represented_message_count from public.discord_summary_operation_jobs oj join public.discord_summary_jobs j on j.id=oj.job_id where oj.operation_id=$1 and oj.ordinal=$2',[op.operationId,cursor+1])).rows[0];assert(unit);slices.push({cursor,elapsedMs,plannedGroups:prepared.plannedGroups,...unit});current=prepared.operation;}
    timings.fullPlanningMs=performance.now()-start;timings.largestPrepareMs=Math.max(...slices.map(row=>row.elapsedMs));timings.finalizationMs=slices.at(-1).elapsedMs;
    assert.equal(slices.length,695);assert.equal(current.totalJobs,695);assert.equal((await db.query('select count(*)::int n from public.discord_summary_requests')).rows[0].n,0);assert.equal((await db.query('select count(*)::int n from public.discord_messages')).rows[0].n,108836);assert.equal((await db.query('select count(*)::int n from public.discord_compaction_ledger')).rows[0].n,0);
    await writeFile(join(artifactDir,'sliced-planning-scale-slices.json'),JSON.stringify({timings,slices},null,2)+'\n');console.log('SLICED_PLANNING_COMPLETE '+JSON.stringify({...timings,preparations:slices.length}));
    const biggest=(await db.query('select id,input_fingerprint,channel_id,source_id from public.discord_summary_jobs order by represented_message_count desc limit 1')).rows[0];start=performance.now();assert.equal(await rpc(db,'discord_summary_current_fingerprint',{p_job_id:biggest.id}),biggest.input_fingerprint);timings.fingerprintMs=performance.now()-start;assert(timings.fingerprintMs<12000);console.log('RETENTION_FINGERPRINT '+JSON.stringify(timings));
    await db.query('update public.discord_summary_operation_jobs set ordinal=ordinal+1000 where operation_id=$1',[op.operationId]);await db.query('update public.discord_summary_operation_jobs set ordinal=1 where operation_id=$1 and job_id=$2',[op.operationId,biggest.id]);
    const measured={...store,finishJob:async args=>{const began=performance.now();const result=await store.finishJob(args);timings.finishMs=performance.now()-began;return result;}};
    const modelCalls=[],result=await run(db,{asOf,operationId:op.operationId,store:measured,provider:modelFor(modelCalls),maxGroups:1,maxRequests:1000});assert.equal(result.status,'partial',JSON.stringify({result,errors:store.testErrors}));assert.equal(result.groups,1);assert.equal(result.processedRecords,6397);assert.equal(result.representedOriginals,6397);assert(timings.finishMs<60000);
    for(const call of modelCalls){assert.equal(call.input.context.channelId,biggest.channel_id);assert.equal(call.input.context.channelName,'Scale source');assert.equal(call.input.context.sourceId,biggest.source_id);}
    await noTempFor(db,[biggest.id]);assert.equal((await db.query('select count(*)::int n from public.discord_messages')).rows[0].n,102439);
    assert.equal((await db.query('select count(*)::int n from public.discord_memory_buckets b where message_count<>(select count(*) from public.discord_memory_members m where m.bucket_id=b.id)')).rows[0].n,0);
    assert.equal((await db.query('select count(*)::int n from public.discord_compaction_ledger where active')).rows[0].n,1);assert.equal(Number((await db.query('select represented_message_count from public.discord_summary_certificates')).rows[0].represented_message_count),6397);
    console.log('RETENTION_SCALE '+JSON.stringify({...timings,originals:108836,payloadBytes:104000000,eligibleSources:216,nonemptySources:213,currentWeekRaw:1769,rawGroups:779,retentionJobs:695,publishedOriginals:6397,requests:result.requests,mapParts:result.mapParts,reduceParts:result.reduceParts}));
  }finally{await db.close();}
});
