import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createStagedPipeline} from '../server/automation/staged-pipeline.js';
import {createBoundedResults} from '../server/automation/bounded-result.js';
import {canonicalJson} from '../server/automation/validation.js';
import {taskCatalogue} from './fixtures/planner-followup.mjs';

const copy=value=>structuredClone(value),size=value=>Buffer.byteLength(JSON.stringify(value));
function fixture({history=[{content:'History🙂漢字 '.repeat(9000)}],count=1}={}){
 let clock=Date.parse('2026-10-25T20:00:00.000Z'),version=0,allowed=true,log=[],failSave=false;
 const source=randomUUID(),principal={id:'history-page-worker',allowedSourceIds:[source]},stamp=new Date(clock-3600000).toISOString();
 const input=n=>({uuid:randomUUID(),raw_response:{source:'discord',source_id:source,event_type:'message_created',event_id:String(300+n),revision:'1',received_at:stamp,payload:{guild_id:'100',channel_id:'200',id:String(300+n),author:{id:'400'},content:'Exact original '+n,timestamp:stamp}}});
 const originals=Array.from({length:count},(_,i)=>input(i)),fresh=input(99);
 const rows=new Map(originals.map(original=>{const row={uuid:randomUUID(),created_at:stamp,updated_at:stamp,expires_at:new Date(clock+20*3600000).toISOString(),info:{version:1,sourceIds:[source],references:[],inputs:[original],request:{operation:'source_review',summary:'Inspect the exact original; do not invent an action'},batchContext:{},executionHistory:copy(history)}};return[row.uuid,row];}));
 const calls=[];
 const visible=row=>allowed&&row.info.sourceIds.every(id=>principal.allowedSourceIds.includes(id))&&Date.parse(row.expires_at)>clock;
 const store={configured:true,
  catalogue:async()=>({status:'ready',tasks:[...rows.values()].filter(visible).map(taskCatalogue)}),
  read:async({taskId})=>{calls.push({method:'read',taskId});const row=rows.get(taskId);return row&&visible(row)?{status:'ready',task:copy(row)}:{status:'not_found'};},
  save:async args=>{calls.push({method:'save',taskId:args.task.uuid});if(failSave)return{status:'invalid_request'};const prior=rows.get(args.task.uuid);if(prior&&prior.updated_at!==args.expectedUpdatedAt)return{status:'conflict'};const row={...copy(args.task),created_at:prior?.created_at??stamp,updated_at:new Date(clock+ ++version).toISOString(),expires_at:prior?.expires_at??new Date(clock+3600000).toISOString()};rows.set(row.uuid,row);return{status:'ready',task:copy(row)};},
  resolve:async({taskId,expectedUpdatedAt})=>{calls.push({method:'resolve',taskId});const row=rows.get(taskId);if(!row||row.updated_at!==expectedUpdatedAt)return{status:'conflict'};rows.delete(taskId);return{status:'ready'};}};
 const staged=createStagedPipeline({taskStore:store,principal,bindTask:async()=>{},verifyResolution:async()=>true,getAllowedSourceIds:()=>allowed?[source]:[],fragments:createBoundedResults(),now:()=>new Date(clock)});
 const execute=(name,args,id=args.taskId)=>staged.tools.find(row=>row.name===name).execute(args,{principal,inputIds:[id]});
 return {rows,originals,fresh,source,principal,calls,staged,execute,
  async enter(inputs=[fresh]){log=[];await staged.pipeline.beginCycle({leaseToken:randomUUID(),inputs:copy(inputs),recordExecution:async row=>log.push(copy(row)),getExecutionLog:()=>copy(log)});return staged.pipeline.afterInitial({inputs:copy(inputs),handledInputIds:inputs.map(row=>row.uuid),executionLog:[]});},
  historyRead(id,args={}){return execute('read_pending_task',{taskId:id,detail:'history',...args});},
  finish(){return staged.pipeline.finishCycle({executionLog:copy(log)});},push(row){log.push(copy(row));},
  advance(ms){clock+=ms;},setSaveFailure(value){failSave=value;},revoke(){allowed=false;},cleanup(){staged.cleanup();}};
}

