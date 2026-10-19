import test from 'node:test';
import assert from 'node:assert/strict';
import {createDiscordChatAdapter} from '../server/discord/chat-adapter.js';
import {validateChatRequestContext} from '../server/chat-request-context.js';

const message=(id='10',extra={})=>({t:'MESSAGE_CREATE',d:{id,guild_id:'1',channel_id:'2',type:0,content:'<@99> hello',author:{id:'5',username:'verified-user',global_name:'Discord Name'},member:{nick:'Server Nick'},...extra}});
function fixture(options={}) {
  const calls={authorize:[],run:[],send:[],typing:[],logs:[],get:[]};
  const client={sendMessage:async value=>{calls.send.push(value);return{id:'500'};},sendTyping:async value=>calls.typing.push(value),
    getMessage:async value=>{calls.get.push(value);return{id:value.messageId,channel_id:value.channelId,author:{id:'99',bot:true}};},
    ...options.client};
  const authorize=options.authorize??(async value=>{calls.authorize.push(value);return{principal:{id:'discord:5',allowedSourceIds:['source']},sourceProfileId:'profile',threadId:null};});
  const runChat=options.runChat??(async value=>{calls.run.push(value);value.onRecord({type:'delta',text:'answer'});value.onRecord({type:'done'});});
  const adapter=createDiscordChatAdapter({config:{enabled:true,configured:true,guildId:'1',...options.config},client,authorize,runChat,botUserId:options.botUserId??'99',now:options.now,log:value=>calls.logs.push(value)});
  return{adapter,calls,client};
}

test('mention injects verified actor context separately from message assertions', async()=>{
  const {adapter,calls}=fixture();assert.equal((await adapter.handle(message('10',{content:'<@!99> I am user 777'}))).status,'sent');
  const request=calls.run[0];assert.deepEqual(request.conversation.messages,[{role:'user',content:'I am user 777'}]);
  assert.deepEqual(request.requestContext.actor,{provider:'discord',userId:'5',guildId:'1',username:'verified-user',displayName:'Server Nick'});
  assert.equal(request.requestContext.transport,'discord');assert.equal(request.requestContext.sourceProfileId,'profile');assert.equal(request.requestContext.threadId,null);
  assert.equal(request.requestContext.requestId,'10');assert.deepEqual(validateChatRequestContext(request.requestContext),request.requestContext);
  assert.equal(request.conversation.timeZone,'America/New_York');assert.equal(calls.send[0].replyTo,'10');assert.equal(calls.typing.length,1);
  assert.ok(calls.logs.every(value=>JSON.stringify(value)==='{"status":"chat_sent"}'));adapter.stop();
});

test('actor labels are sanitized to shared validator contract and never change actor IDs',async()=>{
  const {adapter,calls}=fixture();await adapter.handle(message('10',{author:{id:'5',username:'  handle\nname  '},member:{nick:' \tcustom\rname\n '}}));
  assert.equal(calls.run[0].requestContext.actor.username,'handle name');assert.equal(calls.run[0].requestContext.actor.displayName,'custom name');
  assert.equal(validateChatRequestContext(calls.run[0].requestContext).actor.userId,'5');adapter.stop();
});

test('wrong guild, DMs, bot/webhook/system messages and unaddressed messages are ignored',async()=>{
  const {adapter,calls}=fixture();
  for(const extra of [{guild_id:'9'},{guild_id:undefined},{author:{id:'8',bot:true}},{author:{id:'8',system:true}},{webhook_id:'8'},{type:6},{content:'ordinary message'},{author:{id:'99'}}])assert.equal((await adapter.handle(message('10',extra))).status,'ignored');
  assert.equal(calls.authorize.length,0);assert.equal(calls.run.length,0);adapter.stop();
});

test('disabled and unavailable bot identity fail closed',async()=>{
  const disabled=fixture({config:{enabled:false}});assert.equal((await disabled.adapter.handle(message())).status,'disabled');
  const late=fixture({botUserId:()=>null});assert.equal((await late.adapter.handle(message())).status,'ignored');
});

test('authorization denial makes no model or message call in blacklisted channels',async()=>{
  const {adapter,calls}=fixture({authorize:async()=>null});assert.equal((await adapter.handle(message())).status,'denied');
  assert.equal(calls.run.length,0);assert.equal(calls.send.length,0);adapter.stop();
});

