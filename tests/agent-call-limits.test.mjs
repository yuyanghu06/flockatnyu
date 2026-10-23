import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createProvider} from '../server/providers/index.js';
import {createAutomationHandler} from '../server/automation/handler.js';
import {readAutomationConfig} from '../server/automation/config.js';
import {createStagedPipeline} from '../server/automation/staged-pipeline.js';
import {createBoundedResults} from '../server/automation/bounded-result.js';

const queueId=randomUUID(),sourceId=randomUUID(),lease=randomUUID(),stamp='2026-10-22T20:00:00Z',canary='PRIVATE_LIMIT_SOURCE_RESULT_CANARY';
const input={uuid:queueId,raw_response:{source:'discord',source_id:sourceId,event_type:'message_created',event_id:'300',revision:'1',received_at:stamp,payload:{guild_id:'100',channel_id:'200',id:'300',author:{id:'400'},content:canary}}};
const definition={name:'upsert_map_event',description:'Synthetic bounded write',parameters:{type:'object',properties:{slot:{type:'integer'}},required:['slot'],additionalProperties:false}};
const proposal=(slot,prefix='call',ids=[queueId])=>({id:`${prefix}_${slot}`,name:definition.name,arguments:{inputIds:ids,arguments:{slot}}});
const finish=(id='finish',ids=[queueId])=>({id,name:'finish_batch',arguments:{handledInputIds:ids}});
const turn=(...toolCalls)=>({stopReason:'tool_calls',text:'Synthetic planner reply',toolCalls:toolCalls.flat()});
const block=(count,prefix='call',offset=0,ids=[queueId])=>Array.from({length:count},(_,index)=>proposal(index+offset,prefix,ids));
const providerConfig=provider=>({configured:true,provider,baseUrl:provider==='anthropic'?'https://api.anthropic.com/v1':'https://api.openai.com/v1',model:provider==='anthropic'?'claude-fixture':'gpt-6-luna',apiKey:'synthetic-key',timeoutMs:1000});
function wire(provider,calls){return provider==='anthropic'?{stop_reason:'tool_use',content:calls.map(row=>({type:'tool_use',id:row.id,name:row.name,input:row.arguments}))}:{choices:[{finish_reason:'tool_calls',message:{role:'assistant',content:'',tool_calls:calls.map(row=>({id:row.id,type:'function',function:{name:row.name,arguments:JSON.stringify(row.arguments)}}))}}]};}
const history=calls=>[{role:'user',content:'Synthetic source batch'},{role:'assistant',content:'',toolCalls:calls},...calls.map((row,index)=>({role:'tool',toolCallId:row.id,content:JSON.stringify(index===0?{status:'tool_error',reason:'not_found'}:{status:'ready'})}))];

for(const providerName of ['openai-compatible','anthropic'])test(`${providerName} accepts16 worker calls and their next-turn results, rejects17, and preserves default chat8`,async()=>{
  let reply=block(16),dispatches=0;const requests=[];
  const provider=createProvider(providerConfig(providerName),{fetchImpl:async(_url,options)=>{dispatches++;requests.push(JSON.parse(options.body));return Response.json(wire(providerName,reply));}});
  const base={system:'Trusted limits',tools:[definition],messages:[{role:'user',content:'Synthetic batch'}]};
  const accepted=await provider.toolTurn({...base,maxToolCalls:16});assert.equal(accepted.toolCalls.length,16);
  reply=[proposal(99,'next')];await provider.toolTurn({...base,messages:history(accepted.toolCalls),maxToolCalls:16});
  const native=requests.at(-1).messages;
  const calls=providerName==='anthropic'?native.flatMap(row=>Array.isArray(row.content)?row.content:[]).filter(row=>row.type==='tool_use'):native.flatMap(row=>row.tool_calls??[]);
  const results=providerName==='anthropic'?native.flatMap(row=>Array.isArray(row.content)?row.content:[]).filter(row=>row.type==='tool_result'):native.filter(row=>row.role==='tool');
  assert.deepEqual(calls.map(row=>row.id),accepted.toolCalls.map(row=>row.id));assert.deepEqual(results.map(row=>row.tool_use_id??row.tool_call_id),accepted.toolCalls.map(row=>row.id));assert.equal(JSON.parse(results[0].content).status,'tool_error');
  const before=dispatches;
  await assert.rejects(provider.toolTurn({...base,maxToolCalls:17}),error=>error.code==='invalid_provider_request');
  await assert.rejects(provider.toolTurn({...base,messages:history(block(17)),maxToolCalls:16}),error=>error.code==='invalid_provider_request');
  await assert.rejects(provider.toolTurn({...base,messages:history(block(9))}),error=>error.code==='invalid_provider_request');assert.equal(dispatches,before,'oversized history must fail before HTTP');
  reply=block(17);await assert.rejects(provider.toolTurn({...base,maxToolCalls:16}),error=>error.code==='invalid_provider_response');
  reply=block(9);await assert.rejects(provider.toolTurn(base),error=>error.code==='invalid_provider_response');await assert.rejects(provider.planTools(base),error=>error.code==='invalid_provider_response');
});

