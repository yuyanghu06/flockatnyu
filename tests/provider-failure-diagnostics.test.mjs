import test from 'node:test';
import assert from 'node:assert/strict';
import {createProvider} from '../server/providers/index.js';
const config={configured:true,provider:'openai-compatible',model:'fixture',apiKey:'PRIVATE_KEY_SENTINEL',baseUrl:'https://provider.example/v1',timeoutMs:1000};
const call=(id='call_1',args='{}')=>({id,type:'function',function:{name:'read_map_events',arguments:args}});
const response=(calls,extra={})=>({choices:[{message:{role:'assistant',content:null,tool_calls:calls},finish_reason:calls.length?'tool_calls':'stop',...extra}]});
const request={system:'PRIVATE_PROMPT_SENTINEL',messages:[{role:'user',content:'PRIVATE_INPUT_SENTINEL'}],tools:[{name:'read_map_events',description:'Read map',parameters:{type:'object',properties:{}}}],auditContext:{agent:'planner',runId:'11111111-1111-4111-8111-111111111111',round:2}};
function fixture(data,{sink,messages=request.messages}={}){
 const logs=[],finishes=[];let dispatches=0;
 const provider=createProvider(config,{fetchImpl:async()=>{dispatches++;return typeof data==='string'?new Response(data):Response.json(data);},writeDiagnostic:sink??(row=>logs.push(row)),audit:{required:true,startModel:async()=>({status:'ready'}),finishModel:async row=>{finishes.push(row);return {status:'ready'};}}});
 return{provider,logs,finishes,dispatches:()=>dispatches,run:()=>provider.toolTurn({...request,messages})};
}
for(const [label,payload,reason] of [
 ['over-eight proposals',response(Array.from({length:9},(_,i)=>call('c'+i))),'too_many_tool_calls'],
 ['duplicate proposal IDs',response([call(),call()]),'duplicate_call_id'],
 ['malformed arguments',response([call('c','{PRIVATE_BAD_ARGUMENTS')]),'malformed_tool_arguments'],
 ['invalid tool shape',response([{...call(),type:'PRIVATE_BAD_TYPE'}]),'invalid_tool_shape'],
 ['finish mismatch',response([call()],{finish_reason:'stop'}),'finish_reason_mismatch'],
 ['invalid response role',response([],{message:{role:'PRIVATE_ROLE',content:'PRIVATE_OUTPUT'}}),'invalid_response_shape'],
 ['malformed response JSON','PRIVATE_INVALID_JSON','invalid_json'],
 ['oversized response','x'.repeat(65537),'response_too_large'],
])test(`model diagnostics distinguish ${label} without logging provider bodies or inputs`,async()=>{
 const f=fixture(payload);await assert.rejects(f.run(),error=>error.code==='invalid_provider_response'&&error.diagnostics.reason===reason);
 assert.equal(f.dispatches(),1);assert.equal(f.finishes[0].errorCode,'invalid_provider_response');assert.deepEqual(f.finishes[0].output.diagnostics,{stage:'response_parse',reason});
 assert.equal(f.logs.length,1);assert.equal(f.logs[0].reason,reason);assert.equal(f.logs[0].httpStatus,200);assert.equal(f.logs[0].runId,request.auditContext.runId);assert(!JSON.stringify(f.logs).includes('PRIVATE_'));
});
test('reused committed ID remains rejected and receives a distinct diagnostic',async()=>{
 const messages=[...request.messages,{role:'assistant',content:'',toolCalls:[{id:'prior',name:'read_map_events',arguments:{}}]},{role:'tool',toolCallId:'prior',content:'{"status":"ready"}'}];
 const f=fixture(response([call('prior')]),{messages});await assert.rejects(f.run(),error=>error.diagnostics.reason==='reused_call_id');assert.equal(f.logs[0].reason,'reused_call_id');
});
test('successful model proposals add no failure diagnostic and log sink failures never mask parser errors',async()=>{
 const good=fixture(response([call()]));assert.equal((await good.run()).toolCalls.length,1);assert.equal(good.logs.length,0);assert(!good.finishes[0].output.diagnostics);
 for(const sink of [()=>{throw Error('PRIVATE_LOG_FAILURE')},()=>Promise.reject(Error('PRIVATE_LOG_FAILURE'))]){
  const f=fixture(response(Array.from({length:9},(_,i)=>call('c'+i))),{sink});await assert.rejects(f.run(),error=>error.code==='invalid_provider_response'&&error.diagnostics.reason==='too_many_tool_calls');assert.equal(f.finishes[0].status,'failed');
 }
});
