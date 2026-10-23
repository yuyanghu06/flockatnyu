import test from 'node:test';
import assert from 'node:assert/strict';
import {createDiscordDraftTools,DISCORD_DRAFT_TOOLS} from '../tools/discord/draft.js';
import {createDiscordChatAccess} from '../server/discord/chat-access.js';
import {EBOARD_CATEGORY_ID,LEADERSHIP_CHANNEL_ID} from '../server/discord/channel-scope.js';

const guildId='100',userId='300',permissions=String(1024n|65536n|2048n|(1n<<38n));
const source=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const row=(id,name=`channel-${id}`,parent_id=EBOARD_CATEGORY_ID,type=0)=>({id,name,guild_id:guildId,parent_id,type,permission_overwrites:[],botPermissions:permissions});
async function fixture() {
 const state={policy:{guildId,revision:1,paused:false,excludedCategoryIds:[],excludedChannelIds:[]},
  rows:[row(EBOARD_CATEGORY_ID,'eboard',null,4),row('200','origin'),row('201','planning')],threads:[],
  catalogue:[{channelId:'200',guildId,enabled:true,sourceId:source(1)},{channelId:'201',guildId,enabled:true,sourceId:source(2)}],
  member:{user:{id:userId,username:'member',global_name:'Member'},roles:[]},roles:[{id:guildId,permissions}],
  threadMember:{id:'250',user_id:userId},authorize:[],reads:0,posts:0,metadataReads:0};
 const store={getPolicy:async()=>({status:'ready',policy:state.policy}),listSyncChannels:async()=>({status:'ready',channels:state.catalogue})};
 const client={getGuildChannels:async()=>{state.metadataReads++;return state.rows;},getActiveThreads:async()=>({threads:state.threads}),getChannel:async({channelId})=>[...state.rows,...state.threads].find(r=>r.id===channelId),
  readMessages:async()=>{state.reads++;throw new Error('drafts must not read messages');},sendMessage:async()=>{state.posts++;throw new Error('drafts must not post');}};
 const access=createDiscordChatAccess({config:{enabled:true,guildId,allowedSourceIds:[]},store,client,memberClient:{getGuildMember:async()=>state.member,getGuildChannelsMetadata:async()=>state.rows,getGuildRoles:async()=>state.roles,getGuildMetadata:async()=>({id:guildId,owner_id:'999'}),getThreadMember:async()=>state.threadMember}});
 const initial=await access.authorize({guildId,channelId:'200',userId});
 const principal=initial.principal,requestContext={transport:'discord',actor:initial.actor,channelId:'200',threadId:null,requestId:'400',sourceProfileId:initial.sourceProfileId},userMessage='Please draft a message for planning.';
 const draftAccess={authorize:async args=>{state.authorize.push(args);return access.authorize(args);}};
 const tools=createDiscordDraftTools({guildId,store,metadataClient:client,access:draftAccess});
 const context={principal,requestContext,userMessage};
 const execute=(args={targetChannel:'planning',content:'A faithful synthetic draft.'},extra={})=>tools.createRequest(context).execute({name:'draft_discord_message',arguments:args,principal,...extra});
 state.metadataReads=0;
 return {state,tools,principal,requestContext,context,execute,draftAccess,access,store,client};
}

for(const targetChannel of ['201','<#201>','planning','PLANNING'])test(`draft resolves exact target ${targetChannel}, preserves content and has no reads/posts/grant expansion`,async()=>{
 const f=await fixture(),before=structuredClone(f.principal),content='Hello <@300>!\nA Unicode draft: café 🐦';
 const result=await f.execute({targetChannel,content});
 assert.equal(result.status,'ready');assert.equal(result.sent,false);assert.equal(result.discordDraft.sent,false);
 assert.equal(result.discordDraft.content,content);assert.equal(result.discordDraft.target.channelId,'201');assert.equal(result.discordDraft.target.url,'https://discord.com/channels/100/201');
 assert.deepEqual(f.principal,before);assert.equal(f.state.reads,0);assert.equal(f.state.posts,0);assert.deepEqual(result.sources,[]);
 assert.equal(f.state.authorize.length,2);assert(f.state.authorize.every(c=>c.userId===userId&&c.channelId==='201'));
});