test('history pages reconstruct exact Unicode history within byte/character limits and fence task versions',async()=>{
 const f=fixture(),id=[...f.rows.keys()][0];await f.enter();
 const before=copy(f.rows.get(id)),serialized=canonicalJson(before.info.executionHistory),parts=[];let offset=0,version;
 for(let pageNumber=0;pageNumber<100;pageNumber++){
  const result=await f.historyRead(id,{historyOffset:offset,...(version?{expectedUpdatedAt:version}:{})});assert.equal(result.status,'ready');
  const page=result.historyPage;assert.equal(page.encoding,'json-history-page');assert.equal(page.taskId,id);assert.equal(page.offset,offset);assert.equal(page.totalChars,serialized.length);assert(page.data.length<=12000);assert(size(result)<=16384);
  assert(!/^[\uDC00-\uDFFF]/.test(page.data));assert(!/[\uD800-\uDBFF]$/.test(page.data));
  version=page.updatedAt;parts.push(page.data);if(page.nextOffset===null)break;assert(page.nextOffset>offset);offset=page.nextOffset;
 }
 assert.equal(parts.join(''),serialized);assert.deepEqual(JSON.parse(parts.join('')),before.info.executionHistory);assert.deepEqual(f.rows.get(id),before,'Reading pages is read-only');
 assert.equal((await f.historyRead(id,{historyOffset:1})).status,'invalid_request');assert.equal((await f.historyRead(id,{historyOffset:-1})).status,'invalid_request');assert.equal((await f.historyRead(id,{historyOffset:serialized.length,expectedUpdatedAt:version})).status,'invalid_request');
 const lowSurrogate=serialized.search(/[\uDC00-\uDFFF]/);assert(lowSurrogate>0);assert.equal((await f.historyRead(id,{historyOffset:lowSurrogate,expectedUpdatedAt:version})).status,'invalid_request');
 f.rows.get(id).updated_at='2026-10-25T20:00:01.000Z';assert.equal((await f.historyRead(id,{historyOffset:offset,expectedUpdatedAt:version})).status,'conflict');
 assert.equal((await f.historyRead(id,{historyOffset:0,expectedUpdatedAt:version})).status,'conflict');f.revoke();assert.notEqual((await f.historyRead(id,{historyOffset:0})).status,'ready');
});

test('history pages and oversized full requests grant no action proof; compact proof survives optional history reads',async()=>{
 const f=fixture({history:[{content:'A complete historical observation. '.repeat(65000)}]}),id=[...f.rows.keys()][0];await f.enter();
 const before=copy(f.rows.get(id)),page=await f.historyRead(id);assert.equal(page.status,'ready');
 assert.notEqual((await f.execute('resolve_pending_task',{taskId:id,outcome:'completed'})).status,'ready','History page alone is not a task read/action receipt');
 const full=await f.execute('read_pending_task',{taskId:id,detail:'full'});assert.equal(full.status,'ready');assert.equal(full.reason,'history_pagination_required');assert.equal(full.historyPaginationRequired,true);assert.equal(full.historyPage.nextOffset,0);assert(!full.task);assert(!full.fragment);assert(size(full)<=16384);
 assert.notEqual((await f.execute('resolve_pending_task',{taskId:id,outcome:'completed'})).status,'ready');assert.deepEqual(f.rows.get(id),before);
 const compact=await f.execute('read_pending_task',{taskId:id});assert.equal(compact.status,'ready');assert.equal(compact.detail,'compact');assert.deepEqual(compact.task.info.inputs,before.info.inputs);
 assert.equal((await f.historyRead(id,{historyOffset:page.historyPage.nextOffset,expectedUpdatedAt:page.updated_at})).status,'ready');
 assert.equal((await f.execute('resolve_pending_task',{taskId:id,outcome:'completed'})).status,'ready','Optional history must not revoke the existing compact read receipt');assert(!f.rows.has(id));
});

test('whole-task pages preserve historical batch context, metadata and unknown legacy fields exactly',async()=>{
 const f=fixture({history:[{content:'Small retained history 🙂'}]}),id=[...f.rows.keys()][0],row=f.rows.get(id);
 row.info.batchContext={originalContext:[{speaker:'400',content:'Previously observed source fact 漢字'.repeat(1200)}],legacy:{keep:['a','b']}};
 row.info.unknownLegacyField={nested:'Keep this unsupported-but-saved fact exactly'};row.unknownRowField='Keep the saved row metadata too';
 await f.enter();const before=copy(row),parts=[];let offset=0,version;
 for(let n=0;n<100;n++){
  const result=await f.historyRead(id,{historySection:'task',historyOffset:offset,...(version?{expectedUpdatedAt:version}:{})});assert.equal(result.status,'ready');
  const page=result.historyPage;assert.equal(page.encoding,'json-task-page');assert.equal(page.section,'task');assert.equal(page.offset,offset);assert(page.data.length<=12000);assert(size(result)<=16384);parts.push(page.data);version=page.updatedAt;
  if(page.nextOffset===null)break;offset=page.nextOffset;
 }
 assert.equal(parts.join(''),canonicalJson(before));assert.deepEqual(JSON.parse(parts.join('')),before);assert.deepEqual(f.rows.get(id),before);
 assert.notEqual((await f.execute('resolve_pending_task',{taskId:id,outcome:'completed'})).status,'ready');
});

