import {isDiscordChannelExcluded} from '../server/discord/discovery.js';
import {withDiscordSourceScope} from '../server/discord/source-scope.js';
import {calendarEventReceipt} from '../server/google/calendar-receipt.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createApp} from '../server/runtime/app.js';
import {readConfig} from '../server/shared/config.js';
import {createSiteAuth,readSiteAuthConfig} from '../server/auth/site-auth.js';
import {createWebsite} from '../server/web.js';
import {createLiveDiscordRetrieval} from '../server/discord/live-retrieval.js';
import {createLiveRetrievalTools} from '../tools/discord/index.js';
import {createMapSourceAuthorizer} from '../server/map/source-access.js';
import {createDiscordChatAccess} from '../server/discord/chat-access.js';
import {EBOARD_CATEGORY_ID} from '../server/discord/channel-scope.js';
import {createAutomationAdapters} from '../server/automation/adapters.js';
import {createAutomationHandler} from '../server/automation/handler.js';
import {createEventUpdater} from '../server/automation/events.js';
import {readAutomationConfig} from '../server/automation/config.js';
import {createAutomationStore} from '../server/automation/store.js';
import {randomUUID} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {vector} from '@electric-sql/pglite-pgvector';

const guildId='100',channelId='200',messageId='300',userId='400';
const discordSource='20000000-0000-4000-8000-000000000002';
const miroSource='10000000-0000-4000-8000-000000000001';
const foreignSource='30000000-0000-4000-8000-000000000003';
const sourceUrl=`https://discord.com/channels/${guildId}/${channelId}/${messageId}`;
const calendarId='synthetic@group.calendar.google.com';
const clock=()=>new Date('2026-10-22T16:00:00.000Z');
const permissions=String(1024n|65536n|2048n|(1n<<38n));
const announcement='Tech@NYU event: Synthetic Workshop is scheduled October 24, 2026 at 6pm at Bobst.';
const channel=(id,parent_id=EBOARD_CATEGORY_ID,type=0)=>({id,guild_id:guildId,parent_id,type,name:`synthetic-${id}`,permission_overwrites:[],botPermissions:permissions});

function discordFixture() {
  const state={policy:{guildId,revision:1,paused:false,discoveryEnabled:true,excludedChannelIds:[],excludedCategoryIds:[]},
    rows:[{guildId,channelId,sourceId:discordSource,enabled:true}],metadata:[channel(EBOARD_CATEGORY_ID,null,4),channel(channelId)],reads:0,policyStatus:'ready',onRead:null,permissionDenied:false,permissionChecks:0};
  const store={configured:true,getPolicy:async()=>({status:state.policyStatus,policy:structuredClone(state.policy)}),
    listSyncChannels:async()=>({status:'ready',channels:structuredClone(state.rows.filter(row=>{const channels=new Map(state.metadata.map(item=>[item.id,item]));return !isDiscordChannelExcluded({channel:channels.get(row.channelId),channels,policy:state.policy});}))})};
  const client={configured:true,getCurrentApplication:async()=>({flags:1<<18}),getGuildChannels:async()=>structuredClone(state.metadata),
    getActiveThreads:async()=>({threads:[]}),getChannel:async({channelId:id})=>{state.permissionChecks++;if(state.permissionDenied)throw Object.assign(Error('permission_denied'),{code:'permission_denied'});return structuredClone(state.metadata.find(row=>row.id===id));},
    getMessage:async()=>{state.reads++;await state.onRead?.();return {id:messageId,channel_id:channelId,guild_id:guildId,author:{id:userId,username:'synthetic'},timestamp:clock().toISOString(),content:announcement};}};
  const config={configured:true,guildId,botToken:'synthetic',pacing:{minIntervalMs:0}};
  const service=createLiveDiscordRetrieval({config,store,client});
  return {state,store,client,config,service};
}

