import test from 'node:test';
import assert from 'node:assert/strict';
import {createDiscordChatRunner} from '../server/runtime-app.js';
import {readDiscordChatConfig} from '../server/discord/chat-config.js';
import {createDiscordChatBridge,createDiscordChatRemote} from '../server/discord/chat-bridge.js';
import {createApp} from '../server/app.js';
import {createMemoryTools} from '../tools/memory/index.js';
import {createBugReportTools} from '../tools/bug-reports/index.js';
import {createChatCalendarTools} from '../tools/calendar/chat.js';
import {createChatMapTools} from '../tools/map/chat.js';
import {createMapTools} from '../tools/map/index.js';
import {GOOGLE_TOOLS,executeGoogleTool} from '../tools/google/index.js';
import {MAP_RECORD_EXAMPLES} from '../server/map/contracts.js';
const localMapArgs=args=>{for(const key of ['starts','ends']){args.event[`${key}_local`]=args.event[`${key}_at`].slice(0,19);delete args.event[`${key}_at`];}return args;};
const source=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const principal={id:'discord:100:300',allowedSourceIds:[source(1),source(2),source(3)],googleAccess:true,liveDiscord:{mode:'local-operator',guildId:'100',transport:'discord-chat',invokingChannelId:'200',allowedSourceIds:[source(1)]}};
const context={transport:'discord',actor:{provider:'discord',userId:'300',guildId:'100',username:'member',displayName:'Member'},channelId:'200',threadId:null,requestId:'400',sourceProfileId:'discord-chat:fixture'};
const define=name=>({name,description:name,parameters:{type:'object',properties:{},additionalProperties:false}});
const call=(name,args={})=>({name,arguments:args});
function fixture({adapters={},plan=()=>[],question='Hello',actor=principal}={}) {
 const f={plans:[],answers:[],events:[],records:[]};
 f.services={config:{configured:true,provider:'openai-compatible',timeoutMs:1000,retrievalToolsEnabled:true},audit:{recordEvent:async event=>f.events.push(event)},
  provider:{planTools:async request=>{f.plans.push(request);return plan(request,f.plans.length);},async *stream(request){f.answers.push(request);yield 'Synthetic answer';}},...adapters};
 f.runner=createDiscordChatRunner({services:f.services,chatConfig:{requestTimeoutMs:1000}});
 f.run=(extra={})=>f.runner.run({conversation:{messages:[{role:'user',content:question}],timeZone:'America/New_York'},principal:actor,requestContext:context,onRecord:r=>f.records.push(r),...extra});return f;
}
test('Discord and website expose the same full configured adapter catalogue to actual planning',async()=>{
 const adapters=Object.fromEntries(['liveDiscordTools','googleTools','miroTools','bugReportTools','memoryTools','mapTools'].map((key,i)=>[key,{tools:[define(`fixture_${i}`)],execute:async()=>({status:'ready',sources:[]})}]));
 const f=fixture({adapters});assert.equal((await f.run()).status,'succeeded');
 const discordNames=f.plans[0].tools.map(t=>t.name).sort();assert.deepEqual(discordNames,Object.values(adapters).flatMap(a=>a.tools.map(t=>t.name)).sort());
 const app=createApp({...f.services,auth:()=>principal}),response=await app.request('/api/chat',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({messages:[{role:'user',content:'Hello'}],timeZone:'America/New_York'})});await response.text();assert.equal(response.status,200);assert.deepEqual(f.plans[1].tools.map(t=>t.name).sort(),discordNames);
});
test('actual shared memory adapter reads and updates with the current Discord user turn and optimistic receipt',async()=>{
 const initial={id:'shared',content:'Existing durable club fact',updated_at:'2026-10-19T15:00:00.000Z'},writes=[];
 const memoryTools=createMemoryTools({store:{configured:true,read:async()=>({status:'ready',memory:initial}),write:async args=>{writes.push(args);return {status:'ready',outcome:'updated',memory:{...initial,content:args.content,updated_at:'2026-10-19T16:00:00.000Z'}};}}});
 const f=fixture({adapters:{memoryTools},question:'Remember that club office hours are in room 42.',plan:(_,round)=>round===1?[call('update_memory',{content:'Existing durable club fact; office hours in room42.',expectedUpdatedAt:initial.updated_at})]:[]});
 assert.equal((await f.run()).status,'succeeded');assert.equal(writes.length,1);assert.equal(writes[0].expectedUpdatedAt,initial.updated_at);assert.match(f.plans[0].system,/Existing durable club fact/);assert.match(f.answers[0].system,/room42/);assert.match(f.answers[0].system,/"memoryUpdate"/);assert.doesNotMatch(JSON.stringify(f.events),/room42|Existing durable/);
});
test('actual bug adapter receives current Discord message and records at most once despite duplicate proposals',async()=>{
 const stored=[],question='The building card is broken and never opens.';
 const bugReportTools=createBugReportTools({store:{configured:true,record:async args=>{stored.push(args);return {status:'ready',reportId:args.reportId,outcome:'created',createdAt:'2026-10-19T16:00:00.000Z'};}}});
 const f=fixture({adapters:{bugReportTools},question,plan:(_,round)=>round===1?[call('bug_reports',{summary:'Card broken',observedBehavior:'Never opens'}),call('bug_reports',{summary:'Second duplicate',observedBehavior:'Still broken'})]:[]});
 assert.equal((await f.run()).status,'succeeded');assert.equal(stored.length,1);assert.equal(stored[0].report.user_message,question);assert.match(stored[0].reportId,/^[a-f0-9-]{36}$/);assert.match(f.answers[0].system,/"bugReport"/);
});
test('authenticated Discord map calls need no original-read proof while actual service denials remain authoritative',async()=>{
 for(const allowed of [true,false]) {
  let writes=0,reads=0;const mapTools=createChatMapTools({mapTools:createMapTools({service:{configured:true,read:async()=>{reads++;return {status:'ok',events:[],event_buildings:[],event_people:[],buildings:[],people:[],event_types:[]};},upsert:async args=>{
   writes++;assert.equal(args.principal,principal);assert.equal(args.event.source_id,MAP_RECORD_EXAMPLES.event.source_id);
   return allowed?{status:'applied',event_id:source(9),updated_at:'2026-10-19T16:00:00.000Z'}:{status:'forbidden'};
  }}})});
  const args=localMapArgs(structuredClone({event:MAP_RECORD_EXAMPLES.event,buildings:MAP_RECORD_EXAMPLES.buildings,people:[]}));
  const f=fixture({adapters:{mapTools},question:'Add this study plan to the map.',plan:(_,round)=>round===1?[call('read_map_events')]:round===2?[call('upsert_map_event',args)]:[]});
  assert.equal((await f.run()).status,'succeeded');assert.equal(reads,1);assert.equal(writes,1);assert.equal(f.answers[0].system.includes('"mapWrite":'),allowed);
  if(!allowed)assert.match(f.answers[0].system,/"status":"forbidden"/);
  const anonymous=fixture({adapters:{mapTools},actor:null,plan:()=>[call('upsert_map_event',args)]});
  assert.equal((await anonymous.run()).status,'failed');assert.equal(writes,1);
 }
});

