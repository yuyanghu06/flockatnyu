import test from 'node:test';
import assert from 'node:assert/strict';
import {contactsHttpFixture,contactRow,contactIds} from './fixtures/contacts-ui.mjs';
import {contactStamp,contactFields} from './fixtures/contacts-store.mjs';

test('contacts HTTP: authenticated CRUD projects six fields and preserves complete saved data',async()=>{
 const legacy={legacy:{source:'Keep this exact object'},other_values:[3,null]},other=contactRow(contactIds.other,{email:'other@example.com'});
 const h=contactsHttpFixture({rows:[contactRow(contactIds.rae,legacy),other],discordFailure:true});
 const listResponse=await h.request();assert.equal(listResponse.status,200);assert.match(listResponse.headers.get('cache-control'),/private.*no-store/);
 const list=await listResponse.json();assert.equal(list.status,'ready');assert.equal(list.contacts.length,2);assert.deepEqual(list.coverage,{complete:true,nextOffset:null});
 assert.deepEqual(list.contacts[0].fields,contactFields);assert(!JSON.stringify(list).includes('raw_input'));assert(!JSON.stringify(list).includes('Keep this exact object'));
 const read=await(await h.request(`/api/contacts/${contactIds.rae}`)).json();assert.equal(read.contact.updated_at,contactStamp);assert.deepEqual(read.contact.fields,contactFields);
 const createdResponse=await h.request('/api/contacts',{method:'POST',body:{fields:{first_name:'New',email:'new@example.com'}}});assert([200,201].includes(createdResponse.status));
 const created=await createdResponse.json();assert.equal(created.contactWrite.operation,'created');assert.deepEqual(created.contact.fields,{first_name:'New',last_name:'',email:'new@example.com',phone_number:'',workplace:'',notes:''});
 const patch=await h.request(`/api/contacts/${contactIds.rae}`,{method:'PATCH',body:{expectedUpdatedAt:contactStamp,fields:{workplace:'New workplace',notes:''}}});assert.equal(patch.status,200);
 const saved=await patch.json();assert.equal(saved.contactWrite.operation,'updated');assert.deepEqual(saved.contact.fields,{...contactFields,workplace:'New workplace',notes:''});
 assert.deepEqual(h.f.state.find(row=>row.id===contactIds.rae).raw_input,{...contactFields,...legacy,workplace:'New workplace',notes:''});
 const patchUrl=new URL(h.f.attempts.find(row=>row.method==='PATCH').url);assert.equal(patchUrl.searchParams.get('updated_at'),`eq.${contactStamp}`);
 const deletion=await h.request(`/api/contacts/${contactIds.rae}`,{method:'DELETE',body:{expectedUpdatedAt:saved.contact.updated_at}});assert.equal(deletion.status,200);
 const deleted=await deletion.json();assert.equal(deleted.contactWrite.operation,'deleted');assert(!deleted.contact);assert(!deleted.fields);assert(!deleted.raw_input);
 assert.deepEqual(h.f.state.find(row=>row.id===contactIds.other),other);assert.equal(h.f.state.length,2);assert.equal(h.discordCalls,0,'Contacts operations must not query Discord permissions or metadata');
});

test('contacts HTTP: query/body validation and exact versions reject invalid writes before persistence',async()=>{
 const h=contactsHttpFixture();
 for(const query of ['?extra=1','?query=a&query=b','?limit=0','?limit=11','?limit=1.5','?offset=-1','?offset=10001','?offset=01','?query='+('x'.repeat(257)),'?name='+('x'.repeat(201)),'?workplace='+('x'.repeat(501)),'?name=a&name=b','?emailPresence=maybe','?phonePresence=YES','?sort=random']){
  const response=await h.request('/api/contacts'+query);assert.equal(response.status,400,query.slice(0,80));assert.equal((await response.json()).status,'invalid_request');
 }
 for(const path of ['/api/contacts/not-a-uuid',`/api/contacts/${contactIds.rae}?extra=1`])assert.equal((await h.request(path)).status,400);
 for(const body of [{fields:{}},{fields:{first_name:''}},{fields:{email:null}},{fields:{unexpected:'x'}},{fields:{notes:'x'.repeat(4001)}},{fields:{first_name:'Test'},id:contactIds.rae},[],null]){
  assert.equal((await h.request('/api/contacts',{method:'POST',body})).status,400);
 }
 assert.equal((await h.request('/api/contacts',{method:'POST',body:'not-json'})).status,400);
 assert.equal((await h.request('/api/contacts',{method:'POST',body:{fields:{first_name:'Test'}},headers:{'content-type':'text/plain'}})).status,400);
 assert.equal((await h.request(`/api/contacts/${contactIds.rae}`,{method:'PATCH',body:{expectedUpdatedAt:contactStamp,fields:{},unexpected:true}})).status,400);
 assert.equal((await h.request(`/api/contacts/${contactIds.rae}`,{method:'DELETE',body:{expectedUpdatedAt:contactStamp,fields:{}}})).status,400);
 assert.equal(h.f.requests.length,0,'Structurally invalid requests do not query storage');
 for(const method of ['PATCH','DELETE']){
  const response=await h.request(`/api/contacts/${contactIds.rae}`,{method,body:{expectedUpdatedAt:'2026-10-26T16:00:00.123Z',...(method==='PATCH'?{fields:{notes:'Changed'}}:{})}});
  assert.equal(response.status,409);assert.equal((await response.json()).status,'conflict');
 }
 assert.equal(h.f.attempts.length,0,'Rounded or stale versions cannot mutate a saved contact');
});

