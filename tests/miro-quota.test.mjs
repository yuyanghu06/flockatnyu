import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createMiroMcpQuota, MIRO_QUOTA_KEY, classifyMiroToolError } from '../server/miro/quota.js';
import { createMiroMcpClient } from '../server/miro/mcp-client.js';
import { readMiroMcpConfig } from '../server/miro/mcp-config.js';

const start = Date.parse('2026-10-18T01:00:00.000Z');
const quotaText = 'Your organization has reached its daily Miro MCP tool call limit of 100 calls on the Free plan. PRIVATE_LINK https://private.invalid/account';
const toolResult = (isError = false, text = 'Synthetic original content') => ({ isError, content:[{type:'text',text}] });
function memoryStore(initial = null) {
  let value = initial;
  const calls = [];
  return { calls, read:() => structuredClone(value),
    async getState(key) { assert.equal(key,MIRO_QUOTA_KEY); calls.push('get'); return structuredClone(value); },
    async casState(key, expected, next) { assert.equal(key,MIRO_QUOTA_KEY); calls.push('cas'); if (JSON.stringify(expected) !== JSON.stringify(value)) return false; value = structuredClone(next); return true; },
  };
}
function rpcFixture({ result = () => toolResult(), fail = false, hang = false } = {}) {
  const calls = [];
  const fetchImpl = async (_input, init = {}) => {
    if (init.method === 'GET') return new Response(null,{status:405});
    if (init.method === 'DELETE') return new Response(null,{status:204});
    const request = JSON.parse(init.body); calls.push(request);
    if (request.id === undefined) return new Response(null,{status:202});
    if (request.method === 'tools/call' && hang) return new Promise((_resolve,reject) => {
      if (init.signal.aborted) reject(init.signal.reason);
      else init.signal.addEventListener('abort',() => reject(init.signal.reason),{once:true});
    });
    if (request.method === 'tools/call' && fail) return Response.json({jsonrpc:'2.0',id:request.id,error:{code:-32603,message:'PRIVATE_PROVIDER_ERROR'}});
    const payload = request.method === 'initialize' ? { protocolVersion:'2025-11-25',capabilities:{tools:{}},serverInfo:{name:'fixture',version:'1'} }
      : request.method === 'tools/list' ? {tools:[{name:'canvas_search',inputSchema:{type:'object'}}]} : result();
    return Response.json({jsonrpc:'2.0',id:request.id,result:payload});
  };
  return {fetchImpl,calls,toolCalls:() => calls.filter(call => call.method === 'tools/call').length};
}
const env = {NODE_ENV:'production',MIRO_BOARD_IDS:'synthetic',MIRO_MCP_ACCESS_TOKEN:'synthetic'};
const makeClient = (fixture,store,options = {}) => createMiroMcpClient({env,quotaStore:store,fetchImpl:fixture.fetchImpl,now:() => start,...options});

test('production budgeting defaults on; strict flag validation and dev opt-out preserve construction', () => {
  assert.equal(readMiroMcpConfig(env).budgetEnabled,true);
  assert.equal(readMiroMcpConfig({...env,NODE_ENV:'test'}).budgetEnabled,false);
  assert.equal(readMiroMcpConfig({...env,MIRO_MCP_BUDGET_ENABLED:'false'}).budgetEnabled,false);
  for (const invalid of ['', 'TRUE', '1', false]) assert(readMiroMcpConfig({...env,MIRO_MCP_BUDGET_ENABLED:invalid}).issues.includes('invalid_budget_enabled'));
});

test('independent governor instances reserve atomically and survive restart without extra allowances', async () => {
  const store = memoryStore();
  for (let wave = 0; wave < 10; wave++) {
    const results = await Promise.allSettled(Array.from({length:8}, () => createMiroMcpQuota({store,now:() => start}).reserve({lane:'chat'})));
    assert(results.every(result => result.status === 'fulfilled'));
  }
  assert.equal(store.read().total,80);
  await assert.rejects(createMiroMcpQuota({store,now:() => start}).reserve(),{code:'budget_exhausted',retryAt:'2026-10-19T00:00:00.000Z'});
});

