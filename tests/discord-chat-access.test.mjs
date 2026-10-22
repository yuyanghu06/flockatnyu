import test from 'node:test';
import assert from 'node:assert/strict';
import {createDiscordChatAccess} from '../server/discord/chat-access.js';
import {createDiscordChatBridge} from '../server/discord/chat-bridge.js';
import {EBOARD_CATEGORY_ID, LEADERSHIP_CHANNEL_ID} from '../server/discord/channel-scope.js';

const guildId='100', channelId='200', userId='300';
const source=(n)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const permissions=String(1024n|65536n|2048n|(1n<<38n));
const row=(id,parent_id=EBOARD_CATEGORY_ID,type=0)=>({id,guild_id:guildId,parent_id,type,name:`channel-${id}`,permission_overwrites:[]});
function setup() {
  const state={
    config:{enabled:true,guildId,allowedSourceIds:[source(1),source(2),source(3),source(4),source(5)]},
    policy:{guildId,revision:1,paused:false,excludedCategoryIds:[],excludedChannelIds:[]},
    metadata:[row(EBOARD_CATEGORY_ID,null,4),row(channelId),row('201'),row('202',null)],
    catalogue:[{channelId,guildId,sourceId:source(1),enabled:true},{channelId:'201',guildId,sourceId:source(2),enabled:true},{channelId:'202',guildId,sourceId:source(3),enabled:true}],
    detail:{...row(channelId),botPermissions:permissions},
    member:{user:{id:userId,username:'fresh_username',global_name:'Fresh Display'},nick:'Fresh Nick',roles:[]},
    roles:[{id:guildId,permissions}],guild:{id:guildId,owner_id:'999'},threadMember:{id:'250',user_id:userId},
    threads:[], policyStatus:'ready',catalogueStatus:'ready',calls:[],
  };
  const access=createDiscordChatAccess({config:state.config,
    store:{getPolicy:async()=>({status:state.policyStatus,policy:state.policy}),listSyncChannels:async()=>({status:state.catalogueStatus,channels:state.catalogue})},
    client:{getGuildChannels:async()=>state.metadata,getActiveThreads:async()=>({threads:state.threads}),getChannel:async({channelId:id})=>id===state.detail.id?state.detail:state.metadata.find(r=>r.id===id)},
    memberClient:{getGuildMember:async args=>{state.calls.push(args);return state.member;},getGuildChannelsMetadata:async()=>state.metadata,getGuildRoles:async()=>state.roles,getGuildMetadata:async()=>state.guild,getThreadMember:async()=>state.threadMember},
  });
  return {state,access,authorize:(extra={})=>access.authorize({guildId,channelId:state.detail.id,userId,...extra})};
}
const denied=async f=>assert.rejects(f,{message:'discord_chat_denied'});
test('eboard destination derives fresh actor identity and audience-safe published eboard sources',async()=>{
  const f=setup(),result=await f.authorize({actor:{userId:'999',displayName:'spoof'},principal:{isAdmin:true}});
  assert.deepEqual(result.actor,{provider:'discord',guildId,userId,username:'fresh_username',displayName:'Fresh Nick'});
  assert.deepEqual(result.principal.liveDiscord.allowedSourceIds,[source(1),source(2)]);
  assert.deepEqual(result.principal.allowedSourceIds,f.state.config.allowedSourceIds);assert.equal(result.principal.isAdmin,false);assert.equal(result.threadId,null);
  assert.deepEqual(f.state.calls[0].userId,userId);
  f.state.config.allowedSourceIds=[source(1),source(3)];
  assert.deepEqual((await f.authorize()).principal.liveDiscord.allowedSourceIds,[source(1),source(2)]);
  assert.deepEqual((await f.authorize()).principal.allowedSourceIds,[source(1),source(2),source(3)]);
});
for(const [name,mutate] of [
 ['disabled interaction',s=>s.config.enabled=false],['foreign guild',s=>s.config.guildId='999'],
 ['missing source configuration',s=>delete s.config.allowedSourceIds],['invalid source allowlist',s=>s.config.allowedSourceIds=['not-uuid']],
 ['paused policy',s=>s.policy.paused=true],['policy unavailable',s=>s.policyStatus='failed'],
 ['catalogue unavailable',s=>s.catalogueStatus='failed'],['unregistered destination',s=>s.catalogue.shift()],
 ['manually disabled destination',s=>s.catalogue[0].enabled=false],['non-eboard destination',s=>s.detail.parent_id=null],
 ['missing category ancestry',s=>s.metadata=s.metadata.filter(r=>r.id!==EBOARD_CATEGORY_ID)],
 ['blacklisted category',s=>s.policy.excludedCategoryIds=[EBOARD_CATEGORY_ID]],['blacklisted channel',s=>s.policy.excludedChannelIds=[channelId]],
 ['foreign member identity',s=>s.member.user.id='999'],['bot actor',s=>s.member.user.bot=true],['pending guild member',s=>s.member.pending=true],
 ['malformed policy exclusions',s=>s.policy.excludedCategoryIds=['invalid']],['missing membership roles',s=>delete s.member.roles],
 ['bot cannot view',s=>s.detail.botPermissions=String(2048n)],['bot cannot send',s=>s.detail.botPermissions=String(1024n)],
 ['foreign channel metadata',s=>s.detail.guild_id='999'],['category destination',s=>s.detail.type=4],
]) test(`access fails closed: ${name}`,async()=>{const f=setup();mutate(f.state);await denied(f.authorize);});

