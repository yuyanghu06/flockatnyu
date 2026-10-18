import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createMiroMcpQuota,isMiroDailyQuotaError} from '../server/miro/quota.js';
import {createMiroMcpClient} from '../server/miro/mcp-client.js';
import {readMiroMcpConfig} from '../server/miro/mcp-config.js';
import {createMiroMcpTools} from '../tools/miro/mcp.js';
import {MiroMcpError} from '../server/miro/mcp-auth.js';

// A shared store with independent snapshots and an atomic compare-and-swap.
// Every governor instance below sees the same persisted data after restart.
function fixture(instant='2026-10-18T00:00:00.000Z') {
 let clock=Date.parse(instant),state=null,gets=0,writes=0;
 const store={getState:async()=>{gets++;return structuredClone(state);},casState:async(key,expected,next)=>{
  await Promise.resolve();if(JSON.stringify(state)!==JSON.stringify(expected))return false;
  state=structuredClone(next);writes++;return true;
 }};
 const now=()=>clock;
 return {store,now,governor:()=>createMiroMcpQuota({store,now}),setTime:value=>{clock=Date.parse(value);},
  state:()=>structuredClone(state),replace:value=>{state=structuredClone(value);},counts:()=>({gets,writes})};
}
const rejects=(promise,code)=>assert.rejects(promise,error=>error instanceof MiroMcpError&&error.code===code&&error.message===code);
const quotaText='Your organization has reached its daily Miro MCP tool call limit of 100 calls on the Free plan. The limit resets tomorrow. Private link https://private.invalid/token';

function clientFixture({store,now,result,lane='chat'}={}) {
 const calls=[];
 const config=readMiroMcpConfig({NODE_ENV:'production',MIRO_MCP_BUDGET_ENABLED:'true',MIRO_BOARD_IDS:'fixture',MIRO_MCP_ACCESS_TOKEN:'synthetic-token',MIRO_MCP_REQUEST_TIMEOUT_MS:'3000'});
 const client=createMiroMcpClient({config,quotaStore:store,now,lane,fetchImpl:async(input,init={})=>{
  assert.equal(new URL(input).origin,'https://mcp.miro.com');
  if(init.method==='GET')return new Response(null,{status:405});
  if(init.method==='DELETE')return new Response(null,{status:204});
  const rpc=JSON.parse(init.body);if(rpc.id===undefined)return new Response(null,{status:202});
  let payload;
  if(rpc.method==='initialize')payload={protocolVersion:'2025-11-25',capabilities:{tools:{}},serverInfo:{name:'synthetic',version:'1'}};
  else if(rpc.method==='tools/list')payload={tools:[]};
  else {assert.equal(rpc.method,'tools/call');calls.push(rpc.params);payload=typeof result==='function'?result(calls.length):result??{content:[{type:'text',text:'synthetic'}]};}
  return Response.json({jsonrpc:'2.0',id:rpc.id,result:payload});
 }});
 return {client,calls};
}

test('independent governors and restarted processes share the exact 80-call daily ceiling',async()=>{
 const f=fixture();for(let i=0;i<80;i++)await f.governor().reserve({lane:'chat'});
 assert.equal(f.state().total,80);await rejects(f.governor().reserve({lane:'chat'}),'budget_exhausted');assert.equal(f.state().total,80);
});

test('twenty simultaneous independent instances cannot consume the last daily slot twice',async()=>{
 const f=fixture(),seed=f.governor();for(let i=0;i<79;i++)await seed.reserve({lane:'chat'});
 const results=await Promise.allSettled(Array.from({length:20},()=>f.governor().reserve({lane:'chat'})));
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(f.state().total,80);
 assert(results.filter(r=>r.status==='rejected').every(r=>r.reason instanceof MiroMcpError));
});

