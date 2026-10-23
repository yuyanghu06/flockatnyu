import test from 'node:test';
import assert from 'node:assert/strict';
import {isDeepStrictEqual} from 'node:util';
import {createCalendarClient} from '../server/google/calendar-client.js';
import {CALENDAR_REQUIRED_SCOPES} from '../server/google/calendar-config.js';
import {calendarEventReceipt,projectCalendarReceipt,compactCalendarReceipt} from '../server/google/calendar-receipt.js';
import {createChatCalendarTools} from '../tools/calendar/chat.js';
import {projectCalendarBatchWrite,compactCalendarBatchWrite} from '../tools/calendar/chat-batch.js';
import {createChatRunner} from '../server/chat-runner.js';

const calendarId='complete-receipts@example.test',sourceId='00000000-0000-4000-8000-000000000001';
const actor={id:'member',googleAccess:true,allowedSourceIds:[]},writer={id:'member',calendarAccess:true,calendarId,calendarChatWrite:true};
const managedActor={id:'worker',calendarAccess:true,calendarId,allowedSourceIds:[sourceId],calendarSources:[{boardId:'board_1',sourceId}]};
const start={dateTime:'2026-11-03T18:00:00-05:00',timeZone:'America/New_York'},end={dateTime:'2026-11-03T19:00:00-05:00',timeZone:'America/New_York'};
const allDay={start:{date:'2026-11-03'},end:{date:'2026-11-04'}};
const requested={title:'Requested title',description:'Requested description',location:'Requested room',start,end};
const provenance={sourceKey:'miro:board_1:item_1',sourceUrl:'https://miro.com/app/board/board_1/?moveToWidget=item_1'};
const forbidden='PRIVATE_PROVIDER_SECRET_SENTINEL';
const canonical=id=>`https://calendar.google.com/calendar/event?eid=${Buffer.from(`${id} ${calendarId}`).toString('base64url')}`;
const raw=(extra={})=>({id:'existing_event',summary:'Saved provider title',description:'D'.repeat(2900),location:'Actual saved room',...allDay,status:'confirmed',etag:'"revision-0"',created:'2026-10-20T10:00:00Z',updated:'2026-10-21T10:00:00Z',privateField:forbidden,extendedProperties:{private:{password:forbidden}},conferenceData:{conferenceId:forbidden,entryPoints:[{uri:'https://meet.invalid/'+forbidden,pin:forbidden}]},...extra});
function fixture({existing=[],writeMode,mutateOutput}={}) {
 const events=new Map(existing.map(e=>[e.id,structuredClone(e)])),calls=[];let writes=0;
 const client=createCalendarClient({config:{configured:true,calendarId,expectedAccountEmail:'club@example.test'},oauthClient:{setCredentials(){},getAccessToken:async()=>({token:'synthetic'}),getTokenInfo:async()=>({scopes:CALENDAR_REQUIRED_SCOPES})},fetchImpl:async(input,options)=>{
  const url=new URL(input);calls.push({url,options});if(url.hostname==='gmail.googleapis.com')return Response.json({emailAddress:'club@example.test'});
  if(url.pathname.includes('/calendarList/'))return Response.json({id:calendarId,accessRole:'writer'});
  const id=url.pathname.match(/\/events\/([^/]+)$/)?.[1],output=e=>{const value=structuredClone(e);mutateOutput?.(value,options);return value;};
  if(options.method==='GET')return id?(events.has(id)?Response.json(output(events.get(id))):new Response('',{status:404})):Response.json({items:[...events.values()].map(output)});
  assert(['POST','PATCH'].includes(options.method));assert.equal(url.searchParams.get('sendUpdates'),'none');writes++;
  const body=JSON.parse(options.body),key=id||body.id;for(const field of ['attendees','recurrence','conferenceData','calendarId'])assert(!Object.hasOwn(body,field));
  const saved={...events.get(key),...body,id:key,etag:`"revision-${writes}"`,created:'2026-10-20T10:00:00Z',updated:'2026-10-22T10:00:00Z'};events.set(key,saved);
  if(writeMode==='lost')throw Error('synthetic lost write reply');return Response.json(output(saved));
 }});
 const tools=createChatCalendarTools({client});return {client,tools,events,calls,writes:()=>writes,request:()=>tools.createRequest({principal:actor,operationId:'complete-receipt-operation'})};
}
const execute=(request,name,args)=>request.execute({name,arguments:args});
function complete(receipt,expected) {
 assert(receipt);for(const [key,value] of Object.entries(expected))assert.deepEqual(receipt[key],value,key);
 assert.doesNotMatch(JSON.stringify(receipt),new RegExp(forbidden));assert(!Object.hasOwn(receipt,'etag'));assert(!Object.hasOwn(receipt,'extendedProperties'));assert(!Object.hasOwn(receipt,'conferenceData'));
}

