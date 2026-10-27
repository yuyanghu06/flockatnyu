import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createAutomationAdapters} from '../server/automation/adapters.js';
import {createAutomationHandler} from '../server/automation/handler.js';
import {readAutomationConfig} from '../server/automation/config.js';

const source=randomUUID(),otherSource=randomUUID(),clock=()=>new Date('2026-10-18T16:00:00Z');
const channel=(id,parent_id=null,type=0)=>({id,guild_id:'100',parent_id,type});
const event=(channelId='200')=>({source:'discord',source_id:source,event_type:'message_created',event_id:'300',revision:'1',received_at:clock().toISOString(),payload:{id:'300',guild_id:'100',channel_id:channelId,author:{id:'400'},content:'At Bobst studying'}});
function fixture({channels=[channel('200')],metadata=channels,hook=()=>{},ready=false}={}) {
 const calls=[],state={policy:{guildId:'100',revision:1,paused:false,discoveryEnabled:true,excludedCategoryIds:[],excludedChannelIds:[]},catalogue:channels.map(c=>({enabled:true,guildId:'100',channelId:c.id,sourceId:source,type:c.type,parentId:c.parent_id})),channels:structuredClone(channels),metadata:structuredClone(metadata)};
 const called=async(kind,args)=>{calls.push(kind);await hook(kind,args,state,calls);};
 const adapters=createAutomationAdapters({env:{ASSISTANT_ALLOWED_SOURCE_IDS:[source,otherSource].join(','),AGENT_GMAIL_SOURCE_ID:source},config:readAutomationConfig({AGENT_AUTOMATION_ENABLED:'true'}),now:clock,
  fetchImpl:async()=>{throw Error('No network allowed');},dependencies:{googleConfig:{configured:true},googleClient:{configured:true},calendarConfig:{configured:ready,calendarId:'fixed'},calendarClient:{configured:ready,preflight:async()=>({status:'ready',calendarId:'fixed',accessRole:'writer'})},miroConfig:{configured:ready,boardIds:['board']},miroStore:{configured:ready,authorizedBoard:async()=>({status:'ready',data:{board_id:'board',source_id:source,team_id:null}})},miroTools:{configured:ready,transport:'mcp',tools:[],prepareBoard:async()=>({status:'ready',boardContext:{format:'synthetic-navigation'}}),execute:async()=>({status:'ready',boardContext:{boards:[{boardId:'board',sourceId:source,teamId:null}]}})},
  discordConfig:{configured:true,guildId:'100'},discordTools:{tools:[]},mapEventService:{configured:false},mapSourceAuthorizer:async()=>false,
  discordStore:{getPolicy:async args=>{await called('policy',args);return {status:'ready',policy:structuredClone(state.policy)};},listSyncChannels:async args=>{await called('catalogue',args);return {status:'ready',channels:structuredClone(state.catalogue)};}},
  discordClient:{getGuildChannels:async args=>{await called('guild',args);return structuredClone(state.metadata);},getChannel:async args=>{await called('channel',args);return structuredClone(state.channels.find(c=>c.id===args.channelId));}},
 }});
 return {adapters,state,calls,authorize:(events,signal)=>adapters.authorizeEvents({events,principal:adapters.principal,signal})};
}

