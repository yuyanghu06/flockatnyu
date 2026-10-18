import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {vector} from '@electric-sql/pglite-pgvector';
import {checkSchema,validateArguments} from '../server/automation/validation.js';
import {PEOPLE_HERE_ENTRY_SCHEMA,PEOPLE_HERE_SCHEMA,SCHEDULED_EVENT_ENTRY_SCHEMA,SCHEDULED_EVENTS_SCHEMA,MAP_RECORD_CONTRACTS,MAP_RECORD_EXAMPLES,PRESENCE_DEFAULT_TTL_SECONDS,PRESENCE_DEFAULT_POLICY,EVENT_DEFAULT_DURATION_SECONDS,EVENT_DEFAULT_POLICY,buildMapRecordPrompt} from '../server/map/contracts.js';

const presenceKeys=['person_id','status','valid_from','expires_at','source_id','source_url','label'];
const eventKeys=['id','title','starts_at','ends_at','time_zone','all_day','status','source_id','source_url'];
const migrations=new URL('../supabase/migrations/',import.meta.url);
async function migration(n){const file=(await readdir(migrations)).find(f=>f.endsWith('.sql')&&Number(f.slice(8,12))===n);assert(file);return {file,sql:await readFile(new URL(file,migrations),'utf8')};}
const unchangedHashes={21:'9627700ffabb38ccd95fdc435cb67fc923df7fa15fe097bebf01c807b1486cee',22:'235a3a1bec6c794cf1e6f7ce26811cf1e618d9c2926449f5030f4720bbe84dea',23:'a29b3aadf55f42f9368020c2a822d5d5802dada21f21b97c0454855f79d16705',24:'7624f380d3dadeffc443eea6b9b16ecadf82c8eb46fd14c5c62ed332ca774459'};
function frozen(value){if(value&&typeof value==='object'){assert(Object.isFrozen(value));for(const child of Object.values(value))frozen(child);}}

// These schemas describe storage. They are not currently exposed as map tools.
test('shared contracts are deeply immutable and accepted by the actual tool-schema checker',()=>{
 for(const value of [PEOPLE_HERE_ENTRY_SCHEMA,PEOPLE_HERE_SCHEMA,SCHEDULED_EVENT_ENTRY_SCHEMA,SCHEDULED_EVENTS_SCHEMA,MAP_RECORD_CONTRACTS,MAP_RECORD_EXAMPLES,PRESENCE_DEFAULT_POLICY,EVENT_DEFAULT_POLICY])frozen(value);
 for(const schema of [PEOPLE_HERE_ENTRY_SCHEMA,PEOPLE_HERE_SCHEMA,SCHEDULED_EVENT_ENTRY_SCHEMA,SCHEDULED_EVENTS_SCHEMA])assert.equal(checkSchema(schema),true);
 assert.deepEqual(Object.keys(MAP_RECORD_CONTRACTS).sort(),['people_here','scheduled_events']);
 assert.equal(PEOPLE_HERE_SCHEMA.maxItems,500);assert.equal(SCHEDULED_EVENTS_SCHEMA.maxItems,200);
 assert.deepEqual([...PEOPLE_HERE_ENTRY_SCHEMA.required].sort(),presenceKeys.sort());
 assert.deepEqual([...SCHEDULED_EVENT_ENTRY_SCHEMA.required].sort(),eventKeys.sort());
 assert.deepEqual(Object.keys(SCHEDULED_EVENT_ENTRY_SCHEMA.properties).sort(),[...eventKeys,'description','location','url'].sort());
 assert.equal(PEOPLE_HERE_ENTRY_SCHEMA.additionalProperties,false);assert.equal(SCHEDULED_EVENT_ENTRY_SCHEMA.additionalProperties,false);
 assert.equal(PEOPLE_HERE_ENTRY_SCHEMA.properties.label.minLength??0,0);assert.equal(PEOPLE_HERE_ENTRY_SCHEMA.properties.label.maxLength,200);
 for(const schema of [PEOPLE_HERE_ENTRY_SCHEMA,SCHEDULED_EVENT_ENTRY_SCHEMA])for(const [key,value] of Object.entries(schema.properties))assert.equal(value.type,key==='all_day'?'boolean':'string');
 assert.throws(()=>{MAP_RECORD_CONTRACTS.people_here.items.properties.label.maxLength=999;},TypeError);
});

test('approved current-presence policy is shared immutable data with source-time-only semantics',()=>{
 assert.equal(PRESENCE_DEFAULT_TTL_SECONDS,7200);assert.equal(PRESENCE_DEFAULT_POLICY.seconds,7200);
 assert.equal(PRESENCE_DEFAULT_POLICY.appliesTo,'explicit_current_self_report_without_end');
 assert.equal(PRESENCE_DEFAULT_POLICY.anchoredTo,'original_provider_report_timestamp');
 assert.equal(PRESENCE_DEFAULT_POLICY.refreshRequires,'newer_explicit_current_location_confirmation');
 assert.deepEqual(PRESENCE_DEFAULT_POLICY.excludes,['future_plans','events','activity_only_edits','partial_edits_without_location_confirmation']);
 const example=MAP_RECORD_EXAMPLES.people_here[0];assert.equal(Date.parse(example.expires_at)-Date.parse(example.valid_from),PRESENCE_DEFAULT_TTL_SECONDS*1000);
});

