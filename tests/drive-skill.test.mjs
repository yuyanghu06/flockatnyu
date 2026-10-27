import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {retrieveAssistantContext,assistantAnswerPrompt} from '../server/chat/context.js';
import {createGoogleClient} from '../server/google/client.js';
import {GOOGLE_SCOPES,readGoogleConfig} from '../server/google/config.js';
import {GOOGLE_TOOLS,executeGoogleTool} from '../tools/google/index.js';
import {createAutomationHandler} from '../server/automation/handler.js';
import {createAutomationAdapters} from '../server/automation/adapters.js';
import {readAutomationConfig} from '../server/automation/config.js';
import {prepareRuntimeDeployment} from '../scripts/prepare-runtime-deploy.mjs';
import {MAP_RECORD_EXAMPLES} from '../server/map/contracts.js';
import {promptText} from '../server/prompt-loader/index.js';

const skillPath='prompts/tools/drive/navigation.md';
const markdown=await readFile(new URL('../'+skillPath,import.meta.url),'utf8');
const skill=promptText('tools/drive/navigation#skill');
const marker='TRUSTED SKILL: techatnyu-drive';
const principal={id:'synthetic-club-user',googleAccess:true};
const messages=[{role:'user',content:'Find the Dev Team fall timeline in Drive.'}];
const inputId='20000000-0000-4000-8000-000000000002';
const sourceId='10000000-0000-4000-8000-000000000001';
const otherInput='20000000-0000-4000-8000-000000000003';
const lease='50000000-0000-4000-8000-000000000005';
const clock=()=>new Date('2026-10-19T17:00:00Z');
const batch=()=>[{uuid:inputId,raw_response:{source:'gmail',source_id:sourceId,event_type:'email_received_metadata',event_id:'abc123',revision:'1',received_at:clock().toISOString(),payload:{id:'abc123'}}}];
const call=(name,args)=>({name,arguments:args});
function googleFixture(handler) {
  const requests=[];
  const client=createGoogleClient({
    config:readGoogleConfig({GOOGLE_CLIENT_ID:'synthetic-client',GOOGLE_CLIENT_SECRET:'synthetic-secret',GOOGLE_REFRESH_TOKEN:'synthetic-refresh',GOOGLE_EXPECTED_ACCOUNT_EMAIL:'club@example.com'}),
    oauthClient:{setCredentials(){},getAccessToken:async()=>({token:'synthetic-access'}),getTokenInfo:async()=>({scopes:GOOGLE_SCOPES})},
    fetchImpl:async(url,options)=>{requests.push({url:new URL(url),options});return new URL(url).pathname.endsWith('/profile')?Response.json({emailAddress:'club@example.com'}):handler(new URL(url),options);},
  });
  return {client,requests,adapter:{tools:GOOGLE_TOOLS,execute:request=>executeGoogleTool({...request,client})}};
}
function plannerFixture({plan,execute=async()=>({status:'ready',sources:[]}),authorize=async()=>true}={}) {
  const seen=[],executed=[],finished=[],actions=[];
  const tool=GOOGLE_TOOLS.find(t=>t.name==='list_drive_folder');
  const handler=createAutomationHandler({config:readAutomationConfig({AGENT_AUTOMATION_ENABLED:'true'}),principal,now:clock,
    tools:[{...tool,readOnly:true,execute:async(args,context)=>{executed.push({args,context});return execute(args,context);}}],authorizeEvent:authorize,
    store:{configured:true,claim:async()=>({status:'ready',leaseToken:lease,inputs:batch()}),renew:async()=>({status:'ready'}),release:async()=>({status:'ready'}),action:async args=>{actions.push(args);return {status:'execute'};},finish:async args=>{finished.push(args);return {status:'ready'};}},
    provider:{toolTurn:async request=>{seen.push(structuredClone({...request,signal:undefined}));return {stopReason:'tool_calls',toolCalls:await plan(request,seen.length,executed.length)};}},
  });
  return {handler,seen,executed,finished,actions};
}
const plannerCall=(id='list',ids=[inputId])=>({id,name:'list_drive_folder',arguments:{inputIds:ids,arguments:{folderId:'root_folder'}}});
const finish={id:'done',name:'finish_batch',arguments:{handledInputIds:[inputId]}};