test('four background sessions consume at most48 calls and leave32 shared slots for chat',async()=>{
 const f=fixture(),quota=f.governor();for(let session=0;session<4;session++){
  f.setTime(`2026-10-18T${String(session*6).padStart(2,'0')}:00:00.000Z`);const sessionId=randomUUID();
  for(let call=0;call<12;call++)await quota.reserve({lane:'background',sessionId});
 }
 assert.equal(f.state().background,48);assert.equal(f.state().total,48);
 await rejects(quota.reserve({lane:'background',sessionId:randomUUID()}),'budget_exhausted');
 for(let call=0;call<32;call++)await f.governor().reserve({lane:'chat'});
 assert.equal(f.state().total,80);await rejects(quota.reserve({lane:'chat'}),'budget_exhausted');
});

test('session allowance and six-hour cadence survive governor reconstruction',async()=>{
 const f=fixture(),sessionId=randomUUID();for(let i=0;i<12;i++)await f.governor().reserve({lane:'background',sessionId});
 await rejects(f.governor().reserve({lane:'background',sessionId}),'reconciliation_deferred');
 await rejects(f.governor().reserve({lane:'background',sessionId:randomUUID()}),'reconciliation_deferred');
 f.setTime('2026-10-18T05:59:59.999Z');await rejects(f.governor().reserve({lane:'background',sessionId:randomUUID()}),'reconciliation_deferred');
 f.setTime('2026-10-18T06:00:00.000Z');await f.governor().reserve({lane:'background',sessionId:randomUUID()});assert.equal(f.state().total,13);
});

test('a background session expires at600seconds even when its calls remain',async()=>{
 const f=fixture(),sessionId=randomUUID();await f.governor().reserve({lane:'background',sessionId});
 f.setTime('2026-10-18T00:09:59.999Z');await f.governor().reserve({lane:'background',sessionId});
 f.setTime('2026-10-18T00:10:00.000Z');await rejects(f.governor().reserve({lane:'background',sessionId}),'reconciliation_deferred');assert.equal(f.state().total,2);
});

test('midnight resets daily counts and cooldown but preserves the background cadence',async()=>{
 const f=fixture('2026-10-18T23:59:59.000Z'),sessionId=randomUUID(),quota=f.governor();
 await quota.reserve({lane:'background',sessionId});assert.equal(await quota.markExhausted({}),'2026-10-19T00:00:00.000Z');
 await rejects(f.governor().reserve({lane:'chat'}),'quota_exhausted');
 f.setTime('2026-10-19T00:00:00.000Z');await quota.reserve({lane:'chat'});assert.equal(f.state().total,1);assert.equal(f.state().background,0);assert.equal(f.state().blockedUntil,null);
 await rejects(f.governor().reserve({lane:'background',sessionId:randomUUID()}),'reconciliation_deferred');
});

test('an explicit quota cooldown persists across instances without incrementing counters',async()=>{
 const f=fixture('2026-10-18T20:00:00.000Z');await f.governor().reserve({lane:'chat'});await f.governor().markExhausted({});
 await rejects(f.governor().reserve({lane:'chat'}),'quota_exhausted');assert.equal(f.state().total,1);
 assert.equal(f.state().blockedUntil,'2026-10-19T00:00:00.000Z');
});

test('malformed, unexpected, future-dated and invalid-counter persisted states fail closed',async()=>{
 const base=fixture();await base.governor().reserve({lane:'chat'});const valid=base.state();
 for(const state of [undefined,{},[],{...valid,unexpected:'private'}, {...valid,total:-1},{...valid,total:81},{...valid,total:'1'},
  {...valid,background:2},{...valid,blockedUntil:'2026-10-20T00:00:00.000Z'}, {...valid,day:'2026-10-19'},
  {...valid,lastBackgroundAt:'2026-10-18T00:00:01.000Z'}, {...valid,session:{id:randomUUID(),startedAt:null,calls:1}}]){
  const f=fixture();f.replace(state);await rejects(f.governor().reserve({lane:'chat'}),'quota_state_unavailable');assert.equal(f.counts().writes,0);
 }
});

