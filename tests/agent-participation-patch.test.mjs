import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {PARTICIPATION_PARAMETERS,completeParticipationSnapshot,mergeParticipationChanges,sameSavedParticipation} from '../server/automation/participation.js';
import {validateArguments} from '../server/automation/validation.js';

const eventId=randomUUID(),calendarSource=randomUUID(),discordSource=randomUUID(),actor=randomUUID(),peer=randomUUID(),helper=randomUUID();
const revision='2026-10-22T19:24:17.653692+00:00',reported='2026-10-22T18:20:00.000Z';
const sourceUrl='https://discord.com/channels/100/200/300';
const opaqueUrl='https://calendar.google.com/calendar/event?eid=b3BhcXVlX0V2ZW50IHRlY2glMkJjbHViQGV4YW1wbGUuY29t';
function snapshot({start='2026-10-23T19:00:00+00:00',end='2026-10-23T21:00:00+00:00',withActor=false}={}){
 const data={events:[{id:eventId,name:'Human event title',notes:'Human notes <keep> & exact URL',kind:'scheduled_event',type_id:'meeting',status:'confirmed',time_kind:'timed',starts_at:start,ends_at:end,starts_on:null,ends_on:null,time_zone:'America/New_York',source_id:calendarSource,source_url:opaqueUrl,source_record_id:'provider123',url:opaqueUrl,reported_at:reported,created_at:revision,updated_at:revision}],event_buildings:[{event_id:eventId,building_id:'bobst-library',location_notes:'Human room204'},{event_id:eventId,building_id:'stern-school-of-business',location_notes:'Human overflow'}],event_people:[{event_id:eventId,person_id:helper,attendance_status:'going',presence_basis:'planned',label:'Human helper caption',starts_at:null,ends_at:null,source_id:discordSource,source_url:'https://discord.com/channels/100/200/292',reported_at:'2026-10-22T18:03:00Z',created_at:revision,updated_at:revision}],buildings:[{id:'bobst-library',name:'Bobst Library'},{id:'stern-school-of-business',name:'Stern'}],people:[actor,peer,helper].map(id=>({id,display_name:'Synthetic '+id,is_trackable:true})),event_types:['study','meeting','event','social','other'].map(code=>({code,name:code,description:'',icon_key:code,sort_order:0}))};
 if(withActor)data.event_people.push({event_id:eventId,person_id:actor,attendance_status:'going',presence_basis:'planned',label:'Existing actor label',starts_at:'2026-10-23T19:15:00+00:00',ends_at:'2026-10-23T20:30:00+00:00',source_id:discordSource,source_url:'https://discord.com/channels/100/200/291',reported_at:'2026-10-22T18:02:00Z'});
 return data;
}
const provenance=(person=actor,url=sourceUrl)=>new Map([[person,{source_id:discordSource,source_url:url,reported_at:reported}]]);
const change=(extra={})=>({personId:actor,sourceUrl,attendanceStatus:'going',...extra});
const complete=(data=snapshot(),authorized=structuredClone(data))=>completeParticipationSnapshot(data,{status:'ok',...authorized},eventId,revision);
const throwsSafely=action=>assert.throws(action,error=>/^(invalid_[a-z_]+|duplicate_event_snapshot|participation_conflict)$/.test(error.message));

test('partial attendance derives exact elapsed first-hour, late-arrival and last90 windows without copying event fields',()=>{
 const data=snapshot(),before=structuredClone(data),base=complete(data);
 for(const [patch,wantStart,wantEnd] of [
  [{start:{anchor:'event_start',offsetMinutes:0},end:{anchor:'event_start',offsetMinutes:60}},'2026-10-23T19:00:00+00:00','2026-10-23T20:00:00.000Z'],
  [{start:{anchor:'event_start',offsetMinutes:30},end:{inherit:true}},'2026-10-23T19:30:00.000Z',null],
  [{start:{anchor:'event_end',offsetMinutes:-90},end:{anchor:'event_end',offsetMinutes:0}},'2026-10-23T19:30:00.000Z','2026-10-23T21:00:00+00:00']]){
  const result=mergeParticipationChanges(base,[change(patch)],provenance());assert.equal(result.status,'ready');const own=result.arguments.people.find(p=>p.person_id===actor);assert.equal(own.starts_at??null,wantStart);assert.equal(own.ends_at??null,wantEnd);assert.deepEqual(result.arguments.event,base.event);assert.deepEqual(result.arguments.buildings,base.buildings);assert.deepEqual(result.arguments.people.find(p=>p.person_id===helper),base.people[0]);assert.equal(result.arguments.expectedUpdatedAt,revision);
 }
 assert.deepEqual(data,before,'Raw input snapshot must not be mutated');
});

