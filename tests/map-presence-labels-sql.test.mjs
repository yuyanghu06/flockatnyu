import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {vector} from '@electric-sql/pglite-pgvector';

const directory=new URL('../supabase/migrations/',import.meta.url);
async function migration(n){const file=(await readdir(directory)).find(f=>f.endsWith('.sql')&&Number(f.slice(8,12))===n);assert(file,`migration ${n} exists`);return readFile(new URL(file,directory),'utf8');}
const home='bobst-library',target='nyu-kimmel-center',source=randomUUID();
const entry=(id,extra={})=>({person_id:id,status:'self_reported',valid_from:'2026-10-17T12:00:00Z',expires_at:'2026-10-17T14:00:00Z',source_id:source,source_url:'https://discord.com/channels/123/456/789',...extra});
async function put(db,id,value){return db.query('update public.map_buildings set people_here=$2::jsonb where id=$1',[id,JSON.stringify(value)]);}
async function occupants(db,id=home){return(await db.query('select people_here from public.map_buildings where id=$1',[id])).rows[0].people_here;}
async function rejected(db,fn,codes=['23514','23503','22007','22008']){await db.exec('savepoint rejected');await assert.rejects(fn,e=>codes.includes(e.code));await db.exec('rollback to savepoint rejected;release savepoint rejected');}
async function probe(db,fn){await db.exec('begin;set local role service_role');try{await fn();}finally{await db.exec('rollback');}}
async function metadata(db){return(await db.query('select id,name,aliases from public.map_buildings order by id')).rows;}
async function acls(db){return(await db.query("select relname,relacl::text,relrowsecurity,relforcerowsecurity from pg_class where relnamespace='public'::regnamespace and relkind='r' order by relname")).rows;}

