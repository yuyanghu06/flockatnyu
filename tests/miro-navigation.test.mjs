import test from 'node:test';
import assert from 'node:assert/strict';
import {miroNavigationPrompt} from '../server/miro/navigation.js';
import {assistantPlanningPrompt,assistantAnswerPrompt,retrieveAssistantContext} from '../server/assistant-context.js';
import {buildAutomationPrompt} from '../server/automation/prompt.js';
import {createMiroMcpTools} from '../tools/miro/mcp.js';
import {createChatCalendarTools} from '../tools/calendar/chat.js';

const now='2031-03-09T17:00:00.000Z',timeZone='America/New_York';
const sourceId='10000000-0000-4000-8000-000000000001',boardId='synthetic_navigation';
const principal={id:'synthetic_reader',googleAccess:true,allowedSourceIds:[sourceId]};
const url=`https://miro.com/app/board/${boardId}/`;
const prior='\nUNTRUSTED PREVIOUS TOOL RESULTS (JSON):\n';
const month='March 2031';

test('one shared navigation guide reaches chat planning, chat answers and update-agent prompts',()=>{
 const guide=miroNavigationPrompt();assert.equal(typeof guide,'string');assert(guide.trim().length>100);
 for(const prompt of [assistantPlanningPrompt({now,timeZone}),assistantAnswerPrompt({now,timeZone}),buildAutomationPrompt({now,timezone:timeZone})]) {
  assert(prompt.includes(guide),'consumer must deliver the complete shared guide');
 }
 assert.doesNotMatch(guide,/moveToWidget=|October 18|October 25|2026-10-18|2026-10-25/,'guide contains navigation hints, not pinned widget IDs or stale event dates');
});

test('shared policy treats sections, year conflicts, local legends and source authority as separate questions',()=>{
 const guide=miroNavigationPrompt();
 for(const pattern of [/authorized IDs only/i,/hints grant no access/i,/Never reuse IDs across boards/i,
  /Events \+ Marketing[\s\S]*public events\/promotions/i,/EBOARD[\s\S]*internal/i,
  /APPLICATIONS[\s\S]*deadlines/i,/Mentorship/i,/Important Links[\s\S]*resources/i,
  /Copy of APPLICATIONS[\s\S]*ambiguous/i,/(?:Same month|Repeated months)[\s\S]*sections[\s\S]*NOT interchangeable/i,
  /Search named subjects directly/i,/containing\/neighbor headings and coordinates\/bounds/i,
  /Outer[\s\S]*copied inner years?[\s\S]*conflict[\s\S]*neither alone resolves/i,
  /disclose unresolved year and defer affected writes/i,/Read local legends live/i,
  /Marketing\/unconfirmed is not a confirmed event/i,/Navigation\/search\/headings are not event\/write evidence/i,
  /read_miro_item\(type=canvas\)/i,/Partial sections\/pages never establish whole.board absence\/cancellation/i])assert.match(guide,pattern);
});

test('chat retains Calendar-first unnamed scheduling and honors explicitly requested Miro',()=>{
 for(const prompt of [assistantPlanningPrompt({now,timeZone}),assistantAnswerPrompt({now,timeZone})]) {
  assert.match(prompt,/without a named source[\s\S]*Google Calendar FIRST/i);
  assert.match(prompt,/successfully empty or unavailable[\s\S]*Miro/i);
  assert.match(prompt,/Explicit requests[\s\S]*Miro[\s\S]*requested source/i);
  assert.match(prompt,/partial Calendar page does not establish absence/i);
 }
});

test('explicit Miro-only chat cannot substitute Calendar or stop at candidate navigation',()=>{
 for(const prompt of [assistantPlanningPrompt({now,timeZone}),assistantAnswerPrompt({now,timeZone})]) {
  assert.match(prompt,/Miro.only[^.]*forbids Calendar rescue/i);
  assert.match(prompt,/candidate items[^.]*read their actual contents before refusing/i);
  assert.match(prompt,/ambiguity between candidate sections[^.]*inspect them[^.]*not stop at navigation/i);
 }
});

