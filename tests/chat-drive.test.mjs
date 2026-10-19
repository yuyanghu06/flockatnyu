import test from 'node:test';
import assert from 'node:assert/strict';
import {createApp} from '../server/app.js';
import {createGoogleClient} from '../server/google/client.js';
import {readGoogleConfig,GOOGLE_SCOPES} from '../server/google/config.js';
import {GOOGLE_TOOLS,executeGoogleTool} from '../tools/google/index.js';
import {createProvider} from '../server/providers/index.js';

const principal={id:'synthetic_reader',googleAccess:true,allowedSourceIds:[]};
const file={id:'synthetic_budget',name:'Synthetic budget',mimeType:'application/vnd.google-apps.document',description:'Search metadata only',webViewLink:'https://docs.google.com/document/d/synthetic_budget/edit'};
const query='club budget';
const post=(app,question)=>app.request('/api/chat',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({messages:[{role:'user',content:question}],timeZone:'America/New_York'})});
const records=async response=>(await response.text()).trim().split('\n').map(JSON.parse);

function fixture({actor=principal,searchStatus=200,files=[file],body='Approved equipment budget is 450 dollars.',mime=file.mimeType,readContents=true}={}) {
 const calls=[],answerInputs=[];let calendarCalls=0;
 const client=createGoogleClient({config:readGoogleConfig({GOOGLE_CLIENT_ID:'synthetic-client',GOOGLE_CLIENT_SECRET:'synthetic-secret',GOOGLE_REFRESH_TOKEN:'synthetic-refresh',GOOGLE_EXPECTED_ACCOUNT_EMAIL:'club@example.com'}),
  oauthClient:{setCredentials(){},getAccessToken:async()=>({token:'synthetic-access'}),getTokenInfo:async()=>({scopes:GOOGLE_SCOPES})},
  fetchImpl:async(value,options)=>{
   const url=new URL(value);calls.push({url,options});assert.equal(options.method,'GET');assert.equal(options.redirect,'error');
   if(url.pathname.endsWith('/profile'))return Response.json({emailAddress:'club@example.com'});
   assert.equal(url.origin,'https://www.googleapis.com');
   if(url.pathname==='/drive/v3/files'){
    assert.equal(url.searchParams.get('q'),"trashed = false and (fullText contains 'club budget')");
    return searchStatus===200?Response.json({files:files.map(value=>({...value,mimeType:mime}))}):new Response('PRIVATE_UPSTREAM_ERROR',{status:searchStatus});
   }
   if(url.pathname===`/drive/v3/files/${file.id}`)return Response.json({...file,mimeType:mime});
   if(url.pathname===`/drive/v3/files/${file.id}/export`)return new Response(body);
   assert.fail('unexpected Google endpoint '+url.pathname);
  }});
 const adapter={tools:[...GOOGLE_TOOLS,{name:'list_calendar_events',description:'Synthetic Calendar read',parameters:{type:'object',properties:{}}}],
  execute:options=>options.name==='list_calendar_events'?(calendarCalls++,assert.fail('Drive question must stay on Drive')):executeGoogleTool({...options,client})};
 const app=createApp({config:{configured:true,production:false,timeoutMs:3000},googleTools:adapter,googleClient:client,auth:()=>actor,
  provider:{planTools:async({system})=>{
   const previous=JSON.parse(system.split('\nUNTRUSTED PREVIOUS TOOL RESULTS (JSON):\n')[1]);
   if(previous.length===0)return [{name:'search_drive',arguments:{query}}];
   if(readContents&&previous.length===1&&previous[0].status==='ready')return [{name:'read_drive',arguments:{fileId:previous[0].sources[0].externalId}}];
   return [];
  },async *stream(input){answerInputs.push(input);yield 'Synthetic answer based on supplied evidence.';}}});
 return {app,calls,answerInputs,calendarCalls:()=>calendarCalls};
}