function websiteFixture(f=discordFixture(),extra={}) {
  const env={NODE_ENV:'production',DISCORD_GUILD_ID:guildId,ASSISTANT_ALLOWED_SOURCE_IDS:miroSource,
    SITE_DISCORD_ENABLED:'true',PUBLIC_ORIGIN:'https://club.example',SITE_ACCESS_PASSWORD:'synthetic-password-only',SITE_SESSION_SECRET:'synthetic-signing-secret-for-test-only'};
  const config=readConfig(env),siteAuth=createSiteAuth({config:readSiteAuthConfig(env),apiConfig:config});
  const authorizeSource=createMapSourceAuthorizer({liveDiscordService:f.service});
  let observedPrincipal;
  const app=createWebsite({siteAuth,apiApp:createApp({config,discordStore:f.store,liveDiscordService:f.service,
    liveDiscordTools:createLiveRetrievalTools({service:f.service,guildId}),auth:c=>siteAuth.principal(c.req.raw),
    mapPresenceService:{read:async({principal,signal})=>{observedPrincipal=principal;return {status:'ok',visible:await authorizeSource({principal,sourceId:discordSource,sourceUrl,signal})};}},...extra})});
  const cookie=siteAuth.issue(env.SITE_ACCESS_PASSWORD).split(';')[0];
  const request=(path,body,authenticated=true)=>app.fetch(new Request(env.PUBLIC_ORIGIN+path,{method:body?'POST':'GET',headers:{origin:env.PUBLIC_ORIGIN,'content-type':'application/json',...(authenticated?{cookie}:{})},...(body?{body:JSON.stringify(body)}:{})}));
  return {...f,request,siteAuth,get principal(){return observedPrincipal;}};
}

test('signed production website discovers an env-absent source on the next request and reads its exact original for map authorization',async()=>{
  const f=websiteFixture(),published=f.state.rows;f.state.rows=[];
  assert.equal((await f.request('/api/map/presence',undefined,false)).status,403);
  assert.equal((await (await f.request('/api/map/presence')).json()).visible,false);
  f.state.rows=published;
  const read=await f.request('/api/tools/read-discord-messages',{channelId,messageId,context:false});
  assert.equal(read.status,200);const result=await read.json();assert.equal(result.status,'ready');assert.equal(result.sources[0].sourceId,discordSource);assert.equal(result.sources[0].url,sourceUrl);
  assert.equal((await (await f.request('/api/map/presence')).json()).visible,true);
  assert.deepEqual(f.principal.allowedSourceIds,[miroSource,discordSource]);
  assert.equal(f.principal.allowedSourceIds.includes(foreignSource),false);assert.equal(f.principal.isAdmin,false);
});

for(const [name,revoke] of [
  ['manual disable',s=>s.rows[0].enabled=false],['channel blacklist',s=>s.policy.excludedChannelIds=[channelId]],
  ['category blacklist',s=>s.policy.excludedCategoryIds=[EBOARD_CATEGORY_ID]],['catalogue withdrawal',s=>s.rows=[]],
  ['policy outage',s=>s.policyStatus='unavailable'],['policy pause',s=>s.policy.paused=true],
  ['published bot permission revocation',s=>{s.permissionDenied=true;s.rows[0].enabled=false;}],
])test(`website exact originals and map visibility fail closed after ${name}`,async()=>{
  const f=websiteFixture();assert.equal((await (await f.request('/api/map/presence')).json()).visible,true);
  revoke(f.state);const before=f.state.reads;
  const result=await (await f.request('/api/tools/read-discord-messages',{channelId,messageId,context:false})).json();
  assert.notEqual(result.status,'ready');assert.deepEqual(result.sources??[],[]);
  assert.equal((await (await f.request('/api/map/presence')).json()).visible,false);assert.equal(f.state.reads,before);
});

test('source withdrawn during exact retrieval is discarded after the final current-catalogue recheck',async()=>{
  const f=websiteFixture();f.state.onRead=()=>{f.state.rows=[];};
  const result=await (await f.request('/api/tools/read-discord-messages',{channelId,messageId,context:false})).json();
  assert.equal(result.status,'policy_changed');assert.deepEqual(result.sources,[]);assert.equal(f.state.reads,1);
});

