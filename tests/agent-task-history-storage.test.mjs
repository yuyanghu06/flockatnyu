import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {deflateSync} from 'node:zlib';
import {PGlite} from '@electric-sql/pglite';
import {createPendingTaskStore} from '../server/automation/task-store.js';
import {createAutomationHandler} from '../server/automation/handler.js';
import {createStagedPipeline} from '../server/automation/staged-pipeline.js';
import {createBoundedResults} from '../server/automation/bounded-result.js';
import {readAutomationConfig} from '../server/automation/config.js';
import {encodeTaskInfo,MAX_HISTORY_BYTES,MAX_TASK_WIRE_BYTES,postgresJsonBytes} from '../server/automation/task-history-codec.js';

const env={SUPABASE_URL:'https://local-task-storage.invalid',SUPABASE_SERVICE_ROLE_KEY:'synthetic-only'};
const copy=value=>structuredClone(value),bytes=value=>Buffer.byteLength(JSON.stringify(value));
const migrations=['202610170018_agent_input_cache.sql','202610170019_agent_automation_state.sql','202610180032_scoped_agent_claim.sql','202610210036_agent_retry_quarantine.sql','202610220038_agent_empty_scope_maintenance.sql','202610220039_agent_pending_tasks.sql','202610230045_agent_task_catalogue.sql'];
async function setup(){
 const db=new PGlite(),source=randomUUID(),token=randomUUID(),calls=[],diagnostics=[];
 await db.exec('create role anon;create role authenticated;create role service_role bypassrls;');
 for(const name of migrations)await db.exec(await readFile(new URL('../supabase/migrations/'+name,import.meta.url),'utf8'));
 await db.query("update public.agent_automation_state set data=jsonb_build_object('token',$1::text,'lease_until',clock_timestamp()+interval '1 hour') where key='runner'",[token]);
 const stamp=new Date((await db.query('select clock_timestamp() now')).rows[0].now).toISOString();
 let changeResponse=value=>value;
 const store=createPendingTaskStore({env,writeDiagnostic:row=>diagnostics.push(row),fetchImpl:async(value,request)=>{
  assert.equal(new URL(value).origin,'https://local-task-storage.invalid');
  const name=new URL(value).pathname.split('/').at(-1).replace('agent_pending_task_',''),args=JSON.parse(request.body);calls.push({name,args:copy(args)});
  const keys=Object.keys(args),values=Object.values(args).map(v=>v&&typeof v==='object'&&!Array.isArray(v)?JSON.stringify(v):v);
  const result=(await db.query(`select public.agent_pending_task_${name}(${keys.map((k,i)=>`${k}=>$${i+1}`).join(',')}) result`,values)).rows[0].result;
  return Response.json(changeResponse(copy(result),name));
 }});
 const base=()=>({version:1,sourceIds:[source],inputs:[{uuid:randomUUID(),raw_response:{source:'discord',source_id:source,event_type:'message_created',event_id:'300',revision:'1',received_at:stamp,payload:{id:'300',guild_id:'100',channel_id:'200',author:{id:'400'},content:'Keep the exact original. 🙂',timestamp:stamp}}}],request:{operation:'source_review',summary:'Unresolved source work'},batchContext:{pastNote:''},executionHistory:Array.from({length:200},(_,i)=>({kind:'tool_result',stage:'followup',tool:'read_discord_messages',cycleId:'prior-'+i,sequence:i+1,inputIds:[randomUUID()],arguments:{channelId:'200',messageId:String(400+i)},result:{status:'ready',sources:[{sourceId:source,content:'Previously observed context.'}]}}))});
 const insert=async info=>{
  const id=randomUUID(),expires=new Date(Date.parse(stamp)+86400000).toISOString();
  await db.query('insert into public.agent_pending_tasks(uuid,info,created_at,updated_at,expires_at) values($1,$2,$3,$3,$4)',[id,JSON.stringify(info),stamp,expires]);
  return (await db.query('select to_jsonb(t) row from public.agent_pending_tasks t where uuid=$1',[id])).rows[0].row;
 };
 return {db,source,token,stamp,store,calls,diagnostics,base,insert,setResponse(fn){changeResponse=fn;},
  read:taskId=>store.read({leaseToken:token,allowedSourceIds:[source],taskId}),
  save:(task,expectedUpdatedAt=task.updated_at)=>store.save({leaseToken:token,allowedSourceIds:[source],task,expectedUpdatedAt}),
  row:async id=>(await db.query('select to_jsonb(t) row from public.agent_pending_tasks t where uuid=$1',[id])).rows[0]?.row,
  sqlBytes:async info=>(await db.query('select octet_length($1::jsonb::text) n',[JSON.stringify(info)])).rows[0].n};
}

