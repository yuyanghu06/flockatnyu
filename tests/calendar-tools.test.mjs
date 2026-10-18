import test from 'node:test';
import assert from 'node:assert/strict';
import {readCalendarConfig,CALENDAR_REQUIRED_SCOPES} from '../server/google/calendar-config.js';
import {GOOGLE_CALENDAR_SCOPES} from '../server/google/config.js';
import {createCalendarClient,calendarEventId,validCalendarInstant} from '../server/google/calendar-client.js';

const target='fixture-calendar@group.calendar.google.com';
const sourceId='10000000-0000-4000-8000-000000000001';
const principal={id:'update-service',calendarAccess:true,calendarId:target,allowedSourceIds:[sourceId],calendarSources:[{boardId:'board_1',sourceId}]};
const env={GOOGLE_CLIENT_ID:'synthetic-client',GOOGLE_CLIENT_SECRET:'synthetic-secret',GOOGLE_REFRESH_TOKEN:'synthetic-refresh',GOOGLE_EXPECTED_ACCOUNT_EMAIL:'club@example.com',GOOGLE_CALENDAR_ID:target};
const input={sourceKey:'miro:board_1:item_1',sourceUrl:'https://miro.com/app/board/board_1/?moveToWidget=item_1',title:'Planning meeting',start:{dateTime:'2026-10-20T18:00:00-04:00',timeZone:'America/New_York'},end:{dateTime:'2026-10-20T19:00:00-04:00',timeZone:'America/New_York'}};
function fixture({email='club@example.com',scopes=CALENDAR_REQUIRED_SCOPES,role='writer',calendarId=target,writeMode,existing,patchStatus}={}) {
 const calls=[],events=new Map();if(existing)events.set(existing.id,structuredClone(existing));let writes=0;
 const oauth={setCredentials:c=>assert.equal(c.refresh_token,'synthetic-refresh'),getAccessToken:async()=>({token:'synthetic-access'}),getTokenInfo:async()=>({scopes})};
 const fetchImpl=async(value,options)=>{
  const url=new URL(value);calls.push({url,options});assert.equal(options.redirect,'error');
  assert.equal(options.headers.Authorization,'Bearer synthetic-access');
  if(url.hostname==='gmail.googleapis.com')return Response.json({emailAddress:email});
  if(url.pathname.includes('/users/me/calendarList/'))return Response.json({id:calendarId,accessRole:role});
  assert.equal(url.origin,'https://www.googleapis.com');
  const match=/\/calendars\/([^/]+)\/events(?:\/([^/]+))?$/.exec(url.pathname);assert(match,url.href);assert.equal(decodeURIComponent(match[1]),target);
  const id=match[2]&&decodeURIComponent(match[2]);
  if(options.method==='GET')return id===undefined?Response.json({items:[...events.values()]}):events.has(id)?Response.json(events.get(id)):Response.json({error:'missing'}, {status:404});
  assert(['POST','PATCH'].includes(options.method));assert.equal(url.searchParams.get('sendUpdates'),'none');writes++;
  if(patchStatus&&options.method==='PATCH')return Response.json({error:'conflict'}, {status:patchStatus});
  const body=JSON.parse(options.body),key=id||body.id;
  assert(!('attendees' in body));assert(!('recurrence' in body));assert(!('conferenceData' in body));assert(!('calendarId' in body));
  const saved={...events.get(key),...body,id:key,etag:`"revision-${writes}"`};events.set(key,saved);
  if(writeMode==='lost')throw Error('synthetic transport response lost');
  if(writeMode==='409')return Response.json({error:'duplicate'}, {status:409});
  return Response.json(saved);
 };
 const client=createCalendarClient({config:readCalendarConfig(env),oauthClient:oauth,fetchImpl});
 return {client,calls,events,writes:()=>writes,write:args=>client.upsertEvent({...input,...args,principal:args?.principal||principal})};
}

test('Calendar configuration requires an explicit target and OAuth account, and declares ACL/read-write scopes',()=>{
 assert.equal(readCalendarConfig(env).configured,true);
 for(const patch of [{GOOGLE_CALENDAR_ID:''},{GOOGLE_CALENDAR_ID:'primary'},{GOOGLE_CALENDAR_ID:'https://evil.invalid'},{GOOGLE_EXPECTED_ACCOUNT_EMAIL:''}])assert.equal(readCalendarConfig({...env,...patch}).configured,false);
 for(const scope of GOOGLE_CALENDAR_SCOPES)assert(CALENDAR_REQUIRED_SCOPES.includes(scope),scope);
});