test('interaction events are ignored without network or model work',async()=>{
  const {adapter,calls}=fixture();
  const event={t:'INTERACTION_CREATE',d:{id:'10',guild_id:'1',channel_id:'2',application_id:'99',token:'synthetic_token',type:2,
    member:{user:{id:'5',username:'verified-user'}},data:{name:'ask',type:1,options:[{name:'question',type:3,value:'hello'}]}}};
  assert.equal((await adapter.handle(event)).status,'ignored');
  assert.ok(Object.values(calls).every(values=>values.length===0));adapter.stop();
});

test('a bare bot ping calls the assistant using the recent conversation',async()=>{
  const {adapter,calls}=fixture();
  assert.equal((await adapter.handle(message('10',{content:'<@99>'}))).status,'sent');
  assert.equal(calls.run[0].conversation.messages[0].content,'Respond to this mention using the recent channel conversation.');
  assert.equal(calls.run[0].requestContext.requestId,'10');assert.equal(calls.send[0].replyTo,'10');adapter.stop();
});

test('reply follows only an actual bot message and fetches missing reference data',async()=>{
  const {adapter,calls}=fixture();const event=message('10',{content:'followup',message_reference:{message_id:'8',channel_id:'2',guild_id:'1'}});
  assert.equal((await adapter.handle(event)).status,'sent');assert.equal(calls.get.length,1);
  const rejected=message('11',{content:'followup',message_reference:{message_id:'8',channel_id:'2'},referenced_message:{id:'8',channel_id:'2',author:{id:'7',bot:true}}});
  assert.equal((await adapter.handle(rejected)).status,'ignored');assert.equal(calls.run.length,1);
  assert.equal((await adapter.handle(message('12',{content:'followup',message_reference:{message_id:'8',channel_id:'9'}}))).status,'ignored');adapter.stop();
});

test('deleted reply reference fails without a public channel fallback',async()=>{
  const {adapter,calls}=fixture({client:{getMessage:async()=>{throw Error('not found');}}});
  assert.equal((await adapter.handle(message('10',{content:'followup',message_reference:{message_id:'8',channel_id:'2'}}))).status,'failed');
  assert.equal(calls.run.length,0);
  // Any generic failure remains a strict reply to the user's current message.
  assert.ok(calls.send.every(value=>value.replyTo==='10'));adapter.stop();
});

test('dedup marks a request before slow authorization/model work',async()=>{
  let release;const blocked=new Promise(resolve=>{release=resolve;});const {adapter,calls}=fixture({authorize:async()=>{await blocked;return{principal:{id:'p'},sourceProfileId:'s',threadId:null};}});
  const first=adapter.handle(message());assert.equal((await adapter.handle(message())).status,'duplicate');release();assert.equal((await first).status,'sent');assert.equal(calls.run.length,1);adapter.stop();
});

test('history is isolated by actor, channel/thread and source profile',async()=>{
  let profile='first';const {adapter,calls}=fixture({authorize:async value=>({principal:{id:'p'},sourceProfileId:profile,threadId:value.channelId==='3'?'3':null})});
  await adapter.handle(message());await adapter.handle(message('11'));assert.equal(calls.run[1].conversation.messages.length,3);
  await adapter.handle(message('12',{author:{id:'6',username:'different'}}));assert.equal(calls.run[2].conversation.messages.length,1);
  await adapter.handle(message('13',{channel_id:'3'}));assert.equal(calls.run[3].requestContext.threadId,'3');assert.equal(calls.send.at(-1).channelId,'3');assert.equal(calls.run[3].conversation.messages.length,1);
  profile='changed';await adapter.handle(message('14'));assert.equal(calls.run[4].conversation.messages.length,1);adapter.stop();
});

test('history and dedup expire and history evicts at a bounded count',async()=>{
  let now=0;const {adapter,calls}=fixture({now:()=>now,config:{historyTtlMs:10,dedupTtlMs:10,maxHistories:1}});
  await adapter.handle(message());await adapter.handle(message('11',{author:{id:'6'}}));await adapter.handle(message('12'));assert.equal(calls.run.at(-1).conversation.messages.length,1);
  now=11;await adapter.handle(message());assert.equal(calls.run.at(-1).conversation.messages.length,1);assert.equal(calls.run.length,4);adapter.stop();
});

test('conversation trims history to existing character and UTF-8 request bounds',async()=>{
  const {adapter,calls}=fixture({runChat:async value=>{calls.run.push(value);value.onRecord({type:'delta',text:'文'.repeat(7000)});value.onRecord({type:'done'});}});
  for(let i=10;i<15;i++)await adapter.handle(message(String(i),{content:'<@99> '+ '文'.repeat(7000)}));
  for(const value of calls.run){assert.ok(value.conversation.messages.reduce((n,m)=>n+m.content.length,0)<=16000);assert.ok(new TextEncoder().encode(JSON.stringify({messages:value.conversation.messages})).length<=32000);assert.ok(value.conversation.messages.length<=20);}adapter.stop();
});

