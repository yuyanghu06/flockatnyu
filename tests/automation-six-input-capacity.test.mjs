import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {createAutomationAdapters} from '../server/automation/adapters.js';
import {createAutomationHandler} from '../server/automation/handler.js';
import {createAutomationStore} from '../server/automation/store.js';
import {createBoundedResults} from '../server/automation/bounded-result.js';
import {readAutomationConfig} from '../server/automation/config.js';
import {canonicalJson} from '../server/automation/validation.js';

const config=readAutomationConfig({AGENT_AUTOMATION_ENABLED:'true',AGENT_AUTOMATION_MAX_INPUTS:'6',AGENT_AUTOMATION_MAX_RUN_MS:'600000'});
const stamp='2026-10-23T08:00:00.000Z',clock=()=>new Date(stamp);
const evidence={startedAt:new Date().toISOString(),scope:'Zero inference; synthetic adapter transports and isolated PGlite only.',counterUnit:'Injected adapter method invocations, not HTTP requests. Real Discord methods may perform additional nested requests.',limits:config,observations:[]};
const directory=new URL('../evidence/gogreek-six-capacity-20261023/',import.meta.url);
after(async()=>{await mkdir(directory,{recursive:true});await writeFile(new URL('results.json',directory),JSON.stringify({...evidence,finishedAt:new Date().toISOString()},null,2)+'\n');});
const channel=(id,parent_id=null,type=0)=>({id,guild_id:'100',parent_id,type});
const input=(sourceId,channelId,id,content='I will attend the existing event')=>({uuid:randomUUID(),raw_response:{source:'discord',source_id:sourceId,event_type:'message_created',event_id:id,revision:'1',received_at:stamp,payload:{id,guild_id:'100',channel_id:channelId,timestamp:stamp,author:{id:String(400+Number(id))},content}}});
function authorizationFixture(threads=false){
 const parents=[channel('700','800'),channel('701','800')],category=channel('800',null,4);
 const selected=threads?[channel('200','700',11),channel('201','700',12),channel('202','701',11),channel('203','800'),channel('204','800'),channel('205','800')]:Array.from({length:6},(_,i)=>channel(String(200+i)));
 const bindings=new Map(selected.map(row=>[row.id,randomUUID()])),calls=[];
 const state={policy:{guildId:'100',revision:1,paused:false,discoveryEnabled:true,excludedCategoryIds:[],excludedChannelIds:[]},catalogue:[...selected,...(threads?[...parents,category]:[])].map(row=>({enabled:bindings.has(row.id),guildId:'100',channelId:row.id,sourceId:bindings.get(row.id),type:row.type,parentId:row.parent_id}))};
 const live=[...selected,...(threads?[...parents,category]:[])],metadata=threads?live.filter(row=>![11,12].includes(row.type)):live;
 const record=(name,args)=>calls.push({name,...args});
 const adapters=createAutomationAdapters({env:{ASSISTANT_ALLOWED_SOURCE_IDS:[...bindings.values()].join(',')},config,now:clock,fetchImpl:async()=>{throw Error('Unexpected network request');},dependencies:{
  googleConfig:{configured:false},googleClient:{configured:false},calendarConfig:{configured:false},calendarClient:{configured:false},memberConfig:{configured:false},memberClient:{configured:false},discordConfig:{configured:true,guildId:'100'},discordTools:{tools:[]},mapEventService:{configured:false},mapSourceAuthorizer:async()=>false,
  discordStore:{getPolicy:async()=>{record('policy');return {status:'ready',policy:structuredClone(state.policy)};},listSyncChannels:async()=>{record('catalogue');return {status:'ready',channels:structuredClone(state.catalogue)};}},
  discordClient:{getGuildChannels:async()=>{record('guild');return structuredClone(metadata);},getChannel:async args=>{record('channel',{channelId:args.channelId,allowContainer:args.allowContainer===true});return structuredClone(live.find(row=>row.id===args.channelId));}},
 }});
 const inputs=selected.map((row,i)=>input(bindings.get(row.id),row.id,String(300+i)));
 return {adapters,inputs,calls,state,counts:()=>calls.reduce((out,row)=>(out[row.name]=(out[row.name]||0)+1,out),{}),authorize:()=>adapters.authorizeEvents({events:inputs.map(row=>structuredClone(row.raw_response)),principal:adapters.principal})};
}

for(const threads of [false,true])test(`six distinct ${threads?'thread/parent':'ordinary'} channel bindings receive fresh complete authorization`,async()=>{
 const f=authorizationFixture(threads);assert.equal(await f.authorize(),true);
 const expected={policy:1,catalogue:1};assert.deepEqual(f.counts(),expected);
 assert(!f.calls.some(row=>['guild','channel'].includes(row.name)),'Queue authorization reads saved metadata only');
 const first=f.calls.length;assert.equal(await f.authorize(),true);assert.equal(f.calls.length,2*first,'A later boundary performs fresh checks, not a whole-run cache');
 evidence.observations.push({case:threads?'six-thread-parent-authorization':'six-channel-authorization',boundInputs:6,perBoundary:expected,totalBoundaries:2,totalRequests:f.calls.length});
});

