import test from 'node:test';
import assert from 'node:assert/strict';
import {createApp} from '../server/app.js';
import {createGoogleClient} from '../server/google/client.js';
import {readGoogleConfig,GOOGLE_SCOPES} from '../server/google/config.js';
import {GOOGLE_TOOLS,executeGoogleTool} from '../tools/google/index.js';

const principal={id:'synthetic_reader',googleAccess:true,allowedSourceIds:[]};
const file={id:'synthetic_budget',name:'Synthetic budget',mimeType:'application/vnd.google-apps.document',description:'Search metadata only',webViewLink:'https://docs.google.com/document/d/synthetic_budget/edit'};
const query='club budget';
const post=(app,question)=>app.request('/api/chat',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({messages:[{role:'user',content:question}],timeZone:'America/New_York'})});
const records=async response=>(await response.text()).trim().split('\n').map(JSON.parse);

function fixture({actor=principal,searchStatus=200,files=[file],body='Approved equipment budget is 450 dollars.',mime=file.mimeType,readContents=true}={}) {
 const calls=[],answerInputs=[];let calendarCalls=0,round=0;
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
   if(round++===0)return [{name:'search_drive',arguments:{query}}];
   const previous=JSON.parse(system.split('\nUNTRUSTED PREVIOUS TOOL RESULTS (JSON):\n')[1]);
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
