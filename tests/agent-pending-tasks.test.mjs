import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {createPendingTaskStore} from '../server/automation/task-store.js';

const source=randomUUID(),other=randomUUID(),leaseToken=randomUUID();
const fixtureTask=(patch={})=>({uuid:randomUUID(),info:{sourceIds:[source],summary:'Attach verified attendee',originalInputs:[{uuid:randomUUID(),raw_response:{source_id:source,payload:{channel_id:'200',speaker:'300',content:'Synthetic context'}}}],executionTrail:[{stage:'calendar',status:'ready',eventId:'event-123'}]},...patch});
const env={SUPABASE_URL:'https://db.example.test',SUPABASE_SERVICE_ROLE_KEY:'synthetic-private-key'};
const migration=name=>readFile(new URL('../supabase/migrations/'+name,import.meta.url),'utf8');
async function rpc(db,name,args={}) {
 const keys=Object.keys(args);
 return (await db.query(`select public.agent_pending_task_${name}(${keys.map((key,i)=>`${key}=>$${i+1}`).join(',')}) result`,Object.values(args).map(value=>value&&typeof value==='object'&&!Array.isArray(value)?JSON.stringify(value):value))).rows[0].result;
}
async function seedLease(db,token=leaseToken,expired=false) {
 await db.query("update public.agent_automation_state set data=jsonb_build_object('token',$1::text,'lease_until',clock_timestamp()+($2::int*interval '1 hour')) where key='runner'",[token,expired?-1:1]);
}
const save=(db,task,patch={})=>rpc(db,'save',{p_token:leaseToken,p_allowed_source_ids:[source,other],p_task_id:task.uuid,p_info:task.info,...patch});
const list=(db,scope=[source,other],token=leaseToken)=>rpc(db,'list',{p_token:token,p_allowed_source_ids:scope});
const resolve=(db,task,patch={})=>rpc(db,'resolve',{p_token:leaseToken,p_allowed_source_ids:[source,other],p_task_id:task.uuid,p_expected_updated_at:task.updated_at,...patch});

