import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {vector} from '@electric-sql/pglite-pgvector';
import {validateArguments} from '../server/automation/validation.js';
import {PEOPLE_HERE_ENTRY_SCHEMA,SCHEDULED_EVENT_ENTRY_SCHEMA,MAP_EVENT_SCHEMA,EVENT_BUILDINGS_SCHEMA,EVENT_PEOPLE_SCHEMA,MAP_RECORD_EXAMPLES} from '../server/map/contracts.js';
const migrations=new URL('../supabase/migrations/',import.meta.url);
async function migration(n){const file=(await readdir(migrations)).find(f=>f.endsWith('.sql')&&Number(f.slice(8,12))===n);assert(file);return {file,sql:await readFile(new URL(file,migrations),'utf8')};}
const unchangedHashes={21:'9627700ffabb38ccd95fdc435cb67fc923df7fa15fe097bebf01c807b1486cee',22:'235a3a1bec6c794cf1e6f7ce26811cf1e618d9c2926449f5030f4720bbe84dea',23:'a29b3aadf55f42f9368020c2a822d5d5802dada21f21b97c0454855f79d16705',24:'7624f380d3dadeffc443eea6b9b16ecadf82c8eb46fd14c5c62ed332ca774459'};
// Historical fixtures deliberately exercise only the immutable 001–024 schema.
const legacy={building_id:'bobst-library',people_here:[{person_id:'00000000-0000-0000-0000-000000000001',status:'self_reported',valid_from:'2026-10-17T14:00:00-04:00',expires_at:'2026-10-17T16:00:00-04:00',source_id:'00000000-0000-0000-0000-000000000002',source_url:'https://example.invalid/messages/presence-example',label:'working on a project'}],scheduled_events:[{id:'example:stable-event',title:'Example workshop',starts_at:'2026-10-20T18:00:00-04:00',ends_at:'2026-10-20T19:30:00-04:00',time_zone:'America/New_York',all_day:false,status:'confirmed',source_id:'00000000-0000-0000-0000-000000000002',source_url:'https://example.invalid/events/timed-example'}]};
test('normalized schemas reject extra fields, nested provider data and legacy shape',()=>{
 assert.equal(validateArguments({...MAP_RECORD_EXAMPLES.event,created_at:'2026-10-18'},MAP_EVENT_SCHEMA),false);
 assert.equal(validateArguments({...MAP_RECORD_EXAMPLES.event,name:{text:'workshop'}},MAP_EVENT_SCHEMA),false);
 assert.equal(validateArguments(legacy.scheduled_events[0],MAP_EVENT_SCHEMA),false);
 assert.equal(validateArguments([{...MAP_RECORD_EXAMPLES.buildings[0],is_primary:true}],EVENT_BUILDINGS_SCHEMA),false);
 assert.equal(validateArguments([{...MAP_RECORD_EXAMPLES.people[0],building_id:'bobst-library'}],EVENT_PEOPLE_SCHEMA),false);
 assert.equal(validateArguments([{...MAP_RECORD_EXAMPLES.people[0],label:'😀'.repeat(200)}],EVENT_PEOPLE_SCHEMA),true);
});
test('immutable applied migrations 021–024 retain the independently captured pre-pass hashes',async()=>{
 for(const [n,hash] of Object.entries(unchangedHashes)){const {sql}=await migration(Number(n));assert.equal(createHash('sha256').update(sql).digest('hex'),hash);}
});

test('historical 001–024 SQL accepts preserved fixtures and independently rejects semantic invalidity',async t=>{
 const db=new PGlite({extensions:{vector}});
 try{
  await db.exec('create role anon;create role authenticated;create role service_role bypassrls;');
  for(let n=1;n<=24;n++)await db.exec((await migration(n)).sql);
  const personId=(await db.query('select id from public.map_people order by id limit 1')).rows[0].id;
  const people=structuredClone(legacy.people_here).map((p,i)=>({...p,person_id:i===0?personId:p.person_id}));
  assert.equal(people.length,1,'SQL example test deliberately substitutes one existing synthetic seed identity');
  const events=structuredClone(legacy.scheduled_events),building=legacy.building_id;
  const putPeople=value=>db.query('update public.map_buildings set people_here=$1::jsonb where id=$2',[JSON.stringify(value),building]);
  const putEvents=value=>db.query('update public.map_buildings set scheduled_events=$1::jsonb where id=$2',[JSON.stringify(value),building]);
  await putPeople(people);await putEvents(events);
  const saved=async()=>(await db.query('select people_here,scheduled_events from public.map_buildings where id=$1',[building])).rows[0];
  assert.deepEqual(await saved(),{people_here:people,scheduled_events:events});
  async function rejects(fn){await db.exec('begin');await assert.rejects(fn);await db.exec('rollback');assert.deepEqual(await saved(),{people_here:people,scheduled_events:events});}
  await t.test('actual SQL rejects unknown fields, nested/stringified payloads and invalid identities/times/provenance',async()=>{
   for(const bad of [JSON.stringify(people),[...people,...people],[{...people[0],label:{text:'nested'}}],[{...people[0],unknown:'field'}],[{...people[0],person_id:'00000000-0000-4000-8000-000000000000'}],[{...people[0],expires_at:people[0].valid_from}],[{...people[0],valid_from:'2026-10-17T17:00:00'}],[{...people[0],source_url:'http://example.com/source'}]])await rejects(()=>putPeople(bad));
   for(const bad of [JSON.stringify(events),[events[0],events[0]],[{...events[0],title:{text:'nested'}}],[{...events[0],attendees:[]}],[{...events[0],time_zone:'Invented/Zone'}],[{...events[0],all_day:'false'}],[{...events[0],ends_at:events[0].starts_at}],[{...events[0],starts_at:'2026-10-17T17:00:00'}],[{...events[0],source_id:'channel-name'}],[{...events[0],title:'a'.repeat(201)}],[{...events[0],title:'   '}],[{...events[0],url:'http://example.com/event'}]])await rejects(()=>putEvents(bad));
  });
  await t.test('SQL title bound is trimmed, and schema delegates that semantic check explicitly',async()=>{
   const padded={...events[0],title:' '.repeat(200)+'x'+' '.repeat(200)};
   await putEvents([padded]);assert.equal((await saved()).scheduled_events[0].title,padded.title);
   assert.equal(validateArguments({...events[0],title:'a'.repeat(201)},SCHEDULED_EVENT_ENTRY_SCHEMA),true);
   assert.match(SCHEDULED_EVENT_ENTRY_SCHEMA.properties.title.description,/btrim/);
   await putEvents(events);
  });
  await t.test('PostgreSQL counts Unicode code points; generic tool validator currently counts UTF-16 units',async()=>{
   const astral={...people[0],label:'😀'.repeat(200)};
   await putPeople([astral]);assert.equal((await saved()).people_here[0].label,astral.label);
   assert.equal(validateArguments(astral,PEOPLE_HERE_ENTRY_SCHEMA),false,'document existing validator difference; no map-write tool uses this schema yet');
   await putPeople(people);await rejects(()=>putPeople([{...astral,label:astral.label+'a'}]));
  });
  await t.test('runtime retains people-only writes, without event or fixed-catalogue mutation',async()=>{
   const acl=(await db.query("select has_column_privilege('service_role','public.map_buildings','people_here','UPDATE') people,has_column_privilege('service_role','public.map_buildings','scheduled_events','UPDATE') events,has_column_privilege('service_role','public.map_buildings','name','UPDATE') names")).rows[0];
   assert.deepEqual(acl,{people:true,events:false,names:false});
  });
 }finally{await db.close();}
});
