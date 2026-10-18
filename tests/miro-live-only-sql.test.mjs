import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {vector} from '@electric-sql/pglite-pgvector';
import {createMiroStore} from '../server/miro/store.js';
const directory=new URL('../supabase/migrations/',import.meta.url);
async function migration(n){if(n===30)return readFile(new URL('202610180030_miro_mcp_live_only.sql',directory),'utf8');const name=(await readdir(directory)).find(f=>f.endsWith('.sql')&&Number(f.slice(8,12))===n);assert(name);return readFile(new URL(name,directory),'utf8');}
const rpc=async(db,name,args={})=>{const keys=Object.keys(args);return (await db.query('select public.'+name+'('+keys.map((k,i)=>k+' => $'+(i+1)).join(',')+') value',Object.values(args))).rows[0].value;};
async function setup(){const db=new PGlite({extensions:{vector}});await db.exec('create role anon;create role authenticated;create role service_role bypassrls;');for(let n=1;n<=29;n++)await db.exec(await migration(n));return db;}
async function rejected(db,fn,code='23514'){await db.exec('begin');try{await assert.rejects(fn,e=>e.code===code);}finally{await db.exec('rollback');}}
async function fingerprint(db,tables){const out={};for(const table of tables)out[table]=(await db.query(`select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]'::jsonb) value from public.${table} t`)).rows[0].value;return out;}

