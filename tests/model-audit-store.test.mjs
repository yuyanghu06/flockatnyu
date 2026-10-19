import test from 'node:test';
import assert from 'node:assert/strict';
import {createAuditLogger,estimateAuditCost} from '../server/model-audit.js';
const callId='11111111-1111-4111-8111-111111111111',runId='22222222-2222-4222-8222-222222222222';
const start={callId,context:{agent:'planner',runId,round:2},provider:'openai',model:'gpt-6-luna',operation:'toolTurn',stream:false,providerBaseHost:'api.openai.com'};
const env={NODE_ENV:'production',SUPABASE_URL:'https://private.example.com',SUPABASE_SERVICE_ROLE_KEY:'service-private-secret',GOOGLE_CLIENT_SECRET:'google-private-secret',GOOGLE_CREDENTIALS:JSON.stringify({access_token:'json-private-token',refresh_token:'json-private-refresh'})};
const usage={inputTokens:1000,outputTokens:200,cacheReadTokens:500,cacheWriteTokens:0,reasoningTokens:30};
function fixture(options={}){const requests=[],diagnostics=[];const logger=createAuditLogger({env,fetchImpl:async(url,init)=>{requests.push({url,init,payload:JSON.parse(init.body).p_payload});return Response.json({status:'ready'});},writeDiagnostic:x=>diagnostics.push(x),...options});return{logger,requests,diagnostics};}

test('durable start and terminal preserve identity/nullable usage/output, never other arguments',async()=>{
 const {logger,requests}=fixture();assert.equal(logger.required,true);assert.equal(logger.configured,true);
 assert.deepEqual(await logger.startModel({...start,prompt:'DO-NOT-STORE'}),{status:'ready'});
 assert.deepEqual(await logger.finishModel({callId,status:'succeeded',responseId:'chatcmpl-123',providerRequestId:'req_123',httpStatus:200,stopReason:'stop',usage,output:{text:'Model answer',toolCalls:[{id:'1',name:'lookup',arguments:{query:'generated'}}]},rawResponse:'DO-NOT-STORE'}),{status:'ready'});
 assert.equal(requests.length,2);assert.equal(requests[1].payload.output.value.text,'Model answer');assert.equal(requests[1].payload.output.truncated,false);
 assert.deepEqual(requests[1].payload.usage,usage);assert.equal(requests[1].payload.runId,runId);assert.equal(requests[1].payload.round,2);
 assert.equal(requests[1].payload.estimatedCostUsd,0.000155);assert.equal(JSON.stringify(requests).includes('DO-NOT-STORE'),false);
 assert.equal(requests[1].init.signal.aborted,false);
});

test('redacts configured env/JSON secrets and recognizable credential patterns recursively before truncation',async()=>{
 const {logger,requests,diagnostics}=fixture();await logger.startModel(start);
 const output={text:'service-private-secret google-private-secret json-private-token json-private-refresh Bearer opaquecredential https://user:pass@host/a?access_token=abc123 password=abc456 sk-syntheticPrivateKey123456',toolCalls:[{arguments:{password:'nested-secret',safe:'normal'}}]};
 await logger.finishModel({callId,status:'failed',output,errorCode:'invalid_tool_call'});
 const stored=JSON.stringify(requests[1].payload);for(const secret of ['service-private-secret','google-private-secret','json-private-token','json-private-refresh','opaquecredential','user:pass','abc123','abc456','syntheticPrivateKey123456','nested-secret'])assert.equal(stored.includes(secret),false,secret);
 assert.ok(stored.includes('normal'));assert.equal(requests[1].payload.output.redacted,true);assert.equal(requests[1].payload.usage.inputTokens,null);assert.equal(requests[1].payload.estimatedCostUsd,null);assert.deepEqual(diagnostics,[]);
});

test('bounded output supports unicode, depth, cycles, huge arrays, explicit truncation metadata',async()=>{
 const {logger,requests}=fixture();await logger.startModel(start);const output={text:'🗽'.repeat(200000)};output.cycle=output;
 await logger.finishModel({callId,status:'succeeded',output});const result=requests[1].payload.output;
 assert.equal(result.truncated,true);assert.ok(result.originalBytes>=800000);assert.ok(Buffer.byteLength(JSON.stringify(result))<615000);
 const small={};small.self=small;await logger.finishModel({callId,status:'failed',output:{small,array:Array(2000).fill('item')}});assert.equal(requests[2].payload.output.truncated,true);
});

test('production cannot disable required audit; unavailable terminal remains observable and diagnostics have no content',async()=>{
 const diagnostics=[];const logger=createAuditLogger({env:{NODE_ENV:'production',MODEL_AUDIT_ENABLED:'false',MODEL_AUDIT_REQUIRED:'false'},writeDiagnostic:x=>diagnostics.push(x)});
 assert.equal(logger.required,true);assert.deepEqual(await logger.startModel(start),{status:'unavailable'});
 assert.deepEqual(diagnostics,[{event:'model_audit_persistence_failed',operation:'agent_audit_start_model'}]);
 const dev=createAuditLogger({env:{}});assert.equal(dev.required,false);assert.deepEqual(await dev.startModel(start),{status:'not_configured'});
 const required=createAuditLogger({env:{MODEL_AUDIT_REQUIRED:'true'},writeDiagnostic:()=>{}});assert.equal(required.required,true);assert.deepEqual(await required.startModel(start),{status:'unavailable'});
});

