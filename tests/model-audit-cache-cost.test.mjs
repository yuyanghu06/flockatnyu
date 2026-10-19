import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {estimateAuditCost} from '../server/model-audit.js';
const identity={provider:'openai-compatible',model:'gpt-6-luna',providerBaseHost:'api.openai.com',serviceTier:'default'};
const usage={inputTokens:10000,outputTokens:200,cacheReadTokens:1000,cacheWriteTokens:7946,reasoningTokens:30};
const expected=((10000-1000-7946)*0.10+1000*0.01+7946*0.125+200*0.50)/1e6;
const directory=new URL('../supabase/migrations/',import.meta.url);
const original=await readFile(new URL('202610190033_agent_model_audit.sql',directory),'utf8');
const incremental=await readFile(new URL('202610190034_agent_audit_cache_write_cost.sql',directory),'utf8');
const rpc=(db,name,p)=>db.query(`select public.agent_audit_${name}($1::jsonb) result`,[JSON.stringify(p)]);
async function reject(db,fn){await db.exec('begin');try{await assert.rejects(fn,e=>e.code==='23514');}finally{await db.exec('rollback');}}

test('complete known short-context usage prices cache writes as an input subset; unknown and impossible usage stays unknown',()=>{
 assert.equal(estimateAuditCost(identity,usage).estimatedCostUsd,expected);
 assert.equal(estimateAuditCost(identity,{...usage,cacheWriteTokens:0}).estimatedCostUsd,0.00101);
 assert.equal(estimateAuditCost(identity,{...usage,inputTokens:272000}).pricingBasis.cacheWrite,0.125);
 for(const change of [{inputTokens:272001},{cacheWriteTokens:null},{cacheWriteTokens:undefined},{cacheWriteTokens:-1},{cacheWriteTokens:9001},{cacheWriteTokens:7946.5},{cacheReadTokens:null}])assert.equal(estimateAuditCost(identity,{...usage,...change}),null);
 for(const serviceTier of ['priority','flex','batch'])assert.equal(estimateAuditCost({...identity,serviceTier},usage),null);
 assert.equal(estimateAuditCost({...identity,providerBaseHost:'proxy.example.test'},usage),null);
});

test('034 incremental SQL preserves rows/ACL, accepts exact cache-write costs, rejects missing counters and retains terminal immutability',async()=>{
 const db=new PGlite();try{
  await db.exec('create role anon;create role authenticated;create role service_role bypassrls;');await db.exec(original);
  const start={callId:randomUUID(),runId:randomUUID(),agent:'chat',round:1,...identity,operation:'stream',stream:true};
  await rpc(db,'start_model',start);
  const before=(await db.query('select to_jsonb(t) row from public.agent_model_calls t')).rows;
  const acl=(await db.query("select proacl::text acl,prosecdef,proconfig from pg_proc where oid='public.agent_audit_finish_model(jsonb)'::regprocedure")).rows;
  await db.exec(incremental);
  assert.deepEqual((await db.query('select to_jsonb(t) row from public.agent_model_calls t')).rows,before);
  assert.deepEqual((await db.query("select proacl::text acl,prosecdef,proconfig from pg_proc where oid='public.agent_audit_finish_model(jsonb)'::regprocedure")).rows,acl);
  const finish={callId:start.callId,runId:start.runId,agent:'chat',round:1,status:'succeeded',usage,output:{value:{text:'Synthetic answer'}},serviceTier:'default',...estimateAuditCost(identity,usage)};
  for(const change of [{estimatedCostUsd:expected+0.001},{usage:{...usage,cacheWriteTokens:null}},{usage:{...usage,cacheWriteTokens:9001}},{usage:{...usage,inputTokens:272001}},{serviceTier:'priority'}])await reject(db,()=>rpc(db,'finish_model',{...finish,...change}));
  assert.equal((await db.query('select status from public.agent_model_calls')).rows[0].status,'started');
  await db.exec('set role service_role');await rpc(db,'finish_model',finish);await rpc(db,'finish_model',{...finish,estimatedCostUsd:10,status:'failed'});await db.exec('reset role');
  const row=(await db.query('select status,estimated_cost_usd,usage,pricing_basis from public.agent_model_calls')).rows[0];assert.equal(row.status,'succeeded');assert.equal(Number(row.estimated_cost_usd),expected);assert.equal(row.usage.cacheWriteTokens,7946);assert.equal(row.pricing_basis.cacheWrite,0.125);
  for(const change of [{cacheWriteTokens:null},{inputTokens:272001}]){
   const s={...start,callId:randomUUID()};await rpc(db,'start_model',s);await rpc(db,'finish_model',{...finish,callId:s.callId,usage:{...usage,...change},estimatedCostUsd:null,pricingBasis:null});
   assert.equal((await db.query('select estimated_cost_usd from public.agent_model_calls where call_id=$1',[s.callId])).rows[0].estimated_cost_usd,null);
  }
  for(const role of ['anon','authenticated'])assert.equal((await db.query("select has_function_privilege($1,'public.agent_audit_finish_model(jsonb)','EXECUTE') allowed",[role])).rows[0].allowed,false);
 }finally{await db.close();}
});

test('applied033 migration is unchanged by incremental pricing correction',()=>{
 assert.equal(createHash('sha256').update(original).digest('hex'),'89083a97571d996ef42cc0bf1530767118a9bdc64a2d150614e14c497dce54b1');
});
