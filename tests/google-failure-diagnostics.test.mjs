import test from 'node:test';
import assert from 'node:assert/strict';
import { createGoogleClient } from '../server/google/client.js';
import { createCalendarClient } from '../server/google/calendar-client.js';
import { GoogleError, googleDiagnostics, googleError, waitForGoogleAuth } from '../server/google/oauth.js';
import { CALENDAR_REQUIRED_SCOPES } from '../server/google/calendar-config.js';
import {createCalendarBatch,updateCalendarBatch,projectCalendarBatchWrite} from '../tools/calendar/chat-batch.js';

const secret = 'PRIVATE_SOURCE_BODY_OR_CREDENTIAL';
const config = { configured:true, clientId:'fixture', clientSecret:secret, refreshToken:secret,
  expectedAccountEmail:'club@example.com', calendarId:'fixed@example.com' };
const principal = {id:'operator',calendarAccess:true,calendarChatWrite:true,calendarId:config.calendarId};
const window = {timeMin:'2026-10-21T00:00:00Z',timeMax:'2026-10-22T00:00:00Z',principal};
function fixture({ calendar = false, oauthError, infoError, scopes = CALENDAR_REQUIRED_SCOPES, email=config.expectedAccountEmail,
  profile, acl, handler=()=>Response.json(calendar?{items:[]}:{files:[]}), access={token:secret} } = {}) {
  const calls=[];
  const oauth={setCredentials(){},getAccessToken:async()=>{if(oauthError)throw oauthError;return access;},
    getTokenInfo:async()=>{if(infoError)throw infoError;return {scopes};}};
  const fetchImpl=async(url,options)=>{
    calls.push({url,options});
    if(new URL(url).pathname.endsWith('/profile'))return profile?profile():Response.json({emailAddress:email});
    if(new URL(url).pathname.includes('/calendarList/'))return acl?acl():Response.json({id:config.calendarId,accessRole:'writer'});
    return handler(url,options);
  };
  return {client:(calendar?createCalendarClient:createGoogleClient)({config,oauthClient:oauth,fetchImpl}),calls};
}
function safe(result,diagnostics) {
  assert.deepEqual(result.diagnostics,diagnostics);
  assert(!JSON.stringify(result).includes(secret));
}
for(const [httpStatus,status] of [[400,'invalid_request'],[403,'permission_denied'],[429,'rate_limited'],[503,'google_unavailable']]) {
  test(`Calendar observed HTTP ${httpStatus} preserves existing status and request stage`,async()=>{
    const {client}=fixture({calendar:true,handler:()=>new Response(secret,{status:httpStatus})});
    const result=await client.listEvents(window);
    assert.equal(result.status,status);
    safe(result,{stage:'provider_request',reason:'http_error',httpStatus});
  });
}

test('every Gmail/Drive client wrapper preserves provider failure diagnostics',async()=>{
  for(const [method,args] of [['searchGmail',{query:'event'}],['readGmail',{messageId:'abc123'}],
    ['searchDrive',{query:'event'}],['listDriveFolder',{folderId:'folder'}],['readDrive',{fileId:'file'}]]) {
    const {client}=fixture({handler:()=>new Response(secret,{status:403})});
    const result=await client[method](args);
    assert.equal(result.status,'permission_denied');safe(result,{stage:'provider_request',reason:'http_error',httpStatus:403});
  }
});

test('Drive HTTP400 retains google_unavailable rather than inferring Calendar status mapping',async()=>{
  const {client}=fixture({handler:()=>new Response(secret,{status:400})});
  const result=await client.searchDrive({query:'event'});
  assert.equal(result.status,'google_unavailable');safe(result,{stage:'provider_request',reason:'http_error',httpStatus:400});
});

test('OAuth observed errors and revocation retain stage and actual status without bodies',async()=>{
  for(const calendar of [false,true])for(const httpStatus of [400,403,429,503]) {
    const oauthError={message:secret,response:{status:httpStatus,data:{error:'provider_error',error_description:secret}},request:{url:secret}};
    const {client,calls}=fixture({calendar,oauthError});
    const result=calendar?await client.listEvents(window):await client.searchDrive({query:'event'});
    assert.equal(result.status,'google_unavailable');safe(result,{stage:'oauth',reason:'http_error',httpStatus});assert.equal(calls.length,0);
  }
  const {client}=fixture({oauthError:{response:{status:400,data:{error:'invalid_grant',error_description:secret}}}});
  const result=await client.searchDrive({query:'event'});
  assert.equal(result.status,'reauthorization_required');safe(result,{stage:'oauth',reason:'reauthorization_required',httpStatus:400});
});

