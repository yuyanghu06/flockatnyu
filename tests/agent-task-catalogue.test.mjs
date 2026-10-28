import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {createPendingTaskStore} from '../server/automation/task-store.js';
import {createStagedPipeline} from '../server/automation/staged-pipeline.js';
import {createBoundedResults} from '../server/automation/bounded-result.js';
import {canonicalJson} from '../server/automation/validation.js';
import {fixture,task,input,ids,copy,call,turn,lookupFor,patchFor,assertAdded,attachTaskReads,taskCatalogue,now,stamp} from './fixtures/planner-followup.mjs';

const source=ids.source,other=ids.club,leaseToken=randomUUID();
const env={SUPABASE_URL:'https://db.example.test',SUPABASE_SERVICE_ROLE_KEY:'SYNTHETIC_PRIVATE_KEY'};
const bytes=value=>Buffer.byteLength(JSON.stringify(value));
async function rpc(db,name,args) {
 const keys=Object.keys(args),values=Object.values(args).map(value=>value&&typeof value==='object'&&!Array.isArray(value)?JSON.stringify(value):value);
 return (await db.query(`select public.agent_pending_task_${name}(${keys.map((key,i)=>`${key}=>$${i+1}`).join(',')}) result`,values)).rows[0].result;
}
const catalogue=(db,scope=[source],token=leaseToken)=>rpc(db,'catalogue',{p_token:token,p_allowed_source_ids:scope});
const exact=(db,id,scope=[source],token=leaseToken)=>rpc(db,'read',{p_token:token,p_allowed_source_ids:scope,p_task_id:id});
async function seedLease(db,{expired=false}={}) {
 await db.query("update public.agent_automation_state set data=jsonb_build_object('token',$1::text,'lease_until',clock_timestamp()+($2::int*interval '1 hour')) where key='runner'",[leaseToken,expired?-1:1]);
}