test('website chat runner gets the dynamic source without extending unrelated configured sources',async()=>{
  let toolPrincipal,plans=0;
  const f=discordFixture(),tools=createLiveRetrievalTools({guildId,service:f.service});
  const wrapped={...tools,execute:async args=>{toolPrincipal=args.principal;return tools.execute(args);}};
  const w=websiteFixture(f,{config:readConfig({NODE_ENV:'production',DISCORD_GUILD_ID:guildId,ASSISTANT_ALLOWED_SOURCE_IDS:miroSource,LLM_PROVIDER:'openai-compatible',LLM_MODEL:'synthetic',LLM_API_KEY:'synthetic'}),liveDiscordTools:wrapped,
    provider:{planTools:async()=>plans++?[]:[{name:'read_discord_messages',arguments:{channelId,messageId,context:false}}],async *stream(){yield 'Synthetic answer';}}});
  const response=await w.request('/api/chat',{messages:[{role:'user',content:'Read the announcement'}]});
  assert.equal(response.status,200);const frames=(await response.text()).trim().split('\n').map(JSON.parse);
  assert.ok(frames.some(row=>row.type==='done'));assert.ok(frames.find(row=>row.type==='meta').sources.some(row=>row.sourceId===discordSource));
  assert.deepEqual(toolPrincipal.allowedSourceIds,[miroSource,discordSource]);
});

test('Discord-chat newly discovered sources are restricted to the destination audience and retain explicit non-Discord grants',async()=>{
  const f=discordFixture();f.state.metadata.push(channel('201'));
  f.state.metadata.at(-1).permission_overwrites=[{id:'900',type:0,allow:'0',deny:'1024'}];
  f.state.rows.push({guildId,channelId:'201',sourceId:foreignSource,enabled:true});
  const access=createDiscordChatAccess({config:{enabled:true,guildId,allowedSourceIds:[miroSource]},store:f.store,client:f.client,
    memberClient:{getGuildMember:async()=>({user:{id:userId},roles:[]}),getGuildChannelsMetadata:async()=>f.state.metadata,
      getGuildRoles:async()=>[{id:guildId,permissions}],getGuildMetadata:async()=>({id:guildId,owner_id:'999'})}});
  const approved=await access.authorize({guildId,channelId,userId});
  assert.deepEqual(approved.principal.liveDiscord.allowedSourceIds,[discordSource]);
  assert.deepEqual(approved.principal.allowedSourceIds,[miroSource,discordSource]);
  const authorizer=createMapSourceAuthorizer({liveDiscordService:f.service});
  const scoped=await withDiscordSourceScope({principal:approved.principal,store:f.store,guildId});
  assert.equal(await authorizer({principal:scoped,sourceId:discordSource,sourceUrl}),true);
  assert.equal(await authorizer({principal:scoped,sourceId:foreignSource,sourceUrl:sourceUrl.replace('/200/','/201/')}),false);
  f.state.rows[0].enabled=false;await assert.rejects(access.authorize({guildId,channelId,userId}),{message:'discord_chat_denied'});
});

