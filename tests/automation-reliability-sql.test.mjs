import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {vector} from '@electric-sql/pglite-pgvector';

const source=randomUUID(),outside=randomUUID();
const directory=new URL('../supabase/migrations/',import.meta.url);
const options={p_allowed_source_ids:[source],p_min_events:1,p_max_age_seconds:1800,p_cooldown_seconds:60,p_lease_seconds:120,p_max_inputs:20,p_max_bytes:65536};
async function rpc(db,name,args={}){const keys=Object.keys(args);return(await db.query(`select public.${name}(${keys.map((key,index)=>`${key} => $${index+1}`).join(',')}) value`,keys.map(key=>args[key]!==null&&typeof args[key]==='object'&&!Array.isArray(args[key])?JSON.stringify(args[key]):args[key]))).rows[0].value;}
const claim=(db,patch={})=>rpc(db,'agent_automation_claim_scoped',{...options,...patch});
const fail=(db,token,outcome='unavailable')=>rpc(db,'agent_automation_fail',{p_token:token,p_outcome:outcome});
const metadata=async(db,id)=>(await db.query("select data from public.agent_automation_state where key=$1",['input:'+id])).rows[0]?.data;
async function reset(db){await db.exec("reset role;truncate public.agent_input_cache,public.agent_automation_state;insert into public.agent_automation_state values('runner','{}');set role service_role");}
async function ready(db){await db.exec("update public.agent_automation_state set data=data||jsonb_build_object('last_started',clock_timestamp()-interval '61 seconds') where key='runner';update public.agent_automation_state set data=data||jsonb_build_object('next_attempt_at',clock_timestamp()-interval '1 second') where key like 'input:%'");}
async function enqueue(db,{id=randomUUID(),sourceId=source,content='PRIVATE_PAYLOAD',revision='1'}={}){const result=await rpc(db,'agent_automation_enqueue',{p_input_id:id,p_envelope:{source:'discord',source_id:sourceId,event_type:'message_created',event_id:id,revision,payload:{content}}});assert.equal(result.status,'queued');return id;}
async function quarantine(db,id){for(let n=0;n<5;n++){await ready(db);const c=await claim(db);assert.equal(c.status,'ready');assert.equal(c.inputs.length,1);assert.equal(c.inputs[0].uuid,id);assert.equal(await fail(db,c.leaseToken),true);}return metadata(db,id);}

