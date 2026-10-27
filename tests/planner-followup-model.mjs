import assert from 'node:assert/strict';
import {promptSourceFiles} from './fixtures/chat-source-files.mjs';
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile,copyFile,readdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {createProvider} from '../server/providers/index.js';
import {readConfig} from '../server/shared/config.js';
import {fixture,task,input,ids,eventId,copy,assertAdded,assertPreserved} from './fixtures/planner-followup.mjs';

const digest=value=>createHash('sha256').update(typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value)).digest('hex');
const ready=()=>task(1,{current:true});
const scenarios=[
 {name:'current-ready-ahead-of121large-backlog',setup:()=>({backlog:121,current:[ready()]}),verify(f){assertAdded(f);assert(!f.tasks.has(ready().uuid),'Current ready task must be resolved');}},
 {name:'blocked-current-and-context-dependent-ready',setup:()=>({backlog:121,unmatchedAuthors:['600'],current:[task(1,{current:true,original:input(1,{author:'600'}),personId:null,summary:'Offered full-event Friday workshop attendance, but original speaker has no known roster match. Do not guess a person.'}),task(2,{current:true,original:input(2,{content:'me'}),summary:'Reply is only me. Prior interpretation targeted Friday workshop; verify actual nearby context to establish that offered attendance.'})]}),verify(f){assertAdded(f);assert(f.tasks.has(ready().uuid),'Unmatched original must survive');assert(!f.tasks.has(task(2).uuid),'Independently ready speaker must finish');assert(!f.state.event_people.some(row=>row.person_id===ids.blocked),'Unmatched identity cannot be guessed from roster');
  assert(f.tools.some(row=>row.name==='lookup_map_person'&&row.arguments.providerUserId==='600'&&row.result.status==='ready'&&row.result.person===null),'Must observe current unmatched identity');
  assert(f.tools.some(row=>row.name==='read_pending_task'&&row.arguments.taskId===task(2).uuid&&row.arguments.detail==='full')||f.chronology.some(row=>row.kind==='source_read'&&row.messageId==='302'&&row.context===true),'A me reply requires the omitted actual context via full detail or targeted source context');}},
 {name:'unavailable-current-target-preserves-work',setup:()=>({backlog:121,current:[ready()],mapUnavailable:true}),verify(f){assert.equal(f.writes.length,0);assert.deepEqual(f.state,f.before);assertPreserved(f);assert(f.tasks.has(ready().uuid));assert(f.tools.some(row=>row.name==='read_map_events'&&row.result.status!=='ready'),'Must observe actual unavailable map boundary');assert(!f.chronology.some(row=>row.kind==='task_resolve'),'Failed reads cannot resolve saved work');}},
 {name:'concurrent-human-edit-reread-and-merge',setup:()=>({backlog:121,current:[ready()],conflict:true}),verify(f){assertAdded(f,{humanConflict:true});assert(!f.tasks.has(ready().uuid));assert.equal(f.attempts.length,2,'One conflicted attempt then one merged successful attempt');assert.equal(f.attempts[1].expectedUpdatedAt,'2026-10-23T22:30:01.000Z');}},
];

