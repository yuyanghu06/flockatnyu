import test from 'node:test';
import assert from 'node:assert/strict';
import {createContactsStore,CONTACT_FIELDS} from '../server/contacts/store.js';
import {createContactsTools} from '../tools/contacts/index.js';
import {contactStorage,contactRow,contactIds,contactFields,contactPrincipal,contactStamp} from './fixtures/contacts-store.mjs';

const request=f=>createContactsTools({store:f.store}).createRequest({principal:contactPrincipal,userMessage:'Manage these contacts as requested.'});
const call=(tools,name,args,extra={})=>tools.execute({name,arguments:args,principal:contactPrincipal,...extra});

test('contacts: backend CRUD preserves raw fields and exact read versions',async()=>{
 const legacy={legacy:{member_id:7,source:'Human entry'},nested:['keep',null]},other=contactRow(contactIds.other,{email:'other@example.com'});
 const f=contactStorage({rows:[contactRow(contactIds.rae,legacy),other]}),tools=request(f);
 assert(Object.isFrozen(CONTACT_FIELDS));assert.equal(Object.keys(CONTACT_FIELDS).length,6);
 const create=await call(tools,'create_contact',{fields:{first_name:'Test',email:'test@example.com'}});
 assert.equal(create.status,'ready');assert.deepEqual(create.contact.raw_input,{first_name:'Test',last_name:'',email:'test@example.com',phone_number:'',workplace:'',notes:''});
 assert.deepEqual(Object.keys(create.contactWrite).sort(),['id','operation','updated_at']);
 assert.equal(create.contactWrite.operation,'created');
 assert.deepEqual(await call(tools,'create_contact',{fields:{first_name:'Test',email:'test@example.com'}}),create);
 assert.equal(f.applied.length,1,'Duplicate creation returns its receipt without adding another row');
 const args={contactId:contactIds.rae,expectedUpdatedAt:contactStamp,fields:{workplace:'New Labs',notes:''}};
 assert.equal((await call(tools,'update_contact',args)).status,'read_required');assert.equal(f.attempts.length,1);
 await call(tools,'search_contacts',{query:'rae@example.com'});
 assert.equal((await call(tools,'update_contact',args)).status,'read_required','Search is not an exact read permit');
 const read=await call(tools,'read_contact',{contactId:contactIds.rae});assert.equal(read.status,'ready');
 assert.equal((await call(tools,'update_contact',{...args,expectedUpdatedAt:'2026-10-26T16:00:00.123Z'})).status,'read_required','Do not round away timestamp microseconds');
 const update=await call(tools,'update_contact',args);assert.equal(update.status,'ready');
 assert.deepEqual(update.contact.raw_input,{...contactFields,workplace:'New Labs',notes:''},'Tool results contain only the supported fields');
 assert.deepEqual(f.state.find(row=>row.id===contactIds.rae).raw_input,{...contactFields,...legacy,workplace:'New Labs',notes:''},'Private exact snapshot preserves every untouched native field');
 const patch=f.attempts.find(row=>row.method==='PATCH'),url=new URL(patch.url);
 assert.equal(url.searchParams.get('id'),`eq.${contactIds.rae}`);assert.equal(url.searchParams.get('updated_at'),`eq.${contactStamp}`);
 const beforeReplay=f.attempts.length;assert.deepEqual(await call(tools,'update_contact',args),update);assert.equal(f.attempts.length,beforeReplay,'A replay returns the receipt without another mutation');
 assert.equal((await call(tools,'delete_contact',{contactId:contactIds.rae,expectedUpdatedAt:update.contact.updated_at})).status,'read_required');
 await call(tools,'read_contact',{contactId:contactIds.rae});
 const deletion=await call(tools,'delete_contact',{contactId:contactIds.rae,expectedUpdatedAt:update.contact.updated_at});assert.equal(deletion.status,'ready');assert.equal(deletion.contactWrite.operation,'deleted');
 assert.deepEqual(f.state.find(row=>row.id===contactIds.other),other);assert(!f.state.some(row=>row.id===contactIds.rae));
 assert.equal(new URL(f.attempts.at(-1).url).searchParams.get('updated_at'),`eq.${update.contact.updated_at}`);
});

test('contacts: authorization and structural failures do not dispatch persistence',async()=>{
 const f=contactStorage(),root=createContactsTools({store:f.store}),tools=request(f);
 assert.equal((await root.execute({name:'search_contacts',arguments:{}})).status,'forbidden');
 assert.equal((await call(tools,'read_contact',{contactId:contactIds.rae},{principal:{id:'different',allowedSourceIds:[]}})).status,'forbidden');
 const noInstruction=root.createRequest({principal:contactPrincipal,userMessage:''});
 assert.equal((await call(noInstruction,'create_contact',{fields:{first_name:'Test'}})).status,'forbidden');
 for(const [name,args] of [
  ['create_contact',{fields:{first_name:''}}],['create_contact',{fields:{email:null}}],['create_contact',{fields:{nickname:'Extra'}}],
  ['create_contact',{fields:{notes:'x'.repeat(CONTACT_FIELDS.notes+1)}}],['create_contact',{fields:[]}],
  ['update_contact',{contactId:contactIds.rae,expectedUpdatedAt:contactStamp,fields:{}}],
  ['update_contact',{contactId:contactIds.rae,expectedUpdatedAt:'yesterday',fields:{notes:'Test'}}],
  ['read_contact',{contactId:'not-a-uuid'}],['search_contacts',{query:'x',limit:11}],['search_contacts',{offset:-1}],
  ['search_contacts',{limit:1.5}],['search_contacts',{query:'x'.repeat(257)}],['search_contacts',{unexpected:true}],
  ['search_contacts',{name:'x'.repeat(201)}],['search_contacts',{workplace:'x'.repeat(501)}],
  ['search_contacts',{emailPresence:'sometimes'}],['search_contacts',{phonePresence:false}],['search_contacts',{sort:'random'}]
 ])assert.equal((await call(tools,name,args)).status,'invalid_request',name);
 assert.equal(f.requests.length,0);
 const missing=createContactsTools({store:{configured:false}});
 assert.equal((await missing.execute({name:'search_contacts',arguments:{},principal:contactPrincipal})).status,'not_configured');
 const aborted=AbortSignal.abort();assert.equal((await call(tools,'read_contact',{contactId:contactIds.rae},{signal:aborted})).status,'aborted');assert.equal(f.requests.length,0);
});