test('OAuth and token-info failures without HTTP have no invented response status',async()=>{
  for(const [key,stage] of [['oauthError','oauth'],['infoError','account_verification']]) {
    const {client}=fixture({[key]:new Error(secret)});
    const result=await client.searchDrive({query:'event'});
    assert.equal(result.status,'google_unavailable');safe(result,{stage,reason:'network_error'});
  }
  const {client}=fixture({access:{}});
  const result=await client.searchDrive({query:'event'});
  assert.equal(result.status,'reauthorization_required');safe(result,{stage:'oauth',reason:'missing_access_token'});
});

test('account verification distinguishes scopes, account, token-info and profile HTTP failure',async()=>{
  for(const [options,status,diagnostics] of [
    [{scopes:[]},'reauthorization_required',{stage:'account_verification',reason:'missing_scope'}],
    [{email:'other@example.com'},'account_mismatch',{stage:'account_verification',reason:'account_mismatch'}],
    [{infoError:{response:{status:429,data:{error:secret}}}},'google_unavailable',{stage:'account_verification',reason:'http_error',httpStatus:429}],
    [{profile:()=>new Response(secret,{status:403})},'permission_denied',{stage:'account_verification',reason:'http_error',httpStatus:403}],
  ])for(const calendar of [false,true]) {
    const {client}=fixture({...options,calendar});
    const result=calendar?await client.listEvents(window):await client.searchDrive({query:'event'});
    assert.equal(result.status,status);safe(result,diagnostics);
  }
});

test('Calendar ACL response errors and semantic access denial are separate from provider requests',async()=>{
  for(const [acl,diagnostics] of [
    [()=>new Response(secret,{status:403}),{stage:'calendar_acl',reason:'http_error',httpStatus:403}],
    [()=>Response.json({id:config.calendarId,accessRole:'none'}),{stage:'calendar_acl',reason:'permission_denied'}],
  ]) {
    const {client}=fixture({calendar:true,acl});const result=await client.listEvents(window);
    assert.equal(result.status,'permission_denied');safe(result,diagnostics);
  }
});

test('invalid local dates and arguments never claim HTTP or reach OAuth',async()=>{
  const {client:calendar,calls}=fixture({calendar:true,oauthError:new Error('must not authenticate')});
  const badDates=await calendar.listEvents({...window,timeMin:'2026-02-30T00:00:00Z'});
  assert.equal(badDates.status,'invalid_request');safe(badDates,{stage:'local_validation',reason:'invalid_time_window'});
  const badLimit=await calendar.listEvents({...window,limit:26});
  safe(badLimit,{stage:'local_validation',reason:'invalid_request'});
  for(const [method,args] of [['listCalendars',{pageToken:'\n'}],['readEvent',{eventId:'?'}],['readChatEvent',{eventId:'?'}],
    ['createChatEvent',{unexpected:secret}],['updateChatEvent',{unexpected:secret}],['cancelChatEvent',{unexpected:secret}]]) {
    safe(await calendar[method](args),{stage:'local_validation',reason:'invalid_request'});
  }
  assert.equal(calls.length,0);
  const {client}=fixture({oauthError:new Error('must not authenticate')});
  for(const [method,args] of [['searchGmail',{}],['readGmail',{messageId:'?'}],['searchDrive',{query:''}],
    ['listDriveFolder',{folderId:'?'}],['readDrive',{fileId:'?'}]]) {
    safe(await client[method](args),{stage:'local_validation',reason:'invalid_request'});
  }
});

test('JSON parse failures retain observed HTTP and expose no response content',async()=>{
  for(const calendar of [false,true]) {
    const {client}=fixture({calendar,handler:()=>new Response(secret,{status:200})});
    const result=calendar?await client.listEvents(window):await client.searchDrive({query:'event'});
    assert.equal(result.status,'invalid_response');safe(result,{stage:'response_parse',reason:'invalid_json',httpStatus:200});
  }
});

