import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {readFile,readdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {vector} from '@electric-sql/pglite-pgvector';
import {WebSocketShardEvents as E} from '@discordjs/ws';
import {createDiscordMetadataReconcile} from '../server/discord/metadata-reconcile.js';
import {createDiscordEventListener} from '../server/discord/event-listener.js';
import {createDiscordGateway} from '../server/discord/gateway.js';
import {createDiscordStore} from '../server/discord/store.js';
import {createAutomationStore} from '../server/automation/store.js';
import {createDiscordClient} from '../server/discord/client.js';
import {runDiscordDiscovery} from '../server/discord/discovery.js';

const guild='900001',category='100',base='102',channel='103',privateThread='104';
const stableSource='22222222-2222-4222-8222-222222222222';
const config={enabled:true,configured:true,guildId:guild,botToken:'inert-test-token',maxPending:100,
  discovery:{maxPages:100,maxChannels:1000,maxRuntimeMs:10000,pageSize:100}};
const native=(id,type=0,parent=category)=>({id,guild_id:guild,type,parent_id:parent,name:`Channel ${id}`});
const original={t:'MESSAGE_CREATE',s:3,d:{guild_id:guild,channel_id:channel,id:'500',content:'Studying at Bobst until nine',author:{id:'600'}}};
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
const bounded=async promise=>{let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('foreground ingestion blocked')),2000);})]);}finally{clearTimeout(timer);}};

async function database() {
  const db=new PGlite({extensions:{vector}});
  await db.exec('create role anon;create role authenticated;create role service_role bypassrls;');
  const directory=new URL('../supabase/migrations/',import.meta.url);
  for(const file of (await readdir(directory)).filter(f=>f.endsWith('.sql')).sort())await db.exec(await readFile(new URL(file,directory),'utf8'));
  await db.exec('set role service_role');
  return db;
}

async function fixture(db,{policy={},extra=[],stagedExtra=[]}={}) {
  await db.exec("delete from public.agent_input_cache;delete from public.agent_automation_state where key like 'input:%';delete from public.discord_view_policies;");
  const published=randomUUID(),generation=randomUUID();
  const node=(id,type,parent,sourceId=null)=>({channel_id:id,guild_id:guild,parent_id:parent,channel_type:type,
    title:`Channel ${id}`,generation:published,policy_revision:1,access_status:type===4?'metadata':'ready',eligible:type!==4,
    enabled:type!==4,source_status:type===4?'disabled':'active',source_id:sourceId,backfill_from:'2015-01-01T00:00:00Z'});
  const nodes=[node(category,4,null),node(base,0,category,stableSource),...extra.map(n=>({...node(n.channel_id,n.channel_type??0,n.parent_id??category,n.source_id??null),...n}))];
  const state={generation,policyRevision:1,phase:'archives',parents:[{...native(category,4,null),accessStatus:'metadata'},
    {...native(base),accessStatus:'ready',canManageThreads:false}],channelIndex:2,activeThreads:[],activeIndex:0,
    tasks:[{channelId:base,kind:'public',before:null}],taskIndex:0,startedAt:'2026-10-22T20:00:00Z',channelsLoaded:true};
  const discovery={generation,policy_revision:1,state,published:{generation:published,policy_revision:1},
    staging_channels:[...nodes.map(n=>({...n,generation})),...stagedExtra.map(n=>({...node(n.channel_id,n.channel_type??0,n.parent_id??category,n.source_id??null),...n,generation}))]};
  await db.query('insert into public.discord_view_policies(guild_id,revision,paused,discovery_enabled,excluded_category_ids,excluded_channel_ids,channels,discovery_state) values($1,1,$2,$3,$4,$5,$6::jsonb,$7::jsonb)',
    [guild,policy.paused??false,policy.discoveryEnabled??true,policy.excludedCategories??[],policy.excludedChannels??[],JSON.stringify(nodes),JSON.stringify(discovery)]);
  const rpcCalls=[];
  const fetchImpl=async(url,options)=>{
    const name=new URL(url).pathname.split('/').at(-1),args=JSON.parse(options.body);rpcCalls.push(name);
    const keys=Object.keys(args),values=keys.map(k=>args[k]!==null&&typeof args[k]==='object'?JSON.stringify(args[k]):args[k]);
    try {const result=await db.query(`select public.${name}(${keys.map((k,i)=>`${k} => $${i+1}`).join(',')}) value`,values);return Response.json(result.rows[0]?.value??null);}
    catch(error){return Response.json({code:error.code},{status:400});}
  };
  const env={SUPABASE_URL:'https://inert.invalid',SUPABASE_SERVICE_ROLE_KEY:'inert'};
  const store=createDiscordStore({env,fetchImpl}),inputStore=createAutomationStore({env,fetchImpl});
  const channels=[native(category,4,null),native(base),native(channel)];
  const client={configured:true,getGuildChannels:async()=>structuredClone(channels),getChannel:async({channelId})=>({...structuredClone(channels.find(n=>n.id===channelId)),botPermissions:'66560'}),
    getActiveThreads:async()=>({threads:[]}),getArchivedThreads:async()=>({threads:[],hasMore:false}),
    getMessages:()=>assert.fail('No message history reads'),getMessage:()=>assert.fail('No original hydration')};
  const readPolicy=async()=> (await db.query('select channels,discovery_state from public.discord_view_policies where guild_id=$1',[guild])).rows[0];
  const queued=async()=> (await db.query('select uuid,raw_response from public.agent_input_cache')).rows;
  const allowed=async id=>(await db.query('select public.discord_channel_allowed($1,$2) allowed',[guild,id])).rows[0].allowed;
  const makeListener=(reconcile,overrides={})=>createDiscordEventListener({config,store,inputStore,client,reconcileMetadata:reconcile,
    refreshMetadata:()=>assert.fail('Foreground path waited for archive discovery'),...overrides});
  return {store,inputStore,client,channels,state,published,generation,rpcCalls,readPolicy,queued,allowed,makeListener};
}

