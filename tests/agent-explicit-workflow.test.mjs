import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {CHAT_MAP_SOURCE_ID,chatMapEventUrl} from '../server/map/source-access.js';
import {PARTICIPATION_PARAMETERS} from '../server/automation/participation.js';
import {canonicalJson} from '../server/automation/validation.js';

const evidence=new URL('../evidence/gogreek-explicit-workflow-regression-20261023/',import.meta.url);
const root=new URL('../',import.meta.url),baseline=process.env.EXPLICIT_WORKFLOW_BASELINE==='1',urls=new Map();
const digest=value=>createHash('sha256').update(value).digest('hex');
async function moduleUrl(path){
 if(!baseline||!['server/automation/handler.js','server/automation/adapters.js','server/automation/prompt.js','server/automation/staged-pipeline.js','server/automation/participation.js'].includes(path))return new URL(path,root).href;
 if(urls.has(path))return urls.get(path);
 const pins=JSON.parse(await readFile(new URL('preimage-pins.json',evidence),'utf8'));
 let source=await readFile(new URL('preimages/'+path,evidence),'utf8');assert.equal(digest(source),pins.files[path]);
 for(const match of [...source.matchAll(/from (['"])(\.[^'"]+)\1/g)]){
  const absolute=new URL(match[2],new URL(path,root)),dependency=absolute.pathname.slice(root.pathname.length);
  source=source.replace(match[0],`from ${JSON.stringify(await moduleUrl(dependency))}`);
 }
 const file=new URL('runtime/baseline/'+path.replace(/\.js$/,'.mjs'),evidence);await mkdir(new URL('./',file),{recursive:true});await writeFile(file,source);urls.set(path,file.href);return file.href;
}
const factory=(await import(await moduleUrl('server/automation/handler.js'))).createAutomationHandler;
const {readAutomationConfig}=await import(new URL('server/automation/config.js',root));
const frozen=await readFile(new URL('./staged-runtime-integration.test.mjs',import.meta.url),'utf8');assert.equal(digest(frozen),'58e010be5e2e7d9dad74b3913df14e34182918d5112cf009737df2be5b935a04');
const start=frozen.indexOf('async function participationFixture('),end=frozen.indexOf('\nconst participationCall=',start);assert(start>0&&end>start);let body=frozen.slice(start,end);
const origin='https://web-production-e4edc.up.railway.app';
const oldAuthorizer="const authorize=async({principal,sourceId,sourceUrl})=>!control.revoked&&principal.allowedSourceIds.includes(sourceId)&&!(control.hiddenHelper&&sourceUrl==='https://discord.com/channels/100/200/292');";
assert(body.includes(oldAuthorizer));body=body.replace(oldAuthorizer,`const authorize=createMapSourceAuthorizer({publicOrigin:${JSON.stringify(origin)},store:rawStore,now:()=>new Date(clock),calendarTargets:[{sourceId:cs,client:{configured:true,calendarId:clubId,readEvent:args=>control.calendarRevoked?Promise.resolve({status:'forbidden',events:[]}):calendarClient.readEvent(args)}}],liveDiscordService:{configured:true,readMessages:async args=>{if(control.revoked)return {status:'forbidden',sources:[]};if(args.messageId==='292')return {status:'ready',sources:[{kind:'discord',sourceId:s,url:'https://discord.com/channels/100/200/292',guildId:'100',channelId:'200',messageId:'292',authorId:'600',content:'I will help with the event.',createdAt:taskStamp,sourceUpdatedAt:taskStamp}]};return liveService.readMessages(args);}}});`);
body=body.replace('const tasks=new Map(),mapRows=', 'const flowEvents=[],tasks=new Map(),mapRows=');
body=body.replace("action:async({complete})=>({status:complete?'completed':'execute'})", "action:async({complete})=>{flowEvents.push({kind:'reservation',complete:complete===true});return {status:complete?'completed':'execute'};}");
body=body.replace('return {adapters,context,inputs,native,pending,ids,source:s,clubSource:cs,rawStore','return {flowEvents,taskStore,people,authorize,calendars,adapters,context,inputs,native,pending,ids,source:s,clubSource:cs,rawStore');
const imports=[['createMapSourceAuthorizer','server/map/source-access.js'],['createAutomationAdapters','server/automation/adapters.js'],['createAutomationHandler','server/automation/handler.js'],['readAutomationConfig','server/automation/config.js'],['createCalendarClient','server/google/calendar-client.js'],['readCalendarConfig,readMemberPlansConfig,CALENDAR_REQUIRED_SCOPES','server/google/calendar-config.js'],['createMapEventService','server/map/events.js'],['createCalendarMapSync','server/automation/calendar-sync.js'],['createLiveRetrievalTools','tools/discord/index.js']];
const fixtureSource="import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';\n"+(await Promise.all(imports.map(async([names,path])=>`import {${names}} from ${JSON.stringify(await moduleUrl(path))};`))).join('\n')+"\nconst clubId='club@group.calendar.google.com',memberId='members@group.calendar.google.com';\n"+body+'\nexport {participationFixture};';
const fixtureFile=new URL('runtime/'+(baseline?'old':'current')+'-fixture.mjs',evidence);await mkdir(new URL('./',fixtureFile),{recursive:true});await writeFile(fixtureFile,fixtureSource);const {participationFixture}=await import(fixtureFile.href);
async function fixture({pg=false}={}){
 const f=await participationFixture(),row=[...f.mapRows.values()][0];
 row.people[0].source_id=CHAT_MAP_SOURCE_ID;row.people[0].source_url=chatMapEventUrl(row.event.id,origin);row.people[0].label='PRIVATE_EXISTING_CHAT_KEEP';
 if(pg){for(const field of ['starts_at','ends_at','reported_at'])if(row.event[field])row.event[field]=row.event[field].replace('.000Z','+00:00');for(const person of row.people)for(const field of ['starts_at','ends_at','reported_at'])if(person[field])person[field]=person[field].replace('.000Z','+00:00').replace('Z','+00:00');row.event.updated_at='2026-10-22T18:29:00.653692+00:00';}
 f.before=f.clone(row);f.eventId=row.event.id;f.legacy=f.clone(row.people[0]);
 for(const tool of f.adapters.tools){const prepare=tool.prepareArguments,execute=tool.execute;tool.prepareArguments=async(...args)=>{f.flowEvents.push({kind:'prepare',name:tool.name});return prepare?prepare(...args):args[0];};tool.execute=async(...args)=>{f.flowEvents.push({kind:'dispatch',name:tool.name});return execute(...args);};}
 return f;
}
async function witness(name,data){if(!process.env.EXPLICIT_WORKFLOW_EVIDENCE_FILE)return;let rows=[];try{rows=JSON.parse(await readFile(process.env.EXPLICIT_WORKFLOW_EVIDENCE_FILE,'utf8'));}catch{}rows.push({name,baseline,...data});await writeFile(process.env.EXPLICIT_WORKFLOW_EVIDENCE_FILE,JSON.stringify(rows,null,2)+'\n');}
const writeCount=f=>f.chronology.filter(row=>row.kind==='map_write').length;
const relationFacts=row=>Object.fromEntries(Object.entries(row).filter(([key])=>!['created_at','updated_at'].includes(key)));
const call=(name,id,args,ids=[])=>({id,name,arguments:{inputIds:ids,arguments:args}}),finish=(id,handledInputIds,noChangeInputIds)=>({id,name:'finish_batch',arguments:{handledInputIds,...(noChangeInputIds===undefined?{}:{noChangeInputIds})}}),turn=(...toolCalls)=>({stopReason:'tool_calls',toolCalls});
const bindings=request=>JSON.parse(request.messages.filter(row=>row.role==='user').findLast(row=>{try{return JSON.parse(row.content).referenceBindings;}catch{return false;}}).content).referenceBindings;
const feedback=(request,id)=>JSON.parse(request.messages.findLast(row=>row.role==='tool'&&row.toolCallId===id).content);


const queueRefs=request=>bindings(request).handledInputIds.map(row=>row.ref);
const isInitial=request=>bindings(request).phase==='initial';
const refsFor=(request,ids)=>ids.map(id=>bindings(request).inputIds.find(row=>row.uuid===id).ref);
const ownUrl=(f,i)=>'https://discord.com/channels/100/200/'+f.native[i].id;
const lookup=(f,i)=>({provider:'discord',providerUserId:f.native[i].author,sourceId:f.source,sourceUrl:ownUrl(f,i)});
const defer=(f,i)=>({summary:'Own supported participation '+f.native[i].author,operation:'participation',calendarKind:'club',calendarEventId:'feedback123',personId:f.ids[i]});
const owner=(f,i)=>f.pending[i].uuid;
async function ready(f){await f.prepare();await f.followup();f.chronology.length=0;f.flowEvents.length=0;}
async function readAll(f,i){let result=await f.execute('read_pending_task',{taskId:owner(f,i)},[owner(f,i)]),text='',pieces=0;while(result.fragment){const part=result.fragment;assert.equal(part.offset,text.length);text+=part.data;pieces++;if(part.nextOffset===null){result=JSON.parse(text);break;}result=await f.execute('read_context_fragment',{id:part.id,offset:part.nextOffset},[owner(f,i)]);}assert.equal(result.task.uuid,owner(f,i));return{result,pieces};}
function noChanges(f,text='Who is going?'){f.native[2].content=text;f.inputs[2].raw_response.payload.content=text;}
async function initialCheck(f,ids,noChange=[]){return f.adapters.pipeline.validateInitialFinish({principal:f.adapters.principal,handledInputIds:ids,noChangeInputIds:noChange});}

test('RED contract: a fifth offered attendance original without a saved task cannot silently cross initial finish; saving its genuine unfinished work recovers',async()=>{
 const f=await fixture();f.tasks.clear();for(const [id,author]of [['303','700'],['304','800']]){const m={id,author,content:'I will attend the full event.'};f.native.push(m);const input=f.clone(f.inputs[0]);input.uuid=randomUUID();input.raw_response.event_id=id;Object.assign(input.raw_response.payload,{id,author:{id:author},content:m.content});f.inputs.push(input);}let after=0;const next=f.adapters.pipeline.afterInitial;f.adapters.pipeline.afterInitial=async args=>{after++;return next(args);};let rejected;
 const {result,requests}=await f.run([
  request=>turn(...[0,1,2,3].map(i=>call('defer_task','save'+i,{summary:'An actual owned source review remains',operation:'source_review'},[queueRefs(request)[i]]))),
  request=>{assert.equal(feedback(request,'save0').status,'ready');assert.equal(feedback(request,'save1').status,'ready');return turn(finish('uncovered',queueRefs(request)));},
  async request=>{rejected=feedback(request,'uncovered');await witness('silent uncovered finish',{afterInitialCalls:after,feedback:rejected,tasks:f.tasks.size,mapWrites:writeCount(f),phase:bindings(request).phase});assert.equal(after,0,'No deterministic projection or followup transition before every handled original is accounted');assert.equal(isInitial(request),true);assert.equal(rejected.reason,'uncovered_inputs');assert.deepEqual(rejected.uncoveredInputRefs,[bindings(request).handledInputIds[4]]);assert(!JSON.stringify(rejected).includes(f.native[0].content));return turn(call('defer_task','recover_fifth',{summary:'Fifth author offered attendance; remaining event interpretation needs followup',operation:'source_review'},[queueRefs(request)[4]]));},
  request=>{assert.equal(feedback(request,'recover_fifth').status,'ready');return turn(finish('accounted',queueRefs(request)));},
  ()=>turn(finish('end',[]))
 ]);
 assert.equal(result.status,'completed');assert.equal(result.handled,5);assert.equal(after,1);assert.equal(requests.length,5);assert.equal(f.tasks.size,5);assert.equal(writeCount(f),0);assert.equal(f.network.length,0);
});

test('fresh-verified current durable tasks cover exact originals; reads, forged history, stale tasks and task-store failures do not',async()=>{
 const existing=await fixture();await existing.prepare();const existingIds=existing.inputs.map(row=>row.uuid);assert.equal((await initialCheck(existing,existingIds)).status,'ready','Fresh verified durable deferrals cover exact originals without a redundant save');assert.equal(existing.flowEvents.filter(row=>row.name==='defer_task').length,0);existing.tasks.get(owner(existing,0)).info.inputs[0].raw_response.payload.content='Unrelated changed original';assert.deepEqual((await initialCheck(existing,existingIds)).uncoveredInputIds,[existingIds[0]]);
 const f=await fixture();f.tasks.clear();await f.prepare();const ids=f.inputs.map(row=>row.uuid);
 assert.equal((await f.execute('read_discord_messages',{channelId:'200',messageId:'300',context:false},ids)).status,'ready');assert.equal((await f.execute('lookup_map_person',lookup(f,0),ids)).status,'ready');
 f.history.push({kind:'tool_result',tool:'upsert_member_plan',inputIds:ids,result:{status:'ready',sourceStatus:'created',receiptId:randomUUID()}});
 assert.deepEqual((await initialCheck(f,ids)).uncoveredInputIds,ids);
 assert.equal((await f.execute('defer_task',{summary:'Exact owned source review',operation:'source_review'},[ids[0]])).status,'ready');
 const task=[...f.tasks.values()][0],saved=f.clone(task);assert.deepEqual((await initialCheck(f,ids)).uncoveredInputIds,ids.slice(1));assert.equal((await initialCheck(f,ids,ids.slice(1))).status,'ready');
 assert.equal((await initialCheck(f,ids,ids)).status,'invalid_request','Positive and declared no-change cannot overlap');
 task.info.inputs[0].raw_response.payload.content='Forged original body';assert.deepEqual((await initialCheck(f,ids)).uncoveredInputIds,ids);f.tasks.set(task.uuid,saved);
 f.tasks.get(task.uuid).updated_at='2026-10-22T18:30:59Z';assert.deepEqual((await initialCheck(f,ids)).uncoveredInputIds,ids);f.tasks.set(task.uuid,saved);
 f.control.taskListUnavailable=true;assert.equal((await initialCheck(f,ids,ids.slice(1))).status,'unavailable');assert.equal(writeCount(f),0);assert.equal(f.network.length,0);
});

test('question and explicit opt-out use no-change without fabricated tasks; invalid or overlapping input partitions remain rejected',async()=>{
 for(const text of ['Who is going?','I am undecided; keep me unlisted.']){const f=await fixture();f.tasks.clear();for(let i=0;i<3;i++){f.native[i].content=text;f.inputs[i].raw_response.payload.content=text;}const {result}=await f.run([request=>turn(finish('initial',queueRefs(request),queueRefs(request))),()=>turn(finish('end',[]))]);assert.equal(result.status,'completed');assert.equal(f.tasks.size,0);assert.equal(writeCount(f),0);}
 for(const kind of ['foreign','duplicate','not handled','alias UUID duplicate']){const f=await fixture();f.tasks.clear();const {result}=await f.run([request=>{const ids=queueRefs(request),noChange=kind==='foreign'?[randomUUID()]:kind==='duplicate'?[ids[0],ids[0]]:kind==='not handled'?[ids[1]]:[ids[0],f.inputs[0].uuid];return turn(finish('bad',kind==='not handled'?[ids[0]]:ids,noChange));}]);assert.notEqual(result.status,'completed',kind);assert.equal(writeCount(f),0);assert.equal(f.tasks.size,0);}
 const f=await fixture();await f.prepare();const ids=f.inputs.map(row=>row.uuid);for(const bad of [[randomUUID()],[ids[0],ids[0]]])assert.equal((await initialCheck(f,ids,bad)).status,'invalid_request');
});

test('an actual Member Plan write covers its source original, never unrelated wrapper peers; explicit no-change completes the peers',async()=>{
 const {loadFixture}=await import('../evidence/gogreek-six-owned-history-model-20261023/fixture-loader.mjs');const {fixture:make}=await loadFixture();const discover=make(),person=randomUUID();
 const messages=[{id:'300',author:'400',content:'I will study at Bobst tomorrow from3to5.',at:'2026-10-23T07:50:00.000Z'},{id:'301',author:'500',content:'I am undecided; please keep me unlisted.',at:'2026-10-23T07:51:00.000Z'},{id:'302',author:'900',content:'Who is studying tomorrow?',at:'2026-10-23T07:52:00.000Z'}];
 const inputs=messages.map(m=>({uuid:randomUUID(),raw_response:{source:'discord',source_id:discover.source,event_type:'message_created',event_id:m.id,revision:'1',received_at:m.at,payload:{id:m.id,guild_id:'100',channel_id:'200',timestamp:m.at,author:{id:m.author},content:m.content}}}));
 const f=make({currentInputs:inputs,conversation:messages,roster:[{id:person,display_name:'Alex',discord_user_id:'400',is_trackable:true}],fixedBuildings:[{id:'bobst-library',name:'Bobst Library',aliases:['Bobst']}]});let index=0,denied,write;const providerErrors=[],memberTrace=[];
 const provider={toolTurn:async request=>{memberTrace.push({phase:bindings(request).phase,tools:request.messages.filter(r=>r.role==='tool').slice(-3)});try{const ids=queueRefs(request);switch(index++){
 case 0:return turn(call('read_discord_messages','native',{channelId:'200',messageId:'300',context:false},ids),call('lookup_map_person','identity',{provider:'discord',providerUserId:'400',sourceId:f.source,sourceUrl:'https://discord.com/channels/100/200/300'},ids));
 case 1:return turn(call('upsert_member_plan','invalid_clock',{sourceUrl:'https://discord.com/channels/100/200/300',personId:person,title:'Studying',activityKind:'personal_plan',typeId:'study',location:'Bobst',start:{localDateTime:'2026-10-23T15:00:00',timeZone:'America/New_York'},end:{dateTime:'2026-10-23T21:00:00-04:00',timeZone:'America/New_York'}},ids));
 case 2:assert.equal(feedback(request,'invalid_clock').reason,'invalid_request');assert.equal(f.chronology.filter(row=>row.kind==='calendar_write').length,0);return turn(finish('invalid_is_not_coverage',ids,ids.slice(1)));
 case 3:assert.equal(feedback(request,'invalid_is_not_coverage').reason,'uncovered_inputs');assert.deepEqual(feedback(request,'invalid_is_not_coverage').uncoveredInputRefs,[bindings(request).handledInputIds[0]]);return turn(call('upsert_member_plan','write',{sourceUrl:'https://discord.com/channels/100/200/300',personId:person,title:'Studying',activityKind:'personal_plan',typeId:'study',location:'Bobst',start:{localDateTime:'2026-10-23T15:00:00',timeZone:'America/New_York'},end:{localDateTime:'2026-10-23T17:00:00',timeZone:'America/New_York'}},ids));
 case 4:write=feedback(request,'write');assert.equal(write.outcome,'created');return turn(finish('wrong_peers',ids,[ids[2]]));
 case 5:denied=feedback(request,'wrong_peers');assert.equal(denied.reason,'uncovered_inputs');assert.deepEqual(denied.uncoveredInputRefs,[bindings(request).handledInputIds[1]]);return turn(finish('explicit_peers',ids,ids.slice(1)));
 default:return turn(finish('end',[]));}}catch(error){providerErrors.push({message:error.message,stack:error.stack});throw error;}}};
 const result=await factory({...f.adapters,config:f.config,store:f.store,provider,now:()=>new Date('2026-10-23T08:00:00Z')}).tick();await witness('actual source write coverage',{result,write,denied,providerErrors,memberTrace,chronology:f.chronology,calendarWrites:f.chronology.filter(row=>row.kind==='calendar_write').length,tasks:f.tasks.size});assert.equal(result.status,'completed',JSON.stringify({providerErrors,memberTrace}));assert.equal(result.handled,3);assert.equal(f.tasks.size,0);assert.equal(f.chronology.filter(row=>row.kind==='calendar_write').length,1);
});

test('RED contract: unread third task piece rejects a whole real reply before any effects, then exact continuation and grouped retry applies and resolves',async()=>{
 const f=await fixture();f.tasks.clear();noChanges(f);const originalPrepare=f.adapters.prepareBatch;f.adapters.prepareBatch=async args=>({...await originalPrepare(args),syntheticObservedEvidence:'x'.repeat(22000)});let refs,taskIds,roots,atReject,raw;
 const outcome=await f.run([
  request=>turn(...[0,1].map(i=>call('defer_task','new'+i,defer(f,i),[queueRefs(request)[i]]))),
  request=>turn(finish('initial',queueRefs(request),baseline?undefined:[queueRefs(request)[2]])),
  request=>{taskIds=[0,1].map(i=>[...f.tasks.values()].find(task=>task.info.inputs[0].uuid===f.inputs[i].uuid).uuid);refs=refsFor(request,taskIds);return turn(...refs.map((ref,i)=>call('read_pending_task','root'+i,{taskId:ref},[ref])));},
  request=>{roots=[0,1].map(i=>feedback(request,'root'+i).fragment);f.control.rootSizes=roots.map(p=>p&&({totalChars:p.totalChars,nextOffset:p.nextOffset}));assert(roots.every(p=>p.nextOffset===12000&&p.totalChars>24000&&p.totalChars<=36000),'Purposeful observed context makes exactly three task pieces '+JSON.stringify(f.control.rootSizes));return turn(...refs.map((ref,i)=>call('read_context_fragment','middle'+i,{id:roots[i].id,offset:12000},[ref])),...refs.map((ref,i)=>call('lookup_map_person','person'+i,lookup(f,i),[ref])));},
  request=>{assert.equal(feedback(request,'middle0').fragment.nextOffset,24000);return turn(call('read_context_fragment','completeB',{id:roots[1].id,offset:24000},[refs[1]]));},
  request=>{assert.equal(feedback(request,'completeB').fragment.nextOffset,null);atReject={events:f.flowEvents.length,writes:writeCount(f),rows:f.clone([...f.mapRows.values()])};raw=turn(call('patch_map_participation','unread_group',f.patch([0,1]),refs),call('read_map_events','peer',{eventId:f.eventId},refs));return raw;},
  async request=>{const patch=feedback(request,'unread_group'),peer=feedback(request,'peer'),events=f.flowEvents.slice(atReject.events);await witness('unread task whole-turn preflight',{patch,peer,events,mapWrites:writeCount(f)-atReject.writes,root:roots[0],taskVersion:f.tasks.get(taskIds[0]).updated_at});assert.equal(patch.reason,'participation_task_not_ready');assert.equal(peer.reason,'unattempted');assert.deepEqual(events,[],'No prepare, reservation or dispatch before missing current full read');assert.equal(writeCount(f),atReject.writes);assert.deepEqual([...f.mapRows.values()],atReject.rows);assert.deepEqual(patch.requiredTaskReads,[{taskRef:refs[0],updatedAt:f.tasks.get(taskIds[0]).updated_at,fragment:{id:roots[0].id,nextOffset:24000}}]);assert(!JSON.stringify(patch).includes(f.legacy.source_url));assert.deepEqual(request.messages.find(row=>row.role==='assistant'&&row.toolCalls?.some(c=>c.id==='unread_group')).toolCalls,raw.toolCalls);return turn(call('read_context_fragment','completeA',{id:roots[0].id,offset:24000},[refs[0]]),...refs.map((ref,i)=>call('lookup_map_person','verifiedPerson'+i,lookup(f,i),[ref])));},
  request=>{assert.equal(feedback(request,'completeA').fragment.nextOffset,null);return turn(call('patch_map_participation','grouped',f.patch([0,1]),refs));},
  request=>{assert.equal(feedback(request,'grouped').sourceStatus,'applied',JSON.stringify(feedback(request,'grouped')));return turn(...refs.map((ref,i)=>call('resolve_pending_task','resolve'+i,{taskId:ref,outcome:'completed'},[ref])));},
  ()=>turn(finish('done',[]))
 ]);
 assert.equal(outcome.result.followupStatus,'completed');assert.equal(f.tasks.size,0);assert.equal(writeCount(f),1);assert.equal(f.chronology.filter(row=>row.kind==='task_resolve').length,2);assert.equal(outcome.requests.length,10);assert.deepEqual(relationFacts([...f.mapRows.values()][0].people.find(p=>p.person_id===f.legacy.person_id)),relationFacts(f.legacy));assert.equal(f.network.length,0);
});

test('read diagnostics are exact current-owner/version only, never leak unrelated chains, and complete same-version proof survives a partial reread',async()=>{
 const f=await fixture();for(const task of f.tasks.values())task.info.batchContext={syntheticObservedEvidence:'x'.repeat(25000)};await ready(f);const inputIds=f.pending.slice(0,2).map(t=>t.uuid),scope={...f.context,inputIds};let result=f.adapters.pipeline.preflightParticipation({context:scope,changes:f.patch([0,1]).changes});assert.equal(result.status,'read_required');assert.deepEqual(result.requiredTaskReads.map(r=>r.taskId),inputIds);assert(result.requiredTaskReads.every(r=>!r.fragment));
 const first=await f.execute('read_pending_task',{taskId:inputIds[0]},[inputIds[0]]);assert(first.fragment);const readsBefore=f.observations.length,eventsBefore=f.flowEvents.length;result=f.adapters.pipeline.preflightParticipation({context:scope,changes:f.patch([0,1]).changes});assert.deepEqual(result.requiredTaskReads[0].fragment,{id:first.fragment.id,nextOffset:12000});assert.equal(f.observations.length,readsBefore);assert.equal(f.flowEvents.length,eventsBefore);
 const wrong=f.adapters.pipeline.preflightParticipation({context:{...scope,inputIds:[inputIds[1]]},changes:f.patch([0]).changes});assert.equal(wrong.status,'ready','Nonmatching scope is left to ordinary deny guards without foreign read metadata');
 const foreign=f.patch([0]);foreign.changes[0].sourceUrl='https://discord.com/channels/100/200/999';assert.equal(f.adapters.pipeline.preflightParticipation({context:scope,changes:foreign.changes}).status,'ready');
 await readAll(f,0);await readAll(f,1);assert.equal(f.adapters.pipeline.preflightParticipation({context:scope,changes:f.patch([0,1]).changes}).status,'ready');assert((await f.execute('read_pending_task',{taskId:inputIds[0]},[inputIds[0]])).fragment);assert.equal(f.adapters.pipeline.preflightParticipation({context:scope,changes:f.patch([0,1]).changes}).status,'ready','Completed same-version read wins over later partial root');
 assert.equal((await f.execute('defer_task',{taskId:inputIds[0],...defer(f,0)},[inputIds[0]])).status,'ready');const updated=f.adapters.pipeline.preflightParticipation({context:{...scope,inputIds:[inputIds[0]]},changes:f.patch([0]).changes});assert.equal(updated.status,'read_required');assert.equal(updated.requiredTaskReads[0].updatedAt,f.tasks.get(inputIds[0]).updated_at);assert(!updated.requiredTaskReads[0].fragment,'Old version chain must not be reused');assert.notEqual((await f.execute('read_context_fragment',{id:first.fragment.id,offset:12000},[inputIds[0]])).status,'ready');assert.equal(writeCount(f),0);assert.equal(f.network.length,0);
});

test('the read preflight grants no source, identity or applied proof and cleanup cannot reuse completed reads',async()=>{
 const f=await fixture();await ready(f);for(const i of [0,1])await readAll(f,i);const scope={...f.context,inputIds:[owner(f,0),owner(f,1)]};assert.equal(f.adapters.pipeline.preflightParticipation({context:scope,changes:f.patch([0,1]).changes}).status,'ready');const withoutIdentity=await f.execute('patch_map_participation',f.patch([0,1]),scope.inputIds);assert.notEqual(withoutIdentity.status,'ready');assert(!withoutIdentity.receiptId);assert.equal(writeCount(f),0);for(const i of [0,1])await f.execute('lookup_map_person',lookup(f,i),[owner(f,i)]);f.control.revoked=true;assert.notEqual((await f.execute('patch_map_participation',f.patch([0,1]),scope.inputIds)).status,'ready');assert.equal(writeCount(f),0);f.control.revoked=false;await f.prepare();await f.followup();assert.equal(f.adapters.pipeline.preflightParticipation({context:scope,changes:f.patch([0,1]).changes}).status,'read_required');assert.notEqual((await f.execute('resolve_pending_task',{taskId:owner(f,0),outcome:'completed'},[owner(f,0)])).status,'ready');assert.equal(f.network.length,0);
});

function runner({turns,legacy=false,config={}}){
 const queue=randomUUID(),task=randomUUID(),source=randomUUID(),event=randomUUID(),person=randomUUID(),events=[],requests=[],history=[],audits=[],errors=[];let index=0;
 const principal={id:'synthetic-six-preflight',allowedSourceIds:[source]},input={uuid:queue,raw_response:{source:'discord',source_id:source,event_type:'message_created',event_id:'300',revision:'1',received_at:'2026-10-23T08:00:00Z',payload:{id:'300',guild_id:'100',channel_id:'200',author:{id:'400'},content:'Synthetic attendance'}}};
 const tools=[{name:'patch_map_participation',description:'Synthetic participation dispatch counter',idempotent:true,parameters:PARTICIPATION_PARAMETERS,prepareArguments:async args=>{events.push('prepare');return args;},execute:async args=>{events.push({eventId:args.eventId});return {status:'ready'};}},{name:'read_map_events',description:'Synthetic ordinary peer counter',readOnly:true,parameters:{type:'object',properties:{},additionalProperties:false},prepareArguments:async args=>{events.push('peer prepare');return args;},execute:async()=>{events.push('peer execute');return {status:'ready'};}}];
 const pipeline={validateInitialFinish:async()=>({status:'ready'}),preflightParticipation:({context})=>({status:'read_required',requiredTaskReads:[{taskId:task,updatedAt:'2026-10-23T08:00:00.000Z'}]}),beginCycle:async()=>{},afterInitial:async()=>({status:'ready',inputIds:[task],context:{tasks:[]}}),finishCycle:async()=>({status:'ready'}),recordExecution:async row=>history.push(structuredClone(row))};
 const store={configured:true,claim:async()=>({status:'ready',leaseToken:randomUUID(),inputs:[input]}),renew:async()=>({status:'ready'}),release:async()=>{},action:async({complete})=>{events.push(complete?'receipt complete':'reserve');return {status:complete?'completed':'execute'};},finish:async()=>({status:'ready'})};
 const handler=factory({store,tools,pipeline:legacy?undefined:pipeline,principal,authorizeEvents:async()=>true,config:{...readAutomationConfig({AGENT_AUTOMATION_ENABLED:'true'}),...config},audit:{recordEvent:async row=>audits.push(row)},now:()=>new Date('2026-10-23T08:00:00Z'),provider:{toolTurn:async request=>{requests.push(request);try{assert(index<turns.length,'Unexpected scripted request');const step=turns[index++];return step({request,queue,task,event,person});}catch(error){errors.push(error);throw error;}}}});
 return {events,requests,history,audits,run:async()=>{const result=await handler.tick();if(errors.length)throw errors[0];return result;}};
}

const syntheticScope=state=>bindings(state.request).inputIds[0].ref;
const syntheticArgs=state=>({eventId:state.event,expectedUpdatedAt:'2026-10-23T08:00:00.000Z',changes:[{personId:state.person,sourceUrl:'https://discord.com/channels/100/200/300',attendanceStatus:'going'}]});
const syntheticInitial=state=>turn(finish('initial',queueRefs(state.request),queueRefs(state.request)));
const blockedTurn=(state,n,count=16)=>turn(...Array.from({length:count},(_,i)=>i===0?call('patch_map_participation',`p${n}`,syntheticArgs(state),[syntheticScope(state)]):call('read_map_events',`r${n}_${i}`,{},[syntheticScope(state)])));
test('read repair consumes ordinary budgets and call IDs, retains raw proposals, and never bypasses schema/scope or stage wire guards',async()=>{
 let h;h=runner({turns:[syntheticInitial,...Array.from({length:4},(_,n)=>state=>blockedTurn(state,n)),state=>{assert.deepEqual(h.events,[]);const errors=state.request.messages.filter(row=>row.role==='tool').map(row=>JSON.parse(row.content));assert.equal(errors.filter(row=>row.reason==='participation_task_not_ready').length,4);assert.equal(errors.filter(row=>row.reason==='unattempted').length,60);assert(state.request.messages.some(row=>row.role==='assistant'&&row.toolCalls?.some(c=>c.id==='p0')));return turn(call('read_map_events','over65',{},[syntheticScope(state)]));}]});assert.equal((await h.run()).followupStatus,'call_limit');assert.deepEqual(h.events,[]);
 const repeat=runner({turns:[syntheticInitial,state=>blockedTurn(state,0,2),state=>blockedTurn(state,0,2)]});const repeatResult=await repeat.run();assert.equal(repeatResult.followupStatus??repeatResult.status,'invalid_tool_call');assert.deepEqual(repeat.events,[]);
 for(const variant of ['bad schema','foreign scope','unknown tool']){let probe;probe=runner({turns:[syntheticInitial,state=>{const t=blockedTurn(state,0,2);if(variant==='bad schema')t.toolCalls[0].arguments.arguments.changes='bad';if(variant==='foreign scope')t.toolCalls[0].arguments.inputIds=[randomUUID()];if(variant==='unknown tool')t.toolCalls[0].name='unknown_tool';return t;},state=>{const errors=state.request.messages.filter(r=>r.role==='tool').map(r=>JSON.parse(r.content));assert(!errors.some(r=>r.reason==='participation_task_not_ready'));assert.deepEqual(probe.events,[]);return turn(finish('done',[]));}]});const result=await probe.run();assert.equal(result.followupStatus??result.status,variant==='unknown tool'?'invalid_tool_call':'completed');assert.deepEqual(probe.events,[]);}
 const phase=runner({turns:[syntheticInitial,state=>turn(finish('extra',[],[])),state=>{assert.equal(feedback(state.request,'extra').reason,'invalid_tool_call');return turn(finish('done',[]));}]});const phaseResult=await phase.run();assert.equal(phaseResult.followupStatus??phaseResult.status,'invalid_tool_call');assert.deepEqual(phase.events,[]);
 const legacy=runner({legacy:true,turns:[state=>turn(finish('legacy',[state.queue],[state.queue]))]});assert.notEqual((await legacy.run()).status,'completed');assert.deepEqual(legacy.events,[]);
});
