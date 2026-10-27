import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {toolDiagnostics, diagnosticCounts, DIAGNOSTIC_CODES as C, argumentDiagnostic} from '../server/tool-diagnostics.js';
import {createAuditLogger} from '../server/model-audit.js';
import {retrieveAssistantContext} from '../server/assistant-context.js';
import {createChatRunner} from '../server/chat-runner.js';
import {createChatCalendarTools} from '../tools/calendar/chat.js';
import {createProvider} from '../server/providers/index.js';
import {createMapEventStore,createMapEventService} from '../server/map/events.js';
import {createMapTools} from '../tools/map/index.js';

const privateText='PRIVATE_UNTRUSTED_SENTINEL_credential_url_source_prompt_arguments';
const context={agent:'chat',runId:randomUUID(),round:2};
const definition={name:'read_discord_messages',description:'Synthetic read',parameters:{type:'object',properties:{query:{type:'string'}},additionalProperties:false}};

function auditFixture({writeDiagnostic,fetchImpl}={}) {
  const rows=[],logs=[];
  const logger=createAuditLogger({env:{NODE_ENV:'production',SUPABASE_URL:'https://audit.example',SUPABASE_SERVICE_ROLE_KEY:privateText},
    fetchImpl:fetchImpl??(async(_url,init)=>{rows.push(JSON.parse(init.body).p_payload);return Response.json({status:'ready'});}),
    writeDiagnostic:writeDiagnostic??(entry=>logs.push(entry))});
  return {logger,rows,logs};
}

test('untrusted connector fields cannot enter real chat terminal audit or structured logs',async()=>{
  const f=auditFixture();let round=0,executions=0;
  const result=await retrieveAssistantContext({messages:[{role:'user',content:privateText}],principal:{id:'fixture'},
    provider:{toolTurn:async()=>({text:'',toolCalls:round++===0?[{id:'one',name:definition.name,arguments:{query:privateText}}]:[]})},
    liveTools:{tools:[definition],execute:async()=>{executions++;return {status:'unavailable',reason:privateText,sourceStatus:privateText,
      coverage:{complete:false,reason:privateText},message:privateText,sources:[{excerpt:privateText}],
      diagnostics:{stage:privateText,reason:privateText,httpStatus:429,[privateText]:privateText}};}},
    auditContext:context,onAuditEvent:e=>f.logger.recordEvent({eventId:randomUUID(),...e})});
  assert.equal(executions,1);assert.equal(result.status,'unavailable');
  const done=f.rows.find(row=>row.kind==='tool_finished');
  assert.equal(done.counts.outcomeCode,C.outcome.failed);
  assert.equal(done.counts.reasonCode,C.reason.unknown);
  assert.equal(done.counts.stageCode,C.stage.unknown);
  assert.equal(done.counts.observedHttpStatus,429);
  assert.equal(done.counts.dispatched,1);
  assert.equal(f.logs.length,1);
  assert.equal(f.logs[0].reason,'unknown');assert.equal(f.logs[0].stage,'unknown');assert.equal(f.logs[0].outcome,'failed');
  assert(!JSON.stringify({rows:f.rows,logs:f.logs}).includes(privateText));
  assert.equal(f.logs[0].runId,context.runId);
  assert.equal(f.logs[0].eventId,done.eventId);
});

test('classification truth table survives persistence without counting failed coverage as partial',async()=>{
  const f=auditFixture();
  const samples=[
    [{status:'unavailable',coverage:{complete:false}},'failed'],
    [{status:'failed',complete:false},'failed'],
    [{status:'ready',sourceStatus:'unavailable'},'failed'],
    [{status:'ready',coverage:{complete:false}},'partial'],
    [{status:'ready',possiblyTruncated:true},'partial'],
    [{status:'metadata_only'},'partial'],
    [{status:'empty'},'empty'],
    [{status:'pending'},'pending'],
    [{status:'ready',sourceStatus:'unavailable',deferred:true},'deferred'],
    [{status:'permission_denied',coverage:{complete:false}},'policy_denied'],
    [{status:'team_request_required'},'policy_denied'],
    [{status:'aborted',complete:false},'cancelled'],
  ];
  for(const [result,expected] of samples){
    await f.logger.recordEvent({eventId:randomUUID(),context,kind:'tool_finished',tool:'read_discord_messages',status:result.status,
      diagnostics:toolDiagnostics({result})});
    assert.equal(f.rows.at(-1).counts.outcomeCode,C.outcome[expected],JSON.stringify(result));
    assert.equal(f.logs.at(-1).outcomeCode,C.outcome[expected]);
    assert.equal(f.logs.at(-1).outcome,expected);
  }
});

