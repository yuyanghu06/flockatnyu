import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,readdir} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {vector} from '@electric-sql/pglite-pgvector';
import {createDiscordSummaryStore} from '../server/discord/summary-store.js';
import {readDiscordSummaryConfig} from '../server/discord/summary-config.js';
import {SUMMARY_FIELDS} from '../server/discord/summary-provider.js';
import {runDiscordSummaries,runDiscordSummaryBackfill,discordSummaryChunks} from '../server/discord/summaries.js';
import {normalizeMessage} from '../server/discord/sync.js';

// Supersedes the prior daily/forever-original SQL fixture. Baseline191 evidence
// remains under its original report/log names. Only verified retention is tested.
const files=['202610120001_knowledge.sql','202610120002_discord_archive.sql','202610120003_discord_discovery_memory.sql','202610120004_discord_memory_rebuild_performance.sql','202610120005_discord_memory_runtime_budget.sql','202610120006_discord_memory_summaries.sql','202610120007_discord_summary_planning_performance.sql','202610120008_discord_summary_planning_budget.sql'];
const guild='1203562091500404776',otherGuild='123456789012345678',channel='1203562091982622814',secondChannel='1203562091982622815';
const sources=['22222222-2222-4222-8222-222222222222','44444444-4444-4444-8444-444444444444','55555555-5555-4555-8555-555555555555'];
const admin='11111111-1111-4111-8111-111111111111',reader='33333333-3333-4333-8333-333333333333',generation='66666666-6666-4666-8666-666666666666';
const firstAsOf='2025-10-12T12:00:00Z',nextAsOf='2025-10-20T12:00:00Z',closeAsOf='2025-11-01T12:00:00Z',tailAsOf='2025-11-03T13:00:00Z';
const cfg=readDiscordSummaryConfig({LLM_PROVIDER:'openai-compatible',LLM_MODEL:'gpt-6-luna',LLM_API_KEY:'fixture-private',DISCORD_GUILD_ID:guild});
const summary=ids=>Object.fromEntries(SUMMARY_FIELDS.map(field=>[field,field==='overview'?[{text:'Supported fixture facts, with stated uncertainty.',messageIds:ids.slice(0,Math.min(3,ids.length))}]:[]]));
async function apply(db,count=9){if(count>8&&files.length===8){const names=(await readdir(new URL('../supabase/migrations/',import.meta.url))).filter(name=>/^202610120009_.*\.sql$/.test(name));assert.equal(names.length,1,'exactly one009 migration must be handed off');files.push(names[0]);}for(const file of files.slice(0,count))await db.exec(await readFile(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));}
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
async function expectDeniedWithoutChanges(db,args,mutation,expected='stale'){
  await db.exec('begin');try{
    await mutation();const before=await snapshot(db);await db.exec('savepoint deny_publication');
    assert.equal((await storeFor(db).finishJob(args)).status,expected);
    await db.exec('rollback to savepoint deny_publication');assert.deepEqual(await snapshot(db),before);
  }finally{await db.exec('rollback');}
}


async function drainPlanning(store,operationId){let result=await store.getOperation({operationId});assert.equal(result.status,'ready');for(let step=0;result.operation.planningComplete===false&&step<1000;step++){result=await store.prepareOperation({operationId,expectedCursor:result.operation.planningCursor});assert.equal(result.status,'ready');}assert.equal(result.operation.planningComplete,true);return result.operation;}
export {PGlite,vector,readFile,createHash,randomUUID,files,guild,otherGuild,channel,secondChannel,sources,admin,reader,firstAsOf,nextAsOf,closeAsOf,tailAsOf,cfg,summary,apply,rpc,storeFor,modelFor,addSource,insertOriginal,seed,plan,snapshot,run,noTempFor,drainPlanning};
