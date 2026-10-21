import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {spawnSync} from 'node:child_process';
import {WebSocketShardEvents as E} from '@discordjs/ws';
import {createDiscordGateway} from '../server/discord/gateway.js';
import {createDiscordEventState} from '../server/discord/event-state.js';
import {runDiscordEvents} from '../server/discord/event-cli.js';
import {createDiscordMetadataRefresh} from '../server/discord/metadata-refresh.js';

const secret='SYNTHETIC_PRIVATE_BODY_TOKEN_SESSION';
const guild='123456789012345678',config={enabled:true,guildId:guild,botToken:secret,maxPending:100};
const session=(sequence=1)=>({sessionId:secret,resumeURL:'wss://gateway.discord.gg',sequence,shardId:0,shardCount:1});
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const flush=()=>new Promise(resolve=>setImmediate(resolve));
const failure=(code='ECONNRESET')=>Object.assign(new Error(secret),{code,cause:Object.assign(new Error(secret),{code:'ETIMEDOUT'}),url:`https://example.com/${secret}`,body:secret,stack:secret});
function safeLogs(logs) {
  const text=JSON.stringify(logs);assert(!text.includes(secret));assert(!text.includes('https://'));
  for(const row of logs){assert(!Object.hasOwn(row,'message'));assert(!Object.hasOwn(row,'stack'));assert(!Object.hasOwn(row,'cause'));assert(!Object.hasOwn(row,'sessionId'));}
}
async function fixture(options={}) {
  const f={manager:new EventEmitter(),logs:[],saves:[],handled:[],failed:0,destroyed:0,checkpoint:null};
  f.manager.connect=async()=>{};f.manager.destroy=async()=>{f.destroyed++;};
  f.listener={handle:async e=>{f.handled.push(e);return {status:'queued'};}};
  f.state={load:async()=>f.checkpoint,save:async(_old,next)=>{f.saves.push(next);f.checkpoint=next;}};
  f.gateway=await createDiscordGateway({config,listener:f.listener,state:f.state,refreshMetadata:async()=>{},createRest:()=>({}),createManager:o=>{f.options=o;return f.manager;},log:row=>f.logs.push(row),onFailure:()=>{f.failed++;},...options});
  f.dispatch=(t='MESSAGE_CREATE',sequence=2)=>{f.options.updateSessionInfo(0,session(sequence));f.manager.emit(E.Dispatch,{t,s:sequence,d:{guild_id:guild,content:secret}},0);};
  return f;
}

for(const stage of ['event_ingestion','event_metadata_refresh','checkpoint_save'])test(`fatal ${stage} identifies its stage and never advances the failed frontier`,async()=>{
  const options=stage==='event_metadata_refresh'?{refreshMetadata:async()=>{throw failure();}}:{};
  const f=await fixture(options);
  if(stage==='event_ingestion')f.listener.handle=async()=>{throw failure();};
  if(stage==='checkpoint_save')f.state.save=async()=>{throw failure('checkpoint_conflict');};
  f.dispatch(stage==='event_metadata_refresh'?'CHANNEL_UPDATE':'MESSAGE_CREATE');f.dispatch('MESSAGE_CREATE',3);
  await f.gateway.drain();assert.equal(f.gateway.status().status,'failed');assert.equal(f.failed,1);assert.equal(f.destroyed,1);assert.equal(f.saves.length,0);
  const row=f.logs.find(r=>r.status==='collector_failed');assert.equal(row.stage,stage);assert.equal(typeof row.errorCode,'string');
  assert(row.errorCode.length<100);safeLogs(f.logs);await f.gateway.stop();
});

test('pending overflow is distinct from ingestion failure and cannot checkpoint in-flight work',async()=>{
  const gate=deferred(),f=await fixture({config:{...config,maxPending:1}});f.listener.handle=async()=>gate.promise;
  f.dispatch();await flush();f.dispatch('MESSAGE_CREATE',3);gate.resolve({status:'queued'});await f.gateway.drain();
  const row=f.logs.find(r=>r.status==='collector_failed');assert.equal(row.stage,'queue_overflow');assert.equal(row.pending,2);assert.equal(row.maxPending,1);
  assert.equal(f.saves.length,0);assert.equal(f.failed,1);safeLogs(f.logs);await f.gateway.stop();
});

