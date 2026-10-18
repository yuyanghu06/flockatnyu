import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {vector} from '@electric-sql/pglite-pgvector';
const directory=new URL('../supabase/migrations/',import.meta.url);
async function migration(n){const file=(await readdir(directory)).find(file=>file.endsWith('.sql')&&Number(file.slice(8,12))===n);assert(file);return readFile(new URL(file,directory),'utf8');}
const source='22222222-2222-4222-8222-222222222222';
const event={name:'Project session',notes:'Original notes',kind:'scheduled_event',status:'confirmed',time_kind:'timed',starts_at:'2026-10-20T18:00:00-04:00',ends_at:'2026-10-20T20:00:00-04:00',source_id:source,source_url:'https://example.com/event-source',source_record_id:'typed-session',reported_at:'2026-10-18T12:00:00Z'};
const buildings=[{building_id:'bobst-library',location_notes:'Room 101'},{building_id:'courant-institute'}];
const expectedTypes=[['study','Study','study'],['meeting','Meeting','meeting'],['event','Event','event'],['social','Social','social'],['other','Other','other']];
const call=(db,e=event,b=buildings,p=[],stamp=null)=>db.query('select public.map_upsert_event($1::jsonb,$2::jsonb,$3::jsonb,$4::timestamptz) result',[JSON.stringify(e),JSON.stringify(b),JSON.stringify(p),stamp]);
async function rows(db,table){return(await db.query(`select to_jsonb(t) value from public.${table} t order by to_jsonb(t)::text`)).rows;}
async function rejected(db,fn,code){await db.exec('begin');try{await assert.rejects(fn,code?e=>e.code===code:undefined);}finally{await db.exec('rollback');}}
const definitionQuery="select p.proname,p.oid::regprocedure::text signature,p.proacl::text acl,p.prosecdef security_definer,p.proconfig config,r.rolname owner,p.prosrc body from pg_proc p join pg_roles r on r.oid=p.proowner where p.pronamespace='public'::regnamespace order by signature";

