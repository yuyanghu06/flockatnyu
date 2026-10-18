import test from 'node:test';
import assert from 'node:assert/strict';
import {assistantPlanningPrompt,assistantAnswerPrompt,retrieveAssistantContext} from '../server/assistant-context.js';
import {createApp} from '../server/app.js';
import {readConfig} from '../server/config.js';
import {createMapTools} from '../tools/map/index.js';
import {createChatMapTools} from '../tools/map/chat.js';
import {MAP_RECORD_EXAMPLES} from '../server/map/contracts.js';
import {createChatCalendarTools} from '../tools/calendar/chat.js';

const sourceId = MAP_RECORD_EXAMPLES.event.source_id, personId = MAP_RECORD_EXAMPLES.people[0].person_id;
const sourceUrl = 'https://discord.com/channels/123/456/789';
const principal = {id:'chat-fixture',allowedSourceIds:[sourceId]};
const now = '2026-10-18T16:00:00Z', timeZone = 'America/New_York';
const messages = [{role:'user',content:'Use this original Discord message to add the study plan to the map.'}];
const source = {kind:'discord',retrieval:'live',sourceId,url:sourceUrl,guildId:'123',channelId:'456',messageId:'789',authorId:'567',excerpt:'I am studying at Bobst',title:'Study plan'};
const snapshot = {events:[],event_buildings:[],event_people:[],buildings:[{id:'bobst-library',name:'Bobst Library'}],people:[],event_types:[{code:'study',name:'Study',description:'',icon_key:'study',sort_order:1}]};
const writeArgs = () => structuredClone({event:{...MAP_RECORD_EXAMPLES.event,source_url:sourceUrl},buildings:MAP_RECORD_EXAMPLES.buildings,people:MAP_RECORD_EXAMPLES.people.map(p=>({...p,source_url:sourceUrl}))});
const plan = [
  {name:'read_discord_messages',arguments:{channelId:'456',messageId:'789'}},
  {name:'read_map_events',arguments:{sourceId,sourceRecordId:MAP_RECORD_EXAMPLES.event.source_record_id}},
  {name:'lookup_map_person',arguments:{provider:'discord',providerUserId:'567',sourceId,sourceUrl}},
  {name:'upsert_map_event',arguments:null},
];
function fixture({writeStatus='applied',mapSnapshot=snapshot,readSource=source}={}) {
  let writes=0;
  const mapTools=createChatMapTools({mapTools:createMapTools({service:{configured:true,
    read:async()=>({status:'ok',...structuredClone(mapSnapshot),privateCredential:'do-not-forward'}),
    lookup:async()=>({status:'ok',person:{id:personId,display_name:'Fixture member',is_trackable:true,secret:'do-not-forward'}}),
    upsert:async()=>{writes++;return {status:writeStatus,event_id:'00000000-0000-0000-0000-000000000099',updated_at:now,secret:'do-not-forward'};},
  }})});
  const liveTools={tools:[{name:'read_discord_messages',parameters:{type:'object',properties:{}}}],execute:async options=>{
    assert.equal(options.userMessage,messages[0].content);return {status:'ready',sources:[readSource]};
  }};
  return {mapTools,liveTools,writes:()=>writes};
}
function providerFor(calls,onAnswer=()=>{}) {
  let round=0;
  return {planTools:async({system,tools})=>{
    assert(tools.some(tool=>tool.name==='upsert_map_event'));
    if(round===2)assert(system.includes('"mapContext"'));
    if(round===3)assert(system.includes('"mapPerson"'));
    const call=calls[round++];return call ? [{...call,arguments:call.arguments || writeArgs()}] : [];
  },async *stream({system}){onAnswer(system);yield 'Recorded the source-backed plan.';}};
}

