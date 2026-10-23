import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {vector} from '@electric-sql/pglite-pgvector';
import {classifyDiscordTimestamp} from './fixtures/legacy-memory.mjs';
import {normalizeMessage,snowflakeBefore} from './fixtures/legacy-message.mjs';
import {createDiscordStore} from '../server/discord/store.js';

const admin='11111111-1111-4111-8111-111111111111',reader='33333333-3333-4333-8333-333333333333',foreignReader='44444444-4444-4444-8444-444444444444';
const guildId='1203562091500404776',otherGuild='123456789012345678',channelId='1203562091982622814',secondChannel='1403562091982622814',categoryId='1461311169586266165';
const generation='55555555-5555-4555-8555-555555555555';
const asOf='2026-10-10T16:00:00.000Z';
const policyInput={paused:false,discovery_enabled:true,excluded_category_ids:[categoryId],excluded_channel_ids:['1203562091982622819'],backfill_from:'2015-01-01T00:00:00Z'};

test('active catalogue policy failures remain sanitized',async()=>{
  const source='22222222-2222-4222-8222-222222222222',bucket='88888888-8888-4888-8888-888888888888';
  const calls=[],principal={id:reader,allowedSourceIds:[source]};
  const store=createDiscordStore({env:{SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'fixture-private-role'},fetchImpl:async(url,options)=>{
    calls.push({url,body:JSON.parse(options.body)});throw new Error('fixture-private-role malicious-body');
  }});
  const failure=await store.getPolicy({guildId});assert.equal(failure.status,'unavailable');assert.equal(calls.length,1);assert(calls[0].url.endsWith('/discord_get_policy'));assert(!JSON.stringify(failure).includes('fixture-private-role'));assert(!JSON.stringify(failure).includes('malicious-body'));
});
function original(createdAt,idOffset=1,cid=channelId,gid=guildId,extra={}){
  const id=(BigInt(snowflakeBefore(createdAt))+BigInt(idOffset)).toString();
  const raw={id,channel_id:cid,guild_id:gid,author:{id:'345678901234567890',username:'Fixture'},timestamp:createdAt,content:'Original fixture text',...extra};
  const m=normalizeMessage(raw,{channelId:cid,guildId:gid});
  return {message_id:m.messageId,channel_id:cid,guild_id:gid,author_id:m.authorId,created_at:m.createdAt,edited_at:m.editedAt,reply_to_message_id:m.replyToMessageId,content:m.content,embedding_text:m.embeddingText,payload:m.payload,content_hash:m.contentHash,url:m.url};
}