test('045 actual SQL and Node transport:131large tasks stay private, small scoped catalogue and exact reads preserve every row',async t=>{
 const db=new PGlite();
 try {
  await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create role public_probe;');
  for(const name of ['202610170018_agent_input_cache.sql','202610170019_agent_automation_state.sql','202610180032_scoped_agent_claim.sql','202610210036_agent_retry_quarantine.sql','202610220038_agent_empty_scope_maintenance.sql','202610220039_agent_pending_tasks.sql','202610230045_agent_task_catalogue.sql','202610280055_agent_task_retry_schedule.sql'])await db.exec(await readFile(new URL('../supabase/migrations/'+name,import.meta.url),'utf8'));
  await seedLease(db);
  const clock=(await db.query('select clock_timestamp() now')).rows[0].now;
  const created=new Date(clock).toISOString(),expires=new Date(Date.parse(created)+86400000).toISOString();
  const rows=Array.from({length:131},(_,i)=>{
   const row=task(1000+i,{original:input(1000+i),operation:i===130?'calendar_review':'source_review',large:false});
   row.created_at=row.updated_at=created;row.expires_at=expires;
   row.info.executionHistory=[{kind:'model_result',result:{text:'PRIVATE_RETAINED_HISTORY_'+String(i)+'x'.repeat(94100)}}];
   return row;
  });
  rows[0].info.request.summary='🙂'.repeat(101)+' exact original intent';rows[0].info.request.calendarEventId='🙂'.repeat(1024);
  rows[1].info.sourceIds=[source,other];
  for(const row of rows)await db.query('insert into public.agent_pending_tasks(uuid,info,created_at,updated_at,expires_at) values($1,$2,$3,$4,$5)',[row.uuid,JSON.stringify(row.info),row.created_at,row.updated_at,row.expires_at]);
  const expired=copy(rows[2]);expired.uuid=randomUUID();expired.created_at=expired.updated_at=new Date(Date.parse(created)-90000000).toISOString();expired.expires_at=new Date(Date.parse(created)-3600000).toISOString();
  await db.query('insert into public.agent_pending_tasks(uuid,info,created_at,updated_at,expires_at) values($1,$2,$3,$4,$5)',[expired.uuid,JSON.stringify(expired.info),expired.created_at,expired.updated_at,expired.expires_at]);
  const before=(await db.query('select to_jsonb(t) snapshot from public.agent_pending_tasks t order by uuid')).rows;
  await t.test('only the service role can call either read, with FORCE RLS and no direct table grants',async()=>{
   assert.deepEqual((await db.query("select relrowsecurity,relforcerowsecurity from pg_class where oid='public.agent_pending_tasks'::regclass")).rows[0],{relrowsecurity:true,relforcerowsecurity:true});
   for(const role of ['anon','authenticated','public_probe','service_role']){
    for(const signature of ['agent_pending_task_catalogue(uuid,uuid[])','agent_pending_task_read(uuid,uuid[],uuid)'])assert.equal((await db.query("select has_function_privilege($1,$2,'EXECUTE') allowed",[role,'public.'+signature])).rows[0].allowed,role==='service_role');
    for(const privilege of ['SELECT','INSERT','UPDATE','DELETE'])assert.equal((await db.query('select has_table_privilege($1,$2,$3) allowed',[role,'public.agent_pending_tasks',privilege])).rows[0].allowed,false);
    await db.exec(`set role ${role}`);
    if(role!=='service_role'){await assert.rejects(catalogue(db),error=>error.code==='42501');await assert.rejects(exact(db,rows[0].uuid),error=>error.code==='42501');}
    await db.exec('reset role');
   }
   await db.exec('set role service_role');
  });
  await t.test('selection returns full authorized identity metadata including mechanical work, with no retained history or originals',async()=>{
   const result=await catalogue(db,[source,other]);assert.equal(result.status,'ready');assert.equal(result.tasks.length,131);
   assert(bytes(rows)>12*1024*1024-300000);assert(bytes(result)<130000);
   assert(!JSON.stringify(result).includes('PRIVATE_RETAINED_HISTORY'));assert(!JSON.stringify(result).includes('raw_response'));
   const first=result.tasks.find(row=>row.uuid===rows[0].uuid),mechanical=result.tasks.find(row=>row.uuid===rows[130].uuid);
   assert.deepEqual(first.inputIds,[rows[0].info.inputs[0].uuid]);assert.deepEqual(first.sourceIds,[source]);assert.equal(first.summaryTruncated,true);
   assert.equal(first.request.summary,'🙂'.repeat(100));assert.equal(first.request.calendarEventId,'🙂'.repeat(1024));assert.equal(mechanical.modelEligible,false);
   assert(!Object.hasOwn(first.request,'summaryTruncated'));assert.equal((await catalogue(db,[source])).tasks.length,130);
   const read=await exact(db,rows[0].uuid);assert.equal(read.status,'ready');assert.deepEqual(read.task.info,rows[0].info);
   assert.equal((await exact(db,rows[130].uuid)).task.info.request.operation,'calendar_review','Mechanical records remain privately readable for collision preservation');
   t.diagnostic(`Synthetic complete history ${bytes(rows)} bytes; catalogue ${bytes(result)} bytes; one exact read ${bytes(read)} bytes.`);
  });
  await t.test('missing,revoked,multi-source,expired,empty-scope and lost-lease reads fail without disclosing or pruning work',async()=>{
   for(const [id,scope] of [[randomUUID(),[source]],[rows[0].uuid,[other]],[rows[1].uuid,[source]],[expired.uuid,[source]],[rows[0].uuid,[]]])assert.deepEqual(await exact(db,id,scope),{status:'not_found'});
   assert.deepEqual(await catalogue(db,[],null),{status:'ready',tasks:[]});
   for(const scope of [null,[source,source],[source,null],[[source]]]){assert.equal((await catalogue(db,scope)).status,'invalid_request');assert.equal((await exact(db,rows[0].uuid,scope)).status,'invalid_request');}
   assert.deepEqual(await exact(db,rows[0].uuid,[source],randomUUID()),{status:'stale'});assert.deepEqual(await catalogue(db,[source],randomUUID()),{status:'stale'});
   await db.exec('reset role');await seedLease(db,{expired:true});await db.exec('set role service_role');
   assert.deepEqual(await exact(db,rows[0].uuid),{status:'stale'});assert.deepEqual(await catalogue(db),{status:'stale'});
   await db.exec('reset role');await seedLease(db);await db.exec('set role service_role');
  });
  await t.test('production Node store uses separate catalogue/exact RPCs and faithfully accepts Unicode targets',async()=>{
   const calls=[],diagnostics=[];
   const store=createPendingTaskStore({env,writeDiagnostic:row=>diagnostics.push(row),fetchImpl:async(url,request)=>{
    const name=new URL(url).pathname.split('/').at(-1).replace('agent_pending_task_','');calls.push(name);
    assert.equal(request.redirect,'error');return Response.json(await rpc(db,name,JSON.parse(request.body)));
   }});
   const all=await store.catalogue({leaseToken,allowedSourceIds:[source,other]});assert.equal(all.status,'ready');assert.equal(all.tasks.length,131);
   assert.equal(all.tasks.find(row=>row.uuid===rows[0].uuid).request.calendarEventId,'🙂'.repeat(1024));
   const read=await store.read({leaseToken,allowedSourceIds:[source],taskId:rows[0].uuid});assert.equal(read.status,'ready');assert.deepEqual(read.task.info,rows[0].info);
   assert.deepEqual(calls,['catalogue','read']);assert(diagnostics.every(row=>row.status==='ready'));
   assert(!JSON.stringify(diagnostics).includes('PRIVATE_RETAINED_HISTORY'));assert(!JSON.stringify(diagnostics).includes(env.SUPABASE_SERVICE_ROLE_KEY));
  });
  await db.exec('reset role');assert.deepEqual((await db.query('select to_jsonb(t) snapshot from public.agent_pending_tasks t order by uuid')).rows,before,'Read paths preserve expired,mechanical and untouched rows and all timestamps exactly');
 }finally{await db.close();}
});