test('relative bounds use elapsed instants across fall-back DST and after DST',()=>{
 for(const [bounds,patch,expected] of [
  [{start:'2026-11-01T00:30:00-04:00',end:'2026-11-01T02:30:00-05:00'},{start:{anchor:'event_start',offsetMinutes:0},end:{anchor:'event_start',offsetMinutes:60}},['2026-11-01T04:30:00Z','2026-11-01T05:30:00Z']],
  [{start:'2026-11-01T00:30:00-04:00',end:'2026-11-01T02:30:00-05:00'},{start:{anchor:'event_end',offsetMinutes:-90},end:{inherit:true}},['2026-11-01T06:00:00Z','2026-11-01T07:30:00Z']],
  [{start:'2026-11-06T18:00:00Z',end:'2026-11-06T20:30:00Z'},{start:{anchor:'event_start',offsetMinutes:30},end:{anchor:'event_end',offsetMinutes:0}},['2026-11-06T18:30:00Z','2026-11-06T20:30:00Z']]]){
  const base=complete(snapshot(bounds)),result=mergeParticipationChanges(base,[change(patch)],provenance());assert.equal(result.status,'ready');const own=result.arguments.people.find(p=>p.person_id===actor);assert.equal(Date.parse(own.starts_at??base.event.starts_at),Date.parse(expected[0]));assert.equal(Date.parse(own.ends_at??base.event.ends_at),Date.parse(expected[1]));assert.equal(result.arguments.event.starts_at,bounds.start);assert.equal(result.arguments.event.ends_at,bounds.end);
 }
});

test('withdrawal retains declined relationship/current own provenance and every unrelated accepted fact',()=>{
 const base=complete(snapshot({withActor:true})),before=structuredClone(base),result=mergeParticipationChanges(base,[change({attendanceStatus:'declined'})],provenance());assert.equal(result.status,'ready');const own=result.arguments.people.find(p=>p.person_id===actor);assert.equal(own.attendance_status,'declined');assert.equal(own.starts_at,'2026-10-23T19:15:00+00:00');assert.equal(own.ends_at,'2026-10-23T20:30:00+00:00');assert.equal(own.label,'Existing actor label');assert.equal(own.source_url,sourceUrl);assert.equal(own.reported_at,reported);assert.deepEqual(result.arguments.people.find(p=>p.person_id===helper),before.people.find(p=>p.person_id===helper));assert.deepEqual(result.arguments.event,before.event);assert.equal(result.arguments.event.url,opaqueUrl);assert.deepEqual(result.arguments.buildings,before.buildings);assert.deepEqual(base,before);
});

test('omitted endpoints preserve overrides; explicit inheritance clears only requested override',()=>{
 const base=complete(snapshot({withActor:true}));const result=mergeParticipationChanges(base,[change({attendanceStatus:'tentative',start:{inherit:true}})],provenance());assert.equal(result.status,'ready');const own=result.arguments.people.find(p=>p.person_id===actor);assert.equal(own.starts_at??null,null);assert.equal(own.ends_at,'2026-10-23T20:30:00+00:00');assert.equal(own.label,'Existing actor label');
});

test('no-op and mixed no-op group cannot mint an applied action or update provenance',()=>{
 const base=complete(snapshot({withActor:true}));assert.deepEqual(mergeParticipationChanges(base,[change()],provenance()),{status:'pending',reason:'unchanged_participation'});
 const both=new Map([...provenance(),...provenance(peer,'https://discord.com/channels/100/200/301')]);const result=mergeParticipationChanges(base,[change(),{personId:peer,sourceUrl:'https://discord.com/channels/100/200/301',attendanceStatus:'going',start:{inherit:true},end:{inherit:true}}],both);assert.equal(result.status,'pending');assert(!result.arguments);assert.equal(base.people.length,2);
});

