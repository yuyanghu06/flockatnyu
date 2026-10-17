import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir,writeFile,mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {vector} from '@electric-sql/pglite-pgvector';
import {createDiscordSummaryStore} from './fixtures/legacy-summary-store.mjs';

const op='11111111-1111-4111-8111-111111111111',job='22222222-2222-4222-8222-222222222222',lease='33333333-3333-4333-8333-333333333333',reservation='44444444-4444-4444-8444-444444444444',member='55555555-5555-4555-8555-555555555555',source='66666666-6666-4666-8666-666666666666',guild='1203562091500404776',channel='1203562091982622814';
const env={SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'fixture-budget-private'};
const plan={guildId:guild,provider:'openai-compatible',model:'gpt-6-luna',promptVersion:'discord-calendar-retention-v3',mode:'weekly',asOf:'2025-10-12T12:00:00.000Z'};
const operation={id:op,guild_id:guild,policy_revision:3,provider:plan.provider,model:plan.model,prompt_version:plan.promptVersion,mode:plan.mode,as_of:plan.asOf,total_jobs:1,planning_complete:true,planning_cursor:1,planning_total:1,max_requests:77,max_cost_usd:1,request_count:0,spent_usd:0};
const part={stage:'map',ordinal:0,inputHash:'a'.repeat(64),summary:{overview:[]},coverage:[],childParts:[],reservationId:reservation};
const summary={overview:[],decisions:[],actions:[],events:[],people:[],resources:[],uncertainties:[]},finalPart={stage:'map',ordinal:0,inputHash:'a'.repeat(64)},coverage={inputRecordCount:1,representedMessageCount:1,segmentCount:1,inputFingerprint:'b'.repeat(64),mapPartCount:1};
const common={p_job_id:job,p_lease_token:lease};
// These protocol expectations are independent of the adapter's deadline switch.
const cases=[
 ['preview','preview',65000,plan,{p_guild_id:guild,p_provider:plan.provider,p_model:plan.model,p_prompt_version:plan.promptVersion,p_mode:'weekly',p_as_of:plan.asOf},{guild_id:guild,policy_revision:3,group_count:1,message_count:1,segment_count:null,input_chars:null,cached_count:0}],
 ['beginOperation','begin_operation',65000,{...plan,expectedPolicyRevision:3,maxCostUsd:1,maxRequests:77,dueIdentity:'weekly:2025-10-12'},{p_guild_id:guild,p_expected_revision:3,p_provider:plan.provider,p_model:plan.model,p_prompt_version:plan.promptVersion,p_max_cost_usd:1,p_max_requests:77,p_mode:'weekly',p_as_of:plan.asOf,p_due_identity:'weekly:2025-10-12'},operation],
 ['prepareOperation','prepare_operation',60000,{operationId:op,expectedCursor:1},{p_operation_id:op,p_expected_cursor:1},{planned_groups:0,operation}],
 ['getOperation','get_operation',12000,{operationId:op},{p_operation_id:op},operation],
 ['getPendingOperation','get_pending_operation',12000,plan,{p_guild_id:guild,p_provider:plan.provider,p_model:plan.model,p_prompt_version:plan.promptVersion,p_mode:'weekly',p_as_of:plan.asOf},operation],
 ['claimJob','claim_job',60000,{operationId:op,ownerId:'fixture-worker',leaseSeconds:300},{p_operation_id:op,p_owner_id:'fixture-worker',p_lease_seconds:300},{id:job,lease_token:lease,source_id:source,guild_id:guild,channel_id:channel,channel_name:'Fixture channel',represented_message_count:1,input_record_count:1,segment_count:1}],
 ['renewJob','renew_job',60000,{jobId:job,leaseToken:lease,leaseSeconds:300},{...common,p_lease_seconds:300},true],
 ['getInputs','get_inputs',60000,{jobId:job,leaseToken:lease,after:2,messageLimit:12,charLimit:18000},{...common,p_after:2,p_limit:12,p_char_limit:18000},{records:[],nextCursor:null,done:true}],
 ['getParts','get_parts',60000,{jobId:job,leaseToken:lease},common,[]],
 ['savePart','save_part',60000,{jobId:job,leaseToken:lease,part},{...common,p_part:part},part],
 ['reserveRequest','reserve_request',60000,{jobId:job,leaseToken:lease,reservationId:reservation,maxCostUsd:0.0032,inputTokens:123,outputTokens:6400},{...common,p_reservation_id:reservation,p_max_cost_usd:0.0032,p_input_tokens:123,p_output_tokens:6400},{id:reservation,dispatch_allowed:true,max_cost_usd:0.0032,status:'reserved'}],
 ['commitUsage','commit_usage',60000,{reservationId:reservation,status:'unknown',usage:null},{p_reservation_id:reservation,p_status:'unknown',p_usage:{}},true],
 ['finishJob','finish_job',65000,{jobId:job,leaseToken:lease,summary,finalPart,coverage},{...common,p_summary:summary,p_final_part:finalPart,p_coverage:coverage},{channel_id:channel,channel_name:'Fixture channel'}],
 ['failJob','fail_job',60000,{jobId:job,leaseToken:lease,code:'runtime_limit'},{...common,p_code:'runtime_limit'},true],
 ['listSummaries','list_results',12000,{principal:{id:member,allowedSourceIds:[source,source]},tier:'weekly',limit:10},{p_member_id:member,p_allowed_source_ids:[source],p_tier:'weekly',p_after:null,p_limit:10},[]],
];
const targets=['discord_summary_claim_job','discord_summary_renew_job','discord_summary_get_inputs','discord_summary_get_parts','discord_summary_save_part','discord_summary_reserve_request','discord_summary_commit_usage','discord_summary_fail_job','discord_summary_lock_job'];