// Worker source authorization reads only the saved policy/catalogue. Provider
// permissions and native content are checked by their separately selected tools.
test('same-channel and multi-channel batches share one saved authorization pair per fresh call',async()=>{
 for(const count of [1,20]){
  const channels=Array.from({length:count},(_,i)=>channel(String(200+i))),f=fixture({channels});
  const events=channels.map(c=>event(c.id));assert.equal(await f.authorize(events),true);
  assert.deepEqual(f.calls,['policy','catalogue']);assert.equal(await f.authorize(events),true);
  assert.deepEqual(f.calls,['policy','catalogue','policy','catalogue']);
 }
});
test('batch preparation preserves originals and does not dispatch provider reads',async()=>{
 const f=fixture({ready:true}),inputs=Array.from({length:20},(_,i)=>({uuid:randomUUID(),raw_response:{...event(),event_id:String(300+i),payload:{...event().payload,id:String(300+i)}}}));
 const before=structuredClone(inputs),result=await f.adapters.prepareBatch({inputs,principal:f.adapters.principal});
 assert.equal(result.status,'ready');assert.deepEqual(f.calls,['policy','catalogue']);assert.deepEqual(inputs,before);f.adapters.cleanupBatch();
});
test('saved thread ancestry enforces parent and category exclusions without fetching Discord',async()=>{
 const category=channel('800',null,4),parent=channel('700','800'),threads=[channel('201','700',11),channel('202','700',12)],f=fixture({channels:[category,parent,...threads]});
 assert.equal(await f.authorize(threads.map(c=>event(c.id))),true);
 f.state.policy.excludedChannelIds=['700'];assert.equal(await f.authorize(threads.map(c=>event(c.id))),false);
 f.state.policy.excludedChannelIds=[];f.state.policy.excludedCategoryIds=['800'];assert.equal(await f.authorize(threads.map(c=>event(c.id))),false);
 assert(!f.calls.some(k=>k==='guild'||k==='channel'));
});
test('every input retains exact guild, source and event-type binding, including repeated channels',async()=>{
 for(const patch of [{source_id:otherSource},{source_id:randomUUID()},{source:'drive'},{event_type:'unknown'},{payload:{guild_id:'999',channel_id:'200'}},{payload:{guild_id:'100',channel_id:'999'}}]){
  const f=fixture();assert.equal(await f.authorize([event(),{...event(),...patch}]),false);
 }
 const f=fixture();assert.equal(await f.adapters.authorizeEvents({events:[event()],principal:{...f.adapters.principal}}),false);
 for(const events of [[],null,Array.from({length:21},()=>event()),[null]])assert.equal(await f.authorize(events),false);
 assert.equal(await f.authorize([{...event(),source:'gmail',event_type:'email_received_metadata'}]),true);assert.equal(f.calls.length,0);
});
test('the next authorization call observes catalogue withdrawal, disable, rebinding, blacklist and pause',async()=>{
 for(const change of [s=>{s.catalogue=[];},s=>{s.catalogue[0].enabled=false;},s=>{s.catalogue[0].sourceId=otherSource;},s=>{s.policy.excludedChannelIds=['200'];},s=>{s.policy.paused=true;}]){
  const f=fixture();assert.equal(await f.authorize([event()]),true);change(f.state);assert.equal(await f.authorize([event()]),false);
 }
});
test('saved-policy failures and cancellation fail closed without touching a provider',async()=>{
 for(const kind of ['policy','catalogue']){
  const f=fixture({hook:async k=>{if(k===kind)throw Error('saved policy unavailable');}});assert.equal(await f.authorize([event()]),false);
 }
 const controller=new AbortController(),f=fixture({hook:async kind=>{if(kind==='policy')controller.abort();}});
 assert.equal(await f.authorize([event()],controller.signal),false);assert(!f.calls.some(k=>k==='guild'||k==='channel'));
 const before=f.calls.length;assert.equal(await f.authorize([event()],controller.signal),false);assert.equal(f.calls.length,before);
});