test('local PostgreSQL enforces discovery generations, original memory membership, access and scoped reset',async t=>{
  const db=new PGlite({extensions:{vector}});
  try{
    await db.exec('create role anon;create role authenticated;create role service_role bypassrls;');
    for(const file of ['202610120001_knowledge.sql','202610120002_discord_archive.sql','202610120003_discord_discovery_memory.sql','202610120004_discord_memory_rebuild_performance.sql'])await db.exec(await readFile(new URL(`../supabase/migrations/${file}`,import.meta.url),'utf8'));
    const functionSnapshot=async()=>(await db.query("select proname,prosrc,proacl,prosecdef,proconfig from pg_proc where pronamespace='public'::regnamespace and (proname like 'discord_%' or proname like 'knowledge_%') order by proname")).rows;
    const roleSnapshot=async()=>(await db.query("select rolname,rolconfig from pg_roles where rolname in ('anon','authenticated','service_role') order by rolname")).rows;
    const sessionBudget=async()=>(await db.query("select current_setting('statement_timeout') timeout,current_setting('work_mem') memory")).rows[0];
    const beforeFunctions=await functionSnapshot(),beforeRoles=await roleSnapshot(),beforeSessionBudget=await sessionBudget();
    await db.exec(await readFile(new URL('../supabase/migrations/202610120005_discord_memory_runtime_budget.sql',import.meta.url),'utf8'));
    await db.query('insert into public.discord_admin_members(member_id) values ($1)',[admin]);await db.exec('set role service_role');
    const configurePolicy=async(input=policyInput,expected=null,member=admin)=>(await db.query('select public.discord_configure_policy($1,$2,$3::jsonb,$4::bigint) policy',[member,guildId,JSON.stringify(input),expected])).rows[0].policy;
    const configureChannel=async(cid,gid=guildId)=>(await db.query('select public.discord_configure_channel($1,$2::jsonb) channel',[admin,JSON.stringify({channel_id:cid,guild_id:gid,title:'Fixture channel',enabled:true,backfill_from:'2015-01-01T00:00:00Z'})])).rows[0].channel;
    const persistDiscovery=async(channels,state,previous=null,expectedRevision=1)=>(await db.query('select public.discord_persist_discovery($1,$2,$3::uuid,$4::jsonb,$5::jsonb,$6::jsonb) saved',[guildId,expectedRevision,previous?.generation??null,previous ? JSON.stringify(previous) : null,JSON.stringify(channels),JSON.stringify(state)])).rows[0].saved;
    const metadata=(cid=channelId,extra={})=>({guildId,channelId:cid,parentId:null,type:0,title:'Fixture channel',eligible:true,accessStatus:'ready',...extra});
    const state1={generation,policyRevision:1,phase:'channels'};
    const state2={...state1,phase:'archives'};
    let firstSource,secondSource,unseenSource,unrelatedSource,initialMessages;
    const persist=async(source,messages,expectedRevision=1)=>{
      const old=(await db.query('select * from public.discord_sync_state where source_id=$1',[source])).rows[0];
      const state={last_success_at:asOf,status:'succeeded',window_from:null,window_to:null,before_cursor:null,expected_before:old?.before_cursor??null,expected_window_to:old?.window_to??null,expected_last_success_at:old?.last_success_at??null,expected_policy_revision:expectedRevision};
      return (await db.query('select public.discord_persist_page($1,$2::jsonb,$3::jsonb) saved',[source,JSON.stringify(messages),JSON.stringify(state)])).rows[0].saved;
    };
    const rebuild=async(expected=1,time=asOf)=>(await db.query('select public.discord_rebuild_memory($1,$2,$3::timestamptz) result',[guildId,expected,time])).rows[0].result;
    const list=async(member=reader,sources=[firstSource],tier=null,after=null,limit=20)=>(await db.query('select * from public.discord_memory_list($1,$2::uuid[],$3,$4::uuid,$5)',[member,sources,tier,after,limit])).rows;
    const page=async(bucket,member=reader,sources=[firstSource],after=null,limit=50)=>(await db.query('select * from public.discord_memory_page($1,$2::uuid[],$3::uuid,$4,$5)',[member,sources,bucket,after,limit])).rows;

    await t.test('all five migrations execute with forced RLS and no browser access to new tables/RPCs',async()=>{
      const result=(await db.query("select count(*)::int n,count(*) filter(where not relrowsecurity or not relforcerowsecurity)::int unprotected,count(*) filter(where has_table_privilege('anon',oid,'SELECT') or has_table_privilege('authenticated',oid,'SELECT'))::int browser from pg_class where relname in ('discord_guild_policies','discord_channel_metadata','discord_discovery_state','discord_memory_buckets','discord_memory_members')")).rows[0];
      assert.deepEqual(result,{n:5,unprotected:0,browser:0});
      const rpc=(await db.query("select count(*) filter(where prosecdef or has_function_privilege('anon',oid,'EXECUTE') or has_function_privilege('authenticated',oid,'EXECUTE') or not has_function_privilege('service_role',oid,'EXECUTE'))::int invalid from pg_proc where proname in ('discord_configure_policy','discord_reset_archive','discord_memory_list','discord_memory_page','discord_persist_discovery','discord_complete_discovery')")).rows[0];assert.equal(rpc.invalid,0);
    });

    await t.test('runtime budget changes only rebuild function settings and preserves body, access, other RPCs and session defaults',async()=>{
      const afterFunctions=await functionSnapshot();
      assert.deepEqual(afterFunctions.filter(f=>f.proname!=='discord_rebuild_memory'),beforeFunctions.filter(f=>f.proname!=='discord_rebuild_memory'));
      const before=beforeFunctions.find(f=>f.proname==='discord_rebuild_memory'),after=afterFunctions.find(f=>f.proname==='discord_rebuild_memory');
      assert.equal(after.prosrc,before.prosrc);assert.deepEqual(after.proacl,before.proacl);assert.equal(after.prosecdef,false);
      assert(after.proconfig.includes('statement_timeout=60s'));assert(after.proconfig.includes('work_mem=16MB'));
      assert.deepEqual(after.proconfig.filter(c=>!c.startsWith('statement_timeout=')&&!c.startsWith('work_mem=')),before.proconfig);
      assert.deepEqual(await roleSnapshot(),beforeRoles);assert.deepEqual(await sessionBudget(),beforeSessionBudget);
    });

    await t.test('policy configuration requires admin and an optimistic revision; no read grants are created',async()=>{
      await assert.rejects(configurePolicy(policyInput,null,reader),/Admin access denied/);
      assert.equal((await configurePolicy()).revision,1);
      await assert.rejects(configurePolicy(),/Stale policy/);
      assert.equal((await db.query('select count(*)::int n from public.knowledge_source_members')).rows[0].n,0);
    });

    await t.test('incomplete inventory retains unseen sources; completion alone reconciles absent channels',async()=>{
      unseenSource=(await configureChannel('1303562091982622814')).source_id;
      assert.equal(await persistDiscovery([metadata(channelId),metadata(secondChannel),metadata(categoryId,{type:4,eligible:false,accessStatus:'metadata'})],state1),true);
      const sources=(await db.query('select channel_id,source_id from public.discord_channels where guild_id=$1',[guildId])).rows;
      firstSource=sources.find(c=>c.channel_id===channelId).source_id;secondSource=sources.find(c=>c.channel_id===secondChannel).source_id;
      assert.equal((await db.query('select enabled from public.discord_channels where source_id=$1',[unseenSource])).rows[0].enabled,true);
      assert.equal(await persistDiscovery([],state2,{...state1,phase:'wrong'}),false);
      assert.equal(await persistDiscovery([],state2,state1),true);
      const complete={...state2,phase:'complete'};
      assert.equal((await db.query('select public.discord_complete_discovery($1,$2::uuid,$3,$4::jsonb,$5::jsonb) saved',[guildId,generation,1,JSON.stringify(state2),JSON.stringify(complete)])).rows[0].saved,true);
      assert.equal((await db.query('select enabled from public.discord_channels where source_id=$1',[unseenSource])).rows[0].enabled,false);
      assert.equal((await db.query('select count(*)::int n from public.knowledge_source_members')).rows[0].n,0);
    });

    await t.test('image-bearing direct payloads are scrubbed but original text and PDF links remain; policy guild cannot save embeddings',async()=>{
      const m=original('2026-10-09T10:00:00Z');
      m.payload={...m.payload,author:{...m.payload.author,avatar:'image-avatar'},mentions:[{id:'456789012345678901',avatar:'image-mention'}],attachments:[{filename:'image-photo.png',content_type:'image/png',url:'https://example.com/image-photo.png'},{filename:'agenda.pdf',content_type:'application/pdf',url:'https://example.com/agenda.pdf'}],embeds:[{type:'rich',title:'Fixture rich title',image:{url:'https://example.com/image-main'},thumbnail:{url:'https://example.com/image-thumb'},provider:{name:'Fixture provider',icon_url:'https://example.com/image-provider'}}]};
      m.payload.components=[{type:17,components:[{type:10,content:'Component text https://example.com/resources'},{type:12,items:[{media:{url:'https://example.com/image-gallery.png'}}]},{type:9,components:[{type:10,content:'Section text'}],accessory:{type:11,media:{url:'https://example.com/image-thumbnail.png'}}},{type:13,file:{url:'https://example.com/image-file.png'}},{type:13,file:{url:'https://example.com/agenda.pdf'}}]}];
      m.payload.attachments.push({filename:'download',url:'https://example.com/image-opaque.PNG'});
      assert.equal(await persist(firstSource,[m]),true);
      const row=(await db.query('select payload,content,embedding,content_hash,embedding_text from public.discord_messages where message_id=$1',[m.message_id])).rows[0];
      assert(!JSON.stringify(row.payload).includes('image-'));assert.equal(row.payload.attachments.length,1);assert.equal(row.payload.attachments[0].filename,'agenda.pdf');assert.equal(row.content,m.content);assert.equal(row.embedding,null);
      assert(JSON.stringify(row.payload.components).includes('Component text'));assert(JSON.stringify(row.payload.components).includes('Section text'));assert(JSON.stringify(row.payload.components).includes('agenda.pdf'));
      const normalized=normalizeMessage(m.payload,{channelId,guildId});assert.equal(row.embedding_text,normalized.embeddingText);assert.equal(row.content_hash,normalized.contentHash);
      assert.equal(await persist(firstSource,[m]),true);assert.equal((await db.query('select count(*)::int n from public.discord_message_revisions')).rows[0].n,0);
      const saved=(await db.query('select public.discord_save_embedding($1,$2,$3,$4,$5::extensions.vector) saved',[m.message_id,m.content_hash,'fixture-model','fixture-provider',JSON.stringify(Array(1536).fill(0))])).rows[0].saved;assert.equal(saved,false);
      assert.equal((await db.query("select * from public.discord_embedding_work(16,'fixture-model','fixture-provider')")).rows.length,0);
    });

    await t.test('database hierarchy rejects excluded, malformed, cyclic and stale-generation ancestors',async()=>{
      await db.exec('begin');
      try{
        const cid='1503562091982622814',parent='1503562091982622815';
        const add=async(id,parentId,type,gen=generation)=>db.query('insert into public.discord_channel_metadata(guild_id,channel_id,parent_id,channel_type,access_status,eligible,generation) values($1,$2,$3,$4,$5,true,$6::uuid) on conflict(guild_id,channel_id) do update set parent_id=excluded.parent_id,channel_type=excluded.channel_type,generation=excluded.generation',[guildId,id,parentId,type,type===4?'metadata':'ready',gen]);
        const allowed=async()=> (await db.query('select public.discord_channel_allowed($1,$2) allowed',[guildId,cid])).rows[0].allowed;
        await add(cid,categoryId,0);assert.equal(await allowed(),false);
        await add(cid,parent,0);await add(parent,null,0);assert.equal(await allowed(),false,'normal channel cannot descend from normal channel');
        await add(cid,parent,11);assert.equal(await allowed(),true,'valid thread under text parent');
        await add(parent,null,0,'66666666-6666-4666-8666-666666666666');assert.equal(await allowed(),false,'ancestor must belong to current generation');
        await add(parent,cid,0);assert.equal(await allowed(),false,'cyclic ancestry denied');
      }finally{await db.exec('rollback');}
    });

    await t.test('SQL memory periods independently match elapsed cutoff, month/week clipping and both DST boundaries',async()=>{
      for(const [created,now] of [['2026-09-28T16:00:00Z','2026-10-05T16:00:00Z'],['2026-09-28T15:59:59.999Z','2026-10-05T16:00:00Z'],['2026-03-08T06:00:00Z','2026-03-10T16:00:00Z'],['2026-11-01T06:30:00Z','2026-11-03T17:00:00Z'],['2026-10-01T12:00:00Z','2026-10-20T16:00:00Z'],['2026-10-13T15:59:59.999Z','2026-10-20T16:00:00Z']]){
        const row=(await db.query('select * from public.discord_memory_period($1::timestamptz,$2::timestamptz)',[created,now])).rows[0];
        const expected=classifyDiscordTimestamp(created,{now});assert.deepEqual({tier:row.tier,periodStart:new Date(row.period_start).toISOString(),periodEnd:new Date(row.period_end).toISOString(),timezone:'America/New_York'},expected);
      }
    });


    await t.test('optimized actual rebuild preserves cutoff, month clipping and 23/25-hour New York day periods',async()=>{
      await db.exec('begin');
      try{
        for(const [created,now] of [
          ['2026-09-28T16:00:00Z','2026-10-05T16:00:00Z'],
          ['2026-09-28T15:59:59.999Z','2026-10-05T16:00:00Z'],
          ['2026-03-08T06:00:00Z','2026-03-10T16:00:00Z'],
          ['2025-11-02T06:30:00Z','2025-11-04T17:00:00Z'],
          ['2025-10-01T12:00:00Z','2025-10-20T16:00:00Z'],
          ['2025-10-13T15:59:59.999Z','2025-10-20T16:00:00Z'],
        ]){
          const m=original(created,100);
          assert.equal(await persist(firstSource,[m]),true);
          await rebuild(1,now);
          const row=(await db.query('select b.tier,b.period_start,b.period_end,b.timezone from public.discord_memory_members mm join public.discord_memory_buckets b on b.id=mm.bucket_id where mm.message_id=$1',[m.message_id])).rows[0];
          assert(row);
          assert.deepEqual({tier:row.tier,periodStart:new Date(row.period_start).toISOString(),periodEnd:new Date(row.period_end).toISOString(),timezone:row.timezone},classifyDiscordTimestamp(created,{now}));
        }
      }finally{await db.exec('rollback');}
    });


    await t.test('repeated grouping gives every original exactly one tier without merging permission scopes or generating summaries',async()=>{
      initialMessages=[original('2026-09-20T12:00:00Z'),original('2026-10-01T12:00:00Z'),original('2026-10-03T15:59:59.999Z'),original('2026-10-03T16:00:00Z'),original('2026-10-09T12:00:00Z'),original('2026-10-09T13:00:00Z'),original('2026-10-10T12:00:00Z')];
      assert.equal(await persist(firstSource,initialMessages),true);assert.equal(await persist(secondSource,[original('2026-10-09T12:00:00Z',2,secondChannel)]),true);
      const result=await rebuild();assert.equal(result.messages,9);
      const memberships=(await db.query('select message_id,source_id from public.discord_memory_members order by message_id')).rows;
      assert.equal(memberships.length,9);assert.equal(new Set(memberships.map(m=>m.message_id)).size,9);
      await rebuild();assert.deepEqual((await db.query('select message_id,source_id from public.discord_memory_members order by message_id')).rows,memberships);
      const mismatch=(await db.query('select count(*)::int n from public.discord_memory_members mm join public.discord_memory_buckets b on b.id=mm.bucket_id where mm.source_id<>b.source_id')).rows[0];assert.equal(mismatch.n,0);
      assert.equal((await db.query('select count(*)::int n from public.knowledge_daily_summaries')).rows[0].n,0);assert.equal((await db.query('select count(*)::int n from public.discord_messages where embedding is not null')).rows[0].n,0);
      const sample=(await db.query('select m.created_at,b.tier from public.discord_memory_members mm join public.discord_memory_buckets b on b.id=mm.bucket_id join public.discord_messages m on m.message_id=mm.message_id where m.source_id=$1',[firstSource])).rows;
      for(const row of sample)assert.equal(row.tier,classifyDiscordTimestamp(row.created_at,{now:asOf}).tier);
    });

    await t.test('group and original-page retrieval require both database grants and trusted scope with stable bounded pagination',async()=>{
      assert.equal((await list()).length,0);
      await db.query('insert into public.knowledge_source_members(source_id,member_id,can_read) values($1,$2,true)',[firstSource,reader]);
      assert.equal((await list(reader,[])).length,0);assert.equal((await list(foreignReader)).length,0);assert.equal((await list(reader,[secondSource])).length,0);
      const all=await list(), paged=[];let after=null;
      for(let i=0;i<20;i++){const batch=await list(reader,[firstSource],null,after,1);if(!batch.length)break;paged.push(...batch);after=batch.at(-1).id;}
      assert.equal(paged.length,all.length);assert.equal(new Set(paged.map(b=>b.id)).size,all.length);
      const bucket=all.find(b=>b.tier==='daily'&&Number(b.message_count)>1);assert(bucket);
      assert.equal((await page(bucket.id,reader,[secondSource])).length,0);assert.equal((await page(bucket.id,foreignReader)).length,0);
      const originals=[],expected=await page(bucket.id);let cursor=null;
      for(let i=0;i<10;i++){const batch=await page(bucket.id,reader,[firstSource],cursor,1);if(!batch.length)break;originals.push(...batch);cursor=batch.at(-1).message_id;}
      assert.deepEqual(originals.map(m=>m.message_id),expected.map(m=>m.message_id));assert.equal(new Set(originals.map(m=>m.message_id)).size,expected.length);
      for(const m of originals)assert.equal(m.url,`https://discord.com/channels/${guildId}/${channelId}/${m.message_id}`);
    });

    await t.test('policy pause/revision invalidates published groups and rejects stale messages/discovery/reset races',async()=>{
      await assert.rejects(db.query('select public.discord_reset_archive($1,$2,$3)',[admin,guildId,1]),/paused current policy/);
      const count=(await db.query('select count(*)::int n from public.discord_messages')).rows[0].n;
      assert.equal((await configurePolicy({...policyInput,paused:true},1)).revision,2);
      assert.equal((await list()).length,0);assert.equal(await persist(firstSource,[original('2026-10-10T13:00:00Z')],1),false);
      assert.equal(await persistDiscovery([],state2,null,1),false);await assert.rejects(rebuild(1),/Stale policy/);
      await assert.rejects(db.query('select public.discord_reset_archive($1,$2,$3)',[admin,guildId,1]),/paused current policy/);
      assert.equal((await db.query('select count(*)::int n from public.discord_messages')).rows[0].n,count);
    });

    await t.test('paused metadata preview can checkpoint and complete without making its sources readable or writable',async()=>{
      const preview={generation:'77777777-7777-4777-8777-777777777777',policyRevision:2,phase:'archives'};
      assert.equal(await persistDiscovery([metadata(channelId),metadata(secondChannel),metadata(categoryId,{type:4,eligible:false,accessStatus:'metadata'})],preview,null,2),true);
      assert.equal((await db.query('select public.discord_complete_discovery($1,$2::uuid,$3,$4::jsonb,$5::jsonb) saved',[guildId,preview.generation,2,JSON.stringify(preview),JSON.stringify({...preview,phase:'complete'})])).rows[0].saved,true);
      assert.equal((await db.query('select * from public.discord_sync_channels()')).rows.length,0);
      assert.equal((await list()).length,0);assert.equal(await persist(firstSource,[original('2026-10-10T13:00:00Z')],2),false);
    });

    await t.test('paused scoped reset deletes target archive/checkpoints but preserves admin, policy, configuration, ACL and unrelated knowledge',async()=>{
      unrelatedSource=(await configureChannel('234567890123456789',otherGuild)).source_id;
      assert.equal(await persist(unrelatedSource,[original('2026-09-20T12:00:00Z',3,'234567890123456789',otherGuild)]),true);
      const manualSource=(await db.query("insert into public.knowledge_sources(kind,external_id,title,status) values('manual','fixture','Unrelated fixture','active') returning id")).rows[0].id;
      await db.query("insert into public.knowledge_documents(source_id,external_id,source_version,title,url,original_text,source_updated_at) values($1,'fixture','v1','Fixture','https://example.com/fixture','Unrelated fixture',now())",[manualSource]);
      const baseline=(await db.query('select count(*)::int channels from public.discord_channels')).rows[0].channels;
      await assert.rejects(db.query('select public.discord_reset_archive($1,$2,$3)',[reader,guildId,2]),/Admin access denied/);
      const reset=(await db.query('select public.discord_reset_archive($1,$2,$3) result',[admin,guildId,2])).rows[0].result;assert.equal(reset.deleted_messages,9);
      assert.equal((await db.query('select count(*)::int n from public.discord_messages where guild_id=$1',[guildId])).rows[0].n,0);
      assert.equal((await db.query('select count(*)::int n from public.discord_sync_state st join public.discord_channels c on c.source_id=st.source_id where c.guild_id=$1',[guildId])).rows[0].n,0);
      assert.equal((await db.query('select count(*)::int n from public.discord_messages where guild_id=$1',[otherGuild])).rows[0].n,1);
      assert.equal((await db.query('select count(*)::int n from public.knowledge_documents where source_id=$1',[manualSource])).rows[0].n,1);
      assert.equal((await db.query('select count(*)::int channels from public.discord_channels')).rows[0].channels,baseline);
      assert.equal((await db.query('select count(*)::int n from public.discord_admin_members')).rows[0].n,1);
      const policy=(await db.query('select revision,paused,excluded_category_ids,excluded_channel_ids from public.discord_guild_policies where guild_id=$1',[guildId])).rows[0];
      assert.equal(policy.revision,3);assert.equal(policy.paused,true);assert.deepEqual(policy.excluded_category_ids,[categoryId]);assert.deepEqual(policy.excluded_channel_ids,policyInput.excluded_channel_ids);
      assert.equal((await db.query('select public.discord_get_discovery_state($1) state',[guildId])).rows[0].state,null);
      assert.equal(await persist(firstSource,[original('2026-10-10T13:00:00Z')],2),false);
      assert.equal((await db.query('select count(*)::int n from public.knowledge_source_members')).rows[0].n,1);
      assert.equal((await db.query('select count(*)::int n from public.discord_channel_metadata')).rows[0].n,3);
    });
  }finally{await db.close();}
});