test('production runner completes selected work against131large tasks without loading the complete backlog at any stage',async t=>{
 const current=task(1,{current:true}),f=fixture({backlog:130,current:[current]});
 for(const row of f.tasks.values())row.info.executionHistory=[{kind:'model_result',result:{text:'Retained historical work: '+'x'.repeat(94100)}}];
 for(const row of f.backlogTasks)row.info=copy(f.tasks.get(row.uuid).info);
 const before=copy([...f.tasks.values()]),responses=[];
 f.taskStore.list=async()=>{throw Error('Complete backlog read is forbidden in the production pipeline');};
 for(const method of ['catalogue','read']){const base=f.taskStore[method];f.taskStore[method]=async args=>{const result=await base(args);responses.push({method,taskId:args.taskId,bytes:bytes(result)});return result;};}
 const steps=[turn(call('read_pending_task','selected',{taskId:current.uuid},[current.uuid])),turn(call('read_discord_messages','source',{url:'https://discord.com/channels/100/200/301',context:false},[current.uuid]),call('lookup_map_person','person',lookupFor(),[current.uuid]),call('read_map_events','event',{sourceId:ids.club,sourceRecordId:current.info.request.calendarEventId},[current.uuid])),turn(call('patch_map_participation','patch',patchFor(f.state),[current.uuid])),turn(call('resolve_pending_task','resolve',{taskId:current.uuid,outcome:'completed'},[current.uuid])),turn(call('finish_batch','finish',[]))];
 const provider={toolTurn:async()=>{assert(steps.length,'Unexpected followup request');return steps.shift();}};
 const result=await f.run(provider);assert.equal(result.status,'completed',JSON.stringify(result));assert.equal(result.followupStatus,'completed');assertAdded(f);assert(!f.tasks.has(current.uuid));
 assert(responses.some(row=>row.method==='catalogue'));assert(responses.some(row=>row.method==='read'));
 assert(responses.every(row=>row.method!=='read'||row.taskId===current.uuid),'Unrelated histories must stay unloaded');
 assert(responses.every(row=>row.bytes<150000),'No startup,transition orfinish response approaches the complete12MB backlog');
 for(const old of before.filter(row=>row.uuid!==current.uuid))assert.deepEqual(f.tasks.get(old.uuid),old);
 t.diagnostic(`Full backlog ${bytes(before)} bytes; largest storage response ${Math.max(...responses.map(row=>row.bytes))} bytes; exact reads ${responses.filter(row=>row.method==='read').length}.`);
});

