import test from 'node:test';
import assert from 'node:assert/strict';
import {readMiroConfig} from '../server/miro/config.js';
import {createMiroClient,MiroError} from '../server/miro/client.js';
import {fetchBoardSnapshot,collectCursorPages,snapshotContentHash} from '../server/miro/snapshot.js';
const config=()=>readMiroConfig({MIRO_SYNC_ENABLED:'true',MIRO_ACCESS_TOKEN:'fixture',MIRO_BOARD_IDS:'board1',MIRO_TEAM_ID:'team1'});
const board={id:'board1',modifiedAt:'2026-10-15T12:00:00Z',team:{id:'team1'},description:'Calendar legend: yellow = tentative'};
test('real client + snapshot preserves pagination, typed descriptions, HTML, geometry and explicit relationships',async()=>{
 const requests=[];const client=createMiroClient({config:config(),fetchImpl:async(url)=>{
  const u=new URL(url),p=u.pathname;requests.push(u.href);
  if(p==='/v2/boards/board1')return Response.json(board);
  if(p.endsWith('/items'))return Response.json(u.searchParams.has('group_item_id')?{data:[{id:'card1',type:'card'}]}:u.searchParams.get('cursor')==='next'?{data:[{id:'sticky1',type:'sticky_note',data:{content:'<p>Room pending</p>'}}]}:{data:[{id:'card1',type:'card',data:{title:'Workshop'},position:{x:12,y:34,relativeTo:'parent_top_left'},parent:{id:'frame1'},unknown:{original:true}}],cursor:'next'});
  if(p.endsWith('/cards/card1'))return Response.json({id:'card1',type:'card',data:{title:'<b>Workshop</b>',description:'Bring laptop',dueDate:'2026-10-22'},geometry:{width:200,height:100,rotation:15}});
  if(p.endsWith('/sticky_notes/sticky1'))return Response.json({id:'sticky1',type:'sticky_note',data:{content:'<p>Room pending</p>'},style:{fillColor:'yellow'}});
  if(p.endsWith('/connectors/edge1'))return Response.json({id:'edge1',type:'connector',startItem:{id:'card1'},endItem:{id:'sticky1'}});
  if(p.endsWith('/connectors'))return Response.json({data:[{id:'edge1',type:'connector',captions:[{content:'related'}]}]});
  if(p.endsWith('/groups'))return Response.json({data:[{id:'group1',type:'group'}]});
  if(p.endsWith('/items/card1/tags'))return Response.json({tags:[{id:'tag1',title:'Workshop'}]});
  if(p.endsWith('/items/sticky1/tags'))return Response.json({tags:[]});
  if(p.endsWith('/tags'))return Response.json({data:[{id:'tag1',title:'Workshop'}],offset:0,total:1});
  assert.fail('Unexpected endpoint '+u.href);
 }});
 const saved=await fetchBoardSnapshot({client,boardId:'board1',config:config()});
 assert.equal(saved.items.length,2);const card=saved.items[0];assert.equal(card.data.description,'Bring laptop');assert.equal(card.data.title,'<b>Workshop</b>');assert.deepEqual(card.position,{x:12,y:34,relativeTo:'parent_top_left'});assert.deepEqual(card.parent,{id:'frame1'});assert.deepEqual(card.unknown,{original:true});assert.equal(card.geometry.rotation,15);
 assert.deepEqual(saved.itemTags.card1,[{id:'tag1',title:'Workshop'}]);assert.equal(saved.groupItems.group1[0].id,'card1');assert.equal(saved.connectors[0].startItem.id,'card1');assert.equal(saved.connectors[0].captions[0].content,'related');assert.equal(saved.board.description,board.description);assert.equal(saved.coverage.complete,true);
 assert(requests.some(url=>url.includes('cursor=next')));assert.equal(saved.coverage.consistency,'modifiedAt_before_after_best_effort');
 assert.equal(snapshotContentHash(saved),snapshotContentHash({...saved,captureStartedAt:'changed',captureFinishedAt:'changed',coverage:{}}));assert.notEqual(snapshotContentHash(saved),snapshotContentHash({...saved,items:[]}));
});
test('bad cursors, omitted pages, duplicate identity and bounded collections fail closed',async()=>{
 for(const [pages,code] of [
  [[{data:[{id:'a'}],cursor:'same'},{data:[{id:'b'}],cursor:'same'}],'repeated_cursor'],
  [[{data:[{id:'a'}],total:2}],'incomplete_pagination'],
  [[{data:[{id:'a'},{id:'a'}]}],'duplicate_or_malformed_item'],
  [[{data:[],links:{next:'https://evil.example/steal'}}],'incomplete_pagination'],
 ]){let count=0;await assert.rejects(collectCursorPages(async()=>pages[count++],{config:config()}),{code});}
 await assert.rejects(collectCursorPages(async()=>({data:[{id:'a'},{id:'b'}]}),{config:{...config(),maxItems:1}}),{code:'item_limit'});
});
test('nested group cursors exhaust every page and ambiguous/missing continuation fails closed',async()=>{
 for(const location of ['container','nested']){
  const cursors=[];const result=await collectCursorPages(async({cursor})=>{
   cursors.push(cursor);const nested={data:[{id:cursor?'b':'a'}],total:2,offset:cursor?1:0};const container={id:'group1',data:[nested]};if(!cursor)(location==='container'?container:nested).cursor='page2';return {data:container};
  },{config:config(),groupId:'group1'});assert.deepEqual(result.map(v=>v.id),['a','b']);assert.deepEqual(cursors,[undefined,'page2']);
 }
 for(const [raw,code] of [[{data:{id:'group1',data:[{data:[{id:'a'}],total:2,offset:0}]}},'incomplete_group_pagination'],[{cursor:'a',data:{id:'group1',cursor:'b',data:[{data:[{id:'a'}]}]}},'ambiguous_group_pagination']])await assert.rejects(collectCursorPages(async()=>raw,{config:config(),groupId:'group1'}),{code});
});
const emptyClient=()=>({readBoard:async()=>board,listItems:async()=>({data:[]}),listConnectors:async()=>({data:[]}),listGroups:async()=>({data:[]}),listTags:async()=>({data:[],total:0,offset:0})});
test('concurrent edits trigger full retry; changing board or missing relationships never publish complete snapshot',async()=>{
 const c=emptyClient();let reads=0,collections=0;c.readBoard=async()=>({...board,modifiedAt:++reads===1?board.modifiedAt:'2026-10-15T13:00:00Z'});c.listItems=async()=>{collections++;return {data:[]};};
 const out=await fetchBoardSnapshot({client:c,boardId:'board1',config:config()});assert.equal(collections,2);assert.equal(out.board.modifiedAt,'2026-10-15T13:00:00Z');
 const changed=emptyClient();let v=0;changed.readBoard=async()=>({...board,modifiedAt:new Date(++v*1000).toISOString()});await assert.rejects(fetchBoardSnapshot({client:changed,boardId:'board1',config:config()}),{code:'board_changed'});
 const denied=emptyClient();denied.listGroups=async()=>{throw new MiroError('forbidden');};await assert.rejects(fetchBoardSnapshot({client:denied,boardId:'board1',config:config()}),{code:'forbidden'});
});
