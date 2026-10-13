import test from 'node:test';
import assert from 'node:assert/strict';
import {readDiscordSummaryConfig} from '../server/discord/summary-config.js';
import {SUMMARY_FIELDS} from '../server/discord/summary-provider.js';
import {discordSummaryChunks,runDiscordSummaries,runDiscordSummaryBackfill} from '../server/discord/summaries.js';
import {parseDiscordSummaryArgs,runDiscordSummaryCli} from '../server/discord/summary-cli.js';

const guildId='1203562091500404776',channelId='1203562091982622814',operationId='11111111-1111-4111-8111-111111111111';
const sourceId='22222222-2222-4222-8222-222222222222';
const channelName='Fixture #announcements';
const config=readDiscordSummaryConfig({LLM_PROVIDER:'openai-compatible',LLM_MODEL:'gpt-6-luna',LLM_API_KEY:'fixture-private',DISCORD_GUILD_ID:guildId});
const uid=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const finding=(ids,text='Fixture supported update.')=>Object.fromEntries(SUMMARY_FIELDS.map(field=>[field,field==='overview'?[{text,messageIds:ids.slice(0,1)}]:[]]));
function message(index,text='Original '+index,segmentSize=8000){
  const canonicalText=JSON.stringify({messageId:(1500000000000000000n+BigInt(index)).toString(),author:{id:'345678901234567890',name:'Fixture'},replyToMessageId:null,content:text});
  const points=Array.from(canonicalText),texts=[];
  for(let offset=0;offset<points.length;offset+=segmentSize)texts.push(points.slice(offset,offset+segmentSize).join(''));
  const messageId=(1500000000000000000n+BigInt(index)).toString();
  return {messageId,inputId:messageId,kind:'raw',representedMessageCount:1,citationMessageIds:[messageId],guildId,channelId,channelName,createdAt:new Date(Date.parse('2026-10-01T12:00:00Z')+index*1000).toISOString(),
    canonicalText,segments:texts.map((text,segmentIndex)=>({segmentIndex,segmentCount:texts.length,text}))};
}
function fixture({messages=[message(1),message(2),message(3)],jobCount=1,pageSize=2,configOverrides={},summaryText='Fixture supported update.'}={}){
  const cfg={...config,concurrency:1,...configOverrides},jobs=Array.from({length:jobCount},(_,index)=>({
    jobId:uid(index+1),sourceId,guildId,channelId,channelName,tier:'weekly',periodStart:'2026-10-01T04:00:00Z',periodEnd:'2026-10-05T04:00:00Z',
    inputRecordCount:messages.length,representedMessageCount:messages.reduce((sum,m)=>sum+m.representedMessageCount,0),segmentCount:messages.reduce((sum,m)=>sum+m.segments.length,0),inputFingerprint:'f'.repeat(64),leaseToken:uid(index+100),status:'pending',parts:[],
  })),requests=new Map(),calls=[],modelCalls=[],finishes=[],failures=[];
  let begun=0,failFinish=false,reorder=false;
  const cost=()=>[...requests.values()].reduce((sum,r)=>sum+(r.status==='succeeded'?r.usage.costUsd:r.maxCostUsd),0);
  const store={configured:true,
    async getPendingOperation(){calls.push('pending');return {status:'empty'};},
    async preview(){calls.push('preview');return {status:'ready',preview:{policyRevision:3}};},
    async beginOperation(args){calls.push('begin');begun++;assert.equal(args.expectedPolicyRevision,3);return {status:'ready',operationId};},
    async getOperation(){return {status:'ready',operation:{guildId,mode:'bootstrap',provider:cfg.provider,model:cfg.model,promptVersion:cfg.promptVersion,totalJobs:jobs.length,succeeded:jobs.filter(j=>j.status==='succeeded').length,requests:requests.size,costUsd:cost()}};},
    async claimJob(){calls.push('claim');const job=jobs.find(j=>['pending','failed'].includes(j.status));if(!job)return {status:jobs.every(j=>j.status==='succeeded')?'complete':'empty'};job.status='running';return {status:'ready',job};},
    async getInputs({jobId,after}){calls.push('inputs');const start=after??0,end=start+pageSize;return {status:'ready',records:messages.slice(start,end),nextCursor:end,done:end>=messages.length};},
    async getParts({jobId}){const parts=jobs.find(j=>j.jobId===jobId).parts;return {status:'ready',parts:parts.map(p=>reorder?{...p,summary:Object.fromEntries(Object.entries(p.summary).reverse())}:p)};},
    async renewJob(){return {status:'ready'};},
    async reserveRequest(args){if(cost()+args.maxCostUsd>cfg.maxOperationCostUsd||requests.size>=cfg.maxOperationRequests)return {status:'budget_exhausted'};requests.set(args.reservationId,{...args,status:'reserved'});return {status:'ready',dispatchAllowed:true};},
    async commitUsage({reservationId,status,usage}){const reservation=requests.get(reservationId);assert(reservation);Object.assign(reservation,{status,usage});return {status:'ready'};},
    async savePart({jobId,part}){assert.equal(requests.get(part.reservationId)?.status,'succeeded');jobs.find(j=>j.jobId===jobId).parts.push(part);return {status:'ready'};},
    async finishJob(args){finishes.push(args);if(failFinish)return {status:'source_changed'};jobs.find(j=>j.jobId===args.jobId).status='succeeded';return {status:'ready'};},
    async failJob(args){failures.push(args);jobs.find(j=>j.jobId===args.jobId).status='failed';return {status:'ready'};},
  };
  const provider={configured:true,async summarize(args){
    modelCalls.push(args);const reservation=await args.beforeDispatch({inputTokens:100,outputTokens:50,maxCostUsd:0.000035});
    if(reservation.status!=='ready')return reservation;
    const usage={inputTokens:100,outputTokens:50,cachedInputTokens:0,costUsd:0.000035};
    const committed=await args.afterDispatch({reservation,status:'succeeded',usage});if(committed.status!=='ready')return {status:'usage_commit_failed'};
    return {status:'ready',summary:finding(args.allowedMessageIds,summaryText),usage,reservationId:reservation.reservationId};
  }};
  return {cfg,store,provider,jobs,messages,requests,calls,modelCalls,finishes,failures,run:options=>runDiscordSummaries({config:cfg,store,provider,mode:'bootstrap',asOf:'2026-10-12T12:00:00Z',...options}),begun:()=>begun,setFinishFailure:value=>{failFinish=value;},setReorder:value=>{reorder=value;}};
}
async function chunks(options){const output=[];for await(const chunk of discordSummaryChunks(options))output.push(chunk);return output;}