test('chat prompts encode calm tone, eboard first, explicit team opt-in and Calendar-first fallback distinctions',()=>{
  const planning=assistantPlanningPrompt({now,timeZone}),answer=assistantAnswerPrompt({now,timeZone});
  for(const prompt of [planning,answer]) {
    assert.match(prompt,/eboard channels FIRST/);assert.match(prompt,/CURRENT user explicitly requests/);
    assert.match(prompt,/general\/non-team channels only as a secondary fallback/);
    assert.match(prompt,/Never read blacklisted leadership/);assert.match(prompt,/Google Calendar FIRST/);
    assert.match(prompt,/successfully empty or unavailable, automatically check Miro/);
    assert.match(prompt,/failure is not an empty calendar/);assert.match(prompt,/partial Calendar page does not establish absence/);
  }
  assert.match(answer,/calm, friendly, helpful and natural tone/);assert.match(answer,/without sounding sharp, scolding or abrupt/);
  assert.match(planning,/never invent one, reuse debug provenance/);assert.match(answer,/mapWrite contains an applied receipt/);
  assert.match(answer,/No email sends, Discord posts/);assert.match(answer,/Miro writes/);
  assert.match(answer,/Calendar changes require the explicit user-directed write tools and a successful receipt/);
});

test('actual chat planning reaches source read, catalogue, identity and write, retaining safe complete results and receipt',async()=>{
  const f=fixture(),context=await retrieveAssistantContext({messages,principal,provider:providerFor(plan),...f,now,timeZone});
  assert.equal(f.writes(),1);assert.equal(context.results.length,4);
  assert.equal(context.results[1].mapContext.complete,true);assert.deepEqual(context.results[1].mapContext.buildings,snapshot.buildings);
  assert.equal(context.results[2].mapPerson.id,personId);
  assert.deepEqual(context.results[3].mapWrite,{outcome:'applied',eventId:'00000000-0000-0000-0000-000000000099',updatedAt:now});
  assert(!JSON.stringify(context).includes('do-not-forward'));
  assert(assistantAnswerPrompt({...context,now,timeZone}).includes('"outcome":"applied"'));
});

test('map conflicts, denied writes and missing receipts cannot become successful answer receipts',async()=>{
  for(const writeStatus of ['conflict','forbidden','unavailable','ready']) {
    const f=fixture({writeStatus});
    const context=await retrieveAssistantContext({messages,principal,provider:providerFor(plan),...f,now,timeZone});
    assert.equal(context.results.at(-1).status,writeStatus);assert.equal(context.results.at(-1).mapWrite,undefined);
    const prompt=assistantAnswerPrompt({...context,now,timeZone});assert.match(prompt,/missing receipt or failed write is not a saved change/);
  }
});

test('a bare chat assertion, prior turn evidence or Miro search heading cannot authorize map writes',async()=>{
  const f=fixture();
  for(const readSource of [null,{...source,kind:'miro',retrievalMode:'live',contentAvailable:false}, {...source,partial:true}]) {
    const local=readSource ? fixture({readSource}) : f;
    const calls=readSource ? [...plan] : plan.slice(1);let round=0;
    const context=await retrieveAssistantContext({messages,principal,provider:{planTools:async()=>{
      const call=calls[round++];return call ? [{...call,arguments:call.arguments || writeArgs()}] : [];
    }},...local,now,timeZone});
    assert.equal(context.results.at(-1).status,'forbidden_source');
    assert.equal(local.writes(),0);
  }
  // A separate request has no inherited evidence or identity receipts.
  let n=0;
  const context=await retrieveAssistantContext({messages,principal,provider:{planTools:async()=>n++===0?[{name:'read_map_events',arguments:{}}]:n===2?[{name:'upsert_map_event',arguments:writeArgs()}]:[]},mapTools:f.mapTools,now,timeZone});
  assert.equal(context.results.at(-1).status,'forbidden_source');assert.equal(f.writes(),0);
});

test('oversized map snapshots are withheld as a whole and cannot support an upsert',async()=>{
  const f=fixture({mapSnapshot:{...snapshot,events:[{id:'large',notes:'x'.repeat(65000)}]}});
  let n=0;
  const context=await retrieveAssistantContext({messages,principal,provider:{planTools:async()=>n++===0?[{name:'read_map_events',arguments:{}}]:[]},...f,now,timeZone});
  assert.deepEqual(context.results[0].mapContext,{complete:false,reason:'snapshot_too_large_use_event_or_source_filter'});
  assert.equal(context.results[0].possiblyTruncated,true);assert(!JSON.stringify(context).includes('xxxxx'));
});

