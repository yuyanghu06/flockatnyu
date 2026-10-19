import test from 'node:test';
import assert from 'node:assert/strict';
import {createCalendarClient} from '../server/google/calendar-client.js';
import {readCalendarConfig,CALENDAR_REQUIRED_SCOPES} from '../server/google/calendar-config.js';
import {createChatCalendarTools} from '../tools/calendar/chat.js';
import {createApp} from '../server/app.js';
import {checkSchema,validateArguments} from '../server/automation/validation.js';
import {createGoogleClient} from '../server/google/client.js';
import {readGoogleConfig,GOOGLE_SCOPES} from '../server/google/config.js';
import {GOOGLE_TOOLS,executeGoogleTool} from '../tools/google/index.js';
import {createProvider} from '../server/providers/index.js';
import {assistantPlanningPrompt,assistantAnswerPrompt} from '../server/assistant-context.js';

const calendarId='synthetic-club@group.calendar.google.com';
const principal={id:'synthetic-batch-user',googleAccess:true,allowedSourceIds:[]};
const items=Array.from({length:12},(_,index)=>({title:`Member ${index+1}'s takeover`,date:`2031-03-${String(index+1).padStart(2,'0')}`}));
const nextDate=value=>new Date(Date.parse(value+'T00:00:00Z')+86400000).toISOString().slice(0,10);
const human=(title,date,id='human_existing')=>({id,summary:title,start:{date},end:{date:nextDate(date)},description:'Preserve human notes',location:'Human room',status:'confirmed',etag:'"human-revision"',extendedProperties:{private:{humanOwned:'preserve'}}});
function fixture({existing=[],failTitles=[],paginate=false,badPage=false,loopPages=false,endlessPages=false,googleAccess=true,role='writer',abortAfter}={}) {
 const events=new Map(existing.map(event=>[event.id,structuredClone(event)])),calls=[],posts=[],oauthCalls=[];
 let revision=0;
 const productionClient=createCalendarClient({config:readCalendarConfig({GOOGLE_CLIENT_ID:'synthetic',GOOGLE_CLIENT_SECRET:'synthetic',GOOGLE_REFRESH_TOKEN:'synthetic',GOOGLE_EXPECTED_ACCOUNT_EMAIL:'club@example.com',GOOGLE_CALENDAR_ID:calendarId}),
  oauthClient:{setCredentials(){},getAccessToken:async()=>{oauthCalls.push('token');return {token:'synthetic'};},getTokenInfo:async()=>({scopes:CALENDAR_REQUIRED_SCOPES})},
  fetchImpl:async(value,options)=>{
   const url=new URL(value);calls.push({url,options});assert.equal(options.redirect,'error');
   if(url.hostname==='gmail.googleapis.com')return Response.json({emailAddress:'club@example.com'});
   if(url.pathname.includes('/users/me/calendarList/'))return Response.json({id:calendarId,accessRole:role});
   assert.equal(url.origin,'https://www.googleapis.com');const match=/\/calendars\/([^/]+)\/events(?:\/([^/]+))?$/.exec(url.pathname);assert(match);assert.equal(decodeURIComponent(match[1]),calendarId);
   const id=match[2]&&decodeURIComponent(match[2]);
   if(options.method==='GET') {
    if(id)return events.has(id)?Response.json(events.get(id)):Response.json({error:'missing'},{status:404});
    if(loopPages)return Response.json({items:[],nextPageToken:'repeated_page'});
    if(endlessPages)return Response.json({items:[],nextPageToken:'page_'+(Number(url.searchParams.get('pageToken')?.split('_')[1]||0)+1)});
    const from=Date.parse(url.searchParams.get('timeMin')),to=Date.parse(url.searchParams.get('timeMax')),pageToken=url.searchParams.get('pageToken');
    const matching=[...events.values()].filter(event=>Date.parse(event.end.date)>from&&Date.parse(event.start.date)<to&&event.status!=='cancelled');
    if(paginate&&!pageToken)return Response.json({items:[],nextPageToken:'second_page'});
    if(pageToken){assert.equal(pageToken,'second_page');if(badPage)return new Response('PRIVATE_PROVIDER_BODY',{status:503});}
    return Response.json({items:matching});
   }
   assert.equal(options.method,'POST','batch creation never overwrites or deletes existing human events');
   assert.equal(url.searchParams.get('sendUpdates'),'none');const body=JSON.parse(options.body);posts.push(body);
   for(const forbidden of ['attendees','recurrence','conferenceData','calendarId'])assert(!Object.hasOwn(body,forbidden));
   if(failTitles.includes(body.summary))return new Response('PRIVATE_PROVIDER_BODY',{status:503});
   const saved={...body,etag:`"revision-${++revision}"`};events.set(body.id,saved);
   return Response.json(saved);
  }});
 const client=abortAfter?{...productionClient,createChatEvent:async args=>{const result=await productionClient.createChatEvent(args);if(result.status==='ready'&&revision===abortAfter.count)abortAfter.controller.abort();return result;}}:productionClient;
 const adapter=createChatCalendarTools({client});
 const request=(operationId='batch-operation')=>adapter.createRequest({principal:{...principal,googleAccess},operationId});
 const run=(entries=items,options={})=>request(options.operationId).execute({name:'create_calendar_events',arguments:{events:entries},signal:options.signal});
 return {client,adapter,request,run,events,calls,posts,oauthCalls};
}

