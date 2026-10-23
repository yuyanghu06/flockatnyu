import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {createAutomationAdapters,discordCalendarIntent} from '../server/automation/adapters.js';
import {readAutomationConfig} from '../server/automation/config.js';
import {createCalendarClient,calendarEventId} from '../server/google/calendar-client.js';
import {readCalendarConfig,CALENDAR_REQUIRED_SCOPES} from '../server/google/calendar-config.js';

const sourceId=randomUUID(),inputId=randomUUID(),calendarId='club@group.calendar.google.com',stamp='2026-10-22T18:00:00Z';
const messageId='abc123',sourceUrl=`https://mail.google.com/mail/u/0/#all/${messageId}`,sourceKey=`gmail:${messageId}`;
const body='Join us for a Google office tour November 13, 2026 at 3pm. Meet at Bobst.';
const args={sourceKey,sourceUrl,title:'Google office tour',location:'Bobst',start:{dateTime:'2026-11-13T15:00:00-05:00',timeZone:'America/New_York'},end:{dateTime:'2026-11-13T17:00:00-05:00',timeZone:'America/New_York'}};
const window={timeMin:'2026-11-13T00:00:00-05:00',timeMax:'2026-11-14T00:00:00-05:00'};
function fixture({text=body,queuedId=messageId,queueSource=sourceId,allowed=true,cachedSender='Organizer <host@example.test>',contentStatus='text_only_bounded',existing=[],calendarCoverage=true}={}) {
  const rows=new Map(existing.map(row=>[row.id,structuredClone(row)])),http=[],gmailReads=[];
  let current={kind:'gmail',externalId:messageId,url:sourceUrl,title:'Google office tour',from:cachedSender,date:stamp,excerpt:text,contentStatus},gmailStatus='ready';
  const env={ASSISTANT_ALLOWED_SOURCE_IDS:allowed?sourceId:randomUUID(),AGENT_GMAIL_SOURCE_ID:sourceId,
    GOOGLE_CLIENT_ID:'client',GOOGLE_CLIENT_SECRET:'synthetic',GOOGLE_REFRESH_TOKEN:'synthetic',GOOGLE_EXPECTED_ACCOUNT_EMAIL:'club@example.test',GOOGLE_CALENDAR_ID:calendarId};
  const config=readCalendarConfig(env),oauth={setCredentials:()=>{},getAccessToken:async()=>({token:'synthetic'}),getTokenInfo:async()=>({scopes:CALENDAR_REQUIRED_SCOPES})};
  const calendarClient=createCalendarClient({config,oauthClient:oauth,fetchImpl:async(value,options={})=>{
    const u=new URL(value);http.push({url:value,method:options.method||'GET',body:options.body&&JSON.parse(options.body)});
    if(u.hostname==='gmail.googleapis.com')return Response.json({emailAddress:'club@example.test'});
    assert.equal(u.hostname,'www.googleapis.com');if(u.pathname.includes('/calendarList/'))return Response.json({id:calendarId,accessRole:'owner'});
    const m=/\/calendars\/([^/]+)\/events(?:\/([^/]+))?$/.exec(u.pathname);assert(m);assert.equal(decodeURIComponent(m[1]),calendarId);
    const id=m[2]&&decodeURIComponent(m[2]);
    if(!options.method||options.method==='GET')return id?(rows.has(id)?Response.json(rows.get(id)):Response.json({}, {status:404})):Response.json({items:[...rows.values()],...(!calendarCoverage?{nextPageToken:'more'}:{})});
    assert.equal(u.searchParams.get('sendUpdates'),'none');const saved={...rows.get(id),...JSON.parse(options.body),id:id||JSON.parse(options.body).id,etag:'"new"',created:stamp,updated:stamp};assert(!saved.attendees);rows.set(saved.id,saved);return Response.json(saved);
  }});
  const googleClient={configured:true,readGmail:async read=>{gmailReads.push(read);return {status:gmailStatus,sources:gmailStatus==='ready'?[structuredClone(current)]:[]};}};
  const a=createAutomationAdapters({env,config:readAutomationConfig({AGENT_AUTOMATION_ENABLED:'true'}),now:()=>new Date(stamp),fetchImpl:async()=>{throw Error('No external HTTP');},dependencies:{googleConfig:{configured:true},googleClient,calendarConfig:config,calendarClient,discordConfig:{configured:false},discordTools:{tools:[]}}});
  const context={principal:a.principal,inputIds:[inputId]},input={uuid:inputId,raw_response:{source:'gmail',source_id:queueSource,event_type:'email_received_metadata',event_id:queuedId,revision:'1',received_at:stamp,payload:{id:queuedId,payload:{headers:[{name:'From',value:cachedSender}]}}}};
  return {a,context,rows,http,gmailReads,prepare:()=>a.prepareBatch({...context,inputs:[input]}),setSource:patch=>{current={...current,...patch};},revoke:()=>{gmailStatus='forbidden';},
    execute:(name,arguments_,ctx=context)=>{const tool=a.tools.find(tool=>tool.name===name);assert(tool);return tool.execute(arguments_,ctx);},writes:()=>http.filter(row=>['POST','PATCH','DELETE'].includes(row.method))};
}