test('010 store deadlines are scoped while every named request/body and successful interface stays unchanged',async t=>{
 const deadlines=[];t.mock.method(AbortSignal,'timeout',ms=>{deadlines.push(ms);return new AbortController().signal;});
 for(const [method,rpc,budget,args,expected,data] of cases){let requests=0;const store=createDiscordSummaryStore({env,fetchImpl:async(url,options)=>{requests++;assert.equal(url,'https://fixture.supabase.co/rest/v1/rpc/discord_summary_'+rpc);assert.equal(options.method,'POST');assert.equal(options.redirect,'error');assert.deepEqual(JSON.parse(options.body),expected);assert(options.signal instanceof AbortSignal);return Response.json(data);}});const result=await store[method](args);assert.equal(result.status,'ready',method);assert.equal(requests,1,method);assert.equal(deadlines.at(-1),budget,method);if(method==='claimJob'){assert.equal(result.job.jobId,job);assert.equal(result.job.leaseToken,lease);assert.equal(result.job.channelId,channel);}if(method==='reserveRequest'){assert.equal(result.reservation.reservationId,reservation);assert.equal(result.reservation.dispatchAllowed,true);}if(method==='finishJob'){assert.equal(result.result.channelId,channel);assert.equal(result.result.channelName,'Fixture channel');}}
 assert.equal(deadlines.length,cases.length);
});

test('010 pre-abort, parent cancellation and deadline expiry never wait, retry or alter caller signals',async t=>{
 const timeouts=[];t.mock.method(AbortSignal,'timeout',ms=>{const controller=new AbortController();timeouts.push({ms,controller});return controller.signal;});
 for(const [method,rpc,budget,args] of cases){
  const before=new AbortController();before.abort();let fetches=0;const pre=createDiscordSummaryStore({env,fetchImpl:async()=>{fetches++;throw new Error('pre-abort must not fetch');}}),seen=timeouts.length;assert.equal((await pre[method]({...args,signal:before.signal})).status,'aborted',method);assert.equal(fetches,0);assert.equal(timeouts.length,seen);
  for(const kind of ['parent','deadline']){const parent=new AbortController();let entered;const ready=new Promise(resolve=>entered=resolve),store=createDiscordSummaryStore({env,fetchImpl:async(url,options)=>{fetches++;entered(options.signal);return await new Promise((resolve,reject)=>{options.signal.addEventListener('abort',()=>reject(Object.assign(new Error('private fixture cancellation'),{code:'ABORT_ERR'})),{once:true});});}});const start=fetches,pending=store[method]({...args,signal:parent.signal}),combined=await ready;assert.equal(timeouts.at(-1).ms,budget,method);if(kind==='parent')parent.abort();else timeouts.at(-1).controller.abort();const result=await pending;assert.equal(result.status,kind==='parent'?'aborted':'unavailable',method+' '+kind);assert.equal(fetches,start+1);assert.equal(combined.aborted,true);assert.equal(parent.signal.aborted,kind==='parent');assert(!JSON.stringify(result).includes('private fixture'));}
 }
});

test('010 failures make one HTTP attempt and preserve existing sanitized timeout/conflict/permission status mapping',async t=>{
 t.mock.method(AbortSignal,'timeout',()=>new AbortController().signal);
 for(const [method,rpc,budget,args] of cases)for(const [name,fetchImpl,status] of [
  ['SQL statement timeout',async()=>Response.json({code:'57014'},{status:500}),'unavailable'],
  ['temporary HTTP failure',async()=>new Response('fixture private error',{status:503}),'unavailable'],
  ['permission denial',async()=>new Response('',{status:403}),'forbidden'],
  ['stale CAS',async()=>Response.json({code:'40001'},{status:400}),'stale'],
  ['network exception',async()=>{throw new Error('fixture private error');},'unavailable'],
 ]){let calls=0;const store=createDiscordSummaryStore({env,fetchImpl:async(...inputs)=>{calls++;return fetchImpl(...inputs);}}),result=await store[method](args);assert.equal(result.status,status,method+' '+name);assert.equal(calls,1);assert(!JSON.stringify(result).includes('fixture private'));}
});

