import test from 'node:test';
import assert from 'node:assert/strict';
import {createChatAttendanceService,chatAttendanceOrigin,chatAttendanceReference} from '../server/map/chat-attendance.js';
import {createChatAttendanceTools,CHAT_ATTENDANCE_TOOLS} from '../tools/map/chat-attendance.js';
import {createMapEventService} from '../server/map/events.js';
import {createMapSourceAuthorizer} from '../server/map/source-access.js';
import {createMapPresenceService} from '../server/map/presence.js';
import {checkSchema} from '../server/automation/validation.js';

const at='2026-10-18T16:00:00.000Z',updated='2026-10-18T15:00:00.000Z',origin='https://flock.example';
const eid='33333333-3333-4333-8333-333333333333',pid='11111111-1111-4111-8111-111111111111',sid='22222222-2222-4222-8222-222222222222';
const otherPid='11111111-1111-4111-8111-111111111112',otherEid='33333333-3333-4333-8333-333333333334',otherSid='22222222-2222-4222-8222-222222222223';
const principal={id:'member',allowedSourceIds:[sid],googleAccess:true};
const calendarId='club@example.test',providerId='event12345',providerUrl=`https://calendar.google.com/calendar/event?eid=${Buffer.from(`${providerId} ${calendarId}`).toString('base64url')}`;
const userMessage='yuyang will be going to help with aws on tuesday';
const person=(patch={})=>({id:pid,display_name:'Yuyang Hu',avatar_url:'/assets/avatars/Yuyang.png',is_trackable:true,email:'PRIVATE_EMAIL',discord_user_id:'PRIVATE_PROVIDER_ID',...patch});
const event=(patch={})=>({id:eid,name:'AWS workshop',notes:'Keep original notes',kind:'scheduled_event',type_id:'event',status:'confirmed',time_kind:'timed',starts_at:'2026-10-20T18:00:00Z',ends_at:'2026-10-20T20:00:00Z',starts_on:null,ends_on:null,time_zone:'America/New_York',source_id:sid,source_url:providerUrl,source_record_id:providerId,url:'https://club.example/registration',reported_at:updated,created_at:updated,updated_at:updated,...patch});
const participation=(patch={})=>({event_id:eid,person_id:otherPid,attendance_status:'going',presence_basis:'planned',label:'Existing activity',starts_at:null,ends_at:null,source_id:sid,source_url:providerUrl,reported_at:updated,created_at:updated,updated_at:updated,...patch});
const snapshot=(patch={})=>({event_types:['study','meeting','event','social','other'].map((code,index)=>({code,name:code,description:'Synthetic type',icon_key:code,sort_order:index})),
  buildings:[{id:'bobst-library',name:'Bobst'},{id:'kimmel-center',name:'Kimmel'}],people:[person(),person({id:otherPid,display_name:'Alex Example'})],events:[event()],
  event_buildings:[{event_id:eid,building_id:'bobst-library',location_notes:'Room 101'},{event_id:eid,building_id:'kimmel-center',location_notes:'Keep this location'}],event_people:[participation()],...patch});
function fixture({data=snapshot(),message=userMessage,authorizeHook,writeHook,timeoutMs=5000,delayMs=0,publicOrigin=origin}={}) {
  let clock=at,current=structuredClone(data),access=true,reads=0,providerReads=0;
  const writes=[];
  const store={configured:true,read:async()=>{reads++;return structuredClone(current);},upsert:async args=>{
    if(writeHook)return writeHook(args);
    const old=current.events.find(row=>row.id===args.event.id);
    if(old.updated_at!==args.expectedUpdatedAt)return {status:'conflict'};
    writes.push(structuredClone({...args,signal:undefined}));
    const updatedAt=new Date(Date.parse(clock)+writes.length).toISOString();
    current={...current,events:current.events.map(row=>row.id===args.event.id?{...args.event,created_at:row.created_at,updated_at:updatedAt}:row),
      event_buildings:[...current.event_buildings.filter(row=>row.event_id!==args.event.id),...args.buildings.map(row=>({...row,event_id:args.event.id}))],
      event_people:[...current.event_people.filter(row=>row.event_id!==args.event.id),...args.people.map(row=>({...row,event_id:args.event.id}))]};
    return {status:'applied',event_id:args.event.id,updated_at:updatedAt};
  }};
  const calendarClient={configured:true,calendarId,readEvent:async()=>{
    providerReads++;if(delayMs)await new Promise(resolve=>setTimeout(resolve,delayMs));
    return access?{status:'ready',events:[{eventId:providerId,url:providerUrl}]}:{status:'forbidden',events:[]};
  }};
  const sourceAuthorize=createMapSourceAuthorizer({store,calendarClient,calendarSourceId:sid,publicOrigin,now:()=>new Date(clock)});
  const authorizeSource=async args=>authorizeHook?authorizeHook(args,sourceAuthorize):sourceAuthorize(args);
  const service=createMapEventService({store,authorizeSource,now:()=>new Date(clock),timeoutMs});
  const attendance=createChatAttendanceService({store,service,publicOrigin,now:()=>new Date(clock),timeoutMs});
  const tools=createChatAttendanceTools({service:attendance}),request=tools.createRequest({userMessage:message,principal});
  const execute=(name,args,patch={})=>request.execute({name,arguments:args,principal,...patch});
  return {store,service,attendance,tools,request,writes,authorizeSource,sourceAuthorize,
    get data(){return current;},get reads(){return reads;},get providerReads(){return providerReads;},mutate:fn=>{current=fn(current);},clock:value=>{clock=value;},revoke:()=>{access=false;},execute,
    find:(args={},patch={})=>execute('find_map_attendance_targets',{personName:'yuyang',eventQuery:'aws',...args},patch),
    set:(args={},patch={})=>execute('set_map_attendance',{eventId:eid,personId:pid,expectedUpdatedAt:updated,...args},patch),
  };
}

