import test from 'node:test';
import assert from 'node:assert/strict';
import {createMiroTools} from '../tools/miro/index.js';
import {createMiroClient} from '../server/miro/client.js';
import {readMiroConfig} from '../server/miro/config.js';
import {readConfig} from '../server/config.js';
import {createApp} from '../server/app.js';
const sourceId='11111111-1111-4111-8111-111111111111';
const principal={id:'local-development',allowedSourceIds:[sourceId]};
const config=readMiroConfig({MIRO_ACCESS_TOKEN:'SECRET_MIRO_TOKEN',MIRO_BOARD_IDS:'board1',MIRO_TEAM_ID:'team1'});
const metadata={id:'board1',name:'October calendar',description:'yellow = tentative',modifiedAt:'2026-10-15T12:00:00Z',team:{id:'team1'}};
const card={id:'card1',type:'card',parent:{id:'frame1'},position:{x:120,y:240,relativeTo:'parent_top_left'},geometry:{width:200,height:100,rotation:12},style:{fillColor:'yellow'},data:{title:'Workshop',description:'<p>Room pending; <a href="https://example.com">agenda</a></p>'}};
const frame={id:'frame1',type:'frame',data:{title:'October 2026'},geometry:{width:1000,height:800}};
function fixture({allowed=true,team='team1',item=card,groupPage,itemPage}={}){
 const calls=[];let grants=0;
 const store={configured:true,authorizedBoard:async()=>{grants++;return allowed?{status:'ready',data:{board_id:'board1',source_id:sourceId,team_id:'team1',title:'Calendar',status:'succeeded'}}:{status:'forbidden'};}};
 const tools=createMiroTools({config,store,clientFactory:()=>createMiroClient({config,fetchImpl:async(url)=>{
  const u=new URL(url);calls.push(u);
  if(u.pathname==='/v2/boards/board1')return Response.json({...metadata,team:{id:team}});
  if(u.pathname.endsWith('/groups/items'))return Response.json(groupPage??{data:{id:'group1',data:[{data:[{id:'card1',type:'card'},{id:'sticky1',type:'sticky_note'}]}]}});
  if(u.pathname.endsWith('/frames/frame1')||u.pathname.endsWith('/items/frame1'))return Response.json(frame);
  if(u.pathname.endsWith('/cards/card1'))return Response.json(item);
  if(u.pathname.endsWith('/items'))return Response.json(itemPage??{data:u.searchParams.get('type')==='frame'?[frame]:[item],cursor:u.searchParams.get('cursor')?'':'second-page'});
  assert.fail('Unexpected URL '+u.href);
 }})});
 return {tools,calls,get grants(){return grants;}};
}
const execute=(tools,name,args)=>tools.execute({name,arguments:args,principal});
test('ACL before live fetch, explicit scope/team checks, invalid arguments and no secrets',async()=>{
 const denied=fixture({allowed:false});assert.equal((await execute(denied.tools,'read_miro_board',{boardId:'board1'})).status,'forbidden');assert.equal(denied.calls.length,0);
 const allowed=fixture();for(const args of [{boardId:'https://evil.example'},{boardId:'board1',url:'https://evil.example'},{boardId:'board1',cursor:''},{boardId:'board1',mode:'overview',frameId:'frame1'}])assert.equal((await execute(allowed.tools,'read_miro_board',args)).status,'invalid_request');assert.equal(allowed.calls.length,0);
 assert.equal((await execute(allowed.tools,'read_miro_board',{boardId:'board2'})).status,'forbidden');assert.equal(allowed.calls.length,0);
 const mismatch=fixture({team:'other'});assert.equal((await execute(mismatch.tools,'read_miro_board',{boardId:'board1'})).status,'forbidden');assert.equal(mismatch.calls.length,1);
 const list=await execute(allowed.tools,'list_miro_boards',{});assert.equal(list.sources[0].retrievalMode,'catalogue');assert.equal(allowed.calls.length,0);assert(!JSON.stringify(list).includes('SECRET_MIRO_TOKEN'));
});
test('live overview uses actual frame filter and preserves pagination/scope',async()=>{
 const f=fixture();const a=await execute(f.tools,'read_miro_board',{boardId:'board1'});assert.equal(a.status,'ready');assert.equal(a.boardContext.items[0].type,'frame');assert.equal(f.calls.find(u=>u.pathname.endsWith('/items')).searchParams.get('type'),'frame');assert.equal(a.boardContext.nextCursor,'second-page');assert.equal(a.coverage.complete,false);assert.equal(a.coverage.reason,'frame_catalogue_only');
 const b=await execute(f.tools,'read_miro_board',{boardId:'board1',mode:'items',frameId:'frame1',cursor:'second-page'});assert.equal(b.boardContext.nextCursor,null);assert.deepEqual(b.boardContext.items[0],card);assert.equal(b.coverage.reason,'frame_collection_only');
});
test('large original object remains recoverable through JSON fragments',async()=>{
 const item={...card,data:{...card.data,description:'🗓️'.repeat(9000)+' END_SENTINEL'}};const f=fixture({item});
 const page=await execute(f.tools,'read_miro_board',{boardId:'board1',mode:'items'});assert.equal(page.status,'partial');assert.equal(page.boardContext.items[0].id,'card1');
 let offset=0,raw='',fragments=0;
 do{const r=await execute(f.tools,'read_miro_item',{boardId:'board1',itemId:'card1',type:'card',offset});assert.equal(r.status,'ready');raw+=r.boardContext.data;offset=r.boardContext.nextOffset;fragments++;assert.deepEqual(r.boardContext.parent,frame);assert(fragments<20);}while(offset!==null);
 assert(fragments>1);assert.deepEqual(JSON.parse(raw),item);
});
test('nested official group membership returns actual object rows',async()=>{
 const f=fixture();const r=await execute(f.tools,'read_miro_relationships',{boardId:'board1',kind:'group_items',itemId:'group1'});assert.equal(r.status,'ready');assert.deepEqual(r.boardContext.data.map(v=>v.id),['card1','sticky1']);
});
test('group pages with missing continuation never claim complete coverage',async()=>{
 const partial=fixture({groupPage:{total:2,size:1,data:{id:'group1',data:[{data:[{id:'card1',type:'card'}]}]}}});
 const r=await execute(partial.tools,'read_miro_relationships',{boardId:'board1',kind:'group_items',itemId:'group1'});
 assert.equal(r.status,'partial');assert.equal(r.coverage.complete,false);assert.equal(r.coverage.reason,'incomplete_pagination');assert.equal(r.boardContext.data[0].id,'card1');
 const nextLink=fixture({groupPage:{links:{next:'https://api.miro.com/v2/boards/board1/groups/items?cursor=hidden'},data:{id:'group1',data:[{data:[{id:'card1',type:'card'}]}]}}});
 const blocked=await execute(nextLink.tools,'read_miro_relationships',{boardId:'board1',kind:'group_items',itemId:'group1'});
 assert(['partial','unavailable'].includes(blocked.status));assert.equal(blocked.coverage.complete,false);
});
test('board pages with remaining total or next link but no cursor are explicitly partial',async()=>{
 for(const itemPage of [{total:2,size:1,data:[card]},{data:[card],links:{next:'https://api.miro.com/v2/boards/board1/items?cursor=hidden'}}]){
  const f=fixture({itemPage});const r=await execute(f.tools,'read_miro_board',{boardId:'board1',mode:'items'});
  assert.equal(r.status,'partial');assert.equal(r.coverage.complete,false);assert.equal(r.coverage.reason,'incomplete_pagination');assert.equal(r.boardContext.items[0].id,'card1');assert.equal(r.boardContext.nextCursor,null);
 }
});
test('four-round HTTP planning discovers catalogue, frame, calendar objects and complete detail',async()=>{
 const f=fixture();const appConfig=readConfig({LLM_PROVIDER:'openai-compatible',LLM_MODEL:'offline',LLM_API_KEY:'fixture',DEV_ALLOWED_SOURCE_IDS:sourceId});let round=0,answered=false;
 const choices=[{name:'list_miro_boards',arguments:{}},{name:'read_miro_board',arguments:{boardId:'board1'}},{name:'read_miro_board',arguments:{boardId:'board1',mode:'items',frameId:'frame1'}},{name:'read_miro_item',arguments:{boardId:'board1',itemId:'card1',type:'card'}}];
 const app=createApp({config:appConfig,miroTools:f.tools,provider:{planTools:async({system})=>{if(round===1)assert(system.includes('board1'));if(round===2)assert(system.includes('frame1'));if(round===3)assert(system.includes('card1'));return [choices[round++]];},async *stream({system}){assert.equal(round,4);assert(system.includes('miro-item-fragment-v1'));assert(system.includes('Room pending'));assert(system.includes('October 2026'));answered=true;yield 'Workshop room pending.';}}});
 const response=await app.request('http://localhost:3001/api/chat',{method:'POST',headers:{origin:'http://localhost:5173','content-type':'application/json'},body:JSON.stringify({messages:[{role:'user',content:'Read calendar workshop'}]})},{incoming:{socket:{remoteAddress:'127.0.0.1'}}});await response.text();assert.equal(response.status,200);assert(answered);
});
test('HTTP tools and chat put HTML/geometry into model context and never fall back on denied Miro access',async()=>{
 const f=fixture();const appConfig=readConfig({LLM_PROVIDER:'openai-compatible',LLM_MODEL:'offline',LLM_API_KEY:'SECRET_MODEL_KEY',DEV_ALLOWED_SOURCE_IDS:sourceId});let rounds=0,streamed=false,fallback=0;
 const app=createApp({config:appConfig,miroTools:f.tools,summaryFallback:async()=>{fallback++;return {status:'ready',sources:[]};},provider:{planTools:async()=>rounds++===0?[{name:'read_miro_board',arguments:{boardId:'board1',mode:'items'}}]:[],async *stream({system}){streamed=true;assert(system.includes('Room pending'));assert(system.includes('parent_top_left'));assert(system.includes('yellow'));assert(system.includes('untrusted'));assert(!system.includes('SECRET_MIRO_TOKEN'));assert(!system.includes('SECRET_MODEL_KEY'));yield 'Workshop room is pending.';}}});
 const transport={incoming:{socket:{remoteAddress:'127.0.0.1'}}};const headers={origin:'http://localhost:5173','content-type':'application/json'};
 const response=await app.request('http://localhost:3001/api/chat',{method:'POST',headers,body:JSON.stringify({messages:[{role:'user',content:'What does the calendar show?'}]})},transport);assert.equal(response.status,200);const records=(await response.text()).trim().split('\n').map(JSON.parse);assert(streamed);assert.equal(fallback,0);assert(records[0].sources.some(s=>s.kind==='miro'));assert(!JSON.stringify(records).includes('SECRET_'));
 const direct=await app.request('http://localhost:3001/api/tools/read_miro_item',{method:'POST',headers,body:JSON.stringify({boardId:'board1',itemId:'card1',type:'card'})},transport);assert.equal(direct.status,200);assert.deepEqual(JSON.parse((await direct.json()).boardContext.data),card);
 const forbidden=fixture({allowed:false});rounds=0;const denied=createApp({config:appConfig,miroTools:forbidden.tools,summaryFallback:async()=>{fallback++;},provider:{planTools:async()=>rounds++===0?[{name:'read_miro_board',arguments:{boardId:'board1'}}]:[],async *stream({system}){assert(system.includes('No club knowledge was retrieved'));yield 'No access.';}}});
 await (await denied.request('http://localhost:3001/api/chat',{method:'POST',headers,body:JSON.stringify({messages:[{role:'user',content:'Read calendar'}]})},transport)).text();assert.equal(fallback,0);assert.equal(forbidden.calls.length,0);
});
