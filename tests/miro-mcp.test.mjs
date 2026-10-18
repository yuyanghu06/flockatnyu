import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {createMiroMcpTools,miroSvgItems} from '../tools/miro/mcp.js';
import {retrieveAssistantContext} from '../server/assistant-context.js';
import {validateArguments} from '../server/automation/validation.js';
const sourceId='10000000-0000-4000-8000-000000000001';
const principal={id:'fixture',allowedSourceIds:[sourceId]};
const boardId='fixture=',itemId='100',url='https://miro.com/app/board/fixture%3D/';
const overview=()=>({total_items:5,total_results:1,results:[{id:'100',type:'frame',item_count:5,title:'Example month',samples:['Example']}],next_cursor:null});
const svg=()=>'<svg xmlns="http://www.w3.org/2000/svg"><g data-miro-id="100"><rect data-type="frame"/><text>Example 2026</text><g data-miro-id="200" data-type="grid"><foreignObject><table><tr><td>20</td></tr></table></foreignObject><g data-miro-id="300" data-type="sticky_note" data-content="Fixture event"><text>18:00</text></g></g></g></svg>';
const canvas=(text=svg())=>({success:true,message:'OK',miro_url:url,svg:text,item_count:3,skipped_count:0});
const table=(rows=[{rowId:'stable-1',cells:[{columnTitle:'Title',valueType:'text',content:'Fixture event'}]}])=>({miro_url:url+'?moveToWidget=100',rows,total:rows.length,columns:[{id:'c1',column_title:'Title',column_type:'text'}],cursor:null});
function fixture({payload=overview(),onCall,rowTeam='team',auth}={}) {
 const calls=[];let n=0;
 const adapter=createMiroMcpTools({config:{configured:true,boardIds:[boardId],teamId:'team'},store:{configured:true,authorizedBoard:async()=>auth?auth(++n):{status:'ready',data:{board_id:boardId,source_id:sourceId,team_id:rowTeam,title:'Synthetic schedule'}}},client:{configured:true,callTool:async(name,args)=>{calls.push({name,args});await onCall?.(name,args);return {structuredContent:typeof payload==='function'?payload():payload};}}});
 return {adapter,calls,read:(args={})=>adapter.execute({name:'read_miro_board',arguments:{boardId,...args},principal}),item:(args={})=>adapter.execute({name:'read_miro_item',arguments:{boardId,itemId,type:'canvas',...args},principal})};
}
test('MCP overview and search use exact navigation schemas without REST metadata',async()=>{
 const f=fixture();assert.equal((await f.read()).status,'ready');assert.equal((await f.read({mode:'search',patterns:['Fixture','October'],resultMode:'areas',targetId:'m123',cursor:2})).status,'ready');
 assert.deepEqual(f.calls,[{name:'canvas_search',args:{miro_url:'https://miro.com/app/board/fixture=/',result_mode:'overview',is_repository:false}},{name:'canvas_search',args:{miro_url:'https://miro.com/app/board/fixture=/',result_mode:'areas',is_repository:false,patterns:['Fixture','October'],target_id:'m123',cursor:2}}]);
});
test('upstream wrapper calls conform to actual observed official input schemas when available', {skip:!existsSync('/tmp/tech-miro-mcp-tools.json')},async()=>{
 const schemas={};const walk=o=>{if(o&&typeof o==='object'){if(o.name&&o.inputSchema)schemas[o.name]=o.inputSchema;else Object.values(o).forEach(walk);}};walk(JSON.parse(readFileSync('/tmp/tech-miro-mcp-tools.json','utf8')));
 for(const [payload,kind] of [[overview(),'overview'],[canvas(),'canvas'],[table(),'table']]) {
  const f=fixture({payload,onCall:(name,args)=>assert.equal(validateArguments(args,schemas[name]),true,name)});
  const r=kind==='overview'?await f.read({mode:'search',patterns:['Fixture'],targetId:'m123'}):await f.item({type:kind,...(kind==='canvas'?{scope:{x:0,y:0,width:100,height:100}}:{})});assert.equal(r.status,'ready');
 }
});
test('navigation search and bare frame/grid contents never produce write evidence',async()=>{
 const f=fixture();const r=await f.read({mode:'search',patterns:['Fixture']});assert(r.sources.every(s=>!s.contentAvailable&&!s.sourceKey));assert.equal(r.coverage.wholeBoardComplete,false);
 const g=fixture({payload:canvas('<svg><g data-miro-id="100" data-type="frame"><text>October</text></g><g data-miro-id="200" data-type="grid"><table><tr><td>20</td></tr></table></g></svg>')});assert((await g.item()).sources.every(s=>!s.contentAvailable));
});
test('observed zero-match MCP response may omit results and cursor without failing the read',async()=>{
 for(const payload of [
  {total_items:1226,total_results:0},
  {total_items:1226,total_results:0,results:[]},
  {total_items:1226,total_results:0,results:[],next_cursor:null},
  {total_items:0,total_results:0},
 ]) {
  const f=fixture({payload});const r=await f.read({mode:'search',patterns:['2026-10-18']});
  assert.equal(r.status,'ready',JSON.stringify(payload));
  assert.equal(r.boardContext.payload.total_results,0);assert.equal(r.boardContext.nextCursor,null);
  assert.equal(r.coverage.returnedCount,0);assert.equal(r.coverage.complete,false);assert.equal(r.coverage.wholeBoardComplete,false);
  assert(r.sources.length>0);assert(r.sources.every(s=>s.contentAvailable===false&&!s.sourceKey&&!s.evidenceKind));
 }
});
test('empty-result compatibility does not accept malformed counts, missing positive results or contradictory continuation',async()=>{
 for(const payload of [
  {},{total_items:1226},{total_results:0},
  {total_items:1226,total_results:'0'},
  {total_items:-1,total_results:0},{total_items:1226,total_results:-1},
  {total_items:1226,total_results:1},{total_items:1226,total_results:1,results:null},
  {total_items:1226,total_results:0,results:{}},
  {total_items:1226,total_results:0,results:[{id:'100',type:'frame'}]},
  {total_items:1226,total_results:0,next_cursor:0},
  {total_items:1226,total_results:0,results:[],next_cursor:1},
 ]) {
  const f=fixture({payload});const r=await f.read({mode:'search',patterns:['2026-10-18']});
  assert.equal(r.status,'invalid_mcp_result',JSON.stringify(payload));assert.deepEqual(r.sources,[]);assert.equal(r.boardContext,undefined);
 }
});
test('nested grid canvas preserves date layout and original sticky source identity in chat',async()=>{
 const f=fixture({payload:canvas()});const r=await f.item({itemIds:['300'],scope:{x:0,y:0,width:100,height:100}});assert.equal(r.status,'ready');assert.deepEqual(r.sources.filter(s=>s.contentAvailable).map(s=>s.sourceKey),['miro:fixture=:300']);assert.equal(r.boardContext.payload.svg,svg());assert.deepEqual(f.calls[0].args.widget_ids,['100','300']);
 let step=0;const context=await retrieveAssistantContext({messages:[{role:'user',content:'Fixture date?'}],principal,miroTools:f.adapter,provider:{planTools:async()=>step++?[]:[{name:'read_miro_item',arguments:{boardId,itemId,type:'canvas'}}]},now:'2026-10-18T16:00:00Z',timeZone:'America/New_York'});assert.equal(context.results[0].boardContext.payload.svg,svg());assert(context.sources.some(s=>s.url===url+'?moveToWidget=300'));
});
test('table stable identities, columns, page cursor and final page coverage are preserved',async()=>{
 const payload={...table(),total:2,cursor:'opaque+/='};const f=fixture({payload});const r=await f.item({type:'table',limit:1,cursor:'previous'});assert.equal(r.status,'partial');assert.equal(r.boardContext.nextCursor,'opaque+/=');assert.equal(r.sources.find(s=>s.contentAvailable).sourceKey,'miro:fixture=:100:row:stable-1');assert.deepEqual(r.boardContext.payload.columns,payload.columns);assert.equal(f.calls[0].args.next_cursor,'previous');assert.equal(r.coverage.complete,false);
});
test('configured board scope, principal scope and current team fail closed before content calls',async()=>{
 for(const args of [{boardId:'other'},{boardId:'https://evil.test/'},{boardId:'fixture=/../other'}]) {const f=fixture();assert.match((await f.read(args)).status,/forbidden|invalid_request/);assert.equal(f.calls.length,0);}
 for(const rowTeam of ['wrong',null]){const f=fixture({rowTeam});assert.equal((await f.read()).status,'forbidden');assert.equal(f.calls.length,0);}
 const g=fixture();assert.equal((await g.adapter.execute({name:'read_miro_board',arguments:{boardId},principal:{allowedSourceIds:['other']}})).status,'forbidden');assert.equal(g.calls.length,0);
});
test('revocation and source/team change during content read suppress all returned content',async()=>{
 for(const mutation of [null,{board_id:boardId,source_id:'other',team_id:'team'},{board_id:boardId,source_id:sourceId,team_id:'other'}]){
  const f=fixture({payload:canvas(),auth:n=>n===1?{status:'ready',data:{board_id:boardId,source_id:sourceId,team_id:'team'}}:mutation?{status:'ready',data:mutation}:{status:'forbidden'}});const r=await f.item();assert.equal(r.status,'forbidden');assert.equal(r.boardContext,undefined);assert.deepEqual(r.sources,[]);
 }
});
test('MCP response errors, foreign board links and duplicate/unsafe row identities fail closed',async()=>{
 for(const payload of [{}, {...canvas(),miro_url:'https://evil.test/'},{...canvas(),miro_url:url.replace('fixture%3D','other')},{...table(),rows:[{rowId:'x',cells:[]},{rowId:'x',cells:[]}]},{...table(),rows:[{rowId:'../../x',cells:[{}]}]}]){
 const f=fixture({payload});const r=await f.item({type:payload.rows?'table':'canvas'});assert.equal(r.status,'invalid_mcp_result');assert.deepEqual(r.sources,[]);
 }
});
test('SVG parsing rejects entities and malformed documents and never mistakes nested frame headings for events',()=>{
 assert.throws(()=>miroSvgItems('<!DOCTYPE svg [<!ENTITY ex SYSTEM "file:///etc/passwd">]><svg>&ex;</svg>'));
 assert.throws(()=>miroSvgItems('<svg><g></svg>'));assert.deepEqual(miroSvgItems(svg()).map(x=>x.id),['300']);
});
test('large content is losslessly fragmented, hash guards later changes, and fragments never authorize writes',async()=>{
 let text='x'.repeat(40000);const f=fixture({payload:()=>canvas(`<svg><g data-miro-id="300" data-type="sticky_note"><text>${text}</text></g></svg>`)});const r=await f.item();assert.equal(r.status,'partial');assert.equal(r.coverage.textTruncated,true);assert(r.sources.every(s=>!s.contentAvailable&&!s.sourceKey));let encoded=r.boardContext.data,next=r.boardContext.nextOffset;while(next!==null){const p=await f.item({offset:next,expectedHash:r.boardContext.hash});encoded+=p.boardContext.data;next=p.boardContext.nextOffset;}assert.equal(JSON.parse(encoded).payload.svg.includes(text),true);
 assert.equal((await f.item({offset:1})).status,'invalid_request');text+='changed';assert.equal((await f.item({offset:16000,expectedHash:r.boardContext.hash})).status,'content_changed');
});
test('escaped Unicode fragments fit chat serialization budgets without losing characters',async()=>{
 const original='<svg><g data-miro-id="300" data-type="sticky_note"><text>'+('🗽界"\n'.repeat(8000)).replaceAll('"','&quot;')+'</text></g></svg>';
 const f=fixture({payload:canvas(original)});let r=await f.item(),raw='',parts=0;
 while(true){assert(Buffer.byteLength(JSON.stringify(r.boardContext))<=26000);assert.equal(r.boardContext.format,'miro-mcp-json-fragment-v1');raw+=r.boardContext.data;parts++;if(r.boardContext.nextOffset===null)break;r=await f.item({offset:r.boardContext.nextOffset,expectedHash:r.boardContext.hash});assert(parts<100);}
 assert.equal(JSON.parse(raw).payload.svg,original);assert(parts>1);
});