test('030 retires all stored Miro content and sync RPCs while preserving identity, independent scopes and unrelated data',async t=>{
 const db=await setup();try {
 const rows=[];for(const [board,status,enabled,team] of [['active','active',true,'team'],['paused','active',false,'team'],['disabled','disabled',true,'team'],['error','error',false,null]]){
 const row=await rpc(db,'miro_sync_register',{p_board_id:board,p_team_id:team});rows.push(row);await db.query('update public.knowledge_sources set status=$1,title=$2,original_url=$3 where id=$4',[status,'Synthetic '+board,'https://miro.com/app/board/'+board+'/',row.source_id]);await db.query('update public.miro_boards set enabled=$1,data=$2::jsonb,last_success_at=now(),snapshot_config_revision=config_revision where board_id=$3',[enabled,JSON.stringify({privateFixture:'Discard this cached content'}),board]);
 }
 await db.query("insert into public.knowledge_sources(kind,external_id,title,status) values('manual','unrelated','Preserved source','active')");
 const oldSources=(await db.query('select to_jsonb(s) value from public.knowledge_sources s order by id')).rows.map(r=>r.value);
 const oldConfig=(await db.query('select board_id,source_id,enabled,team_id from public.miro_boards order by board_id')).rows;
 const tables=(await db.query("select tablename from pg_tables where schemaname='public' and tablename not in ('knowledge_sources','miro_boards') order by tablename")).rows.map(r=>r.tablename),before=await fingerprint(db,tables);
 await db.exec(await migration(30));
 await t.test('source UUID/status/title/URL/timestamps preserved and only exact metadata retained',async()=>{
 const actual=(await db.query('select to_jsonb(s) value from public.knowledge_sources s order by id')).rows.map(r=>r.value);assert.deepEqual(actual.map(({miro_scope,...s})=>s),oldSources);
 for(const row of oldConfig){const source=actual.find(s=>s.id===row.source_id);assert.deepEqual(source.miro_scope,{enabled:row.enabled,team_id:row.team_id});}
 assert.equal(actual.find(s=>s.kind==='manual').miro_scope,null);assert.deepEqual(await fingerprint(db,tables),before);
 });
 await t.test('old table, triggers and sync functions are absent; no public stored-function body references removed storage',async()=>{
 assert.equal((await db.query("select to_regclass('public.miro_boards') value")).rows[0].value,null);
 const funcs=(await db.query("select proname,prosrc from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind='f'")).rows;assert.deepEqual(funcs.filter(f=>/^miro_/.test(f.proname)).map(f=>f.proname),['miro_authorized_board']);assert(funcs.every(f=>!f.prosrc.includes('miro_boards')));
 assert.equal((await db.query("select count(*)::int n from pg_trigger where tgname in ('miro_source_config_guard','miro_board_config_guard')")).rows[0].n,0);
 });
 await t.test('SQL and real JS store enforce allowlist, active source and independently enabled board',async()=>{
 const args={p_member_id:null,p_allowed_source_ids:rows.map(r=>r.source_id),p_board_id:'active'};const found=await rpc(db,'miro_authorized_board',args);assert.equal(found.source_id,rows[0].source_id);assert.equal(found.team_id,'team');assert.deepEqual(Object.keys(found).sort(),['board_id','enabled','source_id','team_id','title','url']);
 for(const patch of [{p_allowed_source_ids:[]},{p_allowed_source_ids:[rows[1].source_id]},{p_board_id:'paused'},{p_board_id:'disabled'},{p_board_id:'error'},{p_board_id:'missing'}])assert.equal(await rpc(db,'miro_authorized_board',{...args,...patch}),null);
 const calls=[];const store=createMiroStore({env:{SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'synthetic-service'},fetchImpl:async(url,init)=>{calls.push(url);return Response.json(await rpc(db,url.split('/').at(-1),JSON.parse(init.body)));}});assert.deepEqual(Object.keys(store).sort(),['authorizedBoard','configured']);assert.equal((await store.authorizedBoard({boardId:'active',principal:{allowedSourceIds:[rows[0].source_id]}})).status,'ready');assert.equal((await store.authorizedBoard({boardId:'paused',principal:{allowedSourceIds:[rows[1].source_id]}})).status,'forbidden');assert(calls.every(u=>u.endsWith('/miro_authorized_board')));
 });
 await t.test('forced RLS and browser denial remain, service role can read new metadata',async()=>{
 const flags=(await db.query("select relrowsecurity,relforcerowsecurity from pg_class where oid='public.knowledge_sources'::regclass")).rows[0];assert(flags.relrowsecurity&&flags.relforcerowsecurity);
 for(const role of ['anon','authenticated']){await db.exec('set role '+role);await assert.rejects(db.query('select miro_scope from public.knowledge_sources'),e=>e.code==='42501');await assert.rejects(rpc(db,'miro_authorized_board',{p_member_id:null,p_allowed_source_ids:[rows[0].source_id],p_board_id:'active'}),e=>e.code==='42501');}await db.exec('set role service_role');assert.equal((await db.query("select miro_scope->>'team_id' team from public.knowledge_sources where external_id='active'")).rows[0].team,'team');await db.exec('reset role');
 });
 await t.test('metadata constraints reject cached payloads, malformed flags, foreign kinds and unsafe IDs',async()=>{
 for(const scope of [{enabled:true,team_id:'team',snapshot:{}},{enabled:'true',team_id:'team'},{enabled:true},{enabled:true,team_id:'../../evil'},[]])await rejected(db,()=>db.query('update public.knowledge_sources set miro_scope=$1::jsonb where id=$2',[JSON.stringify(scope),rows[0].source_id]));
 await rejected(db,()=>db.query('update public.knowledge_sources set miro_scope=null where id=$1',[rows[0].source_id]));await rejected(db,()=>db.query("update public.knowledge_sources set miro_scope='{\"enabled\":true,\"team_id\":null}' where kind='manual'"));await rejected(db,()=>db.query("update public.knowledge_sources set external_id='../escape' where id=$1",[rows[0].source_id]));
 });
 }finally{await db.close();}
});

test('030 anomalous identity aborts atomically without removing cached storage or changing unrelated sources',async()=>{
 const db=await setup();try {
 const row=await rpc(db,'miro_sync_register',{p_board_id:'fixture',p_team_id:'team'});await db.query("update public.knowledge_sources set external_id='different' where id=$1",[row.source_id]);assert.equal((await db.query('select external_id from public.knowledge_sources where id=$1',[row.source_id])).rows[0]?.external_id,'different');const old=await fingerprint(db,['knowledge_sources','miro_boards']);await assert.rejects(db.exec(await migration(30)),e=>e.code==='23514');await db.exec('rollback');assert.deepEqual(await fingerprint(db,['knowledge_sources','miro_boards']),old);assert.equal((await db.query("select count(*)::int n from information_schema.columns where table_schema='public' and table_name='knowledge_sources' and column_name='miro_scope'")).rows[0].n,0);
 }finally{await db.close();}
});

test('SQL migration versions are unique so the live-only cutover cannot be skipped by version-based runners',async()=>{
 const files=(await readdir(directory)).filter(name=>/^\d+_.+\.sql$/.test(name));const seen=new Map();for(const file of files){const version=file.split('_')[0];assert.equal(seen.has(version),false,`Duplicate migration version: ${seen.get(version)} and ${file}`);seen.set(version,file);}
});
