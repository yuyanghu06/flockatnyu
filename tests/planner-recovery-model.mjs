// Reuse the strict synthetic-source/inert-write acceptance harness without
// changing its shared implementation or overwriting historical model receipts.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {readConfig} from '../server/config.js';
const allowed=new Set(['automation-discord-calendar-announcement-create','automation-discord-calendar-announcement-edit','automation-miro-calendar-map-rsvp','automation-calendar-occurrence','automation-miro-navigation-outage-calendar-occurrence']);
if(!process.argv.includes('--live-model')&&!process.argv.includes('--fixture-only')){console.log('No model calls made. Add --live-model to run the authorized five-case synthetic planner recovery check.');process.exit(0);}
assert.equal(readConfig().model,'gpt-6-luna','Use only the configured authorized model');
const selector=process.argv.find(arg=>arg.startsWith('--case='));
if(selector)for(const name of selector.slice(7).split(','))assert(allowed.has(name),'Case outside planner retest scope');
else process.argv.push('--case='+[...allowed].join(','));
const output=new URL('../evidence/optimization/planner-recovery-model.json',import.meta.url);
let priorBudget=0;
try{const prior=JSON.parse(await readFile(output,'utf8'));priorBudget=prior.totalReservedModelCalls??prior.totalRecordedModelCalls??prior.modelCalls??0;}catch(error){if(error.code!=='ENOENT')throw error;}
assert(Number.isSafeInteger(priorBudget)&&priorBudget>=0&&priorBudget<100,'Total authorized model-call budget exhausted or invalid');
const remainingBudget=100-priorBudget;
const original=new URL('../scripts/verify-agent-prompts.mjs',import.meta.url);
let source=await readFile(original,'utf8');
const replace=(needle,replacement)=>{assert(source.includes(needle),'Shared harness contract changed; review before model calls');source=source.replace(needle,replacement);};
replace('../evidence/agent-prompts/live-model-results.json','../evidence/optimization/planner-recovery-model.json');
replace('../evidence/agent-prompts/','../evidence/optimization/');
replace("const monitoredPaths=['scripts/verify-agent-prompts.mjs'","const monitoredPaths=['tests/planner-recovery-model.mjs','scripts/verify-agent-prompts.mjs'");
replace('MODEL_MIN_INTERVAL_MS=1000','MODEL_MIN_INTERVAL_MS=1500');
replace('MAX_MODEL_CALLS=180','MAX_MODEL_CALLS='+remainingBudget);
replace("import {MIRO_MCP_TOOLS}","import {MIRO_MCP_TOOLS,createMiroMcpTools}");
replace("'tests/planner-recovery-model.mjs','scripts/verify-agent-prompts.mjs'","'tests/planner-recovery-model.mjs','tools/miro/mcp.js','server/automation/validation.js','scripts/verify-agent-prompts.mjs'");
replace("'tests/planner-recovery-model.mjs','tools/miro/mcp.js'","'tests/planner-recovery-model.mjs','tests/planner-workload-model.mjs','tools/miro/mcp.js'");
const miroStart=source.indexOf('  const miroTools={configured:true,transport:');
const miroEnd=source.indexOf('  const mapEventService=',miroStart);
assert(miroStart>=0&&miroEnd>miroStart,'Review changed synthetic Miro fixture');
// Execute production Miro schema/options/parser/policy code against inert MCP
// replies so invalid canvas options receive the same corrections as deployment.
source=source.slice(0,miroStart)+`  const miroTools=createMiroMcpTools({
    config:{configured:true,boardIds:[boardId],teamId:'synthetic-team'},now:()=>new Date(now),
    store:{configured:true,authorizedBoard:async({boardId:requested})=>requested===boardId
      ?{status:'ready',data:{board_id:boardId,source_id:ids.miro,team_id:'synthetic-team',title:'Synthetic club calendar'}}:{status:'forbidden'}},
    client:{configured:true,callTool:async(name,args)=>{
      activeCase.sourceReads.push({provider:'miro',name});
      assert.equal(args.miro_url,'https://miro.com/app/board/'+boardId+'/');
      if(activeCase.name==='automation-miro-navigation-outage-calendar-occurrence'&&name==='canvas_search')throw Object.assign(Error('tool_result_error'),{code:'tool_result_error'});
      if(name==='canvas_search')return {structuredContent:{miro_url:args.miro_url,total_items:1,total_results:1,next_cursor:null,results:navigation.payload.results}};
      if(name==='canvas_read_as_svg'){
        assert(args.widget_ids.every(id=>id===itemId),'Unknown synthetic native item');
        return {structuredContent:{success:true,miro_url:args.miro_url,item_count:1,skipped_count:0,
          svg:'<svg><g data-miro-id="501"><text>October 2026</text><text>'+miroSource.excerpt+'</text><text>Last changed October 17 2026 10:00 America/New_York</text></g></svg>'}};
      }
      throw Error('Unexpected synthetic MCP operation');
    }},
  });
`+source.slice(miroEnd);