test('all-day batch creates more than eight eligible rows once, skips duplicate rows and preserves an existing match',async()=>{
 const existing=human(items[0].title,items[0].date),f=fixture({existing:[existing],paginate:true});
 const entries=[...items,{...items[3]}];
 const result=await f.run(entries);
 assert.equal(result.status,'ready');assert.equal(f.events.size,12);assert.equal(f.posts.length,11);
 assert.equal(result.calendarBatchWrite.complete,true);assert.deepEqual(result.calendarBatchWrite.counts,{requested:13,created:11,existing:2,failed:0,unattempted:0});
 assert.deepEqual(result.calendarBatchWrite.items.map(row=>row.index),entries.map((_,index)=>index));
 for(const row of result.calendarBatchWrite.items){assert(row.calendarWrite?.eventId);assert.match(row.calendarWrite.url,/^https:\/\/calendar.google.com\/calendar\/event\?eid=/);assert.equal(row.title,entries[row.index].title);assert.equal(row.date,entries[row.index].date);}
 assert.deepEqual(f.events.get(existing.id),existing);
 for(const item of items) {
  const matching=[...f.events.values()].filter(event=>event.summary===item.title&&event.start.date===item.date);
  assert.equal(matching.length,1);assert.deepEqual(matching[0].start,{date:item.date});assert.deepEqual(matching[0].end,{date:nextDate(item.date)});
 }
 const lists=f.calls.filter(call=>call.url.pathname.endsWith('/events')&&call.options.method==='GET');
 assert.equal(lists.length,24,'one complete two-page duplicate scan per distinct actual date');
 for(let index=0;index<lists.length;index+=2){assert.equal(lists[index].url.searchParams.get('pageToken'),null);assert.equal(lists[index+1].url.searchParams.get('pageToken'),'second_page');for(const key of ['timeMin','timeMax','maxResults'])assert.equal(lists[index].url.searchParams.get(key),lists[index+1].url.searchParams.get(key));}
 await f.run(entries);await f.run([...items].reverse(),{operationId:'another-request'});
 assert.equal(f.posts.length,11,'retry and reordering never duplicate observed Calendar events');assert.equal(f.events.size,12);
});

test('all-day batch preserves explicit past year, month rollover and leap-day exclusive ends',async()=>{
 const entries=[{title:"Past person's takeover",date:'2025-12-31'},{title:"Leap person's takeover",date:'2028-02-29'}];
 const f=fixture();assert.equal((await f.run(entries)).status,'ready');
 for(const entry of entries){const saved=[...f.events.values()].find(event=>event.summary===entry.title);assert.equal(saved.start.date,entry.date);assert.equal(saved.end.date,nextDate(entry.date));}
});

