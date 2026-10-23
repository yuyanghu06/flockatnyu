import {withTaskReadFixtures} from './fixtures/planner-followup.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {CHAT_MAP_SOURCE_ID,chatMapEventUrl} from '../server/map/source-access.js';
import {PARTICIPATION_PARAMETERS} from '../server/automation/participation.js';
import {canonicalJson} from '../server/automation/validation.js';

const evidence=new URL('../evidence/gogreek-six-repair-regression-20261023/',import.meta.url);
const root=new URL('../',import.meta.url),baseline=process.env.SIX_FLOW_BASELINE==='1',urls=new Map();
const digest=value=>createHash('sha256').update(value).digest('hex');
async function moduleUrl(path){
 if(!baseline||!['server/automation/handler.js','server/automation/calendar-sync.js','server/automation/adapters.js','server/automation/prompt.js','server/automation/staged-pipeline.js'].includes(path))return new URL(path,root).href;
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
// Current behavior fixtures follow the maintained test helper, not an incidental hash of unrelated tests.
// Historical runtime preimages remain independently hash-verified by moduleUrl above.
const frozen=await readFile(new URL('./staged-runtime-integration.test.mjs',import.meta.url),'utf8');
const start=frozen.indexOf('async function participationFixture('),end=frozen.indexOf('\nconst participationCall=',start);assert(start>0&&end>start);let body=frozen.slice(start,end);
const origin='https://web-production-e4edc.up.railway.app';
const oldAuthorizer="const authorize=({principal,sourceId,sourceUrl})=>!control.revoked&&principal.allowedSourceIds.includes(sourceId)&&!(control.hiddenHelper&&sourceUrl==='https://discord.com/channels/100/200/292');";
assert(body.includes(oldAuthorizer));body=body.replace(oldAuthorizer,`const authorize=createMapSourceAuthorizer({publicOrigin:${JSON.stringify(origin)},store:rawStore,now:()=>new Date(clock),calendarTargets:[{sourceId:cs,client:{configured:true,calendarId:clubId,readEvent:args=>control.calendarRevoked?Promise.resolve({status:'forbidden',events:[]}):calendarClient.readEvent(args)}}],liveDiscordService:{configured:true,readMessages:async args=>{if(control.revoked)return {status:'forbidden',sources:[]};if(args.messageId==='292')return {status:'ready',sources:[{kind:'discord',sourceId:s,url:'https://discord.com/channels/100/200/292',guildId:'100',channelId:'200',messageId:'292',authorId:'600',content:'I will help with the event.',createdAt:taskStamp,sourceUpdatedAt:taskStamp}]};return liveService.readMessages(args);}}});`);
body=body.replace('const tasks=new Map(),mapRows=', 'const flowEvents=[],tasks=new Map(),mapRows=');
// Simulate revoked Calendar access at its own explicitly called transport.
body=body.replace("const googleHttp=async(value,options={})=>{const endpoint=new URL(value);","const googleHttp=async(value,options={})=>{const endpoint=new URL(value);if(control.calendarRevoked&&endpoint.pathname.includes('/events'))return Response.json({}, {status:403});");
body=body.replace('await adapters.resolveClaimSourceIds({principal:adapters.principal});','await adapters.resolveClaimSourceIds({principal:adapters.principal});await adapters.prepareBatch({principal:adapters.principal,inputIds:inputs.map(row=>row.uuid),inputs});');
body=body.replace("action:async({complete})=>({status:complete?'completed':'execute'})", "action:async({complete})=>{flowEvents.push({kind:'reservation',complete:complete===true});return {status:complete?'completed':'execute'};}");
body=body.replace('return {adapters,context,inputs,native,pending,ids,source:s,clubSource:cs,rawStore','return {flowEvents,authorize,calendars,adapters,context,inputs,native,pending,ids,source:s,clubSource:cs,rawStore');
const imports=[['createMapSourceAuthorizer','server/map/source-access.js'],['createAutomationAdapters','server/automation/adapters.js'],['createAutomationHandler','server/automation/handler.js'],['readAutomationConfig','server/automation/config.js'],['createCalendarClient','server/google/calendar-client.js'],['readCalendarConfig,readMemberPlansConfig,CALENDAR_REQUIRED_SCOPES','server/google/calendar-config.js'],['createMapEventService,mapReadContext','server/map/events.js'],['createCalendarMapSync','server/automation/calendar-sync.js'],['createLiveRetrievalTools','tools/discord/index.js']];
const fixtureSource="import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';\n"+(await Promise.all(imports.map(async([names,path])=>`import {${names}} from ${JSON.stringify(await moduleUrl(path))};`))).join('\n')+"\nconst clubId='club@group.calendar.google.com',memberId='members@group.calendar.google.com';\n"+body+'\nexport {participationFixture};';
const fixtureFile=new URL('runtime/'+(baseline?'old':'current')+'-fixture.mjs',evidence);await mkdir(new URL('./',fixtureFile),{recursive:true});await writeFile(fixtureFile,withTaskReadFixtures(fixtureSource));const {participationFixture}=await import(fixtureFile.href);
async function fixture({pg=false}={}){
 const f=await participationFixture(),row=[...f.mapRows.values()][0];
 row.people[0].source_id=CHAT_MAP_SOURCE_ID;row.people[0].source_url=chatMapEventUrl(row.event.id,origin);row.people[0].label='PRIVATE_EXISTING_CHAT_KEEP';
 if(pg){for(const field of ['starts_at','ends_at','reported_at'])if(row.event[field])row.event[field]=row.event[field].replace('.000Z','+00:00');for(const person of row.people)for(const field of ['starts_at','ends_at','reported_at'])if(person[field])person[field]=person[field].replace('.000Z','+00:00').replace('Z','+00:00');row.event.updated_at='2026-10-22T18:29:00.653692+00:00';}
 f.before=f.clone(row);f.eventId=row.event.id;f.legacy=f.clone(row.people[0]);
 for(const tool of f.adapters.tools){const prepare=tool.prepareArguments,execute=tool.execute;tool.prepareArguments=async(...args)=>{f.flowEvents.push({kind:'prepare',name:tool.name});return prepare?prepare(...args):args[0];};tool.execute=async(...args)=>{f.flowEvents.push({kind:'dispatch',name:tool.name});return execute(...args);};}
 return f;
}
async function witness(name,data){if(!process.env.SIX_FLOW_EVIDENCE_FILE)return;let rows=[];try{rows=JSON.parse(await readFile(process.env.SIX_FLOW_EVIDENCE_FILE,'utf8'));}catch{}rows.push({name,baseline,...data});await writeFile(process.env.SIX_FLOW_EVIDENCE_FILE,JSON.stringify(rows,null,2)+'\n');}
const writeCount=f=>f.chronology.filter(row=>row.kind==='map_write').length;
const relationFacts=row=>Object.fromEntries(Object.entries(row).filter(([key])=>!['created_at','updated_at'].includes(key)));
const call=(name,id,args,ids=[])=>({id,name,arguments:name==='finish_batch'?{handledInputIds:args}:{inputIds:ids,arguments:args}}),turn=(...toolCalls)=>({stopReason:'tool_calls',toolCalls});
const bindings=request=>JSON.parse(request.messages.filter(row=>row.role==='user').findLast(row=>{try{return JSON.parse(row.content).referenceBindings;}catch{return false;}}).content).referenceBindings;
const feedback=(request,id)=>JSON.parse(request.messages.findLast(row=>row.role==='tool'&&row.toolCallId===id).content);

test('RED contract: PostgreSQL offset spelling alone causes zero Calendar projection writes and preserves the exact parent revision',async()=>{
 const f=await fixture({pg:true});await f.prepare();const before=f.clone([...f.mapRows.values()][0]);f.chronology.length=0;
 const view=await f.execute('read_map_events',{eventId:f.eventId},[f.inputs[0].uuid]);assert.equal(view.events.length,1);assert.equal(view.event_people.length,0);assert(!JSON.stringify(view).includes(f.legacy.source_url));
 const projection=await f.execute('sync_calendars_to_map',{});const result=await f.followup(),after=[...f.mapRows.values()][0];await witness('PG equivalent instants',{result:result.status,projection,mapWrites:writeCount(f),beforeRevision:before.event.updated_at,afterRevision:after.event.updated_at});
 assert.equal(result.status,'ready');assert.equal(writeCount(f),0,'Equivalent valid instants must not rewrite the map or advance CAS');assert.deepEqual(after,before);assert(!f.adapters.principal.allowedSourceIds.includes(CHAT_MAP_SOURCE_ID));assert.equal(f.network.length,0);
});

test('genuine microsecond, timezone and metadata changes retain normal writes, CAS and private-source preservation',async()=>{
 for(const variant of ['one microsecond','timezone','title','description','location','revoked source','stale CAS']){
  const f=await fixture({pg:true}),row=[...f.mapRows.values()][0],event=f.calendars.get('club@group.calendar.google.com').get('feedback123');
  if(variant==='one microsecond')row.event.starts_at='2026-10-23T19:00:00.000001+00:00';
  if(variant==='timezone')event.start.timeZone='Etc/UTC';if(variant==='title')event.summary='Changed event title';if(variant==='description')event.description='New actual provider notes';if(variant==='location')event.location='Bobst room205';if(['revoked source','stale CAS'].includes(variant))event.summary='Necessary title change';
  await f.prepare();if(variant==='revoked source')f.control.calendarRevoked=true;if(variant==='stale CAS')f.control.humanConflict=true;f.chronology.length=0;
  const projection=await f.execute('sync_calendars_to_map',{});const result=await f.followup(),after=[...f.mapRows.values()][0];
  if(['revoked source','stale CAS'].includes(variant)){assert.equal(writeCount(f),0,variant);assert(!projection.results?.some(row=>row.status==='unchanged'),variant);}
  else{assert.equal(writeCount(f),1,variant);assert.notEqual(after.event.updated_at,f.before.event.updated_at,variant);assert.deepEqual(relationFacts(after.people.find(p=>p.person_id===f.legacy.person_id)),relationFacts(f.legacy),variant);if(variant==='timezone')assert.equal(after.event.time_zone,'Etc/UTC');if(variant==='one microsecond')assert.equal(Date.parse(after.event.starts_at),Date.parse(event.start.dateTime));}
  assert.equal(f.network.length,0);
 }
});

test('invalid, missing and null saved timed values never disappear into a false unchanged comparison',async()=>{
 for(const value of ['invalid',null,undefined]){const f=await fixture({pg:true}),row=[...f.mapRows.values()][0];if(value===undefined)delete row.event.starts_at;else row.event.starts_at=value;await f.prepare();f.chronology.length=0;const projection=await f.execute('sync_calendars_to_map',{});const result=await f.followup();const outcomes=projection.results||[];assert(outcomes.length>0);assert(!outcomes.some(item=>item.status==='unchanged'));assert.equal(f.network.length,0);}
});

test('RED contract: same-event sibling patches reject the entire reply before preparation or reservation, then a grouped real retry resolves both',async()=>{
 const f=await fixture(),ids=f.pending.slice(0,2).map(row=>row.uuid);let refs,mixed,atMixed;
 const {result,requests}=await f.run([
  request=>turn(call('finish_batch','initial',bindings(request).handledInputIds.map(row=>row.ref))),
  request=>{refs=ids.map(id=>bindings(request).inputIds.find(row=>row.uuid===id).ref);return turn(...refs.map((ref,i)=>call('read_pending_task','read'+i,{taskId:ref},[ref])));},
  ()=>turn(...refs.map((ref,i)=>call('lookup_map_person','identity'+i,{provider:'discord',providerUserId:f.native[i].author,sourceId:f.source,sourceUrl:'https://discord.com/channels/100/200/'+f.native[i].id},[ref]))),
  ()=>{atMixed={events:f.flowEvents.length,writes:writeCount(f),state:f.clone([...f.mapRows.values()])};mixed=turn(call('patch_map_participation','siblingA',f.patch([0]),[refs[0]]),call('patch_map_participation','siblingB',f.patch([1]),[refs[1]]),call('read_map_events','ordinaryPeer',{eventId:f.eventId},refs));return mixed;},
  async request=>{const observed={first:feedback(request,'siblingA'),second:feedback(request,'siblingB'),peer:feedback(request,'ordinaryPeer'),events:f.flowEvents.slice(atMixed.events),mapWrites:writeCount(f)-atMixed.writes};await witness('same-parent sibling turn',observed);assert.equal(observed.first.reason,'same_event_participation_calls');assert.equal(observed.second.reason,'same_event_participation_calls');assert.equal(observed.peer.reason,'unattempted');assert.deepEqual(observed.events,[]);assert.equal(observed.mapWrites,0);assert.deepEqual([...f.mapRows.values()],atMixed.state);assert.deepEqual(request.messages.find(row=>row.role==='assistant'&&row.toolCalls?.some(call=>call.id==='siblingA')).toolCalls,mixed.toolCalls);assert(!JSON.stringify([observed.first,observed.second,observed.peer]).includes(f.legacy.source_url));return turn(call('read_map_events','saved_map_for_group',{eventId:f.eventId},refs));},
  ()=>turn(call('patch_map_participation','grouped',f.patch([0,1]),refs)),
  request=>{assert.equal(feedback(request,'grouped').sourceStatus,'applied');return turn(...refs.map((ref,i)=>call('resolve_pending_task','resolve'+i,{taskId:ref,outcome:'completed'},[ref])));},
  ()=>turn(call('finish_batch','final',[]))
 ]);
 assert.equal(result.followupStatus,'completed');assert.equal(requests.length,8);assert.equal(f.tasks.size,1);assert.equal(writeCount(f),1);assert.equal(f.chronology.filter(row=>row.kind==='task_resolve').length,2);assert.deepEqual(relationFacts([...f.mapRows.values()][0].people.find(row=>row.person_id===f.legacy.person_id)),relationFacts(f.legacy));assert.equal(f.network.length,0);await witness('grouped retry completion',{result,mapWrites:writeCount(f),pendingTasks:f.tasks.size});
});

function runner({turns,legacy=false,config={}}){
 const queue=randomUUID(),task=randomUUID(),source=randomUUID(),event=randomUUID(),person=randomUUID(),events=[],requests=[],history=[],audits=[],errors=[];let index=0;
 const principal={id:'synthetic-six-preflight',allowedSourceIds:[source]},input={uuid:queue,raw_response:{source:'discord',source_id:source,event_type:'message_created',event_id:'300',revision:'1',received_at:'2026-10-23T08:00:00Z',payload:{id:'300',guild_id:'100',channel_id:'200',author:{id:'400'},content:'Synthetic attendance'}}};
 const tools=[{name:'patch_map_participation',description:'Synthetic participation dispatch counter',idempotent:true,parameters:PARTICIPATION_PARAMETERS,prepareArguments:async args=>{events.push('prepare');return args;},execute:async args=>{events.push({eventId:args.eventId});return {status:'ready'};}},{name:'read_map_events',description:'Synthetic ordinary peer counter',readOnly:true,parameters:{type:'object',properties:{},additionalProperties:false},prepareArguments:async args=>{events.push('peer prepare');return args;},execute:async()=>{events.push('peer execute');return {status:'ready'};}}];
 const pipeline={beginCycle:async()=>{},afterInitial:async()=>({status:'ready',inputIds:[task],context:{tasks:[]}}),finishCycle:async()=>({status:'ready'}),recordExecution:async row=>history.push(structuredClone(row))};
 const store={configured:true,claim:async()=>({status:'ready',leaseToken:randomUUID(),inputs:[input]}),renew:async()=>({status:'ready'}),release:async()=>{},action:async({complete})=>{events.push(complete?'receipt complete':'reserve');return {status:complete?'completed':'execute'};},finish:async()=>({status:'ready'})};
 const handler=factory({store,tools,pipeline:legacy?undefined:pipeline,principal,authorizeEvents:async()=>true,config:{...readAutomationConfig({AGENT_AUTOMATION_ENABLED:'true'}),...config},audit:{recordEvent:async row=>audits.push(row)},now:()=>new Date('2026-10-23T08:00:00Z'),provider:{toolTurn:async request=>{requests.push(request);try{assert(index<turns.length,'Unexpected scripted request');const step=turns[index++];return step({request,queue,task,event,person});}catch(error){errors.push(error);throw error;}}}});
 return {events,requests,history,audits,run:async()=>{const result=await handler.tick();if(errors.length)throw errors[0];return result;}};
}
const scope=({request,queue})=>request.messages.some(row=>row.role==='user'&&row.content.includes('referenceBindings'))?bindings(request).inputIds[0].ref:queue;
const args=({event,person})=>({eventId:event,expectedUpdatedAt:'2026-10-23T08:00:00.000Z',changes:[{personId:person,sourceUrl:'https://discord.com/channels/100/200/300',attendanceStatus:'going'}]});
const initial=({request})=>turn(call('finish_batch','initial',bindings(request).handledInputIds.map(row=>row.ref)));
const siblingBlock=(state,n,count=16)=>turn(...Array.from({length:count},(_,i)=>i<2?call('patch_map_participation',`p${n}_${i}`,args(state),[scope(state)]):call('read_map_events',`peer${n}_${i}`,{},[scope(state)])));

test('sibling rejection consumes reply, stage, round and call-ID budgets without executing any peer',async()=>{
 let h;h=runner({turns:[initial,...Array.from({length:4},(_,n)=>state=>siblingBlock(state,n)),state=>{assert.deepEqual(h.events,[]);return turn(call('read_map_events','over65',{},[scope(state)]));}]});const capped=await h.run();assert.equal(capped.followupStatus,'call_limit');assert.equal(capped.calls,66);assert.deepEqual(h.events,[]);
 const repeated=runner({turns:[initial,state=>siblingBlock(state,0,2),state=>siblingBlock(state,0,2)]});const reused=await repeated.run();assert.equal(reused.followupStatus??reused.status,'invalid_tool_call');assert.deepEqual(repeated.events,[]);
 const rounds=runner({config:{followupRounds:2},turns:[initial,state=>siblingBlock(state,0,2),state=>siblingBlock(state,1,2)]});assert.equal((await rounds.run()).followupStatus,'round_limit');assert.deepEqual(rounds.events,[]);
 const oversized=runner({turns:[initial,state=>siblingBlock(state,0,17)]});assert.equal((await oversized.run()).followupStatus,'incomplete_batch');assert.deepEqual(oversized.events,[]);
});

test('distinct event IDs and legacy calls execute normally; invalid schema, scope and fatal protocol remain unchanged',async()=>{
 for(const legacy of [false,true]){const h=runner({legacy,turns:[...(!legacy?[initial]:[]),state=>turn(call('patch_map_participation','a',args(state),[scope(state)]),call('patch_map_participation','b',{...args(state),eventId:legacy?state.event:randomUUID()},[scope(state)])),state=>turn(call('finish_batch','final',legacy?[state.queue]:[]))]});const result=await h.run();assert.equal(result.status,'completed');assert.equal(h.events.filter(row=>typeof row==='object').length,2);}
 for(const variant of ['malformed','foreign scope','unknown tool','duplicate ID']){let h;h=runner({turns:[initial,state=>{const proposal=siblingBlock(state,0,2);if(variant==='malformed')proposal.toolCalls[1].arguments.arguments.changes='invalid';if(variant==='foreign scope')proposal.toolCalls[1].arguments.inputIds=[randomUUID()];if(variant==='unknown tool')proposal.toolCalls[1].name='hidden_tool';if(variant==='duplicate ID')proposal.toolCalls[1].id=proposal.toolCalls[0].id;return proposal;},state=>{assert.deepEqual(h.events,[]);const errors=state.request.messages.filter(row=>row.role==='tool').map(row=>JSON.parse(row.content));assert(!errors.some(error=>error.reason==='same_event_participation_calls'));return turn(call('finish_batch','final',[]));}]});const result=await h.run();assert.deepEqual(h.events,[]);assert.equal(result.followupStatus??result.status,['unknown tool','duplicate ID'].includes(variant)?'invalid_tool_call':'completed',variant);}
});

test('the unchanged six originals and failed initial history fit five full task reads, one grouped patch and five resolves within existing limits',async t=>{
 const old=new URL('../evidence/gogreek-six-existing-chat-model-20261023/',import.meta.url),read=async name=>JSON.parse(await readFile(new URL(name,old),'utf8'));
 try{await readFile(new URL('case.json',old));}catch(error){if(error.code!=='ENOENT')throw error;t.skip('Optional private historical replay fixtures are not present in this checkout; no replay result is claimed.');return;}
 const scenario=await read('case.json'),profile=await read('resource-profile.json'),oracle=await read('oracle.json'),failed=await read('results.json');
 assert.equal(digest(await readFile(new URL('case.json',old))),'172bc1ae0daba5a01020f163cf5a8296f265b1d48596e7c52b42a76b7018deec');assert.equal(digest(await readFile(new URL('oracle.json',old))),'dd4ce29abd6f353b566d9ad2e13ec67e3504fdf76f3bb9ab97ede71e7f3f4c6f');
 const inputs=structuredClone(scenario.inputs);for(const [i,entry]of profile.entries.entries()){const p=inputs[i].raw_response.payload;inputs[i].raw_response.payload={...p,...structuredClone(entry.payloadMetadata),author:{...p.author,...structuredClone(entry.payloadMetadata.author)}};}
 const {loadFixture}=await import(new URL('fixture-loader.mjs',old)),{fixture,loaderHash}=await loadFixture({sourceIds:scenario.sourceIds});
 const f=fixture({currentInput:inputs[0],currentInputs:inputs,conversation:[...scenario.context,...scenario.messages],roster:scenario.roster,fixedBuildings:scenario.buildingCatalogue}),club='club@group.calendar.google.com';
 const {createCalendarMapSync}=await import(await moduleUrl('server/automation/calendar-sync.js'));
 f.calendarEvents.get(club).set(scenario.eventId,{id:scenario.eventId,status:'confirmed',summary:'Go Greek Social',description:'Human notes: keep these exact details.',location:'683 Broadway',start:{dateTime:'2026-10-23T19:00:00Z',timeZone:'America/New_York'},end:{dateTime:'2026-10-23T21:00:00Z',timeZone:'America/New_York'},created:'2026-10-21T15:00:00Z',updated:'2026-10-22T15:00:00Z',etag:'"existing"',htmlLink:'https://calendar.google.com/calendar/event?eid='+Buffer.from(scenario.eventId+' '+club).toString('base64url')});
 const sync=createCalendarMapSync({targets:[{client:f.calendarClient,sourceId:f.clubSource,kind:'club'}],mapService:f.mapEventService,loadBuildings:async()=>scenario.buildingCatalogue,authorizeParticipation:async()=>true,now:()=>new Date(scenario.workerClock)});assert((await sync.sync({principal:f.adapters.principal,window:{timeMin:'2026-10-23T00:00:00Z',timeMax:'2026-10-24T00:00:00Z'}})).complete);
 let row=[...f.mapRows.values()][0];const strip=row=>Object.fromEntries(Object.entries(row).filter(([key,value])=>!['event_id','created_at','updated_at'].includes(key)&&value!==null));
 const people=scenario.context.slice(1).map(m=>({person_id:scenario.roster.find(p=>p.discord_user_id===m.author).id,attendance_status:'going',presence_basis:'planned',label:m.author==='1100'?'Helping with check-in':'Existing attendee',source_id:f.source,source_url:'https://discord.com/channels/100/200/'+m.id,reported_at:m.at}));assert.equal((await f.mapEventService.upsert({principal:f.adapters.principal,event:strip(row.event),buildings:[{building_id:'683-broadway',location_notes:'Lobby; use the side entrance.'}],people,expectedUpdatedAt:row.event.updated_at})).status,'applied');
 row=[...f.mapRows.values()][0];row.event.updated_at=scenario.initialParentRevision;const hidden=row.people.find(p=>p.person_id===scenario.roster.find(p=>p.discord_user_id==='1100').id);hidden.source_id=CHAT_MAP_SOURCE_ID;hidden.source_url=chatMapEventUrl(row.event.id,origin);const before=structuredClone(row),calendarsBefore=structuredClone(Object.fromEntries([...f.calendarEvents].map(([id,rows])=>[id,[...rows.values()]])));
 const visible=await f.mapEventService.read({eventId:row.event.id,principal:f.adapters.principal});assert.equal(row.people.length,2);assert.equal(visible.event_people.length,1);assert(!f.adapters.principal.allowedSourceIds.includes(CHAT_MAP_SOURCE_ID));f.chronology.length=0;
 const report={scripted:true,inferenceRequests:0,loaderHash,caseHash:digest(await readFile(new URL('case.json',old))),oracleHash:digest(await readFile(new URL('oracle.json',old))),claimedBytes:Buffer.byteLength(JSON.stringify(inputs)),messages:[],tools:[],execution:[],taskChains:{},transcriptPeak:0,reconstructedAfterResultPeak:0,executionBytes:0,taskBytes:0,modelProposals:[]};
 let initialIndex=0,step='read',activeMessages=[],activeCalls=[],grouped=false;
 const taskContributors=()=>[...f.tasks.values()].map(task=>({taskId:task.uuid,taskBytes:Buffer.byteLength(JSON.stringify(task)),infoFields:Object.fromEntries(Object.entries(task.info).map(([key,value])=>[key,Buffer.byteLength(JSON.stringify(value))])),minimumDoubleEncodedFullTaskDataBytes:Buffer.byteLength(JSON.stringify(JSON.stringify(canonicalJson({status:'ready',task}))))}));
 const tasks=new Map(),fragments=new Map();
 const rebind=(calls,request)=>{const advertised=bindings(request);return calls.map(c=>{const value=structuredClone(c);if(c.name==='finish_batch'){value.arguments.handledInputIds=value.arguments.handledInputIds.map(id=>advertised.handledInputIds[Number(id.match(/_(\d+)$/)[1])-1].ref);value.arguments.noChangeInputIds=[advertised.handledInputIds.find(binding=>binding.uuid===inputs[0].uuid).ref];}else value.arguments.inputIds=value.arguments.inputIds.map(id=>advertised.inputIds[Number(id.match(/_(\d+)$/)[1])-1].ref);return value;});};
 const provider={toolTurn:async request=>{
  report.transcriptPeak=Math.max(report.transcriptPeak,Buffer.byteLength(JSON.stringify(request.messages)));report.messages.push({phase:request.system.includes('FOLLOWUP phase')?'followup':'initial',bytes:Buffer.byteLength(JSON.stringify(request.messages))});let calls;
  if(initialIndex<5){calls=rebind(failed.proposals[initialIndex].calls,request);if(initialIndex===3){const ref=bindings(request).inputIds.find(b=>b.uuid===inputs[5].uuid).ref;calls.push(call('defer_task','explicit_fifth_own_task',{summary:'Ellis replies mememe to the Go Greek attendance question, affirming their own full-event attendance.',operation:'participation',calendarKind:'club',calendarEventId:scenario.eventId,personId:oracle.expectedNewPeople.find(p=>p.authorId==='800').personId},[ref]));}initialIndex++;}
  else if(step==='read'){const refs=bindings(request).inputIds;assert.equal(refs.length,5);report.storedTaskContributors=taskContributors();for(const b of refs)tasks.set(b.uuid,{ref:b.ref,text:'',next:undefined,pieces:0});calls=refs.map((b,i)=>call('read_pending_task','full_read_'+i,{taskId:b.ref},[b.ref]));step='continue';}
  else if(step==='continue'){
   const remaining=[...tasks.values()].filter(t=>t.next!==null);if(remaining.length)calls=remaining.map((t,i)=>call('read_context_fragment','continuation_'+report.messages.length+'_'+i,{id:t.fragmentId,offset:t.next},[t.ref]));
   else{step='resolve';grouped=true;calls=[call('patch_map_participation','five_grouped',{eventId:before.event.id,expectedUpdatedAt:[...f.mapRows.values()][0].event.updated_at,changes:oracle.expectedNewPeople.map(p=>({personId:p.personId,sourceUrl:p.sourceUrl,attendanceStatus:'going',...(p.approximateArrival?{start:{anchor:'event_start',offsetMinutes:60},label:'Arriving around 4 PM'}:{})}))},[...tasks.values()].map(t=>t.ref))];}
  }else if(step==='resolve'){assert.equal(feedback(request,'five_grouped').sourceStatus,'applied');step='finish';calls=[...tasks.values()].map((t,i)=>call('resolve_pending_task','resolve_five_'+i,{taskId:t.ref,outcome:'completed'},[t.ref]));}
  else{assert.equal(step,'finish');step='done';calls=[call('finish_batch','finish_five',[])];}
  const proposed=turn(...calls);report.modelProposals.push(structuredClone(proposed));activeCalls=calls;activeMessages=[...structuredClone(request.messages),{role:'assistant',content:'',toolCalls:structuredClone(calls)}];return proposed;
 }};
 const tools=f.adapters.tools.map(tool=>({...tool,execute:async(args,context)=>{const entry={name:tool.name,arguments:structuredClone(args),inputIds:context.inputIds};entry.result=await tool.execute(args,context);report.tools.push(entry);for(const t of f.tasks.values())report.taskBytes=Math.max(report.taskBytes,Buffer.byteLength(JSON.stringify(t)));if(['read_pending_task','read_context_fragment'].includes(tool.name)&&entry.result.status==='ready'){
   let t=tool.name==='read_pending_task'?tasks.get(args.taskId):fragments.get(args.id);assert(t);const fragment=entry.result.fragment;if(fragment){assert.equal(fragment.offset,t.text.length);t.text+=fragment.data;t.next=fragment.nextOffset;t.fragmentId=fragment.id;t.pieces++;fragments.set(fragment.id,t);if(t.next===null){const parsed=JSON.parse(t.text);assert.equal(parsed.task.uuid,context.inputIds[0]);report.taskChains[parsed.task.uuid]={pieces:t.pieces,totalChars:t.text.length,taskBytes:Buffer.byteLength(JSON.stringify(parsed.task))};}}else{assert.equal(entry.result.task.uuid,args.taskId);t.next=null;report.taskChains[args.taskId]={pieces:1,taskBytes:Buffer.byteLength(JSON.stringify(entry.result.task))};}}
   return entry.result;}}));
 const pipeline={...f.adapters.pipeline,recordExecution:async entry=>{report.execution.push(structuredClone(entry));report.executionBytes+=Buffer.byteLength(JSON.stringify(entry));if(entry.kind==='tool_result'){const id=entry.callId??activeCalls.find(c=>c.name===entry.tool)?.id;if(id){activeMessages.push({role:'tool',toolCallId:id,content:JSON.stringify(entry.result)});report.reconstructedAfterResultPeak=Math.max(report.reconstructedAfterResultPeak,Buffer.byteLength(JSON.stringify(activeMessages)));}}}};
 let result;try{result=await factory({...f.adapters,pipeline,tools,store:f.store,config:f.config,provider,now:()=>new Date(scenario.workerClock)}).tick();report.result=result;report.remainingTasks=f.tasks.size;report.mapWrites=f.chronology.filter(row=>row.kind==='map_write');report.followupTurns=report.messages.filter(m=>m.phase==='followup').length;
  report.storedTaskContributors??=taskContributors();
  report.initialFollowupPrefixBytes=report.messages.find(m=>m.phase==='followup').bytes;report.minimumAllFiveFullDataPlusExistingPrefix=report.initialFollowupPrefixBytes+report.storedTaskContributors.reduce((n,t)=>n+t.minimumDoubleEncodedFullTaskDataBytes,0);await witness('actual six full-evidence resource replay',report);
  assert.equal(result.followupStatus,'completed','Five full task histories must fit existing follow-up and transcript limits');assert.equal(result.handled,6);assert.equal(f.tasks.size,0);assert(grouped);assert.equal(report.mapWrites.length,1);assert.equal([...f.mapRows.values()][0].event.updated_at,report.mapWrites[0].event.updated_at);assert.equal(report.mapWrites[0].expectedUpdatedAt,scenario.initialParentRevision);assert.equal(report.followupTurns<=10,true);assert.equal(report.transcriptPeak<=262144,true);assert.equal(report.reconstructedAfterResultPeak<=262144,true);assert.equal(report.executionBytes<=1048576,true);assert.equal(report.claimedBytes,12264);assert.equal(Object.keys(report.taskChains).length,5);
  const after=[...f.mapRows.values()][0];assert.equal(after.people.length,7);for(const oldPerson of before.people)assert.deepEqual(after.people.find(p=>p.person_id===oldPerson.person_id),oldPerson);for(const expected of oracle.expectedNewPeople){const person=after.people.find(p=>p.person_id===expected.personId);assert(person);assert.equal(person.attendance_status,'going');assert.equal(person.source_url,expected.sourceUrl);assert.equal(Date.parse(person.starts_at??after.event.starts_at),Date.parse(expected.start));assert.equal(Date.parse(person.ends_at??after.event.ends_at),Date.parse(expected.end));if(expected.approximateArrival)assert.match(person.label,/around/i);}assert.deepEqual(Object.fromEntries([...f.calendarEvents].map(([id,rows])=>[id,[...rows.values()]])),calendarsBefore);
 }finally{await writeFile(new URL('resource-replay-last.json',evidence),JSON.stringify(report,null,2)+'\n');}
});