// Observe the actual production preparation/completion contracts while retaining
// the strict existing synthetic source and inert write fixture.
replace('const handler=createAutomationHandler({...adapters,tools,store,provider,config:automationConfig,now:()=>new Date(now)});',
  'const handler=createAutomationHandler({...adapters,prepareBatch:async options=>{const context=await adapters.prepareBatch(options);activeCase.preparedContext=copy(context);return context;},validateCompletion:async options=>{const result=await adapters.validateCompletion(options);(activeCase.completionChecks??=[]).push(copy(result));return result;},tools,store,provider,config:automationConfig,now:()=>new Date(now)});');
// Save a conservative dispatch counter before the actual request. SIGUSR1
// finishes the current case and then stops, preserving exact accounting.
replace('  return fetch(url,options);',`  results.modelCalls=modelCalls;results.modelDispatchTimes=[...modelDispatchTimes];
  results.totalReservedModelCalls=${priorBudget}+modelCalls;
  results.inFlightCase={name:activeCase.name,modelCalls:activeCase.modelCalls};
  await writeFile(output,evidenceJson(results));
  return fetch(url,options);`);
replace('for(const [name,run] of selected){',`let stopAfterCase=false;process.on('SIGUSR1',()=>{stopAfterCase=true;});
for(const [name,run] of selected){`);
replace('results.endSourceHashes=await hashSources();',`results.totalReservedModelCalls=${priorBudget}+modelCalls;
results.modelCallBudget={priorReservedCalls:${priorBudget},currentDispatches:modelCalls,limitAcrossAttempts:100};
delete results.inFlightCase;
results.endSourceHashes=await hashSources();`);
replace("  if(!activeCase.pass)console.log('Failure: '+activeCase.failure);", "  if(!activeCase.pass)console.log('Failure: '+activeCase.failure);if(stopAfterCase)break;");
replace('const cases=[',`const cases=[
  ['automation-miro-navigation-outage-calendar-occurrence',async()=>{
    const f=await runAutomation({content:'FYI: the club calendar is available. No location or attendance claim.'});
    assert.equal(f.state.calendarWrites.length,0,'Miro outage projection must never change Calendar');
    assert.equal(f.state.mapWrites.length,1,'Existing canonical Calendar occurrence must project once');
    const write=f.state.mapWrites[0];
    assert.equal(write.event.source_id,ids.calendar);assert.equal(write.event.source_record_id,occurrenceId);
    assert.equal(write.event.source_url,calendarUrl);assert.equal(write.event.kind,'scheduled_event');
    assert.equal(instant(write.event.reported_at),instant(calendarEvent.updatedAt));
    assert.equal(instant(write.event.starts_at),instant(calendarEvent.start.dateTime));
    assert.equal(instant(write.event.ends_at),instant(calendarEvent.end.dateTime));
    assert.deepEqual(write.buildings.map(row=>row.building_id),['bobst-library']);assert.equal(write.people.length,0);
    assert(!JSON.stringify(write).includes('miro.com'),'Outage must not invent Miro-derived facts');
    const miro=activeCase.preparedContext.miro;
    assert.deepEqual(miro.deferredBoards,[boardId]);assert.equal(miro.reconciliationStatus,'deferred');
    assert.equal(miro.syncComplete,false);assert.equal(miro.coverage.complete,false);
    assert.equal(miro.coverage.reason,'miro_navigation_deferred');
    assert.equal(miro.boards[0].result.sourceStatus,'tool_result_error');
    assert.deepEqual(miro.boards[0].result.sources,[]);
    const completion=activeCase.completionChecks.at(-1);
    assert.equal(completion.status,'ready');assert.deepEqual(completion.miroReconciliation,{status:'deferred',boardIds:[boardId],syncComplete:false});
    assert.deepEqual(activeCase.sourceReads.filter(row=>row.provider==='miro').map(row=>row.name),['canvas_search'],'Deferred board must not be retried/read as content');
  }],`);