for(const branch of ['checkpoint_load','checkpoint_validate','gateway_create'])test(`startup ${branch} is attributed without source/session disclosure`,async()=>{
  const logs=[],options={log:row=>logs.push(row)};
  if(branch==='checkpoint_load')options.state={load:async()=>{throw failure();}};
  if(branch==='checkpoint_validate')options.state={load:async()=>({session:{...session(),resumeURL:`https://example.com/${secret}`}})};
  if(branch==='gateway_create')options.createManager=()=>{throw failure();};
  await assert.rejects(fixture(options));assert(logs.some(row=>row.stage===branch&&typeof row.errorCode==='string'));safeLogs(logs);
});

test('SDK Error uses its actual positional signature and remains fatal',async()=>{
  const f=await fixture();f.manager.emit(E.Error,failure(),0);await flush();
  const row=f.logs.find(r=>r.status==='collector_failed');assert.equal(row.stage,'gateway_sdk');assert.equal(row.shardId,0);
  assert.equal(f.failed,1);assert.equal(f.destroyed,1);safeLogs(f.logs);await f.gateway.stop();
});

test('SDK SocketError and Closed are diagnostic reconnect events rather than fatal shutdowns',async()=>{
  const f=await fixture();f.manager.emit(E.Ready,{},0);f.manager.emit(E.SocketError,failure(),0);f.manager.emit(E.Closed,4009,0);
  assert.equal(f.failed,0);assert.equal(f.destroyed,0);assert.equal(f.gateway.status().status,'connecting');
  const socket=f.logs.find(r=>r.stage==='gateway_socket'),closed=f.logs.find(r=>r.stage==='gateway_closed');
  assert(socket);assert.equal(socket.shardId,0);assert.equal(closed.code??closed.closeCode,4009);assert.equal(closed.shardId,0);
  f.manager.emit(E.Resumed,0);assert.equal(f.gateway.status().status,'ready');safeLogs(f.logs);await f.gateway.stop();
});

test('gateway connect rejection is diagnosed and leaves no successful start',async()=>{
  const f=await fixture();f.manager.connect=async()=>{throw failure();};await assert.rejects(f.gateway.start());
  assert(f.logs.some(row=>row.stage==='gateway_connect'));safeLogs(f.logs);await f.gateway.stop();
});

test('logger exceptions cannot prevent fatal destroy, callback, or preserve an unsafe checkpoint',async()=>{
  let calls=0;const f=await fixture({log:()=>{calls++;throw failure();}});f.listener.handle=async()=>{throw failure();};
  f.dispatch();await f.gateway.drain();assert(calls>0);assert.equal(f.failed,1);assert.equal(f.destroyed,1);assert.equal(f.saves.length,0);await f.gateway.stop();
});

test('chat dispatch failure has a distinct nonfatal diagnostic and does not block ingestion',async()=>{
  const f=await fixture({onDispatch:async()=>{throw failure();}});f.dispatch();await f.gateway.drain();await flush();
  assert(f.logs.some(row=>row.stage==='chat_dispatch'));assert.equal(f.failed,0);assert.equal(f.saves.length,1);safeLogs(f.logs);await f.gateway.stop();
});

test('parent abort during ingestion is graceful and never commits the interrupted frontier',async()=>{
  const parent=new AbortController(),gate=deferred(),f=await fixture({signal:parent.signal});
  f.listener.handle=async()=>{await gate.promise;throw failure('aborted');};f.dispatch();await flush();parent.abort();gate.resolve();await f.gateway.drain();
  assert.equal(f.failed,0);assert.equal(f.saves.length,0);assert(!f.logs.some(row=>row.status==='collector_failed'));await f.gateway.stop();
});

test('explicit parent cancellation before gateway start is not diagnosed as a crash',async()=>{
  const parent=new AbortController(),f=await fixture({signal:parent.signal});parent.abort();
  await assert.rejects(f.gateway.start());assert(!f.logs.some(row=>row.status==='collector_failed'));assert.equal(f.failed,0);await f.gateway.stop();
});

test('stopping before a delayed SDK error or ingestion rejection stays graceful',async()=>{
  const gate=deferred(),f=await fixture();f.listener.handle=async()=>{await gate.promise;throw failure();};f.dispatch();await flush();
  const stopped=f.gateway.stop();f.manager.emit(E.Error,failure(),0);gate.resolve();await stopped;
  assert.equal(f.failed,0);assert.equal(f.saves.length,0);assert(!f.logs.some(row=>row.status==='collector_failed'));
});