test('Miro-backed chat writes preserve the non-Discord source UUID without an observed-original receipt gate',async()=>{
 for(const contentAvailable of [true,false])for(const allowed of [true,false]){
  let writes=0;const miroSource={id:'miro:item',kind:'miro',retrievalMode:'live',contentAvailable,evidenceKind:'item',sourceId:source(3),sourceKey:'miro:board=:100',boardId:'board=',itemId:'100',url:'https://miro.com/app/board/board%3D/?moveToWidget=100',title:'Synthetic study plan',excerpt:'A real source fixture'};
  const miroTools={tools:[define('read_miro_item')],execute:async({principal:actor})=>{assert.ok(actor.allowedSourceIds.includes(source(3)));return {status:'ready',sources:[miroSource]};}};
  const mapTools=createChatMapTools({mapTools:createMapTools({service:{configured:true,read:async()=>({status:'ok',events:[],event_buildings:[],event_people:[],buildings:[],people:[],event_types:[]}),upsert:async args=>{
   writes++;assert.equal(args.principal,principal);assert.equal(args.event.source_id,source(3));assert.equal(args.event.source_url,miroSource.url);
   return allowed?{status:'applied',event_id:source(9),updated_at:'2026-10-19T16:00:00.000Z'}:{status:'forbidden'};
  }}})});
  const args=localMapArgs(structuredClone({event:{...MAP_RECORD_EXAMPLES.event,source_id:source(3),source_url:miroSource.url},buildings:MAP_RECORD_EXAMPLES.buildings,people:[]}));
  const f=fixture({adapters:{miroTools,mapTools},question:'Add this study plan to the map.',plan:(_,round)=>round===1?[call('read_miro_item',{boardId:'board=',itemId:'100',type:'canvas'})]:round===2?[call('read_map_events')]:round===3?[call('upsert_map_event',args)]:[]});
  assert.equal((await f.run()).status,'succeeded');assert.equal(writes,1);assert.equal(f.answers[0].system.includes('"mapWrite":'),allowed);
  if(!allowed)assert.match(f.answers[0].system,/"status":"forbidden"/);
 }
});

