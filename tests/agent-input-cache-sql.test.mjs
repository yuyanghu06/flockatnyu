import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {vector} from '@electric-sql/pglite-pgvector';

const migrationDirectory=new URL('../supabase/migrations/',import.meta.url);
const table='public.agent_input_cache';
const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

async function migration(number){
 const names=await readdir(migrationDirectory);
 const name=names.find(name=>name.endsWith('.sql')&&Number(name.slice(8,12))===number);
 assert(name,'Missing migration '+number);
 return readFile(new URL(name,migrationDirectory),'utf8');
}

async function baseline(db){
 // Include table definitions/security, original rows and function definitions.
 const tables=(await db.query(`select c.relname,c.relrowsecurity,c.relforcerowsecurity,c.relacl::text,
  (select jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),
   'notnull',a.attnotnull,'default',pg_get_expr(d.adbin,d.adrelid)) order by a.attnum)
   from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
   where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped) columns,
  (select jsonb_agg(pg_get_constraintdef(oid) order by conname) from pg_constraint where conrelid=c.oid) constraints
  from pg_class c where c.relnamespace='public'::regnamespace and c.relkind='r'
  and c.relname<>'agent_input_cache' order by c.relname`)).rows;
 const data={};
 for(const {relname} of tables){
  assert(/^[a-z_]+$/.test(relname));
  data[relname]=(await db.query(`select to_jsonb(t) data from public.${relname} t order by to_jsonb(t)::text`)).rows;
 }
 const functions=(await db.query(`select oid::regprocedure::text signature,pg_get_functiondef(oid) definition,proacl::text
  from pg_proc where pronamespace='public'::regnamespace order by oid::regprocedure::text`)).rows;
 return {tables,data,functions};
}

