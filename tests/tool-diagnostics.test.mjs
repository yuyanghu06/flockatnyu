import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {DIAGNOSTIC_CODES as C,toolDiagnostics,diagnosticCounts,argumentDiagnostic,safeDiagnosticTool} from '../server/tool-diagnostics.js';
import {createAuditLogger} from '../server/model-audit.js';

test('content-free fixed classification separates coverage, empty, deferral, policy, cancellation and execution',()=>{
 for(const [result,outcome]of [[{status:'unavailable',coverage:{complete:false}},'failed'],[{status:'team_request_required',coverage:{complete:false}},'policy_denied'],[{status:'empty'},'empty'],[{status:'ready',sourceStatus:'partial'},'partial'],[{status:'ready',sourceStatus:'unavailable',deferred:true},'deferred'],[{status:'pending'},'pending'],[{status:'permission_denied'},'policy_denied'],[{status:'aborted'},'cancelled'],[{status:'invalid_request'},'rejected'],[{status:'ready'},'success']])assert.equal(toolDiagnostics({result}).outcome,outcome);
 const thrown=toolDiagnostics({error:Error('PRIVATE ERROR https://private.invalid/token=secret')});assert.equal(thrown.reason,'exception');assert.equal(thrown.retryabilityKnown,0);
 assert.equal(toolDiagnostics({result:{status:'ready',sourceStatus:'partial'},status:'aborted'}).outcome,'cancelled');assert.equal(toolDiagnostics({result:{status:'ready',sourceStatus:'unavailable',deferred:true},status:'aborted'}).outcome,'cancelled');
 const local=toolDiagnostics({status:'invalid_request',dispatched:false,reason:'invalid_arguments'});assert.equal(local.observedHttpStatus,undefined);assert.equal(local.retryable,0);
 for(const [httpStatus,retryable]of [[400,0],[401,0],[408,1],[429,1],[503,1]]){const d=toolDiagnostics({result:{status:'unavailable',diagnostics:{stage:'provider_request',reason:'http_error',httpStatus}}});assert.equal(d.observedHttpStatus,httpStatus);assert.equal(d.retryable,retryable);}
});

test('schema validation emits only fixed field IDs, never arbitrary property names or values',()=>{
 const schema={type:'object',additionalProperties:false,properties:{arguments:{type:'object',additionalProperties:false,properties:{query:{type:'string',minLength:3}},required:['query']}},required:['arguments']};
 assert.deepEqual(argumentDiagnostic({arguments:{query:'x'}},schema),{keyword:'min_length',field:'query'});
 const unknown=argumentDiagnostic({arguments:{query:'fine','PRIVATE KEY URL TOKEN':'PRIVATE VALUE'}},schema);
 assert.deepEqual(unknown,{keyword:'additional_properties',field:'additional_properties'});
 const d=toolDiagnostics({status:'invalid_request',reason:'invalid_arguments',dispatched:false,validation:unknown});const counts=diagnosticCounts(d);
 assert.equal(counts.schemaFieldId,C.field.additional_properties);assert.equal(counts.validationCode,C.validation.additional_properties);
 assert.equal(JSON.stringify(counts).includes('PRIVATE'),false);
 assert.deepEqual(argumentDiagnostic({arguments:{}},schema),{keyword:'required',field:'query'});
 assert.deepEqual(argumentDiagnostic({arguments:{query:123}},schema),{keyword:'type',field:'query'});
});

