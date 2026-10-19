import test from 'node:test';
import assert from 'node:assert/strict';
import {createDiscordChatContextLoader,createDiscordUserDirectory} from '../server/discord/chat-context.js';
import {createLiveDiscordRetrieval} from '../server/discord/live-retrieval.js';
import {discordSnowflakeAt} from '../server/discord/live-client.js';
const guildId='100',channelId='200',sourceId='00000000-0000-4000-8000-000000000001';
const to='2026-10-19T16:00:00.000Z',from='2026-10-19T15:00:00.000Z',requestId=discordSnowflakeAt(to);
const principal={id:'discord:100:300',allowedSourceIds:[sourceId],liveDiscord:{mode:'local-operator',guildId}};
const users={complete:true,reason:null,users:[{discordUserId:'300',name:'Synthetic member'}]};
const message=(at,extra={})=>({id:discordSnowflakeAt(at),channel_id:channelId,timestamp:at,author:{id:'300',name:'Synthetic author'},content:'Original synthetic text',...extra});
function fixture(result={status:'ready',coverage:{complete:true},messages:[]}) {
 const f={calls:[],directoryCalls:[]};
 f.loader=createDiscordChatContextLoader({liveDiscordService:{fetchWindow:async args=>{f.calls.push(args);if(result instanceof Error)throw result;return result;}},directory:{read:async args=>{f.directoryCalls.push(args);return users;}}});
 f.load=(extra={})=>f.loader.load({guildId,channelId,requestId,principal,...extra});return f;
}
test('automatic hour context uses exact triggering snowflake, same destination/principal/signal and no model-chosen query',async()=>{
 const f=fixture(),controller=new AbortController(),result=await f.load({signal:controller.signal});assert.equal(f.calls.length,1);
 assert.deepEqual({...f.calls[0],signal:undefined},{principal,channelId,from,to,signal:undefined,userMessage:''});assert.equal(f.calls[0].principal,principal);
 assert.equal(f.directoryCalls[0].signal,f.calls[0].signal);controller.abort();assert.equal(f.calls[0].signal.aborted,true);assert.deepEqual(result.discordUsers,users);assert.equal(result.discordContext.from,from);assert.equal(result.discordContext.to,to);assert.equal(result.discordContext.complete,true);
});
test('all messages within the safe budget survive whole and sorted oldest-first including empty bodies',async()=>{
 const rows=[message('2026-10-19T15:59:59.999Z',{content:'last\nline'}),message(from,{content:''}),message('2026-10-19T15:30:00.000Z',{content:'x'.repeat(4000),attachments:[{url:'UNSELECTED_PRIVATE_ATTACHMENT'}]})];
 const result=await fixture({status:'ready',coverage:{complete:true},messages:rows}).load();assert.equal(result.discordContext.complete,true);assert.deepEqual(result.discordContext.messages.map(r=>r.content),['','x'.repeat(4000),'last\nline']);
 assert.deepEqual(Object.keys(result.discordContext.messages[0]).sort(),['authorId','authorName','channelId','content','createdAt','id']);assert.doesNotMatch(JSON.stringify(result),/UNSELECTED_PRIVATE_ATTACHMENT/);
});
test('thread request reads only that thread and never substitutes parent channel',async()=>{
 const f=fixture();await f.load({channelId:'250'});assert.equal(f.calls[0].channelId,'250');assert.equal(f.calls.length,1);
});
for(const [name,result,expected] of [
 ['partial page',{status:'partial',coverage:{complete:false,reason:'page_budget'},messages:[message(from)]},'page_budget'],
 ['source denial',{status:'forbidden',coverage:{complete:false,reason:'forbidden'},messages:[]},'forbidden'],
 ['source failure',Error('PRIVATE RAW TRACE'),'unavailable'],
 ['non-text content',{status:'ready',coverage:{complete:true},messages:[message(from,{content:'',hasNonTextContent:true})]},'non_text_content'],
])test(`automatic hour discloses ${name} without claiming absence`,async()=>{
 const loaded=await fixture(result).load();assert.equal(loaded.discordContext.complete,false);assert.equal(loaded.discordContext.reason,expected);assert.doesNotMatch(JSON.stringify(loaded),/PRIVATE RAW TRACE/);
});
for(const [name,rows] of [
 ['trigger at upper bound',[message(to)]],['before hour',[message('2026-10-19T14:59:59.999Z')]],
 ['other channel',[message(from,{channel_id:'201'})]],['duplicate record',[message(from),message(from)]],
 ['invalid author',[message(from,{author:{id:'bad'}})]],
])test(`untrusted upstream ${name} never enters complete context`,async()=>{
 const r=await fixture({status:'ready',coverage:{complete:true},messages:rows}).load();assert.equal(r.discordContext.complete,false);assert.equal(r.discordContext.reason,'invalid_context_record');assert.ok(r.discordContext.messages.length<rows.length);
});
test('budget exhaustion retains whole originals and reports partial without truncating message text',async()=>{
 for(const rows of [[message(from,{content:'x'.repeat(4001)})],Array.from({length:31},(_,i)=>message(new Date(Date.parse(from)+i).toISOString(),{content:'x'.repeat(4000)})),Array.from({length:2001},(_,i)=>message(new Date(Date.parse(from)+i).toISOString(),{content:''}))]){
  const r=await fixture({status:'ready',coverage:{complete:true},messages:rows}).load();assert.equal(r.discordContext.complete,false);assert.equal(r.discordContext.reason,'context_budget');assert.ok(r.discordContext.messages.length<rows.length);assert.ok(r.discordContext.messages.every(m=>m.content===''||m.content==='x'.repeat(4000)));
 }
});
test('actual live retrieval paginates the exact hour and preserves every returned original rather than source-envelope excerpts',async()=>{
 const channel={id:channelId,guild_id:guildId,type:0,parent_id:null,name:'synthetic'},calls=[],rows=[message('2026-10-19T15:59:00.000Z',{author:{id:'300',username:'Member'},content:'a'.repeat(2500)}),message(from,{author:{id:'300',username:'Member'},content:'oldest'})];
 const store={getPolicy:async()=>({status:'ready',policy:{guildId,revision:1,paused:false,excludedChannelIds:[],excludedCategoryIds:[]}}),listSyncChannels:async()=>({status:'ready',channels:[{enabled:true,guildId,channelId,sourceId}]})};
 const client={configured:true,getCurrentApplication:async()=>({flags:1<<18}),getGuildChannels:async()=>[channel],getChannel:async()=>channel,
  getMessages:async args=>{calls.push(args);return calls.length===1?[rows[0]]:calls.length===2?[rows[1]]:[];}};
 const liveDiscordService=createLiveDiscordRetrieval({config:{configured:true,guildId,maxPages:20,maxMessages:2000,maxInputChars:500000},store,client});
 const loader=createDiscordChatContextLoader({liveDiscordService,directory:{read:async()=>users}}),r=await loader.load({guildId,channelId,requestId,principal});
 assert.deepEqual(calls.map(c=>c.before),[requestId,rows[0].id,rows[1].id]);assert.ok(calls.every(c=>c.channelId===channelId));assert.equal(r.discordContext.complete,true);assert.deepEqual(r.discordContext.messages.map(m=>m.content),['oldest','a'.repeat(2500)]);
});
const env={SUPABASE_URL:'https://synthetic-project.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'synthetic-service-role-secret'};
const person=(id='300',display_name='Synthetic Person')=>({discord_user_id:id,display_name});
function directoryFixture(rows=[person()],headers={}) {
 const calls=[];const directory=createDiscordUserDirectory({env,fetchImpl:async(url,options)=>{calls.push({url,options});return Response.json(rows,{headers});}});return {directory,calls};
}
test('directory REST selects only Discord ID and name with private service authentication and exact count',async()=>{
 const f=directoryFixture([person()],{'content-range':'0-0/1'}),result=await f.directory.read(),call=f.calls[0],url=new URL(call.url);
 assert.equal(url.pathname,'/rest/v1/map_people');assert.equal(url.searchParams.get('select'),'discord_user_id,display_name');assert.equal(url.searchParams.get('discord_user_id'),'not.is.null');assert.equal(url.searchParams.get('order'),'discord_user_id');assert.equal(url.searchParams.get('limit'),'1001');
 assert.equal(call.options.method,'GET');assert.equal(call.options.redirect,'error');assert.equal(call.options.headers.apikey,env.SUPABASE_SERVICE_ROLE_KEY);assert.equal(call.options.headers.authorization,`Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`);assert.equal(call.options.headers.prefer,'count=exact');
 assert.deepEqual(result,{complete:true,reason:null,users:[{discordUserId:'300',name:'Synthetic Person'}]});assert.doesNotMatch(JSON.stringify(result),/secret|email|avatar|profile/i);
});
test('directory exact count or unknown-count threshold honestly marks incomplete results',async()=>{
 for(const [rows,headers,complete] of [[[],{'content-range':'*/0'},true],[[person()],{'content-range':'0-0/2'},false],[[person()],{},true],[Array.from({length:1000},(_,i)=>person(String(i))),{},false],[Array.from({length:1001},(_,i)=>person(String(i))),{'content-range':'0-1000/1001'},false]]){
  const r=await directoryFixture(rows,headers).directory.read();assert.equal(r.complete,complete);assert.ok(r.users.length<=1000);assert.equal(r.reason,complete?null:'directory_partial');
 }
});
test('directory drops conflicting duplicates instead of choosing an arbitrary name',async()=>{
 const r=await directoryFixture([person('300','A'),person('301','B'),person('300','C'),person('300','A')]).directory.read();assert.equal(r.complete,false);assert.deepEqual(r.users,[{discordUserId:'301',name:'B'}]);
 const same=await directoryFixture([person('300','A'),person('300','A')]).directory.read();assert.deepEqual(same.users,[{discordUserId:'300',name:'A'}]);
});
test('directory rejects private extra columns and malformed IDs/names without exposing rejected fields',async()=>{
 const r=await directoryFixture([{...person(),email:'PRIVATE_EMAIL',avatar_url:'PRIVATE_AVATAR',id:'PRIVATE_PROFILE_ID'},person('bad','Bad'),person('301',''),person('302',' Valid\nName ')]).directory.read();assert.equal(r.complete,false);assert.deepEqual(r.users,[{discordUserId:'302',name:'Valid Name'}]);assert.doesNotMatch(JSON.stringify(r),/PRIVATE_/);
});
test('missing configuration, unsafe origin and transport/backend failures are honest and sanitized',async()=>{
 for(const cfg of [{},{...env,SUPABASE_URL:'http://synthetic.invalid'},{...env,SUPABASE_URL:'https://user:pass@synthetic.invalid'},{...env,SUPABASE_URL:'https://synthetic.invalid/path'}]){
  let called=false;const r=await createDiscordUserDirectory({env:cfg,fetchImpl:async()=>{called=true;throw Error('PRIVATE');}}).read();assert.equal(called,false);assert.deepEqual(r,{complete:false,reason:'directory_unavailable',users:[]});
 }
 for(const fetchImpl of [async()=>{throw Error('PRIVATE');},async()=>new Response('PRIVATE',{status:503}),async()=>Response.json({private:'PRIVATE'}),async()=>new Response('invalid json')]){
  const r=await createDiscordUserDirectory({env,fetchImpl}).read();assert.deepEqual(r,{complete:false,reason:'directory_unavailable',users:[]});
 }
});
test('oversized directory response is cancelled and never exposes source bytes',async()=>{
 let cancelled=false;const directory=createDiscordUserDirectory({env,fetchImpl:async()=>new Response(new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('x'.repeat(1000001)));},cancel(){cancelled=true;}}))});
 assert.deepEqual(await directory.read(),{complete:false,reason:'directory_unavailable',users:[]});assert.equal(cancelled,true);
});
test('directory read combines caller cancellation and its bounded request deadline',async()=>{
 const controller=new AbortController();controller.abort();const directory=createDiscordUserDirectory({env,fetchImpl:async(_,options)=>{assert.equal(options.signal.aborted,true);throw Error('PRIVATE');}});assert.deepEqual(await directory.read({signal:controller.signal}),{complete:false,reason:'aborted',users:[]});
});

test('ready status without a message array is incomplete rather than proof of absence',async()=>{
 const r=await fixture({status:'ready',coverage:{complete:true}}).load();assert.equal(r.discordContext.complete,false);assert.equal(r.discordContext.reason,'invalid_context_response');
});
test('foreign guild record is excluded even if its channel ID matches',async()=>{
 const r=await fixture({status:'ready',coverage:{complete:true},messages:[message(from,{guild_id:'999'})]}).load();assert.equal(r.discordContext.complete,false);assert.deepEqual(r.discordContext.messages,[]);
});