test('response size and schema validation are parsing failures, not local argument failures',async()=>{
  for(const [handler,status,diagnostics] of [
    [()=>new Response(secret,{headers:{'content-length':'99999999'}}),'response_too_large',{stage:'response_parse',reason:'response_too_large',httpStatus:200}],
    [()=>Response.json({files:secret}),'invalid_response',{stage:'response_parse',reason:'invalid_response'}],
  ]) {
    const {client}=fixture({handler});const result=await client.searchDrive({query:'event'});
    assert.equal(result.status,status);safe(result,diagnostics);
  }
});

test('provider timeout and cancellation preserve stage without assuming HTTP',async t=>{
  const timeoutController=new AbortController();t.mock.method(AbortSignal,'timeout',()=>timeoutController.signal);
  const {client}=fixture({handler:async(_url,{signal})=>{
    queueMicrotask(()=>timeoutController.abort());
    await new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error(secret)),{once:true}));
  }});
  const result=await client.searchDrive({query:'event'});
  assert.equal(result.status,'timeout');safe(result,{stage:'provider_request',reason:'timeout'});
});

test('aborted authentication reports OAuth cancellation without raw signal reason',async()=>{
  const controller=new AbortController();controller.abort(secret);
  const {client,calls}=fixture();const result=await client.searchDrive({query:'event',signal:controller.signal});
  assert.equal(result.status,'aborted');safe(result,{stage:'oauth',reason:'aborted'});assert.equal(calls.length,0);
});

test('diagnostics only retain reviewed vocabulary and valid numeric HTTP',async()=>{
  assert.deepEqual(googleDiagnostics({stage:secret,reason:secret,httpStatus:'403',message:secret,url:secret}),
    {stage:'provider_request',reason:'google_unavailable'});
  assert.deepEqual(new GoogleError('invalid_request',{stage:'local_validation',reason:secret,httpStatus:999,body:secret}).diagnostics,
    {stage:'local_validation',reason:'google_unavailable'});
  assert.deepEqual(googleError(new Error(secret)).diagnostics,{stage:'provider_request',reason:'network_error'});
  const original=new Error(secret);
  await assert.rejects(waitForGoogleAuth(()=>Promise.reject(original)),error=>error===original,'unscoped existing auth consumers retain original error behavior');
});

test('successful and empty results gain no diagnostic fields',async()=>{
  const {client}=fixture();assert.equal((await client.searchDrive({query:'event'})).diagnostics,undefined);
  const {client:calendar}=fixture({calendar:true});assert.equal((await calendar.listEvents(window)).diagnostics,undefined);
});


const batchUrl=id=>`https://calendar.google.com/calendar/event?eid=${Buffer.from(`${id} ${config.calendarId}`).toString('base64url')}`;
const batchSaved=(id,outcome='created')=>({status:'ready',outcome,eventId:id,url:batchUrl(id),start:{date:'2026-10-24'},end:{date:'2026-10-25'},location:'Saved room'});

test('mixed create batch retains mutation429, mutation503, typed exception403 and local-date diagnostics',async()=>{
  let writes=0;
  const client={calendarId:config.calendarId,
    listEvents:async()=>assert.fail('Batch creation must not hide a Calendar discovery read'),
    createChatEvent:async()=>{writes++;if(writes===1)return {status:'rate_limited',diagnostics:{stage:'provider_request',reason:'http_error',httpStatus:429,body:secret}};
      if(writes===2)return {status:'google_unavailable',diagnostics:{stage:'provider_request',reason:'http_error',httpStatus:503,account:secret}};
      if(writes===3)throw new GoogleError('permission_denied',{stage:'calendar_acl',reason:'http_error',httpStatus:403,body:secret});
      return batchSaved('created_event');}};
  const result=await createCalendarBatch({client,operationId:'batch',principal,events:[
    {title:'Rate limited duplicate check',date:'2026-10-21'},
    {title:'Unavailable mutation',date:'2026-10-22'},
    {title:'Malformed date',date:'2026-02-30'},
    {title:'Typed denied mutation',date:'2026-10-23'},
    {title:'Successful row',date:'2026-10-24'},
  ]});
  assert.equal(result.status,'partial');assert.deepEqual(result.calendarBatchWrite.counts,{requested:5,created:1,existing:0,failed:4,unattempted:0});
  const rows=result.calendarBatchWrite.items;
  assert.deepEqual(rows.map(row=>row.diagnostics),[
    {stage:'provider_request',reason:'http_error',httpStatus:429},
    {stage:'provider_request',reason:'http_error',httpStatus:503},
    {stage:'local_validation',reason:'invalid_time_window'},
    {stage:'calendar_acl',reason:'http_error',httpStatus:403},undefined]);
  assert.equal(rows[3].reason,'google_unavailable','typed catch preserves preexisting batch business status');
  assert.equal(rows[4].calendarWrite.location,'Saved room');assert(!JSON.stringify(result).includes(secret));
  assert(projectCalendarBatchWrite(result.calendarBatchWrite));
});