test('missing Google grant denies the entire batch before OAuth or HTTP and lost writer role never posts',async()=>{
 const denied=fixture({googleAccess:false});assert.equal((await denied.run()).status,'forbidden');assert.equal(denied.calls.length,0);assert.equal(denied.oauthCalls.length,0);
 const reader=fixture({role:'reader'});const result=await reader.run();assert.notEqual(result.status,'ready');assert.equal(reader.posts.length,0);
 assert.deepEqual(result.calendarBatchWrite.counts,{requested:12,created:0,existing:0,failed:1,unattempted:11});assert.equal(reader.oauthCalls.length,2,'one duplicate check and one denied write; later rows never retry a lost grant');
});

test('batch schema rejects unknown fields, blank rows, missing fields and more than fifty entries before dispatch',async()=>{
 const f=fixture(),tool=f.adapter.tools.find(tool=>tool.name==='create_calendar_events');assert(tool);assert.equal(checkSchema(tool.parameters),true);
 for(const args of [{events:[]},{events:Array(51).fill(items[0])},{events:[{title:'',date:'2031-03-01'}]},{events:[{title:'Named',date:''}]},{events:[{title:'Named'}]},{events:[{title:'Named',date:'2031-03-01',attendees:[]}]},{events:[items[0]],calendarId:'other@example.com'}]) {
  const result=await f.request().execute({name:'create_calendar_events',arguments:args});assert.equal(result.status,'invalid_request');
 }
 assert.equal(f.calls.length,0);assert.equal(f.oauthCalls.length,0);
 assert.equal(validateArguments({events:Array(50).fill(items[0])},tool.parameters),true);
 assert.equal((await f.request('').execute({name:'create_calendar_events',arguments:{events:[items[0]]}})).status,'forbidden');assert.equal(f.calls.length,0);
});

test('maximum fifty valid all-day entries complete within one backend batch operation',async()=>{
 const entries=Array.from({length:50},(_,index)=>({title:`Synthetic ${index}'s takeover`,date:new Date(Date.UTC(2025,0,1+index)).toISOString().slice(0,10)}));
 const f=fixture();const result=await f.run(entries);assert.equal(result.status,'ready');assert.equal(f.posts.length,50);assert.equal(f.events.size,50);assert.equal(result.calendarBatchWrite.items.filter(row=>row.calendarWrite).length,50);
});

test('impossible dates fail their own row without guessing a date or blocking valid subsequent rows',async()=>{
 const f=fixture();const result=await f.run([{title:"Invalid person's takeover",date:'2031-02-29'},items[0]]);
 assert.equal(result.status,'partial');assert.deepEqual(result.calendarBatchWrite.counts,{requested:2,created:1,existing:0,failed:1,unattempted:0});assert.equal(f.events.size,1);assert.equal(f.posts.length,1);assert.equal(result.calendarBatchWrite.items[0].calendarWrite,undefined);
});

test('incomplete duplicate-check pagination prevents unsafe creation and does not claim a saved event',async()=>{
 const f=fixture({paginate:true,badPage:true});const result=await f.run([items[0]]);assert.notEqual(result.status,'ready');assert.equal(f.posts.length,0);assert.equal(f.events.size,0);
 assert(!JSON.stringify(result).includes('PRIVATE_PROVIDER_BODY'));
});

test('a repeated duplicate-check cursor terminates boundedly and cannot create from incomplete evidence',async()=>{
 const f=fixture({loopPages:true});const result=await f.run([items[0]]);assert.equal(result.status,'partial');assert.equal(f.posts.length,0);assert.equal(result.calendarBatchWrite.items[0].reason,'duplicate_check_incomplete');
 assert.equal(f.calls.filter(call=>call.url.pathname.endsWith('/events')).length,2);assert.equal(result.calendarBatchWrite.items[0].calendarWrite,undefined);
});

