import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir,mkdir,writeFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {vector} from '@electric-sql/pglite-pgvector';

const dir=new URL('../supabase/migrations/',import.meta.url),files=await readdir(dir);
const migration=async n=>readFile(new URL(files.find(f=>f.endsWith('.sql')&&Number(f.slice(8,12))===n),dir),'utf8');
const sql=await migration(46),target='683-broadway';
const person='11111111-1111-4111-8111-111111111111',source='22222222-2222-4222-8222-222222222222';
const evidence=new URL('../evidence/go-greek-removal-2026-10-25/tester-sql.json',import.meta.url);
const report={localOnly:true,migration:46,cases:[],limitations:['Real PostgreSQL behavior through PGlite; no hosted mutation or provider calls.']};
async function snapshot(db){
 const names=(await db.query("select relname from pg_class where relnamespace='public'::regnamespace and relkind='r' order by relname")).rows.map(r=>r.relname);
 return Object.fromEntries(await Promise.all(names.map(async name=>[name,(await db.query(`select to_jsonb(t) value from public."${name}" t order by to_jsonb(t)::text`)).rows.map(r=>r.value)])));
}
async function metadata(db){return (await db.query("select c.relname,c.relacl::text,c.relrowsecurity,c.relforcerowsecurity from pg_class c where relnamespace='public'::regnamespace order by relname")).rows;}
async function fixture(){
 const db=new PGlite({extensions:{vector}});
 await db.exec('create role anon;create role authenticated;create role service_role bypassrls;');
 for(let n=1;n<=45;n++)await db.exec(await migration(n));
 await db.query('insert into public.map_people(id,display_name,first_name) values($1,$2,$3)',[person,'Synthetic removal attendee','Synthetic']);
 await db.query("insert into public.knowledge_sources(id,kind,external_id,title,status) values($1,'manual','retirement-fixture','Synthetic retirement fixture','active')",[source]);
 const ids={};
 for(const [key,buildings] of Object.entries({sole:[target],shared:[target,'bobst-library'],unrelated:['bobst-library'],unmapped:[]})){
  const event={name:`Synthetic ${key}`,notes:'Keep original notes',kind:'scheduled_event',status:'confirmed',type_id:'event',time_kind:'timed',starts_at:'2026-10-25T18:00:00Z',ends_at:'2026-10-25T20:00:00Z',source_id:source,source_url:'https://example.test/retirement',source_record_id:key,reported_at:'2026-10-25T16:00:00Z'};
  const people=[{person_id:person,presence_basis:'planned',label:`Attendance ${key}`,starts_at:'2026-10-25T18:30:00Z',ends_at:'2026-10-25T19:30:00Z',source_id:source,source_url:'https://example.test/attendance',reported_at:'2026-10-25T17:00:00Z'}];
  const result=(await db.query('select public.map_upsert_event($1::jsonb,$2::jsonb,$3::jsonb,null) result',[JSON.stringify(event),JSON.stringify(buildings.map(building_id=>({building_id,location_notes:`Room ${key}`}))),JSON.stringify(people)])).rows[0].result;
  assert.equal(result.status,'applied');ids[key]=result.event_id;
 }
 return{db,ids};
}

test('046 removes sole-popup activities and attendance while preserving complete shared and unrelated data',async()=>{
 const{db,ids}=await fixture();try{
  const before=await snapshot(db),schema=await metadata(db);await db.exec(sql);const after=await snapshot(db);
  for(const [table,rows]of Object.entries(before)){
   const expected=table==='map_buildings'?rows.filter(r=>r.id!==target):table==='events'?rows.filter(r=>r.id!==ids.sole):table==='event_buildings'?rows.filter(r=>r.building_id!==target):table==='event_people'?rows.filter(r=>r.event_id!==ids.sole):rows;
   assert.deepEqual(after[table],expected,`Exact preservation mismatch in ${table}`);
  }
  assert.equal(after.map_buildings.length,9);assert.equal(after.events.length,3);assert.equal(after.event_people.length,3);
  assert.deepEqual(await metadata(db),schema);
  await db.exec(sql);assert.deepEqual(await snapshot(db),after,'Replay changed data or timestamps');
  report.cases.push({name:'sole/shared/unrelated/unmapped exact preservation and idempotent replay',pass:true,removed:{buildings:1,events:1,buildingLinks:2,attendance:1},remaining:{buildings:9,events:3,attendance:3}});
  const permissions=(await db.query("select has_table_privilege('service_role','public.map_buildings','SELECT') reads,has_table_privilege('service_role','public.map_buildings','INSERT') inserts,has_table_privilege('service_role','public.map_buildings','UPDATE') updates,has_table_privilege('service_role','public.map_buildings','DELETE') deletes")).rows[0];
  assert.deepEqual(permissions,{reads:true,inserts:false,updates:false,deletes:false});
  for(const statement of ["insert into public.map_buildings(id,name) values('forbidden','Forbidden')","update public.map_buildings set name='Forbidden' where id='bobst-library'","delete from public.map_buildings where id='bobst-library'"]){
   await db.exec('begin;set local role service_role');try{await assert.rejects(()=>db.exec(statement),e=>e.code==='42501');}finally{await db.exec('rollback');}
  }
  assert.deepEqual(await snapshot(db),after);report.cases.push({name:'service catalogue write privileges unchanged and actual writes denied',pass:true});
 }finally{await db.close();}
});

test('046 identity changes abort before any target or attached data is removed',async()=>{
 const{db}=await fixture();try{
  for(const field of ['name','aliases']){
   await db.query(`update public.map_buildings set ${field}=$1 where id=$2`,[field==='name'?'Human renamed venue':['Human maintained alias'],target]);
   const before=await snapshot(db);try{await assert.rejects(()=>db.exec(sql),e=>e.code==='23514');}finally{await db.exec('rollback');}
   assert.deepEqual(await snapshot(db),before,`${field} rejection was not atomic`);
   await db.query("update public.map_buildings set name='Go Greek',aliases=array['683 Broadway']::text[] where id=$1",[target]);
   report.cases.push({name:`${field} conflict preserves every row`,pass:true});
  }
 }finally{await db.close();}
});

test('046 absent-target retirement is a no-op without deleting unmapped or similarly named activities',async()=>{
 const{db,ids}=await fixture();try{
  await db.query('delete from public.events where id=$1',[ids.sole]);
  await db.query('delete from public.event_buildings where building_id=$1',[target]);
  await db.query('delete from public.map_buildings where id=$1',[target]);
  await db.query("update public.events set name='Go Greek planning history' where id=$1",[ids.unrelated]);
  const before=await snapshot(db);await db.exec(sql);assert.deepEqual(await snapshot(db),before);
  report.cases.push({name:'absent building no-op; similarly named and unmapped events preserved',pass:true});
 }finally{await db.close();}
});

test.after(async()=>{await mkdir(new URL('./',evidence),{recursive:true});await writeFile(evidence,JSON.stringify(report,null,2)+'\n');});
