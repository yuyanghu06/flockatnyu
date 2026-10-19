import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const sql=await readFile(new URL('../supabase/migrations/202610190033_agent_model_audit.sql',import.meta.url),'utf8');
const callId='11111111-1111-4111-8111-111111111111',runId='22222222-2222-4222-8222-222222222222',other='33333333-3333-4333-8333-333333333333';
const start={callId,agent:'planner',runId,round:2,provider:'openai',model:'gpt-6-luna',operation:'toolTurn',stream:false,providerBaseHost:'api.openai.com',serviceTier:'default'};
const finish={callId,agent:'planner',runId,round:2,status:'succeeded',usage:{inputTokens:100,outputTokens:10,cacheReadTokens:0,cacheWriteTokens:null,reasoningTokens:null},output:{value:{text:'Synthetic model answer'},truncated:false,redacted:false},serviceTier:'default'};
const rpc=(db,name,payload)=>db.query(`select public.agent_audit_${name}($1::jsonb) result`,[JSON.stringify(payload)]);
async function reject(db,fn,code){await db.exec('begin');try{await assert.rejects(fn,code?e=>e.code===code:undefined);}finally{await db.exec('rollback');}}

test('033 real SQL: private ACL, immutable identities, atomic terminal updates, bounded retention',async t=>{
 const db=new PGlite();try{
  await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create table public.unrelated(id integer);insert into public.unrelated values(42);');await db.exec(sql);
  await t.test('additive service-only forced RLS, no browser RPC or raw service DML',async()=>{
   assert.deepEqual((await db.query('select * from public.unrelated')).rows,[{id:42}]);
   for(const table of ['agent_model_calls','agent_audit_events']){
    assert.deepEqual((await db.query('select relrowsecurity enabled,relforcerowsecurity forced from pg_class where oid=$1::regclass',[`public.${table}`])).rows[0],{enabled:true,forced:true});
    assert.equal((await db.query("select has_table_privilege('service_role',$1,'SELECT') allowed",[`public.${table}`])).rows[0].allowed,true);
    for(const role of ['anon','authenticated'])await reject(db,()=>db.exec(`set local role ${role};select * from public.${table}`),'42501');
    for(const privilege of ['INSERT','UPDATE','DELETE'])assert.equal((await db.query("select has_table_privilege('service_role',$1,$2) allowed",[`public.${table}`,privilege])).rows[0].allowed,false);
   }
   for(const name of ['start_model','finish_model','record_event','prune']){
    const signature=`public.agent_audit_${name}(jsonb)`;
    for(const role of ['anon','authenticated'])assert.equal((await db.query('select has_function_privilege($1,$2,\'EXECUTE\') allowed',[role,signature])).rows[0].allowed,false);
    const def=(await db.query('select prosecdef,proconfig from pg_proc where oid=$1::regprocedure',[signature])).rows[0];assert.equal(def.prosecdef,true);assert.ok(def.proconfig.includes('search_path=""'));
   }
  });
  await t.test('durable starts are idempotent and IDs cannot be replayed under a different run',async()=>{
   await db.exec('set role service_role');await rpc(db,'start_model',start);await rpc(db,'start_model',start);await db.exec('reset role');
   const row=(await db.query('select * from public.agent_model_calls')).rows[0];assert.equal(row.status,'started');assert.equal(row.finished_at,null);assert.equal(row.usage,null);assert.equal(row.estimated_cost_usd,null);assert.ok(Math.abs((new Date(row.expires_at)-new Date(row.started_at))/86400000-7)<0.0001);
   for(const changed of [{runId:other},{agent:'chat'},{round:3},{model:'other'},{stream:true}])await reject(db,()=>rpc(db,'start_model',{...start,...changed}),'23514');
   for(const changed of [{runId:other},{agent:'chat'},{round:3}])await reject(db,()=>rpc(db,'finish_model',{...finish,...changed}),'23514');
   assert.equal((await db.query('select count(*)::int n from public.agent_model_calls')).rows[0].n,1);
  });
  await t.test('invalid/oversize usage/output/pricing rolls back while started row remains visible',async()=>{
   for(const changed of [{usage:{}},{usage:{...finish.usage,inputTokens:-1}},{usage:{...finish.usage,outputTokens:1.5}},{output:{value:'x'.repeat(615000)}},{status:'started'},{status:null},{usage:null},{estimatedCostUsd:-1,pricingBasis:{source:'known'}}])await reject(db,()=>rpc(db,'finish_model',{...finish,...changed}));
   assert.equal((await db.query('select status from public.agent_model_calls')).rows[0].status,'started');
  });
  await t.test('terminal retry is immutable and complete; missing tokens remain null',async()=>{
   await db.exec('set role service_role');await rpc(db,'finish_model',finish);await rpc(db,'finish_model',{...finish,status:'failed',output:{value:'Retry cannot replace answer'}});await db.exec('reset role');
   const row=(await db.query('select * from public.agent_model_calls')).rows[0];assert.equal(row.status,'succeeded');assert.equal(row.output.value.text,'Synthetic model answer');assert.equal(row.usage.reasoningTokens,null);assert.ok(row.finished_at);assert.equal(row.estimated_cost_usd,null);
  });
  await t.test('known direct pricing is checked and requested tier identity remains idempotent after actual-tier capture',async()=>{
   const priced='44444444-4444-4444-8444-444444444444';await rpc(db,'start_model',{...start,callId:priced,provider:'openai-compatible'});
   const pricingBasis={version:'2026-10-19',source:'https://developers.openai.com/api/docs/models/gpt-6-luna'};
   await reject(db,()=>rpc(db,'finish_model',{...finish,callId:priced,estimatedCostUsd:0.5,pricingBasis}),'23514');
   await rpc(db,'finish_model',{...finish,callId:priced,estimatedCostUsd:0.000015,pricingBasis});
   assert.equal(Number((await db.query('select estimated_cost_usd from public.agent_model_calls where call_id=$1',[priced])).rows[0].estimated_cost_usd),0.000015);
   const tiered='55555555-5555-4555-8555-555555555555';await rpc(db,'start_model',{...start,callId:tiered});
   await reject(db,()=>rpc(db,'finish_model',{...finish,callId:tiered,serviceTier:'priority',estimatedCostUsd:0.000015,pricingBasis}),'23514');
   await rpc(db,'finish_model',{...finish,callId:tiered,serviceTier:'priority'});await rpc(db,'start_model',{...start,callId:tiered});
   const row=(await db.query('select requested_service_tier,service_tier from public.agent_model_calls where call_id=$1',[tiered])).rows[0];assert.deepEqual(row,{requested_service_tier:'default',service_tier:'priority'});
   await db.query('delete from public.agent_model_calls where call_id=any($1::uuid[])',[[priced,tiered]]);
  });
  await t.test('events retain numeric metadata only and idempotence rejects changed identities',async()=>{
   const event={eventId:other,agent:'chat',runId,round:null,kind:'tool_finished',tool:'read_map_events',status:'failed',durationMs:45,counts:{calls:1}};
   await rpc(db,'record_event',event);await rpc(db,'record_event',event);
   for(const changed of [{runId:other},{counts:{raw:'private original'}},{counts:{n:-1}},{kind:'arbitrary_output'}])await reject(db,()=>rpc(db,'record_event',{...event,...changed}),'23514');
   assert.equal((await db.query('select count(*)::int n from public.agent_audit_events')).rows[0].n,1);
  });
  await t.test('server expiry cannot be supplied by RPC; pruning removes expired only',async()=>{
   await rpc(db,'start_model',{...start,callId:other,expiresAt:'2200-01-01'});
   assert.ok(new Date((await db.query('select expires_at from public.agent_model_calls where call_id=$1',[other])).rows[0].expires_at).getTime()<Date.now()+8*86400000);
   await db.exec("update public.agent_model_calls set started_at=clock_timestamp()-interval '8 days',expires_at=clock_timestamp()-interval '1 day' where call_id='33333333-3333-4333-8333-333333333333';update public.agent_audit_events set created_at=clock_timestamp()-interval '8 days',expires_at=clock_timestamp()-interval '1 day';");
   await reject(db,()=>rpc(db,'finish_model',{...finish,callId:other}),'23514');await rpc(db,'prune',{});
   assert.equal((await db.query('select count(*)::int n from public.agent_model_calls')).rows[0].n,1);assert.equal((await db.query('select count(*)::int n from public.agent_audit_events')).rows[0].n,0);
  });
 }finally{await db.close();}
});