// The ledger tracks selected work across model turns, not just per-response read
// counts. A task exits the active group only after an applied action/resolution or
// a specific returned blocker. This is an independent behavioral oracle.
export function assertFocusedProgress(f){
 const allTasks=new Map(f.initialTasks.map(task=>[task.uuid,task])),group=new Set(),blockers=new Set(),currentIds=new Set(f.initialTasks.filter(row=>f.originals.some(input=>row.info.inputs.some(saved=>saved.uuid===input.uuid))).map(row=>row.uuid)),openCurrent=new Set(currentIds);
 for(const row of f.tools){
  if(row.name==='read_pending_task'){
   if(openCurrent.size&&!currentIds.has(row.arguments.taskId))assert.fail('Older history loaded before every current task was resolved or had an actual unavailable/missing/unmatched dependency');
   group.add(row.arguments.taskId);assert(group.size<=2,'A third distinct task was loaded while prior selected work still lacked an action or returned blocker');
  }
  const reason=row.result?.reason??row.result?.status,unavailable=['unavailable','not_configured','source_unavailable','map_unavailable','identity_unavailable'].includes(reason);
  for(const id of row.inputIds){const task=allTasks.get(id);if(!task)continue;
   const own=task.info.inputs.some(input=>{const event=input.raw_response,payload=event.payload,url=`https://discord.com/channels/${payload.guild_id}/${payload.channel_id}/${payload.id}`;
    return row.name==='lookup_map_person'?row.arguments.provider==='discord'&&row.arguments.providerUserId===payload.author.id&&row.arguments.sourceId===event.source_id&&row.arguments.sourceUrl===url
     :row.name==='read_discord_messages'&&(row.arguments.url===url||row.arguments.channelId===payload.channel_id&&row.arguments.messageId===payload.id);});
   const targetSource=task.info.request.calendarKind==='member'?task.info.batchContext?.memberPlans?.sourceId:task.info.batchContext?.calendarMap?.sourceId;
   const target=(f.before?.events??[{id:ids.event,source_id:ids.club,source_record_id:eventId}]).find(event=>event.source_id===targetSource&&event.source_record_id===task.info.request.calendarEventId);
   const exactMap=row.name==='read_map_events'&&typeof targetSource==='string'&&typeof task.info.request.calendarEventId==='string'&&(row.arguments.eventId!==undefined?row.arguments.eventId===target?.id:row.arguments.sourceId===targetSource&&row.arguments.sourceRecordId===task.info.request.calendarEventId);
   const actualBlocker=row.name==='lookup_map_person'&&own&&(row.result.status==='ready'&&row.result.person===null||unavailable)
    ||row.name==='read_discord_messages'&&own&&unavailable
    ||exactMap&&(unavailable||row.result.status==='ready'&&Array.isArray(row.result.events)&&row.result.events.length===0);
   if(actualBlocker){group.delete(id);blockers.add(id);openCurrent.delete(id);}
  }
  if(row.name==='resolve_pending_task'&&row.result.status==='ready')for(const id of row.inputIds){group.delete(id);openCurrent.delete(id);}
 }
 const followups=f.proposals.filter(row=>row.phase==='followup');assert(followups.every(row=>(row.result.toolCalls?.length??0)<=16),'Existing16call limit must be obeyed');
 const initial=f.requests.find(request=>request.system.includes('FOLLOWUP phase'));assert(initial,'Must enter production follow-up');const payload=JSON.parse(initial.messages[0].content);assert.deepEqual(payload.referenceBindings.inputIds.map(row=>row.uuid),payload.context.tasks.map(row=>row.uuid),'Actual refs and displayed manifest priority must agree');
 return {remainingActiveTasks:[...group],observedBlockedTasks:[...blockers],unresolvedCurrentWithoutBlocker:[...openCurrent]};
}

