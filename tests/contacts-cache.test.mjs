import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {parseInboxSender,inboxSenderId,createContactsCache} from '../server/google/contacts-cache.js';

async function database(){
 const db=new PGlite();
 await db.exec('create role anon;create role authenticated;create role public_probe;create role service_role bypassrls;');
 return db;
}
const migration=()=>readFile(new URL('../supabase/migrations/202610260049_contacts_cache.sql',import.meta.url),'utf8');
async function denied(db,role,sql,params=[],code='42501'){
 await db.exec(`begin;set local role ${role}`);try{await assert.rejects(()=>db.query(sql,params),error=>error.code===code);}finally{await db.exec('rollback');}
}

test('contacts_cache SQL: exact private three-column shape, valid objects/defaults and unrelated data preserved',async()=>{
 const db=await database();
 try{
  await db.exec("create table public.cache_sentinel(id integer primary key,note text);insert into public.cache_sentinel values(1,'Preserve unrelated row');grant select on public.cache_sentinel to service_role;");
  const sentinel=async()=>({rows:(await db.query('select * from public.cache_sentinel')).rows,access:(await db.query("select relacl::text,relrowsecurity,relforcerowsecurity from pg_class where oid='public.cache_sentinel'::regclass")).rows});
  const before=await sentinel();await db.exec(await migration());
  assert.deepEqual((await db.query("select column_name,data_type,is_nullable from information_schema.columns where table_schema='public' and table_name='contacts_cache' order by ordinal_position")).rows,[{column_name:'id',data_type:'uuid',is_nullable:'NO'},{column_name:'created_at',data_type:'timestamp with time zone',is_nullable:'NO'},{column_name:'raw_input',data_type:'jsonb',is_nullable:'NO'}]);
  await db.exec('begin;set local role service_role');const first=(await db.query("insert into public.contacts_cache(raw_input) values('{}') returning id,raw_input,isfinite(created_at) as finite")).rows[0],second=(await db.query('insert into public.contacts_cache(raw_input) values($1::jsonb) returning id,raw_input',[JSON.stringify({email:'sender@example.test',name:'Sender',native:{preserve:[1,null]}})])).rows[0];assert.notEqual(first.id,second.id);assert.deepEqual(first.raw_input,{});assert.equal(first.finite,true);assert.deepEqual(second.raw_input,{email:'sender@example.test',name:'Sender',native:{preserve:[1,null]}});await db.exec('commit');
  for(const raw of [null,[],['sender'],true,17,'sender'])await denied(db,'service_role','insert into public.contacts_cache(raw_input) values($1::jsonb)',[JSON.stringify(raw)],'23514');
  await denied(db,'service_role','insert into public.contacts_cache(raw_input) values(null)',[],'23502');await denied(db,'service_role',"insert into public.contacts_cache(created_at,raw_input) values('infinity','{}')",[],'23514');
  for(const role of ['anon','authenticated','public_probe'])for(const sql of ['select * from public.contacts_cache','insert into public.contacts_cache default values',"update public.contacts_cache set raw_input='{}'",'delete from public.contacts_cache'])await denied(db,role,sql);
  assert.deepEqual((await db.query("select relrowsecurity,relforcerowsecurity from pg_class where oid='public.contacts_cache'::regclass")).rows[0],{relrowsecurity:true,relforcerowsecurity:true});assert.equal((await db.query("select count(*)::int count from pg_class c cross join lateral aclexplode(c.relacl) a where c.oid='public.contacts_cache'::regclass and a.grantee=0")).rows[0].count,0);assert.deepEqual(await sentinel(),before);
 }finally{await db.close();}
});

const inbox=(from='Morgan Example <MORGAN@example.test>',patch={})=>({id:'synthetic-message',historyId:'12345',labelIds:['INBOX','UNREAD'],snippet:'Never persist this snippet',payload:{headers:[{name:'From',value:from},{name:'To',value:'Club <club@example.test>'},{name:'Cc',value:'Not A Sender <cc@example.test>'},{name:'Subject',value:'Never persist this subject'}],body:{data:'Never persist email evidence'}},...patch});

test('contacts_cache sender selection: only one incoming nonself From; recipients, message content and guessed names stay out',()=>{
 const options={accountEmail:'CLUB@example.test'};
 assert.deepEqual(parseInboxSender(inbox(),options),{email:'morgan@example.test',name:'Morgan Example'});assert.deepEqual(parseInboxSender(inbox('sender@example.test'),options),{email:'sender@example.test'});
 assert.deepEqual(parseInboxSender(inbox('"Morgan Example" <morgan@example.test>'),options),{email:'morgan@example.test',name:'Morgan Example'});
 for(const labels of [undefined,null,[],['UNREAD'],['inbox'],['INBOX','SENT'],['INBOX','DRAFT'],['INBOX','SPAM'],['INBOX','TRASH']])assert.equal(parseInboxSender(inbox(undefined,{labelIds:labels}),options),null,JSON.stringify(labels));
 for(const from of ['club@EXAMPLE.test','Person <person@example.test>, Other <other@example.test>','group: person@example.test;','missing-address','Bad\r\nInjected <sender@example.test>'])assert.equal(parseInboxSender(inbox(from),options),null,from);
 for(const headers of [[],[{name:'Reply-To',value:'person@example.test'}],[{name:'From',value:'person@example.test'},{name:'From',value:'other@example.test'}]])assert.equal(parseInboxSender(inbox(undefined,{payload:{headers}}),options),null);
 const encoded=parseInboxSender(inbox('=?UTF-8?B?TW9yZ2Fu?= <morgan@example.test>'),options);assert.deepEqual(encoded,{email:'morgan@example.test'},'Encoded or unparsed display text must not become a guessed plain name');
 const first=inboxSenderId('Morgan@Example.Test'),second=inboxSenderId('morgan@example.test');assert.equal(first,second);assert.match(first,/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);assert.notEqual(first,inboxSenderId('other@example.test'));
});

