import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {vector} from '@electric-sql/pglite-pgvector';
import {createMiroStore} from './fixtures/retired-miro-rest/store.js';
import {runMiroSync} from './fixtures/retired-miro-rest/sync.js';
import {readMiroConfig} from './fixtures/retired-miro-rest/config.js';
import {MiroError} from './fixtures/retired-miro-rest/client.js';

export function sqlRpc(db,name,args={}) {
 const keys=Object.keys(args);
 return db.query('select public.'+name+'('+keys.map((k,i)=>k+' => $'+(i+1)).join(',')+') value',keys.map(k=>args[k]&&typeof args[k]==='object'&&!Array.isArray(args[k])?JSON.stringify(args[k]):args[k])).then(r=>r.rows[0].value);
}
const snapshot=(items=[{id:'sticky1',type:'sticky_note',data:{content:'Original <b>workshop</b>'},position:{x:20,y:40},unknownField:{preserve:true}}])=>({schemaVersion:1,board:{id:'board1',name:'Calendar',team:{id:'team1'}},items,connectors:[],groups:[],tags:[],itemTags:{},groupItems:{},coverage:{complete:true},captureStartedAt:'2026-01-01T00:00:00Z',captureFinishedAt:'2026-01-01T00:01:00Z'});
const finish=(db,claim,body=snapshot())=>sqlRpc(db,'miro_sync_finish',{p_board_id:'board1',p_lease_token:claim.lease_token,p_config_revision:claim.config_revision,p_snapshot:body,p_content_hash:'a'.repeat(64)});
async function isolated(db,fn){await db.exec('begin');try{await fn();}finally{await db.exec('rollback');}}