function planningFixture({total=3,cached=false,falseComplete=false}={}){
  const f=fixture(),state={cursor:0,total,complete:false};if(cached)f.jobs.forEach(job=>{job.status='succeeded';});
  const get=f.store.getOperation,claim=f.store.claimJob,reserve=f.store.reserveRequest;
  const operation=async()=>({...((await get()).operation),operationId,planningComplete:state.complete,planningCursor:state.cursor,planningTotal:state.total,complete:state.complete&&cached||falseComplete&&!state.complete});
  f.store.getOperation=async()=>({status:'ready',operation:await operation()});
  f.store.claimJob=async args=>{assert.equal(state.complete,true,'no job may be claimed before all queue units complete');return claim(args);};
  f.store.reserveRequest=async args=>{assert.equal(state.complete,true,'no paid reservation before full scope');return reserve(args);};
  f.store.prepareOperation=async args=>{f.calls.push('prepare');assert.equal(args.operationId,operationId);assert.equal(args.expectedCursor,state.cursor);state.cursor++;state.complete=state.cursor===state.total;return {status:'ready',operationId,operation:await operation(),plannedGroups:cached?0:1};};
  return {...f,state,operation};
}

test('sliced planning drains the full frozen queue before honoring false-complete totals, claiming or dispatching',async()=>{
  const f=planningFixture({total:3,falseComplete:true});const result=await f.run();assert.equal(result.status,'ready',JSON.stringify(result));assert.equal(result.planningSteps,3);assert.equal(result.plannedGroups,3);assert.equal(result.planningComplete,true);assert.equal(result.planningCursor,3);assert.equal(result.planningTotal,3);
  assert.equal(f.calls.filter(call=>call==='prepare').length,3);assert(f.calls.indexOf('claim')>f.calls.lastIndexOf('prepare'));assert.equal(f.begun(),1);assert.equal(result.groups,1);assert(result.requests>0);
});

test('planning-only cached progress survives runtime interruption/backfill resume without an extra operation or paid dispatch',async()=>{
  const original=AbortSignal.timeout,controllers=[];
  try{
    AbortSignal.timeout=()=>{const controller=new AbortController();controllers.push(controller);return controller.signal;};
    const f=planningFixture({total:2,cached:true}),prepare=f.store.prepareOperation;let interrupted=false;
    f.store.prepareOperation=async args=>{const result=await prepare(args);if(!interrupted){interrupted=true;controllers.at(-1).abort();}return result;};
    const result=await runDiscordSummaryBackfill({config:f.cfg,store:f.store,provider:{configured:true,summarize:async()=>{throw new Error('cached planning may not dispatch');}},mode:'bootstrap',asOf:'2026-10-12T12:00:00Z',maxRuns:2});
    assert.equal(result.status,'ready',JSON.stringify(result));assert.equal(result.complete,true);assert.equal(result.runs,2);assert.equal(result.plannedGroups,0);assert.equal(result.planningSteps,2);assert.equal(result.planningCursor,2);assert.equal(result.requests,0);assert.equal(f.requests.size,0);assert.equal(f.begun(),1);
  }finally{AbortSignal.timeout=original;}
});

test('caller abort while preparing preserves durable cursor with zero claims/reservations/models and resumes',async()=>{
  const f=planningFixture({total:2}),parent=new AbortController(),prepare=f.store.prepareOperation;let once=false;
  f.store.prepareOperation=async args=>{const result=await prepare(args);if(!once){once=true;parent.abort();}return result;};
  const first=await f.run({signal:parent.signal});assert.equal(first.status,'aborted');assert.equal(first.complete,false);assert.equal(first.planningCursor,1);assert.equal(first.requests,0);assert.equal(f.calls.includes('claim'),false);assert.equal(f.modelCalls.length,0);
  const resumed=await f.run({operationId});assert.equal(resumed.status,'ready');assert.equal(resumed.planningCursor,2);assert.equal(f.begun(),1);
});

test('concurrent cursor advancement reloads after CAS staleness; repeated stale/no-op progress stops before model spend',async()=>{
  const f=planningFixture({total:2}),prepare=f.store.prepareOperation;let concurrent=false;
  f.store.prepareOperation=async args=>{if(!concurrent){concurrent=true;f.state.cursor++;return {status:'stale'};}return prepare(args);};
  const result=await f.run();assert.equal(result.status,'ready');assert.equal(result.planningSteps,2);assert.equal(result.plannedGroups,1);
  for(const status of ['stale','ready']){
    const stuck=planningFixture({total:2});let calls=0;stuck.store.prepareOperation=async()=>{calls++;return status==='stale'?{status}:{status,operation:await stuck.operation(),plannedGroups:0};};
    const failed=await stuck.run();assert.equal(failed.status,'failed');assert.equal(failed.code,'stalled');assert(calls<=3);assert.equal(failed.requests,0);assert.equal(stuck.modelCalls.length,0);
  }
});

test('malformed planning identity/counters and an absent prepare API fail closed before any paid work',async()=>{
  for(const mutate of [op=>({...op,guildId:'999999999999999999'}),op=>({...op,operationId:uid(700)}),op=>({...op,planningComplete:null}),op=>({...op,planningCursor:-1}),op=>({...op,planningTotal:-1})]){
    const f=planningFixture();f.store.prepareOperation=async()=>({status:'ready',operation:mutate(await f.operation()),plannedGroups:0});const result=await f.run();assert.equal(result.status,'failed');assert.equal(result.requests,0);assert.equal(f.calls.includes('claim'),false);assert.equal(f.modelCalls.length,0);
  }
  const f=planningFixture();delete f.store.prepareOperation;const result=await f.run();assert.equal(result.status,'failed');assert.equal(result.requests,0);assert.equal(f.modelCalls.length,0);
});

