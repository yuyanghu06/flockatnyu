import test from 'node:test';
import assert from 'node:assert/strict';
import {createCalendarClient,collectCalendarWindow} from '../server/google/calendar-client.js';
import {readCalendarConfig,CALENDAR_REQUIRED_SCOPES} from '../server/google/calendar-config.js';
import {createCalendarTools,CALENDAR_TOOLS} from '../tools/calendar/index.js';
import {createChatCalendarTools} from '../tools/calendar/chat.js';

const calendarId='fixture-calendar@group.calendar.google.com';
const principal={id:'calendar-reader',calendarAccess:true,calendarId};
const window={timeMin:'2026-10-19T04:00:00Z',timeMax:'2026-10-26T04:00:00Z'};
const env={GOOGLE_CLIENT_ID:'synthetic-client',GOOGLE_CLIENT_SECRET:'synthetic-secret',GOOGLE_REFRESH_TOKEN:'synthetic-refresh',GOOGLE_EXPECTED_ACCOUNT_EMAIL:'club@example.com',GOOGLE_CALENDAR_ID:calendarId};
const event=i=>({eventId:`event_${String(i).padStart(3,'0')}`,title:`Event ${i}`,start:{date:'2026-10-20'},end:{date:'2026-10-21'},status:'confirmed',url:`https://calendar.google.com/calendar/event?eid=${i}`});
const page=(events,nextPageToken)=>({status:'ready',events,nextPageToken:nextPageToken??null,coverage:{complete:nextPageToken===undefined,windowOnly:true}});
function mockPages(handler){
  const calls=[];
  return {calls,client:{listEvents:async args=>{calls.push(args);return handler(args,calls.length);}}};
}
const collect=(f,args={})=>collectCalendarWindow({client:f.client,...window,limit:25,principal,...args});
const noTokens=result=>assert(!JSON.stringify(result).includes('PageToken'),'provider tokens must not enter model-visible aggregates');

test('one backend window consumes26 identities across pages with stable scope and query',async()=>{
  const rows=Array.from({length:26},(_,i)=>event(i));
  const f=mockPages(args=>args.pageToken?page(rows.slice(25)):page(rows.slice(0,25),'private-cursor-2'));
  const result=await collect(f,{resultMode:'identities',query:'meeting'});
  assert.equal(result.status,'ready');assert.equal(result.coverage.complete,true);assert.equal(result.coverage.pagesRead,2);
  assert.deepEqual(result.events,rows);assert.equal(f.calls.length,2);noTokens(result);
  for(const args of f.calls){assert.equal(args.timeMin,window.timeMin);assert.equal(args.timeMax,window.timeMax);assert.equal(args.query,'meeting');assert.equal(args.resultMode,'identities');assert.equal(args.limit,25);assert.equal(args.principal,principal);assert(args.signal instanceof AbortSignal);}
  assert.equal(f.calls[0].pageToken,undefined);assert.equal(f.calls[1].pageToken,'private-cursor-2');assert.equal(f.calls[0].signal,f.calls[1].signal);
});

test('empty intermediate pages continue and duplicate identities never multiply map obligations',async()=>{
  const f=mockPages((_args,n)=>n===1?page([event(1)],'cursor-2'):n===2?page([],'cursor-3'):page([event(1),event(2)]));
  const result=await collect(f);
  assert.equal(result.status,'ready');assert.equal(result.coverage.complete,true);assert.deepEqual(result.events.map(row=>row.eventId),['event_001','event_002']);assert.equal(f.calls.length,3);noTokens(result);
});

test('repeated and malformed continuations stop bounded partial scans without exposing cursor text',async()=>{
  for(const token of ['repeated-cursor','',{},'bad\ncursor','x'.repeat(2001)]){
    const f=mockPages((_args,n)=>page([event(n)],n===1?'repeated-cursor':token));const result=await collect(f);
    assert.equal(result.status,'partial',String(token));assert.equal(result.coverage.complete,false);assert(f.calls.length<=2);assert(result.events.length>=1);noTokens(result);
    assert(!JSON.stringify(result).includes('repeated-cursor'));
  }
});