test('audit persists bounded numeric reason counts and mirrors safe correlation even if persistence or logging fails',async()=>{
 const runId=randomUUID(),eventId=randomUUID(),rows=[],logs=[];
 const logger=createAuditLogger({env:{NODE_ENV:'production',SUPABASE_URL:'https://fixture.invalid',SUPABASE_SERVICE_ROLE_KEY:'PRIVATE_CREDENTIAL'},fetchImpl:async(url,init)=>{rows.push(JSON.parse(init.body).p_payload);return Response.json({status:'ready'});},writeDiagnostic:entry=>logs.push(entry)});
 const diagnostics=toolDiagnostics({status:'PRIVATE_STATUS',reason:'PRIVATE_REASON',stage:'PRIVATE_STAGE',dispatched:false,proposalSequence:7,validation:{keyword:'additional_properties',field:'PRIVATE_FIELD'}});
 await logger.recordEvent({eventId,context:{agent:'chat',runId,round:3},kind:'tool_finished',tool:'PRIVATE TOOL https://private.invalid/?token=private',status:'PRIVATE STATUS /private?token=private',diagnostics,counts:Object.fromEntries(Array.from({length:100},(_,n)=>[`count${n}`,n])),arguments:'PRIVATE_ARGUMENTS',output:'PRIVATE_RESULT'});
 assert.equal(rows[0].tool,'unknown_tool');assert.equal(rows[0].status,'unknown');assert.equal(rows[0].counts.reasonCode,0);assert.equal(rows[0].counts.stageCode,0);assert.equal(rows[0].counts.dispatched,0);assert.equal(rows[0].counts.proposalSequence,7);assert.ok(Object.keys(rows[0].counts).length<=32);assert.equal(rows[0].counts.count0,undefined);assert.ok(Buffer.byteLength(JSON.stringify(rows[0].counts))<4096);
 assert.equal(logs[0].event,'agent_tool_diagnostic');assert.equal(logs[0].runId,runId);assert.equal(logs[0].eventId,eventId);assert.equal(logs[0].round,3);assert.equal(JSON.stringify({rows,logs}).includes('PRIVATE'),false);
 for(const writeDiagnostic of [()=>{throw Error('PRIVATE');},()=>Promise.reject(Error('PRIVATE')),()=>new Promise(()=>{})]){
  const sink=createAuditLogger({env:{},writeDiagnostic});const value=await sink.recordEvent({eventId,context:{agent:'planner',runId,round:1},kind:'tool_finished',tool:'read_drive',status:'unavailable',diagnostics:toolDiagnostics({status:'unavailable'})});assert.equal(value.status,'not_configured');
 }
 assert.equal(safeDiagnosticTool('https://private.invalid'),'unknown_tool');
});

test('reviewed actual adapter statuses retain fixed reason codes and original lifecycle status in storage and Railway',async()=>{
 const logs=[],rows=[],context={agent:'chat',runId:randomUUID(),round:2};
 const logger=createAuditLogger({env:{MODEL_AUDIT_ENABLED:'true',SUPABASE_URL:'https://fixture.invalid',SUPABASE_SERVICE_ROLE_KEY:'PRIVATE_KEY'},fetchImpl:async(url,init)=>{rows.push(JSON.parse(init.body).p_payload);return Response.json({status:'ready'});},writeDiagnostic:e=>logs.push(e)});
 for(const status of ['discord_unavailable','policy_unavailable','policy_changed','paused','indexing','invalid_cursor','invalid','auth_required','response_byte_limit','content_changed','invalid_mcp_result','invalid_svg']){
  const diagnostics=toolDiagnostics({result:{status}});assert.equal(diagnostics.reason,status);
  await logger.recordEvent({eventId:randomUUID(),context,kind:'tool_finished',tool:'read_discord_messages',status,diagnostics});
  assert.equal(rows.at(-1).status,status);assert.equal(logs.at(-1).status,status);assert.equal(logs.at(-1).reason,status);assert.notEqual(rows.at(-1).counts.reasonCode,0);
 }
 assert.equal(toolDiagnostics({status:'indexing'}).outcome,'pending');assert.equal(toolDiagnostics({status:'invalid'}).outcome,'rejected');assert.equal(toolDiagnostics({status:'policy_unavailable'}).outcome,'failed');
});