test('contacts: SQL-backed fuzzy search and page coverage distinguish more results from absence',async()=>{
 const rows=Array.from({length:4},(_,i)=>contactRow(`41000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`,{first_name:`Person ${i}`}));
 const f=contactStorage({rows}),tools=request(f);
 const first=await call(tools,'search_contacts',{limit:2});assert.equal(first.contacts.length,2);assert.deepEqual(first.coverage,{complete:false,nextOffset:2});
 const last=await call(tools,'search_contacts',{limit:2,offset:2});assert.equal(last.contacts.length,2);assert.deepEqual(last.coverage,{complete:true,nextOffset:null});
 const found=await call(tools,'search_contacts',{query:'Person 2',limit:2});assert.equal(found.contacts.length,1);assert.equal(found.contacts[0].raw_input.first_name,'Person 2');
 const injection='Rae),id.not.is.null,raw_input->>email.ilike.%*';
 const result=await call(tools,'search_contacts',{query:injection});assert.equal(result.status,'ready');assert.equal(result.contacts.length,0);
 const lastRequest=f.requests.at(-1),url=new URL(lastRequest.url);assert.equal(url.pathname,'/rest/v1/rpc/contacts_search_fields');assert.equal(url.search,'');assert.equal(lastRequest.body.p_query,injection,'Untrusted punctuation is one bound RPC argument');
 const combined=contactStorage({rows:[contactRow(contactIds.rae,{first_name:'Avery',last_name:'Chen',workplace:'Northstar Labs'}),contactRow(contactIds.other,{first_name:'Avery',last_name:'Cheng',workplace:'Another Studio',phone_number:''})]});
 const filtered=await call(request(combined),'search_contacts',{query:'Avrey',name:'Chen',workplace:'Northstar',emailPresence:'yes',phonePresence:'yes',sort:'name_asc'});assert.equal(filtered.status,'ready');assert.deepEqual(filtered.contacts.map(row=>row.id),[contactIds.rae]);assert.equal(combined.attempts.length,0,'Search RPC is read-only despite using POST transport');
 for(const value of ['https://unrelated.invalid/path','https://example.com/?credential=x','https://user:password@example.com','http://example.com']){
  const store=createContactsStore({env:{SUPABASE_URL:value,SUPABASE_SERVICE_ROLE_KEY:'inert'},fetchImpl:()=>{throw Error('Must not dispatch');}});
  assert.equal(store.configured,false);
 }
});

test('contacts: conflicts and uncertain writes are honest and never blindly replayed',async()=>{
 const f=contactStorage({conflict:true}),tools=request(f);await call(tools,'read_contact',{contactId:contactIds.rae});
 const args={contactId:contactIds.rae,expectedUpdatedAt:contactStamp,fields:{notes:'Changed'}};
 const conflict=await call(tools,'update_contact',args);assert.equal(conflict.status,'conflict');assert.equal(conflict.contactWrite,undefined);assert.equal(f.applied.length,0);
 for(const writeFailure of ['before','after']){
  const broken=contactStorage({writeFailure}),requestTools=request(broken);
  const unknown=await call(requestTools,'create_contact',{fields:{first_name:'Uncertain'}});
  assert.equal(unknown.status,'unavailable');assert.equal(unknown.reason,'write_outcome_unknown');assert.equal(unknown.contactWrite,undefined);
  assert.deepEqual(await call(requestTools,'create_contact',{fields:{first_name:'Uncertain'}}),unknown);
  const blocked=await call(requestTools,'create_contact',{fields:{first_name:'Different'}});assert.equal(blocked.reason,'write_outcome_unknown');assert.equal(broken.attempts.length,1);
  assert.equal(broken.applied.length,writeFailure==='after'?1:0);
  assert(!JSON.stringify(unknown).includes('Synthetic'),'No raw failure details returned');
 }
 const missing=contactStorage({rows:[]});assert.equal((await call(request(missing),'read_contact',{contactId:contactIds.rae})).status,'not_found');
 for(const body of ['not-json','null','[]','{}',JSON.stringify([{id:'invalid',raw_input:{}}]),' '.repeat(256001)]){
  const store=createContactsStore({env:{SUPABASE_URL:'https://contacts-storage.example.test',SUPABASE_SERVICE_ROLE_KEY:'inert'},fetchImpl:async()=>new Response(body)});
  const result=await store.create({fields:{first_name:'Test'}});assert.equal(result.reason,'write_outcome_unknown');assert.notEqual(result.status,'ready');
 }
});