test('036 executed SQL: isolated finite retries, fair claims, bounded quarantine, fenced service-only recovery',async t=>{
 const db=new PGlite({extensions:{vector}});
 try{
  await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create role public_probe;');
  const files=await readdir(directory);let oldClaim,oldId,before;
  for(let n=1;n<=36;n++){
   const file=files.find(f=>f.endsWith('.sql')&&Number(f.slice(8,12))===n);assert(file,'Migration '+n+' exists');
   if(n===36){await db.exec('set role service_role');oldId=await enqueue(db);oldClaim=await claim(db);await db.exec('reset role');before={cache:(await db.query('select * from public.agent_input_cache')).rows,state:(await db.query('select * from public.agent_automation_state order by key')).rows};}
   await db.exec(await readFile(new URL(file,directory),'utf8'));
  }
  await t.test('applying036 preserves existing raw rows and active legacy lease, which can still finish',async()=>{
   assert.deepEqual((await db.query('select * from public.agent_input_cache')).rows,before.cache);assert.deepEqual((await db.query('select * from public.agent_automation_state order by key')).rows,before.state);await db.exec('set role service_role');assert.equal(await rpc(db,'agent_automation_finish',{p_token:oldClaim.leaseToken,p_handled_ids:[oldId]}),true);assert.equal((await metadata(db,oldId)).status,'done');
  });
  await t.test('fresh trigger still requires30inputs or oldest30minutes and preserves unrelated scope',async()=>{
   await reset(db);const denied=await enqueue(db,{sourceId:outside});for(let n=0;n<29;n++)await enqueue(db);
   assert.equal((await claim(db,{p_min_events:30})).status,'waiting');await enqueue(db);const c=await claim(db,{p_min_events:30});assert.equal(c.inputs.length,20);assert(c.inputs.every(row=>row.raw_response.source_id===source));assert.equal((await metadata(db,denied)).status,'pending');
   await reset(db);await enqueue(db);assert.equal((await claim(db,{p_min_events:30})).status,'waiting');await db.exec("update public.agent_automation_state set data=data||jsonb_build_object('received_at',clock_timestamp()-interval '1801 seconds') where key like 'input:%'");assert.equal((await claim(db,{p_min_events:30})).status,'ready');
  });
  await t.test('failed multi-input work becomes singleton retries and fresh/retry lanes alternate',async()=>{
   await reset(db);const originals=[await enqueue(db),await enqueue(db)];const initial=await claim(db);assert.equal(initial.inputs.length,2);assert.equal(await fail(db,initial.leaseToken),true);await ready(db);
   const fresh=await enqueue(db);const first=await claim(db);assert.equal(first.status,'ready');assert.equal(first.inputs.length,1);
   const firstId=first.inputs[0].uuid;assert.equal(await fail(db,first.leaseToken),true);await ready(db);const second=await claim(db);assert.equal(second.status,'ready');assert.equal(second.inputs.length,1);
   const secondId=second.inputs[0].uuid;assert.notEqual(firstId===fresh,secondId===fresh,'Both ready lanes receive turns');assert(originals.includes(firstId)||originals.includes(secondId));
   for(const id of originals){const m=await metadata(db,id);assert.equal(m.retry_isolated,true);assert(m.failed_attempts>=1);assert(!JSON.stringify(m).includes('PRIVATE_PAYLOAD'));}
  });
  await t.test('fifth exact singleton failure quarantines, duplicate failure is idempotent, and new inputs progress',async()=>{
   await reset(db);const id=await enqueue(db);let last;
   for(let n=1;n<=5;n++){await ready(db);const c=await claim(db);assert.equal(c.status,'ready');assert.equal(c.inputs.length,1);assert.equal(c.inputs[0].uuid,id);last=c.leaseToken;assert.equal(await fail(db,last),true);assert.equal(await fail(db,last),false);const m=await metadata(db,id);assert.equal(m.failed_attempts,n);assert.equal(m.status,n===5?'quarantined':'pending');}
   const m=await metadata(db,id);assert(Math.abs((Date.parse(m.quarantine_until)-Date.parse(m.quarantined_at))/3600000-24)<0.01);await ready(db);assert.equal((await claim(db)).status,'empty');const fresh=await enqueue(db);assert.equal((await claim(db)).inputs[0].uuid,fresh);
  });
  await t.test('expired leases count once and stale workers cannot finish, release, or fail a reclaimed snapshot',async()=>{
   await reset(db);const id=await enqueue(db);const old=await claim(db);await db.exec("update public.agent_automation_state set data=data||jsonb_build_object('lease_until',clock_timestamp()-interval '1 second','last_started',clock_timestamp()-interval '61 seconds') where key='runner'");
   await claim(db);assert.equal((await metadata(db,id)).failed_attempts,1);await claim(db);assert.equal((await metadata(db,id)).failed_attempts,1);
   assert.equal(await fail(db,old.leaseToken),false);assert.equal(await rpc(db,'agent_automation_release',{p_token:old.leaseToken}),false);assert.equal(await rpc(db,'agent_automation_finish',{p_token:old.leaseToken,p_handled_ids:[id]}),false);
  });
  await t.test('ordinary release defers without counting a failure and partial completion isolates only remaining work',async()=>{
   await reset(db);const a=await enqueue(db),b=await enqueue(db);const c=await claim(db);assert.equal(await rpc(db,'agent_automation_release',{p_token:c.leaseToken}),true);assert.equal((await metadata(db,a)).failed_attempts||0,0);assert.equal((await metadata(db,b)).failed_attempts||0,0);assert.equal((await claim(db)).status,'empty');
   await reset(db);const handled=await enqueue(db),unhandled=await enqueue(db);const next=await claim(db);assert.equal(next.inputs.length,2);assert.equal(await rpc(db,'agent_automation_finish',{p_token:next.leaseToken,p_handled_ids:[handled]}),true);assert.equal((await db.query('select count(*)::int n from public.agent_input_cache where uuid=$1',[handled])).rows[0].n,0);const remaining=await metadata(db,unhandled);assert.equal(remaining.retry_isolated,true);await ready(db);assert.equal((await claim(db)).inputs[0].uuid,unhandled);
  });
  await t.test('changed snapshot bytes cannot accrue failure or be removed by stale completion',async()=>{
   await reset(db);const id=await enqueue(db);const c=await claim(db);await db.query("update public.agent_input_cache set raw_response=jsonb_set(raw_response,'{payload,content}','\"CHANGED_PRIVATE_PAYLOAD\"'::jsonb) where uuid=$1",[id]);
   assert.equal(await fail(db,c.leaseToken),true);assert.equal((await metadata(db,id)).failed_attempts||0,0);assert.equal((await db.query('select count(*)::int n from public.agent_input_cache where uuid=$1',[id])).rows[0].n,1);
  });
  await t.test('quarantine maintenance purges original payload on an otherwise empty claim but retains metadata receipt',async()=>{
   await reset(db);const id=await enqueue(db);await quarantine(db,id);await db.query("update public.agent_automation_state set data=data||jsonb_build_object('quarantine_until',clock_timestamp()-interval '1 second') where key=$1",['input:'+id]);await ready(db);assert.equal((await claim(db)).status,'empty');assert.equal((await db.query('select count(*)::int n from public.agent_input_cache where uuid=$1',[id])).rows[0].n,0);const m=await metadata(db,id);assert(m);assert(!JSON.stringify(m).includes('PRIVATE_PAYLOAD'));assert.equal((await rpc(db,'agent_automation_enqueue',{p_input_id:id,p_envelope:{source:'discord',source_id:source,event_type:'message_created',event_id:id,revision:'1',payload:{content:'PRIVATE_PAYLOAD'}}})).status,'duplicate');
  });
  await t.test('exact quarantined requeue requires current scope, matching hash, unexpired payload, and no active lease',async()=>{
   await reset(db);const id=await enqueue(db);const m=await quarantine(db,id);const args={p_input_id:id,p_allowed_source_ids:[source],p_expected_hash:m.payload_hash};assert.match(args.p_expected_hash,/^[a-f0-9]{32,64}$/);
   assert.equal(await rpc(db,'agent_automation_requeue',{...args,p_allowed_source_ids:[outside]}),false);assert.equal(await rpc(db,'agent_automation_requeue',{...args,p_expected_hash:'0'.repeat(args.p_expected_hash.length)}),false);
   const fresh=await enqueue(db);await ready(db);const active=await claim(db);assert.equal(active.inputs[0].uuid,fresh);assert.equal(await rpc(db,'agent_automation_requeue',args),false);await rpc(db,'agent_automation_finish',{p_token:active.leaseToken,p_handled_ids:[fresh]});assert.equal(await rpc(db,'agent_automation_requeue',args),true);assert.equal(await rpc(db,'agent_automation_requeue',args),false);assert.equal((await metadata(db,id)).status,'pending');assert.equal((await metadata(db,id)).failed_attempts,0);
  });
  await t.test('requeue rejects altered quarantined payload and expired quarantine before maintenance',async()=>{
   await reset(db);const id=await enqueue(db);const m=await quarantine(db,id);const args={p_input_id:id,p_allowed_source_ids:[source],p_expected_hash:m.payload_hash};await db.query("update public.agent_input_cache set raw_response=jsonb_set(raw_response,'{payload,content}','\"ALTERED\"'::jsonb) where uuid=$1",[id]);assert.equal(await rpc(db,'agent_automation_requeue',args),false);
   await reset(db);const expired=await enqueue(db);const em=await quarantine(db,expired);await db.query("update public.agent_automation_state set data=data||jsonb_build_object('quarantine_until',clock_timestamp()-interval '1 second') where key=$1",['input:'+expired]);assert.equal(await rpc(db,'agent_automation_requeue',{p_input_id:expired,p_allowed_source_ids:[source],p_expected_hash:em.payload_hash}),false);
  });
  await t.test('maintenance runs before busy and purges outside current scope while preserving replaced bodies',async()=>{
   await reset(db);const expired=await enqueue(db),changed=await enqueue(db);
   for(const id of [expired,changed])await db.query("update public.agent_automation_state set data=data||jsonb_build_object('status','quarantined','quarantine_until',clock_timestamp()-interval '1 second','payload_hash',(select md5(raw_response::text) from public.agent_input_cache where uuid=$1::uuid)) where key='input:'||$1::text",[id]);
   await db.query("update public.agent_input_cache set raw_response=raw_response||jsonb_build_object('replacement',true) where uuid=$1",[changed]);
   await db.exec("update public.agent_automation_state set data=jsonb_build_object('token',gen_random_uuid(),'lease_until',clock_timestamp()+interval '1 minute') where key='runner'");
   assert.equal((await claim(db,{p_allowed_source_ids:[outside]})).status,'busy');assert.equal((await db.query('select count(*)::int n from public.agent_input_cache where uuid=$1',[expired])).rows[0].n,0);assert.equal((await db.query('select count(*)::int n from public.agent_input_cache where uuid=$1',[changed])).rows[0].n,1);assert.equal((await metadata(db,changed)).status,'quarantine_changed');
  });
  await t.test('more than100 oversized pending inputs cannot hide a later fitting candidate',async()=>{
   await reset(db);for(let n=0;n<101;n++)await enqueue(db,{content:'x'.repeat(2000)});const small=await enqueue(db,{content:'fits'});const c=await claim(db,{p_max_bytes:1024});assert.equal(c.status,'ready');assert.deepEqual(c.inputs.map(row=>row.uuid),[small]);
  });
  await t.test('legacy unscoped claims cannot bypass singleton quarantine enforcement',async()=>{
   await db.exec('reset role');assert.equal((await db.query("select has_function_privilege('service_role','public.agent_automation_claim(integer,integer,integer,integer,integer,integer)','EXECUTE') allowed")).rows[0].allowed,false);
  });
  await t.test('new queue functions are invoker/service-only and arbitrary private error outcomes never persist',async()=>{
   await reset(db);await enqueue(db);const c=await claim(db);await assert.rejects(fail(db,c.leaseToken,'PRIVATE_ERROR_MESSAGE'));assert(!JSON.stringify((await db.query('select data from public.agent_automation_state')).rows).includes('PRIVATE_ERROR_MESSAGE'));
   await db.exec('reset role');for(const signature of ['public.agent_automation_settle_lease(uuid,text)','public.agent_automation_fail(uuid,text)','public.agent_automation_requeue(uuid,uuid[],text)']){
    const f=(await db.query('select prosecdef from pg_proc where oid=$1::regprocedure',[signature])).rows[0];assert.equal(f.prosecdef,false);for(const role of ['anon','authenticated','public_probe','service_role'])assert.equal((await db.query("select has_function_privilege($1,$2,'EXECUTE') allowed",[role,signature])).rows[0].allowed,role==='service_role');
   }
  });
 }finally{await db.close();}
});
