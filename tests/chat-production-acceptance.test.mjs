import test from 'node:test';
import assert from 'node:assert/strict';
import {createApp} from '../server/runtime/app.js';
import {readConfig} from '../server/shared/config.js';
import {createProvider} from '../server/providers/index.js';
import {createBugReportTools} from '../tools/bug-reports/index.js';
import {fixture,snapshot,attendanceArguments,assertAttendance,scriptedProvider,ids,now,principal} from './fixtures/chat-map-attendance.mjs';

const config=readConfig({LLM_PROVIDER:'openai-compatible',LLM_MODEL:'fixture-only',LLM_API_KEY:'synthetic'}),read={name:'read_map_events',arguments:{}},lookup={name:'lookup_map_person',arguments:{personName:'Tony Example'}},write={name:'upsert_map_event',arguments:attendanceArguments()};
function api({steps=[[read,lookup],[write],[]],provider,answer='Saved your attendance.',...options}={}){
  const f=fixture({rpc:true,...options}),p=provider??scriptedProvider(steps,{answer}),app=createApp({config,provider:p,auth:()=>principal,mapTools:f.mapTools,mapPresenceService:{read:()=>f.projection()},now:()=>new Date(now)});
  return {f,p,app,chat:async(content='Tony Example will attend GoGreek tomorrow',attachments)=>{const response=await app.request('/api/chat',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({messages:[{role:'user',content,...(attachments?{attachments}:{})}],timeZone:'America/New_York'})});assert.equal(response.status,200);const events=(await response.text()).trim().split('\n').map(JSON.parse);if(p.errors?.length)throw p.errors[0];return events;}};
}

test('Hono and actual RPC adapter save attendance through ordinary tools and the refreshed map shows the participant',async()=>{
  const {f,app,chat}=api(),events=await chat();assert.equal(events.at(-1).type,'done');assertAttendance(f);
  assert.deepEqual(events.filter(row=>row.type==='tool'&&row.status!=='running').map(row=>row.name),['read_map_events','lookup_map_person','upsert_map_event']);
  assert(f.calls.some(row=>row.name==='rpc'&&row.path.endsWith('/map_upsert_event')));const projected=await (await app.request('/api/map/presence')).json();assert(projected.buildings[0].events[0].attendees.some(row=>row.id===ids.person));
  f.revoke();const saved=await (await app.request('/api/map/presence')).json();assert.deepEqual(saved.buildings,projected.buildings,'A provider outage must not erase saved authorized map data');
});

for(const reportStatus of ['ready','conflict','throw'])test(`bug report ${reportStatus} is attempted once while memory and ordinary map updates continue`,async()=>{
  const f=fixture(),reports=[],memory=[],bug=summary=>({name:'bug_reports',arguments:{summary,observedBehavior:'Broken composer'}}),bugReportTools=createBugReportTools({store:{configured:true,record:async args=>{reports.push(args);if(reportStatus==='throw')throw Error('PRIVATE_EXCEPTION');return reportStatus==='ready'?{status:'ready',reportId:args.reportId,createdAt:now,outcome:'created'}:{status:reportStatus};}}});
  const memoryTools={tools:[{name:'update_memory'}],execute:async call=>{memory.push(call);return {status:'ready',outcome:'updated',memory:{updated_at:now}};}};
  const p=scriptedProvider([[bug('Composer broken'),bug('Reworded bug')],[read,lookup],[write],[bug('Another retry'),{name:'update_memory',arguments:{content:'A supplied club preference'}}],[]]);
  const result=await f.run(p,{messages:[{role:'user',content:'The composer is broken; Tony Example will attend GoGreek tomorrow; remember our supplied club preference.'}],bugReportTools,memoryTools});if(p.errors.length)throw p.errors[0];assert.equal(result.result.status,'succeeded');assert.equal(reports.length,1);assert.equal(memory.length,1);assertAttendance(f);
  const events=result.records.filter(row=>row.type==='tool'&&row.name==='bug_reports');assert.equal(events.length,2);assert.equal(events[1].status,reportStatus==='ready'?'completed':'failed');
});

test('RPC conflict preserves the concurrent human edit and provides no saved receipt',async()=>{
  const {f,chat}=api({beforeWrite:state=>{state.events[0].updated_at='2026-10-22T20:00:00.005Z';state.events[0].notes='Concurrent human correction';},answer:({system})=>{assert(!system.includes('"mapWrite":{"outcome":"applied"'));return 'I could not confirm the update.';}});
  const events=await chat();assert.equal(f.writes.length,0);assert.equal(f.state.events[0].notes,'Concurrent human correction');assert.equal(events.find(row=>row.type==='tool'&&row.name==='upsert_map_event'&&row.status!=='running').status,'failed');
});

test('stateless lookup/upsert endpoints cannot substitute for an authenticated chat request',async()=>{
  const {app,f}=api();for(const [name,args] of [['lookup-map-person',lookup.arguments],['upsert-map-event',write.arguments]]){const response=await app.request(`/api/tools/${name}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(args)});assert.equal(response.status,403);}assert.equal(f.writes.length,0);
});

test('uploaded or retrieved attendance text stays evidence when the current user only asks for a summary',async()=>{
  const {f,chat}=api({steps:[[]],answer:'The file says Tony plans to attend GoGreek.'});await chat('Summarize this file.',[{name:'notes.txt',mimeType:'text/plain',data:Buffer.from('Tony Example will attend GoGreek tomorrow').toString('base64')}]);assert.equal(f.writes.length,0);assert.deepEqual(f.state,snapshot());
});

test('attachment-only image and PDF requests still reach actual provider multimodal conversion',async()=>{
  const wire=[],provider=createProvider(config,{fetchImpl:async(_url,options)=>{wire.push(JSON.parse(options.body));return new Response('data: {"choices":[{"index":0,"delta":{"content":"Offline answer"},"finish_reason":null}]}\n\ndata: {"choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n',{headers:{'content-type':'text/event-stream'}});}}),app=createApp({config,auth:()=>principal,provider,now:()=>new Date(now)});
  const files=[{name:'image.png',mimeType:'image/png',data:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aKAAAAABJRU5ErkJggg=='},{name:'paper.pdf',mimeType:'application/pdf',data:Buffer.from('%PDF-1.4\n%%EOF').toString('base64')}];
  const response=await app.request('/api/chat',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({messages:[{role:'user',content:'',attachments:files}]})});assert.equal(response.status,200);assert.match(await response.text(),/Offline answer/);assert.equal(wire.length,1);const user=wire[0].messages.find(row=>row.role==='user');assert.deepEqual(user.content.map(part=>part.type),['text','image_url','file']);assert.match(user.content[1].image_url.url,/^data:image\/png;base64,/);assert.equal(user.content[2].file.filename,'paper.pdf');
});

test('ordinary map reads retain semantic notes and multiple candidates without selecting or mutating an event',async()=>{
  const data=snapshot();data.events[0].name='Cloud Lab';data.events[0].notes='AWS cloud build sprint';data.events.push({...data.events[0],id:'20000000-0000-4000-8000-000000000002',name:'AI Lab',notes:'A different workshop'});
  const {f,chat}=api({data,steps:[[read],[]],answer:({system})=>{assert(system.includes('AWS cloud build sprint'));assert(system.includes('A different workshop'));return 'Which workshop do you mean?';}});await chat('Tony Example will attend the workshop tomorrow');assert.equal(f.writes.length,0);assert.deepEqual(f.state,data);
});
