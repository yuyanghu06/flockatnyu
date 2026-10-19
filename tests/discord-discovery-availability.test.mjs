import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, readdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {vector} from '@electric-sql/pglite-pgvector';
import {createDiscordStore} from '../server/discord/store.js';
import {runDiscordDiscovery} from '../server/discord/discovery.js';
import {createDiscordChatAccess} from '../server/discord/chat-access.js';
import {createLiveDiscordRetrieval} from '../server/discord/live-retrieval.js';
import {EBOARD_CATEGORY_ID, LEADERSHIP_CHANNEL_ID} from '../server/discord/channel-scope.js';

const guildId = '1203562091500404776', incompleteGuild = '1203562091500404777', userId = '300';
const ids = {announcements:'101', chat:'102', manual:'103', excluded:'104', general:'105', thread:'106', blockedCategory:'200'};
const permissions = String(1024n | 65536n | 2048n | (1n << 38n));
const bodySentinel = 'EPHEMERAL_SOURCE_BODY_035';
const config = {configured:true, guildId};

async function migration(number) {
  const dir = new URL('../supabase/migrations/', import.meta.url);
  const name = (await readdir(dir)).find(file => file.endsWith('.sql') && Number(file.slice(8,12)) === number);
  assert(name, `Missing migration ${number}`);
  return readFile(new URL(name,dir), 'utf8');
}
async function rpc(db, name, args = {}) {
  const keys = Object.keys(args);
  return (await db.query(`select public.${name}(${keys.map((key,i) => `${key} => $${i+1}`).join(',')}) result`,
    keys.map(key => args[key] !== null && typeof args[key] === 'object' ? JSON.stringify(args[key]) : args[key]))).rows[0].result;
}
const policy = async (db, id = guildId) => (await db.query('select to_jsonb(p) value from public.discord_view_policies p where guild_id=$1',[id])).rows[0].value;
const sync = db => rpc(db,'discord_sync_channels');
const sourceMap = p => new Map(p.channels.filter(row => row.source_id).map(row => [row.channel_id,row.source_id]));
const activeIds = async db => (await sync(db)).filter(row => row.guild_id === guildId).map(row => row.channel_id).sort();
async function transaction(db, fn) { await db.exec('begin'); try { await fn(); } finally { await db.exec('rollback'); } }
function transport(db, afterPersist) {
  return createDiscordStore({env:{SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'synthetic-service-key'},fetchImpl:async (url,options) => {
    const name = url.split('/').at(-1), args = JSON.parse(options.body);
    let result;
    try { result = await rpc(db,name,args); }
    catch (error) { return Response.json({code:error.code},{status:400}); }
    if (name === 'discord_persist_discovery' && result === true && afterPersist) await afterPersist(args);
    return Response.json(result);
  }});
}
function fixture(gid = guildId) {
  const channel = (id,parent_id,type = 0,name = `channel-${id}`) => ({id,guild_id:gid,parent_id,type,name,permission_overwrites:[]});
  const state = {
    channels:[channel(EBOARD_CATEGORY_ID,null,4,'eBoard'),channel(ids.blockedCategory,null,4,'Excluded category'),
      channel(ids.announcements,EBOARD_CATEGORY_ID,5,'eboard-announcements'),channel(ids.chat,EBOARD_CATEGORY_ID,0,'eboard-chat'),
      channel(ids.manual,EBOARD_CATEGORY_ID),channel(ids.excluded,EBOARD_CATEGORY_ID),channel(LEADERSHIP_CHANNEL_ID,EBOARD_CATEGORY_ID,0,'leadership-team'),channel(ids.general,null)],
    threads:[channel(ids.thread,ids.announcements,11,'Event discussion')], archives:[],
    denied:new Set(), failArchives:false, reads:0, metadataCalls:0,
  };
  const client = {
    configured:true,
    getGuildChannels:async () => { state.metadataCalls++; return structuredClone(state.channels); },
    getChannel:async ({channelId}) => {
      if (state.denied.has(channelId)) throw Object.assign(new Error('permission_denied'),{code:'permission_denied'});
      const row = [...state.channels,...state.threads,...state.archives].find(row => row.id === channelId);
      if (!row) throw Object.assign(new Error('not_found'),{code:'not_found'});
      return {...structuredClone(row),botPermissions:permissions};
    },
    getActiveThreads:async () => ({threads:structuredClone(state.threads)}),
    getArchivedThreads:async ({channelId,kind}) => {
      if (state.failArchives) throw Object.assign(new Error('rate_limited'),{code:'rate_limited'});
      return {threads:structuredClone(state.archives.filter(row => row.parent_id === channelId && kind === 'public')),hasMore:false};
    },
    getCurrentApplication:async () => ({flags:1 << 18}),
    getMessages:async ({channelId}) => { state.reads++; return [{id:'1500000000000000001',channel_id:channelId,guild_id:gid,timestamp:'2026-10-19T12:00:00Z',author:{id:userId,username:'Synthetic member'},content:bodySentinel}]; },
  };
  return {state,client};
}
async function discover(db, f, limits, afterPersist, gid = guildId) {
  let observationError;
  const result = await runDiscordDiscovery({config:{...config,guildId:gid},store:transport(db,afterPersist ? async args => {
    try { await afterPersist(args); } catch (error) { observationError = error; throw error; }
  } : undefined),client:f.client,limits});
  if (observationError) throw observationError;
  return result;
}
async function configurePolicy(db, gid = guildId, changes = {}) {
  const old = (await db.query('select revision from public.discord_view_policies where guild_id=$1',[gid])).rows[0];
  return rpc(db,'discord_configure_policy',{p_member_id:null,p_guild_id:gid,p_expected_revision:old?.revision ?? null,
    p_policy:{paused:false,discovery_enabled:true,excluded_category_ids:[ids.blockedCategory],excluded_channel_ids:[ids.excluded,LEADERSHIP_CHANNEL_ID],...changes}});
}
function chatAccess(db, f, allowedSourceIds) {
  return createDiscordChatAccess({config:{enabled:true,guildId,allowedSourceIds},store:transport(db),client:f.client,memberClient:{
    getGuildMember:async () => ({user:{id:userId,username:'Synthetic member'},roles:[]}),
    getGuildChannelsMetadata:async () => structuredClone(f.state.channels),
    getGuildRoles:async () => [{id:guildId,permissions}],getGuildMetadata:async () => ({id:guildId,owner_id:'999'}),
  }});
}
async function schema(db) {
  return {
    tables:(await db.query("select relname,relrowsecurity,relforcerowsecurity,relacl::text from pg_class where relnamespace='public'::regnamespace and relkind='r' order by relname")).rows,
    columns:(await db.query("select table_name,column_name,data_type,column_default,is_nullable from information_schema.columns where table_schema='public' order by table_name,ordinal_position")).rows,
    functions:(await db.query("select oid::regprocedure::text signature,prosecdef,proconfig,proacl::text from pg_proc where pronamespace='public'::regnamespace order by 1")).rows,
  };
}