function handlerFixture({authorizeEvents,authorizeEvent,providerTurn,onAction,signal}={}) {
 const inputs=Array.from({length:20},()=>({uuid:randomUUID(),raw_response:event()})),counts={model:0,writes:0,finish:0,reservations:0,releases:0},principal={id:'fixture'};
 const store={configured:true,claim:async()=>({status:'ready',leaseToken:randomUUID(),inputs}),renew:async()=>({status:'ready'}),release:async()=>{counts.releases++;return {status:'ready'};},action:async({complete})=>{if(!complete){counts.reservations++;await onAction?.();}return {status:complete?'completed':'execute'};},finish:async()=>{counts.finish++;return {status:'ready'};}};
 const provider={toolTurn:async request=>{counts.model++;return providerTurn?providerTurn({inputs,request,counts}):{stopReason:'tool_calls',toolCalls:[{id:'done',name:'finish_batch',arguments:{handledInputIds:inputs.map(r=>r.uuid)}}]};}};
 const tools=[{name:'save',description:'inert test action',idempotent:true,parameters:{type:'object',properties:{},additionalProperties:false},execute:async()=>{counts.writes++;return {status:'ready'};}}];
 const handler=createAutomationHandler({store,provider,principal,tools,authorizeEvents,authorizeEvent,config:readAutomationConfig({AGENT_AUTOMATION_ENABLED:'true'}),now:clock});
 return {inputs,counts,principal,run:()=>handler.tick({signal})};
}
test('handler batches at every existing boundary and passes isolated original events',async()=>{
 let batchCalls=0,singleCalls=0;
 const f=handlerFixture({authorizeEvent:async()=>{singleCalls++;return true;},authorizeEvents:async({events,principal})=>{batchCalls++;assert.equal(principal,f.principal);assert.equal(events.length,20);assert.equal(events[0].payload.content,'At Bobst studying');events[0].payload.content='changed auth copy';return true;}});
 assert.equal((await f.run()).status,'completed');assert.equal(batchCalls,3);assert.equal(singleCalls,0);assert.equal(f.inputs[0].raw_response.payload.content,'At Bobst studying');
 const legacy=handlerFixture({authorizeEvent:async()=>{singleCalls++;return true;}});assert.equal((await legacy.run()).status,'completed');assert.equal(singleCalls,60);
});
test('revocation before initial/model/post-reservation mutation boundary prevents writes and finish',async()=>{
 for(const revokeAt of [1,2,3]){
  let n=0;const f=handlerFixture({authorizeEvents:async()=>++n<revokeAt,providerTurn:async({inputs})=>({stopReason:'tool_calls',toolCalls:[{id:'save1',name:'save',arguments:{inputIds:[inputs[0].uuid],arguments:{}}}]})});
  assert.equal((await f.run()).status,'forbidden');assert.equal(f.counts.writes,0);assert.equal(f.counts.finish,0);assert.equal(n,revokeAt);assert.equal(f.counts.releases,1);
 }
});
test('fresh real adapter rechecks after model and after action reservation prevent mutation',async()=>{
 for(const when of ['model','reservation']){
  const a=fixture();let f;
  const revoke=()=>{a.state.catalogue[0].sourceId=otherSource;};
  f=handlerFixture({authorizeEvents:({events,signal})=>a.authorize(events,signal),onAction:when==='reservation'?revoke:undefined,providerTurn:async({inputs})=>{if(when==='model')revoke();return {stopReason:'tool_calls',toolCalls:[{id:'save1',name:'save',arguments:{inputIds:[inputs[0].uuid],arguments:{}}}]};}});
  assert.equal((await f.run()).status,'forbidden');assert.equal(f.counts.writes,0);assert.equal(f.counts.finish,0);
 }
});
test('batch authorization non-boolean results do not fall back to permissive single-event checks',async()=>{
 for(const response of [undefined,{},[true],{authorized:true},1]){
  let legacy=0;const f=handlerFixture({authorizeEvents:async()=>response,authorizeEvent:async()=>{legacy++;return true;}});
  assert.equal((await f.run()).status,'forbidden');assert.equal(legacy,0);assert.equal(f.counts.model,0);assert.equal(f.counts.writes,0);
 }
});


test('local task reads, fragments and bookkeeping skip provider rechecks while the next model boundary still enforces revocation',async()=>{
 const input={uuid:randomUUID(),raw_response:event()},principal={id:'cache-fixture'};
 let revoked=false,authorizations=0,modelCalls=0,renewals=0,finished=0;const executed=[];
 const names=['read_pending_task','read_context_fragment','defer_task'];
 const tools=names.map(name=>({name,description:'Existing leased local context',...(name==='defer_task'?{idempotent:true}:{readOnly:true}),parameters:{type:'object',properties:{},additionalProperties:false},execute:async(_args,context)=>{
  assert.equal(context.principal,principal);assert.deepEqual(context.inputIds,[input.uuid]);assert(!context.signal.aborted);executed.push(name);return {status:'ready'};
 }}));
 const store={configured:true,claim:async()=>({status:'ready',leaseToken:randomUUID(),inputs:[input]}),renew:async()=>{renewals++;return {status:'ready'};},action:async({complete})=>({status:complete?'completed':'execute'}),release:async()=>({status:'ready'}),finish:async()=>{finished++;return {status:'ready'};}};
 const handler=createAutomationHandler({store,principal,tools,authorizeEvents:async()=>{authorizations++;return !revoked;},provider:{toolTurn:async()=>{modelCalls++;revoked=true;return {stopReason:'tool_calls',toolCalls:names.map((name,i)=>({id:'local_'+i,name,arguments:{inputIds:[input.uuid],arguments:{}}}))};}},config:readAutomationConfig({AGENT_AUTOMATION_ENABLED:'true'}),now:clock});
 assert.equal((await handler.tick()).status,'forbidden');assert.deepEqual(executed,names);assert.equal(modelCalls,1);assert.equal(finished,0);assert.equal(authorizations,3,'Initial claim, initial model, then revoked next model; no provider check for three local operations');assert(renewals>=4,'Local operations still renew the lease before dispatch');
});
