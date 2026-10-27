import test from 'node:test';
import assert from 'node:assert/strict';
import {assistantAnswerPrompt,assistantPlanningPrompt} from '../server/chat/context.js';
import {publicResult} from '../server/chat/public-result.js';

const now='2026-10-18T16:00:00Z',timeZone='America/New_York';
const marker='\nUNTRUSTED TOOL STATUS AND REFERENCE DATA (JSON):\n';
const options={now,timeZone};
function encoded(data){const prompt=assistantAnswerPrompt({...options,...data});return {prompt,data:JSON.parse(prompt.slice(prompt.indexOf(marker)+marker.length))};}
function restore(data){return {...data,results:data.results.map(result=>Array.isArray(result?.sources)?{...result,sources:result.sources.map(source=>Object.keys(source).length===1&&Number.isInteger(source.sourceRef)?data.sources[source.sourceRef]:source)}:result)};}
const source=i=>({id:`discord:200:${300+i}`,documentId:`discord:200:${300+i}`,sourceId:'10000000-0000-4000-8000-000000000001',kind:'discord',retrieval:'live',url:`https://discord.com/channels/100/200/${300+i}`,title:`Source ${i}`,excerpt:'Original message 📌\n'.repeat(53).slice(0,1000),createdAt:now});
test('answer-only exact-source references reduce repeated evidence without losing fields',()=>{
 const sources=Array.from({length:12},(_,i)=>source(i)),results=[{tool:'read_discord_summary',status:'ready',sources:structuredClone(sources),coverage:{complete:false,reason:'page_budget',checkedChannelCount:12}}],input={results,sources};
 const snapshot=structuredClone(input),actual=encoded(input),baseline=actual.prompt.slice(0,actual.prompt.indexOf(marker)+marker.length)+JSON.stringify(input);
 assert.deepEqual(restore(actual.data),input);assert.deepEqual(input,snapshot);
 assert(actual.data.results[0].sources.every((s,i)=>s.sourceRef===i));
 assert(Buffer.byteLength(actual.prompt)<Buffer.byteLength(baseline),'compaction reduces the complete prompt');
 assert(Buffer.byteLength(JSON.stringify(actual.data))<Buffer.byteLength(JSON.stringify(input)),
   'shared references reduce repeated evidence independently of instruction length');
 assert.match(actual.prompt,/zero-based index N/);
 const planning=assistantPlanningPrompt({...options,results});
 assert(planning.endsWith(JSON.stringify(results)));assert(!planning.includes('"sourceRef"'));
});
test('same-ID variants, result-only sources, reordered keys and all tool receipts retain original data',()=>{
 const canonical=source(0),variant={...canonical,excerpt:'A second message revision'},resultOnly=source(99),reordered={excerpt:canonical.excerpt,...canonical};
 const sources=[canonical],results=[{tool:'list_calendar_events',status:'ready',sources:[structuredClone(canonical),variant,resultOnly,reordered],calendarContext:{events:[{id:'event-1',start:{date:'2026-10-19'},end:{date:'2026-10-20'}}],nextPageToken:'next'},coverage:{complete:false}},
  {tool:'read_miro_item',status:'ready',sources:[variant],boardContext:{payload:{rows:[{id:'row-1',cells:['original content']}]}}},
  {tool:'upsert_map_event',status:'ready',sources:[],mapWrite:{outcome:'applied',eventId:'event-1',updatedAt:now}},
  {tool:'create_calendar_event',status:'ready',calendarWrite:{outcome:'applied',eventId:'event-2',url:'https://calendar.google.com/calendar/event?eid=original'}},
  {tool:'bug_reports',status:'ready',bugReport:{id:'bug-1'}},{tool:'update_memory',status:'ready',memoryUpdate:{revision:2}}];
 const input={results,sources},actual=encoded(input).data;
 assert.deepEqual(actual.results[0].sources[0],{sourceRef:0});
 assert.deepEqual(actual.results[0].sources.slice(1),[variant,resultOnly,reordered]);
 assert.deepEqual(actual.results[1].sources,[variant]);assert.deepEqual(restore(actual),input);
 assert.equal(JSON.stringify(restore(actual)),JSON.stringify(input),'exact serialization, including field order, is unchanged');
});
test('duplicate canonical objects reference the first exact canonical source; no source input means no interning',()=>{
 const original=source(0),input={sources:[original,structuredClone(original)],results:[{sources:[original]}]};
 const actual=encoded(input).data;assert.deepEqual(actual.results[0].sources,[{sourceRef:0}]);assert.deepEqual(actual.sources,input.sources);
 assert.deepEqual(encoded({sources:[],results:[{sources:[original]}]}).data,{sources:[],results:[{sources:[original]}]});
 assert.deepEqual(encoded({}).data,{results:[],sources:[]});
});

test('large Contacts imports keep every confirmed receipt while removing oversized contact bodies',()=>{
 const notes='💬'.repeat(2000);
 const items=Array.from({length:10},(_,index)=>({
  resultId:`10000000-0000-4000-8000-${String(index+1).padStart(12,'0')}`,
  operation:index%2?'existing':'imported',
  id:`20000000-0000-4000-8000-${String(index+1).padStart(12,'0')}`,
  updated_at:now,
 }));
 const result={status:'ready',contactImport:{complete:true,imported:5,existing:5,items},results:items.map(item=>({
  resultId:item.resultId,status:'ready',operation:item.operation,
  contact:{id:item.id,created_at:now,updated_at:now,raw_input:{first_name:'Synthetic',notes}},
 }))};
 const args={resultIds:items.map(item=>item.resultId)},before=structuredClone(result);
 const single=publicResult('import_treg_contacts',{resultIds:[items[0].resultId]},{
  status:'ready',contactImport:{complete:true,imported:1,existing:0,items:[items[0]]},results:[result.results[0]],
 });
 assert.equal(single.results[0].contact.raw_input.notes,notes,'Each contact fits the individual projection limit');
 assert(Buffer.byteLength(JSON.stringify(single.results[0].contact.raw_input))<24000);
 assert(Buffer.byteLength(JSON.stringify(result.results))>60000,'The complete batch exceeds the aggregate result bound');
 const projected=publicResult('import_treg_contacts',args,result);
 assert.equal(projected.status,'ready');assert.deepEqual(projected.contactImport,result.contactImport);
 assert.deepEqual(projected.results,items.map(({resultId,operation})=>({resultId,status:'ready',operation})));
 assert(projected.results.every(item=>!Object.hasOwn(item,'contact')));
 assert(Buffer.byteLength(JSON.stringify(projected))<60000);assert.deepEqual(result,before,'Projection does not change saved contacts or receipts');
});
