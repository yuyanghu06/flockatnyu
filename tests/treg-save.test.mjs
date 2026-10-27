import {isDeepStrictEqual} from 'node:util';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createTregResultCache} from '../server/treg-result-cache.js';
import {createContactsTools} from '../tools/contacts/index.js';
import {saveFixture,principal,rawPeople,enrichedRaw,humanRow,humanId,hiddenNative,fixtureSecret,stamp,savedStorage} from './fixtures/treg-save.mjs';

const invoke=(adapter,name,args,extra={})=>adapter.execute({name,arguments:args,principal,...extra});
const scope=(f,{actor=principal,message='Find people and keep their returned details.'}={})=>{
 const tregResults=createTregResultCache({principal:actor});
 return {tregResults,treg:f.tregTools.createRequest({principal:actor,userMessage:message,tregResults}),contacts:f.contactsTools.createRequest({principal:actor,userMessage:message,tregResults})};
};
const noHidden=value=>{for(const marker of [hiddenNative,fixtureSecret])assert(!JSON.stringify(value).includes(marker));};

test('Treg results save through a separate Contacts operation with exact native JSON and replay protection',async()=>{
 const f=saveFixture(),s=scope(f);
 const found=await invoke(s.treg,'search_treg_people',{company_domain:'example.com',limit:2});assert.equal(found.status,'ready');assert.equal(f.storage.requests.length,0,'Lookup cannot access Contacts');
 const ids=found.people.map(person=>person.resultId);assert.equal(new Set(ids).size,2);noHidden(found);
 const saved=await invoke(s.contacts,'import_treg_contacts',{resultIds:ids});assert.equal(saved.status,'ready');assert.equal(saved.contactImport.imported,2);assert.equal(saved.contactImport.existing,0);assert.equal(saved.contactImport.complete,true);
 for(const person of rawPeople)assert(f.storage.state.some(row=>isDeepStrictEqual(row.raw_input,person)),'Complete native object must survive without inserted blanks/metadata');
 noHidden(saved);assert.equal(f.requests.length,1,'Saving must not call Treg');
 const attempts=f.storage.attempts.length;
 assert.deepEqual(await invoke(s.contacts,'import_treg_contacts',{resultIds:ids}),saved);assert.equal(f.storage.attempts.length,attempts);
 const overlap=await invoke(s.contacts,'import_treg_contacts',{resultIds:[ids[1],ids[0],ids[1]]});assert.equal(overlap.contactImport.imported,2);assert.equal(f.storage.attempts.length,attempts);
 const logs=(await f.logs()).flat();assert(logs.some(event=>JSON.stringify(event).includes('confirmed')));assert(logs.some(event=>JSON.stringify(event).includes('contact_import')));
});

test('Opaque references are actor/run-bound and whole import batches reject invented or stale IDs before persistence',async()=>{
 const f=saveFixture(),s=scope(f),found=await invoke(s.treg,'search_treg_people',{q:'Example',limit:2}),id=found.people[0].resultId;
 const fake='72000000-0000-4000-8000-000000000001';
 for(const args of [{resultIds:[id,fake]},{resultIds:[]},{resultIds:Array(11).fill(id)},{resultIds:[id],rawInput:rawPeople[0]},{resultIds:['not-a-reference']}])assert.notEqual((await invoke(s.contacts,'import_treg_contacts',args)).status,'ready');
 const other=scope(f);assert.notEqual((await invoke(other.contacts,'import_treg_contacts',{resultIds:[id]})).status,'ready');
 const otherActor={id:'another-member',allowedSourceIds:[]};
 assert.equal((await invoke(s.contacts,'import_treg_contacts',{resultIds:[id]},{principal:otherActor})).status,'forbidden');
 const stolen=f.contactsTools.createRequest({principal:otherActor,userMessage:'Save it',tregResults:s.tregResults});assert.notEqual((await invoke(stolen,'import_treg_contacts',{resultIds:[id]},{principal:otherActor})).status,'ready');
 assert.equal((await invoke(f.contactsTools,'import_treg_contacts',{resultIds:[id]})).status,'forbidden');
 const noMessage=f.contactsTools.createRequest({principal,userMessage:'',tregResults:s.tregResults});assert.equal((await invoke(noMessage,'import_treg_contacts',{resultIds:[id]})).status,'forbidden');
 assert.equal(f.storage.requests.length,0);
});