test('ambiguous sections require bounded candidate and legend reads, including actual month cells',()=>{
 const guide=miroNavigationPrompt();
 assert.match(guide,/if uncertain read both candidates[\s\S]*header\/legend[\s\S]*read_miro_item\(type=canvas\)[\s\S]*itemIds/i);
 assert.match(guide,/Never just the first match\/header[\s\S]*read actual month\/day cells before refusing/i);
 assert.match(guide,/scope bounded reads/i);
});

test('layout hints are spatial and cannot become parent-scoped month searches; worker stays within budget',()=>{
 const guide=miroNavigationPrompt();
 for(const [section,position] of [['EBOARD','left'],['APPLICATIONS','middle'],['Events + Marketing','right'],['Mentorship','below right'],['Copy of APPLICATIONS','below middle']]) {
  const sectionStart=guide.indexOf(section);assert(sectionStart>=0);
  assert(guide.slice(sectionStart,sectionStart+section.length+30).includes(position),`${section} retains its relative position hint`);
 }
 assert.match(guide,/older Calendar[^.]*above/i);
 assert.match(guide,/Headers are spatial[^.]*not parent folders[^.]*do not scope month searches with header targetId/i);
 assert.match(guide,/month canvas nearest the correct section position/i);
 const worker=buildAutomationPrompt({now,timezone:timeZone});assert(Buffer.byteLength(worker)<24*1024);
});

function fixture() {
 const calls=[];
 const areas=[
  {id:'future_public',type:'frame',title:'March 2032',samples:['Copied March 2031 event text']},
  {id:'internal_month',type:'frame',title:month},
  {id:'public_month',type:'frame',title:month},
 ];
 const content={
  internal_month:'EBOARD | March 2031 | Sunday 9 | Internal team social | 17:00 | Local legend: yellow = internal',
  public_month:'Events + Marketing | March 2031 | Sunday 9 | Public workshop 18:00 | Promotion task 12:00 | Local legend: dotted border = promotion, not event',
  application_region:'APPLICATIONS | March 2031 | Sunday 9 | Synthetic application closes 20:00 | Deadline, not meeting | Copy of APPLICATIONS has conflicting year; unverified',
  mentorship_region:'Mentorship | Synthetic mentor matching instructions | See original linked resource; external file not read',
 };
 const tools=createMiroMcpTools({config:{configured:true,boardIds:[boardId],teamId:'synthetic_team'},
  store:{configured:true,authorizedBoard:async()=>({status:'ready',data:{board_id:boardId,source_id:sourceId,team_id:'synthetic_team',title:'Synthetic planning board'}})},
  now:()=>new Date(now),client:{configured:true,callTool:async(name,args)=>{
   calls.push({name,args});
   if(name==='canvas_search') {
    assert.equal(args.result_mode,'areas');
    const subject=args.patterns[0];
    const results=subject===month?areas:subject==='APPLICATIONS'?[{id:'application_region',type:'frame',title:'APPLICATIONS'}]:subject==='Mentorship'?[{id:'mentorship_region',type:'frame',title:'Mentorship'}]:[];
    return {structuredContent:{total_items:2000,total_results:results.length,results,next_cursor:null}};
   }
   assert.equal(name,'canvas_read_as_svg');
   assert(args.widget_ids.every(id=>Object.hasOwn(content,id)),'no guessed or future-year IDs may be read');
   const svg='<svg>'+args.widget_ids.map((id,i)=>`<g data-miro-id="${id}" data-type="frame"><g data-miro-id="note_${i}" data-type="sticky_note"><text>${content[id].replaceAll('&','&amp;')}</text></g></g>`).join('')+'</svg>';
   return {structuredContent:{success:true,miro_url:url,svg,item_count:args.widget_ids.length*2,skipped_count:0}};
  }}});
 return {tools,calls,content};
}

