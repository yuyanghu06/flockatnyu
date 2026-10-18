import test from 'node:test';
import assert from 'node:assert/strict';
import {createMiroMcpClient} from '../server/miro/mcp-client.js';
import {readMiroMcpConfig} from '../server/miro/mcp-config.js';
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function fixture(){
 const entered=deferred(),release=deferred(),calls=[];
 let first=true,finishedFirst=false;
 const config=readMiroMcpConfig({MIRO_BOARD_IDS:'fixture',MIRO_MCP_ACCESS_TOKEN:'synthetic-token',MIRO_MCP_REQUEST_TIMEOUT_MS:'3000'});
 const client=createMiroMcpClient({config,fetchImpl:async(input,init={})=>{
  assert.equal(new URL(input).origin,'https://mcp.miro.com');
  if(init.method==='GET')return new Response(null,{status:405});if(init.method==='DELETE')return new Response(null,{status:204});
  const rpc=JSON.parse(init.body);if(rpc.id===undefined)return new Response(null,{status:202});
  let result;
  if(rpc.method==='initialize')result={protocolVersion:'2025-11-25',capabilities:{tools:{}},serverInfo:{name:'fixture',version:'1'}};
  else {
   const label=rpc.params.arguments.label;calls.push(label);
   if(first){first=false;entered.resolve();await new Promise((resolve,reject)=>{
    const abort=()=>{init.signal.removeEventListener('abort',abort);reject(init.signal.reason);};
    init.signal.addEventListener('abort',abort,{once:true});release.promise.then(()=>{init.signal.removeEventListener('abort',abort);resolve();});
   });finishedFirst=true;}
   result={content:[{type:'text',text:label}],...(label==='failed'?{isError:true}:{})};
  }
  return Response.json({jsonrpc:'2.0',id:rpc.id,result});
 }});
 return {client,calls,entered:entered.promise,release:release.resolve,finishedFirst:()=>finishedFirst};
}
test('queued cancellation rejects promptly without releasing predecessor or reordering survivors',async()=>{
 const f=fixture(),first=f.client.callTool('canvas_search',{label:'first'});await f.entered;
 const controller=new AbortController(),middle=f.client.callTool('canvas_search',{label:'cancelled'},{signal:controller.signal}),last=f.client.callTool('canvas_search',{label:'last'});
 const rejected=assert.rejects(middle,{code:'aborted'});controller.abort();
 assert.equal(await Promise.race([rejected.then(()=>true),pause(100).then(()=>false)]),true);
 assert.equal(f.finishedFirst(),false);assert.deepEqual(f.calls,['first']);
 f.release();assert.equal((await first).content[0].text,'first');assert.equal((await last).content[0].text,'last');assert.deepEqual(f.calls,['first','last']);
});
test('queue is capped at64 waiting operations and aborted waiters immediately restore capacity',async()=>{
 const f=fixture(),first=f.client.callTool('canvas_search',{label:'first'});await f.entered;
 const controllers=Array.from({length:64},()=>new AbortController()),queued=controllers.map((c,i)=>f.client.callTool('canvas_search',{label:`cancelled-${i}`},{signal:c.signal})),handled=queued.map(p=>assert.rejects(p,{code:'aborted'}));
 await assert.rejects(f.client.callTool('canvas_search',{label:'overflow'}),{code:'queue_full'});
 controllers.forEach(c=>c.abort());await Promise.all(handled);
 const survivor=f.client.callTool('canvas_search',{label:'survivor'});await pause(10);assert.deepEqual(f.calls,['first']);
 f.release();await first;await survivor;assert.deepEqual(f.calls,['first','survivor']);
});
test('active abort and action error release the queue for the next operation',async()=>{
 const f=fixture(),controller=new AbortController(),first=f.client.callTool('canvas_search',{label:'first'},{signal:controller.signal});await f.entered;
 const failed=f.client.callTool('canvas_search',{label:'failed'}),last=f.client.callTool('canvas_search',{label:'last'});
 const failedCheck=assert.rejects(failed,{code:'tool_result_error'}),firstCheck=assert.rejects(first,{code:'aborted'});controller.abort();await firstCheck;await failedCheck;
 assert.equal((await last).content[0].text,'last');assert.deepEqual(f.calls,['first','failed','last']);f.release();
});
test('queued abort listeners are removed and pre-aborted or forbidden calls do not enter queue',async()=>{
 const f=fixture(),first=f.client.callTool('canvas_search',{label:'first'});await f.entered;
 const controller=new AbortController(),signal=controller.signal,add=signal.addEventListener.bind(signal),remove=signal.removeEventListener.bind(signal),listeners=new Set();
 signal.addEventListener=(type,fn,options)=>{if(type==='abort')listeners.add(fn);return add(type,fn,options);};
 signal.removeEventListener=(type,fn,options)=>{if(type==='abort')listeners.delete(fn);return remove(type,fn,options);};
 const queued=f.client.callTool('canvas_search',{label:'queued'},{signal}),check=assert.rejects(queued,{code:'aborted'});controller.abort();await check;assert.equal(listeners.size,0);
 await assert.rejects(f.client.callTool('canvas_search',{label:'pre-aborted'},{signal}),{code:'aborted'});
 await assert.rejects(f.client.callTool('table_sync_rows',{}),{code:'tool_not_allowed'});await assert.rejects(f.client.callTool('canvas_search',null),{code:'invalid_arguments'});
 f.release();await first;assert.deepEqual(f.calls,['first']);
});
