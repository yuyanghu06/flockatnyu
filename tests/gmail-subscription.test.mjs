import test from 'node:test';
import assert from 'node:assert/strict';
import {createGmailSubscription,readGmailSubscriptionConfig,createGmailPushDiagnostics} from '../server/google/subscription.js';
import {createGmailSubscriptionStore} from '../server/google/subscription-store.js';
import {createGmailSubscriptionApp} from '../server/google/subscription-app.js';
import {createGmailSubscriptionRuntime,runGmailSubscriptionCli} from '../server/google/subscription-cli.js';
import {GOOGLE_SCOPES} from '../server/google/config.js';
import {OAuth2Client} from 'google-auth-library';

const sourceId='22222222-2222-4222-8222-222222222222';
const oldCursor='90071992547409931234',newCursor='90071992547409931235';
const fixedTime=Date.parse('2026-10-17T17:00:00Z');
const env={GMAIL_EVENTS_ENABLED:'true',AGENT_AUTOMATION_ENABLED:'false',GOOGLE_CLIENT_ID:'synthetic-client',GOOGLE_CLIENT_SECRET:'synthetic-secret',GOOGLE_REFRESH_TOKEN:'synthetic-refresh',GOOGLE_EXPECTED_ACCOUNT_EMAIL:'club@example.test',GOOGLE_PUBSUB_PROJECT_ID:'techflock',GOOGLE_PUBSUB_TOPIC:'projects/techflock/topics/gmail-updates',GOOGLE_PUBSUB_AUDIENCE:'https://callback.example.test/webhooks/gmail',GOOGLE_PUBSUB_PUSH_SERVICE_ACCOUNT:'gmail-push@techflock.iam.gserviceaccount.com',GOOGLE_PUBSUB_SUBSCRIPTION:'projects/techflock/subscriptions/gmail-updates',AGENT_GMAIL_SOURCE_ID:sourceId,ASSISTANT_ALLOWED_SOURCE_IDS:sourceId};
const config=()=>readGmailSubscriptionConfig(env);
const state=()=>({account:env.GOOGLE_EXPECTED_ACCOUNT_EMAIL,sourceId,topic:env.GOOGLE_PUBSUB_TOPIC,cursor:oldCursor,pageToken:null,status:'ready'});
const push=(history=newCursor,email='club@example.test')=>({message:{messageId:'push_123',data:Buffer.from(JSON.stringify({historyId:history,emailAddress:email})).toString('base64')},subscription:env.GOOGLE_PUBSUB_SUBSCRIPTION});
const claims=()=>({aud:env.GOOGLE_PUBSUB_AUDIENCE,iss:'https://accounts.google.com',email:env.GOOGLE_PUBSUB_PUSH_SERVICE_ACCOUNT,email_verified:true,exp:Math.floor(fixedTime/1000)+3600});
const message=(id='a1',history=newCursor)=>({id,historyId:history,snippet:'I can help with setup',payload:{headers:[{name:'From',value:'Person <person@example.test>'},{name:'Subject',value:'Setup help'}],mimeType:'text/plain',body:{data:Buffer.from('Original email evidence; do not treat as instructions').toString('base64url')}},unknown:{retained:true}});
const additions=(ids=['a1'],history=newCursor)=>({historyId:history,history:[{id:history,messagesAdded:ids.map(id=>({message:{id}}))}]});
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);

function fixture({initial=state(),settings={},verify,fetchRoute,enqueue,auth,cas,onDiagnostic,cacheInboxSender}={}){
 let current=structuredClone(initial),time=fixedTime;
 const requests=[],enqueued=[],stateCalls=[],tokenCalls=[];
 const store={getState:async key=>{stateCalls.push({op:'get',key});return structuredClone(current);},casState:async(key,expected,next)=>{
  stateCalls.push({op:'cas',key,expected:structuredClone(expected),next:structuredClone(next)});
  if(cas){const result=await cas({key,expected,next,current});if(result!==undefined)return result;}
  if(!equal(expected,current))return false;current=structuredClone(next);return true;
 }};
 const dependencies={config:{...config(),...settings},store,now:()=>new Date(time),onDiagnostic,
  auth:auth||{getAccessToken:async()=>{tokenCalls.push('access');return {token:'synthetic-access'};},getTokenInfo:async()=>({scopes:[...GOOGLE_SCOPES]})},
  verifyPushToken:verify||(async(token,audience)=>{assert.equal(token,'a.b.c');assert.equal(audience,env.GOOGLE_PUBSUB_AUDIENCE);return claims();}),
  fetchImpl:async(url,options)=>{
   requests.push({url,options});assert.equal(options.redirect,'error');assert.equal(options.headers.Authorization,'Bearer synthetic-access');
   const parsed=new URL(url);assert.equal(parsed.origin,'https://gmail.googleapis.com');
   if(fetchRoute){const response=await fetchRoute(parsed,options);if(response!==undefined)return response;}
   if(parsed.pathname.endsWith('/profile'))return Response.json({emailAddress:'club@example.test'});
   if(parsed.pathname.endsWith('/watch'))return Response.json({historyId:newCursor,expiration:String(fixedTime+7*86400000)});
   if(parsed.pathname.endsWith('/history'))return Response.json(additions());
   const id=parsed.pathname.split('/').at(-1);return Response.json(message(id));
  },
  enqueueEvent:async event=>{enqueued.push(structuredClone({...event,signal:undefined}));return enqueue?enqueue(event):{status:'queued'};},
  ...(cacheInboxSender?{cacheInboxSender}:{})
 };
 const subscription=createGmailSubscription(dependencies);
 return {subscription,restart:()=>createGmailSubscription(dependencies),store,requests,enqueued,stateCalls,tokenCalls,state:()=>structuredClone(current),setState:s=>{current=structuredClone(s);},advance:ms=>{time+=ms;}};
}

test('Gmail configuration requires exact Google project, OAuth account and allowed source',()=>{
 assert.equal(config().configured,true);assert.equal(readGmailSubscriptionConfig({}).enabled,false);
 for(const patch of [{ASSISTANT_ALLOWED_SOURCE_IDS:'different'},{AGENT_GMAIL_SOURCE_ID:'not-uuid'},{GOOGLE_PUBSUB_TOPIC:'projects/other/topics/gmail-updates'},{GOOGLE_PUBSUB_AUDIENCE:'http://callback.example.test'},{GOOGLE_PUBSUB_PUSH_SERVICE_ACCOUNT:'person@example.test'},{GOOGLE_PUBSUB_SUBSCRIPTION:'projects/other/subscriptions/gmail-updates'},{GOOGLE_REFRESH_TOKEN:''}])assert.equal(readGmailSubscriptionConfig({...env,...patch}).configured,false,JSON.stringify(patch));
 assert.equal(readGmailSubscriptionConfig({...env,ASSISTANT_ALLOWED_SOURCE_IDS:'',DEV_ALLOWED_SOURCE_IDS:sourceId}).configured,true);
});