for(const threads of [false,true])test(`reservation-time ${threads?'thread-parent exclusion':'source rebinding'} denies the real six-input handler action`,async()=>{
 const f=authorizationFixture(threads),stats={scriptedReplies:0,authBoundaries:0,reservations:0,writes:0,finish:0,releases:0};
 const before=structuredClone(f.inputs),leaseToken=randomUUID();
 const store={configured:true,claim:async()=>({status:'ready',leaseToken,inputs:f.inputs}),renew:async()=>({status:'ready'}),action:async({complete})=>{if(!complete){stats.reservations++;if(threads)f.state.policy.excludedChannelIds=['700'];else f.state.catalogue[5].sourceId=randomUUID();}return {status:complete?'completed':'execute'};},finish:async()=>{stats.finish++;return {status:'ready'};},release:async()=>{stats.releases++;return {status:'ready'};}};
 const handler=createAutomationHandler({config,store,principal:f.adapters.principal,now:clock,authorizeEvents:async args=>{stats.authBoundaries++;return f.adapters.authorizeEvents(args);},tools:[{name:'save',description:'Synthetic business write',idempotent:true,parameters:{type:'object',properties:{},additionalProperties:false},execute:async()=>{stats.writes++;return {status:'ready'};}}],provider:{toolTurn:async()=>{stats.scriptedReplies++;return {stopReason:'tool_calls',toolCalls:[{id:'attempt',name:'save',arguments:{inputIds:f.inputs.map(row=>row.uuid),arguments:{}}}]};}}});
 assert.equal((await handler.tick()).status,'forbidden');assert.deepEqual(stats,{scriptedReplies:1,authBoundaries:3,reservations:1,writes:0,finish:0,releases:1});assert.deepEqual(f.inputs,before);
 const expected={policy:3,catalogue:3};assert.deepEqual(f.counts(),expected);
 evidence.observations.push({case:threads?'thread-parent-revoked-after-reservation':'source-rebound-after-reservation',...stats,requests:f.counts(),queuedInputsPreserved:6});
});

test('six-input payload and observed context traverse a complete lossless fragment chain through the real handler',async()=>{
 const f=authorizationFixture(),inputs=f.inputs.map(row=>({...row,raw_response:{...row.raw_response,payload:{...row.raw_response.payload,content:'🙂漢字'.repeat(350)}}}));
 const result={status:'ready',task:{uuid:randomUUID(),info:{inputs,request:{operation:'participation',calendarKind:'club',calendarEventId:'existing123'},batchContext:{preceding:[{content:'Observed source context '.repeat(400)}]},executionHistory:[{kind:'api_response',result:{status:'ready',eventId:'existing123',notes:'Preserve unchanged human notes'}}]}}};
 const fragments=createBoundedResults(),parts=[],log=[];let peakMessages=0,peakEnvelope=0,scriptedReplies=0,toolCalls=0,queueFinished=false,chainId;
 const observe=value=>{peakEnvelope=Math.max(peakEnvelope,Buffer.byteLength(canonicalJson(value)));return value;};
 const tools=[{name:'read_batch_context',description:'Synthetic saved context already fetched for six inputs',readOnly:true,parameters:{type:'object',properties:{},additionalProperties:false},execute:async()=>observe(fragments.bound(result))},{...fragments.tool,execute:async(args,context)=>observe(await fragments.tool.execute(args,context))}];
 const leaseToken=randomUUID(),store={configured:true,claim:async()=>({status:'ready',leaseToken,inputs}),renew:async()=>({status:'ready'}),finish:async({handledInputIds})=>{assert.deepEqual(new Set(handledInputIds),new Set(inputs.map(row=>row.uuid)));queueFinished=true;return {status:'ready'};},release:async()=>({status:'ready'})};
 const provider={toolTurn:async request=>{scriptedReplies++;peakMessages=Math.max(peakMessages,Buffer.byteLength(JSON.stringify(request.messages)));const id='script_'+scriptedReplies;let name='read_batch_context',args={};
  const last=request.messages.at(-1);if(last.role==='tool'){const value=JSON.parse(last.content);assert.equal(value.status,'ready');const fragment=value.fragment;assert(fragment,'The payload must actually require fragmentation');chainId??=fragment.id;assert.equal(fragment.id,chainId);assert.equal(fragment.offset,parts.join('').length);parts.push(fragment.data);
   if(fragment.nextOffset===null){assert.deepEqual(JSON.parse(parts.join('')),result);toolCalls++;return {stopReason:'tool_calls',toolCalls:[{id,name:'finish_batch',arguments:{handledInputIds:inputs.map(row=>row.uuid)}}]};}
   name='read_context_fragment';args={id:fragment.id,offset:fragment.nextOffset};
  }toolCalls++;return {stopReason:'tool_calls',toolCalls:[{id,name,arguments:{inputIds:inputs.map(row=>row.uuid),arguments:args}}]};}};
 const pipeline={beginCycle:async()=>{},afterInitial:async()=>({status:'ready',followupRequired:false,inputIds:[],context:{}}),finishCycle:async()=>({status:'ready'}),recordExecution:async row=>log.push(structuredClone(row))};
 const handler=createAutomationHandler({config,store,tools,pipeline,provider,principal:f.adapters.principal,authorizeEvents:f.adapters.authorizeEvents,now:clock});
 const outcome=await handler.tick();assert.equal(outcome.status,'completed');assert.equal(outcome.handled,6);assert.equal(outcome.followupStatus,'not_needed');assert.equal(queueFinished,true);assert(parts.length>1);assert.equal(peakEnvelope<=16384,true);assert.equal(Buffer.byteLength(JSON.stringify(inputs))<=config.maxBytes,true);assert.equal(peakMessages<262144,true);assert(scriptedReplies<=config.maxRounds);assert(toolCalls<=config.maxCalls);
 const executionBytes=log.reduce((n,row)=>n+Buffer.byteLength(canonicalJson(row)),0);assert(executionBytes<=1048576);
 evidence.observations.push({case:'six-input-lossless-fragment-handler',claimedInputBytes:Buffer.byteLength(JSON.stringify(inputs)),savedContextBytes:Buffer.byteLength(canonicalJson(result)),fragmentCount:parts.length,peakEnvelopeBytes:peakEnvelope,peakMessagesBytes:peakMessages,executionLogBytes:executionBytes,scriptedReplies,acceptedToolCalls:outcome.calls,queueFinished});
});

