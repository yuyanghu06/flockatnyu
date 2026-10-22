import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {vector} from '@electric-sql/pglite-pgvector';
import {createAutomationStore} from '../server/automation/store.js';
import {readAutomationConfig} from '../server/automation/config.js';

const source=randomUUID(),outside=randomUUID();
const options={p_allowed_source_ids:[],p_min_events:1,p_max_age_seconds:1800,p_cooldown_seconds:60,p_lease_seconds:120,p_max_inputs:20,p_max_bytes:65536};
async function rpc(db,name,args={}){const keys=Object.keys(args);return(await db.query(`select public.${name}(${keys.map((key,i)=>key+' => $'+(i+1)).join(',')}) result`,keys.map(key=>args[key]!==null&&typeof args[key]==='object'&&!Array.isArray(args[key])?JSON.stringify(args[key]):args[key]))).rows[0].result;}
const claim=(db,patch={})=>rpc(db,'agent_automation_claim_scoped',{...options,...patch});
const metadata=async(db,id)=>(await db.query('select data from public.agent_automation_state where key=$1',['input:'+id])).rows[0]?.data;
async function reset(db){await db.exec("reset role;truncate public.agent_input_cache,public.agent_automation_state;insert into public.agent_automation_state values('runner','{}');set role service_role");}
async function enqueue(db,sourceId=source){const id=randomUUID();assert.equal((await rpc(db,'agent_automation_enqueue',{p_input_id:id,p_envelope:{source:'discord',source_id:sourceId,event_type:'message_created',event_id:id,revision:'1',payload:{content:'PRIVATE_BODY'}}})).status,'queued');return id;}
async function expireQuarantine(db,id){await db.query("update public.agent_automation_state set data=data||jsonb_build_object('status','quarantined','quarantine_until',clock_timestamp()-interval '1 second','failed_attempts',5,'payload_hash',(select md5(raw_response::text) from public.agent_input_cache where uuid=$1::uuid)) where key='input:'||$1::text",[id]);}