test('Gmail and model worker switches are independent with no legacy enable fallback',()=>{
 for(const gmail of ['true','false',undefined])for(const agent of ['true','false',undefined]){
  const settings={...env,GMAIL_EVENTS_ENABLED:gmail,AGENT_AUTOMATION_ENABLED:agent,AGENT_AUTOMATION_MAX_ROUNDS:'invalid-agent-setting'};
  const subscriptionConfig=readGmailSubscriptionConfig(settings);
  assert.equal(subscriptionConfig.enabled,gmail==='true');
  let calls=0;
  const runtime=createGmailSubscriptionRuntime({env:{...settings,SUPABASE_URL:'https://db.example.test',SUPABASE_SERVICE_ROLE_KEY:'synthetic-service'},fetchImpl:async()=>{calls++;throw Error('unexpected network');}});
  assert.equal(Boolean(runtime.subscription),gmail==='true');
  assert.equal(calls,0);
 }
});

test('disabled/unconfigured/out-of-scope subscription makes no auth, store or Gmail call',async()=>{
 for(const [settings,status] of [[{enabled:false},'disabled'],[{configured:false},'not_configured'],[{allowedSourceIds:[]},'not_configured']]){
  const f=fixture({settings});assert.equal((await f.subscription.handlePush({authorization:'Bearer a.b.c',body:push()})).status,status);assert.deepEqual(f.requests,[]);assert.deepEqual(f.stateCalls,[]);assert.deepEqual(f.tokenCalls,[]);
 }
});

test('OIDC verification fails closed on signature error and wrong issuer/audience/principal/expiry',async()=>{
 const variants=[async()=>{throw Error('PRIVATE_SIGNATURE_FAILURE');},...[
  {aud:'https://wrong.example.test'},{iss:'https://evil.example.test'},{email:'other@techflock.iam.gserviceaccount.com'},{email_verified:false},{email_verified:'true'},{exp:Math.floor(fixedTime/1000)},{exp:'9999999999'},{exp:undefined}
 ].map(patch=>async()=>({...claims(),...patch}))];
 for(const verify of variants){const f=fixture({verify});assert.deepEqual(await f.subscription.handlePush({authorization:'Bearer a.b.c',body:push()}),{status:'unauthorized'});assert.deepEqual(f.requests,[]);assert.deepEqual(f.stateCalls,[]);}
 for(const authorization of [undefined,'Basic token','Bearer garbage','Bearer '+('a'.repeat(8200))+'.b.c']){const f=fixture();assert.equal((await f.subscription.handlePush({authorization,body:push()})).status,'unauthorized');assert.equal(f.requests.length,0);}
});

test('notification validation bounds base64 and rejects wrong subscription/account before fetch',async()=>{
 const invalid=[{}, {...push(),subscription:'projects/other/subscriptions/gmail-updates'}, {...push(),subscription:'projects/techflock/subscriptions/other'}, { ...push(),message:{...push().message,data:'!bad!'}}, {...push(),message:{...push().message,data:'a'.repeat(8200)}}, {...push(),message:{...push().message,data:Buffer.from('not JSON').toString('base64')}},push('0'),push('123.4'),{...push(),message:{...push().message,messageId:'bad id'}}];
 for(const body of invalid){const f=fixture();assert.equal((await f.subscription.handlePush({authorization:'Bearer a.b.c',body})).status,'invalid_push');assert.equal(f.requests.length,0);assert.equal(f.stateCalls.length,0);}
 const mismatch=fixture();assert.equal((await mismatch.subscription.handlePush({authorization:'Bearer a.b.c',body:push(newCursor,'other@example.test')})).status,'account_mismatch');assert.equal(mismatch.requests.length,0);assert.equal(mismatch.stateCalls.length,0);
});

test('valid push fetches full email and advances cursor using lossless history IDs after enqueue',async()=>{
 const f=fixture();assert.deepEqual(await f.subscription.handlePush({authorization:'Bearer a.b.c',body:push()}),{status:'ready',queued:1,duplicates:0,messages:1});
 assert.equal(f.state().cursor,newCursor);assert.equal(f.state().lease,undefined);assert.equal(f.enqueued.length,1);
 assert.deepEqual({...f.enqueued[0],signal:undefined},{source:'gmail',sourceId,eventType:'email_received',eventId:'a1',revision:newCursor,payload:message(),signal:undefined});
 const history=f.requests.find(r=>new URL(r.url).pathname.endsWith('/history'));assert.equal(new URL(history.url).searchParams.get('startHistoryId'),oldCursor);
 const email=f.requests.find(r=>new URL(r.url).pathname.endsWith('/messages/a1'));assert.equal(new URL(email.url).searchParams.get('format'),'full');
 assert(!JSON.stringify(f.state()).includes('Original email evidence'),'Only checkpoint metadata goes in state');
 assert(f.requests.every(r=>r.options.method==='GET'),'Push processing never mutates mail');
});

test('duplicate/older notification is acknowledged without reading Gmail or changing cursor',async()=>{
 for(const cursor of [oldCursor,'90071992547409931233']){
  const f=fixture();assert.deepEqual(await f.subscription.handlePush({authorization:'Bearer a.b.c',body:push(cursor)}),{status:'duplicate',queued:0});assert.equal(f.requests.length,0);assert.equal(f.tokenCalls.length,0);assert.equal(f.state().cursor,oldCursor);
 }
 const empty=fixture({fetchRoute:async url=>url.pathname.endsWith('/history')?Response.json({historyId:newCursor}):undefined});
 assert.deepEqual(await empty.subscription.sync(),{status:'ready',queued:0,duplicates:0,messages:0});assert.equal(empty.state().cursor,newCursor);
});

