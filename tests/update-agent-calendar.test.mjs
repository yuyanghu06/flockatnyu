import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createAutomationHandler} from '../server/automation/handler.js';
import {readAutomationConfig} from '../server/automation/config.js';
import {createBoundedResults} from '../server/automation/bounded-result.js';

const sourceId='10000000-0000-4000-8000-000000000001';
const clock=()=>new Date('2026-10-17T21:00:00Z');
const enabled=()=>readAutomationConfig({AGENT_AUTOMATION_ENABLED:'true'});
const row=()=>({uuid:randomUUID(),raw_response:{source:'gmail',source_id:sourceId,event_type:'email_received_metadata',event_id:'abc123',revision:'1',received_at:clock().toISOString(),payload:{messageId:'abc123'}}});
function handlerHarness({prepareBatch,claimStatus='ready',providerTurn,adapters={}}={}) {
 const input=row(),events=[];let preparations=0,finished=false,turns=0;
 const tool={name:'read_safe',description:'Read context',readOnly:true,parameters:{type:'object',properties:{},additionalProperties:false},execute:async()=>({status:'ready'})};
 const store={configured:true,claim:async()=>{events.push('claim');return claimStatus==='ready'?{status:'ready',leaseToken:randomUUID(),inputs:[input]}:{status:claimStatus};},renew:async()=>({status:'ready'}),finish:async()=>{finished=true;events.push('finish');return {status:'ready'};},release:async()=>{events.push('release');return {status:'ready'};},action:async({complete}={})=>({status:complete?'completed':'execute'})};
 const defaultPrep=async()=>{events.push('prepare');return {status:'ready',generation:++preparations};};
 const handler=createAutomationHandler({store,config:enabled(),principal:{id:'update-service'},now:clock,authorizeEvent:async()=>true,tools:[tool],prepareBatch:prepareBatch===undefined?defaultPrep:async args=>{events.push('prepare');preparations++;return prepareBatch(args);},cleanupBatch:async()=>events.push('cleanup'),provider:{toolTurn:async request=>{events.push('model');turns++;if(providerTurn)return providerTurn(request,input);return {stopReason:'tool_calls',toolCalls:[{id:'finish_'+turns,name:'finish_batch',arguments:{handledInputIds:[input.uuid]}}]};}},...adapters});
 return {handler,input,events,finished:()=>finished,preparations:()=>preparations};
}

test('No eligible queue claim means no Miro preparation or model invocation',async()=>{
 for(const claimStatus of ['empty','waiting','busy','cooldown']){
  const h=handlerHarness({claimStatus});assert.equal((await h.handler.tick()).status,claimStatus);assert(!h.events.includes('prepare'));assert(!h.events.includes('model'));assert(!h.finished());
 }
});

test('Each eligible run prepares fresh Miro context before model, supplies prompt constraints, and expires it',async()=>{
 let generation=0;const h=handlerHarness({prepareBatch:async()=>({status:'ready',generation:++generation}),providerTurn:(request,input)=>{
  const payload=JSON.parse(request.messages[0].content);assert.equal(payload.batchContext.generation,generation);
  assert.match(request.system,/untrusted evidence/);assert.match(request.system,/Miro/i);assert.match(request.system,/calendar/i);assert.match(request.system,/cancel/i);
  return {stopReason:'tool_calls',toolCalls:[{id:'done_'+generation,name:'finish_batch',arguments:{handledInputIds:[input.uuid]}}]};
 }});
 assert.equal((await h.handler.tick()).status,'completed');assert.equal((await h.handler.tick()).status,'completed');assert.equal(generation,2);
 assert(h.events.indexOf('prepare')<h.events.indexOf('model'));assert.equal(h.events.filter(e=>e==='cleanup').length,2);
});

test('Failed, malformed, or oversized batch preparation preserves inputs without model or Calendar writes',async()=>{
 for(const prepareBatch of [async()=>{throw Error('synthetic-private-error');},async()=>({status:'unavailable'}),async()=>null,async()=>({status:'ready',huge:'界'.repeat(30000)})]){
  const h=handlerHarness({prepareBatch});const result=await h.handler.tick();assert.notEqual(result.status,'completed');assert(!JSON.stringify(result).includes('private'));assert(!h.events.includes('model'));assert(!h.finished());assert(h.events.includes('release'));
 }
});

test('A concurrent tick does not prepare a second board read while the first model run is busy',async()=>{
 let resume;const h=handlerHarness({prepareBatch:async()=>({status:'ready'}),providerTurn:()=>new Promise(resolve=>{resume=resolve;})});
 const first=h.handler.tick();while(!resume)await new Promise(resolve=>setTimeout(resolve,0));assert.equal((await h.handler.tick()).status,'busy');assert.equal(h.preparations(),1);resume({stopReason:'stop',toolCalls:[]});assert.equal((await first).status,'incomplete_batch');
});