for(const operation of ['create','update','cancel'])test(`authorized queued Gmail ${operation} uses exact managed Calendar identity after current body verification`,async()=>{
  const id=calendarEventId(calendarId,sourceKey),old={id,summary:'Initial tour',description:'Prior supported notes',location:'Bobst',etag:'"old"',status:'confirmed',start:args.start,end:args.end,source:{url:sourceUrl},extendedProperties:{private:{}},created:stamp,updated:stamp};
  const hash=value=>createHash('sha256').update(value).digest('hex');
  old.extendedProperties.private={updateAgentManager:'tech-nyu-update-agent-v1',updateAgentSource:hash(sourceKey),updateAgentHash:hash(JSON.stringify({summary:old.summary,description:old.description,location:old.location,start:{dateTime:new Date(old.start.dateTime).toISOString(),timeZone:'America/New_York'},end:{dateTime:new Date(old.end.dateTime).toISOString(),timeZone:'America/New_York'},status:old.status,sourceUrl}))};
  const text=operation==='cancel'?'Please cancel the Google office tour.':operation==='update'?'The Google office tour is rescheduled to November 13 at 3pm.':body;
  const f=fixture({text,existing:operation==='create'?[]:[old]});await f.prepare();
  assert.equal((await f.execute('read_gmail',{messageId})).status,'ready');await f.execute('list_calendar_events',window);
  const result=await f.execute(operation==='cancel'?'cancel_calendar_event':'upsert_calendar_event',operation==='cancel'?{sourceKey,sourceUrl}:{...args,...(operation==='update'?{description:old.description}:{})});
  assert.equal(result.status,'ready',JSON.stringify(result));assert.equal(result.eventId,id);assert.equal(f.writes().length,1);assert(f.gmailReads.length>=2,'mutation rereads current Gmail body');
  assert.equal(f.rows.get(id).source.url,sourceUrl);assert.equal(f.rows.get(id).extendedProperties.private.updateAgentSource,hash(sourceKey));
  if(operation==='cancel')assert.equal(f.rows.get(id).status,'cancelled');if(operation==='update')assert.equal(f.rows.get(id).description,'Prior supported notes');
});

test('Gmail metadata, snippet-only and unqueued reads cannot supply club Calendar write authority',async t=>{
  for(const mode of ['metadata','snippet','unqueued'])await t.test(mode,async()=>{
    const f=fixture({contentStatus:mode==='snippet'?'snippet_only':'text_only_bounded',queuedId:mode==='unqueued'?'def456':messageId});await f.prepare();
    if(mode!=='metadata')await f.execute('read_gmail',{messageId});await f.execute('list_calendar_events',window);
    assert.equal((await f.execute('upsert_calendar_event',args)).status,'forbidden_source');assert.equal(f.writes().length,0);
  });
});

test('Gmail fresh body, sender, subject and date changes or source revocation invalidate write evidence',async t=>{
  for(const patch of [{excerpt:'Changed current body'},{from:'Someone else <other@example.test>'},{title:'Different subject'},{date:'2026-10-22T18:01:00Z'},null])await t.test(JSON.stringify(patch),async()=>{
    const f=fixture();await f.prepare();await f.execute('read_gmail',{messageId});await f.execute('list_calendar_events',window);if(patch)f.setSource(patch);else f.revoke();
    assert.equal((await f.execute('upsert_calendar_event',args)).status,'forbidden_source');assert.equal(f.writes().length,0);
  });
});

test('Gmail denies forged keys/links, incorrect queue wrappers and invalid sender provenance',async t=>{
  for(const mode of ['wrong source','not allowed','invalid sender','forged key','forged URL','wrong wrapper'])await t.test(mode,async()=>{
    const f=fixture({queueSource:mode==='wrong source'?randomUUID():sourceId,allowed:mode!=='not allowed',cachedSender:mode==='invalid sender'?'"host@example.test"':undefined});
    if(['wrong source','not allowed'].includes(mode)){await assert.rejects(f.prepare());assert.equal(f.writes().length,0);return;}
    await f.prepare();await f.execute('read_gmail',{messageId});await f.execute('list_calendar_events',window);
    const input=mode==='forged key'?{...args,sourceKey:'gmail:def456'}:mode==='forged URL'?{...args,sourceUrl:sourceUrl+'0'}:args;
    const result=await f.execute('upsert_calendar_event',input,mode==='wrong wrapper'?{...f.context,inputIds:[randomUUID()]}:f.context);assert.match(result.status,/forbidden/);assert.equal(f.writes().length,0);
  });
});