test('background daily and session caps preserve 32 chat calls; cadence spans day rollover', async () => {
  const store = memoryStore(); let current = start;
  const quota = createMiroMcpQuota({store,now:() => current});
  for (let session = 0; session < 4; session++) {
    const sessionId = randomUUID();
    for (let call = 0; call < 12; call++) await quota.reserve({lane:'background',sessionId});
    await assert.rejects(quota.reserve({lane:'background',sessionId}),{code:session === 3 ? 'budget_exhausted':'reconciliation_deferred'});
    if (session !== 3) {
      await assert.rejects(quota.reserve({lane:'background',sessionId:randomUUID()}),{code:'reconciliation_deferred'});
      current += 6*60*60*1000;
    }
  }
  assert.equal(store.read().background,48);
  for (let call = 0; call < 32; call++) await quota.reserve({lane:'chat'});
  assert.equal(store.read().total,80);
  current = Date.parse('2026-10-19T00:00:00.000Z');
  await quota.reserve({lane:'chat'}); assert.equal(store.read().total,1);
  await assert.rejects(quota.reserve({lane:'background',sessionId:randomUUID()}),{code:'reconciliation_deferred',retryAt:'2026-10-19T01:00:00.000Z'});
});

test('client counts actual calls, including repeated fragment reads; discovery and rejected methods are free', async () => {
  const fixture = rpcFixture(), store = memoryStore(), client = makeClient(fixture,store);
  await client.listTools(); assert.equal(store.read(),null);
  await assert.rejects(client.callTool('write_board',{}),{code:'tool_not_allowed'});
  await assert.rejects(client.callTool('canvas_search',{} ,{signal:AbortSignal.abort()}),{code:'aborted'});
  assert.equal(store.read(),null);
  await client.callTool('canvas_read_as_svg',{widget_ids:['fixture']});
  await client.callTool('canvas_read_as_svg',{widget_ids:['fixture']});
  assert.equal(store.read().total,2); assert.equal(fixture.toolCalls(),2);
});

test('failed upstream sends and canceled active requests consume reservations without refunds', async () => {
  const store = memoryStore(), failed = rpcFixture({fail:true});
  await assert.rejects(makeClient(failed,store).callTool('canvas_search',{}),error => error.code === 'mcp_upstream_error' && !String(error).includes('PRIVATE_PROVIDER_ERROR'));
  assert.equal(store.read().total,1);
  const hanging = rpcFixture({hang:true}), abort = new AbortController();
  const pending = makeClient(hanging,store).callTool('canvas_search',{},{signal:abort.signal});
  while (!hanging.toolCalls()) await new Promise(resolve => setTimeout(resolve,1));
  abort.abort(); await assert.rejects(pending,{code:'aborted'}); assert.equal(store.read().total,2);
});

test('explicit quota persists sanitized cooldown across clients and permits first read after UTC reset', async () => {
  const store = memoryStore(), fixture = rpcFixture({result:() => toolResult(true,quotaText)});
  await assert.rejects(makeClient(fixture,store).callTool('canvas_search',{}),error => {
    assert.equal(error.code,'quota_exhausted'); assert.equal(error.retryAt,'2026-10-19T00:00:00.000Z');
    assert(!JSON.stringify(error).includes('PRIVATE_LINK')); assert(!String(error).includes('private.invalid')); return true;
  });
  assert.equal(store.read().blockedUntil,'2026-10-19T00:00:00.000Z');
  const other = rpcFixture();
  await assert.rejects(makeClient(other,store).callTool('canvas_search',{}),{code:'quota_exhausted'}); assert.equal(other.toolCalls(),0);
  const afterReset = makeClient(other,store,{now:() => Date.parse('2026-10-19T00:00:00.000Z')});
  await afterReset.callTool('canvas_search',{}); assert.equal(store.read().total,1); assert.equal(store.read().blockedUntil,null);
});

test('quota classification requires explicit error and daily Miro tool quota words', async () => {
  assert.equal(classifyMiroToolError(toolResult(false,quotaText)),'tool_result_error');
  for (const text of ['429 Too many requests','Daily quota exceeded','Miro tool call limit reached','Miro daily limit reached','Miro daily tool calls remaining'])
    assert.equal(classifyMiroToolError(toolResult(true,text)),'tool_result_error');
  const fixture = rpcFixture({result:() => toolResult(false,quotaText)}), store = memoryStore();
  const response = await makeClient(fixture,store).callTool('canvas_search',{});
  assert.equal(response.content[0].text,quotaText); assert.equal(store.read().blockedUntil,null);
});

