import test from 'node:test';
import assert from 'node:assert/strict';
import {createDiscordChatClient} from '../server/discord/chat-client.js';
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

test('aborted delivery does not send and typing stops immediately', async () => {
  const controller=new AbortController();controller.abort();let calls=0;
  const client={sendMessage:async()=>calls++,sendTyping:async()=>calls++};
  assert.equal((await deliverDiscordChat({client,text:'answer',signal:controller.signal})).status,'aborted');
  const stop=startDiscordChatTyping({client,channelId:'2',signal:controller.signal});stop();
  await Promise.resolve();assert.equal(calls,0);
});

function harness() {
  const calls=[];const rest=Object.fromEntries(['get','post'].map(method=>[method,async(path,options)=>{calls.push({method,path,options});return{id:'999'};}]));
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

test('REST errors are sanitized and client has no command or interaction write surface', async () => {
  const {client}=harness();
  for(const method of ['ackInteraction','editInteraction','sendInteractionFollowup','registerAskCommand'])assert.equal(client[method],undefined);
  const broken=createDiscordChatClient({config:{configured:true},rest:{get:async()=>{throw Error('secret raw text');}}});
  await assert.rejects(broken.getCurrentUser(),error=>error.message==='discord_unavailable'&&!error.cause);
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
