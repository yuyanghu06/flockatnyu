import test from 'node:test';
import assert from 'node:assert/strict';
import {createDiscordChatClient, discordAskCommand} from '../server/discord/chat-client.js';
import {deliverDiscordChat, splitDiscordChatText, startDiscordChatTyping} from '../server/discord/chat-delivery.js';

test('delivery caps aggregate output and keeps surrogate pairs together', () => {
  const chunks = splitDiscordChatText('a'.repeat(1999)+'😀'+'b'.repeat(10000));
  assert.ok(chunks.every(value=>value.length<=2000)); assert.equal(chunks.join('').length,8000);
  assert.equal(chunks[0].length,1999); assert.ok(chunks[1].startsWith('😀'));
});

test('partial delivery never reposts prior chunks or falls back without reference', async () => {
  const calls=[];
  const result=await deliverDiscordChat({client:{sendMessage:async args=>{calls.push(args);if(calls.length===2)throw Error('missing reference');}},channelId:'2',replyTo:'3',text:'x'.repeat(6000)});
  assert.deepEqual(result,{status:'partial',sent:1}); assert.equal(calls.length,2);
  assert.ok(calls.every(call=>call.channelId==='2'&&call.replyTo==='3'));
});

test('slash replies edit the deferred response then send webhook followups', async () => {
  const calls=[];const client={editInteraction:async args=>calls.push(['edit',args]),sendInteractionFollowup:async args=>calls.push(['followup',args])};
  assert.equal((await deliverDiscordChat({client,interaction:{applicationId:'4',token:'secret'},text:'x'.repeat(4001)})).status,'sent');
  assert.deepEqual(calls.map(call=>call[0]),['edit','followup','followup']);
  assert.ok(calls.every(call=>call[1].token==='secret'));
});

test('aborted delivery does not send and typing stops immediately', async () => {
  const controller=new AbortController();controller.abort();let calls=0;
  const client={sendMessage:async()=>calls++,sendTyping:async()=>calls++};
  assert.equal((await deliverDiscordChat({client,text:'answer',signal:controller.signal})).status,'aborted');
  const stop=startDiscordChatTyping({client,channelId:'2',signal:controller.signal});stop();
  await Promise.resolve();assert.equal(calls,0);
});

function harness(commands=[]) {
  const calls=[];const rest=Object.fromEntries(['get','post','patch'].map(method=>[method,async(path,options)=>{calls.push({method,path,options});return method==='get'&&path.endsWith('/commands')?commands:{id:'999'};}]));
  return {calls,client:createDiscordChatClient({config:{configured:true,guildId:'1',botToken:'synthetic'},rest})};
}

test('REST messages disable every mention and require an existing same-channel reference', async () => {
  const {calls,client}=harness();
  await client.sendMessage({channelId:'2',replyTo:'3',content:'@everyone <@4> <@&5>'});
  const {body}=calls[0].options;
  assert.deepEqual(body.allowed_mentions,{parse:[],users:[],roles:[],replied_user:false});
  assert.deepEqual(body.message_reference,{message_id:'3',channel_id:'2',fail_if_not_exists:true});
  await assert.rejects(client.sendMessage({channelId:'2',content:'answer'}),{code:'invalid_reference'});
  assert.equal(calls.length,1);
});

test('interaction credentials stay in unauthenticated webhook routes and errors are sanitized', async () => {
  const {calls,client}=harness();
  await client.ackInteraction({interactionId:'3',token:'synthetic_token'});
  await client.editInteraction({applicationId:'4',token:'synthetic_token',content:'answer'});
  await client.sendInteractionFollowup({applicationId:'4',token:'synthetic_token',content:'rest'});
  assert.equal(calls[0].options.body.type,5);assert.ok(calls.every(call=>call.options.auth===false));
  assert.ok(calls.slice(1).every(call=>call.options.body.allowed_mentions.parse.length===0));
  const broken=createDiscordChatClient({config:{configured:true},rest:{get:async()=>{throw Error('secret raw text');}}});
  await assert.rejects(broken.getCurrentUser(),error=>error.message==='discord_unavailable'&&!error.cause);
});

test('command registration creates or patches only ask and preserves unrelated commands', async () => {
  const {calls,client}=harness([{id:'7',name:'ask',type:1},{id:'8',name:'else',type:1}]);
  await client.registerAskCommand({applicationId:'4'});
  assert.deepEqual(calls.map(call=>[call.method,call.path]),[['get','/applications/4/guilds/1/commands'],['patch','/applications/4/guilds/1/commands/7']]);
  assert.deepEqual(calls[1].options.body,discordAskCommand);
  assert.equal(discordAskCommand.options[0].max_length,6000);
  const created=harness([{id:'8',name:'else',type:1}]);await created.client.registerAskCommand({applicationId:'4'});
  assert.equal(created.calls[1].method,'post');
  await assert.rejects(client.registerAskCommand({applicationId:'4',guildId:'9'}),{code:'invalid_command_scope'});
});

test('member lookup is constrained to configured guild', async () => {
  const {calls,client}=harness();await client.getGuildMember({guildId:'1',userId:'6'});
  assert.equal(calls[0].path,'/guilds/1/members/6');
  await assert.rejects(client.getGuildMember({guildId:'9',userId:'6'}),{code:'invalid_member'});
});

test('guild channel metadata preserves permission overwrites and rejects foreign guilds', async () => {
  const channels=[{id:'2',guild_id:'1',permission_overwrites:[{id:'1',type:0,allow:'1024',deny:'0'}]}];
  const calls=[];const client=createDiscordChatClient({config:{configured:true,guildId:'1'},rest:{get:async path=>{calls.push(path);return channels;}}});
  assert.deepEqual(await client.getGuildChannelsMetadata(),channels);assert.deepEqual(calls,['/guilds/1/channels']);
  await assert.rejects(client.getGuildChannelsMetadata({guildId:'9'}),{code:'invalid_guild'});
  channels[0].guild_id='9';await assert.rejects(client.getGuildChannelsMetadata(),{code:'invalid_response'});
});
