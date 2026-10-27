import test from 'node:test';
import assert from 'node:assert/strict';
import {createCalendarClient} from '../server/google/calendar-client.js';
import {CALENDAR_REQUIRED_SCOPES} from '../server/google/calendar-config.js';
import {GoogleError} from '../server/google/oauth.js';
import {createChatCalendarTools} from '../tools/calendar/chat.js';
import {projectCalendarBatchWrite} from '../tools/calendar/chat-batch.js';
import {createApp} from '../server/runtime/app.js';

const calendarId='fixed@example.com',privateText='PRIVATE_PROVIDER_FIELD',descriptionText='Saved event description requested for complete receipts';
const start={date:'2026-10-23'},end={date:'2026-10-24'};
const url=id=>`https://calendar.google.com/calendar/event?eid=${Buffer.from(`${id} ${calendarId}`).toString('base64url')}`;
const actor={id:'operator',googleAccess:true,allowedSourceIds:[]};
function fixture({existing=[],omitLocation=false,providerLocation}={}) {
  const events=new Map(existing.map(event=>[event.id,structuredClone(event)])),calls=[];let writes=0;
  const client=createCalendarClient({config:{configured:true,calendarId,expectedAccountEmail:'club@example.com'},
    oauthClient:{setCredentials(){},getAccessToken:async()=>({token:'fixture'}),getTokenInfo:async()=>({scopes:CALENDAR_REQUIRED_SCOPES})},
    fetchImpl:async(input,options)=>{
      const target=new URL(input);calls.push({target,options});
      if(target.hostname==='gmail.googleapis.com')return Response.json({emailAddress:'club@example.com'});
      if(target.pathname.includes('/calendarList/'))return Response.json({id:calendarId,accessRole:'writer'});
      const id=target.pathname.match(/\/events\/([^/]+)$/)?.[1];
      function output(event){const data={...structuredClone(event),privateField:privateText};if(omitLocation)delete data.location;return data;}
      if(options.method==='GET')return id?(events.has(id)?Response.json(output(events.get(id))):new Response('',{status:404})):
        Response.json({items:[...events.values()].map(output)});
      writes++;const body=JSON.parse(options.body),key=id||body.id;
      const saved={...events.get(key),...body,id:key,etag:`"revision-${writes}"`};
      if(providerLocation!==undefined)saved.location=providerLocation;
      events.set(key,saved);return Response.json(output(saved));
    }});
  const tools=createChatCalendarTools({client});
  return {client,events,calls,tools,writes:()=>writes,request:()=>tools.createRequest({principal:actor,operationId:'location-test'})};
}
const human=(id='existing_event',location='Human room')=>({id,summary:'Existing title',location,start,end,status:'confirmed',etag:'"human-revision"',description:descriptionText});
const execute=(request,name,args)=>request.execute({name,arguments:args});
const read=(request,eventId)=>execute(request,'read_calendar_event',{eventId});
function location(result,expected){assert.equal(result.status,'ready');assert.equal(result.calendarWrite.location,expected);assert(!JSON.stringify(result.calendarWrite).includes(privateText));}

test('single create, title-only update and cancellation retain actual saved venue',async()=>{
  const f=fixture(),request=f.request();
  const created=await execute(request,'create_calendar_event',{title:'New event',start,end,location:'Kimmel room 802'});
  location(created,'Kimmel room 802');const eventId=created.calendarWrite.eventId;
  await read(request,eventId);
  location(await execute(request,'update_calendar_event',{eventId,title:'Renamed event'}),'Kimmel room 802');
  await read(request,eventId);
  location(await execute(request,'delete_calendar_event',{eventId}),'Kimmel room 802');
  assert.equal(f.events.get(eventId).status,'cancelled');
});

test('explicit clear and unchanged update retain a returned empty location',async()=>{
  const f=fixture({existing:[human()]}),request=f.request();await read(request,'existing_event');
  location(await execute(request,'update_calendar_event',{eventId:'existing_event',location:''}),'');
  assert.equal(f.events.get('existing_event').location,'');assert.equal(f.writes(),1);
  await read(request,'existing_event');
  const unchanged=await execute(request,'update_calendar_event',{eventId:'existing_event',location:''});
  location(unchanged,'');assert.equal(unchanged.calendarWrite.outcome,'unchanged');assert.equal(f.writes(),1);
});

test('provider-added venue is authoritative even when it was absent from arguments',async()=>{
  const f=fixture({providerLocation:'Actual assigned room'});
  const result=await execute(f.request(),'create_calendar_event',{title:'No requested venue',start,end});
  location(result,'Actual assigned room');
});

