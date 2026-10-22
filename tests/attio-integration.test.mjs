import test from 'node:test';
import assert from 'node:assert/strict';
import {readAttioConfig} from '../server/attio/config.js';
import {createAttioClient, validAttioValues} from '../server/attio/client.js';
import {createApp} from '../server/app.js';
import {createChatRunner} from '../server/chat-runner.js';
import {createProvider} from '../server/providers/index.js';
import {createLiveChatTools} from '../tools/discord/live-summary.js';
import {GOOGLE_TOOLS} from '../tools/google/index.js';
import {MIRO_MCP_TOOLS} from '../tools/miro/mcp.js';
import {MEMORY_TOOLS} from '../tools/memory/index.js';
import {MAP_TOOLS} from '../tools/map/index.js';
import {CHAT_ATTENDANCE_TOOLS} from '../tools/map/chat-attendance.js';
import {BUG_REPORT_TOOL} from '../tools/bug-reports/index.js';
import {createChatCalendarTools} from '../tools/calendar/chat.js';

const sourceId='10000000-0000-4000-8000-000000000001';
const recordId='20000000-0000-4000-8000-000000000001';
const workspaceId='30000000-0000-4000-8000-000000000001';
const objectId='40000000-0000-4000-8000-000000000001';
const env={ATTIO_API_TOKEN:'SYNTHETIC_ATTIO_TOKEN',ATTIO_SOURCE_ID:sourceId,ATTIO_ALLOWED_OBJECTS:'people,companies',ATTIO_WRITES_ENABLED:'true'};
const principal={id:'fixture-user',allowedSourceIds:[sourceId]};
const values={name:[{first_name:'Ada',last_name:'Lovelace'}],email_addresses:['ada@example.test']};
const url=`https://app.attio.com/fixture/people/record/${recordId}`;
const providerRecord=(patch={})=>({id:{workspace_id:workspaceId,object_id:objectId,record_id:recordId},object_slug:'people',values:structuredClone(values),web_url:url,...patch});
function fixture({patch={},reply,fetchImpl}={}) {
 const calls=[];
 const client=createAttioClient({config:readAttioConfig({...env,...patch}),now:()=>Date.parse('2026-10-21T20:00:00Z'),fetchImpl:async(value,init)=>{
  calls.push({url:new URL(value),...init,body:init.body&&JSON.parse(init.body)});
  if(fetchImpl)return fetchImpl(value,init);
  if(reply)return reply(value,init);
  return Response.json({data:providerRecord()});
 }});
 return {client,calls};
}
const toolModule=()=>import('../tools/attio/index.js');

test('Attio setup fails closed for missing token/source/object scope and defaults writes off',()=>{
 assert.equal(readAttioConfig(env).configured,true);
 assert.equal(readAttioConfig({...env,ATTIO_WRITES_ENABLED:''}).writesEnabled,false);
 for(const patch of [{ATTIO_API_TOKEN:''},{ATTIO_API_TOKEN:'bad\r\ntoken'},{ATTIO_SOURCE_ID:'invalid'},{ATTIO_ALLOWED_OBJECTS:''},{ATTIO_ALLOWED_OBJECTS:'people,../companies'},{ATTIO_ALLOWED_OBJECTS:'constructor'},{ATTIO_ALLOWED_OBJECTS:'people,'}])assert.equal(readAttioConfig({...env,...patch}).configured,false);
});

test('client object, identifier, write and aborted-request checks prevent network dispatch',async()=>{
 const f=fixture(),aborted=new AbortController();aborted.abort();
 for(const object of ['other','https://evil.test','people/../companies','constructor'])assert.notEqual((await f.client.readRecord({object,recordId})).status,'ready');
 assert.equal((await f.client.readRecord({object:'people',recordId:'../../secrets'})).status,'invalid_request');
 assert.equal((await f.client.readRecord({object:'people',recordId,signal:aborted.signal})).status,'aborted');
 assert.equal(f.calls.length,0);
 const disabled=fixture({patch:{ATTIO_WRITES_ENABLED:'false'}});
 assert.equal((await disabled.client.createRecord({object:'people',values})).status,'forbidden');assert.equal(disabled.calls.length,0);
});

