import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {createMemoryStore,memoryPrompt} from '../server/memory.js';
import {createMemoryTools} from '../tools/memory/index.js';
import {createApp} from '../server/app.js';
import {readConfig} from '../server/config.js';
import {retrieveAssistantContext} from '../server/assistant-context.js';

const principal={id:'club-reader',allowedSourceIds:[]};
const stamp='2026-10-18T18:00:00.123456+00:00';
const note={id:'shared',content:'Club name: Tech@NYU.',updated_at:stamp};
const migration=()=>readFile(new URL('../supabase/migrations/202610180031_agent_memory.sql',import.meta.url),'utf8');
async function database(){const db=new PGlite();await db.exec('create role anon;create role authenticated;create role service_role bypassrls;');await db.exec(await migration());return db;}

test('031 real SQL: one plain-text row, denied browser/direct writes, stale-safe merge and forgetting',async()=>{
 const db=await database();
 try{
  const columns=(await db.query("select column_name,data_type from information_schema.columns where table_schema='public' and table_name='agent_memory' order by ordinal_position")).rows;
  assert.deepEqual(columns,[{column_name:'id',data_type:'text'},{column_name:'content',data_type:'text'},{column_name:'updated_at',data_type:'timestamp with time zone'}]);
  assert.deepEqual((await db.query("select relrowsecurity,relforcerowsecurity from pg_class where oid='public.agent_memory'::regclass")).rows[0],{relrowsecurity:true,relforcerowsecurity:true});
  for(const role of ['anon','authenticated']){
   assert.equal((await db.query("select has_table_privilege($1,'public.agent_memory','SELECT') allowed",[role])).rows[0].allowed,false);
   for(const rpc of ['public.agent_memory_read()','public.agent_memory_write(text,timestamptz)'])assert.equal((await db.query("select has_function_privilege($1,$2,'EXECUTE') allowed",[role,rpc])).rows[0].allowed,false);
  }
  for(const op of ['INSERT','UPDATE','DELETE'])assert.equal((await db.query("select has_table_privilege('service_role','public.agent_memory',$1) allowed",[op])).rows[0].allowed,false);
  await db.exec('set role service_role');
  const read=async()=>(await db.query('select public.agent_memory_read() result')).rows[0].result;
  const write=async(content,version)=>(await db.query('select public.agent_memory_write($1,$2) result',[content,version])).rows[0].result;
  const empty=await read();assert.equal(empty.memory.content,'');
  const first=await write(note.content,empty.memory.updated_at);assert.equal(first.outcome,'updated');assert.notEqual(first.memory.updated_at,empty.memory.updated_at);
  assert.equal((await write('Concurrent overwrite',empty.memory.updated_at)).status,'conflict');
  assert.equal((await write(note.content,empty.memory.updated_at)).outcome,'unchanged');
  assert.equal((await read()).memory.content,note.content);
  const cleared=await write('',first.memory.updated_at);assert.equal(cleared.memory.content,'');
  assert.equal((await db.query('select count(*)::int n from public.agent_memory')).rows[0].n,1);
  await assert.rejects(()=>write('x'.repeat(16001),cleared.memory.updated_at));
  await assert.rejects(()=>write('bad',null));
  await db.exec('reset role');await assert.rejects(()=>db.query("insert into public.agent_memory(id) values('another')"));
 }finally{await db.close();}
});

test('memory tool requires a trusted chat snapshot and exact version, enforces byte bounds, and refreshes after conflict',async()=>{
 let current={...note},writes=0;
 const store={configured:true,read:async()=>({status:'ready',memory:current}),write:async({content,expectedUpdatedAt})=>{
  writes++;if(expectedUpdatedAt!==current.updated_at)return {status:'conflict'};
  current={...current,content,updated_at:'2026-10-18T18:00:01.123456+00:00'};return {status:'ready',memory:current,outcome:'updated'};
 }};
 const tools=createMemoryTools({store}),memoryContext={userMessage:'Remember our club name.',snapshot:{status:'ready',memory:note}};
 const execute=(name,args,extra={})=>tools.execute({name,arguments:args,principal,memoryContext,...extra});
 assert.equal((await execute('update_memory',{content:'changed',expectedUpdatedAt:stamp},{memoryContext:null})).status,'forbidden');
 assert.equal((await execute('update_memory',{content:'changed',expectedUpdatedAt:'invented'})).status,'invalid_request');
 assert.equal((await execute('update_memory',{content:'🗽'.repeat(5000),expectedUpdatedAt:stamp})).status,'invalid_request');
 assert.equal((await execute('update_memory',{content:'changed',expectedUpdatedAt:'2020-01-01T00:00:00Z'})).status,'conflict');
 assert.equal(writes,0);
 const result=await execute('update_memory',{content:'Club name: Tech@NYU. Keep notes concise.',expectedUpdatedAt:stamp});assert.equal(result.status,'ready');assert.equal(memoryContext.snapshot.memory.content,current.content);
 assert.equal((await execute('read_memory',{})).memory.updated_at,current.updated_at);
 const prompt=memoryPrompt(memoryContext.snapshot);assert(prompt.includes('not core instructions'));assert(prompt.includes('never assume a remembered person is the current user'));assert(prompt.includes('Do not copy chat transcripts'));
});

