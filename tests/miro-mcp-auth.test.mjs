import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,chmod,stat,symlink,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createMiroMcpClient} from '../server/miro/mcp-client.js';
import {readMiroMcpConfig,MIRO_MCP_ENDPOINT} from '../server/miro/mcp-config.js';
import {readMiroMcpCredentials,saveMiroMcpCredentials,createMiroMcpOAuthProvider,createBoundedMiroMcpFetch,acquireMiroMcpAuthLock} from '../server/miro/mcp-auth.js';
const config=(patch={})=>({...readMiroMcpConfig({MIRO_BOARD_IDS:'fixture',MIRO_MCP_ACCESS_TOKEN:'synthetic-token'}),requestTimeoutMs:1000,...patch});
function rpcFetch({error=false,toolError=false,huge=false,hang=false}={}){
 const calls=[];const fetchImpl=async(input,init={})=>{
 assert.equal(new URL(input).origin,'https://mcp.miro.com');assert.equal(init.redirect,'error');
 if(init.method==='GET')return new Response(null,{status:405});
 if(init.method==='DELETE')return new Response(null,{status:204});
 const request=JSON.parse(init.body);calls.push(request);
 if(request.id===undefined)return new Response(null,{status:202});
 if(hang&&request.method==='tools/call')return new Promise((_resolve,reject)=>{init.signal.addEventListener('abort',()=>reject(init.signal.reason),{once:true});});
 const result=request.method==='initialize'?{protocolVersion:'2025-11-25',capabilities:{tools:{}},serverInfo:{name:'fixture',version:'1'}}:request.method==='tools/list'?{tools:[{name:'canvas_search',inputSchema:{type:'object'}},{name:'table_sync_rows',inputSchema:{type:'object'}}]}:{content:[{type:'text',text:huge?'x'.repeat(5000):'Synthetic fixture'}],...(toolError?{isError:true}:{})};
 return Response.json(error&&request.method==='tools/call'?{jsonrpc:'2.0',id:request.id,error:{code:-32603,message:'PRIVATE_UPSTREAM_BODY'}}:{jsonrpc:'2.0',id:request.id,result});
 };return {calls,fetchImpl};
}
test('SDK initializes read-only transport, filters tool listing, rejects mutation methods before network',async()=>{
 const f=rpcFetch();const client=createMiroMcpClient({config:config(),fetchImpl:f.fetchImpl});
 await assert.rejects(client.callTool('table_sync_rows',{}),{code:'tool_not_allowed'});assert.equal(f.calls.length,0);
 assert.deepEqual((await client.listTools()).tools.map(t=>t.name),['canvas_search']);
 assert.equal((await client.callTool('canvas_search',{miro_url:'https://miro.com/app/board/fixture/',result_mode:'overview',is_repository:false})).content[0].text,'Synthetic fixture');
 assert.equal(f.calls.filter(c=>c.method==='initialize').length,2);assert.equal(f.calls.find(c=>c.method==='tools/call').params.name,'canvas_search');
});
test('SDK redacts remote errors, propagates safe tool errors, bounds response bytes and cancels operations',async()=>{
 for(const [options,code] of [[{error:true},'mcp_upstream_error'],[{toolError:true},'tool_result_error'],[{huge:true},'response_byte_limit']]){
 const f=rpcFetch(options);const client=createMiroMcpClient({config:config({maxResponseBytes:2048}),fetchImpl:f.fetchImpl});await assert.rejects(client.callTool('canvas_search',{}),error=>error.code===code&&!String(error).includes('PRIVATE_UPSTREAM_BODY'));
 }
 const f=rpcFetch({hang:true}),client=createMiroMcpClient({config:config(),fetchImpl:f.fetchImpl}),abort=new AbortController();const pending=client.callTool('canvas_search',{},{signal:abort.signal});while(!f.calls.some(c=>c.method==='tools/call'))await new Promise(r=>setTimeout(r,1));abort.abort();await assert.rejects(pending,{code:'aborted'});
 const g=rpcFetch();const preAborted=AbortSignal.abort();await assert.rejects(createMiroMcpClient({config:config(),fetchImpl:g.fetchImpl}).callTool('canvas_search',{},{signal:preAborted}),{code:'aborted'});assert.equal(g.calls.length,0);
});
test('bounded fetch forbids endpoint/credential escape, enforces header and streamed limits',async()=>{
 let fetched=0;const bounded=createBoundedMiroMcpFetch({config:config({maxResponseBytes:1024}),fetchImpl:async()=>{fetched++;return new Response('x'.repeat(1100));}});
 for(const url of ['https://evil.test/','https://user:pass@mcp.miro.com/','http://mcp.miro.com/'])await assert.rejects(bounded(url),{code:'endpoint_not_allowed'});assert.equal(fetched,0);await assert.rejects((await bounded(MIRO_MCP_ENDPOINT)).text(),{code:'response_byte_limit'});
 const header=createBoundedMiroMcpFetch({config:config({maxResponseBytes:1024}),fetchImpl:async()=>new Response('x',{headers:{'content-length':'2048'}})});await assert.rejects(header(MIRO_MCP_ENDPOINT),{code:'response_byte_limit'});
});
test('OAuth credential storage remains private, rejects symlinks and broad files, and rereads rotated tokens',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'miro-mcp-fixture-'));try {
 const path=join(dir,'auth.json');await saveMiroMcpCredentials(path,{tokens:{access_token:'synthetic-old',refresh_token:'synthetic-refresh'}});assert.equal((await stat(path)).mode&0o077,0);
 const provider=createMiroMcpOAuthProvider({config:config({accessToken:'',authFile:path})});assert.equal((await provider.tokens()).access_token,'synthetic-old');await saveMiroMcpCredentials(path,{tokens:{access_token:'synthetic-new',refresh_token:'synthetic-rotated'}});assert.equal((await provider.tokens()).refresh_token,'synthetic-rotated');await provider.saveTokens({access_token:'synthetic-final',refresh_token:'synthetic-final-refresh'});assert.equal((await readMiroMcpCredentials(path)).tokens.access_token,'synthetic-final');
 const link=join(dir,'link.json');await symlink(path,link);await assert.rejects(readMiroMcpCredentials(link),{code:'unsafe_auth_file'});await assert.rejects(saveMiroMcpCredentials(link,{}),{code:'unsafe_auth_file'});
 await chmod(path,0o644);await assert.rejects(readMiroMcpCredentials(path),{code:'unsafe_auth_file'});
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('OAuth headless auth denies browser escalation and serializes file locks with cancellation',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'miro-mcp-lock-'));try {
 const path=join(dir,'auth.json'),provider=createMiroMcpOAuthProvider({config:config({authFile:path})});await assert.rejects(provider.redirectToAuthorization(new URL('https://mcp.miro.com/auth')),{code:'auth_required'});assert.throws(()=>provider.codeVerifier(),{code:'pkce_missing'});
 const release=await acquireMiroMcpAuthLock(path);const controller=new AbortController(),pending=acquireMiroMcpAuthLock(path,{signal:controller.signal});controller.abort();await assert.rejects(pending,{code:'aborted'});await release();const release2=await acquireMiroMcpAuthLock(path);await release2();
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('MCP configuration rejects endpoint changes and missing/unsafe board scope without using credentials',()=>{
 assert.equal(readMiroMcpConfig({MIRO_MCP_ACCESS_TOKEN:'synthetic',MIRO_BOARD_IDS:'fixture',MIRO_MCP_ENDPOINT:'https://evil.test/'}).configured,false);
 assert.equal(readMiroMcpConfig({MIRO_MCP_ACCESS_TOKEN:'synthetic',MIRO_BOARD_IDS:'../bad'}).configured,false);
 assert.equal(readMiroMcpConfig({MIRO_MCP_REFRESH_TOKEN:'synthetic',MIRO_BOARD_IDS:'fixture'}).configured,false);
});