test('adversarial field names and numeric count collisions cannot override reserved diagnostics',async()=>{
  const f=auditFixture();
  const schema={type:'object',properties:{query:{type:'string'}},additionalProperties:false};
  const diagnostic=toolDiagnostics({status:'invalid_request',reason:'invalid_arguments',dispatched:false,
    validation:argumentDiagnostic({query:'safe',[privateText]:privateText},schema)});
  const counts=Object.fromEntries(Array.from({length:2000},(_,i)=>['unsafeField'+i,1e9]));
  Object.assign(counts,{reasonCode:999,stageCode:999,outcomeCode:999,dispatched:1,schemaFieldId:999,
    sequence:Infinity,created:-1,failed:'1',requested:1e9+1,[privateText]:3});
  await f.logger.recordEvent({eventId:randomUUID(),context,kind:'tool_finished',tool:'read_discord_messages',status:'invalid_request',diagnostics:diagnostic,counts});
  const saved=f.rows[0].counts;
  assert.equal(saved.reasonCode,C.reason.invalid_arguments);
  assert.equal(saved.schemaFieldId,C.field.additional_properties);
  assert.equal(saved.dispatched,0);assert.equal(saved.outcomeCode,C.outcome.rejected);
  assert(Object.keys(saved).length<=32);assert(Buffer.byteLength(JSON.stringify(saved))<=4096);
  assert(!JSON.stringify({rows:f.rows,logs:f.logs}).includes(privateText));
  assert(!Object.keys(saved).some(key=>key.startsWith('unsafeField')));
  const normalized=diagnosticCounts({...diagnostic,observedHttpStatus:600,proposalSequence:NaN,sourceReasonCode:1e20,retryable:9,[privateText]:1});
  for(const key of ['observedHttpStatus','proposalSequence','sourceReasonCode','retryable',privateText])assert(!Object.hasOwn(normalized,key));
});

test('throwing, rejecting and nonsettling structured sinks never change dispatch or duplicate suppression',async()=>{
  for(const writeDiagnostic of [()=>{throw Error(privateText);},()=>Promise.reject(Error(privateText)),()=>new Promise(()=>{})]){
    const f=auditFixture({writeDiagnostic});let round=0,executions=0;
    const result=await retrieveAssistantContext({messages:[{role:'user',content:'synthetic'}],principal:{id:'fixture'},auditContext:context,
      provider:{toolTurn:async()=>({text:'',toolCalls:round++===0?['first','second'].map(id=>({id,name:definition.name,arguments:{query:'same'}})):[]})},
      liveTools:{tools:[definition],execute:async()=>{executions++;return {status:'empty',sources:[]};}},
      onAuditEvent:e=>f.logger.recordEvent({eventId:randomUUID(),...e})});
    assert.equal(executions,1);assert.equal(result.results[0].status,'empty');
    const finishes=f.rows.filter(row=>row.kind==='tool_finished');
    assert.equal(finishes.length,2);assert.equal(finishes[0].counts.dispatched,1);
    assert.equal(finishes[1].counts.dispatched,0);assert.equal(finishes[1].counts.reasonCode,C.reason.duplicate_call);
  }
});

test('persistence failure leaves tool result intact and Railway mirror retains safe cause',async()=>{
  const f=auditFixture({fetchImpl:async()=>{throw Error(privateText);}});let round=0,executions=0;
  const result=await retrieveAssistantContext({messages:[{role:'user',content:'synthetic'}],principal:{id:'fixture'},auditContext:context,
    provider:{toolTurn:async()=>({text:'',toolCalls:round++===0?[{id:'one',name:definition.name,arguments:{query:'same'}}]:[]})},
    liveTools:{tools:[definition],execute:async()=>{executions++;return {status:'empty',sources:[]};}},
    onAuditEvent:e=>f.logger.recordEvent({eventId:randomUUID(),...e})});
  assert.equal(executions,1);assert.equal(result.status,'empty');
  assert.equal(f.logs.find(row=>row.event==='agent_tool_diagnostic').outcomeCode,C.outcome.empty);
  assert(f.logs.some(row=>row.event==='model_audit_persistence_failed'));
  assert(!JSON.stringify(f.logs).includes(privateText));
});

