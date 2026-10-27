import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createAutomationAdapters} from '../server/automation/adapters.js';
import {createAutomationHandler} from '../server/automation/handler.js';
import {createEventUpdater} from '../server/automation/events.js';
import {readAutomationConfig} from '../server/automation/config.js';
import {MAP_RECORD_EXAMPLES} from '../server/map/contracts.js';

const miroId='10000000-0000-4000-8000-000000000001';
const newId='20000000-0000-4000-8000-000000000002';
const oldId='30000000-0000-4000-8000-000000000003';
const gmailId='40000000-0000-4000-8000-000000000004';
const calendarId='50000000-0000-4000-8000-000000000005';
const unrelatedId='60000000-0000-4000-8000-000000000006';
const config=readAutomationConfig({AGENT_AUTOMATION_ENABLED:'true'});
const now=()=>new Date('2026-10-22T12:00:00Z');
const url='https://discord.com/channels/100/200/300';
const input=()=>({uuid:randomUUID(),raw_response:{source:'discord',source_id:newId,event_type:'message_created',event_id:'300',revision:'1',received_at:now().toISOString(),payload:{id:'300',guild_id:'100',channel_id:'200',author:{id:'400'},content:'At Bobst studying'}}});

function fixture({gmail=false}={}) {
  const policy={guildId:'100',revision:1,paused:false,discoveryEnabled:true,excludedCategoryIds:[],excludedChannelIds:[]};
  const channel={id:'200',guild_id:'100',type:0,parent_id:null};
  const state={channels:[],outage:false,denied:false,policyReads:0,lookups:0,writes:0};
  const staticIds=[miroId,oldId,calendarId,unrelatedId,...(gmail?[gmailId]:[])];
  const a=createAutomationAdapters({env:{ASSISTANT_ALLOWED_SOURCE_IDS:staticIds.join(','),AGENT_GMAIL_SOURCE_ID:gmailId,AGENT_CALENDAR_SOURCE_ID:calendarId},config,now,
    fetchImpl:async()=>{throw Error('Unexpected network');},dependencies:{
      googleConfig:{configured:true},googleClient:{configured:true},
      calendarConfig:{configured:true,calendarId:'fixed'},calendarClient:{configured:true,calendarId:'fixed',preflight:async()=>({status:'ready',calendarId:'fixed',accessRole:'writer'}),listEvents:async()=>({status:'ready',events:[],coverage:{complete:true}})},
      miroConfig:{configured:true,boardIds:['board']},miroStore:{configured:true,authorizedBoard:async()=>({status:'ready',data:{board_id:'board',source_id:miroId}})},
      miroTools:{configured:true,transport:'mcp',tools:[],prepareBoard:async()=>({status:'ready',boardContext:{}}),execute:async()=>({status:'ready',boardContext:{boards:[{boardId:'board',sourceId:miroId}]}})},
      discordConfig:{configured:true,guildId:'100'},discordStore:{getPolicy:async()=>{state.policyReads++;return state.outage?{status:'unavailable'}:{status:'ready',policy:structuredClone(policy)};},listSyncChannels:async()=>state.outage?{status:'unavailable'}:{status:'ready',channels:structuredClone(state.channels)}},
      discordClient:{getGuildChannels:async()=>[channel],getChannel:async()=>{if(state.denied)throw Error('permission_denied');return channel;}},discordTools:{tools:[]},
      mapSourceAuthorizer:async({principal,sourceId})=>principal.allowedSourceIds.includes(sourceId)&&!state.denied&&!policy.paused&&!policy.excludedChannelIds.includes('200'),
      mapEventService:{configured:true,lookup:async()=>{state.lookups++;return {status:'ok',person:{id:MAP_RECORD_EXAMPLES.people[0].person_id}};},upsert:async()=>{state.writes++;return {status:'applied'};}},
    }});
  const discover=()=>{state.channels=[{guildId:'100',channelId:'200',sourceId:newId,enabled:true,policyRevision:policy.revision}];};
  return {a,state,policy,discover,staticIds};
}