function pipelineFixture({pending=[task(1,{current:true})],originals=[input()]}={}) {
 const rows=new Map(pending.map(row=>[row.uuid,copy(row)])),calls=[],history=[],principal={allowedSourceIds:[source]},control={failed:false};
 const store=attachTaskReads({configured:true,list:async()=>{throw Error('Unexpected complete backlog read');},save:async args=>{calls.push({method:'save',...copy(args)});const prior=rows.get(args.task.uuid);if(prior&&args.expectedUpdatedAt!==prior.updated_at)return {status:'conflict'};const saved={...copy(args.task),created_at:prior?.created_at??stamp,updated_at:now,expires_at:prior?.expires_at??'2026-10-24T12:00:00.000Z'};rows.set(saved.uuid,saved);return {status:'ready',task:copy(saved)};},resolve:async args=>{calls.push({method:'resolve',...copy(args)});return {status:'conflict'};}},rows,{failed:()=>control.failed,onCall:row=>calls.push(row)});
 const staged=createStagedPipeline({taskStore:store,principal,now:()=>new Date(now),fragments:createBoundedResults(),bindTask:async()=>{},verifyResolution:async()=>true});
 const context={principal,inputIds:[originals[0].uuid]},execute=(name,args,inputIds=context.inputIds)=>staged.tools.find(row=>row.name===name).execute(args,{...context,inputIds});
 return {rows,calls,history,principal,control,staged,execute,
  begin:()=>staged.pipeline.beginCycle({leaseToken,inputs:originals,recordExecution:async row=>history.push(copy(row)),getExecutionLog:()=>copy(history)}),
  check:()=>staged.pipeline.validateInitialFinish({principal,handledInputIds:originals.map(row=>row.uuid),noChangeInputIds:[]}),
  after:()=>staged.pipeline.afterInitial({handledInputIds:originals.map(row=>row.uuid),inputs:originals,executionLog:copy(history)}),
 };
}

test('catalogue matching input UUIDs never covers a different full original,and read failures do not finish or mutate tasks',async()=>{
 for(const variant of ['same','edited body','changed revision','changed author','failed exact read']){
  const saved=task(1,{current:true}),original=copy(saved.info.inputs[0]);
  if(variant==='edited body')original.raw_response.payload.content='Different claimed content with the same queue UUID';
  if(variant==='changed revision')original.raw_response.revision='2';
  if(variant==='changed author')original.raw_response.payload.author.id='999';
  const f=pipelineFixture({pending:[saved],originals:[original]});await f.begin();if(variant==='failed exact read')f.control.failed=true;
  const result=await f.check();assert.equal(result.status,variant==='same'?'ready':variant==='failed exact read'?'unavailable':'pending',variant);
  if(result.status==='pending')assert.deepEqual(result.uncoveredInputIds,[original.uuid]);
  assert(f.calls.some(row=>row.method==='read'&&row.taskId===saved.uuid));assert(!f.calls.some(row=>['save','resolve'].includes(row.method)));assert.deepEqual(f.rows.get(saved.uuid),saved);
 }
});

test('existing generated identities load mechanical records before merge and never overwrite their saved facts',async()=>{
 const request={summary:'The same deferred work',operation:'source_review'},original=input(),hash=createHash('sha256').update(canonicalJson([[original.uuid],request])).digest('hex');
 const id=`${hash.slice(0,8)}-${hash.slice(8,12)}-5${hash.slice(13,16)}-a${hash.slice(17,20)}-${hash.slice(20,32)}`;
 const mechanical=task(44,{operation:'calendar_review'});mechanical.uuid=id;
 const f=pipelineFixture({pending:[mechanical],originals:[original]});await f.begin();const result=await f.execute('defer_task',request);
 assert.notEqual(result.status,'ready');assert.deepEqual(f.rows.get(id),mechanical);assert(!f.calls.some(row=>row.method==='save'));
 assert(f.calls.some(row=>row.method==='read'&&row.taskId===id),'A privately retained mechanical identity must be read before rejecting the collision');
});

test('finish rereads only obligated exact tasks and revokes old blocker proof after content,version,expiry,scope or storage changes',async()=>{
 for(const variant of ['unchanged','same-version content','new version','expired','source revoked','read unavailable']){
  const saved=task(1,{current:true}),old=task(99,{operation:'source_review'}),f=pipelineFixture({pending:[old,saved],originals:saved.info.inputs});await f.begin();await f.after();
  assert.equal((await f.execute('read_pending_task',{taskId:saved.uuid},[saved.uuid])).status,'ready');
  const context={principal:f.principal,inputIds:[saved.uuid]},binding=f.staged.participationDependencies(context)[0];assert(binding);
  assert.equal(await f.staged.recordParticipationOutcome({context,binding,dependency:'calendar:club:workshop',reason:'calendar_unavailable'}),true);
  assert.equal((await f.staged.pipeline.validateFinish(context)).status,'ready','An unchanged fully read task with an actual private blocker can stop without deletion');
  if(variant==='same-version content')f.rows.get(saved.uuid).info.inputs[0].raw_response.payload.content='The saved original changed without a version change';
  if(variant==='new version')f.rows.get(saved.uuid).updated_at='2026-10-23T22:30:01.000Z';
  if(variant==='expired')f.rows.get(saved.uuid).expires_at='2026-10-23T22:29:59.000Z';
  if(variant==='source revoked')f.principal.allowedSourceIds=[];
  if(variant==='read unavailable')f.control.failed=true;
  const before=copy([...f.rows.values()]),result=await f.staged.pipeline.validateFinish(context);
  assert.equal(result.status,variant==='unchanged'?'ready':variant==='read unavailable'?'unavailable':'pending',variant);
  assert(f.calls.filter(row=>row.method==='read').every(row=>row.taskId===saved.uuid),'Unrelated task histories stay unread at finish');
  assert.deepEqual([...f.rows.values()],before);assert(!f.calls.some(row=>['save','resolve'].includes(row.method)));
 }
});

