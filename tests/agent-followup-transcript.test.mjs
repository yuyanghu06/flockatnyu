import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createAutomationHandler as factory } from '../server/automation/handler.js';
import { resourceFixture, completeResourceTasks, call, turn } from './fixtures/planner-resource-regression.mjs';

test('five synthetic full task chains recover through one grouped write and exact resolutions within unchanged transcript caps', async () => {
  const report = await completeResourceTasks(resourceFixture());
  assert.equal(report.chains.size, 5);
  assert(report.transcriptPeak > 30000, 'Exercise a substantial retained transcript');
});

const {readAutomationConfig}=await import('../server/automation/config.js');
function transitionRunner({variant='full',duplicateCall=false}={}){
 const source=randomUUID(),queue=[randomUUID(),randomUUID()],task=randomUUID(),marker='EXACT_INITIAL_TOOL_RESULT_KEEP_PRIVATELY',inputs=queue.map((uuid,i)=>({uuid,raw_response:{source:'discord',source_id:source,event_type:'message_created',event_id:String(300+i),revision:'1',received_at:'2026-10-23T08:00:00Z',payload:{id:String(300+i),guild_id:'100',channel_id:'200',author:{id:'400'},content:'Own original '+i}}}));
 const privateLog=[],requests=[],events=[],modelErrors=[],nextContext={tasks:[{uuid:task,summary:'Exact current task'}],taskCount:1,executionHistory:[{actual:'UNCHANGED_SOURCE_CONTEXT'}],apiResults:{status:'ready'},notice:'SAME_FOLLOWUP_HEADER'},principal={id:'transcript-boundary',allowedSourceIds:[source]};let initialTurns=0,followupTurns=0,verdictCalls=0;
 const pipeline={beginCycle:async()=>{},recordExecution:async e=>privateLog.push(structuredClone(e)),afterInitial:async()=>({status:'ready',inputIds:[task],context:structuredClone(nextContext)}),finishCycle:async()=>({status:'ready'}),...(variant==='hookless'?{}:{validateInitialFinish:async()=>{verdictCalls++;return variant==='unvalidated'?{status:'pending',reason:'uncovered_inputs',uncoveredInputIds:[queue[0]]}:{status:'ready'};}})};
 const provider={toolTurn:async request=>{requests.push(structuredClone(request));try{const payload=JSON.parse(request.messages.findLast(m=>m.role==='user').content),phase=payload.stage;if(phase==='followup'){followupTurns++;assert.deepEqual(payload.context,nextContext);assert.deepEqual(payload.referenceBindings.inputIds.map(x=>x.uuid),[task]);assert.deepEqual(payload.referenceBindings.handledInputIds.map(x=>x.uuid),queue);const reset=variant==='full';assert.equal(request.messages.length===1,reset,variant+' visibility');if(!reset)assert(request.messages.some(m=>m.role==='tool'&&m.content.includes(marker)));assert(privateLog.some(e=>e.kind==='tool_result'&&e.result?.marker===marker),'Initial tool result remains in private execution log');assert(privateLog.some(e=>e.kind==='model_result'&&e.result?.toolCalls?.[0]?.id==='initial_read'),'Raw initial model proposal retained privately');return turn(call('finish_batch',duplicateCall?'initial_read':'follow_finish',[]));}
 initialTurns++;if(initialTurns===1)return turn(call('read_state','initial_read',{},queue));if(variant==='legacy'){assert(request.messages.some(m=>m.role==='tool'&&m.content.includes(marker)));return turn(call('finish_batch','legacy_finish',queue));}const handled=variant==='partial'?[queue[0]]:queue.slice().reverse();return turn(call('finish_batch','initial_finish',handled));}catch(error){modelErrors.push(error);throw error;}}};
 const store={configured:true,claim:async()=>({status:'ready',leaseToken:randomUUID(),inputs}),renew:async()=>({status:'ready'}),release:async()=>{},action:async()=>{events.push('reservation');return {status:'execute'};},finish:async args=>{events.push({finished:args.handledInputIds});return{status:'ready'};}};
 const tools=[{name:'read_state',description:'Read-only retained result',readOnly:true,parameters:{type:'object',properties:{},additionalProperties:false},execute:async()=>{events.push('read');return{status:'ready',marker};}}];
 const config={...readAutomationConfig({AGENT_AUTOMATION_ENABLED:'true'}),maxRounds:variant==='cap'?1:variant==='unvalidated'?2:16};const handler=factory({store,tools,pipeline:variant==='legacy'?undefined:pipeline,principal,authorizeEvents:async()=>true,config,provider,now:()=>new Date('2026-10-23T08:00:00Z')});return{privateLog,requests,events,getVerdictCalls:()=>verdictCalls,run:async()=>{const result=await handler.tick();if(modelErrors.length)throw modelErrors[0];return result;}};
}

test('only trusted ready full-original disposition creates the exact fresh followup header while private proposals and results survive',async()=>{
 const f=transitionRunner();const result=await f.run();assert.equal(result.status,'completed');assert.equal(result.handled,2);assert.equal(f.getVerdictCalls(),1);assert.equal(f.requests.length,3);assert.equal(f.events.filter(x=>typeof x==='object').length,1);assert.equal(f.privateLog.filter(e=>e.kind==='tool_result'&&e.tool==='read_state').length,1);assert.equal(f.privateLog.filter(e=>e.kind==='model_result').length,3);
});

test('hookless, unvalidated, partial and automatic empty-cap transitions keep the prior transcript; legacy visibility remains unchanged',async()=>{
 for(const variant of ['hookless','unvalidated','partial','cap','legacy']){const f=transitionRunner({variant}),result=await f.run();if(variant==='cap'||variant==='unvalidated')assert.equal(result.status,'round_limit',variant);else assert.equal(result.status,'completed',variant);if(variant==='partial')assert.equal(result.handled,1);if(variant==='hookless'||variant==='cap'||variant==='legacy')assert.equal(f.getVerdictCalls(),0);assert(f.privateLog.some(e=>e.kind==='model_result')||variant==='legacy');}
});

test('a fresh model transcript never resets call-ID replay protection or dispatches an already used initial call',async()=>{
 const f=transitionRunner({duplicateCall:true}),result=await f.run();assert.equal(result.followupStatus??result.status,'invalid_tool_call');assert.deepEqual(f.events,['read']);assert.equal(f.requests.length,3);assert(f.privateLog.some(e=>e.kind==='model_result'&&e.result.toolCalls[0].id==='initial_read'));
});
