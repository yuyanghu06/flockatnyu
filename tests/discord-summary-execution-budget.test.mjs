import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir,writeFile,mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {vector} from '@electric-sql/pglite-pgvector';

const targets=['discord_summary_claim_job','discord_summary_renew_job','discord_summary_get_inputs','discord_summary_get_parts','discord_summary_save_part','discord_summary_reserve_request','discord_summary_commit_usage','discord_summary_fail_job','discord_summary_lock_job'];

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
