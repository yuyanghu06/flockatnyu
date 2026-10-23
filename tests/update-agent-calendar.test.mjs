import {calendarEventReceipt} from '../server/google/calendar-receipt.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createAutomationHandler} from '../server/automation/handler.js';
import {readAutomationConfig} from '../server/automation/config.js';
import {createBoundedResults} from '../server/automation/bounded-result.js';

const sourceId='10000000-0000-4000-8000-000000000001';
const clock=()=>new Date('2026-10-17T21:00:00Z');
const enabled=()=>readAutomationConfig({AGENT_AUTOMATION_ENABLED:'true'});
const row=()=>({uuid:randomUUID(),raw_response:{source:'gmail',source_id:sourceId,event_type:'email_received_metadata',event_id:'abc123',revision:'1',received_at:clock().toISOString(),payload:{messageId:'abc123'}}});
function handlerHarness({prepareBatch,claimStatus='ready',providerTurn,adapters={}}={}) {
 const input=row(),events=[];let preparations=0,finished=false,turns=0;
 const tool={name:'read_safe',description:'Read context',readOnly:true,parameters:{type:'object',properties:{},additionalProperties:false},execute:async()=>({status:'ready'})};
 const store={configured:true,claim:async()=>{events.push('claim');return claimStatus==='ready'?{status:'ready',leaseToken:randomUUID(),inputs:[input]}:{status:claimStatus};},renew:async()=>({status:'ready'}),finish:async()=>{finished=true;events.push('finish');return {status:'ready'};},release:async()=>{events.push('release');return {status:'ready'};},action:async({complete}={})=>({status:complete?'completed':'execute'})};
 const defaultPrep=async()=>{events.push('prepare');return {status:'ready',generation:++preparations};};
 const handler=createAutomationHandler({store,config:enabled(),principal:{id:'update-service'},now:clock,authorizeEvent:async()=>true,tools:[tool],prepareBatch:prepareBatch===undefined?defaultPrep:async args=>{events.push('prepare');preparations++;return prepareBatch(args);},cleanupBatch:async()=>events.push('cleanup'),provider:{toolTurn:async request=>{events.push('model');turns++;if(providerTurn)return providerTurn(request,input);return {stopReason:'tool_calls',toolCalls:[{id:'finish_'+turns,name:'finish_batch',arguments:{handledInputIds:[input.uuid]}}]};}},...adapters});
 return {handler,input,events,finished:()=>finished,preparations:()=>preparations};
}

test('No eligible queue claim means no preparation or model invocation',async()=>{
 for(const claimStatus of ['empty','waiting','busy','cooldown']){
  const h=handlerHarness({claimStatus});assert.equal((await h.handler.tick()).status,claimStatus);assert(!h.events.includes('prepare'));assert(!h.events.includes('model'));assert(!h.finished());
 }
});

test('Each eligible run prepares fresh batch context before model and expires it',async()=>{
 let generation=0;const h=handlerHarness({prepareBatch:async()=>({status:'ready',generation:++generation}),providerTurn:(request,input)=>{
  const payload=JSON.parse(request.messages[0].content);assert.equal(payload.batchContext.generation,generation);
  assert.match(request.system,/untrusted evidence/);assert.doesNotMatch(request.system,/reconcile Miro|read_miro_/i);assert.match(request.system,/calendar/i);assert.match(request.system,/cancel/i);
  return {stopReason:'tool_calls',toolCalls:[{id:'done_'+generation,name:'finish_batch',arguments:{handledInputIds:[input.uuid]}}]};
 }});
 assert.equal((await h.handler.tick()).status,'completed');assert.equal((await h.handler.tick()).status,'completed');assert.equal(generation,2);
 assert(h.events.indexOf('prepare')<h.events.indexOf('model'));assert.equal(h.events.filter(e=>e==='cleanup').length,2);
});

test('Failed, malformed, or oversized batch preparation preserves inputs without model or Calendar writes',async()=>{
 for(const prepareBatch of [async()=>{throw Error('synthetic-private-error');},async()=>({status:'unavailable'}),async()=>null,async()=>({status:'ready',huge:'界'.repeat(30000)})]){
  const h=handlerHarness({prepareBatch});const result=await h.handler.tick();assert.notEqual(result.status,'completed');assert(!JSON.stringify(result).includes('private'));assert(!h.events.includes('model'));assert(!h.finished());assert(h.events.includes('release'));
 }
});

test('A concurrent tick does not prepare a second batch while the first model run is busy',async()=>{
 let resume;const h=handlerHarness({prepareBatch:async()=>({status:'ready'}),providerTurn:()=>new Promise(resolve=>{resume=resolve;})});
 const first=h.handler.tick();while(!resume)await new Promise(resolve=>setTimeout(resolve,0));assert.equal((await h.handler.tick()).status,'busy');assert.equal(h.preparations(),1);resume({stopReason:'stop',toolCalls:[]});assert.equal((await first).status,'incomplete_batch');
});