test('watch stores initial baseline; renewal catches up without overwriting cursor with new watch baseline',async()=>{
 const initial=fixture({initial:null});assert.equal((await initial.subscription.watch()).status,'watching');assert.equal(initial.state().cursor,newCursor);assert.equal(initial.enqueued.length,0);
 const watch=initial.requests.find(r=>new URL(r.url).pathname.endsWith('/watch'));assert.equal(watch.options.method,'POST');assert.deepEqual(JSON.parse(watch.options.body),{topicName:env.GOOGLE_PUBSUB_TOPIC});
 const muchLater='90071992547409939999';const f=fixture({initial:{...state(),lastWatchAt:fixedTime-2*86400000,expiration:fixedTime+1000},fetchRoute:async url=>url.pathname.endsWith('/watch')?Response.json({historyId:muchLater,expiration:String(fixedTime+7*86400000)}):undefined});
 const result=await f.subscription.renew();assert.equal(result.status,'ready');assert.equal(result.watchStatus,'watching');assert.equal(f.state().cursor,newCursor,'Watch response must not skip history');
 assert(f.requests.findIndex(r=>new URL(r.url).pathname.endsWith('/history'))<f.requests.findIndex(r=>new URL(r.url).pathname.endsWith('/watch')));
 assert(f.requests.every(r=>r.options.method==='GET'||new URL(r.url).pathname.endsWith('/watch')));
});

test('concurrent push deliveries use CAS lease so only one fetch/enqueue runs',async()=>{
 let releaseHistory,started;
 const startedPromise=new Promise(resolve=>{started=resolve;});
 const f=fixture({fetchRoute:async url=>{if(url.pathname.endsWith('/history')){started();return new Promise(resolve=>{releaseHistory=()=>resolve(Response.json(additions()));});}}});
 const first=f.subscription.handlePush({authorization:'Bearer a.b.c',body:push()});await startedPromise;
 assert.equal((await f.subscription.handlePush({authorization:'Bearer a.b.c',body:push()})).status,'busy');releaseHistory();assert.equal((await first).status,'ready');assert.equal(f.enqueued.length,1);
});

test('history page budget checkpoints pageToken, resumes old start cursor and commits only final history',async()=>{
 const seen=[];const f=fixture({settings:{maxPages:1},fetchRoute:async url=>{
  if(!url.pathname.endsWith('/history'))return;
  const page=url.searchParams.get('pageToken');seen.push({page,start:url.searchParams.get('startHistoryId')});
  return Response.json(page?additions(['a2'],'90071992547409931236'):{...additions(['a1']),nextPageToken:'page-two'});
 }});
 assert.equal((await f.subscription.sync()).status,'pending');assert.equal(f.state().cursor,oldCursor);assert.equal(f.state().pageToken,'page-two');
 assert.equal((await f.subscription.sync()).status,'ready');assert.equal(f.state().cursor,'90071992547409931236');assert.equal(f.state().pageToken,null);
 assert.deepEqual(seen,[{page:null,start:oldCursor},{page:'page-two',start:oldCursor}]);assert.deepEqual(f.enqueued.map(e=>e.eventId),['a1','a2']);
});

test('partial page enqueue failure persists successful offset and fresh instance resumes without cursor skipping',async()=>{
 let failSecond=true;const accepted=new Set();
 const f=fixture({fetchRoute:async url=>url.pathname.endsWith('/history')?Response.json(additions(['a1','a2'])):undefined,enqueue:async e=>{
  if(e.eventId==='a2'&&failSecond)return {status:'unavailable'};const key=e.eventId+':'+e.revision;if(accepted.has(key))return {status:'duplicate'};accepted.add(key);return {status:'queued'};
 }});
 assert.deepEqual(await f.subscription.sync(),{status:'enqueue_failed'});assert.equal(f.state().cursor,oldCursor);assert.equal(f.state().pageToken,null);assert.equal(f.state().lease,undefined);
 assert.equal(f.state().pageOffset,1);assert.match(f.state().pageFingerprint,/^[a-f0-9]{64}$/);
 failSecond=false;assert.deepEqual(await f.restart().sync(),{status:'ready',queued:1,duplicates:0,messages:1});assert.equal(f.state().cursor,newCursor);assert.deepEqual(f.enqueued.map(e=>e.eventId+':'+e.revision),['a1:'+newCursor,'a2:'+newCursor,'a2:'+newCursor]);
});

test('inbox sender cache runs after validated fetch and before queue; cache failure retains the exact pending offset',async()=>{
 const order=[];let failSecond=true;
 const f=fixture({fetchRoute:async url=>url.pathname.endsWith('/history')?Response.json(additions(['a1','a2'])):undefined,
  cacheInboxSender:async({message:mail,accountEmail,signal})=>{assert.equal(accountEmail,'club@example.test');assert(!signal.aborted);assert.deepEqual(mail,message(mail.id));order.push('cache:'+mail.id);return {status:mail.id==='a2'&&failSecond?'contact_cache_failed':'ready'};},
  enqueue:async event=>{order.push('queue:'+event.eventId);return {status:'queued'};}});
 assert.deepEqual(await f.subscription.sync(),{status:'contact_cache_failed'});assert.deepEqual(order,['cache:a1','queue:a1','cache:a2']);assert.equal(f.state().cursor,oldCursor);assert.equal(f.state().pageOffset,1);assert.equal(f.state().lease,undefined);assert(!JSON.stringify(f.state()).includes('Original email evidence'));
 failSecond=false;assert.equal((await f.restart().sync()).status,'ready');assert.equal(f.state().cursor,newCursor);assert.deepEqual(order,['cache:a1','queue:a1','cache:a2','cache:a2','queue:a2']);
 for(const callback of [async()=>{throw Error('PRIVATE sender/body failure');},async()=>({status:'unexpected'}),async()=>({status:'contact_cache_failed'})]){const failed=fixture({cacheInboxSender:callback});assert.deepEqual(await failed.subscription.sync(),{status:'contact_cache_failed'});assert.equal(failed.enqueued.length,0);assert.equal(failed.state().cursor,oldCursor);assert.equal(failed.state().pageOffset,0);}
 let cached=0;const invalid=fixture({cacheInboxSender:async()=>{cached++;return {status:'ready'};},fetchRoute:async url=>url.pathname.includes('/messages/')?Response.json({...message(),id:'wrong'}):undefined});assert.equal((await invalid.subscription.sync()).status,'invalid_response');assert.equal(cached,0,'An unvalidated message never reaches sender intake');
});

