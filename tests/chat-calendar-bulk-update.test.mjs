import test from 'node:test';
import assert from 'node:assert/strict';
import {createCalendarClient} from '../server/google/calendar-client.js';
import {readCalendarConfig,CALENDAR_REQUIRED_SCOPES} from '../server/google/calendar-config.js';
import {createChatCalendarTools} from '../tools/calendar/chat.js';
import {createProvider} from '../server/providers/index.js';
import {createApp} from '../server/runtime/app.js';
import {checkSchema,validateArguments} from '../server/automation/validation.js';

const calendarId='synthetic-club@group.calendar.google.com',principal={id:'synthetic-corrector',googleAccess:true,allowedSourceIds:[]};
const title='Synthetic office hours';
const dates=[];
for(let stamp=Date.parse('2026-09-01T00:00:00Z');stamp<=Date.parse('2026-11-26T00:00:00Z');stamp+=86400000){const day=new Date(stamp).getUTCDay();if(day===2||day===4)dates.push(new Date(stamp).toISOString().slice(0,10));}
const nextDate=value=>new Date(Date.parse(value+'T00:00:00Z')+86400000).toISOString().slice(0,10);
const oldEvent=(date,index)=>({id:'wrong_'+String(index).padStart(3,'0'),summary:title,start:{date},end:{date:nextDate(date)},description:'Preserve human description '+index,location:'Preserve room '+index,status:'confirmed',etag:'"initial-'+index+'"',extendedProperties:{private:{humanNote:'preserve'}}});
const rows=dates.map((date,index)=>{const tuesday=new Date(date+'T00:00:00Z').getUTCDay()===2;return {eventId:'wrong_'+String(index).padStart(3,'0'),date,startTime:tuesday?'18:00':'17:00',endTime:tuesday?'19:00':'18:00',timeZone:'America/New_York'};});
const verboseOriginals=()=>dates.map((date,index)=>({...oldEvent(date,index),description:`Synthetic human note ${index}: `.padEnd(1800,'n')}));