test('request evidence binds identities to their original author and rejects missing reads and participant loss',async()=>{
  const f=fixture(),request=f.mapTools.createRequest();
  request.observe('read_discord_messages',{status:'ready',sources:[source]});
  const lookup={name:'lookup_map_person',arguments:{provider:'discord',providerUserId:'999',sourceId,sourceUrl},principal};
  assert.equal((await request.execute(lookup)).status,'forbidden_source');
  lookup.arguments.providerUserId='567';assert.equal((await request.execute(lookup)).status,'ready');
  assert.equal((await request.execute({name:'upsert_map_event',arguments:writeArgs(),principal})).status,'forbidden_source');
  const existing={...writeArgs().event,id:'00000000-0000-0000-0000-000000000099',updated_at:now};
  const g=fixture({mapSnapshot:{...snapshot,events:[existing],event_buildings:writeArgs().buildings.map(row=>({...row,event_id:existing.id})),event_people:writeArgs().people.map(row=>({...row,event_id:existing.id}))}});
  const session=g.mapTools.createRequest();await session.execute({name:'read_map_events',arguments:{eventId:existing.id},principal});
  const update={...writeArgs(),event:{...writeArgs().event,id:existing.id},expectedUpdatedAt:now,people:[]};
  assert.equal((await session.execute({name:'upsert_map_event',arguments:update,principal})).status,'forbidden_source');
  update.expectedUpdatedAt='2026-10-17T16:00:00Z';
  assert.equal((await session.execute({name:'upsert_map_event',arguments:update,principal})).status,'conflict');
  assert.equal(g.writes(),0);
});

test('actual Miro content can support an event but board/search navigation cannot',async()=>{
  const miroSource={...source,kind:'miro',retrievalMode:'live',contentAvailable:true,evidenceKind:'item',sourceKey:'miro:board=:100',boardId:'board=',itemId:'100',url:'https://miro.com/app/board/board%3D/?moveToWidget=100'};
  for(const [name,contentAvailable,expected] of [['read_miro_board',true,'forbidden_source'],['read_miro_item',false,'forbidden_source'],['read_miro_item',true,'ready']]) {
    const f=fixture(),request=f.mapTools.createRequest();
    request.observe(name,{status:'ready',sources:[{...miroSource,contentAvailable}]});
    await request.execute({name:'read_map_events',arguments:{},principal});
    const args=writeArgs();args.event.source_url=miroSource.url;args.people=[];
    const result=await request.execute({name:'upsert_map_event',arguments:args,principal});
    assert.equal(result.status,expected);assert.equal(f.writes(),expected==='ready'?1:0);
  }
});

test('extended map workflows execute at most eight calls with sequential progress IDs',async()=>{
  let executions=0,rounds=0;const events=[];
  const mapTools={tools:[{name:'read_map_events'}],execute:async()=>{executions++;return {status:'ready',...snapshot};}};
  await retrieveAssistantContext({messages,principal,now,timeZone,mapTools,onToolEvent:e=>events.push(e),
    provider:{planTools:async()=>{rounds++;return [0,1].map(i=>({name:'read_map_events',arguments:{sourceRecordId:`unique-${rounds}-${i}`}}));}}});
  assert.equal(executions,8);assert.equal(rounds,4);assert.equal(events.at(-1).id,'tool-8');
});

test('bounded Gmail body reads expose configured provenance and bind identity to the original sender',async()=>{
  const f=fixture(),tools=createChatMapTools({mapTools:f.mapTools,gmailSourceId:sourceId}),request=tools.createRequest();
  const gmail={kind:'gmail',externalId:'abc',url:'https://mail.google.com/mail/u/0/#all/abc',from:'Club member <member@example.com>',partial:true,contentStatus:'text_only_bounded',excerpt:'I will study at Bobst'};
  const result=request.observe('read_gmail',{status:'ready',sources:[gmail]});
  assert.equal(result.sources[0].sourceId,sourceId);
  const denied=await request.execute({name:'lookup_map_person',arguments:{provider:'email',providerUserId:'other@example.com',sourceId,sourceUrl:gmail.url},principal});
  assert.equal(denied.status,'forbidden_source');
  const noBody=tools.createRequest();noBody.observe('search_gmail',{status:'ready',sources:[{...gmail,contentStatus:'snippet_only'}]});
  assert.equal((await noBody.execute({name:'lookup_map_person',arguments:{provider:'email',providerUserId:'member@example.com',sourceId,sourceUrl:gmail.url},principal})).status,'forbidden_source');
});

