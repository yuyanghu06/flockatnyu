import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {createBugReportTools} from '../tools/bug-reports/index.js';
import {createBugReportStore} from '../server/knowledge/bug-reports.js';
import {createApp} from '../server/runtime/app.js';
import {readConfig} from '../server/shared/config.js';
import {retrieveAssistantContext,assistantAnswerPrompt} from '../server/chat/context.js';

const id='11111111-1111-4111-8111-111111111111';
const principal={id:'local-development',allowedSourceIds:[]};
const args={summary:'Building card disappears',observedBehavior:'Selecting Bobst makes the activity card disappear.'};
const message='When I click Bobst the activity card disappears.';
const report={schema_version:1,status:'new',summary:args.summary,observed_behavior:args.observedBehavior,user_message:message};

test('029 real SQL: minimal JSON table, scoped append RPC, immutable retries and browser denial',async()=>{
 const db=new PGlite();
 try{
  await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create table public.untouched(value text);insert into public.untouched values (\'preserved\');');
  await db.exec(await readFile(new URL('../supabase/migrations/202610180029_bug_reports.sql',import.meta.url),'utf8'));
  const columns=(await db.query("select column_name,data_type from information_schema.columns where table_schema='public' and table_name='bug_reports' order by ordinal_position")).rows;
  assert.deepEqual(columns,[{column_name:'uuid',data_type:'uuid'},{column_name:'created_at',data_type:'timestamp with time zone'},{column_name:'report',data_type:'jsonb'}]);
  assert.deepEqual((await db.query('select value from public.untouched')).rows,[{value:'preserved'}]);
  assert.deepEqual((await db.query("select relrowsecurity,relforcerowsecurity from pg_class where oid='public.bug_reports'::regclass")).rows[0],{relrowsecurity:true,relforcerowsecurity:true});
  for(const role of ['anon','authenticated']){
   assert.equal((await db.query("select has_table_privilege($1,'public.bug_reports','SELECT') allowed",[role])).rows[0].allowed,false);
   assert.equal((await db.query("select has_function_privilege($1,'public.bug_report_record(uuid,jsonb)','EXECUTE') allowed",[role])).rows[0].allowed,false);
  }
  for(const op of ['INSERT','UPDATE','DELETE'])assert.equal((await db.query("select has_table_privilege('service_role','public.bug_reports',$1) allowed",[op])).rows[0].allowed,false);
  await db.exec('set role service_role');
  const record=payload=>db.query('select public.bug_report_record($1,$2) result',[id,JSON.stringify(payload)]);
  const first=(await record(report)).rows[0].result;assert.equal(first.status,'ready');assert.equal(first.outcome,'created');assert.equal(first.reportId,id);assert(first.createdAt);
  assert.equal((await record(report)).rows[0].result.outcome,'already_saved');
  assert.equal((await record({...report,summary:'Changed'})).rows[0].result.status,'conflict');
  assert.deepEqual((await db.query('select report from public.bug_reports')).rows,[{report}]);
  await db.exec('reset role');
  for(const payload of [null,[],{}, {...report,status:'fixed'}, {...report,summary:''}, {...report,user_message:5}])await assert.rejects(record(payload));
  assert.equal((await db.query('select count(*)::int n from public.bug_reports')).rows[0].n,1);
 }finally{await db.close();}
});

test('bug tool requires trusted current-message context and preserves user facts with unknown fields blank',async()=>{
 const writes=[];
 const tools=createBugReportTools({store:{configured:true,record:async input=>{writes.push(input);return{status:'ready',reportId:input.reportId,createdAt:'2026-10-18T18:00:00Z',outcome:'created'};}}});
 const execute=patch=>tools.execute({name:'bug_reports',arguments:args,principal,bugReportContext:{reportId:id,userMessage:message},...patch});
 assert.equal((await execute({bugReportContext:null})).status,'forbidden');
 assert.equal((await execute({principal:{id:'unauthorized'}})).status,'forbidden');
 assert.equal((await execute({arguments:{...args,reportId:id}})).status,'invalid_request');
 assert.equal((await execute({name:'delete_bug_report'})).status,'invalid_request');
 assert.equal(writes.length,0);
 const result=await execute();assert.equal(result.status,'ready');assert.equal(writes.length,1);
 assert.equal(writes[0].report.user_message,message);assert.equal(writes[0].report.expected_behavior,'');assert.deepEqual(writes[0].report.steps_to_reproduce,[]);
 assert.equal(writes[0].report.status,'new');assert.equal(writes[0].report.summary,args.summary);
 assert(!JSON.stringify(result).includes(message));
});