replace('scripts/verify-agent-prompts.mjs --live-model','tests/planner-recovery-model.mjs --live-model');
// Absolute URLs preserve the original harness's module and evidence paths when
// evaluating the reused module in memory. No temporary runtime copy is written.
source=source.replace(/(from\s*['"])(\.\.?\/[^'"]+)(['"])/g,(_,prefix,path,suffix)=>prefix+new URL(path,original).href+suffix);
source=source.replaceAll('import.meta.url',JSON.stringify(original.href));
if(process.argv.includes('--fixture-only')){console.log('Five-case fixture transformations verified; no model calls made.');process.exit(0);}
await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));

const results=JSON.parse(await readFile(output,'utf8'));
results.strictWriteChainChecks=[];
for(const scenario of results.cases){
 try{
  assert(scenario.pass,'Core semantic case failed');
  const write=scenario.mapWrites.at(-1);assert(write,'Expected actual inert map upsert');
  assert.equal(write.event.kind,'scheduled_event');assert.equal(write.event.time_kind,'timed');
  assert.equal(write.event.source_id,'30000000-0000-4000-8000-000000000003');
  assert.equal(write.event.source_record_id,'workshop_20261020T220000Z');
  assert.deepEqual(write.buildings.map(row=>row.building_id),['bobst-library']);
  assert.match(write.event.name,/Synthetic Workshop/i);
  const steps=scenario.tools,args=step=>step.arguments?.arguments??step.arguments;
  const mapIndex=steps.findLastIndex(step=>step.name==='upsert_map_event'&&step.status==='ready');assert(mapIndex>=0);
  const snapshotIndex=steps.findLastIndex((step,index)=>index<mapIndex&&step.name==='read_map_events'&&step.status==='ready');assert(snapshotIndex>=0,'Read snapshot must precede map write');
  const mutationIndex=steps.findIndex(step=>step.name==='upsert_calendar_event'&&step.status==='ready');
  if(!['automation-calendar-occurrence','automation-miro-navigation-outage-calendar-occurrence'].includes(scenario.name)){
   assert(mutationIndex>=0,'Expected actual Calendar upsert');
   const exactReadIndex=steps.findIndex((step,index)=>index>mutationIndex&&step.name==='read_calendar_event'&&step.status==='ready'&&args(step).eventId==='workshop_20261020T220000Z');
   assert(exactReadIndex>mutationIndex&&mapIndex>exactReadIndex,'Calendar mutation -> exact original read -> map write required');
  }else assert.equal(mutationIndex,-1,'Projection must not mutate original Calendar');
  if(scenario.name==='automation-miro-calendar-map-rsvp'){
   assert(steps.some((step,index)=>index<mapIndex&&step.name==='lookup_map_person'&&step.status==='ready'&&args(step).providerUserId==='400'),'RSVP requires actual source-bound identity lookup');
  }
  results.strictWriteChainChecks.push({name:scenario.name,pass:true,mapWriteCount:scenario.mapWrites.length,calendarWriteCount:scenario.calendarWrites.length});
 }catch(error){results.strictWriteChainChecks.push({name:scenario.name,pass:false,failure:String(error.message).slice(0,500)});process.exitCode=1;}
}
results.strictAcceptance=results.buildStable&&results.cases.length===allowed.size&&new Set(results.cases.map(row=>row.name)).size===allowed.size&&results.cases.every(row=>row.pass)&&results.strictWriteChainChecks.every(row=>row.pass);
if(!results.strictAcceptance)process.exitCode=1;
await writeFile(output,JSON.stringify(results,null,2)+'\n');
console.log('Strict write-chain acceptance: '+results.strictAcceptance);
