import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createAutomationAdapters} from '../server/automation/adapters.js';
import {createAutomationHandler} from '../server/automation/handler.js';
import {readAutomationConfig} from '../server/automation/config.js';

const sourceId=randomUUID(),miroId=randomUUID(),inputId=randomUUID(),now=()=>new Date('2026-10-22T18:30:00Z');
const input={uuid:inputId,raw_response:{source:'gmail',source_id:sourceId,event_type:'email_received_metadata',event_id:'abc123',revision:'1',received_at:now().toISOString(),payload:{id:'abc123'}}};
test('unrelated cached input completes without Miro access or a forced rolling Calendar scan',async()=>{
  const calls=[],config=readAutomationConfig({AGENT_AUTOMATION_ENABLED:'true'});
  const unreachable=async()=>{calls.push('miro');throw Error('Unrelated message must not require Miro access');};
  const adapters=createAutomationAdapters({env:{ASSISTANT_ALLOWED_SOURCE_IDS:[sourceId,miroId].join(','),AGENT_GMAIL_SOURCE_ID:sourceId},config,now,fetchImpl:async()=>{throw Error('No network');},dependencies:{
    googleConfig:{configured:true},googleClient:{configured:true},calendarConfig:{configured:true,calendarId:'fixed'},calendarClient:{configured:true,calendarId:'fixed',preflight:async()=>({status:'ready',calendarId:'fixed',accessRole:'writer'}),listEvents:async()=>{calls.push('rolling-calendar-scan');throw Error('Unrelated message must not require a model scan');}},
    discordConfig:{configured:false},discordTools:{tools:[]},miroConfig:{configured:true,boardIds:['board']},miroStore:{configured:true,authorizedBoard:unreachable},miroTools:{configured:true,tools:[],execute:unreachable,prepareBoard:unreachable},miroClient:{beginBackgroundBatch:()=>{calls.push('miro-batch');}},
  }});
  let finished=0,modelCalls=0;
  const store={configured:true,claim:async()=>({status:'ready',leaseToken:randomUUID(),inputs:[input]}),renew:async()=>({status:'ready'}),finish:async()=>{finished++;return {status:'ready'};},release:async()=>({status:'ready'})};
  const provider={toolTurn:async request=>{modelCalls++;assert(!request.tools.some(tool=>/miro/.test(tool.name)));const batch=JSON.parse(request.messages[0].content).batchContext;assert.equal(batch.miro,undefined);assert.equal(batch.reconciliationWindow,undefined);return {stopReason:'tool_calls',toolCalls:[{id:'finish',name:'finish_batch',arguments:{handledInputIds:[inputId]}}]};}};
  const result=await createAutomationHandler({...adapters,config,store,provider,now}).tick();
  assert.equal(result.status,'completed');assert.equal(finished,1);assert.equal(modelCalls,1);assert.deepEqual(calls,[]);assert.equal(result.miroReconciliation,undefined);
});