test('store sends only a bounded fixed RPC and returns a sanitized receipt or truthful failure',async()=>{
 let called=0;
 const store=createBugReportStore({env:{SUPABASE_URL:'https://project.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'synthetic-secret'},fetchImpl:async(url,options)=>{
  called++;assert.equal(url,'https://project.supabase.co/rest/v1/rpc/bug_report_record');assert.equal(options.redirect,'error');
  assert.deepEqual(JSON.parse(options.body),{p_uuid:id,p_report:report});
  return Response.json({status:'ready',reportId:id,createdAt:'2026-10-18T18:00:00Z',outcome:'created',private:'must not leak'});
 }});
 assert.deepEqual(await store.record({reportId:id,report}),{status:'ready',reportId:id,createdAt:'2026-10-18T18:00:00Z',outcome:'created'});
 assert.equal((await store.record({reportId:id,report,signal:AbortSignal.abort()})).status,'aborted');assert.equal(called,1);
 const unavailable=createBugReportStore({env:{SUPABASE_URL:'https://project.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'synthetic-secret'},fetchImpl:async()=>Response.json({}, {status:404})});
 assert.equal((await unavailable.record({reportId:id,report})).status,'schema_not_ready');
});

test('real chat planning saves one structured report, receives receipt, and direct arbitrary tool calls cannot write',async()=>{
 const saved=[];let turns=0,answered=false;
 const bugReportTools=createBugReportTools({store:{configured:true,record:async value=>{
  saved.push(value);return{status:'ready',reportId:value.reportId,createdAt:'2026-10-18T18:00:00Z',outcome:'created'};
 }}});
 const config=readConfig({LLM_PROVIDER:'openai-compatible',LLM_MODEL:'fixture',LLM_API_KEY:'fixture'});
 const app=createApp({config,bugReportTools,auth:()=>principal,provider:{
  planTools:async({system,tools})=>{assert(tools.some(t=>t.name==='bug_reports'));assert(system.includes('reports an actual bug'));return turns++===0?[{name:'bug_reports',arguments:args}]:[];},
  async *stream({system}){assert(system.includes('"bugReport"'));assert(system.includes('"outcome":"created"'));answered=true;yield 'Your bug report was recorded.';}
 }});
 const inventory=await(await app.request('/api/tools')).json();assert(inventory.tools.some(t=>t.name==='bug_reports'));
 const direct=await app.request('/api/tools/bug_reports',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(args)});assert.equal(direct.status,503);assert.equal(saved.length,0);
 const response=await app.request('/api/chat',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({messages:[{role:'user',content:message}]})});
 const body=await response.text();assert.equal(response.status,200);assert(answered);assert.equal(saved.length,1);assert.equal(saved[0].report.user_message,message);
 assert(body.includes('"name":"bug_reports","status":"completed"'));assert(!body.includes('synthetic-secret'));
});

test('changed report arguments cannot create duplicate attempts or progress rows; memory still completes',async()=>{
 const saved=[],events=[];let rounds=0,memoryWrites=0;
 const bugReportTools=createBugReportTools({store:{configured:true,record:async value=>{
  saved.push(value);return{status:'ready',reportId:value.reportId,createdAt:'2026-10-18T18:00:00Z',outcome:'created'};
 }}});
 const memoryTools={tools:[{name:'update_memory'}],execute:async()=>{memoryWrites++;return{status:'ready',outcome:'updated',memory:{updated_at:'2026-10-18T18:00:00Z'}};}};
 const context=await retrieveAssistantContext({messages:[{role:'user',content:message}],principal,bugReportTools,memoryTools,
  onToolEvent:event=>events.push(event),now:'2026-10-18T18:00:00Z',timeZone:'America/New_York',provider:{planTools:async({system,tools})=>{
   const round=rounds++;
   const retry={name:'bug_reports',arguments:{...args,summary:`Reworded report ${round}`}};
   if(round===0)return[{name:'bug_reports',arguments:args},retry];
   assert(tools.some(tool=>tool.name==='bug_reports'),'catalogue stays stable after the once-only backend attempt');assert.match(system,/BUG REPORT ATTEMPT COMPLETE/);
   if(round===1)return[retry,{name:'update_memory',arguments:{content:'Supplied club preference'}}];
   if(round<5)return[retry];return[];
  }}});
 assert.equal(saved.length,1);assert.equal(memoryWrites,1);
 assert.deepEqual(events.filter(event=>event.name==='bug_reports').map(event=>event.status),['running','completed']);
 assert.equal(context.results.filter(result=>result.tool==='bug_reports').length,1);
 assert.equal(context.results.find(result=>result.tool==='bug_reports').bugReport.outcome,'created');
 assert(context.results.some(result=>result.memoryUpdate?.outcome==='updated'));
 assert.match(assistantAnswerPrompt({...context,now:'2026-10-18T18:00:00Z',timeZone:'America/New_York'}),/"bugReport"/);
});

test('failed or thrown bug report attempts are final and cannot claim a saved report',async()=>{
 for(const failure of ['conflict','unavailable','schema_not_ready','throw']){
  let attempts=0,rounds=0;const events=[];
  const bugReportTools={tools:[{name:'bug_reports'}],execute:async()=>{
   attempts++;if(failure==='throw')throw Error('fixture');return{status:failure,sources:[]};
  }};
  const context=await retrieveAssistantContext({messages:[{role:'user',content:message}],principal,bugReportTools,
   onToolEvent:event=>events.push(event),now:'2026-10-18T18:00:00Z',timeZone:'America/New_York',provider:{planTools:async({system})=>{
    if(rounds++)assert.match(system,/must not be retried|Never call it again/);
    return[{name:'bug_reports',arguments:{...args,context:`Attempt ${rounds}`}}];
   }}});
  assert.equal(attempts,1);assert.deepEqual(events.map(event=>event.status),['running','failed']);
  const result=context.results.find(result=>result.tool==='bug_reports');
  assert.equal(result.status,failure==='throw'?'unavailable':failure);assert.equal(result.bugReport,undefined);
 }
});
