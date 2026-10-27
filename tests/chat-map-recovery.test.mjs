import test from 'node:test';
import assert from 'node:assert/strict';
import {readConfig} from '../server/shared/config.js';
import {createChatRunner} from '../server/chat/runner.js';
import {createMapTools} from '../tools/map/index.js';
import {createChatMapTools} from '../tools/map/chat.js';
import {createMapEventService,mapReadContext} from '../server/map/events.js';
import {withChatMapSource} from '../server/map/source-access.js';
import {fixture,snapshot,currentUpdate,withoutMetadata,ids,zone,principal,origin} from './fixtures/chat-map-time.mjs';

const config=readConfig({LLM_PROVIDER:'openai-compatible',LLM_MODEL:'synthetic-recovery',LLM_API_KEY:'synthetic-only'});
const call=(name,args={})=>({name,arguments:args});
function results(input){return input.messages.some(row=>row.role==='tool')?input.messages.filter(row=>row.role==='tool').map(row=>JSON.parse(row.content)):
  JSON.parse(input.system.split('UNTRUSTED PREVIOUS TOOL RESULTS (JSON):\n')[1]);}
function providerFor(steps,{native=true}={}){
  let index=0;const requests=[],errors=[],answers=[];
  const next=async input=>{requests.push(input);try{return await (typeof steps[index]==='function'?steps[index++](input):steps[index++]??[]);}catch(error){errors.push(error);throw error;}};
  return {requests,errors,answers,...(native?{toolTurn:async input=>({text:'',toolCalls:(await next(input)).map((row,i)=>({...row,id:`call_${index}_${i}`}))})}:{planTools:next}),
    async *stream(input){answers.push(input);yield 'Reported the actual write outcome.';}};
}
const run=(f,provider)=>f.run(provider,config,[{role:'user',content:'Please add me as going to GoGreek for its entire time. Preserve everyone and all other details.'}]);
function attendanceArgs(data){const args=currentUpdate(data);args.people.push({person_id:ids.yuyang,attendance_status:'going',presence_basis:'planned',label:''});return args;}
function reordered(value){if(Array.isArray(value))return value.map(reordered);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).reverse().map(([key,item])=>[key,reordered(item)]));return value;}

test('production runner rejects conflicting participant duplicates and saves one corrected snapshot without repeating resolved people',async()=>{
  for(const native of [false,true])for(const field of ['label','source_url']){
    const data=snapshot({attendance:true}),f=fixture({data}),args=attendanceArgs(data),bad=structuredClone(args);bad.people.push({...bad.people[0],[field]:field==='label'?'Conflicting proposed activity':'https://example.test/conflicting-source'});
    const provider=providerFor([[call('read_map_events')],[call('lookup_map_person')],[call('upsert_map_event',bad)],input=>{
      const failure=results(input).findLast(row=>row.tool==='upsert_map_event');
      assert.deepEqual(failure.mapFailure,{outcome:'unsaved',attemptedEventId:ids.event,reason:'duplicate_participant_ids',field:'people',indices:[0,4]});
      assert.equal(failure.mapWrite,undefined);assert.equal(f.attempts.length,0);
      return [call('upsert_map_event',args)];},[]],{native});
    assert.equal((await run(f,provider)).result.status,'succeeded');assert.deepEqual(provider.errors,[]);
    assert.equal(f.writes.length,1);assert.equal(f.attempts.length,1);assert.equal(f.calls.filter(row=>row.name==='lookup_map_person').length,1);
    assert.deepEqual(withoutMetadata(f.state.events[0]),withoutMetadata(data.events[0]));
    for(const old of data.event_people)assert.deepEqual(f.state.event_people.find(row=>row.person_id===old.person_id),old);
    assert.equal(new Set(f.writes[0].people.map(row=>row.person_id)).size,f.writes[0].people.length);
  }
});

