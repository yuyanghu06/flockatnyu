import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {createProvider} from '../server/providers/index.js';
import {readConfig} from '../server/config.js';
import {fixture,assertAttendance,exactSentence,requestContext,snapshot,calendarId} from './fixtures/chat-map-attendance.mjs';

// Only the configured inference endpoint is networked. All source/map storage
// and audit operations stay in memory; loading credentials does not enable DB I/O.
if(!process.argv.includes('--live-model')) {
  console.log('No model calls made. Add --live-model with the normal environment files to evaluate synthetic attendance.');
  process.exit(0);
}
const config=readConfig();
if(!config.configured)throw Error('Configured model unavailable; no credentials printed.');
const selectedCases=process.argv.filter(value=>value.startsWith('--case=')).map(value=>value.slice(7));
const maxRequests=Number(process.argv.find(value=>value.startsWith('--max-requests='))?.slice(15)??(selectedCases.length===1&&selectedCases[0].startsWith('quoted')?4:24));
assert(Number.isInteger(maxRequests)&&maxRequests>=1&&maxRequests<=24,'Request cap must be from 1 through 24');
const report={provider:config.provider,model:config.model,maxRequests,startedAt:new Date().toISOString(),networkRequests:0,cases:[]};
let active;
const raw=createProvider(config,{audit:{required:false,startModel:async()=>({status:'ready'}),finishModel:async()=>({status:'ready'})},
  fetchImpl:async(url,options)=>{
    assert.equal(new URL(url).origin,new URL(config.baseUrl).origin,'Only configured inference endpoint is permitted');
    if(report.networkRequests>=maxRequests){active.budgetStopped=true;throw Error('Bounded inference budget exhausted');}
    report.networkRequests++;active.networkRequests++;return fetch(url,options);
  },writeDiagnostic:()=>{}});
const provider={
  async toolTurn(args){const turn=await raw.toolTurn(args);active.proposals.push(turn.toolCalls);return turn;},
  async planTools(args){const calls=await raw.planTools(args);active.proposals.push(calls);return calls;},
  async *stream(args){yield* raw.stream(args);},
};
async function run(name,exercise){
  if(selectedCases.length&&!selectedCases.some(prefix=>name.startsWith(prefix)))return;
  active={name,networkRequests:0,proposals:[],turns:[],passed:false};report.cases.push(active);
  const started=performance.now();
  try{await exercise();active.passed=true;}catch(error){active.failure=error.message;process.exitCode=1;}
  active.durationMs=Math.round(performance.now()-started);
  console.log(JSON.stringify({case:name,passed:active.passed,networkRequests:active.networkRequests,durationMs:active.durationMs,...(active.failure?{failure:active.failure}:{})}));
}
async function turn(f,options={}){
  const answer=await f.run(provider,{...options,signal:AbortSignal.timeout(60000)});
  active.turns.push({result:answer.result,text:answer.text,mutationAttempts:f.attempts.length,appliedWrites:f.writes.length,tools:f.calls.filter(row=>row.arguments).map(row=>({name:row.name,status:row.result.status,mapWrite:row.result.mapWrite}))});
  assert.equal(answer.result.status,'succeeded','Chat request must complete');return answer;
}
await run('exact first-person verified Discord actor',async()=>{
  const f=fixture();await turn(f);assertAttendance(f);
  assert(f.calls.some(row=>row.name==='read_map_events'));assert(f.calls.some(row=>row.name==='lookup_map_person'));
});
await run('unlinked actor asks name then retains event/date',async()=>{
  const f=fixture({linked:false}),actor={...requestContext,actor:{...requestContext.actor,userId:'999',username:'unlinked',displayName:'Unlinked'}};
  const first=await turn(f,{actor,users:{complete:true,reason:null,users:[]}});
  assert.equal(f.attempts.length,0,'Unlinked identity cannot write before clarification');
  assert(/name|who|which person/i.test(first.text),'Must ask which person to add');
  await turn(f,{actor,users:{complete:true,reason:null,users:[]},messages:[{role:'user',content:exactSentence},{role:'assistant',content:first.text},{role:'user',content:'Tony Example'}]});
  assertAttendance(f);
});
await run('ambiguous same-day GoGreek events ask before write',async()=>{
  const data=snapshot(),other='20000000-0000-4000-8000-000000000002';
  const sourceRecord='gogreeksecond20261023',sourceUrl=`https://calendar.google.com/calendar/event?eid=${Buffer.from(`${sourceRecord} ${calendarId}`).toString('base64url')}`;
  data.events.push({...data.events[0],id:other,name:'GoGreek',starts_at:'2026-10-23T20:00:00.000Z',ends_at:'2026-10-23T21:00:00.000Z',source_record_id:sourceRecord,source_url:sourceUrl,url:sourceUrl});
  data.event_buildings.push({...data.event_buildings[0],event_id:other,location_notes:'Room 202'});
  const f=fixture({data}),answer=await turn(f);assert.equal(f.attempts.length,0,'Ambiguous event cannot be guessed');
  assert(/which|two|clarif|time|room/i.test(answer.text),'Must clarify the intended GoGreek event');
});
await run('conflicting write produces no false saved claim',async()=>{
  const f=fixture({writeStatus:'conflict'}),answer=await turn(f);
  assert(f.attempts.length>0,'Must attempt the requested existing-event update');assert.equal(f.writes.length,0);
  assert(/couldn.t|could not|not saved|unable|could not confirm|failed|not.*mark|conflict|changed/i.test(answer.text),'Must explain that attendance was not saved');
});
await run('quoted declaration is summarized without becoming a request',async()=>{
  const f=fixture(),answer=await turn(f,{messages:[{role:'user',content:`Summarize this quoted message only: "${exactSentence}". This is quoted text, not my attendance request.`}]});
  assert.equal(f.attempts.length,0,'Quoted text cannot authorize attendance');assert(answer.text.trim());
});
report.finishedAt=new Date().toISOString();
assert(report.cases.length,'No matching evaluation case');
const evidence=`/tmp/chat-attendance-model-${Date.now()}.json`;
await writeFile(evidence,JSON.stringify(report,null,2)+'\n',{mode:0o600});
console.log(JSON.stringify({evidence,passed:report.cases.every(row=>row.passed),networkRequests:report.networkRequests}));