test('production store and actual PostgreSQL keep old plus new history across the reported compact/JSONB boundaries',async t=>{
 const f=await setup();
 try{
  for(const target of [257801,270183])await t.test(String(target)+' compact bytes',async()=>{
   const old=f.base();old.batchContext.pastNote='x'.repeat(245000-bytes(old));assert.equal(bytes(old),245000);
   const prior=await f.insert(old);assert.deepEqual((await f.read(prior.uuid)).task.info,old,'Legacy arrays are read without logical changes');
   const next=copy(old);next.executionHistory.push({kind:'tool_result',cycleId:'current',sequence:1,tool:'read_discord_messages',inputIds:[prior.uuid],arguments:{channelId:'200',messageId:'300'},result:{status:'ready',sources:[{sourceId:f.source,content:''}]}});
   const last=next.executionHistory.at(-1).result.sources[0];last.content='r'.repeat(target-bytes(next));assert.equal(bytes(next),target);
   const logicalSqlBytes=await f.sqlBytes(next);assert(logicalSqlBytes>MAX_TASK_WIRE_BYTES,'The original JSONB row would fail the existing SQL ceiling');
   const untouched=copy(next),saved=await f.save({...prior,info:next});assert.equal(saved.status,'ready');assert.deepEqual(next,untouched,'Encoding must not mutate the supplied task');
   assert.deepEqual(saved.task.info,next);assert.equal(saved.task.created_at,prior.created_at);assert.equal(saved.task.expires_at,prior.expires_at);
   const wire=await f.row(prior.uuid);assert.equal(wire.info.executionHistory.codec,'deflate-base64');assert.deepEqual(wire.info.inputs,old.inputs);assert.deepEqual(wire.info.sourceIds,old.sourceIds);assert.deepEqual(wire.info.request,old.request);assert.deepEqual(wire.info.batchContext,old.batchContext);
   const actualWireBytes=await f.sqlBytes(wire.info);assert(actualWireBytes<=MAX_TASK_WIRE_BYTES);assert.equal(postgresJsonBytes(wire.info),actualWireBytes);
   assert.deepEqual((await f.read(prior.uuid)).task.info,next);const listed=await f.store.list({leaseToken:f.token,allowedSourceIds:[f.source]});assert.equal(listed.status,'ready');assert.deepEqual(listed.tasks.find(row=>row.uuid===prior.uuid).info,next);
   t.diagnostic(`Logical compact=${target},JSONB=${logicalSqlBytes}; stored JSONB=${actualWireBytes}; all ${next.executionHistory.length} history entries preserved.`);
  });
  await t.test('PostgreSQL-compatible byte counting matches actual escaping and Unicode wire rows',async()=>{
   for(const value of [{text:'quote" slash\\ newline\n tab\t null\u0000'},{'🙂':'é 漢字',values:[true,null,1,-20.5,'\b\f\r']},{nested:{z:[],a:{b:'x'}},n:1e30}]){
    if(JSON.stringify(value).includes('\\u0000'))continue; // PostgreSQL JSONB intentionally disallows NUL.
    assert.equal(postgresJsonBytes(value),await f.sqlBytes(value));
   }
  });
  await t.test('unversioned replay with semantically equal reordered history keys stays idempotent in actual SQL',async()=>{
   const info=f.base(),id=randomUUID();info.executionHistory=[{kind:'tool_result',stage:'followup',result:{second:{z:'Large observed context '.repeat(22000),a:1},first:[{b:'two',a:'one'}]},arguments:{messageId:'300',channelId:'200'}}];
   const first=await f.store.save({leaseToken:f.token,allowedSourceIds:[f.source],task:{uuid:id,info}});assert.equal(first.status,'ready');
   const reverse=value=>Array.isArray(value)?value.map(reverse):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).reverse().map(([key,nested])=>[key,reverse(nested)])):value;
   const reordered=copy(info);reordered.executionHistory=reverse(reordered.executionHistory);assert.notEqual(JSON.stringify(reordered.executionHistory),JSON.stringify(info.executionHistory));
   const second=await f.store.save({leaseToken:f.token,allowedSourceIds:[f.source],task:{uuid:id,info:reordered}});assert.equal(second.status,'ready');assert.deepEqual(second.task,first.task);assert.equal(second.task.updated_at,first.task.updated_at);assert.equal(second.task.expires_at,first.task.expires_at);assert.deepEqual(second.task.info,info);
  });
  await t.test('wire overflow outside history and incompressible history never overwrite the old row',async()=>{
   const prior=await f.insert(f.base()),before=await f.row(prior.uuid),start=f.calls.length;
   const outside=copy(prior);outside.info.batchContext.pastNote='p'.repeat(MAX_TASK_WIRE_BYTES);
   assert.equal((await f.save(outside)).status,'invalid_request');assert.equal(f.calls.length,start);assert.deepEqual(await f.row(prior.uuid),before);
   const random=copy(prior);random.info.executionHistory=[{content:randomBytes(320000).toString('base64')}];
   assert.equal((await f.save(random)).status,'invalid_request');assert.equal(f.calls.length,start);assert.deepEqual(await f.row(prior.uuid),before);
  });
  await t.test('optimistic conflict, revoked source, expired task and lost lease preserve prior encoded rows',async()=>{
   const info=f.base();info.executionHistory=[{content:'history '.repeat(80000)}];
   const created=await f.store.save({leaseToken:f.token,allowedSourceIds:[f.source],task:{uuid:randomUUID(),info}});assert.equal(created.status,'ready');
   const prior=created.task,changed=copy(prior);changed.info.executionHistory.push({content:'another current observation'});
   const updated=await f.save(changed);assert.equal(updated.status,'ready');const before=await f.row(prior.uuid);
   assert.equal((await f.save(changed,prior.updated_at)).status,'conflict');assert.deepEqual(await f.row(prior.uuid),before);
   assert.equal((await f.store.read({leaseToken:f.token,allowedSourceIds:[randomUUID()],taskId:prior.uuid})).status,'not_found');
   assert.equal((await f.store.save({leaseToken:randomUUID(),allowedSourceIds:[f.source],task:changed,expectedUpdatedAt:updated.task.updated_at})).status,'stale');assert.deepEqual(await f.row(prior.uuid),before);
   await f.db.query("update public.agent_pending_tasks set created_at=statement_timestamp()-interval '25 hours',updated_at=statement_timestamp()-interval '2 hours',expires_at=statement_timestamp()-interval '1 hour' where uuid=$1",[prior.uuid]);
   assert.equal((await f.read(prior.uuid)).status,'not_found');assert.equal((await f.save({...updated.task,info:changed.info})).status,'expired');
  });
 }finally{await f.db.close();}
});