test('omitted provider location remains unknown for create/read/update/cancel',async()=>{
  const f=fixture({omitLocation:true}),request=f.request();
  const created=await execute(request,'create_calendar_event',{title:'No venue',start,end});
  assert.equal(created.status,'ready');assert(!Object.hasOwn(created.calendarWrite,'location'));
  const eventId=created.calendarWrite.eventId;
  const reading=await read(request,eventId);assert(!Object.hasOwn(reading.calendarContext.events[0],'location'));
  const updated=await execute(request,'update_calendar_event',{eventId,title:'Changed title'});
  assert.equal(updated.status,'ready');assert(!Object.hasOwn(updated.calendarWrite,'location'));
  await read(request,eventId);
  const cancelled=await execute(request,'delete_calendar_event',{eventId});assert.equal(cancelled.status,'ready');assert(!Object.hasOwn(cancelled.calendarWrite,'location'));
});

test('single wrapper never substitutes requested location for actual saved or omitted field',async()=>{
  for(const saved of [{location:'Provider saved room'},{}]) {
    const client={configured:true,calendarId,createChatEvent:async()=>({status:'ready',outcome:'created',eventId:'saved_event',url:url('saved_event'),start,end,...saved})};
    const request=createChatCalendarTools({client}).createRequest({principal:actor,operationId:'stub'});
    const result=await execute(request,'create_calendar_event',{title:'Event',start,end,location:'Requested room'});
    assert.equal(result.status,'ready');assert.equal(Object.hasOwn(result.calendarWrite,'location'),Object.hasOwn(saved,'location'));
    if(saved.location)assert.equal(result.calendarWrite.location,saved.location);
    assert(!JSON.stringify(result.calendarWrite).includes('Requested room'));
  }
});

test('batch creations and same-operation duplicates preserve actual saved venues without choosing existing events',async()=>{
  const original=human(),f=fixture({existing:[original]}),request=f.request();
  const result=await execute(request,'create_calendar_events',{events:[
    {title:'Existing title',date:start.date,location:'New separate room'},
    {title:'New row',date:start.date,location:'New actual room'},
    {title:'New row',date:start.date,location:'New actual room'},
  ]});
  assert.equal(result.status,'ready');assert.deepEqual(result.calendarBatchWrite.counts,{requested:3,created:2,existing:1,failed:0,unattempted:0});
  assert.deepEqual(result.calendarBatchWrite.items.map(row=>row.calendarWrite.location),['New separate room','New actual room','New actual room']);
  const projected=projectCalendarBatchWrite(result.calendarBatchWrite);
  assert.deepEqual(projected.items.map(row=>row.calendarWrite.location),['New separate room','New actual room','New actual room']);
  assert.deepEqual(f.events.get(original.id),original);assert.equal(f.writes(),2);
  assert.notEqual(projected.items[0].calendarWrite.eventId,original.id);
  assert(!JSON.stringify(projected).includes(privateText));
  assert.equal(f.calls.filter(call=>call.target.pathname.endsWith('/events')&&call.options.method==='GET').length,0);
});

test('batch title-only updates preserve human venue and clearing stays explicit',async()=>{
  const f=fixture({existing:[human('first_event'),human('second_event','Second room')]}),request=f.request();
  const result=await execute(request,'update_calendar_events',{events:[
    {eventId:'first_event',title:'Updated title'},
    {eventId:'second_event',location:''},
    {eventId:'second_event',location:''},
  ]});
  assert.equal(result.status,'ready');assert.deepEqual(result.calendarBatchWrite.items.map(row=>row.calendarWrite.location),['Human room','','']);
  assert.deepEqual(projectCalendarBatchWrite(result.calendarBatchWrite).items.map(row=>row.calendarWrite.location),['Human room','','']);
  assert.equal(f.events.get('first_event').location,'Human room');assert.equal(f.events.get('second_event').location,'');
});

test('omitted saved venue does not fall back to batch requested or prior-read location',async()=>{
  const client={configured:true,calendarId,listEvents:async()=>({status:'ready',events:[],coverage:{complete:true}}),
    createChatEvent:async()=>({status:'ready',outcome:'created',eventId:'created_event',url:url('created_event'),start,end}),
    readChatEvent:async()=>({status:'ready',events:[{eventId:'existing_event',title:'Before',start,end,location:'Prior read room'}],chatRevision:{eventId:'existing_event',etag:'"fixture"',unsupported:false}}),
    updateChatEvent:async()=>({status:'ready',outcome:'updated',eventId:'existing_event',url:url('existing_event'),start,end})};
  const request=createChatCalendarTools({client}).createRequest({principal:actor,operationId:'stub'});
  for(const [name,events] of [['create_calendar_events',[{title:'Event',date:start.date,location:'Requested room'}]],
    ['update_calendar_events',[{eventId:'existing_event',title:'After'}]]]) {
    const result=await execute(request,name,{events});assert.equal(result.status,'ready');
    assert(!Object.hasOwn(result.calendarBatchWrite.items[0].calendarWrite,'location'));
    assert(!Object.hasOwn(projectCalendarBatchWrite(result.calendarBatchWrite).items[0].calendarWrite,'location'));
  }
});