test('update batch retains exact-read403, mutation503, local validation and known stopcause without skipped-rowHTTP',async()=>{
  const client={calendarId:config.calendarId,readChatEvent:async({eventId})=>eventId==='denied_event'?
    {status:'permission_denied',diagnostics:{stage:'calendar_acl',reason:'http_error',httpStatus:403,body:secret}}:
    {status:'ready',events:[{eventId,title:'Existing',start:{date:'2026-10-24'},end:{date:'2026-10-25'}}],chatRevision:{eventId,etag:'"fixture"',unsupported:false}},
    updateChatEvent:async()=>({status:'google_unavailable',diagnostics:{stage:'provider_request',reason:'http_error',httpStatus:503,body:secret}})};
  const result=await updateCalendarBatch({client,principal,events:[
    {eventId:'invalid_event',date:'2026-02-30'},
    {eventId:'mutation_event',title:'Change'},
    {eventId:'denied_event',title:'Denied change'},
    {eventId:'skipped_event',title:'Skipped change'},
  ]});
  assert.equal(result.status,'partial');assert.deepEqual(result.calendarBatchWrite.items.map(row=>row.diagnostics),[
    {stage:'local_validation',reason:'invalid_time_window'},
    {stage:'provider_request',reason:'http_error',httpStatus:503},
    {stage:'calendar_acl',reason:'http_error',httpStatus:403},
    {stage:'calendar_acl',reason:'http_error'},
  ]);
  assert.equal(result.calendarBatchWrite.items[3].status,'unattempted');assert.equal(result.calendarBatchWrite.items[3].reason,'permission_denied');
  assert(!JSON.stringify(result).includes(secret));
});

test('batch cancellation marks every unattempted row without fabricated HTTP or raw abort reason',async()=>{
  const controller=new AbortController();controller.abort(secret);
  const client={calendarId:config.calendarId,listEvents:()=>{throw Error('must not dispatch');},readChatEvent:()=>{throw Error('must not dispatch');}};
  for(const result of [
    await createCalendarBatch({client,principal,operationId:'batch',signal:controller.signal,events:[{title:'A',date:'2026-10-24'},{title:'B',date:'2026-10-25'}]}),
    await updateCalendarBatch({client,principal,signal:controller.signal,events:[{eventId:'first_event',title:'A'},{eventId:'second_event',title:'B'}]}),
  ])for(const row of result.calendarBatchWrite.items) {
    assert.equal(row.status,'unattempted');assert.deepEqual(row.diagnostics,{stage:'local_validation',reason:'aborted'});assert(!JSON.stringify(row).includes(secret));
  }
});

test('batch local argument errors and malformed provider receipts have distinct safe stages',async()=>{
  const client={calendarId:config.calendarId,listEvents:async()=>({status:'ready',events:[],coverage:{complete:true}}),
    createChatEvent:async()=>({status:'ready',eventId:'wrong_event',url:'invalid',body:secret})};
  const result=await createCalendarBatch({client,principal,operationId:'batch',events:[{title:'Valid',date:'2026-10-24',location:4},{title:'Bad receipt',date:'2026-10-25'}]});
  assert.deepEqual(result.calendarBatchWrite.items.map(row=>row.diagnostics),[
    {stage:'local_validation',reason:'invalid_request'},{stage:'response_parse',reason:'invalid_response'},
  ]);assert(!JSON.stringify(result).includes(secret));
});