test('screenshot declaration persists going with distinct server chat provenance and actual event/current avatar projections',async()=>{
  const f=fixture(),before=structuredClone(f.data),found=await f.find();
  assert.equal(found.status,'ready');assert.equal(found.attendanceTargets.selection,'unique');
  assert.deepEqual(found.attendanceTargets.people,[{id:pid,display_name:'Yuyang Hu'}]);assert.equal(found.attendanceTargets.events[0].id,eid);
  assert(!JSON.stringify(found).includes('PRIVATE'));assert(!JSON.stringify(found).includes(providerId));
  const saved=await f.set();assert.equal(saved.status,'ready');assert.equal(saved.sourceStatus,'applied');
  assert.deepEqual(saved.attendanceWrite,{outcome:'applied',eventId:eid,personId:pid,updatedAt:f.data.events[0].updated_at});
  const stored=f.data.event_people.find(row=>row.person_id===pid);
  assert.equal(stored.attendance_status,'going');assert.equal(stored.presence_basis,'planned');assert.equal(stored.reported_at,at);assert.equal(stored.label,'');
  assert.equal(stored.source_id,sid);assert.equal(stored.starts_at,null);assert.equal(stored.ends_at,null);
  const reference=chatAttendanceReference(stored.source_url,origin);assert.equal(reference.eventId,eid);assert.equal(reference.personId,pid);
  assert.match(reference.requestId,/^[0-9a-f-]{36}$/);assert.notEqual(stored.source_url,providerUrl);
  assert.deepEqual({...f.data.events[0],updated_at:before.events[0].updated_at},before.events[0]);
  assert.deepEqual(f.data.event_buildings,before.event_buildings);
  const stripTimestamps=row=>Object.fromEntries(Object.entries(row).filter(([key])=>!['created_at','updated_at'].includes(key)));
  assert.deepEqual(stripTimestamps(f.data.event_people.find(row=>row.person_id===otherPid)),stripTimestamps(before.event_people[0]));
  assert.deepEqual(await f.set(),saved);assert.equal(f.writes.length,1,'repeated receipt never repeats the write');
  const presence=createMapPresenceService({store:f.store,authorizeSource:f.authorizeSource,production:true,now:()=>new Date(at)});
  const future=await presence.read({principal});assert.equal(future.status,'ok');
  for(const building of future.buildings) {assert.equal(building.events.length,1);assert(building.events[0].attendees.some(row=>row.id===pid));assert.equal(building.people.length,0);}
  f.clock('2026-10-20T18:30:00.000Z');
  const active=await createMapPresenceService({store:f.store,authorizeSource:f.authorizeSource,production:true,now:()=>new Date('2026-10-20T18:30:00.000Z')}).read({principal});
  for(const building of active.buildings)assert(building.people.some(row=>row.id===pid));
  f.revoke();const revoked=await presence.read({principal});for(const building of revoked.buildings){assert.deepEqual(building.events,[]);assert.deepEqual(building.people,[]);}
});

test('existing attendance keeps its faithful label, explicit participant window and other participants',async()=>{
  const prior=participation({person_id:pid,attendance_status:'tentative',presence_basis:'reported',label:'Helping with AWS setup',starts_at:'2026-10-20T18:15:00Z',ends_at:'2026-10-20T19:00:00Z'});
  const f=fixture({data:snapshot({event_people:[participation(),prior]})});await f.find();assert.equal((await f.set()).status,'ready');
  const saved=f.data.event_people.find(row=>row.person_id===pid);for(const key of ['label','starts_at','ends_at'])assert.equal(saved[key],prior[key]);
  assert.equal(saved.attendance_status,'going');assert.equal(saved.presence_basis,'planned');assert.equal(f.data.event_people.length,2);
});

test('full display names and unique first-name tokens match case-insensitively without leaking provider identities',async()=>{
  for(const [message,personName] of [['YUYANG HU will attend AWS on Tuesday','yuyang hu'],['Yuyang is going to AWS on Tuesday','YUYANG']]) {
    const f=fixture({message}),found=await f.find({personName});assert.equal(found.attendanceTargets.selection,'unique');assert.equal((await f.set()).status,'ready');
  }
  const f=fixture({data:snapshot({people:[person(),person({id:otherPid,display_name:'Yuyang Other'})]})});
  assert.equal((await f.find()).attendanceTargets.selection,'ambiguous');assert.equal((await f.set()).reason,'attendance_targets_not_resolved');assert.equal(f.writes.length,0);
});

test('duplicate exact roster names, absent/untrackable people and unsupported partial names cannot select an identity',async()=>{
  const duplicate=fixture({message:'Yuyang Hu will attend AWS on Tuesday',data:snapshot({people:[person(),person({id:otherPid,display_name:'Yuyang Hu'})]})});
  assert.equal((await duplicate.find({personName:'Yuyang Hu'})).attendanceTargets.selection,'ambiguous');assert.equal((await duplicate.set()).status,'forbidden');
  for(const patch of [{people:[person({is_trackable:false})]},{people:[person({display_name:'YuyangSomething Hu'})]},{people:[]}]) {
    const f=fixture({data:snapshot(patch)});assert.equal((await f.find()).attendanceTargets.selection,'not_found');assert.equal((await f.set()).status,'forbidden');
  }
});

test('multiple events remain ambiguous and the model cannot invent narrowing event words or a date',async()=>{
  const f=fixture({data:snapshot({events:[event(),event({id:otherEid,name:'AWS social'})]})});
  assert.equal((await f.find()).attendanceTargets.selection,'ambiguous');assert.equal((await f.set()).status,'forbidden');
  assert.equal((await f.find({eventQuery:'AWS workshop'})).reason,'use_current_declaration');
  assert.equal((await f.find({date:'2026-10-21'})).reason,'date_not_in_current_declaration');assert.equal(f.writes.length,0);
});