test('client uses exact fixed-host search/read/create/PATCH and attribute discovery contracts',async()=>{
 const f=fixture({reply:(_url,init)=>Response.json({data:_url.endsWith('/search')?[providerRecord({record_text:'Ada Lovelace'})]:_url.endsWith('/attributes')?[{api_slug:'email_addresses',title:'Email',type:'email-address',is_writable:true}]:providerRecord()})});
 const searched=await f.client.searchRecords({object:'people',query:' Ada ',limit:3});
 assert.equal(searched.status,'ready');assert.equal(searched.records[0].recordId,recordId);assert.equal(searched.records[0].url,url);assert.equal(searched.coverage.complete,false);
 assert.equal((await f.client.readRecord({object:'people',recordId})).record.workspaceId,workspaceId);
 assert.equal((await f.client.createRecord({object:'people',values})).outcome,'created');
 assert.equal((await f.client.updateRecord({object:'people',recordId,values})).outcome,'updated');
 assert.equal((await f.client.listAttributes({object:'people'})).attributes[0].slug,'email_addresses');
 assert.deepEqual(f.calls.map(c=>[c.method,c.url.origin,c.url.pathname]),[
  ['POST','https://api.attio.com','/v2/objects/records/search'],['GET','https://api.attio.com',`/v2/objects/people/records/${recordId}`],
  ['POST','https://api.attio.com','/v2/objects/people/records'],['PATCH','https://api.attio.com',`/v2/objects/people/records/${recordId}`],['GET','https://api.attio.com','/v2/objects/people/attributes']]);
 assert.deepEqual(f.calls[0].body,{query:'Ada',objects:['people'],request_as:{type:'workspace'},limit:3});
 assert.deepEqual(f.calls[2].body,{data:{values}});assert.deepEqual(f.calls[3].body,{data:{values}});
 for(const call of f.calls){assert.equal(call.redirect,'error');assert.equal(call.headers.Authorization,'Bearer SYNTHETIC_ATTIO_TOKEN');}
});

test('recursive CRM values reject hostile keys, cycles, unsupported types and resource excess before writes',async()=>{
 const cycle={};cycle.self=cycle;
 let deep='value';for(let i=0;i<12;i++)deep={nested:deep};
 const invalid=[{},[],{constructor:'evil'},JSON.parse('{"name":{"__proto__":{"admin":true}}}'),{name:cycle},{name:deep},{name:NaN},{name:Infinity},{name:()=>{}},{name:1n},{name:'x'.repeat(16001)},{name:Array(201).fill('x')},{name:['x'.repeat(16000),'x'.repeat(16000),'x'.repeat(16000)]}];
 const f=fixture();assert(validAttioValues(values));
 for(const value of invalid){assert.equal(validAttioValues(value),false);assert.equal((await f.client.createRecord({object:'people',values:value})).status,'invalid_request');}
 assert.equal(f.calls.length,0);
});

test('malformed identities and unsafe source URLs cannot become trusted CRM evidence',async()=>{
 for(const patch of [{id:{workspace_id:workspaceId,object_id:objectId,record_id:'bad'}},{id:{workspace_id:workspaceId,object_id:objectId,record_id:sourceId}},{object_slug:'companies'},{values:null}]){
  const f=fixture({reply:()=>Response.json({data:providerRecord(patch)})});assert.equal((await f.client.readRecord({object:'people',recordId})).status,'invalid_response');
 }
 for(const web_url of ['javascript:alert(1)','https://attio.com.evil.test/path','https://evil.test','https://user:secret@app.attio.com/x']){
  const f=fixture({reply:()=>Response.json({data:providerRecord({web_url})})});const result=await f.client.readRecord({object:'people',recordId});assert.equal(result.status,'ready');assert.equal(result.record.url,undefined);
 }
 const search=fixture({reply:()=>Response.json({data:[providerRecord({object_slug:'companies',record_text:'wrong object'})]})});
 assert.equal((await search.client.searchRecords({object:'people',query:'Ada'})).status,'invalid_response');
});