test('fully dependent source fallback and map read/lookup/write can reach the eighth planning round',async()=>{
  let round=0,executions=0;
  const names=['list_calendar_events','list_miro_boards','read_miro_board','read_miro_item','read_discord_messages','read_map_events','lookup_map_person','upsert_map_event'];
  const adapter=tools=>({tools:tools.map(name=>({name})),execute:async()=>{executions++;return {status:'ready',sources:[]};}});
  await retrieveAssistantContext({messages,principal,now,timeZone,googleTools:adapter(names.slice(0,1)),miroTools:adapter(names.slice(1,4)),liveTools:adapter(names.slice(4,5)),mapTools:adapter(names.slice(5)),
    provider:{planTools:async()=>round<names.length?[{name:names[round++],arguments:{}}]:[]}});
  assert.equal(executions,8);assert.equal(round,8);
});

test('Calendar empty/failure can reach automatic Miro content fallback after four dependent reads',async()=>{
  for(const calendarStatus of ['ready','permission_denied']) {
    const calls=['list_calendar_events','list_miro_boards','read_miro_board','read_miro_item'];let n=0;
    const result=await retrieveAssistantContext({messages:[{role:'user',content:'What is happening this week?'}],principal,now,timeZone,
      provider:{planTools:async()=>n<calls.length?[{name:calls[n++],arguments:{}}]:[]},
      googleTools:{tools:[{name:calls[0]}],execute:async()=>({status:calendarStatus,calendarContext:{events:[],nextPageToken:null},sources:[]})},
      miroTools:{tools:calls.slice(1).map(name=>({name})),execute:async({name})=>({status:'ready',boardContext:{content:name==='read_miro_item'?'Actual week cells':'navigation'},sources:[]})}});
    assert.deepEqual(result.results.map(r=>r.tool),calls);assert.equal(result.results[0].status,calendarStatus);
    assert.equal(result.results.at(-1).boardContext.content,'Actual week cells');
  }
});

test('real Calendar selected-field wrapper results retain original event provenance for a map event without inventing participants',async()=>{
  const event={eventId:'calendar_fixture',title:'Club study',start:{dateTime:'2026-10-18T18:00:00-04:00',timeZone},end:{dateTime:'2026-10-18T19:00:00-04:00',timeZone},url:'https://calendar.google.com/calendar/event?eid=fixture',partial:true};
  const calendar=createChatCalendarTools({sourceId,client:{configured:true,calendarId:'club@example.com',listEvents:async()=>({status:'ready',events:[event],coverage:{complete:true}})}});
  const response=await calendar.execute({name:'list_calendar_events',arguments:{timeMin:'2026-10-18T00:00:00-04:00',timeMax:'2026-10-19T00:00:00-04:00'},principal:{...principal,googleAccess:true}});
  assert.equal(response.sources[0].partial,true);
  assert.equal(response.sources[0].sourceId,sourceId);
  const f=fixture(),request=f.mapTools.createRequest();request.observe('list_calendar_events',response);
  await request.execute({name:'read_map_events',arguments:{},principal});
  const args=writeArgs();args.event.source_url=event.url;args.event.source_record_id=event.eventId;args.people=[];
  const forged=structuredClone(args);forged.event.source_record_id='a_different_calendar_event';
  assert.equal((await request.execute({name:'upsert_map_event',arguments:forged,principal})).status,'forbidden_source');
  const result=await request.execute({name:'upsert_map_event',arguments:args,principal});
  assert.equal(result.status,'ready');
});

test('stateless live Discord HTTP tool execution cannot claim a current explicit user request',async()=>{
  let userMessage='not-called';
  const app=createApp({config:readConfig({}),auth:()=>principal,liveDiscordTools:{tools:[{name:'read_discord_messages'}],execute:async options=>{
    userMessage=options.userMessage;return {status:'forbidden',sources:[]};
  }}});
  const response=await app.request('/api/tools/read_discord_messages',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});
  assert.equal(response.status,403);assert.equal(userMessage,'');
});