// Google PATCH recursively merges nested objects. Null deletes a nested member;
// replacing the entire object in a fake server would conceal invalid date/time
// conversions that the real API rejects.
function mergePatch(current,patch) {
 const next=structuredClone(current);
 for(const [key,value] of Object.entries(patch)){if(value===null)delete next[key];else if(value&&typeof value==='object'&&!Array.isArray(value))next[key]=mergePatch(next[key]||{},value);else next[key]=structuredClone(value);}
 return next;
}
function fixture({originals=dates.map(oldEvent),googleAccess=true,role='writer',raceId,failId,abortAfter}={}) {
 const events=new Map(originals.map(event=>[event.id,structuredClone(event)])),calls=[],patches=[],reads=new Map(),oauth=[];
 let changed=0;
 const production=createCalendarClient({config:readCalendarConfig({GOOGLE_CLIENT_ID:'synthetic',GOOGLE_CLIENT_SECRET:'synthetic',GOOGLE_REFRESH_TOKEN:'synthetic',GOOGLE_EXPECTED_ACCOUNT_EMAIL:'club@example.com',GOOGLE_CALENDAR_ID:calendarId}),
  oauthClient:{setCredentials(){},getAccessToken:async()=>{oauth.push('token');return {token:'synthetic'};},getTokenInfo:async()=>({scopes:CALENDAR_REQUIRED_SCOPES})},fetchImpl:async(value,options)=>{
   const url=new URL(value);calls.push({url,options});assert.equal(options.redirect,'error');
   if(url.hostname==='gmail.googleapis.com')return Response.json({emailAddress:'club@example.com'});
   if(url.pathname.includes('/users/me/calendarList/'))return Response.json({id:calendarId,accessRole:role});
   assert.equal(url.origin,'https://www.googleapis.com');const match=/\/calendars\/([^/]+)\/events(?:\/([^/]+))?$/.exec(url.pathname);assert(match);assert.equal(decodeURIComponent(match[1]),calendarId);const id=match[2]&&decodeURIComponent(match[2]);
   if(options.method==='GET'){
    if(id){const count=(reads.get(id)||0)+1;reads.set(id,count);if(raceId===id&&count===2)events.set(id,{...events.get(id),etag:'"human-concurrent"',description:'Concurrent human change'});return events.has(id)?Response.json(events.get(id)):Response.json({error:'missing'},{status:404});}
    const from=Date.parse(url.searchParams.get('timeMin')),to=Date.parse(url.searchParams.get('timeMax')),query=url.searchParams.get('q');
    assert.equal(url.searchParams.get('maxResults'),'25');assert.equal(query,title,'server maps literal query to fixed Google q');
    const matching=[...events.values()].filter(event=>event.summary.includes(query)&&Date.parse(event.end.date||event.end.dateTime)>from&&Date.parse(event.start.date||event.start.dateTime)<to);
    const offset=Number(url.searchParams.get('pageToken')||0);return Response.json({items:matching.slice(offset,offset+25),...(matching.length>offset+25?{nextPageToken:String(offset+25)}:{})});
   }
   assert.equal(options.method,'PATCH','corrections never recreate or delete existing events');assert(id);assert.equal(url.searchParams.get('sendUpdates'),'none');const patch=JSON.parse(options.body);patches.push({id,patch});
   assert.equal(options.headers['If-Match'],events.get(id).etag);for(const key of ['attendees','recurrence','conferenceData','id','summary','description','location','extendedProperties'])assert(!Object.hasOwn(patch,key),'time-only correction must not overwrite '+key);
   if(id===failId)return new Response('PRIVATE_WRITE_FAILURE',{status:503});
   const merged=mergePatch(events.get(id),patch);
   for(const boundary of [merged.start,merged.end]){if(Boolean(boundary.date)===Boolean(boundary.dateTime))return Response.json({error:'date/dateTime conflict'},{status:400});if(boundary.date&&boundary.timeZone)return Response.json({error:'all-day timezone left behind'},{status:400});}
   const saved={...merged,etag:'"updated-'+(++changed)+'"'};events.set(id,saved);return Response.json(saved);
  }});
 const client=abortAfter?{...production,updateChatEvent:async args=>{const result=await production.updateChatEvent(args);if(result.status==='ready'&&changed===abortAfter.count)abortAfter.controller.abort();return result;}}:production;
 const adapter=createChatCalendarTools({client});
 const request=()=>adapter.createRequest({principal:{...principal,googleAccess},operationId:'synthetic-correction'});
 const run=(entries=rows,signal)=>request().execute({name:'update_calendar_events',arguments:{events:entries},signal});
 return {events,calls,patches,reads,oauth,adapter,request,run,client};
}

test('bulk correction converts26 all-day instances to exact timed Tue/Thu hours across DST without changing identities or human fields',async()=>{
 assert.equal(rows.length,26);const originals=dates.map(oldEvent),f=fixture({originals}),result=await f.run();
 assert.equal(result.status,'ready');assert.deepEqual(result.calendarBatchWrite.counts,{requested:26,updated:26,unchanged:0,failed:0,unattempted:0});assert.equal(f.patches.length,26);assert.equal(f.events.size,26);
 assert(!JSON.stringify(result).includes('initial-'),'hidden observed revisions never enter the model-visible batch receipt');
 for(const [index,row] of rows.entries()){
  const saved=f.events.get(row.eventId),prior=originals[index],offset=row.date<'2026-11-01'?'-04:00':'-05:00';
  assert.equal(saved.id,prior.id);assert.equal(saved.summary,prior.summary);assert.equal(saved.description,prior.description);assert.equal(saved.location,prior.location);assert.deepEqual(saved.extendedProperties,prior.extendedProperties);
  assert.equal(saved.start.date,undefined);assert.equal(saved.end.date,undefined);assert.equal(saved.start.timeZone,'America/New_York');assert.equal(Date.parse(saved.start.dateTime),Date.parse(`${row.date}T${row.startTime}:00${offset}`));assert.equal(Date.parse(saved.end.dateTime)-Date.parse(saved.start.dateTime),3600000);
  assert.equal(f.patches[index].patch.start.date,null);assert.equal(f.patches[index].patch.end.date,null);assert((f.reads.get(row.eventId)||0)>=2,'hidden revision is observed and rechecked before patch');
  assert.deepEqual(result.calendarBatchWrite.items[index].calendarWrite.start,saved.start);assert.deepEqual(result.calendarBatchWrite.items[index].calendarWrite.end,saved.end);assert.equal(result.calendarBatchWrite.items[index].calendarWrite.timeZone,'America/New_York');
 }
 const retry=await f.run();assert.equal(retry.status,'ready');assert.equal(retry.calendarBatchWrite.counts.updated,0);assert.equal(retry.calendarBatchWrite.counts.unchanged,26);assert.equal(f.patches.length,26);
});

