import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {vector} from '@electric-sql/pglite-pgvector';

const directory=new URL('../supabase/migrations/',import.meta.url);
async function migration(n){const file=(await readdir(directory)).find(file=>file.endsWith('.sql')&&Number(file.slice(8,12))===n);assert(file);return readFile(new URL(file,directory),'utf8');}
const event={id:'synthetic-event',title:'Project session',starts_at:'2026-10-20T18:00:00-04:00',ends_at:'2026-10-20T19:00:00-04:00',time_zone:'America/New_York',all_day:false,status:'confirmed',source_id:'22222222-2222-4222-8222-222222222222',source_url:'https://example.com/source',description:'Original text',location:'Room 101',url:'https://example.com/event'};

test('024 real SQL: flattened building events preserve records, ACLs and presence-only writes',async t=>{
 const db=new PGlite({extensions:{vector}});
 try{
  await db.exec('create role anon;create role authenticated;create role service_role bypassrls;');
  for(let n=1;n<=23;n++)await db.exec(await migration(n));
  const oldRows=(await db.query('select to_jsonb(b) value from public.map_buildings b order by id')).rows;
  const oldPeople=(await db.query('select to_jsonb(p) value from public.map_people p order by id')).rows;
  const oldFunctions=(await db.query("select p.oid::regprocedure::text name,p.prosrc from pg_proc p where p.pronamespace='public'::regnamespace order by name")).rows;
  const oldACL=(await db.query("select c.relname,c.relacl::text,c.relrowsecurity,c.relforcerowsecurity from pg_class c where c.relnamespace='public'::regnamespace and c.relkind='r' order by c.relname")).rows;
  await db.exec(await migration(24));
  const put=value=>db.query("update public.map_buildings set scheduled_events=$1::jsonb where id='bobst-library'",[JSON.stringify(value)]);
  await t.test('nine defaults empty; all previous rows/functions/table grants preserved',async()=>{
   assert.equal((await db.query("select count(*)::int n from public.map_buildings where scheduled_events='[]'::jsonb")).rows[0].n,9);
   assert.deepEqual((await db.query("select to_jsonb(b)-'scheduled_events' value from public.map_buildings b order by id")).rows,oldRows);
   assert.deepEqual((await db.query('select to_jsonb(p) value from public.map_people p order by id')).rows,oldPeople);
   assert.deepEqual((await db.query("select p.oid::regprocedure::text name,p.prosrc from pg_proc p where p.pronamespace='public'::regnamespace and p.proname<>'map_validate_scheduled_events' order by name")).rows,oldFunctions);
   assert.deepEqual((await db.query("select c.relname,c.relacl::text,c.relrowsecurity,c.relforcerowsecurity from pg_class c where c.relnamespace='public'::regnamespace and c.relkind='r' order by c.relname")).rows,oldACL);
  });
  await t.test('owner can store valid flat event fields verbatim',async()=>{
   await put([event]);assert.deepEqual((await db.query("select scheduled_events from public.map_buildings where id='bobst-library'")).rows[0].scheduled_events,[event]);
  });
  await t.test('invalid, nested, unbounded and duplicate events are rejected without mutation',async()=>{
   for(const value of [{},null,[{}],[{...event,title:''}],[{...event,starts_at:'invalid'}],[{...event,ends_at:event.starts_at}],[{...event,time_zone:'Invalid/Zone'}],[{...event,all_day:'true'}],[{...event,status:'invented'}],[{...event,source_id:'bad'}],[{...event,source_url:'http://unsafe.test'}],[{...event,url:'javascript:alert(1)'}],[{...event,description:{nested:true}}],[{...event,extra:[]}],[event,event],Array(201).fill(event)]){
    await db.exec('begin;savepoint invalid');
    await assert.rejects(()=>put(value));
    await db.exec('rollback');
    assert.deepEqual((await db.query("select scheduled_events from public.map_buildings where id='bobst-library'")).rows[0].scheduled_events,[event]);
   }
  });
  await t.test('runtime may read events and update people_here, but cannot write events or catalogue',async()=>{
   const privileges=(await db.query("select has_column_privilege('service_role','public.map_buildings','scheduled_events','SELECT') reads,has_column_privilege('service_role','public.map_buildings','scheduled_events','UPDATE') event_write,has_column_privilege('service_role','public.map_buildings','people_here','UPDATE') presence_write,has_column_privilege('service_role','public.map_buildings','name','UPDATE') catalogue_write")).rows[0];
   assert.deepEqual(privileges,{reads:true,event_write:false,presence_write:true,catalogue_write:false});
   await db.exec("begin;set local role service_role;update public.map_buildings set people_here='[]' where id='bobst-library';rollback");
   await db.exec('begin;set local role service_role');await assert.rejects(()=>put([]),error=>error.code==='42501');await db.exec('rollback');
   for(const role of ['anon','authenticated']){
    await db.exec(`begin;set local role ${role}`);await assert.rejects(()=>db.query('select scheduled_events from public.map_buildings'),error=>error.code==='42501');await db.exec('rollback');
   }
  });
 }finally{await db.close();}
});

test('025 optional attendee UUID arrays preserve legacy events and owner-only writes',async()=>{
 const db=new PGlite({extensions:{vector}});
 try {
  await db.exec('create role anon;create role authenticated;create role service_role bypassrls;');
  for(let n=1;n<=24;n++)await db.exec(await migration(n));
  const personId='11111111-1111-4111-8111-111111111111';
  await db.query('insert into public.map_people(id,display_name,first_name) values($1,$2,$3)',[personId,'Synthetic attendee','Synthetic']);
  const put=value=>db.query("update public.map_buildings set scheduled_events=$1::jsonb where id='bobst-library'",[JSON.stringify([value])]);
  await put(event);
  const before=(await db.query('select to_jsonb(b) value from public.map_buildings b order by id')).rows;
  await db.exec(await migration(25));
  assert.deepEqual((await db.query('select to_jsonb(b) value from public.map_buildings b order by id')).rows,before);
  for(const attendee_ids of [[],[personId]]) {
   await put({...event,attendee_ids});
   assert.deepEqual((await db.query("select scheduled_events->0->'attendee_ids' ids from public.map_buildings where id='bobst-library'")).rows[0].ids,attendee_ids);
  }
  for(const attendee_ids of [null,'bad',{},[1],['invalid'],[personId,personId.toUpperCase()],['33333333-3333-4333-8333-333333333333'],Array(501).fill(personId)]) {
   await db.exec('begin');await assert.rejects(()=>put({...event,attendee_ids}));await db.exec('rollback');
  }
  await put(event);
  assert.deepEqual((await db.query("select scheduled_events from public.map_buildings where id='bobst-library'")).rows[0].scheduled_events,[event]);
  assert.equal((await db.query("select has_column_privilege('service_role','public.map_buildings','scheduled_events','UPDATE') allowed")).rows[0].allowed,false);
 } finally {await db.close();}
});
