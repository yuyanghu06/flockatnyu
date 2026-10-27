import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {pg_trgm} from '@electric-sql/pglite/contrib/pg_trgm';
import {fuzzystrmatch} from '@electric-sql/pglite/contrib/fuzzystrmatch';

test('contacts search SQL: full-table fuzzy matching, combined filters and stable pages stay private and read-only',async t=>{
 const db=new PGlite({extensions:{pg_trgm,fuzzystrmatch}});
 const id=n=>`43000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
 const rows=[
  {first_name:'Avery',last_name:'Chen',workplace:'Northstar Labs',email:'avery@example.com',phone_number:' +1 001 ',legacy:{keep:['native',null]}},
  {first_name:'Avrey',last_name:'Literal',workplace:'Other',email:'avrey@example.com'},
  {first_name:'John',last_name:'Smith',workplace:'Example Studio',phone_number:'00123'},
  {first_name:'Jonas',last_name:'Short',workplace:'Other'},
  {first_name:'Punct%_*',last_name:'Literal',workplace:'Other'},
  {first_name:'',last_name:'',email:'   ',phone_number:'\t',notes:'Whitespace presence probe'},
  {first_name:null,last_name:{native:'object'},email:12,phone_number:false,notes:'Native shapes probe'},
  {first_name:'Avery',last_name:'Chen',workplace:'Northstar Labs',email:'second@example.com',phone_number:' '},
  ...Array.from({length:14},(_,i)=>({first_name:`Newer ${i}`,last_name:'Unrelated',workplace:'Elsewhere'})),
  {first_name:'Oldest',last_name:'Target',workplace:'Northstar Labs',email:'oldest@example.com',phone_number:'1'}
 ];
 try{
  await db.exec('create role anon;create role authenticated;create role public_probe;create role service_role bypassrls;create table public.search_sentinel(id integer primary key,note text);insert into public.search_sentinel values(1,\'Preserve this unrelated row\');');
  await db.exec(await readFile(new URL('../supabase/migrations/202610260047_contacts.sql',import.meta.url),'utf8'));
  for(const [index,raw] of rows.entries())await db.query('insert into public.contacts(id,created_at,updated_at,raw_input) values($1,$2,$2,$3::jsonb)',[id(index+1),`2026-10-${String(index===rows.length-1?1:Math.min(index+2,26)).padStart(2,'0')}T12:00:00.123456Z`,JSON.stringify(raw)]);
  const snapshot=async()=>({contacts:(await db.query('select id,created_at::text,updated_at::text,raw_input from public.contacts order by id')).rows,sentinel:(await db.query('select * from public.search_sentinel')).rows,access:(await db.query("select relacl::text,relrowsecurity,relforcerowsecurity from pg_class where oid='public.search_sentinel'::regclass")).rows});
  const before=await snapshot();await db.exec(await readFile(new URL('../supabase/migrations/202610260048_contacts_search.sql',import.meta.url),'utf8'));assert.deepEqual(await snapshot(),before,'Applying search migration must not rewrite saved or unrelated rows');
  const search=async(args={})=>{const names=['p_query','p_limit','p_offset','p_name','p_workplace','p_email_presence','p_phone_presence','p_sort'],defaults=['',10,0,'','','any','any','auto'];await db.exec('begin;set local role service_role');try{return(await db.query(`select id,raw_input from public.contacts_search(${names.map((name,i)=>`${name}=>$${i+1}`).join(',')})`,names.map((key,i)=>args[key]??defaults[i]))).rows;}finally{await db.exec('rollback');}};
  await t.test('exact and literal matches precede bounded typos; combined names and older rows are searched globally',async()=>{
   assert.equal((await search({p_query:'Avrey'}))[0].id,id(2));assert((await search({p_query:'Avrey'})).some(row=>row.id===id(1)),'Adjacent first-name transposition should find Avery');
   assert((await search({p_query:'Jhon'})).some(row=>row.id===id(3)));assert((await search({p_query:'Avery Chne'})).some(row=>row.id===id(1)));assert((await search({p_query:'Avrey Chen'})).some(row=>row.id===id(1)),'A first-name transposition in a full-name query should also find the contact');
   assert.deepEqual(new Set((await search({p_query:'Avery Chen'})).slice(0,2).map(row=>row.id)),new Set([id(1),id(8)]));
   assert((await search({p_query:'Northstar Lbas'})).some(row=>row.id===id(1)),'Narrow workplace typo should match');
   assert.deepEqual((await search({p_query:'Jon'})).map(row=>row.id),[id(4)],'Short queries are literal only');
   assert.deepEqual(await search({p_query:'qxzv-no-person-8273'}),[]);
   assert.deepEqual((await search({p_query:'%_*'})).map(row=>row.id),[id(5)],'Punctuation stays literal');
   assert.equal((await search({p_query:'Oldest Target',p_limit:1}))[0].id,id(rows.length),'Rank and filter happen before limiting, including an old record beyond the initial page');
  });
  await t.test('AND filters, supported-string presence, stable sorts and paging preserve all candidates',async()=>{
   assert.deepEqual((await search({p_name:'avery chen',p_workplace:'Northstar',p_email_presence:'yes',p_phone_presence:'yes'})).map(row=>row.id),[id(1)]);
   assert.deepEqual((await search({p_query:'avery',p_name:'chen',p_workplace:'northstar',p_phone_presence:'no'})).map(row=>row.id),[id(8)]);
   const noEmail=await search({p_email_presence:'no',p_sort:'name_asc'});assert(!noEmail.some(row=>[id(1),id(2),id(8),id(rows.length)].includes(row.id)));
   assert.deepEqual((await search({p_query:'Whitespace presence probe',p_email_presence:'no',p_phone_presence:'no'})).map(row=>row.id),[id(6)]);assert.deepEqual((await search({p_query:'Native shapes probe',p_email_presence:'no',p_phone_presence:'no'})).map(row=>row.id),[id(7)],'Native nonstrings are preserved but never count as supported display values');
   const named=await search({p_sort:'name_asc',p_limit:10});assert.deepEqual(named.slice(0,3).map(row=>row.id),[id(1),id(8),id(2)]);
   const asc=[];for(let offset=0;offset<rows.length;offset+=10)asc.push(...(await search({p_sort:'name_asc',p_limit:10,p_offset:offset})).slice(0,10).map(row=>row.id));assert.equal(new Set(asc).size,rows.length);assert.deepEqual(asc.slice(-2),[id(6),id(7)],'Blank/nonstring names sort last with stable UUID tie-break');
   const descending=[];for(let offset=0;offset<rows.length;offset+=10)descending.push(...(await search({p_sort:'name_desc',p_limit:10,p_offset:offset})).slice(0,10).map(row=>row.id));assert.deepEqual(descending.slice(-2),[id(6),id(7)]);
   assert.equal((await search({p_sort:'oldest'}))[0].id,id(rows.length));assert.notEqual((await search({p_sort:'newest'}))[0].id,id(rows.length));
  });
  await t.test('only service role executes search; invalid options fail and nothing changes',async()=>{
   for(const role of ['anon','authenticated','public_probe']){await db.exec(`begin;set local role ${role}`);try{await assert.rejects(()=>db.query('select * from public.contacts_search()'),e=>e.code==='42501');}finally{await db.exec('rollback');}}
   for(const [key,value] of [['p_query','x'.repeat(257)],['p_name','x'.repeat(201)],['p_workplace','x'.repeat(501)],['p_limit',0],['p_limit',11],['p_offset',-1],['p_offset',10001],['p_sort','random'],['p_email_presence','maybe'],['p_phone_presence','maybe']])await assert.rejects(()=>search({[key]:value}));
   assert.deepEqual(await snapshot(),before,'Search and invalid queries preserve raw objects/timestamps and unrelated data');
   assert.deepEqual((await db.query("select relrowsecurity,relforcerowsecurity from pg_class where oid='public.contacts'::regclass")).rows[0],{relrowsecurity:true,relforcerowsecurity:true});
  });
 }finally{await db.close();}
});