test('provider receipt preserves full writable description, metadata, explicit clears and boundary timezones',()=>{
 const event=raw({start,end,description:'Full description\n'+ 'x'.repeat(2983),attendees:[],recurrence:[],organizer:{email:'organizer@example.test',displayName:'Organizer',self:true,privateField:forbidden},reminders:{useDefault:false,overrides:[]}});
 const receipt=calendarEventReceipt(event,{calendarId,outcome:'updated'});
 complete(receipt,{eventId:event.id,url:canonical(event.id),outcome:'updated',title:event.summary,description:event.description,location:event.location,attendees:[],recurrence:[],eventStatus:'confirmed'});
 assert.equal(Date.parse(receipt.start.dateTime),Date.parse(start.dateTime));assert.equal(receipt.start.timeZone,'America/New_York');assert.equal(receipt.end.timeZone,'America/New_York');
 const cleared=calendarEventReceipt(raw({description:'',location:'',attendees:[],recurrence:[]}),{calendarId,outcome:'unchanged'});complete(cleared,{description:'',location:'',attendees:[],recurrence:[],start:allDay.start,end:allDay.end,allDay:true});
});
test('missing provider fields stay unknown with explicit field coverage, never empty invented text',()=>{
 const receipt=calendarEventReceipt({id:'saved_event',status:'cancelled'},{calendarId,outcome:'cancelled'});
 for(const key of ['title','description','location','start','end']){assert(!Object.hasOwn(receipt,key),key);assert(receipt.details.missingFields.includes(key),key);}
 complete(receipt,{eventStatus:'cancelled',eventId:'saved_event'});
 const absent=calendarEventReceipt(undefined,{calendarId,outcome:'already_absent',eventId:'absent_event',absent:true});complete(absent,{outcome:'already_absent',eventStatus:'absent',absent:true,eventId:'absent_event'});assert(!Object.hasOwn(absent,'title'));
});
test('oversized returned text and safe arrays are bounded and truncation is explicit',()=>{
 const event=raw({summary:'t'.repeat(301),description:'d'.repeat(3500),location:'l'.repeat(501),attendees:Array.from({length:101},(_,i)=>({email:`person${i}@example.test`,responseStatus:'accepted',displayName:'Attendee',comment:forbidden,privateField:forbidden})),recurrence:Array.from({length:51},()=> 'RRULE:FREQ=WEEKLY'),creator:{email:'creator@example.test',displayName:'Creator',privateField:forbidden}});
 const receipt=calendarEventReceipt(event,{calendarId,outcome:'updated'});assert.equal(receipt.title.length,300);assert.equal(receipt.description.length,3000);assert.equal(receipt.location.length,500);
 for(const key of ['title','description','location','attendees','recurrence'])assert(receipt.details.truncatedFields.includes(key),key);
 assert(receipt.attendees.length<101);assert(receipt.recurrence.length<51);assert.doesNotMatch(JSON.stringify(receipt),new RegExp(forbidden));assert(Buffer.byteLength(JSON.stringify(receipt))<16384);
});
test('normalized projection rejects arbitrary provider fields and compact projection preserves saved core with omission flags',()=>{
 const receipt=calendarEventReceipt(raw(),{calendarId,outcome:'updated'}),projected=projectCalendarReceipt({...receipt,password:forbidden,extendedProperties:{private:{token:forbidden}}});
 complete(projected,{title:'Saved provider title',description:'D'.repeat(2900)});
 const compact=compactCalendarReceipt(projected);complete(compact,{eventId:receipt.eventId,url:receipt.url,outcome:'updated',title:receipt.title,start:receipt.start,end:receipt.end});assert.equal(compact.details.compacted,true);assert(compact.details.omittedFields.includes('description'));assert(!Object.hasOwn(compact,'description'));assert.deepEqual(compactCalendarReceipt(compact),compact);
});