test('039 actual SQL: lease-fenced scoped temporary tasks preserve exact snapshots',async t=>{
 const db=new PGlite();
 try {
  await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create role public_probe;');
  for(const name of ['202610170018_agent_input_cache.sql','202610170019_agent_automation_state.sql','202610180032_scoped_agent_claim.sql','202610210036_agent_retry_quarantine.sql','202610220038_agent_empty_scope_maintenance.sql','202610220039_agent_pending_tasks.sql'])await db.exec(await migration(name));
  await seedLease(db);
  await t.test('FORCE RLS, no direct service mutations, only service may execute trusted RPCs',async()=>{
   const table=(await db.query("select relrowsecurity,relforcerowsecurity from pg_class where oid='public.agent_pending_tasks'::regclass")).rows[0];
   assert.deepEqual(table,{relrowsecurity:true,relforcerowsecurity:true});
   const signatures=['agent_pending_task_list(uuid,uuid[])','agent_pending_task_save(uuid,uuid[],uuid,jsonb,timestamptz,timestamptz)','agent_pending_task_resolve(uuid,uuid[],uuid,timestamptz)','agent_pending_task_prune()'];
   for(const role of ['anon','authenticated','public_probe','service_role']){
    for(const privilege of ['SELECT','INSERT','UPDATE','DELETE'])assert.equal((await db.query('select has_table_privilege($1,$2,$3) allowed',[role,'public.agent_pending_tasks',privilege])).rows[0].allowed,false);
    for(const signature of signatures)assert.equal((await db.query("select has_function_privilege($1,$2,'EXECUTE') allowed",[role,'public.'+signature])).rows[0].allowed,role==='service_role');
    await db.exec(`set role ${role}`);
    if(role==='service_role')await assert.rejects(db.query('delete from public.agent_pending_tasks'),e=>e.code==='42501');
    else await assert.rejects(list(db),e=>e.code==='42501');
    await db.exec('reset role');
   }
   await db.exec('set role service_role');
  });
  let first;
  await t.test('creates full trusted context with default24h TTL; stable UUID retry is idempotent',async()=>{
   const task=fixtureTask();const result=await save(db,task);assert.equal(result.status,'ready');first=result.task;
   assert.deepEqual(first.info,task.info);assert.equal(Date.parse(first.expires_at)-Date.parse(first.created_at),86400000);
   assert.deepEqual(await save(db,task),{status:'ready',task:first});
   assert.equal((await save(db,{...task,info:{...task.info,summary:'Different'}})).status,'conflict');
  });
  await t.test('multi-source tasks require every source, inaccessible content never returned',async()=>{
   const multi=await save(db,fixtureTask({info:{sourceIds:[source,other],summary:'MULTI_PRIVATE'}}));assert.equal(multi.status,'ready');
   const single=(await list(db,[source])).tasks;assert.equal(single.length,1);assert.equal(single[0].uuid,first.uuid);
   assert.equal((await list(db,[other])).tasks.length,0);
   assert.equal((await resolve(db,multi.task,{p_allowed_source_ids:[source]})).status,'forbidden');
   assert.equal((await save(db,{uuid:multi.task.uuid,info:{sourceIds:[source],summary:'DROP SOURCE'}},{p_expected_updated_at:multi.task.updated_at})).status,'forbidden');
  });
  await t.test('exact updated_at conflict fencing preserves concurrently advanced and untouched tasks',async()=>{
   const before=(await list(db)).tasks;const changed={uuid:first.uuid,info:{...first.info,summary:'Confirmed progress',executionTrail:[...first.info.executionTrail,{stage:'map',status:'ready'}]}};
   const updated=await save(db,changed,{p_expected_updated_at:first.updated_at});assert.equal(updated.status,'ready');assert.notEqual(updated.task.updated_at,first.updated_at);
   assert.equal((await resolve(db,first)).status,'conflict');
   assert.equal((await save(db,changed,{p_expected_updated_at:first.updated_at})).status,'conflict');
   const after=(await list(db)).tasks;assert.deepEqual(after.filter(task=>task.uuid!==first.uuid),before.filter(task=>task.uuid!==first.uuid));
   assert.equal((await resolve(db,updated.task)).status,'ready');assert.equal((await resolve(db,updated.task)).status,'conflict');
  });
  await t.test('wrong and expired leases cannot read/update/resolve; empty scope returns no payload',async()=>{
   const task=(await list(db)).tasks[0];
   assert.deepEqual(await list(db,[],randomUUID()),{status:'ready',tasks:[]});
   assert.deepEqual(await list(db,[source],randomUUID()),{status:'stale'});
   assert.equal((await save(db,fixtureTask(),{p_token:randomUUID()})).status,'stale');
   assert.equal((await resolve(db,task,{p_token:randomUUID()})).status,'stale');
   await db.exec('reset role');await seedLease(db,leaseToken,true);await db.exec('set role service_role');
   assert.deepEqual(await list(db),{status:'stale'});assert.equal((await save(db,fixtureTask())).status,'stale');assert.equal((await resolve(db,task)).status,'stale');
   await db.exec('reset role');await seedLease(db);await db.exec('set role service_role');
   assert.deepEqual((await list(db)).tasks,[task]);
  });
  await t.test('invalid shapes, scopes, size and retention extension fail closed',async()=>{
   for(const p_info of [null,[],{}, {sourceIds:[]},{sourceIds:[source,source]},{sourceIds:[null]},{sourceIds:['not-uuid']},{sourceIds:source},{sourceIds:[source],summary:'x'.repeat(262144)}])assert.equal((await save(db,fixtureTask(),{p_info})).status,'invalid_request');
   for(const p_allowed_source_ids of [null,[source,null],[source,source],[[source]]])assert.equal((await list(db,p_allowed_source_ids)).status,'invalid_request');
   assert.equal((await save(db,fixtureTask(),{p_allowed_source_ids:[]})).status,'invalid_request');
   assert.equal((await save(db,fixtureTask(),{p_allowed_source_ids:[other]})).status,'forbidden');
   assert.equal((await save(db,fixtureTask(),{p_expires_at:'2100-01-01T00:00:00Z'})).status,'invalid_request');
   const task=(await list(db)).tasks[0];assert.equal((await save(db,task,{p_expected_updated_at:task.updated_at,p_expires_at:'2100-01-01T00:00:00Z'})).status,'invalid_request');
  });
  await t.test('global capacity200 is explicit and allows updates/resolutions without deleting unrelated work',async()=>{
   await db.exec('reset role');await db.exec('truncate public.agent_pending_tasks');await db.exec('set role service_role');
   for(let i=0;i<200;i++)assert.equal((await save(db,fixtureTask({info:{sourceIds:[i%2?source:other],index:i}}))).status,'ready');
   const all=(await list(db)).tasks;assert.equal(all.length,200);assert.equal((await list(db,[source])).tasks.length,100);
   assert.equal((await save(db,fixtureTask())).status,'capacity');
   assert.equal((await save(db,{...all[0],info:{...all[0].info,progress:'done'}},{p_expected_updated_at:all[0].updated_at})).status,'ready');
   assert.equal((await resolve(db,all[1])).status,'ready');assert.equal((await save(db,fixtureTask())).status,'ready');
   assert.equal((await list(db)).tasks.length,200);
  });
  await t.test('prune and empty-scope maintenance delete expired tasks only, never queue originals',async()=>{
   await db.exec('reset role');
   await db.query("insert into public.agent_input_cache(uuid,raw_response) values($1,$2)",[randomUUID(),JSON.stringify({payload:'QUEUE_UNCHANGED'})]);
   const expiredIds=(await db.query('select uuid from public.agent_pending_tasks order by uuid limit 2')).rows.map(row=>row.uuid);
   for(const uuid of expiredIds)await db.query("update public.agent_pending_tasks set created_at=clock_timestamp()-interval '25 hours',updated_at=clock_timestamp()-interval '25 hours',expires_at=clock_timestamp()-interval '2 hours' where uuid=$1",[uuid]);
   await db.exec('set role service_role');assert.deepEqual(await list(db,[],null),{status:'ready',tasks:[]});assert.equal((await list(db)).tasks.length,198);
   assert.deepEqual(await rpc(db,'prune'),{status:'ready',pruned:0});
   await db.exec('reset role');assert.equal((await db.query('select count(*)::int n from public.agent_input_cache')).rows[0].n,1);
  });
  await t.test('real Node store round-trips through trusted SQL RPCs and exact versions',async()=>{
   await db.exec('set role service_role');const calls=[];
   const store=createPendingTaskStore({env,fetchImpl:async(url,request)=>{
    const name=new URL(url).pathname.split('/').at(-1).replace('agent_pending_task_','');calls.push(name);assert.equal(request.redirect,'error');
    return Response.json(await rpc(db,name,JSON.parse(request.body)));
   }});
   const task=fixtureTask();const saved=await store.save({leaseToken,allowedSourceIds:[source],task});assert.equal(saved.status,'ready');
   assert.deepEqual((await store.list({leaseToken,allowedSourceIds:[source]})).tasks.find(t=>t.uuid===task.uuid),saved.task);
   const revised=await store.save({leaseToken,allowedSourceIds:[source],task:{...task,info:{...task.info,progress:'ready'}},expectedUpdatedAt:saved.task.updated_at});assert.equal(revised.status,'ready');
   assert.equal((await store.resolve({leaseToken,allowedSourceIds:[source],taskId:task.uuid,expectedUpdatedAt:saved.task.updated_at})).status,'conflict');
   assert.equal((await store.resolve({leaseToken,allowedSourceIds:[source],taskId:task.uuid,expectedUpdatedAt:revised.task.updated_at})).status,'ready');
   assert.deepEqual(await store.list({allowedSourceIds:[]}),{status:'ready',tasks:[]});assert.deepEqual(await store.prune(),{status:'ready',pruned:0});
   assert.deepEqual(calls,['save','list','save','resolve','resolve','list','prune']);
  });
 }finally{await db.close();}
});