test('Calendar live preflight requires correct account, all scopes, exact calendar and writer/owner role',async()=>{
 for(const options of [{email:'stranger@example.com'},{scopes:[]},{role:'reader'},{role:'freeBusyReader'},{calendarId:'other@group.calendar.google.com'}]){
  const f=fixture(options),r=await f.client.preflight();assert.notEqual(r.status,'ready');assert.equal(f.writes(),0);assert(!f.calls.some(c=>c.url.pathname.includes('/events')));
 }
 for(const role of ['writer','owner']){const f=fixture({role});assert.deepEqual(await f.client.preflight(),{status:'ready',calendarId:target,accessRole:role});assert.equal(f.writes(),0);}
});

test('Calendar principals and per-board source allowlists cannot be replaced by a plausible Miro URL',async()=>{
 const f=fixture();
 for(const p of [{...principal,calendarAccess:false},{...principal,calendarId:'other@example.com'},{...principal,calendarSources:[]},{...principal,allowedSourceIds:[]}])assert.notEqual((await f.write({principal:p})).status,'ready');
 for(const args of [{sourceKey:'miro:other:item_1',sourceUrl:'https://miro.com/app/board/other/?moveToWidget=item_1'},{sourceKey:'gmail:abc'},{sourceUrl:'https://evil.invalid/item'},{sourceUrl:input.sourceUrl+'&extra=1'}])assert.notEqual((await f.write(args)).status,'ready');
 assert.equal(f.writes(),0);
});

test('Repeated Miro evidence across batches yields one event independently of queue membership',async()=>{
 const f=fixture();const a=await f.write({idempotencyKey:'first-batch'}),b=await f.write({idempotencyKey:'different-batch'});
 assert.equal(a.status,'ready');assert.equal(b.status,'ready');assert.equal(a.eventId,b.eventId);assert.equal(a.eventId,calendarEventId(target,input.sourceKey));assert.equal(f.writes(),1);assert.equal(f.events.size,1);
 const c=await f.write({title:'Changed explicit title'});assert.equal(c.outcome,'updated');assert.equal(f.events.size,1);assert.equal(f.writes(),2);
 const patch=f.calls.find(c=>c.options.method==='PATCH');assert.equal(patch.options.headers['If-Match'],'"revision-1"');
});

for(const writeMode of ['lost','409'])test(`Calendar ${writeMode} write reply reconciles remote state and retry never duplicates`,async()=>{
 const f=fixture({writeMode});const result=await f.write();assert.equal(result.status,'ready');assert.equal(result.outcome,'reconciled');assert.equal((await f.write()).outcome,'unchanged');assert.equal(f.writes(),1);assert.equal(f.events.size,1);
});

test('Human modifications and ETag races are preserved instead of overwritten',async()=>{
 const f=fixture();await f.write();const id=calendarEventId(target,input.sourceKey);
 const original=structuredClone(f.events.get(id));
 for(const mutate of [e=>{e.summary='Human title';},e=>{e.attendees=[{email:'person@example.com'}];},e=>{e.recurrence=['RRULE:FREQ=WEEKLY'];},e=>{e.source.url='https://human.example.com';},e=>{delete e.extendedProperties;}]){
  const e=structuredClone(original);mutate(e);f.events.set(id,e);const result=await f.write({title:'Agent revision'});assert.notEqual(result.status,'ready');assert.equal(f.writes(),1);assert.deepEqual(f.events.get(id),e);
 }
 const race=fixture({existing:original,patchStatus:412});assert.equal((await race.write({title:'Conflicting update'})).status,'conflict');assert.deepEqual(race.events.get(id),original);assert.equal(race.writes(),1);
});