function workerFixture() {
  const f=discordFixture(),config=readAutomationConfig({AGENT_AUTOMATION_ENABLED:'true'}),calendarWrites=[];
  const adapters=createAutomationAdapters({env:{ASSISTANT_ALLOWED_SOURCE_IDS:miroSource},config,now:clock,fetchImpl:async()=>{throw Error('Unexpected network');},dependencies:{
    googleConfig:{configured:false},googleClient:{configured:false},discordConfig:f.config,discordStore:f.store,discordClient:f.client,liveDiscordService:f.service,discordTools:createLiveRetrievalTools({service:f.service,guildId}),
    calendarConfig:{configured:true,calendarId},calendarClient:{configured:true,calendarId,preflight:async()=>({status:'ready',calendarId,accessRole:'owner'}),
      listEvents:async()=>({status:'ready',events:[],nextPageToken:null,coverage:{complete:true}}),upsertEvent:async args=>{calendarWrites.push(args);return {status:'ready',...calendarEventReceipt({id:'synthetic_event',summary:args.title,description:args.description,location:args.location,start:args.start,end:args.end,status:'confirmed'},{calendarId,outcome:'created'})};}},
    miroConfig:{configured:true,boardIds:['board']},miroStore:{configured:true,authorizedBoard:async()=>({status:'ready',data:{board_id:'board',source_id:miroSource,team_id:null}})},
    miroTools:{configured:true,transport:'mcp',tools:[],prepareBoard:async()=>({status:'ready',boardContext:{format:'synthetic'}}),execute:async()=>({status:'ready',boardContext:{boards:[{boardId:'board',sourceId:miroSource,teamId:null}]}})},
  }});
  const input={uuid:randomUUID(),raw_response:{source:'discord',source_id:discordSource,event_type:'message_created',event_id:messageId,revision:'1',received_at:clock().toISOString(),payload:{id:messageId,channel_id:channelId,guild_id:guildId,author:{id:userId},timestamp:clock().toISOString(),content:announcement}}};
  const queue=[],calls=[];let onClaim;
  const store={configured:true,requiresScopedClaims:true,enqueue:async args=>{queue.push({uuid:args.inputId,raw_response:args.envelope});return {status:'queued'};},
    claim:async args=>{calls.push({kind:'claim',ids:args.allowedSourceIds});const inputs=queue.filter(row=>args.allowedSourceIds.includes(row.raw_response.source_id));onClaim?.();return inputs.length?{status:'ready',leaseToken:randomUUID(),inputs:structuredClone(inputs)}:{status:'empty'};},
    renew:async()=>({status:'ready'}),release:async()=>{calls.push({kind:'release'});return {status:'ready'};},finish:async args=>{calls.push({kind:'finish',ids:args.handledInputIds});return {status:'ready'};}};
  const handler=createAutomationHandler({...adapters,config,store,now:clock,provider:{toolTurn:async()=>{calls.push({kind:'model'});return {stopReason:'tool_calls',toolCalls:[{id:'finish_1',name:'finish_batch',arguments:{handledInputIds:queue.map(row=>row.uuid)}}]};}}});
  const updater=createEventUpdater({config,store,principal:adapters.principal,authorizeEvent:adapters.authorizeEvent,now:clock});
  const enqueue=async()=>{await adapters.resolveClaimSourceIds({principal:adapters.principal});return updater.enqueue({source:'discord',sourceId:discordSource,eventType:'message_created',eventId:messageId,revision:'1',payload:input.raw_response.payload});};
  return {...f,adapters,config,input,queue,calls,handler,enqueue,calendarWrites,set onClaim(fn){onClaim=fn;}};
}

test('actual updater enqueue -> adapter source resolution -> scoped handler claim -> model -> explicit finish accepts env-absent Discord source',async()=>{
  const f=workerFixture();assert.equal((await f.enqueue()).status,'queued');
  assert.equal((await f.handler.tick()).status,'completed');
  assert.deepEqual(f.calls.map(row=>row.kind),['claim','model','finish']);assert.deepEqual(f.calls[0].ids,[discordSource]);
  assert.ok(f.adapters.principal.allowedSourceIds.includes(discordSource));assert.ok(f.adapters.principal.allowedSourceIds.includes(miroSource));
});

test('worker catalog withdrawal before a second tick permits only an empty maintenance claim and no model',async()=>{
  const f=workerFixture();await f.enqueue();assert.equal((await f.handler.tick()).status,'completed');
  f.state.rows=[];const before=f.calls.length;assert.equal((await f.handler.tick()).status,'empty');assert.equal(f.calls.length,before+1);
  assert.deepEqual(f.calls.at(-1),{kind:'claim',ids:[]});
  assert.deepEqual(f.adapters.principal.allowedSourceIds,[miroSource]);
});

for(const [name,revoke] of [['manual disable',s=>s.rows[0].enabled=false],['channel blacklist',s=>s.policy.excludedChannelIds=[channelId]],['category blacklist',s=>s.policy.excludedCategoryIds=[EBOARD_CATEGORY_ID]],['source remap',s=>s.rows[0].sourceId=foreignSource],['published bot permission revocation',s=>{s.permissionDenied=true;s.rows[0].enabled=false;}]])
test(`worker revocation after claim blocks model and finish: ${name}`,async()=>{
  const f=workerFixture();await f.enqueue();f.onClaim=()=>revoke(f.state);
  assert.equal((await f.handler.tick()).status,'forbidden');assert.deepEqual(f.calls.map(row=>row.kind),['claim','release']);
});