test('contacts HTTP: shared fuzzy/full-name lookup combines filters and sorts before paging',async()=>{
 const id=n=>`44000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
 const rows=[...Array.from({length:12},(_,i)=>contactRow(id(i+1),{first_name:`Unrelated ${i}`,last_name:'Elsewhere',workplace:'Other'})),contactRow(id(20),{first_name:'Avery',last_name:'Chen',workplace:'Northstar Labs',phone_number:'00123',legacy:{private:'not projected'}}),contactRow(id(21),{first_name:'Avery',last_name:'Chen',workplace:'Northstar Labs',phone_number:' '})];
 const h=contactsHttpFixture({rows});
 const result=await(await h.request('/api/contacts?'+new URLSearchParams({query:'Avrey',name:'Avery Chen',workplace:'northstar',emailPresence:'yes',phonePresence:'yes',sort:'name_asc',limit:'1'}))).json();assert.equal(result.status,'ready');assert.deepEqual(result.contacts.map(row=>row.id),[id(20)]);assert.deepEqual(result.coverage,{complete:true,nextOffset:null});assert.equal(result.contacts[0].fields.phone_number,'00123');assert(!JSON.stringify(result).includes('private'));
 const first=await(await h.request('/api/contacts?name=Avery%20Chen&sort=name_asc&limit=1')).json(),second=await(await h.request('/api/contacts?name=Avery%20Chen&sort=name_asc&limit=1&offset=1')).json();assert.deepEqual(first.contacts.map(row=>row.id),[id(20)]);assert.deepEqual(first.coverage,{complete:false,nextOffset:1});assert.deepEqual(second.contacts.map(row=>row.id),[id(21)]);assert.deepEqual(second.coverage,{complete:true,nextOffset:null});assert.equal(h.f.attempts.length,0);
});

test('contacts HTTP: session and origin boundaries are separate from Discord access',async()=>{
 const h=contactsHttpFixture();
 assert.equal((await h.request('/api/contacts',{session:false})).status,403);
 for(const headers of [{origin:'https://evil.example'},{origin:'null'},{'sec-fetch-site':'cross-site'}]){
  assert.equal((await h.request('/api/contacts',{method:'POST',body:{fields:{first_name:'Test'}},headers})).status,403);
 }
 assert.equal((await h.request('/api/contacts',{headers:{'sec-fetch-site':'cross-site'}})).status,403);assert.equal(h.f.requests.length,0);
 const local=contactsHttpFixture({production:false}),env={incoming:{socket:{remoteAddress:'127.0.0.1'}}};
 for(const path of ['/api/contacts','/api/contacts?query=Rae&limit=1&offset=0',`/api/contacts/${contactIds.rae}`]){
  assert.equal((await local.request(path,{session:false,env})).status,200,'Exact localhost read path must work without Origin');
 }
 assert.equal((await local.request('/api/contacts',{session:false,env,headers:{'sec-fetch-site':'cross-site'}})).status,403);
 assert.equal((await local.request('/api/contacts/anything',{session:false,env})).status,403);
 const noOrigin=new Request('http://127.0.0.1/api/contacts',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({fields:{first_name:'Test'}})});
 assert.equal((await local.app.fetch(noOrigin,env)).status,403);
});

test('contacts HTTP: empty, unavailable, conflicts and uncertain writes report only confirmed outcomes',async()=>{
 const empty=contactsHttpFixture({rows:[]});const result=await(await empty.request()).json();assert.deepEqual(result.contacts,[]);assert.deepEqual(result.coverage,{complete:true,nextOffset:null});
 assert.equal((await empty.request(`/api/contacts/${contactIds.rae}`)).status,404);
 const unavailable=contactsHttpFixture({readUnavailable:true});const failed=await unavailable.request();assert.equal(failed.status,503);assert.deepEqual(await failed.json(),{status:'unavailable'});
 const conflict=contactsHttpFixture({conflict:true});const rejected=await conflict.request(`/api/contacts/${contactIds.rae}`,{method:'PATCH',body:{expectedUpdatedAt:contactStamp,fields:{notes:'Changed'}}});
 assert.equal(rejected.status,409);assert.deepEqual(await rejected.json(),{status:'conflict'});assert.equal(conflict.f.applied.length,0);
 const unknown=contactsHttpFixture({writeFailure:'after'});const uncertain=await unknown.request('/api/contacts',{method:'POST',body:{fields:{first_name:'Uncertain'}}});
 assert.equal(uncertain.status,503);assert.deepEqual(await uncertain.json(),{status:'unavailable',reason:'write_outcome_unknown'});assert.equal(unknown.f.applied.length,1);
 const thrown=contactsHttpFixture();thrown.mode.create='throw';const raw=await(await thrown.request('/api/contacts',{method:'POST',body:{fields:{first_name:'Test'}}})).json();assert.deepEqual(raw,{status:'unavailable',reason:'write_outcome_unknown'});assert(!JSON.stringify(raw).includes('PRIVATE'));
});