test('035 independent full-chain SQL and real discovery/store/chat availability acceptance', async t => {
  const db = new PGlite({extensions:{vector}});
  try {
    await db.exec('create role anon; create role authenticated; create role service_role bypassrls; create role discovery_public_probe;');
    for (let n = 1; n <= 34; n++) await db.exec(await migration(n));
    await configurePolicy(db);
    const initial = fixture();
    assert.equal((await discover(db,initial)).status,'ready');
    const manualSource = sourceMap(await policy(db)).get(ids.manual);
    await rpc(db,'discord_configure_channel',{p_member_id:null,p_channel:{guild_id:guildId,channel_id:ids.manual,source_id:manualSource,title:'Manually disabled',enabled:false}});
    assert.equal((await discover(db,initial)).status,'ready');
    const published = await activeIds(db), sources = sourceMap(await policy(db));
    assert.deepEqual(published,[ids.announcements,ids.chat,ids.general,ids.thread]);
    assert.equal(initial.state.reads,0,'Discovery must use metadata only');
    await t.test('pre-upgrade reproduction: starting unchanged capped refresh makes base eBoard unavailable', () => transaction(db,async () => {
      assert.equal((await discover(db,fixture(),{maxPages:1})).status,'partial');
      assert.deepEqual(await activeIds(db),[]);
      await assert.rejects(chatAccess(db,fixture(),[...sources.values()]).authorize({guildId,channelId:ids.chat,userId}));
    }));
    // Existing incomplete state must not be mistaken for a successfully published generation.
    await db.query('insert into public.discord_view_policies(guild_id,revision,paused,discovery_enabled,channels,discovery_state) select $1,revision,paused,discovery_enabled,channels,discovery_state from public.discord_view_policies where guild_id=$2',[incompleteGuild,guildId]);
    await db.query("update public.discord_view_policies set channels='[]',discovery_state=null where guild_id=$1",[incompleteGuild]);
    const incomplete = {state:{},client:{configured:true,getGuildChannels:async()=>[{id:'801',guild_id:incompleteGuild,parent_id:null,type:0,name:'Legacy incomplete'}],getChannel:async()=>({id:'801',guild_id:incompleteGuild,parent_id:null,type:0,botPermissions:permissions}),getActiveThreads:async()=>({threads:[]}),getArchivedThreads:async()=>({threads:[],hasMore:false})}};
    assert.equal((await discover(db,incomplete,{maxPages:1},null,incompleteGuild)).status,'partial');
    const beforeIncomplete = await policy(db,incompleteGuild), beforeSchema = await schema(db);
    await db.query("insert into public.knowledge_sources(kind,external_id,title,status) values('manual','availability-035','Unrelated retained source','active')");
    const unrelated = new Map();
    for (const table of beforeSchema.tables.filter(row => row.relname !== 'discord_view_policies')) unrelated.set(table.relname,(await db.query(`select to_jsonb(t) value from public.${table.relname} t order by to_jsonb(t)::text`)).rows);
    await db.exec(await migration(35));

    await t.test('forward upgrade preserves schemas, existing ACLs, unrelated data, UUIDs and manual intent',async () => {
      const after = await schema(db);
      assert.deepEqual(after.tables,beforeSchema.tables);
      assert.deepEqual(after.columns,beforeSchema.columns);
      const functions = new Map(after.functions.map(row => [row.signature,row]));
      for (const before of beforeSchema.functions) assert.deepEqual(functions.get(before.signature),before,before.signature);
      for (const [table,rows] of unrelated) assert.deepEqual((await db.query(`select to_jsonb(t) value from public.${table} t order by to_jsonb(t)::text`)).rows,rows,table);
      assert.deepEqual(sourceMap(await policy(db)),sources);
      assert.equal((await policy(db)).channels.find(row => row.channel_id === ids.manual).manual_disabled,true);
      assert.deepEqual(await activeIds(db),published);
      assert.deepEqual((await policy(db,incompleteGuild)).channels,beforeIncomplete.channels);
      assert(!(await sync(db)).some(row => row.guild_id === incompleteGuild));
    });
    await t.test('legacy incomplete upgrade remains closed until real resumed JS completion',() => transaction(db,async () => {
      assert.equal((await discover(db,incomplete,undefined,null,incompleteGuild)).status,'ready');
      assert((await sync(db)).some(row => row.channel_id === '801'));
    }));
    await t.test('fresh installation cannot publish initial partial metadata without a prior completed generation',() => transaction(db,async () => {
      await db.query('delete from public.discord_view_policies where guild_id=$1',[incompleteGuild]);
      await configurePolicy(db,incompleteGuild);
      assert.equal((await discover(db,incomplete,{maxPages:1},null,incompleteGuild)).status,'partial');
      assert(!(await sync(db)).some(row => row.guild_id === incompleteGuild));
      assert.equal((await discover(db,incomplete,undefined,null,incompleteGuild)).status,'ready');
      assert((await sync(db)).some(row => row.channel_id === '801'));
    }));
    await t.test('missing or mismatched publication proof cannot make the legacy catalogue readable',async () => {
      const before = await policy(db), publishedProof = before.discovery_state.published;
      assert(publishedProof,'Upgrade must retain explicit completion proof');
      for (const proof of [null,{}, {...publishedProof,generation:randomUUID()}, {...publishedProof,policy_revision:before.revision + 1}]) await transaction(db,async () => {
        await db.query("update public.discord_view_policies set discovery_state=jsonb_set(discovery_state,'{published}',$2::jsonb) where guild_id=$1",[guildId,JSON.stringify(proof)]);
        assert.deepEqual(await activeIds(db),[]);
        assert.equal(await rpc(db,'discord_channel_allowed',{p_guild_id:guildId,p_channel_id:ids.chat,p_allow_paused:true}),false);
      });
    });
    await t.test('base eBoard chat and live reads stay authorized through empty staging, partial, archives and repeat refreshes',() => transaction(db,async () => {
      const f = fixture(), allowed = [...sources.values()], access = chatAccess(db,f,allowed), stages = [];
      const profiles = new Map();
      for (const channelId of [ids.announcements,ids.chat]) profiles.set(channelId,(await access.authorize({guildId,channelId,userId})).sourceProfileId);
      const check = async args => {
        stages.push({phase:args.p_state.phase,count:args.p_channels.length});
        assert.deepEqual(await activeIds(db),published);
        for (const channelId of [ids.announcements,ids.chat]) {
          const authorized = await access.authorize({guildId,channelId,userId});
          assert.equal(authorized.sourceProfileId,profiles.get(channelId),'An unchanged refresh must not invalidate retained chat context');
          assert(authorized.principal.liveDiscord.allowedSourceIds.includes(sources.get(channelId)));
          assert(!authorized.principal.liveDiscord.allowedSourceIds.includes(sources.get(ids.manual)));
        }
        for (const channelId of [ids.manual,ids.excluded,LEADERSHIP_CHANNEL_ID]) await assert.rejects(access.authorize({guildId,channelId,userId}));
      };
      assert.equal((await discover(db,f,{maxPages:1},check)).status,'partial');
      assert.equal((await discover(db,f,{maxPages:2},check)).status,'partial');
      assert(stages.some(stage => stage.count === 0));
      assert(stages.some(stage => stage.phase === 'archives'));
      const service = createLiveDiscordRetrieval({config,store:transport(db),client:f.client});
      const principal = (await access.authorize({guildId,channelId:ids.chat,userId})).principal;
      const result = await service.readMessages({principal,channelId:ids.chat});
      assert.equal(result.status,'ready'); assert.equal(result.sources[0].excerpt,bodySentinel);
      for (const channelId of [ids.manual,ids.excluded,LEADERSHIP_CHANNEL_ID]) assert.equal((await service.readMessages({principal,channelId})).status,'channel_scope_denied');
      assert.equal((await discover(db,f,undefined,check)).status,'ready');
      assert.equal((await discover(db,f,{maxPages:1},check)).status,'partial');
      assert.deepEqual(sourceMap(await policy(db)),sources);
      assert(!JSON.stringify(await policy(db)).includes(bodySentinel));
    }));
    await t.test('archive rate limit preserves completed same-policy access without publishing new rows',() => transaction(db,async () => {
      const f = fixture();
      f.state.channels.push({id:'107',guild_id:guildId,parent_id:EBOARD_CATEGORY_ID,type:0,name:'New eBoard',permission_overwrites:[]});
      f.state.failArchives = true;
      const result = await discover(db,f);
      assert.equal(result.status,'failed'); assert.equal(result.code,'rate_limited');
      assert.deepEqual(await activeIds(db),published);
      f.state.failArchives = false;
      assert.equal((await discover(db,f)).status,'ready');
      assert((await activeIds(db)).includes('107'));
    }));
    await t.test('absence from active threads does not revoke a known thread pending the archive scan',() => transaction(db,async () => {
      const f = fixture();
      f.state.archives = f.state.threads.map(row => ({...row,thread_metadata:{archived:true,archive_timestamp:'2026-10-18T12:00:00Z'}}));
      f.state.threads = [];
      assert.equal((await discover(db,f,{maxPages:2})).status,'partial');
      assert((await activeIds(db)).includes(ids.thread));
      assert.equal((await discover(db,f)).status,'ready');
      assert((await activeIds(db)).includes(ids.thread));
      assert.deepEqual(sourceMap(await policy(db)),sources);
    }));
    for (const [label,mutate,withdrawn] of [
      ['permission denied',f => f.state.denied.add(ids.announcements),[ids.announcements,ids.thread]],
      ['renamed parent',f => f.state.channels.find(row => row.id === ids.announcements).name = 'Changed announcement name',[ids.announcements,ids.thread]],
      ['moved parent',f => f.state.channels.find(row => row.id === ids.announcements).parent_id = ids.blockedCategory,[ids.announcements,ids.thread]],
      ['changed channel type',f => f.state.channels.find(row => row.id === ids.announcements).type = 0,[ids.announcements,ids.thread]],
      ['removed parent',f => f.state.channels = f.state.channels.filter(row => row.id !== ids.announcements),[ids.announcements,ids.thread]],
      ['renamed category',f => f.state.channels.find(row => row.id === EBOARD_CATEGORY_ID).name = 'Changed eBoard category',[ids.announcements,ids.chat,ids.thread]],
      ['removed category',f => f.state.channels = f.state.channels.filter(row => row.id !== EBOARD_CATEGORY_ID),[ids.announcements,ids.chat,ids.thread]],
    ]) await t.test(`observed ${label} immediately withdraws descendants while unaffected sources remain available`,() => transaction(db,async () => {
      const f = fixture(); mutate(f);
      let snapshotChecked = false;
      const result = await discover(db,f,{maxPages:1},async args => {
        // Metadata changes/removal are known at the first full parent snapshot;
        // permission denial is first known after the actual channel check.
        if (!args.p_channels.length && label === 'permission denied') return;
        snapshotChecked = true;
        const available = await activeIds(db);
        for (const id of withdrawn) assert(!available.includes(id),`${label}: ${id} still visible`);
        assert(available.includes(ids.general),'Unchanged root survives');
      });
      assert.equal(result.status,'partial'); assert(snapshotChecked);
      assert.deepEqual(sourceMap(await policy(db)),sources);
    }));
    await t.test('renamed or newly discovered entries publish only on complete, retaining stable UUID/manual disable',() => transaction(db,async () => {
      const f = fixture(); f.state.channels.find(row => row.id === ids.announcements).name = 'Renamed announcements';
      assert.equal((await discover(db,f,{maxPages:1})).status,'partial');
      assert(!(await activeIds(db)).includes(ids.announcements));
      assert.equal((await discover(db,f)).status,'ready');
      assert((await activeIds(db)).includes(ids.announcements));
      assert.deepEqual(sourceMap(await policy(db)),sources);
      assert.equal((await policy(db)).channels.find(row => row.channel_id === ids.announcements).title,'Renamed announcements');
      assert(!(await activeIds(db)).includes(ids.manual));
    }));
    await t.test('fresh policy revision, pause and discovery-disable close all published access even with allow-paused helper flag',async () => {
      for (const changes of [{},{paused:true},{discovery_enabled:false}]) await transaction(db,async () => {
        assert.equal((await discover(db,fixture(),{maxPages:1})).status,'partial');
        await configurePolicy(db,guildId,changes);
        assert.deepEqual(await activeIds(db),[]);
        for (const flag of [false,true]) assert.equal(await rpc(db,'discord_channel_allowed',{p_guild_id:guildId,p_channel_id:ids.chat,p_allow_paused:flag}),false);
        await assert.rejects(chatAccess(db,fixture(),[...sources.values()]).authorize({guildId,channelId:ids.chat,userId}));
      });
    });
    await t.test('stale expected state and stale generation cannot mutate or publish a competing refresh',() => transaction(db,async () => {
      assert.equal((await discover(db,fixture(),{maxPages:1})).status,'partial');
      const previous = await rpc(db,'discord_get_discovery_state',{p_guild_id:guildId}), revision = (await policy(db)).revision;
      assert.equal((await discover(db,fixture(),{maxPages:1})).status,'partial');
      const before = await policy(db);
      const store = transport(db), completed = {...previous,phase:'complete'};
      assert.equal((await store.completeDiscovery({guildId,generation:previous.generation,expectedPolicyRevision:revision,expectedState:previous,state:completed})).status,'stale');
      assert.equal((await store.persistDiscovery({guildId,expectedPolicyRevision:revision,expectedGeneration:previous.generation,expectedState:previous,channels:[],state:previous})).status,'stale');
      const wrongGeneration = randomUUID(), current = before.discovery_state.state;
      assert.equal((await store.completeDiscovery({guildId,generation:wrongGeneration,expectedPolicyRevision:revision,expectedState:current,state:{...completed,generation:wrongGeneration}})).status,'stale');
      const switched = await store.persistDiscovery({guildId,expectedPolicyRevision:revision,expectedGeneration:current.generation,expectedState:current,channels:[],state:{...current,generation:wrongGeneration}});
      assert(['stale','invalid_request'].includes(switched.status),`In-flight generation switch: ${switched.status}`);
      assert.deepEqual(await policy(db),before);
      assert.deepEqual(await activeIds(db),published);
    }));
    await t.test('exact CAS cannot prematurely complete a checkpoint with unfinished archive tasks',() => transaction(db,async () => {
      assert.equal((await discover(db,fixture(),{maxPages:2})).status,'partial');
      const before = await policy(db), current = before.discovery_state.state;
      assert.equal(current.phase,'archives'); assert(current.taskIndex < current.tasks.length);
      const result = await transport(db).completeDiscovery({guildId,generation:current.generation,expectedPolicyRevision:before.revision,expectedState:current,state:{...current,phase:'complete'}});
      assert(['stale','invalid_request'].includes(result.status),`Unfinished completion: ${result.status}`);
      assert.deepEqual(await policy(db),before);
      assert.deepEqual(await activeIds(db),published);
    }));
    await t.test('unchanged refresh during a live read retains the authorized response and does not persist bodies',() => transaction(db,async () => {
      const f = fixture(), read = f.client.getMessages;
      f.state.channels[0].topic = bodySentinel;
      f.client.getMessages = async args => {
        const rows = await read(args);
        assert.equal((await discover(db,f,{maxPages:1})).status,'partial');
        return rows;
      };
      const service = createLiveDiscordRetrieval({config,store:transport(db),client:f.client});
      const principal = {allowedSourceIds:[...sources.values()],liveDiscord:{mode:'local-operator',guildId}};
      const result = await service.readMessages({principal,channelId:ids.announcements});
      assert.equal(result.status,'ready'); assert.equal(result.sources[0].excerpt,bodySentinel);
      assert(!JSON.stringify(await policy(db)).includes(bodySentinel),'Neither live message body nor raw channel topic may persist');
    }));
    await t.test('live evidence is discarded when a same-revision observation withdraws its source mid-read',() => transaction(db,async () => {
      const f = fixture(), read = f.client.getMessages;
      f.client.getMessages = async args => {
        const rows = await read(args);
        f.state.denied.add(ids.announcements);
        assert.equal((await discover(db,f,{maxPages:1})).status,'partial');
        return rows;
      };
      const service = createLiveDiscordRetrieval({config,store:transport(db),client:f.client});
      const principal = {allowedSourceIds:[...sources.values()],liveDiscord:{mode:'local-operator',guildId}};
      const result = await service.readMessages({principal,channelId:ids.announcements});
      assert.equal(result.status,'policy_changed'); assert.deepEqual(result.sources,[]);
      assert(!JSON.stringify(result).includes(bodySentinel));
      assert(!JSON.stringify(await policy(db)).includes(bodySentinel));
    }));
    await t.test('all discovery/catalogue helpers remain service-only and expose no new content storage',async () => {
      const functions = (await db.query("select oid::regprocedure::text signature,prosecdef,proconfig from pg_proc where pronamespace='public'::regnamespace and proname like 'discord_%' order by 1")).rows;
      for (const fn of functions) {
        assert.equal(fn.prosecdef,false,fn.signature);
        assert(fn.proconfig.includes('search_path=""'),fn.signature);
        for (const role of ['anon','authenticated','discovery_public_probe','service_role']) assert.equal((await db.query("select has_function_privilege($1,$2,'EXECUTE') allowed",[role,fn.signature])).rows[0].allowed,role === 'service_role',`${role}: ${fn.signature}`);
      }
      for (const role of ['anon','authenticated','discovery_public_probe']) await transaction(db,async () => {
        await db.exec(`set local role ${role}`);
        await assert.rejects(sync(db),error => error.code === '42501');
      });
      assert.equal((await db.query("select count(*)::integer n from public.knowledge_sources where kind='discord'")).rows[0].n,0);
      assert.deepEqual((await schema(db)).tables,beforeSchema.tables);
      assert.equal(initial.state.reads,0);
    });
  } finally { await db.close(); }
});
