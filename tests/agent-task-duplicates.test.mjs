import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {createStagedPipeline} from '../server/automation/staged-pipeline.js';
import {createBoundedResults} from '../server/automation/bounded-result.js';
import {createAutomationHandler} from '../server/automation/handler.js';
import {readAutomationConfig} from '../server/automation/config.js';

// A frozen real previous pipeline can reproduce the failed behavior without
// replacing any runtime file or using a scripted model as behavior evidence.
const pipelineFactory=process.env.TASK_DUPLICATE_BASELINE_PIPELINE
  ?(await import('data:text/javascript;base64,'+Buffer.from((await readFile(process.env.TASK_DUPLICATE_BASELINE_PIPELINE,'utf8')).replace(/from (['"])(\.[^'"]+)\1/g,(_m,_q,p)=>`from ${JSON.stringify(new URL(p,new URL('../server/automation/staged-pipeline.js',import.meta.url)).href)}`)).toString('base64'))).createStagedPipeline:createStagedPipeline;
const source=randomUUID(),knownPerson=randomUUID(),stamp='2026-10-22T20:00:00.000Z';
const original=(message='300')=>({uuid:randomUUID(),raw_response:{source:'discord',source_id:source,event_type:'message_created',event_id:message,revision:'1',received_at:stamp,payload:{id:message,guild_id:'100',channel_id:'200',author:{id:'400'},timestamp:stamp,content:'I will join the Friday session.'}}});
const request=(extra={})=>({summary:'Attend the full existing session; identity not linked yet',operation:'participation',calendarKind:'club',calendarEventId:'workshop123',...extra});
const task=(inputs,req=request())=>({uuid:randomUUID(),created_at:stamp,updated_at:stamp,expires_at:'2026-10-23T20:00:00.000Z',info:{version:1,sourceIds:[source],inputs:structuredClone(inputs),request:structuredClone(req),batchContext:{},executionHistory:[]}});
function harness({pending=[],inputs=[original()]}={}){
 const rows=new Map(pending.map(t=>[t.uuid,structuredClone(t)])),saves=[],history=[],principal={id:'synthetic-worker',allowedSourceIds:[source]},leaseToken=randomUUID();let version=0;
 const store={configured:true,list:async()=>({status:'ready',tasks:structuredClone([...rows.values()])}),save:async args=>{saves.push(structuredClone({...args,signal:undefined}));const old=rows.get(args.task.uuid);if(old&&old.updated_at!==args.expectedUpdatedAt)return {status:'conflict'};const saved={...args.task,created_at:old?.created_at??stamp,updated_at:`2026-10-22T20:00:${String(++version).padStart(2,'0')}.000Z`,expires_at:old?.expires_at??'2026-10-23T20:00:00.000Z'};rows.set(saved.uuid,JSON.parse(JSON.stringify(saved)));return {status:'ready',task:structuredClone(saved)};},resolve:async()=>({status:'forbidden'})};
 const fragments=createBoundedResults({maxBytes:1048576,maxEntries:32});
 const staged=pipelineFactory({taskStore:store,principal,fragments,bindTask:async()=>{},runSync:async()=>({status:'ready',results:[],unresolved:[]}),now:()=>new Date(stamp)});
 const execute=(name,args,ids,extra={})=>staged.tools.find(t=>t.name===name).execute(args,{principal,inputIds:ids,signal:undefined,...extra});
 const begin=()=>staged.pipeline.beginCycle({leaseToken,inputs,recordExecution:async row=>history.push(row),getExecutionLog:()=>structuredClone(history)});
 const after=()=>staged.pipeline.afterInitial({handledInputIds:inputs.map(i=>i.uuid),inputs,executionLog:structuredClone(history)});
 return {rows,saves,history,principal,leaseToken,staged,fragments,inputs,store,execute,begin,after,start:async()=>{await begin();await after();},read:id=>execute('read_pending_task',{taskId:id},[id])};
}

test('rejects a changed-summary duplicate of a current read participation task without saving',async()=>{
 const input=original(),saved=task([input]),h=harness({pending:[saved],inputs:[input]});await h.start();assert.equal((await h.read(saved.uuid)).status,'ready');
 const result=await h.execute('defer_task',request({summary:'Identity lookup still has no match; preserve the same commitment'}),[saved.uuid]);
 if(process.env.TASK_DUPLICATE_BASELINE_PIPELINE)console.log(JSON.stringify({regression:'changed-summary-duplicate',resultStatus:result.status,taskCount:h.rows.size,saveCalls:h.saves.length,originalUnchanged:JSON.stringify(h.rows.get(saved.uuid))===JSON.stringify(saved)}));
 assert.deepEqual(result,{status:'invalid_request',reason:'existing_task_requires_update'});assert.equal(h.saves.length,0);assert.deepEqual([...h.rows.values()],[saved]);
});

test('duplicate comparison treats complete original sets as unordered',async()=>{
 const a=original('300'),b=original('301'),ta=task([a]),tb=task([b]),both=task([a,b]);const h=harness({pending:[ta,tb,both],inputs:[a,b]});await h.start();for(const t of [ta,tb,both])await h.read(t.uuid);
 const result=await h.execute('defer_task',request({summary:'Same combined source evidence in opposite context order'}),[tb.uuid,ta.uuid,both.uuid]);
 assert.equal(result.reason,'existing_task_requires_update');assert.equal(h.saves.length,0);assert.deepEqual(h.rows.get(both.uuid),both);
});

test('explicit taskId update saves recovered identity and requires a new current-version read before another update',async()=>{
 const input=original(),saved=task([input]),h=harness({pending:[saved],inputs:[input]});await h.start();await h.read(saved.uuid);
 const recovered=request({taskId:saved.uuid,personId:knownPerson,summary:'Current exact lookup recovered the original speaker; attendance remains to save'});
 assert.equal((await h.execute('defer_task',recovered,[saved.uuid])).status,'ready');assert.equal(h.rows.size,1);assert.equal(h.rows.get(saved.uuid).info.request.personId,knownPerson);assert.deepEqual(h.rows.get(saved.uuid).info.inputs,[input]);assert.equal(h.saves.length,1);
 assert.equal((await h.execute('defer_task',{...recovered,summary:'No new-version read yet'},[saved.uuid])).status,'forbidden');assert.equal(h.saves.length,1);
 assert.equal((await h.read(saved.uuid)).status,'ready');assert.equal((await h.execute('defer_task',{...recovered,summary:'Read the new exact version and retained recovered identity'},[saved.uuid])).status,'ready');assert.equal(h.rows.size,1);assert.equal(h.saves.length,2);
});

for(const [label,extra] of [
 ['different occurrence',{calendarEventId:'different123'}],['different calendar',{calendarKind:'member'}],['different operation',{operation:'location'}],['different person',{personId:knownPerson}],['different building',{buildingId:'bobst-library'}],['unknown occurrence',{calendarEventId:undefined}],['unknown calendar',{calendarKind:undefined}],
])test('distinct task creation remains legal: '+label,async()=>{
 const input=original(),saved=task([input]),h=harness({pending:[saved],inputs:[input]});await h.start();await h.read(saved.uuid);const args=request({summary:'Separate supported interpretation',...extra});for(const key of Object.keys(args))if(args[key]===undefined)delete args[key];
 assert.equal((await h.execute('defer_task',args,[saved.uuid])).status,'ready');assert.equal(h.rows.size,2);assert.equal(h.saves.length,1);assert.deepEqual(h.rows.get(saved.uuid),saved);
});

for(const [field,oldValue,newValue] of [['personId',knownPerson,randomUUID()],['buildingId','bobst-library','stern-school-of-business']])test('two different known '+field+' bindings remain distinct',async()=>{
 const input=original(),saved=task([input],request({[field]:oldValue})),h=harness({pending:[saved],inputs:[input]});await h.start();await h.read(saved.uuid);
 assert.equal((await h.execute('defer_task',request({[field]:newValue,summary:'A genuinely separate known target'}),[saved.uuid])).status,'ready');assert.equal(h.rows.size,2);assert.deepEqual(h.rows.get(saved.uuid),saved);
});

test('a different complete original set remains distinct without dropping the old task',async()=>{
 const a=original('300'),b=original('301'),ta=task([a]),tb=task([b],request({calendarEventId:'other12345'}));const h=harness({pending:[ta,tb],inputs:[a,b]});await h.start();await h.read(ta.uuid);await h.read(tb.uuid);
 assert.equal((await h.execute('defer_task',request({summary:'Combined interpretation has two supporting originals'}),[ta.uuid,tb.uuid])).status,'ready');assert.equal(h.rows.size,3);assert.equal(h.saves.length,1);assert.deepEqual(h.rows.get(ta.uuid),ta);
});

test('an exact same derived UUID replay remains one task',async()=>{
 const h=harness();await h.begin();const args=request(),initial=await h.execute('defer_task',args,[h.inputs[0].uuid]);assert.equal(initial.status,'ready');await h.after();await h.read(initial.taskId);
 const replay=await h.execute('defer_task',args,[initial.taskId]);assert.equal(replay.status,'ready');assert.equal(replay.taskId,initial.taskId);assert.equal(h.rows.size,1);assert.equal(h.saves.length,2);
});

test('initial-stage tasks are not incorrectly blocked by the followup-only guard',async()=>{
 const h=harness();await h.begin();assert.equal((await h.execute('defer_task',request(),[h.inputs[0].uuid])).status,'ready');assert.equal((await h.execute('defer_task',request({summary:'Another initial interpretation'}),[h.inputs[0].uuid])).status,'ready');assert.equal(h.rows.size,2);
});

for(const variant of ['unread','stale receipt','revoked local scope','expired','foreign principal','aborted'])test('duplicate guard does not weaken task scope/version checks: '+variant,async()=>{
 const input=original(),saved=task([input]),h=harness({pending:[saved],inputs:[input]});await h.start();if(variant!=='unread')await h.read(saved.uuid);const extra={};
 if(variant==='stale receipt'){await h.execute('defer_task',request({taskId:saved.uuid,summary:'New supported progress'}),[saved.uuid]);h.saves.length=0;}
 if(variant==='revoked local scope')h.principal.allowedSourceIds=[];
 if(variant==='expired'){h.rows.get(saved.uuid).expires_at='2026-10-22T19:00:00.000Z';h.staged.cleanup();await h.start();}
 if(variant==='foreign principal')extra.principal={...h.principal};if(variant==='aborted'){const c=new AbortController();c.abort();extra.signal=c.signal;}
 const before=structuredClone([...h.rows.values()]);const result=await h.execute('defer_task',request({summary:'Unsupported attempt'}),[saved.uuid],extra);assert.equal(result.status,'forbidden');assert.equal(h.saves.length,0);assert.deepEqual([...h.rows.values()],before);
});

test('real handler returns the fixed duplicate reason to the model and accepts an explicit update without a duplicate',async()=>{
 const input=original(),saved=task([input]),h=harness({pending:[saved],inputs:[input]});let round=0,rejected=false;
 const call=(name,id,args,ids=[saved.uuid])=>({id,name,arguments:name==='finish_batch'?{handledInputIds:args}:{inputIds:ids,arguments:args}}),turn=(...args)=>({stopReason:'tool_calls',toolCalls:args});
 const provider={toolTurn:async modelRequest=>{round++;if(round===1)return turn(call('finish_batch','initial',[input.uuid]));if(round===2)return turn(call('read_pending_task','read',{taskId:saved.uuid}));if(round===3)return turn(call('defer_task','duplicate',request({summary:'Same blocked work without update ID'})));if(round===4){const feedback=JSON.parse(modelRequest.messages.at(-1).content);assert.equal(feedback.status,'tool_error');assert.equal(feedback.reason,'existing_task_requires_update');assert.equal(h.saves.length,0);rejected=true;return turn(call('defer_task','update',request({taskId:saved.uuid,summary:'Same blocked participation; original speaker still unresolved'})));}return turn(call('finish_batch','final',[]));}};
 const queueStore={configured:true,claim:async()=>({status:'ready',leaseToken:h.leaseToken,inputs:[input]}),renew:async()=>({status:'ready'}),action:async({complete})=>({status:complete?'completed':'execute'}),release:async()=>({status:'ready'}),finish:async()=>({status:'ready'})};
 const handler=createAutomationHandler({store:queueStore,provider,principal:h.principal,tools:h.staged.tools,pipeline:h.staged.pipeline,authorizeEvents:async()=>true,config:readAutomationConfig({AGENT_AUTOMATION_ENABLED:'true'}),now:()=>new Date(stamp)});
 const result=await handler.tick();assert.equal(result.status,'completed');assert.equal(result.followupStatus,'completed');assert(rejected);assert.equal(h.rows.size,1);assert.equal(h.rows.get(saved.uuid).info.request.personId,undefined);assert.equal(h.rows.get(saved.uuid).info.request.summary,'Same blocked participation; original speaker still unresolved');assert.deepEqual(h.rows.get(saved.uuid).info.inputs,saved.info.inputs);
});