test('UTF-8 bounded result fragments preserve original status, complete content, continuation and expiry',async()=>{
 const b=createBoundedResults();
 const original={status:'ready',sourceStatus:'partial',coverage:{complete:false,reason:'incomplete_pagination'},boardContext:{text:'🗽界\\\"\n'.repeat(7000),nextCursor:'next_page'}};
 let fragment=b.bound(original),raw='',offset=0,count=0;
 do {
  assert(Buffer.byteLength(JSON.stringify(fragment))<=16384);assert.equal(fragment.sourceStatus,'partial');assert.equal(fragment.coverage.complete,false);assert.equal(fragment.coverage.sourceCoverage.reason,'incomplete_pagination');assert.equal(fragment.fragment.offset,offset);
  raw+=fragment.fragment.data;offset=fragment.fragment.nextOffset;count++;
  if(offset!==null)fragment=await b.tool.execute({id:fragment.fragment.id,offset});
 }while(offset!==null);
 assert(count>1);assert.deepEqual(JSON.parse(raw),original);
 const id=fragment.fragment.id;b.clear();assert.equal((await b.tool.execute({id,offset:0})).status,'invalid_request');
});

async function adapterFixture({calendarStatus='ready',items=[],miroFailure=false,scopeRevoked=false,discordPatch={},envPatch={}}={}) {
 const {createAutomationAdapters}=await import('../server/automation/adapters.js');
 const {createMiroTools}=await import('../tools/miro/index.js');
 const {createCalendarTools}=await import('../tools/calendar/index.js');
 const calls=[];let writes=0,boardReads=0;
 const miroConfig={configured:true,boardIds:['board_1']};
 const miroStore={configured:true,authorizedBoard:async()=>({status:scopeRevoked?'forbidden':'ready',data:{board_id:'board_1',source_id:sourceId,title:'Planning',team_id:'team_1'}})};
 const liveClient={readBoard:async()=>{calls.push('miro-board');boardReads++;if(miroFailure)throw Error('synthetic fetch failure');return {id:'board_1',name:'Planning',team:{id:'team_1'}};},listItems:async(_board,options)=>{calls.push({kind:'miro-items',...options});const selected=options.type?items.filter(item=>item.type===options.type):items;return {data:selected,total:selected.length};},readItem:async(_board,id)=>items.find(item=>item.id===id)||{id,type:'frame',data:{title:'October 2026'}}};
 const miroTools=createMiroTools({config:miroConfig,store:miroStore,clientFactory:()=>liveClient,now:clock});
 const calendarClient={configured:true,calendarId:'fixture@group.calendar.google.com',preflight:async()=>{calls.push('calendar-preflight');return {status:calendarStatus,calendarId:'fixture@group.calendar.google.com',accessRole:'writer'};},upsertEvent:async args=>{writes++;calls.push({kind:'write',args});return {status:'ready',eventId:'fixture_event',outcome:'created'};},cancelEvent:async()=>{writes++;return {status:'ready'};},listEvents:async()=>({status:'ready',events:[]}),readEvent:async()=>({status:'ready',events:[]})};
 const policy={guildId:'100',revision:1,paused:false,discoveryEnabled:true,excludedCategoryIds:[],excludedChannelIds:[]};
 const channel={id:'200',guild_id:'100',parent_id:null,type:0};
 const discordConfig={configured:true,guildId:'100'};
 const discordStore={getPolicy:async()=>({status:'ready',policy:{...policy,...discordPatch.policy}}),listSyncChannels:async()=>({status:'ready',channels:[{enabled:true,guildId:'100',channelId:'200',sourceId,...discordPatch.channel}]})};
 const discordClient={getGuildChannels:async()=>[channel],getChannel:async()=>({...channel,...discordPatch.liveChannel})};
 const env={ASSISTANT_ALLOWED_SOURCE_IDS:sourceId,AGENT_GMAIL_SOURCE_ID:sourceId,...envPatch};
 const adapters=createAutomationAdapters({env,config:enabled(),now:clock,fetchImpl:async()=>{throw Error('No unmocked network allowed');},dependencies:{miroConfig,miroStore,miroTools,miroClientFactory:()=>liveClient,googleConfig:{configured:true},googleClient:{configured:true},calendarConfig:{configured:true,calendarId:calendarClient.calendarId},calendarClient,calendarTools:createCalendarTools({client:calendarClient}),discordConfig,discordStore,discordClient,discordTools:{tools:[],execute:async()=>({status:'ready'})}}});
 return {adapters,calls,writes:()=>writes,boardReads:()=>boardReads};
}
const named=(adapters,name)=>{const tool=adapters.tools.find(t=>t.name===name);assert(tool,name);return tool;};
const calendarArgs={sourceKey:'miro:board_1:item_1',sourceUrl:'https://miro.com/app/board/board_1/?moveToWidget=item_1',title:'Meeting',start:{date:'2026-10-20'},end:{date:'2026-10-21'}};
const toolCall=(name,args,input,id)=>({id,name,arguments:{inputIds:[input.uuid],arguments:args}});