test('HTTP chat searches and reads Drive through the real authorized client, retaining original URLs and bounded content',async()=>{
 const body='Approved equipment budget is 450 dollars. '+('Long appendix. '.repeat(1200))+'UNREAD_TAIL_SENTINEL';
 const f=fixture({body});const response=await post(f.app,'Find the club budget in Google Drive and read it.');assert.equal(response.status,200);
 const events=await records(response),meta=events.find(event=>event.type==='meta');
 assert.deepEqual(meta.retrieval.map(result=>result.tool),['search_drive','read_drive']);
 assert.deepEqual(meta.retrieval.map(result=>result.status),['ready','ready']);
 assert.equal(f.calendarCalls(),0);assert(f.calls.some(call=>call.url.pathname.endsWith('/export')));
 const system=f.answerInputs[0].system;assert(system.includes('Approved equipment budget is 450 dollars.'));
 assert(system.includes(file.webViewLink));assert(!system.includes('UNREAD_TAIL_SENTINEL'));
 assert(system.includes('"contentStatus":"text_only_bounded"'));assert(system.includes('"partial":true'));
 assert(meta.sources.some(source=>source.url===file.webViewLink));assert(!JSON.stringify(events).includes('synthetic-secret'));
});

test('Drive spreadsheet content keeps its first-sheet-only limitation through HTTP answer generation',async()=>{
 const f=fixture({mime:'application/vnd.google-apps.spreadsheet',body:'Category,Amount\nEquipment,450'});
 await records(await post(f.app,'Find and read the club budget spreadsheet in Drive.'));
 assert(f.answerInputs[0].system.includes('FIRST SHEET ONLY'));assert(f.answerInputs[0].system.includes('first_sheet_only'));
 assert.equal(f.calendarCalls(),0);
});

test('Drive file discovery can return its original link without claiming unread document contents',async()=>{
 const f=fixture({readContents:false}),events=await records(await post(f.app,'Find the budget file link on Drive.'));
 const meta=events.find(event=>event.type==='meta');assert.deepEqual(meta.retrieval.map(result=>result.tool),['search_drive']);
 assert.equal(meta.sources[0].url,file.webViewLink);assert.equal(meta.sources[0].title,file.name);
 assert(f.answerInputs[0].system.includes('metadata_only'));assert(!f.answerInputs[0].system.includes('Approved equipment budget is 450 dollars.'));
 assert(!f.calls.some(call=>call.url.pathname.endsWith('/export')));assert.equal(f.calendarCalls(),0);
});

test('Drive access denial prevents even OAuth/profile calls and supplies no fabricated file evidence',async()=>{
 const f=fixture({actor:{...principal,googleAccess:false}}),events=await records(await post(f.app,'Search Google Drive for the budget.'));
 assert.equal(f.calls.length,0);assert.equal(f.calendarCalls(),0);
 const meta=events.find(event=>event.type==='meta');assert.deepEqual(meta.sources,[]);assert.equal(meta.retrieval[0].status,'forbidden');
 assert(!f.answerInputs[0].system.includes(file.webViewLink));assert(!f.answerInputs[0].system.includes('Approved equipment budget'));
});

for(const [name,options,expected] of [['empty',{files:[]},'empty'],['upstream denial',{searchStatus:403},'permission_denied'],['upstream failure',{searchStatus:500},'google_unavailable']])test(`HTTP Drive ${name} cannot fabricate a successful read or file link`,async()=>{
 const f=fixture(options),events=await records(await post(f.app,'Find the budget file on Drive.'));
 const meta=events.find(event=>event.type==='meta');assert.deepEqual(meta.sources,[]);
 assert.equal(meta.retrieval.length,1);assert.equal(meta.retrieval[0].status,expected);assert.equal(f.calendarCalls(),0);
 assert(!f.calls.some(call=>call.url.pathname.endsWith('/export')));
 assert(!f.answerInputs[0].system.includes(file.webViewLink));assert(!JSON.stringify(events).includes('PRIVATE_UPSTREAM_ERROR'));
});