for(const [label,endpoint] of Object.entries({empty:{},twoRepresentations:{at:'2026-10-23T19:00:00Z',inherit:true},twoAnchors:{at:'2026-10-23T19:00:00Z',anchor:'event_start',offsetMinutes:0},missingOffset:{anchor:'event_start'},falseInheritance:{inherit:false},invalidTimestamp:{at:'Friday3pm'},nonFinite:{anchor:'event_start',offsetMinutes:Infinity},beforeEvent:{anchor:'event_start',offsetMinutes:-1},afterEvent:{anchor:'event_end',offsetMinutes:1}}))test('rejects malformed/out-of-window endpoint: '+label,()=>{
 const base=complete();throwsSafely(()=>mergeParticipationChanges(base,[change(label==='afterEvent'?{start:{inherit:true},end:endpoint}:{start:endpoint,end:{inherit:true}})],provenance()));
});

test('rejects inverted windows, duplicatepeople, wrong own source and relative unknown/all-day events',()=>{
 const base=complete();throwsSafely(()=>mergeParticipationChanges(base,[change({start:{at:'2026-10-23T20:00:00Z'},end:{at:'2026-10-23T19:30:00Z'}})],provenance()));throwsSafely(()=>mergeParticipationChanges(base,[change({start:{inherit:true},end:{inherit:true}}),change({start:{inherit:true},end:{inherit:true}})],provenance()));throwsSafely(()=>mergeParticipationChanges(base,[change({sourceUrl:'https://discord.com/channels/100/200/999',start:{inherit:true},end:{inherit:true}})],provenance()));
 for(const event of [{time_kind:'unknown'},{time_kind:'all_day',starts_on:'2026-10-23',ends_on:'2026-10-24'}]){const input=structuredClone(base);Object.assign(input.event,event);delete input.event.starts_at;delete input.event.ends_at;throwsSafely(()=>mergeParticipationChanges(input,[change({start:{anchor:'event_start',offsetMinutes:0},end:{inherit:true}})],provenance()));}
});

test('argument schema refuses unrelated snapshot fields, duplicate object representations and unsupported outer values',()=>{
 const valid={eventId,expectedUpdatedAt:revision,changes:[change({start:{anchor:'event_start',offsetMinutes:0},end:{inherit:true}})]};assert(validateArguments(valid,PARTICIPATION_PARAMETERS));
 for(const patch of [{...valid,event:{name:'overwrite'}},{...valid,changes:[]},{...valid,changes:Array.from({length:21},()=>change())},{...valid,changes:[change({end:{inherit:true,unknown:true}})]},{...valid,expectedUpdatedAt:123},{...valid,changes:[change({attendanceStatus:'organizing'})]}])assert.equal(validateArguments(patch,PARTICIPATION_PARAMETERS),false);
});

for(const kind of ['hidden-person','missing-building','invalid-person-row','changed-person-label','changed-event-url','changed-building-note','nontrackable-person','duplicate-target','revision'])test('complete snapshot fails closed for raw/authorized target discrepancy: '+kind,()=>{
 const raw=snapshot(),authorized=structuredClone(raw);
 if(kind==='hidden-person')authorized.event_people=[];
 if(kind==='missing-building')authorized.event_buildings.pop();
 if(kind==='invalid-person-row'){raw.event_people[0].attendance_status='organizing';authorized.event_people=[];}
 if(kind==='changed-person-label')authorized.event_people[0].label='filtered different caption';
 if(kind==='changed-event-url')authorized.events[0].url='https://example.test/altered';
 if(kind==='changed-building-note')authorized.event_buildings[0].location_notes='different';
 if(kind==='nontrackable-person')raw.people.find(p=>p.id===helper).is_trackable=false;
 if(kind==='duplicate-target')raw.events.push(structuredClone(raw.events[0]));
 if(kind==='revision')raw.events[0].updated_at='2026-10-22T20:00:00Z';
 throwsSafely(()=>complete(raw,authorized));
});

test('complete target snapshot ignores raw-only private fields without exposing them',()=>{
 const raw=snapshot(),authorized=structuredClone(raw);raw.events[0].privateCredential='NEVER_EXPOSE';raw.people[0].email='PRIVATE_EMAIL';const result=complete(raw,authorized);assert(!JSON.stringify(result).includes('NEVER_EXPOSE'));assert(!JSON.stringify(result).includes('PRIVATE_EMAIL'));assert.equal(result.event.url,opaqueUrl);assert.equal(result.event.starts_at,raw.events[0].starts_at);assert.equal(result.event.ends_at,raw.events[0].ends_at);
});

