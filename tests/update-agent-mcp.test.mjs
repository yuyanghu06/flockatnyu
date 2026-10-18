import test from 'node:test';
import assert from 'node:assert/strict';
import {createAutomationAdapters} from '../server/automation/adapters.js';
import {readAutomationConfig} from '../server/automation/config.js';
import {createMiroMcpTools} from '../tools/miro/mcp.js';
const sourceId='10000000-0000-4000-8000-000000000001',boardId='fixture',url='https://miro.com/app/board/fixture/';
function fixture({pinned=true}={}){
 let revoked=false,writes=0,restContent=0,team='team';const calls=[];
 const miroConfig={configured:true,boardIds:[boardId],...(pinned?{teamId:'team'}:{})};
 const miroStore={configured:true,authorizedBoard:async()=>({status:revoked?'forbidden':'ready',data:{board_id:boardId,source_id:sourceId,team_id:team,title:'Synthetic schedule'}})};
 const miroTools=createMiroMcpTools({config:miroConfig,store:miroStore,client:{configured:true,callTool:async(name,args)=>{calls.push({name,args});const structuredContent=name==='canvas_search'?{total_items:3,total_results:1,results:[{id:'100',type:'frame',title:'Example month'}]}:name==='table_list_rows'?{miro_url:url+'?moveToWidget=200',rows:[{rowId:'row1',cells:[{content:'Fixture row'}]}],total:1}:{success:true,miro_url:url,svg:args.widget_ids.includes('300')?'<svg><g data-miro-id="300" data-type="sticky_note"><text>Fixture event October20</text></g></svg>':'<svg><g data-miro-id="100" data-type="frame"><text>October 2026</text></g><g data-miro-id="200" data-type="grid"><table><tr><td>20</td></tr></table></g></svg>',item_count:1,skipped_count:0};return {structuredContent};}}});
 const calendarClient={configured:true,calendarId:'fixed',preflight:async()=>({status:'ready',calendarId:'fixed',accessRole:'writer'}),upsertEvent:async()=>{writes++;return {status:'ready',outcome:'created'};},cancelEvent:async()=>{writes++;return {status:'ready'};}};
 const a=createAutomationAdapters({env:{ASSISTANT_ALLOWED_SOURCE_IDS:sourceId},config:readAutomationConfig({AGENT_AUTOMATION_ENABLED:'true'}),fetchImpl:async()=>{restContent++;throw Error('Unmocked network');},dependencies:{miroConfig,miroStore,miroTools,calendarConfig:{configured:true,calendarId:'fixed'},calendarClient,googleConfig:{configured:false},googleClient:{configured:false},discordConfig:{configured:false},discordTools:{tools:[]}}});
 const context={principal:a.principal};const exec=(name,args)=>a.tools.find(t=>t.name===name).execute(args,context);
 const args=(key='miro:fixture:300',item='300')=>({sourceKey:key,sourceUrl:url+'?moveToWidget='+item,title:'Fixture event',start:{date:'2026-10-20'},end:{date:'2026-10-21'}});
 return {a,context,exec,args,calls,changeTeam:()=>{team='other-team';},writes:()=>writes,restContent:()=>restContent,revoke:()=>{revoked=true;}};
}
test('production MCP preflight has no REST content requests and catalogue/search/frame/grid never authorize Calendar writes',async()=>{
 const f=fixture();const prepared=await f.a.prepareBatch(f.context);assert.equal(prepared.miro.coverage.reason,'live_mcp_context_per_authorized_board');assert.equal(f.calls[0].name,'canvas_search');assert.equal(f.restContent(),0);
 for(const phase of ['catalogue','search','frame']){
  if(phase==='search')await f.exec('read_miro_board',{boardId:'fixture',mode:'search',patterns:['Fixture']});
  if(phase==='frame')await f.exec('read_miro_item',{boardId:'fixture',itemId:'100',type:'canvas'});
  for(const [key,item] of [['miro:fixture:300','300'],['miro:fixture:100','100'],['miro:fixture:200','200']])assert.equal((await f.exec('upsert_calendar_event',f.args(key,item))).status,'forbidden_source');
 }
 assert.equal(f.writes(),0);
});
test('observed concrete canvas identities and native stable rows grant only exact keys/URLs until batch expiry or revocation',async()=>{
 const f=fixture();await f.a.prepareBatch(f.context);await f.exec('read_miro_item',{boardId:'fixture',itemId:'300',type:'canvas'});
 assert.equal((await f.exec('upsert_calendar_event',f.args())).status,'ready');
 for(const args of [{...f.args(),sourceKey:'miro:fixture:invented'},{...f.args(),sourceUrl:'https://evil.test/'},f.args('miro:fixture:300:row:invented','300')])assert.equal((await f.exec('upsert_calendar_event',args)).status,'forbidden_source');
 await f.exec('read_miro_item',{boardId:'fixture',itemId:'200',type:'table'});assert.equal((await f.exec('upsert_calendar_event',f.args('miro:fixture:200:row:row1','200'))).status,'ready');assert.equal((await f.exec('upsert_calendar_event',f.args('miro:fixture:200','200'))).status,'forbidden_source');
 await f.a.prepareBatch(f.context);assert.equal((await f.exec('upsert_calendar_event',f.args())).status,'forbidden_source');await f.exec('read_miro_item',{boardId:'fixture',itemId:'300',type:'canvas'});f.revoke();assert.equal((await f.exec('cancel_calendar_event',{sourceKey:f.args().sourceKey,sourceUrl:f.args().sourceUrl})).status,'forbidden_source');assert.equal(f.writes(),2);f.a.cleanupBatch();assert.equal((await f.exec('read_miro_board',{boardId:'fixture'})).status,'forbidden');
});

test('Calendar evidence expires when registered team changes with pinned or observed-only team scope',async()=>{
 for(const pinned of [true,false]){
 const f=fixture({pinned});await f.a.prepareBatch(f.context);await f.exec('read_miro_item',{boardId:'fixture',itemId:'300',type:'canvas'});f.changeTeam();assert.equal((await f.exec('upsert_calendar_event',f.args())).status,'forbidden_source');assert.equal(f.writes(),0);
 }
});
