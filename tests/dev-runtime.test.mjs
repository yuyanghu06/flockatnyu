import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import net from 'node:net';
import { once } from 'node:events';

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function deadline(promise, ms, message){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(message)),ms);})]);}finally{clearTimeout(timer);}}
async function freePort() { const s = net.createServer(); s.listen(0, '127.0.0.1'); await once(s, 'listening'); const p=s.address().port; await new Promise(resolve=>s.close(resolve)); return p; }
const env = port => ({...process.env, PORT:String(port), NODE_ENV:'development', LLM_PROVIDER:'',LLM_MODEL:'',LLM_API_KEY:'',SUPABASE_URL:'',SUPABASE_SERVICE_ROLE_KEY:'',DISCORD_BOT_TOKEN:'',DISCORD_GUILD_ID:'',DEV_ALLOWED_SOURCE_IDS:''});
function launch(apiPort, webPort) { const child=spawn(process.execPath,['scripts/dev.mjs','--port',String(webPort),'--strictPort'],{env:env(apiPort),stdio:['ignore','pipe','pipe']});let output='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b);const exited=once(child,'exit'); return {child,exited,output:()=>output}; }
async function eventually(check, timeout=15000) { const start=Date.now();let last;while(Date.now()-start<timeout){try{const value=await check();if(value)return value;}catch(e){last=e;}await wait(50);}throw new Error('Timed out waiting for runtime: '+(last?.message||'')); }
const request = port => fetch(`http://127.0.0.1:${port}/api/status`,{signal:AbortSignal.timeout(500)});
async function stop(run){if(run.child.exitCode===null&&run.child.signalCode===null){run.child.kill('SIGTERM');try{await deadline(run.exited,7000,'Supervisor did not exit');}catch(error){run.child.kill('SIGKILL');throw error;}}}

test('paired dev starts real API + Vite on explicit independent ports, proxy is honest and SIGTERM releases both',async()=>{
 const api=await freePort(), web=await freePort(),run=launch(api,web);
 try {
  const response=await eventually(async()=>{const r=await request(web);return r.ok?r:null;});const status=await response.json();assert.equal(status.chat.configured,false);assert.equal(status.access.allowed,true);assert.equal((await request(api)).status,200);assert.match(run.output(),/Assistant API ready/);
 } finally {await stop(run);}
 await eventually(async()=>{try{await request(api);return false;}catch{return true;}});await eventually(async()=>{try{await request(web);return false;}catch{return true;}});
});
test('occupied API port fails without replacing or terminating unrelated owner or starting Vite',async()=>{
 const server=createServer((req,res)=>res.end('unrelated-owner'));server.listen(0,'127.0.0.1');await once(server,'listening');const api=server.address().port,web=await freePort(),run=launch(api,web);
 try {const [code]=await deadline(run.exited,10000,'occupied-port startup did not fail');assert.notEqual(code,0);assert.match(run.output(),/already in use/);assert.equal(await(await fetch(`http://127.0.0.1:${api}`)).text(),'unrelated-owner');await assert.rejects(request(web));}
 finally {await stop(run);await new Promise(resolve=>server.close(resolve));}
});
test('Vite startup failure terminates its newly owned API',async()=>{
 const occupied=createServer((req,res)=>res.end('unrelated-web'));occupied.listen(0,'127.0.0.1');await once(occupied,'listening');const api=await freePort(),web=occupied.address().port,run=launch(api,web);
 try {const [code]=await deadline(run.exited,15000,'Vite startup failure did not shut down');assert.notEqual(code,0);await eventually(async()=>{try{await request(api);return false;}catch{return true;}});assert.equal(await(await fetch(`http://127.0.0.1:${web}`)).text(),'unrelated-web');}
 finally {await stop(run);await new Promise(resolve=>occupied.close(resolve));}
});