const arg=name=>process.argv.find(value=>value.startsWith(`--${name}=`))?.slice(name.length+3),selected=process.argv.filter(value=>value.startsWith('--case=')).map(value=>value.slice(7)),chosen=scenarios.filter(row=>!selected.length||selected.includes(row.name));
assert(chosen.length,'No matching scenarios');
const maxRequests=Number(arg('max-requests')??32),perCaseCap=Number(arg('per-case-cap')??8);assert(Number.isInteger(maxRequests)&&maxRequests>=1&&maxRequests<=32,'Hard total dispatch cap must be1–32');assert(Number.isInteger(perCaseCap)&&perCaseCap>=1&&perCaseCap<=10,'Hard per-case dispatch cap must be1–10');
if(process.argv.includes('--self-check')){
 const a=ready(),b=task(2,{current:true,original:input(2,{author:'600'})}),old=task(1000),rows=[a,b,old];
 const testTrace=tools=>({initialTasks:rows,originals:[a.info.inputs[0],b.info.inputs[0]],tools,proposals:[{phase:'followup',result:{toolCalls:[]}}],requests:[{system:'FOLLOWUP phase',messages:[{content:JSON.stringify({referenceBindings:{inputIds:rows.map(row=>({uuid:row.uuid}))},context:{tasks:rows.map(row=>({uuid:row.uuid}))}})}]}]});
 const read=t=>({name:'read_pending_task',arguments:{taskId:t.uuid},inputIds:[t.uuid],result:{status:'ready'}}),result=(name,t,value,arguments_={})=>({name,arguments:arguments_,inputIds:[t.uuid],result:value});
 const base=[read(a),read(b)];
 assert.throws(()=>assertFocusedProgress(testTrace([...base,read(old)])),/Older history|third distinct/);
 assert.throws(()=>assertFocusedProgress(testTrace([...base,result('patch_map_participation',a,{status:'ready'}),read(old)])),/Older history/,'A patch without resolution cannot release completed task scope');
 assert.throws(()=>assertFocusedProgress(testTrace([...base,result('patch_map_participation',a,{status:'conflict'}),read(old)])),/Older history/,'Recoverable CAS conflicts cannot release task scope');
 assert.throws(()=>assertFocusedProgress(testTrace([...base,result('lookup_map_person',a,{status:'forbidden_source'}),read(old)])),/Older history/,'Wrong-source argument denial cannot establish an actual blocker');
 assert.throws(()=>assertFocusedProgress(testTrace([...base,result('read_map_events',a,{status:'ready',events:[]},{sourceId:ids.source,sourceRecordId:eventId}),read(old)])),/Older history/,'Empty results from wrong-source map queries cannot establish actual absence');
 const passed=assertFocusedProgress(testTrace([...base,result('lookup_map_person',b,{status:'ready',person:null},{provider:'discord',providerUserId:'600',sourceId:ids.source,sourceUrl:'https://discord.com/channels/100/200/302'}),result('resolve_pending_task',a,{status:'ready'}),read(old)]));
 assert.deepEqual(passed.unresolvedCurrentWithoutBlocker,[]);console.log('PASS independent focus oracle rejects a third task, skipped current peer, premature patch completion, CAS escape and wrong-source escape; accepts actual unmatched peer plus exact resolution. Inference requests:0.');process.exit(0);
}
if(!process.argv.includes('--live-model')){console.log(JSON.stringify({modelCalls:0,cases:chosen.map(row=>({name:row.name,taskCount:122+(row.name.includes('blocked')?1:0),perCaseDispatchCap:perCaseCap})),globalDispatchCap:maxRequests,instructions:'Run deterministic tests first. --live-model requires implementation freeze and parent approval.'}));process.exit(0);}
const config=readConfig();assert(config.configured,'Configured model credentials unavailable; never printed');
const directory=resolve(arg('evidence-dir')??`evidence/planner-followup-focus/gate-${Date.now()}`);await mkdir(dirname(directory),{recursive:true});await mkdir(directory,{mode:0o700});
async function moduleFiles(path){const entries=await readdir(new URL(`../${path}/`,import.meta.url),{withFileTypes:true}),out=[];for(const entry of entries){const file=`${path}/${entry.name}`;if(entry.isDirectory())out.push(...await moduleFiles(file));else if(entry.isFile())out.push(file);}return out;}
const files=[...await moduleFiles('server'),...await moduleFiles('tools'),...await moduleFiles('src/api/operations'),...promptSourceFiles(),'package.json','package-lock.json','tests/fixtures/chat-source-files.mjs','tests/fixtures/planner-followup.mjs','tests/agent-followup-focus.test.mjs','tests/planner-followup-model.mjs'].sort();
const hashes=async()=>Object.fromEntries(await Promise.all(files.map(async path=>[path,digest(await readFile(new URL(`../${path}`,import.meta.url)))]))),pins=await hashes();
for(const path of files){const dest=resolve(directory,'source',path);await mkdir(dirname(dest),{recursive:true});await copyFile(new URL(`../${path}`,import.meta.url),dest);}
const report={provider:config.provider,model:config.model,runtimeRoot:new URL('../',import.meta.url).pathname,originalSourceRoot:arg('source-root')??null,startedAt:new Date().toISOString(),networkRequests:0,maxRequests,perCaseCap,initialSetup:'Deterministic initial finish uses exact saved-task coverage; runner invokes a separately simulated ready sync. Every follow-up response uses the actual configured model.',network:'Only the configured inference endpoint is permitted; all business boundaries are in-memory simulations.',pins,cases:[],limitations:['Tests follow-up decisions, not real-model initial interpretation.','No live Discord/Calendar/map/database writes or browser deployment checks.','Initial sync result is simulated; production deterministic projection is covered by the existing integration suite.','Machine assertions require independent semantic review of retained returned model text, proposals and outcomes.']};
const evidence=resolve(directory,'evidence.json'),persist=()=>writeFile(evidence,JSON.stringify(report,null,2)+'\n',{mode:0o600});await persist();
let active;const originalFetch=globalThis.fetch,endpoint=`${config.baseUrl.replace(/\/$/,'')}/${config.provider==='anthropic'?'messages':'chat/completions'}`;
globalThis.fetch=async(value,options)=>{assert.equal(String(value),endpoint,'Network restricted to exact configured inference endpoint');assert.deepEqual(await hashes(),pins,'Pinned files changed before dispatch');if(report.networkRequests>=maxRequests||active.networkRequests>=perCaseCap){active.budgetStopped=true;await persist();throw Error('Hard inference dispatch cap reached');}report.networkRequests++;active.networkRequests++;const dispatch={sequence:report.networkRequests,caseSequence:active.networkRequests,startedAt:new Date().toISOString()};active.dispatches.push(dispatch);await persist();try{const response=await originalFetch(value,{...options,redirect:'error'});dispatch.httpStatus=response.status;dispatch.finishedAt=new Date().toISOString();await persist();return response;}catch(error){dispatch.failure=error?.name==='AbortError'?'inference_aborted':'inference_transport_failed';dispatch.finishedAt=new Date().toISOString();await persist();throw error;}};
const raw=createProvider(config,{audit:{required:false,startModel:async()=>({status:'ready'}),finishModel:async()=>({status:'ready'})},fetchImpl:globalThis.fetch,writeDiagnostic:()=>{}});
const provider={toolTurn:async request=>{try{const returned=await raw.toolTurn(request);active.returnedModelTurns.push(copy(returned));await persist();return returned;}catch(error){active.providerFailures.push({name:error?.name,reason:error?.message});await persist();throw error;}}};
try{for(const scenario of chosen){active={name:scenario.name,networkRequests:0,passed:false,returnedModelTurns:[],dispatches:[],providerFailures:[]};report.cases.push(active);const f=fixture(scenario.setup()),started=performance.now();active.initialTaskCount=f.initialTasks.length;active.taskBytes=Buffer.byteLength(JSON.stringify(f.initialTasks.find(row=>row.uuid===ready().uuid)));active.backlogBeforeDigest=digest(f.backlogTasks);
 try{active.outcome=await f.run(provider);scenario.verify(f);active.focus=assertFocusedProgress(f);assert.equal(active.outcome.status,'completed','Production handler must complete');assert.equal(active.outcome.followupStatus,'completed','Follow-up must finish before existing limits');active.passed=true;}catch(error){active.failure=error.message;process.exitCode=1;}
 Object.assign(active,{tools:f.tools,execution:f.execution,proposals:f.proposals,chronology:f.chronology,attempts:f.attempts,writes:f.writes,calendarWrites:f.calendarWrites,before:f.before,finalState:f.state,finalTasks:[...f.tasks.values()],initialCurrentTasks:f.initialTasks.filter(row=>!f.backlogTasks.some(old=>old.uuid===row.uuid)),backlogAfterDigest:digest(f.backlogTasks.map(row=>f.tasks.get(row.uuid))),modelRequestBytes:f.requests.filter(row=>row.system.includes('FOLLOWUP phase')).map(row=>Buffer.byteLength(JSON.stringify(row.messages))),durationMs:Math.round(performance.now()-started)});await persist();console.log(JSON.stringify({case:active.name,passed:active.passed,networkRequests:active.networkRequests,durationMs:active.durationMs,...(active.failure?{failure:active.failure}:{})}));}}
finally{globalThis.fetch=originalFetch;report.finishedAt=new Date().toISOString();report.pinsStable=JSON.stringify(await hashes())===JSON.stringify(pins);await persist();}
console.log(JSON.stringify({evidence,model:report.model,networkRequests:report.networkRequests,maxRequests,passed:report.cases.every(row=>row.passed),pinsStable:report.pinsStable}));