test('contacts_cache HTTP helper: concurrent/replayed inserts preserve enrichment and uncertain outcomes retry with the same UUID',async()=>{
 const db=await database();await db.exec(await migration());const calls=[];let failure;
 const fetchImpl=async(value,options={})=>{
  const url=new URL(value);assert.equal(url.origin,'https://cache-db.example.test');assert.equal(url.pathname,'/rest/v1/contacts_cache');assert.equal(options.method,'POST');assert.equal(options.redirect,'error');assert.equal(options.headers.Authorization??options.headers.authorization,'Bearer synthetic-cache-key');assert.match(options.headers.Prefer??options.headers.prefer,/resolution=ignore-duplicates/);assert.equal(url.searchParams.get('on_conflict'),'id');
  const body=JSON.parse(options.body),row=Array.isArray(body)?body[0]:body;calls.push({url:url.toString(),body:structuredClone(row)});if(failure==='before')throw Error('PRIVATE cache transport failure');
  await db.query('insert into public.contacts_cache(id,raw_input) values($1,$2::jsonb) on conflict(id) do nothing',[row.id,JSON.stringify(row.raw_input)]);if(failure==='after')throw Error('PRIVATE response lost after commit');return new Response(null,{status:204});
 };
 try{
  const cache=createContactsCache({url:'https://cache-db.example.test',serviceRoleKey:'synthetic-cache-key',fetchImpl});
  const results=await Promise.all([cache.cacheInboxSender({message:inbox(),accountEmail:'club@example.test'}),cache.cacheInboxSender({message:inbox(),accountEmail:'club@example.test'})]);assert(results.every(result=>result.status==='ready'));assert.equal((await db.query('select count(*)::int count from public.contacts_cache')).rows[0].count,1);assert.deepEqual(calls[0].body.raw_input,{email:'morgan@example.test',name:'Morgan Example'});assert.deepEqual(Object.keys(calls[0].body).sort(),['id','raw_input']);assert.equal(calls[0].body.id,calls[1].body.id);
  const id=calls[0].body.id;await db.query('update public.contacts_cache set raw_input=$2::jsonb where id=$1',[id,JSON.stringify({email:'morgan@example.test',name:'Human edited',enrichment:{native:['preserve',null]}})]);const before=(await db.query('select id,created_at::text,raw_input from public.contacts_cache order by id')).rows;
  assert.equal((await cache.cacheInboxSender({message:inbox('Changed Sender <morgan@example.test>'),accountEmail:'club@example.test'})).status,'ready');assert.deepEqual((await db.query('select id,created_at::text,raw_input from public.contacts_cache order by id')).rows,before,'Replay never overwrites enrichment, a human name or its creation time');
  const uncertainMessage=inbox('Second Sender <second@example.test>');failure='after';const lost=await cache.cacheInboxSender({message:uncertainMessage,accountEmail:'club@example.test'});assert.equal(lost.status,'contact_cache_failed');assert(!JSON.stringify(lost).includes('PRIVATE'));const uncertainId=calls.at(-1).body.id;failure=undefined;assert.equal((await cache.cacheInboxSender({message:uncertainMessage,accountEmail:'club@example.test'})).status,'ready');assert.equal(calls.at(-1).body.id,uncertainId);assert.equal((await db.query('select count(*)::int count from public.contacts_cache')).rows[0].count,2);
  const count=calls.length;assert.equal((await cache.cacheInboxSender({message:inbox(undefined,{labelIds:['SENT']}),accountEmail:'club@example.test'})).status,'skipped');assert.equal((await cache.cacheInboxSender({message:inbox(),accountEmail:'club@example.test',signal:AbortSignal.abort()})).status,'contact_cache_failed');assert.equal(calls.length,count,'Excluded or canceled messages do not dispatch a cache write');
  failure='before';assert.equal((await cache.cacheInboxSender({message:inbox('third@example.test'),accountEmail:'club@example.test'})).status,'contact_cache_failed');assert.equal((await db.query('select count(*)::int count from public.contacts_cache')).rows[0].count,2);
  for(const status of [401,403,429,500]){const unavailable=createContactsCache({url:'https://cache-db.example.test',serviceRoleKey:'synthetic-cache-key',fetchImpl:async()=>new Response('PRIVATE provider error',{status})});const result=await unavailable.cacheInboxSender({message:inbox(),accountEmail:'club@example.test'});assert.deepEqual(result,{status:'contact_cache_failed'});}
  for(const url of ['http://remote.example.test','https://user:password@cache-db.example.test','https://cache-db.example.test/path','https://cache-db.example.test/?secret=x'])assert.throws(()=>createContactsCache({url,serviceRoleKey:'synthetic-key',fetchImpl}),/invalid_contacts_cache_config/);
 }finally{await db.close();}
});