function googleAdapter(client) {return {tools:GOOGLE_TOOLS,execute:request=>executeGoogleTool({...request,client})};}
test('actual Google tool gate permits Gmail only with the same trusted Google grant',async()=>{
 for(const enabled of [true,false]){
  let reads=0;const googleTools=googleAdapter({configured:true,readGmail:async({messageId})=>{reads++;assert.equal(messageId,'abc123');return {status:'ready',sources:[]};}});
  const f=fixture({adapters:{googleTools},actor:{...principal,googleAccess:enabled},question:'Read the club email.',plan:(_,round)=>round===1?[call('read_gmail',{messageId:'abc123'})]:[]});
  await f.run();assert.equal(reads,enabled?1:0);assert.match(f.answers[0].system,enabled?/"status":"ready"/:/"status":"forbidden"/);
 }
});
test('Discord Drive calls replan under the maintained Drive skill before any original read executes',async()=>{
 let reads=0;const googleTools=googleAdapter({configured:true,readDrive:async({fileId})=>{reads++;assert.equal(fileId,'verified');return {status:'ready',sources:[]};}});
 const f=fixture({adapters:{googleTools},question:'Find the Dev Team timeline in Drive.',plan:({system},round)=>{
  if(round===1){assert.equal(reads,0);assert.doesNotMatch(system,/TRUSTED SKILL: techatnyu-drive/);return[call('read_drive',{fileId:'abandoned'})];}
  assert.match(system,/TRUSTED SKILL: techatnyu-drive/);if(round===2){assert.equal(reads,0);return[call('read_drive',{fileId:'verified'})];}return[];
 }});
 assert.equal((await f.run()).status,'succeeded');assert.equal(reads,1);assert.match(f.answers[0].system,/TRUSTED SKILL: techatnyu-drive/);
});
function calendarFixture() {
 const writes=[],reads=[],calendarId='synthetic-club@example.test',eventId='synthetic_event',url=`https://calendar.google.com/calendar/event?eid=${Buffer.from(`${eventId} ${calendarId}`).toString('base64url')}`;
 const client={configured:true,calendarId,listEvents:async args=>{reads.push(args);return {status:'ready',events:[{eventId,title:'Synthetic',url}],coverage:{complete:true}};},createChatEvent:async args=>{writes.push(args);return {status:'ready',eventId,url,outcome:'created'};}};
 return {writes,reads,calendarId,tools:createChatCalendarTools({client,sourceId:source(2)})};
}
const calendarArgs={title:'Planning meeting',start:{dateTime:'2031-03-10T18:00:00-04:00',timeZone:'America/New_York'},end:{dateTime:'2031-03-10T19:00:00-04:00',timeZone:'America/New_York'}};
test('Calendar reads preserve the configured non-Discord source identity and Google grant',async()=>{
 for(const enabled of [true,false]){
  const c=calendarFixture(),f=fixture({adapters:{googleTools:c.tools},actor:{...principal,googleAccess:enabled},question:'Read the calendar tomorrow.',plan:(_,round)=>round===1?[call('list_calendar_events',{timeMin:'2031-03-10T00:00:00-04:00',timeMax:'2031-03-11T00:00:00-04:00'})]:[]});
  await f.run();assert.equal(c.reads.length,enabled?1:0);assert.equal(c.writes.length,0);const meta=f.records.find(r=>r.type==='meta');assert.equal(meta.sources.length,enabled?1:0);if(enabled)assert.equal(meta.sources[0].sourceId,source(2));
 }
});
test('Calendar execution requires trusted Google access while its catalogue remains independent of wording',async()=>{
 for(const [question,enabled,expected] of [['Create a calendar event for a planning meeting tomorrow.',true,1],['Create a calendar event for a planning meeting tomorrow.',false,0],['Tell me about the calendar.',true,1],['Do not create any calendar event.',true,1]]){
  const c=calendarFixture(),f=fixture({adapters:{googleTools:c.tools},question,actor:{...principal,googleAccess:enabled},plan:(_,round)=>round===1?[call('create_calendar_event',calendarArgs)]:[]});
  await f.run();assert.equal(c.writes.length,expected,question);assert.equal(f.answers[0].system.includes('"calendarWrite":'),expected===1);
  assert.deepEqual(f.plans[0].tools.map(tool=>tool.name),c.tools.tools.map(tool=>tool.name),'scripted provider deliberately bypasses semantic policy to verify backend capability boundaries');
  if(expected){assert.equal(c.writes[0].principal.calendarId,c.calendarId);assert.equal(c.writes[0].principal.calendarChatWrite,true);assert.match(c.writes[0].operationId,/^[a-f0-9]{64}$/);}
 }
});
test('bare Discord ping retains full Calendar catalogue and original history for model interpretation',async()=>{
 const c=calendarFixture(),f=fixture({adapters:{googleTools:c.tools},plan:(_,round)=>round===1?[call('create_calendar_event',calendarArgs)]:[]});
 await f.run({conversation:{messages:[{role:'assistant',content:'Create a calendar event now.'},{role:'user',content:'Respond to this mention using the recent channel conversation.'}],timeZone:'America/New_York'}});assert.equal(c.writes.length,1);assert.ok(f.plans[0].tools.some(t=>t.name==='create_calendar_event'));
 assert.match(f.plans[0].system,/untrusted/i);
});