test('leadership is denied even without configured blacklist',async()=>{
 const f=setup();f.state.detail={...row(LEADERSHIP_CHANNEL_ID),botPermissions:permissions};f.state.catalogue.push({channelId:LEADERSHIP_CHANNEL_ID,guildId,sourceId:source(4),enabled:true});await denied(f.authorize);
});
function threadFixture({privateThread=false}={}) {
 const f=setup();f.state.detail={...row('250',channelId,privateThread?12:11),botPermissions:permissions,thread_metadata:{archived:false,locked:false}};
 f.state.threads=[f.state.detail];f.state.catalogue.push({channelId:'250',guildId,sourceId:source(4),enabled:true});return f;
}
test('public thread authorizes its destination and requires send-in-threads, not send-messages',async()=>{
 const f=threadFixture();f.state.detail.botPermissions=String(1024n|(1n<<38n));const result=await f.authorize();assert.equal(result.threadId,'250');assert.ok(result.principal.liveDiscord.allowedSourceIds.includes(source(4)));
 f.state.detail.botPermissions=String(1024n|2048n);await denied(f.authorize);
});
for(const [name,change] of [
 ['disabled parent',s=>s.catalogue[0].enabled=false],['excluded parent',s=>s.policy.excludedChannelIds=[channelId]],
 ['archived thread',s=>s.detail.thread_metadata.archived=true],['locked thread',s=>s.detail.thread_metadata.locked=true],
 ['missing parent',s=>s.metadata=s.metadata.filter(r=>r.id!==channelId)],
 ['leadership parent',s=>{s.detail.parent_id=LEADERSHIP_CHANNEL_ID;s.metadata.push(row(LEADERSHIP_CHANNEL_ID));s.catalogue.push({channelId:LEADERSHIP_CHANNEL_ID,guildId,sourceId:source(5),enabled:true});}],
])test(`thread access fails closed: ${name}`,async()=>{const f=threadFixture();change(f.state);await denied(f.authorize);});

test('private sibling thread cannot become a broadly readable source',async()=>{
 const f=setup(),privateRow=row('260',channelId,12);f.state.threads.push(privateRow);f.state.catalogue.push({channelId:'260',guildId,sourceId:source(4),enabled:true});
 assert.equal((await f.authorize()).principal.liveDiscord.allowedSourceIds.includes(source(4)),false);
});
test('differing view ACL sibling cannot become a source for this destination',async()=>{
 const f=setup();f.state.metadata.find(r=>r.id==='201').permission_overwrites=[{id:'900',type:0,allow:'0',deny:'1024'}];
 assert.deepEqual((await f.authorize()).principal.liveDiscord.allowedSourceIds,[source(1)]);
});
test('renamed source channel invalidates retained conversation source profile without revision change',async()=>{
 const f=setup(),before=await f.authorize();f.state.metadata.find(r=>r.id==='201').name='renamed';assert.notEqual((await f.authorize()).sourceProfileId,before.sourceProfileId);
});
test('disabled source invalidates retained conversation source profile without revision change',async()=>{
 const f=setup(),before=await f.authorize();f.state.catalogue[1].enabled=false;const after=await f.authorize();assert.notEqual(after.sourceProfileId,before.sourceProfileId);assert.deepEqual(after.principal.liveDiscord.allowedSourceIds,[source(1)]);
});
test('source mapping changes invalidate retained conversation even if source UUID set stays the same',async()=>{
 const f=setup(),before=await f.authorize();[f.state.catalogue[0].sourceId,f.state.catalogue[1].sourceId]=[f.state.catalogue[1].sourceId,f.state.catalogue[0].sourceId];assert.notEqual((await f.authorize()).sourceProfileId,before.sourceProfileId);
});