test('encoded history corruption, unknown formats and excessive expansion fail safely without touching saved data',async t=>{
 const f=await setup();
 try{
  const info=f.base();info.executionHistory=[{kind:'tool_result',result:{content:'observed history 🙂 '.repeat(40000)}}];
  const created=await f.store.save({leaseToken:f.token,allowedSourceIds:[f.source],task:{uuid:randomUUID(),info}});assert.equal(created.status,'ready');
  const prior=created.task,wire=await f.row(prior.uuid);assert.equal(wire.info.executionHistory.codec,'deflate-base64');
  const envelope=text=>{const raw=Buffer.isBuffer(text)?text:Buffer.from(text);return {version:1,codec:'deflate-base64',bytes:raw.length,sha256:createHash('sha256').update(raw).digest('hex'),data:deflateSync(raw).toString('base64')};};
  const bomb=Buffer.from('x'.repeat(MAX_HISTORY_BYTES+1));
  const cases=[
   ['unknown codec',h=>({...h,codec:'future-codec'})],['unknown version',h=>({...h,version:2})],
   ['unexpected metadata',h=>({...h,extra:true})],['noncanonical base64',h=>({...h,data:h.data+'\n'})],
   ['invalid compressed bytes',h=>({...h,data:Buffer.from('not deflate').toString('base64')})],
   ['trailing compressed bytes',h=>({...h,data:Buffer.concat([Buffer.from(h.data,'base64'),Buffer.from([0,1,2])]).toString('base64')})],
   ['wrong decoded byte count',h=>({...h,bytes:h.bytes+1})],['wrong checksum',h=>({...h,sha256:'0'.repeat(64)})],
   ['fatal invalid UTF8',()=>envelope(Buffer.from([0x5b,0x22,0xff,0x22,0x5d]))],['decoded non-array',()=>envelope('{"not":"history"}')],
   ['declared expansion exceeds guard',()=>envelope(bomb)],['lying small expansion metadata',()=>({...envelope(bomb),bytes:1})],
  ];
  for(const [name,mutate]of cases)await t.test(name,async()=>{
   f.setResponse((data,operation)=>{if(operation==='read'&&data.task)data.task.info.executionHistory=mutate(copy(wire.info.executionHistory));return data;});
   const read=await f.read(prior.uuid);assert.equal(read.status,'unavailable');assert(!Object.hasOwn(read,'task'));assert.deepEqual(await f.row(prior.uuid),wire);
   const beforeCalls=f.calls.length,candidate=copy(prior);candidate.info.executionHistory=mutate(copy(wire.info.executionHistory));
   assert.equal((await f.save(candidate)).status,'invalid_request');assert.equal(f.calls.length,beforeCalls,'Caller-supplied envelopes cannot overwrite logical history');assert.deepEqual(await f.row(prior.uuid),wire);
  });
  f.setResponse(value=>value);assert.deepEqual((await f.read(prior.uuid)).task.info,info);
  assert(f.diagnostics.filter(row=>row.status==='unavailable').every(row=>row.reason==='invalid_response'),'Corrupt bodies produce bounded generic diagnostics');
 }finally{await f.db.close();}
});

