import test from 'node:test';
import assert from 'node:assert/strict';
import {createChatSteeringRegistry} from '../server/chat/steering.js';
import {createChatRunner} from '../server/chat/runner.js';
import {createAttioTools} from '../tools/attio/index.js';
import {createFixture,deferred,until,principal,origin} from './fixtures/chat-steering.mjs';
const call=(id,action)=>({id,name:'fixture_action',arguments:{action}});
const turn=(...toolCalls)=>({text:'',toolCalls});
test('registry binds input to one authorized conversation, reserves limits and applies an idempotent message once',()=>{
  const registry=createChatSteeringRegistry({maxRuns:1}),entry=registry.create({principal,origin,messages:[{role:'user',content:'First'}]}),events=[];
  entry.bind(event=>events.push(event));
  const input={principal,origin,token:entry.steeringToken,body:{messageId:'queued-1',text:'Correct to 7 PM'}};
  for(const changed of [{token:'b'.repeat(43)},{origin:'http://other.test'},{principal:{...principal,id:'other'}},{principal:{...principal,allowedSourceIds:[]}}])assert.equal(registry.enqueue(entry.runId,{...input,...changed}).httpStatus,403);
  assert.equal(registry.enqueue('unknown',input).httpStatus,409);
  assert.equal(registry.enqueue(entry.runId,{...input,body:{...input.body,actor:'spoof'}}).httpStatus,400);
  assert.equal(registry.enqueue(entry.runId,input).httpStatus,202);
  assert.equal(registry.enqueue(entry.runId,input).applied,false);
  assert.equal(events.length,1);assert.equal(entry.closeIfEmpty(),false);
  const pending=entry.drain();assert.equal(pending.length,1);entry.applied(pending[0]);
  assert.equal(registry.enqueue(entry.runId,input).applied,true);assert.equal(entry.drain().length,0);
  assert.deepEqual(events.map(event=>event.status),['accepted','applied']);
  assert.equal(registry.enqueue(entry.runId,{...input,body:{...input.body,text:'Different'}}).httpStatus,409);
  assert.equal(registry.create({principal,origin,messages:[]}),null);
  assert.equal(entry.closeIfEmpty(),true);assert.equal(registry.enqueue(entry.runId,input).httpStatus,409);entry.finish();
  for(const messages of [Array.from({length:20},()=>({role:'user',content:'x'})),[{role:'user',content:'x'.repeat(8000)},{role:'user',content:'x'.repeat(8000)}],[{role:'user',content:'漢'.repeat(7999)}]]){
    const next=registry.create({principal,origin,messages});
    const text=messages[0].content.startsWith('漢')?'漢'.repeat(3000):'x';
    assert.equal(registry.enqueue(next.runId,{...input,token:next.steeringToken,body:{messageId:'limit',text}}).httpStatus,413);next.finish();
  }
});
test('actual route and native runner finish inflight action, suppress obsolete tail and preserve same-run receipt/history',async()=>{
  const inflight=deferred(),release=deferred();let rounds=0;
  const f=createFixture({provider:{async toolTurn(){return ++rounds===1?turn(call('first','first-write'),call('old-tail','obsolete-write')):rounds===2?turn(call('corrected','latest-write')):turn();},async *stream(){yield 'Updated 7 PM';}},
    async execute({arguments:args}){if(args.action==='first-write'){inflight.resolve();await release.promise;}return {status:'ready',sources:[],saved:args.action};}});
  const run=await f.start();await inflight.promise;
  for(const headers of [{'x-fixture-owner':'other'},{'x-fixture-owner':'scope-changed'},{'x-fixture-owner':'revoked'},{origin:'http://evil.test'},{'sec-fetch-site':'cross-site'},{'x-flock-steering-token':'z'.repeat(43)}])assert([401,403].includes((await run.steer('Correction',{headers})).status));
  const accepted=await run.steer('Actually end at 7 PM');assert.equal(accepted.status,202);
  assert.equal(run.records.filter(event=>event.type==='steering'&&event.status==='applied').length,0,'acceptance while an adapter is inflight is not consumption');
  assert.equal((await run.steer('Actually end at 7 PM')).status,202);
  assert.equal((await run.steer('Different text')).status,409);
  release.resolve();await run.closed;
  assert.deepEqual(f.dispatches.map(input=>input.arguments.action),['first-write','latest-write']);
  assert.equal(f.contexts.filter(context=>context.principal).length,1,'one adapter request closure owns both writes');
  const replanned=f.plans[1].messages;
  assert.equal(replanned.filter(message=>message.role==='user'&&message.content==='Actually end at 7 PM').length,1);
  const receipts=replanned.filter(message=>message.role==='tool').map(message=>[message.toolCallId,JSON.parse(message.content).status]);
  assert.deepEqual(receipts,[['first','ready'],['old-tail','superseded']]);
  assert.deepEqual(run.records.filter(event=>event.type==='tool'&&event.status==='running').map(event=>event.id),['tool-1','tool-2']);
  assert.deepEqual(run.records.filter(event=>event.type==='steering').map(event=>event.status),['accepted','applied']);
  assert.equal(new Set(f.audit.map(event=>event.context.runId)).size,1);assert.equal(f.audit[0].context.runId,run.run.runId);
  assert.equal(run.records.filter(event=>event.type==='done').length,1);
  assert.equal((await run.steer('Too late',{messageId:'late'})).status,409);
});
for(const boundary of ['model','audit'])test(`steering received during ${boundary} wait supersedes proposed action before dispatch`,async()=>{
  const waiting=deferred(),release=deferred();let rounds=0;
  const f=createFixture({provider:{async toolTurn(){rounds++;if(rounds===1){if(boundary==='model'){waiting.resolve();await release.promise;}return turn(call('old','obsolete'));}return rounds===2?turn(call('new','latest')):turn();},async *stream(){yield 'Latest';}},
    async auditHook(event){if(boundary==='audit'&&event.kind==='tool_started'&&event.tool==='fixture_action'&&event.counts.sequence===1){waiting.resolve();await release.promise;}}});
  const run=await f.start();await waiting.promise;assert.equal((await run.steer('New instructions')).status,202);release.resolve();await run.closed;
  assert.deepEqual(f.dispatches.map(input=>input.arguments.action),['latest']);
  assert.equal(f.plans[1].messages.at(-1).content,'New instructions');
  assert.equal(run.records.filter(event=>event.type==='steering'&&event.status==='applied').length,1);
  assert.equal(run.records.at(-1).type,'done');
});
test('answer steering aborts only obsolete child, resets partial answer and keeps completed tools',async()=>{
  let plans=0,answers=0;const firstAborted=deferred(),partial=deferred();
  const f=createFixture({provider:{async toolTurn(){return ++plans===1?turn(call('read','read')):turn();},
    stream({signal,messages}){answers++;if(answers>1)return (async function*(){assert.equal(messages.at(-1).content,'Explain only the change');yield 'Fresh answer';})();
      let stage=0;return {[Symbol.asyncIterator](){return this;},async next(){if(stage++===0){partial.resolve();return {done:false,value:'Obsolete answer'};}return new Promise((resolve,reject)=>signal.addEventListener('abort',()=>{firstAborted.resolve();reject(new DOMException('Stopped','AbortError'));},{once:true}));},return(){return Promise.resolve({done:true});}};
    }}});
  const run=await f.start();await partial.promise;await until(()=>run.records.some(event=>event.type==='delta'),'partial answer');
  assert.equal((await run.steer('Explain only the change')).status,202);await run.closed;await firstAborted.promise;
  assert.equal(answers,2);assert.equal(f.dispatches.length,1,'completed tools are not replayed');
  assert.equal(run.records.filter(event=>event.type==='reset').length,1);
  let final='';for(const event of run.records){if(event.type==='reset')final='';if(event.type==='delta')final+=event.text;}
  assert.equal(final,'Fresh answer');assert.equal(run.records.at(-1).type,'done');
  assert.equal(f.streams[0].signal.aborted,true);assert.equal(run.abort.signal.aborted,false);
});
test('accepted input cannot survive cancellation as a later hidden run or applied acknowledgement',async()=>{
  const waiting=deferred();
  const f=createFixture({provider:{async toolTurn(){return turn(call('blocked','blocked'));},async *stream(){yield 'Unexpected';}},
    execute(){waiting.resolve();return new Promise(()=>{});}});
  const run=await f.start();await waiting.promise;assert.equal((await run.steer('Pending correction')).status,202);
  run.abort.abort();await run.cancel();await run.closed;await until(()=>f.audit.some(event=>event.kind==='run_finished'),'cancelled run cleanup');
  assert.equal(run.records.some(event=>event.type==='steering'&&event.status==='applied'),false);
  assert.equal(f.audit.at(-1).status,'aborted','Disconnect finishes execution without trying to write to the closed response');
  assert.equal((await run.steer('Too late',{messageId:'late'})).status,409);assert.equal(f.dispatches.length,1);
});
test('releasing a tool audit after terminal cancellation cannot apply pending text or emit late execution events',async()=>{
  const auditStarted=deferred(),releaseAudit=deferred(),records=[],dispatches=[],modelCalls=[],audit=[];
  const registry=createChatSteeringRegistry(),steering=registry.create({principal,origin,messages:[{role:'user',content:'Initial request'}]});
  const controller=new AbortController();
  const runner=createChatRunner({config:{configured:true,provider:'openai-compatible',timeoutMs:5000,retrievalToolsEnabled:true},
    provider:{async toolTurn(){modelCalls.push('tools');return turn(call('old','obsolete'));},async *stream(){modelCalls.push('answer');yield 'Must never start';}},
    mapTools:{tools:[{name:'fixture_action'}],async execute(input){dispatches.push(input);return {status:'ready',sources:[]};}},
    audit:{async recordEvent(event){audit.push(event);if(event.kind==='tool_started'){auditStarted.resolve();await releaseAudit.promise;}}}});
  const done=runner.run({conversation:{messages:[{role:'user',content:'Initial request'}],timeZone:'America/New_York'},principal,steering,signal:controller.signal,onRecord:event=>records.push(event)});
  await auditStarted.promise;
  assert.equal(registry.enqueue(steering.runId,{principal,origin,token:steering.steeringToken,body:{messageId:'late-audit',text:'New correction'}}).httpStatus,202);
  controller.abort();assert.equal((await done).status,'aborted');assert.equal(records.at(-1).type,'error');assert.equal(records.at(-1).code,'aborted');
  const terminalRecords=structuredClone(records),terminalModels=[...modelCalls];releaseAudit.resolve();
  // Audit release resumes abandoned retrieval on later promise jobs. Drain those
  // jobs before asserting the terminal stream stayed terminal.
  await new Promise(resolve=>setImmediate(resolve));await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(records,terminalRecords,'No applied/tool/delta/done event may follow the terminal error');assert.deepEqual(modelCalls,terminalModels);
  assert.equal(dispatches.length,0);assert.equal(records.some(event=>event.type==='steering'&&event.status==='applied'),false);
  assert.equal(registry.enqueue(steering.runId,{principal,origin,token:steering.steeringToken,body:{messageId:'new',text:'After close'}}).httpStatus,409);
});
test('steering keeps cumulative tool budget and IDs rather than granting a fresh execution allowance',async()=>{
  let rounds=0,answers=0;const partial=deferred();
  const f=createFixture({provider:{async toolTurn(){rounds++;return rounds<=14?turn(call(`r${rounds}-a`,`r${rounds}-a`),call(`r${rounds}-b`,`r${rounds}-b`)):rounds===15?turn(call('r15','r15')):rounds===16?turn():turn(call('last','last'),call('over-limit','over-limit'));},
    stream({signal}){if(++answers>1)return (async function*(){yield 'Cumulative limit retained';})();return (async function*(){yield 'Intermediate';partial.resolve();await new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('Stopped','AbortError')),{once:true}));})();}}});
  const run=await f.start();await partial.promise;assert.equal(f.dispatches.length,29);assert.equal((await run.steer('One more request')).status,202);await run.closed;
  assert.equal(f.dispatches.length,30);assert.equal(f.dispatches.at(-1).arguments.action,'last');
  assert.deepEqual(run.records.filter(event=>event.type==='tool'&&event.status==='running').map(event=>event.id),Array.from({length:30},(_,index)=>`tool-${index+1}`));
  assert.equal(f.contexts.filter(context=>context.principal).length,1);assert.equal(run.records.at(-1).type,'done');
});
test('same-run First→Second→First edits reread real Attio adapter permits and apply fresh human intent',async()=>{
  const sourceId='00000000-0000-4000-8000-000000000010',recordId='00000000-0000-4000-8000-000000000011';
  const operations=[],record={object:'people',recordId,values:{name:[{value:'Original'}]}};
  const attioTools=createAttioTools({client:{configured:true,sourceId,allowedObjects:['people'],writesEnabled:true,
    async readRecord(){operations.push('read');return {status:'ready',record:structuredClone(record)};},
    async updateRecord(args){operations.push(args.values.name[0].value);record.values={...record.values,...args.values};return {status:'ready',record:structuredClone(record)};}}});
  const partial=[deferred(),deferred()];let rounds=0,answers=0;
  const read=id=>({id,name:'read_attio_record',arguments:{object:'people',recordId}});
  const write=(id,name)=>({id,name:'update_attio_record',arguments:{object:'people',recordId,values:{name:[{value:name}]}}});
  const f=createFixture({attioTools,authPrincipal:{...principal,allowedSourceIds:[sourceId]},provider:{
    async toolTurn(){return [turn(read('read-1')),turn(write('write-1','First')),turn(),turn(read('read-2')),turn(write('write-2','Second')),turn(),turn(read('read-3')),turn(write('write-3','First')),turn()][rounds++]??turn();},
    stream({signal}){const index=answers++;if(index>1)return (async function*(){yield 'Changed back to First';})();return (async function*(){yield 'Intermediate result';partial[index].resolve();await new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('Stopped','AbortError')),{once:true}));})();},
  }});
  const run=await f.start();await partial[0].promise;assert.equal((await run.steer('Change the same person to Second')).status,202);
  await partial[1].promise;assert.equal((await run.steer('Change the same person back to First',{messageId:'queued-2'})).status,202);await run.closed;
  assert.deepEqual(operations,['read','First','read','Second','read','First']);assert.equal(record.values.name[0].value,'First');
  assert.equal(run.records.filter(event=>event.type==='tool'&&event.name==='update_attio_record'&&event.status==='completed').length,3);
  assert.equal(run.records.at(-1).type,'done');
});
test('steering cannot replay an Attio creation or clear the same adapter’s unknown-write protection',async()=>{
  for(const mode of ['create','unknown']){
    const sourceId='00000000-0000-4000-8000-000000000010',recordId='00000000-0000-4000-8000-000000000011',operations=[],partial=deferred();
    const record={object:'people',recordId,values:{name:[{value:'First'}]}},args={object:'people',values:record.values};
    const attioTools=createAttioTools({client:{configured:true,sourceId,allowedObjects:['people'],writesEnabled:true,
      async readRecord(){operations.push('read');return {status:'ready',record};},async createRecord(){operations.push('create');return {status:'ready',record};},
      async updateRecord(){operations.push('unknown-write');return {status:'unavailable',reason:'write_outcome_unknown'};}}});
    let rounds=0,answers=0;
    const read=id=>({id,name:'read_attio_record',arguments:{object:'people',recordId}}),write=(id,values)=>({id,name:'update_attio_record',arguments:{object:'people',recordId,values}}),create=id=>({id,name:'create_attio_record',arguments:args});
    const batches=mode==='create'?[turn(create('create-1')),turn(),turn(create('create-2')),turn()]:[turn(read('read-1')),turn(write('write-1',record.values)),turn(),turn(read('read-2')),turn(write('write-2',{name:[{value:'Second'}]})),turn()];
    const f=createFixture({attioTools,authPrincipal:{...principal,allowedSourceIds:[sourceId]},provider:{async toolTurn(){return batches[rounds++]??turn();},
      stream({signal}){if(++answers>1)return (async function*(){yield mode==='unknown'?'Could not confirm saving.':'Existing creation retained.';})();return (async function*(){yield 'Intermediate';partial.resolve();await new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('Stopped','AbortError')),{once:true}));})();}}});
    const run=await f.start();await partial.promise;assert.equal((await run.steer(mode==='create'?'Please create that same requested person.':'Change the name to Second.')).status,202);await run.closed;
    assert.deepEqual(operations,mode==='create'?['create']:['read','unknown-write','read']);
    assert.equal(run.records.at(-1).type,'done');
  }
});
