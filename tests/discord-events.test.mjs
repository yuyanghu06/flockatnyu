import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {WebSocketShardEvents as E} from '@discordjs/ws';
import {createDiscordEventListener} from '../server/discord/event-listener.js';
import {createDiscordGateway} from '../server/discord/gateway.js';
import {createDiscordEventState} from '../server/discord/event-state.js';
import {readDiscordEventConfig} from '../server/discord/event-config.js';
import {runDiscordEvents} from '../server/discord/event-cli.js';
import {createDiscordClient} from '../server/discord/client.js';

const guild='123456789012345678', channel='223456789012345678', parent='323456789012345678', category='423456789012345678';
const source='22222222-2222-4222-8222-222222222222';
const config={enabled:true,guildId:guild,botToken:'fixture-private-token',maxPending:100};
const message=(t='MESSAGE_CREATE',extra={})=>({t,d:{guild_id:guild,channel_id:channel,id:'523456789012345678',...extra}});
function fixture() {
  const f={policy:{guildId:guild,revision:1,paused:false,discoveryEnabled:true,excludedChannelIds:[],excludedCategoryIds:[]},
    rows:[{guildId:guild,channelId:channel,sourceId:source,enabled:true}],
    channels:[{id:channel,guild_id:guild,type:0,parent_id:null}],queue:new Map(),attempts:[],calls:[],policyReads:0};
  f.store={getPolicy:async()=>{f.policyReads++;await f.onPolicy?.(f.policyReads);return {status:'ready',policy:structuredClone(f.policy)};},
    listSyncChannels:async()=>{await f.onSources?.();return {status:'ready',channels:structuredClone(f.rows)};}};
  f.client={getChannel:async({channelId})=>{f.calls.push(['channel',channelId]);if(f.permissionFailure)throw Object.assign(Error('permission_denied'),{code:'permission_denied'});return structuredClone(f.channels.find(c=>c.id===channelId));},
    getGuildChannels:async()=>{f.calls.push(['guild']);return structuredClone(f.channels);},
    getMessage:()=>assert.fail('collector must not hydrate messages'),getMessages:()=>assert.fail('collector must not read history')};
  f.refreshMetadata=async()=>{f.calls.push(['refresh']);await f.onRefresh?.();};
  f.inputStore={enqueue:async args=>{f.attempts.push(structuredClone(args));await f.onEnqueue?.(args);const duplicate=f.queue.has(args.inputId);f.queue.set(args.inputId,args.envelope);return {status:duplicate?'duplicate':'queued'};}};
  f.make=(overrides={})=>createDiscordEventListener({config,store:f.store,client:f.client,inputStore:f.inputStore,refreshMetadata:f.refreshMetadata,now:()=>new Date('2026-10-17T12:00:00Z'),...overrides});
  return f;
}

test('native create, partial edit, delete and bulk delete preserve exact payloads and replay identities',async()=>{
  const f=fixture(),listener=f.make();
  const events=[message('MESSAGE_CREATE',{content:'original',author:{id:'623456789012345678'},attachments:[{id:'723456789012345678',url:'https://fixture.invalid/file'}]}),
    message('MESSAGE_UPDATE',{content:'corrected',edited_timestamp:'2026-10-17T12:01:00Z'}),message('MESSAGE_DELETE'),
    {t:'MESSAGE_DELETE_BULK',d:{guild_id:guild,channel_id:channel,ids:['523456789012345678','623456789012345678']}}];
  for(const event of events){assert.equal((await listener.handle(event)).status,'queued');assert.deepEqual(f.attempts.at(-1).envelope.payload,event.d);assert.equal((await listener.handle(structuredClone(event))).status,'duplicate');}
  assert.equal(f.queue.size,4);assert.deepEqual([...f.queue.values()].map(e=>e.event_type),['message_created','message_updated','message_deleted','messages_deleted']);
  assert(!Object.hasOwn([...f.queue.values()][1].payload,'author'));
  assert.equal((await listener.handle(message('MESSAGE_UPDATE',{content:'another edit'}))).status,'queued');assert.equal(f.queue.size,5);
});