test('production runner saves identical repeated participant rows once without a correction round',async()=>{
  for(const native of [false,true]){
    const data=snapshot({attendance:true}),f=fixture({data}),args=attendanceArgs(data);args.people.push(reordered({...args.people[0]}));
    const provider=providerFor([[call('read_map_events')],[call('lookup_map_person')],[call('upsert_map_event',args)],input=>{
      const result=results(input).at(-1);assert.equal(result.status,'ready');assert.equal(result.mapWrite.outcome,'applied');assert.equal(result.mapFailure,undefined);return [];
    }],{native});
    assert.equal((await run(f,provider)).result.status,'succeeded');assert.deepEqual(provider.errors,[]);
    assert.equal(f.writes.length,1);assert.equal(f.calls.filter(row=>row.name==='upsert_map_event').length,1);
    assert.equal(f.writes[0].people.length,4);assert.equal(new Set(f.writes[0].people.map(row=>row.person_id)).size,4);
    for(const old of data.event_people)assert.deepEqual(f.state.event_people.find(row=>row.person_id===old.person_id),old);
  }
});

test('canonical lookup signatures reuse spelling variants, reject malformed aliases and still resolve a different person',async()=>{
  const data=snapshot();data.people[0].display_name='Yúyang Hu';const f=fixture({data});
  const first={personName:'  Yu\u0301yang   Hu  '},alias={personName:'YÚYANG HU'},malformed={personName:' '.repeat(201)+'Yúyang Hu'};
  const provider=providerFor([[call('lookup_map_person',first)],[call('lookup_map_person',malformed)],input=>{
    assert.equal(results(input).at(-1).status,'invalid_request');assert.equal(results(input).at(-1).mapPerson,undefined);
    return [call('lookup_map_person',alias)];},input=>{
    const duplicate=results(input).at(-1);assert.equal(duplicate.status,'duplicate_call_skipped');assert.equal(duplicate.previousResult.mapPerson.id,ids.yuyang);
    return [call('lookup_map_person',{personName:'Jennifer'})];},[]]);
  assert.equal((await run(f,provider)).result.status,'succeeded');assert.deepEqual(provider.errors,[]);
  assert.deepEqual(f.calls.filter(row=>row.name==='lookup_map_person').map(row=>row.arguments),[first,malformed,{personName:'Jennifer'}]);
  assert.equal(f.calls.filter(row=>row.name==='store.read').length,2);assert.equal(f.attempts.length,0);
});

test('object key order is canonical while array order and non-name argument values remain distinct',async()=>{
  const data=snapshot(),f=fixture({data}),bad=currentUpdate(data);bad.buildings.push({...bad.buildings[0]});
  const swapped=structuredClone(bad);swapped.people.reverse();
  const provider=providerFor([[call('read_map_events')],[call('upsert_map_event',bad)],[call('upsert_map_event',reordered(bad))],input=>{
    assert.equal(results(input).at(-1).status,'duplicate_call_skipped');assert.equal(results(input).at(-1).previousResult.reason,'duplicate_building_ids');
    return [call('upsert_map_event',swapped)];},[call('lookup_map_person',{provider:'discord',providerUserId:'400'})],[call('lookup_map_person',{providerUserId:'0400',provider:'discord'})],[]]);
  assert.equal((await run(f,provider)).result.status,'succeeded');assert.deepEqual(provider.errors,[]);
  assert.equal(f.calls.filter(row=>row.name==='upsert_map_event').length,2);assert.equal(f.calls.filter(row=>row.name==='lookup_map_person').length,2);
  assert.equal(f.calls.filter(row=>row.name==='store.lookup').length,2);assert.equal(f.attempts.length,0);
});

