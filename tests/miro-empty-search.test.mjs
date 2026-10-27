import test from 'node:test';
import assert from 'node:assert/strict';
import {createMiroMcpTools} from '../tools/miro/mcp.js';
import {retrieveAssistantContext} from '../server/chat/context.js';
import {createAutomationAdapters} from '../server/automation/adapters.js';
import {readAutomationConfig} from '../server/automation/config.js';

const sourceId='10000000-0000-4000-8000-000000000001';
const boardId='synthetic_calendar=',frameId='100',eventId='300';
const url='https://miro.com/app/board/synthetic_calendar%3D/';
const now='2026-10-18T16:00:00.000Z',timeZone='America/New_York';
const principal={id:'fixture',allowedSourceIds:[sourceId]};
const overview={total_items:1226,total_results:1,results:[{id:frameId,type:'frame',title:'October 2026'}]};
const noMatch={total_items:1226,total_results:0};
const svg='<svg><g data-miro-id="100" data-type="frame"><text>October 2026</text><g data-miro-id="200" data-type="grid"><foreignObject><table><tr><th>Sunday</th></tr><tr><td>18</td></tr></table></foreignObject><g data-miro-id="300" data-type="sticky_note"><text>Synthetic workshop 14:00</text></g></g></g></svg>';

function fixture() {
 const calls=[];
 const config={configured:true,boardIds:[boardId],teamId:'synthetic_team'};
 const store={configured:true,authorizedBoard:async()=>({status:'ready',data:{board_id:boardId,source_id:sourceId,team_id:'synthetic_team',title:'Synthetic schedule'}})};
 const client={configured:true,callTool:async(name,args)=>{
  calls.push({name,args});
  if(name==='canvas_search')return {structuredContent:args.result_mode==='overview'?overview:noMatch};
  assert.equal(name,'canvas_read_as_svg');assert.deepEqual(args.widget_ids,[frameId]);
  return {structuredContent:{success:true,miro_url:url,svg,item_count:4,skipped_count:0}};
 }};
 const tools=createMiroMcpTools({config,store,client,now:()=>new Date(now)});
 return {config,store,tools,calls};
}

test('real chat orchestration reaches month canvas after the exact omitted-results date-search response within four calls',async()=>{
 const f=fixture(),events=[],planningInputs=[];
 const prefix='\nUNTRUSTED PREVIOUS TOOL RESULTS (JSON):\n';
 const context=await retrieveAssistantContext({
  messages:[{role:'user',content:"What's on the Miro board for today?"}],principal,miroTools:f.tools,now,timeZone,
  onToolEvent:event=>events.push(event),
  provider:{planTools:async input=>{
   planningInputs.push(input);
   assert.equal(input.timeContext.localDate,'2026-10-18');assert.equal(input.timeContext.timeZone,timeZone);
   assert.equal(input.timeContext.now,now);
   const results=JSON.parse(input.system.split(prefix)[1]);
   if(results.some(result=>result.tool==='read_miro_item'))return [];
   if(!results.length)return [{name:'list_miro_boards',arguments:{}}];
   if(results.length===1){const board=results[0].boardContext.boards[0];return [{name:'read_miro_board',arguments:{boardId:board.boardId}}];}
   if(results.length===2){assert.equal(results[1].boardContext.payload.results[0].id,frameId);return [{name:'read_miro_board',arguments:{boardId,mode:'search',patterns:[input.timeContext.localDate]}}];}
   assert.equal(results.length,3);const search=results[2];
   assert.equal(search.status,'ready');assert.equal(search.boardContext.payload.total_results,0);assert.equal(search.coverage.wholeBoardComplete,false);
   assert(search.sources.every(source=>source.contentAvailable===false&&!source.sourceKey));
   return [{name:'read_miro_item',arguments:{boardId,itemId:results[1].boardContext.payload.results[0].id,type:'canvas'}}];
  }},
 });
 assert(planningInputs.length>=4&&planningInputs.length<=5);assert.equal(context.results.length,4);
 assert.deepEqual(context.results.map(result=>result.status),['ready','ready','ready','ready']);
 assert.deepEqual(events.filter(event=>event.status!=='running').map(event=>event.status),['completed','completed','completed','completed']);
 assert.deepEqual(f.calls.map(call=>call.name),['canvas_search','canvas_search','canvas_read_as_svg']);
 assert.deepEqual(f.calls[1].args.patterns,['2026-10-18']);
 const content=context.results[3];assert.equal(content.boardContext.payload.svg,svg);assert.equal(content.coverage.wholeBoardComplete,false);
 assert.deepEqual(content.sources.filter(source=>source.contentAvailable).map(source=>source.sourceKey),[`miro:${boardId}:${eventId}`]);
 assert(context.sources.some(source=>source.itemId===eventId&&source.url===url+'?moveToWidget=300'));
});