test('checkpoint HTTP failure preserves only allowlisted classification and numeric HTTP status',async()=>{
  const state=createDiscordEventState({env:{SUPABASE_URL:'https://synthetic.supabase.co',SUPABASE_SERVICE_ROLE_KEY:secret,DISCORD_GUILD_ID:guild},fetchImpl:async()=>new Response(secret,{status:503})});
  const logs=[];await assert.rejects(fixture({state,log:row=>logs.push(row)}));
  const row=logs.find(r=>r.stage==='checkpoint_load');assert.equal(row.httpStatus,503);assert.equal(typeof row.errorCode,'string');safeLogs(logs);
});

for(const [mode,code] of [['oversized','checkpoint_response_too_large'],['malformed','checkpoint_invalid_response'],['conflict','checkpoint_conflict']])test(`checkpoint ${mode} has its own safe diagnostic code`,async()=>{
  const state=createDiscordEventState({env:{SUPABASE_URL:'https://synthetic.supabase.co',SUPABASE_SERVICE_ROLE_KEY:secret,DISCORD_GUILD_ID:guild},
    fetchImpl:async()=>mode==='conflict'?Response.json(false):new Response(mode==='oversized'?secret.repeat(1000):secret)});
  const {collectorErrorFields}=await import('../server/discord/collector-diagnostics.js');let caught;
  try {if(mode==='conflict')await state.save(null,{session:session()});else await state.load();}catch(error){caught=error;}
  assert(caught);assert.equal(collectorErrorFields(caught).errorCode,code);safeLogs([collectorErrorFields(caught)]);
});

test('diagnostic helper classifies known safe errors and maps arbitrary attacker text to unknown',async()=>{
  const {collectorErrorFields}=await import('../server/discord/collector-diagnostics.js');
  assert.equal(collectorErrorFields(failure()).errorCode,'ECONNRESET');
  assert.equal(collectorErrorFields(new Error('Authentication failed')).errorCode,'gateway_authentication_failed');
  assert.equal(collectorErrorFields({name:'AbortError',message:secret}).errorCode,'aborted');
  for(const value of [secret,new Error(secret),{code:secret,message:secret,name:secret},null,undefined,{},new Proxy({}, {get(){throw Error(secret);}})]) {
    const result=collectorErrorFields(value);assert.equal(result.errorCode,'unknown_error');safeLogs([result]);
  }
});

test('adversarial throwing getters, cyclic/deep causes and JSON hooks never escape into diagnostics',async()=>{
  const {collectorErrorFields,logCollectorDiagnostic}=await import('../server/discord/collector-diagnostics.js');
  const poison={};for(const key of ['code','message','name','cause','error','httpStatus','status','statusCode'])Object.defineProperty(poison,key,{get(){throw Error(secret);}});
  assert.deepEqual(collectorErrorFields(poison),{errorCode:'unknown_error'});
  const cycle={code:'ECONNRESET',message:secret};cycle.cause=cycle;assert.equal(collectorErrorFields(cycle).errorCode,'ECONNRESET');
  let deep=failure();for(let i=0;i<20;i++)deep={cause:deep,message:secret};assert.equal(collectorErrorFields(deep).errorCode,'unknown_error');
  const rows=[];logCollectorDiagnostic(row=>rows.push(row),{status:'collector_failed',stage:'event_ingestion',error:{code:secret,toJSON(){throw Error(secret);}},token:secret,url:secret,sessionId:secret,payload:{content:secret}});
  assert.deepEqual(rows,[{status:'collector_failed',stage:'event_ingestion',errorCode:'unknown_error'}]);safeLogs(rows);
});