test('completed Calendar windows remain visible for automatic empty or failed Miro fallback',async()=>{
  const window={timeMin:'2026-10-19T00:00:00-04:00',timeMax:'2026-10-26T00:00:00-04:00'};
  for(const status of ['ready','permission_denied']) {
    let round=0;
    const context=await retrieveAssistantContext({messages:[{role:'user',content:'What is happening next week?'}],principal,now,timeZone,
      provider:{planTools:async({system})=>{
        if(round++===0)return [{name:'list_calendar_events',arguments:window}];
        assert(system.includes('NEXT ACTION: The Calendar read already completed'));
        assert(system.includes(JSON.stringify(window.timeMin)));
        assert(system.includes(JSON.stringify(window.timeMax)));
        return [];
      }},googleTools:{tools:[{name:'list_calendar_events'}],execute:async()=>({status,sources:[],calendarContext:{events:[],nextPageToken:null}})}});
    assert.deepEqual(context.results[0].arguments,window);
  }
});

test('a matching retrieved author cannot establish a bare first-person chat identity',async()=>{
  for(const suffix of ['', ' Calendar: https://calendar.google.com/calendar/whatever',
    ' Original: https://discord.com/channels/123/456/999']) {
    const f=fixture(),request=f.mapTools.createRequest({userMessage:'I am at Bobst studying. Put me on the map right now.'+suffix});
    request.observe('read_discord_messages',{status:'ready',sources:[source]});
    await request.execute({name:'read_map_events',arguments:{},principal});
    const lookup=await request.execute({name:'lookup_map_person',arguments:{provider:'discord',providerUserId:'567',sourceId,sourceUrl},principal});
    assert.equal(lookup.status,'forbidden_source');assert.equal(lookup.reason,'unverified_chat_identity');
    assert.equal((await request.execute({name:'upsert_map_event',arguments:writeArgs(),principal})).status,'forbidden_source');
    assert.equal(f.writes(),0);
  }
});

test('myself, mine and group self-references cannot identify matching source authors',async()=>{
  for(const userMessage of ['Add myself to the map.','That study plan is mine; add it to the map.','We are at Bobst; put us on the map.']) {
    const f=fixture(),request=f.mapTools.createRequest({userMessage});
    request.observe('read_discord_messages',{status:'ready',sources:[source]});
    assert.equal((await request.execute({name:'lookup_map_person',arguments:{provider:'discord',providerUserId:'567',sourceId,sourceUrl},principal})).reason,'unverified_chat_identity');
    assert.equal(f.writes(),0);
  }
});

test('an exact user-supplied original reference supports its linked author in a personal map request',async()=>{
  const f=fixture(),request=f.mapTools.createRequest({userMessage:`Please add my study activity to the map from (${sourceUrl}).`});
  request.observe('read_discord_messages',{status:'ready',sources:[source]});
  await request.execute({name:'read_map_events',arguments:{},principal});
  assert.equal((await request.execute({name:'lookup_map_person',arguments:{provider:'discord',providerUserId:'567',sourceId,sourceUrl},principal})).status,'ready');
  assert.equal((await request.execute({name:'upsert_map_event',arguments:writeArgs(),principal})).status,'ready');
  assert.equal(f.writes(),1);
});

test('a bounded duplicate lookup correction retains full identity arguments and reaches the map write',async()=>{
  const f=fixture();let round=0,correctivePrompt='';
  const calls=[plan[0],plan[1],plan[2],plan[2],plan[3]];
  const result=await retrieveAssistantContext({messages,principal,now,timeZone,liveTools:f.liveTools,mapTools:f.mapTools,
    provider:{planTools:async({system})=>{
      if(round===3){assert(system.includes('upsert_map_event IS AVAILABLE'));assert(system.includes('"providerUserId":"567"'));assert(system.includes('"sourceUrl":'+JSON.stringify(sourceUrl)));}
      if(round===4)correctivePrompt=system;
      const call=calls[round++];return call?[{...call,arguments:call.arguments||writeArgs()}]:[];
    }}});
  assert(correctivePrompt.includes('duplicate_call_skipped'));assert.equal(f.writes(),1);
  assert.equal(result.results.filter(row=>row.tool==='lookup_map_person').length,1);
  assert(result.results.some(row=>row.mapWrite?.outcome==='applied'));
});