test('AWS Hackday resolves the actual-style AWS Hack Day event and saves going with all original details preserved',async()=>{
  const f=fixture({message:'yuyang will be going to help with AWS Hackday on tuesday',data:snapshot({events:[event({name:'AWS Hack Day'})]})});
  const found=await f.find({eventQuery:'AWS Hackday'});assert.equal(found.status,'ready');assert.equal(found.attendanceTargets.selection,'unique');
  assert.equal(found.attendanceTargets.events[0].name,'AWS Hack Day');assert.equal((await f.set()).attendanceWrite.outcome,'applied');
  assert.equal(f.data.events[0].name,'AWS Hack Day');assert.equal(f.data.events[0].notes,'Keep original notes');
  assert.equal(f.data.event_people.find(row=>row.person_id===pid).attendance_status,'going');assert.equal(f.data.event_people.length,2);
});

test('compound event matching normalizes casing, spacing, punctuation and NFKC in either direction at every phrase-binding site',async()=>{
  for(const [stated,query,stored] of [
    ['AWS Hack Day','aws hackday','AWSHackday'],['AWSHackday','AWS Hack Day','AWS Hack Day'],
    ['aws-hackday','AWS Hack Day','AWS: Hack-Day'],['AWS Hackday','ＡＷＳ Ｈａｃｋ Ｄａｙ','AWS-Hack-Day'],
    ['ＡＷＳ Ｈａｃｋｄａｙ','AWS Hack Day','ＡＷＳ Ｈａｃｋ Ｄａｙ'],
  ]) {
    const f=fixture({message:`Yuyang will attend ${stated} on Tuesday`,data:snapshot({events:[event({name:stored})]})});
    const found=await f.find({eventQuery:query});assert.equal(found.attendanceTargets.selection,'unique',`${stated} / ${query} / ${stored}`);
    assert.equal((await f.set()).status,'ready');assert.equal(f.data.events[0].name,stored);assert.equal(f.writes.length,1);
  }
});

test('partial or noncontiguous title words are suggestions rather than direct matches, without an automatic write',async()=>{
  for(const [query,stored] of [['AWS','PAWS Hack Day'],['Hack','AWS Hackathon'],['AWS Hackday','AWS Hack Daylong'],
    ['AWS Hackday','AWS Club Hack Day'],['AWS Hackday','SuperAWS Hack Day']]) {
    const f=fixture({message:`Yuyang will attend ${query} on Tuesday`,data:snapshot({events:[event({name:stored})]})});
    const result=await f.find({eventQuery:query});assert.equal(result.attendanceTargets.selection,['AWS','Hack'].includes(query)?'ambiguous':'candidates',`${query} / ${stored}`);
    assert.equal(result.attendanceTargets.events[0].name,stored);assert.equal(f.writes.length,0,'a ranked suggestion alone never writes');
    assert.equal((await f.set({eventId:otherEid})).status,'forbidden','unreturned candidates never have receipts');
  }
  const f=fixture({message:'Yuyang will attend AWS Hackday on Tuesday',data:snapshot({events:[event({name:'AWS Hack Day'})]})});
  for(const eventQuery of ['---','!!!','AWS workshop','AWS Hackday kickoff','Hack'])assert.equal((await f.find({eventQuery})).reason,'use_current_declaration',eventQuery);
  assert.equal((await f.set()).status,'forbidden');assert.equal(f.writes.length,0);
});

test('typos return ranked real candidates and an explicitly selected returned event can save attendance',async()=>{
  const f=fixture({message:'Yuyang will attend AWS hackdy on Tuesday',data:snapshot({events:[event({name:'Cooking social'}),event({id:otherEid,name:'AWS Hack Day',source_record_id:'aws-occurrence'})],
    event_buildings:[{event_id:eid,building_id:'bobst-library',location_notes:'Social room'},{event_id:otherEid,building_id:'kimmel-center',location_notes:'AWS room'}]})});
  const result=await f.find({eventQuery:'AWS hackdy'}),targets=result.attendanceTargets;
  assert.equal(targets.selection,'candidates');assert.equal(targets.complete,true);assert.equal(targets.truncated,false);assert.equal(targets.totalEvents,2);
  assert.equal(targets.events[0].id,otherEid);assert.equal(targets.events[0].name,'AWS Hack Day');assert.equal(targets.events[0].location_notes,'AWS room');
  assert.equal(f.writes.length,0);assert(!JSON.stringify(targets).includes(providerUrl));assert(!JSON.stringify(targets).includes(providerId));
  assert.equal((await f.set({eventId:otherEid})).attendanceWrite.outcome,'applied');
  assert.equal(f.data.event_people.find(row=>row.event_id===otherEid&&row.person_id===pid).attendance_status,'going');
});

test('semantic aliases retain the whole eligible date-filtered list regardless of fuzzy score or storage order',async()=>{
  const events=[event({name:'AWS Hack Day',notes:'Cloud learning '.repeat(100)}),event({id:otherEid,name:'Cooking social',source_record_id:'social-occurrence'}),
    event({id:'33333333-3333-4333-8333-333333333335',name:'Different day',starts_at:'2026-10-21T18:00:00Z',ends_at:'2026-10-21T20:00:00Z'})];
  const options={message:'Yuyang will attend the cloud gathering on Tuesday',data:snapshot({events,event_buildings:[{event_id:eid,building_id:'bobst-library',location_notes:'Room '.repeat(100)}]})};
  const f=fixture(options),result=await f.find({eventQuery:'cloud gathering'});
  assert.equal(result.attendanceTargets.selection,'candidates');assert.equal(result.attendanceTargets.totalEvents,2);
  assert.deepEqual(new Set(result.attendanceTargets.events.map(row=>row.id)),new Set([eid,otherEid]));
  const aws=result.attendanceTargets.events.find(row=>row.id===eid);assert.equal(aws.notes.length,500);assert.equal(aws.location_notes.length,200);
  const reverse=fixture({...options,data:{...options.data,events:[...events].reverse()}});
  assert.deepEqual((await reverse.find({eventQuery:'cloud gathering'})).attendanceTargets.events.map(row=>row.id),result.attendanceTargets.events.map(row=>row.id));
  assert.equal(f.writes.length,0);assert.equal((await f.set()).status,'ready','selected listed semantic candidate does not reapply the unsuccessful literal matcher');
});