test('diagnostic metadata accepts bounded integers and known vocabulary only',async()=>{
  const {logCollectorDiagnostic}=await import('../server/discord/collector-diagnostics.js');const rows=[];
  logCollectorDiagnostic(row=>rows.push(row),{status:secret,stage:secret,eventType:secret,reason:secret,error:{code:secret,status:secret},pending:secret,maxPending:Infinity,shardId:secret,code:secret});
  assert.deepEqual(rows.pop(),{status:'collector_unavailable',stage:'top_level',errorCode:'unknown_error'});
  for(const value of [-1,NaN,Infinity,1.5,Number.MAX_SAFE_INTEGER,'503',null]) {
    logCollectorDiagnostic(row=>rows.push(row),{status:'collector_failed',stage:'gateway_sdk',error:{status:value},pending:value,maxPending:value,shardId:value,code:value});
    const row=rows.pop();for(const key of ['httpStatus','pending','maxPending','shardId','code'])assert.equal(Object.hasOwn(row,key),false);
  }
  logCollectorDiagnostic(row=>rows.push(row),{status:'collector_failed',stage:'queue_overflow',error:{status:503},pending:101,maxPending:100,shardId:0,code:4009,eventType:'MESSAGE_CREATE'});
  assert.deepEqual(rows.pop(),{status:'collector_failed',stage:'queue_overflow',errorCode:'http_error',httpStatus:503,pending:101,maxPending:100,shardId:0,code:4009,eventType:'MESSAGE_CREATE'});
});

test('sync and async logger exceptions are contained',async()=>{
  const {logCollectorDiagnostic}=await import('../server/discord/collector-diagnostics.js');
  for(const sink of [()=>{throw failure();},async()=>{throw failure();}])assert.doesNotThrow(()=>logCollectorDiagnostic(sink,{status:'collector_failed',stage:'gateway_sdk',error:failure()}));
  await flush();
});

const env={DISCORD_EVENTS_ENABLED:'true',DISCORD_GUILD_ID:guild,DISCORD_BOT_TOKEN:secret,SUPABASE_URL:'https://synthetic.supabase.co',SUPABASE_SERVICE_ROLE_KEY:secret,PORT:'3003'};
async function cliFixture(t,overrides={}) {
  const oldExit=process.exitCode;t.after(()=>{process.exitCode=oldExit;});
  const f={logs:[],server:new EventEmitter(),stops:0,closes:0,chatStops:0};
  f.server.listen=()=>{};f.server.close=()=>{f.closes++;};f.server.closeAllConnections=()=>{};
  const gateway={start:async()=>{},status:()=>({status:'ready',pending:0}),stop:async()=>{f.stops++;}};
  f.result=await runDiscordEvents({args:['serve'],env,write:row=>f.logs.push(row),createState:()=>({}),createListener:()=>({}),
    createGateway:async()=>gateway,createMetadataRefresh:()=>({refresh:async()=>({channels:0}),initialDelayMs:async()=>100,nextDelayMs:100}),
    createChatTransport:async()=>({botUserId:'523456789012345678',stop:async()=>{f.chatStops++;}}),createHttpServer:()=>f.server,...overrides});
  t.after(async()=>{await f.result?.stop?.();});return f;
}

test('CLI startup marker identifies diagnostics version and ordinary stop stays nonfatal',async t=>{
  const f=await cliFixture(t);assert.equal(f.result.status,'listening');
  assert(f.logs.some(row=>row.status==='collector_starting'&&row.stage==='startup'&&row.diagnosticsVersion===1));
  await f.result.stop();assert.equal(f.stops,1);assert.equal(f.chatStops,1);assert.equal(f.closes,1);
  assert(f.logs.some(row=>row.stage==='shutdown'&&row.reason==='requested'));safeLogs(f.logs);
});

test('CLI chat startup and periodic refresh failures stay distinct and nonfatal',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const f=await cliFixture(t,{createChatTransport:async()=>{throw failure();},createMetadataRefresh:()=>({refresh:async()=>{throw failure('metadata_refresh_failed');},initialDelayMs:async()=>100,nextDelayMs:100})});
  assert.equal(f.result.status,'listening');assert(f.logs.some(row=>row.stage==='chat_startup'));
  t.mock.timers.tick(100);await flush();assert(f.logs.some(row=>row.stage==='periodic_metadata_refresh'));assert.equal(f.stops,0);assert.equal(f.closes,0);safeLogs(f.logs);
});