test('provider-only permission loss rejects an explicit original read and cannot authorize a Calendar write',async()=>{
 const f=workerFixture(),a=f.adapters,context={principal:a.principal,inputIds:[f.input.uuid]};
 await a.resolveClaimSourceIds({principal:a.principal});await a.prepareBatch({...context,inputs:[f.input]});
 f.state.permissionDenied=true;const tool=name=>a.tools.find(row=>row.name===name);
 const read=await tool('read_discord_messages').execute({channelId,messageId,context:false},context);assert.notEqual(read.status,'ready');assert.equal(f.state.reads,0);
 const checks=f.state.permissionChecks;
 const write=await tool('upsert_calendar_event').execute({sourceKey:`discord:${guildId}:${channelId}:${messageId}`,sourceUrl,title:'Synthetic Workshop',location:'Bobst',start:{dateTime:'2026-10-24T18:00:00-04:00',timeZone:'America/New_York'},end:{dateTime:'2026-10-24T20:00:00-04:00',timeZone:'America/New_York'}},context);
 assert.equal(write.status,'forbidden_source');assert.equal(f.calendarWrites.length,0);assert.equal(f.state.permissionChecks,checks,'Calendar write does not hide another Discord permission fetch');
});

test('env-absent Discord source supports exact original Calendar provenance and revocation still blocks a later write',async()=>{
  const f=workerFixture(),a=f.adapters,context={principal:a.principal,inputIds:[f.input.uuid]};
  assert.deepEqual(await a.resolveClaimSourceIds({principal:a.principal}),[discordSource]);
  await a.prepareBatch({...context,inputs:[f.input]});
  const tool=name=>a.tools.find(t=>t.name===name),window={timeMin:'2026-10-24T00:00:00-04:00',timeMax:'2026-10-25T00:00:00-04:00'};
  assert.equal((await tool('list_calendar_events').execute(window,context)).status,'ready');
  assert.equal((await tool('read_discord_messages').execute({channelId,messageId,context:false},context)).status,'ready');
  const args={sourceKey:`discord:${guildId}:${channelId}:${messageId}`,sourceUrl,title:'Synthetic Workshop',location:'Bobst',start:{dateTime:'2026-10-24T18:00:00-04:00',timeZone:'America/New_York'},end:{dateTime:'2026-10-24T20:00:00-04:00',timeZone:'America/New_York'}};
  for(const patch of [{sourceKey:'discord:100:200:301'},{sourceUrl:sourceUrl+'0'}])assert.equal((await tool('upsert_calendar_event').execute({...args,...patch},context)).status,'forbidden_source');
  assert.equal((await tool('upsert_calendar_event').execute(args,context)).status,'ready');assert.equal(f.calendarWrites.length,1);
  assert.equal(f.calendarWrites[0].sourceKey,args.sourceKey);assert.equal(f.calendarWrites[0].sourceUrl,sourceUrl);
  f.state.rows[0].enabled=false;await a.resolveClaimSourceIds({principal:a.principal});assert.equal((await tool('upsert_calendar_event').execute(args,context)).status,'forbidden_source');assert.equal(f.calendarWrites.length,1);
});

