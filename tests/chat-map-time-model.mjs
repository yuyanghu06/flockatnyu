import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,mkdtemp,mkdir,writeFile,chmod} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname,join} from 'node:path';
import {createProvider} from '../server/providers/index.js';
import {readConfig} from '../server/config.js';
import {fixture,snapshot,currentUpdate,assertSternCorrection,assertNoStorageHints,ids,zone,origin,principal} from './fixtures/chat-map-time.mjs';

const selected=process.argv.filter(value=>value.startsWith('--case=')).map(value=>value.slice(7));
const localSeven=/\b7(?::00)?\s*p\.?m\.?|\b19:00/i;
const cases=[
  {name:'stern-correction',data:snapshot(),now:'2026-10-23T21:45:00.000Z',messages:[
    {role:'user',content:'Jennifer, Yuyang, Charice and Pope are at Stern until 7 PM today.'},
    {role:'assistant',content:'Jennifer, Yuyang, and Charice are included in the saved Stern presence entry, along with Pope. I need to correct my earlier reply: the saved entry currently runs until 11 PM, not the requested 7 PM, so its timing is still wrong.'},
    {role:'user',content:'The times are still being used in UTC for some reason. Please fix that saved Stern entry to end at 7 PM New York today. Keep the start, all four people, their labels, the room and other details.'}],
    verify(f,answer){assertSternCorrection(f);assert(localSeven.test(answer.text),'Final reply must confirm the corrected local 7 PM');assert(!/until\s+11\s*p\.?m/i.test(answer.text),'Must not report the old UTC-shifted end as saved');}},
  {name:'summer-current-presence',data:snapshot({empty:true}),now:'2026-07-15T21:30:00.000Z',messages:[{role:'user',content:'I am at Bobst studying calculus until 7 PM today.'}],
    verify(f,answer){assertCurrent(f,'2026-07-15T23:00:00.000Z');assert(localSeven.test(answer.text),'Must confirm local 7 PM');}},
  {name:'winter-current-presence',data:snapshot({empty:true}),now:'2026-12-15T22:30:00.000Z',messages:[{role:'user',content:'I am at Bobst studying calculus until 7 PM today.'}],
    verify(f,answer){assertCurrent(f,'2026-12-16T00:00:00.000Z');assert(localSeven.test(answer.text),'Must confirm local 7 PM');}},
  {name:'attendance-preserves-instants',data:snapshot({attendance:true}),now:'2026-10-23T21:45:00.000Z',messages:[{role:'user',content:'Please add me as going to GoGreek today for its entire time. Keep the event and everyone else exactly as saved.'}],
    verify(f){const before=this.data;assert.equal(f.writes.length,1);assert.equal(f.state.events.length,before.events.length);
      assert.deepEqual({...f.state.events[0],updated_at:before.events[0].updated_at},before.events[0],'Attendance must preserve raw microsecond event timestamps and event facts');
      assert.deepEqual(f.state.event_buildings,before.event_buildings);
      for(const old of before.event_people)assert.deepEqual(f.state.event_people.find(row=>row.person_id===old.person_id),old,'Existing person overrides and labels must survive');
      const added=f.state.event_people.find(row=>row.person_id===ids.yuyang);assert(added,'Linked actor must be added');assert.equal(added.attendance_status,'going');assert.equal(added.presence_basis,'planned');
      assert(added.starts_at==null||added.starts_at===before.events[0].starts_at,'Entire time may inherit or exactly copy start');assert(added.ends_at==null||added.ends_at===before.events[0].ends_at,'Entire time may inherit or exactly copy end');assertNoStorageHints(f.state);}},
  {name:'unavailable-read-no-false-save',data:snapshot(),readFailure:true,now:'2026-10-23T21:45:00.000Z',messages:[{role:'user',content:'Please correct our saved Stern presence entry to end at 7 PM today, keeping everyone and all other details.'}],
    verify(f,answer){assert.equal(f.attempts.length,0,'A failed read cannot authorize a full replacement snapshot');assert.deepEqual(f.state,this.data);assert(f.calls.some(row=>row.name==='read_map_events'&&row.result.status==='unavailable'),'Must encounter the actual unavailable map adapter');assert(/couldn.t|cannot|can.t|unable|not saved|could not|unavailable|wasn.t|didn.t/i.test(answer.text),'Must explain the correction was not saved');}},
  {name:'ambiguous-stern-clarifies',data:ambiguousSnapshot(),now:'2026-10-23T21:45:00.000Z',messages:[{role:'user',content:'Fix our saved Stern presence entry to end at 7 PM today. Keep everyone and all the other details.'}],
    verify(f,answer,proposals=[]){assert(!proposals.flat().some(row=>row.name==='upsert_map_event'),'Two matching records require clarification before ANY mutation proposal, including invalid arguments');assert(!f.calls.some(row=>row.name==='upsert_map_event'),'Two matching records require clarification before proposing a mutation');assert.equal(f.attempts.length,0,'Two matching records require clarification before writes');assert.deepEqual(f.state,this.data);assert(f.calls.some(row=>row.name==='read_map_events'&&row.result.events?.length===2),'Must observe both actual saved records');assert(/which|two|clarif|fourth|second|lounge|room/i.test(answer.text),'Must ask which existing Stern record to correct');assert(/\?/.test(answer.text),'Must ask a focused clarification');}},
  {name:'unique-room-second-stern',data:ambiguousSnapshot(),now:'2026-10-23T21:45:00.000Z',messages:[{role:'user',content:'Fix the saved Stern presence entry for the second floor collaboration room to end at 7 PM New York today. Keep everyone, the start and all the other details. Leave the fourth floor study lounge entry unchanged.'}],
    verify(f,answer,proposals=[]){const before=this.data,target=before.events.find(row=>row.id===ids.second);assert.equal(f.writes.length,1,'Exactly the requested existing second-room event must be corrected');
      assert(f.attempts.every(row=>row.event.id===ids.second),'No write may target the unselected first room');assert.equal(f.writes[0].event.id,ids.second);assert.equal(f.writes[0].expectedUpdatedAt,target.updated_at);
      assert(proposals.flat().filter(row=>row.name==='upsert_map_event').every(row=>row.arguments.event.id===ids.second),'Every mutation proposal must target the user-selected room');
      assert.equal(f.state.events.length,before.events.length,'Room selection cannot create a duplicate');assert.deepEqual(f.state.events.find(row=>row.id===ids.event),before.events.find(row=>row.id===ids.event),'The unselected first event must remain byte-exact');
      const saved=f.state.events.find(row=>row.id===ids.second);assert.equal(new Date(saved.ends_at).toISOString(),'2026-10-23T23:00:00.000Z');assert.deepEqual({...saved,ends_at:target.ends_at,updated_at:target.updated_at},target,'Only the requested second event end and revision may change');
      assert.deepEqual(f.state.event_buildings,before.event_buildings,'Keep both rooms and buildings');assert.deepEqual(f.state.event_people,before.event_people,'Keep all participants, labels and inherited bounds on both entries');assertNoStorageHints(f.state);
      assert(localSeven.test(answer.text),'Final reply must confirm 7 PM local');assert(/second[-\s]+floor|collaboration room/i.test(answer.text),'Final reply must identify the selected room');}},
];
function ambiguousSnapshot(){const data=snapshot(),source_url=`${origin}/?event=${ids.second}#chat-map`;data.events.push({...data.events[0],id:ids.second,source_url,url:source_url,source_record_id:'chat:second-stern'});data.event_buildings.push({event_id:ids.second,building_id:'stern-school-of-business',location_notes:'Second floor collaboration room'});data.event_people.push(...data.event_people.map(row=>({...row,event_id:ids.second,source_url})));return data;}
function assertCurrent(f,end){assert.equal(f.writes.length,1,'Expected one applied new presence');const event=f.state.events[0];assert.equal(event.kind,'presence');assert.equal(new Date(event.starts_at).toISOString(),f.now,'Current start must resolve to the trusted request instant');assert.equal(new Date(event.ends_at).toISOString(),end);assert.equal(event.time_zone,zone);assert.deepEqual(f.state.event_buildings.map(row=>row.building_id),['bobst-library']);assert.equal(f.state.event_people.length,1);assert.equal(f.state.event_people[0].person_id,ids.yuyang);assert.match(f.state.event_people[0].label,/calculus/i);assertNoStorageHints(f.state);}