test('saved participant comparison rejects semantic drift and accepts equivalent timestamp strings',()=>{
 const person=complete(snapshot({withActor:true})).people.find(p=>p.person_id===actor);assert(sameSavedParticipation(person,{...person,starts_at:'2026-10-23T19:15:00Z'}));for(const patch of [{label:'human changed'},{attendance_status:'declined'},{source_url:sourceUrl},{ends_at:'2026-10-23T20:00:00Z'}])assert.equal(sameSavedParticipation({...person,...patch},person),false);
});

test('equivalent inherited full window is a no-op when expressed as exact timed event anchors',()=>{
 const data=snapshot({withActor:true}),own=data.event_people.find(row=>row.person_id===actor);own.starts_at=null;own.ends_at=null;const base=complete(data),before=structuredClone(base);const result=mergeParticipationChanges(base,[change({start:{anchor:'event_start',offsetMinutes:0},end:{anchor:'event_end',offsetMinutes:0}})],provenance());assert.deepEqual(result,{status:'pending',reason:'unchanged_participation'},'Equivalent attendance must not create action proof merely by spelling out inherited bounds');assert.deepEqual(base,before);
});

test('equivalent explicit full window is a no-op when changed to timed event inheritance',()=>{
 const data=snapshot({withActor:true}),own=data.event_people.find(row=>row.person_id===actor);own.starts_at=data.events[0].starts_at;own.ends_at=data.events[0].ends_at;const base=complete(data),before=structuredClone(base);const result=mergeParticipationChanges(base,[change({start:{inherit:true},end:{inherit:true}})],provenance());assert.deepEqual(result,{status:'pending',reason:'unchanged_participation'},'Removing redundant full-window overrides must not mint an applied receipt');assert.deepEqual(base,before);
});

test('relative endpoints retain database microseconds and exact zero-offset anchors',()=>{
 const data=snapshot({start:'2026-10-23T19:00:00.123456+00:00',end:'2026-10-23T21:00:00.654321+00:00'}),base=complete(data),result=mergeParticipationChanges(base,[change({start:{anchor:'event_start',offsetMinutes:0},end:{anchor:'event_start',offsetMinutes:60}})],provenance());assert.equal(result.status,'ready');const own=result.arguments.people.find(p=>p.person_id===actor);assert.equal(own.starts_at,'2026-10-23T19:00:00.123456+00:00');assert.equal(own.ends_at,'2026-10-23T20:00:00.123456Z');assert.equal(result.arguments.event.ends_at,'2026-10-23T21:00:00.654321+00:00');
});

for(const flag of [{partial:true},{possiblyTruncated:true},{coverage:{complete:false}},{sourceStatus:'partial'}])test('explicit partial authorized view never proves raw snapshot completeness: '+JSON.stringify(flag),()=>{
 const raw=snapshot();throwsSafely(()=>completeParticipationSnapshot(raw,{status:'ok',...structuredClone(raw),...flag},eventId,revision));
});

for(const direction of ['inherit to explicit','explicit to inherit'])test('all-day equivalent attendance window is pending across DST: '+direction,()=>{
 const data=snapshot({withActor:true}),event=data.events[0],own=data.event_people.find(row=>row.person_id===actor);Object.assign(event,{time_kind:'all_day',starts_at:null,ends_at:null,starts_on:'2026-11-01',ends_on:'2026-11-02'});own.starts_at=direction==='inherit to explicit'?null:'2026-11-01T00:00:00-04:00';own.ends_at=direction==='inherit to explicit'?null:'2026-11-02T00:00:00-05:00';const base=complete(data),before=structuredClone(base),result=mergeParticipationChanges(base,[change({start:direction==='inherit to explicit'?{at:'2026-11-01T00:00:00-04:00'}:{inherit:true},end:direction==='inherit to explicit'?{at:'2026-11-02T00:00:00-05:00'}:{inherit:true}})],provenance());assert.deepEqual(result,{status:'pending',reason:'unchanged_participation'},'Same actual25-hour local-calendar window is not a new attendance change');assert.deepEqual(base,before);
});
