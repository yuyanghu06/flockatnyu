import assert from 'node:assert/strict';
import {fixture,snapshot,currentUpdate,ids,origin,assertNoStorageHints} from './chat-map-time.mjs';

export const now='2026-10-23T21:45:00.000Z';
export const humanRevision='2026-10-23T21:44:00.987654Z';
export const humanNotes='A human added: meet by the accessible entrance.';
export const humanLabel='Human edit: bringing the projector';
export const lostReceiptRevision='2026-10-23T21:45:00.001Z';
const clone=value=>structuredClone(value);
const call=(id,name,args)=>({id,name,arguments:clone(args)});
const addedPerson=()=>({person_id:ids.yuyang,attendance_status:'going',presence_basis:'planned',label:''});

export function recoverySnapshot({actorPresent=false}={}){
  const data=snapshot({attendance:true});
  for(let index=5;index<=10;index++){
    const person_id=`31000000-0000-4000-8000-${String(index).padStart(12,'0')}`;
    data.people.push({id:person_id,display_name:`Existing Member ${index}`,is_trackable:true,discord_user_id:String(400+index)});
    data.event_people.push({...clone(data.event_people.at(-1)),person_id,label:`Existing activity ${index}`});
  }
  if(actorPresent)data.event_people.push({...addedPerson(),event_id:ids.event,starts_at:null,ends_at:null,source_id:data.events[0].source_id,source_url:data.events[0].source_url,reported_at:data.events[0].reported_at});
  assert.equal(data.event_people.length,actorPresent?10:9);
  return data;
}

export function attendanceArguments(data){
  const args=currentUpdate(data);
  if(!args.people.some(row=>row.person_id===ids.yuyang))args.people.push(addedPerson());
  return args;
}
function applyHumanEdit(data){data.events[0].notes=humanNotes;data.events[0].updated_at=humanRevision;data.event_people[0].label=humanLabel;}

// These are explicitly SCRIPTED historical assistant turns, not model output.
// Production adapters execute them so the configured model sees an actual
// duplicate rejection, actual CAS conflict, or actual unavailable write result.
export function recoveryCase(kind){
  assert(['duplicate-already-recorded','duplicate-new-attendee','conflict-preserves-human-edit','unavailable-write-honest'].includes(kind));
  const data=recoverySnapshot({actorPresent:kind==='duplicate-already-recorded'}),expectedBase=clone(data);
  let humanEditInjected=false;const committedWithoutReceipt=[];
  if(kind==='conflict-preserves-human-edit')applyHumanEdit(expectedBase);
  const f=fixture({data,now,beforeWrite:(state,attempt)=>{
    if(kind==='conflict-preserves-human-edit'&&!humanEditInjected){applyHumanEdit(state);humanEditInjected=true;}
    if(kind==='unavailable-write-honest'){
      // The transaction commits, then its response is lost. This deliberately
      // differs from an atomic rejection: no receipt is not proof of no write.
      const old=state.events.find(row=>row.id===attempt.event.id),event={...clone(attempt.event),created_at:old.created_at,updated_at:lostReceiptRevision};
      state.events=state.events.map(row=>row.id===event.id?event:row);
      state.event_buildings=[...state.event_buildings.filter(row=>row.event_id!==event.id),...attempt.buildings.map(row=>({...clone(row),event_id:event.id}))];
      state.event_people=[...state.event_people.filter(row=>row.event_id!==event.id),...attempt.people.map(row=>({...clone(row),event_id:event.id}))];
      committedWithoutReceipt.push(clone(attempt));throw Error('Synthetic response lost after transaction commit');
    }
  }});
  const submitted=attendanceArguments(data);
  if(kind.startsWith('duplicate-'))submitted.people.push(clone(submitted.people.find(row=>row.person_id===(kind==='duplicate-already-recorded'?ids.yuyang:data.event_people[0].person_id))));
  if(kind.startsWith('duplicate-')){assert.equal(submitted.people.length,11);assert.equal(new Set(submitted.people.map(row=>row.person_id)).size,10);}
  const prefix=[
    {text:'',toolCalls:[call('scripted_read','read_map_events',{}),call('scripted_lookup','lookup_map_person',{personName:'Yuyang Hu'})]},
    {text:'',toolCalls:[call('scripted_failed_upsert','upsert_map_event',submitted)]},
  ];
  return {name:kind,f,data,expectedBase,prefix,committedWithoutReceipt,messages:[{role:'user',content:'Please mark me as going to GoGreek today for its entire time. Keep the event and everyone else exactly as saved.'}],
    expectedPrefixStatus:kind.startsWith('duplicate-')?'invalid':kind==='conflict-preserves-human-edit'?'conflict':'unavailable'};
}

export function assertPrefix(scenario,visibleResults){
  const dispatched=scenario.f.calls.filter(row=>row.arguments);
  assert.deepEqual(dispatched.map(row=>row.name),['read_map_events','lookup_map_person','upsert_map_event'],'Scripted prefix must execute only the documented three operations');
  const failed=dispatched.at(-1).result;assert.equal(failed.status,scenario.expectedPrefixStatus,'The intended production failure must actually occur');
  assert.equal(scenario.f.writes.length,0,'Scripted prefix must not produce a confirmed applied receipt');
  if(scenario.name.startsWith('duplicate-')){
    assert.equal(failed.reason,'duplicate_participant_ids','Duplicate rows need a safe, specific repair hint');
    assert.equal(visibleResults.at(-1)?.mapFailure?.reason,'duplicate_participant_ids','The actual configured model must receive the safe failure hint');
    assert.equal(visibleResults.at(-1)?.mapFailure?.field,'people');
    const comparison=visibleResults.at(-1)?.mapFailure?.readComparison;
    if(scenario.name==='duplicate-already-recorded')assert.deepEqual(comparison,{deduplicatedMatchesRead:true,basis:'request_local_authorized_read',readVersion:scenario.data.events[0].updated_at},'The model must receive exact as-of-read equality and its parent version');
    else assert.notEqual(comparison?.deduplicatedMatchesRead,true,'A new attendee missing from the saved read cannot receive an equality hint');
  }else {assert.equal(visibleResults.at(-1)?.status,scenario.expectedPrefixStatus);
    if(scenario.name==='unavailable-write-honest')assert.equal(visibleResults.at(-1)?.mapFailure?.outcome,'unconfirmed','Lost receipt must not claim the transaction was unsaved');
  }
}