test('Real handler and bundled adapter prepare Miro before model; observed evidence gates Calendar writes and cleanup',async()=>{
 const f=await adapterFixture({items:[{id:'item_1',type:'frame',data:{title:'October 2026'}}]});let n=0;
 const h=handlerHarness({adapters:f.adapters,providerTurn:(request,input)=>{
  n++;assert(f.boardReads()>0);assert(request.tools.some(t=>t.name==='upsert_calendar_event'));
  if(n===1)return {stopReason:'tool_calls',toolCalls:[toolCall('read_miro_item',{boardId:'board_1',itemId:'item_1',type:'frame'},input,'read1')]};
  if(n===2)return {stopReason:'tool_calls',toolCalls:[toolCall('upsert_calendar_event',calendarArgs,input,'write1')]};
  assert.equal(JSON.parse(request.messages.at(-1).content).outcome,'created');return {stopReason:'tool_calls',toolCalls:[{id:'done',name:'finish_batch',arguments:{handledInputIds:[input.uuid]}}]};
 }});
 assert.equal((await h.handler.tick()).status,'completed');assert.equal(f.writes(),1);
 assert.equal((await named(f.adapters,'upsert_calendar_event').execute(calendarArgs,{principal:f.adapters.principal})).status,'forbidden');
});

test('Bundled adapter fails Calendar or Miro preflight before any model action and keeps queue pending',async()=>{
 for(const options of [{calendarStatus:'permission_denied'},{miroFailure:true},{scopeRevoked:true}]){
  const f=await adapterFixture(options),h=handlerHarness({adapters:f.adapters});assert.notEqual((await h.handler.tick()).status,'completed');assert(!h.finished());assert(!h.events.includes('model'));assert.equal(f.writes(),0);
 }
});

test('Bundled adapter rejects unobserved or stale Miro source identity and supports truthful empty/partial reads',async()=>{
 const f=await adapterFixture();const a=f.adapters,c={principal:a.principal};await a.prepareBatch(c);
 assert.equal((await named(a,'upsert_calendar_event').execute(calendarArgs,c)).status,'forbidden_source');assert.equal(f.writes(),0);
 const empty=await named(a,'read_miro_board').execute({boardId:'board_1',mode:'items'},c);assert.equal(empty.status,'ready');assert.equal(empty.sourceStatus,'empty');assert.equal(empty.coverage.returnedCount,0);
 const unsupported=await named(a,'read_miro_item').execute({boardId:'board_1',itemId:'table_1',type:'table'},c);assert.equal(unsupported.status,'ready');assert.equal(unsupported.sourceStatus,'unsupported_content');assert.equal(unsupported.coverage.complete,false);assert.match(unsupported.boardContext.notice,/unavailable/);
 const other=await named(a,'read_miro_board').execute({boardId:'other',mode:'items'},c);assert.equal(other.status,'forbidden');
 a.cleanupBatch();assert.equal((await named(a,'read_miro_board').execute({boardId:'board_1'},c)).status,'forbidden');
});

test('Real Miro item reads wrapped for automation retain UTF-8 fragments within 16KiB with original coverage',async()=>{
 const f=await adapterFixture({items:[{id:'item_1',type:'text',data:{content:'界🗽'.repeat(8000)}}]});const a=f.adapters,c={principal:a.principal};await a.prepareBatch(c);
 let result=await named(a,'read_miro_item').execute({boardId:'board_1',itemId:'item_1',type:'text'},c),serialized='';
 assert(Buffer.byteLength(JSON.stringify(result))<=16384);assert.equal(result.coverage.complete,false);
 while(result.fragment){serialized+=result.fragment.data;if(result.fragment.nextOffset===null)break;result=await named(a,'read_context_fragment').execute({id:result.fragment.id,offset:result.fragment.nextOffset},c);assert(Buffer.byteLength(JSON.stringify(result))<=16384);}
 const original=JSON.parse(serialized);assert.equal(original.boardContext.format,'miro-item-fragment-v1');assert(original.boardContext.nextOffset>0);assert.equal(original.coverage.complete,false);
});