test('provider failure logs validate correlation metadata and discard arbitrary context identifiers',async()=>{
  const logs=[];
  const provider=createProvider({configured:true,provider:'openai-compatible',model:'fixture',apiKey:privateText,baseUrl:'https://provider.example/v1',timeoutMs:1000},
    {writeDiagnostic:row=>logs.push(row),audit:{required:true,startModel:async()=>({status:'ready'}),finishModel:async()=>({status:'ready'})},
      fetchImpl:async()=>Response.json({choices:[{message:{role:'assistant',content:null,tool_calls:[{id:'one',type:'function',function:{name:'read_map_events',arguments:'{malformed'}}]},finish_reason:'tool_calls'}]})});
  await assert.rejects(provider.toolTurn({system:privateText,messages:[{role:'user',content:privateText}],tools:[{name:'read_map_events',description:'Read',parameters:{type:'object',properties:{}}}],
    auditContext:{agent:privateText,runId:privateText,round:privateText,credential:privateText}}),error=>error.diagnostics?.reason==='malformed_tool_arguments');
  assert.equal(logs.length,1);assert.equal(logs[0].runId,null);assert.equal(logs[0].round,null);
  assert.match(logs[0].callId,/^[0-9a-f-]{36}$/);assert(!JSON.stringify(logs).includes(privateText));
});

const calendarId='fixed@example.test',eventId='saved_event';
const eventUrl=`https://calendar.google.com/calendar/event?eid=${Buffer.from(`${eventId} ${calendarId}`).toString('base64url')}`;
const start={date:'2031-10-23'},end={date:'2031-10-24'};
for(const native of [false,true])for(const batch of [false,true])for(const venue of ['Saved provider room','',undefined]){
  test(`final answer receives saved venue (${native?'native':'planned'}, ${batch?'batch':'single'}, ${venue===undefined?'unknown':venue===''?'cleared':'present'})`,async()=>{
    const name=batch?'create_calendar_events':'create_calendar_event';
    const args=batch?{events:[{title:'Synthetic event',date:start.date,location:'Requested room'}]}:{title:'Synthetic event',start,end,location:'Requested room'};
    let round=0,answer,writes=0;
    const calendar=createChatCalendarTools({client:{configured:true,calendarId,
      listEvents:async()=>({status:'ready',events:[],coverage:{complete:true}}),
      createChatEvent:async()=>{writes++;return {status:'ready',outcome:'created',eventId,url:eventUrl,start,end,...(venue===undefined?{}:{location:venue}),privateField:privateText};}}});
    const proposal={id:'create',name,arguments:args};
    const provider={async *stream(input){answer=input;yield 'Synthetic answer';},
      ...(native?{toolTurn:async()=>({text:'',toolCalls:round++===0?[proposal]:[]})}:{planTools:async()=>round++===0?[proposal]:[]})};
    const runner=createChatRunner({config:{configured:true,timeoutMs:3000,retrievalToolsEnabled:true},provider,googleTools:calendar});
    const result=await runner.run({conversation:{messages:[{role:'user',content:'Create the synthetic event.'}],timeZone:'America/New_York'},principal:{id:'fixture',googleAccess:true,allowedSourceIds:[]},onRecord:()=>{}});
    assert.equal(result.status,'succeeded');assert.equal(writes,1);
    const data=JSON.parse(answer.system.split('\nUNTRUSTED TOOL STATUS AND REFERENCE DATA (JSON):\n')[1]);
    const receipt=batch?data.results[0].calendarBatchWrite.items[0].calendarWrite:data.results[0].calendarWrite;
    assert.equal(receipt.url,eventUrl);
    assert.equal(Object.hasOwn(receipt,'location'),venue!==undefined);
    if(venue!==undefined)assert.equal(receipt.location,venue);
    assert(!JSON.stringify(receipt).includes('Requested room'));
    assert(!JSON.stringify(data).includes(privateText));
  });
}