test('duplicate scanning is bounded to twenty pages per date and one hundred pages across a batch',async()=>{
 const f=fixture({endlessPages:true});const result=await f.run(items.slice(0,6));assert.equal(result.status,'partial');assert.equal(f.posts.length,0);
 const lists=f.calls.filter(call=>call.url.pathname.endsWith('/events'));
 assert.equal(lists.length,100);const windows=new Map();for(const call of lists){const key=call.url.searchParams.get('timeMin');windows.set(key,(windows.get(key)||0)+1);}
 assert.equal(windows.size,5);assert([...windows.values()].every(count=>count===20));assert.equal(result.calendarBatchWrite.items[5].reason,'duplicate_check_budget_exhausted');assert.equal(result.calendarBatchWrite.items.filter(row=>row.calendarWrite).length,0);
});

test('ambiguous identical existing entries are left untouched and unrelated overlaps never block a clear row',async()=>{
 const duplicates=[human(items[0].title,items[0].date,'existing_one'),human(items[0].title,items[0].date,'existing_two')];
 const f=fixture({existing:duplicates});const result=await f.run([items[0],{title:'Distinct takeover',date:items[0].date}]);
 assert.equal(result.status,'partial');assert.equal(result.calendarBatchWrite.items[0].reason,'ambiguous_existing_events');assert.equal(result.calendarBatchWrite.items[0].calendarWrite,undefined);
 assert.equal(f.posts.length,1);assert.equal(f.events.size,3);for(const original of duplicates)assert.deepEqual(f.events.get(original.id),original);
});

test('one failed item does not prevent later all-day creations or invent a successful receipt',async()=>{
 const f=fixture({failTitles:[items[2].title]});const result=await f.run(items.slice(0,5));
 assert.notEqual(result.status,'ready');assert.equal(f.events.size,4);assert.equal(f.posts.length,5);
 assert.deepEqual(result.calendarBatchWrite.counts,{requested:5,created:4,existing:0,failed:1,unattempted:0});assert.equal(result.calendarBatchWrite.complete,false);assert.equal(result.calendarBatchWrite.items[2].calendarWrite,undefined);
 assert(![...f.events.values()].some(event=>event.summary===items[2].title));assert([...f.events.values()].some(event=>event.summary===items[4].title));assert(!JSON.stringify(result).includes('PRIVATE_PROVIDER_BODY'));
});

test('aborting a batch preserves earlier saved records and stops all later provider calls',async()=>{
 const controller=new AbortController(),f=fixture({abortAfter:{count:2,controller}});
 const result=await f.run(items,{signal:controller.signal});assert.notEqual(result.status,'ready');assert.equal(f.events.size,2);assert.equal(f.posts.length,2);
 assert.deepEqual(result.calendarBatchWrite.counts,{requested:12,created:2,existing:0,failed:0,unattempted:10});assert.equal(result.calendarBatchWrite.items.filter(row=>row.calendarWrite).length,2);
 const count=f.calls.length;await Promise.resolve();assert.equal(f.calls.length,count);
});

test('batch writes remain unavailable through stateless HTTP execution',async()=>{
 const f=fixture(),app=createApp({config:{configured:true,production:false,timeoutMs:3000},googleTools:f.adapter,auth:()=>principal});
 const response=await app.request('/api/tools/create_calendar_events',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({events:[items[0]]})});
 assert(response.status>=400);assert.notEqual((await response.json()).status,'ready');assert.equal(f.posts.length,0);assert.equal(f.calls.length,0);
});