export function verifyRecovery(scenario,{modelProposals,modelTools,answer}){
  const {f}=scenario,calls=modelProposals.flat();
  assert.equal(answer.result.status,'succeeded','A budget stop or interrupted reply cannot count as recovery');
  assert(calls.every(row=>['read_map_events','upsert_map_event'].includes(row.name)),'Recovery must stay with the known map record, without new source or identity workflows');
  assert(!calls.some(row=>row.name==='lookup_map_person'),'Known identities must be reused; no new or old participant relookup proposals');
  assert(!modelTools.some(row=>row.name==='lookup_map_person'),'No identity lookup may dispatch after the failure');
  assertNoStorageHints(f.state);
  if(scenario.name==='duplicate-already-recorded'){
    assert(!calls.some(row=>row.name==='upsert_map_event'),'Already-satisfied attendance needs no new mutation proposal');assert.equal(f.attempts.length,0);assert.equal(f.writes.length,0);assert.deepEqual(f.state,scenario.data);
    assert(/already|currently|recorded|listed|marked/i.test(answer.text),'Must report the verified existing attendance');
  }else if(scenario.name==='unavailable-write-honest'){
    assert(!calls.some(row=>row.name==='upsert_map_event'),'An unavailable write is not permission to repeat it');assert.equal(f.attempts.length,1,'Only the known prefix may attempt storage');assert.equal(f.writes.length,0,'There is no confirmed applied receipt');assert.equal(scenario.committedWithoutReceipt.length,1,'The fixture actually commits once before losing its receipt');
    assert.equal(f.state.events[0].updated_at,lostReceiptRevision);assertAddedOnly(scenario);
    const reconciled=modelTools.some(row=>row.name==='read_map_events'&&row.result.status==='ready'&&row.result.event_people?.some(person=>person.person_id===ids.yuyang&&person.attendance_status==='going'));
    if(reconciled)assert(/verified|confirmed|currently|already|read|listed|recorded|marked/i.test(answer.text),'A separate successful read may confirm current attendance');
    else assert(/(?:couldn.t|could not|cannot|can.t|unable to|not able to)\s+(?:confirm|verify)|unconfirmed|not confirmed/i.test(answer.text),'Without a new read, only inability to confirm saving is supported');
    assert(!/\b(?:wasn.t|was not|isn.t|is not|has not been)\s+(?:saved|recorded|added)|\b(?:didn.t|did not)\s+(?:save|change|add|update)/i.test(answer.text),'Lost receipt cannot establish that no write happened');
  }else{
    const proposedWrites=calls.filter(row=>row.name==='upsert_map_event');assert.equal(proposedWrites.length,1,'A single necessary corrected update must complete recovery');assert.equal(proposedWrites[0].arguments.event.id,ids.event);
    assert.equal(f.writes.length,1);assert.equal(f.attempts.length,scenario.name==='conflict-preserves-human-edit'?2:1);
    assertAddedOnly(scenario);const event=f.state.events[0],before=scenario.expectedBase.events[0];assert.equal(f.writes[0].expectedUpdatedAt,before.updated_at);
    assert(/going|attend|marked|recorded/i.test(answer.text),'Final answer must confirm the applied attendance');
    if(scenario.name==='conflict-preserves-human-edit'){
      const reads=calls.filter(row=>row.name==='read_map_events');assert.equal(reads.length,1,'CAS conflict must refresh the matching event once');assert(!reads[0].arguments.eventId||reads[0].arguments.eventId===ids.event);
      assert.equal(modelTools.filter(row=>row.name==='read_map_events').length,1);assert.equal(event.notes,humanNotes);assert.equal(f.state.event_people.find(row=>row.person_id===scenario.data.event_people[0].person_id).label,humanLabel);
    }
  }
  assert(calls.filter(row=>row.name==='read_map_events').length<=1,'No repeated read loop after a known failure');
}

function assertAddedOnly(scenario){const {f}=scenario;assert.equal(f.state.events.length,1);const event=f.state.events[0],before=scenario.expectedBase.events[0];assert.deepEqual({...event,updated_at:before.updated_at},before,'Attendance cannot alter event facts or lose the concurrent human edit');
  assert.deepEqual(f.state.event_buildings,scenario.expectedBase.event_buildings);assert.deepEqual(f.state.people,scenario.expectedBase.people);assert.deepEqual(f.state.buildings,scenario.expectedBase.buildings);assert.deepEqual(f.state.event_types,scenario.expectedBase.event_types);
  assert.equal(f.state.event_people.length,10);assert.equal(new Set(f.state.event_people.map(row=>row.person_id)).size,10);
  for(const old of scenario.expectedBase.event_people)assert.deepEqual(f.state.event_people.find(row=>row.person_id===old.person_id),old,'All existing people, labels, provenance and microsecond overrides must survive');
  assert.deepEqual(f.state.event_people.find(row=>row.person_id===ids.yuyang),{...addedPerson(),event_id:ids.event,starts_at:null,ends_at:null,source_id:scenario.data.events[0].source_id,source_url:`${origin}/?event=${ids.event}#chat-map`,reported_at:now});
}