test('fixed Discord, Miro and map outcomes retain exact reason in durable and Railway diagnostics',async()=>{
  const f=auditFixture();
  const samples=[['read_discord_messages','discord_unavailable','failed'],['read_discord_messages','policy_unavailable','failed'],
    ['read_discord_messages','policy_changed','policy_denied'],['read_discord_messages','paused','policy_denied'],
    ['read_miro_board','indexing','pending'],['read_miro_item','invalid_cursor','rejected'],['read_miro_item','auth_required','policy_denied'],
    ['read_miro_item','invalid_mcp_result','failed'],['read_miro_item','invalid_svg','failed'],
    ['lookup_map_person','invalid','rejected'],['upsert_map_event','unverified_chat_identity','failed']];
  for(const [tool,status,outcome] of samples){
    await f.logger.recordEvent({eventId:randomUUID(),context,kind:'tool_finished',tool,status,diagnostics:toolDiagnostics({result:{status}})});
    assert.equal(f.rows.at(-1).status,status);assert.equal(f.rows.at(-1).counts.reasonCode,C.reason[status]);
    assert.equal(f.logs.at(-1).reason,status);assert.equal(f.logs.at(-1).outcome,outcome);
  }
  const normalized=toolDiagnostics({result:{status:'ready',sourceStatus:'indexing'}});
  assert.equal(normalized.outcome,'pending');assert.equal(normalized.sourceOutcomeCode,C.outcome.pending);
});

for(const scenario of ['create429','exactread403','mutation503'])test(`real multirow Calendar adapter audits ${scenario} once, retaining all safe item causes`,async()=>{
  const f=auditFixture();let turns=0,reads=0,writes=0,lists=0;
  const failing=status=>({status:status===429?'rate_limited':status===403?'permission_denied':'google_unavailable',
    diagnostics:{stage:'provider_request',reason:'http_error',httpStatus:status},privateField:privateText});
  const client={configured:true,calendarId,
    listEvents:async()=>{lists++;assert.fail('Creating a batch must not implicitly list Calendar events');},
    readChatEvent:async()=>{reads++;return failing(403);},
    createChatEvent:async()=>{writes++;return failing(scenario==='create429'?429:503);}};
  const name=scenario==='exactread403'?'update_calendar_events':'create_calendar_events';
  const entries=scenario==='exactread403'?[0,1,2].map(index=>({eventId:`private_event_${index}`,title:privateText,location:privateText})):
    [0,1].map(index=>({title:privateText+index,date:start.date,location:privateText}));
  if(scenario==='mutation503')entries.push({title:privateText,date:'2031-02-30',location:privateText});
  const result=await retrieveAssistantContext({messages:[{role:'user',content:'Synthetic calendar batch'}],principal:{id:'fixture',googleAccess:true},auditContext:context,
    googleTools:createChatCalendarTools({client}),provider:{toolTurn:async()=>({text:'',toolCalls:turns++===0?[{id:'one',name,arguments:{events:entries}}]:[]})},
    onAuditEvent:e=>f.logger.recordEvent({eventId:randomUUID(),...e})});
  assert.equal(result.status,'partial');assert.equal(turns,2);
  const rows=f.rows.filter(row=>row.kind==='tool_finished');assert.equal(rows.length,1);
  assert.equal(f.rows.filter(row=>row.kind==='tool_started').length,1);assert.equal(f.rows.length,2);
  assert.equal(rows[0].counts.sequence,1);assert.equal(rows[0].counts.outcomeCode,C.outcome.partial);
  assert.equal(rows[0].counts.observedHttpStatus,scenario==='create429'?429:scenario==='exactread403'?403:503);
  assert.equal(rows[0].counts.reasonCode,C.reason.http_error);
  const itemLogs=f.logs.filter(row=>row.event==='agent_tool_batch_item_diagnostic');
  assert.equal(itemLogs.length,entries.length);
  assert(itemLogs.every(row=>row.eventId===rows[0].eventId&&row.runId===context.runId));
  if(scenario==='create429'){
    assert.equal(lists,0);assert.equal(reads,0);assert.equal(writes,2);
    assert.equal(rows[0].counts.batchFailed,2);assert.equal(rows[0].counts.batchUnattempted,0);
    assert(itemLogs.every(row=>row.observedHttpStatus===429&&row.reason==='http_error'));
  }else if(scenario==='exactread403'){
    assert.equal(lists,0);assert.equal(reads,1);assert.equal(writes,0);
    assert.equal(rows[0].counts.batchFailed,1);assert.equal(rows[0].counts.batchUnattempted,2);
    assert.deepEqual(itemLogs.map(row=>row.dispatched),[1,0,0]);
    assert.deepEqual(itemLogs.map(row=>row.observedHttpStatus),[403,undefined,undefined]);
  }else{
    assert.equal(lists,0);assert.equal(reads,0);assert.equal(writes,2);
    assert.equal(rows[0].counts.batchFailed,3);assert.equal(rows[0].counts.batchUnattempted,0);
    assert.deepEqual(itemLogs.map(row=>row.dispatched),[1,1,0]);
    assert.deepEqual(itemLogs.map(row=>row.observedHttpStatus),[503,503,undefined]);
    assert.equal(itemLogs[2].stage,'local_validation');assert.equal(itemLogs[2].reason,'invalid_time_window');
  }
  assert(!JSON.stringify({rows:f.rows,logs:f.logs}).includes(privateText));
  assert(!JSON.stringify({rows:f.rows,logs:f.logs}).includes('private_event_'));
  assert(Object.values(rows[0].counts).every(Number.isSafeInteger));
});