test('unrelated voice and stage channels do not block text event ingestion',async()=>{
  const f=fixture();
  f.channels.push({id:'823456789012345678',guild_id:guild,type:2,parent_id:null},
    {id:'923456789012345678',guild_id:guild,type:13,parent_id:null});
  assert.equal((await f.make().handle(message())).status,'queued');
  assert.equal(f.queue.size,1);
});

for(const mode of ['disabled','foreign guild','unhandled event','paused','discovery disabled','excluded channel','excluded category','thread under excluded channel','thread under excluded category','unknown ancestry','cyclic ancestry','foreign ancestry','permission failure','manual disabled','refresh failure']) {
  test(`collector denies ${mode} without queue writes`,async()=>{
    const f=fixture();let event=message(),overrides={};
    if(mode==='disabled')overrides.config={...config,enabled:false};
    if(mode==='foreign guild')event.d.guild_id='999456789012345678';
    if(mode==='unhandled event')event.t='GUILD_MEMBER_UPDATE';
    if(mode==='paused')f.policy.paused=true;
    if(mode==='discovery disabled')f.policy.discoveryEnabled=false;
    if(mode==='excluded channel')f.policy.excludedChannelIds=[channel];
    if(mode==='excluded category'){f.channels[0].parent_id=category;f.channels.push({id:category,type:4,guild_id:guild,parent_id:null});f.policy.excludedCategoryIds=[category];}
    if(mode.startsWith('thread under')){f.channels[0].type=11;f.channels[0].parent_id=parent;f.channels.push({id:parent,type:0,guild_id:guild,parent_id:category},{id:category,type:4,guild_id:guild,parent_id:null});if(mode.endsWith('category'))f.policy.excludedCategoryIds=[category];else f.policy.excludedChannelIds=[parent];}
    if(mode==='unknown ancestry')f.channels[0].parent_id=category;
    if(mode==='cyclic ancestry'){f.channels[0].parent_id=category;f.channels.push({id:category,type:4,guild_id:guild,parent_id:channel});}
    if(mode==='foreign ancestry'){f.channels[0].parent_id=category;f.channels.push({id:category,type:4,guild_id:'999456789012345678',parent_id:null});}
    if(mode==='permission failure')f.permissionFailure=true;
    if(mode==='manual disabled')f.rows[0].enabled=false;
    if(mode==='refresh failure'){f.rows=[];f.onRefresh=()=>{throw Error('metadata_refresh_failed');};}
    try {assert(['ignored','disabled'].includes((await f.make(overrides).handle(event)).status));}catch(e){assert(['permission_denied','metadata_refresh_failed',...(mode==='foreign ancestry'?['invalid_metadata']:[])].includes(e.message));}
    assert.equal(f.queue.size,0);assert.equal(f.attempts.length,0);
  });
}

test('new eligible channels and private threads join dynamic guild scope only after metadata registration',async()=>{
  for(const type of [0,5,10,11,12]){const f=fixture();f.rows=[];f.channels[0].type=type;if(type>=10){f.channels[0].parent_id=parent;f.channels.push({id:parent,type:0,guild_id:guild,parent_id:null});}
    f.onRefresh=()=>{f.rows=[{guildId:guild,channelId:channel,sourceId:source,enabled:true}];};
    assert.equal((await f.make().handle(message())).status,'queued');assert(f.calls.some(c=>c[0]==='refresh'));assert.equal(f.queue.size,1);
  }
});