test('more than twenty fallback candidates are explicitly incomplete and issue no receipts; twenty is complete',async()=>{
  const events=Array.from({length:21},(_,index)=>event({id:`44444444-4444-4444-8444-${String(index).padStart(12,'0')}`,name:`Session ${index}`,source_record_id:`candidate-${index}`}));
  const options={message:'Yuyang will attend cloud gathering on Tuesday',data:snapshot({events,event_buildings:events.map(row=>({event_id:row.id,building_id:'bobst-library',location_notes:''})),event_people:[]})};
  const f=fixture(options),targets=(await f.find({eventQuery:'cloud gathering'})).attendanceTargets;
  assert.equal(targets.selection,'candidates');assert.equal(targets.events.length,20);assert.equal(targets.totalEvents,21);assert.equal(targets.complete,false);assert.equal(targets.truncated,true);
  assert.equal((await f.set({eventId:targets.events[0].id})).reason,'attendance_targets_not_resolved');assert.equal(f.writes.length,0);
  const complete=fixture({...options,data:{...options.data,events:events.slice(0,20),event_buildings:options.data.event_buildings.slice(0,20)}});
  const list=(await complete.find({eventQuery:'cloud gathering'})).attendanceTargets;assert.equal(list.complete,true);assert.equal(list.totalEvents,20);assert.equal(list.truncated,false);
  assert.equal((await complete.set({eventId:list.events[0].id})).status,'ready');
  const direct=fixture({...options,message:'Yuyang will attend Session 20 on Tuesday'});
  const exact=(await direct.find({eventQuery:'Session 20'})).attendanceTargets;assert.equal(exact.selection,'unique');assert.equal(exact.totalEvents,1);assert.equal(exact.complete,true);
});

test('candidate receipts bind exact returned title, revision, source identity, date and current access',async()=>{
  const options={message:'Yuyang will attend cloud gathering on Tuesday',data:snapshot({events:[event({name:'AWS Hack Day'})]})};
  for(const [patch,status,reason] of [
    [{name:'AWS-Hackday'},'forbidden','event_no_longer_matches'],
    [{updated_at:'2026-10-18T16:01:00.000Z'},'conflict','reread_attendance_targets'],
    [{source_record_id:'another-provider-occurrence'},'forbidden','event_source_changed'],
    [{source_id:otherSid},'forbidden','event_source_changed'],
    [{starts_at:'2026-10-21T18:00:00Z',ends_at:'2026-10-21T20:00:00Z'},'forbidden','event_no_longer_matches'],
  ]) {
    const f=fixture(options);assert.equal((await f.find({eventQuery:'cloud gathering'})).attendanceTargets.selection,'candidates');
    f.mutate(data=>({...data,events:[{...data.events[0],...patch}]}));const result=await f.set();assert.equal(result.status,status);assert.equal(result.reason,reason);assert.equal(f.writes.length,0);
  }
  const f=fixture(options);await f.find({eventQuery:'cloud gathering'});f.revoke();assert.equal((await f.set()).status,'forbidden');assert.equal(f.writes.length,0);
});

test('a later ambiguous direct lookup withdraws prior candidate receipts for the same roster target',async()=>{
  const f=fixture({message:'Yuyang will attend AWS gathering on Tuesday',data:snapshot({events:[event({name:'Cloud day'}),event({id:otherEid,name:'Cloud social',source_record_id:'cloud-social'})]})});
  assert.equal((await f.find({eventQuery:'AWS gathering'})).attendanceTargets.selection,'candidates');
  f.mutate(data=>({...data,events:data.events.map(row=>({...row,name:'AWS gathering'}))}));
  assert.equal((await f.find({eventQuery:'AWS gathering'})).attendanceTargets.selection,'ambiguous');
  assert.equal((await f.set()).reason,'attendance_targets_not_resolved');assert.equal(f.writes.length,0);
});

test('multiple explicit description matches withhold all receipts for the workshop despite ranked candidate order',async()=>{
  for(const phrase of ['workshop','the workshop','a workshop','an workshop']) {
    const f=fixture({message:`Yuyang will attend ${phrase} on Tuesday`,data:snapshot({events:[event({name:'Cloud Lab',notes:'Cloud workshop'}),event({id:otherEid,name:'AI Lab',notes:'AI workshop',source_record_id:'ai-lab'})]})});
    const targets=(await f.find({eventQuery:phrase})).attendanceTargets;
    assert.equal(targets.selection,'ambiguous',phrase);assert.equal(targets.complete,true);assert.equal(targets.totalEvents,2);assert.equal(targets.events.length,2);
    assert.deepEqual(new Set(targets.events.map(row=>row.name)),new Set(['Cloud Lab','AI Lab']));
    for(const eventId of [eid,otherEid])assert.equal((await f.set({eventId})).reason,'attendance_targets_not_resolved');
    assert.equal(f.writes.length,0,'neither rank nor complete list may resolve an explicitly ambiguous reference');
    assert.equal((await f.find({eventQuery:'Cloud workshop'})).reason,'use_current_declaration','model cannot invent a more specific phrase');
  }
});

test('context ambiguity includes authorized full descriptions and location notes beyond display truncation',async()=>{
  const f=fixture({message:'Yuyang will attend the workshop on Tuesday',data:snapshot({
    events:[event({name:'Cloud Lab',notes:'x '.repeat(300)+'Cloud workshop'}),event({id:otherEid,name:'AI Lab',notes:'AI instruction',source_record_id:'ai-lab'})],
    event_buildings:[{event_id:eid,building_id:'bobst-library',location_notes:'Cloud room'},
      {event_id:otherEid,building_id:'kimmel-center',location_notes:'x '.repeat(200)+'AI workshop'}]})});
  const targets=(await f.find({eventQuery:'the workshop'})).attendanceTargets;assert.equal(targets.selection,'ambiguous');
  assert.equal(targets.events.find(row=>row.id===eid).notes.length,500);assert.equal(targets.events.find(row=>row.id===otherEid).location_notes.length,200);
  assert.equal((await f.set()).reason,'attendance_targets_not_resolved');assert.equal(f.writes.length,0);
});