test('queue failure after sender cache safely replays; skipped senders and metadata fallback preserve ordinary queue events',async()=>{
 const cached=new Set(),cacheCalls=[];let fail=true;const f=fixture({cacheInboxSender:async({message:mail})=>{cacheCalls.push(mail.id);cached.add('person@example.test');return {status:'ready'};},enqueue:async()=>({status:fail?'unavailable':'queued'})});
 assert.equal((await f.subscription.sync()).status,'enqueue_failed');assert.equal(cached.size,1);assert.equal(f.state().cursor,oldCursor);assert.equal(f.state().pageOffset,0);fail=false;assert.equal((await f.restart().sync()).status,'ready');assert.equal(f.state().cursor,newCursor);assert.deepEqual(cacheCalls,['a1','a1']);assert.equal(cached.size,1);
 const skipped=fixture({cacheInboxSender:async()=>({status:'skipped'})});assert.equal((await skipped.subscription.sync()).status,'ready');assert.equal(skipped.enqueued.length,1);assert.deepEqual(skipped.enqueued[0].payload,message());
 const metadata={id:'a1',historyId:newCursor,labelIds:['INBOX'],payload:{headers:[{name:'From',value:'Metadata Sender <metadata@example.test>'}]}};let observed;
 const fallback=fixture({cacheInboxSender:async({message:mail})=>{observed=structuredClone(mail);return {status:'ready'};},fetchRoute:async url=>url.pathname.endsWith('/messages/a1')?Response.json(url.searchParams.get('format')==='full'?{...message(),payload:{body:{data:'x'.repeat(60000)}}}:metadata):undefined});assert.equal((await fallback.subscription.sync()).status,'ready');assert.deepEqual(observed,metadata);assert.equal(fallback.enqueued[0].eventType,'email_received_metadata');assert.deepEqual(fallback.enqueued[0].payload,metadata);
});

test('sender cache respects cancellation and lease ownership before cache and before separate queue dispatch',async()=>{
 const controller=new AbortController();let f,cached=0;f=fixture({cacheInboxSender:async()=>{cached++;controller.abort();return {status:'ready'};}});assert.equal((await f.subscription.sync({signal:controller.signal})).status,'aborted');assert.equal(cached,1);assert.equal(f.enqueued.length,0);assert.equal(f.state().cursor,oldCursor);
 let expired;expired=fixture({cacheInboxSender:async()=>{expired.advance(91000);return {status:'ready'};}});assert.equal((await expired.subscription.sync()).status,'lease_lost');assert.equal(expired.enqueued.length,0,'A cache completion after lease expiry must not dispatch a queue write');assert.equal(expired.state().cursor,oldCursor);
 let intake=0;const lost=fixture({cacheInboxSender:async()=>{intake++;return {status:'ready'};},cas:async({expected,next})=>expected?.lease&&next?.lease?false:undefined});assert.equal((await lost.subscription.sync()).status,'lease_lost');assert.equal(intake,0);assert.equal(lost.enqueued.length,0);
 let cachedBeforeLoss=false;const stolen=fixture({cacheInboxSender:async()=>{cachedBeforeLoss=true;return {status:'ready'};},cas:async({expected,next})=>cachedBeforeLoss&&expected?.lease&&next?.lease?false:undefined});assert.equal((await stolen.subscription.sync()).status,'lease_lost');assert.equal(stolen.enqueued.length,0,'A completed cache write grants no permission after ownership is lost');assert.equal(stolen.state().cursor,oldCursor);
});

test('email fetch/invalid response/oversize errors retain cursor and never enqueue incomplete data',async()=>{
 const routes=[
  async url=>url.pathname.includes('/messages/')?new Response('PRIVATE_BODY',{status:503}):undefined,
  async url=>url.pathname.includes('/messages/')?Response.json({...message(),id:'wrong'}):undefined,
  async url=>url.pathname.includes('/messages/')?Response.json({...message(),payload:{body:{data:'x'.repeat(60000)}}}):undefined,
  async url=>url.pathname.endsWith('/history')?Response.json({historyId:'123'}):undefined,
  async url=>url.pathname.endsWith('/history')?Response.json({...additions(),nextPageToken:'x'.repeat(2049)}):undefined
 ];
 for(const fetchRoute of routes){const f=fixture({fetchRoute});const result=await f.subscription.sync();assert(['google_unavailable','invalid_response','response_too_large'].includes(result.status));assert(!JSON.stringify(result).includes('PRIVATE'));assert.equal(f.state().cursor,oldCursor);assert.equal(f.enqueued.length,0);assert.equal(f.state().lease,undefined);}
});

test('missing Gmail originals skip only that message, preserve paging budget and allow a later valid sender through',async()=>{
 for(const metadataFallback of [false,true]){
  const cached=[],formats=[];const f=fixture({fetchRoute:async url=>{
   if(url.pathname.endsWith('/history'))return Response.json(additions(['a1','a2']));
   if(!url.pathname.endsWith('/messages/a1'))return;
   formats.push(url.searchParams.get('format'));return metadataFallback&&url.searchParams.get('format')==='full'?Response.json({...message(),payload:{body:{data:'x'.repeat(60000)}}}):new Response('PRIVATE missing original',{status:404});
  },cacheInboxSender:async({message:mail})=>{cached.push(mail.id);return {status:'ready'};}});
  assert.deepEqual(await f.subscription.sync(),{status:'ready',queued:1,duplicates:0,messages:2});assert.deepEqual(formats,metadataFallback?['full','metadata']:['full']);assert.deepEqual(cached,['a2']);assert.deepEqual(f.enqueued.map(event=>event.eventId),['a2']);assert.deepEqual(f.enqueued[0].payload,message('a2'));assert.equal(f.state().cursor,newCursor);assert.equal(f.state().lease,undefined);
  const skipped=f.stateCalls.find(call=>call.op==='cas'&&call.next?.pageOffset===1&&call.next?.pageFingerprint);assert(skipped,'Missing original receives its own checkpoint before later cache/queue activity');assert.equal(skipped.next.cursor,oldCursor);assert(!JSON.stringify(skipped.next).includes('PRIVATE'));
 }
 const bounded=fixture({settings:{maxMessages:1},fetchRoute:async url=>url.pathname.endsWith('/history')?Response.json(additions(['a1','a2'])):url.pathname.endsWith('/messages/a1')?new Response(null,{status:404}):undefined});
 assert.deepEqual(await bounded.subscription.sync(),{status:'pending',queued:0,duplicates:0,messages:1});assert.equal(bounded.state().cursor,oldCursor);assert.equal(bounded.state().pageOffset,1);assert.equal(bounded.enqueued.length,0);assert(!bounded.requests.some(request=>new URL(request.url).pathname.endsWith('/messages/a2')));
 assert.deepEqual(await bounded.restart().sync(),{status:'ready',queued:1,duplicates:0,messages:1});assert.equal(bounded.state().cursor,newCursor);assert.equal(bounded.requests.filter(request=>new URL(request.url).pathname.endsWith('/messages/a1')).length,1,'Persisted missing-message offset survives a fresh subscription instance');assert.deepEqual(bounded.enqueued.map(event=>event.eventId),['a2']);
});