test('one applied single-source map receipt stops additional calls in the same planning round',async()=>{
  const f=fixture();let round=0;
  const result=await retrieveAssistantContext({messages,principal,now,timeZone,liveTools:f.liveTools,mapTools:f.mapTools,
    provider:{planTools:async()=>{
      const call=plan[round++];
      if(round===4)return [{...call,arguments:writeArgs()},{...call,arguments:{...writeArgs(),event:{...writeArgs().event,source_record_id:'renamed_duplicate'}}}];
      if(!call)throw Error('Planning must stop after the applied receipt');
      return [{...call,arguments:call.arguments||writeArgs()}];
    }}});
  assert.equal(round,4);assert.equal(f.writes(),1);assert.equal(result.results.filter(row=>row.mapWrite).length,1);
});

test('a request cannot create a second event by renaming the same original source identity',async()=>{
  const f=fixture(),request=f.mapTools.createRequest();request.observe('read_discord_messages',{status:'ready',sources:[source]});
  await request.execute({name:'read_map_events',arguments:{},principal});
  await request.execute({name:'lookup_map_person',arguments:{provider:'discord',providerUserId:'567',sourceId,sourceUrl},principal});
  assert.equal((await request.execute({name:'upsert_map_event',arguments:writeArgs(),principal})).status,'ready');
  const duplicate=writeArgs();duplicate.event.source_record_id='renamed_duplicate';
  const rejected=await request.execute({name:'upsert_map_event',arguments:duplicate,principal});
  assert.equal(rejected.status,'conflict');assert.equal(rejected.reason,'source_already_written');assert.equal(f.writes(),1);
});

test('negated map actions stay read-only even after original source and identity lookup succeed',async()=>{
  for(const userMessage of ['Do not update the map; just show Bobst.',"Don't add anything to the map. Read the source only."]){
    const f=fixture(),request=f.mapTools.createRequest({userMessage});request.observe('read_discord_messages',{status:'ready',sources:[source]});
    await request.execute({name:'read_map_events',arguments:{},principal});
    await request.execute({name:'lookup_map_person',arguments:{provider:'discord',providerUserId:'567',sourceId,sourceUrl},principal});
    const result=await request.execute({name:'upsert_map_event',arguments:writeArgs(),principal});
    assert.equal(result.reason,'map_update_not_requested');assert.equal(f.writes(),0);
  }
});

test('protected app exposes map tools, denies stateless writes and passes successful chat receipt into answer generation',async()=>{
  const f=fixture();let answerPrompt;
  const app=createApp({config:readConfig({LLM_PROVIDER:'openai-compatible',LLM_MODEL:'fixture',LLM_API_KEY:'fixture-only'}),
    provider:providerFor(plan,system=>{answerPrompt=system;}),auth:()=>principal,mapTools:f.mapTools,liveDiscordTools:f.liveTools,now:()=>new Date(now)});
  const inventory=await(await app.request('/api/tools')).json();assert(inventory.tools.some(t=>t.name==='upsert_map_event'));
  const direct=await(await app.request('/api/tools/upsert_map_event',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(writeArgs())})).json();
  assert.equal(direct.status,'forbidden_source');assert.equal(f.writes(),0);
  const response=await app.request('/api/chat',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({messages,timeZone})});
  const events=(await response.text()).trim().split('\n').map(JSON.parse);
  assert.equal(events.at(-1).type,'done');assert.equal(f.writes(),1);assert(answerPrompt.includes('"mapWrite":{"outcome":"applied"'));
  assert(!JSON.stringify(events).includes('do-not-forward'));
});


test('a new current presence cannot be saved with unknown timing',async()=>{
  const f=fixture(),request=f.mapTools.createRequest();
  request.observe('read_discord_messages',{status:'ready',sources:[{...source,createdAt:'2026-10-18T15:00:00Z'}]});
  await request.execute({name:'read_map_events',arguments:{},principal});
  await request.execute({name:'lookup_map_person',arguments:{provider:'discord',providerUserId:'567',sourceId,sourceUrl},principal});
  const args=writeArgs();args.event.kind='presence';args.event.time_kind='unknown';
  delete args.event.starts_at;delete args.event.ends_at;
  const result=await request.execute({name:'upsert_map_event',arguments:args,principal});
  assert.equal(result.status,'invalid_request');assert.equal(result.reason,'current_presence_requires_timed_window');assert.equal(f.writes(),0);
  const prompt=assistantPlanningPrompt({now,timeZone});
  assert(prompt.includes('starts_at=reported_at=that original timestamp'));
});