test('representative 108828-original rebuild stays bounded, excludes malformed scopes and preserves one original per group',async t=>{
  const db=new PGlite({extensions:{vector}});
  try{
    await db.exec('create role anon;create role authenticated;create role service_role bypassrls;');
    for(const file of ['202610120001_knowledge.sql','202610120002_discord_archive.sql','202610120003_discord_discovery_memory.sql','202610120004_discord_memory_rebuild_performance.sql','202610120005_discord_memory_runtime_budget.sql'])await db.exec(await readFile(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
    await db.exec(`
      insert into public.discord_guild_policies(guild_id,revision,paused,discovery_enabled)
      values('${guildId}',1,false,true);
      insert into public.knowledge_sources(id,kind,external_id,title,status)
      select md5('scale-source-'||i)::uuid,'discord',('1700000000000000000'::bigint+i)::text,'Scale fixture','active' from generate_series(1,217) i;
      insert into public.discord_channels(source_id,channel_id,guild_id,title,enabled,policy_revision)
      select id,external_id,'${guildId}','Scale fixture',true,1 from public.knowledge_sources;
      insert into public.discord_channel_metadata(guild_id,channel_id,parent_id,channel_type,access_status,eligible,generation)
      select '${guildId}',channel_id,null,0,case when channel_id='1700000000000000217' then 'permission_denied' else 'ready' end,
      channel_id<>'1700000000000000217','${generation}' from public.discord_channels;
      insert into public.discord_discovery_state(guild_id,policy_revision,generation,state)
      values('${guildId}',1,'${generation}','{"phase":"complete"}'::jsonb);
      with fixture as (
        select i,case when i<=50000 then 1 when i<=75000 then 2 else 3+(i-75001)%214 end source_index,
        case when i%10=0 then '${asOf}'::timestamptz-(i%10000+1)*interval '1 minute'
          when i%10=1 then '2026-10-01T04:00:00Z'::timestamptz+(i%48)*interval '1 hour'
          else '2024-02-04T18:53:18Z'::timestamptz+(i%50000)*interval '10 minutes' end created
        from generate_series(1,108828) i
      ), identities as (
        select *,((((extract(epoch from created)*1000)::bigint-1420070400000)<<22)+i)::text mid,
          ('1700000000000000000'::bigint+source_index)::text cid
        from fixture
      )
      insert into public.discord_messages(message_id,source_id,channel_id,guild_id,author_id,created_at,content,embedding_text,payload,content_hash,url)
      select mid,md5('scale-source-'||source_index)::uuid,cid,'${guildId}','345678901234567890',created,
        'Scale fixture original','Scale fixture original',jsonb_build_object('id',mid,'channel_id',cid,'guild_id','${guildId}',
        'author',jsonb_build_object('id','345678901234567890'),'timestamp',created,'content','Scale fixture original'),
        encode(sha256(convert_to('Scale fixture original','UTF8')),'hex'),
        'https://discord.com/channels/${guildId}/'||cid||'/'||mid from identities;
      insert into public.discord_messages(message_id,source_id,channel_id,guild_id,author_id,created_at,content,embedding_text,payload,content_hash,url)
      select (1800000000000000000+i)::text,md5('scale-source-'||case when i=3 then 217 else 1 end)::uuid,
        case when i=2 then '1700000000000000002' when i=3 then '1700000000000000217' else '1700000000000000001' end,
        case when i=1 then '${otherGuild}' else '${guildId}' end,'345678901234567890','2026-10-09T12:00:00Z',
        'Out of scope fixture','Out of scope fixture','{}',encode(sha256(convert_to('Out of scope fixture','UTF8')),'hex'),
        'https://discord.com/channels/${guildId}/1700000000000000001/'||(1800000000000000000+i)::text
      from generate_series(1,3) i;
      set role service_role;
    `);
    const rebuild=async()=>{
      const started=performance.now();
      const result=(await db.query('select public.discord_rebuild_memory($1,1,$2::timestamptz) result',[guildId,asOf])).rows[0].result;
      const elapsedMs=performance.now()-started;
      t.diagnostic('108828-original/216-source rebuild: '+elapsedMs.toFixed(1)+' ms, '+result.buckets+' groups');
      assert(elapsedMs<15000,'representative local rebuild must finish within 15 seconds; observed '+elapsedMs.toFixed(1)+' ms');
      assert.equal(result.messages,108828);
      return result;
    };
    const initialSessionBudget=(await db.query("select current_setting('work_mem') memory,current_setting('statement_timeout') timeout")).rows[0];
    const first=await rebuild();
    const invariants=(await db.query(`
      select count(*)::int memberships,count(distinct mm.message_id)::int unique_originals,
      count(*) filter(where mm.source_id<>b.source_id or mm.source_id<>m.source_id)::int scope_mismatches,
      count(*) filter(where m.guild_id<>'${guildId}' or m.channel_id<>c.channel_id)::int malformed_scope_members,
      count(*) filter(where m.created_at<b.period_start or m.created_at>=b.period_end)::int invalid_period_members
      from public.discord_memory_members mm join public.discord_memory_buckets b on b.id=mm.bucket_id
      join public.discord_messages m on m.message_id=mm.message_id join public.discord_channels c on c.source_id=mm.source_id
    `)).rows[0];
    assert.deepEqual(invariants,{memberships:108828,unique_originals:108828,scope_mismatches:0,malformed_scope_members:0,invalid_period_members:0});
    const tiers=(await db.query('select tier,sum(message_count)::int originals from public.discord_memory_buckets group by tier order by tier')).rows;
    assert.deepEqual(tiers,[{tier:'daily',originals:10882},{tier:'monthly',originals:87063},{tier:'weekly',originals:10883}]);
    assert.equal((await db.query('select count(*)::int n from public.discord_memory_buckets b where b.message_count<>(select count(*) from public.discord_memory_members mm where mm.bucket_id=b.id)')).rows[0].n,0);
    assert.equal((await db.query("select count(*)::int n from public.discord_memory_members where message_id in ('1800000000000000001','1800000000000000002','1800000000000000003')")).rows[0].n,0);
    const before=(await db.query('select source_id,tier,period_start,period_end,message_count from public.discord_memory_buckets order by source_id,tier,period_start')).rows;
    assert.equal((await rebuild()).buckets,first.buckets);
    assert.deepEqual((await db.query('select source_id,tier,period_start,period_end,message_count from public.discord_memory_buckets order by source_id,tier,period_start')).rows,before);
    assert.equal((await db.query('select count(*)::int n from public.discord_messages')).rows[0].n,108831);
    assert.equal((await db.query('select count(*)::int n from public.knowledge_source_members')).rows[0].n,0);
    assert.equal((await db.query('select count(*)::int n from public.discord_messages where embedding is not null')).rows[0].n,0);
    assert.equal((await db.query('select count(*)::int n from public.knowledge_daily_summaries')).rows[0].n,0);
    await assert.rejects(db.query('select public.discord_rebuild_memory($1,2,$2::timestamptz)',[guildId,asOf]),/Stale policy/);
    assert.equal((await db.query('select count(*)::int n from public.discord_memory_members')).rows[0].n,108828);
    assert.deepEqual((await db.query("select current_setting('work_mem') memory,current_setting('statement_timeout') timeout")).rows[0],initialSessionBudget);
  }finally{await db.close();}
});
