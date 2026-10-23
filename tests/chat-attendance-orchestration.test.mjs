import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,snapshot,attendanceArguments,assertAttendance,scriptedProvider,exactSentence,ids,now,requestContext} from './fixtures/chat-map-attendance.mjs';

const read={name:'read_map_events',arguments:{}},lookup={name:'lookup_map_person',arguments:{}},write=()=>({name:'upsert_map_event',arguments:attendanceArguments()});
function check(f,provider,result){if(provider.errors.length)throw provider.errors[0];assert.equal(result.result.status,'succeeded');assert.equal(result.records.at(-1).type,'done');return result;}

test('exact first-person GoGreek declaration uses ordinary read/verified-actor lookup/upsert and preserves the existing occurrence',async()=>{
  const proposal=write();for(const key of ['source_id','source_url','source_record_id','reported_at','url'])delete proposal.arguments.event[key];
  for(const person of proposal.arguments.people)for(const key of ['source_id','source_url','reported_at'])delete person[key];
  const f=fixture(),provider=scriptedProvider([[read,lookup],[proposal],[]],{answer:({system})=>{assert.match(system,/"mapWrite":\{"outcome":"applied"/);return 'You’re marked as going to GoGreek tomorrow.';}});
  const result=check(f,provider,await f.run(provider));assertAttendance(f);assert.deepEqual(f.calls.filter(row=>row.result).map(row=>row.name),['read_map_events','lookup_map_person','upsert_map_event']);
  assert.deepEqual(f.calls.find(row=>row.name==='store.lookup').args,{provider:'discord',providerUserId:'400'});assert.match(result.text,/marked as going/);
  const projected=await f.projection();assert(projected.buildings[0].events.find(row=>row.id===ids.event).attendees.some(row=>row.id===ids.person));assert(projected.upcoming.some(row=>row.personId===ids.person&&row.validFrom==='2026-10-23T22:00:00.000Z'));
});

test('unlinked Discord speaker receives no invented person; a name-only answer can reuse the original event/date context',async()=>{
  const f=fixture({linked:false}),unlinked={...requestContext,actor:{...requestContext.actor,userId:'999',username:'unknown',displayName:'Unknown'}};
  const first=scriptedProvider([[lookup],[]],{answer:({system})=>{assert.match(system,/person_name_required|person_not_found|"person":null/);return 'What is your name? I’ll keep GoGreek tomorrow in mind.';}});
  const initial=check(f,first,await f.run(first,{actor:unlinked,users:undefined}));assert.equal(f.writes.length,0);assert.match(initial.text,/name/);
  const second=scriptedProvider([[{name:'lookup_map_person',arguments:{personName:'Tony Example'}},read],[write()],[]],{answer:'Tony, you’re marked as going to GoGreek tomorrow.'});
  check(f,second,await f.run(second,{actor:unlinked,users:undefined,messages:[{role:'user',content:exactSentence},{role:'assistant',content:initial.text},{role:'user',content:'Tony Example'}]}));assertAttendance(f);
});

test('unknown and ambiguous roster lookups return no person instead of guessing a participant',async()=>{
  const data=snapshot();data.people.push({...data.people[0],id:'30000000-0000-4000-8000-000000000003',display_name:'Tony Other',discord_user_id:'700'});
  const f=fixture({data,linked:false}),provider=scriptedProvider([[{name:'lookup_map_person',arguments:{personName:'Tony'}}],[{name:'lookup_map_person',arguments:{personName:'Nonexistent Person'}}],[]],{answer:'Which Tony do you mean?'});
  check(f,provider,await f.run(provider,{messages:[{role:'user',content:'Tony will attend GoGreek tomorrow'}]}));
  const lookups=f.calls.filter(row=>row.name==='lookup_map_person');assert.equal(lookups.length,2);assert(lookups.every(row=>row.result.person===null));assert.equal(lookups[0].result.reason,'person_ambiguous');assert.equal(f.writes.length,0);
});

for(const writeStatus of ['conflict','unavailable','missing_receipt'])test(`ordinary map ${writeStatus} never becomes confirmed attendance`,async()=>{
  const f=fixture({writeStatus}),provider=scriptedProvider([[read,lookup],[write()],[]],{answer:({system})=>{assert(!system.includes('"mapWrite":{"outcome":"applied"'));return 'I could not confirm saving that attendance change.';}});
  const result=check(f,provider,await f.run(provider));assert.equal(f.writes.length,0);assert.deepEqual(f.state,snapshot());assert.match(result.text,/could not confirm/);assert.equal(f.attempts.length,1);
});

test('optimistic conflict preserves a concurrent human correction and existing participant details',async()=>{
  const f=fixture({beforeWrite:state=>{state.events[0].updated_at='2026-10-22T20:00:00.005Z';state.events[0].notes='Concurrent human correction';}}),provider=scriptedProvider([[read,lookup],[write()],[]],{answer:'The event changed while I was saving; I could not confirm the update.'});
  check(f,provider,await f.run(provider));assert.equal(f.writes.length,0);assert.equal(f.state.events[0].notes,'Concurrent human correction');assert.deepEqual(f.state.event_people,snapshot().event_people);
});

test('reading a map catalogue alone leaves all events and participants unchanged',async()=>{
  const data=snapshot();data.events.push({...data.events[0],id:'20000000-0000-4000-8000-000000000002',name:'GoGreek planning meeting'});
  const f=fixture({data}),provider=scriptedProvider([[read],[]],{answer:'Do you mean GoGreek or the planning meeting?'});
  check(f,provider,await f.run(provider));assert.equal(f.writes.length,0);assert.deepEqual(f.state,data);assert.equal(f.calls.find(row=>row.name==='read_map_events').result.events.length,2);
});