test('store failures and perpetual CAS contention expose no private error and never grant a reservation',async()=>{
 for(const store of [{getState:async()=>{throw Error('PRIVATE_STATE_CANARY');}},
  {getState:async()=>null,casState:async()=>{throw Error('PRIVATE_CAS_CANARY');}},
  {getState:async()=>null,casState:async()=>false}, {getState:async()=>null,casState:async()=>undefined}]){
  await rejects(createMiroMcpQuota({store,now:()=>Date.parse('2026-10-18T00:00:00Z')}).reserve({lane:'chat'}),'quota_state_unavailable');
 }
});

test('pre-aborted and mid-read aborts fail closed before any CAS write',async()=>{
 const f=fixture(),pre=new AbortController();pre.abort();await rejects(f.governor().reserve({signal:pre.signal}),'aborted');assert.deepEqual(f.counts(),{gets:0,writes:0});
 const controller=new AbortController();let writes=0;
 const quota=createMiroMcpQuota({store:{getState:async()=>{controller.abort();return null;},casState:async()=>{writes++;return true;}}});
 await rejects(quota.reserve({signal:controller.signal}),'aborted');assert.equal(writes,0);
});

test('successful board text and ordinary upstream errors never establish daily exhaustion',()=>{
 assert.equal(isMiroDailyQuotaError({isError:true,content:[{type:'text',text:quotaText}]}),true);
 for(const result of [{content:[{type:'text',text:quotaText}]},{isError:false,content:[{type:'text',text:quotaText}]},
  {isError:true,content:[{type:'text',text:'Request rate limited; retry soon.'}]}, {isError:'true',content:[{type:'text',text:quotaText}]}])assert.equal(isMiroDailyQuotaError(result),false);
});

test('client reserves every actual content call, while tools/list and rejected arguments are free',async()=>{
 const f=fixture(),g=clientFixture({...f});await g.client.listTools();assert.equal(f.state(),null);
 await rejects(g.client.callTool('table_sync_rows',{}),'tool_not_allowed');await rejects(g.client.callTool('canvas_search',null),'invalid_arguments');
 await g.client.callTool('canvas_search',{});await g.client.callTool('canvas_read_as_svg',{});
 assert.equal(g.calls.length,2);assert.equal(f.state().total,2);
});

test('explicit upstream exhaustion sends only once, safely persists cooldown and blocks another process',async()=>{
 const f=fixture(),g=clientFixture({...f,result:{isError:true,content:[{type:'text',text:quotaText}]}});
 await assert.rejects(g.client.callTool('canvas_search',{}),e=>e.code==='quota_exhausted'&&e.retryAt==='2026-10-19T00:00:00.000Z'&&!JSON.stringify(e).includes('private.invalid'));
 const other=clientFixture({...f});await rejects(other.client.callTool('canvas_search',{}),'quota_exhausted');assert.equal(g.calls.length,1);assert.equal(other.calls.length,0);assert.equal(f.state().total,1);
});

test('quota-like successful text remains usable and does not block following client reads',async()=>{
 const f=fixture(),g=clientFixture({...f,result:{content:[{type:'text',text:quotaText}]}});
 assert.equal((await g.client.callTool('canvas_search',{})).content[0].text,quotaText);
 await g.client.callTool('canvas_search',{});assert.equal(g.calls.length,2);assert.equal(f.state().blockedUntil,null);
});

test('budget denial and unavailable state never send tools/call to upstream',async()=>{
 const f=fixture();for(let i=0;i<80;i++)await f.governor().reserve({});const g=clientFixture({...f});await rejects(g.client.callTool('canvas_search',{}),'budget_exhausted');assert.equal(g.calls.length,0);
 const bad=clientFixture({store:{getState:async()=>{throw Error('PRIVATE_UNAVAILABLE');}}});await rejects(bad.client.callTool('canvas_search',{}),'quota_state_unavailable');assert.equal(bad.calls.length,0);
});

