import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createAutomationHandler} from '../server/automation/handler.js';
import {readAutomationConfig} from '../server/automation/config.js';
const queueId=randomUUID(),taskId=randomUUID(),leaseToken=randomUUID();
const input={uuid:queueId,raw_response:{source:'discord',source_id:'channel:123',event_type:'message_created',event_id:'message:1',revision:'1',received_at:'2026-10-22T15:00:00Z',payload:{content:'Studying at Bobst',speaker:'speaker:1'}}};
const toolCall=(name,id,args={},scope=[queueId])=>({id,name,arguments:name==='finish_batch'?{handledInputIds:args}:{inputIds:scope,arguments:args}});
const turn=(...toolCalls)=>({text:'reasoned proposal',stopReason:'tool_calls',toolCalls});
const finish=(id='finish',ids=[queueId])=>turn(toolCall('finish_batch',id,ids));
function harness({turns=[finish('initial'),finish('final',[])],claimStatus='ready',config={},afterInitial,finishCycle,beginCycle,execute,tools,authorizeEvent,legacy=false}={}) {
  const events=[],requests=[],logs=[],auditEvents=[];let pending=[structuredClone(input)],index=0;
  const store={configured:true,
    claim:async()=>{events.push('claim');return claimStatus==='ready'?{status:'ready',leaseToken,inputs:pending}:{status:claimStatus};},
    renew:async()=>({status:'ready'}),action:async({complete})=>({status:complete?'completed':'execute'}),
    finish:async({handledInputIds})=>{events.push('finish');assert(!handledInputIds.includes(taskId));pending=pending.filter(row=>!handledInputIds.includes(row.uuid));return {status:'ready'};},
    release:async()=>{events.push('release');},fail:async()=>{events.push('fail');},
  };
  const ordinary={name:'read_source',description:'Read current source',readOnly:true,parameters:{type:'object',properties:{},additionalProperties:false},execute:execute??(async()=>({status:'ready',currentOriginal:'fresh source'}))};
  const pipeline={
    beginCycle:async context=>{events.push('begin');await beginCycle?.(context);},
    afterInitial:async context=>{events.push('api');return afterInitial?afterInitial(context):{status:'ready',context:{apiResults:[{calendarId:'calendar:1',mapEventId:'map:1'}]},inputIds:[taskId]};},
    finishCycle:async context=>{events.push('checkpoint');return finishCycle?finishCycle(context):{status:'ready'};},
    recordExecution:async event=>logs.push(event),
  };
  const provider={toolTurn:async request=>{events.push('model');requests.push(request);const value=turns[index++];return typeof value==='function'?value(request):value;}};
  const handler=createAutomationHandler({store,provider,tools:tools??[ordinary],pipeline:legacy?undefined:pipeline,authorizeEvent:authorizeEvent??(async()=>true),principal:{id:'service'},config:{...readAutomationConfig({AGENT_AUTOMATION_ENABLED:'true'}),...config},audit:{recordEvent:async event=>auditEvents.push(event)},now:()=>new Date('2026-10-22T15:30:00Z')});
  return {handler,events,requests,logs,auditEvents,pending:()=>pending};
}

test('same lease runs initial then API then followup before queue completion; complete transcript survives',async()=>{
  const h=harness({turns:[turn(toolCall('read_source','read')),finish('initial'),request=>{
    assert.match(request.system,/FOLLOWUP phase/);
    assert(request.messages.some(message=>message.role==='tool'&&message.content.includes('fresh source')));
    assert(request.messages.some(message=>message.role==='tool'&&message.toolCallId==='initial'));
    assert(request.messages.at(-1).content.includes('map:1'));
    return finish('final',[]);
  }],afterInitial:async({executionLog,handledInputIds,leaseToken:token})=>{
    assert.equal(token,leaseToken);assert.deepEqual(handledInputIds,[queueId]);
    assert(executionLog.some(entry=>entry.kind==='model_result'&&entry.result.text==='reasoned proposal'));
    assert(executionLog.some(entry=>entry.kind==='tool_result'&&entry.result.currentOriginal==='fresh source'));
    return {status:'ready',context:{mapEventId:'map:1'},inputIds:[taskId]};
  }});
  const result=await h.handler.tick();assert.equal(result.status,'completed');assert.equal(result.followupStatus,'completed');
  assert.deepEqual(h.events,['claim','begin','model','model','api','model','checkpoint','finish']);
  assert.equal(h.pending().length,0);assert.equal(h.requests[0].auditContext.runId,h.requests[2].auditContext.runId);
  assert.deepEqual(h.logs.map(entry=>entry.sequence),h.logs.map((_,i)=>i+1));
  assert(!JSON.stringify(h.auditEvents).includes('fresh source'));
});