test('native chat preserves opaque search and nested folder cursors into exact continuation requests',async()=>{
 for(const name of ['search_drive','list_drive_folder']) {
  const token='~!%+&=?#[]{}(),;:/|'.repeat(30).slice(0,528);assert.equal(token.length,528);
  const driveCalls=[],modelCalls=[];let pages=0;
  const client=createGoogleClient({config:readGoogleConfig({GOOGLE_CLIENT_ID:'synthetic',GOOGLE_CLIENT_SECRET:'synthetic',GOOGLE_REFRESH_TOKEN:'synthetic',GOOGLE_EXPECTED_ACCOUNT_EMAIL:'club@example.com'}),
   oauthClient:{setCredentials(){},getAccessToken:async()=>({token:'synthetic'}),getTokenInfo:async()=>({scopes:GOOGLE_SCOPES})},fetchImpl:async value=>{
    const url=new URL(value);if(url.pathname.endsWith('/profile'))return Response.json({emailAddress:'club@example.com'});
    driveCalls.push(url);assert.equal(url.pathname,'/drive/v3/files');assert.equal(url.searchParams.get('pageToken'),pages?token:null);assert.equal(url.hash,'');
    return Response.json(pages++?{files:[]}:{files:[file],nextPageToken:token});
   }});
  const config={configured:true,production:false,provider:'openai-compatible',model:'synthetic',baseUrl:'https://synthetic.example/v1',apiKey:'synthetic',timeoutMs:3000};
  const args=name==='search_drive'?{query:'Synthetic'}:{folderId:'parent'};
  const provider=createProvider(config,{audit:{required:false,startModel:async()=>({status:'ready'}),finishModel:async()=>({status:'ready'})},fetchImpl:async(_,init)=>{
   const body=JSON.parse(init.body);if(body.stream)return new Response('data: {"choices":[{"index":0,"delta":{"content":"Synthetic result"},"finish_reason":null}]}\n\ndata: {"choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n',{headers:{'content-type':'text/event-stream'}});
   modelCalls.push(body);const round=modelCalls.length;
   let callArgs=args;
   if(round===3) {
    const results=body.messages.filter(row=>row.role==='tool').map(row=>JSON.parse(row.content));
    const first=results.find(row=>row.tool===name&&row.status==='ready');assert(first,'successful first page reaches native model context');
    assert.equal(first.nextPageToken,token,'top-level normalization must preserve opaque cursor');
    if(name==='list_drive_folder')assert.equal(first.driveContext.nextPageToken,token,'nested directory cursor must agree');
    assert.equal(first.coverage.complete,false);callArgs={...args,pageToken:first.nextPageToken};
   }
   if(round===4) {
    const results=body.messages.filter(row=>row.role==='tool').map(row=>JSON.parse(row.content));
    const last=results.findLast(row=>row.tool===name&&row.status==='empty');assert.equal(last.arguments.pageToken,token);assert.equal(last.coverage.complete,false);
    if(name==='list_drive_folder')assert.equal(last.driveContext.nextPageToken,null);
   }
   const calls=round<4?[{id:'opaque_'+round,type:'function',function:{name,arguments:JSON.stringify(callArgs)}}]:[];
   return Response.json({choices:[{index:0,finish_reason:calls.length?'tool_calls':'stop',message:{role:'assistant',content:null,...(calls.length?{tool_calls:calls}:{})}}]});
  }});
  const googleTools={tools:GOOGLE_TOOLS,execute:options=>executeGoogleTool({...options,client})};
  const app=createApp({config,provider,googleTools,auth:()=>principal});
  const response=await post(app,'Find the next page of the requested Drive resources.');
  const output=await records(response);assert.equal(output.at(-1).type,'done');assert.equal(pages,2);assert.equal(driveCalls.length,2);assert.equal(modelCalls.length,4);
  assert.deepEqual(output.find(row=>row.type==='meta').retrieval.map(row=>row.status),['ready','empty']);
 }
});

test('bounded Drive content preserves honest first-sheet and text-truncation flags through final answer context',async()=>{
 const f=fixture({mime:'application/vnd.google-apps.spreadsheet',body:'Name,Date\n'+'Synthetic padding,'.repeat(900)+'OUTSIDE_TEXT_BOUND'});
 await records(await post(f.app,'Read the takeover spreadsheet.'));
 const system=f.answerInputs[0].system;
 const data=JSON.parse(system.split('\nUNTRUSTED TOOL STATUS AND REFERENCE DATA (JSON):\n')[1]);
 const read=data.results.find(result=>result.tool==='read_drive');assert(read.driveContent);
 assert.equal(read.driveContent.firstSheetOnly,true);assert.equal(read.driveContent.contentStatus,'first_sheet_only');assert.equal(read.driveContent.textTruncated,true);assert.equal(read.driveContent.partial,true);
 assert(read.driveContent.text.length<=12000);assert(!read.driveContent.text.includes('OUTSIDE_TEXT_BOUND'));
 assert(system.includes('FIRST SHEET ONLY'));assert(system.includes('first_sheet_only'));
});