test('001 + 012 real SQL: service isolation, ACL, leases and atomic full snapshots',async t=>{
 const db=new PGlite({extensions:{vector}});
 try {
  await db.exec('create role anon;create role authenticated;create role service_role bypassrls;');
  for(const name of ['202610120001_knowledge.sql','202610150012_miro_board_sync.sql'])await db.exec(await readFile(new URL('../supabase/migrations/'+name,import.meta.url),'utf8'));
  await db.exec('set role service_role');
  for(const kind of ['google_calendar','discord','google_drive','manual'])await db.query('insert into public.knowledge_sources(kind,external_id,title) values($1,$1,$1)',[kind]);
  const row=await sqlRpc(db,'miro_sync_register',{p_board_id:'board1',p_team_id:'team1'});
  assert.equal((await db.query('select count(*)::int n from public.knowledge_source_members')).rows[0].n,0);
  const auth={p_member_id:'local-development',p_allowed_source_ids:[row.source_id],p_board_id:'board1'};
  await t.test('browser cannot read table or execute even authorization helper',async()=>{
   for(const role of ['anon','authenticated']) {
    await db.exec('set role '+role);
    await assert.rejects(db.query('select * from public.miro_boards'),e=>e.code==='42501');
    await assert.rejects(sqlRpc(db,'miro_authorized_board',auth),e=>e.code==='42501');
   }
   await db.exec('set role service_role');
   const flags=(await db.query("select relrowsecurity,relforcerowsecurity from pg_class where oid='public.miro_boards'::regclass")).rows[0];
   assert(flags.relrowsecurity&&flags.relforcerowsecurity);
  });
  await t.test('explicit member grant AND source allowlist; raw snapshot remains linked and unchanged',()=>isolated(db,async()=>{
   assert.equal(await sqlRpc(db,'miro_authorized_board',auth),null);
   await db.query('insert into public.knowledge_source_members(source_id,member_id,can_read) values($1,$2,true)',[row.source_id,'local-development']);
   assert.equal((await sqlRpc(db,'miro_authorized_board',auth)).board_id,'board1');
   assert.equal(await sqlRpc(db,'miro_authorized_board',{...auth,p_allowed_source_ids:[randomUUID()]}),null);
   assert.equal(await sqlRpc(db,'miro_authorized_board',{...auth,p_member_id:randomUUID()}),null);
   const claim=await sqlRpc(db,'miro_sync_claim',{p_board_id:'board1'});
   assert.equal(await finish(db,claim),true);
   const saved=await sqlRpc(db,'miro_get_authorized_board',auth);
   assert.deepEqual(saved.snapshot,snapshot());assert(!('lease_token' in saved));
   assert.equal(saved.url,'https://miro.com/app/board/board1/');
   await db.query("update public.knowledge_sources set status='disabled' where id=$1",[row.source_id]);
   assert.equal(await sqlRpc(db,'miro_get_authorized_board',auth),null);
  }));
  await t.test('exclusive lease, stale token rejection, failure preserves original, empty complete replaces deleted items',()=>isolated(db,async()=>{
   const first=await sqlRpc(db,'miro_sync_claim',{p_board_id:'board1'});
   assert.equal(await sqlRpc(db,'miro_sync_claim',{p_board_id:'board1'}),null);
   assert.equal(await finish(db,{...first,lease_token:randomUUID()}),false);
   assert.equal(await finish(db,first),true);
   const second=await sqlRpc(db,'miro_sync_claim',{p_board_id:'board1'});
   assert.equal(await sqlRpc(db,'miro_sync_fail',{p_board_id:'board1',p_lease_token:second.lease_token,p_config_revision:second.config_revision,p_error_code:'network_error'}),true);
   const saved=(await db.query('select * from public.miro_boards')).rows[0];
   assert.deepEqual(saved.snapshot,snapshot());assert.equal(saved.snapshot_version,1);assert.equal(saved.status,'failed');
   const third=await sqlRpc(db,'miro_sync_claim',{p_board_id:'board1'});
   await assert.rejects(finish(db,third,{...snapshot(),coverage:{complete:false}}),e=>e.code==='22023');
  }));
  await t.test('empty complete snapshot reconciles deletions',()=>isolated(db,async()=>{
   await finish(db,await sqlRpc(db,'miro_sync_claim',{p_board_id:'board1'}));
   assert.equal(await finish(db,await sqlRpc(db,'miro_sync_claim',{p_board_id:'board1'}),snapshot([])),true);
   const saved=(await db.query('select * from public.miro_boards')).rows[0];assert.equal(saved.item_count,0);assert.equal(saved.snapshot_version,2);assert.deepEqual(saved.snapshot.items,[]);
  }));
  await t.test('expired workers and config/source ABA changes cannot publish or renew',()=>isolated(db,async()=>{
   const a=await sqlRpc(db,'miro_sync_claim',{p_board_id:'board1'});
   await db.query("update public.miro_boards set lease_expires_at=clock_timestamp()-interval '1 second' where board_id='board1'");
   const b=await sqlRpc(db,'miro_sync_claim',{p_board_id:'board1'});assert.notEqual(a.lease_token,b.lease_token);assert.equal(await finish(db,a),false);
   await db.query("update public.miro_boards set enabled=false where board_id='board1'");await db.query("update public.miro_boards set enabled=true where board_id='board1'");
   assert.equal(await finish(db,b),false);
   const c=await sqlRpc(db,'miro_sync_claim',{p_board_id:'board1'});
   await db.query("update public.knowledge_sources set status='disabled' where id=$1",[row.source_id]);await db.query("update public.knowledge_sources set status='active' where id=$1",[row.source_id]);
   assert.equal(await finish(db,c),false);assert.equal(await sqlRpc(db,'miro_sync_renew',{p_board_id:'board1',p_lease_token:c.lease_token,p_config_revision:c.config_revision}),false);
  }));
  await t.test('real runner + store + SQL publishes full snapshot and retains it after detail access failure',async()=>{
   const errors=[],logs=[],requests=[];
   const store=createMiroStore({env:{SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'SECRET_SERVICE_KEY'},fetchImpl:async(url,opts)=>{
    assert.equal(opts.redirect,'error');assert.equal(opts.method,'POST');const name=url.split('/').at(-1);assert(name.startsWith('miro_'));requests.push(name);
    try{return Response.json(await sqlRpc(db,name,JSON.parse(opts.body)));}catch(error){errors.push(error.code);return Response.json({code:error.code},{status:400});}
   }});
   const config=readMiroConfig({MIRO_SYNC_ENABLED:'true',MIRO_ACCESS_TOKEN:'SECRET_MIRO_TOKEN',MIRO_BOARD_IDS:'board2'});let deny=false;
   const client={readBoard:async()=>({id:'board2',name:'Calendar',modifiedAt:'2026-10-15T12:00:00Z'}),listItems:async()=>({data:[{id:'card2',type:'card'}]}),readItem:async()=>{if(deny)throw new MiroError('forbidden');return {id:'card2',type:'card',data:{title:'RAW_CONTENT_SENTINEL',description:'Room pending'}};},listConnectors:async()=>({data:[]}),listGroups:async()=>({data:[]}),listTags:async()=>({data:[],offset:0,total:0}),readItemTags:async()=>({tags:[]})};
   const first=await runMiroSync({config,store,createClient:()=>client,log:v=>logs.push(v)});assert.equal(first.succeeded,1,JSON.stringify({first,errors}));
   const before=(await db.query("select * from public.miro_boards where board_id='board2'")).rows[0];assert.equal(before.item_count,1);assert.equal(before.snapshot.items[0].data.title,'RAW_CONTENT_SENTINEL');
   deny=true;const second=await runMiroSync({config,store,createClient:()=>client,log:v=>logs.push(v)});assert.equal(second.failed,1);
   const after=(await db.query("select * from public.miro_boards where board_id='board2'")).rows[0];assert.deepEqual(after.snapshot,before.snapshot);assert.equal(after.snapshot_version,before.snapshot_version);assert.equal(after.status,'blocked');assert.equal(after.error_code,'forbidden');assert.equal(after.lease_token,null);
   const calls=requests.length;assert.equal((await runMiroSync({config:{...config,enabled:false},store,createClient:()=>assert.fail('disabled fetch')})).status,'disabled');assert.equal((await runMiroSync({config,store,mode:'scheduled',now:()=>Date.parse('2026-07-01T11:00:00Z'),createClient:()=>assert.fail('outside schedule')})).status,'outside_schedule');assert.equal(requests.length,calls);
   assert.equal(errors.length,0);assert(!JSON.stringify(logs).includes('RAW_CONTENT_SENTINEL'));assert(!JSON.stringify(logs).includes('SECRET_'));
  });
  await t.test('board identity, team mismatch and incomplete collections rejected',async()=>{
   const c=await sqlRpc(db,'miro_sync_claim',{p_board_id:'board1'});
   for(const body of [{...snapshot(),board:{id:'other',team:{id:'team1'}}},{...snapshot(),board:{id:'board1',team:{id:'other'}}},{...snapshot(),items:[{id:'same'},{id:'same'}]},{...snapshot(),tags:null}])await assert.rejects(finish(db,c,body),e=>e.code==='22023');
   assert.equal((await db.query('select snapshot from public.miro_boards')).rows[0].snapshot,null);
  });
 }finally{await db.close();}
});