test('natural announcements use explicit target-date coverage; wrong or filtered date scans cannot authorize creation',async t=>{
  for(const query of ['missing','wrong date','filtered','correct'])await t.test(query,async()=>{
    const f=fixture();await f.prepare();await f.execute('read_gmail',{messageId});
    if(query==='wrong date')await f.execute('list_calendar_events',{timeMin:'2026-10-22T00:00:00-04:00',timeMax:'2026-10-23T00:00:00-04:00'});
    if(query==='filtered')await f.execute('list_calendar_events',{...window,query:'tour'});if(query==='correct')await f.execute('list_calendar_events',window);
    assert.equal((await f.execute('upsert_calendar_event',args)).status,query==='correct'?'ready':'forbidden_source');assert.equal(f.writes().length,query==='correct'?1:0);
  });
});

test('independently sourced event duplicates and correction without managed original defer without writes',async()=>{
  const existing={id:'human_event_123',summary:args.title,start:args.start,end:args.end,status:'confirmed',etag:'"human"',created:stamp,updated:stamp};
  const duplicate=fixture({existing:[existing]});await duplicate.prepare();await duplicate.execute('read_gmail',{messageId});await duplicate.execute('list_calendar_events',window);
  assert.equal((await duplicate.execute('upsert_calendar_event',args)).status,'conflict');assert.equal(duplicate.writes().length,0);
  const correction=fixture({text:'The Google office tour is rescheduled to November 13 at 3pm.'});await correction.prepare();await correction.execute('read_gmail',{messageId});await correction.execute('list_calendar_events',window);
  assert.equal((await correction.execute('upsert_calendar_event',args)).status,'conflict');assert.equal(correction.writes().length,0);
});

test('natural announcements and imperative cancellation pass without rigid club keywords; personal, RSVP, speculative or negated cancellation do not',()=>{
  for(const text of [body,'EcoGPT: November 3 at 6pm in Bobst.','Join our workshop Friday at 6pm.'])assert.equal(discordCalendarIntent(text),true,text);
  for(const text of ['Please cancel the Google office tour.','The workshop is cancelled.'])assert.equal(discordCalendarIntent(text,{cancel:true}),true,text);
  for(const text of ["I'm studying at Bobst until 8",'Co-working with the team tonight',"I'm going to the workshop",'RSVP yes for Friday','Maybe we could host a workshop next week'])assert.equal(discordCalendarIntent(text),false,text);
  for(const text of ['The workshop is not cancelled.','Do not cancel the tour.','The workshop is scheduled Friday.','Is the workshop cancelled?'])assert.equal(discordCalendarIntent(text,{cancel:true}),false,text);
});

test('Gmail-backed retries preserve deterministic identity and reject subsequent human Calendar edits',async()=>{
  const f=fixture();await f.prepare();await f.execute('read_gmail',{messageId});await f.execute('list_calendar_events',window);
  const first=await f.execute('upsert_calendar_event',args);assert.equal(first.status,'ready');assert.equal(f.writes().length,1);
  const retry=await f.execute('upsert_calendar_event',args);assert.equal(retry.status,'ready');assert.equal(retry.outcome,'unchanged');assert.equal(retry.eventId,first.eventId);assert.equal(f.writes().length,1);
  f.rows.get(first.eventId).description='A human changed these notes';
  assert.equal((await f.execute('upsert_calendar_event',{...args,title:'Changed title'})).status,'human_modified');assert.equal(f.writes().length,1);assert.equal(f.rows.get(first.eventId).description,'A human changed these notes');
});

test('Gmail read failure and next-batch cleanup erase old club grants instead of reusing stale authority',async()=>{
  for(const expire of ['failed current read','new batch']){
    const f=fixture();await f.prepare();await f.execute('read_gmail',{messageId});await f.execute('list_calendar_events',window);assert(f.a.principal.calendarSources.some(scope=>scope.provider==='gmail'));
    if(expire==='failed current read'){f.revoke();await f.execute('read_gmail',{messageId});}else await f.prepare();
    assert(!f.a.principal.calendarSources.some(scope=>scope.provider==='gmail'));assert.equal((await f.execute('upsert_calendar_event',args)).status,'forbidden_source');assert.equal(f.writes().length,0);
  }
});

test('Gmail cancellation requires current explicit instruction and never follows RSVP, uncertainty or negation',async()=>{
  for(const text of ['RSVP no for the tour.','Do not cancel the tour.','Is the tour cancelled?','The tour might be cancelled.','The tour is still scheduled for Friday.']){
    const f=fixture({text});await f.prepare();await f.execute('read_gmail',{messageId});
    assert.equal((await f.execute('cancel_calendar_event',{sourceKey,sourceUrl})).status,'forbidden_source',text);assert.equal(f.writes().length,0);
  }
});