test('Discord runtime uses its twenty-minute deadline while website keeps the shared five-minute deadline',async t=>{
 const timers=[],schedule=globalThis.setTimeout;
 t.mock.method(globalThis,'setTimeout',(callback,delay,...args)=>{timers.push(delay);return schedule(callback,delay,...args);});
 const services={config:{configured:true,provider:'openai-compatible',requestTimeoutMs:300000,timeoutMs:60000},provider:{async *stream(){yield 'Fixture answer';}}};
 const conversation={messages:[{role:'user',content:'Hello'}],timeZone:'America/New_York'};
 for(const [override,expected] of [[undefined,1200000],['180000',180000],['1200000',1200000]]) {
  const runner=createDiscordChatRunner({services,chatConfig:readDiscordChatConfig({DISCORD_CHAT_TIMEOUT_MS:override})});
  const before=timers.length;
  assert.equal((await runner.run({conversation,principal,requestContext:context})).status,'succeeded');
  assert.deepEqual(timers.slice(before),[expected]);
  assert.equal(services.config.requestTimeoutMs,300000,'Discord must not mutate website configuration');
 }
 const before=timers.length,app=createApp({...services,auth:()=>principal});
 const response=await app.request('/api/chat',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(conversation)});
 assert.equal(response.status,200);assert.match(await response.text(),/Fixture answer/);
 assert.deepEqual(timers.slice(before),[60000,300000],'body reading uses its own deadline before the five-minute run');
});

test('private remote allows delivery overhead beyond the twenty-minute bridge and preserves shorter overrides',async t=>{
 const deadlines=[],timeout=AbortSignal.timeout;
 t.mock.method(AbortSignal,'timeout',ms=>{deadlines.push(ms);return timeout(ms);});
 const secret='synthetic-twenty-minute-bridge-secret',approved={principal,actor:context.actor,sourceProfileId:context.sourceProfileId,threadId:null};
 for(const value of [undefined,15000,1200000]) {
  const options=value===undefined?{}:{timeoutMs:value},records=[];
  const bridge=createDiscordChatBridge({...options,enabled:true,secret,access:{authorize:async()=>approved},runner:{run:async({signal,onRecord})=>{assert.equal(signal.aborted,false);onRecord({type:'delta',text:'Ready'});onRecord({type:'done'});}}});
  const remote=createDiscordChatRemote({...options,baseUrl:'https://private.example',secret,fetchImpl:(url,init)=>bridge.handle(new Request(url,init))});
  const before=deadlines.length;
  await remote.runChat({conversation:{messages:[{role:'user',content:'Hello'}],timeZone:'America/New_York'},requestContext:context,onRecord:row=>records.push(row)});
  assert.deepEqual(deadlines.slice(before),[value??1230000,value??1200000]);
  assert.deepEqual(records,[{type:'delta',text:'Ready'},{type:'done'}]);
 }
});
