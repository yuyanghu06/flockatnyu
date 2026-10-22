import test from 'node:test';
import assert from 'node:assert/strict';
import {boundedWork, createMapEventService, createMapEventStore} from '../server/map/events.js';
import {createMapPresenceService} from '../server/map/presence.js';
import {createChatAttendanceService} from '../server/map/chat-attendance.js';
import {createGoogleClient} from '../server/google/client.js';
import {createCalendarClient} from '../server/google/calendar-client.js';
import {createGoogleOAuth} from '../server/google/oauth.js';
import {GOOGLE_SCOPES, readGoogleConfig} from '../server/google/config.js';
import {CALENDAR_REQUIRED_SCOPES, readCalendarConfig} from '../server/google/calendar-config.js';
import {createDiscordStore} from '../server/discord/store.js';
import {createLiveDiscordClient} from '../server/discord/live-client.js';
import {readLiveDiscordConfig} from '../server/discord/live-config.js';
import {createMiroStore} from '../server/miro/store.js';
import {readMiroMcpConfig} from '../server/miro/mcp-config.js';
import {createMemoryStore} from '../server/memory.js';

const at='2026-10-20T16:00:00.000Z';
const sid='22222222-2222-4222-8222-222222222222';
const principal={id:'synthetic-member',allowedSourceIds:[sid]};
const dbEnv={SUPABASE_URL:'https://synthetic.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'synthetic-key'};
const googleEnv={GOOGLE_CLIENT_ID:'synthetic-client',GOOGLE_CLIENT_SECRET:'synthetic-secret',GOOGLE_REFRESH_TOKEN:'synthetic-refresh',GOOGLE_EXPECTED_ACCOUNT_EMAIL:'synthetic@example.com',GOOGLE_CALENDAR_ID:'synthetic@group.calendar.google.com'};
const snapshot=()=>({event_types:['study','meeting','event','social','other'].map((code,i)=>({code,name:code,description:'',icon_key:code,sort_order:i})),buildings:[{id:'bobst-library',name:'Bobst'}],people:[],events:Array.from({length:11},(_,i)=>({id:`33333333-3333-4333-8333-${String(i).padStart(12,'0')}`,name:`Synthetic event ${i}`,notes:'',kind:'scheduled_event',type_id:'event',status:'confirmed',time_kind:'timed',starts_at:'2026-10-20T15:00:00Z',ends_at:'2026-10-20T17:00:00Z',starts_on:null,ends_on:null,time_zone:'America/New_York',source_id:sid,source_url:`https://example.com/event/${i}`,source_record_id:`synthetic:${i}`,url:null,reported_at:'2026-10-20T15:00:00Z'})),event_buildings:[],event_people:[]});
const flush=async()=>{for(let i=0;i<50;i++)await Promise.resolve();};
function clock(t) {
  t.mock.timers.enable({apis:['setTimeout']});
  // Node's native AbortSignal.timeout uses internal timers; bridge it to the
  // same virtual clock without changing any production deadline calculation.
  t.mock.method(AbortSignal,'timeout',ms=>{const c=new AbortController();setTimeout(()=>c.abort(new DOMException('Timed out','TimeoutError')),ms);return c.signal;});
  return async ms=>{t.mock.timers.tick(ms);await flush();};
}
const observe=promise=>{const state={done:false};state.promise=promise.then(value=>{state.done=true;state.value=value;},error=>{state.done=true;state.error=error;});return state;};
const stalledFetch=(_url,{signal})=>new Promise((_,reject)=>{if(signal.aborted)reject(signal.reason);else signal.addEventListener('abort',()=>reject(signal.reason),{once:true});});

for(const kind of ['events','presence'])test(`${kind} source checks can exceed 5s without bypassing source decisions`,async t=>{
  const advance=clock(t);let checked=0;
  const factory=kind==='events'?createMapEventService:createMapPresenceService;
  const data=snapshot();data.event_buildings=data.events.map(event=>({event_id:event.id,building_id:'bobst-library',location_notes:''}));
  const service=factory({store:{configured:true,read:async()=>data},production:true,now:()=>new Date(at),authorizeSource:async({signal})=>{
    await new Promise(resolve=>setTimeout(resolve,kind==='events'?600:6000));assert.equal(signal.aborted,false);return ++checked!==11;
  }});
  const state=observe(service.read({principal}));await flush();
  for(let i=0;i<11;i++)await advance(kind==='events'?600:2000);
  assert.equal(state.done,true);assert.equal(state.value.status,'ok');assert.equal(checked,11);
  assert.equal(kind==='events'?state.value.events.length:state.value.buildings[0].events.length,10,'the denied original stays hidden despite the larger deadline');
});

test('attendance target lookup waits beyond the old 15s ceiling for authorized map reads',async t=>{
  const advance=clock(t),data=snapshot();let reads=0;
  const service={configured:true,read:async()=>{reads++;await new Promise(resolve=>setTimeout(resolve,20000));return {status:'ok',...data};}};
  const request=createChatAttendanceService({store:{configured:true,read:async()=>data},service,publicOrigin:'https://flock.example',now:()=>new Date(at)}).createRequest({userMessage:'alex will be going to synthetic event today',principal});
  const state=observe(request.find({personName:'alex',eventQuery:'synthetic event',principal}));await flush();
  assert.equal(reads,1);await advance(19999);assert.equal(state.done,false);await advance(1);await state.promise;
  assert.equal(state.value.status,'ok');assert.equal(state.value.attendanceTargets.selection,'not_found');
});

for(const requested of [undefined,60000])test(`map work ${requested===undefined?'default':'explicit 60s'} survives the old 15s ceiling and expires at 60s`,async t=>{
  const advance=clock(t);let child;
  const state=observe(boundedWork(signal=>{child=signal;return new Promise(()=>{});},undefined,requested));await flush();
  await advance(59999);assert.equal(state.done,false);assert.equal(child.aborted,false);
  await advance(1);await state.promise;assert.equal(child.aborted,true);assert.match(state.error.message,/cancelled/);
});

test('map explicit shorter overrides and parent cancellation remain effective',async t=>{
  const advance=clock(t);const short=observe(boundedWork(()=>new Promise(()=>{}),undefined,80));await flush();
  await advance(79);assert.equal(short.done,false);await advance(1);assert.equal(short.done,true);
  const parent=new AbortController();let child;
  const pending=observe(boundedWork(signal=>{child=signal;return new Promise(()=>{});},parent.signal));await flush();
  parent.abort();await flush();assert.equal(pending.done,true);assert.equal(child.aborted,true);
  let called=false;await assert.rejects(boundedWork(()=>{called=true;},parent.signal));assert.equal(called,false);
});

test('map source checks stop at 60s and return no partially authorized snapshot',async t=>{
  const advance=clock(t);let child;
  const service=createMapEventService({store:{configured:true,read:async()=>snapshot()},now:()=>new Date(at),authorizeSource:async({signal})=>{child=signal;return new Promise(()=>{});}});
  const state=observe(service.read({principal}));await flush();await advance(59999);assert.equal(state.done,false);
  await advance(1);await state.promise;assert.equal(child.aborted,true);assert.deepEqual(state.value,{status:'unavailable',diagnostics:{stage:'execution',reason:'timeout'}});
});

const transports=[
  ['map store',({fetchImpl,signal})=>createMapEventStore({env:dbEnv,fetchImpl}).read({observedAt:at,signal})],
  ['Discord policy store',({fetchImpl,signal})=>createDiscordStore({env:dbEnv,fetchImpl}).getPolicy({guildId:'123',signal})],
  ['Miro scope store',({fetchImpl,signal})=>createMiroStore({env:dbEnv,fetchImpl}).authorizedBoard({principal,boardId:'synthetic',signal})],
  ['memory store',({fetchImpl,signal})=>createMemoryStore({env:dbEnv,fetchImpl}).read({signal})],
  ['Discord original HTTP',({fetchImpl,signal})=>createLiveDiscordClient({config:{configured:true,botToken:'synthetic',guildId:'123'},fetchImpl,requestPacer:{run:fn=>fn({defer:()=>{},now:Date.now})}}).getMessage({channelId:'456',messageId:'789',signal})],
];
for(const [name,run] of transports) {
  test(`${name} survives shorter legacy caps and aborts its HTTP signal at 60s`,async t=>{
    const advance=clock(t);let child;
    const state=observe(run({fetchImpl:(url,args)=>{child=args.signal;return stalledFetch(url,args);}}));await flush();
    assert(child instanceof AbortSignal);await advance(59999);assert.equal(state.done,false);assert.equal(child.aborted,false);
    await advance(1);await state.promise;assert.equal(child.aborted,true);assert(state.error||state.value.status==='unavailable');
  });
  test(`${name} preserves immediate parent cancellation`,async t=>{
    clock(t);let child;const parent=new AbortController();
    const state=observe(run({signal:parent.signal,fetchImpl:(url,args)=>{child=args.signal;return stalledFetch(url,args);}}));await flush();
    parent.abort();await state.promise;assert.equal(child.aborted,true);assert(state.error||state.value.status==='aborted');
  });
}

for(const kind of ['Google reads','Calendar'])for(const phase of ['OAuth','HTTP'])test(`${kind} ${phase} receives the full 60s budget`,async t=>{
  const advance=clock(t);let httpSignal;
  const oauth={setCredentials:()=>{},getAccessToken:()=>phase==='OAuth'?new Promise(()=>{}):Promise.resolve({token:'synthetic'}),getTokenInfo:async()=>({scopes:kind==='Calendar'?CALENDAR_REQUIRED_SCOPES:GOOGLE_SCOPES})};
  const options={oauthClient:oauth,fetchImpl:(url,args)=>{httpSignal=args.signal;return stalledFetch(url,args);}};
  const client=kind==='Calendar'?createCalendarClient({...options,config:readCalendarConfig(googleEnv)}):createGoogleClient({...options,config:readGoogleConfig(googleEnv)});
  const state=observe(kind==='Calendar'?client.preflight():client.searchDrive({query:'synthetic'}));await flush();
  await advance(59999);assert.equal(state.done,false);await advance(1);await state.promise;
  assert.equal(state.value.status,'timeout');if(phase==='HTTP')assert.equal(httpSignal.aborted,true);
});

test('OAuth transport and Miro default use 60s while explicit Miro and longer Discord aggregate budgets survive',()=>{
  const oauth=createGoogleOAuth(readGoogleConfig(googleEnv));assert.equal(oauth.transporter.defaults.timeout,60000);
  assert.equal(oauth.transporter.defaults.retryConfig.retry,0);assert.equal(oauth.transporter.defaults.maxRedirects,0);
  assert.equal(readMiroMcpConfig({MIRO_BOARD_IDS:'synthetic',MIRO_MCP_ACCESS_TOKEN:'synthetic'}).requestTimeoutMs,60000);
  assert.equal(readMiroMcpConfig({MIRO_BOARD_IDS:'synthetic',MIRO_MCP_ACCESS_TOKEN:'synthetic',MIRO_MCP_REQUEST_TIMEOUT_MS:'1000'}).requestTimeoutMs,1000);
  const discord=readLiveDiscordConfig({});assert.equal(discord.maxRuntimeMs,120000);assert.equal(discord.pacing.requestBudgetMs,90000);
});

test('scope gates still deny before storage or OAuth',async()=>{
  let calls=0;const fetchImpl=async()=>{calls++;throw Error('Unexpected HTTP');};
  assert.equal((await createMiroStore({env:dbEnv,fetchImpl}).authorizedBoard({principal:{id:'denied',allowedSourceIds:[]},boardId:'synthetic'})).status,'forbidden');
  assert.equal((await createDiscordStore({env:dbEnv,fetchImpl}).listChannels({principal:{id:'denied'}})).status,'forbidden');
  const map=createMapEventService({store:{configured:true,read:async()=>{calls++;return snapshot();}}});
  assert.equal((await map.read({principal:{id:'denied'}})).status,'forbidden');assert.equal(calls,0);
});
