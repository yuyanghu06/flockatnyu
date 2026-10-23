import {attachTaskReads} from './fixtures/planner-followup.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createStagedPipeline} from '../server/automation/staged-pipeline.js';
import {createBoundedResults} from '../server/automation/bounded-result.js';
import {createAutomationAdapters} from '../server/automation/adapters.js';
import {readAutomationConfig} from '../server/automation/config.js';

const sourceId=randomUUID(),gmailId=randomUUID(),clubSource=randomUUID(),memberSource=randomUUID(),inputId=randomUUID(),leaseToken=randomUUID(),personId=randomUUID();
const stamp='2026-10-22T18:00:00.000Z',expires='2026-10-23T18:00:00.000Z',url='https://discord.com/channels/100/200/300';
const original=()=>({uuid:inputId,raw_response:{source:'discord',source_id:sourceId,event_type:'message_created',event_id:'300',revision:'1',received_at:stamp,payload:{id:'300',guild_id:'100',channel_id:'200',timestamp:stamp,author:{id:'400'},content:'I will attend the workshop at Bobst'}}});
const task=()=>({uuid:randomUUID(),created_at:stamp,updated_at:stamp,expires_at:expires,info:{version:1,sourceIds:[sourceId],inputs:[original()],request:{summary:'Attach original speaker',operation:'participation',calendarEventId:'workshop123',calendarKind:'club',personId},references:[{sourceId,sourceUrl:url}],batchContext:{precedingHour:[{authorId:'401',content:'Workshop Friday at Bobst'}]},executionHistory:[]}});
async function bounded(promise){let timer;try{return await Promise.race([promise,new Promise((_resolve,reject)=>{timer=setTimeout(()=>reject(Error('Cache operation awaited a forbidden live dependency')),300);})]);}finally{clearTimeout(timer);}}
async function full(result,fragments){if(!result.fragment)return result;let text='',part=result;while(true){text+=part.fragment.data;if(part.fragment.nextOffset===null)break;part=await fragments.tool.execute({id:part.fragment.id,offset:part.fragment.nextOffset});assert.equal(part.status,'ready');}return JSON.parse(text);}
function fixture({pending=[task()],legacy='throws'}={}){
  const rows=new Map(pending.map(row=>[row.uuid,structuredClone(row)])),storage=[],history=[],legacyCalls=[],bound=[];
  const principal={id:'cache-worker',allowedSourceIds:[sourceId,gmailId,clubSource,memberSource]};
  const forbidden=name=>async()=>{legacyCalls.push(name);if(legacy==='never')return new Promise(()=>{});throw Error(`Unexpected legacy ${name}`);};
  const taskStore={configured:true,list:async args=>{storage.push({method:'list',args});return {status:'ready',tasks:structuredClone([...rows.values()])};},save:async args=>{storage.push({method:'save',args});const old=rows.get(args.task.uuid);if(old&&old.updated_at!==args.expectedUpdatedAt)return {status:'conflict'};const saved={...old,...args.task,created_at:old?.created_at??stamp,updated_at:'2026-10-22T18:01:00.000Z',expires_at:old?.expires_at??expires};rows.set(saved.uuid,saved);return {status:'ready',task:structuredClone(saved)};},resolve:async args=>{storage.push({method:'resolve',args});const row=rows.get(args.taskId);if(row?.updated_at!==args.expectedUpdatedAt)return {status:'conflict'};rows.delete(args.taskId);return {status:'ready'};}};
  attachTaskReads(taskStore,rows,{onCall:({method,...args})=>storage.push({method,args})});
  const fragments=createBoundedResults({maxBytes:8*1048576,maxEntries:64});
  const staged=createStagedPipeline({taskStore,principal,fragments,now:()=>new Date(stamp),authorizeInputs:forbidden('source read'),authorizeTask:forbidden('reference validation'),bindTask:async row=>{bound.push(row.uuid);},runSync:async()=>({status:'ready',results:[],unresolved:[]})});
  const context={principal,inputIds:[inputId]};
  return {staged,rows,storage,history,legacyCalls,principal,fragments,bound,context,
    begin:()=>bounded(staged.pipeline.beginCycle({leaseToken,inputs:[original()],recordExecution:async row=>history.push(row),getExecutionLog:()=>structuredClone(history)})),
    after:()=>bounded(staged.pipeline.afterInitial({handledInputIds:[inputId],inputs:[original()],executionLog:structuredClone(history)})),
    execute:(name,args,ids=[inputId],patch={})=>bounded(staged.tools.find(tool=>tool.name===name).execute(args,{...context,inputIds:ids,...patch})),
    finish:()=>bounded(staged.pipeline.finishCycle({executionLog:structuredClone(history)})),
  };
}