test('018 executed against001–017: shared cache schema, permissions and processing boundaries',async t=>{
 const db=new PGlite({extensions:{vector}});
 try{
  await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create role cache_public_probe;');
  for(let n=1;n<=17;n++)await db.exec(await migration(n));
  await db.exec("insert into public.knowledge_sources(kind,external_id,title,status) values('manual','m33-preserve','Unrelated retained source','active');insert into public.discord_view_policies(guild_id) values('1203562091500404776');");
  await db.exec("select public.miro_sync_register(p_board_id=>'m33-retained-board')");
  const before=await baseline(db);
  assert.equal(before.tables.length,3,'Actual001–017 baseline has three app tables');
  // Migration must override broad inherited default table grants, including PUBLIC.
  await db.exec('alter default privileges in schema public grant all on tables to public,anon,authenticated,service_role;');
  await db.exec(await migration(18));

  await t.test('pre-existing source, Discord policy and Miro schema/data/ACL/functions unchanged',async()=>{
   assert.deepEqual(await baseline(db),before);
   assert.deepEqual((await db.query("select relname from pg_class where relnamespace='public'::regnamespace and relkind='r' order by relname")).rows.map(r=>r.relname),['agent_input_cache','discord_view_policies','knowledge_sources','miro_boards']);
  });

  await t.test('exact two-column UUID primary key/default and unrestricted required JSONB',async()=>{
   const columns=(await db.query(`select column_name,data_type,is_nullable,column_default from information_schema.columns
    where table_schema='public' and table_name='agent_input_cache' order by ordinal_position`)).rows;
   assert.deepEqual(columns,[
    {column_name:'uuid',data_type:'uuid',is_nullable:'NO',column_default:'gen_random_uuid()'},
    {column_name:'raw_response',data_type:'jsonb',is_nullable:'NO',column_default:null}
   ]);
   // PostgreSQL18 also catalogs NOT NULL constraints, already checked above.
   const constraints=(await db.query(`select contype,pg_get_constraintdef(oid) definition from pg_constraint where conrelid='${table}'::regclass and contype<>'n'`)).rows;
   assert.deepEqual(constraints,[{contype:'p',definition:'PRIMARY KEY (uuid)'}]);
   assert.deepEqual((await db.query(`select relrowsecurity,relforcerowsecurity from pg_class where oid='${table}'::regclass`)).rows,[{relrowsecurity:true,relforcerowsecurity:true}]);
   assert.equal((await db.query(`select count(*)::int n from pg_policy where polrelid='${table}'::regclass`)).rows[0].n,0);
   assert.equal((await db.query(`select count(*)::int n from pg_trigger where tgrelid='${table}'::regclass and not tgisinternal`)).rows[0].n,0);
  });

  await t.test('service role round trips native Discord, Gmail and arbitrary other JSON without normalization',async()=>{
   const payloads=[
    {op:0,t:'MESSAGE_CREATE',s:42,d:{id:'1500000000000000001',author:{id:'1203562091500404776',username:'person',global_name:'Person'},member:{nick:'Club nickname'},content:"I'll be at Bobst until5 📚",timestamp:'2026-10-17T17:20:00.123+00:00',attachments:[],unknown:{nested:[null,true,{number:12.5}]}}},
    {source:'gmail',event_type:'email_received',received_at:'2026-10-17T17:21:00Z',payload:{id:'email1',threadId:'thread1',payload:{headers:[{name:'From',value:'organizer@example.test'}],body:{data:'PGI+aGVsbG88L2I+'}},labelIds:['INBOX']}},
    {source:'future-integration',payload:{unknown:{arbitrary:['a',0,false,null]},text:'<script>untrusted content</script>'}},
    {noEnvelopeRequired:true},['arbitrary','array',{preserve:true}],'plain JSON string',42,false,null
   ];
   await db.exec('set role service_role');
   try{
    for(const payload of payloads){
     const inserted=(await db.query(`insert into ${table}(raw_response) values($1::jsonb) returning uuid,raw_response`,[JSON.stringify(payload)])).rows[0];
     assert.match(inserted.uuid,uuidPattern);assert.deepEqual(inserted.raw_response,payload);
     assert.deepEqual((await db.query(`select raw_response from ${table} where uuid=$1`,[inserted.uuid])).rows[0].raw_response,payload);
    }
   }finally{await db.exec('reset role');}
  });

  await t.test('generated UUIDs are unique across a batch and caller-provided UUID works',async()=>{
   await db.exec('set role service_role');
   try{
    const ids=(await db.query(`insert into ${table}(raw_response) select jsonb_build_object('sequence',n) from generate_series(1,64)n returning uuid`)).rows.map(r=>r.uuid);
    assert.equal(new Set(ids).size,64);for(const id of ids)assert.match(id,uuidPattern);
    const explicit=randomUUID();
    assert.equal((await db.query(`insert into ${table}(uuid,raw_response) values($1,'{}') returning uuid`,[explicit])).rows[0].uuid,explicit);
   }finally{await db.exec('reset role');}
  });

  await t.test('duplicate UUID, SQL NULLs, omitted payload and malformed JSON are rejected',async()=>{
   await db.exec('set role service_role');
   try{
    const id=(await db.query(`insert into ${table}(raw_response) values('{}') returning uuid`)).rows[0].uuid;
    await assert.rejects(db.query(`insert into ${table}(uuid,raw_response) values($1,'{}')`,[id]),e=>e.code==='23505');
    await assert.rejects(db.query(`insert into ${table}(raw_response) values(null)`),e=>e.code==='23502');
    await assert.rejects(db.query(`insert into ${table}(uuid,raw_response) values(null,'{}')`),e=>e.code==='23502');
    await assert.rejects(db.query(`insert into ${table} default values`),e=>e.code==='23502');
    await assert.rejects(db.query(`insert into ${table}(raw_response) values($1::jsonb)`,['{invalid']),e=>e.code==='22P02');
   }finally{await db.exec('reset role');}
  });

  await t.test('ACL grants exactly CRUD to service_role and nothing to clients or PUBLIC',async()=>{
   for(const role of ['anon','authenticated','cache_public_probe','service_role']){
    for(const privilege of ['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']){
     const actual=(await db.query('select has_table_privilege($1,$2,$3) allowed',[role,table,privilege])).rows[0].allowed;
     assert.equal(actual,role==='service_role'&&['SELECT','INSERT','UPDATE','DELETE'].includes(privilege),role+' '+privilege);
    }
   }
   const grants=(await db.query(`select a.grantee,a.privilege_type from pg_class c cross join lateral aclexplode(c.relacl) a where c.oid='${table}'::regclass and a.grantee=0`)).rows;
   assert.deepEqual(grants,[],'PUBLIC ACL contains no granted privileges');
   await db.exec('set role service_role');
   try{await assert.rejects(db.exec(`truncate ${table}`),e=>e.code==='42501');}
   finally{await db.exec('reset role');}
  });

  await t.test('anon, authenticated and a PUBLIC-only role cannot execute table CRUD',async()=>{
   for(const role of ['anon','authenticated','cache_public_probe']){
    await db.exec('set role '+role);
    try{
     for(const sql of [`select * from ${table}`,`insert into ${table}(raw_response) values('{}')`,`update ${table} set raw_response='{}'`,`delete from ${table}`]){
      await assert.rejects(db.query(sql),e=>e.code==='42501',role+' denied '+sql);
     }
    }finally{await db.exec('reset role');}
   }
  });

  await t.test('RLS independently blocks reads/inserts/updates/deletes even with artificial client CRUD grants',async()=>{
   const originalRows=(await db.query(`select * from ${table} order by uuid`)).rows;
   assert(originalRows.length>0,'RLS is exercised against populated rows');
   await db.exec(`grant select,insert,update,delete on ${table} to anon,authenticated,cache_public_probe`);
   try{
    for(const role of ['anon','authenticated','cache_public_probe']){
     await db.exec('set role '+role);
     try{
      assert.deepEqual((await db.query(`select * from ${table}`)).rows,[]);
      await assert.rejects(db.query(`insert into ${table}(raw_response) values('{}')`),e=>e.code==='42501'&&e.message.includes('row-level security'));
      assert.deepEqual((await db.query(`update ${table} set raw_response='{"tampered":true}' returning uuid`)).rows,[]);
      assert.deepEqual((await db.query(`delete from ${table} returning uuid`)).rows,[]);
     }finally{await db.exec('reset role');}
    }
    assert.deepEqual((await db.query(`select * from ${table} order by uuid`)).rows,originalRows);
   }finally{await db.exec(`revoke all on ${table} from anon,authenticated,cache_public_probe`);}
  });

  await t.test('service CRUD and exact successful-UUID cleanup preserve an arrival after batch selection',async()=>{
   await db.exec('set role service_role');
   try{
    await db.query(`delete from ${table}`);
    for(let n=0;n<3;n++)await db.query(`insert into ${table}(raw_response) values($1::jsonb)`,[JSON.stringify({source:'discord',payload:{n}})]);
    const batch=(await db.query(`select uuid from ${table}`)).rows.map(r=>r.uuid);
    const late=(await db.query(`insert into ${table}(raw_response) values('{"source":"gmail","payload":{"late":true}}') returning uuid,raw_response`)).rows[0];
    const updated={source:'discord',payload:{corrected:true}};
    assert.deepEqual((await db.query(`update ${table} set raw_response=$2::jsonb where uuid=$1 returning raw_response`,[batch[0],JSON.stringify(updated)])).rows[0].raw_response,updated);
    const deleted=(await db.query(`delete from ${table} where uuid=any($1::uuid[]) returning uuid`,[batch])).rows.map(r=>r.uuid);
    assert.deepEqual(deleted.sort(),batch.sort());
    assert.deepEqual((await db.query(`select uuid,raw_response from ${table}`)).rows,[late]);
    assert.deepEqual((await db.query(`delete from ${table} where uuid=any($1::uuid[]) returning uuid`,[batch])).rows,[],'Retrying cleanup is safe');
   }finally{await db.exec('reset role');}
  });
 }finally{await db.close();}
});