test('charged stale plans replan the frozen operation with original caps before explicit/default/scheduled-outside-slot dispatch',async()=>{
 for(const entry of ['explicit','default','scheduled']){
  const f=planningFixture({total:2}),frozenAsOf='2026-10-12T12:00:00.000Z',dueIdentity='weekly:2026-10-12';let stale=true,replanned=false,begins=0;
  f.state.cursor=2;f.state.complete=true;f.requests.set(uid(900),{status:'succeeded',maxCostUsd:0.000035,usage:{costUsd:0.000035}});
  const originalOperation=f.operation;
  const operation=async()=>({...await originalOperation(),policyRevision:3,mode:'weekly',asOf:frozenAsOf,dueIdentity,planningStale:stale,complete:false,maxRequests:2,maxCostUsd:0.0001,allocatedUsd:0.000035});
  f.store.getOperation=async()=>({status:'ready',operation:await operation()});f.store.getPendingOperation=async()=>({status:'ready',operationId,operation:await operation()});
  f.store.beginOperation=async args=>{begins++;assert.equal(args.mode,'weekly');assert.equal(new Date(args.asOf).getTime(),new Date(frozenAsOf).getTime());assert.equal(args.dueIdentity,dueIdentity);assert.equal(args.maxRequests,2);assert.equal(args.maxCostUsd,0.0001);stale=false;replanned=true;f.state.cursor=0;f.state.complete=false;return{status:'ready',operationId,operation:await operation()};};
  const prepare=f.store.prepareOperation;f.store.prepareOperation=async args=>{assert.equal(replanned,true);const result=await prepare(args);return{...result,operation:await operation()};};
  const claim=f.store.claimJob;f.store.claimJob=async args=>{assert.equal(stale,false);assert.equal(replanned,true);assert.equal(f.state.cursor,2);return claim(args);};
  const result=await f.run(entry==='explicit'?{operationId,mode:'weekly'}:entry==='scheduled'?{mode:'scheduled',asOf:'2026-10-13T15:00:00Z'}:{mode:'weekly'});
  assert.equal(result.status,'ready',entry+' '+JSON.stringify(result));assert.equal(result.operationId,operationId);assert.equal(begins,1);assert.equal(result.planningSteps,2);assert.equal(result.requests,1);assert.equal(f.requests.size,2);assert.equal(f.modelCalls.length,1);
 }
});

test('paginated oversized Unicode/control canonical originals are packed completely without trimming or truncation',async()=>{
  const records=[message(1,'😀'.repeat(24000)),message(2,('\u0001\u001f"\\').repeat(12000)),message(3,'x'.repeat(80000))];
  const f=fixture({messages:records,pageSize:1}),job=f.jobs[0];
  const output=await chunks({store:f.store,job,maxInputBytes:49152});
  assert(output.length>3);assert(output.every(c=>Buffer.byteLength(JSON.stringify(c.input),'utf8')<=49152));
  const all=output.flatMap(c=>c.input.records);assert.equal(all.length,job.segmentCount);
  for(const original of records)assert.equal(all.filter(s=>s.inputId===original.inputId).map(s=>s.text).join(''),original.canonicalText);
  assert.equal(new Set(all.map(s=>s.inputId+':'+s.segmentIndex)).size,job.segmentCount);
  const result=await f.run();assert.equal(result.status,'ready');assert.equal(result.complete,true);
  assert.equal(f.finishes[0].coverage.inputRecordCount,3);assert.equal(f.finishes[0].coverage.representedMessageCount,3);assert.equal(f.finishes[0].coverage.segmentCount,job.segmentCount);
  assert.equal(f.modelCalls.filter(c=>c.stage==='map').flatMap(c=>c.input.records).length,job.segmentCount);
  assert(f.modelCalls.every(c=>Buffer.byteLength(JSON.stringify(c.input),'utf8')<=49152));
  for(const citation of f.finishes[0].summary.citations)assert.equal(citation.url,'https://discord.com/channels/'+guildId+'/'+channelId+'/'+citation.messageId);
});

test('complete-input coverage rejects stalled pages, duplicate/missing segments and foreign source records',async t=>{
  for(const [name,mutate,code] of [
    ['empty unfinished page',()=>({status:'ready',messages:[],nextCursor:1,done:false}),'stalled'],
    ['repeated cursor',()=>({status:'ready',messages:[message(1)],nextCursor:0,done:false}),'coverage_failed'],
    ['missing segment',()=>({status:'ready',messages:[{...message(1),segments:[{segmentIndex:1,segmentCount:1,text:'bad'}]}],done:true}),'coverage_failed'],
    ['foreign channel',()=>({status:'ready',messages:[{...message(1),channelId:'999999999999999999'}],done:true}),'coverage_failed'],
    ['count mismatch',()=>({status:'ready',messages:[message(1)],done:true}),'coverage_failed'],
  ])await t.test(name,async()=>{const f=fixture();f.store.getInputs=async()=>mutate();await assert.rejects(chunks({store:f.store,job:f.jobs[0]}),error=>error.code===code);});
});

test('bounded recursive reduction consumes all mapped segments and never crosses source citations',async()=>{
  const f=fixture({messages:Array.from({length:30},(_,i)=>message(i+1,'x'.repeat(700))),configOverrides:{maxInputBytes:2200},summaryText:'S'.repeat(650)});
  const result=await f.run();assert.equal(result.status,'ready');assert.equal(result.complete,true);
  assert(f.modelCalls.filter(c=>c.stage==='reduce').length>=2);
  assert(f.modelCalls.every(c=>Buffer.byteLength(JSON.stringify(c.input),'utf8')<=2200));
  const mapped=f.jobs[0].parts.filter(p=>p.stage==='map').flatMap(p=>p.coverage);
  assert.equal(mapped.length,30);assert.equal(new Set(mapped.map(c=>c.inputId+':'+c.segmentIndex)).size,30);
  assert(f.jobs[0].parts.filter(p=>p.stage==='reduce').every(p=>p.childParts.length>=2));
});

test('tiny reducer outputs obey the64-child SQL provenance limit and retain every map across cached finalization',async()=>{
  const f=fixture({messages:Array.from({length:65},(_,i)=>message(i+1,'😀'.repeat(7000))),configOverrides:{maxInputBytes:49152}});
  const save=f.store.savePart;f.store.savePart=async args=>args.part.stage==='reduce'&&args.part.childParts.length>64?{status:'invalid_request'}:save(args);
  f.setFinishFailure(true);const first=await f.run();assert.equal(first.status,'failed');
  assert.equal(f.jobs[0].parts.filter(p=>p.stage==='map').length,65);assert.equal(f.jobs[0].parts.filter(p=>p.stage==='reduce').length,2);
  assert(f.jobs[0].parts.filter(p=>p.stage==='reduce').every(p=>p.childParts.length<=64));
  const dispatches=f.requests.size;f.setFinishFailure(false);f.setReorder(true);
  const second=await f.run({operationId});assert.equal(second.status,'ready',JSON.stringify(second));assert.equal(second.requests,0);assert.equal(f.requests.size,dispatches);assert.equal(f.finishes.at(-1).coverage.mapPartCount,65);
});