test('actual single create/idempotent retry/update/unchanged/cancel return actual full saved details',async()=>{
 const f=fixture(),request=f.request();const creation=await execute(request,'create_calendar_event',{...requested,description:'X'.repeat(3000)});assert.equal(creation.status,'ready');complete(creation.calendarWrite,{title:requested.title,description:'X'.repeat(3000),location:requested.location});
 const repeated=await execute(request,'create_calendar_event',{...requested,description:'X'.repeat(3000)});assert.equal(repeated.calendarWrite.outcome,'unchanged');assert.equal(repeated.calendarWrite.description.length,3000);assert.equal(f.writes(),1);
 const eventId=creation.calendarWrite.eventId;await execute(request,'read_calendar_event',{eventId});
 const update=await execute(request,'update_calendar_event',{eventId,title:'Renamed saved title'});complete(update.calendarWrite,{title:'Renamed saved title',description:'X'.repeat(3000),location:requested.location});
 await execute(request,'read_calendar_event',{eventId});const unchanged=await execute(request,'update_calendar_event',{eventId,title:'Renamed saved title'});assert.equal(unchanged.calendarWrite.outcome,'unchanged');assert.equal(unchanged.calendarWrite.description.length,3000);
 await execute(request,'read_calendar_event',{eventId});const cancel=await execute(request,'delete_calendar_event',{eventId});complete(cancel.calendarWrite,{title:'Renamed saved title',description:'X'.repeat(3000),eventStatus:'cancelled'});assert.equal(cancel.calendarWrite.outcome,'cancelled');assert.equal(f.writes(),3);
});
test('actual title-only update preserves human description and explicit clears remain saved facts',async()=>{
 const f=fixture({existing:[raw()]}),request=f.request();await execute(request,'read_calendar_event',{eventId:'existing_event'});
 const changed=await execute(request,'update_calendar_event',{eventId:'existing_event',title:'Human title renamed'});complete(changed.calendarWrite,{title:'Human title renamed',description:'D'.repeat(2900),location:'Actual saved room',start:allDay.start,end:allDay.end});
 await execute(request,'read_calendar_event',{eventId:'existing_event'});const cleared=await execute(request,'update_calendar_event',{eventId:'existing_event',description:'',location:''});complete(cleared.calendarWrite,{description:'',location:''});
});
test('actual lost create reply returns reconciled saved details with one write',async()=>{
 const f=fixture({writeMode:'lost'}),result=await f.client.createChatEvent({...requested,operationId:'lost-once',principal:writer});assert.equal(result.status,'ready');complete(result,{outcome:'reconciled',title:requested.title,description:requested.description,location:requested.location});assert.equal(f.writes(),1);
});
for(const writeMode of [undefined,'lost'])test(`managed upsert/cancel receipts include saved details across ${writeMode||'normal'} writes, unchanged and absence`,async()=>{
 const f=fixture({writeMode}),args={...requested,...provenance,principal:managedActor};
 const created=await f.client.upsertEvent(args);assert.equal(created.status,'ready');complete(created,{title:requested.title,description:requested.description,location:requested.location,outcome:writeMode?'reconciled':'created'});
 const unchanged=await f.client.upsertEvent(args);complete(unchanged,{outcome:'unchanged',title:requested.title,description:requested.description});
 const changed=await f.client.upsertEvent({...args,title:'Updated managed title'});complete(changed,{title:'Updated managed title',outcome:writeMode?'reconciled':'updated'});
 const cancelled=await f.client.cancelEvent({...provenance,principal:managedActor});complete(cancelled,{title:'Updated managed title',eventStatus:'cancelled',description:requested.description});
 const again=await f.client.cancelEvent({...provenance,principal:managedActor});complete(again,{outcome:'unchanged',title:'Updated managed title',eventStatus:'cancelled'});
 const missing=await f.client.cancelEvent({sourceKey:'miro:board_1:missing_item',sourceUrl:'https://miro.com/app/board/board_1/?moveToWidget=missing_item',principal:managedActor});complete(missing,{outcome:'already_absent',absent:true});assert(!Object.hasOwn(missing,'title'));
});