test('late provider and parse failures retain earlier evidence with incomplete coverage',async()=>{
  for(const failure of [{status:'google_unavailable',events:[],diagnostics:{reason:'http_error',httpStatus:503}},{status:'rate_limited',events:[]},{status:'invalid_response',events:[]},null]){
    const f=mockPages((_args,n)=>n===1?page([event(1)],'cursor-2'):failure);const result=await collect(f);
    assert.equal(result.status,'partial');assert.equal(result.coverage.complete,false);assert.deepEqual(result.events,[event(1)]);assert.equal(f.calls.length,2);noTokens(result);
  }
  const f=mockPages((_args,n)=>{if(n===1)return page([event(1)],'cursor-2');throw Error('PRIVATE_PROVIDER_BODY');});
  const result=await collect(f);assert.equal(result.status,'partial');assert.deepEqual(result.events,[event(1)]);assert(!JSON.stringify(result).includes('PRIVATE_PROVIDER_BODY'));
});

test('permission and account revocation on a subsequent page withhold previously read content',async()=>{
  for(const status of ['permission_denied','reauthorization_required','account_mismatch','forbidden','forbidden_source']){
    const f=mockPages((_args,n)=>n===1?page([event(1)],'cursor-2'):{status,events:[]});const result=await collect(f);
    assert.equal(result.status,status);assert.deepEqual(result.events,[]);assert.notEqual(result.coverage?.complete,true);assert.equal(f.calls.length,2);noTokens(result);
  }
});

test('first-page provider failure remains a failure rather than an empty complete window',async()=>{
  const f=mockPages(()=>({status:'google_unavailable',events:[]}));const result=await collect(f);
  assert.equal(result.status,'google_unavailable');assert.deepEqual(result.events,[]);assert.notEqual(result.coverage?.complete,true);assert.equal(f.calls.length,1);
});

test('parent cancellation stops continuation while retaining only explicit incomplete evidence',async()=>{
  const parent=new AbortController();const f=mockPages((_args,n)=>{assert.equal(n,1);parent.abort();return page([event(1)],'cursor-2');});
  const result=await collect(f,{signal:parent.signal});assert.notEqual(result.coverage?.complete,true);assert.equal(f.calls.length,1);assert.equal(result.status,'partial');assert.deepEqual(result.events,[event(1)]);
  const before=new AbortController();before.abort();const untouched=mockPages(()=>assert.fail('pre-aborted read dispatched'));
  const cancelled=await collect(untouched,{signal:before.signal});assert.equal(cancelled.status,'aborted');assert.equal(untouched.calls.length,0);
});

test('aggregate deadline spans all pages rather than resetting on each continuation',async t=>{
  const timers=[];t.mock.method(AbortSignal,'timeout',ms=>{const controller=new AbortController();timers.push({ms,controller});return controller.signal;});
  const f=mockPages((_args,n)=>{if(n===1)return page([event(1)],'cursor-2');timers[0].controller.abort();return page([event(2)],'cursor-3');});
  const result=await collect(f);assert.deepEqual(timers.map(row=>row.ms),[60000]);assert.equal(result.status,'partial');assert.equal(result.coverage.complete,false);assert.equal(f.calls.length,2);
});

test('page, event and UTF-8 byte ceilings return bounded truthful partial results',async()=>{
  const pages=mockPages((_args,n)=>page([],`cursor-${n}`));const pageResult=await collect(pages);
  assert.equal(pages.calls.length,20);assert.equal(pageResult.status,'partial');assert.equal(pageResult.coverage.complete,false);
  const many=mockPages((_args,n)=>page(Array.from({length:25},(_,i)=>({eventId:event((n-1)*25+i).eventId})),`cursor-${n}`));const manyResult=await collect(many);
  assert.equal(manyResult.status,'partial');assert.equal(manyResult.coverage.complete,false);assert.equal(manyResult.events.length,200);assert(many.calls.length<=9);assert.equal(manyResult.coverage.reason,'event_limit');assert(Buffer.byteLength(JSON.stringify(manyResult))<=16384);
  const unicode=mockPages((_args,n)=>page([{...event(n),description:'🗽界'.repeat(1500)}],`cursor-${n}`));const byteResult=await collect(unicode,{limit:1});
  assert.equal(byteResult.status,'partial');assert.equal(byteResult.coverage.complete,false);assert(byteResult.events.length>0);assert(Buffer.byteLength(JSON.stringify(byteResult))<=16384);noTokens(byteResult);
});