test('more than512 distinct original citations create bounded extra reduction layers without clipping coverage and resume cached stages',async()=>{
 const records=Array.from({length:65},(_,index)=>{
  const inputId='summary:'+uid(1000+index),ids=Array.from({length:12},(_,offset)=>String(1700000000000000000n+BigInt(index*12+offset))),canonicalText=JSON.stringify({inputId,kind:'verified_summary',retainedText:'x'.repeat(25000),originalCitationIds:ids});
  return{inputId,kind:'verified_summary',guildId,channelId,channelName,createdAt:'2026-10-01T04:00:00Z',representedMessageCount:12,citationMessageIds:ids,canonicalText,segments:[{segmentIndex:0,segmentCount:1,text:canonicalText}],certificate:{verified:true,sourceId,representedMessageCount:12,inputFingerprint:'c'.repeat(64),coverageDigest:'d'.repeat(64),rangeStart:'2026-10-01T04:00:00Z',rangeEnd:'2026-10-01T11:00:00Z'}};
 });
 const f=fixture({messages:records,pageSize:1,configOverrides:{maxInputBytes:49152}}),emitted=[],provider={configured:true,async summarize(args){
  const unique=new Set(args.allowedMessageIds);assert.equal(unique.size,args.allowedMessageIds.length);assert(unique.size<=512,'no dispatched map/reduce may exceed shared enum bound');assert(Buffer.byteLength(JSON.stringify(args.input),'utf8')<=49152);assert(args.allowedMessageIds.every(value=>/^[0-9]{1,20}$/.test(value)));emitted.push(args);
  const reservation=await args.beforeDispatch({inputTokens:100,outputTokens:50,maxCostUsd:0.000035});if(reservation.status!=='ready')return reservation;const usage={inputTokens:100,outputTokens:50,cachedInputTokens:0,costUsd:0.000035};assert.equal((await args.afterDispatch({reservation,status:'succeeded',usage})).status,'ready');
  const result=Object.fromEntries(SUMMARY_FIELDS.map(field=>[field,field==='overview'?[{text:'Supported retained fixture facts.',messageIds:args.allowedMessageIds.slice(0,12)}]:[]]));return{status:'ready',summary:result,usage,reservationId:reservation.reservationId};
 }};
 const save=f.store.savePart;f.store.savePart=async args=>{if(args.part.stage==='reduce'){assert(args.part.childParts.length<=64);assert(args.part.childParts.length>=2);}return save(args);};
 const partial=await f.run({provider,maxRequests:66});assert.equal(partial.status,'partial',JSON.stringify(partial));assert.equal(partial.requests,66);assert.equal(partial.mapParts,65);assert.equal(partial.reduceParts,1);assert.equal(f.finishes.length,0);
 const maps=f.jobs[0].parts.filter(part=>part.stage==='map');assert.equal(maps.length,65);const coverage=maps.flatMap(part=>part.coverage);assert.equal(coverage.length,65);assert.equal(new Set(coverage.map(item=>item.inputId+':'+item.segmentIndex)).size,65);assert.deepEqual(new Set(coverage.map(item=>item.inputId)),new Set(records.map(item=>item.inputId)));
 const first=f.jobs[0].parts.find(part=>part.stage==='reduce');assert.equal(first.childParts.length,42,'512 bound, rather than64 refs or48KiB, limits first batch');
 const getParts=f.store.getParts;f.store.getParts=async args=>{const result=await getParts(args);return{...result,parts:result.parts.map(part=>({...part,summary:Object.fromEntries(Object.entries(part.summary).reverse()),childParts:[...part.childParts].reverse(),coverage:[...part.coverage].reverse()}))};};
 f.setFinishFailure(true);const second=await f.run({operationId,provider});assert.equal(second.status,'failed');assert.equal(second.requests,2);assert.equal(second.cachedParts,66);const reducers=f.jobs[0].parts.filter(part=>part.stage==='reduce');assert.equal(reducers.length,3);const mapParents=reducers.filter(part=>part.childParts.every(child=>child.stage==='map'));assert.deepEqual(mapParents.map(part=>part.childParts.length),[42,23]);assert.deepEqual(new Set(mapParents.flatMap(part=>part.childParts.map(child=>child.ordinal))),new Set(Array.from({length:65},(_,index)=>index)));assert.equal(reducers.at(-1).childParts.length,2);
 const firstLayerCalls=emitted.filter(args=>args.stage==='reduce'&&args.allowedMessageIds.length>24);const suppliedIds=new Set(firstLayerCalls.flatMap(args=>args.allowedMessageIds));assert.deepEqual(suppliedIds,new Set(records.flatMap(record=>record.citationMessageIds)),'all780 original IDs reach their reducer; none are clipped from packing');
 const dispatches=f.requests.size;assert.equal(dispatches,68);f.setFinishFailure(false);const cached=await f.run({operationId,provider:{configured:true,summarize:async()=>{throw new Error('all stages are durably cached');}}});assert.equal(cached.status,'ready',JSON.stringify(cached));assert.equal(cached.requests,0);assert.equal(f.requests.size,dispatches);assert.equal(cached.cachedParts,68);assert.equal(f.finishes.at(-1).coverage.inputRecordCount,65);assert.equal(f.finishes.at(-1).coverage.representedMessageCount,780);assert.equal(f.finishes.at(-1).coverage.mapPartCount,65);
});

