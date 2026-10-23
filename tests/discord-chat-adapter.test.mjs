import test from 'node:test';
import assert from 'node:assert/strict';
import {createDiscordChatAdapter} from '../server/discord/chat-adapter.js';
import {validateChatRequestContext} from '../server/chat-request-context.js';
import {readDiscordChatConfig} from '../server/discord/chat-config.js';

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

function deferred() {
  let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});
  return {promise,resolve,reject};
}
function heldRequests(ids) {
  const gates=new Map(ids.map(id=>[id,{work:deferred(),started:deferred()}])),runs=[];
  return {gates,runs,runChat:async value=>{
    runs.push(value);const gate=gates.get(value.requestContext.requestId);assert.ok(gate);
    gate.started.resolve();await gate.work.promise;
    value.onRecord({type:'delta',text:`answer for ${value.requestContext.requestId}`});value.onRecord({type:'done'});
  }};
}
const increasedConcurrency=()=>{
  const {maxConcurrent,perUserConcurrent}=readDiscordChatConfig({DISCORD_CHAT_MAX_CONCURRENT:'10',DISCORD_CHAT_PER_USER_CONCURRENT:'5'});
  return {maxConcurrent,perUserConcurrent};
};

test('ten overlapping requests enforce five per member across channels and retain isolated replies/history',{timeout:5000},async()=>{
  const ids=Array.from({length:10},(_,i)=>String(1000+i)),held=heldRequests([...ids,'1100','1101']),authorizations=[],pending=[];
  const {adapter,calls}=fixture({config:increasedConcurrency(),runChat:held.runChat,authorize:async value=>{
    authorizations.push(value);return {principal:{id:`discord:${value.userId}`},sourceProfileId:'profile',threadId:null};
  }});
  const event=(id,index,userId)=>message(id,{channel_id:String(2000+index),author:{id:userId,username:`member${userId}`},content:`<@99> question ${id}`});
  try {
    for(let i=0;i<5;i++)pending.push(adapter.handle(event(ids[i],i,'5')));
    await Promise.all(ids.slice(0,5).map(id=>held.gates.get(id).started.promise));
    assert.equal((await adapter.handle(event('1200',20,'5'))).status,'busy');
    assert.equal(authorizations.length,5);assert.equal(held.runs.length,5);assert.equal(calls.send.length,0);
    for(let i=5;i<10;i++)pending.push(adapter.handle(event(ids[i],i,'6')));
    await Promise.all(ids.slice(5).map(id=>held.gates.get(id).started.promise));
    assert.equal((await adapter.handle(event('1201',21,'7'))).status,'busy');
    assert.equal((await adapter.handle(event(ids[0],0,'5'))).status,'duplicate');
    assert.equal(authorizations.length,10);assert.equal(held.runs.length,10);assert.equal(calls.send.length,0);
    for(let i=0;i<10;i++) {
      const run=held.runs.find(value=>value.requestContext.requestId===ids[i]);
      assert.equal(run.requestContext.channelId,String(2000+i));assert.equal(run.requestContext.actor.userId,i<5?'5':'6');
      assert.equal(run.principal.id,`discord:${i<5?'5':'6'}`);
      assert.deepEqual(run.conversation.messages,[{role:'user',content:`question ${ids[i]}`}]);
    }
    // Complete in reverse order to expose destination/context mixing.
    for(let i=9;i>=0;i--) {held.gates.get(ids[i]).work.resolve();assert.equal((await pending[i]).status,'sent');}
    assert.equal(calls.send.length,10);
    for(let i=0;i<10;i++) {
      const sent=calls.send.find(value=>value.replyTo===ids[i]);assert.equal(sent.channelId,String(2000+i));assert.equal(sent.content,`answer for ${ids[i]}`);
    }
    const followup=adapter.handle(event('1100',0,'5'));pending.push(followup);await held.gates.get('1100').started.promise;
    assert.deepEqual(held.runs.at(-1).conversation.messages,[{role:'user',content:'question 1000'},{role:'assistant',content:'answer for 1000'},{role:'user',content:'question 1100'}]);
    held.gates.get('1100').work.resolve();assert.equal((await followup).status,'sent');
    const otherMember=adapter.handle(event('1101',0,'6'));pending.push(otherMember);await held.gates.get('1101').started.promise;
    assert.deepEqual(held.runs.at(-1).conversation.messages,[{role:'user',content:'question 1101'}]);
    held.gates.get('1101').work.resolve();assert.equal((await otherMember).status,'sent');
  } finally {adapter.stop();for(const gate of held.gates.values())gate.work.resolve();await Promise.allSettled(pending);}
});

for(const outcome of ['success','failure','abort'])test(`five-member admission releases a slot after ${outcome}`,{timeout:5000},async()=>{
  const ids=['1300','1301','1302','1303','1304','1305'],held=heldRequests(ids),controller=new AbortController(),pending=[];
  const {adapter,calls}=fixture({config:increasedConcurrency(),runChat:held.runChat});
  const event=index=>({...message(ids[index],{channel_id:String(2300+index)}),...(index===0?{signal:controller.signal}:{})});
  try {
    for(let i=0;i<5;i++)pending.push(adapter.handle(event(i)));
    await Promise.all(ids.slice(0,5).map(id=>held.gates.get(id).started.promise));
    assert.equal((await adapter.handle(event(5))).status,'busy');assert.equal(calls.authorize.length,5);
    if(outcome==='abort')controller.abort();else if(outcome==='failure')held.gates.get(ids[0]).work.reject(Error('synthetic model failure'));else held.gates.get(ids[0]).work.resolve();
    assert.equal((await pending[0]).status,{success:'sent',failure:'failed',abort:'aborted'}[outcome]);
    const replacement=adapter.handle(event(5));pending.push(replacement);await held.gates.get(ids[5]).started.promise;
    assert.equal(calls.authorize.length,6);assert.equal(held.runs.length,6);
    for(const gate of held.gates.values())gate.work.resolve();
    assert.ok((await Promise.all(pending.slice(1))).every(value=>value.status==='sent'));
    if(outcome==='abort')assert.ok(calls.send.every(value=>value.replyTo!==ids[0]));
  } finally {adapter.stop();for(const gate of held.gates.values())gate.work.resolve();await Promise.allSettled(pending);}
});