test('aggregate decoded task lists remain bounded even when each compressed row is small',async()=>{
 const source=randomUUID(),stamp=new Date().toISOString(),history=[{content:'x'.repeat(14*1024*1024)}];
 const info={version:1,sourceIds:[source],request:{operation:'source_review'},inputs:[],executionHistory:history};
 const encoded=encodeTaskInfo(info),rows=Array.from({length:4},()=>({uuid:randomUUID(),info:copy(encoded),created_at:stamp,updated_at:stamp,expires_at:new Date(Date.parse(stamp)+3600000).toISOString()}));
 const store=createPendingTaskStore({env,writeDiagnostic:()=>{},fetchImpl:async()=>Response.json({status:'ready',tasks:rows})});
 const result=await store.list({leaseToken:randomUUID(),allowedSourceIds:[source]});assert.equal(result.status,'unavailable');assert(!result.tasks,'Four14MiB logical histories exceed the existing54MiB aggregate guard');
});

test('actual production runner durably checkpoints near-limit history before acknowledging its original queue input',async()=>{
 const f=await setup();
 try{
  const info=f.base();info.batchContext.pastNote='x'.repeat(245000-bytes(info));const prior=await f.insert(info),original=info.inputs[0],principal={id:'checkpoint-integration-worker',allowedSourceIds:[f.source]};
  const staged=createStagedPipeline({taskStore:f.store,principal,bindTask:async()=>{},fragments:createBoundedResults(),now:()=>new Date(f.stamp)});
  const sourceResult={status:'ready',coverage:{complete:true},sources:[{sourceId:f.source,content:'Current observed fact '+ 'x'.repeat(12000)}]};let queueAcknowledged=false,writes=0;const receipts=new Map();
  const tools=[{name:'read_discord_messages',description:'Inert source transport',readOnly:true,parameters:{type:'object',properties:{},additionalProperties:false},execute:async()=>copy(sourceResult)},
   {name:'upsert_calendar_event',description:'Inert successful Calendar action',idempotent:true,parameters:{type:'object',properties:{},additionalProperties:false},execute:async()=>{writes++;return{status:'ready',eventId:'synthetic_saved_event',outcome:'updated'};}},...staged.tools];
  const call=(name,id,args={},inputIds=[prior.uuid])=>({id,name,arguments:name==='finish_batch'?{handledInputIds:args}:{inputIds,arguments:args}}),turn=(...toolCalls)=>({text:'',stopReason:'tool_calls',toolCalls});
  const turns=[turn(call('finish_batch','initial',[original.uuid])),turn(call('read_pending_task','task',{taskId:prior.uuid})),turn(call('read_discord_messages','source_one'),call('read_discord_messages','source_two'),call('upsert_calendar_event','write')),turn(call('finish_batch','followup',[]))];
  const queue={configured:true,claim:async()=>({status:'ready',leaseToken:f.token,inputs:[copy(original)]}),renew:async()=>({status:'ready'}),release:async()=>{},fail:async()=>{},
   action:async({actionKey,complete})=>{if(complete){receipts.set(actionKey,true);return{status:'completed'};}return{status:receipts.has(actionKey)?'completed':'execute'};},
   finish:async()=>{const saved=await f.read(prior.uuid);assert.equal(saved.status,'ready');assert.equal(saved.task.info.executionHistory.length,203,'All new tool outcomes must already be durable before queue acknowledgement');queueAcknowledged=true;return{status:'ready'};}};
  const outcome=await createAutomationHandler({store:queue,provider:{toolTurn:async()=>{assert(turns.length);return turns.shift();}},tools,pipeline:staged.pipeline,principal,authorizeEvent:async()=>true,config:readAutomationConfig({AGENT_AUTOMATION_ENABLED:'true'}),now:()=>new Date(f.stamp)}).tick();
  assert.equal(outcome.status,'completed');assert.equal(outcome.handled,1);assert.equal(queueAcknowledged,true);assert.equal(writes,1);assert.equal(receipts.size,1);
  const saved=(await f.read(prior.uuid)).task;assert.deepEqual(saved.info.inputs,info.inputs);assert.deepEqual(saved.info.executionHistory.slice(0,200),info.executionHistory);assert.equal(saved.info.executionHistory.filter(row=>row.tool==='read_discord_messages'&&row.result?.sources?.[0]?.content===sourceResult.sources[0].content).length,2);assert.equal((await f.row(prior.uuid)).info.executionHistory.codec,'deflate-base64');
 }finally{await f.db.close();}
});