test('Bundled authorizer enforces Gmail identity and current Discord guild/channel/source/enabled/exclusion policy',async()=>{
 const f=await adapterFixture(),a=f.adapters,authorize=event=>a.authorizeEvent({event,principal:a.principal});
 assert.equal(await authorize(row().raw_response),true);
 for(const event of [{...row().raw_response,source_id:randomUUID()},{...row().raw_response,event_type:'email_deleted'},{...row().raw_response,source:'drive'}])assert.equal(await authorize(event),false);
 const event={source:'discord',source_id:sourceId,event_type:'message_created',payload:{guild_id:'100',channel_id:'200'}};assert.equal(await authorize(event),true);
 for(const patch of [{policy:{paused:true}},{policy:{excludedChannelIds:['200']}},{channel:{enabled:false}},{channel:{sourceId:randomUUID()}},{liveChannel:{guild_id:'999'}}]){
  const denied=await adapterFixture({discordPatch:patch});assert.equal(await denied.adapters.authorizeEvent({event,principal:denied.adapters.principal}),false);
 }
 assert.equal(await authorize({...event,payload:{...event.payload,guild_id:'999'}}),false);assert.equal(await authorize({...event,payload:{...event.payload,channel_id:'999'}}),false);
 const revoked=await adapterFixture({envPatch:{AGENT_GMAIL_SOURCE_ID:randomUUID()}});assert.equal(await revoked.adapters.authorizeEvent({event:row().raw_response,principal:revoked.adapters.principal}),false);
});

test('Fresh batch exposes all 37 duplicate-month/future-year frame headings without assuming board completeness',async()=>{
 const items=Array.from({length:37},(_,i)=>({id:'frame_'+i,type:'frame',data:{title:i<36?'October 2026':'October 2027'},position:{x:i*100,y:0},geometry:{width:100,height:100}}));
 const f=await adapterFixture({items}),a=f.adapters,context=await a.prepareBatch({principal:a.principal});
 assert.equal(context.miro.boards[0].frameIndex.length,37);assert.deepEqual(context.miro.boards[0].frameIndex.map(item=>item.data.title),items.map(item=>item.data.title));assert.equal(context.miro.coverage.complete,false);assert.equal(context.miro.boards[0].result.coverage.wholeBoardComplete,false);assert.equal(f.calls.find(c=>c?.kind==='miro-items').limit,50);
});

test('A new eligible batch invalidates previous live item evidence before any Calendar action',async()=>{
 const f=await adapterFixture({items:[{id:'item_1',type:'frame',data:{title:'Meeting'}}]}),a=f.adapters,c={principal:a.principal};
 await a.prepareBatch(c);await named(a,'read_miro_item').execute({boardId:'board_1',itemId:'item_1',type:'frame'},c);
 assert.equal((await named(a,'upsert_calendar_event').execute(calendarArgs,c)).status,'ready');assert.equal(f.writes(),1);
 await a.prepareBatch(c);assert.equal((await named(a,'upsert_calendar_event').execute(calendarArgs,c)).status,'forbidden_source');assert.equal(f.writes(),1);
});

test('Worker defaults to bundled adapters without loading custom code; explicit trusted custom modules remain supported',async()=>{
 const {createAutomationRuntime}=await import('../server/automation/cli.js');let imports=0,requests=0;
 const env={AGENT_AUTOMATION_ENABLED:'true',SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'synthetic-service',LLM_PROVIDER:'openai-compatible',LLM_MODEL:'fixture-model',LLM_API_KEY:'synthetic-key'};
 const fetchImpl=async()=>{requests++;throw Error('No network during construction');};
 const base=await createAutomationRuntime({env,fetchImpl,loadModule:async()=>{imports++;throw Error('Custom module not requested');}});
 assert.equal(base.status,'ready');assert.equal(imports,0);assert.equal(requests,0);
 const custom=await createAutomationRuntime({env:{...env,AGENT_AUTOMATION_ADAPTER_MODULE:'./fixture-custom.mjs'},fetchImpl,loadModule:async url=>{imports++;assert.match(url,/fixture-custom\.mjs$/);return {createAutomationAdapters:async()=>({principal:{id:'trusted-custom'},tools:[{name:'read_custom',description:'read',readOnly:true,parameters:{type:'object',properties:{},additionalProperties:false},execute:async()=>({status:'ready'})}],authorizeEvent:async()=>true})};}});
 assert.equal(custom.status,'ready');assert.equal(imports,1);assert.equal(requests,0);
});