test('partial batch receipts and exact counts survive actual HTTP answer generation',async()=>{
 const f=fixture({failTitles:[items[1].title]});let round=0,answer;
 const app=createApp({config:{configured:true,production:false,timeoutMs:3000},googleTools:f.adapter,auth:()=>principal,provider:{planTools:async()=>round++===0?[{name:'create_calendar_events',arguments:{events:items.slice(0,4)}}]:[],async *stream(input){answer=input;yield 'Synthetic partial result.';}}});
 const response=await app.request('/api/chat',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({messages:[{role:'user',content:'Go ahead with the requested takeovers.'}],timeZone:'America/New_York'})});
 const records=(await response.text()).trim().split('\n').map(JSON.parse);assert.equal(records.at(-1).type,'done');
 const data=JSON.parse(answer.system.split('\nUNTRUSTED TOOL STATUS AND REFERENCE DATA (JSON):\n')[1]);
 const batch=data.results.find(row=>row.tool==='create_calendar_events').calendarBatchWrite;
 assert.deepEqual(batch.counts,{requested:4,created:3,existing:0,failed:1,unattempted:0});assert.equal(batch.items.filter(row=>row.calendarWrite).length,3);assert.equal(batch.items[1].calendarWrite,undefined);assert.equal(batch.complete,false);
});

test('both prompts preserve pending source constraints and act on clear requests without repeated permission',()=>{
 for(const prompt of [assistantPlanningPrompt({now:'2031-03-01T15:00:00Z',timeZone:'America/New_York'}),assistantAnswerPrompt({now:'2031-03-01T15:00:00Z',timeZone:'America/New_York'})]) {
  assert.match(prompt,/clear request is authorization.*do not ask for approval again/i);
  assert.match(prompt,/Carry forward.*source\/scope, naming rules, dates and skip constraints/i);
  assert.match(prompt,/never roll an explicit date forward because it has passed/i);
  assert.match(prompt,/Skip blank, unassigned or TBD source rows.*after completing the clear rows/i);
  assert.match(prompt,/Overlaps do not block requested creates/i);
  assert.match(prompt,/Names in titles are labels, not attendees or provider identities/i);
  assert.match(prompt,/respect textTruncated and firstSheetOnly/i);
  assert.match(prompt,/partial batches can contain real completed changes/i);
 }
});