async function gateway({listener,reconcileMetadata,state:givenState}={}) {
  const manager=new EventEmitter(),saves=[],logs=[];let options,checkpoint=null,failures=0;
  manager.connect=async()=>{};manager.destroy=async()=>{};
  const state=givenState??{load:async()=>checkpoint,save:async(expected,next)=>{assert.deepEqual(expected,checkpoint);checkpoint=structuredClone(next);saves.push(next.session.sequence);}};
  const instance=await createDiscordGateway({config,listener,state,reconcileMetadata,
    refreshMetadata:()=>assert.fail('Metadata dispatch must not await full discovery'),createRest:()=>({}),createManager:value=>{options=value;return manager;},
    log:value=>logs.push(value),onFailure:()=>{failures++;}});
  const dispatch=event=>{options.updateSessionInfo(0,{sessionId:'inert',resumeURL:'wss://gateway.discord.gg',sequence:event.s,shardId:0,shardCount:1});manager.emit(E.Dispatch,event,0);};
  return {instance,dispatch,saves,logs,get failures(){return failures;}};
}

test('foreground metadata and native ingestion execute against all migrations while archive work is held',async t=>{
  const db=await database();
  try {
    await t.test('new channel queues and checkpoints before archives release; old scan cannot overwrite it and restart retains identity',async()=>{
      const f=await fixture(db),entered=deferred(),release=deferred();let archiveReturned=false;
      f.client.getArchivedThreads=async()=>{entered.resolve();await release.promise;archiveReturned=true;return {threads:[],hasMore:false};};
      const scan=runDiscordDiscovery({config,store:f.store,client:f.client});await entered.promise;
      const {reconcile}=createDiscordMetadataReconcile({config,store:f.store,client:f.client});
      const g=await gateway({listener:f.makeListener(reconcile),reconcileMetadata:reconcile});
      try {
        g.dispatch({t:'CHANNEL_CREATE',s:2,d:native(channel)});g.dispatch(original);await bounded(g.instance.drain());
        assert.equal(archiveReturned,false);assert.deepEqual(g.saves,[2,3]);assert.equal(g.failures,0);
        const rows=await f.queued();assert.equal(rows.length,1);assert.deepEqual(rows[0].raw_response.payload,original.d);
        assert.equal(await f.allowed(channel),true);const row=(await f.readPolicy()).channels.find(n=>n.channel_id===channel),sourceId=row.source_id;
        assert.match(sourceId,/^[0-9a-f-]{36}$/);assert.equal(rows[0].raw_response.source_id,sourceId);
        assert.equal((await f.readPolicy()).discovery_state.state.restartRequired,true);
        release.resolve();assert.equal((await scan).code,'concurrent_discovery');assert.equal(await f.allowed(channel),true);
        assert.equal((await runDiscordDiscovery({config,store:f.store,client:f.client})).complete,true);
        assert.equal((await f.readPolicy()).channels.find(n=>n.channel_id===channel).source_id,sourceId);
      }finally{release.resolve();await scan;await g.instance.stop();}
    });

    await t.test('an unknown-channel original without a channel-create dispatch reconciles and queues directly',async()=>{
      const f=await fixture(db),{reconcile}=createDiscordMetadataReconcile({config,store:f.store,client:f.client});
      assert.equal((await f.makeListener(reconcile).handle(original)).status,'queued');assert.equal((await f.queued()).length,1);
      assert.equal(f.rpcCalls.filter(n=>n==='discord_reconcile_event_metadata').length,1);
    });

    await t.test('unresolved metadata leaves checkpoint untouched; successful replay deduplicates durable original after checkpoint failure',async()=>{
      const f=await fixture(db),{reconcile}=createDiscordMetadataReconcile({config,store:f.store,client:f.client});
      const failed=await gateway({listener:f.makeListener(async()=>({status:'stale'})),reconcileMetadata:reconcile});
      failed.dispatch(original);await failed.instance.drain();assert.equal(failed.failures,1);assert.deepEqual(failed.saves,[]);assert.equal((await f.queued()).length,0);await failed.instance.stop();
      const checkpointFailure=await gateway({listener:f.makeListener(reconcile),reconcileMetadata:reconcile,state:{load:async()=>null,save:async()=>{throw Error('checkpoint_unavailable');}}});
      checkpointFailure.dispatch(original);await checkpointFailure.instance.drain();assert.equal(checkpointFailure.failures,1);const first=await f.queued();assert.equal(first.length,1);await checkpointFailure.instance.stop();
      const replay=await gateway({listener:f.makeListener(reconcile),reconcileMetadata:reconcile});replay.dispatch(original);replay.dispatch({...original,s:4});await replay.instance.drain();
      assert.deepEqual(replay.saves,[3,4]);assert.equal((await f.queued())[0].uuid,first[0].uuid);assert.equal((await f.queued()).length,1);assert.equal(replay.failures,0);await replay.instance.stop();
    });

    await t.test('blacklist, staged manual disable, pause and changed policy prevent new source writes',async()=>{
      for(const mode of ['blacklist','manual','paused','revision']){
        const f=await fixture(db,{policy:mode==='blacklist'?{excludedCategories:[category]}:mode==='paused'?{paused:true}:{},
          stagedExtra:mode==='manual'?[{channel_id:channel,source_id:stableSource,manual_disabled:true}]:[]});
        if(mode==='revision'){const read=f.client.getGuildChannels;f.client.getGuildChannels=async()=>{await db.query('update public.discord_view_policies set revision=2 where guild_id=$1',[guild]);return read();};}
        const {reconcile}=createDiscordMetadataReconcile({config,store:f.store,client:f.client});
        if(mode==='revision')await assert.rejects(reconcile({channelId:channel}));else assert.equal((await reconcile({channelId:channel})).allowed,false);
        assert.equal(await f.allowed(channel),false);assert.equal((await f.queued()).length,0);
        if(mode==='manual'){const n=(await f.readPolicy()).channels.find(n=>n.channel_id===channel);assert.equal(n.source_id,stableSource);assert.equal(n.manual_disabled,true);}
      }
    });

    await t.test('same-policy relevant metadata race fails without publication; unrelated archive cursor does not block target',async()=>{
      for(const conflict of [true,false]){
        const f=await fixture(db);const get=f.client.getGuildChannels;f.client.getGuildChannels=async()=>{
          if(conflict)await db.query("update public.discord_view_policies set channels=jsonb_set(channels,'{0,title}','\"Changed category\"') where guild_id=$1",[guild]);
          else await db.query("update public.discord_view_policies set discovery_state=jsonb_set(discovery_state,'{state,taskIndex}','1') where guild_id=$1",[guild]);
          return get();};
        const {reconcile}=createDiscordMetadataReconcile({config,store:f.store,client:f.client});
        if(conflict){await assert.rejects(reconcile({channelId:channel}));assert.equal(await f.allowed(channel),false);}else assert.equal((await reconcile({channelId:channel})).allowed,true);
      }
    });

    await t.test('delete and reparent withdraw unchecked descendants while preserving source identities',async()=>{
      const descendantSource='33333333-3333-4333-8333-333333333333',otherCategory='101';
      for(const mode of ['delete','reparent']){
        const f=await fixture(db,{extra:[{channel_id:privateThread,channel_type:11,parent_id:base,source_id:descendantSource}]});
        assert.equal(await f.allowed(privateThread),true);
        if(mode==='reparent'){
          f.channels.push(native(otherCategory,4,null));f.channels.find(n=>n.id===base).parent_id=otherCategory;
        }
        const {reconcile}=createDiscordMetadataReconcile({config,store:f.store,client:f.client});
        assert.equal((await reconcile({channelId:base,eventType:mode==='delete'?'CHANNEL_DELETE':'CHANNEL_UPDATE'})).allowed,mode==='reparent');
        assert.equal(await f.allowed(privateThread),false);
        const rows=(await f.readPolicy()).channels;
        assert.equal(rows.find(n=>n.channel_id===base).source_id,stableSource);
        const descendant=rows.find(n=>n.channel_id===privateThread);assert.equal(descendant.source_id,descendantSource);assert.equal(descendant.discovery_withdrawn,true);
      }
    });

    await t.test('new metadata functions execute only as service role and do not elevate privileges',async()=>{
      await fixture(db);const signatures=['public.discord_event_metadata_snapshot(text,bigint)','public.discord_reconcile_event_metadata(text,bigint,text,jsonb,boolean,jsonb)'];
      for(const signature of signatures){const row=(await db.query("select p.prosecdef,has_function_privilege('anon',p.oid,'execute') anon,has_function_privilege('authenticated',p.oid,'execute') authenticated,has_function_privilege('service_role',p.oid,'execute') service from pg_proc p where p.oid=$1::regprocedure",[signature])).rows[0];assert.deepEqual(row,{prosecdef:false,anon:false,authenticated:false,service:true});}
      await db.exec('reset role;set role anon');await assert.rejects(db.query('select public.discord_event_metadata_snapshot($1,1)',[guild]),/permission denied/);await db.exec('reset role;set role service_role');
    });
  }finally{await db.close();}
});