// The planner is scripted: these tests establish tool/context capabilities and
// evidence preservation, not probabilistic model compliance with the guide.
for(const scenario of [
 {name:'duplicate-month calendar',question:'What is on Miro today?',pattern:month,selected:['internal_month','public_month'],expected:['EBOARD','Events + Marketing','Promotion task','Local legend']},
 {name:'application subject',question:'When do applications close on the Miro board?',pattern:'APPLICATIONS',selected:['application_region'],expected:['Deadline, not meeting','conflicting year; unverified']},
 {name:'non-calendar mentorship',question:'What does the Miro board say about mentorship?',pattern:'Mentorship',selected:['mentorship_region'],expected:['mentor matching instructions','external file not read']},
])test(`actual orchestration preserves question-specific ${scenario.name} evidence without assuming one calendar section`,async()=>{
 const f=fixture(),events=[];
 const context=await retrieveAssistantContext({messages:[{role:'user',content:scenario.question}],principal,miroTools:f.tools,now,timeZone,onToolEvent:event=>events.push(event),
  provider:{planTools:async input=>{
   assert.equal(input.timeContext.localDate,'2031-03-09');assert(input.system.includes(miroNavigationPrompt()));
   const results=JSON.parse(input.system.split(prior)[1]);
   if(!results.length)return [{name:'list_miro_boards',arguments:{}}];
   if(results.length===1)return [{name:'read_miro_board',arguments:{boardId:results[0].boardContext.boards[0].boardId,mode:'search',patterns:[scenario.pattern],resultMode:'areas'}}];
   if(results.length===2){
    const search=results[1];assert(search.sources.every(source=>!source.contentAvailable&&!source.sourceKey));
    const matches=search.boardContext.payload.results.filter(area=>area.title===scenario.pattern);
    assert.deepEqual(matches.map(area=>area.id),scenario.selected);
    return [{name:'read_miro_item',arguments:{boardId,itemId:matches[0].id,...(matches.length>1?{itemIds:matches.slice(1).map(area=>area.id)}:{}),type:'canvas'}}];
   }
   return [];
  }},
 });
 assert.equal(context.results.length,3);assert(context.results.every(result=>result.status==='ready'));
 assert(events.every(event=>event.status==='running'||event.status==='completed'));
 assert.deepEqual(f.calls.at(-1).args.widget_ids,scenario.selected);
 const canvas=context.results.at(-1);assert.equal(canvas.coverage.wholeBoardComplete,false);
 for(const expected of scenario.expected)assert(canvas.boardContext.payload.svg.includes(expected));
 assert.equal(canvas.sources.filter(source=>source.contentAvailable).length,scenario.selected.length);
 const answer=assistantAnswerPrompt({...context,now,timeZone});
 for(const expected of scenario.expected)assert(answer.includes(expected),'original context and local distinctions reach answer provider');
});

test('Calendar-first fallback and explicit Miro each reach concrete canvas while preserving partial coverage',async()=>{
 for(const namedMiro of [false,true]) {
  const f=fixture(),calendarCalls=[];
  const calendar=createChatCalendarTools({client:{configured:true,calendarId:'synthetic@calendar.invalid',listEvents:async args=>{calendarCalls.push(args);return {status:'ready',events:[],nextPageToken:null,coverage:{complete:true}};}}});
  const context=await retrieveAssistantContext({messages:[{role:'user',content:namedMiro?'What is on Miro today?':'What is happening today?'}],principal,googleTools:calendar,miroTools:f.tools,now,timeZone,
   provider:{planTools:async input=>{
    const results=JSON.parse(input.system.split(prior)[1]);
    if(!namedMiro&&!results.length)return [{name:'list_calendar_events',arguments:{timeMin:'2031-03-09T00:00:00-05:00',timeMax:'2031-03-10T00:00:00-04:00'}}];
    const miro=results.filter(result=>result.tool.includes('miro'));
    if(!miro.length)return [{name:'list_miro_boards',arguments:{}}];
    if(miro.length===1)return [{name:'read_miro_board',arguments:{boardId,mode:'search',patterns:[month],resultMode:'areas'}}];
    if(miro.length===2)return [{name:'read_miro_item',arguments:{boardId,itemId:'internal_month',itemIds:['public_month'],type:'canvas'}}];
    return [];
   }},
  });
  assert.equal(calendarCalls.length,namedMiro?0:1);assert.equal(context.results[0].tool,namedMiro?'list_miro_boards':'list_calendar_events');
  assert.equal(context.results.at(-1).tool,'read_miro_item');assert.equal(context.results.at(-1).coverage.wholeBoardComplete,false);
  if(!namedMiro){assert.equal(calendarCalls[0].timeMin,'2031-03-09T00:00:00-05:00');assert.equal(calendarCalls[0].timeMax,'2031-03-10T00:00:00-04:00');}
 }
});