test('023 real SQL: table-driven presence label contract with fixed catalogue preserved',async t=>{
 const db=new PGlite({extensions:{vector}});
 try{
  await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create role map_public_probe;');
  for(let n=1;n<=22;n++)await db.exec(await migration(n));
  const ids=(await db.query('select id from public.map_people order by id')).rows.map(x=>x.id),[a,b]=ids;
  const original=[entry(b,{status:'planned'}),entry(a)];await put(db,home,original);
  const fixed=await metadata(db),grants=await acls(db),people=(await db.query('select to_jsonb(p) value from public.map_people p order by id')).rows;
  const sql=await migration(23);await db.exec(sql);
  await t.test('existing six-field entries gain only empty labels in original array order',async()=>{
   assert.deepEqual(await occupants(db),original.map(e=>({...e,label:''})));
   assert.deepEqual(await metadata(db),fixed);assert.deepEqual(await acls(db),grants);
   assert.deepEqual((await db.query('select to_jsonb(p) value from public.map_people p order by id')).rows,people);
  });
  await t.test('blank, whitespace, literal HTML, Unicode and exactly 200 Unicode code points survive verbatim',()=>probe(db,async()=>{
   for(const label of ['', '  ', 'Study group · 你好 🗽', '<img src=x onerror=alert(1)>', '🗽'.repeat(200)]){
    const value=entry(a,{label});await put(db,home,[value]);assert.deepEqual(await occupants(db),[value]);
    assert.deepEqual((await db.query("select people_here from public.map_get_buildings('2026-10-17T13:00:00Z') where id=$1",[home])).rows[0].people_here,[value]);
   }
  }));
  await t.test('missing/null/non-string/201-code-point labels and additional fields fail without mutation',()=>probe(db,async()=>{
   const before=await occupants(db);
   for(const value of [entry(a),entry(a,{label:null}),entry(a,{label:1}),entry(a,{label:false}),entry(a,{label:[]}),entry(a,{label:{}}),entry(a,{label:'x'.repeat(201)}),entry(a,{label:'🗽'.repeat(201)}),entry(a,{label:'OK',extra:'no'})]){
    await rejected(db,()=>put(db,home,[value]));assert.deepEqual(await occupants(db),before);
   }
  }));
  await t.test('existing source, person, status, timestamp and duplicate validation stays enforced',()=>probe(db,async()=>{
   for(const extra of [{person_id:randomUUID()},{source_id:'invalid'},{source_url:'http://unsafe.test'},{status:'inferred'},{valid_from:'infinity'},{valid_from:'2026-10-17'},{expires_at:'2026-10-17T12:00:00Z'},{expires_at:'invalid'}])await rejected(db,()=>put(db,home,[entry(a,{label:'Here',...extra})]));
   await rejected(db,()=>put(db,home,[entry(a,{label:'one'}),entry(a,{label:'two'})]));
  }));
  await t.test('all seven fields must be strings and every original required key remains required',()=>probe(db,async()=>{
   const valid=entry(a,{label:'Here'});
   for(const key of Object.keys(valid)){
    const missing={...valid};delete missing[key];await rejected(db,()=>put(db,home,[missing]));
    await rejected(db,()=>put(db,home,[{...valid,[key]:null}]));
   }
  }));
  await t.test('whole-object RPC moves label verbatim and preserves other people and planned locations',()=>probe(db,async()=>{
   const other=entry(b,{label:'Other'}),planned=entry(a,{status:'planned',label:'Later'}),move=entry(a,{label:'Studying 📚'});
   await put(db,home,[entry(a,{label:'Before'}),other]);await put(db,'stern-school-of-business',[planned]);
   await db.query('select public.map_set_person_location($1,$2,$3::jsonb)',[a,target,JSON.stringify(move)]);
   assert.deepEqual(await occupants(db,home),[other]);assert.deepEqual(await occupants(db,target),[move]);assert.deepEqual(await occupants(db,'stern-school-of-business'),[planned]);assert.deepEqual(await metadata(db),fixed);
   const before=await occupants(db,target);await rejected(db,()=>db.query('select public.map_set_person_location($1,$2,$3::jsonb)',[a,home,JSON.stringify(entry(a))]));assert.deepEqual(await occupants(db,target),before);
  }));
  await t.test('runtime remains people_here-only with no catalogue insert/update/delete or timestamp control',()=>probe(db,async()=>{
   for(const column of ['id','name','aliases','people_here','updated_at'])assert.equal((await db.query("select has_column_privilege('service_role','public.map_buildings',$1,'UPDATE') allowed",[column])).rows[0].allowed,column==='people_here');
   for(const query of ["update public.map_buildings set name='Changed' where id=$1","update public.map_buildings set people_here='[]',aliases=aliases where id=$1","update public.map_buildings set updated_at=now() where id=$1",'delete from public.map_buildings where id=$1'])await rejected(db,()=>db.query(query,[home]),['42501']);
   await rejected(db,()=>db.query("insert into public.map_buildings(id,name) values('new','New')"),['42501']);assert.deepEqual(await metadata(db),fixed);
  }));
  await t.test('anonymous/authenticated/public callers retain no read or write/RPC access',async()=>{
   for(const role of ['anon','authenticated','map_public_probe']){
    await db.exec('begin;set local role '+role);try{
     await rejected(db,()=>db.query('select * from public.map_buildings'),['42501']);
     await rejected(db,()=>put(db,home,[entry(a,{label:'Here'})]),['42501']);
     await rejected(db,()=>db.query('select public.map_set_person_location($1,$2,$3::jsonb)',[a,home,JSON.stringify(entry(a,{label:'Here'}))]),['42501']);
    }finally{await db.exec('rollback');}
   }
  });
  await t.test('migration rerun preserves existing custom labels, field values and ordering',async()=>{
   const custom=[entry(b,{status:'planned',label:'Custom 🗽'}),entry(a,{label:''})];await put(db,home,custom);await db.exec(sql);assert.deepEqual(await occupants(db),custom);assert.deepEqual(await metadata(db),fixed);assert.deepEqual(await acls(db),grants);
  });
 }finally{await db.close();}
});