test('missing-original checkpoint requires the lease; other message errors remain retryable and do not skip later additions',async()=>{
 for(const loss of ['expired','stolen','aborted']){
  let f,missing=false;const controller=new AbortController(),cached=[];f=fixture({fetchRoute:async url=>{
   if(url.pathname.endsWith('/history'))return Response.json(additions(['a1','a2']));
   if(!url.pathname.endsWith('/messages/a1'))return;
   missing=true;if(loss==='expired')f.advance(91000);if(loss==='aborted')controller.abort();return new Response(null,{status:404});
  },cas:async({expected,next})=>loss==='stolen'&&missing&&expected?.lease&&next?.lease?false:undefined,cacheInboxSender:async({message:mail})=>{cached.push(mail.id);return {status:'ready'};}});
  assert.equal((await f.subscription.sync({signal:controller.signal})).status,loss==='aborted'?'aborted':'lease_lost');assert.equal(f.state().cursor,oldCursor);assert.equal(f.enqueued.length,0);assert.deepEqual(cached,[]);assert(!f.requests.some(request=>new URL(request.url).pathname.endsWith('/messages/a2')),'Cannot dispatch a later original after losing permission to checkpoint the missing one');
 }
 for(const status of [403,429,500])for(const metadataFallback of [false,true]){
  let cached=0;const f=fixture({fetchRoute:async url=>url.pathname.endsWith('/history')?Response.json(additions(['a1','a2'])):url.pathname.endsWith('/messages/a1')?(metadataFallback&&url.searchParams.get('format')==='full'?Response.json({...message(),payload:{body:{data:'x'.repeat(60000)}}}):new Response('PRIVATE provider error',{status})):undefined,cacheInboxSender:async()=>{cached++;return {status:'ready'};}});
  const result=await f.subscription.sync();assert.equal(result.status,status===403?'permission_denied':status===429?'rate_limited':'google_unavailable');assert.equal(f.state().cursor,oldCursor);assert.equal(f.state().pageOffset,0);assert.equal(f.enqueued.length,0);assert.equal(cached,0);assert(!f.requests.some(request=>new URL(request.url).pathname.endsWith('/messages/a2')));assert(!JSON.stringify(result).includes('PRIVATE'));
 }
});

test('oversized full email falls back to explicit raw metadata event and advances safely',async()=>{
 const metadata={id:'a1',historyId:newCursor,snippet:'Large attachment email',payload:{headers:[{name:'Subject',value:'Library plans'}]},labelIds:['INBOX']};
 const f=fixture({fetchRoute:async url=>{
  if(!url.pathname.endsWith('/messages/a1'))return;
  return url.searchParams.get('format')==='full'?Response.json({...message(),payload:{body:{data:'x'.repeat(60000)}}}):Response.json(metadata);
 }});
 assert.deepEqual(await f.subscription.sync(),{status:'ready',queued:1,duplicates:0,messages:1});assert.equal(f.state().cursor,newCursor);
 assert.equal(f.enqueued[0].eventType,'email_received_metadata');assert.deepEqual(f.enqueued[0].payload,metadata);
 assert.deepEqual(f.requests.filter(r=>new URL(r.url).pathname.endsWith('/messages/a1')).map(r=>new URL(r.url).searchParams.get('format')),['full','metadata']);
 const failed=fixture({fetchRoute:async url=>{
  if(!url.pathname.endsWith('/messages/a1'))return;
  return url.searchParams.get('format')==='full'?Response.json({...message(),payload:{body:{data:'x'.repeat(60000)}}}):new Response('PRIVATE_FAILURE',{status:503});
 }});
 assert.equal((await failed.subscription.sync()).status,'google_unavailable');assert.equal(failed.state().cursor,oldCursor);assert.equal(failed.enqueued.length,0);
});

test('duplicate additions are fetched once and bounded page processing makes progress after restart',async()=>{
 const duplicate=fixture({fetchRoute:async url=>url.pathname.endsWith('/history')?Response.json({historyId:newCursor,history:[{id:newCursor,messagesAdded:[{message:{id:'a1'}},{message:{id:'a1'}}]}]}):undefined});
 assert.equal((await duplicate.subscription.sync()).messages,1);assert.equal(duplicate.enqueued.length,1);
 const bounded=fixture({settings:{maxMessages:1},fetchRoute:async url=>url.pathname.endsWith('/history')?Response.json(additions(['a1','a2'])):undefined});
 assert.deepEqual(await bounded.subscription.sync(),{status:'pending',queued:1,duplicates:0,messages:1});assert.equal(bounded.state().cursor,oldCursor);assert.equal(bounded.enqueued.length,1);assert.equal(bounded.state().lease,undefined);
 assert.deepEqual(await bounded.restart().sync(),{status:'ready',queued:1,duplicates:0,messages:1});assert.equal(bounded.state().cursor,newCursor);assert.deepEqual(bounded.enqueued.map(e=>e.eventId),['a1','a2']);
});

test('single history record with101 additions completes across fresh subscription instances without cursor skipping',async()=>{
 const ids=Array.from({length:101},(_,n)=>(n+1).toString(16).padStart(4,'0'));
 const f=fixture({fetchRoute:async url=>url.pathname.endsWith('/history')?Response.json(additions(ids)):undefined});
 const first=await f.subscription.sync();assert.deepEqual(first,{status:'pending',queued:100,duplicates:0,messages:100});assert.equal(f.state().cursor,oldCursor);assert.equal(new Set(f.enqueued.map(e=>e.eventId)).size,100);
 const second=await f.restart().sync();assert.deepEqual(second,{status:'ready',queued:1,duplicates:0,messages:1});assert.equal(f.state().cursor,newCursor);
 assert.deepEqual(f.enqueued.map(e=>e.eventId).sort(),ids);assert([null,0].includes(f.state().pageOffset));assert.equal(f.state().pageFingerprint,null);
});

test('changed history-page fingerprint restarts offset and stable enqueue identities prevent skipped additions',async()=>{
 let ids=['a1','a2','a3'];const accepted=new Set();const outcomes=[];
 const f=fixture({settings:{maxMessages:2},fetchRoute:async url=>url.pathname.endsWith('/history')?Response.json(additions(ids)):undefined,enqueue:async e=>{
  const key=e.eventId+':'+e.revision;const status=accepted.has(key)?'duplicate':'queued';accepted.add(key);outcomes.push({id:e.eventId,status});return {status};
 }});
 assert.equal((await f.subscription.sync()).status,'pending');assert.equal(accepted.size,2);assert.equal(f.state().cursor,oldCursor);
 ids=['00','a1','a2','a3'];assert.equal((await f.restart().sync()).status,'pending');assert(accepted.has('00:'+newCursor),'New addition preceding previous offset is not skipped');assert.equal(f.state().cursor,oldCursor);
 assert.equal((await f.restart().sync()).status,'ready');assert.equal(f.state().cursor,newCursor);assert.deepEqual([...accepted].sort(),ids.map(id=>id+':'+newCursor).sort());
 assert(outcomes.some(e=>e.status==='duplicate'),'Changed page replays prior entries through deduplication');
});

