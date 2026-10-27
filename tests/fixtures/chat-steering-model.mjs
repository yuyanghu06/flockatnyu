// Synthetic storage with production runner/map adapters. Model responses are
// supplied by the caller: deterministic self-check or a separately approved API.
import assert from 'node:assert/strict';
import {createChatRunner} from '../../server/chat/runner.js';
import {createChatSteeringRegistry} from '../../server/chat/steering.js';
import {fixture,snapshot,ids,origin,principal,requestContext,discordUsers,zone,currentUpdate} from './chat-map-time.mjs';
export const caseNames=['correction-during-map-write','answer-context-change'];
export function scenario(name){
  assert(caseNames.includes(name));
  const data=snapshot(),f=fixture({data}),records=[],audit=[],injections=[],adapterContexts=[];
  const messages=[{role:'user',content:name===caseNames[0]
    ?'Please correct the saved Stern presence entry in the fourth floor study lounge to end at 8 PM New York today. Keep the start, all four people, their labels, the room and every other detail.'
    :'For a sample invitation only, explain in two paragraphs how to write October 23, 2026 at 8 PM New York with its UTC equivalent. This is a wording example; do not save or change anything.'}];
  const correction=name===caseNames[0]
    ?'Correction to the same Stern fourth floor study lounge entry: make the end 7 PM New York today instead of 8 PM. Keep all four people, labels, start, room and every other detail.'
    :'Change the invitation example to 7 PM New York on October 23, 2026. Give only one sentence with that local time and its UTC equivalent. Do not save or change anything.';
  const registry=createChatSteeringRegistry({now:()=>new Date(f.now)}),steering=registry.create({principal,origin,messages});
  let injected=false;
  const inject=boundary=>{assert(!injected);injected=true;const receipt=registry.enqueue(steering.runId,{principal,origin,token:steering.steeringToken,body:{messageId:'queued-correction',text:correction}});injections.push({boundary,receipt,toolCallIndex:f.calls.length,storageAttempts:f.attempts.length,confirmedWrites:f.writes.length});assert.equal(receipt.httpStatus,202);};
  const originalUpsert=f.store.upsert;
  f.store.upsert=async input=>{if(name===caseNames[0]&&!injected)inject('first-store-upsert-inflight-before-commit');return originalUpsert(input);};
  const mapTools={...f.mapTools,createRequest(context){adapterContexts.push(structuredClone(context));return f.mapTools.createRequest(context);}};
  return {name,f,data,messages,correction,records,audit,injections,adapterContexts,steering,
    async run(provider,config,{signal}={}){
      const runner=createChatRunner({config,provider,mapTools,audit:{async recordEvent(event){audit.push(event);}},now:()=>new Date(f.now)});
      const result=await runner.run({conversation:{messages,timeZone:zone,buildingId:'stern-school-of-business'},principal,requestContext,discordUsers,steering,signal,onRecord(record){records.push(structuredClone(record));if(name===caseNames[1]&&!injected&&record.type==='delta'&&record.text)inject('first-answer-delta');}});
      let text='';for(const record of records){if(record.type==='reset')text='';if(record.type==='delta')text+=record.text;}
      return {result,text,records};
    },
    verify(answer,proposals){
      assert.equal(answer.result.status,'succeeded');assert.equal(injections.length,1,'Required safe-boundary injection must actually occur');
      assert.equal(records.filter(row=>row.type==='run').length,1);assert.equal(records.filter(row=>row.type==='done').length,1);assert(!records.some(row=>row.type==='error'));
      assert.deepEqual(records.filter(row=>row.type==='steering').map(row=>row.status),['accepted','applied']);
      assert.equal(new Set(audit.map(row=>row.context.runId)).size,1);assert.equal(answer.result.runId,steering.runId);assert.equal(adapterContexts.length,1,'Keep the same request-local adapter');
      assert(/7(?::00)?\s*p\.?m\.?|19:00/i.test(answer.text),'Final answer must use latest 7 PM local instruction');
      if(name===caseNames[0]){
        assert.equal(f.attempts.length,2,'Exactly two intended attempts, no blind replay');assert.equal(f.writes.length,2,'Both first write and correction must have actual receipts');
        const [first,last]=f.writes;assert(first.event.id===ids.event&&last.event.id===ids.event);assert.equal(new Date(first.event.ends_at).toISOString(),'2026-10-24T00:00:00.000Z');
        assert.equal(first.expectedUpdatedAt,data.events[0].updated_at);assert.equal(last.expectedUpdatedAt,new Date(Date.parse(f.now)+1).toISOString(),'Second write requires the revision from the first confirmed write');
        const saved=f.state.events[0];assert.equal(new Date(saved.ends_at).toISOString(),'2026-10-23T23:00:00.000Z');
        assert.deepEqual({...saved,ends_at:data.events[0].ends_at,updated_at:data.events[0].updated_at},data.events[0]);assert.equal(f.state.events.length,1);
        assert.deepEqual(f.state.event_people,data.event_people);assert.deepEqual(f.state.event_buildings,data.event_buildings);
        const tools=f.calls.filter(row=>row.arguments);assert.equal(tools.filter(row=>row.name==='read_map_events').length,2,'One initial read and exactly one model-chosen reread after correction');
        assert.equal(tools.filter(row=>row.name==='upsert_map_event').length,2);
        const writes=proposals.flat().filter(row=>row.name==='upsert_map_event');assert.equal(writes.length,2);assert(writes.every(row=>row.arguments.event.id===ids.event));
        assert.equal(records.filter(row=>row.type==='tool'&&row.name==='upsert_map_event'&&row.status==='completed').length,2);
      }else{
        assert.equal(f.attempts.length,0);assert.deepEqual(f.state,data);assert(!proposals.flat().some(row=>row.name==='upsert_map_event'));
        assert.equal(records.filter(row=>row.type==='reset').length,1);assert(/23:00|11(?::00)?\s*p\.?m\.?\s*UTC/i.test(answer.text),'Correct UTC equivalent of 7 PM New York');
        assert(!/\b8(?::00)?\s*p\.?m\.?|\b00:00\b/i.test(answer.text),'Obsolete example must not survive reset');
      }
    },
  };
}
export function selfCheckProvider(s){
  let round=0,answers=0;
  return {async toolTurn(){
    if(s.name===caseNames[1])return {text:'',toolCalls:[]};
    const steps=[{name:'read_map_events',arguments:{}},{name:'upsert_map_event',arguments:args('2026-10-23T20:00:00')},{name:'read_map_events',arguments:{}},{name:'upsert_map_event',arguments:args('2026-10-23T19:00:00')}];
    function args(end){const value=currentUpdate(s.f.state);delete value.event.ends_at;value.event.ends_local=end;return value;}
    const call=steps[round++];return {text:'',toolCalls:call?[{...call,id:`offline-${round}`}]:[]};
  },async *stream(){yield ++answers===1&&s.name===caseNames[1]?'Original 8 PM example':'7 PM New York is 23:00 UTC on October 23, 2026.';}};
}