test('zero or one contextual match retains complete candidates; another date or unauthorized context cannot introduce ambiguity',async()=>{
  for(const otherPatch of [{notes:'AI instruction'},{notes:'AI workshop',starts_at:'2026-10-21T18:00:00Z',ends_at:'2026-10-21T20:00:00Z'},
    {notes:'AI workshop',source_id:otherSid}]) {
    const f=fixture({message:'Yuyang will attend the workshop on Tuesday',data:snapshot({events:[event({name:'Cloud Lab',notes:'Cloud workshop'}),event({id:otherEid,name:'AI Lab',source_record_id:'ai-lab',...otherPatch})]})});
    const targets=(await f.find({eventQuery:'the workshop'})).attendanceTargets;assert.equal(targets.selection,'candidates');assert.equal(targets.complete,true);
    assert.equal((await f.set()).status,'ready');assert.equal(f.writes.length,1);
  }
  const typo=fixture({message:'Yuyang will attend AWS hackdy on Tuesday',data:snapshot({events:[event({name:'Cloud Lab',notes:'Cloud workshop'}),event({id:otherEid,name:'AI Lab',notes:'AI workshop',source_record_id:'ai-lab'})]})});
  assert.equal((await typo.find({eventQuery:'AWS hackdy'})).attendanceTargets.selection,'candidates');assert.equal((await typo.set()).status,'ready');
});

test('unsupported short names retain suggestions but cannot guess PAWS means AWS for either returned event',async()=>{
  for(const query of ['PAWS','paws']) {
    const f=fixture({message:`Yuyang will attend ${query} on Tuesday`,data:snapshot({events:[event({name:'AWS Hack Day'}),event({id:otherEid,name:'AI Lab',source_record_id:'ai-lab'})]})});
    const targets=(await f.find({eventQuery:query})).attendanceTargets;
    assert.equal(targets.selection,'ambiguous');assert.equal(targets.complete,true);assert.equal(targets.totalEvents,2);assert.equal(targets.events.length,2);
    for(const eventId of [eid,otherEid])assert.equal((await f.set({eventId})).reason,'attendance_targets_not_resolved');
    assert.equal(f.writes.length,0);
  }
});

test('short-name context must be authorized and on the declared date; a supported short alias can retain candidates',async()=>{
  for(const patch of [{source_id:otherSid},{starts_at:'2026-10-21T18:00:00Z',ends_at:'2026-10-21T20:00:00Z'}]) {
    const f=fixture({message:'Yuyang will attend PAWS on Tuesday',data:snapshot({events:[event({name:'AWS Hack Day'}),
      event({id:otherEid,name:'Club seminar',notes:'PAWS is the seminar alias',source_record_id:'seminar',...patch})]})});
    const targets=(await f.find({eventQuery:'PAWS'})).attendanceTargets;assert.equal(targets.selection,'ambiguous');assert.equal(targets.events.length,1);
    assert.equal((await f.set()).reason,'attendance_targets_not_resolved');assert.equal(f.writes.length,0);
  }
  const supported=fixture({message:'Yuyang will attend tech on Tuesday',data:snapshot({events:[event({name:'Cloud Lab',notes:'Tech training workshop'})]})});
  assert.equal((await supported.find({eventQuery:'tech'})).attendanceTargets.selection,'candidates');assert.equal((await supported.set()).status,'ready');
  const direct=fixture({message:'Yuyang will attend AWS on Tuesday',data:snapshot({events:[event({name:'AWS Hack Day'})]})});
  assert.equal((await direct.find({eventQuery:'AWS'})).attendanceTargets.selection,'unique');assert.equal((await direct.set()).status,'ready');
  for(const query of ['AWS hackdy','AmazonWebServiceshackathon']) {
    const f=fixture({message:`Yuyang will attend ${query} on Tuesday`,data:snapshot({events:[event({name:'AWS Hack Day'})]})});
    assert.equal((await f.find({eventQuery:query})).attendanceTargets.selection,'candidates');assert.equal((await f.set()).status,'ready');
  }
});

test('format-equivalent titles remain ambiguous and explicit dates still select only their matching event',async()=>{
  const message='Yuyang will attend AWS Hackday on Tuesday';
  const f=fixture({message,data:snapshot({events:[event({name:'AWS Hack Day'}),event({id:otherEid,name:'AWS-Hackday',source_record_id:'second-instance'})]})});
  const ambiguous=await f.find({eventQuery:'AWS Hack Day'});assert.equal(ambiguous.attendanceTargets.selection,'ambiguous');assert.equal(ambiguous.attendanceTargets.events.length,2);
  assert.equal((await f.set()).status,'forbidden');assert.equal(f.writes.length,0);
  const dated=fixture({message,data:snapshot({events:[event({name:'AWS Hack Day'}),event({id:otherEid,name:'AWS-Hackday',source_record_id:'wednesday-instance',starts_at:'2026-10-21T18:00:00Z',ends_at:'2026-10-21T20:00:00Z'})]})});
  const unique=await dated.find({eventQuery:'AWS Hack Day',date:'2026-10-20'});assert.equal(unique.attendanceTargets.selection,'unique');assert.equal(unique.attendanceTargets.events[0].id,eid);
  assert.equal((await dated.set()).status,'ready');assert.equal((await dated.find({eventQuery:'AWS Hack Day',date:'2026-10-21'})).reason,'date_not_in_current_declaration');
});

test('set rechecks normalized event words while retaining date and optimistic-concurrency fences',async()=>{
  const options={message:'Yuyang will attend AWS Hackday on Tuesday',data:snapshot({events:[event({name:'AWS Hack Day'})]})};
  const equivalent=fixture(options);await equivalent.find({eventQuery:'AWS Hackday'});
  equivalent.mutate(data=>({...data,events:[{...data.events[0],name:'AWS-Hackday'}]}));
  assert.equal((await equivalent.set()).status,'ready');assert.equal(equivalent.data.events[0].name,'AWS-Hackday','fresh event spelling is preserved');
  for(const patch of [{name:'AWS Hackathon'},{starts_at:'2026-10-21T18:00:00Z',ends_at:'2026-10-21T20:00:00Z'}]) {
    const f=fixture(options);await f.find({eventQuery:'AWS Hackday'});f.mutate(data=>({...data,events:[{...data.events[0],...patch}]}));
    assert.equal((await f.set()).reason,'event_no_longer_matches');assert.equal(f.writes.length,0);
  }
  const stale=fixture(options);await stale.find({eventQuery:'AWS Hackday'});
  stale.mutate(data=>({...data,events:[{...data.events[0],name:'AWS-Hackday',updated_at:'2026-10-18T16:01:00.000Z'}]}));
  assert.equal((await stale.set()).status,'conflict');assert.equal(stale.writes.length,0);
});

