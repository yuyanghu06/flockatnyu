import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {buildObservationHandoff} from '../server/automation/observation-handoff.js';
import {createAutomationHandler} from '../server/automation/handler.js';
import {readAutomationConfig} from '../server/automation/config.js';

const copy=value=>structuredClone(value),bytes=value=>Buffer.byteLength(JSON.stringify(value));
const observed=(tool,args,result,inputIds=['original-one'])=>({kind:'tool_result',tool,arguments:args,result,inputIds,callId:randomUUID()});
test('handoff transfers exact observations and coverage, with latest exact-argument failures suppressing old success',()=>{
 const history=[observed('read_discord_messages',{channelId:'200',messageId:'300'},{status:'ready',sources:[{content:'Older now-invalid fact'}],coverage:{complete:true}}),
  observed('read_discord_messages',{channelId:'200',messageId:'301'},{status:'ready',sources:[{content:'Distinct original'}],coverage:{complete:false,reason:'bounded'}}),
  observed('read_discord_messages',{messageId:'300',channelId:'200'},{status:'unavailable',reason:'source_unavailable'}),
  observed('read_pending_task',{taskId:randomUUID()},{status:'ready',task:{info:{executionHistory:['Private saved body']}}}),
  observed('upsert_calendar_event',{}, {status:'ready',eventId:'applied-action'})];
 const before=copy(history),result=buildObservationHandoff(history);assert.equal(result.observations.length,2);
 assert.deepEqual(result.observations.map(row=>row.result),[history[1].result,history[2].result]);assert.deepEqual(result.observations[0].originalInputIds,['original-one']);assert(!JSON.stringify(result).includes('Older now-invalid fact'));assert(!JSON.stringify(result).includes('Private saved body'));assert(!JSON.stringify(result).includes('applied-action'));assert.deepEqual(history,before);
 assert.match(result.notice,/not fresh reads or new permissions/);assert.match(result.notice,/failed result proves no absence/);
});

test('handoff budget omits whole observations and never strips coverage to pretend an oversized result is complete',()=>{
 const big=observed('read_map_events',{}, {status:'ready',events:[{notes:'L'.repeat(9000)}],coverage:{complete:false,reason:'partial_source'}}),small=observed('lookup_map_person',{providerUserId:'400'},{status:'ready',person:{id:randomUUID()}});
 const result=buildObservationHandoff([big,small],{maxBytes:1600});assert(bytes(result)<=1600);assert.equal(result.observations.length,1);assert.equal(result.observations[0].tool,'lookup_map_person');assert.equal(result.omittedResults,1);assert(!JSON.stringify(result).includes('L'.repeat(100)));
});

test('actual production handler carries initial source facts into a validated five-input follow-up without refetching',async()=>{
 const source=randomUUID(),lease=randomUUID(),taskId=randomUUID(),principal={id:'synthetic-worker',allowedSourceIds:[source]};
 const originals=Array.from({length:5},(_,i)=>({uuid:randomUUID(),raw_response:{source:'discord',source_id:source,event_type:'message_created',event_id:String(300+i),revision:'1',received_at:'2026-10-25T20:00:00Z',payload:{id:String(300+i),author:{id:'400'},content:'Synthetic original '+i}}}));
 const sourceResult={status:'ready',sources:[{sourceId:source,url:'https://discord.com/channels/100/200/300',messageId:'300',authorId:'400',content:'Observed workshop location is Bobst room101; preserve this fact into follow-up.'}],coverage:{complete:true,textTruncated:false}};
 let turns=0,reads=0,syncs=0,authorizations=0,finished=[];const requests=[];
 const call=(name,id,args={},inputIds=[originals[0].uuid])=>({id,name,arguments:name==='finish_batch'?{handledInputIds:args}:{inputIds,arguments:args}}),turn=(...toolCalls)=>({text:'',stopReason:'tool_calls',toolCalls});
 const tools=[{name:'read_discord_messages',readOnly:true,description:'Synthetic isolated Discord transport',parameters:{type:'object',additionalProperties:false,properties:{channelId:{type:'string'},messageId:{type:'string'}},required:['channelId','messageId']},execute:async()=>{reads++;return copy(sourceResult);}},
  {name:'sync_calendars_to_map',description:'Synthetic isolated Calendar projection',idempotent:true,parameters:{type:'object',properties:{},additionalProperties:false},execute:async()=>{syncs++;return{status:'ready',complete:true,results:[]};}}];
 const store={configured:true,claim:async()=>({status:'ready',leaseToken:lease,inputs:copy(originals)}),renew:async()=>({status:'ready'}),action:async({complete})=>({status:complete?'completed':'execute'}),finish:async({handledInputIds})=>{finished=handledInputIds;return{status:'ready'};},release:async()=>{},fail:async()=>{}};
 const pipeline={beginCycle:async()=>{},validateInitialFinish:async()=>({status:'ready'}),afterInitial:async()=>({status:'ready',inputIds:[taskId],followupRequired:true,context:{tasks:[{uuid:taskId,request:{operation:'source_review',summary:'Act on already observed source facts'}}]}}),validateFollowupFinish:async()=>({status:'ready'}),finishCycle:async()=>({status:'ready'})};
 const provider={toolTurn:async request=>{requests.push(copy({...request,signal:undefined}));turns++;
  if(turns===1)return turn(call('read_discord_messages','source',{channelId:'200',messageId:'300'}));
  if(turns===2)return turn(call('finish_batch','initial',originals.map(row=>row.uuid)));
  assert.match(request.system,/FOLLOWUP phase/);assert.equal(request.messages.length,1,'Validated complete initial phase resets the visible transcript');
  const payload=JSON.parse(request.messages[0].content),handoff=payload.currentCycleObservations;assert(handoff);assert.equal(handoff.observations.length,1);assert.deepEqual(handoff.observations[0].result,sourceResult);assert.deepEqual(handoff.observations[0].originalInputIds,[originals[0].uuid]);
  assert.deepEqual(payload.referenceBindings.inputIds.map(row=>row.uuid),[taskId]);assert(bytes(request.messages)<=262144);
  return turn(call('finish_batch','followup',[]));}};
 const config=readAutomationConfig({AGENT_AUTOMATION_ENABLED:'true',AGENT_AUTOMATION_MAX_INPUTS:'5'});
 const outcome=await createAutomationHandler({store,tools,pipeline,provider,config,principal,authorizeEvent:async()=>{authorizations++;return true;},now:()=>new Date('2026-10-25T20:00:00Z')}).tick();
 assert.equal(outcome.status,'completed');assert.equal(outcome.handled,5);assert.equal(outcome.followupStatus,'completed');assert.equal(reads,1);assert.equal(syncs,1);assert.equal(turns,3);assert.deepEqual(finished,originals.map(row=>row.uuid));assert(authorizations>5,'Ordinary per-operation source authorization still runs');
});