for(const legacy of ['throws','never'])test(`catalogue, task read and defer do not invoke legacy live callbacks that ${legacy}`,async()=>{
  const pending=task(),f=fixture({pending:[pending],legacy});await f.begin();const next=await f.after();assert.deepEqual(next.inputIds,[pending.uuid]);assert.deepEqual(f.bound,[]);
  const read=await f.execute('read_pending_task',{taskId:pending.uuid,detail:'full'},[pending.uuid]);assert.deepEqual((await full(read,f.fragments)).task,pending);assert.deepEqual(f.bound,[pending.uuid]);
  const saved=await f.execute('defer_task',{taskId:pending.uuid,summary:'Same task, more precise interpretation',operation:'participation',calendarEventId:'workshop123',calendarKind:'club',personId},[pending.uuid]);
  assert.equal(saved.status,'ready');assert.equal(saved.taskId,pending.uuid);assert.equal(f.rows.size,1);assert.deepEqual(f.legacyCalls,[]);assert(f.storage.every(row=>row.args.leaseToken===leaseToken));
});

test('200-task catalogue and full fragmented saved context need zero sequential source validations and read-only tasks stay unchanged',async()=>{
  const pending=Array.from({length:200},()=>task());pending[199].info.batchContext={precedingHour:'🙂漢字"\\'.repeat(16000)};pending[199].info.executionHistory=[{kind:'tool_result',tool:'read_discord_messages',result:{status:'ready',sources:[{sourceId,url,content:'Previously observed original'}]}}];
  const f=fixture({pending,legacy:'never'});await f.begin();const next=await f.after();assert.equal(next.context.taskCount,200);assert.deepEqual(new Set(next.inputIds),new Set(pending.map(row=>row.uuid)));
  const read=await f.execute('read_pending_task',{taskId:pending[199].uuid,detail:'full'},[pending[199].uuid]);assert(read.fragment);assert.deepEqual((await full(read,f.fragments)).task,pending[199]);
  assert.equal((await f.finish()).status,'ready');assert.deepEqual([...f.rows.values()],pending);assert.deepEqual(f.legacyCalls,[]);assert.equal(f.storage.filter(row=>['save','resolve'].includes(row.method)).length,0);
});

test('local scope withdrawal, expiry, wrong principal, cancellation and malformed cached input bindings still deny task reads',async t=>{
  const invalid=[['expired',row=>{row.expires_at=stamp;}],['unknown version',row=>{row.info.version=2;}],['missing input',row=>{row.info.inputs=[];}],['wrong source binding',row=>{row.info.inputs[0].raw_response.source_id=gmailId;}],['unsupported provider',row=>{row.info.inputs[0].raw_response.source='drive';}],['duplicate input',row=>{row.info.inputs.push(structuredClone(row.info.inputs[0]));}],['unknown source',row=>{row.info.sourceIds=[randomUUID()];}]];
  for(const [label,mutate] of invalid)await t.test(label,async()=>{const pending=task();mutate(pending);const f=fixture({pending:[pending]});await f.begin();const next=await f.after();assert(!next.inputIds.includes(pending.uuid));assert.equal((await f.execute('read_pending_task',{taskId:pending.uuid},[pending.uuid])).status,'forbidden');assert.equal(f.rows.size,1);assert.deepEqual(f.legacyCalls,[]);});
  const pending=task(),f=fixture({pending:[pending]});await f.begin();await f.after();
  assert.equal((await f.execute('read_pending_task',{taskId:pending.uuid},[pending.uuid],{principal:{...f.principal}})).status,'forbidden');const controller=new AbortController();controller.abort();assert.equal((await f.execute('read_pending_task',{taskId:pending.uuid},[pending.uuid],{signal:controller.signal})).status,'forbidden');
  f.principal.allowedSourceIds=[];assert.equal((await f.execute('read_pending_task',{taskId:pending.uuid},[pending.uuid])).status,'forbidden');assert.deepEqual(f.rows.get(pending.uuid),pending);
});

