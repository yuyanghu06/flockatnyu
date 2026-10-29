import assert from 'node:assert/strict';
import {createContactsStore} from '../../server/contacts/store.js';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {pg_trgm} from '@electric-sql/pglite/contrib/pg_trgm';
import {fuzzystrmatch} from '@electric-sql/pglite/contrib/fuzzystrmatch';

// One serialized database provides the real shared search implementation to
// every fake PostgREST instance. Each request rolls its private snapshot back.
let searchDatabase,searchQueue=Promise.resolve();
export async function createContactSearchDatabase(){
 const db=new PGlite({extensions:{pg_trgm,fuzzystrmatch}});
 await db.exec('create role anon;create role authenticated;create role service_role bypassrls;');
 for(const file of ['202610260047_contacts.sql','202610260048_contacts_search.sql','202610260049_contacts_cache.sql','202610260050_gmail_contact_enrichment.sql','202610270051_contacts_native_fields.sql','202610270054_contacts_exa_fields.sql','202610280056_contacts_search_fields.sql'])await db.exec(await readFile(new URL('../../supabase/migrations/'+file,import.meta.url),'utf8'));
 return db;
}
async function sqlSearch(rows,body,{matchEmail=false}={}){
 const pending=searchQueue.then(async()=>{
  const db=await(searchDatabase??=createContactSearchDatabase());
  await db.exec('begin;truncate public.contacts;');
  try{
   for(const row of rows)await db.query('insert into public.contacts(id,created_at,updated_at,raw_input,lookup_email) values($1,$2,$3,$4::jsonb,$5)',[row.id,row.created_at,row.updated_at,JSON.stringify(row.raw_input),row.lookup_email??null]);
   await db.exec('set local role service_role');
   if(matchEmail)return (await db.query('select id,created_at::text,updated_at::text,raw_input,lookup_email from public.contacts_match_email($1)',[body.p_email])).rows;
   const args=['p_query','p_limit','p_offset','p_name','p_workplace','p_email_presence','p_phone_presence','p_sort'];
   const defaults=['',5,0,'','','any','any','auto'];
   return (await db.query(`select id,created_at::text,updated_at::text,fields from public.contacts_search_fields(${args.map((key,i)=>`${key}=>$${i+1}`).join(',')})`,args.map((key,i)=>body[key]??defaults[i]))).rows;
  }finally{await db.exec('rollback');}
 });
 searchQueue=pending.catch(()=>{});return pending;
}

export const contactIds={rae:'41000000-0000-4000-8000-000000000001',other:'41000000-0000-4000-8000-000000000002'};
export const contactPrincipal={id:'synthetic-contact-member',allowedSourceIds:[]};
export const contactStamp='2026-10-26T16:00:00.123456+00:00';
export const contactFields={first_name:'Rae',last_name:'Example',email:'rae@example.com',phone_number:'+1 001 555 0100',workplace:'Example Labs',notes:'Prefers email'};
export function contactRow(id=contactIds.rae,fields={}){
 return {id,created_at:contactStamp,updated_at:contactStamp,raw_input:{...contactFields,...fields}};
}

// Simulates only PostgREST persistence. Production URL generation, result
// validation, request-local reads and writes remain in the real adapters.
export function contactStorage({rows=[contactRow()],readUnavailable=false,writeFailure,conflict=false}={}){
 let state=structuredClone(rows),serial=100;
 const requests=[],attempts=[],applied=[];
 const response=(body,status=200,headers={})=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json',...headers}});
 const fetchImpl=async(input,init={})=>{
  const url=new URL(input),method=init.method||'GET',body=init.body?JSON.parse(init.body):undefined;
  assert.equal(url.origin,'https://contacts-storage.example.test');
  assert(['/rest/v1/contacts','/rest/v1/rpc/contacts_search_fields','/rest/v1/rpc/contacts_match_email'].includes(url.pathname));
  const request={method,url:url.toString(),body:structuredClone(body),headers:structuredClone(init.headers)};requests.push(request);
  if(['/rest/v1/rpc/contacts_search_fields','/rest/v1/rpc/contacts_match_email'].includes(url.pathname)){
   assert.equal(method,'POST');if(readUnavailable)throw Error('Synthetic private backend failure');
   return response(await sqlSearch(state,body,{matchEmail:url.pathname.endsWith('/contacts_match_email')}));
  }
  if(method==='GET'&&readUnavailable)throw Error('Synthetic private backend failure');
  const eq=key=>url.searchParams.get(key)?.replace(/^eq\./,'');
  const matching=()=>state.filter(row=>(!eq('id')||row.id===eq('id'))&&(!eq('updated_at')||row.updated_at===eq('updated_at')));
  if(method==='GET'){
   let found=matching();const or=url.searchParams.get('or');
   if(or){
    const patterns=[...or.matchAll(/ilike\.(?:"((?:\\.|[^"\\])*)"|([^,)]+))/g)].map(match=>(match[1]??match[2]).replace(/^[*%]|[*%]$/g,'').replace(/\\(.)/g,'$1').toLowerCase());
    assert(patterns.length,'Fixture must recognize a real bounded search filter');
    found=found.filter(row=>Object.values(row.raw_input).some(value=>typeof value==='string'&&patterns.some(needle=>value.toLowerCase().includes(needle))));
   }
   const offset=Number(url.searchParams.get('offset')||0),limit=Number(url.searchParams.get('limit')||found.length);
   return response(found.slice(offset,offset+limit),200,{'content-range':`${offset}-${Math.min(found.length,offset+limit)-1}/${found.length}`});
  }
  attempts.push(request);
  if(writeFailure==='before')throw Error('Synthetic private write transport failure');
  if(conflict&&(method==='PATCH'||method==='DELETE'))return response([]);
  let changed;
  if(method==='POST'){
   const supplied=Array.isArray(body)?body[0]:body;
   const id=supplied.id??`41000000-0000-4000-8000-${String(serial++).padStart(12,'0')}`;
   changed=[{id,created_at:contactStamp,updated_at:contactStamp,raw_input:structuredClone(supplied.raw_input)}];state.push(...changed);
  }else if(method==='PATCH'){
   changed=matching().map(old=>({...old,raw_input:structuredClone(body.raw_input),updated_at:`2026-10-26T16:01:00.${String(serial++).padStart(6,'0')}+00:00`}));
   state=state.map(old=>changed.find(row=>row.id===old.id)??old);
  }else if(method==='DELETE'){
   changed=matching();state=state.filter(old=>!changed.some(row=>row.id===old.id));
  }else throw Error('Unexpected persistence method');
  if(changed.length)applied.push({...request,rows:structuredClone(changed)});
  if(writeFailure==='after')throw Error('Synthetic lost response after commit');
  return response(changed,method==='POST'?201:200);
 };
 const store=createContactsStore({env:{SUPABASE_URL:'https://contacts-storage.example.test',SUPABASE_SERVICE_ROLE_KEY:'synthetic-server-key'},fetchImpl});
 return {store,fetchImpl,requests,attempts,applied,get state(){return structuredClone(state);}};
}