test('timed-to-all-day corrections null-clear both dateTime and timezone members under recursive PATCH merge',async()=>{
 const event={...oldEvent('2026-09-01',0),start:{dateTime:'2026-09-01T18:00:00-04:00',timeZone:'America/New_York'},end:{dateTime:'2026-09-01T19:00:00-04:00',timeZone:'America/New_York'}};
 const f=fixture({originals:[event]});const result=await f.run([{eventId:event.id,start:{date:'2026-09-01'},end:{date:'2026-09-02'}}]);
 assert.equal(result.status,'ready');assert.deepEqual(f.events.get(event.id).start,{date:'2026-09-01'});assert.deepEqual(f.events.get(event.id).end,{date:'2026-09-02'});
 assert.equal(f.patches[0].patch.start.dateTime,null);assert.equal(f.patches[0].patch.start.timeZone,null);
});

test('unsupported and concurrently edited rows fail independently while later exact IDs still correct',async()=>{
 const originals=dates.slice(0,4).map(oldEvent);originals[0].attendees=[{email:'synthetic@example.test'}];
 const f=fixture({originals,raceId:originals[1].id}),result=await f.run(rows.slice(0,4));assert.equal(result.status,'partial');assert.deepEqual(result.calendarBatchWrite.counts,{requested:4,updated:2,unchanged:0,failed:2,unattempted:0});
 assert.deepEqual(f.events.get(originals[0].id),originals[0]);assert.equal(f.events.get(originals[1].id).description,'Concurrent human change');assert(f.patches.every(patch=>patch.id!==originals[0].id&&patch.id!==originals[1].id));assert.equal(f.patches.length,2);
});

test('write failure continues subsequent corrections with truthful partial receipts',async()=>{
 const f=fixture({failId:rows[1].eventId}),result=await f.run(rows.slice(0,4));assert.equal(result.status,'partial');assert.deepEqual(result.calendarBatchWrite.counts,{requested:4,updated:3,unchanged:0,failed:1,unattempted:0});assert.equal(result.calendarBatchWrite.items[1].calendarWrite,undefined);assert.equal(f.events.get(rows[1].eventId).start.date,rows[1].date);assert.equal(f.events.get(rows[3].eventId).start.date,undefined);assert(!JSON.stringify(result).includes('PRIVATE_WRITE_FAILURE'));
});

test('Google denial precedes all HTTP and lost writer access stops later corrections',async()=>{
 const denied=fixture({googleAccess:false});assert.equal((await denied.run()).status,'forbidden');assert.equal(denied.calls.length,0);assert.equal(denied.oauth.length,0);
 const reader=fixture({role:'reader'}),result=await reader.run();assert.equal(result.status,'partial');assert.equal(reader.patches.length,0);assert.equal(result.calendarBatchWrite.counts.failed,1);assert.equal(result.calendarBatchWrite.counts.unattempted,25);
});

test('aborted correction batches retain earlier successful receipts and perform no later HTTP calls',async()=>{
 const controller=new AbortController(),f=fixture({abortAfter:{count:2,controller}}),result=await f.run(rows,controller.signal);assert.equal(result.status,'partial');assert.deepEqual(result.calendarBatchWrite.counts,{requested:26,updated:2,unchanged:0,failed:0,unattempted:24});assert.equal(f.patches.length,2);const count=f.calls.length;await Promise.resolve();assert.equal(f.calls.length,count);
});