for(const [name,change] of [
 ['missing member view',s=>s.roles[0].permissions=String(65536n|2048n)],
 ['missing member history',s=>s.roles[0].permissions=String(1024n|2048n)],
 ['member view explicitly denied',s=>s.detail.permission_overwrites=[{id:userId,type:1,allow:'0',deny:'1024'}]],
 ['member role removed',s=>s.member.roles=['404']],
 ['member communication timeout',s=>s.member.communication_disabled_until='2099-01-01T00:00:00Z'],
])test(`member access fails closed: ${name}`,async()=>{const f=setup();change(f.state);await denied(f.authorize);});
test('private thread requires fresh exact invoking-member membership',async()=>{
 const f=threadFixture({privateThread:true});assert.equal((await f.authorize()).threadId,'250');f.state.threadMember={id:'250',user_id:'999'};await denied(f.authorize);
});
test('fresh authorization denies revoked caller permissions without a policy revision bump',async()=>{
 const f=setup();await f.authorize();f.state.roles[0].permissions='0';await denied(f.authorize);
});

for(const mode of ['member role revoked','private thread membership revoked'])test(`actual access recheck prevents publication when ${mode}`,async()=>{
 const f=mode.startsWith('private')?threadFixture({privateThread:true}):setup(),initial=await f.authorize(),secret='synthetic-secret-0000000000000000000000';
 const bridge=createDiscordChatBridge({enabled:true,secret,access:f.access,runner:{run:async({onRecord})=>{
  onRecord({type:'delta',text:'DO NOT PUBLISH'});onRecord({type:'done'});
  if(mode.startsWith('private'))f.state.threadMember=null;else f.state.roles[0].permissions='0';
 }}});
 const response=await bridge.handle(new Request('https://flock.invalid/internal/discord/chat',{method:'POST',headers:{authorization:`Bearer ${secret}`,'content-type':'application/json'},body:JSON.stringify({guildId,channelId:f.state.detail.id,userId,requestId:'400',sourceProfileId:initial.sourceProfileId,conversation:{messages:[{role:'user',content:'hello'}],timeZone:'America/New_York'}})}));
 assert.equal(response.status,409);assert.doesNotMatch(await response.text(),/DO NOT PUBLISH/);
});
test('full configured source allowlist retains non-Discord UUIDs while nested Discord scope remains audience-safe',async()=>{
 const f=setup(),miro='00000000-0000-4000-8000-000000000099';f.state.config.allowedSourceIds.push(miro);const approved=await f.authorize();assert.ok(approved.principal.allowedSourceIds.includes(miro));assert.deepEqual(approved.principal.liveDiscord.allowedSourceIds,[source(1),source(2)]);assert.equal(approved.principal.liveDiscord.transport,'discord-chat');assert.equal(approved.principal.liveDiscord.invokingChannelId,channelId);
});
test('Google access matches configured website grant only and affects the conversation source profile',async()=>{
 const f=setup(),initial=await f.authorize({googleAccess:true});assert.notEqual(initial.principal.googleAccess,true);f.state.config.googleEnabled=true;const granted=await f.authorize({googleAccess:false});assert.equal(granted.principal.googleAccess,true);assert.notEqual(granted.sourceProfileId,initial.sourceProfileId);f.state.config.googleEnabled=false;assert.notEqual((await f.authorize()).principal.googleAccess,true);
});
test('non-Discord source grant changes invalidate retained conversation even when nested Discord sources are unchanged',async()=>{
 const f=setup(),initial=await f.authorize();f.state.config.allowedSourceIds.push('00000000-0000-4000-8000-000000000099');const expanded=await f.authorize();assert.deepEqual(expanded.principal.liveDiscord.allowedSourceIds,initial.principal.liveDiscord.allowedSourceIds);assert.notEqual(expanded.sourceProfileId,initial.sourceProfileId);
});

for (const staticIds of [[],[source(99)]]) test(`published channels work without static Discord UUIDs (${staticIds.length} other grants)`,async()=>{
 const f=setup();f.state.config.allowedSourceIds=staticIds;const approved=await f.authorize();
 assert.deepEqual(approved.principal.liveDiscord.allowedSourceIds,[source(1),source(2)]);
 assert.deepEqual(approved.principal.allowedSourceIds,[...new Set([...staticIds,source(1),source(2)])].sort());
});
test('mixed malformed static grants fail closed rather than silently filtering',async()=>{
 const f=setup();f.state.config.allowedSourceIds.push('not-a-uuid');await denied(f.authorize);
});
test('newly published audience source joins principal and invalidates conversation profile',async()=>{
 const f=setup();f.state.config.allowedSourceIds=[];const initial=await f.authorize();
 f.state.metadata.push(row('205'));f.state.catalogue.push({channelId:'205',guildId,sourceId:source(9),enabled:true});
 const next=await f.authorize();assert.ok(next.principal.allowedSourceIds.includes(source(9)));assert.ok(next.principal.liveDiscord.allowedSourceIds.includes(source(9)));assert.notEqual(next.sourceProfileId,initial.sourceProfileId);
 f.state.catalogue.at(-1).enabled=false;assert.deepEqual((await f.authorize()).principal.allowedSourceIds,initial.principal.allowedSourceIds);
});
