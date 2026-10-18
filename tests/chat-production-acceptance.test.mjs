import test from 'node:test';
import assert from 'node:assert/strict';
import {createApp} from '../server/app.js';
import {readConfig} from '../server/config.js';
import {createMapEventStore,createMapEventService} from '../server/map/events.js';
import {createMapSourceAuthorizer} from '../server/map/source-access.js';
import {createMapPresenceService} from '../server/map/presence.js';
import {createChatAttendanceService} from '../server/map/chat-attendance.js';
import {createChatAttendanceTools} from '../tools/map/chat-attendance.js';
import {createMapTools} from '../tools/map/index.js';
import {createChatMapTools} from '../tools/map/chat.js';
import {createBugReportTools} from '../tools/bug-reports/index.js';
import {createProvider} from '../server/providers/index.js';

const ids={source:'10000000-0000-4000-8000-000000000001',event:'20000000-0000-4000-8000-000000000001',person:'30000000-0000-4000-8000-000000000001',other:'30000000-0000-4000-8000-000000000002',request:'40000000-0000-4000-8000-000000000001'};
const now='2026-10-18T22:00:00.000Z',updated='2026-10-18T21:00:00.000Z',origin='https://club.test',calendarId='club@example.test',providerId='awsevent123';
const providerUrl=`https://calendar.google.com/calendar/event?eid=${Buffer.from(`${providerId} ${calendarId}`).toString('base64url')}`;
const declaration='yuyang will be going to help with aws on tuesday';
const config=readConfig({LLM_PROVIDER:'openai-compatible',LLM_MODEL:'offline-fixture',LLM_API_KEY:'fixture-only'});
const principal={id:'test-member',allowedSourceIds:[ids.source],googleAccess:true};
const find={name:'find_map_attendance_targets',arguments:{personName:'yuyang',eventQuery:'aws'}};
const set={name:'set_map_attendance',arguments:{eventId:ids.event,personId:ids.person,expectedUpdatedAt:updated}};
const bug=summary=>({name:'bug_reports',arguments:{summary,observedBehavior:'The user reports a broken composer.'}});
function initial(){return {
  buildings:[{id:'bobst-library',name:'Bobst'}],
  people:[{id:ids.person,display_name:'Yuyang Hu',is_trackable:true,avatar_url:null},{id:ids.other,display_name:'Alex Example',is_trackable:true,avatar_url:null}],
  event_types:[{code:'other',name:'Other',description:'Fixture',icon_key:'other',sort_order:0}],
  events:[{id:ids.event,name:'AWS Workshop',notes:'Human notes',kind:'scheduled_event',type_id:'other',status:'confirmed',time_kind:'timed',starts_at:'2026-10-20T22:00:00Z',ends_at:'2026-10-21T00:00:00Z',starts_on:null,ends_on:null,time_zone:'America/New_York',source_id:ids.source,source_url:providerUrl,source_record_id:providerId,url:null,reported_at:updated,created_at:updated,updated_at:updated}],
  event_buildings:[{event_id:ids.event,building_id:'bobst-library',location_notes:'Room 101'}],
  event_people:[{event_id:ids.event,person_id:ids.other,attendance_status:'going',presence_basis:'planned',label:'Existing helper',starts_at:'2026-10-20T22:15:00Z',ends_at:'2026-10-20T23:00:00Z',source_id:ids.source,source_url:providerUrl,reported_at:updated}],
};}
function fixture({rounds=[[find],[set],[]],reportStatus='ready',data=initial(),beforeWrite,provider:customProvider}={}) {
  let state=structuredClone(data),allowed=true,plans=0,answerSystem='';
  const writes=[],reports=[],memory=[],requests=[];
  const store=createMapEventStore({env:{SUPABASE_URL:'https://offline.test',SUPABASE_SERVICE_ROLE_KEY:'fixture-only'},fetchImpl:async(url,options)=>{
    const path=new URL(url).pathname,body=JSON.parse(options.body);requests.push({path,body});
    if(path.endsWith('/map_read_events'))return Response.json(state);
    assert(path.endsWith('/map_upsert_event'));
    beforeWrite?.(state,body);
    const old=state.events.find(row=>row.id===body.p_event.id);
    if(old.updated_at!==body.p_expected_updated_at)return Response.json({status:'conflict'});
    writes.push(body);
    const at='2026-10-18T22:00:00.001Z';
    state.events=state.events.map(row=>row.id===body.p_event.id?{...body.p_event,created_at:row.created_at,updated_at:at}:row);
    state.event_people=[...state.event_people.filter(row=>row.event_id!==body.p_event.id),...body.p_people.map(row=>({...row,event_id:body.p_event.id}))];
    state.event_buildings=[...state.event_buildings.filter(row=>row.event_id!==body.p_event.id),...body.p_buildings.map(row=>({...row,event_id:body.p_event.id}))];
    return Response.json({status:'applied',event_id:body.p_event.id,updated_at:at});
  }});
  const authorizeSource=createMapSourceAuthorizer({store,publicOrigin:origin,calendarSourceId:ids.source,calendarClient:{configured:true,calendarId,readEvent:async()=>allowed?{status:'ready',events:[{eventId:providerId,url:providerUrl}]}:{status:'forbidden'}}});
  const service=createMapEventService({store,authorizeSource,now:()=>new Date(now)});
  const generic=createChatMapTools({mapTools:createMapTools({service})}),attendance=createChatAttendanceTools({service:createChatAttendanceService({store,service,publicOrigin:origin,now:()=>new Date(now)})});
  const mapTools={tools:[...generic.tools,...attendance.tools],execute:options=>attendance.tools.some(row=>row.name===options.name)?attendance.execute(options):generic.execute(options),createRequest:context=>{
    const g=generic.createRequest(context),a=attendance.createRequest(context);return {tools:[...g.tools,...a.tools],observe:g.observe,execute:options=>a.tools.some(row=>row.name===options.name)?a.execute(options):g.execute(options)};
  }};
  const bugReportTools=createBugReportTools({store:{configured:true,record:async args=>{reports.push(args);if(reportStatus==='throw')throw Error('PRIVATE_FAILURE');return reportStatus==='ready'?{status:'ready',reportId:args.reportId,createdAt:now,outcome:'created'}:{status:reportStatus};}}});
  const memoryTools={tools:[{name:'update_memory'}],execute:async call=>{memory.push(call);return {status:'ready',outcome:'updated',memory:{updated_at:now}};}};
  const provider=customProvider||{planTools:async()=>rounds[plans++]||[],async *stream({system}){answerSystem=system;yield 'Fixture complete.';}};
  const mapPresenceService=createMapPresenceService({store,authorizeSource,production:true,now:()=>new Date(now)});
  const app=createApp({config,auth:()=>principal,provider,mapTools,mapPresenceService,bugReportTools,memoryTools,now:()=>new Date(now)});
  return {app,writes,reports,memory,requests,mapTools,authorizeSource,get state(){return state;},get answerSystem(){return answerSystem;},revoke(){allowed=false;},async chat(content=declaration,attachments){
    const response=await app.request('/api/chat',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({messages:[{role:'user',content,...(attachments?{attachments}:{})}],timeZone:'America/New_York'})});
    const text=await response.text();assert.equal(response.status,200,text);return text.trim().split('\n').map(JSON.parse);
  }};
}