test('bulk update schema forbids alternate calendars, model revisions, unsupported writes and over50 entries',async()=>{
 const f=fixture(),tool=f.adapter.tools.find(tool=>tool.name==='update_calendar_events');assert(tool);assert.equal(checkSchema(tool.parameters),true);
 for(const args of [{events:[]},{events:Array(51).fill(rows[0])},{events:[{...rows[0],expectedEtag:'"model"'}]},{events:[{...rows[0],attendees:[]}]},{events:[{...rows[0],eventId:undefined}]},{events:[rows[0]],calendarId:'other@example.com'}]){const result=await f.request().execute({name:'update_calendar_events',arguments:args});assert.equal(result.status,'invalid_request');}
 assert.equal(validateArguments({events:Array(50).fill(rows[0])},tool.parameters),true);assert.equal(f.calls.length,0);
});

test('mixed or incomplete timing, invalid local DST clocks and empty patches fail their row before fresh reads',async()=>{
 const entries=[{eventId:rows[0].eventId},{eventId:rows[0].eventId,date:'2026-09-01',startTime:'18:00',timeZone:'America/New_York'},
  {eventId:rows[0].eventId,date:'2026-09-01',start:{date:'2026-09-01'},end:{date:'2026-09-02'}},
  {eventId:rows[0].eventId,date:'2026-03-08',startTime:'02:30',endTime:'03:30',timeZone:'America/New_York'},
  {eventId:rows[0].eventId,date:'2026-11-01',startTime:'01:30',endTime:'02:30',timeZone:'America/New_York'}];
 const f=fixture(),result=await f.run(entries);assert.equal(result.status,'partial');assert.equal(result.calendarBatchWrite.counts.failed,entries.length);assert.equal(f.calls.length,0);assert.equal(f.oauth.length,0);assert.equal(f.patches.length,0);
});

test('list query and limit bounds reject malformed arguments before OAuth while default page size remains five',async()=>{
 const f=fixture(),tool=f.adapter.tools.find(tool=>tool.name==='list_calendar_events'),window={timeMin:'2026-09-01T00:00:00Z',timeMax:'2026-11-27T00:00:00Z'};
 assert.equal(checkSchema(tool.parameters),true);
 for(const args of [{...window,limit:26},{...window,query:'x'.repeat(301)},{...window,query:{}},{...window,calendarId:'other@example.com'}]){assert.equal(validateArguments(args,tool.parameters),false);assert.equal((await f.request().execute({name:'list_calendar_events',arguments:args})).status,'invalid_request');}
 assert.equal(f.calls.length,0);assert.equal(f.oauth.length,0);
 let seen;
 const client=createCalendarClient({config:readCalendarConfig({GOOGLE_CLIENT_ID:'synthetic',GOOGLE_CLIENT_SECRET:'synthetic',GOOGLE_REFRESH_TOKEN:'synthetic',GOOGLE_EXPECTED_ACCOUNT_EMAIL:'club@example.com',GOOGLE_CALENDAR_ID:calendarId}),oauthClient:{setCredentials(){},getAccessToken:async()=>({token:'synthetic'}),getTokenInfo:async()=>({scopes:CALENDAR_REQUIRED_SCOPES})},fetchImpl:async value=>{const url=new URL(value);if(url.hostname==='gmail.googleapis.com')return Response.json({emailAddress:'club@example.com'});if(url.pathname.includes('/users/me/calendarList/'))return Response.json({id:calendarId,accessRole:'writer'});seen=url;return Response.json({items:[]});}});
 const request=createChatCalendarTools({client}).createRequest({principal,operationId:'synthetic'});assert.equal((await request.execute({name:'list_calendar_events',arguments:window})).status,'ready');assert.equal(seen.searchParams.get('maxResults'),'5');assert.equal(seen.searchParams.has('q'),false);
});

test('optional literal Calendar query with limit25 returns26 scoped instances in exactly two pages with unchanged window',async()=>{
 const f=fixture(),request=f.request(),window={timeMin:'2026-09-01T00:00:00-04:00',timeMax:'2026-11-27T00:00:00-05:00',query:title,limit:25};
 const first=await request.execute({name:'list_calendar_events',arguments:window});assert.equal(first.status,'ready');assert.equal(first.calendarContext.events.length,26);assert.equal(first.calendarContext.nextPageToken,undefined);assert.equal(first.coverage.complete,true);
 const lists=f.calls.filter(call=>call.url.pathname.endsWith('/events'));assert.equal(lists.length,2);for(const key of ['q','timeMin','timeMax','maxResults'])assert.equal(lists[0].url.searchParams.get(key),lists[1].url.searchParams.get(key));assert.equal(f.patches.length,0);
});