test('chat activates the full shared skill before each type of first Drive call and isolates later requests',async()=>{
  for(const proposed of [call('search_drive',{query:'timeline'}),call('read_drive',{fileId:'abandoned_proposal'}),call('list_drive_folder',{folderId:'abandoned_proposal'})]) {
    const prompts=[],executed=[];
    const googleTools={tools:GOOGLE_TOOLS,execute:async request=>{executed.push(request);return {status:'ready',sources:[{id:'drive:verified',externalId:'verified',title:'Verified timeline',url:'https://drive.google.com/file/d/verified/view',excerpt:'Original text',contentStatus:'text_only_bounded'}]};}};
    const result=await retrieveAssistantContext({messages,principal,googleTools,provider:{planTools:async({system})=>{
      prompts.push(system);
      if(prompts.length===1){assert(!system.includes(marker));assert(!system.includes(skill));return [proposed];}
      assert(system.includes(skill),'all skill instructions precede planning under the skill');
      if(prompts.length===2){assert.equal(executed.length,0,'proposal must not execute before replan');return [call('read_drive',{fileId:'verified'})];}
      assert.equal(executed.length,1);return [];
    }}});
    assert.equal(executed.length,1);assert.equal(executed[0].arguments.fileId,'verified');
    assert(assistantAnswerPrompt(result).includes(skill));
    const unrelated=[];
    await retrieveAssistantContext({messages:[{role:'user',content:'Hi there'}],principal,googleTools,provider:{planTools:async({system})=>{unrelated.push(system);return [];}}});
    assert.equal(unrelated.length,1);assert(!unrelated[0].includes(marker));
  }
});

test('mixed proposed actions remain unexecuted until Drive activation has replanned the whole turn',async()=>{
  let plans=0,actions=0;
  const result=await retrieveAssistantContext({messages,principal,googleTools:{tools:GOOGLE_TOOLS,execute:async()=>{assert.fail('discarded Drive proposal executed');}},memoryTools:{tools:[{name:'update_memory'}],execute:async()=>{actions++;return {status:'ready'};}},provider:{planTools:async({system})=>{
    plans++;if(plans===1)return [call('update_memory',{content:'discard me'}),call('read_drive',{fileId:'unread'})];
    assert(system.includes(skill));assert.equal(actions,0);return [];
  }}});
  assert.equal(actions,0);assert.equal(result.results.length,0);
});

test('a full live folder page survives chat normalization, exact names and cursor survive followup planning',async()=>{
  const files=Array.from({length:23},(_,i)=>({id:`file_${i}`,name:i===22?'devteam / f26 / timeline\n📋 ':'Resource '+i,mimeType:i===0?'application/vnd.google-apps.folder':'application/vnd.google-apps.document',parents:['root_folder'],modifiedTime:'2026-10-19T12:00:00Z',privateProviderField:'UNSAFE_ADAPTER_VALUE'}));
  const token='opaque_+/=-';
  const f=googleFixture(url=>{
    assert.equal(url.searchParams.get('q'),"trashed = false and 'root_folder' in parents");
    return Response.json(url.searchParams.has('pageToken')?{files:[]}:{files,nextPageToken:token});
  });
  let plans=0;
  const r=await retrieveAssistantContext({messages,principal,googleTools:f.adapter,provider:{planTools:async({system})=>{
    plans++;
    if(plans<=2)return [call('list_drive_folder',{folderId:'root_folder'})];
    assert(system.includes(skill));
    const previous=JSON.parse(system.split('UNTRUSTED PREVIOUS TOOL RESULTS (JSON):\n')[1]);
    const context=previous[0].driveContext;
    assert.equal(context.entries.length,23,'navigation must not share the twelve-source citation cap');
    assert.equal(context.entries[22].name,files[22].name);assert.deepEqual(context.entries[22].parentIds,['root_folder']);
    assert.equal(context.entries[22].id,'file_22');assert.equal(context.nextPageToken,token);assert.equal(context.complete,false);
    assert(!system.includes('UNSAFE_ADAPTER_VALUE'));
    if(plans===3)return [call('list_drive_folder',{folderId:'root_folder',pageToken:context.nextPageToken})];
    assert.equal(previous[1].arguments.pageToken,token);assert.equal(previous[1].driveContext.nextPageToken,null);
    assert.equal(previous[1].driveContext.complete,false,'a continuation page alone never proves full inventory');
    return [];
  }}});
  assert.equal(r.results.length,2);assert.equal(f.requests.filter(r=>r.url.pathname==='/drive/v3/files').length,2);
  assert.equal(r.results[0].driveContext.entries.length,23);
  assert.equal(r.results[1].arguments.pageToken,token);
  assert(assistantAnswerPrompt(r).includes(files[22].name.replace(/\n/g,'\\n')));
});