test('real SQL to chat: memory loads before planning, model updates it, answer and next request receive persisted text',async()=>{
 const db=await database();
 try{
  let reads=0;
  const store={configured:true,read:async()=>{reads++;return(await db.query('select public.agent_memory_read() result')).rows[0].result;},
   write:async({content,expectedUpdatedAt})=>(await db.query('select public.agent_memory_write($1,$2) result',[content,expectedUpdatedAt])).rows[0].result};
  const memoryTools=createMemoryTools({store});let rounds=0,answers=0;
  const saved='Club name: Tech@NYU. Preferred spelling: Tech@NYU.';
  const config=readConfig({LLM_PROVIDER:'openai-compatible',LLM_MODEL:'offline',LLM_API_KEY:'fixture'});
  const provider={planTools:async({system,tools})=>{
   assert(tools.some(t=>t.name==='update_memory'));assert(system.includes('SHARED LONG-TERM MEMORY'));assert(system.includes('user does not have to say remember this'));
   if(rounds++===0){const initial=await store.read();return[{name:'update_memory',arguments:{content:saved,expectedUpdatedAt:initial.memory.updated_at}}];}
   assert(system.includes(saved));return[];
  },async *stream({system}){answers++;assert(system.includes(saved));if(answers===1)assert(system.includes('"memoryUpdate"'));yield answers===1?'Remembered.':'The club is Tech@NYU.';}};
  const app=createApp({config,provider,memoryTools,auth:()=>principal});
  const ask=content=>app.request('/api/chat',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({messages:[{role:'user',content}]})});
  const first=await(await ask('Our club is called Tech@NYU, and that is our preferred spelling.')).text();assert(first.includes('"name":"update_memory","status":"completed"'));
  const second=await(await ask('What is the club called?')).text();assert(second.includes('The club is Tech@NYU.'));assert.equal(answers,2);assert(reads>=2);
  assert.equal((await store.read()).memory.content,saved);
  const direct=await app.request('/api/tools/update_memory',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});assert.equal(direct.status,503);
 }finally{await db.close();}
});

test('memory outage does not block ordinary chat or fabricate successful persistence',async()=>{
 const memoryTools=createMemoryTools({store:{configured:true,read:async()=>({status:'unavailable'}),write:()=>assert.fail('unread memory write')}});
 let planned=false;
 const result=await retrieveAssistantContext({messages:[{role:'user',content:'Hello'}],principal,memoryTools,
  provider:{planTools:async({system})=>{planned=true;assert(system.includes('"status":"unavailable"'));return[];}},now:'2026-10-18T18:00:00Z',timeZone:'America/New_York'});
 assert(planned);assert.equal(result.memory.status,'unavailable');assert.equal(result.results.length,0);
});

test('memory store only calls fixed bounded RPCs and filters credential-shaped response extras',async()=>{
 const calls=[];
 const store=createMemoryStore({env:{SUPABASE_URL:'https://project.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'fake-key'},fetchImpl:async(url,options)=>{
  calls.push({url,body:JSON.parse(options.body)});assert.equal(options.redirect,'error');return Response.json({status:'ready',memory:note,secret:'never forward'});
 }});
 assert.deepEqual(await store.read(),{status:'ready',memory:note});
 await store.write({content:note.content,expectedUpdatedAt:stamp});
 assert(calls[0].url.endsWith('/rpc/agent_memory_read'));assert(calls[1].url.endsWith('/rpc/agent_memory_write'));
 assert.deepEqual(calls[1].body,{p_content:note.content,p_expected_updated_at:stamp});
 const abort=await store.read({signal:AbortSignal.abort()});assert.equal(abort.status,'aborted');assert.equal(calls.length,2);
});