test('state failures deny upstream tools; disabled dev mode has no metadata dependency', async () => {
  for (const store of [memoryStore({version:1}),{getState:async () => { throw new Error('PRIVATE_DB'); }},
    {getState:async () => null,casState:async () => false}]) {
    const fixture = rpcFixture();
    await assert.rejects(makeClient(fixture,store).callTool('canvas_search',{}),error => error.code === 'quota_state_unavailable' && !String(error).includes('PRIVATE_DB'));
    assert.equal(fixture.toolCalls(),0);
  }
  const fixture = rpcFixture(), store = memoryStore();
  await makeClient(fixture,store,{env:{...env,NODE_ENV:'test'}}).callTool('canvas_search',{});
  assert.equal(fixture.toolCalls(),1); assert.equal(store.calls.length,0);
});

test('background client needs fresh opaque batch, enforces 12 calls and never lets a new batch evade cadence', async () => {
  const fixture = rpcFixture(), store = memoryStore(), client = makeClient(fixture,store,{lane:'background'});
  await assert.rejects(client.callTool('canvas_search',{}),{code:'reconciliation_deferred'});
  const session = client.beginBackgroundBatch(); assert.match(session,/^[0-9a-f-]{36}$/);
  for (let call = 0; call < 12; call++) await client.callTool('canvas_search',{});
  await assert.rejects(client.callTool('canvas_search',{}),{code:'reconciliation_deferred'});
  assert.notEqual(client.beginBackgroundBatch(),session);
  await assert.rejects(client.callTool('canvas_search',{}),{code:'reconciliation_deferred'});
  assert.equal(fixture.toolCalls(),12); assert.equal(store.read().background,12);
});

test('native SDK OAuth replay reserves each physical call and cannot replay beyond the last slot', async () => {
  for (const seeded of [0,79]) {
    const directory = await mkdtemp(join(tmpdir(),'miro-quota-oauth-'));
    try {
      const store = memoryStore(); let sends = 0, refreshes = 0;
      const governor = createMiroMcpQuota({store,now:() => start});
      for (let call = 0; call < seeded; call++) await governor.reserve();
      const oauthEnv = {...env,MIRO_MCP_REFRESH_TOKEN:'synthetic-refresh',MIRO_MCP_CLIENT_ID:'synthetic-client',MIRO_MCP_AUTH_FILE:join(directory,'auth.json')};
      const client = createMiroMcpClient({env:oauthEnv,quotaStore:store,now:() => start,fetchImpl:async (input,init = {}) => {
        const url = new URL(input);
        assert.equal(url.origin,'https://mcp.miro.com');
        if (url.pathname.startsWith('/.well-known/oauth-protected-resource')) return Response.json({resource:'https://mcp.miro.com/',authorization_servers:['https://mcp.miro.com/'],scopes_supported:['boards:read','openid','email']});
        if (url.pathname.startsWith('/.well-known/')) return Response.json({issuer:'https://mcp.miro.com/',authorization_endpoint:'https://mcp.miro.com/authorize',token_endpoint:'https://mcp.miro.com/token',response_types_supported:['code'],grant_types_supported:['refresh_token'],token_endpoint_auth_methods_supported:['none']});
        if (url.pathname === '/token') {
          refreshes++; return Response.json({access_token:'synthetic-refreshed',refresh_token:'synthetic-rotated',token_type:'Bearer',expires_in:3600,scope:'boards:read'});
        }
        if (init.method === 'GET') return new Response(null,{status:405});
        if (init.method === 'DELETE') return new Response(null,{status:204});
        const rpc = JSON.parse(init.body);
        if (rpc.id === undefined) return new Response(null,{status:202});
        if (rpc.method === 'tools/call' && ++sends === 1) return new Response('Synthetic expired token',{status:401});
        const result = rpc.method === 'initialize' ? {protocolVersion:'2025-11-25',capabilities:{tools:{}},serverInfo:{name:'fixture',version:'1'}} : toolResult();
        return Response.json({jsonrpc:'2.0',id:rpc.id,result});
      }});
      if (seeded) await assert.rejects(client.callTool('canvas_search',{}),{code:'budget_exhausted'});
      else await client.callTool('canvas_search',{});
      assert.equal(sends,seeded ? 1:2); assert.equal(refreshes,1);
      assert.equal(store.read().total,seeded ? 80:2);
    } finally { await rm(directory,{recursive:true,force:true}); }
  }
});
