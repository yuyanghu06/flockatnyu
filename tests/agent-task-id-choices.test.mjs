import {attachTaskReads} from './fixtures/planner-followup.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {createAutomationHandler} from '../server/automation/handler.js';
import {createStagedPipeline} from '../server/automation/staged-pipeline.js';
import {createBoundedResults} from '../server/automation/bounded-result.js';
import {readAutomationConfig} from '../server/automation/config.js';

// Optional exact retained handler reproduces the real pre-change behavior.
// It is imported without replacing production files or changing its source.
const factory=process.env.TASK_CHOICES_BASELINE_HANDLER
 ?(await import('data:text/javascript;base64,'+Buffer.from((await readFile(process.env.TASK_CHOICES_BASELINE_HANDLER,'utf8')).replace(/from (['"])(\.[^'"]+)\1/g,(_m,_q,path)=>`from ${JSON.stringify(new URL(path,new URL('../server/automation/handler.js',import.meta.url)).href)}`)).toString('base64'))).createAutomationHandler:createAutomationHandler;
const stamp='2026-10-23T08:00:00.000Z',source=randomUUID();
const q=()=>({uuid:randomUUID(),raw_response:{source:'discord',source_id:source,event_type:'message_created',event_id:'300',revision:'1',received_at:stamp,payload:{id:'300',guild_id:'100',channel_id:'200',author:{id:'400'},timestamp:stamp,content:'I will attend the existing session.'}}});
const call=(name,id,args={},ids=[])=>({name,id,arguments:name==='finish_batch'?{handledInputIds:args}:{inputIds:ids,arguments:args}});
const turn=(...toolCalls)=>({stopReason:'tool_calls',toolCalls});
const definition=(name,required=['taskId'])=>({name,description:'Synthetic local task operation',...(name==='read_pending_task'?{readOnly:true}:{idempotent:true}),parameters:{type:'object',properties:{taskId:{type:'string',minLength:36,maxLength:36},note:{type:'string',maxLength:30}},required,additionalProperties:false}});
const tool=(request,name)=>request.tools.find(row=>row.name===name);
const feedback=(request,id)=>JSON.parse(request.messages.findLast(row=>row.role==='tool'&&row.toolCallId===id).content);
const bindings=request=>JSON.parse(request.messages.filter(row=>row.role==='user').findLast(row=>JSON.parse(row.content).referenceBindings).content).referenceBindings;
function harness({inputs=[q()],taskIds=[randomUUID()],legacy=false,turns,tools,afterInitial,pipeline,principal={id:'synthetic-worker',allowedSourceIds:[source]},authorizeEvents=async()=>true,config={}}={}){
 const requests=[],executions=[],receipts=[],finishes=[],errors=[],leaseToken=randomUUID();let index=0,pending=structuredClone(inputs);
 const store={configured:true,claim:async()=>({status:'ready',leaseToken,inputs:structuredClone(pending)}),renew:async()=>({status:'ready'}),action:async args=>{receipts.push(args);return {status:args.complete?'completed':'execute'};},finish:async args=>{finishes.push(args);pending=pending.filter(row=>!args.handledInputIds.includes(row.uuid));return {status:'ready'};},release:async()=>({status:'ready'})};
 const ordinary=tools??['read_pending_task','resolve_pending_task','defer_task'].map(name=>({...definition(name,name==='defer_task'?[]:['taskId']),execute:async(args,context)=>{executions.push({name,args,ids:context.inputIds});return {status:'ready'};}}));
 const stages=pipeline??{beginCycle:async()=>{},afterInitial:async()=>afterInitial?afterInitial():({status:'ready',inputIds:taskIds,context:{tasks:taskIds.map(uuid=>({uuid}))}}),finishCycle:async()=>({status:'ready'})};
 const handler=factory({store,provider:{toolTurn:async request=>{requests.push(structuredClone(request));try{const next=turns[index++];assert(next,'Unexpected model request');return typeof next==='function'?await next(request):next;}catch(error){errors.push(error);throw error;}}},tools:ordinary,pipeline:legacy?undefined:stages,principal,authorizeEvents,config:{...readAutomationConfig({AGENT_AUTOMATION_ENABLED:'true'}),...config},now:()=>new Date(stamp)});
 return {requests,executions,receipts,finishes,store,principal,leaseToken,pending:()=>pending,run:async()=>{const result=await handler.tick();if(errors.length)throw errors[0];return result;}};
}

if(process.env.TASK_CHOICES_BASELINE_HANDLER)test('pre-change witness: malformed copied task rejects valid peer and repeatedly leaves both tasks untouched',async()=>{
 const input=q(),a='106af416-9974-5e07-a2cb-c778d79098d9',b='d5141ba0-4377-5207-a52a-638bc89ec6bd',malformed='106af416-9974-5e07-a2-cb-c778d79098d9';
 const rows=new Map([[a,{original:'first attendance task'}],[b,{original:'second attendance task'}]]),before=structuredClone([...rows]);
 const h=harness({inputs:[input],taskIds:[a,b],config:{followupRounds:2},turns:[turn(call('finish_batch','initial',[input.uuid])),request=>{assert(!tool(request,'read_pending_task').parameters.properties.inputIds.items.enum);return turn(call('read_pending_task','bad',{taskId:malformed},[malformed]),call('read_pending_task','peer',{taskId:b},[b]));},request=>{assert.equal(feedback(request,'bad').status,'tool_error');assert(!feedback(request,'bad').exactIds);return turn(call('read_pending_task','repeated_bad',{taskId:malformed},[malformed]));}]});
 const result=await h.run();assert.equal(result.followupStatus,'round_limit');assert.equal(h.executions.length,0);assert.equal(h.receipts.length,0);assert.deepEqual([...rows],before);console.log(JSON.stringify({witness:'exact old handler, scripted retained malformed proposals',result,executedReads:0,actions:0,unchangedTasks:rows.size,exactChoiceFeedback:false}));
});

test('exact disclosed IDs guide recovery from the retained malformed UUID; rejected valid peer never dispatches',async()=>{
 const input=q(),a='106af416-9974-5e07-a2cb-c778d79098d9',b='d5141ba0-4377-5207-a52a-638bc89ec6bd',bad='106af416-9974-5e07-a2-ccb7-c778d79098d9';let h;
 h=harness({inputs:[input],taskIds:[a,b],turns:[request=>{assert.deepEqual(bindings(request).inputIds.map(row=>row.uuid),[input.uuid]);assert.deepEqual(tool(request,'read_pending_task').parameters.properties.inputIds.items.enum,bindings(request).inputIds.map(row=>row.ref));return turn(call('finish_batch','initial',[input.uuid]));},request=>{
  assert.deepEqual(bindings(request).inputIds.map(row=>row.uuid),[a,b]);for(const name of ['read_pending_task','resolve_pending_task','defer_task']){const params=tool(request,name).parameters;assert.deepEqual(params.properties.inputIds.items.enum,bindings(request).inputIds.map(row=>row.ref));assert.deepEqual(params.properties.arguments.properties.taskId.enum,bindings(request).inputIds.map(row=>row.ref));}
  return turn(call('read_pending_task','bad_copy',{taskId:bad},[bad]),call('read_pending_task','valid_peer',{taskId:b},[b]));
 },request=>{assert.equal(h.executions.length,0);assert.equal(h.receipts.length,0);const f=feedback(request,'bad_copy');assert.deepEqual(f.exactIds,{phase:'followup',field:'inputIds',choices:bindings(request).inputIds.map(row=>row.ref),instruction:'Copy an exact ref from this phase referenceBindings without changing any characters.'});assert(!JSON.stringify(f).includes(bad));assert.equal(feedback(request,'valid_peer').reason,'unattempted');assert(!feedback(request,'valid_peer').exactIds);return turn(call('read_pending_task','read_a',{taskId:f.exactIds.choices[0]},[a]),call('read_pending_task','read_b',{taskId:b},[b]));},turn(call('resolve_pending_task','resolve_a',{taskId:a},[a]),call('resolve_pending_task','resolve_b',{taskId:b},[b])),turn(call('finish_batch','final',[]))]});
 const result=await h.run();assert.equal(result.status,'completed');assert.equal(result.followupStatus,'completed');assert.equal(h.executions.length,4);assert.deepEqual(h.finishes[0].handledInputIds,[input.uuid]);assert.equal(h.pending().length,0);
});

test('wrong wrapper and wrong task field get separate copy choices; unrelated bad arguments and peers receive no choices',async()=>{
 for(const variant of ['wrapper','nested','both-and-body','body']){
  const input=q(),task=randomUUID(),foreign=randomUUID(),canary='PRIVATE_BAD_ARGUMENT';let h;
  const args={taskId:variant==='nested'||variant==='both-and-body'?foreign:task,...(['body','both-and-body'].includes(variant)?{privateUnknown:canary}:{})};
  h=harness({inputs:[input],taskIds:[task],turns:[turn(call('finish_batch','initial',[input.uuid])),turn(call('read_pending_task','bad',args,[variant==='wrapper'||variant==='both-and-body'?foreign:task])),request=>{assert.equal(h.executions.length,0);const f=feedback(request,'bad');assert.equal(f.status,'tool_error');if(['wrapper','nested'].includes(variant))assert.deepEqual(f.exactIds,{phase:'followup',field:variant==='wrapper'?'inputIds':'arguments.taskId',choices:bindings(request).inputIds.map(row=>row.ref),instruction:'Copy an exact ref from this phase referenceBindings without changing any characters.'});else assert(!f.exactIds);assert(!JSON.stringify(f).includes(foreign));assert(!JSON.stringify(f).includes(canary));return turn(call('finish_batch','final',[]));}]});
  assert.equal((await h.run()).status,'completed');assert.equal(h.executions.length,0);
 }
});

test('20 IDs expose exact choices; 21, 500, zero and omitted followup IDs retain base schemas and complete catalogue',async()=>{
 for(const count of [20,21,500,0,undefined]){
  const input=q(),ids=Array.from({length:count??0},()=>randomUUID());const h=harness({inputs:[input],taskIds:ids,afterInitial:async()=>({status:'ready',...(count===undefined?{}:{inputIds:ids}),context:{tasks:ids.map(uuid=>({uuid}))}}),turns:[turn(call('finish_batch','initial',[input.uuid])),request=>{
   for(const name of ['read_pending_task','resolve_pending_task','defer_task']){const params=tool(request,name).parameters;if(count===20){assert.deepEqual(bindings(request).inputIds.map(row=>row.uuid),ids);assert.deepEqual(params.properties.inputIds.items.enum,bindings(request).inputIds.map(row=>row.ref));assert.deepEqual(params.properties.arguments.properties.taskId.enum,bindings(request).inputIds.map(row=>row.ref));}else{assert(!Object.hasOwn(params.properties.inputIds.items,'enum'));assert(!Object.hasOwn(params.properties.arguments.properties.taskId,'enum'));}}
   assert.equal(JSON.parse(request.messages.at(-1).content).context.tasks.length,ids.length);return turn(call('finish_batch','final',[]));}]});assert.equal((await h.run()).status,'completed');
 }
});

test('request schemas are isolated from provider mutation and other runs; legacy nested task schema remains unchanged',async()=>{
 const input=q(),foreign=randomUUID();let h;
 h=harness({inputs:[input],legacy:true,turns:[request=>{const params=tool(request,'read_pending_task').parameters;assert.deepEqual(params.properties.inputIds.items.enum,[input.uuid]);assert(!params.properties.arguments.properties.taskId.enum);params.properties.inputIds.items.enum.push(foreign);return turn(call('read_pending_task','bad',{taskId:foreign},[foreign]));},request=>{assert.equal(h.executions.length,0);assert.deepEqual(feedback(request,'bad').exactIds.choices,[input.uuid]);assert.deepEqual(tool(request,'read_pending_task').parameters.properties.inputIds.items.enum,[input.uuid]);return turn(call('finish_batch','finish',[input.uuid]));}]});assert.equal((await h.run()).status,'completed');
 const next=q(),second=harness({inputs:[next],legacy:true,turns:[request=>{assert.deepEqual(tool(request,'defer_task').parameters.properties.inputIds.items.enum,[next.uuid]);assert(!JSON.stringify(request).includes(input.uuid));return turn(call('finish_batch','finish',[next.uuid]));}]});assert.equal((await second.run()).status,'completed');
});

test('optional defer ID permits new work while explicit updates must copy the phase task ID',async()=>{
 const input=q(),task=randomUUID();let h;
 h=harness({inputs:[input],taskIds:[task],turns:[request=>{assert(!tool(request,'defer_task').parameters.properties.arguments.required.includes('taskId'));return turn(call('defer_task','new_initial',{note:'new initial work'},[input.uuid]));},turn(call('finish_batch','initial',[input.uuid])),request=>{assert(!tool(request,'defer_task').parameters.properties.arguments.required.includes('taskId'));return turn(call('defer_task','new_followup',{note:'new distinct work'},[task]),call('defer_task','explicit',{taskId:task,note:'update existing'},[task]));},turn(call('finish_batch','final',[]))]});assert.equal((await h.run()).status,'completed');assert.equal(h.executions.length,3);assert(!Object.hasOwn(h.executions[1].args,'taskId'));assert.equal(h.executions[2].args.taskId,task);
});

test('phase choices reject the old queue wrapper; finish still uses queue UUIDs and preserves empty-array semantics',async()=>{
 const input=q(),task=randomUUID();let h;
 h=harness({inputs:[input],taskIds:[task],turns:[turn(call('finish_batch','initial',[input.uuid])),turn(call('read_pending_task','old_scope',{taskId:task},[input.uuid])),request=>{assert.equal(h.executions.length,0);assert.deepEqual(bindings(request).inputIds.map(row=>row.uuid),[task]);assert.deepEqual(feedback(request,'old_scope').exactIds.choices,bindings(request).inputIds.map(row=>row.ref));assert.deepEqual(tool(request,'finish_batch').parameters.properties.handledInputIds.items.enum,bindings(request).handledInputIds.map(row=>row.ref));assert.deepEqual(bindings(request).handledInputIds.map(row=>row.uuid),[input.uuid]);return turn(call('finish_batch','final',[]));}]});assert.equal((await h.run()).status,'completed');assert.deepEqual(h.finishes[0].handledInputIds,[input.uuid]);
 const denied=harness({inputs:[input],taskIds:[task],turns:[turn(call('finish_batch','initial',[input.uuid])),turn(call('finish_batch','wrong_finish',[task]))]});assert.equal((await denied.run()).status,'invalid_completion');assert.equal(denied.finishes.length,0);assert.equal(denied.pending().length,1);
 const legacy=harness({inputs:[input],legacy:true,turns:[turn(call('finish_batch','empty',[])),request=>{assert.equal(feedback(request,'empty').reason,'empty_handled_input_ids');return turn(call('finish_batch','real',[input.uuid]));}]});assert.equal((await legacy.run()).status,'completed');assert.equal(legacy.finishes.length,1);
 const unhandled=harness({inputs:[input],taskIds:[],turns:[turn(call('finish_batch','initial',[])),turn(call('finish_batch','final',[]))]});assert.equal((await unhandled.run()).status,'round_limit');assert.equal(unhandled.pending().length,1);assert.equal(unhandled.finishes.length,0);
});

test('advertising exact task IDs grants no read, current-version, resolution-proof or source authority in the real staged pipeline',async()=>{
 const input=q(),task=randomUUID(),person=randomUUID(),principal={id:'synthetic-worker',allowedSourceIds:[source]};
 const saved={uuid:task,created_at:stamp,updated_at:stamp,expires_at:'2026-10-24T08:00:00Z',info:{version:1,sourceIds:[source],inputs:[input],request:{summary:'Attend session',operation:'participation',calendarKind:'club',calendarEventId:'session123',personId:person},batchContext:{},executionHistory:[]}};
 const rows=new Map([[task,saved]]),saves=[],resolves=[],binds=[];let revision=0,proof=false,h;
 const taskStore={configured:true,list:async()=>({status:'ready',tasks:structuredClone([...rows.values()])}),save:async args=>{saves.push(args);const old=rows.get(args.task.uuid);assert.equal(args.expectedUpdatedAt,old.updated_at);const next={...old,info:structuredClone(args.task.info),updated_at:`2026-10-23T08:00:${String(++revision).padStart(2,'0')}.000Z`};rows.set(task,next);return {status:'ready',task:structuredClone(next)};},resolve:async args=>{resolves.push(args);rows.delete(task);return {status:'ready'};}};
 attachTaskReads(taskStore,rows);
 const staged=createStagedPipeline({taskStore,principal,fragments:createBoundedResults(),bindTask:async args=>{binds.push(args);return true;},verifyResolution:async()=>proof,runSync:async()=>({status:'ready',results:[],unresolved:[]}),now:()=>new Date(stamp)});
 const request={taskId:task,summary:'Same supported attendance with progress',operation:'participation',calendarKind:'club',calendarEventId:'session123',personId:person};
 h=harness({inputs:[input],principal,pipeline:staged.pipeline,tools:staged.tools,turns:[turn(call('finish_batch','initial',[input.uuid])),model=>{assert.deepEqual(bindings(model).inputIds.map(row=>row.uuid),[task]);assert.deepEqual(tool(model,'defer_task').parameters.properties.arguments.properties.taskId.enum,bindings(model).inputIds.map(row=>row.ref));assert.equal(binds.length,0);return turn(call('defer_task','unread',request,[task]),call('resolve_pending_task','unread_resolve',{taskId:task,outcome:'completed'},[task]));},model=>{assert.equal(feedback(model,'unread').status,'tool_error');assert.equal(feedback(model,'unread_resolve').status,'tool_error');assert.equal(saves.length,0);assert.equal(resolves.length,0);return turn(call('read_pending_task','read',{taskId:task},[task]));},turn(call('resolve_pending_task','unproven',{taskId:task,outcome:'completed'},[task])),model=>{assert.equal(feedback(model,'unproven').status,'tool_error');assert.equal(resolves.length,0);return turn(call('defer_task','update',request,[task]));},turn(call('defer_task','stale',{...request,summary:'Old read cannot update new version'},[task])),model=>{assert.equal(feedback(model,'stale').status,'tool_error');assert.equal(saves.length,1);principal.allowedSourceIds=[];return turn(call('read_pending_task','revoked',{taskId:task},[task]));},model=>{assert.equal(feedback(model,'revoked').status,'tool_error');assert.equal(resolves.length,0);principal.allowedSourceIds=[source];proof=true;return turn(call('read_pending_task','reread',{taskId:task},[task]));},turn(call('resolve_pending_task','confirmed',{taskId:task,outcome:'completed'},[task])),turn(call('finish_batch','final',[]))]});
 const result=await h.run();assert.equal(result.status,'completed');assert.equal(resolves.length,1);assert.equal(rows.size,0);assert.equal(binds.length,2);assert.equal(h.pending().length,0);
});