test('Google access denial performs zero HTTP and failed listings preserve unknown coverage in chat',async()=>{
  const f=googleFixture(()=>assert.fail('no HTTP is authorized'));
  for(const tool of GOOGLE_TOOLS.filter(t=>/drive/.test(t.name))) {
    const args=tool.name==='read_drive'?{fileId:'synthetic'}:tool.name==='search_drive'?{query:'plan'}:{folderId:'synthetic'};
    const result=await executeGoogleTool({name:tool.name,arguments:args,principal:{id:'member',googleAccess:false},client:f.client});
    assert.equal(result.status,'forbidden');
  }
  assert.equal(f.requests.length,0);
  const failed=googleFixture(()=>new Response('synthetic private provider error',{status:403}));let plans=0;
  const result=await retrieveAssistantContext({messages,principal,googleTools:failed.adapter,provider:{planTools:async()=>++plans<=2?[call('list_drive_folder',{folderId:'root_folder'})]:[]}});
  assert.equal(result.results[0].status,'permission_denied');assert.equal(result.results[0].coverage.complete,false);
  assert.equal(result.results[0].driveContext?.complete===true,false);assert(!assistantAnswerPrompt(result).includes('synthetic private provider error'));
});

test('scoped literal search preserves the complete opaque cursor through chat followup',async()=>{
  const token='x'.repeat(2041)+'_+/=-xx',query="team's \\ plan";let pages=0,plans=0;
  assert.equal(token.length,2048);
  const f=googleFixture(url=>{
    assert.equal(url.searchParams.get('q'),"trashed = false and (fullText contains 'team\\'s \\\\ plan') and 'program_folder' in parents");
    assert.equal(url.searchParams.get('pageToken'),pages++?token:null);
    return Response.json(pages===1?{files:[],nextPageToken:token}:{files:[]});
  });
  const result=await retrieveAssistantContext({messages,principal,googleTools:f.adapter,provider:{planTools:async({system})=>{
    plans++;if(plans<=2)return [call('search_drive',{query,folderId:'program_folder'})];
    const previous=JSON.parse(system.split('UNTRUSTED PREVIOUS TOOL RESULTS (JSON):\n')[1]);
    assert.equal(previous[0].nextPageToken,token);
    return plans===3?[call('search_drive',{query,folderId:'program_folder',pageToken:previous[0].nextPageToken})]:[];
  }}});
  assert.equal(pages,2);assert.equal(result.results[1].arguments.pageToken,token);
  assert.equal(result.results[1].coverage.complete,false);
});

test('first-sheet-only evidence remains explicit through activated chat reading and final answer context',async()=>{
  const f=googleFixture(url=>url.pathname.endsWith('/export')?new Response('Name,Amount\nClub,12'):Response.json({id:'sheet',name:'Budget',mimeType:'application/vnd.google-apps.spreadsheet'}));let plans=0;
  const result=await retrieveAssistantContext({messages,principal,googleTools:f.adapter,provider:{planTools:async()=>++plans<=2?[call('read_drive',{fileId:'sheet'})]:[]}});
  assert.equal(result.sources[0].contentStatus,'first_sheet_only');assert.equal(result.sources[0].partial,true);
  assert(assistantAnswerPrompt(result).includes('FIRST SHEET ONLY'));assert(assistantAnswerPrompt(result).includes(skill));
});

test('planner replans under the full skill before execution without receipts or consumed proposal IDs; resets per batch',async()=>{
  let phase=0;
  const f=plannerFixture({plan:(request,round,executions)=>{
    const index=phase++%4;
    if(index===0){assert(!request.system.includes(marker));return [plannerCall('same_proposal_id')];}
    assert(request.system.includes(skill));
    if(index===1){assert.equal(executions,phase<=4?0:1);return [plannerCall('same_proposal_id')];}
    if(index===2){const tool=request.messages.find(m=>m.role==='tool');assert(tool);return [finish];}
    assert.fail('unexpected round');
  }});
  assert.equal((await f.handler.tick()).status,'completed');
  assert.equal(f.executed.length,1);assert.equal(f.actions.length,0);assert.equal(f.finished.length,1);
  phase=4;
  assert.equal((await f.handler.tick()).status,'completed');assert.equal(f.executed.length,2);
  assert.equal(f.seen.length,6);assert(!f.seen[3].system.includes(marker));
});

test('planner validates queued input binding before activation and rechecks authorization before a Drive read',async()=>{
  const wrong=plannerFixture({plan:(request,round)=>{assert(!request.system.includes(marker));if(round===1)return [plannerCall('wrong_binding',[otherInput])];assert.equal(JSON.parse(request.messages.at(-1).content).status,'tool_error');return [finish];}});
  assert.equal((await wrong.handler.tick()).status,'completed');assert.equal(wrong.seen.length,2);assert.equal(wrong.executed.length,0);
  let authorized=true;
  const revoked=plannerFixture({authorize:async()=>authorized,plan:(request,round)=>{if(round===1)return [plannerCall()];assert(request.system.includes(skill));authorized=false;return [plannerCall()];}});
  assert.equal((await revoked.handler.tick()).status,'forbidden');assert.equal(revoked.executed.length,0);assert.equal(revoked.finished.length,0);
});