test('native and legacy schema-invalid writes keep field feedback and can correct only the invalid input',async()=>{
  for(const native of [false,true]){
    const data=snapshot(),f=fixture({data}),valid=currentUpdate(data),bad=structuredClone(valid);bad.people[0].ends_at=null;
    const provider=providerFor([[call('read_map_events')],[call('upsert_map_event',bad)],input=>{
      const failure=results(input).at(-1);assert.equal(failure.status,'invalid_request');assert.equal(failure.mapFailure.field,'ends_at');assert.equal(failure.mapFailure.validation,'type');
      assert.equal(failure.mapWrite,undefined);assert.equal(f.attempts.length,0);return [call('upsert_map_event',valid)];},[]],{native});
    assert.equal((await run(f,provider)).result.status,'succeeded');assert.deepEqual(provider.errors,[]);assert.equal(f.writes.length,1);
    assert.equal(f.calls.filter(row=>row.name==='lookup_map_person').length,0);assert.equal(f.calls.filter(row=>row.name==='upsert_map_event').length,2);
    if(native){const history=provider.requests.at(-1).messages;const ids=history.filter(row=>row.role==='assistant').flatMap(row=>row.toolCalls??[]).map(row=>row.id);
      assert.deepEqual(history.filter(row=>row.role==='tool').map(row=>row.toolCallId),ids);}
  }
});

test('shared map service identifies duplicate buildings and invalid windows before persistence',async()=>{
  for(const variant of ['duplicate building','event window','participant window']){
    const f=fixture(),chat=f.request();await chat.execute({name:'read_map_events',arguments:{},principal});
    const args=currentUpdate(f.state);let reason,field,indices;
    if(variant==='duplicate building'){args.buildings.push({...args.buildings[0]});reason='duplicate_building_ids';field='buildings';indices=[0,1];}
    if(variant==='event window'){delete args.event.ends_at;args.event.ends_local='2026-10-23T15:00:00';reason='invalid_event_window';field='event';}
    if(variant==='participant window'){args.people[0].ends_local='2026-10-24T01:00:00';reason='invalid_participant_window';field='people';indices=[0];}
    const result=await chat.execute({name:'upsert_map_event',arguments:args,principal});assert.equal(result.status,'invalid');assert.equal(result.reason,reason);assert.equal(result.field,field);assert.deepEqual(result.indices,indices);
    assert.equal(f.attempts.length,0);assert.deepEqual(f.state,snapshot());
  }
});

test('unavailable map writes remain unconfirmed and unsafe error bodies/indices never enter model context',async()=>{
  for(const response of [{status:'unavailable',reason:'PRIVATE_ERROR_BODY',indices:[0,499]},{status:'invalid',reason:'duplicate_participant_ids',field:'PRIVATE_FIELD',indices:[0,499]}]){
    const data=snapshot(),args=currentUpdate(data);let attempts=0;
    const mapTools=createChatMapTools({publicOrigin:origin,mapTools:createMapTools({service:{configured:true,read:async()=>({status:'ok',...data}),upsert:async()=>{attempts++;return response;}}})});
    const provider=providerFor([[call('read_map_events')],[call('upsert_map_event',args)],input=>{
      const failure=results(input).at(-1);assert.equal(failure.mapWrite,undefined);assert.equal(failure.mapFailure.attemptedEventId,ids.event);assert.equal(failure.mapFailure.indices,undefined);
      assert.equal(failure.mapFailure.outcome,response.status==='unavailable'?'unconfirmed':'unsaved',JSON.stringify(failure));assert(!JSON.stringify(failure).includes('PRIVATE_'));return [];},[]]);
    const runner=createChatRunner({config,provider,mapTools});const result=await runner.run({conversation:{messages:[{role:'user',content:'Update this saved map activity.'}],timeZone:zone},principal,onRecord:()=>{}});
    assert.equal(result.status,'succeeded');assert.deepEqual(provider.errors,[]);assert.equal(attempts,1);
  }
});