async function rpc(db,name,args={}){const keys=Object.keys(args);return(await db.query(`select public.${name}(${keys.map((key,i)=>key+' => $'+(i+1)).join(',')}) result`,keys.map(key=>args[key]!==null&&typeof args[key]==='object'&&!Array.isArray(args[key])?JSON.stringify(args[key]):args[key]))).rows[0].result;}
const migration=name=>readFile(new URL('../supabase/migrations/'+name,import.meta.url),'utf8');
const options={p_min_events:config.minEvents,p_max_age_seconds:config.maxAgeSeconds,p_cooldown_seconds:config.cooldownSeconds,p_lease_seconds:config.leaseSeconds,p_max_inputs:config.maxInputs,p_max_bytes:config.maxBytes};
async function reset(db){await db.exec("reset role;truncate public.agent_input_cache,public.agent_automation_state;insert into public.agent_automation_state values('runner','{}');set role service_role");}
async function enqueue(db,row,age){assert.equal((await rpc(db,'agent_automation_enqueue',{p_input_id:row.uuid,p_envelope:row.raw_response})).status,'queued');if(age!==undefined)await db.query("update public.agent_automation_state set data=jsonb_set(data,'{received_at}',to_jsonb(clock_timestamp()-make_interval(secs=>$2::int))) where key='input:'||$1::text",[row.uuid,age]);}
async function sqlUsed(db,ids){return(await db.query("select 2+sum(octet_length(jsonb_build_object('uuid',uuid,'raw_response',raw_response)::text)+1)::int bytes from public.agent_input_cache where uuid=any($1::uuid[])",[ids])).rows[0].bytes;}