test('010 changes only targeted function timeout attributes; full bodies, signatures, ACL, RLS, roles and global settings remain identical',async()=>{
 const db=new PGlite({extensions:{vector}});try{
  const names=(await readdir(new URL('../supabase/migrations/',import.meta.url))).filter(name=>/^2026101200(?:0[1-9]|10)_.*\.sql$/.test(name)).sort();assert.equal(names.length,10);await db.exec('create role anon;create role authenticated;create role service_role bypassrls;');
  const hashes={};for(const file of names.slice(0,9)){const data=await readFile(new URL('../supabase/migrations/'+file,import.meta.url));hashes[file]=createHash('sha256').update(data).digest('hex');await db.exec(data.toString());}
  assert.equal(hashes[names[5]],'b514fe4e4775045a05f2dfe58834e7f2b7fd699a4c563e2252ccabf808a2549d');assert.equal(hashes[names[6]],'2678385838b31764e46d0818a4a1316a456732b09e9607e72d82c856345f715b');assert.equal(hashes[names[7]],'3c6b88d3cc93b64364a0f12821e3525079049030604bf8aceea04832e1fbc1ad');assert.equal(hashes[names[8]],'7466b2e1871d20a8c5752f0a1186802e880091353da89a7c69eaffbb4c95b59f');
  const capture=async()=>({
   functions:(await db.query("select to_jsonb(p)-'proconfig' metadata,proconfig,pg_get_functiondef(p.oid) definition,has_function_privilege('anon',p.oid,'EXECUTE') anon_execute,has_function_privilege('authenticated',p.oid,'EXECUTE') authenticated_execute,has_function_privilege('service_role',p.oid,'EXECUTE') service_execute from pg_proc p where pronamespace='public'::regnamespace order by oid")).rows,
   tables:(await db.query("select to_jsonb(c) metadata from pg_class c where relnamespace='public'::regnamespace and relkind in('r','i','S') order by oid")).rows,
   policies:(await db.query('select to_jsonb(p) metadata from pg_policy p order by oid')).rows,
   roles:(await db.query("select to_jsonb(r)-'rolpassword' metadata from pg_roles r order by oid")).rows,
   settings:(await db.query("select name,setting,source,context from pg_settings where name in('statement_timeout','lock_timeout','work_mem') order by name")).rows,
  });
  const before=await capture(),migration=await readFile(new URL('../supabase/migrations/'+names[9],import.meta.url),'utf8');assert(!/alter\s+(role|database)|set\s+session|alter\s+system|create\s+or\s+replace/i.test(migration));await db.exec(migration);const after=await capture();for(const key of ['tables','policies','roles','settings'])assert.deepEqual(after[key],before[key],key);
  assert.equal(after.functions.length,before.functions.length);const changed=[];for(let index=0;index<after.functions.length;index++){const a=after.functions[index],b=before.functions[index],name=a.metadata.proname;assert.deepEqual(a.metadata,b.metadata,name+' full body/signature/ownership/ACL');for(const key of ['anon_execute','authenticated_execute','service_execute'])assert.equal(a[key],b[key],name+' '+key);const configs=new Map((b.proconfig??[]).map(setting=>{const at=setting.indexOf('=');return[setting.slice(0,at),setting.slice(at+1)];}));if(targets.includes(name)){configs.set('statement_timeout','55s');configs.set('lock_timeout','55s');}else if(name==='discord_summary_finish_job')configs.set('lock_timeout','55s');assert.deepEqual([...(a.proconfig??[])].sort(),[...configs].map(([key,value])=>key+'='+value).sort(),name+' exact config');if(JSON.stringify(a.proconfig)!==JSON.stringify(b.proconfig)){changed.push(name);const strip=definition=>definition.replace(/^ SET (?:statement_timeout|lock_timeout) TO [^\n]+\n/gm,'');assert.equal(strip(a.definition),strip(b.definition),name+' complete definition excluding allowed attrs');assert.equal(a.metadata.prosecdef,false);assert.equal(a.anon_execute,false);assert.equal(a.authenticated_execute,false);assert.equal(a.service_execute,true);}else assert.equal(a.definition,b.definition,name+' definition');}
  assert.deepEqual(changed.sort(),[...targets,'discord_summary_finish_job'].sort());const finish=after.functions.find(row=>row.metadata.proname==='discord_summary_finish_job');assert(finish.proconfig.includes('statement_timeout=60s'));assert(finish.proconfig.includes('work_mem=16MB'));const prepare=after.functions.find(row=>row.metadata.proname==='discord_summary_prepare_operation');assert(prepare.proconfig.includes('statement_timeout=55s'));assert.deepEqual(prepare.proconfig,before.functions.find(row=>row.metadata.proname==='discord_summary_prepare_operation').proconfig);
  for(const file of names.slice(0,9))assert.equal(createHash('sha256').update(await readFile(new URL('../supabase/migrations/'+file,import.meta.url))).digest('hex'),hashes[file]);const artifactDir=await mkdtemp(join(tmpdir(),'discord-summary-execution-budget-'));await writeFile(join(artifactDir,'execution-budget-catalogue.json'),JSON.stringify({changedFunctions:changed,bodiesSignaturesAclRlsRolesGlobalSettingsUnchanged:true,migrationHashes:hashes,newMigrationHash:createHash('sha256').update(migration).digest('hex')},null,2)+'\n');console.log('EXECUTION_BUDGET_ARTIFACTS '+JSON.stringify({directory:artifactDir}));
 }finally{await db.close();}
});