test('conflict refresh uses the fresh event revision and concurrent facts without repeating person lookups',async()=>{
  let injected=false;const data=snapshot({attendance:true}),f=fixture({data,beforeWrite:(state)=>{if(!injected){injected=true;state.events[0].notes='Concurrent human note';state.events[0].updated_at='2026-10-23T21:46:00.000Z';}}});
  const args=attendanceArgs(data),provider=providerFor([[call('read_map_events')],[call('lookup_map_person')],[call('upsert_map_event',args)],input=>{
    assert.equal(results(input).at(-1).mapFailure.reason,'conflict');return [call('read_map_events')];},input=>{
    const read=results(input).at(-1).mapContext;assert.equal(read.events[0].notes,'Concurrent human note');
    return [call('upsert_map_event',attendanceArgs({...read,event_buildings:read.event_buildings,event_people:read.event_people}))];},[]]);
  assert.equal((await run(f,provider)).result.status,'succeeded');assert.deepEqual(provider.errors,[]);assert.equal(f.attempts.length,2);assert.equal(f.writes.length,1);
  assert.equal(f.writes[0].event.notes,'Concurrent human note');assert.equal(f.writes[0].expectedUpdatedAt,'2026-10-23T21:46:00.000Z');assert.equal(f.calls.filter(row=>row.name==='lookup_map_person').length,1);
});

test('protected participant validation does not reveal hidden relationship positions',async()=>{
  const data=snapshot(),hidden=ids.jennifer;Object.assign(data.event_people.find(row=>row.person_id===hidden),{starts_at:'2026-10-23T20:15:00Z',ends_at:'2026-10-23T22:00:00Z'});
  const actor=withChatMapSource(principal),authorizeSource=Object.assign(({personId})=>personId!==hidden,{localOnly:true,canPreserveChatParticipation:()=>true});let writes=0;
  const service=createMapEventService({store:{configured:true,read:async()=>structuredClone(data),upsert:async()=>{writes++;throw Error('Unexpected write');}},authorizeSource});
  const read=await service.read({principal:actor});assert(!read.event_people.some(row=>row.person_id===hidden));
  const prepared=await service.preparePreservedEvent({principal:actor,eventId:ids.event,expectedUpdatedAt:data.events[0].updated_at,mode:'calendar',readContext:mapReadContext(read)});assert.equal(prepared.status,'ok');
  const args=currentUpdate(prepared.raw);args.event.ends_at='2026-10-23T21:00:00Z';
  const result=await service.upsertPreservedEvent({...args,principal:actor,mode:'calendar',capability:prepared.capability});
  assert.equal(result.reason,'invalid_participant_window');assert.equal(result.indices,undefined);assert.equal(writes,0);
});

test('identical participant duplicates save once while duplicate buildings retain the exact-read advisory',async()=>{
  for(const collection of ['people','buildings']){
    const data=snapshot();data.event_buildings.push({event_id:ids.event,building_id:'bobst-library',location_notes:'Room B'});
    const f=fixture({data}),chat=f.request();await chat.execute({name:'read_map_events',arguments:{},principal});
    const args=currentUpdate(data);args.people.reverse();args.buildings.reverse();args[collection].push({...args[collection][0]});
    // Exercise the actual inherited attribution/URL and nullable-field defaults.
    for(const row of [args.event,...args.people])for(const key of ['source_id','source_url','source_record_id','reported_at'])delete row[key];delete args.event.url;
    const before=f.calls.length,result=await chat.execute({name:'upsert_map_event',arguments:args,principal});
    assert.deepEqual(f.calls.slice(before).map(row=>row.name),['upsert_map_event']);
    if(collection==='people'){
      assert.equal(result.sourceStatus,'applied');assert.equal(result.readComparison,undefined);assert.equal(f.attempts.length,1);
      assert.equal(f.writes[0].people.length,data.event_people.length);assert.deepEqual(withoutMetadata(f.state.events[0]),withoutMetadata(data.events[0]));
      for(const old of data.event_people)assert.deepEqual(f.state.event_people.find(row=>row.person_id===old.person_id),old);
      for(const old of data.event_buildings)assert.deepEqual(f.state.event_buildings.find(row=>row.building_id===old.building_id),old);
    }else{
      assert.equal(result.status,'invalid');assert.equal(result.reason,'duplicate_building_ids');
      assert.deepEqual(result.readComparison,{deduplicatedMatchesRead:true,basis:'request_local_authorized_read',readVersion:data.events[0].updated_at});
      assert.equal(f.attempts.length,0);assert.deepEqual(f.state,data);
    }
  }
});