test('canvas/table option mistakes return safe correction notices and never perform broader reads',async()=>{
 for(const [type,invalid,reason,notice] of [
  ['canvas',{limit:1},'canvas_options',/omit limit and cursor/],
  ['canvas',{cursor:'opaque-private-cursor'},'canvas_options',/use itemIds and\/or scope/],
  ['table',{scope:{x:0,y:0,width:100,height:100}},'table_options',/omit scope and itemIds/],
  ['table',{itemIds:['private-native-item']},'table_options',/use limit and cursor/],
 ]){
  const f=fixture({payload:type==='canvas'?canvas():table()}),result=await f.item({type,...invalid});
  assert.equal(result.status,'invalid_request');assert.equal(result.reason,reason);assert.match(result.notice,notice);assert.deepEqual(result.sources,[]);assert.equal(f.calls.length,0);assert(Buffer.byteLength(JSON.stringify(result))<1024);
  assert(!JSON.stringify(result).includes('opaque-private-cursor'));assert(!JSON.stringify(result).includes('private-native-item'));
  const corrected=await f.item({type});assert(['ready','partial'].includes(corrected.status));assert.equal(f.calls.length,1);assert.equal(f.calls[0].name,type==='canvas'?'canvas_read_as_svg':'table_list_rows');
  if(type==='canvas')assert.deepEqual(f.calls[0].args.widget_ids,[itemId]);
 }
});
test('native ID/schema feedback is fixed, never reflects input or bypasses board access',async()=>{
 const f=fixture();let reference;
 for(const invalid of [{itemId:'PRIVATE_SCHEMA_CANARY/../item'},{boardId:'https://PRIVATE_SCHEMA_CANARY.invalid/'},{type:'PRIVATE_SCHEMA_CANARY'},{unexpected:'PRIVATE_SCHEMA_CANARY'}]){
  const result=await f.item(invalid);assert.equal(result.status,'invalid_request');assert.equal(result.reason,'schema');assert.match(result.notice,/declared tool schema and exact native boardId\/itemId/);assert(!JSON.stringify(result).includes('PRIVATE_SCHEMA_CANARY'));assert.deepEqual(result.sources,[]);
  reference??=result;assert.deepEqual(result,reference);
 }
 assert.equal(f.calls.length,0);assert.equal((await f.item({boardId:'other'})).status,'forbidden');assert.equal(f.calls.length,0);
 const definition=f.adapter.tools.find(t=>t.name==='read_miro_item');assert.match(definition.description,/type=canvas: omit limit\/cursor/);assert.match(definition.description,/type=table: omit scope\/itemIds; use limit\/cursor/);
});