test('Node cache store validates before HTTP and suppresses all diagnostic/error bodies',async()=>{
 let requests=0;
 const store=createPendingTaskStore({env,fetchImpl:async()=>{requests++;return Response.json({status:'capacity',diagnostic:'SECRET'});}});
 const task=fixtureTask();
 for(const allowedSourceIds of [undefined,[source,source],[source,source.toUpperCase()],['invalid'],[null]])assert.equal((await store.list({leaseToken,allowedSourceIds})).status,'invalid_request');
 for(const patch of [{leaseToken:'bad'},{task:{...task,info:{sourceIds:[other]}}},{expectedUpdatedAt:'bad'},{task:{...task,info:{sourceIds:[source],summary:'x'.repeat(262144)}}}])assert.equal((await store.save({leaseToken,allowedSourceIds:[source],task,...patch})).status,'invalid_request');
 assert.equal((await store.resolve({leaseToken,allowedSourceIds:[source],taskId:task.uuid})).status,'invalid_request');
 assert.equal(requests,0);
 const capacity=await store.save({leaseToken,allowedSourceIds:[source],task});assert.equal(capacity.status,'capacity');assert(!JSON.stringify(capacity).includes('SECRET'));
 for(const status of [400,401,403,500]){
  const bad=createPendingTaskStore({env,fetchImpl:async()=>new Response('PRIVATE_ERROR_BODY',{status})});
  assert.deepEqual(await bad.prune(),{status:[401,403].includes(status)?'forbidden':'unavailable'});
 }
 for(const SUPABASE_URL of ['https://user:secret@db.example.test','https://db.example.test/path','https://db.example.test/?token=secret','http://db.example.test'])assert.equal(createPendingTaskStore({env:{...env,SUPABASE_URL}}).configured,false);
 assert.deepEqual(await createPendingTaskStore({env:{}}).prune(),{status:'not_configured'});
 const controller=new AbortController();controller.abort();assert.deepEqual(await store.prune({signal:controller.signal}),{status:'aborted'});
});

