import test from 'node:test';
import assert from 'node:assert/strict';
import {assistantAnswerPrompt,assistantPlanningPrompt} from '../server/assistant-context.js';

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
 assert(Buffer.byteLength(actual.prompt)<Buffer.byteLength(baseline)*0.7,'at least 30% of total fixture prompt bytes saved');
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
