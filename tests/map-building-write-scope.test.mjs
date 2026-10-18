import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {vector} from '@electric-sql/pglite-pgvector';

const migrations=new URL('../supabase/migrations/',import.meta.url);
async function migration(n){const file=(await readdir(migrations)).find(f=>f.endsWith('.sql')&&Number(f.slice(8,12))===n);assert(file,`migration ${n} must exist`);return readFile(new URL(file,migrations),'utf8');}
async function values(db,table){return(await db.query(`select to_jsonb(t) value from public.${table} t order by to_jsonb(t)::text`)).rows;}
async function service(db,fn){await db.exec('begin;set local role service_role');try{await fn();}finally{await db.exec('rollback');}}
async function denied(db,sql,params=[]){await db.exec('savepoint denied');try{await assert.rejects(db.query(sql,params),e=>e.code==='42501',sql);}finally{await db.exec('rollback to savepoint denied;release savepoint denied');}}
const home='bobst-library',target='nyu-kimmel-center',planned='stern-school-of-business';
const source=randomUUID();
const entry=(person,extra={})=>({person_id:person,status:'self_reported',valid_from:'2026-10-17T12:00:00Z',expires_at:'2026-10-17T14:00:00Z',source_id:source,source_url:'https://discord.com/channels/123/456/789',...extra});
async function put(db,id,entries){return db.query('update public.map_buildings set people_here=$2::jsonb where id=$1',[id,JSON.stringify(entries)]);}
async function occupants(db,id){return(await db.query('select people_here from public.map_buildings where id=$1',[id])).rows[0].people_here;}
async function move(db,id,building,value){return(await db.query('select public.map_set_person_location($1,$2,$3::jsonb) result',[id,building,JSON.stringify(value)])).rows[0].result;}
async function catalogue(db){return(await db.query('select id,name,aliases from public.map_buildings order by id')).rows;}
async function unrelatedPrivileges(db){return(await db.query(`
 select 'table' kind,c.relname object_name,'' subobject,coalesce(c.relacl::text,'') acl
 from pg_class c where c.relnamespace='public'::regnamespace and c.relkind='r' and c.relname<>'map_buildings'
 union all
 select 'column',c.relname,a.attname,coalesce(a.attacl::text,'')
 from pg_class c join pg_attribute a on a.attrelid=c.oid
 where c.relnamespace='public'::regnamespace and c.relkind='r' and c.relname<>'map_buildings' and a.attnum>0
 union all
 select 'function',p.oid::regprocedure::text,'',coalesce(p.proacl::text,'')
 from pg_proc p where p.pronamespace='public'::regnamespace
 order by 1,2,3`)).rows;}

