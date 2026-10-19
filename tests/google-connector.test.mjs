import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {readGoogleConfig,GOOGLE_SCOPES} from '../server/google/config.js';
import {createGoogleClient,boundedGoogleBody} from '../server/google/client.js';
import {executeGoogleTool,GOOGLE_TOOLS} from '../tools/google/index.js';
import {verifyGoogleToken,waitForGoogleAuth} from '../server/google/oauth.js';
import {createAutomationAdapters} from '../server/automation/adapters.js';
import {readAutomationConfig} from '../server/automation/config.js';
import {checkSchema} from '../server/automation/validation.js';
const env={GOOGLE_CLIENT_ID:'fixture-client',GOOGLE_CLIENT_SECRET:'fixture-secret',GOOGLE_REFRESH_TOKEN:'fixture-refresh',GOOGLE_EXPECTED_ACCOUNT_EMAIL:'club@example.com'};
const config=readGoogleConfig(env);
const json=value=>Response.json(value);
function fixture({scopes=GOOGLE_SCOPES,email='club@example.com',tokenError,handler,token='fixture-access'}={}) {
  const calls=[],oauth={setCredentials:value=>{assert.equal(value.refresh_token,'fixture-refresh');},getAccessToken:async()=>{if(tokenError)throw tokenError;return {token};},getTokenInfo:async()=>({scopes})};
  const client=createGoogleClient({config,oauthClient:oauth,fetchImpl:async(url,options)=>{calls.push({url,options});assert.equal(options.method,'GET');assert.equal(options.redirect,'error');return new URL(url).pathname.endsWith('/profile')?json({emailAddress:email}):handler?handler(new URL(url),options):json({messages:[]});}});
  return {client,calls,oauth};
}
test('Google runtime requires OAuth credentials, refresh token and explicit expected account',async()=>{
  for(const input of [{},{GOOGLE_API_KEY:'fixture-api-key'},{...env,GOOGLE_REFRESH_TOKEN:''},{...env,GOOGLE_EXPECTED_ACCOUNT_EMAIL:''},{...env,GOOGLE_REDIRECT_URI:'https://attacker.invalid'}])assert.equal(readGoogleConfig(input).configured,false);
  assert(config.configured);const c=createGoogleClient({config:readGoogleConfig({}),oauthClient:{},fetchImpl:()=>{throw Error('network must stay unused');}});assert.equal((await c.searchGmail({query:'club'})).status,'not_configured');assert(!JSON.stringify(c.status()).includes('fixture-secret'));
});
test('tools deny default members and expose only reads',async()=>{
  assert.deepEqual(GOOGLE_TOOLS.map(t=>t.name),['search_gmail','read_gmail','search_drive','read_drive','list_drive_folder']);let called=0;const client={configured:true,searchGmail:async()=>{called++;return {status:'ready',sources:[]};}};
  for(const principal of [null,{id:'member'},{id:'member',googleAccess:false},{id:'',googleAccess:true}])assert.equal((await executeGoogleTool({name:'search_gmail',arguments:{query:'club'},principal,client})).status,'forbidden');
  assert.equal(called,0);assert.equal((await executeGoogleTool({name:'send_gmail',arguments:{to:'person@example.com'},principal:{id:'operator',googleAccess:true},client})).status,'invalid_request');
  assert.equal((await executeGoogleTool({name:'search_gmail',arguments:{query:'club',token:'secret'},principal:{id:'operator',googleAccess:true},client})).status,'invalid_request');
});
test('wrong account, missing OAuth scopes and revoked refresh grants fail without private data leakage',async()=>{
  for(const options of [{email:'wrong@example.com'},{scopes:GOOGLE_SCOPES.slice(0,1)},{tokenError:{response:{data:{error:'invalid_grant',private:'fixture-secret'}}}}]){
    const f=fixture(options);const r=await f.client.searchGmail({query:'club'});assert(['account_mismatch','reauthorization_required'].includes(r.status),r.status);assert.deepEqual(r.sources,[]);assert(!JSON.stringify(r).includes('fixture-secret'));assert(!f.calls.some(c=>new URL(c.url).pathname.endsWith('/messages')));
  }
});
test('access-token verification is required and account comparison is case insensitive',async()=>{
  let profiles=0;await verifyGoogleToken({getTokenInfo:async()=>({scopes:GOOGLE_SCOPES})},'fixture','CLUB@example.com',async()=>{profiles++;return {emailAddress:'club@example.com'};});assert.equal(profiles,1);
  await assert.rejects(verifyGoogleToken({getTokenInfo:async()=>({scopes:[]})},'fixture','club@example.com',async()=>{throw Error('must not read profile without scopes');}),{code:'reauthorization_required'});
});
test('Gmail search hydrates metadata and bounded results; reads text without attachment or nested-message content',async()=>{
  const encode=text=>Buffer.from(text).toString('base64url');
  const mail={id:'abc123',snippet:'preview',payload:{mimeType:'multipart/mixed',headers:[{name:'Subject',value:'Budget'}],parts:[{mimeType:'text/plain',body:{data:encode('Real body')}},{mimeType:'text/plain',filename:'private.txt',body:{data:encode('ATTACHMENT SECRET')}},{mimeType:'text/plain',body:{attachmentId:'secret',data:encode('ATTACHMENT ID SECRET')}}]}};
  const f=fixture({handler:url=>url.pathname.endsWith('/messages')?json({messages:[{id:'abc123'}]}):json(mail)});
  const search=await f.client.searchGmail({query:'subject:budget',limit:1});assert.equal(search.sources[0].excerpt,'preview');assert.equal(search.sources[0].externalId,'abc123');assert.equal(search.possiblyTruncated,true);
  const read=await f.client.readGmail({messageId:'abc123'});assert.equal(read.sources[0].excerpt,'Real body');assert(!JSON.stringify(read).includes('ATTACHMENT'));assert(f.calls.every(c=>!c.url.includes('/attachments/')));
});
test('Gmail HTML fallback removes executable/head text and returns inert source text',async()=>{
  const body='<head>head-secret</head><script>script-secret</script><p>Hello &amp; bye</p>';
  const f=fixture({handler:()=>json({id:'abc',payload:{mimeType:'text/html',body:{data:Buffer.from(body).toString('base64url')}}})});const r=await f.client.readGmail({messageId:'abc'});assert(r.sources[0].excerpt.includes('Hello & bye'));assert(!r.sources[0].excerpt.includes('secret'));assert(!r.sources[0].excerpt.includes('<p>'));
});
test('Drive literal queries escape apostrophe/backslash instead of accepting query injection',async()=>{
  const query="budget' or trashed=true or name='x\\z";const f=fixture({handler:url=>{assert.equal(url.searchParams.get('q'),"trashed = false and (fullText contains 'budget\\' or trashed=true or name=\\'x\\\\z')");assert.equal(url.searchParams.get('supportsAllDrives'),'true');assert.equal(url.searchParams.get('includeItemsFromAllDrives'),'true');return json({files:[]});}});assert.equal((await f.client.searchDrive({query})).status,'empty');
});
test('Drive folder listings include native nontext entries and only allowlisted metadata',async()=>{
  const files=[['folder','application/vnd.google-apps.folder'],['form','application/vnd.google-apps.form'],['shortcut','application/vnd.google-apps.shortcut'],['picture','image/png']].map(([id,mimeType])=>({id,name:`${id} / f26`,mimeType,parents:['parent_id'],modifiedTime:'2026-10-19T12:00:00Z',privateProviderField:'never-expose',shortcutDetails:{targetId:'unexpanded'}}));
  const f=fixture({handler:url=>{assert.equal(url.searchParams.get('q'),"trashed = false and 'parent_id' in parents");assert.equal(url.searchParams.get('pageSize'),'50');assert(url.searchParams.get('fields').includes('parents'));assert(!url.searchParams.get('q').includes('mimeType'));return json({files});}});
  const result=await f.client.listDriveFolder({folderId:'parent_id'});
  assert.equal(result.status,'ready');assert.equal(result.driveContext.entries.length,4);assert.deepEqual(result.sources,[]);assert.equal(result.coverage.complete,true);assert.equal(result.coverage.recursive,false);assert.equal(result.coverage.scope,'direct_children');
  assert.equal(result.driveContext.entries[0].url,'https://drive.google.com/drive/folders/folder');assert.equal(result.driveContext.entries[0].name,'folder / f26');assert.deepEqual(result.driveContext.entries[0].parentIds,['parent_id']);assert.equal(result.driveContext.entries[0].modifiedTime,'2026-10-19T12:00:00Z');
  assert.equal(result.coverage.navigationOnly,true);assert.equal(result.driveContext.complete,true);assert(!JSON.stringify(result).includes('never-expose'));assert(!JSON.stringify(result).includes('unexpanded'));assert.equal(f.calls.length,2);
});
test('Drive search optional direct-parent scope preserves literal search and pagination',async()=>{
  let page=0;const f=fixture({handler:url=>{assert.equal(url.searchParams.get('q'),"trashed = false and (fullText contains 'team\\'s \\\\ plan') and 'program_folder' in parents");assert.equal(url.searchParams.get('pageSize'),'5');assert.equal(url.searchParams.get('pageToken'),page?'opaque_+/=-':null);return json(++page===1?{files:[],nextPageToken:'opaque_+/=-'}:{files:[{id:'doc',name:'Plan',parents:['program_folder']}]});}});
  const first=await f.client.searchDrive({query:"team's \\ plan",folderId:'program_folder'});assert.equal(first.nextPageToken,'opaque_+/=-');assert.equal(first.coverage.complete,false);assert.equal(first.partial,true);assert.equal(first.possiblyTruncated,true);
  const next=await f.client.searchDrive({query:"team's \\ plan",folderId:'program_folder',pageToken:first.nextPageToken});assert.equal(next.nextPageToken,null);assert.equal(next.coverage.continuation,true);assert.equal(next.coverage.complete,false);assert.equal(next.sources[0].externalId,'doc');
});
test('Drive folder continuations and provider-incomplete searches never claim complete inventory',async()=>{
  const f=fixture({handler:url=>json(url.searchParams.has('pageToken')?{files:[]}:{files:[],nextPageToken:'next_page',incompleteSearch:true})});
  const first=await f.client.listDriveFolder({folderId:'parent',limit:1});assert.equal(first.nextPageToken,'next_page');assert.equal(first.coverage.complete,false);assert.equal(first.coverage.incompleteSearch,true);
  const last=await f.client.listDriveFolder({folderId:'parent',limit:1,pageToken:first.nextPageToken});assert.equal(last.nextPageToken,null);assert.equal(last.coverage.complete,false);assert.equal(last.coverage.continuation,true);
  const empty=fixture({handler:()=>json({files:[]})});assert.equal((await empty.client.listDriveFolder({folderId:'parent'})).coverage.complete,true);
});
test('Drive IDs, cursors and page sizes are validated before OAuth or HTTP',async()=>{
  const f=fixture();let tokens=0;f.oauth.getAccessToken=async()=>{tokens++;throw Error('must stay unused');};
  for(const args of [{},{folderId:"x' or trashed=true"},{folderId:'https://evil.invalid'},{folderId:'x',pageToken:''},{folderId:'x',pageToken:'x\n'},{folderId:'x',pageToken:'x'.repeat(2049)},{folderId:'x',pageToken:1},{folderId:'x',limit:0},{folderId:'x',limit:51},{folderId:'x',limit:1.1}])assert.equal((await f.client.listDriveFolder(args)).status,'invalid_request');
  for(const args of [{query:'x',folderId:"x'"},{query:'x',limit:6},{query:'x',pageToken:'a?x'},{query:'x',pageToken:null}])assert.equal((await f.client.searchDrive(args)).status,'invalid_request');
  assert.equal(tokens,0);assert.equal(f.calls.length,0);
});
test('Drive denied, incomplete and malformed provider responses preserve unknown coverage',async()=>{
  for(const response of [()=>new Response('private',{status:403}),()=>json({files:[],nextPageToken:'bad\n'}),()=>json({files:[],incompleteSearch:'false'}),()=>json({files:[{id:'x',parents:['invalid/parent']}]}),()=>json({files:{}})]){
    const f=fixture({handler:response});const result=await f.client.listDriveFolder({folderId:'parent'});assert(!['ready','empty'].includes(result.status));assert.deepEqual(result.sources,[]);assert.equal(result.coverage.complete,false);assert.equal(result.partial,true);assert.equal(result.possiblyTruncated,true);
  }
  for(const options of [{email:'wrong@example.com'},{scopes:GOOGLE_SCOPES.slice(0,1)}]){const f=fixture(options);assert.notEqual((await f.client.listDriveFolder({folderId:'parent'})).status,'ready');assert(!f.calls.some(c=>new URL(c.url).pathname.endsWith('/files')));}
});
test('Drive tool execution keeps principal gate and safe additional-property contract',async()=>{
  let called=0;const client={configured:true,listDriveFolder:async args=>{called++;assert.equal(args.folderId,'parent');return {status:'empty',sources:[],nextPageToken:null};}};
  const principal={id:'operator',googleAccess:true};
  for(const tool of GOOGLE_TOOLS)assert.equal(checkSchema(tool.parameters),true);
  assert.equal((await executeGoogleTool({name:'list_drive_folder',arguments:{folderId:'parent'},principal:{id:'member'},client})).status,'forbidden');
  assert.equal((await executeGoogleTool({name:'list_drive_folder',arguments:{folderId:'parent',q:'trashed=true'},principal,client})).status,'invalid_request');assert.equal(called,0);
  assert.equal((await executeGoogleTool({name:'list_drive_folder',arguments:{folderId:'parent'},principal,client})).status,'empty');assert.equal(called,1);
});
test('planner Drive reads use existing Google and prepared-batch gates without Calendar evidence',async()=>{
  const source='12345678-1234-4234-8234-123456789abc';let reads=0;
  function make(allow=true){return createAutomationAdapters({env:{ASSISTANT_ALLOWED_SOURCE_IDS:source,AGENT_GMAIL_SOURCE_ID:allow?source:''},config:readAutomationConfig({AGENT_AUTOMATION_ENABLED:'true'}),fetchImpl:async()=>{throw Error('No network');},dependencies:{
    googleConfig:{configured:true},googleClient:{configured:true,listDriveFolder:async()=>{reads++;return {status:'ready',sources:[{id:'drive:doc',externalId:'doc',kind:'google_drive',url:'https://drive.google.com/file/d/doc/view'}],nextPageToken:null};}},
    calendarConfig:{configured:true,calendarId:'fixed'},calendarClient:{configured:true,preflight:async()=>({status:'ready',calendarId:'fixed',accessRole:'writer'})},calendarTools:{tools:[]},
    miroConfig:{configured:true,boardIds:['board']},miroStore:{configured:true,authorizedBoard:async()=>({status:'ready',data:{board_id:'board',source_id:source,team_id:null}})},miroTools:{configured:true,transport:'mcp',tools:[],prepareBoard:async()=>({status:'ready',boardContext:{format:'synthetic-navigation'}}),execute:async()=>({status:'ready',boardContext:{boards:[{boardId:'board',sourceId:source,teamId:null}]}})},discordTools:{tools:[]},mapEventService:{configured:false},mapSourceAuthorizer:async()=>false,
  }});}
  const adapters=make();for(const name of ['search_drive','read_drive','list_drive_folder'])assert.equal(adapters.tools.find(t=>t.name===name)?.readOnly,true);
  const list=adapters.tools.find(t=>t.name==='list_drive_folder'),context={principal:adapters.principal};assert.equal((await list.execute({folderId:'parent'},context)).status,'forbidden');assert.equal(reads,0);
  await adapters.prepareBatch({principal:adapters.principal});assert.equal((await list.execute({folderId:'parent'},{principal:{...adapters.principal}})).status,'forbidden');
  assert.equal((await list.execute({folderId:'parent'},context)).status,'ready');assert.equal(reads,1);assert.equal(adapters.principal.calendarSources.some(row=>row.provider==='google_drive'),false);
  adapters.cleanupBatch();assert.equal((await list.execute({folderId:'parent'},context)).status,'forbidden');
  const denied=make(false);await denied.prepareBatch({principal:denied.principal});assert.equal((await denied.tools.find(t=>t.name==='list_drive_folder').execute({folderId:'parent'},{principal:denied.principal})).status,'forbidden');assert.equal(reads,1);
});
test('Drive Sheets export marks first-tab-only and binary files never download bytes',async()=>{
  const f=fixture({handler:url=>url.pathname.endsWith('/export')?new Response('Name,Amount\nClub,12') :json({id:'sheet_123',name:'Budget',mimeType:'application/vnd.google-apps.spreadsheet',webViewLink:'javascript:alert(1)'})});const r=await f.client.readDrive({fileId:'sheet_123'});assert.equal(r.sources[0].contentStatus,'first_sheet_only');assert(r.sources[0].excerpt.includes('FIRST SHEET ONLY'));assert.equal(r.sources[0].partial,true);assert.equal(r.sources[0].url,'https://drive.google.com/file/d/sheet_123/view');assert.equal(new URL(f.calls.at(-1).url).searchParams.get('mimeType'),'text/csv');
  const g=fixture({handler:()=>json({id:'pdf_123',name:'Binary',mimeType:'application/pdf'})});const s=await g.client.readDrive({fileId:'pdf_123'});assert.equal(s.sources[0].contentStatus,'unsupported_binary');assert.equal(g.calls.length,2);
});
test('Google read identifiers prevent arbitrary HTTP targets; mismatched hydrated IDs discard response',async()=>{
  const f=fixture({handler:()=>json({id:'def',payload:{}})});for(const id of ['https://evil.invalid','../private','a?alt=media'])assert.equal((await f.client.readGmail({messageId:id})).status,'invalid_request');assert.equal(f.calls.length,0);
  assert.equal((await f.client.readGmail({messageId:'abc'})).status,'invalid_response');assert.equal((await f.client.readDrive({fileId:'https://evil.invalid'})).status,'invalid_request');
});
test('Google upstream errors are machine codes and bodies/tokens are not exposed',async()=>{
  for(const [http,status] of [[401,'reauthorization_required'],[403,'permission_denied'],[404,'not_found'],[429,'rate_limited'],[500,'google_unavailable']]){const f=fixture({handler:()=>new Response('fixture-secret upstream-body',{status:http})});const r=await f.client.searchGmail({query:'x'});assert.equal(r.status,status);assert(!JSON.stringify(r).includes('fixture-secret'));}
});
test('Google response bytes and hanging authentication are cancellable',async()=>{
  await assert.rejects(boundedGoogleBody(new Response('oversized'),{maxBytes:2}),{code:'response_too_large'});
  const abort=new AbortController();const pending=waitForGoogleAuth(()=>new Promise(()=>{}),abort.signal);abort.abort();await assert.rejects(pending,{code:'aborted'});
  const f=fixture();assert.equal((await f.client.searchDrive({query:'x',signal:abort.signal})).status,'aborted');assert.equal(f.calls.length,0);
});
test('local OAuth callback has fixed loopback, state, PKCE, one-shot expiry and ignored restricted output',async()=>{
  // Source inspection only: this deliberately does not start OAuth or touch account secrets.
  const cli=await readFile(new URL('../scripts/google-connect.mjs',import.meta.url),'utf8');for(const token of ['timingSafeEqual','code_challenge_method: \'S256\'','codeVerifier','!used','Date.now() < expires','127.0.0.1:8765','0o600',"open(OUTPUT, 'wx'",'verifyGoogleToken'])assert(cli.includes(token),token);
  assert(!cli.includes('console.log(tokens'));const ignore=await readFile(new URL('../.gitignore',import.meta.url),'utf8');assert(ignore.includes('.env'));
});