function retainedCitationRecord(index,count,padding=25000){const inputId='summary:'+uid(2000+index),ids=Array.from({length:count},(_,offset)=>String(1750000000000000000n+BigInt(index*1000+offset))),canonicalText=JSON.stringify({inputId,originalCitationIds:ids,text:'x'.repeat(padding)});return{inputId,kind:'verified_summary',guildId,channelId,channelName,createdAt:'2026-10-01T04:00:00Z',representedMessageCount:count,citationMessageIds:ids,canonicalText,segments:[{segmentIndex:0,segmentCount:1,text:canonicalText}],certificate:{verified:true,sourceId,representedMessageCount:count,inputFingerprint:'c'.repeat(64),coverageDigest:'d'.repeat(64),rangeStart:'2026-10-01T04:00:00Z',rangeEnd:'2026-10-01T11:00:00Z'}};}
function completeCitationSummary(ids){const value=Object.fromEntries(SUMMARY_FIELDS.map(field=>[field,[]]));for(let offset=0;offset<ids.length;offset+=12){const field=SUMMARY_FIELDS[Math.floor(offset/(12*12))];assert(field);value[field].push({text:'Supported fixture fact.',messageIds:ids.slice(offset,offset+12)});}return value;}
function citationFixtureProvider(f,{shrink=true}={}){return{configured:true,async summarize(args){f.modelCalls.push(args);assert(args.allowedMessageIds.length<=512);assert(Buffer.byteLength(JSON.stringify(args.input),'utf8')<=49152);const reservation=await args.beforeDispatch({inputTokens:100,outputTokens:50,maxCostUsd:0.000035});if(reservation.status!=='ready')return reservation;const usage={inputTokens:100,outputTokens:50,cachedInputTokens:0,costUsd:0.000035};assert.equal((await args.afterDispatch({reservation,status:'succeeded',usage})).status,'ready');return{status:'ready',summary:completeCitationSummary(args.stage==='reduce'&&shrink?args.allowedMessageIds.slice(0,12):args.allowedMessageIds),usage,reservationId:reservation.reservationId};}};}

test('two300-citation children compress one complete singleton before merging and cache the full mixed-child DAG',async()=>{
 const records=[retainedCitationRecord(0,300),retainedCitationRecord(1,300)],f=fixture({messages:records,pageSize:1}),provider=citationFixtureProvider(f);f.setFinishFailure(true);const first=await f.run({provider});assert.equal(first.status,'failed');assert.equal(first.requests,4);assert.equal(first.mapParts,2);assert.equal(first.reduceParts,2);const reducers=f.jobs[0].parts.filter(part=>part.stage==='reduce');assert.deepEqual(reducers.map(part=>part.childParts.length),[1,2]);assert.deepEqual(reducers[0].childParts,[{stage:'map',ordinal:0,inputHash:f.jobs[0].parts[0].inputHash}]);assert.deepEqual(new Set(reducers[1].childParts.map(part=>part.stage)),new Set(['map','reduce']));assert.equal(reducers[1].childParts.find(part=>part.stage==='map').ordinal,1);
 const consumed=new Set(f.modelCalls.filter(call=>call.stage==='reduce').flatMap(call=>call.allowedMessageIds));assert.deepEqual(consumed,new Set(records.flatMap(record=>record.citationMessageIds)),'singleton input is not clipped and second child remains represented');assert.deepEqual(f.modelCalls.filter(call=>call.stage==='reduce').map(call=>call.allowedMessageIds.length),[300,312]);
 f.setFinishFailure(false);f.setReorder(true);const final=await f.run({operationId,provider:{configured:true,summarize:async()=>{throw new Error('singleton DAG is already cached');}}});assert.equal(final.status,'ready');assert.equal(final.requests,0);assert.equal(final.cachedParts,4);assert.equal(f.requests.size,4);assert.equal(f.finishes.at(-1).coverage.representedMessageCount,600);assert.equal(f.finishes.at(-1).coverage.mapPartCount,2);
});

test('a singleton reduction that shrinks neither citation scope nor content stops safely without publication or coverage clipping',async()=>{
 const records=[retainedCitationRecord(0,300),retainedCitationRecord(1,300)],f=fixture({messages:records,pageSize:1}),result=await f.run({provider:citationFixtureProvider(f,{shrink:false})});assert.equal(result.status,'failed');assert.equal(result.errors[0].code,'stalled');assert.equal(result.requests,3);assert.equal(f.finishes.length,0);assert.equal(f.jobs[0].parts.filter(part=>part.stage==='map').flatMap(part=>part.coverage).length,2);assert.equal(f.messages.length,2);assert.equal(f.modelCalls.filter(call=>call.stage==='reduce').length,1);
});

test('map batches honor512 inherited citations independently of byte budget and never trim an oversized single certificate',async()=>{
 const records=Array.from({length:65},(_,index)=>retainedCitationRecord(index,12,50)),f=fixture({messages:records,pageSize:64}),packed=await chunks({store:f.store,job:f.jobs[0],maxInputBytes:49152});assert.equal(packed.length,2);assert.deepEqual(packed.map(part=>part.allowedMessageIds.length),[504,276]);assert.deepEqual(new Set(packed.flatMap(part=>part.allowedMessageIds)),new Set(records.flatMap(record=>record.citationMessageIds)));assert.equal(packed.flatMap(part=>part.coverage).length,65);for(const part of packed)assert(Buffer.byteLength(JSON.stringify(part.input),'utf8')<49152);
 const tooLarge=fixture({messages:[retainedCitationRecord(0,513,50)]}),result=await tooLarge.run();assert.equal(result.status,'failed');assert.equal(result.errors[0].code,'output_too_large');assert.equal(result.requests,0);assert.equal(tooLarge.modelCalls.length,0);assert.equal(tooLarge.finishes.length,0);assert.equal(tooLarge.messages[0].citationMessageIds.length,513);
});