test('history additions ordering changes do not replay successful progress and an old push still resumes pending page',async()=>{
 let ids=['a3','a1','a2'];
 const f=fixture({settings:{maxMessages:2},fetchRoute:async url=>url.pathname.endsWith('/history')?Response.json(additions(ids)):undefined});
 assert.equal((await f.subscription.sync()).status,'pending');assert.deepEqual(f.enqueued.map(e=>e.eventId),['a1','a2']);
 ids=['a2','a3','a1'];assert.deepEqual(await f.restart().handlePush({authorization:'Bearer a.b.c',body:push(oldCursor)}),{status:'ready',queued:1,duplicates:0,messages:1});
 assert.deepEqual(f.enqueued.map(e=>e.eventId),['a1','a2','a3']);assert.equal(f.state().cursor,newCursor);
});

test('expired Gmail history marks resync_required and watch cannot silently skip missed mail',async()=>{
 const f=fixture({fetchRoute:async url=>url.pathname.endsWith('/history')?new Response('',{status:404}):undefined});
 assert.deepEqual(await f.subscription.sync(),{status:'resync_required'});assert.equal(f.state().status,'resync_required');assert.equal(f.state().cursor,oldCursor);
 const count=f.requests.length;assert.deepEqual(await f.subscription.watch(),{status:'resync_required'});assert.equal(f.requests.slice(count).filter(r=>new URL(r.url).pathname.endsWith('/watch')).length,0);
 assert.deepEqual(await f.subscription.handlePush({authorization:'Bearer a.b.c',body:push()}),{status:'resync_required'});
});

test('OAuth account/scope and persisted-source configuration mismatch deny before reading email',async()=>{
 const variants=[
  fixture({fetchRoute:async url=>url.pathname.endsWith('/profile')?Response.json({emailAddress:'other@example.test'}):undefined}),
  fixture({auth:{getAccessToken:async()=>({token:'synthetic-access'}),getTokenInfo:async()=>({scopes:[]})}}),
  fixture({initial:{...state(),sourceId:'different'}}),fixture({initial:{...state(),account:'other@example.test'}})
 ];
 for(const f of variants){const result=await f.subscription.sync();assert(['account_mismatch','reauthorization_required','configuration_changed'].includes(result.status));assert.equal(f.enqueued.length,0);assert(!f.requests.some(r=>new URL(r.url).pathname.endsWith('/history')));assert.equal(f.state().cursor,oldCursor);}
});

test('lease expiry/CAS failure and cancellation retain checkpoint without finishing the page',async()=>{
 let f;f=fixture({enqueue:async()=>{f.advance(91000);return {status:'queued'};}});assert.equal((await f.subscription.sync()).status,'lease_lost');assert.equal(f.state().cursor,oldCursor);
 let failSave=true;const cas=fixture({cas:async({next})=>{if(next?.cursor===newCursor&&failSave){failSave=false;return false;}}});assert.equal((await cas.subscription.sync()).status,'lease_lost');assert.equal(cas.state().cursor,oldCursor);
 const controller=new AbortController();controller.abort();const canceled=fixture();assert.equal((await canceled.subscription.sync({signal:controller.signal})).status,'aborted');assert.equal(canceled.enqueued.length,0);assert.equal(canceled.state().cursor,oldCursor);
});

test('subscription metadata store bounds trusted endpoint/key/size and uses only service RPCs',async()=>{
 for(const url of ['http://remote.example.test','https://user:pass@db.example.test','https://db.example.test/path'])assert.throws(()=>createGmailSubscriptionStore({url,serviceRoleKey:'synthetic-key'}),/invalid_subscription_store_config/);
 const calls=[];const store=createGmailSubscriptionStore({url:'https://db.example.test',serviceRoleKey:'synthetic-key',fetchImpl:async(url,options)=>{calls.push({url,options});assert.equal(options.method,'POST');assert.equal(options.redirect,'error');assert.equal(options.headers.Authorization,'Bearer synthetic-key');return Response.json(url.endsWith('cas_state')?true:state());}});
 const key='subscription:gmail:'+sourceId;assert.deepEqual(await store.getState(key),state());assert.equal(await store.casState(key,state(),{...state(),cursor:newCursor}),true);
 assert.deepEqual(calls.map(c=>new URL(c.url).pathname),['/rest/v1/rpc/agent_subscription_get_state','/rest/v1/rpc/agent_subscription_cas_state']);
 await assert.rejects(store.getState('runner'),/invalid_subscription_state_key/);await assert.rejects(store.casState(key,null,{large:'x'.repeat(13000)}),/subscription_state_too_large/);
 const fail=createGmailSubscriptionStore({url:'https://db.example.test',serviceRoleKey:'synthetic-key',fetchImpl:async()=>{throw Error('PRIVATE_SUPABASE_ERROR');}});await assert.rejects(fail.getState(key),e=>e.message==='subscription_store_unavailable');
});

test('HTTP callback enforces body bounds/auth status and exposes only status/counts',async()=>{
 for(const [status,expected] of [['ready',200],['duplicate',200],['unauthorized',401],['account_mismatch',403],['invalid_push',400],['busy',503],['pending',503],['resync_required',503]]){
  const app=createGmailSubscriptionApp({subscription:{handlePush:async input=>{assert.equal(input.authorization,'Bearer a.b.c');assert.deepEqual(input.body,push());return {status,queued:1,payload:'PRIVATE_EMAIL'};}}});
  const response=await app.request('/webhooks/gmail',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer a.b.c'},body:JSON.stringify(push())});assert.equal(response.status,expected);assert.deepEqual(await response.json(),{status,queued:1});
 }
 let called=0;const app=createGmailSubscriptionApp({maxBodyBytes:100,subscription:{handlePush:async()=>{called++;return {status:'ready'};}}});
 for(const [headers,body,expected] of [[{'content-type':'text/plain'},'{}',400],[{'content-type':'application/json'},'bad JSON',400],[{'content-type':'application/json'},'x'.repeat(101),413],[{'content-type':'application/json','content-length':'1000'},'{}',413]]){
  assert.equal((await app.request('/webhooks/gmail',{method:'POST',headers,body})).status,expected);
 }
 assert.equal(called,0);
 const failing=createGmailSubscriptionApp({subscription:{handlePush:async()=>{throw Error('PRIVATE');}}});const result=await failing.request('/webhooks/gmail',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});assert.deepEqual(await result.json(),{status:'unavailable'});
});

