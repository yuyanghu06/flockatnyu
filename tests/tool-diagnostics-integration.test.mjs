import test from 'node:test';
import assert from 'node:assert/strict';
import {retrieveAssistantContext} from '../server/chat/context.js';
import {createAutomationHandler} from '../server/automation/handler.js';
import {readAutomationConfig} from '../server/automation/config.js';
const definition={name:'read_discord_messages',description:'Fixture',parameters:{type:'object',properties:{query:{type:'string',minLength:3}},additionalProperties:false}};
const inputId='11111111-1111-4111-8111-111111111111',leaseToken='22222222-2222-4222-8222-222222222222';
async function chat(calls,execute){const events=[];let round=0;const result=await retrieveAssistantContext({messages:[{role:'user',content:'fixture'}],principal:{id:'fixture'},provider:{toolTurn:async()=>({text:'',toolCalls:round++===0?calls:[]})},liveTools:{tools:[definition],execute},onAuditEvent:e=>events.push(e)});return {result,events};}
const call=(name,id,args={})=>({name,id,arguments:args});

test('chat unknown, malformed and duplicate calls receive terminal diagnostics without fake dispatch',async()=>{
 let executions=0;const f=await chat([call('PRIVATE_TOOL','one'),call('read_discord_messages','two',null)],async()=>{executions++;return {status:'ready'};});
 assert.equal(executions,0);assert.equal(f.events.filter(e=>e.kind==='tool_started').length,0);
 assert.deepEqual(f.events.map(e=>[e.tool,e.diagnostics.dispatched,e.diagnostics.reason]),[['unknown_tool',0,'unknown_tool'],['read_discord_messages',0,'invalid_arguments']]);
 const duplicate=await chat([call('read_discord_messages','one'),call('read_discord_messages','two')],async()=>{executions++;return {status:'ready'};});
 assert.equal(executions,1);assert.equal(duplicate.events.at(-1).diagnostics.reason,'duplicate_call');assert.equal(duplicate.events.at(-1).diagnostics.dispatched,0);
});

test('chat dispatch preserves connector errors, fixed schema diagnostics and per-round deferrals',async()=>{
 let executions=0;const f=await chat([call('read_discord_messages','one',{query:1}),call('read_discord_messages','two',{query:'valid'}),call('read_discord_messages','three',{query:'other'})],async({arguments:args})=>{executions++;return args.query===1?{status:'invalid_request'}:{status:'unavailable',diagnostics:{stage:'oauth',reason:'http_error',httpStatus:401},raw:'PRIVATE_SOURCE'};});
 assert.equal(executions,2);const finished=f.events.filter(e=>e.kind==='tool_finished');
 assert.equal(finished[0].diagnostics.validationCode,1);assert.equal(finished[1].diagnostics.stage,'oauth');assert.equal(finished[1].diagnostics.observedHttpStatus,401);assert.equal(finished[2].diagnostics.reason,'round_call_limit');assert.equal(finished[2].diagnostics.dispatched,0);assert.equal(JSON.stringify(f.events).includes('PRIVATE_SOURCE'),false);
});

function worker(proposals,execute,{prepareArguments}={}){
 const events=[];let round=0;
 const config={...readAutomationConfig({AGENT_AUTOMATION_ENABLED:'true'}),enabled:true,maxRunMs:2000,maxInputs:20,maxBytes:100000,maxCalls:30,maxRounds:3,leaseSeconds:90};
 const handler=createAutomationHandler({config,store:{claim:async()=>({status:'ready',leaseToken,inputs:[{uuid:inputId,raw_response:{source:'discord',source_id:'fixture',event_type:'created',event_id:'fixture',revision:'1',received_at:'2026-10-21T10:00:00Z',payload:{}}}]}),renew:async()=>({status:'ready'}),finish:async()=>({status:'ready'}),release:async()=>({status:'ready'})},authorizeEvent:async()=>true,provider:{toolTurn:async()=>({stopReason:'tool_calls',toolCalls:round++===0?proposals:[call('finish_batch','done',{handledInputIds:[inputId]})]})},tools:[{...definition,readOnly:true,execute,...(prepareArguments?{prepareArguments}:{})}],audit:{recordEvent:e=>events.push(e)}});return {handler,events};
}