test('CLI stop cancels ingestion safely while chat teardown is still waiting',async t=>{
  const oldExit=process.exitCode,chatGate=deferred(),ingestionGate=deferred();let gw;
  const f=await cliFixture(t,{createChatTransport:async()=>({botUserId:'523456789012345678',stop:()=>chatGate.promise}),createGateway:async args=>{
    gw=await fixture({signal:args.signal,log:args.log,onFailure:args.onFailure});gw.listener.handle=async()=>{await ingestionGate.promise;throw failure('aborted');};return gw.gateway;
  }});
  gw.dispatch();await flush();const stopping=f.result.stop();ingestionGate.resolve();await gw.gateway.drain();
  assert.equal(gw.saves.length,0);assert.equal(gw.destroyed,0,'chat teardown is still waiting before gateway stop');
  assert(!f.logs.some(row=>row.status==='collector_failed'));assert.equal(process.exitCode,oldExit);
  chatGate.resolve();await stopping;assert.equal(gw.destroyed,1);safeLogs(f.logs);
});

test('periodic metadata cancellation during CLI stop is not reported as a refresh failure',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});let began=false;
  const f=await cliFixture(t,{createMetadataRefresh:({signal})=>({initialDelayMs:async()=>100,nextDelayMs:100,refresh:()=>{
    began=true;return new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(failure('aborted')),{once:true}));
  }})});
  t.mock.timers.tick(100);await flush();assert.equal(began,true);await f.result.stop();await flush();
  assert(!f.logs.some(row=>row.status==='metadata_refresh_failed'));assert(!f.logs.some(row=>row.status==='collector_failed'));safeLogs(f.logs);
});

for(const phase of ['connect_reject','connect_resolve','delay_reject','delay_resolve'])test(`SIGTERM during ${phase} returns stopped and never claims listening`,async t=>{
  const oldExit=process.exitCode,options={};let initialDelayCalls=0;
  const terminate=()=>{assert.equal(process.emit('SIGTERM'),true);};
  if(phase.startsWith('connect'))options.createGateway=async()=>({status:()=>({status:'connecting'}),stop:async()=>{},start:async()=>{
    terminate();await flush();if(phase.endsWith('reject'))throw failure('aborted');
  }});
  options.createMetadataRefresh=()=>({refresh:async()=>({channels:0}),nextDelayMs:100,initialDelayMs:async()=>{
    initialDelayCalls++;if(phase.startsWith('delay')){terminate();await flush();if(phase.endsWith('reject'))throw failure('aborted');}return 100;
  }});
  const f=await cliFixture(t,options);assert.deepEqual(f.result,{status:'stopped'});
  assert(!f.logs.some(row=>['listening','collector_failed','collector_unavailable'].includes(row.status)));assert.equal(process.exitCode,oldExit);
  if(phase.startsWith('connect'))assert.equal(initialDelayCalls,0);safeLogs(f.logs);
});

for(const priorExit of [undefined,1])test(`executable stopped-result mapping preserves ${priorExit===1?'prior fatal exit1':'graceful exit0'}`,()=>{
  const moduleUrl=new URL('../server/discord/event-cli.js',import.meta.url).href;
  // Replace only the real startup invocation in a child loader. The production
  // entrypoint's result/exit mapping executes unchanged, with no network or files.
  const code=`import {registerHooks} from 'node:module';import {fileURLToPath} from 'node:url';
    const target=${JSON.stringify(moduleUrl)};registerHooks({load(url,context,next){const loaded=next(url,context);if(url!==target)return loaded;
      const source=String(loaded.source),needle='runDiscordEvents().then(';if(!source.includes(needle))throw Error('missing_entrypoint_seam');
      return {...loaded,source:source.replace(needle,'Promise.resolve({status:"stopped"}).then(')};}});
    process.argv[1]=fileURLToPath(target);${priorExit===1?'process.exitCode=1;':''}await import(target);`;
  const result=spawnSync(process.execPath,['--input-type=module','-e',code],{env:{...process.env,DISCORD_EVENTS_ENABLED:'false'},encoding:'utf8',timeout:3000});
  assert.equal(result.status,priorExit??0);assert.equal(result.stderr,'');assert.deepEqual(JSON.parse(result.stdout.trim()),{status:'stopped'});
});

test('CLI server error logs stage/status and closes resources with failed exit',async t=>{
  const f=await cliFixture(t);f.server.emit('error',failure('EADDRINUSE'));await flush();
  const row=f.logs.find(row=>row.status==='server_unavailable');assert.equal(row.stage,'server_startup');assert.equal(row.errorCode,'EADDRINUSE');
  assert.equal(f.stops,1);assert.equal(f.chatStops,1);assert.equal(f.closes,1);assert.equal(process.exitCode,1);safeLogs(f.logs);
});