test('read comparison is withheld for any distinct fact, relationship, source scope or parent version',async()=>{
  for(const variant of ['new person','missing person','extra building','missing building','changed label','changed room','opaque URL','microseconds','equivalent timestamp','conflicting duplicates','other version','other principal','changed grants','no read']){
    const data=snapshot();data.event_buildings.push({event_id:ids.event,building_id:'bobst-library',location_notes:'Room B'});
    const f=fixture({data}),chat=f.request(),args=currentUpdate(data);
    if(variant!=='no read')await chat.execute({name:'read_map_events',arguments:{},principal});
    if(variant==='new person')args.people.push({...args.people[1],person_id:'31000000-0000-4000-8000-000000000099'});
    if(variant==='missing person')args.people.splice(1,1);
    if(variant==='extra building')args.buildings.push({building_id:'another-building',location_notes:''});
    if(variant==='missing building')args.buildings.pop();
    if(variant==='changed label')args.people[1].label='A new activity';
    if(variant==='changed room')args.buildings[0].location_notes='Another room';
    if(variant==='opaque URL')args.event.url=args.event.url.replace('8000-','8000/');
    if(variant==='microseconds'){delete args.event.starts_at;args.event.starts_local='2026-10-23T16:00:00.123';}
    if(variant==='equivalent timestamp')args.event.reported_at=args.event.reported_at.replace('Z','+00:00');
    if(variant==='conflicting duplicates')args.people.push({...args.people[0],label:'Conflicting duplicate fact'});
    if(variant==='other version')args.expectedUpdatedAt=args.expectedUpdatedAt.replace('Z','+00:00');
    args.buildings.push({...args.buildings[0]});
    const actor=variant==='other principal'?{...principal,id:'another-member'}:variant==='changed grants'?{...principal,allowedSourceIds:['41000000-0000-4000-8000-000000000001']}:principal;
    const before=f.calls.length,result=await chat.execute({name:'upsert_map_event',arguments:args,principal:actor});
    assert.equal(result.readComparison,undefined,variant);assert(!['ready','applied'].includes(result.status),variant);
    assert.equal(f.attempts.length,0,variant);assert(!f.calls.slice(before).some(row=>row.name==='store.read'||row.name==='store.lookup'),variant);assert.deepEqual(f.state,data,variant);
  }
});

test('a later empty, changed, unavailable or forbidden map read cannot reuse an earlier comparison snapshot',async()=>{
  for(const variant of ['empty','changed','unavailable','forbidden']){
    const f=fixture(),chat=f.request(),args=currentUpdate(f.state);args.buildings.push({...args.buildings[0]});
    await chat.execute({name:'read_map_events',arguments:{},principal});
    const read=f.store.read;
    f.store.read=async()=>{if(variant==='unavailable')throw Error('Synthetic failed map read');const data=await read();if(variant==='empty')return {...data,events:[],event_people:[],event_buildings:[]};
      data.events[0].updated_at='2026-10-23T21:46:00.000Z';return data;};
    const second=await chat.execute({name:'read_map_events',arguments:{},principal:variant==='forbidden'?{...principal,id:'another-member'}:principal});
    if(variant==='unavailable')assert.equal(second.status,'unavailable');if(variant==='forbidden')assert.equal(second.status,'forbidden');
    const before=f.calls.length,result=await chat.execute({name:'upsert_map_event',arguments:args,principal});
    assert.equal(result.status,'invalid');assert.equal(result.reason,'duplicate_building_ids');assert.equal(result.readComparison,undefined,variant);
    assert.equal(f.attempts.length,0);assert.deepEqual(f.calls.slice(before).map(row=>row.name),['upsert_map_event']);
  }
});