test('single wrappers never substitute requested or prewrite fields for absent/provider-adjusted receipt values',async()=>{
 const client={configured:true,calendarId,createChatEvent:async()=>({status:'ready',outcome:'created',eventId:'saved_event',url:canonical('saved_event'),title:'Actual saved title',description:'Actual saved description',...allDay}),readChatEvent:async()=>({status:'ready',events:[{eventId:'saved_event',title:'Before',description:'Before description',location:'Before room',...allDay}],chatRevision:{eventId:'saved_event',etag:'"before"',unsupported:false}}),updateChatEvent:async()=>({status:'ready',outcome:'updated',eventId:'saved_event',url:canonical('saved_event'),title:'Actual updated title',...allDay})};
 const request=createChatCalendarTools({client}).createRequest({principal:actor,operationId:'stub'}),created=await execute(request,'create_calendar_event',requested);complete(created.calendarWrite,{title:'Actual saved title',description:'Actual saved description'});assert(!Object.hasOwn(created.calendarWrite,'location'));
 await execute(request,'read_calendar_event',{eventId:'saved_event'});const updated=await execute(request,'update_calendar_event',{eventId:'saved_event',title:'Requested update',description:'Requested update body'});complete(updated.calendarWrite,{title:'Actual updated title'});
 for(const key of ['description','location']){assert(!Object.hasOwn(updated.calendarWrite,key));assert(updated.calendarWrite.details.missingFields.includes(key));}
 assert.doesNotMatch(JSON.stringify(updated.calendarWrite),/Requested update|Before description|Before room/);
});
test('batch creations and same-operation retries retain actual details without selecting unrelated human events',async()=>{
 const original=raw(),f=fixture({existing:[original]}),request=f.request();
 const added={title:'Added event',date:'2026-11-03',description:'A'.repeat(3000),location:'New room'};
 const result=await execute(request,'create_calendar_events',{events:[{title:'Saved provider title',date:'2026-11-03',description:'Requested replacement',location:'New separate room'},added,{...added}]});assert.equal(result.status,'ready');
 for(const batch of [result.calendarBatchWrite,projectCalendarBatchWrite(result.calendarBatchWrite)]){
  assert.deepEqual(batch.counts,{requested:3,created:2,existing:1,failed:0,unattempted:0});
  complete(batch.items[0].calendarWrite,{description:'Requested replacement',location:'New separate room'});
  assert.notEqual(batch.items[0].calendarWrite.eventId,original.id);
  for(const item of batch.items.slice(1))complete(item.calendarWrite,{title:'Added event',description:'A'.repeat(3000),location:'New room',start:allDay.start,end:allDay.end});
 }
 assert.deepEqual(f.events.get(original.id),original);assert.equal(f.writes(),2);
 assert.equal(f.calls.filter(call=>call.url.pathname.endsWith('/events')&&call.options.method==='GET').length,0);
});
test('batch title-only updates and unchanged rows use actual full saved snapshots',async()=>{
 const f=fixture({existing:[raw()]}),result=await execute(f.request(),'update_calendar_events',{events:[{eventId:'existing_event',title:'New actual title'},{eventId:'existing_event',title:'New actual title'},{eventId:'existing_event',description:'',location:''}]});assert.equal(result.status,'ready');
 for(const batch of [result.calendarBatchWrite,projectCalendarBatchWrite(result.calendarBatchWrite)]){assert.deepEqual(batch.items.map(r=>r.status),['updated','unchanged','updated']);complete(batch.items[0].calendarWrite,{title:'New actual title',description:'D'.repeat(2900)});complete(batch.items[1].calendarWrite,{title:'New actual title',description:'D'.repeat(2900)});complete(batch.items[2].calendarWrite,{description:'',location:''});}
});