test('stated Tuesday is enforced even when the model omits date; explicit ISO, today and tomorrow are supported',async()=>{
  const f=fixture({data:snapshot({events:[event(),event({id:otherEid,starts_at:'2026-10-21T18:00:00Z',ends_at:'2026-10-21T20:00:00Z'})]})});
  const found=await f.find();assert.equal(found.attendanceTargets.selection,'unique');assert.equal(found.attendanceTargets.events[0].id,eid);
  for(const [message,date] of [['Yuyang will attend AWS on 2026-10-20','2026-10-20'],['Yuyang will attend AWS today','2026-10-18'],['Yuyang will attend AWS tomorrow','2026-10-19']]) {
    const x=fixture({message,data:snapshot({events:[event({starts_at:`${date}T18:00:00Z`,ends_at:`${date}T20:00:00Z`})]})});
    assert.equal((await x.find({date})).attendanceTargets.selection,'unique');assert.equal((await x.set()).status,'ready');
  }
  const ambiguous=fixture({message:'Yuyang will attend AWS on Tuesday or Wednesday'});assert.equal((await ambiguous.find()).reason,'ambiguous_attendance_date');
  const fabricated=fixture({message:'Yuyang will attend AWS'});assert.equal((await fabricated.find({date:'2026-10-20'})).reason,'date_not_in_current_declaration');
});

test('expired, cancelled, unknown-timing and non-scheduled events are excluded; multi-day all-day events include the stated day',async()=>{
  for(const patch of [{starts_at:'2026-10-13T18:00:00Z',ends_at:'2026-10-13T20:00:00Z'},{status:'cancelled'},{status:'superseded'},{kind:'personal_plan'},
    {time_kind:'unknown',starts_at:null,ends_at:null},{updated_at:undefined}]) {
    const f=fixture({data:snapshot({events:[event(patch)]})});const result=await f.find();assert.equal(result.attendanceTargets.events.length,0);assert.equal((await f.set()).status,'forbidden');
  }
  const f=fixture({data:snapshot({events:[event({time_kind:'all_day',starts_at:null,ends_at:null,starts_on:'2026-10-19',ends_on:'2026-10-22'})]})});
  assert.equal((await f.find()).attendanceTargets.selection,'unique');assert.equal((await f.set()).status,'ready');
});

test('questions, negation, hypotheticals, source quotations, organizer-only and first-person claims grant no attendance authority',async()=>{
  for(const message of ['Will Yuyang attend AWS on Tuesday?','Yuyang will not attend AWS on Tuesday','Yuyang will be going to AWS on Tuesday?',
    'If Yuyang will be going to AWS on Tuesday, show him','Maybe Yuyang will attend AWS on Tuesday','Yuyang might attend AWS on Tuesday',
    'Yuyang will organize AWS on Tuesday','Yuyang will help with AWS on Tuesday','I will attend AWS on Tuesday','He will attend AWS on Tuesday',
    'Discord says Yuyang will attend AWS on Tuesday','"Yuyang will attend AWS on Tuesday"','> Yuyang will attend AWS on Tuesday','History: Yuyang will attend AWS on Tuesday',
    'Yuyang will not be at AWS; Alex will attend AWS on Tuesday']) {
    const f=fixture({message});assert.equal((await f.find()).status,'forbidden',message);assert.equal((await f.set()).status,'forbidden',message);assert.equal(f.writes.length,0);
  }
});

test('configured attendance catalogue stays visible for unrelated messages while declaration execution gates remain',async()=>{
  for(const message of ['The bug reports tool is broken, please fix it','Will Yuyang attend AWS on Tuesday?',
    '"Yuyang will attend AWS on Tuesday"','```\nYuyang will attend AWS on Tuesday\n```','Yuyang will not attend AWS on Tuesday','I will attend AWS on Tuesday']) {
    const f=fixture({message});assert.deepEqual(f.request.tools,CHAT_ATTENDANCE_TOOLS,message);assert.equal((await f.set()).status,'forbidden');
  }
  assert.equal(fixture().request.tools.length,2);
  const notConfigured=fixture({publicOrigin:''});assert.deepEqual(notConfigured.request.tools,[]);
  assert.equal(notConfigured.tools.tools.length,2,'top-level inventory remains stable while stateless writes are denied');
});

test('current declared subject and event phrase must match; retrieved text, history and stateless tools never carry receipts',async()=>{
  const f=fixture({message:'Alex will attend AWS on Tuesday; Yuyang will organize AWS on Tuesday'});
  assert.equal((await f.find()).reason,'person_attendance_not_declared');assert.equal((await f.set()).status,'forbidden');
  const empty=fixture({message:''});empty.request.observe('find_map_attendance_targets',{status:'ready',attendanceTargets:{people:[person()],events:[event()],selection:'unique'}});
  assert.equal((await empty.find()).status,'forbidden');assert.equal((await empty.set()).status,'forbidden');
  assert.equal((await empty.tools.execute({name:'set_map_attendance',arguments:{eventId:eid,personId:pid,expectedUpdatedAt:updated},principal})).status,'forbidden');
  const other=empty.tools.createRequest({userMessage,principal});assert.equal((await other.execute({name:'set_map_attendance',arguments:{eventId:eid,personId:pid,expectedUpdatedAt:updated},principal})).reason,'attendance_targets_not_resolved');
});