for(const branch of ['chat','gateway','server'])test(`CLI ${branch} teardown errors are diagnosed without interrupting remaining cleanup`,async t=>{
  const options={};
  if(branch==='chat')options.createChatTransport=async()=>({botUserId:'523456789012345678',stop:()=>{throw failure();}});
  if(branch==='gateway')options.createGateway=async()=>({start:async()=>{},status:()=>({status:'ready'}),stop:()=>{throw failure();}});
  const f=await cliFixture(t,options);if(branch==='server')f.server.close=()=>{throw failure();};
  await f.result.stop();const row=f.logs.find(row=>row.stage===`${branch}_shutdown`);assert(row);assert.equal(row.errorCode,'ECONNRESET');safeLogs(f.logs);
  if(branch==='chat')assert.equal(f.stops,1);if(branch!=='server')assert.equal(f.closes,1);
});

for(const code of ['invalid_token','discord_unavailable',secret])test(`metadata discovery ${code===secret?'unknown':code} keeps only a safe cause classification`,async()=>{
  const store={getPolicy:async()=>({status:'ready',policy:{guildId:guild,revision:1,paused:false,discoveryEnabled:true}}),getDiscoveryState:async()=>({status:'ready',state:null})};
  const refresh=createDiscordMetadataRefresh({config,store,client:{},discover:async()=>({status:'unavailable',code,body:secret,url:`https://example.com/${secret}`})});
  let caught;try{await refresh.refresh();}catch(error){caught=error;}assert(caught);
  const {collectorErrorFields}=await import('../server/discord/collector-diagnostics.js');const result=collectorErrorFields(caught);
  assert.equal(result.errorCode,'metadata_refresh_failed');assert.equal(result.causeCode,code===secret?undefined:code);safeLogs([result]);
});

for(const branch of ['state','metadata','gateway','server','connect','initial_delay'])test(`CLI ${branch} startup failure is safe and cleans already-created resources`,async t=>{
  const logs=[],options={write:row=>logs.push(row)};
  const stages={state:'checkpoint_load',metadata:'startup',gateway:'gateway_create',server:'server_startup',connect:'gateway_connect',initial_delay:'periodic_metadata_refresh'};
  if(branch==='state')options.createState=()=>{throw failure();};
  if(branch==='metadata')options.createMetadataRefresh=()=>{throw failure();};
  if(branch==='gateway')options.createGateway=async()=>{throw failure();};
  if(branch==='server')options.createHttpServer=()=>{throw failure();};
  if(branch==='connect')options.createGateway=async()=>({start:async()=>{throw failure();},stop:async()=>{}});
  if(branch==='initial_delay')options.createMetadataRefresh=()=>({initialDelayMs:async()=>{throw failure();}});
  if(branch==='connect')assert.equal((await cliFixture(t,options)).result.status,'unavailable');else await assert.rejects(cliFixture(t,options));
  assert(logs.some(row=>row.stage===stages[branch]&&typeof row.errorCode==='string'));assert(logs.some(row=>row.stage==='shutdown'));assert.equal(process.exitCode,1);safeLogs(logs);
});

test('top-level monitor emits a sanitized structured record and preserves native fatal exit',()=>{
  const moduleUrl=new URL('../server/discord/event-cli.js',import.meta.url).href;
  const code=`import {fileURLToPath} from 'node:url';process.argv[1]=fileURLToPath(${JSON.stringify(moduleUrl)});await import(${JSON.stringify(moduleUrl)});setImmediate(()=>{const error=new Error(${JSON.stringify(secret)});error.code='ECONNRESET';throw error;});`;
  const result=spawnSync(process.execPath,['--input-type=module','-e',code],{env:{...process.env,DISCORD_EVENTS_ENABLED:'false'},encoding:'utf8',timeout:3000});
  assert.equal(result.status,1);
  // The approved monitor-only design leaves Node's native raw fatal stderr in
  // place. Privacy applies to added structured records, not that native output.
  const rows=(result.stdout+'\n'+result.stderr).trim().split('\n').filter(line=>line.startsWith('{')).map(line=>JSON.parse(line));
  assert(rows.some(row=>row.stage==='top_level'&&row.errorCode==='ECONNRESET'));safeLogs(rows);
});