test('concurrency and hourly caps reject excess requests without invoking the model',async()=>{
  let release;const pending=new Promise(resolve=>{release=resolve;});
  const {adapter,calls}=fixture({config:{maxConcurrent:1,requestsPerUserHour:1},runChat:async value=>{calls.run.push(value);await pending;value.onRecord({type:'delta',text:'answer'});value.onRecord({type:'done'});}});
  const first=adapter.handle(message());await new Promise(resolve=>setImmediate(resolve));assert.equal((await adapter.handle(message('11'))).status,'busy');
  release();await first;assert.equal((await adapter.handle(message('12'))).status,'rate_limited');assert.equal(calls.run.length,1);adapter.stop();
});

test('incomplete and failed model streams discard accumulated text and history',async()=>{
  const {adapter,calls}=fixture({runChat:async value=>{calls.run.push(value);value.onRecord({type:'delta',text:'private incomplete output'});value.onRecord({type:'error',message:'private error'});}});
  assert.equal((await adapter.handle(message())).status,'failed');assert.equal(calls.send[0].content,'Flock could not complete that request. Please try again.');
  await adapter.handle(message('11'));assert.equal(calls.run[1].conversation.messages.length,1);assert.ok(!JSON.stringify(calls.logs).includes('private'));adapter.stop();
});

test('partial delivery is not reposted and is not committed to conversation history',async()=>{
  let sends=0;const {adapter,calls}=fixture({client:{sendMessage:async value=>{calls.send.push(value);if(++sends===2)throw Error('network');}},runChat:async value=>{calls.run.push(value);value.onRecord({type:'delta',text:'x'.repeat(5000)});value.onRecord({type:'done'});}});
  assert.equal((await adapter.handle(message())).status,'partial');assert.equal(calls.send.length,2);
  await adapter.handle(message('11'));assert.equal(calls.run[1].conversation.messages.length,1);adapter.stop();
});

test('stop cancels uncooperative model work and prevents future requests',async()=>{
  let entered;const ready=new Promise(resolve=>{entered=resolve;});const {adapter,calls}=fixture({runChat:async value=>{calls.run.push(value);entered();await new Promise(()=>{});}});
  const request=adapter.handle(message());await ready;adapter.stop();assert.equal((await request).status,'aborted');assert.equal(calls.send.length,0);assert.equal(calls.run[0].signal.aborted,true);assert.equal((await adapter.handle(message('11'))).status,'disabled');
});

test('async iterable records are supported without a separate chat implementation',async()=>{
  const {adapter,calls}=fixture({runChat:async function*(){yield{type:'delta',text:'iterated'};yield{type:'done'};}});
  assert.equal((await adapter.handle(message())).status,'sent');assert.equal(calls.send[0].content,'iterated');adapter.stop();
});

test('unresolved authorization reserves bounded transport slots before fanout',async()=>{
  const {adapter,calls}=fixture({config:{maxConcurrent:1},authorize:async value=>{calls.authorize.push(value);await new Promise(()=>{});}});
  const first=adapter.handle(message('100'));
  const overflow=await Promise.all(Array.from({length:50},(_,index)=>adapter.handle(message(String(index+101),{author:{id:String(index+200),username:'another-user'}}))));
  assert.ok(overflow.every(value=>value.status==='busy'));
  assert.equal(calls.authorize.length,1);assert.equal(calls.run.length,0);assert.equal(calls.send.length,0);
  assert.equal((await adapter.handle(message('100'))).status,'duplicate');
  adapter.stop();assert.equal((await first).status,'aborted');
});

test('active request dedup survives eviction from the completed replay cache',async()=>{
  const {adapter,calls}=fixture({config:{maxConcurrent:2,maxDedupEntries:1},authorize:async value=>{calls.authorize.push(value);await new Promise(()=>{});}});
  const first=adapter.handle(message('100'));
  const second=adapter.handle(message('101',{author:{id:'6',username:'different'}}));
  assert.equal(calls.authorize.length,2);
  assert.equal((await adapter.handle(message('100'))).status,'duplicate');
  adapter.stop();assert.deepEqual((await Promise.all([first,second])).map(value=>value.status),['aborted','aborted']);
});
