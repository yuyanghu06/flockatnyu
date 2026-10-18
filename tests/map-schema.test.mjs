import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {vector} from '@electric-sql/pglite-pgvector';

const migrations=new URL('../supabase/migrations/',import.meta.url);
async function migration(n){const file=(await readdir(migrations)).find(f=>f.endsWith('.sql')&&Number(f.slice(8,12))===n);assert(file,`migration ${n}`);return readFile(new URL(file,migrations),'utf8');}
async function rows(db,name){return(await db.query(`select to_jsonb(t) value from public.${name} t order by to_jsonb(t)::text`)).rows;}
async function tx(db,fn){await db.exec('begin');try{await fn();}finally{await db.exec('rollback');}}
async function reject(db,fn,codes=['23514','23503','23505','22007','22008']){await db.exec('savepoint bad');await assert.rejects(fn,e=>codes.includes(e.code),`expected SQL rejection ${codes}`);await db.exec('rollback to savepoint bad;release savepoint bad');}
const source=randomUUID();
const entry=(person,extra={})=>({person_id:person,status:'self_reported',valid_from:'2026-10-17T12:00:00Z',expires_at:'2026-10-17T14:00:00Z',source_id:source,source_url:'https://discord.com/channels/123/456/789',...extra});
async function put(db,building,entries){return db.query('update public.map_buildings set people_here=$2::jsonb where id=$1',[building,JSON.stringify(entries)]);}
async function move(db,person,building,e){return(await db.query('select public.map_set_person_location($1,$2,$3::jsonb) result',[person,building,JSON.stringify(e)])).rows[0].result;}