test('real REST metadata checks private membership without fetching message history; malformed scope remains a retryable failure',async()=>{
  for(const mode of ['private allowed','private denied','malformed','scope failure']){
    const requests=[],published=[];const channels=[native(category,4,null),native(base)];const thread=native(privateThread,12,base);
    let client=createDiscordClient({config,requestPacer:{run:work=>work({defer:()=>{},now:Date.now})},fetchImpl:async url=>{
      const path=new URL(url).pathname.replace('/api/v10','');requests.push(path);assert(!/\/messages(?:\/|$)/.test(path));
      if(path===`/guilds/${guild}/channels`)return Response.json(channels);
      if(path===`/channels/${privateThread}/thread-members/@me`)return Response.json({id:'700'},{status:mode==='private denied'?403:200});
      if(path===`/channels/${privateThread}`)return Response.json(mode==='malformed'?{...thread,guild_id:'999'}:thread);
      if(path===`/channels/${base}`)return Response.json(native(base));
      if(path==='/users/@me')return Response.json({id:'700'});
      if(path===`/guilds/${guild}/roles`)return Response.json([{id:guild,permissions:'66560'}]);
      if(path===`/guilds/${guild}/members/700`)return Response.json({roles:[]});
      assert.fail(`Unexpected metadata endpoint ${path}`);
    }});
    if(mode==='scope failure')client={...client,getChannel:async()=>{throw Object.assign(Error('untrusted foreign response'),{code:'channel_scope_denied'});}};
    const store={getPolicy:async()=>({status:'ready',policy:{guildId:guild,revision:1,paused:false,discoveryEnabled:true,excludedChannelIds:[],excludedCategoryIds:[]}}),
      getEventMetadataSnapshot:async()=>({status:'ready',snapshot:{generation:randomUUID(),published:{},staging:{}}}),
      reconcileEventMetadata:async args=>{published.push(args);return {status:'ready',allowed:!args.withdraw};}};
    const {reconcile}=createDiscordMetadataReconcile({config,store,client});
    if(['malformed','scope failure'].includes(mode)){await assert.rejects(reconcile({channelId:privateThread}));assert.equal(published.length,0);}
    else {assert.equal((await reconcile({channelId:privateThread})).allowed,mode==='private allowed');assert.equal(published.length,1);assert.equal(published[0].withdraw,mode==='private denied');assert(requests.includes(`/channels/${privateThread}/thread-members/@me`));}
  }
});