test('compact identities paginate26 verbose events while full mode returns bounded partial evidence',async()=>{
 const f=fixture({originals:verboseOriginals()}),request=f.request(),window={timeMin:'2026-09-01T00:00:00-04:00',timeMax:'2026-11-27T00:00:00-05:00',query:title,limit:25};
 for(const args of [window,{...window,resultMode:'full'}]){
  const full=await request.execute({name:'list_calendar_events',arguments:args});assert.equal(full.status,'partial');assert.equal(full.coverage.complete,false);assert(full.calendarContext.events.length>0&&full.calendarContext.events.length<26);assert(Buffer.byteLength(JSON.stringify(full.calendarContext.events))<=14336);
 }
 const first=await request.execute({name:'list_calendar_events',arguments:{...window,resultMode:'identities'}});
 assert.equal(first.status,'ready');assert.equal(first.calendarContext.events.length,26);assert.equal(first.calendarContext.nextPageToken,undefined);assert.equal(first.coverage.complete,true);assert.equal(first.coverage.contentScope,'event_identities');
 for(const event of first.calendarContext.events)assert.deepEqual(Object.keys(event).sort(),['end','eventId','start','status','title','url']);
 assert(!JSON.stringify(first).includes('Synthetic human note'));assert(Buffer.byteLength(JSON.stringify(first.calendarContext))<20000);
 const lists=f.calls.filter(call=>call.url.pathname.endsWith('/events'));assert.equal(lists.length,4);
 assert(lists[0].url.searchParams.get('fields').includes('description'));assert.equal(lists[0].url.searchParams.get('fields'),lists[1].url.searchParams.get('fields'));
 assert.equal(lists[2].url.searchParams.get('fields'),'items(id,summary,start,end,status),nextPageToken');
 for(const key of ['q','timeMin','timeMax','maxResults','fields'])assert.equal(lists[2].url.searchParams.get(key),lists[3].url.searchParams.get(key));
 assert.equal(f.patches.length,0);
});

test('unknown result modes fail tool schema and production client before OAuth',async()=>{
 const f=fixture(),tool=f.adapter.tools.find(tool=>tool.name==='list_calendar_events'),window={timeMin:'2026-09-01T00:00:00Z',timeMax:'2026-11-27T00:00:00Z',query:title,limit:25};
 assert.equal(checkSchema(tool.parameters),true);
 for(const resultMode of ['summary','identities\n','',null,1,{}]) {
  const args={...window,resultMode};assert.equal(validateArguments(args,tool.parameters),false);
  assert.equal((await f.request().execute({name:'list_calendar_events',arguments:args})).status,'invalid_request');
  assert.equal((await f.client.listEvents({...args,principal:{id:principal.id,calendarAccess:true,calendarId}})).status,'invalid_request');
 }
 assert.equal(f.oauth.length,0);assert.equal(f.calls.length,0);
 const denied=fixture({googleAccess:false});assert.equal((await denied.request().execute({name:'list_calendar_events',arguments:{...window,resultMode:'identities'}})).status,'forbidden');assert.equal(denied.calls.length,0);assert.equal(denied.oauth.length,0);
});

test('stateless bulk corrections cannot obtain request-local revision authority',async()=>{
 const f=fixture(),app=createApp({config:{configured:true,production:false,timeoutMs:3000},googleTools:f.adapter,auth:()=>principal});const response=await app.request('/api/tools/update_calendar_events',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({events:[rows[0]]})});assert(response.status>=400);assert.notEqual((await response.json()).status,'ready');assert.equal(f.calls.length,0);
});