test('021 real SQL: seeded map identities, service isolation and validated atomic presence',async t=>{
 const db=new PGlite({extensions:{vector}});
 try{
  await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create role map_public_probe;');
  for(let n=1;n<=20;n++)await db.exec(await migration(n));
  await db.exec("insert into public.knowledge_sources(kind,external_id,title,status) values('manual','map-retain','Retained source','active');insert into public.discord_view_policies(guild_id) values('1203562091500404776');select public.miro_sync_register(p_board_id=>'map-retained-board');insert into public.agent_input_cache(uuid,raw_response) values(gen_random_uuid(),'{\"source\":\"fixture\",\"payload\":{\"original\":true}}');insert into public.agent_automation_state(key,data) values('map-retained','{\"original\":true}');");
  const oldNames=(await db.query("select relname from pg_class where relnamespace='public'::regnamespace and relkind='r' order by relname")).rows.map(r=>r.relname);
  const before={};for(const n of oldNames)before[n]=await rows(db,n);
  const sql=await migration(21);await db.exec(sql);
  await t.test('only two tables added and all five existing populated tables preserved',async()=>{
   assert.equal(oldNames.length,5);for(const n of oldNames){assert(before[n].length>0,n);assert.deepEqual(await rows(db,n),before[n],n);}
   assert.deepEqual((await db.query("select relname from pg_class where relnamespace='public'::regnamespace and relkind='r' order by relname")).rows.map(r=>r.relname),[...oldNames,'map_people','map_buildings'].sort());
  });
  const people=(await db.query('select * from public.map_people order by display_name')).rows;
  const a=people[0].id,b=people[1].id,c=people[2].id;
  const home='bobst-library',target='nyu-kimmel-center',planned='stern-school-of-business';
  await t.test('nine building IDs/names exactly match selectable source configuration',async()=>{
   const config=await readFile(new URL('../src/config.js',import.meta.url),'utf8');
   const ids=[...config.split('export const buildings = [')[1].matchAll(/\bid: '([^']+)'/g)].map(m=>m[1]);
   const actual=(await db.query('select id,name,people_here from public.map_buildings order by id')).rows;
   assert.equal(ids.length,9);assert.deepEqual(actual.map(r=>r.id),ids.sort());assert(actual.every(r=>r.people_here.length===0));
   for(const m of config.split('export const buildings = [')[1].matchAll(/id: '([^']+)', name: '([^']+)'/g))assert.equal(actual.find(r=>r.id===m[1]).name,m[2]);
   const extraction=JSON.parse(await readFile(new URL('../assets/campus-assets/data/extracted-buildings.json',import.meta.url),'utf8'));
   assert.equal(actual.find(r=>r.id==='nyu-john-a-paulson-center').name,extraction.buildings['nyu-john-a-paulson-center'].name);
  });
  await t.test('26 PNG assets seeded once, first/last names conservative and local URLs resolve',async()=>{
   const filenames=(await readdir(new URL('../assets/avatars/',import.meta.url))).filter(f=>f.endsWith('.png')).sort();assert.equal(filenames.length,26);assert.equal(people.length,26);
   assert.deepEqual(people.map(p=>decodeURIComponent(p.avatar_url.split('/').at(-1))).sort(),filenames);
   for(const p of people){assert.equal(p.first_name,p.display_name.split(' ')[0]);assert.equal(p.last_name,p.display_name==='Sean Lai'?'Lai':null);assert.equal(p.discord_user_id,null);assert.equal(p.email,null);assert.equal(p.is_trackable,true);}
   assert.equal(people.find(p=>p.display_name==='Sean H').last_name,null);
  });
  await t.test('seed insert rerun preserves UUIDs, enriched names/identity/email and disabled flag',()=>tx(db,async()=>{
   await db.query("update public.map_people set discord_user_id='123456789012345678',discord_display_name='Arda Example',email='arda@example.test',last_name='Example',is_trackable=false where id=$1",[a]);
   const enriched=await rows(db,'map_people');const inserts=sql.match(/insert into public\.map_(?:people|buildings)\([\s\S]*?on conflict \(id\) do nothing;/g);assert.equal(inserts.length,2);for(const insert of inserts)await db.exec(insert);
   assert.deepEqual(await rows(db,'map_people'),enriched);assert.equal((await db.query('select count(*)::int n from public.map_buildings')).rows[0].n,9);
  }));
  await t.test('forced RLS and least table/RPC privileges reject anonymous/authenticated/public callers',async()=>{
   for(const name of ['map_people','map_buildings']){const r=(await db.query('select relrowsecurity,relforcerowsecurity from pg_class where oid=$1::regclass',['public.'+name])).rows[0];assert(r.relrowsecurity&&r.relforcerowsecurity);for(const privilege of ['TRUNCATE','REFERENCES','TRIGGER'])assert.equal((await db.query('select has_table_privilege(\'service_role\',$1,$2) allowed',['public.'+name,privilege])).rows[0].allowed,false);}
   const functions=(await db.query("select oid::regprocedure::text signature,prosecdef from pg_proc where pronamespace='public'::regnamespace and proname like 'map_%'")).rows;assert.equal(functions.length,5);
   for(const f of functions){assert.equal(f.prosecdef,false);for(const role of ['anon','authenticated','map_public_probe','service_role'])assert.equal((await db.query('select has_function_privilege($1,$2,\'EXECUTE\') allowed',[role,f.signature])).rows[0].allowed,role==='service_role');}
   for(const role of ['anon','authenticated','map_public_probe']){await db.exec('set role '+role);try{for(const name of ['map_people','map_buildings']){await assert.rejects(db.query('select * from public.'+name),e=>e.code==='42501');await assert.rejects(db.query('delete from public.'+name),e=>e.code==='42501');}await assert.rejects(db.query('select * from public.map_get_buildings()'),e=>e.code==='42501');await assert.rejects(move(db,a,home,entry(a)),e=>e.code==='42501');}finally{await db.exec('reset role');}}
   await tx(db,async()=>{await db.exec('grant select,insert,update,delete on public.map_people,public.map_buildings to anon;set role anon');try{assert.deepEqual((await db.query('select * from public.map_people')).rows,[]);assert.deepEqual((await db.query("update public.map_buildings set people_here='[]' returning id")).rows,[]);await reject(db,()=>db.query("insert into public.map_people(display_name,first_name) values('Other','Other')"),['42501']);}finally{await db.exec('reset role');}});
  });
  await db.exec('set role service_role');
  await t.test('unique Discord IDs, case insensitive emails and avatar URLs; invalid identity fields rejected',()=>tx(db,async()=>{
   await db.query("update public.map_people set discord_user_id='123456789012345678',email='Test@example.test' where id=$1",[a]);
   for(const [field,value] of [['discord_user_id','123456789012345678'],['email','test@EXAMPLE.test'],['avatar_url',people[0].avatar_url]])await reject(db,()=>db.query(`update public.map_people set ${field}=$2 where id=$1`,[b,value]),['23505']);
   for(const [field,value] of [['discord_user_id','1e8'],['discord_user_id','18446744073709551616'],['email','bad'],['first_name',''],['last_name',' '],['avatar_url','javascript:bad']])await reject(db,()=>db.query(`update public.map_people set ${field}=$2 where id=$1`,[b,value]));
   await reject(db,()=>db.query('update public.map_people set id=$2 where id=$1',[a,randomUUID()]));
  }));
  await t.test('presence requires exact fields, source UUID/link, known trackable person, statuses and finite ordered times',()=>tx(db,async()=>{
   const good=entry(a);const missing={...good};delete missing.source_id;
   for(const invalid of [{},null,'bad',[good,good],[entry(randomUUID())],[{...good,status:'inferred'}],[{...good,extra:'x'}],[missing],[{...good,person_id:13}],[{...good,source_id:'not-a-uuid'}],[{...good,source_url:'http://unsafe.test'}],[{...good,valid_from:'infinity'}],[{...good,valid_from:'2026-10-17'}],[{...good,expires_at:good.valid_from}],[{...good,expires_at:'2026-10-16T12:00:00Z'}],[{...good,expires_at:'2026-99-99T12:00:00Z'}]])await reject(db,()=>put(db,home,invalid));
   await db.query('update public.map_people set is_trackable=false where id=$1',[b]);await reject(db,()=>put(db,home,[entry(b)]),['23503']);
   await put(db,home,[good]);assert.deepEqual((await db.query('select people_here from public.map_buildings where id=$1',[home])).rows[0].people_here,[good]);
  }));
  await t.test('referenced people cannot be deleted/disabled; references must be removed first',()=>tx(db,async()=>{
   await put(db,home,[entry(a)]);await reject(db,()=>db.query('delete from public.map_people where id=$1',[a]),['23503']);await reject(db,()=>db.query('update public.map_people set is_trackable=false where id=$1',[a]),['23503']);
   await put(db,home,[]);await db.query('update public.map_people set is_trackable=false where id=$1',[a]);await db.query('delete from public.map_people where id=$1',[a]);assert.equal((await db.query('select count(*)::int n from public.map_people where id=$1',[a])).rows[0].n,0);
  }));
  await t.test('atomic self-report moves preserve other people and independent plans',()=>tx(db,async()=>{
   await put(db,home,[entry(a),entry(b)]);await put(db,planned,[entry(a,{status:'planned'}),entry(c,{status:'planned'})]);await put(db,target,[entry(b,{status:'planned'})]);
   const result=await move(db,a,target,entry(a));assert.equal(result.building_id,target);
   assert.deepEqual((await db.query('select people_here from public.map_buildings where id=$1',[home])).rows[0].people_here,[entry(b)]);
   assert.deepEqual((await db.query('select people_here from public.map_buildings where id=$1',[planned])).rows[0].people_here,[entry(a,{status:'planned'}),entry(c,{status:'planned'})]);
   assert.deepEqual((await db.query('select people_here from public.map_buildings where id=$1',[target])).rows[0].people_here,[entry(b,{status:'planned'}),entry(a)]);
   await move(db,a,home,entry(a,{status:'planned'}));assert.equal((await db.query('select jsonb_array_length(people_here)::int n from public.map_buildings where id=$1',[target])).rows[0].n,2);
  }));
  await t.test('invalid move rolls back source removal; unknown target and mismatched person fail without mutation',()=>tx(db,async()=>{
   await put(db,home,[entry(a),entry(b)]);const before=await rows(db,'map_buildings');
   for(const [destination,e] of [[target,entry(a,{source_url:'invalid'})],['unknown-building',entry(a)],[target,entry(b)]]){await reject(db,()=>move(db,a,destination,e));assert.deepEqual(await rows(db,'map_buildings'),before);}
  }));
  await t.test('fresh reads omit expired/future entries with exact inclusive-start/exclusive-expiry boundaries',()=>tx(db,async()=>{
   await put(db,home,[entry(a),entry(b,{valid_from:'2026-10-17T14:00:00Z',expires_at:'2026-10-17T15:00:00Z',status:'planned'}),entry(c,{valid_from:'2026-10-17T10:00:00Z',expires_at:'2026-10-17T12:00:00Z'})]);
   const at=async time=>(await db.query('select people_here from public.map_get_buildings($1::timestamptz) where id=$2',[time,home])).rows[0].people_here;
   assert.deepEqual(await at('2026-10-17T12:00:00Z'),[entry(a)]);assert.deepEqual(await at('2026-10-17T14:00:00Z'),[entry(b,{valid_from:'2026-10-17T14:00:00Z',expires_at:'2026-10-17T15:00:00Z',status:'planned'})]);assert.deepEqual(await at('2026-10-17T15:00:00Z'),[]);
   await reject(db,()=>db.query("select * from public.map_get_buildings('infinity')"));await reject(db,()=>db.query('select * from public.map_get_buildings(null)'));
  }));
 }finally{await db.close();}
});