async function selfCheck(){
  const f=fixture(),request=f.request(),read=await request.execute({name:'read_map_events',arguments:{},principal});
  assert.equal(read.status,'ready');assert.equal(read.events[0].local_display.ends_at,'2026-10-23T23:00:00.000-04:00');
  const args=currentUpdate();delete args.event.ends_at;args.event.ends_local='2026-10-23T19:00:00';
  const saved=await request.execute({name:'upsert_map_event',arguments:args,principal});assert.equal(saved.sourceStatus,'applied');assertSternCorrection(f);
  const stale=await request.execute({name:'upsert_map_event',arguments:args,principal});assert.equal(stale.status,'conflict');assert.equal(f.attempts.length,2);assert.equal(f.writes.length,1);
  const ambiguous=ambiguousSnapshot(),multiple=fixture({data:ambiguous}),secondRequest=multiple.request();assert.equal((await secondRequest.execute({name:'read_map_events',arguments:{},principal})).events.length,2);
  const secondArgs=currentUpdate({...ambiguous,events:ambiguous.events.filter(row=>row.id===ids.second),event_buildings:ambiguous.event_buildings.filter(row=>row.event_id===ids.second),event_people:ambiguous.event_people.filter(row=>row.event_id===ids.second)});
  delete secondArgs.event.ends_at;secondArgs.event.ends_local='2026-10-23T19:00:00';assert.equal((await secondRequest.execute({name:'upsert_map_event',arguments:secondArgs,principal})).sourceStatus,'applied');
  cases.find(row=>row.name==='unique-room-second-stern').verify(multiple,{text:'Updated the second floor collaboration room to 7 PM.'},[[{name:'upsert_map_event',arguments:secondArgs}]]);
  console.log('PASS deterministic fixture: actual adapters, local read/receipt, exact saved correction, stale CAS and only user-selected second-room update; no model calls.');
}
if(process.argv.includes('--self-check')){await selfCheck();process.exit(0);}
const replayPath=process.argv.find(value=>value.startsWith('--replay='))?.slice(9);
if(replayPath){
  const bytes=await readFile(replayPath),original=JSON.parse(bytes),recheck={originalEvidence:replayPath,originalSha256:createHash('sha256').update(bytes).digest('hex'),modelCalls:0,
    reason:'Offline assertion correction accepts both 7 PM and 7:00 PM. Ambiguity also checks proposed mutation rather than storage attempts alone. Original ledger and failures remain unchanged.',cases:[]};
  for(const row of original.cases){const scenario=cases.find(value=>value.name===row.name);assert(scenario,'Saved case must match the harness');
    const result={name:row.name,originalPassed:row.passed,originalFailure:row.failure,networkRequests:row.networkRequests,passed:false,...(row.budgetStopped?{budgetStopped:true}:{})};recheck.cases.push(result);
    try{scenario.verify({state:row.finalState,attempts:row.attempts,writes:row.writes,calls:row.tools,now:scenario.now},row.answer,row.proposals);assert.equal(row.answer.result.status,'succeeded','Original production runner must have completed');result.passed=true;}catch(error){result.failure=error.message;process.exitCode=1;}
  }
  const target=join(replayPath.slice(0,replayPath.lastIndexOf('/')),`offline-assertion-recheck-${Date.now()}.json`);await writeFile(target,JSON.stringify(recheck,null,2)+'\n',{mode:0o600});console.log(JSON.stringify({evidence:target,modelCalls:0,cases:recheck.cases}));process.exit();
}
if(!process.argv.includes('--live-model')){console.log(JSON.stringify({modelCalls:0,cases:cases.map(row=>row.name),instructions:'Use --self-check offline, or --live-model after setup review.'}));process.exit(0);}