test('batch wrappers do not fill omitted returned timing from requested or old event times',async()=>{
 const client={configured:true,calendarId,listEvents:async()=>({status:'ready',events:[],coverage:{complete:true}}),createChatEvent:async()=>({status:'ready',outcome:'created',eventId:'created_event',url:canonical('created_event'),title:'Returned title'}),readChatEvent:async()=>({status:'ready',events:[{eventId:'existing_event',title:'Before',...allDay}],chatRevision:{eventId:'existing_event',etag:'"before"',unsupported:false}}),updateChatEvent:async()=>({status:'ready',outcome:'updated',eventId:'existing_event',url:canonical('existing_event'),title:'Returned update title'})};
 const request=createChatCalendarTools({client}).createRequest({principal:actor,operationId:'stub'});
 for(const [name,events] of [['create_calendar_events',[{title:'Requested',date:'2026-11-03'}]],['update_calendar_events',[{eventId:'existing_event',title:'Requested update'}]]]){
  const result=await execute(request,name,{events});assert.equal(result.status,'ready');const receipt=result.calendarBatchWrite.items[0].calendarWrite;assert(!Object.hasOwn(receipt,'start'));assert(!Object.hasOwn(receipt,'end'));assert(receipt.details.missingFields.includes('start'));assert(receipt.details.missingFields.includes('end'));
 }
});

function planningFixture({native=false,count=1,duplicate=false,extreme=false,identityLength=64}={}) {
 const f={plans:[],answers:[],events:[],records:[],writes:0};
 const rows=Array.from({length:count},(_,index)=>({title:extreme?`${String(index).padStart(3,'0')}${'t'.repeat(297)}`:`Requested row ${index}`,date:'2026-11-03'}));
 const client={configured:true,calendarId,listEvents:async()=>({status:'ready',events:[],coverage:{complete:true}}),createChatEvent:async args=>{const eventId=extreme?`${String(f.writes++).padStart(3,'0')}${'a'.repeat(identityLength-3)}`:`saved_event_${f.writes++}`;return {status:'ready',outcome:'created',eventId,url:canonical(eventId),title:`ACTUAL ${args.title}`,description:'Saved description '+ 'x'.repeat(2982),location:extreme?'L'.repeat(500):'Actual room',...allDay,eventStatus:'confirmed'};}};
 const googleTools=createChatCalendarTools({client});
 const name=count===1?'create_calendar_event':'create_calendar_events',arguments_=count===1?requested:{events:rows};
 const toolCall=()=>({id:'create_'+f.plans.length,name,arguments:arguments_});
 const provider={async *stream(input){f.answers.push(input);yield 'Confirmed saved receipts.';}};
 if(native)provider.toolTurn=async input=>{f.plans.push(input);return {text:'',toolCalls:f.plans.length===1||duplicate&&f.plans.length===2?[toolCall()]:[]};};
 else provider.planTools=async input=>{f.plans.push(input);return f.plans.length===1||duplicate&&f.plans.length===2?[toolCall()]:[];};
 const runner=createChatRunner({config:{configured:true,provider:'openai-compatible',timeoutMs:3000,requestTimeoutMs:3000,retrievalToolsEnabled:true},provider,googleTools,audit:{recordEvent:async e=>f.events.push(e)}});
 f.run=()=>runner.run({conversation:{messages:[{role:'user',content:'Create these requested events in the club calendar.'}],timeZone:'America/New_York'},principal:actor,onRecord:r=>f.records.push(r)});
 f.finalData=()=>JSON.parse(f.answers[0].system.split('\nUNTRUSTED TOOL STATUS AND REFERENCE DATA (JSON):\n')[1]);return f;
}
for(const native of [false,true])test(`${native?'native':'legacy'} planning and final answer retain actual full saved single receipt and duplicate receipt`,async()=>{
 const f=planningFixture({native,duplicate:true});assert.equal((await f.run()).status,'succeeded');assert.equal(f.writes,1);
 const result=f.finalData().results.find(r=>r.tool==='create_calendar_event');complete(result.calendarWrite,{title:'ACTUAL Requested title',description:'Saved description '+'x'.repeat(2982),location:'Actual room',start:allDay.start,end:allDay.end});
 const duplicateResult=native?JSON.parse(f.plans[2].messages.filter(m=>m.role==='tool').at(-1).content):JSON.parse(f.plans[2].system.split('\nUNTRUSTED PREVIOUS TOOL RESULTS (JSON):\n')[1]).find(result=>result.calendarWrite);
 if(native){assert.equal(duplicateResult.status,'duplicate_call_skipped');assert.equal(duplicateResult.previousResult.calendarWrite.title,'ACTUAL Requested title');assert.equal(duplicateResult.previousResult.calendarWrite.description.length,3000);}else{assert.equal(duplicateResult.calendarWrite.title,'ACTUAL Requested title');assert.equal(duplicateResult.calendarWrite.description.length,3000);}
 assert.doesNotMatch(JSON.stringify(f.records),/Saved description|ACTUAL Requested title/);assert.doesNotMatch(JSON.stringify(f.events),/Saved description|ACTUAL Requested title/);
});
for(const native of [false,true])test(`${native?'native':'legacy'} 50-row oversized saved receipts retain every actual identity/outcome/title/time and disclose omitted details`,async()=>{
 const f=planningFixture({native,count:50});assert.equal((await f.run()).status,'succeeded');assert.equal(f.writes,50);
 const final=f.finalData().results.find(r=>r.tool==='create_calendar_events').calendarBatchWrite;assert.equal(final.items.length,50);assert.equal(final.counts.created,50);
 for(const [index,item] of final.items.entries())complete(item.calendarWrite,{eventId:`saved_event_${index}`,title:`ACTUAL Requested row ${index}`,outcome:'created',start:allDay.start,end:allDay.end});
 assert(Buffer.byteLength(f.answers[0].system)<300000,'final prompt must be bounded including duplicated capabilities');
 if(native){const tool=f.plans[1].messages.find(m=>m.role==='tool');assert(tool);assert(Buffer.byteLength(tool.content)<=64000);const result=JSON.parse(tool.content);assert.equal(result.calendarBatchWrite.items.length,50);for(const item of result.calendarBatchWrite.items){assert.equal(item.calendarWrite.details.compacted,true);assert(item.calendarWrite.details.omittedFields.includes('description'));assert(!Object.hasOwn(item.calendarWrite,'description'));assert(item.calendarWrite.title.startsWith('ACTUAL '));}}
});
test('worst-case safe ancillary fields cannot erase a successful receipt at the managed tool size boundary',()=>{
 const event=raw({description:'d'.repeat(3000),attendees:Array.from({length:20},()=>({email:'e'.repeat(320),displayName:'n'.repeat(200),optional:true,responseStatus:'accepted',additionalGuests:1000})),recurrence:Array.from({length:20},()=> 'R'.repeat(1000)),organizer:{email:'o'.repeat(320),displayName:'n'.repeat(200)},creator:{email:'c'.repeat(320),displayName:'n'.repeat(200)}});
 const receipt=calendarEventReceipt(event,{calendarId,outcome:'updated'});assert(Buffer.byteLength(JSON.stringify({status:'ready',...receipt}))<=16384,'managed tool hard cap is 16KiB');assert.equal(receipt.description.length,3000);assert(receipt.details.omittedFields?.length);
});