for(const [name,args] of [['missing content',{targetChannel:'planning'}],['extra permission',{targetChannel:'planning',content:'hello',send:true}],['empty target',{targetChannel:' ',content:'hello'}],['empty content',{targetChannel:'planning',content:'\n '}],['oversize target',{targetChannel:'x'.repeat(101),content:'hello'}],['oversize content',{targetChannel:'planning',content:'x'.repeat(2001)}],['wrong type',{targetChannel:201,content:'hello'}],['array',[]],['null',null]])test(`invalid draft args: ${name}`,async()=>{
 const f=await fixture(),result=await f.execute(args);assert.equal(result.status,'invalid_request');assert.equal(f.state.metadataReads,0);assert.equal(f.state.authorize.length,0);assert.equal(result.discordDraft,undefined);
});
test('schema bounds are enforced at exact inclusive content and target limits',async()=>{
 const f=await fixture();f.state.rows[2].name='n'.repeat(100);
 assert.equal((await f.execute({targetChannel:'n'.repeat(100),content:'x'.repeat(2000)})).status,'ready');
 assert.equal(DISCORD_DRAFT_TOOLS.length,1);assert.equal(DISCORD_DRAFT_TOOLS[0].name,'draft_discord_message');assert.doesNotThrow(()=>JSON.stringify(DISCORD_DRAFT_TOOLS));
});

for(const [name,change] of [
 ['website context',c=>delete c.requestContext],['forged actor',c=>c.requestContext.actor.userId='999'],['forged principal',c=>c.principal.id='website:300'],['wrong guild',c=>c.principal.liveDiscord.guildId='999'],['wrong origin',c=>c.principal.liveDiscord.invokingChannelId='201'],['missing transport',c=>delete c.principal.liveDiscord.transport],['wrong transport',c=>c.principal.liveDiscord.transport='website'],['missing source grants',c=>delete c.principal.allowedSourceIds],['missing nested grants',c=>delete c.principal.liveDiscord.allowedSourceIds],['empty nested grants',c=>c.principal.liveDiscord.allowedSourceIds=[]],['wrong live mode',c=>c.principal.liveDiscord.mode='forged'],['missing current turn',c=>delete c.userMessage],
])test(`untrusted draft context has no catalogue: ${name}`,async()=>{
 const f=await fixture(),context=structuredClone(f.context);change(context);const request=f.tools.createRequest(context);assert.deepEqual(request.tools,[]);assert.equal((await request.execute({name:'draft_discord_message',arguments:{targetChannel:'201',content:'hello'},principal:context.principal})).status,'forbidden');assert.equal(f.state.metadataReads,0);
});
test('stateless adapter and replacement principal cannot draft',async()=>{
 const f=await fixture();assert.deepEqual(f.tools.tools,[]);assert.equal((await f.tools.execute()).status,'forbidden');
 assert.equal((await f.execute(undefined,{principal:structuredClone(f.principal)})).status,'forbidden');
});

for(const [name,change] of [
 ['disabled target',s=>s.catalogue[1].enabled=false],['unpublished target',s=>s.catalogue.pop()],['blacklisted channel',s=>s.policy.excludedChannelIds=['201']],['blacklisted category',s=>s.policy.excludedCategoryIds=[EBOARD_CATEGORY_ID]],['leadership',s=>{s.rows[2].id=LEADERSHIP_CHANNEL_ID;s.catalogue[1].channelId=LEADERSHIP_CHANNEL_ID;}],['bot cannot send',s=>s.rows[2].botPermissions=String(1024n|65536n)],['member cannot view target',s=>s.rows[2].permission_overwrites=[{id:userId,type:1,allow:'0',deny:'1024'}]],['member cannot send target',s=>s.rows[2].permission_overwrites=[{id:userId,type:1,allow:'0',deny:'2048'}]],['paused policy',s=>s.policy.paused=true],['foreign metadata',s=>s.rows[2].guild_id='999'],
])test(`fresh target authorization blocks ${name}`,async()=>{
 const f=await fixture();change(f.state);const result=await f.execute();assert.notEqual(result.status,'ready');assert.equal(result.discordDraft,undefined);assert.equal(result.discordDraftCandidates,undefined);assert.equal(f.state.reads,0);assert.equal(f.state.posts,0);
});