test('All-day events use exclusive valid dates; timed events require explicit RFC3339 offset and IANA timezone',async()=>{
 const f=fixture();assert.equal((await f.write({start:{date:'2026-10-20'},end:{date:'2026-10-21'}})).status,'ready');
 const before=f.writes();
 for(const [start,end] of [[{date:'2026-02-30'},{date:'2026-03-01'}],[{date:'2026-10-20'},{date:'2026-10-20'}],[{date:'2026-10-20'},input.end],[{dateTime:'2026-10-20T18:00:00',timeZone:'America/New_York'},input.end],[{dateTime:'2026-10-20T18:00:00-04:00',timeZone:'Not/AZone'},input.end],[{dateTime:'2026-10-20T24:00:00Z',timeZone:'UTC'},input.end]])assert.equal((await f.write({start,end})).status,'invalid_request');
 assert.equal(f.writes(),before);for(const value of ['2026-02-30T18:00:00Z','2026-10-20T18:00:00','2026-10-20T18:60:00Z'])assert.equal(validCalendarInstant(value),false);
});

test('Cancellation affects only the deterministically managed event and never sends notifications',async()=>{
 const f=fixture();const created=await f.write();const unrelated={id:'human_event',summary:'Human event'};f.events.set(unrelated.id,unrelated);
 const args={sourceKey:input.sourceKey,sourceUrl:input.sourceUrl,principal};
 assert.equal((await f.client.cancelEvent(args)).outcome,'cancelled');assert.equal(f.events.get(created.eventId).status,'cancelled');assert.deepEqual(f.events.get(unrelated.id),unrelated);
 assert.equal((await f.client.cancelEvent(args)).outcome,'unchanged');assert.equal(f.writes(),2);
 const human=fixture({existing:{...f.events.get(created.eventId),extendedProperties:{}}});assert.equal((await human.client.cancelEvent(args)).status,'unmanaged_event');assert.equal(human.writes(),0);
});

test('Model-visible Calendar tools reject alternate surfaces and unsupported fields before any client invocation',async()=>{
 const {createCalendarTools,CALENDAR_TOOLS}=await import('../tools/calendar/index.js');let invoked=0;
 const tools=createCalendarTools({client:{configured:true,calendarId:target,upsertEvent:async()=>{invoked++;return {status:'ready'};}}});
 assert.deepEqual(CALENDAR_TOOLS.map(t=>t.name),['list_calendar_events','read_calendar_event','upsert_calendar_event','cancel_calendar_event']);
 for(const extra of [{calendarId:'other@example.com'},{attendees:[{email:'person@example.com'}]},{sendUpdates:'all'},{recurrence:['RRULE:FREQ=DAILY']},{conferenceData:{}},{eventId:'human_event'}])assert.equal((await tools.execute({name:'upsert_calendar_event',arguments:{...input,...extra},principal})).status,'invalid_request');
 for(const name of ['delete_calendar_event','send_gmail','update_drive','insert_event'])assert.equal((await tools.execute({name,arguments:{},principal})).status,'invalid_request');
 assert.equal(invoked,0);assert.equal((await tools.execute({name:'upsert_calendar_event',arguments:input,principal})).status,'ready');assert.equal(invoked,1);
});

test('Calendar writer ACL is rechecked immediately before mutation and revocation prevents a write',async()=>{
 let acls=0,writes=0;
 const client=createCalendarClient({config:readCalendarConfig(env),oauthClient:{setCredentials(){},getAccessToken:async()=>({token:'synthetic-access'}),getTokenInfo:async()=>({scopes:CALENDAR_REQUIRED_SCOPES})},fetchImpl:async(value,options)=>{
  const url=new URL(value);
  if(url.hostname==='gmail.googleapis.com')return Response.json({emailAddress:'club@example.com'});
  if(url.pathname.includes('/calendarList/'))return Response.json({id:target,accessRole:++acls===1?'writer':'reader'});
  if(options.method!=='GET')writes++;
  return Response.json({}, {status:404});
 }});
 assert.equal((await client.upsertEvent({...input,principal})).status,'permission_denied');assert.equal(acls,2);assert.equal(writes,0);
});

test('Cancelled requests use no network and normalized timed events remain idempotent',async()=>{
 const f=fixture(),controller=new AbortController();controller.abort();assert.equal((await f.client.preflight({signal:controller.signal})).status,'aborted');assert.equal(f.calls.length,0);
 const created=await f.write();const saved=f.events.get(created.eventId);assert.equal(saved.start.dateTime,'2026-10-20T22:00:00.000Z');assert.equal(saved.start.timeZone,'America/New_York');assert.equal((await f.write()).outcome,'unchanged');
});