test('genuine009 storage publishes a greater-than512 citation reduction DAG only after full cached coverage, preserving charges',async()=>{
 const h=await import('./discord-sliced-planning-fixtures.mjs'),{createDiscordSummaryProvider}=await import('../server/discord/summary-provider.js'),db=new h.PGlite({extensions:{vector:h.vector}});try{
  await db.exec('create role anon;create role authenticated;create role service_role bypassrls;');await h.apply(db);await h.addSource(db,h.sources[0],h.channel);for(let index=1000;index<1780;index++)await h.insertOriginal(db,{index,created:'2025-09-20T12:00:00Z',content:'Fixture fact '+index+' '+ 'x'.repeat(1500)});await db.exec('set role service_role');
  const store=h.storeFor(db),requests=[];let finalArgs;
  const provider=createDiscordSummaryProvider({config:h.cfg,fetchImpl:async(url,options)=>{assert.equal(url,'https://api.openai.com/v1/responses');assert.equal(options.redirect,'error');const body=JSON.parse(options.body),evidence=JSON.parse(body.input[0].content[0].text),allowed=body.text.format.schema.$defs.finding.properties.messageIds.items.enum;assert(allowed.length<=512);assert.equal(new Set(allowed).size,allowed.length);requests.push({stage:evidence.stage,allowed});return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(completeCitationSummary(evidence.stage==='map'?allowed:allowed.slice(0,12)))}]}],usage:{input_tokens:100,output_tokens:50,input_tokens_details:{cached_tokens:0}}});}});
  const first=await h.run(db,{store:{...store,finishJob:async args=>{finalArgs=args;return{status:'database_unavailable'};}},provider,maxRequests:1000});assert.equal(first.status,'failed',JSON.stringify({first,errors:store.testErrors}));assert.equal(first.groups,0);assert.equal((await db.query('select count(*)::int n from public.discord_messages')).rows[0].n,780);assert.equal((await db.query('select count(*)::int n from public.discord_compaction_ledger')).rows[0].n,0);assert(first.mapParts>2);assert.equal(first.reduceParts,3);
  const maps=(await db.query("select ordinal,input_hash from public.discord_summary_parts where stage='map' order by ordinal")).rows;assert.equal(maps.length,first.mapParts);assert.equal((await db.query('select count(*)::int n from public.discord_summary_part_coverage')).rows[0].n,780);assert.equal((await db.query('select count(distinct input_id)::int n from public.discord_summary_part_coverage')).rows[0].n,780);assert.equal(finalArgs.coverage.inputRecordCount,780);assert.equal(finalArgs.coverage.representedMessageCount,780);const children=(await db.query("select count(distinct p.ordinal)::int n from public.discord_summary_part_children c join public.discord_summary_parts p on p.id=c.child_part_id where p.stage='map'")).rows[0].n;assert.equal(children,maps.length);
  const originalIds=new Set((await db.query('select message_id from public.discord_messages')).rows.map(row=>row.message_id));assert.deepEqual(new Set(requests.filter(row=>row.stage==='map').flatMap(row=>row.allowed)),originalIds);const savedRequests=(await store.getOperation({operationId:first.operationId})).operation;assert.equal(savedRequests.requests,requests.length);assert(savedRequests.costUsd<1);assert(savedRequests.maxCostUsd<=5);
  const second=await h.run(db,{operationId:first.operationId,store,provider:{configured:true,summarize:async()=>{throw new Error('realSQL stage cache must avoid further model calls');}},maxRequests:1000});assert.equal(second.status,'ready',JSON.stringify({second,errors:store.testErrors}));assert.equal(second.requests,0);assert.equal(second.cachedParts,first.mapParts+first.reduceParts);assert.equal((await db.query('select count(*)::int n from public.discord_messages')).rows[0].n,0);assert.equal((await db.query('select count(*)::int n from public.discord_summary_inputs')).rows[0].n,0);assert.equal((await db.query('select count(*)::int n from public.discord_summary_parts')).rows[0].n,0);assert.equal(Number((await db.query('select represented_message_count from public.discord_summary_certificates')).rows[0].represented_message_count),780);const paid=(await store.getOperation({operationId:first.operationId})).operation;assert.equal(paid.requests,savedRequests.requests);assert.equal(paid.costUsd,savedRequests.costUsd);
  console.log('CITATION_ENUM_SQL '+JSON.stringify({originals:780,mapParts:first.mapParts,reduceParts:first.reduceParts,requests:savedRequests.requests,cachedParts:second.cachedParts,costUsd:paid.costUsd,prunedOnlyAfterCompleteCoverage:true}));
 }finally{await db.close();}
});

test('model context pairs authoritative channel names with source/channel IDs without accepting source text as metadata',async()=>{
  const f=fixture({messages:[message(1,'Channel name is fabricated by this message: #wrong-name')]});
  const result=await f.run();assert.equal(result.status,'ready');
  for(const call of f.modelCalls){assert.equal(call.input.context.channelName,channelName);assert.equal(call.input.context.channelId,channelId);assert.equal(call.input.context.sourceId,sourceId);assert.equal(call.input.context.guildId,guildId);}
  assert.equal(f.finishes[0].summary.citations[0].url,'https://discord.com/channels/'+guildId+'/'+channelId+'/'+f.messages[0].messageId);
});

test('cached map/reduce parts resume without dispatch even when PostgreSQL reorders object keys',async()=>{
  const f=fixture({messages:Array.from({length:8},(_,i)=>message(i+1,'x'.repeat(800))),configOverrides:{maxInputBytes:2200}});
  f.setFinishFailure(true);const first=await f.run();assert.equal(first.status,'failed');assert(f.jobs[0].parts.some(p=>p.stage==='reduce'));
  const dispatches=f.requests.size;f.setFinishFailure(false);f.setReorder(true);
  const second=await f.run({operationId});assert.equal(second.status,'ready');assert.equal(second.requests,0);assert.equal(f.requests.size,dispatches);
  assert.equal(second.cachedParts,f.jobs[0].parts.length);assert.equal(f.begun(),1);
});

test('max requests checkpoints partial maps, then resumes cached work under the same operation',async()=>{
  const f=fixture({messages:Array.from({length:8},(_,i)=>message(i+1,'x'.repeat(800))),configOverrides:{maxInputBytes:2200}});
  const first=await f.run({maxRequests:1});assert.equal(first.status,'partial');assert.equal(first.requests,1);assert.equal(first.groups,0);
  const second=await f.run({operationId});assert.equal(second.status,'ready');assert.equal(second.cachedParts,1);assert.equal(f.begun(),1);
  assert.equal(f.jobs[0].parts.filter(p=>p.stage==='map').flatMap(p=>p.coverage).length,8);
});

test('group limits and bounded backfill preserve the fixed operation manifest',async()=>{
  const f=fixture({jobCount:3});const first=await f.run({maxGroups:1});assert.equal(first.status,'partial');assert.equal(first.groups,1);
  const rest=await runDiscordSummaryBackfill({config:f.cfg,store:f.store,provider:f.provider,operationId,maxGroups:1,maxRuns:3});
  assert.equal(rest.status,'ready');assert.equal(rest.complete,true);assert.equal(f.begun(),1);assert.equal(f.finishes.length,3);
  assert.equal(new Set(f.finishes.map(x=>x.jobId)).size,3);
});