test('Node cache store rejects bad scoped snapshots and supports a complete response larger than legacy128KiB',async()=>{
 const stamp=new Date().toISOString(),expires=new Date(Date.parse(stamp)+86400000).toISOString();
 const task={...fixtureTask(),created_at:stamp,updated_at:stamp,expires_at:expires};
 const get=data=>createPendingTaskStore({env,fetchImpl:async()=>Response.json(data)});
 const large={...task,info:{sourceIds:[source],summary:'x'.repeat(200000)}};
 assert.equal((await get({status:'ready',tasks:[large]}).list({leaseToken,allowedSourceIds:[source]})).tasks[0].info.summary.length,200000);
 for(const tasks of [[{...task,info:{sourceIds:[other],summary:'HIDDEN'}}],[task,task],Array.from({length:201},()=>({...task,uuid:randomUUID()})),[{...task,expires_at:'2100-01-01T00:00:00Z'}],null])assert.deepEqual(await get({status:'ready',tasks}).list({leaseToken,allowedSourceIds:[source]}),{status:'unavailable'});
 assert.deepEqual(await get({status:'ready',tasks:[task]}).list({allowedSourceIds:[]}),{status:'unavailable'});
 const full=Array.from({length:200},()=>({...task,uuid:randomUUID(),info:{sourceIds:[source],summary:'x'.repeat(250000)}}));
 assert.equal((await get({status:'ready',tasks:full}).list({leaseToken,allowedSourceIds:[source]})).tasks.length,200);
 const huge=get({status:'ready',tasks:[{...task,info:{sourceIds:[source],summary:'x'.repeat(55*1024*1024)}}]});
 assert.deepEqual(await huge.list({leaseToken,allowedSourceIds:[source]}),{status:'unavailable'});
});