test('Node storage rejects foreign or oversized task responses and reports safe distinct failure categories',async()=>{
 const row=task(1,{current:true}),entry=taskCatalogue(row),arguments_={leaseToken,allowedSourceIds:[source]},diagnostics=[];
 const get=value=>createPendingTaskStore({env,writeDiagnostic:record=>diagnostics.push(record),fetchImpl:async()=>Response.json(value)});
 assert.equal((await get({status:'ready',tasks:[entry]}).catalogue(arguments_)).status,'ready');
 for(const tasks of [[entry,entry],[{...entry,sourceIds:[other]}],[{...entry,inputIds:[row.info.inputs[0].uuid,row.info.inputs[0].uuid]}],[{...entry,request:{...entry.request,summary:'x'.repeat(101)}}]])assert.equal((await get({status:'ready',tasks}).catalogue(arguments_)).status,'unavailable');
 assert.equal((await get({status:'ready',task:{...row,uuid:randomUUID()}}).read({...arguments_,taskId:row.uuid})).status,'unavailable');
 assert.equal((await get({status:'ready',task:{...row,info:{...row.info,executionHistory:['x'.repeat(280000)]}}}).read({...arguments_,taskId:row.uuid})).status,'unavailable');
 for(const [status,body,category] of [[500,{code:'57014',message:'PRIVATE_DATABASE_CONTENT',details:'PRIVATE_DETAIL'},'database_timeout'],[403,{message:'PRIVATE_DENIAL'},'permission_denied'],[503,{message:'PRIVATE_HTTP_BODY'},'http_error']]){
  const store=createPendingTaskStore({env,writeDiagnostic:record=>diagnostics.push(record),fetchImpl:async()=>Response.json(body,{status})});
  const result=await store.catalogue(arguments_);assert.notEqual(result.status,'ready');assert.equal(result.diagnostics.category,category);assert.equal(result.diagnostics.httpStatus,status);assert(Number.isSafeInteger(result.diagnostics.responseBytes));assert(result.diagnostics.elapsedMs>=0);
 }
 assert(!JSON.stringify(diagnostics).includes('PRIVATE_'));assert(!JSON.stringify(diagnostics).includes(source));assert(!JSON.stringify(diagnostics).includes(env.SUPABASE_SERVICE_ROLE_KEY));
});

test('permission failures with unreadable bodies and unavailable network still retain safe distinct diagnostics',async()=>{
 for(const [transport,category] of [[async()=>new Response('PRIVATE_NON_JSON_DENIAL',{status:403}),'permission_denied'],[async()=>{throw Error('PRIVATE_NETWORK_EXCEPTION');},'network_error'],[async()=>new Response('PRIVATE_INVALID_JSON',{status:200}),'invalid_json']]){
  const diagnostics=[],store=createPendingTaskStore({env,fetchImpl:transport,writeDiagnostic:row=>diagnostics.push(row)});
  const result=await store.catalogue({leaseToken,allowedSourceIds:[source]});assert.notEqual(result.status,'ready');assert.equal(result.diagnostics.category,category);
  assert(!JSON.stringify([result,diagnostics]).includes('PRIVATE_'));
 }
});

test('the existing15second request deadline is classified without exposing exceptions or changing task state',async()=>{
 const diagnostics=[],store=createPendingTaskStore({env,writeDiagnostic:row=>diagnostics.push(row),fetchImpl:async(_url,{signal})=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(Error('PRIVATE_ABORT_MESSAGE')),{once:true}))});
 const keepAlive=setTimeout(()=>{},16000);
 try {
  const result=await store.catalogue({leaseToken,allowedSourceIds:[source]});assert.equal(result.status,'unavailable');assert.equal(result.diagnostics.category,'request_timeout');
  assert(result.diagnostics.elapsedMs>=14000&&result.diagnostics.elapsedMs<20000);assert(!JSON.stringify([result,diagnostics]).includes('PRIVATE_'));
 }finally{clearTimeout(keepAlive);}
});