test('UTF-8 bounded result fragments preserve original status, complete content, continuation and expiry',async()=>{
 const b=createBoundedResults();
 const original={status:'ready',sourceStatus:'partial',coverage:{complete:false,reason:'incomplete_pagination'},boardContext:{text:'🗽界\\\"\n'.repeat(7000),nextCursor:'next_page'}};
 let fragment=b.bound(original),raw='',offset=0,count=0;
 do {
  assert(Buffer.byteLength(JSON.stringify(fragment))<=16384);assert.equal(fragment.sourceStatus,'partial');assert.equal(fragment.coverage.complete,false);assert.equal(fragment.coverage.sourceCoverage.reason,'incomplete_pagination');assert.equal(fragment.fragment.offset,offset);
  raw+=fragment.fragment.data;offset=fragment.fragment.nextOffset;count++;
  if(offset!==null)fragment=await b.tool.execute({id:fragment.fragment.id,offset});
 }while(offset!==null);
 assert(count>1);assert.deepEqual(JSON.parse(raw),original);
 const id=fragment.fragment.id;b.clear();assert.equal((await b.tool.execute({id,offset:0})).status,'invalid_request');
});

async function adapterFixture({calendarStatus='ready',discordPatch={},envPatch={}}={}) {
 const {createAutomationAdapters}=await import('../server/automation/adapters.js');
 const calls=[];let writes=0;
 const calendarClient={configured:true,calendarId:'fixture@group.calendar.google.com',preflight:async()=>{calls.push('calendar-preflight');return {status:calendarStatus,calendarId:'fixture@group.calendar.google.com',accessRole:'writer'};},upsertEvent:async args=>{writes++;calls.push({kind:'write',args});return {status:'ready',...calendarEventReceipt({id:'fixture_event',summary:args.title,start:args.start,end:args.end},{calendarId:'fixture@group.calendar.google.com',outcome:'created'})};},cancelEvent:async()=>{writes++;return {status:'ready',...calendarEventReceipt({id:'fixture_event',status:'cancelled'},{calendarId:'fixture@group.calendar.google.com',outcome:'cancelled'})};},listEvents:async()=>({status:'ready',events:[]}),readEvent:async()=>({status:'ready',events:[]})};
 const policy={guildId:'100',revision:1,paused:false,discoveryEnabled:true,excludedCategoryIds:[],excludedChannelIds:[]};
 const channel={id:'200',guild_id:'100',parent_id:null,type:0};
 const discordConfig={configured:true,guildId:'100'};
 const discordStore={getPolicy:async()=>({status:'ready',policy:{...policy,...discordPatch.policy}}),listSyncChannels:async()=>({status:'ready',channels:[{enabled:true,guildId:'100',channelId:'200',sourceId,...discordPatch.channel}]})};
 const discordClient={getGuildChannels:async()=>[channel],getChannel:async()=>({...channel,...discordPatch.liveChannel})};
 const env={ASSISTANT_ALLOWED_SOURCE_IDS:sourceId,AGENT_GMAIL_SOURCE_ID:sourceId,...envPatch};
 const adapters=createAutomationAdapters({env,config:enabled(),now:clock,fetchImpl:async()=>{throw Error('No unmocked network allowed');},dependencies:{googleConfig:{configured:true},googleClient:{configured:true},calendarConfig:{configured:true,calendarId:calendarClient.calendarId},calendarClient,discordConfig,discordStore,discordClient,discordTools:{tools:[],execute:async()=>({status:'ready'})}}});
 return {adapters,calls,writes:()=>writes};
}

test('saved-policy authorizer enforces input scope while explicit Discord tools own live provider checks',async()=>{
 const f=await adapterFixture(),a=f.adapters,authorize=event=>a.authorizeEvent({event,principal:a.principal});
 assert.equal(await authorize(row().raw_response),true);
 for(const event of [{...row().raw_response,source_id:randomUUID()},{...row().raw_response,event_type:'email_deleted'},{...row().raw_response,source:'drive'}])assert.equal(await authorize(event),false);
 const event={source:'discord',source_id:sourceId,event_type:'message_created',payload:{guild_id:'100',channel_id:'200'}};assert.equal(await authorize(event),true);
 for(const patch of [{policy:{paused:true}},{policy:{excludedChannelIds:['200']}},{channel:{enabled:false}},{channel:{sourceId:randomUUID()}}]){
  const denied=await adapterFixture({discordPatch:patch});assert.equal(await denied.adapters.authorizeEvent({event,principal:denied.adapters.principal}),false);
 }
 const liveOnlyChange=await adapterFixture({discordPatch:{liveChannel:{guild_id:'999'}}});assert.equal(await liveOnlyChange.adapters.authorizeEvent({event,principal:liveOnlyChange.adapters.principal}),true,'Unrelated per-tool authorization uses saved DB policy, not a hidden provider read');
 assert.equal(await authorize({...event,payload:{...event.payload,guild_id:'999'}}),false);assert.equal(await authorize({...event,payload:{...event.payload,channel_id:'999'}}),false);
 const revoked=await adapterFixture({envPatch:{AGENT_GMAIL_SOURCE_ID:randomUUID()}});assert.equal(await revoked.adapters.authorizeEvent({event:row().raw_response,principal:revoked.adapters.principal}),false);
});