test('Enrichment saves only matches, retains unknown native shapes and stores lookup email separately',async()=>{
 const unknownRaw={deep:{provider_native:{name:'Unknown Shape',value:hiddenNative}},untouched:[1,null,{a:false}]};
 const f=saveFixture({enrichments:{'unknown@example.com':{body:{output:{full_name:'Unknown Shape'},raw:unknownRaw,_treg:{served_by:'synthetic.people.lookup'}}},'missing@example.com':{miss:true},'failed@example.com':{status:503,body:{error:'Private error'}}}}),s=scope(f);
 const found=await invoke(s.treg,'enrich_treg_people',{emails:['unknown@example.com','missing@example.com','failed@example.com']});assert.equal(found.status,'partial');assert.equal(found.results[0].matched,true);assert.deepEqual(found.results[0].fields,{});assert(found.results[0].resultId);
 assert.equal(found.results[1].matched,false);assert.equal(found.results[1].resultId,undefined);assert.equal(found.results[2].resultId,undefined);noHidden(found);
 const saved=await invoke(s.contacts,'import_treg_contacts',{resultIds:[found.results[0].resultId]});assert.equal(saved.status,'ready');assert.deepEqual(f.storage.state[0].raw_input,unknownRaw);assert.equal(f.storage.state[0].lookup_email,'unknown@example.com');
 assert.equal(saved.results[0].contact.raw_input.email,'unknown@example.com');assert.equal(f.requests.length,3);noHidden(saved);
});

test('Imports preserve existing human contacts; ordinary exact-read editing and deletion retain native fields',async()=>{
 const initial=humanRow(),f=saveFixture({rows:[initial]}),s=scope(f);
 const found=await invoke(s.treg,'enrich_treg_people',{emails:['avery@example.com']}),saved=await invoke(s.contacts,'import_treg_contacts',{resultIds:[found.results[0].resultId]});
 assert.equal(saved.status,'ready');assert.equal(saved.contactImport.existing,1);assert.equal(saved.contactImport.imported,0);assert.equal(f.storage.attempts.length,0);assert.deepEqual(f.storage.state,[initial]);
 const edit={contactId:humanId,expectedUpdatedAt:stamp,fields:{notes:'Follow up Friday'}};
 assert.equal((await invoke(s.contacts,'update_contact',edit)).status,'read_required');await invoke(s.contacts,'read_contact',{contactId:humanId});
 const updated=await invoke(s.contacts,'update_contact',edit);assert.equal(updated.status,'ready');assert.deepEqual(f.storage.state[0].raw_input,{...initial.raw_input,notes:'Follow up Friday'});
 assert.equal((await invoke(s.contacts,'delete_contact',{contactId:humanId,expectedUpdatedAt:updated.contact.updated_at})).status,'read_required');await invoke(s.contacts,'read_contact',{contactId:humanId});
 const removed=await invoke(s.contacts,'delete_contact',{contactId:humanId,expectedUpdatedAt:updated.contact.updated_at});assert.equal(removed.status,'ready');assert.equal(removed.contactWrite.operation,'deleted');assert.equal(f.storage.state.length,0);
});

test('Unknown writes fence later imports and manual mutations without losing earlier confirmed items',async()=>{
 const f=saveFixture({writeFailure:'after'}),s=scope(f),found=await invoke(s.treg,'search_treg_people',{q:'Example',limit:2}),ids=found.people.map(person=>person.resultId);
 const saved=await invoke(s.contacts,'import_treg_contacts',{resultIds:ids});assert.notEqual(saved.status,'ready');assert.equal(saved.reason,'write_outcome_unknown');assert.equal(saved.contactImport.items.length,0);assert.equal(f.storage.attempts.length,1);assert.equal(f.storage.state.length,1);
 await invoke(s.contacts,'import_treg_contacts',{resultIds:[...ids].reverse()});await invoke(s.contacts,'create_contact',{fields:{first_name:'Bypass'}});assert.equal(f.storage.attempts.length,1,'Unknown outcome prevents new writes and changed-batch bypass');
 const direct=f.contactsTools.createRequest({principal,userMessage:'Save it',tregResults:s.tregResults});
 assert(direct,'New-run durable id conflict behavior is independently covered below, without retrying unknown writes in this request');
});

