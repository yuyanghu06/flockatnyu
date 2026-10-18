import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {vector} from '@electric-sql/pglite-pgvector';
const directory=new URL('../supabase/migrations/',import.meta.url);
async function migration(n){const file=(await readdir(directory)).find(file=>file.endsWith('.sql')&&Number(file.slice(8,12))===n);assert(file);return readFile(new URL(file,directory),'utf8');}
const source='22222222-2222-4222-8222-222222222222';
const person='11111111-1111-4111-8111-111111111111';
const legacy={id:'fixture-ui-test-project-session',title:'UI TEST Project session',starts_at:'2026-10-20T18:00:00-04:00',ends_at:'2026-10-20T19:00:00-04:00',time_zone:'America/New_York',all_day:false,status:'confirmed',source_id:source,source_url:'https://example.com/source',description:'Original text',location:'Room 101',url:'https://example.com/event',attendee_ids:[person]};
const report={person_id:person,status:'self_reported',valid_from:'2026-10-18T13:00:00-04:00',expires_at:'2026-10-18T15:00:00-04:00',source_id:source,source_url:'https://example.com/report',label:'Studying ☕'};
const event={name:'Session',notes:'Original notes',kind:'scheduled_event',status:'confirmed',time_kind:'timed',starts_at:'2026-10-20T18:00:00-04:00',ends_at:'2026-10-20T20:00:00-04:00',source_id:source,source_url:'https://example.com/source',source_record_id:'new-session',reported_at:'2026-10-18T12:00:00Z'};
const buildingRows=[{building_id:'bobst-library',location_notes:'Room 101'},{building_id:'courant-institute'}];
const peopleRows=[{person_id:person,presence_basis:'planned',label:'Project',source_id:source,source_url:'https://example.com/attendance',reported_at:'2026-10-18T12:00:00Z'}];
async function setup(all=true){const db=new PGlite({extensions:{vector}});await db.exec('create role anon;create role authenticated;create role service_role bypassrls;');for(let n=all?1:21;n<=25;n++)await db.exec(await migration(n));await db.query('insert into public.map_people(id,display_name,first_name) values($1,$2,$3)',[person,'Synthetic attendee','Synthetic']);return db;}
const call=(db,e=event,b=buildingRows,p=peopleRows,stamp=null)=>db.query('select public.map_upsert_event($1::jsonb,$2::jsonb,$3::jsonb,$4::timestamptz) result',[JSON.stringify(e),JSON.stringify(b),JSON.stringify(p),stamp]);
async function rejectsAtomic(db,fn,code){await db.exec('begin');try{await assert.rejects(fn,code?error=>error.code===code:undefined);}finally{await db.exec('rollback');}}