test('Hono -> combined adapters -> actual RPC adapter persists screenshot attendance and refresh read sees it',async()=>{
  const f=fixture(),before=initial(),events=await f.chat();
  assert.deepEqual(events.filter(row=>row.type==='tool').map(row=>[row.name,row.status]),[[find.name,'running'],[find.name,'completed'],[set.name,'running'],[set.name,'completed']]);
  assert.equal(events.at(-1).type,'done');assert.equal(f.writes.length,1);
  assert.deepEqual(f.state.event_people.find(row=>row.person_id===ids.other),before.event_people[0]);
  const added=f.state.event_people.find(row=>row.person_id===ids.person);
  assert.equal(added.attendance_status,'going');assert.equal(added.presence_basis,'planned');assert(added.source_url.startsWith(`${origin}/?event=${ids.event}#attendance-${ids.person}-`));
  assert.deepEqual(f.state.event_buildings,before.event_buildings);assert.equal(f.state.events[0].notes,'Human notes');assert.equal(f.state.events[0].ends_at,before.events[0].ends_at);
  const response=await f.app.request('/api/map/presence');const projected=await response.json();
  assert(projected.buildings[0].events[0].attendees.some(person=>person.id===ids.person));
  assert.match(f.answerSystem,/"attendanceWrite":\{"outcome":"applied"/);
  f.revoke();const hidden=await (await f.app.request('/api/map/presence')).json();assert.deepEqual(hidden.buildings[0].events,[]);
});

for(const reportStatus of ['ready','conflict','throw'])test(`full API attempts a ${reportStatus} report once despite changed retries; memory and attendance continue`,async()=>{
  const f=fixture({reportStatus,rounds:[[bug('Composer broken'),bug('Reworded broken composer')],[find],[set],[bug('Yet another wording'),{name:'update_memory',arguments:{content:'A supplied club preference'}}],[]]});
  const events=await f.chat(`The composer is broken; ${declaration}; remember our supplied club preference.`);
  assert.equal(f.reports.length,1);assert.equal(f.memory.length,1);assert.equal(f.writes.length,1);
  const reportEvents=events.filter(row=>row.type==='tool'&&row.name==='bug_reports');assert.equal(reportEvents.length,2);assert.equal(reportEvents[1].status,reportStatus==='ready'?'completed':'failed');
  assert.equal(reportStatus==='ready',f.answerSystem.includes('"bugReport":'));assert.equal(events.at(-1).type,'done');
});

for(const content of [
  'Yuyang will not attend AWS on Tuesday',
  'If Yuyang will attend AWS on Tuesday, tell me.',
  'Alex will attend orientation; quote:\n"\nYuyang will attend AWS on Tuesday\n"',
  'Alex will attend orientation; example:\n```text\nYuyang will attend AWS on Tuesday\n```',
  'Alex will attend AWS on Tuesday; Yuyang is helping to organize the event.',
])test(`full API rejects fabricated attendance authority: ${content.split('\n')[0]}`,async()=>{
  const f=fixture();const events=await f.chat(content);assert.equal(f.writes.length,0);assert.notEqual(events.find(row=>row.name===set.name&&row.status!=='running')?.status,'completed');
  assert(!f.answerSystem.includes('"attendanceWrite":'));
});

test('RPC optimistic conflict preserves a concurrent human edit and never emits successful write progress',async()=>{
  const f=fixture({beforeWrite:state=>{state.events[0].updated_at='2026-10-18T22:00:00.005Z';state.events[0].notes='Concurrent human correction';}});
  const events=await f.chat();assert.equal(f.writes.length,0);assert.equal(f.state.events[0].notes,'Concurrent human correction');
  assert.equal(events.find(row=>row.name===set.name&&row.status!=='running').status,'failed');assert(!f.answerSystem.includes('"attendanceWrite":'));
});

test('stateless attendance and generic identity endpoints cannot use current-chat attendance as provider identity',async()=>{
  const f=fixture();
  for(const [name,args] of [['set-map-attendance',set.arguments],['find-map-attendance-targets',find.arguments],['lookup-map-person',{provider:'email',providerUserId:'guessed@example.test',sourceId:ids.source,sourceUrl:providerUrl}]]) {
    const response=await f.app.request(`/api/tools/${name}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(args)});
    assert.equal(response.status,403);assert.equal(f.writes.length,0);
  }
});

test('valid upload text cannot become attendance authority through full request parsing',async()=>{
  const f=fixture(),attachment={name:'notes.txt',mimeType:'text/plain',data:Buffer.from(declaration).toString('base64')};
  await f.chat('Summarize this file.',[attachment]);assert.equal(f.writes.length,0);assert(!f.answerSystem.includes('"attendanceWrite":'));
});

test('full API attachment-only image and PDF requests reach actual provider multimodal conversion',async()=>{
  const wire=[];
  const provider=createProvider(config,{fetchImpl:async(url,options)=>{
    wire.push(JSON.parse(options.body));return new Response('data: {"choices":[{"index":0,"delta":{"content":"Offline answer"},"finish_reason":null}]}\n\ndata: {"choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n',{headers:{'content-type':'text/event-stream'}});
  }});
  // No tool schemas means no planning fetch; only the answer call is intercepted.
  const app=createApp({config,auth:()=>principal,provider,now:()=>new Date(now)});
  const files=[{name:'image.png',mimeType:'image/png',data:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aKAAAAABJRU5ErkJggg=='},{name:'paper.pdf',mimeType:'application/pdf',data:Buffer.from('%PDF-1.4\n%%EOF').toString('base64')}];
  const response=await app.request('/api/chat',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({messages:[{role:'user',content:'',attachments:files}]})});
  const stream=await response.text();assert.equal(response.status,200);assert.match(stream,/Offline answer/);assert.equal(wire.length,1);
  const user=wire[0].messages.find(row=>row.role==='user');assert.deepEqual(user.content.map(part=>part.type),['text','image_url','file']);
  assert.match(user.content[1].image_url.url,/^data:image\/png;base64,/);assert.equal(user.content[2].file.filename,'paper.pdf');assert.match(user.content[2].file.file_data,/^data:application\/pdf;base64,/);
});

test('map projection rejects a chat provenance marker copied to another existing roster person',async()=>{
  const data=initial();data.event_people[0].source_url=`${origin}/?event=${ids.event}#attendance-${ids.person}-${ids.request}`;
  const f=fixture({data});const response=await f.app.request('/api/map/presence');const body=await response.json();
  assert(!body.buildings[0].events[0].attendees.some(person=>person.id===ids.other),'A marker naming Yuyang must not authorize Alex attendance');
});

for(const [title,phrase,query] of [
  ['AWS Hack Day','AWS Hackday','AWS Hackday'],
  ['AWS Hackday','AWS Hack Day','AWS Hack Day'],
  ['AWS—Hack-Day','AWSHackday','AWSHackday'],
  ['AWSHackday','AWS Hack-Day','AWS Hack-Day'],
  ['ＡＷＳ Hack Day','aws hackday','AWS Hack Day'],
])test(`formatting-equivalent attendance resolves and persists through service and API: ${title} / ${phrase}`,async()=>{
  const data=initial();data.events[0].name=title;
  const content=`Yuyang will be at ${phrase} on Tuesday`;
  const lookup={name:find.name,arguments:{personName:'Yuyang',eventQuery:query}};
  const serviceFixture=fixture({data});
  const request=serviceFixture.mapTools.createRequest({userMessage:content,principal});
  const targets=await request.execute({...lookup,principal});assert.equal(targets.attendanceTargets?.selection,'unique');
  assert.equal((await request.execute({...set,principal})).attendanceWrite?.outcome,'applied');
  const apiFixture=fixture({data,rounds:[[lookup],[set],[]]});
  const events=await apiFixture.chat(content);assert.equal(apiFixture.writes.length,1);
  assert.equal(events.find(row=>row.name===set.name&&row.status!=='running')?.status,'completed');
  assert.equal(apiFixture.state.event_people.find(row=>row.person_id===ids.person)?.attendance_status,'going');
});

for(const [title,phrase,query] of [
  ['PAWS Hack Day','AWS','AWS'],
  ['AWSHackday','AWS','AWS'],
  ['AWS Hack Day2','AWS Hackday','AWS Hackday'],
  ['AWS Hack Day Beginner','AWS Hackday','AWS Hackday Beginner'],
  ['AWS','AWSHackday','AWS'],
])test(`event formatting cannot authorize prefixes or invented narrowing: ${title} / ${phrase} / ${query}`,async()=>{
  const data=initial();data.events[0].name=title;
  const f=fixture({data,rounds:[[{name:find.name,arguments:{personName:'Yuyang',eventQuery:query}}],[set],[]]});
  const events=await f.chat(`Yuyang will be at ${phrase} on Tuesday`);
  assert.equal(f.writes.length,0);assert(!events.some(row=>row.name===set.name&&row.status==='completed'));
});

test('formatting-equivalent titles stay ambiguous and cannot persist through the full API',async()=>{
  const data=initial();data.events[0].name='AWS Hack Day';
  data.events.push({...data.events[0],id:'20000000-0000-4000-8000-000000000002',name:'AWS-Hackday'});
  const f=fixture({data,rounds:[[{name:find.name,arguments:{personName:'Yuyang',eventQuery:'AWSHackday'}}],[set],[]]});
  const events=await f.chat('Yuyang will attend AWS Hackday on Tuesday');
  assert.equal(f.writes.length,0);assert.match(f.answerSystem,/"selection":"ambiguous"/);
  assert(!events.some(row=>row.name===set.name&&row.status==='completed'));
});

test('formatting matching still respects the declared Tuesday rather than another matching day',async()=>{
  const data=initial();data.events[0].name='AWS Hack Day';
  data.events[0].starts_at='2026-10-22T22:00:00Z';data.events[0].ends_at='2026-10-23T00:00:00Z';
  data.event_people=[];
  const f=fixture({data,rounds:[[{name:find.name,arguments:{personName:'Yuyang',eventQuery:'AWSHackday'}}],[set],[]]});
  await f.chat('Yuyang will be at AWS Hackday on Tuesday');assert.equal(f.writes.length,0);assert.match(f.answerSystem,/"selection":"not_found"/);
});