test('CLI status/configuration and reconciliation outputs contain no OAuth/source bodies',async()=>{
 let requests=0;assert.equal(createGmailSubscriptionRuntime({env:{},fetchImpl:async()=>{requests++;throw Error();}}).subscription,undefined);assert.equal(requests,0);
 const output=[];await runGmailSubscriptionCli(['status'],{env:{},write:value=>output.push(value)});assert.deepEqual(output,[{status:'disabled'}]);
 output.length=0;const runtime={config:config(),subscription:{sync:async()=>({status:'ready',queued:1,messages:1,payload:'PRIVATE',refreshToken:'SECRET'})}};
 assert.deepEqual(await runGmailSubscriptionCli(['sync'],{runtime,write:value=>output.push(value)}),{status:'ready',queued:1,messages:1});assert.deepEqual(output,[{status:'ready',queued:1,messages:1}]);
});

test('actual Gmail runtime authorizer accepts metadata fallback into shared updater without skipping failed enqueue',async t=>{
 t.mock.method(OAuth2Client.prototype,'getAccessToken',async()=>({token:'synthetic-access'}));
 t.mock.method(OAuth2Client.prototype,'getTokenInfo',async()=>({scopes:[...GOOGLE_SCOPES]}));
 for(const accept of [true,false]){
  let checkpoint=state();const queued=[{uuid:'existing-unrelated-row',raw_response:{source:'discord',payload:{retained:true}}}],requests=[],cached=[];
  const runtime=createGmailSubscriptionRuntime({env:{...env,SUPABASE_URL:'https://db.example.test',SUPABASE_SERVICE_ROLE_KEY:'synthetic-service'},fetchImpl:async(url,options)=>{
   const parsed=new URL(url);requests.push({parsed,options});assert.equal(options.redirect,'error');
   if(parsed.origin==='https://db.example.test'){
    assert.equal(options.headers.authorization||options.headers.Authorization,'Bearer synthetic-service');
    const args=JSON.parse(options.body);
    if(parsed.pathname.endsWith('/agent_subscription_get_state'))return Response.json(checkpoint);
    if(parsed.pathname.endsWith('/agent_subscription_cas_state')){if(!equal(checkpoint,args.p_expected))return Response.json(false);checkpoint=args.p_next;return Response.json(true);}
    if(parsed.pathname==='/rest/v1/contacts_cache'){assert.deepEqual(args.raw_input,{email:'metadata@example.test',name:'Metadata Sender'});assert.deepEqual(Object.keys(args).sort(),['id','raw_input']);cached.push(args);return new Response(null,{status:204});}
    assert(parsed.pathname.endsWith('/agent_automation_enqueue'));
    assert.equal(cached.length,1,'The actual runtime caches an incoming sender before its separate queue operation');
    assert.equal(args.p_envelope.source,'gmail');assert.equal(args.p_envelope.source_id,sourceId);assert.equal(args.p_envelope.event_type,'email_received_metadata');
    if(!accept)return Response.json({status:'forbidden'});
    queued.push({uuid:args.p_input_id,raw_response:args.p_envelope});return Response.json({status:'queued',inputId:args.p_input_id});
   }
   assert.equal(parsed.origin,'https://gmail.googleapis.com');
   if(parsed.pathname.endsWith('/profile'))return Response.json({emailAddress:'club@example.test'});
   if(parsed.pathname.endsWith('/history'))return Response.json(additions());
   assert(parsed.pathname.endsWith('/messages/a1'));
   if(parsed.searchParams.get('format')==='full')return Response.json({...message(),payload:{body:{data:'x'.repeat(60000)}}});
   assert.equal(parsed.searchParams.get('format'),'metadata');return Response.json({id:'a1',historyId:newCursor,labelIds:['INBOX'],payload:{headers:[{name:'Subject',value:'Large message metadata'},{name:'From',value:'Metadata Sender <metadata@example.test>'}]}});
  }});
  const result=await runtime.subscription.sync();assert.equal(result.status,accept?'ready':'enqueue_failed');assert.equal(checkpoint.cursor,accept?newCursor:oldCursor);assert.equal(queued.length,accept?2:1);
  assert.deepEqual(queued[0],{uuid:'existing-unrelated-row',raw_response:{source:'discord',payload:{retained:true}}});
  assert.equal(cached.length,1);assert(!requests.some(r=>r.parsed.pathname==='/rest/v1/contacts'),'Collector must not write the CRM Contacts table');
  assert(requests.every(r=>r.parsed.origin==='https://db.example.test'||r.options.method==='GET'),'Runtime ingestion sends no mail or source mutations');
 }
});

function encodedNotification({pad=0,opaque=''}={}){
 return Buffer.from(JSON.stringify({emailAddress:'club@example.test',historyId:oldCursor,pad:'a'.repeat(pad),opaque}));
}

test('push accepts canonical standard/base64url alphabets with optional valid padding',async()=>{
 let special;
 for(let pad=0;pad<3;pad++){const raw=encodedNotification({pad,opaque:'\uffff\uffff'});if(/[+]/.test(raw.toString('base64'))&&/[/]/.test(raw.toString('base64')))special=raw;}
 assert(special,'Fixture must actually contain both standard alphabet characters');
 const seenPadding=new Set();
 for(let pad=0;pad<3;pad++){
  const raw=encodedNotification({pad});seenPadding.add((raw.toString('base64').match(/=+$/)||[''])[0].length);
  for(const encoding of ['base64','base64url']){
   const encoded=raw.toString(encoding);const padded=encoded.replace(/=+$/,'')+'='.repeat((4-encoded.replace(/=+$/,'').length%4)%4);
   for(const data of new Set([encoded,padded,encoded.replace(/=+$/,'')])){
    const f=fixture();const body=push(oldCursor);body.message.data=data;
    assert.deepEqual(await f.subscription.handlePush({authorization:'Bearer a.b.c',body}),{status:'duplicate',queued:0});assert.equal(f.requests.length,0);
   }
  }
 }
 assert.deepEqual([...seenPadding].sort(),[0,1,2]);
 for(const data of [special.toString('base64'),special.toString('base64url')]){
  const f=fixture();const body=push(oldCursor);body.message.data=data;assert.equal((await f.subscription.handlePush({authorization:'Bearer a.b.c',body})).status,'duplicate');
 }
});