test('bundled planner Drive tools keep batch/principal access gates and cannot mint map provenance',async()=>{
  let reads=0,writes=0;
  const adapters=createAutomationAdapters({env:{ASSISTANT_ALLOWED_SOURCE_IDS:sourceId,AGENT_GMAIL_SOURCE_ID:sourceId},config:readAutomationConfig({AGENT_AUTOMATION_ENABLED:'true'}),now:clock,fetchImpl:async()=>assert.fail('no real network'),dependencies:{
    googleConfig:{configured:true},googleClient:{configured:true,readDrive:async()=>{reads++;return {status:'ready',sources:[{id:'drive:doc',externalId:'doc',kind:'google_drive',title:'Synthetic event plan',url:'https://drive.google.com/file/d/doc/view',excerpt:'Concrete-looking but unauthorized map evidence'}]};}},
    calendarConfig:{configured:true,calendarId:'fixed'},calendarClient:{configured:true,calendarId:'fixed',preflight:async()=>({status:'ready',calendarId:'fixed',accessRole:'writer'})},calendarTools:{tools:[]},
    miroConfig:{configured:true,boardIds:['board']},miroStore:{configured:true,authorizedBoard:async()=>({status:'ready',data:{board_id:'board',source_id:sourceId,team_id:null}})},miroTools:{configured:true,transport:'mcp',tools:[],prepareBoard:async()=>({status:'ready',boardContext:{format:'synthetic-navigation'}}),execute:async()=>({status:'ready',boardContext:{boards:[{boardId:'board',sourceId,teamId:null}]}})},
    discordTools:{tools:[]},mapSourceAuthorizer:async()=>true,mapEventService:{configured:true,read:async()=>({status:'ok',events:[],event_people:[],event_buildings:[],buildings:[],people:[]}),upsert:async()=>{writes++;return {status:'applied'};}},
  }});
  const context={principal:adapters.principal,inputIds:[inputId]},read=adapters.tools.find(t=>t.name==='read_drive');
  assert(adapters.tools.length<=24);for(const name of ['search_drive','read_drive','list_drive_folder'])assert.equal(adapters.tools.find(t=>t.name===name)?.readOnly,true);
  assert.equal((await read.execute({fileId:'doc'},context)).status,'forbidden');
  assert.equal((await adapters.prepareBatch({principal:adapters.principal,inputs:batch()})).status,'ready');
  assert.equal((await read.execute({fileId:'doc'},{...context,principal:{...adapters.principal}})).status,'forbidden');assert.equal(reads,0);
  assert.equal((await read.execute({fileId:'doc'},context)).status,'ready');assert.equal(reads,1);
  assert(!adapters.principal.calendarSources.some(s=>s.provider==='google_drive'));
  const p={event:{...MAP_RECORD_EXAMPLES.event,source_id:sourceId,source_url:'https://drive.google.com/file/d/doc/view',source_record_id:'doc'},buildings:structuredClone(MAP_RECORD_EXAMPLES.buildings),people:[]};
  assert.equal((await adapters.tools.find(t=>t.name==='upsert_map_event').execute(p,context)).status,'forbidden_source');assert.equal(writes,0);
  adapters.cleanupBatch();assert.equal((await read.execute({fileId:'doc'},context)).status,'forbidden');assert.equal(reads,1);
});

test('complete default planner tool catalogue stays within the handler budget with the new Drive reads',()=>{
  const adapters=createAutomationAdapters({env:{},config:readAutomationConfig({}),fetchImpl:async()=>assert.fail('no network during construction')});
  assert(adapters.tools.length<=24);assert.equal(new Set(adapters.tools.map(t=>t.name)).size,adapters.tools.length);
  for(const name of ['search_drive','read_drive','list_drive_folder'])assert.equal(adapters.tools.find(t=>t.name===name)?.readOnly,true);
});

test('web and worker sanitized packages ship the byte-exact shared skill without the research inventory',async t=>{
  for(const service of ['web','agent-worker']) {
    const packaged=await prepareRuntimeDeployment({service});t.after(()=>rm(packaged.directory,{recursive:true,force:true}));
    assert(packaged.files.includes(skillPath));assert.equal(await readFile(join(packaged.directory,skillPath),'utf8'),markdown);
    assert.equal(packaged.files.includes('server/skills/techatnyu-drive/SKILL.md'),false);
    assert(!packaged.files.some(name=>/flock-drive-research|inventory\.json|folder-map\.json|program-navigation\.json|credential-reference-exclusions\.json/.test(name)));
  }
});