test('quoted multiline declarations never authorize a different subject alongside a real declaration',async()=>{
  for(const quoted of ['```\nyuyang will attend aws on tuesday\n```','"\nyuyang will attend aws on tuesday\n"',"'\nyuyang will attend aws on tuesday\n'"]) {
    const f=fixture({message:`${quoted}\nAlex will attend aws on tuesday`});assert.equal((await f.find()).reason,'person_attendance_not_declared');assert.equal((await f.set()).status,'forbidden');assert.equal(f.writes.length,0);
  }
});

test('server request time anchors relative days and declaration timestamps without a model-supplied timestamp',async()=>{
  const f=fixture({message:'Yuyang will attend AWS tomorrow'});
  const request=f.tools.createRequest({userMessage:'Yuyang will attend AWS tomorrow',principal,timeContext:{now:'2026-10-19T12:00:00.000Z',timeZone:'America/New_York'}});
  const found=await request.execute({name:'find_map_attendance_targets',arguments:{personName:'Yuyang',eventQuery:'AWS',date:'2026-10-20'},principal});
  assert.equal(found.attendanceTargets.selection,'unique');
  const saved=await request.execute({name:'set_map_attendance',arguments:{eventId:eid,personId:pid,expectedUpdatedAt:updated},principal});assert.equal(saved.status,'ready');
  assert.equal(f.data.event_people.find(row=>row.person_id===pid).reported_at,'2026-10-19T12:00:00.000Z');
});

test('event source access, exact person binding and source rechecks stay mandatory at selection and write',async()=>{
  const denied=fixture();denied.revoke();assert.equal((await denied.find()).attendanceTargets.events.length,0);assert.equal((await denied.set()).status,'forbidden');
  const revoked=fixture();await revoked.find();revoked.revoke();assert.equal((await revoked.set()).status,'forbidden');assert.equal(revoked.writes.length,0);
  const changed=fixture();await changed.find();changed.mutate(data=>({...data,events:[event({source_id:otherSid})]}));assert.equal((await changed.set()).status,'forbidden');assert.equal(changed.writes.length,0);
  const otherPerson=fixture();await otherPerson.find();assert.equal((await otherPerson.set({personId:otherPid})).status,'forbidden');
  assert.equal((await otherPerson.set({}, {principal:{...principal,id:'different'}})).reason,'request_principal_changed');
  const ambiguous=fixture();await ambiguous.find();ambiguous.mutate(data=>({...data,people:[...data.people,person({id:'11111111-1111-4111-8111-111111111113',display_name:'Yuyang Other'})]}));
  assert.equal((await ambiguous.set()).reason,'roster_ambiguous');assert.equal(ambiguous.writes.length,0);
});

test('partial authorized snapshots cannot remove a hidden participant; generic upsert rechecks provenance immediately before commit',async()=>{
  const hidden=fixture({data:snapshot({event_people:[participation({source_id:otherSid})]})});await hidden.find();
  assert.equal((await hidden.set()).reason,'incomplete_event_snapshot');assert.equal(hidden.writes.length,0);
  let markerChecks=0;
  const revoked=fixture({authorizeHook:async(args,original)=>args.sourceUrl.startsWith(origin)?++markerChecks<2:original(args)});
  await revoked.find();assert.equal((await revoked.set()).status,'forbidden');assert.equal(markerChecks,2);assert.equal(revoked.writes.length,0);
});

test('optimistic conflicts require fresh targets and preserve concurrent human edits and participants',async()=>{
  const f=fixture();await f.find();
  const newer='2026-10-18T16:01:00.000Z';f.mutate(data=>({...data,events:[{...data.events[0],notes:'Human edited notes',updated_at:newer}],event_people:[{...data.event_people[0],label:'Human edited activity'}]}));
  assert.equal((await f.set()).status,'conflict');assert.equal(f.writes.length,0);
  assert.equal((await f.find()).attendanceTargets.events[0].updated_at,newer);assert.equal((await f.set({expectedUpdatedAt:newer})).status,'ready');
  assert.equal(f.data.events[0].notes,'Human edited notes');assert.equal(f.data.event_people.find(row=>row.person_id===otherPid).label,'Human edited activity');
  const cas=fixture({writeHook:async()=>({status:'conflict'})});await cas.find();assert.equal((await cas.set()).status,'conflict');assert.equal(cas.writes.length,0);
});

test('failed persistence is not acknowledged; aborted, malformed and missing configuration requests fail closed',async()=>{
  for(const writeHook of [async()=>({status:'invalid'}),async()=>{throw Error('PRIVATE_FAILURE');}]) {
    const f=fixture({writeHook});await f.find();const result=await f.set();assert.notEqual(result.status,'ready');assert.equal(result.attendanceWrite,undefined);assert(!JSON.stringify(result).includes('PRIVATE'));
  }
  const f=fixture();await f.find();const controller=new AbortController();controller.abort();assert.equal((await f.set({}, {signal:controller.signal})).status,'aborted');assert.equal(f.writes.length,0);
  assert.equal((await f.find({personName:'yuyang',extra:true})).status,'invalid_request');assert.equal((await f.set({expectedUpdatedAt:'bad'})).status,'invalid_request');
  for(const publicOrigin of [undefined,'http://flock.example','https://flock.example/path','https://user@flock.example','https://flock.example/?extra=1']) {
    const x=fixture({publicOrigin:publicOrigin??''});assert.equal(x.tools.configured,false);assert.equal((await x.find()).status,'not_configured');assert.equal(x.writes.length,0);
  }
  for(const tool of CHAT_ATTENDANCE_TOOLS)assert.equal(checkSchema(tool.parameters),true);
});