test('Required logs, cancellation and rejected registration prevent saves; database id conflicts preserve winners',async()=>{
 const blocked=saveFixture({loggerFailure:true}),b=scope(blocked);assert.equal((await invoke(b.treg,'search_treg_people',{q:'Example'})).status,'log_unavailable');assert.equal(blocked.requests.length,0);assert.equal(blocked.storage.requests.length,0);
 const f=saveFixture(),s=scope(f),found=await invoke(s.treg,'search_treg_people',{q:'Example',limit:2});
 const aborted=await invoke(s.contacts,'import_treg_contacts',{resultIds:[found.people[0].resultId]},{signal:AbortSignal.abort()});assert.notEqual(aborted.status,'ready');assert.equal(f.storage.attempts.length,0);
 const registry=createTregResultCache({principal}),log=async()=>true;
 assert.equal(registry.registerMany({principal,people:[{rawInput:rawPeople[0],provider:'synthetic.people.lookup',appendLog:log},{rawInput:[],provider:'synthetic.people.lookup',appendLog:log}]}),null,'Registration is atomic');
 const id='73000000-0000-4000-8000-000000000001',winner=humanRow(id,{email:'winner@example.com'}),storage=savedStorage({rows:[winner]});
 const result=await storage.store.importContact({contactId:id,rawInput:{unknown:{value:hiddenNative}}});assert.equal(result.status,'ready');assert.equal(result.operation,'existing');assert.deepEqual(storage.state,[winner]);
 const malformed=saveFixture({enrichments:{'avery@example.com':{body:{output:{full_name:'Avery Example'},raw:null,_treg:{served_by:'synthetic.people.lookup'}}}}});
 const invalid=await invoke(scope(malformed).treg,'enrich_treg_people',{emails:['avery@example.com']});assert.equal(invalid.results[0].resultId,undefined,'No opaque save capability for missing native object');
});

test('A confirmed insert survives completion-log failure while later writes are fenced',async()=>{
 const f=saveFixture(),tregResults=createTregResultCache({principal});let calls=0;
 const resultIds=tregResults.registerMany({principal,people:[{rawInput:rawPeople[0],provider:'synthetic.people.lookup',appendLog:async()=>++calls===1},{rawInput:rawPeople[1],provider:'synthetic.people.lookup',appendLog:async()=>true}]});
 const contacts=f.contactsTools.createRequest({principal,userMessage:'Keep the found people',tregResults});
 const saved=await invoke(contacts,'import_treg_contacts',{resultIds});assert.equal(saved.status,'partial');assert.equal(saved.contactImport.complete,false);assert.equal(saved.contactImport.imported,1);assert.equal(saved.contactImport.items.length,1);
 assert.equal(saved.results[0].status,'ready');assert.equal(saved.results[0].operation,'imported');assert.equal(saved.results[0].logging,'log_unavailable');assert.equal(saved.results[1].status,'log_unavailable');assert.equal(f.storage.attempts.length,1);assert.deepEqual(f.storage.state[0].raw_input,rawPeople[0]);
 const replay=await invoke(contacts,'import_treg_contacts',{resultIds:[resultIds[0]]});assert.equal(replay.contactImport.items[0].id,saved.contactImport.items[0].id);assert.equal(f.storage.attempts.length,1);
 assert.equal((await invoke(contacts,'create_contact',{fields:{first_name:'Bypass'}})).status,'log_unavailable');assert.equal(f.storage.attempts.length,1);
});

test('Short-lived native result retention enforces record, individual-size and total-size limits atomically',()=>{
 const make=(rawInput={a:1})=>({rawInput,provider:'synthetic.people.lookup',appendLog:async()=>true});
 const count=createTregResultCache({principal});assert.equal(count.registerMany({principal,people:Array.from({length:100},()=>make())}).length,100);assert.equal(count.registerMany({principal,people:[make()]}),null);
 const size=createTregResultCache({principal});assert.equal(size.registerMany({principal,people:[make({huge:'x'.repeat(200001)})]}),null);assert.equal(size.registerMany({principal,people:[make()]}).length,1);
 const bytes=createTregResultCache({principal});assert.equal(bytes.registerMany({principal,people:Array.from({length:11},()=>make({text:'x'.repeat(190000)}))}),null);
 assert.equal(bytes.registerMany({principal,people:Array.from({length:10},()=>make({text:'x'.repeat(190000)}))}).length,10);assert.equal(bytes.registerMany({principal,people:[make({text:'x'.repeat(190000)})]}),null);assert.equal(bytes.registerMany({principal,people:[make()]}).length,1);
});
