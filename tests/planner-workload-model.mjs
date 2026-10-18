// Reuse the strict synthetic-source/inert-write acceptance harness without
// changing its shared implementation or overwriting historical model receipts.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {readConfig} from '../server/config.js';
const allowed=new Set(['automation-discord-calendar-announcement-create','automation-discord-calendar-announcement-edit','automation-miro-calendar-map-rsvp','automation-calendar-occurrence']);
if(!process.argv.includes('--live-model')){console.log('No model calls made. Add --live-model to run the authorized four-case synthetic planner check.');process.exit(0);}
assert.equal(readConfig().model,'gpt-6-luna','Use only the configured authorized model');
const selector=process.argv.find(arg=>arg.startsWith('--case='));
if(selector)for(const name of selector.slice(7).split(','))assert(allowed.has(name),'Case outside planner retest scope');
else process.argv.push('--case='+[...allowed].join(','));
const original=new URL('../scripts/verify-agent-prompts.mjs',import.meta.url);
let source=await readFile(original,'utf8');
const replace=(needle,replacement)=>{assert(source.includes(needle),'Shared harness contract changed; review before model calls');source=source.replace(needle,replacement);};
replace('../evidence/agent-prompts/live-model-results.json','../evidence/optimization/planner-workload-model.json');
replace('../evidence/agent-prompts/','../evidence/optimization/');
replace("const monitoredPaths=['scripts/verify-agent-prompts.mjs'","const monitoredPaths=['tests/planner-workload-model.mjs','scripts/verify-agent-prompts.mjs'");
replace('MODEL_MIN_INTERVAL_MS=1000','MODEL_MIN_INTERVAL_MS=1500');
replace("import {MIRO_MCP_TOOLS}","import {MIRO_MCP_TOOLS,createMiroMcpTools}");
replace("'tests/planner-workload-model.mjs','scripts/verify-agent-prompts.mjs'","'tests/planner-workload-model.mjs','tools/miro/mcp.js','server/automation/validation.js','scripts/verify-agent-prompts.mjs'");
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

replace('scripts/verify-agent-prompts.mjs --live-model','tests/planner-workload-model.mjs --live-model');
// Absolute URLs preserve the original harness's module and evidence paths when
// evaluating the reused module in memory. No temporary runtime copy is written.
source=source.replace(/(from\s*['"])(\.\.?\/[^'"]+)(['"])/g,(_,prefix,path,suffix)=>prefix+new URL(path,original).href+suffix);
source=source.replaceAll('import.meta.url',JSON.stringify(original.href));
await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));

const output=new URL('../evidence/optimization/planner-workload-model.json',import.meta.url);
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
  if(scenario.name!=='automation-calendar-occurrence'){
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
results.strictAcceptance=results.buildStable&&results.cases.every(row=>row.pass)&&results.strictWriteChainChecks.every(row=>row.pass);
await writeFile(output,JSON.stringify(results,null,2)+'\n');
console.log('Strict write-chain acceptance: '+results.strictAcceptance);
