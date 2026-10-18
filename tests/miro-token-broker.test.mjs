import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {readMiroMcpConfig,MIRO_MCP_ENDPOINT} from '../server/miro/mcp-config.js';
import {saveMiroMcpCredentials,readMiroMcpCredentials,createMiroMcpOAuthProvider,acquireMiroMcpAuthLock} from '../server/miro/mcp-auth.js';
import {createMiroTokenBroker,requestMiroBrokerToken} from '../server/miro/token-broker.js';
import {createMiroMcpClient} from '../server/miro/mcp-client.js';
const secret='synthetic-test-secret-'.repeat(3),brokerUrl='https://web.fixture.test/internal/miro/token';
const request=(body={},patch={})=>new Request(brokerUrl,{method:'POST',headers:{Authorization:`Bearer ${secret}`,'Content-Type':'application/json'},body:JSON.stringify(body),...patch});
async function fixture({expired=false,unknownAge=false}={}) {
 const dir=await mkdtemp(join(tmpdir(),'miro-token-broker-')),path=join(dir,'auth.json'),savedAt=new Date(Date.now()-(expired?7200000:0)).toISOString();
 await saveMiroMcpCredentials(path,{clientInformation:{client_id:'synthetic-client',issuer:MIRO_MCP_ENDPOINT},tokens:{access_token:'synthetic-old-access',refresh_token:'synthetic-refresh-0',token_type:'Bearer',expires_in:3600,issuer:MIRO_MCP_ENDPOINT},...(unknownAge?{}:{tokensSavedAt:savedAt})});
 const env={MIRO_BOARD_IDS:'fixture',MIRO_MCP_AUTH_FILE:path,MIRO_MCP_PERSIST_AUTH:'true',MIRO_TOKEN_BROKER_SECRET:secret},calls=[];
 let refreshes=0,validAccess='synthetic-old-access',forceUnauthorized=false;
 const fetchImpl=async(input,init={})=>{
  const url=new URL(input instanceof Request?input.url:input),headers=new Headers(init.headers);calls.push({url:url.href,method:init.method,authorization:headers.get('authorization')});
  assert.equal(init.redirect,'error');
  if(url.origin==='https://web.fixture.test'){
   assert.equal(headers.get('authorization'),`Bearer ${secret}`);return broker.handle(new Request(url,init));
  }
  assert.equal(url.origin,'https://mcp.miro.com');assert.notEqual(headers.get('authorization'),`Bearer ${secret}`);
  if(url.pathname.startsWith('/.well-known/oauth-protected-resource'))return Response.json({resource:MIRO_MCP_ENDPOINT,authorization_servers:[MIRO_MCP_ENDPOINT],scopes_supported:['boards:read','openid','email']});
  if(url.pathname.startsWith('/.well-known/'))return Response.json({issuer:MIRO_MCP_ENDPOINT,authorization_endpoint:MIRO_MCP_ENDPOINT+'authorize',token_endpoint:MIRO_MCP_ENDPOINT+'token',response_types_supported:['code'],grant_types_supported:['refresh_token'],token_endpoint_auth_methods_supported:['none']});
  if(url.pathname==='/token'){
   const body=new URLSearchParams(init.body);assert.equal(body.get('grant_type'),'refresh_token');assert.equal(body.get('refresh_token'),`synthetic-refresh-${refreshes}`);
   refreshes++;validAccess=`synthetic-access-${refreshes}`;
   return Response.json({access_token:validAccess,refresh_token:`synthetic-refresh-${refreshes}`,token_type:'Bearer',expires_in:3600,scope:'boards:read'});
  }
  if(init.method==='GET')return new Response(null,{status:405});
  if(init.method==='DELETE')return new Response(null,{status:204});
  if(forceUnauthorized||headers.get('authorization')!==`Bearer ${validAccess}`)return new Response('Private upstream denial',{status:401});
  const rpc=JSON.parse(init.body);
  if(rpc.id===undefined)return new Response(null,{status:202});
  const result=rpc.method==='initialize'?{protocolVersion:'2025-11-25',capabilities:{tools:{}},serverInfo:{name:'fixture',version:'1'}}:{content:[{type:'text',text:'Synthetic source content'}]};
  return Response.json({jsonrpc:'2.0',id:rpc.id,result});
 };
 let broker=createMiroTokenBroker({env,fetchImpl});
 const workerConfig=readMiroMcpConfig({MIRO_BOARD_IDS:'fixture',MIRO_MCP_TOKEN_BROKER_URL:brokerUrl,MIRO_TOKEN_BROKER_SECRET:secret,MIRO_MCP_REQUEST_TIMEOUT_MS:'3000'});
 return {env,path,calls,fetchImpl,workerConfig,broker:()=>broker,refreshes:()=>refreshes,restart:()=>{broker=createMiroTokenBroker({env,fetchImpl});},rejectOld:()=>{validAccess='requires-refresh';},alwaysReject:()=>{forceUnauthorized=true;},cleanup:()=>rm(dir,{recursive:true,force:true})};
}
test('OAuth provider saves token acquisition timestamp with rotated credentials',async()=>{
 const f=await fixture();try{
  const clock=new Date('2026-10-18T16:00:00Z'),provider=createMiroMcpOAuthProvider({config:readMiroMcpConfig(f.env),now:()=>clock});
  await provider.saveTokens({access_token:'synthetic-new',refresh_token:'synthetic-rotated',token_type:'Bearer',expires_in:3600});
  const stored=await readMiroMcpCredentials(f.path);assert.equal(stored.tokensSavedAt,clock.toISOString());assert.equal(await provider.tokensSavedAt(),clock.toISOString());assert.equal(stored.tokens.refresh_token,'synthetic-rotated');
 }finally{await f.cleanup();}
});
test('expired access refreshes once through official SDK and survives broker restart',async()=>{
 const f=await fixture({expired:true});try{
  assert.equal(f.broker().configured,true);
  const result=await f.broker().handle(request());assert.equal(result.status,200);assert.equal(result.headers.get('cache-control'),'no-store');assert.equal(result.headers.get('pragma'),'no-cache');
  const token=await result.json();assert.deepEqual(Object.keys(token).sort(),['accessToken','expiresAt']);assert.equal(token.accessToken,'synthetic-access-1');assert(Date.parse(token.expiresAt)>Date.now());assert.equal(f.refreshes(),1);
  const stored=await readMiroMcpCredentials(f.path);assert.equal(stored.tokens.refresh_token,'synthetic-refresh-1');assert(Number.isFinite(Date.parse(stored.tokensSavedAt)));
  f.restart();assert.deepEqual(await (await f.broker().handle(request())).json(),token);assert.equal(f.refreshes(),1);
 }finally{await f.cleanup();}
});
test('unknown token age serves only access then concurrent forced refreshes share one rotation',async()=>{
 const f=await fixture({unknownAge:true});try{
  const initial=await (await f.broker().handle(request())).json();assert.deepEqual(initial,{accessToken:'synthetic-old-access',expiresAt:null});assert.equal(f.refreshes(),0);
  const results=await Promise.all(Array.from({length:4},()=>f.broker().handle(request({forceRefresh:true,rejectedAccessToken:initial.accessToken})).then(r=>r.json())));
  assert(results.every(r=>r.accessToken==='synthetic-access-1'));assert.equal(f.refreshes(),1);
  assert.deepEqual(await (await f.broker().handle(request({forceRefresh:true,rejectedAccessToken:initial.accessToken}))).json(),results[0]);assert.equal(f.refreshes(),1);
 }finally{await f.cleanup();}
});
test('two workers use broker access only, refresh once on401 and read official MCP directly',async()=>{
 const f=await fixture({unknownAge:true});try{
  f.rejectOld();assert.equal(f.workerConfig.configured,true);assert.equal(f.workerConfig.refreshToken,'');assert.equal(f.workerConfig.clientSecret,'');
  const workers=[createMiroMcpClient({config:f.workerConfig,fetchImpl:f.fetchImpl}),createMiroMcpClient({config:f.workerConfig,fetchImpl:f.fetchImpl})];
  const result=await Promise.all(workers.map(w=>w.callTool('canvas_search',{miro_url:'https://miro.com/app/board/fixture/'})));
  assert(result.every(r=>r.content[0].text==='Synthetic source content'));assert.equal(f.refreshes(),1);
  assert(f.calls.some(c=>c.url===brokerUrl));assert(f.calls.some(c=>c.url===MIRO_MCP_ENDPOINT&&c.method==='POST'));
  assert(f.calls.filter(c=>c.url===brokerUrl).every(c=>c.authorization===`Bearer ${secret}`));
  assert(f.calls.filter(c=>c.url.startsWith(MIRO_MCP_ENDPOINT)).every(c=>c.authorization!==`Bearer ${secret}`));
 }finally{await f.cleanup();}
});
test('persistent401 retries at most once per operation and hides private upstream error',async()=>{
 const f=await fixture({unknownAge:true});try{
  f.alwaysReject();const worker=createMiroMcpClient({config:f.workerConfig,fetchImpl:f.fetchImpl});
  await assert.rejects(worker.callTool('canvas_search',{}),error=>['auth_required','mcp_upstream_error'].includes(error.code)&&!String(error).includes('Private upstream'));
  assert.equal(f.refreshes(),1);assert.equal(f.calls.filter(c=>c.url===brokerUrl).length,2);
 }finally{await f.cleanup();}
});
test('broker requires its own bearer; cookies and cross-site origins confer no authority',async()=>{
 const f=await fixture();try{
  for(const headers of [{},{Cookie:'site-session=valid',Origin:'https://web.fixture.test'},{Authorization:'Bearer wrong-secret',Cookie:'site-session=valid'}]){
   const result=await f.broker().handle(request({},{headers}));assert.equal(result.status,403);assert.equal(result.headers.get('cache-control'),'no-store');assert.deepEqual(await result.json(),{error:'forbidden'});
  }
  const method=await f.broker().handle(new Request(brokerUrl,{headers:{Authorization:`Bearer ${secret}`}}));assert.equal(method.status,405);
  for(const body of [{forceRefresh:'true'},{forceRefresh:true},{rejectedAccessToken:'forged'},[],{secret:'forged'}])assert.equal((await f.broker().handle(request(body))).status,400);
  const large=await f.broker().handle(new Request(brokerUrl,{method:'POST',headers:{Authorization:`Bearer ${secret}`},body:'x'.repeat(65537)}));assert.equal(large.status,400);assert.equal(f.refreshes(),0);
  const disabled=createMiroTokenBroker({env:{MIRO_BOARD_IDS:'fixture'},fetchImpl:f.fetchImpl});assert.equal(disabled.configured,false);assert.equal((await disabled.handle(request())).status,503);
 }finally{await f.cleanup();}
});
test('broker clients reject wrong URLs, redirects, extra credential fields and oversized responses',async()=>{
 const valid=readMiroMcpConfig({MIRO_BOARD_IDS:'fixture',MIRO_MCP_TOKEN_BROKER_URL:brokerUrl,MIRO_TOKEN_BROKER_SECRET:secret});
 for(const url of ['http://web.fixture.test/internal/miro/token','https://name:password@web.fixture.test/internal/miro/token','https://web.fixture.test/other','https://web.fixture.test/internal/miro/token?next=evil','https://web.fixture.test/internal/miro/token#x']){
  let calls=0;await assert.rejects(requestMiroBrokerToken({config:{...valid,tokenBrokerUrl:url},fetchImpl:async()=>{calls++;}}),{code:'token_broker_unavailable'});assert.equal(calls,0);
  assert.equal(readMiroMcpConfig({MIRO_BOARD_IDS:'fixture',MIRO_MCP_TOKEN_BROKER_URL:url,MIRO_TOKEN_BROKER_SECRET:secret}).configured,false);
 }
 for(const make of [()=>new Response(null,{status:302,headers:{Location:'https://evil.test/'}}),()=>Response.json({accessToken:'synthetic',expiresAt:null,refreshToken:'private'}),()=>new Response('x'.repeat(65537)),()=>Response.json({accessToken:'synthetic',expiresAt:'2000-01-01T00:00:00Z'})]){
  await assert.rejects(requestMiroBrokerToken({config:valid,fetchImpl:async(url,init)=>{assert.equal(url,brokerUrl);assert.equal(init.redirect,'error');return make();}}),{code:'token_broker_unavailable'});
 }
 for(const patch of [{MIRO_MCP_REFRESH_TOKEN:'synthetic',MIRO_MCP_CLIENT_ID:'client'},{MIRO_MCP_ACCESS_TOKEN:'synthetic'},{MIRO_MCP_AUTH_FILE:'/tmp/synthetic-auth.json'},{MIRO_MCP_PERSIST_AUTH:'true'}])assert.equal(readMiroMcpConfig({MIRO_BOARD_IDS:'fixture',MIRO_MCP_TOKEN_BROKER_URL:brokerUrl,MIRO_TOKEN_BROKER_SECRET:secret,...patch}).configured,false);
});
test('broker lock cancellation and upstream failures return bounded safe errors',async()=>{
 const f=await fixture({expired:true});let release;try{
  release=await acquireMiroMcpAuthLock(f.path);const controller=new AbortController(),work=f.broker().handle(request({},{signal:controller.signal}));controller.abort();const result=await work;assert([400,503].includes(result.status));assert.equal(result.headers.get('cache-control'),'no-store');await release();release=undefined;
  const bad=createMiroTokenBroker({env:f.env,fetchImpl:async()=>{throw Error('PRIVATE_REFRESH_TOKEN');}});const failed=await bad.handle(request());assert.equal(failed.status,503);assert.equal(await failed.text(),'{"error":"unavailable"}');
 }finally{await release?.();await f.cleanup();}
});
test('OAuth discovery cannot send refresh credentials to a foreign authorization server',async()=>{
 const f=await fixture({expired:true});try{
  const origins=[],broker=createMiroTokenBroker({env:f.env,fetchImpl:async(input)=>{
   const url=new URL(input);origins.push(url.origin);
   return Response.json({resource:MIRO_MCP_ENDPOINT,authorization_servers:['https://evil.fixture.test/']});
  }});
  const result=await broker.handle(request());assert.equal(result.status,503);assert(origins.length>0);assert(origins.every(origin=>origin==='https://mcp.miro.com'));
  assert.equal(await result.text(),'{"error":"unavailable"}');
 }finally{await f.cleanup();}
});
