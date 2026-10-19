import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {WebSocketShardEvents as E} from '@discordjs/ws';
import {createDiscordGateway} from '../server/discord/gateway.js';
import {createDiscordEventListener} from '../server/discord/event-listener.js';
const session={sessionId:'synthetic',resumeURL:'wss://gateway.discord.gg',sequence:1,shardId:0,shardCount:1};
async function setup(onDispatch) {
 const f={manager:new EventEmitter(),checkpoints:[],messages:[],chat:[],logs:[]};
 f.manager.connect=async()=>{};f.manager.destroy=async()=>{};
 f.gateway=await createDiscordGateway({config:{guildId:'100',botToken:'synthetic',maxPending:10},
  listener:{handle:async event=>{f.messages.push(event);return {status:'queued'};}},
  state:{load:async()=>({session}),save:async(_,next)=>f.checkpoints.push(next.session.sequence)},
  refreshMetadata:async()=>{},createRest:()=>({}),createManager:options=>{f.options=options;return f.manager;},
  onDispatch:event=>{f.chat.push(event);return onDispatch(event);},log:event=>f.logs.push(event)});
 f.options.updateSessionInfo(0,session);f.dispatch=(t,s)=>f.manager.emit(E.Dispatch,{t,s,d:{guild_id:'100',channel_id:'200',id:'300'}},0);return f;
}
test('nonsettling chat generation does not block source ingestion, checkpoints or Gateway drain',async()=>{
 const f=await setup(()=>new Promise(()=>{}));f.dispatch('MESSAGE_CREATE',2);f.dispatch('MESSAGE_UPDATE',3);f.dispatch('INTERACTION_CREATE',4);
 await f.gateway.drain();assert.deepEqual(f.checkpoints,[2,3,4]);assert.deepEqual(f.messages.map(e=>e.t),['MESSAGE_CREATE','MESSAGE_UPDATE']);
 assert.deepEqual(f.chat.map(e=>e.t),['MESSAGE_CREATE','INTERACTION_CREATE']);assert.notEqual(f.gateway.status().status,'failed');await f.gateway.stop();
});
test('rejected chat handler stays isolated from source ingestion and only emits content-free status',async()=>{
 const f=await setup(async()=>{throw Error('PRIVATE MODEL OUTPUT');});f.dispatch('MESSAGE_CREATE',2);await f.gateway.drain();await new Promise(r=>setImmediate(r));
 assert.deepEqual(f.checkpoints,[2]);assert.equal(f.messages.length,1);assert.notEqual(f.gateway.status().status,'failed');assert.ok(f.logs.some(e=>e.status==='discord_chat_dispatch_failed'));assert.doesNotMatch(JSON.stringify(f.logs),/PRIVATE/);await f.gateway.stop();
});
test('synchronously throwing chat handler stays isolated from durable queue',async()=>{
 const f=await setup(()=>{throw Error('PRIVATE');});f.dispatch('MESSAGE_CREATE',2);await f.gateway.drain();await new Promise(r=>setImmediate(r));assert.deepEqual(f.checkpoints,[2]);assert.notEqual(f.gateway.status().status,'failed');await f.gateway.stop();
});
test('stopped Gateway ignores later chat triggers and source messages',async()=>{
 const f=await setup(async()=>{});await f.gateway.stop();f.dispatch('MESSAGE_CREATE',2);await f.gateway.drain();assert.deepEqual(f.chat,[]);assert.deepEqual(f.messages,[]);assert.deepEqual(f.checkpoints,[]);
});
test('Flock own create and author-bearing edits cannot enter autonomous input queue',async()=>{
 let attempts=0,reads=0;const fail=async()=>{reads++;throw Error('should be ignored before reading sources');};
 const listener=createDiscordEventListener({config:{enabled:true,guildId:'100',ignoredAuthorIds:['300']},store:{getPolicy:fail},inputStore:{enqueue:async()=>{attempts++;}}});
 for(const t of ['MESSAGE_CREATE','MESSAGE_UPDATE'])assert.deepEqual(await listener.handle({t,d:{guild_id:'100',channel_id:'200',id:'400',author:{id:'300',bot:true},content:'synthetic reply'}}),{status:'ignored'});
 assert.equal(reads,0);assert.equal(attempts,0);
});