test('Calendar batch preserves partial aggregate, first failure cause, durable counts and every safe Railway item',async()=>{
 const result={status:'partial',calendarBatchWrite:{items:[{status:'created',title:'PRIVATE_TITLE'},
  {status:'failed',title:'PRIVATE_TITLE',eventId:'PRIVATE_EVENT',location:'PRIVATE_LOCATION',reason:'rate_limited',diagnostics:{stage:'provider_request',reason:'http_error',httpStatus:429}},
  {status:'failed',reason:'read_required',diagnostics:{stage:'local_validation',reason:'read_required'}},
  {status:'failed',reason:'invalid_event',diagnostics:{stage:'local_validation',reason:'invalid_event'}},
  {status:'unattempted',reason:'permission_denied',diagnostics:{stage:'provider_request',reason:'http_error',httpStatus:403}}]}};
 const diagnostics=toolDiagnostics({result});assert.equal(diagnostics.outcome,'partial');assert.equal(diagnostics.reason,'http_error');assert.equal(diagnostics.stage,'provider_request');assert.equal(diagnostics.observedHttpStatus,429);
 const counts=diagnosticCounts(diagnostics);assert.equal(counts.batchFailed,3);assert.equal(counts.batchUnattempted,1);
 const logs=[],rows=[],eventId=randomUUID(),runId=randomUUID();const logger=createAuditLogger({env:{MODEL_AUDIT_ENABLED:'true',SUPABASE_URL:'https://fixture.invalid',SUPABASE_SERVICE_ROLE_KEY:'PRIVATE_KEY'},fetchImpl:async(url,init)=>{rows.push(JSON.parse(init.body).p_payload);return Response.json({status:'ready'});},writeDiagnostic:e=>logs.push(e)});
 await logger.recordEvent({eventId,context:{agent:'chat',runId,round:3},kind:'tool_finished',tool:'update_calendar_events',status:'partial',diagnostics});
 assert.equal(rows.length,1);assert.equal(rows[0].counts.batchFailed,3);assert.equal(rows[0].counts.batchUnattempted,1);assert.equal(rows[0].counts.observedHttpStatus,429);assert.equal(rows[0].counts.outcomeCode,C.outcome.partial);
 const items=logs.filter(e=>e.event==='agent_tool_batch_item_diagnostic');assert.equal(items.length,4);assert.deepEqual(items.map(e=>e.itemIndex),[1,2,3,4]);assert.deepEqual(items.map(e=>e.dispatched),[1,0,0,0]);assert.deepEqual(items.map(e=>e.reason),['http_error','read_required','invalid_event','http_error']);
 assert.equal(items[0].observedHttpStatus,429);assert.equal(items[1].observedHttpStatus,undefined);assert.equal(items[3].observedHttpStatus,undefined);assert.ok(items.every(e=>e.eventId===eventId&&e.runId===runId&&e.round===3&&e.tool==='update_calendar_events'));assert.equal(JSON.stringify({rows,logs}).includes('PRIVATE'),false);
});

test('batch item logger re-sanitizes hostile metadata, bounds item count and ignores sink failures',async()=>{
 const logs=[];const logger=createAuditLogger({env:{},writeDiagnostic:e=>{logs.push(e);if(logs.length===2)throw Error('PRIVATE_EXCEPTION');}});
 const diagnostics={...toolDiagnostics({status:'partial'}),batchFailures:Array.from({length:100},(_,itemIndex)=>({status:'failed',itemIndex,stage:'PRIVATE_STAGE',reason:'PRIVATE_REASON',httpStatus:599,dispatched:999,title:'PRIVATE_TITLE',eventId:'PRIVATE_EVENT',location:'PRIVATE_LOCATION',schemaFieldId:'PRIVATE_FIELD'}))};
 await logger.recordEvent({eventId:randomUUID(),context:{agent:'chat',runId:randomUUID(),round:1},kind:'tool_finished',tool:'update_calendar_events',status:'partial',diagnostics});
 const items=logs.filter(e=>e.event==='agent_tool_batch_item_diagnostic');assert.equal(items.length,50);assert.equal(JSON.stringify(logs).includes('PRIVATE'),false);assert.ok(items.every(e=>e.stage==='unknown'&&e.reason==='unknown'&&e.dispatched===0&&e.observedHttpStatus===undefined));
});