test('real REST client rechecks effective permissions and private membership with metadata-only requests',async()=>{
  for(const mode of ['permitted','missing history','private permitted','private denied','foreign response']) {
    const f=fixture(),paths=[],privateThread=mode.startsWith('private');
    if(privateThread){f.channels[0].type=12;f.channels[0].parent_id=parent;f.channels.push({id:parent,type:0,guild_id:guild,parent_id:null});}
    const client=createDiscordClient({config:{...config,configured:true},fetchImpl:async(url,options)=>{
      const path=new URL(url).pathname.replace('/api/v10','');paths.push(path);assert.equal(options.headers.Authorization,`Bot ${config.botToken}`);assert(!/\/messages(?:\/|$)/.test(path));
      if(path===`/channels/${channel}/thread-members/@me`)return Response.json({id:'823456789012345678'},{status:mode==='private denied'?403:200});
      if(path.startsWith('/channels/')){const value=structuredClone(f.channels.find(c=>path===`/channels/${c.id}`));if(mode==='foreign response')value.guild_id='999456789012345678';return Response.json(value);}
      if(path==='/users/@me')return Response.json({id:'823456789012345678'});
      if(path===`/guilds/${guild}/roles`)return Response.json([{id:guild,permissions:mode==='missing history'?'1024':'66560'}]);
      if(path===`/guilds/${guild}/members/823456789012345678`)return Response.json({roles:[]});
      if(path===`/guilds/${guild}/channels`)return Response.json(f.channels);
      assert.fail(`unexpected endpoint ${path}`);
    }});
    if(['missing history','private denied','foreign response'].includes(mode))assert.equal((await f.make({client}).handle(message())).status,'ignored');
    else assert.equal((await f.make({client}).handle(message())).status,'queued');
    assert.equal(f.queue.size,['permitted','private permitted'].includes(mode)?1:0);
    if(privateThread&&mode!=='foreign response')assert(paths.includes(`/channels/${channel}/thread-members/@me`));
  }
});

for(const mode of ['missing detail parent','conflicting detail category','conflicting thread parent','missing parent detail ancestry'])test(`incomplete or conflicting live ancestry fails closed: ${mode}`,async()=>{
  const f=fixture();f.channels[0].parent_id=category;f.channels.push({id:category,type:4,guild_id:guild,parent_id:null});f.policy.excludedCategoryIds=[category];
  const getChannel=f.client.getChannel;
  if(mode.includes('thread')||mode.includes('parent detail')){f.channels[0].type=11;f.channels[0].parent_id=parent;f.channels.push({id:parent,type:0,guild_id:guild,parent_id:category});}
  f.client.getChannel=async args=>{const detail=await getChannel(args);
    if(mode==='missing detail parent'&&args.channelId===channel)delete detail.parent_id;
    if(mode==='conflicting detail category'&&args.channelId===channel)detail.parent_id=null;
    if(mode==='conflicting thread parent'&&args.channelId===channel){detail.parent_id='923456789012345678';f.channels.push({id:detail.parent_id,type:0,guild_id:guild,parent_id:null});}
    if(mode==='missing parent detail ancestry'&&args.channelId===parent)delete detail.parent_id;
    return detail;};
  const result=await f.make().handle(message()).catch(error=>({status:'rejected',code:error.code||error.message}));
  assert(['ignored','rejected'].includes(result.status));assert.equal(f.attempts.length,0);
});

test('concurrent direct listener callers retain their own source authorization context',async()=>{
  const f=fixture(),gate=deferred(),second='923456789012345678',otherSource='33333333-3333-4333-8333-333333333333';
  f.rows.push({guildId:guild,channelId:second,sourceId:otherSource,enabled:true});f.channels.push({id:second,guild_id:guild,type:0,parent_id:null});
  f.onEnqueue=async()=>{if(f.attempts.length===1)await gate.promise;};const listener=f.make();
  const a=listener.handle(message()),b=listener.handle(message('MESSAGE_CREATE',{channel_id:second,id:'923456789012345679'}));await new Promise(r=>setImmediate(r));assert.equal(f.attempts.length,1);
  gate.resolve();assert.deepEqual((await Promise.all([a,b])).map(r=>r.status),['queued','queued']);assert.deepEqual(f.attempts.map(a=>a.envelope.source_id),[source,otherSource]);
});