function runtime(f,{provider,onClaim}={}) {
  const claims=[],queue=[],finishes=[];
  const store={configured:true,requiresScopedClaims:true,
    claim:async({allowedSourceIds,signal})=>{assert(!signal.aborted);claims.push([...allowedSourceIds]);onClaim?.();const inputs=queue.filter(row=>allowedSourceIds.includes(row.raw_response.source_id));return inputs.length?{status:'ready',inputs,leaseToken:randomUUID()}:{status:'empty'};},
    renew:async()=>({status:'ready'}),action:async({complete})=>({status:complete?'completed':'execute'}),release:async()=>({status:'ready'}),
    finish:async({handledInputIds})=>{finishes.push(...handledInputIds);return {status:'ready'};},
  };
  const handler=createAutomationHandler({...f.a,store,provider:provider||{toolTurn:async()=>{throw Error('Unexpected model');}},config,now});
  return {handler,claims,queue,finishes};
}

test('newly discovered source absent from environment reaches scoped claim, exact identity lookup, map write and finish',async()=>{
  const f=fixture(),before=f.a.principal.allowedSourceIds;
  assert(Object.isFrozen(f.a.principal));assert(Object.isFrozen(before));assert(!before.includes(newId));
  const queued=input();let turns=0;
  const r=runtime(f,{provider:{toolTurn:async()=>{
    turns++;assert(f.a.principal.allowedSourceIds.includes(newId));
    const args=turns===1?{provider:'discord',providerUserId:'400',sourceId:newId,sourceUrl:url}:turns===3?{timeMin:'2026-10-21T12:00:00Z',timeMax:'2026-10-30T12:00:00Z'}:
      {event:{...MAP_RECORD_EXAMPLES.event,source_id:newId,source_url:url,source_record_id:'300'},buildings:structuredClone(MAP_RECORD_EXAMPLES.buildings),people:MAP_RECORD_EXAMPLES.people.map(person=>({...person,source_id:newId,source_url:url}))};
    return {stopReason:'tool_calls',toolCalls:[turns===4?{id:'done',name:'finish_batch',arguments:{handledInputIds:[queued.uuid]}}:
      {id:'step_'+turns,name:turns===1?'lookup_map_person':turns===3?'list_calendar_events':'upsert_map_event',arguments:{inputIds:[queued.uuid],arguments:args}}]};
  }}});
  assert.equal((await r.handler.tick()).status,'empty');assert.deepEqual(r.claims,[[]]);
  f.discover();r.queue.push(queued);
  assert.equal((await r.handler.tick()).status,'completed');assert.deepEqual(r.claims,[[],[newId]]);
  assert.equal(f.state.lookups,1);assert.equal(f.state.writes,1);assert.deepEqual(r.finishes,[queued.uuid]);
  assert.equal(before.includes(newId),false);assert(Object.isFrozen(f.a.principal.allowedSourceIds));
  for(const id of f.staticIds)assert(f.a.principal.allowedSourceIds.includes(id));
});

test('fresh hook grants change every tick and obsolete static Discord IDs are never claim authority',async()=>{
  const f=fixture({gmail:true}),r=runtime(f);f.discover();
  await r.handler.tick();assert.deepEqual(new Set(r.claims[0]),new Set([newId,gmailId]));
  f.state.channels[0].enabled=false;
  await r.handler.tick();assert.deepEqual(r.claims[1],[gmailId]);assert(!f.a.principal.allowedSourceIds.includes(newId));
  f.state.channels=[];f.policy.paused=true;
  await r.handler.tick();assert.deepEqual(r.claims[2],[gmailId]);
  f.policy.paused=false;f.policy.discoveryEnabled=false;
  await r.handler.tick();assert.deepEqual(r.claims[3],[gmailId]);
  assert.equal(f.state.policyReads,4);assert(!r.claims.flat().includes(oldId));
});