test('uncertain dispatch charges persist across invocations and cannot exceed $1 run/$5 operation caps',async()=>{
  const f=fixture();let dispatches=0;
  const uncertain={configured:true,async summarize(args){
    const reservation=await args.beforeDispatch({inputTokens:1000000,outputTokens:1000000,maxCostUsd:0.6});
    if(reservation.status!=='ready')return reservation;
    dispatches++;await args.afterDispatch({reservation,status:'unknown',usage:null});return {status:'provider_unavailable'};
  }};
  for(let run=0;run<10;run++){
    const result=await runDiscordSummaries({config:f.cfg,store:f.store,provider:uncertain,operationId:run?operationId:undefined});
    assert(result.reservedCostUsd<=1);assert(result.operationCostUsd<=5);
  }
  assert.equal(dispatches,8);assert.equal(f.requests.size,8);assert([...f.requests.values()].every(r=>r.status==='unknown'));
  assert.equal(f.begun(),1);
});

test('runtime abort cancels active work, commits unknown dispatch and does not publish incomplete groups',async t=>{
  const deadline=new AbortController();t.mock.method(AbortSignal,'timeout',()=>deadline.signal);
  const f=fixture(),provider={configured:true,async summarize(args){
    const reservation=await args.beforeDispatch({inputTokens:10,outputTokens:10,maxCostUsd:0.000006});
    deadline.abort();await args.afterDispatch({reservation,status:'unknown',usage:null});return {status:'aborted'};
  }};
  const result=await runDiscordSummaries({config:f.cfg,store:f.store,provider});
  assert.equal(result.status,'partial');assert.equal(result.code,'runtime_limit');assert.equal(f.finishes.length,0);
  assert.equal(f.requests.size,1);assert.equal([...f.requests.values()][0].status,'unknown');
  const pre=fixture();assert.equal((await pre.run({signal:deadline.signal})).status,'aborted');assert.equal(pre.calls.length,0);
});

test('invalid operation identity and malicious CLI errors cannot leak secrets or trigger model calls',async()=>{
  const f=fixture();f.store.getOperation=async()=>({status:'ready',operation:{guildId,provider:f.cfg.provider,model:'wrong-model',promptVersion:f.cfg.promptVersion}});
  assert.equal((await f.run({operationId})).status,'failed');assert.equal(f.modelCalls.length,0);
  assert.equal(parseDiscordSummaryArgs(['run','--max-requests','1','--max-requests','2']),null);
  assert.equal(parseDiscordSummaryArgs(['backfill','--max-runs','0']),null);
  const result=await runDiscordSummaryCli({argv:['preview'],config:f.cfg,store:{configured:true,preview:async()=>{throw new Error('fixture-private raw-message');}}});
  assert.equal(result.status,'database_unavailable');assert(!JSON.stringify(result).includes('fixture-private'));assert(!JSON.stringify(result).includes('raw-message'));
});

test('cached coverage and child references cannot be tampered into a false complete result',async()=>{
  for(const target of ['coverage','children']){
    const f=fixture({messages:Array.from({length:8},(_,i)=>message(i+1,'x'.repeat(800))),configOverrides:{maxInputBytes:2200}});
    f.setFinishFailure(true);assert.equal((await f.run()).status,'failed');
    const part=f.jobs[0].parts.find(p=>p.stage===(target==='coverage'?'map':'reduce'));
    assert(part);if(target==='coverage')part.coverage=[];else part.childParts=[];
    f.setFinishFailure(false);const result=await f.run({operationId});
    assert.equal(result.status,'failed');assert.equal(result.groups,0);assert.equal(result.requests,0);assert.equal(f.finishes.length,1);
  }
});

test('concurrent workers share a strict request budget before dispatch',async()=>{
  const f=fixture({jobCount:4,configOverrides:{concurrency:4}});
  const result=await f.run({maxRequests:1});assert.equal(result.status,'partial');assert.equal(result.requests,1);assert.equal(f.requests.size,1);assert.equal(result.groups,1);
});

test('CLI dry-run shows the fixed manifest size and cache counts without requiring model configuration',async()=>{
  const result=await runDiscordSummaryCli({argv:['preview'],config:{...config,configured:false},store:{configured:true,preview:async()=>({status:'ready',preview:{policyRevision:3,groupCount:779,messageCount:108828,segmentCount:108828,inputChars:5659056,cachedCount:0}})}});
  assert.equal(result.status,'ready');assert.equal(result.exitCode,0);assert.equal(result.groupCount,779);assert.equal(result.inputChars,5659056);assert.equal(result.cachedCount,0);assert.equal(result.policyRevision,3);
});

function verifiedInput({represented=50,source=sourceId,verified=true}={}){
  const inherited=['1490000000000000001','1490000000000000002'],inputId='summary:'+uid(900);
  const canonicalText=JSON.stringify({kind:'verified_summary',summary:finding(inherited,'Prior verified weekly facts.'),citations:inherited.map(messageId=>({messageId,url:'https://discord.com/channels/'+guildId+'/'+channelId+'/'+messageId})),representedMessageCount:represented});
  return {inputId,kind:'verified_summary',guildId,channelId,createdAt:'2026-10-01T04:00:00Z',representedMessageCount:represented,citationMessageIds:inherited,
    certificate:{verified,sourceId:source,representedMessageCount:represented,inputFingerprint:'c'.repeat(64),coverageDigest:'d'.repeat(64),rangeStart:'2026-10-01T04:00:00Z',rangeEnd:'2026-10-01T11:00:00Z'},
    canonicalText,segments:[{segmentIndex:0,segmentCount:1,text:canonicalText}]};
}

test('mixed verified-summary/raw inputs distinguish processed records from represented originals and preserve inherited citations',async()=>{
  const child=verifiedInput(),raw=message(1),f=fixture({messages:[child,raw],pageSize:1});
  const result=await f.run();assert.equal(result.status,'ready');assert.equal(result.processedRecords,2);assert.equal(result.representedOriginals,51);
  assert.equal(f.finishes[0].coverage.inputRecordCount,2);assert.equal(f.finishes[0].coverage.representedMessageCount,51);
  const coverage=f.jobs[0].parts.filter(p=>p.stage==='map').flatMap(p=>p.coverage);
  assert.deepEqual(new Set(coverage.map(c=>c.kind)),new Set(['raw','verified_summary']));
  assert(f.modelCalls[0].allowedMessageIds.includes(child.citationMessageIds[0]));assert(f.modelCalls[0].allowedMessageIds.includes(raw.inputId));
  assert(!f.modelCalls[0].allowedMessageIds.includes(child.inputId));
  assert(f.finishes[0].summary.citations.some(c=>c.messageId===child.citationMessageIds[0]));
});