test('server-recognized history page bodies are not duplicated into newly saved execution history',async()=>{
 const f=fixture(),id=[...f.rows.keys()][0];await f.enter();assert.equal((await f.execute('read_pending_task',{taskId:id})).status,'ready');
 assert.equal((await f.execute('defer_task',{taskId:id,operation:'source_review',summary:'Progress retained with exact original and historical context'})).status,'ready');
 const result=await f.historyRead(id),page=result.historyPage;assert.equal(result.status,'ready');
 const whole=await f.historyRead(id,{historySection:'task'});assert.equal(whole.status,'ready');
 f.push({kind:'tool_result',tool:'read_pending_task',sequence:1,inputIds:[id],arguments:{taskId:id,detail:'history',historyOffset:0},result});
 f.push({kind:'tool_result',tool:'read_pending_task',sequence:2,inputIds:[id],arguments:{taskId:id,detail:'history',historySection:'task',historyOffset:0},result:whole});
 assert.equal((await f.finish()).status,'ready');const saved=f.rows.get(id),entries=saved.info.executionHistory.filter(row=>row.kind==='tool_result'&&row.tool==='read_pending_task');assert.equal(entries.length,2);for(const entry of entries)assert(!Object.hasOwn(entry.result.historyPage,'data'));assert.equal(entries[0].result.historyPage.dataChars,page.data.length);assert.equal(entries[1].result.historyPage.dataChars,whole.historyPage.data.length);assert.deepEqual(saved.info.inputs[0],f.originals[0]);
});

test('successful checkpoints briefly defer only attempted unchanged older tasks, with version/current-input/time escapes',async()=>{
 const f=fixture({count:2}),ids=[...f.rows.keys()];await f.enter();const untouched=copy(f.rows.get(ids[1]));
 assert.equal((await f.historyRead(ids[0])).status,'ready');assert.equal((await f.finish()).status,'ready');f.cleanup();
 let next=await f.enter();assert.equal(next.context.deferredTaskCount,1);assert(next.context.nextTaskRetryAt);assert(!next.inputIds.includes(ids[0]));assert(next.inputIds.includes(ids[1]));assert.deepEqual(f.rows.get(ids[1]),untouched);
 f.cleanup();next=await f.enter([f.originals[0]]);assert(next.inputIds.includes(ids[0]),'Current original work bypasses an old-task delay');
 assert.equal((await f.historyRead(ids[0])).status,'ready');assert.equal((await f.finish()).status,'ready');f.cleanup();next=await f.enter();assert(next.inputIds.includes(ids[0]),'A current-cycle task must not acquire old-task delay');
 assert.equal((await f.historyRead(ids[0])).status,'ready');assert.equal((await f.finish()).status,'ready');f.cleanup();f.rows.get(ids[0]).updated_at='2026-10-25T20:00:02.000Z';next=await f.enter();assert(next.inputIds.includes(ids[0]),'Changed versions become immediately eligible');
 assert.equal((await f.historyRead(ids[0])).status,'ready');assert.equal((await f.finish()).status,'ready');f.cleanup();f.advance(300001);next=await f.enter();assert.equal(next.context.deferredTaskCount,0);assert.equal(next.context.nextTaskRetryAt,null);assert(next.inputIds.includes(ids[0]));
});

test('failed checkpoints do not defer old work, and explicit current progress stays immediately eligible',async()=>{
 const f=fixture(),id=[...f.rows.keys()][0];await f.enter();assert.equal((await f.execute('read_pending_task',{taskId:id})).status,'ready');
 f.push({kind:'tool_result',tool:'read_discord_messages',sequence:1,inputIds:[id],arguments:{channelId:'200',messageId:'300'},result:{status:'ready',sources:[{sourceId:f.source,content:'New observation that must be saved first'}]}});
 f.setSaveFailure(true);assert.equal((await f.finish()).status,'invalid_request');f.cleanup();f.setSaveFailure(false);
 let next=await f.enter();assert.equal(next.context.deferredTaskCount,0);assert(next.inputIds.includes(id));assert.equal((await f.execute('read_pending_task',{taskId:id})).status,'ready');
 assert.equal((await f.execute('defer_task',{taskId:id,operation:'source_review',summary:'Explicit current progress'})).status,'ready');assert.equal((await f.finish()).status,'ready');f.cleanup();next=await f.enter();assert(next.inputIds.includes(id),'Touched old work must not be delayed as unchanged');
});