test('empty/waiting polls never begin cycle, call APIs or model',async()=>{
  for(const claimStatus of ['empty','waiting','busy','cooldown']){
    const h=harness({claimStatus});assert.equal((await h.handler.tick()).status,claimStatus);assert.deepEqual(h.events,['claim']);
  }
});

test('tool phase restrictions hide definitions and reject attempts before dispatch',async()=>{
  for(const stage of ['initial','followup']){
    let executions=0;
    const tools=[{name:'phase_action',description:'Exclusive',idempotent:true,phases:[stage==='initial'?'followup':'initial'],parameters:{type:'object',properties:{}},execute:async()=>{executions++;return {status:'ready'};}}];
    const h=harness({tools,turns:[...(stage==='followup'?[finish('first')]:[]),request=>{assert(!request.tools.some(tool=>tool.name==='phase_action'));return turn(toolCall('phase_action','blocked'));}]});
    assert.equal((await h.handler.tick()).status,'invalid_tool_call');assert.equal(executions,0);assert.equal(h.pending().length,1);
  }
});

test('authorized task UUIDs can support followup tools but cannot enter queue finish',async()=>{
  const h=harness({turns:[finish('initial'),turn(toolCall('read_source','task_read',{},[taskId])),finish('final',[])]});
  assert.equal((await h.handler.tick()).status,'completed');assert(h.logs.some(entry=>entry.tool==='read_source'&&entry.inputIds[0]===taskId));
  const bad=harness({turns:[finish('initial'),finish('task_finish',[taskId])]});
  assert.equal((await bad.handler.tick()).status,'invalid_completion');assert.equal(bad.pending().length,1);
});

test('followup limit is ten requests total; unvisited tasks are never rewritten or cleared',async()=>{
  const tasks=new Map([[taskId,{original:'leave untouched'}]]);let checkpoint;
  const h=harness({config:{maxCalls:1},turns:[finish('initial'),...Array.from({length:10},(_,i)=>turn(toolCall('read_source',`followup_${i}`,{},[taskId])))],finishCycle:async value=>{checkpoint=value;return {status:'ready'};}});
  const result=await h.handler.tick();assert.equal(result.status,'completed');assert.equal(result.followupStatus,'round_limit');assert.equal(h.requests.length,11);
  assert.equal(checkpoint.followupStatus,'round_limit');assert.deepEqual(tasks.get(taskId),{original:'leave untouched'});assert.equal(result.calls,11);
});

test('initial round limit still runs API/followup but unmarked originals cannot finish',async()=>{
  let transferred;
  const h=harness({config:{maxRounds:1,followupRounds:1},turns:[turn(toolCall('read_source','initial_read')),finish('followup',[])],afterInitial:async value=>{transferred=value.handledInputIds;return {status:'ready',context:{checkpointed:true},inputIds:[taskId]};}});
  assert.equal((await h.handler.tick()).status,'round_limit');assert.deepEqual(transferred,[]);assert.equal(h.pending().length,1);assert(h.events.includes('api'));assert(!h.events.includes('finish'));
});

test('API failure or failed final checkpoint preserves queue and lease failure accounting',async()=>{
  for(const options of [{afterInitial:async()=>({status:'failed'})},{finishCycle:async()=>({status:'failed'})}]){
    const h=harness(options);assert.equal((await h.handler.tick()).status,'preflight_failed');assert.equal(h.pending().length,1);assert(h.events.includes('fail'));assert(!h.events.includes('finish'));
  }
});