test('a thrown map read clears the comparison receipt before dispatch while retaining ordinary raw snapshots',async()=>{
  const f=fixture(),base=createMapTools({service:{configured:true,read:args=>f.service.read({...args,principal:withChatMapSource(args.principal)}),upsert:args=>f.service.upsert({...args,principal:withChatMapSource(args.principal)})}});
  let fail=false;
  const mapTools={...base,execute:options=>{if(fail&&options.name==='read_map_events')throw Error('Synthetic adapter failure');return base.execute(options);}};
  const chat=createChatMapTools({publicOrigin:origin,mapTools}).createRequest({principal});
  await chat.execute({name:'read_map_events',arguments:{},principal});fail=true;
  assert.equal((await chat.execute({name:'read_map_events',arguments:{},principal})).status,'unavailable');
  const args=currentUpdate(f.state);args.buildings.push({...args.buildings[0]});
  const result=await chat.execute({name:'upsert_map_event',arguments:args,principal});assert.equal(result.status,'invalid');assert.equal(result.readComparison,undefined);assert.equal(f.attempts.length,0);
});

test('the runner exposes the exact read comparison as failure data, with no applied receipt or hidden participation',async()=>{
  const data=snapshot(),hidden=ids.jennifer,actor=withChatMapSource(principal);
  const authorizeSource=Object.assign(({personId})=>personId!==hidden,{localOnly:true});let reads=0,writes=0;
  const store={configured:true,read:async()=>{reads++;return structuredClone(data);},upsert:async()=>{writes++;throw Error('Unexpected persistence');}};
  const service=createMapEventService({store,authorizeSource}),mapTools=createChatMapTools({publicOrigin:origin,mapTools:createMapTools({service})});
  const args=currentUpdate(data);args.people=args.people.filter(row=>row.person_id!==hidden);args.buildings.push({...args.buildings[0]});
  const provider=providerFor([[call('read_map_events')],[call('upsert_map_event',args)],input=>{
    const failure=results(input).at(-1);assert.equal(failure.status,'invalid');assert.equal(failure.mapWrite,undefined);
    assert.deepEqual(failure.mapFailure.readComparison,{deduplicatedMatchesRead:true,basis:'request_local_authorized_read',readVersion:data.events[0].updated_at});
    assert(!JSON.stringify(failure).includes(hidden));return [];}]);
  const runner=createChatRunner({config,provider,mapTools});assert.equal((await runner.run({conversation:{messages:[{role:'user',content:'Check this map activity.'}],timeZone:zone},principal:actor,onRecord:()=>{}})).status,'succeeded');
  assert.deepEqual(provider.errors,[]);assert.equal(reads,1);assert.equal(writes,0);
});

test('failure projection withholds malformed or wrongly scoped read comparison hints',async()=>{
  for(const comparison of [{deduplicatedMatchesRead:false,basis:'request_local_authorized_read',readVersion:snapshot().events[0].updated_at},
    {deduplicatedMatchesRead:true,basis:'current_database_read',readVersion:snapshot().events[0].updated_at},
    {deduplicatedMatchesRead:true,basis:'request_local_authorized_read',readVersion:'not-a-timestamp'},
    {deduplicatedMatchesRead:true,basis:'request_local_authorized_read',readVersion:'2026-10-23T21:46:00.000Z'}]){
    const data=snapshot(),args=currentUpdate(data);
    const mapTools=createMapTools({service:{configured:true,upsert:async()=>({status:'invalid',reason:'duplicate_participant_ids',readComparison:comparison})}});
    const provider=providerFor([[call('upsert_map_event',args)],input=>{assert.equal(results(input).at(-1).mapFailure.readComparison,undefined);return [];}]);
    const runner=createChatRunner({config,provider,mapTools});assert.equal((await runner.run({conversation:{messages:[{role:'user',content:'Check this activity.'}],timeZone:zone},principal,onRecord:()=>{}})).status,'succeeded');assert.deepEqual(provider.errors,[]);
  }
});