test('source-free adapter -> handler -> production store -> executed SQL preserves quarantine TTL and expired-lease recovery without returning originals',async()=>{
  const db=new PGlite({extensions:{vector}});
  const rpc=async(name,args)=>{
    const keys=Object.keys(args),values=keys.map(key=>args[key]!==null&&typeof args[key]==='object'&&!Array.isArray(args[key])?JSON.stringify(args[key]):args[key]);
    return (await db.query(`select public.${name}(${keys.map((key,index)=>`${key} => $${index+1}`).join(',')}) value`,values)).rows[0].value;
  };
  try {
    await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create role public_probe;');
    const directory=new URL('../supabase/migrations/',import.meta.url),files=await readdir(directory);
    for(let n=1;n<=38;n++){
      const file=files.find(name=>name.endsWith('.sql')&&Number(name.slice(8,12))===n);assert.ok(file,`Migration ${n} must exist`);
      await db.exec(await readFile(new URL(file,directory),'utf8'));
    }
    await db.exec('set role service_role');
    const purge=randomUUID(),changed=randomUUID(),leased=randomUUID();
    for(const id of [purge,changed,leased])assert.equal((await rpc('agent_automation_enqueue',{p_input_id:id,p_envelope:{source:'discord',source_id:discordSource,event_type:'message_created',event_id:id,revision:'1',payload:{content:'synthetic original'}}})).status,'queued');
    for(const id of [purge,changed])await db.query("update public.agent_automation_state set data=data||jsonb_build_object('status','quarantined','quarantine_until',clock_timestamp()-interval '1 second','payload_hash',(select md5(raw_response::text) from public.agent_input_cache where uuid=$1::uuid)) where key='input:'||$1::text",[id]);
    await db.query("update public.agent_input_cache set raw_response=jsonb_set(raw_response,'{payload,content}','\"synthetic replacement\"'::jsonb) where uuid=$1",[changed]);
    // Make an active exact lease first, then expire it before the source-free tick.
    // Future quarantine deadlines keep both snapshots present for that tick.
    await db.exec("update public.agent_automation_state set data=data||jsonb_build_object('quarantine_until',clock_timestamp()+interval '1 hour') where data->>'status'='quarantined'");
    const lease=await rpc('agent_automation_claim_scoped',{p_allowed_source_ids:[discordSource],p_min_events:1,p_max_age_seconds:1800,p_cooldown_seconds:60,p_lease_seconds:120,p_max_inputs:20,p_max_bytes:65536});
    assert.equal(lease.status,'ready');assert.deepEqual(lease.inputs.map(row=>row.uuid),[leased]);
    await db.exec("update public.agent_automation_state set data=data||jsonb_build_object('quarantine_until',clock_timestamp()-interval '1 second') where data->>'status'='quarantined';update public.agent_automation_state set data=data||jsonb_build_object('lease_until',clock_timestamp()-interval '1 second','last_started',clock_timestamp()-interval '61 seconds') where key='runner'");
    const f=workerFixture();f.state.rows=[];let modelCalls=0;const requests=[];
    const store=createAutomationStore({env:{SUPABASE_URL:'https://synthetic.invalid',SUPABASE_SERVICE_ROLE_KEY:'synthetic'},fetchImpl:async(url,options)=>{
      const name=new URL(url).pathname.split('/').at(-1),args=JSON.parse(options.body);requests.push({name,ids:args.p_allowed_source_ids});
      const result=await rpc(name,args);assert.deepEqual(result,{status:'empty'},'maintenance must return no queue bodies or lease');return Response.json(result);
    }});
    const handler=createAutomationHandler({...f.adapters,config:f.config,store,now:clock,provider:{toolTurn:async()=>{modelCalls++;throw Error('No model allowed');}}});
    assert.equal((await handler.tick()).status,'empty');assert.equal(modelCalls,0);assert.deepEqual(requests,[{name:'agent_automation_claim_scoped',ids:[]}]);
    const rows=(await db.query('select uuid from public.agent_input_cache order by uuid')).rows.map(row=>row.uuid);
    assert.equal(rows.includes(purge),false);assert.equal(rows.includes(changed),true);assert.equal(rows.includes(leased),true);
    const metadata=async id=>(await db.query('select data from public.agent_automation_state where key=$1',['input:'+id])).rows[0].data;
    assert.ok(await metadata(purge),'metadata receipt survives body removal');assert.equal((await metadata(changed)).status,'quarantine_changed');
    assert.equal((await metadata(leased)).failed_attempts,1);assert.equal((await metadata(leased)).status,'pending');
    assert.equal(await rpc('agent_automation_finish',{p_token:lease.leaseToken,p_handled_ids:[leased]}),false,'expired worker cannot finish a recovered snapshot');
  } finally {await db.close();}
});