test('defer cannot manufacture cached originals through unknown IDs, mixed known/unknown IDs or unread task IDs',async()=>{
  const pending=task(),f=fixture({pending:[pending]});await f.begin();await f.after();const before=structuredClone([...f.rows.values()]);
  for(const ids of [[randomUUID()],[inputId,randomUUID()],[pending.uuid],[inputId,pending.uuid]]){
    assert.equal((await f.execute('defer_task',{summary:'Unsupported new task',operation:'source_review'},ids)).status,'forbidden');
  }
  assert.deepEqual([...f.rows.values()],before);assert(!f.storage.some(row=>row.method==='save'));assert.deepEqual(f.legacyCalls,[]);
  assert.equal((await f.execute('read_pending_task',{taskId:pending.uuid},[pending.uuid])).status,'ready');assert.equal((await f.execute('defer_task',{summary:'Known cached originals',operation:'source_review'},[pending.uuid])).status,'ready');
});

test('plain cached read does not count as successful outcome or bypass exact task version at resolution',async()=>{
  const pending=task(),f=fixture({pending:[pending]});await f.begin();await f.after();await f.execute('read_pending_task',{taskId:pending.uuid},[pending.uuid]);
  f.history.push({kind:'tool_result',tool:'upsert_map_event',inputIds:[pending.uuid],result:{status:'tool_error',reason:'not_found'}});
  assert.equal((await f.execute('resolve_pending_task',{taskId:pending.uuid,outcome:'completed'},[pending.uuid])).status,'invalid_request');assert(!f.storage.some(row=>row.method==='resolve'));
  f.history.push({kind:'tool_result',tool:'upsert_map_event',inputIds:[pending.uuid],arguments:{event:{source_record_id:'workshop123'},people:[{person_id:personId}]},result:{status:'ready',eventId:'workshop123'}});
  const newer={...pending,updated_at:'2026-10-22T18:02:00.000Z'};f.rows.set(pending.uuid,newer);assert.equal((await f.execute('resolve_pending_task',{taskId:pending.uuid,outcome:'completed'},[pending.uuid])).status,'conflict');assert.deepEqual(f.rows.get(pending.uuid),newer);assert.deepEqual(f.legacyCalls,[]);
});