test('push rejects mixed alphabets, invalid padding and noncanonical pad bits without leaking values',async()=>{
 let encoded,padded;
 for(let pad=0;pad<3;pad++){
  const raw=encodedNotification({pad,opaque:'\uffff\uffff'}).toString('base64');if(raw.includes('+')&&raw.includes('/'))encoded=raw;
  const candidate=encodedNotification({pad}).toString('base64');if(candidate.endsWith('=='))padded=candidate;
 }
 assert(encoded&&padded);const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
 const index=alphabet.indexOf(padded.at(-3));const badBits=padded.slice(0,-3)+alphabet[index+1]+'==';
 const invalid=[encoded.replace('+','-'),encoded.replace('/','_'),padded.slice(0,-1),padded+'=',padded.slice(0,4)+'='+padded.slice(4),badBits,'A','AA==='];
 for(const data of invalid){
  const diagnostics=[];const f=fixture({onDiagnostic:diagnostic=>diagnostics.push(diagnostic)});const body=push(oldCursor);body.message.data=data;
  assert.deepEqual(await f.subscription.handlePush({authorization:'Bearer a.b.c',body}),{status:'invalid_push'});assert.deepEqual(diagnostics,[{reason:'data_encoding',classification:'string'}]);assert.equal(f.stateCalls.length,0);assert.equal(f.requests.length,0);
 }
});

test('diagnostic boundary emits fixed reasons/type labels only and callback failures cannot change rejection',async()=>{
 const emitted=[];const diagnose=createGmailPushDiagnostics(d=>{assert.equal(Object.isFrozen(d),true);emitted.push(d);});
 for(const value of ['PRIVATE_PAYLOAD',{accessToken:'PRIVATE_TOKEN'},['PRIVATE_ACCOUNT'],null,123,true,undefined,Symbol('PRIVATE')])diagnose('message_object',value);
 diagnose('PRIVATE_UNREGISTERED_REASON',{secret:'PRIVATE'});
 assert.deepEqual(emitted.map(e=>e.classification),['string','object','array','null','number','boolean','undefined','other']);
 assert(emitted.every(e=>Object.keys(e).join(',')==='reason,classification'&&e.reason==='message_object'));assert(!JSON.stringify(emitted).includes('PRIVATE'));
 const diagnostics=[];const body=push();body.message.messageId=123;
 const f=fixture({onDiagnostic:d=>diagnostics.push(d)});assert.equal((await f.subscription.handlePush({authorization:'Bearer a.b.c',body})).status,'invalid_push');assert.deepEqual(diagnostics,[{reason:'message_id_type',classification:'number'}]);
 for(const onDiagnostic of [()=>{throw Error('PRIVATE_CALLBACK');},()=>Promise.reject(Error('PRIVATE_CALLBACK'))]){
  const denied=fixture({onDiagnostic});assert.deepEqual(await denied.subscription.handlePush({authorization:'invalid PRIVATE_TOKEN',body:{}}),{status:'unauthorized'});
 }
 await new Promise(resolve=>setImmediate(resolve));
});

test('charset JSON reaches unchanged authentication gate and HTTP diagnostics exclude body/header values',async()=>{
 for(const contentType of ['application/json; charset=UTF-8','Application/JSON; charset=utf-8']){
  const diagnostics=[];const f=fixture({onDiagnostic:d=>diagnostics.push(d)});const app=createGmailSubscriptionApp({subscription:f.subscription,onDiagnostic:d=>diagnostics.push(d)});
  const response=await app.request('/webhooks/gmail',{method:'POST',headers:{'content-type':contentType},body:'{}'});assert.equal(response.status,401);assert.deepEqual(await response.json(),{status:'unauthorized'});assert.deepEqual(diagnostics,[{reason:'auth_header',classification:'null'}]);
 }
 const diagnostics=[];const app=createGmailSubscriptionApp({subscription:{handlePush:async()=>{throw Error('must not call');}},onDiagnostic:d=>diagnostics.push(d)});
 const response=await app.request('/webhooks/gmail',{method:'POST',headers:{'content-type':'text/PRIVATE_HEADER'},body:'PRIVATE_EMAIL'});assert.equal(response.status,400);assert.deepEqual(diagnostics,[{reason:'http_content_type',classification:'undefined'}]);assert(!JSON.stringify(diagnostics).includes('PRIVATE'));
 const throws=createGmailSubscriptionApp({subscription:{handlePush:async()=>({status:'unauthorized'})},onDiagnostic:()=>{throw Error('PRIVATE_CALLBACK');}});
 assert.equal((await throws.request('/webhooks/gmail',{method:'POST',headers:{'content-type':'application/json'},body:'PRIVATE_NOT_JSON'})).status,400);
});

test('safe positive numeric notification history wakes a trusted history read without assigning its cursor',async()=>{
 for(const numeric of [123,Number.MAX_SAFE_INTEGER]){
  const f=fixture({initial:{...state(),cursor:'100'}});
  assert.deepEqual(await f.subscription.handlePush({authorization:'Bearer a.b.c',body:push(numeric)}),{status:'ready',queued:1,duplicates:0,messages:1});
  assert.equal(f.state().cursor,newCursor,'Cursor comes from history API, never notification number');
  const query=new URL(f.requests.find(r=>new URL(r.url).pathname.endsWith('/history')).url);assert.equal(query.searchParams.get('startHistoryId'),'100');assert.notEqual(f.state().cursor,String(numeric));
 }
 const oldest=fixture({initial:{...state(),cursor:'1'}});assert.deepEqual(await oldest.subscription.handlePush({authorization:'Bearer a.b.c',body:push(1)}),{status:'duplicate',queued:0});assert.equal(oldest.requests.length,0);
});

test('unsafe/nonpositive/fractional notification numbers reject before state and provider history IDs stay strict strings',async()=>{
 for(const value of [Number.MAX_SAFE_INTEGER+1,1.5,0,-1,NaN,Infinity,-Infinity]){
  const diagnostics=[];const f=fixture({onDiagnostic:d=>diagnostics.push(d)});
  assert.deepEqual(await f.subscription.handlePush({authorization:'Bearer a.b.c',body:push(value)}),{status:'invalid_push'});assert.equal(f.stateCalls.length,0);assert.equal(f.requests.length,0);assert.deepEqual(f.state(),state());
  assert(diagnostics.every(d=>d.reason==='notification_history_type'));assert(!JSON.stringify(diagnostics).includes(String(Number.MAX_SAFE_INTEGER+1)));
 }
 const providerNumeric=fixture({fetchRoute:async url=>url.pathname.endsWith('/history')?Response.json({historyId:123,history:[]}):undefined});
 assert.equal((await providerNumeric.subscription.sync()).status,'invalid_response');assert.equal(providerNumeric.state().cursor,oldCursor);assert.equal(providerNumeric.enqueued.length,0);
});