test('a complete nonempty Calendar window ends an unsourced weekly schedule without an unnecessary Miro scan',async()=>{
  for(const paginated of [false,true]){
    let rounds=0,miroReads=0;
    const context=await retrieveAssistantContext({messages:[{role:'user',content:'What is happening during the week of October 19–25, 2026?'}],principal,now,timeZone,
      provider:{planTools:async()=>{rounds++;return [{name:'list_calendar_events',arguments:{timeMin:'2026-10-19T04:00:00Z',timeMax:'2026-10-26T04:00:00Z',...(rounds>1?{pageToken:'page2'}:{})}},{name:'list_miro_boards',arguments:{}}];}},
      googleTools:{tools:[{name:'list_calendar_events'}],execute:async()=>({status:'ready',sources:[],coverage:{complete:!paginated||rounds===2},calendarContext:{events:rounds===1?[{eventId:'known_event',title:'Workshop'}]:[],nextPageToken:paginated&&rounds===1?'page2':null}})},
      miroTools:{tools:[{name:'list_miro_boards'}],execute:async()=>{miroReads++;return {status:'ready',sources:[]};}}});
    assert.equal(rounds,paginated?2:1);assert.equal(miroReads,paginated?1:0);
    assert.equal(context.results.at(-1).calendarContext.windowComplete,true);
  }
});


test('weekly completion never combines different Calendar windows or skips explicit map/memory work',async()=>{
  const first={timeMin:'2026-10-19T04:00:00Z',timeMax:'2026-10-26T04:00:00Z'};
  const other={timeMin:'2026-11-02T05:00:00Z',timeMax:'2026-11-09T05:00:00Z'};
  for(const userMessage of ['What is happening this week?','What is happening on the map this week?','What is happening this week? Save the key dates to memory.']){
    let round=0;
    const context=await retrieveAssistantContext({messages:[{role:'user',content:userMessage}],principal,now,timeZone,
      provider:{planTools:async()=>{const calls=[{name:'list_calendar_events',arguments:first},{name:'list_calendar_events',arguments:other},{name:'list_calendar_events',arguments:{...first,pageToken:'last'}},{name:'read_map_events',arguments:{}}];return round<calls.length?[calls[round++]]:[];}},
      googleTools:{tools:[{name:'list_calendar_events'}],execute:async({arguments:args})=>({status:'ready',sources:[],coverage:{complete:!!args.pageToken||args.timeMin===other.timeMin},calendarContext:{events:args.pageToken||args.timeMin===other.timeMin?[]:[{eventId:'known',title:'Workshop'}],nextPageToken:args.timeMin===first.timeMin&&!args.pageToken?'last':null}})},
      mapTools:{tools:[{name:'read_map_events'}],execute:async()=>({status:'ready',sources:[]})}});
    assert.equal(context.results.filter(row=>row.tool==='list_calendar_events').length,3);
    assert.equal(context.results.some(row=>row.tool==='read_map_events'),userMessage!=='What is happening this week?');
  }
});


test('paced source reads use their overall request budget separately from a model-call timeout',async()=>{
  assert.equal(readConfig({}).requestTimeoutMs,300000);assert.equal(readConfig({}).timeoutMs,30000);
  assert.equal(readConfig({ASSISTANT_REQUEST_TIMEOUT_MS:'999999'}).requestTimeoutMs,600000);
  const f=fixture();
  const app=createApp({config:{...readConfig({LLM_PROVIDER:'openai-compatible',LLM_MODEL:'fixture',LLM_API_KEY:'fixture'}),timeoutMs:5,requestTimeoutMs:500},
    provider:providerFor(plan),auth:()=>principal,mapTools:f.mapTools,now:()=>new Date(now),
    liveDiscordTools:{...f.liveTools,execute:async options=>{await new Promise(resolve=>setTimeout(resolve,20));return f.liveTools.execute(options);}}});
  const response=await app.request('/api/chat',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({messages,timeZone})});
  const records=(await response.text()).trim().split('\n').map(JSON.parse);
  assert.equal(records.at(-1).type,'done');assert.equal(f.writes(),1);
});