function adapterFixture(){
  const pending=task();pending.info.sourceIds=[sourceId,gmailId,clubSource,memberSource];pending.info.references=[{sourceId,sourceUrl:url},{sourceId:gmailId,sourceUrl:'https://mail.google.com/mail/u/0/#all/abc123'},{sourceId:clubSource,sourceUrl:'https://calendar.google.com/calendar/event?eid=placeholder'}];
  let blocked=false;const calls=[],rows=new Map([[pending.uuid,structuredClone(pending)]]),record=name=>{calls.push(name);};
  const policy={guildId:'100',revision:1,paused:false,discoveryEnabled:true,excludedCategoryIds:[],excludedChannelIds:[]},channel={id:'200',guild_id:'100',type:0,parent_id:null};
  const access=async calendarId=>{record('calendar preflight');if(blocked)throw Error('Cache must not preflight Calendar');return {status:'ready',calendarId,accessRole:'owner'};};
  const calendarClient={configured:true,calendarId:'club',preflight:()=>access('club')},memberClient={configured:true,calendarId:'member',preflight:()=>access('member')};
  const adapters=createAutomationAdapters({env:{AGENT_AUTOMATION_STAGED_ENABLED:'true',AGENT_GMAIL_SOURCE_ID:gmailId,ASSISTANT_ALLOWED_SOURCE_IDS:[sourceId,gmailId,clubSource,memberSource].join(',')},config:readAutomationConfig({AGENT_AUTOMATION_ENABLED:'true'}),now:()=>new Date(stamp),fetchImpl:async()=>{throw Error('Unexpected HTTP');},dependencies:{
    googleConfig:{configured:true},googleClient:{configured:true,readGmail:async()=>{record('gmail');throw Error('Live Gmail unavailable');}},calendarConfig:{configured:true,calendarId:'club',sourceId:clubSource},memberConfig:{configured:true,calendarId:'member',sourceId:memberSource,signingKey:'synthetic-member-signing-key-long-enough'},calendarClient,memberClient,
    discordConfig:{configured:true,guildId:'100'},discordStore:{getPolicy:async()=>{record('discord policy');return {status:'ready',policy:{...policy,paused:blocked}};},listSyncChannels:async()=>{record('discord catalogue');return {status:'ready',channels:[{enabled:true,guildId:'100',channelId:'200',sourceId}]};}},discordClient:{getGuildChannels:async()=>{record('discord channels');return [channel];},getChannel:async()=>{record('discord channel');return channel;}},
    liveDiscordService:{readMessages:async()=>{record('discord original');return {status:'unavailable',sources:[],coverage:{complete:false}};}},discordTools:{tools:[{name:'read_discord_messages',description:'Standard original read',readOnly:true,parameters:{type:'object',properties:{},additionalProperties:false}}],execute:async()=>{record('discord tool');return {status:'unavailable',sources:[]};}},
    mapSourceAuthorizer:async()=>{record('source authorizer');return !blocked;},mapEventService:{configured:true,lookup:async()=>{record('person lookup');return {status:'ok',person:{id:personId}};},read:async()=>{record('map read');return {status:'ok',events:[],event_people:[],event_buildings:[]};},upsert:async()=>{record('map write');return {status:'applied'};}},
    taskStore:attachTaskReads({configured:true,prune:async()=>({status:'ready'}),list:async()=>({status:'ready',tasks:structuredClone([...rows.values()])}),save:async args=>{const previous=rows.get(args.task.uuid),saved={...previous,...args.task,created_at:previous?.created_at??stamp,updated_at:stamp,expires_at:previous?.expires_at??expires};rows.set(saved.uuid,saved);return {status:'ready',task:saved};}},rows),synchronize:{sync:async()=>({status:'ready',results:[],unresolved:[]})},
  }});
  const context={principal:adapters.principal,inputIds:[inputId]},execute=(name,args,ids=[pending.uuid])=>bounded(adapters.tools.find(tool=>tool.name===name).execute(args,{...context,inputIds:ids}));
  return {adapters,pending,calls,rows,context,execute,block:()=>{blocked=true;},prepare:async()=>{await adapters.resolveClaimSourceIds(context);await adapters.prepareBatch({...context,inputs:[original()]});await adapters.pipeline.beginCycle({leaseToken,inputs:[original()],recordExecution:async()=>{},getExecutionLog:()=>[]});calls.length=0;}};
}

test('production cache and map identity reads do not refresh provider sources; explicit source tools retain their own failure',async()=>{
  const f=adapterFixture();await f.prepare();f.block();
  const next=await bounded(f.adapters.pipeline.afterInitial({handledInputIds:[inputId],inputs:[original()],executionLog:[]}));assert(next.inputIds.includes(f.pending.uuid));
  const read=await f.execute('read_pending_task',{taskId:f.pending.uuid,detail:'full'});assert.equal(read.status,'ready');assert.deepEqual(read.task,f.pending);
  const deferred=await f.execute('defer_task',{taskId:f.pending.uuid,summary:'Read cached context and ask normal tools next',operation:'source_review'});assert.equal(deferred.status,'ready');assert.deepEqual(f.calls,[]);
  assert.equal((await f.execute('lookup_map_person',{provider:'discord',providerUserId:'400',sourceId,sourceUrl:url})).status,'ready');assert.deepEqual(f.calls,['person lookup']);assert(!f.calls.includes('map write'));
  const normalRead=await f.execute('read_discord_messages',{});assert.equal(normalRead.status,'unavailable');assert(f.calls.includes('discord tool'));
});