test('canonical app provenance rejects wrong origin, person, event, source, extra fields and recursive references',async()=>{
  const f=fixture();await f.find();await f.set();const sourceUrl=f.data.event_people.find(row=>row.person_id===pid).source_url;
  assert.equal(await f.sourceAuthorize({principal,sourceId:sid,sourceUrl,eventId:eid,personId:pid}),true);
  for(const candidate of [sourceUrl.replace(origin,'https://evil.example'),sourceUrl.replace(`event=${eid}`,`event=${otherEid}`),sourceUrl.replace(`attendance-${pid}`,`attendance-44444444-4444-4444-8444-444444444444`),
    sourceUrl.replace('#attendance','&extra=1#attendance'),sourceUrl.replace('/?event','/other?event'),sourceUrl+'-extra',sourceUrl.replace('/?event','/?event=x&event'),sourceUrl.replace('https://','http://'),sourceUrl.replace(origin,'https://user@flock.example')]) {
    assert.equal(await f.sourceAuthorize({principal,sourceId:sid,sourceUrl:candidate,eventId:eid,personId:pid}),false,candidate);
  }
  assert.equal(await f.sourceAuthorize({principal:{...principal,allowedSourceIds:[sid,otherSid]},sourceId:otherSid,sourceUrl,eventId:eid,personId:pid}),false);
  f.mutate(data=>({...data,events:[{...data.events[0],source_url:sourceUrl}]}));assert.equal(await f.sourceAuthorize({principal,sourceId:sid,sourceUrl,eventId:eid,personId:pid}),false);
  assert.equal(chatAttendanceOrigin('https://flock.example/'),origin);assert.equal(chatAttendanceReference(sourceUrl.toUpperCase(),origin),null);
});

test('a valid saved chat marker is bound to its actual existing person and event in source, service writes and projections',async()=>{
  const f=fixture();await f.find();await f.set();const sourceUrl=f.data.event_people.find(row=>row.person_id===pid).source_url;
  const context={principal,sourceId:sid,sourceUrl,eventId:eid,personId:pid};
  assert.equal(await f.sourceAuthorize(context),true);
  for(const patch of [{personId:otherPid},{personId:undefined},{eventId:otherEid},{eventId:undefined}])assert.equal(await f.sourceAuthorize({...context,...patch}),false);
  const strip=(row,relation=false)=>Object.fromEntries(Object.entries(row).filter(([key])=>!['created_at','updated_at',...(relation?['event_id']:[])].includes(key)));
  const eventRow=f.data.events[0],wrongPersonRows=f.data.event_people.map(row=>strip(row.person_id===otherPid?{...row,source_url:sourceUrl}:row,true));
  const wrongPersonWrite=await f.service.upsert({principal,event:strip(eventRow),buildings:f.data.event_buildings.map(row=>strip(row,true)),people:wrongPersonRows,expectedUpdatedAt:eventRow.updated_at});
  assert.equal(wrongPersonWrite.status,'forbidden');assert.equal(f.writes.length,1,'another existing person cannot borrow a declaration during upsert');
  const secondEvent=event({id:otherEid,name:'Other scheduled event',source_record_id:'second-event-record'});
  f.mutate(data=>({...data,events:[...data.events,secondEvent],event_buildings:[...data.event_buildings,{event_id:otherEid,building_id:'bobst-library',location_notes:'Other event location'}]}));
  assert.equal(await f.sourceAuthorize({...context,eventId:otherEid}),false,'mismatched event exists in the catalogue');
  const wrongEventWrite=await f.service.upsert({principal,event:strip(secondEvent),buildings:[{building_id:'bobst-library',location_notes:'Other event location'}],
    people:[strip(participation({event_id:otherEid,person_id:pid,source_url:sourceUrl}),true)],expectedUpdatedAt:updated});
  assert.equal(wrongEventWrite.status,'forbidden');assert.equal(f.writes.length,1,'a different existing event cannot borrow the declaration');
  // Simulate bad persisted rows to verify reads independently refuse their use.
  f.mutate(data=>({...data,event_people:[...data.event_people.map(row=>row.person_id===otherPid?{...row,source_url:sourceUrl}:row),
    participation({event_id:otherEid,person_id:pid,source_url:sourceUrl})]}));
  const read=await f.service.read({principal});assert.equal(read.status,'ok');assert.equal(read.events.length,2);
  assert.deepEqual(read.event_people.map(row=>[row.event_id,row.person_id]),[[eid,pid]]);
  f.clock('2026-10-20T18:30:00.000Z');
  const projection=await createMapPresenceService({store:f.store,authorizeSource:f.authorizeSource,production:true,now:()=>new Date('2026-10-20T18:30:00.000Z')}).read({principal});
  assert.equal(projection.status,'ok');
  const bobst=projection.buildings.find(row=>row.id==='bobst-library');assert.deepEqual(bobst.people.map(row=>row.id),[pid]);
  assert.deepEqual(bobst.events.find(row=>row.id===eid).attendees.map(row=>row.id),[pid]);
  assert.deepEqual(bobst.events.find(row=>row.id===otherEid).attendees,[]);
  assert.equal(bobst.people[0].activities,undefined,'only the genuine event contributes activity');
});

test('trackability withdrawal and provider failures revoke saved chat provenance',async()=>{
  for(const change of [f=>f.revoke(),f=>f.mutate(data=>({...data,people:data.people.map(row=>row.id===pid?{...row,is_trackable:false}:row)})),
    f=>f.mutate(data=>({...data,events:[{...data.events[0],source_url:'https://unsupported.example/event'}]}))]) {
    const f=fixture();await f.find();await f.set();const sourceUrl=f.data.event_people.find(row=>row.person_id===pid).source_url;change(f);
    assert.equal(await f.sourceAuthorize({principal,sourceId:sid,sourceUrl,eventId:eid,personId:pid}),false);
  }
});

test('bounded provider delays complete through real source adapters while stalled storage fails without writes',async()=>{
  const f=fixture({delayMs:10,timeoutMs:15000}),start=performance.now();await f.find();assert.equal((await f.set()).status,'ready');
  assert(f.providerReads>=8,'initial/fresh reads and both pre-commit provenance passes reach original provider authorization');assert(performance.now()-start<15000);
  const stalled=fixture();stalled.store.read=()=>new Promise(()=>{});
  const attendance=createChatAttendanceService({store:stalled.store,service:stalled.service,publicOrigin:origin,timeoutMs:50});
  const result=await attendance.createRequest({userMessage}).find({principal,personName:'yuyang',eventQuery:'aws'});assert.equal(result.status,'unavailable');assert.equal(stalled.writes.length,0);
});