test('026/027 normalized event schema: real SQL backfill, atomic RPCs and safe cutover',async t=>{
 const db=await setup();
 try{
  await db.query("update public.map_buildings set people_here=$1::jsonb,scheduled_events=$2::jsonb where id='bobst-library'",[JSON.stringify([report]),JSON.stringify([legacy])]);
  await db.query("update public.map_buildings set scheduled_events=$1::jsonb where id='courant-institute'",[JSON.stringify([legacy])]);
  const allDay={...legacy,id:'all-day',all_day:true,starts_at:'2026-11-01T00:00:00-04:00',ends_at:'2026-11-02T00:00:00-05:00',attendee_ids:[]};
  await db.query("update public.map_buildings set scheduled_events=$1::jsonb where id='stern-school-of-business'",[JSON.stringify([allDay])]);
  const old=(await db.query('select to_jsonb(b) value from public.map_buildings b order by id')).rows;
  const unrelated=(await db.query("select to_jsonb(s) value from public.knowledge_sources s order by id")).rows;
  await db.exec(await migration(26));
  await t.test('legacy backfill preserves all fields, shared identity, fixture scope and DST all-day dates',async()=>{
   assert.deepEqual((await db.query('select to_jsonb(b) value from public.map_buildings b order by id')).rows,old);
   assert.equal((await db.query('select count(*)::int n from public.events')).rows[0].n,3);
   const e=(await db.query('select * from public.events where source_record_id=$1',[legacy.id])).rows[0];
   assert.equal(e.name,legacy.title);assert.equal(e.notes,legacy.description);assert.equal(e.url,legacy.url);assert.equal(e.source_id,source);
   assert.equal((await db.query('select count(*)::int n from public.event_buildings where event_id=$1',[e.id])).rows[0].n,2);
   assert.equal((await db.query('select count(*)::int n from public.event_people where event_id=$1',[e.id])).rows[0].n,1);
   const presence=(await db.query("select e.*,p.label,p.presence_basis from public.events e join public.event_people p on p.event_id=e.id where e.kind='presence'")).rows[0];
   assert.equal(presence.label,report.label);assert.equal(presence.presence_basis,'reported');assert.equal(new Date(presence.ends_at).toISOString(),'2026-10-18T19:00:00.000Z');
   assert.match(presence.source_record_id,/^legacy-presence:[0-9a-f]{32}$/);
   const day=(await db.query("select time_kind,starts_at,ends_at,starts_on::text,ends_on::text from public.events where source_record_id='all-day'")).rows[0];
   assert.deepEqual(day,{time_kind:'all_day',starts_at:null,ends_at:null,starts_on:'2026-11-01',ends_on:'2026-11-02'});
  });
  await t.test('snapshot retains expired/future/cancelled data, safe people and finite observation validation',async()=>{
   const snapshot=(await db.query("select public.map_read_events('2030-01-01') result")).rows[0].result;
   assert.equal(snapshot.events.length,3);assert.equal(snapshot.event_buildings.length,4);assert.equal(snapshot.event_people.length,2);
   assert.deepEqual(Object.keys(snapshot.people[0]).sort(),['avatar_url','display_name','id','is_trackable']);
   for(const at of ['infinity',null])await rejectsAtomic(db,()=>db.query('select public.map_read_events($1)',[at]),'23514');
  });
  let created;
  await t.test('service-role RPC creates multiple buildings and independent overlapping visibility',async()=>{
   await db.exec('begin;set local role service_role');
   created=(await call(db)).rows[0].result;assert.equal(created.status,'applied');
   const other=(await call(db,{...event,source_record_id:'overlap'},[{building_id:'nyu-kimmel-center'}])).rows[0].result;
   assert.notEqual(created.event_id,other.event_id);
   await db.exec('commit');
   assert.equal((await db.query('select count(*)::int n from public.event_buildings where event_id=$1',[created.event_id])).rows[0].n,2);
  });
  await t.test('CAS rejects source retries and stale updates, replaces relationships atomically',async()=>{
   await rejectsAtomic(db,()=>call(db),'40001');
   await rejectsAtomic(db,()=>call(db,{...event,id:created.event_id},[],[],null),'40001');
   await rejectsAtomic(db,()=>call(db,{...event,id:created.event_id},[],[],'2020-01-01'),'40001');
   await rejectsAtomic(db,()=>call(db,{...event,id:created.event_id,source_record_id:'changed'},[],[],created.updated_at),'23514');
   const invalidBuilding=[{building_id:'unknown-building'}];
   await rejectsAtomic(db,()=>call(db,{...event,id:created.event_id},invalidBuilding,[],created.updated_at),'23503');
   assert.equal((await db.query('select count(*)::int n from public.event_buildings where event_id=$1',[created.event_id])).rows[0].n,2);
   const updated=(await call(db,{...event,id:created.event_id,notes:'Corrected'},[{building_id:'courant-institute'}],[],created.updated_at)).rows[0].result;
   assert.notEqual(updated.updated_at,created.updated_at);
   assert.equal((await db.query('select count(*)::int n from public.event_people where event_id=$1',[created.event_id])).rows[0].n,0);
   assert.equal((await db.query('select notes from public.events where id=$1',[created.event_id])).rows[0].notes,'Corrected');
   const races=await Promise.allSettled(['First','Second'].map(notes=>call(db,{...event,id:created.event_id,notes},[],[],updated.updated_at)));
   assert.equal(races.filter(r=>r.status==='fulfilled').length,1);assert.equal(races.find(r=>r.status==='rejected').reason.code,'40001');
  });
  await t.test('strict scalar/relationship validation, FK and timing failures roll back',async()=>{
   const invalidEvents=[{...event,name:''},{...event,name:'x'.repeat(201)},{...event,notes:'x'.repeat(4001)},{...event,extra:'bad'},{...event,created_at:'2020-01-01'},{...event,status:'bad'},{...event,time_zone:'Invalid/Zone'},{...event,source_url:'http://example.com'},{...event,url:'javascript:bad'},{...event,reported_at:'infinity'},{...event,ends_at:event.starts_at},{...event,starts_at:null},{...event,time_kind:'unknown'},{...event,time_kind:'all_day',starts_at:null,ends_at:null,starts_on:'2026-10-20',ends_on:'2026-10-20'},{...event,name:1}];
   for(const [i,e] of invalidEvents.entries())await rejectsAtomic(db,()=>call(db,{...e,source_record_id:`invalid-${i}`}));
   for(const b of [[...buildingRows,buildingRows[0]],[{building_id:'bobst-library',event_id:created.event_id}],[{building_id:'bobst-library',location_notes:'x'.repeat(501)}]])await rejectsAtomic(db,()=>call(db,{...event,source_record_id:'invalid-building'},b));
   for(const p of [[...peopleRows,peopleRows[0]],[{...peopleRows[0],building_id:'bobst-library'}],[{...peopleRows[0],person_id:'33333333-3333-4333-8333-333333333333'}],[{...peopleRows[0],starts_at:'2026-10-20T21:00:00-04:00'}],[{...peopleRows[0],ends_at:'2026-10-20T21:00:00-04:00'}],[{...peopleRows[0],label:'x'.repeat(201)}]])await rejectsAtomic(db,()=>call(db,{...event,source_record_id:'invalid-person'},buildingRows,p));
   const override=(await call(db,{...event,source_record_id:'overrides'},buildingRows,[{...peopleRows[0],starts_at:'2026-10-20T18:30:00-04:00',ends_at:'2026-10-20T19:30:00-04:00'}])).rows[0].result;
   await rejectsAtomic(db,()=>db.query('update public.events set ends_at=$1 where id=$2',['2026-10-20T19:00:00-04:00',override.event_id]),'23514');
   await rejectsAtomic(db,()=>db.query('update public.event_people set event_id=$1 where event_id=$2',[created.event_id,override.event_id]),'23514');
  });
  await t.test('valid unknown and DST all-day events retain inherited participation windows',async()=>{
   const unknown=(await call(db,{...event,source_record_id:'unknown-time',time_kind:'unknown',starts_at:null,ends_at:null},[],peopleRows)).rows[0].result;
   assert.equal((await db.query('select time_kind from public.events where id=$1',[unknown.event_id])).rows[0].time_kind,'unknown');
   await rejectsAtomic(db,()=>call(db,{...event,source_record_id:'unknown-invalid',time_kind:'unknown',starts_at:null,ends_at:null},[],[{...peopleRows[0],starts_at:event.starts_at}]),'23514');
   const day=(await call(db,{...event,source_record_id:'day-override',time_kind:'all_day',starts_at:null,ends_at:null,starts_on:'2026-11-01',ends_on:'2026-11-02'},buildingRows,[{...peopleRows[0],ends_at:'2026-11-02T00:00:00-05:00'}])).rows[0].result;
   assert.ok(day.event_id);
  });
  await t.test('snapshot saturation fails instead of silently truncating profiles',async()=>{
   await db.exec('begin');
   await db.exec("insert into public.map_people(display_name,first_name) select 'Capacity '||n,'Capacity' from generate_series(1,474) n");
   await assert.rejects(()=>db.exec('select public.map_read_events()'),error=>error.code==='54000');await db.exec('rollback');
  });
  await t.test('service reads only; browser roles denied; definer functions pinned to postgres/empty path',async()=>{
   for(const table of ['events','event_buildings','event_people']){
    const privileges=(await db.query("select has_table_privilege('service_role',$1,'SELECT') reads,has_table_privilege('service_role',$1,'INSERT') inserts,has_table_privilege('service_role',$1,'UPDATE') updates,has_table_privilege('service_role',$1,'DELETE') deletes",[`public.${table}`])).rows[0];
    assert.deepEqual(privileges,{reads:true,inserts:false,updates:false,deletes:false});
    const rls=(await db.query('select relrowsecurity enabled,relforcerowsecurity forced from pg_class where oid=$1::regclass',[`public.${table}`])).rows[0];assert.deepEqual(rls,{enabled:true,forced:true});
    for(const role of ['anon','authenticated'])await rejectsAtomic(db,()=>db.exec(`set local role ${role};select * from public.${table}`),'42501');
   }
   for(const role of ['anon','authenticated'])await rejectsAtomic(db,()=>db.exec(`set local role ${role};select public.map_read_events()`),'42501');
   const defs=(await db.query("select p.proname,p.prosecdef,r.rolname,p.proconfig from pg_proc p join pg_roles r on r.oid=p.proowner where p.proname in('map_read_events','map_upsert_event')")).rows;
   for(const d of defs){assert.equal(d.prosecdef,true);assert.equal(d.rolname,'postgres');assert.ok(d.proconfig.includes('search_path=""'));}
  });
  await t.test('cutover aborts on edited/missing/additional legacy relationships',async()=>{
   for(const mutation of ["update public.events set notes='lost' where source_record_id='fixture-ui-test-project-session'","delete from public.event_people where event_id=(select id from public.events where source_record_id='fixture-ui-test-project-session')","insert into public.event_buildings(event_id,building_id) select id,'nyu-kimmel-center' from public.events where source_record_id='fixture-ui-test-project-session'","update public.map_buildings set scheduled_events='[]'::jsonb where id in ('bobst-library','courant-institute')"]){
    await db.exec('begin');await db.exec(mutation);await assert.rejects(async()=>db.exec((await migration(27)).replace(/^begin;/m,'').replace(/^commit;/m,'')),error=>error.code==='23514');await db.exec('rollback');
    assert.equal((await db.query("select count(*)::int n from information_schema.columns where table_name='map_buildings' and column_name='people_here'")).rows[0].n,1);
   }
  });
  await t.test('verified cutover drops only old JSON/RPCs, leaves catalogue/profiles and unrelated data',async()=>{
   await db.exec(await migration(27));
   const expected=old.map(({value})=>({value:Object.fromEntries(Object.entries(value).filter(([key])=>!['people_here','scheduled_events'].includes(key)))}));
   assert.deepEqual((await db.query('select to_jsonb(b) value from public.map_buildings b order by id')).rows,expected);
   assert.deepEqual((await db.query('select to_jsonb(s) value from public.knowledge_sources s order by id')).rows,unrelated);
   assert.equal((await db.query("select count(*)::int n from pg_proc where pronamespace='public'::regnamespace and proname in ('map_set_person_location','map_get_buildings','map_validate_scheduled_events','map_legacy_event_rows')")).rows[0].n,0);
   assert.equal((await db.query("select has_table_privilege('service_role','public.map_buildings','UPDATE') writes")).rows[0].writes,false);
   await rejectsAtomic(db,()=>db.exec("update public.map_people set is_trackable=false where id='11111111-1111-4111-8111-111111111111'"),'23503');
   await rejectsAtomic(db,()=>db.exec("delete from public.map_buildings where id='bobst-library'"));
   await db.exec("begin;set local role service_role;select public.map_read_events();rollback");
  });
 }finally{await db.close();}
});

test('026 refuses conflicting legacy copies and ambiguous all-day dates without mutating originals',async()=>{
 for(const conflict of [{...legacy,title:'Conflicting copy'},{...legacy,attendee_ids:[]}]){
  const db=await setup(false);try{
   await db.query("update public.map_buildings set scheduled_events=$1::jsonb where id='bobst-library'",[JSON.stringify([legacy])]);
   await db.query("update public.map_buildings set scheduled_events=$1::jsonb where id='courant-institute'",[JSON.stringify([conflict])]);
   await assert.rejects(async()=>db.exec(await migration(26)),error=>error.code==='23514');await db.exec('rollback');
   assert.equal((await db.query("select to_regclass('public.events') value")).rows[0].value,null);
  }finally{await db.close();}
 }
 const db=await setup(false);try{
  await db.query("update public.map_buildings set scheduled_events=$1::jsonb where id='bobst-library'",[JSON.stringify([{...legacy,all_day:true}])]);
  await assert.rejects(async()=>db.exec(await migration(26)),error=>error.code==='23514');await db.exec('rollback');
 }finally{await db.close();}
});
