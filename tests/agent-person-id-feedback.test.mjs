import { resourceFixture, completeResourceTasks } from './fixtures/planner-resource-regression.mjs';
import {withTaskReadFixtures} from './fixtures/planner-followup.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {CHAT_MAP_SOURCE_ID,chatMapEventUrl} from '../server/map/source-access.js';
import {PARTICIPATION_PARAMETERS} from '../server/automation/participation.js';
import {canonicalJson} from '../server/automation/validation.js';

const evidence=new URL('../evidence/gogreek-person-id-feedback-regression-20261023/',import.meta.url);
const root=new URL('../',import.meta.url),baseline=process.env.PERSON_ID_FEEDBACK_BASELINE==='1',urls=new Map();
const digest=value=>createHash('sha256').update(value).digest('hex');
async function moduleUrl(path){
 if(!baseline||!['server/automation/handler.js','server/automation/adapters.js','server/automation/prompt.js','server/automation/staged-pipeline.js','server/automation/participation.js'].includes(path))return new URL(path,root).href;
 if(urls.has(path))return urls.get(path);
 const pins=JSON.parse(await readFile(new URL('preimage-pins.json',evidence),'utf8'));
 let source=await readFile(new URL('preimages/'+path,evidence),'utf8');assert.equal(digest(source),(pins.files??pins)[path]);
 for(const match of [...source.matchAll(/from (['"])(\.[^'"]+)\1/g)]){
  const absolute=new URL(match[2],new URL(path,root)),dependency=absolute.pathname.slice(root.pathname.length);
  source=source.replace(match[0],`from ${JSON.stringify(await moduleUrl(dependency))}`);
 }
 const file=new URL('runtime/baseline/'+path.replace(/\.js$/,'.mjs'),evidence);await mkdir(new URL('./',file),{recursive:true});await writeFile(file,source);urls.set(path,file.href);return file.href;
}
const factory=(await import(await moduleUrl('server/automation/handler.js'))).createAutomationHandler;
const {readAutomationConfig}=await import(new URL('server/automation/config.js',root));
const frozen=await readFile(new URL('./staged-runtime-integration.test.mjs',import.meta.url),'utf8');
const start=frozen.indexOf('async function participationFixture('),end=frozen.indexOf('\nconst participationCall=',start);assert(start>0&&end>start);let body=frozen.slice(start,end);
const origin='https://web-production-e4edc.up.railway.app';
const oldAuthorizer="const authorize=({principal,sourceId,sourceUrl})=>!control.revoked&&principal.allowedSourceIds.includes(sourceId)&&!(control.hiddenHelper&&sourceUrl==='https://discord.com/channels/100/200/292');";
assert(body.includes(oldAuthorizer));body=body.replace(oldAuthorizer,`const authorize=createMapSourceAuthorizer({publicOrigin:${JSON.stringify(origin)},store:rawStore,now:()=>new Date(clock),calendarTargets:[{sourceId:cs,client:{configured:true,calendarId:clubId,readEvent:args=>control.calendarRevoked?Promise.resolve({status:'forbidden',events:[]}):calendarClient.readEvent(args)}}],liveDiscordService:{configured:true,readMessages:async args=>{if(control.revoked)return {status:'forbidden',sources:[]};if(args.messageId==='292')return {status:'ready',sources:[{kind:'discord',sourceId:s,url:'https://discord.com/channels/100/200/292',guildId:'100',channelId:'200',messageId:'292',authorId:'600',content:'I will help with the event.',createdAt:taskStamp,sourceUpdatedAt:taskStamp}]};return liveService.readMessages(args);}}});`);
body=body.replace('const tasks=new Map(),mapRows=', 'const flowEvents=[],tasks=new Map(),mapRows=');
body=body.replace("action:async({complete})=>({status:complete?'completed':'execute'})", "action:async({complete})=>{flowEvents.push({kind:'reservation',complete:complete===true});return {status:complete?'completed':'execute'};}");
body=body.replace('return {adapters,context,inputs,native,pending,ids,source:s,clubSource:cs,rawStore','return {flowEvents,taskStore,people,authorize,calendars,adapters,context,inputs,native,pending,ids,source:s,clubSource:cs,rawStore');
const imports=[['createMapSourceAuthorizer','server/map/source-access.js'],['createAutomationAdapters','server/automation/adapters.js'],['createAutomationHandler','server/automation/handler.js'],['readAutomationConfig','server/automation/config.js'],['createCalendarClient','server/google/calendar-client.js'],['readCalendarConfig,readMemberPlansConfig,CALENDAR_REQUIRED_SCOPES','server/google/calendar-config.js'],['createMapEventService','server/map/events.js'],['createCalendarMapSync','server/automation/calendar-sync.js'],['createLiveRetrievalTools','tools/discord/index.js']];
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
async function witness(name,data){if(!process.env.PERSON_ID_FEEDBACK_EVIDENCE_FILE)return;let rows=[];try{rows=JSON.parse(await readFile(process.env.PERSON_ID_FEEDBACK_EVIDENCE_FILE,'utf8'));}catch{}rows.push({name,baseline,...data});await writeFile(process.env.PERSON_ID_FEEDBACK_EVIDENCE_FILE,JSON.stringify(rows,null,2)+'\n');}
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
async function readAll(f,i){let result=await f.execute('read_pending_task',{detail:'full',taskId:owner(f,i)},[owner(f,i)]),text='',pieces=0;while(result.fragment){const part=result.fragment;assert.equal(part.offset,text.length);text+=part.data;pieces++;if(part.nextOffset===null){result=JSON.parse(text);break;}result=await f.execute('read_context_fragment',{id:part.id,offset:part.nextOffset},[owner(f,i)]);}assert.equal(result.task.uuid,owner(f,i));return{result,pieces};}
function noChanges(f,text='Who is going?'){f.native[2].content=text;f.inputs[2].raw_response.payload.content=text;}
async function initialCheck(f,ids,noChange=[]){return f.adapters.pipeline.validateInitialFinish({principal:f.adapters.principal,handledInputIds:ids,noChangeInputIds:noChange});}


const choiceCall=(f,ids,phase='initial',principal=f.adapters.principal)=>f.adapters.getPersonIdChoices({principal,inputIds:ids,phase});
async function disclosedLookup(f,i,{phase='initial',scope=[f.inputs[i].uuid],record=true,callId='trusted_lookup_'+i}={}){const tool=f.adapters.tools.find(t=>t.name==='lookup_map_person'),args=lookup(f,i),result=await tool.execute(args,{...f.context,inputIds:scope,callId,phase});if(record)f.history.push({kind:'tool_result',tool:'lookup_map_person',callId,stage:phase,inputIds:[...scope].sort(),arguments:f.clone(args),result:f.clone(result)});return result;}
const eligibleBody=(f,i)=>({summary:'Own participation needs followup after exact author lookup',operation:'participation',calendarKind:'club',calendarEventId:'feedback123',personId:f.ids[i]});

test('RED contract: malformed disclosed person ID returns only its own exact choice before any peer effect, then explicit resubmission saves genuine own tasks',async()=>{
 const f=await fixture();f.tasks.clear();noChanges(f);const exact='01234567-89ab-0cde-e123-456789abcdef';f.ids[0]=exact;f.people[0].id=exact;let refs,mark,raw;
 const {result}=await f.run([
  request=>{refs=queueRefs(request);return turn(call('lookup_map_person','whoA',lookup(f,0),[refs[0]]),call('lookup_map_person','whoB',lookup(f,1),[refs[1]]));},
  request=>{assert.equal(feedback(request,'whoA').person.id,exact);mark=f.flowEvents.length;raw=turn(call('defer_task','shortA',{...eligibleBody(f,0),operation:'source_review',personId:exact.slice(0,-1)},[refs[0]]),call('defer_task','validPeer',{...eligibleBody(f,1),operation:'source_review'},[refs[1]]),call('read_map_events','ordinaryPeer',{eventId:f.eventId},refs));return raw;},
  async request=>{const bad=feedback(request,'shortA'),peer=feedback(request,'validPeer'),ordinary=feedback(request,'ordinaryPeer');await witness('real exact source person choice',{bad,peer,ordinary,events:f.flowEvents.slice(mark),tasks:f.tasks.size,exact,badRaw:raw});assert.equal(bad.reason,'invalid_arguments');assert.equal(bad.validationCode,7);assert.equal(bad.schemaFieldId,42);assert(bad.exactPersonIds,'Exact own already-disclosed person-ID feedback is required');assert.equal(bad.exactPersonIds.phase,'initial');assert.equal(bad.exactPersonIds.field,'arguments.personId');assert.deepEqual(bad.exactPersonIds.choices,[exact]);assert.equal(typeof bad.exactPersonIds.instruction,'string');assert.equal(peer.reason,'unattempted');assert(!peer.exactPersonIds);assert.equal(ordinary.reason,'unattempted');assert(!ordinary.exactPersonIds);assert.deepEqual(f.flowEvents.slice(mark),[]);assert.equal(f.tasks.size,0);assert.deepEqual(request.messages.find(m=>m.role==='assistant'&&m.toolCalls?.some(c=>c.id==='shortA')).toolCalls,raw.toolCalls);return turn(call('defer_task','correctA',{...eligibleBody(f,0),operation:'source_review',personId:bad.exactPersonIds.choices[0]},[refs[0]]),call('defer_task','correctB',{...eligibleBody(f,1),operation:'source_review'},[refs[1]]));},
  request=>{assert.equal(feedback(request,'correctA').status,'ready');assert.equal(feedback(request,'correctB').status,'ready');return turn(finish('initial',refs,[refs[2]]));},
  ()=>turn(finish('followup',[]))
 ]);assert.equal(result.status,'completed');assert.equal(f.tasks.size,2);assert.equal(writeCount(f),0);assert.equal(f.network.length,0);assert([...f.tasks.values()].some(task=>task.info.request.personId===exact));
});

test('choice disclosure needs both a real exact-source lookup receipt and its own actual ready result; forged, missing, failed and fragmented disclosure cannot substitute',async()=>{
 const f=await fixture();await f.prepare();const ids=[f.inputs[0].uuid],args=lookup(f,0),forged={kind:'tool_result',tool:'lookup_map_person',callId:'forged',stage:'initial',inputIds:ids,arguments:args,result:{status:'ready',person:{id:f.ids[0]},sourceStatus:'ok'}};f.history.push(forged);assert.deepEqual(await choiceCall(f,ids),[]);f.history.length=0;
 assert.equal((await disclosedLookup(f,0,{record:false})).person.id,f.ids[0]);assert.deepEqual(await choiceCall(f,ids),[]);f.history.push({...forged,callId:'trusted_lookup_0',result:{status:'ready',fragment:{id:randomUUID(),offset:0,nextOffset:12000,data:'not disclosed'}}});assert.deepEqual(await choiceCall(f,ids),[]);f.history.length=0;
 await disclosedLookup(f,0);assert.deepEqual(await choiceCall(f,ids),[f.ids[0]]);const genuine=f.history.at(-1);for(const wrong of [{status:'tool_error',reason:'tool_failed'},{status:'ready',person:null},{status:'ready',person:{id:randomUUID()}},null]){f.history[f.history.length-1]={...genuine,result:wrong};assert.deepEqual(await choiceCall(f,ids),[]);}f.history[f.history.length-1]=genuine;assert.deepEqual(await choiceCall(f,ids),[f.ids[0]]);for(const patch of [{callId:'other_call'},{stage:'followup'},{inputIds:[f.inputs[1].uuid]},{arguments:{...genuine.arguments,sourceUrl:'https://discord.com/channels/100/200/999'}}]){f.history[f.history.length-1]={...genuine,...patch};assert.deepEqual(await choiceCall(f,ids),[]);}f.history[f.history.length-1]=genuine;f.people[0].discord_user_id='999';const noMatch=await disclosedLookup(f,0,{callId:'fresh_no_match'});assert.equal(noMatch.person,null);assert.deepEqual(await choiceCall(f,ids),[],'A later actual no-match invalidates old feedback receipt without fabricating source authority');
});

test('choices never cross native source, author, principal, input scope, phase, run or ambiguous-person boundaries',async()=>{
 const f=await fixture();await f.prepare();await disclosedLookup(f,0);assert.deepEqual(await choiceCall(f,[f.inputs[0].uuid]),[f.ids[0]]);for(const ids of [[f.inputs[1].uuid],[randomUUID()],[f.inputs[0].uuid,f.inputs[1].uuid],[]])assert.deepEqual(await choiceCall(f,ids),[]);assert.deepEqual(await choiceCall(f,[f.inputs[0].uuid],'initial',{...f.adapters.principal}),[]);assert.deepEqual(await choiceCall(f,[f.inputs[0].uuid],'followup'),[]);
 await disclosedLookup(f,1);assert.deepEqual(await choiceCall(f,[f.inputs[0].uuid,f.inputs[1].uuid]),[],'Different real authors cannot yield an arbitrary candidate list');await f.prepare();assert.deepEqual(await choiceCall(f,[f.inputs[0].uuid]),[],'New run clears feedback state');
 for(const variant of ['wrong author','wrong source','no match','failed source']){const g=await fixture();await g.prepare();const tool=g.adapters.tools.find(t=>t.name==='lookup_map_person'),args=lookup(g,0);if(variant==='wrong author')args.providerUserId='999';if(variant==='wrong source')args.sourceId=randomUUID();if(variant==='no match')g.people[0].discord_user_id='999';if(variant==='failed source'){g.control.revoked=true;await g.adapters.resolveClaimSourceIds({principal:g.adapters.principal});}const result=await tool.execute(args,{...g.context,inputIds:[g.inputs[0].uuid],callId:'unusable',phase:'initial'});g.history.push({kind:'tool_result',tool:'lookup_map_person',callId:'unusable',stage:'initial',inputIds:[g.inputs[0].uuid],arguments:args,result});assert.deepEqual(await choiceCall(g,[g.inputs[0].uuid]),[],variant);assert.equal(writeCount(g),0);}
});

test('followup choices need full current task read and fresh phase-specific disclosure; updates and cleanup revoke only feedback eligibility',async()=>{
 const f=await fixture();for(const t of f.tasks.values())t.info.batchContext={observed:'x'.repeat(16000)};await f.prepare();await disclosedLookup(f,0);await f.followup();const ids=[owner(f,0)];assert.deepEqual(await choiceCall(f,ids,'followup'),[]);const first=await f.execute('read_pending_task',{detail:'full',taskId:ids[0]},ids);assert(first.fragment);assert.deepEqual(await choiceCall(f,ids,'followup'),[]);await readAll(f,0);assert.deepEqual(await choiceCall(f,ids,'followup'),[],'Initial lookup feedback receipt cannot cross phases');await disclosedLookup(f,0,{phase:'followup',scope:ids});assert.deepEqual(await choiceCall(f,ids,'followup'),[f.ids[0]]);assert.equal((await f.execute('defer_task',{taskId:ids[0],...eligibleBody(f,0),summary:'Same own offered plan, clarified unfinished interpretation'},ids)).status,'ready');assert.deepEqual(await choiceCall(f,ids,'followup'),[],'Changed task version requires full reread');await f.prepare();assert.deepEqual(await choiceCall(f,ids,'initial'),[]);assert.equal(writeCount(f),0);assert.equal(f.network.length,0);
});

test('other invalid fields, scope, fatal protocol and unavailable optional feedback preserve atomic rejection; existing valid or omitted task person IDs remain accepted',async()=>{
 for(const variant of ['other field','foreign scope','callback absent','callback throws','unknown tool','duplicate call ID']){const f=await fixture();f.tasks.clear();for(const i of [1,2]){f.native[i].content='Who is going?';f.inputs[i].raw_response.payload.content='Who is going?';}const original=f.adapters.getPersonIdChoices;let queried=0,refs,mark;if(variant==='callback absent')delete f.adapters.getPersonIdChoices;else f.adapters.getPersonIdChoices=async args=>{queried++;if(variant==='callback throws')throw Error('Synthetic unavailable feedback');return original(args);};
  const {result}=await f.run([
   request=>{refs=queueRefs(request);return turn(call('lookup_map_person','identity',lookup(f,0),[refs[0]]));},
   ()=>{mark=f.flowEvents.length;const bad=call('defer_task','invalid',{...eligibleBody(f,0),personId:f.ids[0].slice(0,-1)},[refs[0]]);if(variant==='other field')bad.arguments.arguments.summary=7;if(variant==='foreign scope')bad.arguments.inputIds=[randomUUID()];if(variant==='unknown tool')bad.name='nonexistent_tool';const peer=call('read_map_events',variant==='duplicate call ID'?'invalid':'peer',{eventId:f.eventId},[refs[0]]);return turn(bad,peer);},
   request=>{assert(!feedback(request,'invalid').exactPersonIds);assert(!feedback(request,'peer').exactPersonIds);assert.deepEqual(f.flowEvents.slice(mark),[]);assert.equal(queried,variant==='callback throws'?1:0);return turn(call('defer_task','legit',{...eligibleBody(f,0),operation:'source_review'},[refs[0]]));},
   ()=>turn(finish('initial',refs,refs.slice(1))),()=>turn(finish('end',[]))
  ]);if(['unknown tool','duplicate call ID'].includes(variant)){assert.equal(result.followupStatus??result.status,'invalid_tool_call');assert.equal(queried,0);assert.deepEqual(f.flowEvents.slice(mark),[]);}else assert.equal(result.status,'completed',variant);assert.equal(writeCount(f),0);
 }
 const old=await fixture();old.tasks.clear();await old.prepare();assert.equal((await old.execute('defer_task',eligibleBody(old,0),[old.inputs[0].uuid])).status,'ready','Valid existing target schema does not require a new person lookup');const optional=eligibleBody(old,1);delete optional.personId;assert.equal((await old.execute('defer_task',optional,[old.inputs[1].uuid])).status,'ready','Task personId stays optional');assert.equal(old.tasks.size,2);assert.deepEqual(await choiceCall(old,[old.inputs[0].uuid]),[]);
});

test('feedback does not reset ordinary call-ID replay or stage budgets and never dispatches rejected tasks',async()=>{
 const f=await fixture();f.tasks.clear();let refs,mark;const blocks=Array.from({length:4},(_,n)=>()=>turn(...Array.from({length:n===3?15:16},(_,i)=>call('defer_task',`bad_${n}_${i}`,{...eligibleBody(f,0),personId:f.ids[0].slice(0,-1)},[refs[0]]))));const {result,requests}=await f.run([request=>{refs=queueRefs(request);return turn(call('lookup_map_person','known',lookup(f,0),[refs[0]]));},request=>{mark=f.flowEvents.length;return blocks[0](request);},...blocks.slice(1),request=>{assert.equal(request.messages.filter(m=>m.role==='assistant').reduce((n,m)=>n+(m.toolCalls?.length||0),0),64);return turn(call('defer_task','over65',{...eligibleBody(f,0),personId:f.ids[0].slice(0,-1)},[refs[0]]));}]);assert.equal(result.status,'call_limit');assert.equal(requests.length,6);assert.deepEqual(f.flowEvents.slice(mark),[]);assert.equal(f.tasks.size,0);
 const repeated=await fixture();repeated.tasks.clear();let r;const {result:replay}=await repeated.run([request=>{r=queueRefs(request);return turn(call('lookup_map_person','known',lookup(repeated,0),[r[0]]));},()=>turn(call('defer_task','same',{...eligibleBody(repeated,0),personId:repeated.ids[0].slice(0,-1)},[r[0]])),()=>turn(call('defer_task','same',eligibleBody(repeated,0),[r[0]]))]);assert.equal(replay.status,'invalid_tool_call');assert.equal(repeated.tasks.size,0);assert.equal(writeCount(repeated),0);
});

test('two malformed five-person replies remain retained before explicit corrected resubmission and complete synthetic full-task recovery', async () => {
  const report = await completeResourceTasks(resourceFixture({ savedTasks: false }), { malformedTwice: true });
  assert.equal(report.malformed.length, 2);
  assert(report.malformed.every(calls => calls[4].arguments.arguments.personId.length === 35));
});