test('board authorization and metadata catalogue never consume budget; fragment refetches each count',async()=>{
 const f=fixture(),boardId='fixture',sourceId='10000000-0000-4000-8000-000000000001',principal={allowedSourceIds:[sourceId]};
 const svg='<svg><g data-miro-id="300" data-type="sticky_note"><text>'+'x'.repeat(40000)+'</text></g></svg>';
 const g=clientFixture({...f,result:{structuredContent:{success:true,miro_url:'https://miro.com/app/board/fixture/',svg,item_count:1,skipped_count:0}}});
 const tools=createMiroMcpTools({config:{configured:true,boardIds:[boardId],teamId:'team'},client:g.client,store:{configured:true,authorizedBoard:async()=>({status:'ready',data:{board_id:boardId,source_id:sourceId,team_id:'team'}})}});
 const execute=(name,args,p=principal)=>tools.execute({name,arguments:args,principal:p});
 assert.equal((await execute('list_miro_boards',{})).status,'ready');assert.equal(g.calls.length,0);assert.equal(f.state(),null);
 assert.equal((await execute('read_miro_board',{boardId},{allowedSourceIds:[]})).status,'forbidden');assert.equal(f.state(),null);
 const args={boardId,itemId:'300',type:'canvas'},first=await execute('read_miro_item',args);assert.equal(first.status,'partial');
 const second=await execute('read_miro_item',{...args,offset:first.boardContext.nextOffset,expectedHash:first.boardContext.hash});assert(['ready','partial'].includes(second.status));
 assert.equal(g.calls.length,2);assert.equal(f.state().total,2);
});

test('simultaneous worker starts admit one background session and cannot bypass cadence',async()=>{
 const f=fixture();const results=await Promise.allSettled(Array.from({length:20},()=>f.governor().reserve({lane:'background',sessionId:randomUUID()})));
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(f.state().background,1);
 assert(results.filter(r=>r.status==='rejected').every(r=>r.reason.code==='reconciliation_deferred'));
});

test('concurrent last-slot background reads cannot exceed the per-session allowance',async()=>{
 const f=fixture(),sessionId=randomUUID();for(let i=0;i<11;i++)await f.governor().reserve({lane:'background',sessionId});
 const results=await Promise.allSettled(Array.from({length:20},()=>f.governor().reserve({lane:'background',sessionId})));
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(f.state().session.calls,12);assert.equal(f.state().background,12);
});

test('cancellation while a store commits never sends a tool call or refunds a possibly committed slot',async()=>{
 const f=fixture(),controller=new AbortController();
 const store={...f.store,casState:async(...args)=>{const result=await f.store.casState(...args);controller.abort();return result;}};
 const g=clientFixture({store,now:f.now});await rejects(g.client.callTool('canvas_search',{},{signal:controller.signal}),'aborted');
 assert.equal(g.calls.length,0);assert.equal(f.state().total,1);
});

function brokerReplayFixture(f) {
 const brokerUrl='https://web.fixture.test/internal/miro/token',secret='synthetic-secret-'.repeat(3);let sends=0,tokens=0;
 const config=readMiroMcpConfig({NODE_ENV:'production',MIRO_BOARD_IDS:'fixture',MIRO_MCP_TOKEN_BROKER_URL:brokerUrl,MIRO_TOKEN_BROKER_SECRET:secret,MIRO_MCP_REQUEST_TIMEOUT_MS:'3000'});
 const client=createMiroMcpClient({config,quotaStore:f.store,now:f.now,fetchImpl:async(input,init={})=>{
  if(String(input)===brokerUrl){tokens++;return Response.json({accessToken:'synthetic-token-'+tokens,expiresAt:null});}
  assert.equal(new URL(input).origin,'https://mcp.miro.com');
  if(init.method==='GET')return new Response(null,{status:405});if(init.method==='DELETE')return new Response(null,{status:204});
  const rpc=JSON.parse(init.body);if(rpc.id===undefined)return new Response(null,{status:202});
  if(rpc.method==='tools/call'){sends++;if(sends===1)return new Response('Synthetic token expired',{status:401});}
  const result=rpc.method==='initialize'?{protocolVersion:'2025-11-25',capabilities:{tools:{}},serverInfo:{name:'synthetic',version:'1'}}:{content:[{type:'text',text:'Synthetic source'}]};
  return Response.json({jsonrpc:'2.0',id:rpc.id,result});
 }});
 return {client,counts:()=>({sends,tokens})};
}