const config=readConfig();assert(config.configured,'Configured model unavailable; credentials are never printed');
const maxRequests=Number(process.argv.find(value=>value.startsWith('--max-requests='))?.slice(15)??24);
assert(Number.isInteger(maxRequests)&&maxRequests>=1&&maxRequests<=24,'Hard total inference cap must be 1 through 24');
const chosen=cases.filter(row=>!selected.length||selected.includes(row.name));assert(chosen.length,'No matching scenario');
const files=['server/chat-runner.js','server/assistant-context.js','server/chat-behavior.js','server/chat-request-context.js','server/chat-discord-context.js','server/providers/index.js','server/providers/retry.js','server/config.js','server/time-zone.js','server/tool-diagnostics.js','server/map/chat-time.js','server/map/events.js','server/map/contracts.js','server/map/source-access.js','server/map/read-comparison.js','server/automation/local-clock-boundary.js','server/automation/validation.js','tools/map/chat.js','tools/map/index.js','tests/fixtures/chat-map-time.mjs','tests/chat-map-time-model.mjs'];
const hashes=async()=>Object.fromEntries(await Promise.all(files.map(async path=>[path,createHash('sha256').update(await readFile(new URL(`../${path}`,import.meta.url))).digest('hex')])));
const pins=await hashes(),directory=await mkdtemp(join(tmpdir(),'flock-chat-map-time-')),evidence=join(directory,'evidence.json');
await chmod(directory,0o700);
for(const file of files){const target=join(directory,'source',file);await mkdir(dirname(target),{recursive:true});await writeFile(target,await readFile(new URL(`../${file}`,import.meta.url)),{mode:0o600});}
const report={provider:config.provider,model:config.model,maxRequests,networkRequests:0,startedAt:new Date().toISOString(),selectedCases:chosen.map(row=>row.name),pins,cases:[],limitations:['Simulated map persistence; no live DB, source or Calendar writes.','Synthetic trusted Discord actor, not browser identity.','Machine assertions require a separate semantic review of proposed tools and final replies.']};
const persist=()=>writeFile(evidence,JSON.stringify(report,null,2)+'\n',{mode:0o600});await persist();
let active;const originalFetch=globalThis.fetch;
const endpoint=`${config.baseUrl.replace(/\/$/,'')}/${config.provider==='anthropic'?'messages':'chat/completions'}`;
globalThis.fetch=async(value,options)=>{
  assert.equal(String(value),endpoint,'Network is restricted to the configured inference endpoint');
  assert.deepEqual(await hashes(),pins,'Pinned production/test files changed before dispatch');
  if(report.networkRequests>=maxRequests||active.networkRequests>=7){active.budgetStopped=true;throw Error('Hard inference dispatch cap reached');}
  report.networkRequests++;active.networkRequests++;await persist();
  return originalFetch(value,{...options,redirect:'error'});
};
const raw=createProvider(config,{audit:{required:false,startModel:async()=>({status:'ready'}),finishModel:async()=>({status:'ready'})},fetchImpl:globalThis.fetch,writeDiagnostic:()=>{}});
const provider={toolTurn:async args=>{const turn=await raw.toolTurn(args);active.proposals.push(turn.toolCalls);await persist();return turn;},planTools:async args=>{const calls=await raw.planTools(args);active.proposals.push(calls);await persist();return calls;},async *stream(args){yield* raw.stream(args);}};
try{for(const scenario of chosen){
  active={name:scenario.name,networkRequests:0,passed:false,proposals:[],messages:scenario.messages};report.cases.push(active);
  const f=fixture(scenario),started=performance.now();
  try{const answer=await f.run(provider,config,scenario.messages,{signal:AbortSignal.timeout(90000)});Object.assign(active,{answer,tools:f.calls,attempts:f.attempts,writes:f.writes,finalState:f.state});assert.equal(answer.result.status,'succeeded','Production chat runner must complete');scenario.verify(f,answer,active.proposals);active.passed=true;}
  catch(error){active.failure=error.message;Object.assign(active,{tools:f.calls,attempts:f.attempts,writes:f.writes,finalState:f.state});process.exitCode=1;}
  active.durationMs=Math.round(performance.now()-started);await persist();console.log(JSON.stringify({case:active.name,passed:active.passed,networkRequests:active.networkRequests,durationMs:active.durationMs,...(active.failure?{failure:active.failure}:{})}));
}}
finally{globalThis.fetch=originalFetch;report.finishedAt=new Date().toISOString();report.pinsStable=JSON.stringify(await hashes())===JSON.stringify(pins);await persist();}
console.log(JSON.stringify({evidence,model:report.model,networkRequests:report.networkRequests,passed:report.cases.every(row=>row.passed),pinsStable:report.pinsStable}));