test('recoverable followup tool failure reaches another model turn while task work stays pending',async()=>{
  const h=harness({turns:[finish('initial'),turn(toolCall('read_source','failed')),request=>{
    assert.equal(request.messages.at(-1).toolCallId,'failed');assert.equal(JSON.parse(request.messages.at(-1).content).status,'tool_error');return finish('final',[]);
  }],execute:async()=>({status:'unavailable',sourceStatus:'temporarily_unavailable'})});
  const result=await h.handler.tick();assert.equal(result.status,'completed');assert.equal(result.followupStatus,'completed');assert.equal(h.pending().length,0);
  assert(h.logs.some(entry=>entry.tool==='read_source'&&entry.result.status==='tool_error'));assert.equal(h.requests.length,3);
});

test('initial tool failure never implicitly runs APIs or finishes originals',async()=>{
  const h=harness({turns:[turn(toolCall('read_source','failed')),request=>{
    assert.equal(JSON.parse(request.messages.at(-1).content).status,'tool_error');return {stopReason:'stop',toolCalls:[]};
  }],execute:async()=>({status:'unavailable'})});
  assert.equal((await h.handler.tick()).status,'incomplete_batch');assert(!h.events.includes('api'));assert.equal(h.pending().length,1);
});

for(const status of ['forbidden','forbidden_source','stale','aborted'])test(`followup tool-local ${status} is safe feedback while the global run remains authorized`,async()=>{
  const h=harness({turns:[finish('initial'),turn(toolCall('read_source','failed')),request=>{
    assert.equal(JSON.parse(request.messages.at(-1).content).status,'tool_error');return finish('final',[]);
  }],execute:async()=>({status})});
  const result=await h.handler.tick();assert.equal(result.status,'completed');assert.equal(result.followupStatus,'completed');assert.equal(h.requests.length,3);
});

test('followup required audit failure remains a hard stop',async()=>{
  const h=harness({turns:[finish('initial'),turn(toolCall('read_source','failed'))],execute:async()=>({status:'audit_unavailable'})});
  assert.equal((await h.handler.tick()).status,'audit_unavailable');assert.equal(h.pending().length,1);assert(!h.events.includes('finish'));
});

test('caller abort during API phase retains originals without failure charging',async()=>{
  const controller=new AbortController();const h=harness({afterInitial:async()=>{controller.abort();throw Error('aborted');}});
  assert.equal((await h.handler.tick({signal:controller.signal})).status,'aborted');assert(h.events.includes('release'));assert(!h.events.includes('finish'));
});

test('RAM execution log fails explicitly at one MiB and never forwards bodies to audit',async()=>{
  const h=harness({beginCycle:async({recordExecution})=>recordExecution({kind:'test',body:'x'.repeat(1048576)})});
  assert.equal((await h.handler.tick()).status,'context_limit');assert.equal(h.requests.length,0);assert(!h.events.includes('api'));assert.equal(h.pending().length,1);
  assert(!JSON.stringify(h.auditEvents).includes('"body"'));
});

test('followup configuration rejects unsupported round counts',()=>{
  const config=readAutomationConfig({});assert.equal(config.followupRounds,10);assert.equal(config.maxFollowupCalls,64);
  for(const value of ['0','11','1.2'])assert.throws(()=>readAutomationConfig({AGENT_AUTOMATION_FOLLOWUP_ROUNDS:value}));
});


test('trusted API may skip final model when no followup tasks remain',async()=>{
  const h=harness({afterInitial:async()=>({status:'ready',context:{apiResult:'complete'},inputIds:[],followupRequired:false})});
  const result=await h.handler.tick();assert.equal(result.status,'completed');assert.equal(result.followupStatus,'not_needed');assert.equal(h.requests.length,1);
  assert.deepEqual(h.events,['claim','begin','model','api','checkpoint','finish']);
});