test('broker401 replay reserves separately for every physical tools/call attempt',async()=>{
 const f=fixture(),g=brokerReplayFixture(f);await g.client.callTool('canvas_search',{});
 assert.deepEqual(g.counts(),{sends:2,tokens:2});assert.equal(f.state().total,2);
});

test('broker401 consumes the final slot and prevents an unbudgeted retry',async()=>{
 const f=fixture();for(let i=0;i<79;i++)await f.governor().reserve({lane:'chat'});const g=brokerReplayFixture(f);
 await rejects(g.client.callTool('canvas_search',{}),'budget_exhausted');
 assert.equal(g.counts().sends,1);assert.equal(f.state().total,80);
});

function nativeReplayFixture(f) {
 const authFile=join(tmpdir(),'miro-quota-native-'+randomUUID()+'.json');let sends=0,refreshes=0;
 const config=readMiroMcpConfig({NODE_ENV:'production',MIRO_BOARD_IDS:'fixture',MIRO_MCP_ACCESS_TOKEN:'synthetic-old',MIRO_MCP_REFRESH_TOKEN:'synthetic-refresh',MIRO_MCP_CLIENT_ID:'synthetic-client',MIRO_MCP_AUTH_FILE:authFile,MIRO_MCP_REQUEST_TIMEOUT_MS:'3000'});
 const client=createMiroMcpClient({config,quotaStore:f.store,now:f.now,fetchImpl:async(input,init={})=>{
  const url=new URL(input);assert.equal(url.origin,'https://mcp.miro.com');
  if(url.pathname.startsWith('/.well-known/oauth-protected-resource'))return Response.json({resource:'https://mcp.miro.com/',authorization_servers:['https://mcp.miro.com/'],scopes_supported:['boards:read']});
  if(url.pathname.startsWith('/.well-known/'))return Response.json({issuer:'https://mcp.miro.com/',authorization_endpoint:'https://mcp.miro.com/authorize',token_endpoint:'https://mcp.miro.com/token',response_types_supported:['code'],grant_types_supported:['refresh_token'],token_endpoint_auth_methods_supported:['none']});
  if(url.pathname==='/token'){refreshes++;return Response.json({access_token:'synthetic-new',refresh_token:'synthetic-refresh-new',token_type:'Bearer',expires_in:3600,scope:'boards:read'});}
  if(init.method==='GET')return new Response(null,{status:405});if(init.method==='DELETE')return new Response(null,{status:204});
  const rpc=JSON.parse(init.body);if(rpc.id===undefined)return new Response(null,{status:202});
  if(rpc.method==='tools/call'){sends++;if(sends===1)return new Response('Synthetic expired token',{status:401});}
  const result=rpc.method==='initialize'?{protocolVersion:'2025-11-25',capabilities:{tools:{}},serverInfo:{name:'synthetic',version:'1'}}:{content:[{type:'text',text:'Synthetic source'}]};
  return Response.json({jsonrpc:'2.0',id:rpc.id,result});
 }});
 return {client,counts:()=>({sends,refreshes}),cleanup:async()=>{await rm(authFile,{force:true});await rm(authFile+'.lock',{force:true});}};
}

test('native OAuth SDK401 replay also reserves each physical tools/call attempt',async()=>{
 const f=fixture(),g=nativeReplayFixture(f);try {
  await g.client.callTool('canvas_search',{});assert.deepEqual(g.counts(),{sends:2,refreshes:1});assert.equal(f.state().total,2);
 }finally {await g.cleanup();}
});

test('native OAuth SDK replay cannot exceed the final reserved daily slot',async()=>{
 const f=fixture();for(let i=0;i<79;i++)await f.governor().reserve({lane:'chat'});const g=nativeReplayFixture(f);try {
  await rejects(g.client.callTool('canvas_search',{}),'budget_exhausted');assert.equal(g.counts().sends,1);assert.equal(f.state().total,80);
 }finally {await g.cleanup();}
});