test('update adapter has no Miro read tools or Miro Calendar write grants',async()=>{
 const f=fixture();let writes=0;
 const adapters=createAutomationAdapters({env:{ASSISTANT_ALLOWED_SOURCE_IDS:sourceId},config:readAutomationConfig({AGENT_AUTOMATION_ENABLED:'true'}),
  fetchImpl:async()=>{throw Error('Unexpected network call');},
  dependencies:{miroConfig:f.config,miroStore:f.store,miroTools:f.tools,
   calendarConfig:{configured:true,calendarId:'fixed'},calendarClient:{configured:true,calendarId:'fixed',preflight:async()=>({status:'ready',calendarId:'fixed',accessRole:'writer'}),upsertEvent:async()=>{writes++;return {status:'ready'};},cancelEvent:async()=>{writes++;return {status:'ready'};}},
   googleConfig:{configured:false},googleClient:{configured:false},discordConfig:{configured:false},discordTools:{tools:[]}}});
 const context={principal:adapters.principal};
 const execute=(name,args)=>adapters.tools.find(tool=>tool.name===name).execute(args,context);
 try {
  await adapters.prepareBatch(context);
  assert(!adapters.tools.some(tool=>tool.name.includes('miro')));
  const key=`miro:${boardId}:${eventId}`,sourceUrl=url+'?moveToWidget='+eventId;
  assert.equal((await execute('upsert_calendar_event',{sourceKey:key,sourceUrl,title:'Synthetic workshop',start:{date:'2026-10-18'},end:{date:'2026-10-19'}})).status,'forbidden_source');
  assert.equal((await execute('cancel_calendar_event',{sourceKey:key,sourceUrl})).status,'forbidden_source');
  assert.equal(writes,0);
 } finally {adapters.cleanupBatch();}
});

test('month-area navigation resolves exact title and year instead of sampled August IDs or stale text in future frames',async()=>{
 const sampled={total_items:1226,total_results:2,results:[
  {id:'august_frame',type:'frame',title:'August 2026'},
  {type:'frame',title:'October 2026'},
 ]};
 const areas={total_items:1226,total_results:3,results:[
  {id:'future_frame',type:'frame',title:'October 2027',samples:['Copied October 2026 planning text']},
  {id:frameId,type:'frame',title:'October 2026',samples:['Synthetic current schedule']},
  {id:'unrelated_frame',type:'frame',title:'August 2026',samples:['October 2026 reference']},
 ]};
 for(const includeSampledOverview of [false,true]) {
  const f=fixture(),calls=[],events=[];let monthTitle;
  const tools=createMiroMcpTools({config:f.config,store:f.store,now:()=>new Date(now),client:{configured:true,callTool:async(name,args)=>{
   calls.push({name,args});
   if(name==='canvas_search') {
    if(args.result_mode==='overview')return {structuredContent:sampled};
    assert.equal(args.result_mode,'areas');assert.deepEqual(args.patterns,['October 2026']);
    return {structuredContent:areas};
   }
   assert.equal(name,'canvas_read_as_svg');assert.deepEqual(args.widget_ids,[frameId]);
   return {structuredContent:{success:true,miro_url:url,svg,item_count:4,skipped_count:0}};
  }}});
  const context=await retrieveAssistantContext({messages:[{role:'user',content:"What's on the Miro calendar today?"}],principal,miroTools:tools,now,timeZone,onToolEvent:event=>events.push(event),
   provider:{planTools:async input=>{
    assert.equal(input.timeContext.localDate,'2026-10-18');assert.equal(input.timeContext.timeZone,timeZone);
    monthTitle=new Intl.DateTimeFormat('en-US',{month:'long',year:'numeric',timeZone}).format(new Date(input.timeContext.now));
    const results=JSON.parse(input.system.split('\nUNTRUSTED PREVIOUS TOOL RESULTS (JSON):\n')[1]);
    if(!results.length)return [{name:'list_miro_boards',arguments:{}}];
    const selectedBoard=results[0].boardContext.boards[0].boardId;
    if(results.some(result=>result.tool==='read_miro_item'))return [];
    if(includeSampledOverview&&results.length===1)return [{name:'read_miro_board',arguments:{boardId:selectedBoard,mode:'overview'}}];
    const search=results.find(result=>result.arguments.mode==='search');
    if(!search) {
     const summary=results.find(result=>result.arguments.mode==='overview');
     if(summary)assert.equal(summary.boardContext.payload.results.find(area=>area.title===monthTitle).id,undefined);
     return [{name:'read_miro_board',arguments:{boardId:selectedBoard,mode:'search',patterns:[monthTitle],resultMode:'areas'}}];
    }
    const matches=search.boardContext.payload.results.filter(area=>area.type==='frame'&&area.title===monthTitle&&typeof area.id==='string');
    assert.equal(matches.length,1);
    return [{name:'read_miro_item',arguments:{boardId:selectedBoard,itemId:matches[0].id,type:'canvas'}}];
   }},
  });
  assert.equal(context.results.length,includeSampledOverview?4:3);
  assert(context.results.every(result=>result.status==='ready'));
  assert(events.filter(event=>event.status!=='running').every(event=>event.status==='completed'));
  assert.deepEqual(calls.filter(call=>call.name==='canvas_read_as_svg').map(call=>call.args.widget_ids),[[frameId]]);
  assert.equal(context.results.at(-1).boardContext.payload.svg,svg);
  assert.equal(context.results.at(-1).coverage.wholeBoardComplete,false);
 }
});