for(const compact of [false,true])test(compact?'native compact lookup repairs26 verbose events with full fresh reads preserving1800-character human notes':'actual native backend pagination and one bulk correction repair26 instances within two tool calls',async()=>{
 const originals=compact?verboseOriginals():dates.map(oldEvent),f=fixture({originals}),bodies=[],audit=[];let answerSystem='';
 const window={timeMin:'2026-09-01T00:00:00-04:00',timeMax:'2026-11-27T00:00:00-05:00',query:title,limit:25,...(compact?{resultMode:'identities'}:{})};
 const config={configured:true,production:false,provider:'openai-compatible',model:'synthetic',baseUrl:'https://synthetic-model.example/v1',apiKey:'synthetic',timeoutMs:3000,requestTimeoutMs:3000};
 const provider=createProvider(config,{audit:{required:false,startModel:async()=>({status:'ready'}),finishModel:async()=>({status:'ready'})},fetchImpl:async(_,init)=>{
  const body=JSON.parse(init.body);if(body.stream){answerSystem=body.messages[0].content;return new Response('data: {"choices":[{"index":0,"delta":{"content":"Synthetic correction outcomes"},"finish_reason":null}]}\n\ndata: {"choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n',{headers:{'content-type':'text/event-stream'}});}
  bodies.push(body);const round=bodies.length,results=body.messages.filter(message=>message.role==='tool').map(message=>JSON.parse(message.content));let selected=[];
  if(round===1)selected=[{name:'list_calendar_events',arguments:window}];
  if(round===2){assert.equal(results[0].calendarContext.events.length,26);assert.equal(results[0].calendarContext.nextPageToken,undefined);if(compact){assert.equal(results[0].coverage.contentScope,'event_identities');assert.equal(results[0].arguments.resultMode,'identities');assert(!JSON.stringify(results[0]).includes('Synthetic human note'));}const events=results.flatMap(result=>result.calendarContext?.events||[]);assert.equal(events.length,26);selected=[{name:'update_calendar_events',arguments:{events:events.map(event=>({...rows.find(row=>row.eventId===event.eventId)}))}}];}
  if(round===3){const batch=results.find(result=>result.tool==='update_calendar_events').calendarBatchWrite;assert.equal(batch.counts.updated,26);assert.equal(batch.complete,true);assert.equal(batch.items.filter(row=>row.calendarWrite).length,26);}
  const toolCalls=selected.map((row,index)=>({id:`timed_${round}_${index}`,type:'function',function:{name:row.name,arguments:JSON.stringify(row.arguments)}}));
  return Response.json({choices:[{index:0,finish_reason:toolCalls.length?'tool_calls':'stop',message:{role:'assistant',content:null,...(toolCalls.length?{tool_calls:toolCalls}:{})}}]});
 }});
 const app=createApp({config,provider,googleTools:f.adapter,auth:()=>principal,audit:{recordEvent:async event=>audit.push(event)}});
 const messages=[{role:'user',content:'Those office hours were saved all-day incorrectly. Keep the same events and dates; Tuesday is 6–7pm, Thursday5–6pm in New York.'},{role:'assistant',content:'I will fix the times.'},{role:'user',content:'Go ahead and finish all of them.'}];
 const response=await app.request('/api/chat',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({messages,timeZone:'America/New_York'})});
 const output=(await response.text()).trim().split('\n').map(JSON.parse);assert.equal(output.at(-1).type,'done');assert.equal(bodies.length,3);assert.equal(f.patches.length,26);assert.equal(f.events.size,26);
 assert.deepEqual(output.find(row=>row.type==='meta').retrieval.map(row=>row.tool),['list_calendar_events','update_calendar_events']);
 assert.deepEqual(audit.find(row=>row.kind==='tool_finished'&&row.tool==='update_calendar_events').counts,{sequence:2,requested:26,updated:26,unchanged:0,failed:0,unattempted:0});
 assert(answerSystem.includes('"updated":26'));assert(answerSystem.includes('"calendarBatchWrite"'));
 if(compact){for(const original of originals){assert.equal(original.description.length,1800);assert.equal(f.events.get(original.id).description,original.description);assert((f.reads.get(original.id)||0)>=2);assert(f.calls.filter(call=>call.options.method==='GET'&&call.url.pathname.endsWith('/'+original.id)).every(call=>!call.url.searchParams.has('fields')||call.url.searchParams.get('fields').includes('description')));}assert(f.calls.filter(call=>call.url.pathname.endsWith('/events')).every(call=>call.url.searchParams.get('fields')==='items(id,summary,start,end,status),nextPageToken'));assert(!answerSystem.includes('Synthetic human note'),'internal full reads do not enlarge compact model context');}
});