test('DB failure, malformed/oversize responses, and fetch ignoring abort are bounded without exposing response content',async()=>{
 for(const fetchImpl of [async()=>new Response('PRIVATE DATABASE ERROR',{status:500}),async()=>new Response('PRIVATE INVALID JSON'),async()=>new Response('x'.repeat(5000))]){
  const {logger,diagnostics}=fixture({fetchImpl});assert.deepEqual(await logger.startModel(start),{status:'unavailable'});assert.equal(JSON.stringify(diagnostics).includes('PRIVATE'),false);
 }
 const {logger}=fixture({env:{...env,MODEL_AUDIT_TIMEOUT_MS:'250'},fetchImpl:()=>new Promise(()=>{})});const began=Date.now();assert.deepEqual(await logger.startModel(start),{status:'unavailable'});assert.ok(Date.now()-began<1500);
});

test('tool/run events discard arguments/results/text and retain numeric counts only',async()=>{
 const {logger,requests}=fixture();await logger.recordEvent({eventId:callId,context:start.context,kind:'tool_finished',tool:'read_map_events',status:'failed',durationMs:31,counts:{calls:1,privateText:'DONT STORE',password:123},arguments:{query:'DONT STORE'},output:'DONT STORE'});
 assert.deepEqual(requests[0].payload.counts,{calls:1});assert.equal(JSON.stringify(requests).includes('DONT STORE'),false);
 await logger.prune();assert.ok(requests[1].url.endsWith('/agent_audit_prune'));
});

test('known pricing distinguishes cached input and leaves unknown model/host/tier/usage unknown',()=>{
 const identity={provider:'openai',model:'gpt-6-luna',providerBaseHost:'api.openai.com',serviceTier:'default'};
 assert.equal(estimateAuditCost(identity,usage).estimatedCostUsd,0.000155);
 assert.ok(estimateAuditCost(identity,{...usage,inputTokens:272000}));
 assert.equal(estimateAuditCost(identity,{...usage,inputTokens:272001}),null);
 for(const changed of [{provider:'anthropic'},{model:'gpt-6-luna-2026-10-01'},{providerBaseHost:'proxy.example.com'},{serviceTier:'priority'}])assert.equal(estimateAuditCost({...identity,...changed},usage),null);
 for(const changed of [{inputTokens:null},{outputTokens:null},{cacheReadTokens:null},{cacheReadTokens:2000},{cacheWriteTokens:null},{cacheWriteTokens:501}])assert.equal(estimateAuditCost(identity,{...usage,...changed}),null);
});

test('dev configured database requires explicit opt-in, and metadata secrets/encoded tool JSON are redacted',async()=>{
 const disabled=fixture({env:{...env,NODE_ENV:'development'}});assert.equal(disabled.logger.configured,false);assert.deepEqual(await disabled.logger.startModel(start),{status:'not_configured'});assert.equal(disabled.requests.length,0);
 const {logger,requests}=fixture();await logger.startModel({...start,provider:'openai-compatible'});
 await logger.finishModel({callId,status:'succeeded',responseId:'service-private-secret',providerRequestId:'google-private-secret',usage,
  output:{toolCalls:[{arguments:JSON.stringify({access_token:'unconfiguredAccessSecret',password:'unconfiguredPassword phrase remainder',url:'https://host/path?token=urlSecret&ok=1'})},{arguments:JSON.stringify(JSON.stringify({refresh_token:'doubleEncodedSecret'}))}]}});
 const payload=requests[1].payload,stored=JSON.stringify(payload);for(const secret of ['unconfiguredAccessSecret','unconfiguredPassword','phrase remainder','urlSecret','doubleEncodedSecret'])assert.equal(stored.includes(secret),false,secret);
 assert.equal(payload.responseId,null);assert.equal(payload.providerRequestId,null);assert.equal(payload.estimatedCostUsd,0.000155);
});

test('all sensitive key families redact nested encoded JSON and bounded repeated encoding',async()=>{
 const families=['password','passwd','secret','credential','authorization','cookie','api_key','access_token','refresh_token','private_key','service_role','client_secret','token','key','nested_secret_value'];
 const sensitive=Object.fromEntries(families.map((key,index)=>[key,`UNKNOWN_FAMILY_SENTINEL_${index}`]));
 const {logger,requests}=fixture();await logger.startModel(start);
 let repeated=JSON.stringify(sensitive);for(let i=0;i<4;i++)repeated=JSON.stringify(repeated);
 await logger.finishModel({callId,status:'succeeded',output:{toolCalls:[{arguments:{encoded:JSON.stringify(sensitive),double:JSON.stringify(JSON.stringify(sensitive)),repeated,ordinary:'safe ordinary output'}}]}});
 const payload=requests[1].payload,stored=JSON.stringify(payload);
 for(let i=0;i<families.length;i++)assert.equal(stored.includes(`UNKNOWN_FAMILY_SENTINEL_${i}`),false,families[i]);assert.ok(stored.includes('safe ordinary output'));assert.equal(payload.output.redacted,true);
 const deep={};let child=deep;for(let i=0;i<30;i++){child.nested={};child=child.nested;}child.authorization='DEEP_CREDENTIAL_SENTINEL';
 await logger.finishModel({callId,status:'failed',output:{encoded:JSON.stringify(deep)}});assert.equal(JSON.stringify(requests[2].payload).includes('DEEP_CREDENTIAL_SENTINEL'),false);assert.equal(requests[2].payload.output.truncated,true);
});