test('upstream denials, malformed and oversized replies stay bounded and never echo secrets',async()=>{
 for(const [status,expected] of [[401,'reauthorization_required'],[403,'permission_denied'],[404,'not_found'],[429,'rate_limited'],[500,'unavailable']]){
  const f=fixture({reply:()=>new Response('SYNTHETIC_ATTIO_TOKEN PRIVATE_BODY',{status})});const result=await f.client.readRecord({object:'people',recordId});assert.equal(result.status,expected);assert.doesNotMatch(JSON.stringify(result),/TOKEN|PRIVATE_BODY/);assert.equal(f.calls.length,1);
 }
 for(const reply of [()=>new Response('{private malformed'),()=>new Response('x',{headers:{'content-length':'1048577'}}),()=>new Response('x'.repeat(1048577))]){
  const f=fixture({reply});assert.notEqual((await f.client.readRecord({object:'people',recordId})).status,'ready');assert.equal(f.calls.length,1);
 }
});

test('cancelled and timed-out in-flight reads stop; uncertain dispatched writes are never retried',async()=>{
 const hanging=(_url,{signal})=>new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(new Error('PRIVATE_TRANSPORT')), {once:true}));
 const timed=fixture({patch:{ATTIO_TIMEOUT_MS:'100'},fetchImpl:hanging});
 // AbortSignal.timeout uses an unref timer, so keep this synthetic request alive.
 const keepAlive=setTimeout(()=>{},1000);try{assert.equal((await timed.client.readRecord({object:'people',recordId})).status,'timeout');}finally{clearTimeout(keepAlive);}
 const controller=new AbortController(),cancelled=fixture({fetchImpl:hanging});const pending=cancelled.client.readRecord({object:'people',recordId,signal:controller.signal});controller.abort();assert.equal((await pending).status,'aborted');
 for(const reply of [()=>{throw Error('PRIVATE_TOKEN');},()=>new Response('private',{status:500}),()=>new Response('{bad'),()=>Response.json({data:providerRecord({id:{}})})]){
  const f=fixture({reply});const result=await f.client.createRecord({object:'people',values});assert.equal(result.status,'unavailable');assert.equal(result.reason,'write_outcome_unknown');assert.equal(f.calls.length,1);assert.doesNotMatch(JSON.stringify(result),/PRIVATE/);
 }
});

test('tool source/object/write gates and strict argument schema deny before provider dispatch',async()=>{
 const {createAttioTools,ATTIO_TOOLS}=await toolModule();const f=fixture(),tools=createAttioTools({client:f.client});
 assert.equal(ATTIO_TOOLS.length,5);
 for(const p of [null,{id:'fixture-user',allowedSourceIds:[]},{allowedSourceIds:[sourceId]}])assert.equal((await tools.execute({name:'read_attio_record',arguments:{object:'people',recordId},principal:p})).status,'forbidden');
 for(const args of [{object:'other',recordId},{object:'people',recordId,apiUrl:'https://evil.test'},{object:'people',recordId,principal},{object:'people',recordId:'bad'}])assert.notEqual((await tools.execute({name:'read_attio_record',arguments:args,principal})).status,'ready');
 assert.equal((await tools.execute({name:'delete_attio_record',arguments:{object:'people',recordId},principal})).status,'invalid_request');
 const readonly=createAttioTools({client:fixture({patch:{ATTIO_WRITES_ENABLED:'false'}}).client});assert.equal(readonly.tools.length,3);
 assert.equal((await readonly.execute({name:'create_attio_record',arguments:{object:'people',values},principal})).status,'forbidden');
 assert.equal(f.calls.length,0);
});

test('chat updates require exact prior read in the same request and principal, consume evidence, and deduplicate writes',async()=>{
 const {createAttioTools}=await toolModule();const f=fixture(),tools=createAttioTools({client:f.client});
 const args={object:'people',recordId,values};const request=tools.createRequest({principal,userMessage:'Update Ada in Attio with the requested email.'});
 assert.equal((await request.execute({name:'update_attio_record',arguments:args,principal})).status,'read_required');assert.equal(f.calls.length,0);
 assert.equal((await request.execute({name:'read_attio_record',arguments:{object:'people',recordId},principal:{...principal,id:'other-user'}})).status,'forbidden');assert.equal(f.calls.length,0);
 assert.equal((await request.execute({name:'read_attio_record',arguments:{object:'people',recordId},principal})).status,'ready');
 const [a,b]=await Promise.all([request.execute({name:'update_attio_record',arguments:args,principal}),request.execute({name:'update_attio_record',arguments:{values,recordId,object:'people'},principal})]);
 assert.equal(a.status,'ready');assert.deepEqual(a,b);assert.equal(a.attioWrite.recordId,recordId);assert.equal(a.attioWrite.url,url);assert.equal(f.calls.filter(c=>c.method==='PATCH').length,1);
 assert.equal((await request.execute({name:'update_attio_record',arguments:{...args,values:{email_addresses:['different@example.test']}},principal})).status,'read_required');
 const fresh=tools.createRequest({principal,userMessage:'Update Ada again.'});assert.equal((await fresh.execute({name:'update_attio_record',arguments:args,principal})).status,'read_required');
 const blank=tools.createRequest({principal,userMessage:''});assert(blank.tools.every(t=>t.readOnly));assert.equal((await blank.execute({name:'create_attio_record',arguments:{object:'people',values},principal})).status,'forbidden');
});