test('catalogue outages fail closed for Discord and preserve only explicitly granted Gmail claims',async()=>{
  for(const gmail of [false,true]) {
    const f=fixture({gmail}),r=runtime(f);f.discover();await r.handler.tick();
    assert(f.a.principal.allowedSourceIds.includes(newId));f.state.outage=true;
    const result=await r.handler.tick();assert.equal(result.status,'empty');
    assert(!f.a.principal.allowedSourceIds.includes(newId));
    assert.equal(r.claims.length,2);assert.deepEqual(r.claims[1],gmail?[gmailId]:[]);
    for(const id of f.staticIds)assert(f.a.principal.allowedSourceIds.includes(id));
  }
});

test('fresh published same-guild binding authorizes enqueue before the first tick; foreign and forged bindings cannot',async()=>{
  const f=fixture();f.discover();await f.a.resolveClaimSourceIds({principal:f.a.principal});let queued=0;
  const updater=createEventUpdater({...f.a,config,now,store:{enqueue:async()=>{queued++;return {status:'queued'};}}});
  const event={source:'discord',sourceId:newId,eventType:'message_created',eventId:'300',revision:'1',payload:input().raw_response.payload};
  assert.equal((await updater.enqueue(event)).status,'queued');assert.equal(queued,1);assert(f.a.principal.allowedSourceIds.includes(newId));
  for(const patch of [{sourceId:oldId},{payload:{...event.payload,guild_id:'999'}},{payload:{...event.payload,channel_id:'201'}}])
    assert.equal((await updater.enqueue({...event,...patch})).status,'forbidden');
  f.state.channels[0].guildId='999';assert.equal((await updater.enqueue(event)).status,'forbidden');assert.equal(queued,1);
});

test('published blacklist and manual disable after claim prevent every model and action',async()=>{
  for(const revoke of [f=>{f.policy.excludedChannelIds=['200'];},f=>{f.state.channels[0].enabled=false;}]) {
    const f=fixture();f.discover();let models=0;
    const r=runtime(f,{onClaim:()=>revoke(f),provider:{toolTurn:async()=>{models++;throw Error('Unexpected model');}}});r.queue.push(input());
    assert.equal((await r.handler.tick()).status,'forbidden');assert.equal(models,0);assert.equal(f.state.writes,0);assert.equal(r.finishes.length,0);
  }
});

test('trusted hook validates bounded unique UUIDs, supports empty scope and runs under cancellation',async()=>{
  const tool={name:'read_context',description:'Read',readOnly:true,parameters:{type:'object',properties:{},additionalProperties:false},execute:async()=>({status:'ready'})};
  for(const ids of [undefined,null,'bad',['bad'],[newId,newId],Array.from({length:501},()=>randomUUID()),[]]) {
    let claims=0;
    const handler=createAutomationHandler({config,principal:{id:'service'},tools:[tool],authorizeEvent:async()=>true,resolveClaimSourceIds:async()=>ids,
      store:{configured:true,requiresScopedClaims:true,claim:async()=>{claims++;return {status:'empty'};}},provider:{toolTurn:async()=>{throw Error('Unexpected model');}}});
    assert.equal((await handler.tick()).status,Array.isArray(ids)&&ids.length===0?'empty':'not_configured');assert.equal(claims,Array.isArray(ids)&&ids.length===0?1:0);
  }
  const controller=new AbortController();let claims=0,entered;
  const started=new Promise(resolve=>{entered=resolve;});
  const handler=createAutomationHandler({config,principal:{id:'service'},tools:[tool],authorizeEvent:async()=>true,
    resolveClaimSourceIds:async({signal})=>{entered();assert(!signal.aborted);return new Promise(()=>{});},
    store:{configured:true,requiresScopedClaims:true,claim:async()=>{claims++;return {status:'empty'};}},provider:{toolTurn:async()=>{throw Error('Unexpected model');}}});
  const pending=handler.tick({signal:controller.signal});await started;controller.abort();assert.equal((await pending).status,'aborted');assert.equal(claims,0);
});