for(const mode of ['policy revision','pause','source replacement','manual disable','discovery disabled'])test(`final updater recheck rejects concurrent ${mode}`,async()=>{
  const f=fixture();f.onPolicy=count=>{if(count===3){if(mode==='policy revision')f.policy.revision++;if(mode==='pause')f.policy.paused=true;if(mode==='source replacement')f.rows[0].sourceId='33333333-3333-4333-8333-333333333333';if(mode==='manual disable')f.rows[0].enabled=false;if(mode==='discovery disabled')f.policy.discoveryEnabled=false;}};
  await assert.rejects(f.make().handle(message()),/policy_changed/);assert.equal(f.attempts.length,0);
});

test('malformed events, invalid catalogue UUID and oversized original fail before durable enqueue',async()=>{
  for(const event of [message('MESSAGE_CREATE',{id:'bad'}),message('MESSAGE_DELETE_BULK',{ids:[]}),message('MESSAGE_DELETE_BULK',{ids:Array(101).fill('123')}),message('MESSAGE_UPDATE',{content:'x'.repeat(60001)})]){
    const f=fixture();await assert.rejects(f.make().handle(event),/invalid_event|enqueue_failed/);assert.equal(f.attempts.length,0);
  }
  const f=fixture();f.rows[0].sourceId='not-a-uuid';await assert.rejects(f.make().handle(message()),/catalogue_unavailable/);assert.equal(f.attempts.length,0);
});

const session=(sequence=1)=>({sessionId:'fixture-session',resumeURL:'wss://gateway.discord.gg',sequence,shardId:0,shardCount:1});
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
async function gatewayFixture(overrides={}){
  const f={manager:new EventEmitter(),saves:[],logs:[],handled:[],destroyed:0,failures:0,checkpoint:null};
  f.manager.connect=async()=>{f.connected=true;};f.manager.destroy=async options=>{f.destroyed++;f.destroyOptions=options;};
  f.listener={handle:async event=>{f.handled.push(event);return {status:'queued'};}};
  f.state={load:async()=>f.checkpoint,save:async(expected,next)=>{assert.deepEqual(expected,f.checkpoint);f.saves.push(structuredClone(next));f.checkpoint=structuredClone(next);}};
  f.gateway=await createDiscordGateway({config,listener:f.listener,state:f.state,refreshMetadata:async()=>{f.refreshed=(f.refreshed||0)+1;},createRest:token=>{assert.equal(token,config.botToken);return {fixture:true};},
    createManager:options=>{f.options=options;return f.manager;},log:value=>f.logs.push(value),onFailure:()=>{f.failures++;},...overrides});
  f.dispatch=(t,s,d=message().d)=>{f.options.updateSessionInfo(0,session(s));f.manager.emit(E.Dispatch,{t,s,d},0);};
  return f;
}

for(const code of ['permission_denied','not_found','channel_scope_denied','discord_unavailable'])test(`channel access result ${code} has appropriate cross-channel checkpoint behavior`,async()=>{
  const fixtureData=fixture(),getChannel=fixtureData.client.getChannel,unrelated='923456789012345678';let first=true;
  fixtureData.channels.push({id:unrelated,type:0,guild_id:guild,parent_id:null});fixtureData.rows.push({channelId:unrelated,guildId:guild,sourceId:'33333333-3333-4333-8333-333333333333',enabled:true});
  fixtureData.client.getChannel=async args=>{if(first){first=false;throw Object.assign(Error('private-diagnostic'),{code});}return getChannel(args);};
  const f=await gatewayFixture({listener:fixtureData.make()});f.dispatch('MESSAGE_CREATE',2);f.dispatch('MESSAGE_CREATE',3,{...message().d,channel_id:unrelated,id:'923456789012345679'});await f.gateway.drain();
  if(code==='discord_unavailable'){assert.equal(f.gateway.status().status,'failed');assert.equal(f.saves.length,0);assert.equal(fixtureData.queue.size,0);}
  else {assert.equal(f.gateway.status().status,'connecting');assert.deepEqual(f.saves.map(s=>s.session.sequence),[2,3]);assert.equal(fixtureData.queue.size,1);}
  assert(!JSON.stringify(f.logs).includes('private-diagnostic'));await f.gateway.stop();
});