test('forged batch failure arrays are bounded, sanitized and Railway-only without extra durable RPCs',async()=>{
  const f=auditFixture();
  const malicious=Array.from({length:1000},(_,itemIndex)=>({itemIndex,status:itemIndex%2?'unattempted':'failed',
    stage:privateText,reason:privateText,dispatched:999,httpStatus:503,title:privateText,eventId:privateText,location:privateText,[privateText]:privateText}));
  await f.logger.recordEvent({eventId:randomUUID(),context,kind:'tool_finished',tool:'update_calendar_events',status:'partial',
    diagnostics:{...toolDiagnostics({status:'partial'}),batchFailures:[null,'PRIVATE',...malicious]}});
  assert.equal(f.rows.length,1);assert.equal(f.logs.filter(row=>row.event==='agent_tool_diagnostic').length,1);
  const items=f.logs.filter(row=>row.event==='agent_tool_batch_item_diagnostic');assert.equal(items.length,48);
  assert(items.every(row=>row.reason==='unknown'&&row.stage==='unknown'&&row.dispatched===0&&row.observedHttpStatus===undefined));
  assert(!JSON.stringify({rows:f.rows,logs:f.logs}).includes(privateText));
  assert(!Object.hasOwn(f.rows[0],'batchFailures'));assert(!Object.hasOwn(f.rows[0].counts,'batchFailures'));
  assert.equal(f.rows[0].counts.batchFailed,24);assert.equal(f.rows[0].counts.batchUnattempted,24);
  assert(Object.keys(f.rows[0].counts).length<=32);assert(Buffer.byteLength(JSON.stringify(f.rows[0].counts))<=4096);
});

test('actual map storage HTTP failure and timeout reach chat audit without upstream payloads',async()=>{
  for(const timeout of [false,true]){
    const f=auditFixture();let turns=0,requests=0;
    const store=createMapEventStore({env:{SUPABASE_URL:'https://map.example',SUPABASE_SERVICE_ROLE_KEY:privateText},timeoutMs:50,
      fetchImpl:async()=>{requests++;return timeout?new Promise(()=>{}):Response.json({message:privateText,code:privateText},{status:503});}});
    const service=createMapEventService({store});
    const result=await retrieveAssistantContext({messages:[{role:'user',content:'Synthetic map read'}],principal:{id:'fixture',allowedSourceIds:[]},auditContext:context,
      mapTools:createMapTools({service}),provider:{toolTurn:async()=>({text:'',toolCalls:turns++===0?[{id:'one',name:'read_map_events',arguments:{}}]:[]})},
      onAuditEvent:e=>f.logger.recordEvent({eventId:randomUUID(),...e})});
    assert.equal(result.status,'unavailable');assert.equal(requests,1);assert.equal(turns,2);
    const finished=f.rows.find(row=>row.kind==='tool_finished');
    assert.equal(finished.counts.reasonCode,C.reason[timeout?'timeout':'http_error']);
    assert.equal(finished.counts.stageCode,C.stage[timeout?'execution':'provider_request']);
    assert.equal(finished.counts.observedHttpStatus,timeout?undefined:503);
    assert.equal(finished.counts.dispatched,1);assert.equal(finished.counts.outcomeCode,C.outcome.failed);
    assert.equal(f.rows.length,2);assert(!JSON.stringify({rows:f.rows,logs:f.logs}).includes(privateText));
  }
});