test('planner ordinary argument failures recover with undispatched diagnostics while unknown tools remain fatal',async()=>{
 let executions=0;
 for(const [proposal,reason]of [[call('read_discord_messages','one',{inputIds:[inputId],arguments:{'PRIVATE_PROPERTY':'PRIVATE_VALUE'}}),'invalid_arguments'],[call('PRIVATE_TOOL','one',{inputIds:[inputId],arguments:{}}),'unknown_tool'],[call('read_discord_messages','one',{inputIds:['33333333-3333-4333-8333-333333333333'],arguments:{}}),'invalid_arguments']]){
  const f=worker([proposal],async()=>{executions++;return {status:'ready'};});assert.equal((await f.handler.tick()).status,reason==='unknown_tool'?'invalid_tool_call':'completed');assert.equal(f.events.filter(e=>e.kind==='tool_started'&&e.tool!=='finish_batch').length,0);
  const terminal=f.events.find(e=>e.kind==='tool_finished');assert.equal(terminal.diagnostics.reason,reason);assert.equal(terminal.diagnostics.dispatched,0);assert.equal(JSON.stringify(f.events).includes('PRIVATE'),false);
 }
 assert.equal(executions,0);
});

test('planner normalized source failures and deferred coverage stay visible and successful flow unchanged',async()=>{
 for(const returned of [{status:'ready',sourceStatus:'partial',coverage:{complete:false}},{status:'ready',sourceStatus:'unavailable',deferred:true,reason:'miro_navigation_deferred'}]){
  const f=worker([call('read_discord_messages','one',{inputIds:[inputId],arguments:{}})],async()=>returned);assert.equal((await f.handler.tick()).status,'completed');
  const done=f.events.find(e=>e.kind==='tool_finished');assert.equal(done.status,'ready');assert.equal(done.diagnostics.outcome,returned.deferred?'deferred':'partial');assert.equal(done.diagnostics.dispatched,1);
 }
});

test('chat global budget and cancellation identify undispatched proposals and actual aborted execution',async()=>{
 const events=[];let n=0,executions=0;
 await retrieveAssistantContext({messages:[{role:'user',content:'fixture'}],principal:{id:'fixture'},provider:{toolTurn:async()=>({text:'',toolCalls:[0,1,2].map(i=>call('read_discord_messages',`id_${n}_${i}`,{query:`query_${n++}`}))})},liveTools:{tools:[definition],execute:async()=>{executions++;return {status:'ready'};}},onAuditEvent:e=>events.push(e)});
 assert.equal(executions,30);const budget=events.filter(e=>e.diagnostics?.reason==='request_call_limit');assert.equal(budget.length,1);assert.equal(budget[0].diagnostics.dispatched,0);
 const controller=new AbortController(),aborts=[];
 await assert.rejects(retrieveAssistantContext({signal:controller.signal,messages:[{role:'user',content:'fixture'}],principal:{id:'fixture'},provider:{toolTurn:async()=>({text:'',toolCalls:[call('read_discord_messages','one'),call('read_discord_messages','two')]})},liveTools:{tools:[definition],execute:async()=>{controller.abort();return {status:'ready'};}},onAuditEvent:e=>aborts.push(e)}),{name:'AbortError'});
 assert.deepEqual(aborts.filter(e=>e.kind==='tool_finished').map(e=>[e.diagnostics.outcome,e.diagnostics.dispatched]),[['cancelled',1],['cancelled',0]]);
});

test('planner thrown errors and local prepared-argument rejection have distinct dispatch evidence',async()=>{
 const failed=worker([call('read_discord_messages','one',{inputIds:[inputId],arguments:{}})],async()=>{throw Error('PRIVATE_EXCEPTION_BODY');});
 assert.equal((await failed.handler.tick()).status,'completed');const event=failed.events.find(e=>e.kind==='tool_finished');assert.equal(event.diagnostics.reason,'exception');assert.equal(event.diagnostics.dispatched,1);assert.equal(JSON.stringify(failed.events).includes('PRIVATE_EXCEPTION_BODY'),false);assert.equal(event.diagnostics.outcome,'failed');assert.equal(failed.events.findLast(e=>e.kind==='tool_finished').tool,'finish_batch');
 let executed=0;const local=worker([call('read_discord_messages','one',{inputIds:[inputId],arguments:{}})],async()=>{executed++;return {status:'ready'};},{prepareArguments:async()=>({query:123})});
 assert.equal((await local.handler.tick()).status,'invalid_tool_call');assert.equal(executed,0);assert.equal(local.events.filter(e=>e.kind==='tool_started').length,0);const rejection=local.events.find(e=>e.kind==='tool_finished');assert.equal(rejection.diagnostics.dispatched,0);assert.equal(rejection.diagnostics.reason,'invalid_arguments');
});