test('model-visible chat and worker schemas reject pageToken before dispatch',async()=>{
  let calls=0;const client={configured:true,calendarId,listEvents:async()=>{calls++;return page([]);}};
  const worker=createCalendarTools({client});const chat=createChatCalendarTools({client});
  for(const tools of [worker,chat]){
    const definition=tools.tools.find(row=>row.name==='list_calendar_events');assert.equal(definition.parameters.properties.pageToken,undefined);
    const actor=tools===chat?{id:'chat-reader',googleAccess:true}:principal;
    const result=await tools.execute({name:'list_calendar_events',arguments:{...window,pageToken:'invented-cursor'},principal:actor});assert.equal(result.status,'invalid_request');
  }
  assert.equal(CALENDAR_TOOLS[0].parameters.properties.pageToken,undefined);assert.equal(calls,0);
});

function liveFixture(handler,{aclRole=()=> 'reader'}={}){
  const calls=[];let aclReads=0;
  const client=createCalendarClient({config:readCalendarConfig(env),oauthClient:{setCredentials(){},getAccessToken:async()=>({token:'synthetic-access'}),getTokenInfo:async()=>({scopes:CALENDAR_REQUIRED_SCOPES})},fetchImpl:async(value,options)=>{
    const url=new URL(value);calls.push({url,options});assert.equal(options.method,'GET');
    if(url.hostname==='gmail.googleapis.com')return Response.json({emailAddress:'club@example.com'});
    if(url.pathname.includes('/calendarList/')){aclReads++;return Response.json({id:calendarId,accessRole:aclRole(aclReads)});}
    assert(url.pathname.endsWith('/events'));return handler(url,options);
  }});
  return {client,calls,aclReads:()=>aclReads};
}

test('real client retains low-level single-page behavior and exposes bounded backend aggregate',async()=>{
  const rows=Array.from({length:26},(_,i)=>({id:event(i).eventId,summary:event(i).title,start:event(i).start,end:event(i).end,status:'confirmed'}));
  const f=liveFixture(url=>Response.json(url.searchParams.has('pageToken')?{items:rows.slice(25)}:{items:rows.slice(0,25),nextPageToken:'private-cursor-2'}));
  const first=await f.client.listEvents({...window,resultMode:'identities',limit:25,principal});
  assert.equal(first.status,'ready');assert.equal(first.events.length,25);assert.equal(first.nextPageToken,'private-cursor-2');assert.equal(first.coverage.complete,false);
  const aggregate=await f.client.listEventsWindow({...window,resultMode:'identities',limit:25,principal});
  assert.equal(aggregate.status,'ready');assert.equal(aggregate.events.length,26);assert.equal(aggregate.coverage.complete,true);assert.equal(aggregate.coverage.pagesRead,2);noTokens(aggregate);
  assert(f.aclReads()>=4,'access must remain freshly checked across pages and before release');
});

test('native final ACL recheck withholds a completed scan after access is revoked',async()=>{
  const raw={id:'event_001',summary:'Private event',start:{date:'2026-10-20'},end:{date:'2026-10-21'}};
  const f=liveFixture(url=>Response.json(url.searchParams.has('pageToken')?{items:[]}:{items:[raw],nextPageToken:'private-cursor-2'}),{aclRole:n=>n<3?'reader':'none'});
  const result=await f.client.listEventsWindow({...window,limit:25,principal});
  assert.equal(result.status,'permission_denied');assert.deepEqual(result.events,[]);assert.equal(f.aclReads(),3);assert(!JSON.stringify(result).includes('Private event'));noTokens(result);
});
