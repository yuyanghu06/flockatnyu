import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createApp} from '../server/runtime/app.js';
import {createWebsite} from '../server/web.js';
import {createSiteAuth,readSiteAuthConfig} from '../server/auth/site-auth.js';
import {readConfig} from '../server/shared/config.js';
import {createManualPlannerAuth} from '../server/automation/manual-auth.js';

const origin='https://planner.example',password='synthetic-planner-password',runId=randomUUID();
const apiKey='synthetic-planner-api-key-12345678901234567890';
function fixture({principal,storeResult,key=apiKey}={}) {
 const env={NODE_ENV:'production',PUBLIC_ORIGIN:origin,SITE_ACCESS_PASSWORD:password,SITE_SESSION_SECRET:'synthetic-planner-session-key-123456789'};
 const config=readConfig(env),siteAuth=createSiteAuth({config:readSiteAuthConfig(env),apiConfig:config}),calls=[];
 const plannerRuns={start:async args=>{calls.push(args);return storeResult??{status:'queued',runId};},read:async args=>{calls.push(args);return {status:'ready',run:{runId,status:'queued',createdAt:new Date().toISOString()}};}};
 const api=createApp({config,auth:principal===undefined?siteAuth.auth:async()=>principal,plannerRuns,plannerAuth:createManualPlannerAuth({env:{PLANNER_API_KEY:key}})});
 const app=createWebsite({siteAuth,apiApp:api}),cookie=siteAuth.issue(password).split(';')[0];
 const request=(path='/api/planner/runs',body={},headers={},method='POST')=>app.fetch(new Request(origin+path,{method,headers:{authorization:'Bearer '+apiKey,'content-type':'application/json',...headers},...(method==='GET'?{}:{body:typeof body==='string'?body:JSON.stringify(body)})}));
 return {app,api,calls,request,cookie};
}

test('manual planner HTTP accepts its API key without login cookie or Origin and returns a content-free acknowledgement',async()=>{
 const f=fixture();
 const response=await f.request(undefined,{channelIds:['200','201']});
 assert.equal(response.status,202);assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(response.headers.get('location'),'/api/planner/runs/'+runId);
 assert.deepEqual(await response.json(),{status:'queued',runId,statusUrl:'/api/planner/runs/'+runId});
 assert.deepEqual(f.calls[0].channelIds,['200','201']);assert(f.calls[0].signal instanceof AbortSignal);
 const status=await f.request('/api/planner/runs/'+runId,undefined,{},'GET');assert.equal(status.status,200);assert.equal((await status.json()).run.status,'queued');
});

test('manual planner requires its exact API key for start and status; website cookies and admin headers cannot substitute',async()=>{
 const f=fixture();
 for(const headers of [{authorization:''},{authorization:'Bearer wrong'},{authorization:'Basic '+apiKey},{authorization:'Bearer '+apiKey+', Bearer '+apiKey},{authorization:'',cookie:f.cookie},{authorization:'',cookie:f.cookie+'forged'}]) {
  const r=await f.request(undefined,{channelIds:['200']},{...headers,'x-planner-control':'true','x-admin':'true','x-user-id':'operator'});assert.equal(r.status,403);
 }
 assert.equal(f.calls.length,0);
 const anon=await f.request('/api/planner/runs/'+runId,undefined,{authorization:''},'GET');assert.equal(anon.status,403);
 assert.equal((await f.request('/api/tools',undefined,{},'GET')).status,403);
 assert.equal((await f.request('/api/planner/runs-other',undefined,{},'GET')).status,403);
});

test('manual planner rejects missing or invalid server key and never falls back to an admin session',async()=>{
 for(const key of [undefined,'','short','x'.repeat(513),'x'.repeat(32)+'\n','x'.repeat(32)+' ']) {
  const f=fixture({key:key??'',principal:{id:'trusted-admin',allowedSourceIds:[],isAdmin:true}});
  const r=await f.request(undefined,{}, {cookie:f.cookie});assert.equal(r.status,403);assert.equal(f.calls.length,0);
 }
 const f=fixture({principal:null});assert.equal((await f.request()).status,202);
});

test('manual planner rejects history fetching, malformed scope and unknown fields without enqueueing',async()=>{
 const f=fixture();
 for(const body of [null,[],{channelIds:'200'},{channelIds:[200]},{channelIds:['200','200']},{channelIds:['200\n']},{channelIds:['1'.repeat(21)]},{channelIds:Array.from({length:31},(_,i)=>String(i+1))},{channelIds:['200'],since:'yesterday'},{fetchHistory:true},{force:false},{channelIds:[],sourceIds:[]},'{bad']) {
  const r=await f.request(undefined,body);assert.equal(r.status,400,JSON.stringify(body));
 }
 assert.equal((await f.request('/api/planner/runs?channelIds=200')).status,400);
 assert.equal((await f.request(undefined,{}, {'content-type':'text/plain'})).status,400);
 assert.equal((await f.request(undefined,' '.repeat(4097))).status,400);assert.equal(f.calls.length,0);
 for(const body of [{},{channelIds:[]}])assert.equal((await f.request(undefined,body)).status,202);
 assert(f.calls.every(c=>Array.isArray(c.channelIds)&&c.channelIds.length===0));
});

test('manual planner bounded operational errors never expose store diagnostics',async()=>{
 for(const [status,code] of [['capacity',429],['rate_limited',429],['aborted',408],['not_configured',503],['private_error',503]]) {
  const f=fixture({storeResult:{status,diagnostic:'PRIVATE_SOURCE_CONTENT',leaseToken:randomUUID()}}),r=await f.request();assert.equal(r.status,code);assert(!JSON.stringify(await r.json()).includes('PRIVATE_'));
 }
 const f=fixture();for(const path of ['/api/planner/runs/not-uuid','/api/planner/runs/'+runId+'?source=true'])assert.equal((await f.request(path,undefined,{},'GET')).status,400);assert.equal(f.calls.length,0);
});

test('manual planner oversized streaming body is rejected without awaiting untrusted stream cancellation',async()=>{
 const f=fixture();let release;const cancellation=new Promise(resolve=>release=resolve);
 const body=new ReadableStream({start(c){c.enqueue(new Uint8Array(4097));},cancel(){return cancellation;}});
 const pending=f.app.fetch(new Request(origin+'/api/planner/runs',{method:'POST',headers:{authorization:'Bearer '+apiKey,'content-type':'application/json'},body,duplex:'half'}));
 try{const response=await Promise.race([pending,new Promise(resolve=>setTimeout(()=>resolve(null),200))]);assert(response,'Oversized planner body waited for untrusted stream cancellation');assert.equal(response.status,400);assert.equal(f.calls.length,0);}
 finally{release();await pending;}
});