test('gateway SDK options use only guild/messages/content intents and resume from durable checkpoint',async()=>{
  const initial={session:session(40)};const f=await gatewayFixture({state:{load:async()=>initial,save:async()=>{}}});
  assert.equal(f.options.intents,1|512|32768);assert.equal(f.options.shardCount,1);assert.deepEqual(f.options.shardIds,[0]);assert.equal(f.options.compression,null);
  assert.deepEqual(await f.options.retrieveSessionInfo(0),initial.session);await f.gateway.start();assert.equal(f.connected,true);
  f.manager.emit(E.Ready);assert.equal(f.gateway.status().status,'ready');f.manager.emit(E.Closed);assert.equal(f.gateway.status().status,'connecting');f.manager.emit(E.Resumed);assert.equal(f.gateway.status().status,'ready');
  await f.gateway.stop();assert.equal(f.destroyed,1);assert.equal(f.destroyOptions.code,4200);
});

test('READY dispatch establishes restart state and later ignored events cannot bypass pending writes',async()=>{
  const f=await gatewayFixture();f.dispatch('READY',1,{session_id:'fixture-session',resume_gateway_url:'wss://gateway.discord.gg'});await f.gateway.drain();assert.equal(f.checkpoint.session.sequence,1);
  f.options.updateSessionInfo(0,session(2));f.manager.emit(E.Dispatch,{t:'MESSAGE_CREATE',s:2,d:message().d},1);await f.gateway.drain();assert.equal(f.handled.length,0);assert.equal(f.checkpoint.session.sequence,1);
  f.dispatch('GUILD_MEMBER_UPDATE',3,{guild_id:guild});await f.gateway.drain();assert.equal(f.handled.length,0);assert.equal(f.checkpoint.session.sequence,3);await f.gateway.stop();
});

test('quiet RESUMED checkpoint waits for replayed inputs and advances the next restart',async()=>{
  const gate=deferred(),f=await gatewayFixture();
  f.listener.handle=async()=>{await gate.promise;return {status:'queued'};};
  f.dispatch('MESSAGE_CREATE',2);f.dispatch('RESUMED',20,{});
  await new Promise(resolve=>setImmediate(resolve));assert.equal(f.saves.length,0);
  gate.resolve();await f.gateway.drain();assert.deepEqual(f.saves.map(s=>s.session.sequence),[2,20]);
  const next=await gatewayFixture({state:{load:async()=>f.checkpoint,save:async()=>{}}});
  assert.equal(next.options.retrieveSessionInfo(0).sequence,20);
  await f.gateway.stop();await next.gateway.stop();
});

for(const failed of [false,true])test(`unhandled dispatch respects prior durable work, failure=${failed}`,async()=>{
  const gate=deferred(),f=await gatewayFixture();
  f.listener.handle=async()=>{await gate.promise;if(failed)throw Error('unavailable');return {status:'queued'};};
  f.dispatch('MESSAGE_CREATE',2);f.dispatch('GUILD_CREATE',3,{id:guild});
  await new Promise(resolve=>setImmediate(resolve));assert.equal(f.saves.length,0);
  gate.resolve();await f.gateway.drain();
  assert.deepEqual(f.saves.map(s=>s.session.sequence),failed?[]:[2,3]);
  await f.gateway.stop();
});

test('failed metadata refresh prevents that checkpoint and stops later queue dispatch',async()=>{
  const f=await gatewayFixture({refreshMetadata:async()=>{throw Error('private-metadata-error');}});f.dispatch('CHANNEL_CREATE',2,{guild_id:guild});f.dispatch('MESSAGE_CREATE',3);await f.gateway.drain();
  assert.equal(f.saves.length,0);assert.equal(f.handled.length,0);assert.equal(f.gateway.status().status,'failed');assert(!JSON.stringify(f.logs).includes('private-metadata-error'));await f.gateway.stop();
});