test('Calendar list and exact reads retain provider timestamps, recurrence instance IDs and exclusive all-day boundaries',async()=>{
 const event={id:'recurring_20261101',summary:'All-day campus event',start:{date:'2026-11-01'},end:{date:'2026-11-02'},
  created:'2026-10-18T12:00:00-04:00',updated:'2026-10-18T14:30:00-04:00',status:'confirmed',location:'Unmapped room',
  extendedProperties:{private:{secret:'not returned'}},attendees:[{email:'not-returned@example.com'}]};
 const f=fixture({existing:event});
 const listed=await f.client.listEvents({timeMin:'2026-10-31T00:00:00Z',timeMax:'2026-11-03T00:00:00Z',principal});
 const read=await f.client.readEvent({eventId:event.id,principal});
 assert.equal(listed.status,'ready');assert.equal(read.status,'ready');assert.deepEqual(listed.events,read.events);
 const result=read.events[0];assert.equal(result.eventId,event.id);assert.equal(result.createdAt,'2026-10-18T16:00:00.000Z');assert.equal(result.updatedAt,'2026-10-18T18:30:00.000Z');
 assert.deepEqual(result.start,event.start);assert.deepEqual(result.end,event.end);assert.equal(result.location,event.location);
 assert.equal(result.attendees,undefined);assert.equal(result.extendedProperties,undefined);assert.equal(f.writes(),0);
 const listCall=f.calls.find(c=>c.url.searchParams.has('singleEvents'));assert.equal(listCall.url.searchParams.get('singleEvents'),'true');
 assert.match(listCall.url.searchParams.get('fields'),/created,updated/);
});

test('Missing or malformed Calendar original timestamps stay unknown rather than becoming the processing clock',async()=>{
 for(const patch of [{},{created:'not-an-instant',updated:'2026-02-30T12:00:00Z'}]) {
  const f=fixture({existing:{id:'meeting_123',summary:'Meeting',start:input.start,end:input.end,...patch}});
  const result=await f.client.readEvent({eventId:'meeting_123',principal});assert.equal(result.status,'ready');
  assert.equal(result.events[0].createdAt,null);assert.equal(result.events[0].updatedAt,null);assert.equal(f.writes(),0);
 }
});

test('Discord managed Calendar identities stay stable across edits/cancellation and preserve human modifications',async()=>{
 const discordKey='discord:100:200:300',discordUrl='https://discord.com/channels/100/200/300';
 const actor={...principal,calendarSources:[{provider:'discord',guildId:'100',channelId:'200',messageId:'300',sourceId}]};
 const f=fixture(),args={sourceKey:discordKey,sourceUrl:discordUrl,principal:actor};
 const created=await f.write(args);assert.equal(created.status,'ready');assert.equal(created.eventId,calendarEventId(target,discordKey));
 assert.equal(f.events.get(created.eventId).source.title,'Discord source');assert.equal((await f.write(args)).outcome,'unchanged');assert.equal(f.writes(),1);
 assert.equal((await f.write({...args,title:'Supported edited title'})).outcome,'updated');assert.equal(f.events.size,1);
 assert.equal((await f.client.cancelEvent(args)).outcome,'cancelled');assert.equal(f.events.get(created.eventId).status,'cancelled');
 const before=f.writes();f.events.get(created.eventId).summary='Human override';
 assert.equal((await f.write({...args,title:'Agent attempted overwrite'})).status,'human_modified');assert.equal(f.writes(),before);
});

test('Discord source keys and URLs cannot manufacture trusted source grants',async()=>{
 const f=fixture(),args={sourceKey:'discord:100:200:300',sourceUrl:'https://discord.com/channels/100/200/300'};
 const actor={...principal,calendarSources:[{provider:'discord',guildId:'100',channelId:'200',messageId:'300',sourceId}]};
 for(const patch of [{principal},{principal:{...actor,allowedSourceIds:[]}},{principal:actor,sourceKey:'discord:999:200:300'},
  {principal:actor,sourceKey:'discord:100:200:301'},{principal:actor,sourceUrl:args.sourceUrl+'?extra=1'}])assert.equal((await f.write({...args,...patch})).status,'forbidden_source');
 assert.equal(f.writes(),0);
});