test('actual provider-omitted optional fields and sparse cancellation never inherit requested or preread fields',async()=>{
 const f=fixture({existing:[raw()],mutateOutput:(event,options)=>{if(options.method==='PATCH'&&event.status==='cancelled')for(const key of ['summary','description','location','start','end'])delete event[key];}}),request=f.request();
 await execute(request,'read_calendar_event',{eventId:'existing_event'});const cancelled=await execute(request,'delete_calendar_event',{eventId:'existing_event'});assert.equal(cancelled.status,'ready');complete(cancelled.calendarWrite,{eventStatus:'cancelled',eventId:'existing_event'});
 for(const key of ['title','description','location','start','end']){assert(!Object.hasOwn(cancelled.calendarWrite,key),key);assert(cancelled.calendarWrite.details.missingFields.includes(key),key);}
 const g=fixture({mutateOutput:event=>{delete event.description;delete event.location;}});const created=await execute(g.request(),'create_calendar_event',{title:'No optional fields',...allDay});assert.equal(created.status,'ready');for(const key of ['description','location']){assert(!Object.hasOwn(created.calendarWrite,key));assert(created.calendarWrite.details.missingFields.includes(key));}
});


test('native maximum-length titles and locations across50 receipts retain every core result within64KiB',async()=>{
 const f=planningFixture({native:true,count:50,extreme:true});assert.equal((await f.run()).status,'succeeded');assert.equal(f.writes,50);
 const tool=f.plans[1].messages.find(m=>m.role==='tool');assert(Buffer.byteLength(tool.content)<=64000);const result=JSON.parse(tool.content);assert.equal(result.calendarBatchWrite.items.length,50);
 for(const [index,item] of result.calendarBatchWrite.items.entries()){
  const receipt=item.calendarWrite;assert(receipt,JSON.stringify(item));assert.equal(receipt.eventId,`${String(index).padStart(3,'0')}${'a'.repeat(61)}`);assert.equal(receipt.outcome,'created');assert.equal(receipt.title,(`ACTUAL ${String(index).padStart(3,'0')}${'t'.repeat(297)}`).slice(0,300));assert.deepEqual(receipt.start,allDay.start);assert.deepEqual(receipt.end,allDay.end);assert(receipt.details.omittedFields.includes('description'));
  if(!Object.hasOwn(receipt,'location'))assert(receipt.details.omittedFields.includes('location'));
 }
 assert(Buffer.byteLength(f.answers[0].system)<300000);
});