test('failed foreground reconciliation preserves the metadata checkpoint and stops later native originals',async()=>{
  const f=await gatewayFixture({reconcileMetadata:async()=>{throw Error('metadata_reconcile_failed');}});
  f.dispatch('CHANNEL_CREATE',2,{guild_id:guild,id:channel});f.dispatch('MESSAGE_CREATE',3);await f.gateway.drain();
  assert.deepEqual(f.saves,[]);assert.equal(f.handled.length,0);assert.equal(f.failures,1);assert.equal(f.gateway.status().status,'failed');
  await f.gateway.stop();
});

test('foreground listener distinguishes malformed foreign scope from a verified permission denial',async()=>{
  for(const code of ['channel_scope_denied','permission_denied']){
    const data=fixture();data.client.getChannel=async()=>{throw Object.assign(Error('inert upstream detail'),{code});};
    const f=await gatewayFixture({listener:data.make({reconcileMetadata:async()=>assert.fail('Failed REST check must not publish metadata')})});
    f.dispatch('MESSAGE_CREATE',2);await f.gateway.drain();assert.equal(data.queue.size,0);
    assert.deepEqual(f.saves.map(s=>s.session.sequence),code==='permission_denied'?[2]:[]);
    assert.equal(f.failures,code==='permission_denied'?0:1);await f.gateway.stop();
  }
});

test('ordered durable enqueue gates checkpoint; restart uses committed sequence and replay is duplicate',async()=>{
  const listenerFixture=fixture(),listener=listenerFixture.make(),gate=deferred();let first=true;
  listenerFixture.onEnqueue=async()=>{if(first){first=false;await gate.promise;}};
  const f=await gatewayFixture({listener});f.dispatch('MESSAGE_CREATE',2);f.dispatch('MESSAGE_UPDATE',3,{...message().d,content:'updated'});
  await new Promise(r=>setImmediate(r));assert.equal(f.saves.length,0);assert.equal(listenerFixture.queue.size,0);
  gate.resolve();await f.gateway.drain();assert.deepEqual(f.saves.map(s=>s.session.sequence),[2,3]);assert.equal(listenerFixture.queue.size,2);
  const restarted=await gatewayFixture({listener,state:{load:async()=>f.checkpoint,save:async()=>{}}});assert.equal(restarted.options.retrieveSessionInfo(0).sequence,3);
  restarted.dispatch('MESSAGE_UPDATE',3,{...message().d,content:'updated'});await restarted.gateway.drain();assert.equal(listenerFixture.queue.size,2);await f.gateway.stop();await restarted.gateway.stop();
});

for(const mode of ['enqueue failure','checkpoint failure','backpressure','socket error'])test(`gateway ${mode} closes and fails without unsafe checkpoint or leaked content`,async()=>{
  const f=await gatewayFixture({config:{...config,maxPending:1}}),gate=deferred();
  if(mode==='enqueue failure')f.listener.handle=async()=>{throw Error('private-message-token');};
  if(mode==='checkpoint failure')f.state.save=async()=>{throw Error('private-message-token');};
  if(mode==='backpressure')f.listener.handle=async()=>{await gate.promise;return {status:'queued'};};
  if(mode==='socket error')f.manager.emit(E.Error,new Error('private-message-token'));
  else {f.dispatch('MESSAGE_CREATE',2);if(mode==='backpressure')f.dispatch('MESSAGE_CREATE',3);}
  gate.resolve();await f.gateway.drain();assert.equal(f.gateway.status().status,'failed');assert.equal(f.failures,1);assert.equal(f.destroyed,1);assert.equal(f.saves.length,0);
  assert(!JSON.stringify(f.logs).includes('private-message-token'));assert(!JSON.stringify(f.logs).includes(config.botToken));await f.gateway.stop();
});