function worker({staged=false,turns=[],failSlot,authorizeEvent}={}){
  const executed=[],requests=[],progress=[],audits=[],receipts=new Set(),storage=[],errors=[];let pending=true,index=0;
  const principal={id:'limit-worker',allowedSourceIds:[sourceId]},task={uuid:randomUUID(),created_at:stamp,updated_at:stamp,expires_at:'2026-10-23T20:00:00Z',info:{version:1,sourceIds:[sourceId],inputs:[structuredClone(input)],request:{summary:'Still needs interpretation',operation:'source_review'},executionHistory:[]}},tasks=new Map([[task.uuid,structuredClone(task)]]);
  const taskStore={configured:true,list:async()=>({status:'ready',tasks:structuredClone([...tasks.values()])}),save:async args=>{storage.push('save');const saved={...tasks.get(args.task.uuid),...args.task,created_at:stamp,updated_at:stamp,expires_at:task.expires_at};tasks.set(saved.uuid,saved);return {status:'ready',task:saved};},resolve:async args=>{storage.push('resolve');tasks.delete(args.taskId);return {status:'ready'};}};
  const pipeline=staged?createStagedPipeline({taskStore,principal,fragments:createBoundedResults(),now:()=>new Date(stamp),bindTask:async()=>{},runSync:async()=>({status:'ready',results:[],unresolved:[]})}):null;
  const store={configured:true,claim:async()=>({status:'ready',leaseToken:lease,inputs:[structuredClone(input)]}),renew:async()=>({status:'ready'}),action:async({actionKey,complete})=>{if(receipts.has(actionKey))return {status:'completed'};if(complete){receipts.add(actionKey);return {status:'completed'};}return {status:'execute'};},finish:async()=>{pending=false;return {status:'ready'};},release:async()=>{},fail:async()=>{}};
  const tools=[{...definition,idempotent:true,execute:async args=>{executed.push(args.slot);return args.slot===failSlot?{status:'unavailable',body:canary}:{status:'ready',body:canary};}},...(pipeline?.tools??[])];
  const config=readAutomationConfig({AGENT_AUTOMATION_ENABLED:'true'}),handler=createAutomationHandler({store,tools,pipeline:pipeline?.pipeline,principal,config,authorizeEvent:authorizeEvent??(async()=>true),onProgress:event=>progress.push(event),audit:{recordEvent:async event=>audits.push(event)},now:()=>new Date(stamp),provider:{toolTurn:async request=>{requests.push(request);try{assert.equal(request.maxToolCalls,16);const value=turns[index++];assert(value,'Unexpected model round');return typeof value==='function'?await value(request):value;}catch(error){errors.push(error);throw error;}}}});
  return {executed,requests,progress,audits,receipts,tasks,task,storage,pending:()=>pending,run:async()=>{const result=await handler.tick();if(errors.length)throw errors[0];return result;}};
}
const followupScope=request=>{const ids=request.tools.find(tool=>tool.name===definition.name).parameters.properties.inputIds.items.enum;assert.equal(ids.length,1);return ids;};
const phaseTurns=(prefix,scope=[queueId])=>[16,16,16,15].map((count,index)=>prefix==='followup'?request=>turn(block(count,prefix,100+index*16,followupScope(request))):turn(block(count,prefix,index*16))).concat([turn(finish(`${prefix}_finish`,scope))]);

