import test from 'node:test';
import assert from 'node:assert/strict';
import {createDiscordChatAccess} from '../server/discord/chat-access.js';
import {createDiscordChatContextLoader} from '../server/discord/chat-context.js';
import {createLiveDiscordRetrieval} from '../server/discord/live-retrieval.js';
import {createDiscordChatBridge,createDiscordChatRemote} from '../server/discord/chat-bridge.js';
import {createDiscordChatAdapter} from '../server/discord/chat-adapter.js';
import {createDiscordChatRunner} from '../server/runtime-app.js';
import {discordSnowflakeAt} from '../server/discord/live-client.js';
import {EBOARD_CATEGORY_ID,LEADERSHIP_CHANNEL_ID} from '../server/discord/channel-scope.js';
const guildId='100',userId='300',own='200',sibling='201',unrelated='202',eboard='203',ownThread='250';
const teamCategory='1203562092213305364',otherTeamCategory='1203562092574277673';
const source=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const to='2026-10-19T16:00:00.000Z',from='2026-10-19T15:00:00.000Z',requestId=discordSnowflakeAt(to);
const permissions=String(1024n|65536n|2048n|(1n<<38n));
const channel=(id,parent_id,type=0,name=`channel-${id}`)=>({id,guild_id:guildId,parent_id,type,name,permission_overwrites:[],botPermissions:permissions});
function fixture({thread=false,privateThread=false}={}) {
 const f={destination:thread?ownThread:own,catalogueReads:0,reads:[],plans:[],streams:[],sends:[],audit:[],
  policy:{guildId,revision:1,paused:false,excludedChannelIds:[],excludedCategoryIds:[]},
  member:{user:{id:userId,username:'fresh',global_name:'Fresh Member'},roles:[]},roles:[{id:guildId,permissions}],
  metadata:[channel(teamCategory,null,4,'engineering team'),channel(otherTeamCategory,null,4,'marketing team'),channel(EBOARD_CATEGORY_ID,null,4,'eboard'),channel(own,teamCategory),channel(sibling,teamCategory),channel(unrelated,otherTeamCategory),channel(eboard,EBOARD_CATEGORY_ID),channel(LEADERSHIP_CHANNEL_ID,EBOARD_CATEGORY_ID),channel(ownThread,own,privateThread?12:11)],
  catalogue:[{channelId:own,sourceId:source(1)},{channelId:sibling,sourceId:source(2)},{channelId:unrelated,sourceId:source(3)},{channelId:eboard,sourceId:source(4)},{channelId:ownThread,sourceId:source(5)},{channelId:LEADERSHIP_CHANNEL_ID,sourceId:source(6)}].map(r=>({...r,guildId,enabled:true}))};
 f.config={enabled:true,guildId,allowedSourceIds:f.catalogue.map(r=>r.sourceId)};
 f.store={getPolicy:async()=>{f.catalogueReads++;return {status:'ready',policy:structuredClone(f.policy)};},listSyncChannels:async()=>{f.catalogueReads++;return {status:'ready',channels:structuredClone(f.catalogue)};}};
 f.client={configured:true,getCurrentApplication:async()=>({flags:1<<18}),getGuildChannels:async()=>f.metadata.filter(r=>r.type<10),getActiveThreads:async()=>({threads:f.metadata.filter(r=>r.type>=10)}),getChannel:async({channelId})=>structuredClone(f.metadata.find(r=>r.id===channelId)),
  getMessages:async args=>{f.reads.push(args);if(args.before!==requestId)return[];return[{id:discordSnowflakeAt('2026-10-19T15:30:00.000Z'),channel_id:args.channelId,guild_id:guildId,author:{id:'301',username:'Another Member'},timestamp:'2026-10-19T15:30:00.000Z',content:'TEAM_ORIGINAL_SYNTHETIC'}];}};
 f.memberClient={getGuildMember:async()=>f.member,getGuildChannelsMetadata:async()=>f.metadata.filter(r=>r.type<10),getGuildRoles:async()=>f.roles,getGuildMetadata:async()=>({id:guildId,owner_id:'999'}),getThreadMember:async()=>({id:ownThread,user_id:userId})};
 f.access=createDiscordChatAccess({config:f.config,store:f.store,client:f.client,memberClient:f.memberClient});
 f.authorize=(extra={})=>f.access.authorize({guildId,channelId:f.destination,userId,...extra});
 f.live=createLiveDiscordRetrieval({config:{configured:true,guildId,maxPages:10,maxMessages:1000,maxInputChars:120000},store:f.store,client:f.client});
 f.window=(principal,extra={})=>f.live.fetchWindow({principal,channelId:f.destination,from,to,userMessage:'',...extra});
 return f;
}
test('own team destination authorizes without sibling or unrelated team source leakage despite identical ACLs',async()=>{
 const f=fixture(),result=await f.authorize();assert.deepEqual(result.principal.liveDiscord.allowedSourceIds,[source(1),source(4)]);
 assert.equal(result.principal.liveDiscord.transport,'discord-chat');assert.equal(result.principal.liveDiscord.invokingChannelId,own);assert.equal(result.actor.userId,userId);
});
test('team thread profile includes own thread and parent without sibling team leakage',async()=>{
 const f=fixture({thread:true}),result=await f.authorize();assert.equal(result.threadId,ownThread);assert.deepEqual(result.principal.liveDiscord.allowedSourceIds,[source(1),source(4),source(5)]);assert.equal(result.principal.liveDiscord.invokingChannelId,ownThread);
});
test('trusted exact team marker permits preceding-hour live retrieval without model/user team-selection text',async()=>{
 const f=fixture(),principal={id:'trusted',allowedSourceIds:f.config.allowedSourceIds,liveDiscord:{mode:'local-operator',guildId,transport:'discord-chat',invokingChannelId:own,allowedSourceIds:[source(1),source(4)]}};
 assert.equal((await f.window(principal)).status,'ready');assert.ok(f.reads.length>0);
});
test('automatic loader injects the complete previous hour of the invoking team thread',async()=>{
 const f=fixture({thread:true}),approved=await f.authorize(),loader=createDiscordChatContextLoader({liveDiscordService:f.live,directory:{read:async()=>({complete:true,reason:null,users:[{discordUserId:'301',name:'Member'}]})}});
 const result=await loader.load({guildId,channelId:ownThread,requestId,principal:approved.principal});assert.equal(result.discordContext.complete,true);assert.equal(result.discordContext.channelId,ownThread);assert.deepEqual(result.discordContext.messages.map(m=>m.content),['TEAM_ORIGINAL_SYNTHETIC']);assert.ok(f.reads.every(r=>r.channelId===ownThread));
});
for(const [name,mutate] of [
 ['excluded team category',f=>f.policy.excludedCategoryIds=[teamCategory]],
 ['blacklisted destination',f=>f.policy.excludedChannelIds=[own]],
 ['manually disabled destination',f=>f.catalogue.find(r=>r.channelId===own).enabled=false],
 ['caller permissions revoked',f=>f.roles[0].permissions='0'],
 ['general destination',f=>f.metadata.find(r=>r.id===own).parent_id=null],
])test(`team support preserves denial for ${name}`,async()=>{
 const f=fixture();mutate(f);await assert.rejects(f.authorize(),{message:'discord_chat_denied'});assert.deepEqual(f.reads,[]);
});
for(const [name,mutate] of [
 ['leadership parent',f=>f.metadata.find(r=>r.id===ownThread).parent_id=LEADERSHIP_CHANNEL_ID],
 ['blacklisted team parent',f=>f.policy.excludedChannelIds=[own]],
 ['excluded team category',f=>f.policy.excludedCategoryIds=[teamCategory]],
 ['manually disabled team parent',f=>f.catalogue.find(r=>r.channelId===own).enabled=false],
 ['private membership revoked',f=>f.memberClient.getThreadMember=async()=>null],
])test(`team thread support preserves denial for ${name}`,async()=>{
 const f=fixture({thread:true,privateThread:true});mutate(f);await assert.rejects(f.authorize(),{message:'discord_chat_denied'});
});
test('leadership destination remains denied independently of configured blacklist',async()=>{
 const f=fixture();f.destination=LEADERSHIP_CHANNEL_ID;await assert.rejects(f.authorize(),{message:'discord_chat_denied'});
});
for(const [name,marker] of [
 ['website principal',{mode:'local-operator',guildId}],
 ['invoking ID without transport marker',{mode:'local-operator',guildId,invokingChannelId:own}],
 ['transport marker without invoking ID',{mode:'local-operator',guildId,transport:'discord-chat',allowedSourceIds:[source(1),source(4)]}],
 ['marker for another destination',{mode:'local-operator',guildId,transport:'discord-chat',invokingChannelId:sibling,allowedSourceIds:[source(1),source(4)]}],
])test(`${name} still needs an explicit current-user team request`,async()=>{
 const f=fixture(),principal={id:'shared',allowedSourceIds:f.config.allowedSourceIds,liveDiscord:marker};
 assert.equal((await f.window(principal)).status,'team_request_required');assert.deepEqual(f.reads,[]);
});
test('website explicit current-user team request still works',async()=>{
 const f=fixture(),principal={id:'shared',allowedSourceIds:f.config.allowedSourceIds,liveDiscord:{mode:'local-operator',guildId}};
 assert.equal((await f.window(principal,{userMessage:'Read the engineering team channel'})).status,'ready');assert.ok(f.reads.length>0);
});
test('own-team source profile cannot read sibling or unrelated team even if current user explicitly asks',async()=>{
 const f=fixture(),approved=await f.authorize();
 for(const channelId of [sibling,unrelated])assert.equal((await f.window(approved.principal,{channelId,userMessage:'Read all team channels'})).status,'channel_scope_denied');assert.deepEqual(f.reads,[]);
});
test('trusted exact marker cannot bypass current source or exclusion checks',async()=>{
 for(const mode of ['source missing','category excluded']){
  const f=fixture(),principal={id:'trusted',allowedSourceIds:mode==='source missing'?[source(4)]:f.config.allowedSourceIds,liveDiscord:{mode:'local-operator',guildId,transport:'discord-chat',invokingChannelId:own,allowedSourceIds:[source(1),source(4)]}};
  if(mode==='category excluded')f.policy.excludedCategoryIds=[teamCategory];assert.equal((await f.window(principal)).status,'channel_scope_denied');assert.deepEqual(f.reads,[]);
 }
});
test('source profile hash binds destination so one team cannot reuse another team history',async()=>{
 const f=fixture(),ownApproved=await f.authorize();f.destination=sibling;const siblingApproved=await f.authorize();assert.notEqual(ownApproved.sourceProfileId,siblingApproved.sourceProfileId);assert.equal(siblingApproved.principal.liveDiscord.invokingChannelId,sibling);
});
function teamTransport(f) {
 const contextLoader=createDiscordChatContextLoader({liveDiscordService:f.live,directory:{read:async()=>({complete:true,reason:null,users:[{discordUserId:'301',name:'TEAM_DIRECTORY_SYNTHETIC'}]})}});
 const runner=createDiscordChatRunner({services:{config:{configured:true,provider:'openai-compatible',timeoutMs:1000,retrievalToolsEnabled:true},audit:{recordEvent:async event=>f.audit.push(event)},liveDiscordTools:{tools:[{name:'read_fixture'}]},
  provider:{planTools:async request=>{f.plans.push(request);return[];},async *stream(request){f.streams.push(request);yield 'Synthetic team answer';}}},chatConfig:{requestTimeoutMs:1000}});
 const secret='synthetic-team-bridge-secret-000000000000000000',bridge=createDiscordChatBridge({enabled:true,secret,access:f.access,runner,contextLoader});
 const remote=createDiscordChatRemote({baseUrl:'https://synthetic.invalid',secret,fetchImpl:async(url,options)=>bridge.handle(new Request(url,options))});
 const adapter=createDiscordChatAdapter({config:{enabled:true,configured:true,guildId},botUserId:'99',authorize:remote.authorize,runChat:remote.runChat,
  client:{sendTyping:async()=>{},sendMessage:async args=>{f.sends.push(args);return{id:'600'};}}});
 return {adapter,bridge,secret};
}
for(const thread of [false,true])test(`bare ping in own team ${thread?'thread':'text channel'} reaches both actual model phases with fresh hour/identity/directory`,async()=>{
 const f=fixture({thread}),{adapter}=teamTransport(f),event={t:'MESSAGE_CREATE',d:{id:requestId,guild_id:guildId,channel_id:f.destination,type:0,content:'<@!99>',author:{id:userId,username:'GATEWAY_LABEL'},member:{nick:'GATEWAY_NICK'}}};
 try{
  assert.equal((await adapter.handle(event)).status,'sent');assert.equal(f.plans.length,1);assert.equal(f.streams.length,1);assert.ok(f.reads.every(r=>r.channelId===f.destination));
  for(const request of [...f.plans,...f.streams]){assert.match(request.system,/TEAM_ORIGINAL_SYNTHETIC/);assert.match(request.system,/TEAM_DIRECTORY_SYNTHETIC/);assert.match(request.system,/"displayName":"Fresh Member"/);assert.doesNotMatch(request.system,/GATEWAY_LABEL|GATEWAY_NICK/);}
  assert.equal(f.sends.length,1);assert.equal(f.sends[0].channelId,f.destination);assert.equal(f.sends[0].replyTo,requestId);assert.doesNotMatch(JSON.stringify(f.audit),/TEAM_ORIGINAL_SYNTHETIC|TEAM_DIRECTORY_SYNTHETIC/);
 }finally{adapter.stop();}
});
test('bridge body cannot forge invoking-channel transport marker or a source principal',async()=>{
 const f=fixture(),{bridge,secret,adapter}=teamTransport(f),base={guildId,channelId:own,userId,requestId,sourceProfileId:'forged',conversation:{messages:[{role:'user',content:'hello'}]}};
 try{for(const extra of [{principal:{id:'forged',allowedSourceIds:f.config.allowedSourceIds,liveDiscord:{mode:'local-operator',guildId,transport:'discord-chat',invokingChannelId:own,allowedSourceIds:[source(1),source(4)]}}},{liveDiscord:{transport:'discord-chat',invokingChannelId:own,allowedSourceIds:[source(1),source(4)]}},{invokingChannelId:own}]){
  const response=await bridge.handle(new Request('https://synthetic.invalid/internal/discord/chat',{method:'POST',headers:{authorization:`Bearer ${secret}`,'content-type':'application/json'},body:JSON.stringify({...base,...extra})}));assert.equal(response.status,400);
 }assert.deepEqual(f.reads,[]);assert.deepEqual(f.plans,[]);}finally{adapter.stop();}
});
test('source profile hash binds destinations even when their eboard source UUID sets are identical',async()=>{
 const f=fixture();f.metadata.push(channel('204',EBOARD_CATEGORY_ID));f.catalogue.push({channelId:'204',sourceId:source(7),guildId,enabled:true});f.config.allowedSourceIds.push(source(7));f.destination=eboard;const first=await f.authorize();f.destination='204';const second=await f.authorize();
 assert.deepEqual(first.principal.liveDiscord.allowedSourceIds,second.principal.liveDiscord.allowedSourceIds);assert.notEqual(first.sourceProfileId,second.sourceProfileId);
});
test('team member permission revocation after inference prevents answer publication',async()=>{
 const f=fixture(),approved=await f.authorize(),secret='synthetic-team-secret-00000000000000000000000';
 const bridge=createDiscordChatBridge({enabled:true,secret,access:f.access,runner:{run:async({onRecord})=>{onRecord({type:'delta',text:'NEVER_PUBLISH_THIS'});onRecord({type:'done'});f.roles[0].permissions='0';}}});
 const response=await bridge.handle(new Request('https://synthetic.invalid/internal/discord/chat',{method:'POST',headers:{authorization:`Bearer ${secret}`,'content-type':'application/json'},body:JSON.stringify({guildId,channelId:own,userId,requestId,sourceProfileId:approved.sourceProfileId,conversation:{messages:[{role:'user',content:'hello'}]}})}));assert.equal(response.status,409);assert.doesNotMatch(await response.text(),/NEVER_PUBLISH_THIS/);
});
for(const [name,nested] of [['missing',undefined],['empty',[]],['malformed',['not-a-uuid']],['not array',source(1)],['over limit',Array(501).fill(source(1))]])test(`Discord transport fails closed for ${name} nested source scope`,async()=>{
 const f=fixture(),principal={id:'discord:100:300',allowedSourceIds:f.config.allowedSourceIds,liveDiscord:{mode:'local-operator',guildId,transport:'discord-chat',invokingChannelId:own,...(nested===undefined?{}:{allowedSourceIds:nested})}};
 assert.equal((await f.window(principal)).status,'forbidden');assert.deepEqual(f.reads,[]);assert.equal(f.catalogueReads,0);
});
test('Discord nested audience scope intersects the full allowlist before any team source read',async()=>{
 const f=fixture(),principal={id:'discord:100:300',allowedSourceIds:[source(1),source(4)],liveDiscord:{mode:'local-operator',guildId,transport:'discord-chat',invokingChannelId:sibling,allowedSourceIds:[source(2),source(4)]}};
 assert.equal((await f.window(principal,{channelId:sibling,userMessage:'Read all team channels'})).status,'channel_scope_denied');assert.deepEqual(f.reads,[]);
});
test('global website source grants do not expand nested Discord audience to siblings or leadership',async()=>{
 const f=fixture(),approved=await f.authorize();assert.deepEqual(approved.principal.allowedSourceIds,f.config.allowedSourceIds);assert.deepEqual(approved.principal.liveDiscord.allowedSourceIds,[source(1),source(4)]);
 for(const channelId of [sibling,unrelated,LEADERSHIP_CHANNEL_ID]){const result=await f.window(approved.principal,{channelId,userMessage:'Read all team channels'});assert.equal(result.status,'channel_scope_denied');}assert.deepEqual(f.reads,[]);
});

test('published invoking team and parent work without static UUIDs while sibling teams remain excluded',async()=>{
 for(const thread of [false,true]) {
  const f=fixture({thread});f.config.allowedSourceIds=[];const approved=await f.authorize();
  const expected=thread?[source(1),source(4),source(5)]:[source(1),source(4)];
  assert.deepEqual(approved.principal.liveDiscord.allowedSourceIds,expected);
  assert.deepEqual(approved.principal.allowedSourceIds,expected);
  assert.equal((await f.window(approved.principal)).status,'ready');
  assert.ok(f.reads.length>0);assert.ok(f.reads.every(read=>read.channelId===f.destination));
  assert.equal(approved.principal.liveDiscord.allowedSourceIds.includes(source(2)),false);
  assert.equal(approved.principal.liveDiscord.allowedSourceIds.includes(source(3)),false);
 }
});