test('receipt venue is plain bounded text and unrelated provider fields never enter projection',async()=>{
  const long='A'.repeat(600)+'\u0000'+privateText;
  const f=fixture({providerLocation:long});const result=await execute(f.request(),'create_calendar_event',{title:'Bounded',start,end});
  location(result,'A'.repeat(500));assert.equal(result.calendarWrite.location.length,500);assert(!Object.hasOwn(result.calendarWrite,'privateField'));
  const batch={complete:true,counts:{requested:1,created:1,existing:0,failed:0,unattempted:0},items:[{index:0,status:'created',start,end,
    calendarWrite:{outcome:'created',eventId:'saved_event',url:url('saved_event'),start,end,location:'Room\u0000A',privateField:privateText}}]};
  const projected=projectCalendarBatchWrite(batch);assert.equal(projected.items[0].calendarWrite.location,'RoomA');assert(!JSON.stringify(projected).includes(privateText));
});

test('failed reads, returned failures and typed write errors retain safe diagnostics',async()=>{
  const diagnostics={stage:'provider_request',reason:'http_error',httpStatus:429};
  for(const thrown of [false,true]) {
    const client={configured:true,calendarId,listEvents:async()=>({status:'rate_limited',events:[],diagnostics}),
      createChatEvent:async()=>{if(thrown)throw new GoogleError('rate_limited',diagnostics);return {status:'rate_limited',diagnostics};}};
    const request=createChatCalendarTools({client}).createRequest({principal:actor,operationId:'stub'});
    const listing=await execute(request,'list_calendar_events',{timeMin:'2026-10-23T00:00:00Z',timeMax:'2026-10-24T00:00:00Z'});
    assert.equal(listing.status,'rate_limited');assert.deepEqual(listing.diagnostics,diagnostics);
    const writing=await execute(request,'create_calendar_event',{title:'Event',start,end});
    assert.equal(writing.status,'rate_limited');assert.deepEqual(writing.diagnostics,diagnostics);
  }
});


for(const savedLocation of ['Actual room','',undefined])test(`HTTP planning and answer references retain ${savedLocation===undefined?'unknown':savedLocation===''?'cleared':'saved'} single venue`,async()=>{
  const f=fixture({providerLocation:savedLocation,omitLocation:savedLocation===undefined}),plans=[];let round=0,answer;
  const app=createApp({config:{configured:true,production:false,timeoutMs:3000},googleTools:f.tools,auth:()=>actor,
    provider:{planTools:async input=>{plans.push(input);return round++===0?[{name:'create_calendar_event',arguments:{title:'Receipt event',start,end}}]:[];},
      async *stream(input){answer=input;yield 'Receipt confirmed.';}}});
  const response=await app.request('/api/chat',{method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({messages:[{role:'user',content:'Create the event.'}],timeZone:'America/New_York'})});
  assert.equal(response.status,200);await response.text();
  const previous=JSON.parse(plans[1].system.split('\nUNTRUSTED PREVIOUS TOOL RESULTS (JSON):\n')[1]);
  const final=JSON.parse(answer.system.split('\nUNTRUSTED TOOL STATUS AND REFERENCE DATA (JSON):\n')[1]);
  for(const rows of [previous,final.results]) {
    const receipt=rows.find(row=>row.tool==='create_calendar_event').calendarWrite;
    assert.equal(Object.hasOwn(receipt,'location'),savedLocation!==undefined);
    if(savedLocation!==undefined)assert.equal(receipt.location,savedLocation);
  }
});

test('HTTP batch projection and final answer preserve actual locations of explicitly created records',async()=>{
  const f=fixture({existing:[human()]}),plans=[];let round=0,answer;
  const app=createApp({config:{configured:true,production:false,timeoutMs:3000},googleTools:f.tools,auth:()=>actor,
    provider:{planTools:async input=>{plans.push(input);return round++===0?[{name:'create_calendar_events',arguments:{events:[
      {title:'Existing title',date:start.date,location:'Requested must not replace human room'},
      {title:'Added event',date:start.date,location:'Saved new room'},
    ]}}]:[];},async *stream(input){answer=input;yield 'Batch confirmed.';}}});
  const response=await app.request('/api/chat',{method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({messages:[{role:'user',content:'Add these two events.'}],timeZone:'America/New_York'})});
  assert.equal(response.status,200);await response.text();
  const previous=JSON.parse(plans[1].system.split('\nUNTRUSTED PREVIOUS TOOL RESULTS (JSON):\n')[1]);
  const final=JSON.parse(answer.system.split('\nUNTRUSTED TOOL STATUS AND REFERENCE DATA (JSON):\n')[1]);
  for(const rows of [previous,final.results])assert.deepEqual(rows.find(row=>row.tool==='create_calendar_events').calendarBatchWrite.items
    .map(row=>row.calendarWrite.location),['Requested must not replace human room','Saved new room']);
  assert.equal(f.events.get('existing_event').location,'Human room');
});