test('real worker executes16 valid calls together but rejects17 or a foreign input scope before any action',async()=>{
  const allowed=worker({turns:[turn(block(16)),turn(finish())]});assert.equal((await allowed.run()).status,'completed');assert.equal(allowed.executed.length,16);assert.equal(allowed.receipts.size,16);assert(!allowed.pending());
  const tooMany=worker({turns:[turn(block(17))]});assert.equal((await tooMany.run()).status,'incomplete_batch');assert.equal(tooMany.executed.length,0);assert(tooMany.pending());
  const forged=block(16);forged[15].arguments.inputIds=[randomUUID()];const denied=worker({turns:[turn(forged),request=>{assert.equal(request.messages.filter(row=>row.role==='tool').length,16);return turn(finish());}]});assert.equal((await denied.run()).status,'completed');assert.equal(denied.executed.length,0);assert.equal(denied.receipts.size,0);assert(!denied.pending());
});

test('both stages independently complete63 ordinary calls plus finish, retain untouched tasks and expose all128 calls safely',async()=>{
  const h=worker({staged:true,turns:[...phaseTurns('initial'),...phaseTurns('followup',[])]}),result=await h.run();
  assert.equal(result.status,'completed');assert.equal(result.followupStatus,'completed');assert.equal(result.calls,128);assert.equal(h.executed.length,126);assert.equal(h.receipts.size,126);assert.equal(h.requests.length,10);assert(!h.pending());
  assert.deepEqual(h.tasks.get(h.task.uuid),h.task);assert(!h.storage.includes('resolve'));assert.equal(h.progress.at(-1).calls,128);assert(h.progress.some(row=>row.calls>64));assert(h.progress.length<=320);assert(!JSON.stringify(h.progress).includes(canary));assert(!JSON.stringify(h.progress).includes(sourceId));
});

test('failed calls count toward initial64 and a65th finish cannot acknowledge the input or gain a successful receipt',async()=>{
  const h=worker({failSlot:0,turns:[turn(block(16)),request=>{const failed=request.messages.find(row=>row.role==='tool'&&row.toolCallId==='call_0');assert.equal(JSON.parse(failed.content).status,'tool_error');return turn(block(16,'call',16));},turn(block(16,'call',32)),turn(block(16,'call',48)),turn(finish())]}),result=await h.run();
  assert.equal(result.status,'call_limit');assert.equal(h.executed.length,64);assert.equal(h.receipts.size,63);assert(h.pending());assert.equal(h.audits.findLast(row=>row.kind==='run_finished').counts.calls,65);assert(!JSON.stringify(h.progress).includes(canary));
});

test('an overflow reply is rejected together before extra writes and the run audit records the attempted80 calls',async()=>{
  const h=worker({turns:[0,16,32,48,64].map(offset=>turn(block(16,'call',offset)))}),result=await h.run();
  assert.equal(result.status,'call_limit');assert.equal(h.executed.length,64);assert.equal(h.receipts.size,64);assert(h.pending());assert.equal(h.audits.findLast(row=>row.kind==='run_finished').counts.calls,80);assert(h.progress.length<=320);
});

test('followup65th finish exceeds only its own budget, settles handled originals and preserves unresolved exact tasks',async()=>{
  const followup=[0,16,32,48].map(offset=>request=>turn(block(16,'followup',100+offset,followupScope(request)))).concat([turn(finish('followup_finish',[]))]);
  const h=worker({staged:true,turns:[...phaseTurns('initial'),...followup]}),result=await h.run();
  assert.equal(result.status,'completed');assert.equal(result.followupStatus,'call_limit');assert.equal(result.calls,129);assert.equal(h.executed.length,127);assert.equal(h.receipts.size,127);assert(!h.pending());assert.deepEqual(h.tasks.get(h.task.uuid),h.task);assert(!h.storage.includes('resolve'));assert.equal(h.audits.findLast(row=>row.kind==='run_finished').counts.calls,129);assert(h.progress.length<=320);assert(!JSON.stringify(h.progress).includes(canary));
});

test('argument recovery charges every rejected ordinary peer to the existing64-call stage budget',async()=>{
 const turns=[0,16,32,48].map(offset=>{const calls=block(16,'rejected',offset);calls[0].arguments.inputIds=[randomUUID()];return turn(calls);});
 const h=worker({turns:[...turns,request=>{const errors=request.messages.filter(row=>row.role==='tool');assert.equal(errors.length,64);assert(errors.every(row=>JSON.parse(row.content).status==='tool_error'));return turn(finish());}]});
 const result=await h.run();assert.equal(result.status,'call_limit');assert.equal(h.executed.length,0);assert.equal(h.receipts.size,0);assert(h.pending());assert.equal(h.requests.length,5);assert.equal(h.audits.findLast(row=>row.kind==='run_finished').counts.calls,65);
});