function addThread(f,{id='250',parent='201',type=11,archived=false,locked=false}={}) {
 f.state.threads.push({...row(id,'thread',parent,type),thread_metadata:{archived,locked}});f.state.catalogue.push({channelId:id,guildId,enabled:true,sourceId:source(3)});
}
for(const [name,options,change] of [
 ['archived',{archived:true}],['locked',{locked:true}],['private member missing',{type:12},f=>f.state.threadMember=null],['disabled parent',{},f=>f.state.catalogue[1].enabled=false],['blacklisted parent',{},f=>f.state.policy.excludedChannelIds=['201']],['leadership descendant',{parent:LEADERSHIP_CHANNEL_ID},f=>{f.state.rows.push(row(LEADERSHIP_CHANNEL_ID,'leadership'));f.state.catalogue.push({channelId:LEADERSHIP_CHANNEL_ID,guildId,enabled:true,sourceId:source(4)});}]
])test(`thread draft rejects ${name}`,async()=>{const f=await fixture();addThread(f,options);change?.(f);assert.notEqual((await f.execute({targetChannel:'250',content:'hello'})).status,'ready');});
test('private thread exact membership succeeds without authorizing sibling reads',async()=>{
 const f=await fixture();addThread(f,{type:12});const before=structuredClone(f.principal),result=await f.execute({targetChannel:'250',content:'hello'});assert.equal(result.status,'ready');assert.deepEqual(f.principal,before);assert(!f.principal.liveDiscord.allowedSourceIds.includes(source(3)));
});
test('sibling team draft is permitted without expanding source grants',async()=>{
 const f=await fixture(),team='1203562092213305364';f.state.rows.push(row(team,'team-category',null,4));f.state.rows[2].parent_id=team;
 const principal=(await f.access.authorize({guildId,channelId:'200',userId})).principal;f.context.principal=principal;
 const before=structuredClone(principal);const result=await f.tools.createRequest(f.context).execute({name:'draft_discord_message',arguments:{targetChannel:'201',content:'hello'},principal});assert.equal(result.status,'ready');assert.deepEqual(principal,before);assert(!principal.liveDiscord.allowedSourceIds.includes(source(2)));
});
test('duplicate names require authorized candidates and never pick first',async()=>{
 const f=await fixture();f.state.rows.push(row('202','planning'));f.state.catalogue.push({channelId:'202',guildId,enabled:true,sourceId:source(3)});
 let result=await f.execute();assert.equal(result.status,'ambiguous');assert.equal(result.discordDraft,undefined);assert.deepEqual(result.discordDraftCandidates.map(r=>r.channelId),['201','202']);
 f.state.rows[3].permission_overwrites=[{id:userId,type:1,allow:'0',deny:'1024'}];result=await f.execute();assert.equal(result.status,'ready');assert.equal(result.discordDraft.target.channelId,'201');
});
test('name resolution is exact and candidate bound stops authorization storms',async()=>{
 const f=await fixture();assert.notEqual((await f.execute({targetChannel:'plan',content:'hello'})).status,'ready');
 for(let n=202;n<212;n++){f.state.rows.push(row(String(n),'planning'));f.state.catalogue.push({channelId:String(n),guildId,enabled:true,sourceId:source(n)});}
 f.state.authorize.length=0;const result=await f.execute();assert.notEqual(result.status,'ready');assert.equal(f.state.authorize.length,0);assert.equal(result.discordDraftCandidates,undefined);
});
test('final target authorization catches permissions revoked during draft preparation',async()=>{
 const f=await fixture();const authorize=f.draftAccess.authorize;let calls=0;f.draftAccess.authorize=async args=>{if(++calls===2)f.state.roles[0].permissions='0';return authorize(args);};
 const result=await f.execute();assert.equal(calls,2);assert.equal(result.status,'forbidden');assert.equal(result.discordDraft,undefined);
});
test('abort before or during metadata and final authorization prevents draft return',async()=>{
 for(const stage of ['before','metadata','final']){
  const f=await fixture(),abort=new AbortController();if(stage==='before')abort.abort();
  if(stage==='metadata')f.client.getActiveThreads=async()=>{abort.abort();return {threads:[]};};
  if(stage==='final'){const authorize=f.draftAccess.authorize;let calls=0;f.draftAccess.authorize=async args=>{const result=await authorize(args);if(++calls===2)abort.abort();return result;};}
  const result=await f.execute(undefined,{signal:abort.signal});assert.equal(result.status,'aborted',stage);assert.equal(result.discordDraft,undefined);
 }
});
test('metadata failure is content-free and does not expose a successful draft',async()=>{
 const f=await fixture();f.client.getGuildChannels=async()=>{throw new Error('PRIVATE_ERROR_BODY');};
 const result=await f.execute();assert.equal(result.status,'unavailable');assert.doesNotMatch(JSON.stringify(result),/PRIVATE_ERROR_BODY|faithful synthetic/);
});