test('approved timed-event policy is distinct from presence freshness and preserves explicit ends',()=>{
 assert.equal(EVENT_DEFAULT_DURATION_SECONDS,7200);assert.equal(EVENT_DEFAULT_POLICY.seconds,7200);
 assert.equal(EVENT_DEFAULT_POLICY.appliesTo,'timed_event_with_supported_start_and_missing_end');
 assert.equal(EVENT_DEFAULT_POLICY.explicitEndOrDurationOverrides,true);assert.equal(EVENT_DEFAULT_POLICY.preserveExistingEndOnPartialEdit,true);
 assert.deepEqual(EVENT_DEFAULT_POLICY.excludes,['all_day_events','unknown_or_ambiguous_start','future_person_location_plans']);
 const timed=MAP_RECORD_EXAMPLES.scheduled_events.find(e=>!e.all_day);assert.equal(Date.parse(timed.ends_at)-Date.parse(timed.starts_at),90*60*1000,'supported explicit end stays90minutes rather than the2-hour default');
 const allDay=MAP_RECORD_EXAMPLES.scheduled_events.find(e=>e.all_day);assert.equal(Date.parse(allDay.ends_at)-Date.parse(allDay.starts_at),25*60*60*1000,'DST-crossing all-day example uses exclusive nextlocalmidnight rather than2hours');
});

test('schemas reject malformed shapes, coercions, unknown/nested fields and bounds',()=>{
 const person=MAP_RECORD_EXAMPLES.people_here[0],event=MAP_RECORD_EXAMPLES.scheduled_events[0];
 assert.equal(MAP_RECORD_EXAMPLES.syntheticOnly,true);
 for(const [schema,values] of [[PEOPLE_HERE_SCHEMA,MAP_RECORD_EXAMPLES.people_here],[SCHEDULED_EVENTS_SCHEMA,MAP_RECORD_EXAMPLES.scheduled_events]])assert.equal(validateArguments(values,schema),true);
 const missing=structuredClone(person);delete missing.label;
 for(const bad of [missing,{...person,label:null},{...person,label:[]},{...person,label:{text:'studying'}},{...person,extra:'ignored?'},{...person,status:'present'},{...person,label:'a'.repeat(201)}])assert.equal(validateArguments(bad,PEOPLE_HERE_ENTRY_SCHEMA),false);
 assert.equal(validateArguments({...person,label:''},PEOPLE_HERE_ENTRY_SCHEMA),true);
 const missingEvent=structuredClone(event);delete missingEvent.all_day;
 for(const bad of [missingEvent,{...event,all_day:'false'},{...event,title:{text:'meeting'}},{...event,attendees:[]},{...event,status:'unknown'},{...event,description:'a'.repeat(4001)}])assert.equal(validateArguments(bad,SCHEDULED_EVENT_ENTRY_SCHEMA),false);
 for(const bad of [{},null,JSON.stringify([person]),Array(501).fill(person)])assert.equal(validateArguments(bad,PEOPLE_HERE_SCHEMA),false);
 for(const bad of [{},null,JSON.stringify([event]),Array(201).fill(event)])assert.equal(validateArguments(bad,SCHEDULED_EVENTS_SCHEMA),false);
});

test('examples preserve stable source identities and exclusive-end all-day dates',()=>{
 const {people_here,scheduled_events}=MAP_RECORD_EXAMPLES;
 assert(people_here.length>0);assert(scheduled_events.some(e=>e.all_day));assert(scheduled_events.some(e=>!e.all_day));
 for(const p of people_here){assert(Date.parse(p.expires_at)>Date.parse(p.valid_from));assert.match(p.source_id,/^[a-f\d-]{36}$/i);assert.match(p.source_url,/^https:\/\//);}
 for(const e of scheduled_events){assert(Date.parse(e.ends_at)>Date.parse(e.starts_at));assert(!/^\d+$/.test(e.id),'event identity must not be an array index');assert.match(e.source_url,/^https:\/\//);new Intl.DateTimeFormat('en',{timeZone:e.time_zone});if(e.all_day){assert.match(e.starts_at,/T00:00:00/);assert.match(e.ends_at,/T00:00:00/);assert.notEqual(e.starts_at.slice(0,10),e.ends_at.slice(0,10));}}
 assert.match(buildMapRecordPrompt(),/exclusive/i);
});

test('immutable applied migrations 021–024 retain the independently captured pre-pass hashes',async()=>{
 for(const [n,hash] of Object.entries(unchangedHashes)){const {sql}=await migration(Number(n));assert.equal(createHash('sha256').update(sql).digest('hex'),hash);}
});

test('actual 001–024 SQL accepts exported examples and independently rejects semantic invalidity',async t=>{
 const db=new PGlite({extensions:{vector}});
 try{
  await db.exec('create role anon;create role authenticated;create role service_role bypassrls;');
  for(let n=1;n<=24;n++)await db.exec((await migration(n)).sql);
  const personId=(await db.query('select id from public.map_people order by id limit 1')).rows[0].id;
  const people=structuredClone(MAP_RECORD_EXAMPLES.people_here).map((p,i)=>({...p,person_id:i===0?personId:p.person_id}));
  assert.equal(people.length,1,'SQL example test deliberately substitutes one existing synthetic seed identity');
  const events=structuredClone(MAP_RECORD_EXAMPLES.scheduled_events),building=MAP_RECORD_EXAMPLES.building_id;
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
