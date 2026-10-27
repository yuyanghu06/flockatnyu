import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {vector} from '@electric-sql/pglite-pgvector';
import {pg_trgm} from '@electric-sql/pglite/contrib/pg_trgm';
import {fuzzystrmatch} from '@electric-sql/pglite/contrib/fuzzystrmatch';
import {matchCalendarBuildings} from '../server/automation/calendar-sync.js';

const migrations=new URL('../supabase/migrations/',import.meta.url);
async function migration(n){const name=(await readdir(migrations)).find(name=>name.endsWith('.sql')&&Number(name.slice(8,12))===n);assert(name,`migration ${n} exists`);return readFile(new URL(name,migrations),'utf8');}
const rows=async db=>(await db.query('select to_jsonb(b) value from public.map_buildings b order by id')).rows.map(row=>row.value);
const trigger=async db=>(await db.query("select tgenabled from pg_trigger where tgrelid='public.map_buildings'::regclass and tgname='map_buildings_validate'")).rows;
const grants=async db=>(await db.query("select attname,attacl from pg_attribute where attrelid='public.map_buildings'::regclass and attnum>0 order by attnum")).rows;

test('eLab alias migration maps bare location and preserves fixed catalogue data, timestamps, trigger and runtime permissions on replay',async()=>{
 const db=new PGlite({extensions:{vector,pg_trgm,fuzzystrmatch}});try{
  await db.exec('create role anon;create role authenticated;create role service_role bypassrls;');
  for(let n=1;n<=51;n++)await db.exec(await migration(n));
  const before=await rows(db),beforeGrants=await grants(db),beforeTrigger=await trigger(db),people=(await db.query('select to_jsonb(p) value from public.map_people p order by id')).rows;
  assert.equal(matchCalendarBuildings('eLab',before).status,'unknown');
  const sql=await migration(52);await db.exec(sql);const after=await rows(db);
  assert.deepEqual(after,before.map(row=>row.id==='nyu-leslie-elab-building'?{...row,aliases:[...row.aliases,'eLab']}:row));
  assert.deepEqual(matchCalendarBuildings('elab',after),{status:'matched',buildingIds:['nyu-leslie-elab-building']});
  assert.deepEqual(await trigger(db),beforeTrigger);assert.deepEqual(await grants(db),beforeGrants);
  assert.deepEqual((await db.query('select to_jsonb(p) value from public.map_people p order by id')).rows,people);
  await db.exec(sql);assert.deepEqual(await rows(db),after,'replay adds no duplicate and changes no timestamps');
  await db.exec('begin;set local role service_role');
  await assert.rejects(db.query("update public.map_buildings set aliases=array['Other'] where id='nyu-leslie-elab-building'"),error=>error.code==='42501');await db.exec('rollback');
  await db.exec("update public.map_buildings set name='Owner changed name' where id='nyu-leslie-elab-building'");const mismatch=await rows(db);
  await assert.rejects(db.exec(sql),error=>error.code==='23514');await db.exec('rollback');assert.deepEqual(await rows(db),mismatch);assert.deepEqual(await trigger(db),beforeTrigger);assert.deepEqual(await grants(db),beforeGrants);
 }finally{await db.close();}
});

import {createPresenceFixture,presenceInputs,presenceTask,personId,source,memberId,stamp,originalUrl,buildings} from './fixtures/planner-presence.mjs';
const planArgs=row=>({sourceUrl:originalUrl(row),personId,title:'At eLab',location:'Leslie eLab building',activityKind:'presence',typeId:'other',label:''});
const lookupArgs=row=>({provider:'discord',providerUserId:row.raw_response.payload.author.id,sourceId:source,sourceUrl:originalUrl(row)});
async function observe(f,row){const ids=[row.uuid];await f.execute('read_discord_messages',{channelId:'200',messageId:row.raw_response.payload.id,context:false},ids);return f.execute('lookup_map_person',lookupArgs(row),ids);}

test('production adapters preserve the exact original instant and default two-hour presence while rejecting an unmatched author',async()=>{
 const inputs=presenceInputs(["I'm at elab"]),f=createPresenceFixture({inputs});await f.prepare();assert.equal((await observe(f,inputs[0])).status,'ready');
 assert.equal((await f.execute('upsert_member_plan',planArgs(inputs[0]))).status,'ready');const [saved]=f.calendarEvents.get(memberId).values();assert.equal(saved.start.dateTime,stamp);assert.equal(Date.parse(saved.end.dateTime),Date.parse(stamp)+7200000);assert.equal(saved.source.url,originalUrl(inputs[0]));
 assert.equal(f.mapRows.size,1,'Member Plans write alone does not implicitly project the map');
 await f.execute('sync_calendars_to_map',{});assert.equal(f.mapRows.size,2);assert.deepEqual(f.mapRows.get(f.humanBefore.event.id),f.humanBefore);
 const blocked=createPresenceFixture({inputs,unmatched:true});await blocked.prepare();assert.equal((await observe(blocked,inputs[0])).person,null);
 assert.equal((await blocked.execute('upsert_member_plan',planArgs(inputs[0]))).status,'forbidden_source');assert.equal(blocked.calendarEvents.get(memberId).size,0);assert.deepEqual(blocked.mapRows.get(blocked.humanBefore.event.id),blocked.humanBefore);
 assert.deepEqual(matchCalendarBuildings('that place',buildings),{status:'unknown',buildingIds:[]},'an unclear place never receives a guessed building');
});

test('an unavailable saved original remains untouched while independent source-backed presence still writes and projects',async()=>{
 const savedTask=presenceTask(),unavailable=savedTask.info.inputs[0],ready=presenceInputs(["I'm at Bobst"])[0];ready.uuid='40000000-0000-4000-8000-000000000009';ready.raw_response.event_id='309';ready.raw_response.payload.id='309';
 const f=createPresenceFixture({pending:[savedTask],inputs:[unavailable,ready],unavailableIds:['300','301','302']});await f.prepare();
 assert.equal((await f.execute('read_discord_messages',{channelId:'200',messageId:'300',context:false},[unavailable.uuid])).status,'unavailable');
 assert.equal((await observe(f,ready)).status,'ready');assert.equal((await f.execute('upsert_member_plan',{...planArgs(ready),location:'Bobst',title:'At Bobst'},[ready.uuid])).status,'ready');
 await f.execute('sync_calendars_to_map',{},[ready.uuid]);assert.deepEqual(f.tasks.get(savedTask.uuid),savedTask,'source failure and independent success do not erase or rewrite unfinished work');
 assert.deepEqual(f.mapRows.get(f.humanBefore.event.id),f.humanBefore);const projected=[...f.mapRows.values()].filter(row=>row.event.id!==f.humanBefore.event.id);assert.equal(projected.length,1);assert.equal(projected[0].buildings[0].building_id,'bobst-library');assert.equal(projected[0].people[0].person_id,personId);
});