test('actual queue SQL and Node store honor six-input selection, bytes, trigger, cooldown and isolated retries',async t=>{
 const db=new PGlite();try{
  await db.exec('create role anon;create role authenticated;create role service_role bypassrls;');
  for(const name of ['202610170018_agent_input_cache.sql','202610170019_agent_automation_state.sql','202610180032_scoped_agent_claim.sql','202610210036_agent_retry_quarantine.sql','202610220038_agent_empty_scope_maintenance.sql'])await db.exec(await migration(name));
  const sources=Array.from({length:6},()=>randomUUID()),outside=randomUUID(),claim=()=>rpc(db,'agent_automation_claim_scoped',{...options,p_allowed_source_ids:sources});
  await t.test('seven fresh rows wait for unchanged age trigger; exact six finish leaves seventh and unauthorized originals intact',async()=>{
   await reset(db);const rows=Array.from({length:7},(_,i)=>input(sources[i%6],String(200+i%6),String(300+i))),denied=input(outside,'999','999');for(const row of rows)await enqueue(db,row);await enqueue(db,denied,3600);assert.equal((await claim()).status,'waiting');
   for(const [i,row]of rows.entries())await db.query("update public.agent_automation_state set data=jsonb_set(data,'{received_at}',to_jsonb(clock_timestamp()-make_interval(secs=>$2::int))) where key='input:'||$1::text",[row.uuid,1900-i]);
   const before=(await db.query('select uuid,raw_response from public.agent_input_cache order by uuid')).rows,requests=[];
   const store=createAutomationStore({env:{SUPABASE_URL:'https://isolated.test',SUPABASE_SERVICE_ROLE_KEY:'synthetic-only'},fetchImpl:async(url,init)=>{const name=new URL(url).pathname.split('/').at(-1),args=JSON.parse(init.body);requests.push({name,args});return Response.json(await rpc(db,name,args));}});
   const selected=await store.claim({config,allowedSourceIds:sources});assert.equal(selected.status,'ready');assert.deepEqual(selected.inputs.map(row=>row.uuid),rows.slice(0,6).map(row=>row.uuid));assert.deepEqual((await db.query('select uuid,raw_response from public.agent_input_cache order by uuid')).rows,before);assert.equal(requests[0].args.p_max_inputs,6);assert.equal((await claim()).status,'busy');
   assert.equal(await rpc(db,'agent_automation_finish',{p_token:selected.leaseToken,p_handled_ids:[rows[6].uuid]}),false);
   const bytes=await sqlUsed(db,selected.inputs.map(row=>row.uuid));assert(bytes<=config.maxBytes);assert.equal((await store.finish({leaseToken:selected.leaseToken,handledInputIds:selected.inputs.map(row=>row.uuid)})).status,'ready');
   const remaining=(await db.query('select uuid,raw_response from public.agent_input_cache order by uuid')).rows;assert.deepEqual(remaining,before.filter(row=>[rows[6].uuid,denied.uuid].includes(row.uuid)));assert.equal((await claim()).status,'cooldown');
   evidence.observations.push({case:'actual-sql-six-and-seventh',selected:6,remainingEligible:1,remainingUnauthorized:1,sqlClaimedBytes:bytes,trigger:'waiting before age / ready after age',unclaimedFinishDenied:true,cooldownPreserved:true,nodeStoreScopedRpc:true});
  });
  await t.test('UTF8 aggregate byte limit selects fewer than six without deleting omitted inputs',async()=>{
   await reset(db);const rows=Array.from({length:6},(_,i)=>input(sources[i],String(200+i),String(400+i),'界'.repeat(4000)));for(const [i,row]of rows.entries())await enqueue(db,row,1900-i);const selected=await claim();assert.equal(selected.status,'ready');assert.equal(selected.inputs.length,5);const bytes=await sqlUsed(db,selected.inputs.map(row=>row.uuid)),allBytes=await sqlUsed(db,rows.map(row=>row.uuid));assert(bytes<=65536);assert(allBytes>65536);assert.equal((await db.query('select count(*)::int n from public.agent_input_cache')).rows[0].n,6);assert.equal(await rpc(db,'agent_automation_finish',{p_token:selected.leaseToken,p_handled_ids:selected.inputs.map(row=>row.uuid)}),true);assert.deepEqual((await db.query('select uuid from public.agent_input_cache')).rows.map(row=>row.uuid),[rows[5].uuid]);evidence.observations.push({case:'actual-sql-64k-unicode',selected:5,remaining:1,sqlClaimedBytes:bytes,sixRowBytes:allBytes,maxBytes:65536});
  });
  await t.test('retry lane still claims exactly one while preserving fresh and other retry inputs',async()=>{
   await reset(db);const rows=Array.from({length:8},(_,i)=>input(sources[i%6],String(200+i%6),String(500+i)));for(const [i,row]of rows.entries())await enqueue(db,row,1900-i);
   for(const row of rows.slice(0,2))await db.query("update public.agent_automation_state set data=data||jsonb_build_object('retry_isolated',true,'failed_attempts',1) where key='input:'||$1::text",[row.uuid]);await db.exec("update public.agent_automation_state set data=jsonb_build_object('last_lane','fresh','last_started',clock_timestamp()-interval '61 seconds') where key='runner'");
   const selected=await claim();assert.equal(selected.status,'ready');assert.deepEqual(selected.inputs.map(row=>row.uuid),[rows[0].uuid]);assert.equal(await rpc(db,'agent_automation_finish',{p_token:selected.leaseToken,p_handled_ids:[rows[0].uuid]}),true);assert.deepEqual(new Set((await db.query('select uuid from public.agent_input_cache')).rows.map(row=>row.uuid)),new Set(rows.slice(1).map(row=>row.uuid)));evidence.observations.push({case:'actual-sql-retry-isolation',maxInputs:6,selectedRetry:1,remainingRetry:1,remainingFresh:6});
  });
 }finally{await db.close();}
});