test('source-to-batch native chat retains late sheet rows, skips unassigned rows and completes over eight creations',async()=>{
 const rows=items.map((item,index)=>`Member ${index+1},${item.date}`);
 const sheet=['Notes,'+'Padding '.repeat(300),'Name,Date',...rows,',2031-03-19','Unassigned Member,',rows[3]].join('\n');
 assert(sheet.indexOf('Member 12')>1800);assert(sheet.length<12000);
 const f=fixture({existing:[human(items[0].title,items[0].date)]}),modelBodies=[],googleCalls=[];
 const drive=createGoogleClient({config:readGoogleConfig({GOOGLE_CLIENT_ID:'synthetic',GOOGLE_CLIENT_SECRET:'synthetic',GOOGLE_REFRESH_TOKEN:'synthetic',GOOGLE_EXPECTED_ACCOUNT_EMAIL:'club@example.com'}),oauthClient:{setCredentials(){},getAccessToken:async()=>({token:'synthetic'}),getTokenInfo:async()=>({scopes:GOOGLE_SCOPES})},fetchImpl:async value=>{
  const url=new URL(value);googleCalls.push(url);if(url.pathname.endsWith('/profile'))return Response.json({emailAddress:'club@example.com'});
  if(url.pathname.endsWith('/export'))return new Response(sheet);
  return Response.json({id:'takeover_sheet',name:'Synthetic takeovers',mimeType:'application/vnd.google-apps.spreadsheet'});
 }});
 const googleTools={tools:[...GOOGLE_TOOLS,...f.adapter.tools],createRequest:context=>{
  const calendar=f.adapter.createRequest(context);return {tools:[...GOOGLE_TOOLS,...calendar.tools],execute:options=>calendar.tools.some(tool=>tool.name===options.name)?calendar.execute(options):executeGoogleTool({...options,client:drive})};
 }};
 const config={configured:true,production:false,provider:'openai-compatible',model:'synthetic',baseUrl:'https://synthetic-model.example/v1',apiKey:'synthetic',timeoutMs:3000,requestTimeoutMs:3000};
 let finalSystem='';
 const provider=createProvider(config,{audit:{required:false,startModel:async()=>({status:'ready'}),finishModel:async()=>({status:'ready'})},fetchImpl:async(_,init)=>{
  const body=JSON.parse(init.body);if(body.stream){finalSystem=body.messages[0].content;return new Response('data: {"choices":[{"index":0,"delta":{"content":"Synthetic completed outcomes"},"finish_reason":null}]}\n\ndata: {"choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n',{headers:{'content-type':'text/event-stream'}});}
  modelBodies.push(body);const round=modelBodies.length;let selected=[];
  if(round<=2)selected=[{name:'read_drive',arguments:{fileId:'takeover_sheet'}}];
  if(round===3){
   const source=body.messages.filter(row=>row.role==='tool').map(row=>JSON.parse(row.content)).find(row=>row.tool==='read_drive'&&row.status==='ready');assert(source);
   assert(source.driveContent.text.includes('Member 12'));assert(!source.sources[0].excerpt.includes('Member 12'));
   assert.equal(source.driveContent.firstSheetOnly,true);assert.equal(source.driveContent.textTruncated,false);assert.equal(source.driveContent.partial,true);
   const entries=source.driveContent.text.split('\n').map(line=>line.split(',')).filter(([name,date])=>name?.trim()&&/^\d{4}-\d{2}-\d{2}$/.test(date||'')).map(([name,date])=>({title:`${name}'s takeover`,date}));
   assert.equal(entries.length,13);selected=[{name:'create_calendar_events',arguments:{events:entries}}];
  }
  if(round===4){const saved=body.messages.filter(row=>row.role==='tool').map(row=>JSON.parse(row.content)).find(row=>row.tool==='create_calendar_events');assert.equal(saved.calendarBatchWrite.counts.created,11);assert.equal(saved.calendarBatchWrite.counts.existing,2);assert.equal(saved.calendarBatchWrite.complete,true);}
  const calls=selected.map((row,index)=>({id:`native_${round}_${index}`,type:'function',function:{name:row.name,arguments:JSON.stringify(row.arguments)}}));
  return Response.json({choices:[{index:0,finish_reason:calls.length?'tool_calls':'stop',message:{role:'assistant',content:null,...(calls.length?{tool_calls:calls}:{})}}]});
 }});
 const auditEvents=[];const app=createApp({config,provider,googleTools,auth:()=>principal,audit:{recordEvent:async event=>auditEvents.push(event)}});
 const messages=[{role:'user',content:'Add everyone from the takeover sheet to the club calendar on the exact listed dates, all day, with title "[Name]\'s takeover". Skip dates without an assigned name.'},{role:'assistant',content:'I will read the sheet.'},{role:'user',content:'Go do it; keep going.'}];
 const response=await app.request('/api/chat',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({messages,timeZone:'America/New_York'})});
 const records=(await response.text()).trim().split('\n').map(JSON.parse);assert.equal(records.at(-1).type,'done');assert.equal(modelBodies.length,4);assert.equal(f.posts.length,11);assert.equal(f.events.size,12);
 assert.equal(records.find(row=>row.type==='meta').retrieval.filter(row=>row.tool==='create_calendar_events'&&row.status==='ready').length,1,'one backend tool execution can safely complete more than eight rows');
 assert(finalSystem.includes('"calendarBatchWrite"'));assert(finalSystem.includes('first_sheet_only'),'answer must disclose only the first sheet was read');
 assert.equal(googleCalls.filter(url=>url.pathname.endsWith('/export')).length,1);
 assert.deepEqual(auditEvents.find(event=>event.kind==='tool_finished'&&event.tool==='create_calendar_events').counts,{sequence:2,requested:13,created:11,existing:2,failed:0,unattempted:0});
 assert(!JSON.stringify(auditEvents).includes('Member 12'),'operational tool audits contain counts, not source-sheet rows');
 // Scripted extraction verifies source delivery and execution plumbing; actual
 // configured-model checks separately verify semantic interpretation/autonomy.
});