test('gateway metadata refresh is guild scoped; shutdown does not advance in-flight event',async()=>{
  const f=await gatewayFixture();f.dispatch('CHANNEL_CREATE',2,{guild_id:guild});f.dispatch('CHANNEL_UPDATE',3,{guild_id:'999456789012345678'});await f.gateway.drain();assert.equal(f.refreshed,1);
  const gate=deferred();f.listener.handle=async()=>{await gate.promise;return {status:'queued'};};f.dispatch('MESSAGE_CREATE',4);await new Promise(r=>setImmediate(r));const stopping=f.gateway.stop();gate.resolve();await stopping;assert.equal(f.checkpoint.session.sequence,3);
  f.dispatch('MESSAGE_CREATE',5);await f.gateway.drain();assert.equal(f.checkpoint.session.sequence,3);
});

test('invalid durable and SDK sessions are rejected before unsafe resume',async()=>{
  for(const value of [{},{session:session(-1)},{session:{...session(),resumeURL:'https://fixture.invalid'}},{session:{...session(),resumeURL:'wss://gateway.discord.gg@fixture.invalid'}}])await assert.rejects(gatewayFixture({state:{load:async()=>value}}),/invalid_checkpoint/);
  const f=await gatewayFixture();assert.throws(()=>f.options.updateSessionInfo(0,{...session(),shardCount:2}),/invalid_gateway_session/);f.options.updateSessionInfo(0,null);assert.deepEqual(f.logs,[{status:'collector_failed',stage:'gateway_session',errorCode:'invalid_gateway_session',shardId:0},{status:'session_reset',stage:'gateway_session',coverage:'possible_gap_no_backfill'}]);await f.gateway.stop();
});

test('session RPC uses service-only POST checkpoint CAS, exact guild key and bounded response',async()=>{
  const env={SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'fixture-service-key',DISCORD_GUILD_ID:guild},calls=[];
  const state=createDiscordEventState({env,fetchImpl:async(url,options)=>{calls.push({url,options});return Response.json(calls.length===1?null:true);}});
  assert.equal(await state.load(),null);await state.save(null,{session:session(4)});
  assert.equal(calls[0].url,'https://fixture.supabase.co/rest/v1/rpc/agent_subscription_get_state');assert.equal(calls[1].options.method,'POST');assert.equal(calls[1].options.redirect,'error');assert.equal(calls[1].options.headers.authorization,'Bearer fixture-service-key');
  assert.deepEqual(JSON.parse(calls[1].options.body),{p_key:`subscription:discord:${guild}`,p_expected:null,p_next:{session:session(4)}});
  await assert.rejects(createDiscordEventState({env,fetchImpl:async()=>Response.json(false)}).save(null,{}),/checkpoint_conflict/);
  for(const response of [new Response('denied',{status:403}),new Response('x'.repeat(16385)),new Response('invalid json')])await assert.rejects(createDiscordEventState({env,fetchImpl:async()=>response}).load());
  for(const url of ['http://fixture.invalid','https://fixture.invalid/path','https://user:secret@fixture.invalid','https://fixture.invalid/?query'])assert.throws(()=>createDiscordEventState({env:{...env,SUPABASE_URL:url}}),/not_configured/);
});

test('CLI defaults disabled with no gateway or external calls and validates command/config before startup',async()=>{
  let calls=0;const createGateway=()=>{calls++;assert.fail('gateway must not be created');};
  assert.equal(readDiscordEventConfig({}).enabled,false);
  assert.equal(readDiscordEventConfig({DISCORD_EVENTS_ENABLED:'true',ASSISTANT_ALLOWED_SOURCE_IDS:''}).enabled,true);
  assert.deepEqual(await runDiscordEvents({args:['serve'],env:{},createGateway}),{status:'disabled'});
  assert.deepEqual(await runDiscordEvents({args:['archive'],env:{},createGateway}),{status:'invalid_command'});
  assert.deepEqual(await runDiscordEvents({args:['serve'],env:{DISCORD_EVENTS_ENABLED:'true'},createGateway}),{status:'not_configured'});assert.equal(calls,0);
});