test('022 real SQL: fixed buildings with service-role people_here-only writes',async t=>{
 const db=new PGlite({extensions:{vector}});
 try{
  await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create role map_public_probe;');
  for(let n=1;n<=21;n++)await db.exec(await migration(n));
  await db.exec(`insert into public.knowledge_sources(kind,external_id,title,status) values('manual','write-scope-retain','Retained fixture','active');
   insert into public.discord_view_policies(guild_id) values('1203562091500404776');
   select public.miro_sync_register(p_board_id=>'write-scope-retained-board');
   insert into public.agent_input_cache(uuid,raw_response) values(gen_random_uuid(),'{"source":"fixture","payload":{"original":true}}');
   insert into public.agent_automation_state(key,data) values('write-scope-retained','{"original":true}');`);
  const tables=(await db.query("select relname from pg_class where relnamespace='public'::regnamespace and relkind='r' order by relname")).rows.map(r=>r.relname);
  const before={};for(const table of tables)before[table]=await values(db,table);
  const privileges=await unrelatedPrivileges(db),metadata=await catalogue(db);
  const sql=await migration(22);await db.exec(sql);
  const ids=(await db.query('select id from public.map_people order by id')).rows.map(r=>r.id);
  const [a,b,c]=ids;

  await t.test('migration preserves all seven tables, nine fixed locations, 26 people and unrelated ACLs',async()=>{
   assert.equal(tables.length,7);assert.equal(metadata.length,9);assert.equal(ids.length,26);
   assert.deepEqual((await db.query("select relname from pg_class where relnamespace='public'::regnamespace and relkind='r' order by relname")).rows.map(r=>r.relname),tables);
   for(const table of tables)assert.deepEqual(await values(db,table),before[table],table);
   assert.deepEqual(await unrelatedPrivileges(db),privileges);
  });

  await t.test('service-role privilege matrix grants select and only people_here column updates',async()=>{
   for(const privilege of ['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'])assert.equal((await db.query("select has_table_privilege('service_role','public.map_buildings',$1) allowed",[privilege])).rows[0].allowed,false,privilege);
   assert.equal((await db.query("select has_table_privilege('service_role','public.map_buildings','SELECT') allowed")).rows[0].allowed,true);
   for(const column of ['id','name','aliases','people_here','updated_at'])assert.equal((await db.query("select has_column_privilege('service_role','public.map_buildings',$1,'UPDATE') allowed",[column])).rows[0].allowed,column==='people_here',column);
   assert.equal((await db.query("select relrowsecurity and relforcerowsecurity protected from pg_class where oid='public.map_buildings'::regclass")).rows[0].protected,true);
  });

  await t.test('direct validated presence update succeeds; metadata fixed and timestamp managed by trigger',()=>service(db,async()=>{
   const old=(await db.query('select updated_at from public.map_buildings where id=$1',[home])).rows[0].updated_at;
   const lower=(await db.query('select clock_timestamp() value')).rows[0].value;
   await put(db,home,[entry(a)]);
   const actual=(await db.query('select people_here,updated_at from public.map_buildings where id=$1',[home])).rows[0];
   const upper=(await db.query('select clock_timestamp() value')).rows[0].value;
   assert.deepEqual(actual.people_here,[entry(a)]);assert(new Date(actual.updated_at)>new Date(old));
   assert(new Date(actual.updated_at)>=new Date(lower)&&new Date(actual.updated_at)<=new Date(upper));
   assert.deepEqual(await catalogue(db),metadata);
   assert.equal((await db.query("select count(*)::int n from public.map_get_buildings('2026-10-17T13:00:00Z')")).rows[0].n,9);
  }));

  await t.test('all metadata updates, mixed patches and even no-op assignments are denied',()=>service(db,async()=>{
   for(const assignment of ["id='renamed'","name='Renamed'","aliases=array['Other']","updated_at='2000-01-01Z'::timestamptz",'id=id','name=name','aliases=aliases','updated_at=updated_at',"people_here='[]',name=name"]){
    await denied(db,`update public.map_buildings set ${assignment} where id=$1`,[home]);
   }
   assert.deepEqual(await values(db,'map_buildings'),before.map_buildings);
  }));

  await t.test('insert, delete, truncate and insert-on-conflict cannot alter the catalogue',()=>service(db,async()=>{
   for(const query of [
    "insert into public.map_buildings(id,name) values('new-building','New')",
    'delete from public.map_buildings where id=$1',
    'truncate public.map_buildings',
    "insert into public.map_buildings(id,name) values('bobst-library','Overwrite') on conflict(id) do nothing",
    "insert into public.map_buildings(id,name) values('bobst-library','Overwrite') on conflict(id) do update set people_here='[]'",
    "insert into public.map_buildings(id,name) values('bobst-library','Overwrite') on conflict(id) do update set name=excluded.name"
   ])await denied(db,query,query.includes('$1')?[home]:[]);
   assert.deepEqual(await values(db,'map_buildings'),before.map_buildings);
  }));

  await t.test('UPDATE FROM and writable CTE cannot bypass protected metadata columns',()=>service(db,async()=>{
   await denied(db,'update public.map_buildings b set name=p.display_name from public.map_people p where b.id=$1 and p.id=$2',[home,a]);
   await denied(db,"with changed as (update public.map_buildings set aliases=aliases where id=$1 returning *) select * from changed",[home]);
   await db.query("update public.map_buildings b set people_here=jsonb_build_array($2::jsonb) from public.map_people p where b.id=$1 and p.id=$3",[home,JSON.stringify(entry(a)),a]);
   assert.deepEqual(await occupants(db,home),[entry(a)]);assert.deepEqual(await catalogue(db),metadata);
  }));

  await t.test('column-only update privilege suffices for invoker RPC locks and atomic moves preserving plans',()=>service(db,async()=>{
   await put(db,home,[entry(a),entry(b)]);
   await put(db,planned,[entry(a,{status:'planned'}),entry(c,{status:'planned'})]);
   await put(db,target,[entry(b,{status:'planned'})]);
   assert.equal((await move(db,a,target,entry(a))).building_id,target);
   assert.deepEqual(await occupants(db,home),[entry(b)]);
   assert.deepEqual(await occupants(db,planned),[entry(a,{status:'planned'}),entry(c,{status:'planned'})]);
   assert.deepEqual(await occupants(db,target),[entry(b,{status:'planned'}),entry(a)]);
   await move(db,a,home,entry(a,{status:'planned'}));
   assert.deepEqual(await occupants(db,target),[entry(b,{status:'planned'}),entry(a)]);
   assert.deepEqual(await catalogue(db),metadata);
  }));

  await t.test('validation and RPC errors leave prior entries and immutable metadata intact',()=>service(db,async()=>{
   await put(db,home,[entry(a),entry(b)]);const current=await values(db,'map_buildings');
   for(const attempt of [()=>put(db,home,[entry(randomUUID())]),()=>put(db,home,[{...entry(a),test:true}]),()=>move(db,a,target,entry(a,{source_url:'invalid'})),()=>move(db,a,'nonexistent-building',entry(a))]){
    await db.exec('savepoint invalid');await assert.rejects(attempt,e=>['23503','23514'].includes(e.code));await db.exec('rollback to savepoint invalid;release savepoint invalid');
    assert.deepEqual(await values(db,'map_buildings'),current);
   }
  }));

  await t.test('browser/public roles cannot read or write tables or call presence RPC',async()=>{
   for(const role of ['anon','authenticated','map_public_probe']){
    await db.exec('begin;set local role '+role);
    try{
     await denied(db,'select * from public.map_buildings');
     await denied(db,"update public.map_buildings set people_here='[]' where id=$1",[home]);
     await denied(db,'select public.map_set_person_location($1,$2,$3::jsonb)',[a,home,JSON.stringify(entry(a))]);
    }finally{await db.exec('rollback');}
   }
  });

  await t.test('migration rerun removes stale explicit column grants without changing data or unrelated privileges',async()=>{
   await db.exec('grant update(name,aliases,updated_at,id) on public.map_buildings to service_role');
   await db.exec(sql);await db.exec(sql);
   for(const column of ['id','name','aliases','updated_at'])assert.equal((await db.query("select has_column_privilege('service_role','public.map_buildings',$1,'UPDATE') allowed",[column])).rows[0].allowed,false,column);
   assert.equal((await db.query("select has_column_privilege('service_role','public.map_buildings','people_here','UPDATE') allowed")).rows[0].allowed,true);
   for(const table of tables)assert.deepEqual(await values(db,table),before[table],table);
   assert.deepEqual(await unrelatedPrivileges(db),privileges);
  });
 }finally{await db.close();}
});