test('pathological long-ID omitted receipts remain idempotent through repeated projection and native duplicate propagation',async()=>{
 const f=planningFixture({native:true,count:50,extreme:true,identityLength:1024,duplicate:true});assert.equal((await f.run()).status,'succeeded');assert.equal(f.writes,50);
 const initial=JSON.parse(f.plans[1].messages.filter(m=>m.role==='tool').at(-1).content);const batch=initial.calendarBatchWrite;assert(batch);assert.equal(batch.items.length,50);
 const projected=projectCalendarBatchWrite(batch),compacted=compactCalendarBatchWrite(batch);assert(projected);assert(compacted);assert(isDeepStrictEqual(projectCalendarBatchWrite(projected),projected),'repeated projection preserves omitted receipts');assert(isDeepStrictEqual(compactCalendarBatchWrite(compacted),compacted),'repeated compaction preserves omitted receipts');
 for(const [index,item] of batch.items.entries()){assert.equal(item.eventId||item.calendarWrite?.eventId,`${String(index).padStart(3,'0')}${'a'.repeat(1021)}`);assert.equal(item.outcome||item.calendarWrite?.outcome,'created');if(!item.calendarWrite)assert.equal(item.receiptOmitted,true);}
 const duplicate=f.plans[2].messages.filter(m=>m.role==='tool').at(-1);assert(Buffer.byteLength(duplicate.content)<=64000);const result=JSON.parse(duplicate.content);assert.equal(result.status,'duplicate_call_skipped');assert.equal(result.previousResult.calendarBatchWrite.items.length,50);assert.equal(f.finalData().results[0].calendarBatchWrite.items.length,50);
});

test('failure-only50-row compaction bounds long identities and Unicode requested titles idempotently',()=>{
 const batch={complete:false,counts:{requested:50,updated:0,unchanged:0,failed:50,unattempted:0},items:Array.from({length:50},(_,index)=>({index,status:'failed',eventId:`${String(index).padStart(3,'0')}${'a'.repeat(1021)}`,title:'漢'.repeat(300),reason:'google_unavailable'}))};
 assert(Buffer.byteLength(JSON.stringify(batch))>64000);const compacted=compactCalendarBatchWrite(batch);assert(compacted);assert(Buffer.byteLength(JSON.stringify(compacted))<64000);assert.equal(compacted.items.length,50);assert(isDeepStrictEqual(compactCalendarBatchWrite(compacted),compacted),'repeated compaction preserves explicit requested-field omissions');assert(isDeepStrictEqual(projectCalendarBatchWrite(compacted),compacted),'repeated projection preserves explicit requested-field omissions');
 for(const [index,item] of compacted.items.entries()){assert.equal(item.eventId,batch.items[index].eventId);assert.equal(item.status,'failed');assert.equal(item.reason,'google_unavailable');assert(!Object.hasOwn(item,'title'));assert.equal(item.details.requestedFieldsOmitted,true);}
});