test('chat repeated creates and uncertain writes return original results without another external mutation',async()=>{
 const {createAttioTools}=await toolModule();
 for(const reply of [undefined,()=>{throw Error('PRIVATE_WRITE_TRANSPORT');}]){
  const f=fixture({reply}),request=createAttioTools({client:f.client}).createRequest({principal,userMessage:'Create Ada in Attio.'});
  const input={name:'create_attio_record',arguments:{object:'people',values},principal};const a=await request.execute(input),b=await request.execute(input);
  assert.deepEqual(a,b);assert.equal(f.calls.length,1);assert.equal(a.status,reply?'unavailable':'ready');
  if(reply){assert.equal(a.reason,'write_outcome_unknown');assert.equal(a.attioWrite,undefined);}
 }
});

const apiConfig={configured:true,provider:'openai-compatible',timeoutMs:1000,requestTimeoutMs:3000,retrievalToolsEnabled:true};
const post=body=>({method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
test('protected Attio tool routes deny anonymous/source-spoofed requests and expose bounded catalogue/status',async()=>{
 const {createAttioTools}=await toolModule();const f=fixture(),attioTools=createAttioTools({client:f.client});
 const denied=createApp({config:apiConfig,auth:()=>null,attioTools});
 assert.equal((await denied.request('/api/tools')).status,403);assert.equal((await denied.request('/api/tools/create-attio-record',post({object:'people',values,principal}))).status,403);assert.equal(f.calls.length,0);
 const app=createApp({config:apiConfig,auth:()=>principal,attioTools});const catalogue=await (await app.request('/api/tools')).json();assert.equal(catalogue.tools.filter(t=>t.name.includes('attio')).length,5);
 const status=await (await app.request('/api/status')).json();assert.deepEqual(status.attio,{configured:true});assert.doesNotMatch(JSON.stringify([status,catalogue]),/SYNTHETIC_ATTIO_TOKEN/);
 const saved=await app.request('/api/tools/create-attio-record',post({object:'people',values}));assert.equal(saved.status,200);assert.equal(saved.headers.get('cache-control'),'no-store');assert.equal((await saved.json()).attioWrite.recordId,recordId);
 const spoofed=createApp({config:apiConfig,auth:()=>({...principal,allowedSourceIds:[]}),attioTools});assert.equal((await spoofed.request('/api/tools/read-attio-record',post({object:'people',recordId}))).status,403);assert.equal(f.calls.length,1);
 assert.equal((await app.request('/api/tools/read-attio-record',post({object:'people',recordId,sourceId:'attacker'}))).status,400);
});

test('Attio HTTP routes map provider and integration failures to explicit failing HTTP statuses',async()=>{
 const {createAttioTools}=await toolModule();
 for(const [providerStatus,http] of [[401,401],[403,403],[404,404],[429,429],[500,503]]){
  const f=fixture({reply:()=>new Response('PRIVATE_BODY',{status:providerStatus})}),app=createApp({config:apiConfig,auth:()=>principal,attioTools:createAttioTools({client:f.client})});
  const response=await app.request('/api/tools/read-attio-record',post({object:'people',recordId}));assert.equal(response.status,http,`upstream ${providerStatus}`);assert.doesNotMatch(await response.text(),/PRIVATE_BODY|SYNTHETIC_ATTIO_TOKEN/);
 }
 const f=fixture({reply:()=>new Response('{invalid')}),app=createApp({config:apiConfig,auth:()=>principal,attioTools:createAttioTools({client:f.client})});assert.equal((await app.request('/api/tools/read-attio-record',post({object:'people',recordId}))).status,502);
});

for(const mode of ['native','planned'])test(`${mode} shared website and Discord runners return Attio read/write receipts to planning and final answering`,async()=>{
 const {createAttioTools}=await toolModule();
 for(const transport of ['website','discord']){
  const f=fixture(),records=[],plans=[],answers=[];let round=0;
  const batches=[[{id:'read-1',name:'read_attio_record',arguments:{object:'people',recordId}}],[{id:'write-1',name:'update_attio_record',arguments:{object:'people',recordId,values}}],[]];
  const next=request=>{plans.push(request);return batches[round++]||[];};
  const provider={...(mode==='native'?{toolTurn:async request=>({text:'',toolCalls:next(request)})}:{planTools:async request=>next(request)}),async *stream(request){answers.push(request);yield 'Updated Ada.';}};
  const runner=createChatRunner({config:apiConfig,provider,attioTools:createAttioTools({client:f.client})});
  const requestContext=transport==='discord'?{transport:'discord',actor:{provider:'discord',guildId:'100',userId:'300',username:'member',displayName:'Member'},channelId:'200',threadId:null,requestId:'400',sourceProfileId:'fixture'}:undefined;
  const result=await runner.run({conversation:{messages:[{role:'user',content:'Update Ada in Attio with this email.'}],timeZone:'America/New_York'},principal,requestContext,onRecord:r=>records.push(r)});
  assert.equal(result.status,'succeeded');assert.equal(f.calls.length,2);assert.equal(f.calls[1].method,'PATCH');assert.equal(plans.length,3);assert.equal(answers.length,1);
  assert(plans[0].tools.some(t=>t.name==='update_attio_record'));assert.match(JSON.stringify(plans[2]),/attioWrite/);assert.match(JSON.stringify(plans[2]),new RegExp(recordId));
  assert.match(answers[0].system,/attioWrite/);assert(answers[0].system.includes(url));assert.doesNotMatch(JSON.stringify([plans,answers,records]),/SYNTHETIC_ATTIO_TOKEN/);assert.equal(records.at(-1).type,'done');
 }
});

test('actual native provider serializes the full 33-tool runtime catalogue including Attio',async()=>{
 const {ATTIO_TOOLS}=await toolModule();const calls=[];
 const catalogue=[...createLiveChatTools({service:{},guildId:'100',config:{}}).tools,...GOOGLE_TOOLS,...MIRO_MCP_TOOLS,...MEMORY_TOOLS,...MAP_TOOLS,...CHAT_ATTENDANCE_TOOLS,BUG_REPORT_TOOL,...createChatCalendarTools({client:{configured:false}}).tools,...ATTIO_TOOLS];
 assert.equal(catalogue.length,33);assert.equal(new Set(catalogue.map(t=>t.name)).size,catalogue.length);
 for(const providerName of ['openai-compatible','anthropic']){
  const config={...apiConfig,provider:providerName,model:'fixture-native',baseUrl:'https://model.example.test/v1',apiKey:'SYNTHETIC_MODEL_TOKEN'};
  const provider=createProvider(config,{fetchImpl:async(_url,init)=>{calls.push(JSON.parse(init.body));return Response.json(providerName==='anthropic'?{id:'msg_fixture',stop_reason:'end_turn',content:[{type:'text',text:'Ready.'}]}:{id:'chat_fixture',choices:[{finish_reason:'stop',message:{role:'assistant',content:'Ready.'}}]});}});
  const result=await provider.toolTurn({messages:[{role:'user',content:'Find Ada in Attio.'}],system:'Use authorized tools.',tools:catalogue});assert.deepEqual(result.toolCalls,[]);
  assert.equal(calls.at(-1).tools.length,catalogue.length);assert(calls.at(-1).tools.some(t=>(t.name||t.function?.name)==='update_attio_record'));
 }
});

test('large CRM records yield bounded truthful tool context without dropping exact successful write receipts',async()=>{
 const {createAttioTools}=await toolModule();
 const large=Object.fromEntries(Array.from({length:60},(_,i)=>[`field_${i}`,Array.from({length:15},()=>({value:'x'.repeat(500)}))]));
 const f=fixture({reply:()=>Response.json({data:providerRecord({values:large})})}),tools=createAttioTools({client:f.client});
 const result=await tools.execute({name:'create_attio_record',arguments:{object:'people',values},principal});
 assert.equal(result.status,'ready');assert.equal(result.attioContext.truncated,true);assert(Buffer.byteLength(JSON.stringify(result.attioContext))<=17500);assert.equal(result.coverage.complete,false);assert.equal(result.attioWrite.recordId,recordId);assert.equal(result.attioWrite.url,url);assert.equal(result.sources[0].sourceId,sourceId);
});

test('a failed repeated read revokes earlier request-local update evidence',async()=>{
 const {createAttioTools}=await toolModule();let reads=0;
 const f=fixture({reply:()=>++reads===1?Response.json({data:providerRecord()}):new Response('Denied',{status:403})});
 const request=createAttioTools({client:f.client}).createRequest({principal,userMessage:'Update Ada in Attio.'}),read={name:'read_attio_record',arguments:{object:'people',recordId},principal};
 assert.equal((await request.execute(read)).status,'ready');assert.equal((await request.execute(read)).status,'permission_denied');
 assert.equal((await request.execute({name:'update_attio_record',arguments:{object:'people',recordId,values},principal})).status,'read_required');assert.equal(f.calls.length,2);
});

test('uncertain chat write blocks differently worded later mutations while preserving reads and original receipt',async()=>{
 const {createAttioTools}=await toolModule();let writes=0;
 const f=fixture({reply:(_url,init)=>{if(init.method==='GET')return Response.json({data:providerRecord()});writes++;throw Error('PRIVATE_TRANSPORT');}});
 const request=createAttioTools({client:f.client}).createRequest({principal,userMessage:'Create Ada in Attio.'});
 const create={name:'create_attio_record',arguments:{object:'people',values},principal};const original=await request.execute(create);
 assert.equal(original.reason,'write_outcome_unknown');assert.deepEqual(await request.execute(create),original);
 assert.equal((await request.execute({...create,arguments:{object:'people',values:{email_addresses:['ada2@example.test']}}})).reason,'write_outcome_unknown');
 assert.equal((await request.execute({name:'read_attio_record',arguments:{object:'people',recordId},principal})).status,'ready');
 assert.equal((await request.execute({name:'update_attio_record',arguments:{object:'people',recordId,values},principal})).reason,'write_outcome_unknown');assert.equal(writes,1);
});

test('Attio timeouts bound even noncooperative transports and blocked response streams',async()=>{
 for(const fetchImpl of [()=>new Promise(()=>{}),()=>new Response(new ReadableStream({start(){}}))]){
  const f=fixture({patch:{ATTIO_TIMEOUT_MS:'100'},fetchImpl});const keepAlive=setTimeout(()=>{},1000);
  try{assert.equal((await f.client.readRecord({object:'people',recordId})).status,'timeout');assert.equal(f.calls.length,1);}finally{clearTimeout(keepAlive);}
 }
});

test('field/search contexts retain coverage truth and safe diagnostic causes without upstream content',async()=>{
 const {createAttioTools}=await toolModule();
 const f=fixture({reply:(_url)=>Response.json({data:_url.endsWith('/search')?[providerRecord({record_text:'Ada'})]:providerRecord()})}),tools=createAttioTools({client:f.client});
 const search=await tools.execute({name:'search_attio_records',arguments:{object:'people',query:'Ada'},principal});assert.equal(search.status,'ready');assert.equal(search.coverage.complete,false);assert.equal(search.sources[0].contentAvailable,false);
 const read=await tools.execute({name:'read_attio_record',arguments:{object:'people',recordId},principal});assert.equal(read.sources[0].contentAvailable,true);
 assert.equal((await tools.execute({name:'search_attio_records',arguments:{object:'people',query:'x'.repeat(257)},principal})).status,'invalid_request');assert.equal(f.calls.length,2);
 const denied=fixture({reply:()=>new Response('PRIVATE_UPSTREAM',{status:403})});const result=await createAttioTools({client:denied.client}).execute({name:'read_attio_record',arguments:{object:'people',recordId},principal});
 assert.equal(result.diagnostics.httpStatus,403);assert.equal(result.diagnostics.reason,'http_error');assert.doesNotMatch(JSON.stringify(result),/PRIVATE_UPSTREAM|SYNTHETIC_ATTIO_TOKEN/);
});
