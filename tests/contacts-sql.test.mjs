import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

const migration=await readFile(new URL('../supabase/migrations/202610260047_contacts.sql',import.meta.url),'utf8');
async function rejectedAs(db,role,sql,params=[],code='42501'){
 await db.exec(`begin;set local role ${role}`);
 try{await assert.rejects(()=>db.query(sql,params),error=>error.code===code);}
 finally{await db.exec('rollback');}
}

test('047 contacts: flexible private CRM records with managed timestamps',async t=>{
 const db=new PGlite();
 try{
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
   create table public.unrelated_contact_fixture(id integer primary key,note text);
   insert into public.unrelated_contact_fixture values(1,'Preserve existing data');
   grant select on public.unrelated_contact_fixture to service_role;`);
  const snapshot=async()=>({
   rows:(await db.query('select * from public.unrelated_contact_fixture')).rows,
   schema:(await db.query("select attname,format_type(atttypid,atttypmod) as type,attnotnull from pg_attribute where attrelid='public.unrelated_contact_fixture'::regclass and attnum>0 order by attnum")).rows,
   access:(await db.query("select relacl::text,relrowsecurity,relforcerowsecurity from pg_class where oid='public.unrelated_contact_fixture'::regclass")).rows
  });
  const before=await snapshot();
  await db.exec(migration);
  await t.test('new contact defaults and arbitrary raw fields survive backend CRUD',async()=>{
   const raw={first_name:'Test',last_name:'Contact',email:'test@example.com',phone_number:'+1 001 555 0100',company:'Example',tags:['mentor','alumni'],custom:{preferred_contact:'email'},optional:null};
   await db.exec('begin;set local role service_role');
   const created=(await db.query('insert into public.contacts(raw_input) values($1::jsonb) returning id,raw_input,created_at=updated_at as same_initial_time,isfinite(created_at) and isfinite(updated_at) as finite_times',[JSON.stringify(raw)])).rows[0];
   const empty=(await db.query('insert into public.contacts default values returning id,raw_input')).rows[0];
   assert.match(created.id,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
   assert.notEqual(created.id,empty.id);
   assert.deepEqual(created.raw_input,raw);
   assert.deepEqual(empty.raw_input,{});
   assert.equal(created.same_initial_time,true);
   assert.equal(created.finite_times,true);
   const changed=(await db.query(`with original as materialized (select * from public.contacts where id=$1),
    changed as (update public.contacts set raw_input=raw_input || '{"phone_number":"0012345678"}'::jsonb,
     created_at='2000-01-01',updated_at='2000-01-01' where id=$1 returning *)
    select changed.created_at=original.created_at as creation_preserved,
     changed.updated_at>original.updated_at as update_advanced,changed.raw_input
    from changed cross join original`,[created.id])).rows[0];
   assert.equal(changed.creation_preserved,true);
   assert.equal(changed.update_advanced,true);
   assert.deepEqual(changed.raw_input,{...raw,phone_number:'0012345678'});
   assert.equal((await db.query('select count(*)::int as count from public.contacts')).rows[0].count,2);
   assert.equal((await db.query('delete from public.contacts returning id')).rows.length,2);
   await db.exec('commit');
  });
  await t.test('invalid contact containers and timestamps cannot be stored',async()=>{
   for(const raw of [null,[],['contact'],'name',42,true]){
    await rejectedAs(db,'service_role','insert into public.contacts(raw_input) values($1::jsonb)',[JSON.stringify(raw)],'23514');
   }
   await rejectedAs(db,'service_role','insert into public.contacts(raw_input) values(null)',[],'23502');
   for(const column of ['created_at','updated_at']){
    await rejectedAs(db,'service_role',`insert into public.contacts(${column}) values('infinity')`,[],'23514');
   }
   assert.equal((await db.query('select count(*)::int as count from public.contacts')).rows[0].count,0);
  });
  await t.test('browser roles have no contact access and unrelated data stays unchanged',async()=>{
   const id=(await db.query('insert into public.contacts default values returning id')).rows[0].id;
   for(const role of ['anon','authenticated']){
    for(const [sql,params] of [
     ['select * from public.contacts',[]],
     ['insert into public.contacts default values',[]],
     ['update public.contacts set raw_input=\'{"email":"changed@example.com"}\' where id=$1',[id]],
     ['delete from public.contacts where id=$1',[id]]
    ])await rejectedAs(db,role,sql,params);
   }
   const rls=(await db.query("select relrowsecurity,relforcerowsecurity from pg_class where oid='public.contacts'::regclass")).rows[0];
   assert.deepEqual(rls,{relrowsecurity:true,relforcerowsecurity:true});
   assert.equal((await db.query("select count(*)::int as count from pg_class c cross join lateral aclexplode(c.relacl) a where c.oid='public.contacts'::regclass and a.grantee=0")).rows[0].count,0);
   assert.deepEqual((await db.query('select raw_input from public.contacts where id=$1',[id])).rows[0].raw_input,{});
   assert.deepEqual(await snapshot(),before);
  });
 }finally{await db.close();}
});