test('unverified/cross-source child certificates and count mismatches cannot dispatch a model or publish',async()=>{
  for(const child of [verifiedInput({verified:false}),verifiedInput({source:'99999999-9999-4999-8999-999999999999'}),{...verifiedInput(),representedMessageCount:49}]){
    const f=fixture({messages:[child,message(1)]});
    const result=await f.run();assert.equal(result.status,'failed');assert.equal(result.groups,0);assert.equal(f.requests.size,0);assert.equal(f.finishes.length,0);
  }
});

test('scheduled not-due is a safe no-op while unfinished durable work resumes outside the slot',async()=>{
  const no=fixture(),now='2026-10-13T15:00:00Z';
  const result=await no.run({mode:'scheduled',asOf:now});
  assert.equal(result.status,'not_due');assert.equal(result.exitCode,0);assert.equal(no.begun(),0);assert.equal(no.requests.size,0);assert.deepEqual(no.calls,['pending']);
  const pending=fixture();let lookup;
  pending.store.getPendingOperation=async args=>{lookup=args;return {status:'ready',operationId};};
  assert.equal((await pending.run({mode:'scheduled',asOf:now})).status,'ready');assert.equal(lookup.mode,undefined);assert.equal(pending.begun(),0);assert.equal(pending.finishes.length,1);
});

test('Monday the first looks up monthly work first and starts monthly closure before an older pending weekly job',async()=>{
  const f=fixture();let lookup,preview,start;
  f.store.getPendingOperation=async args=>{lookup=args;return args.mode==='monthly'?{status:'empty'}:{status:'ready',operationId};};
  f.store.preview=async args=>{preview=args;return {status:'ready',preview:{policyRevision:3}};};
  f.store.beginOperation=async args=>{start=args;return {status:'ready',operationId};};
  f.store.getOperation=async()=>({status:'ready',operation:{guildId,mode:'monthly',provider:f.cfg.provider,model:f.cfg.model,promptVersion:f.cfg.promptVersion,complete:true,requests:0,costUsd:0}});
  const result=await f.run({mode:'scheduled',asOf:'2026-06-01T12:37:00Z'});
  assert.equal(result.status,'ready');assert.equal(lookup.mode,'monthly');assert.equal(preview.mode,'monthly');assert.equal(start.mode,'monthly');
  assert.equal(start.dueIdentity,'monthly:2026-05');assert.equal(start.asOf,'2026-06-01T12:00:00.000Z');assert.equal(f.requests.size,0);
});

test('completed post-prune operations return their committed result without claiming or rereading erased input content',async()=>{
  const f=fixture();
  f.store.getOperation=async()=>({status:'ready',operation:{guildId,mode:'bootstrap',provider:f.cfg.provider,model:f.cfg.model,promptVersion:f.cfg.promptVersion,complete:true,requests:1,costUsd:0.000035}});
  for(const method of ['claimJob','getInputs','getParts'])f.store[method]=async()=>{throw new Error('pruned input must not be read');};
  const result=await f.run({operationId});assert.equal(result.status,'ready');assert.equal(result.complete,true);assert.equal(result.requests,0);assert.equal(result.processedRecords,0);assert.equal(f.requests.size,0);assert.equal(f.calls.length,0);
});

test('daily jobs and superseded daily/run/backfill CLI commands fail closed',async()=>{
  const f=fixture();f.jobs[0].tier='daily';assert.equal((await f.run()).status,'failed');assert.equal(f.requests.size,0);assert.equal(f.finishes.length,0);
  for(const command of ['daily','run','backfill'])assert.equal(parseDiscordSummaryArgs([command]),null);
  assert.equal(parseDiscordSummaryArgs(['preview','--mode','daily']),null);
  assert.equal(parseDiscordSummaryArgs(['scheduled','--as-of','2026-10-12T12:00:00Z']),null);
  assert.equal(parseDiscordSummaryArgs(['monthly','--as-of','2026-02-30T12:00:00Z']),null);
});

test('incomplete source synchronization reports waiting/partial and never dispatches or spins backfill',async()=>{
  const f=fixture();let starts=0;
  f.store.beginOperation=async()=>{starts++;return {status:'wait_for_sync',waitingSourceCount:2,blockedGroupCount:3};};
  const result=await runDiscordSummaryBackfill({config:f.cfg,store:f.store,provider:f.provider,maxRuns:100});
  assert.equal(result.status,'partial');assert.equal(result.code,'wait_for_sync');assert.equal(result.complete,false);assert.equal(result.runs,1);
  assert.equal(result.waitingSourceCount,2);assert.equal(result.blockedGroupCount,3);assert.equal(starts,1);assert.equal(f.requests.size,0);assert.equal(f.finishes.length,0);
  const cli=await runDiscordSummaryCli({argv:['bootstrap'],config:f.cfg,store:f.store,provider:f.provider});
  assert.equal(cli.status,'partial');assert.equal(cli.code,'wait_for_sync');assert.equal(cli.waitingSourceCount,2);assert.equal(cli.blockedGroupCount,3);
});

test('scheduled CLI drains a fixed manifest across bounded passes and remains a no-model no-op outside the gate',async()=>{
  const f=fixture({jobCount:5});
  const result=await runDiscordSummaryCli({argv:['scheduled','--max-groups','2','--max-runs','10'],config:f.cfg,store:f.store,provider:f.provider,now:'2026-10-12T12:37:00Z'});
  assert.equal(result.status,'ready');assert.equal(result.complete,true);assert.equal(result.exitCode,0);assert.equal(result.groups,5);assert.equal(result.runs,3);
  assert.equal(f.begun(),1);assert.equal(f.requests.size,5);assert.equal(new Set(f.finishes.map(row=>row.jobId)).size,5);
  const no=fixture(),noop=await runDiscordSummaryCli({argv:['scheduled'],config:no.cfg,store:no.store,provider:no.provider,now:'2026-10-13T15:00:00Z'});
  assert.equal(noop.exitCode,0);assert.equal(noop.complete,true);assert.equal(no.requests.size,0);assert.equal(no.begun(),0);
});