test('028 real SQL: fixed event types, additive preservation and unchanged atomic activity permissions',async t=>{
 const db=new PGlite({extensions:{vector}});
 try{
  await db.exec('create role anon;create role authenticated;create role service_role bypassrls;');
  for(let n=1;n<=27;n++)await db.exec(await migration(n));
  await db.query("insert into public.knowledge_sources(id,kind,external_id,title,status) values($1,'manual','synthetic-event-types','Synthetic source','active')",[source]);
  const person=(await db.query('select id from public.map_people order by id limit 1')).rows[0].id;
  const participants=[{person_id:person,presence_basis:'planned',attendance_status:'going',label:'Working',source_id:source,source_url:'https://example.com/attendance',reported_at:'2026-10-18T12:00:00Z'}];
  const legacyPayloads=[{...event,source_record_id:'existing-timed'},{...event,source_record_id:'existing-presence',kind:'presence'},
   {...event,source_record_id:'existing-plan',kind:'personal_plan',status:'tentative'},
   {...event,source_record_id:'existing-cancelled',status:'cancelled'},
   {...event,source_record_id:'existing-day',time_kind:'all_day',starts_at:null,ends_at:null,starts_on:'2026-11-01',ends_on:'2026-11-02'},
   {...event,source_record_id:'existing-unknown',time_kind:'unknown',starts_at:null,ends_at:null}];
  for(const payload of legacyPayloads)await call(db,payload,buildings,participants);
  const tables=['map_people','map_buildings','event_buildings','event_people','knowledge_sources','discord_view_policies','miro_boards','agent_input_cache','agent_automation_state'];
  const before=Object.fromEntries(await Promise.all(tables.map(async table=>[table,await rows(db,table)])));
  const oldEvents=await rows(db,'events');
  const oldDefinitions=(await db.query(definitionQuery)).rows;
  const oldTables=(await db.query("select relname,relacl::text,relrowsecurity,relforcerowsecurity from pg_class where relnamespace='public'::regnamespace and relkind='r' order by relname")).rows;
  await db.exec(await migration(28));
  await t.test('all prior rows, event timestamps, relationships, catalogue fields and grants are preserved',async()=>{
   assert.deepEqual((await rows(db,'events')).map(({value})=>({value:Object.fromEntries(Object.entries(value).filter(([key])=>key!=='type_id'))})),oldEvents);
   assert.equal((await db.query("select count(*)::int n from public.events where type_id='other'")).rows[0].n,legacyPayloads.length);
   for(const table of tables)assert.deepEqual(await rows(db,table),before[table],table);
   const currentTables=(await db.query("select relname,relacl::text,relrowsecurity,relforcerowsecurity from pg_class where relnamespace='public'::regnamespace and relkind='r' and relname<>'event_types' order by relname")).rows;assert.deepEqual(currentTables,oldTables);
   const definitions=(await db.query(definitionQuery)).rows;
   const withoutChangedBody=defs=>defs.map(d=>['map_read_events','map_upsert_event'].includes(d.proname)?{...d,body:'replaced'}:d);
   assert.deepEqual(withoutChangedBody(definitions),withoutChangedBody(oldDefinitions));
   assert.equal((await db.query("select to_regclass('public.knowledge_source_members') members,to_regclass('public.discord_admin_members') admins")).rows[0].members,null);
  });
  await t.test('snapshot provides exactly five ordered safe catalogue entries and complete existing events',async()=>{
   const snapshot=(await db.query("select public.map_read_events('2030-01-01') result")).rows[0].result;
   assert.deepEqual(snapshot.event_types.map(r=>[r.code,r.name,r.icon_key]),expectedTypes);
   assert.deepEqual(snapshot.event_types.map(r=>r.sort_order),[10,20,30,40,50]);
   for(const type of snapshot.event_types){assert.deepEqual(Object.keys(type).sort(),['code','description','icon_key','name','sort_order']);assert.ok(type.description.length>0&&type.description.length<=500);}
   assert.equal(snapshot.events.length,legacyPayloads.length);assert.equal(snapshot.event_buildings.length,12);assert.equal(snapshot.event_people.length,6);
   for(const e of snapshot.events)assert.equal(e.type_id,'other');
   for(const at of ['infinity',null])await rejected(db,()=>db.query('select public.map_read_events($1)',[at]),'23514');
  });
  let created;
  await t.test('service-only upsert can choose a known type and defaults omitted new types to other',async()=>{
   await db.exec('begin;set local role service_role');
   created=(await call(db,{...event,type_id:'event'},buildings,participants)).rows[0].result;
   const fallback=(await call(db,{...event,source_record_id:'type-default'},buildings,participants)).rows[0].result;
   const serviceSnapshot=(await db.query('select public.map_read_events() result')).rows[0].result;
   assert.equal(serviceSnapshot.events.find(e=>e.id===created.event_id).type_id,'event');
   assert.equal(serviceSnapshot.events.find(e=>e.id===fallback.event_id).type_id,'other');
   await db.exec('commit');
  });
  await t.test('known changes work while an omitted update type preserves the previous selection',async()=>{
   const first=(await call(db,{...event,id:created.event_id,type_id:'meeting'},buildings,participants,created.updated_at)).rows[0].result;
   assert.equal((await db.query('select type_id from public.events where id=$1',[created.event_id])).rows[0].type_id,'meeting');
   const second=(await call(db,{...event,id:created.event_id,notes:'Corrected notes'},buildings,participants,first.updated_at)).rows[0].result;
   assert.equal((await db.query('select type_id from public.events where id=$1',[created.event_id])).rows[0].type_id,'meeting');
   assert.notEqual(second.updated_at,first.updated_at);created=second;
  });
  await t.test('unknown/null/malformed types and invalid later relationships fail without any mutation',async()=>{
   const stableEvents=await rows(db,'events'),stableBuildings=await rows(db,'event_buildings'),stablePeople=await rows(db,'event_people');
   for(const type_id of ['invented','work_session','workshop','',null,{},[],3]){
    await rejected(db,()=>call(db,{...event,source_record_id:'invalid-new',type_id}),typeof type_id==='string'?'23503':'23514');
    await rejected(db,()=>call(db,{...event,id:created.event_id,type_id},[],[],created.updated_at),typeof type_id==='string'?'23503':'23514');
   }
   await rejected(db,()=>call(db,{...event,id:created.event_id,type_id:'social'},[{building_id:'unknown'}],[],created.updated_at),'23503');
   await rejected(db,()=>call(db,{...event,id:created.event_id,type_id:'social'},buildings,[{...participants[0],person_id:'33333333-3333-4333-8333-333333333333'}],created.updated_at),'23503');
   assert.deepEqual(await rows(db,'events'),stableEvents);assert.deepEqual(await rows(db,'event_buildings'),stableBuildings);assert.deepEqual(await rows(db,'event_people'),stablePeople);
  });
  await t.test('source identity, create-only retries, stale versions and competing updates retain CAS protections',async()=>{
   await rejected(db,()=>call(db,event),'40001');
   await rejected(db,()=>call(db,{...event,id:created.event_id,type_id:'social'},[],[],null),'40001');
   await rejected(db,()=>call(db,{...event,id:created.event_id,type_id:'social'},[],[],'2020-01-01'),'40001');
   for(const changed of [{source_id:'33333333-3333-4333-8333-333333333333'},{source_record_id:'changed-source'}])await rejected(db,()=>call(db,{...event,id:created.event_id,...changed,type_id:'social'},[],[],created.updated_at),'23514');
   const races=await Promise.allSettled(['social','study'].map(type_id=>call(db,{...event,id:created.event_id,type_id},buildings,participants,created.updated_at)));
   assert.equal(races.filter(r=>r.status==='fulfilled').length,1);assert.equal(races.find(r=>r.status==='rejected').reason.code,'40001');
   const winner=races[0].status==='fulfilled'?'social':'study';assert.equal((await db.query('select type_id from public.events where id=$1',[created.event_id])).rows[0].type_id,winner);
  });
  await t.test('type catalogue is forced-RLS, service SELECT only and browser inaccessible',async()=>{
   const acl=(await db.query("select has_table_privilege('service_role','public.event_types','SELECT') reads,has_table_privilege('service_role','public.event_types','INSERT') inserts,has_table_privilege('service_role','public.event_types','UPDATE') updates,has_table_privilege('service_role','public.event_types','DELETE') deletes,has_table_privilege('service_role','public.events','UPDATE') event_dml")).rows[0];assert.deepEqual(acl,{reads:true,inserts:false,updates:false,deletes:false,event_dml:false});
   assert.deepEqual((await db.query("select relrowsecurity enabled,relforcerowsecurity forced from pg_class where oid='public.event_types'::regclass")).rows[0],{enabled:true,forced:true});
   for(const role of ['anon','authenticated']){
    await rejected(db,()=>db.exec(`set local role ${role};select * from public.event_types`),'42501');
    await rejected(db,()=>db.exec(`set local role ${role};select public.map_read_events()`),'42501');
    assert.equal((await db.query("select has_function_privilege($1,'public.map_upsert_event(jsonb,jsonb,jsonb,timestamptz)','EXECUTE') allowed",[role])).rows[0].allowed,false);
   }
   for(const mutation of ["update public.event_types set name='Edited' where code='study'","delete from public.event_types where code='study'","insert into public.event_types values('new','New','','other',70)"]){await rejected(db,()=>db.exec(`set local role service_role;${mutation}`),'42501');}
   const definitions=(await db.query(definitionQuery)).rows.filter(d=>['map_read_events','map_upsert_event'].includes(d.proname));
   for(const d of definitions){assert.equal(d.owner,'postgres');assert.equal(d.security_definer,true);assert.ok(d.config.includes('search_path=""'));}
  });
  await t.test('FK restrict and catalogue scalar/icon constraints are real database constraints',async()=>{
   await rejected(db,()=>db.exec("delete from public.event_types where code='other'"));
   for(const mutation of ["update public.event_types set code='invented' where code='other'","update public.event_types set icon_key='https://example.com/icon' where code='study'","update public.event_types set icon_key='meeting' where code='study'","update public.event_types set name='' where code='study'","update public.event_types set sort_order=-1 where code='study'"])await rejected(db,()=>db.exec(mutation));
   await rejected(db,()=>db.exec("update public.events set type_id=null"),'23502');
   await rejected(db,()=>db.exec("update public.events set type_id='invented'"),'23503');
  });
  await t.test('existing snapshot, relationship and event input bounds remain enforced',async()=>{
   await rejected(db,()=>call(db,{...event,source_record_id:'too-many-buildings'},Array(101).fill(buildings[0]),[]),'54000');
   await rejected(db,()=>call(db,{...event,source_record_id:'too-many-people'},[],Array(501).fill(participants[0])),'54000');
   await rejected(db,()=>call(db,{...event,source_record_id:'oversize',notes:'x'.repeat(65536)}),'54000');
   await db.exec('begin');await db.exec("insert into public.map_people(display_name,first_name) select 'Capacity '||n,'Capacity' from generate_series(1,475) n");
   await assert.rejects(()=>db.exec('select public.map_read_events()'),e=>e.code==='54000');await db.exec('rollback');
   const readBody=(await db.query("select prosrc from pg_proc where oid='public.map_read_events(timestamptz)'::regprocedure")).rows[0].prosrc;
   for(const guard of ["'event_types')>100","'events')>2000","'event_buildings')>20000","'event_people')>20000","'people')>500","'buildings')>100",'octet_length(result::text)>16777216'])assert.ok(readBody.includes(guard),guard);
  });
 }finally{await db.close();}
});

test('previous applied normalized migrations remain byte-identical',async()=>{
 for(const [n,expected] of [[26,'bdbf863dee4a9a5936a0ba15e54b76b50b971a70b601981cc33db8f95f4baf5a'],[27,'88757b5f51802dc54ce01524dc368dcb8e7db2e958724ddf52486f885b6d82ee']])assert.equal(createHash('sha256').update(await migration(n)).digest('hex'),expected);
});