test('038 actual SQL: empty scope preserves bounded retention and lease maintenance without granting any processing source',async t=>{
  const db=new PGlite({extensions:{vector}});
  try {
    await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create role public_probe;');
    const directory=new URL('../supabase/migrations/',import.meta.url),files=await readdir(directory);
    for(let n=1;n<=37;n++){const file=files.find(f=>f.endsWith('.sql')&&Number(f.slice(8,12))===n);assert(file);await db.exec(await readFile(new URL(file,directory),'utf8'));}
    await db.exec('set role service_role');const existingId=await enqueue(db),existingClaim=await claim(db,{p_allowed_source_ids:[source]});
    await db.exec('reset role');
    const beforeCache=(await db.query('select * from public.agent_input_cache order by uuid')).rows;
    const beforeState=(await db.query('select * from public.agent_automation_state order by key')).rows;
    await db.exec(await readFile(new URL('202610220038_agent_empty_scope_maintenance.sql',directory),'utf8'));

    await t.test('apply changes no existing snapshots or active lease and keeps invoker service-only access',async()=>{
      assert.deepEqual((await db.query('select * from public.agent_input_cache order by uuid')).rows,beforeCache);
      assert.deepEqual((await db.query('select * from public.agent_automation_state order by key')).rows,beforeState);
      const signature='public.agent_automation_claim_scoped(uuid[],integer,integer,integer,integer,integer,integer)';
      assert.equal((await db.query('select prosecdef from pg_proc where oid=$1::regprocedure',[signature])).rows[0].prosecdef,false);
      for(const role of ['anon','authenticated','public_probe','service_role'])assert.equal((await db.query("select has_function_privilege($1,$2,'EXECUTE') allowed",[role,signature])).rows[0].allowed,role==='service_role');
      await db.exec('set role service_role');assert.equal((await claim(db)).status,'busy');
      assert.equal(await rpc(db,'agent_automation_finish',{p_token:existingClaim.leaseToken,p_handled_ids:[existingId]}),true);
    });

    await t.test('empty JS-store poll removes only expired matching source/hash quarantines and returns no pending bodies',async()=>{
      await reset(db);const exact=await enqueue(db),changed=await enqueue(db),wrongSource=await enqueue(db),pending=await enqueue(db,outside);
      for(const id of [exact,changed,wrongSource])await expireQuarantine(db,id);
      await db.query("update public.agent_input_cache set raw_response=jsonb_set(raw_response,'{payload,content}','\"REPLACEMENT\"') where uuid=$1",[changed]);
      await db.query("update public.agent_input_cache set raw_response=jsonb_set(raw_response,'{source_id}',to_jsonb($2::text)) where uuid=$1",[wrongSource,outside]);
      // Match the replacement hash deliberately: the separate source guard must
      // still prevent deleting bytes belonging to another source.
      await db.query("update public.agent_automation_state set data=jsonb_set(data,'{payload_hash}',to_jsonb((select md5(raw_response::text) from public.agent_input_cache where uuid=$1::uuid))) where key='input:'||$1::text",[wrongSource]);
      const pendingBefore=await metadata(db,pending);let requests=0;
      const store=createAutomationStore({env:{SUPABASE_URL:'https://db.example.test',SUPABASE_SERVICE_ROLE_KEY:'synthetic'},fetchImpl:async(url,request)=>{
        requests++;assert.equal(url,'https://db.example.test/rest/v1/rpc/agent_automation_claim_scoped');const args=JSON.parse(request.body);assert.deepEqual(args.p_allowed_source_ids,[]);return Response.json(await rpc(db,'agent_automation_claim_scoped',args));
      }});
      assert.deepEqual(await store.claim({config:readAutomationConfig({AGENT_AUTOMATION_ENABLED:'true'}),allowedSourceIds:[]}),{status:'empty'});assert.equal(requests,1);
      assert.deepEqual((await db.query('select uuid from public.agent_input_cache order by uuid')).rows.map(r=>r.uuid).sort(),[changed,wrongSource,pending].sort());
      assert.equal((await metadata(db,exact)).status,'quarantine_expired');assert.equal((await metadata(db,changed)).status,'quarantine_changed');assert.equal((await metadata(db,wrongSource)).status,'quarantine_changed');
      assert.deepEqual(await metadata(db,pending),pendingBefore);assert.deepEqual((await db.query("select data from public.agent_automation_state where key='runner'")).rows[0].data,{});
    });

    await t.test('maintenance precedes busy without disturbing an active lease; expiry settles once and fences old workers',async()=>{
      await reset(db);const activeId=await enqueue(db),active=await claim(db,{p_allowed_source_ids:[source]});
      const expired=await enqueue(db,outside);await expireQuarantine(db,expired);
      const runner=(await db.query("select data from public.agent_automation_state where key='runner'")).rows[0].data;
      assert.deepEqual(await claim(db),{status:'busy'});assert.equal((await metadata(db,expired)).status,'quarantine_expired');
      assert.deepEqual((await db.query("select data from public.agent_automation_state where key='runner'")).rows[0].data,runner);
      assert.equal(await rpc(db,'agent_automation_renew',{p_token:active.leaseToken,p_lease_seconds:120}),true);
      await db.exec("update public.agent_automation_state set data=data||jsonb_build_object('lease_until',clock_timestamp()-interval '1 second') where key='runner'");
      assert.deepEqual(await claim(db),{status:'empty'});assert.equal((await metadata(db,activeId)).failed_attempts,1);
      assert.deepEqual(await claim(db),{status:'empty'});assert.equal((await metadata(db,activeId)).failed_attempts,1);
      assert.equal(await rpc(db,'agent_automation_renew',{p_token:active.leaseToken,p_lease_seconds:120}),false);
      assert.equal(await rpc(db,'agent_automation_finish',{p_token:active.leaseToken,p_handled_ids:[activeId]}),false);
      assert.equal(await rpc(db,'agent_automation_fail',{p_token:active.leaseToken,p_outcome:'unavailable'}),false);
      assert.equal(await rpc(db,'agent_automation_release',{p_token:active.leaseToken}),false);
      assert.equal((await db.query('select count(*)::int n from public.agent_input_cache where uuid=$1',[activeId])).rows[0].n,1);
    });

    await t.test('invalid scopes/limits still fail, while an authorized nonempty scope selects only its own inputs',async()=>{
      await reset(db);const included=await enqueue(db),excluded=await enqueue(db,outside);
      for(const p_allowed_source_ids of [null,[source,source],[null],[[source]],Array.from({length:501},()=>randomUUID())])await assert.rejects(claim(db,{p_allowed_source_ids}),e=>e.code==='23514');
      for(const patch of [{p_min_events:null},{p_max_inputs:21},{p_cooldown_seconds:59}])await assert.rejects(claim(db,patch),e=>e.code==='23514');
      assert.deepEqual(await claim(db),{status:'empty'});const selected=await claim(db,{p_allowed_source_ids:[source]});assert.equal(selected.status,'ready');assert.deepEqual(selected.inputs.map(r=>r.uuid),[included]);assert.equal((await metadata(db,excluded)).status,'pending');
    });
  } finally {await db.close();}
});
