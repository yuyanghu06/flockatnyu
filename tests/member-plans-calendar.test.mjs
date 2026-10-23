import test from 'node:test';
import assert from 'node:assert/strict';
import {createCalendarClient} from '../server/google/calendar-client.js';
import {readMemberPlansConfig,CALENDAR_REQUIRED_SCOPES} from '../server/google/calendar-config.js';
import {encodeMemberPlan,decodeMemberPlan,createMemberPlansTools} from '../server/automation/member-plans.js';
const calendarId='members@group.calendar.google.com',sourceId='11111111-1111-4111-8111-111111111111',memberSource='22222222-2222-4222-8222-222222222222';
const receipt={sourceId,sourceUrl:'https://discord.com/channels/1/2/3',provider:'discord',providerUserId:'4',personId:'33333333-3333-4333-8333-333333333333',reportedAt:'2026-10-20T14:00:00Z',label:'Studying'};
const signingKey='synthetic-signing-key-32-chars-123456';
const env={GOOGLE_CLIENT_ID:'client',GOOGLE_CLIENT_SECRET:'secret',GOOGLE_REFRESH_TOKEN:'refresh',GOOGLE_EXPECTED_ACCOUNT_EMAIL:'club@example.com',GOOGLE_CALENDAR_ID:'club@group.calendar.google.com',AGENT_CALENDAR_SOURCE_ID:sourceId,GOOGLE_MEMBER_PLANS_CALENDAR_ID:calendarId,AGENT_MEMBER_PLANS_SOURCE_ID:memberSource,AGENT_MEMBER_PLANS_SIGNING_KEY:signingKey};
const principal={id:'worker',calendarAccess:true,calendarId,allowedSourceIds:[sourceId,memberSource],calendarSources:[{provider:'discord',sourceId,guildId:'1',channelId:'2',messageId:'3'}],memberPlanReceipts:[receipt]};
function fixture(){
 const events=new Map(),writes=[];
 const oauth={setCredentials:()=>{},getAccessToken:async()=>({token:'access'}),getTokenInfo:async()=>({scopes:CALENDAR_REQUIRED_SCOPES})};
 const fetchImpl=async(value,options)=>{
  const url=new URL(value);if(url.hostname==='gmail.googleapis.com')return Response.json({emailAddress:'club@example.com'});
  if(url.pathname.includes('/calendarList/'))return Response.json({id:calendarId,accessRole:'owner'});
  const id=url.pathname.split('/events/')[1];
  if(options.method==='GET')return id?events.has(id)?Response.json(events.get(id)):Response.json({}, {status:404}):Response.json({items:[...events.values()]});
  const body=JSON.parse(options.body),key=id||body.id;assert(!body.attendees);assert(!body.recurrence);assert.equal(url.searchParams.get('sendUpdates'),'none');
  const saved={...events.get(key),...body,id:key,etag:'"'+(writes.length+1)+'"',created:'2026-10-20T14:00:00Z',updated:'2026-10-20T14:00:00Z'};
  events.set(key,saved);writes.push(body);return Response.json(saved);
 };
 const client=createCalendarClient({config:readMemberPlansConfig(env),oauthClient:oauth,fetchImpl});
 const args={sourceKey:'discord:1:2:3',sourceUrl:receipt.sourceUrl,title:'Studying',location:'Bobst',activityKind:'presence',typeId:'study',trustedParticipation:receipt,principal};
 return {client,args,events,writes};
}
test('Member Plans target is separate, pinned, explicitly sourced and requires signing key',()=>{
 assert.equal(readMemberPlansConfig(env).configured,true);
 for(const patch of [{GOOGLE_MEMBER_PLANS_CALENDAR_ID:env.GOOGLE_CALENDAR_ID},{AGENT_MEMBER_PLANS_SOURCE_ID:sourceId},{AGENT_MEMBER_PLANS_SIGNING_KEY:''},{GOOGLE_MEMBER_PLANS_CALENDAR_ID:'primary'}])assert.equal(readMemberPlansConfig({...env,...patch}).configured,false);
});
test('private metadata is authenticated to calendar/source and tampering cannot grant identities',()=>{
 const args={participation:receipt,activityKind:'presence',typeId:'study',calendarId,eventId:'event001',sourceHash:'a'.repeat(64),signingKey};
 const privateData={...encodeMemberPlan(args),updateAgentSource:args.sourceHash};
 const event={id:'event001',extendedProperties:{private:privateData}};
 assert.equal(decodeMemberPlan(event,{calendarId,signingKey}).participation.personId,receipt.personId);
 for(const patch of [{memberPlan:privateData.memberPlan.replace(receipt.personId,sourceId)},{updateAgentSource:'b'.repeat(64)},{memberPlanSignature:'0'.repeat(64)}])assert.equal(decodeMemberPlan({id:'event001',extendedProperties:{private:{...privateData,...patch}}},{calendarId,signingKey}),null);
 assert.equal(decodeMemberPlan(event,{calendarId:'other@group.calendar.google.com',signingKey}),null);
 assert.equal(decodeMemberPlan({...event,id:'copied_event'},{calendarId,signingKey}),null);
});
test('presence is written to Calendar with original timestamp and two-hour expiry; replay does not reset it',async()=>{
 const f=fixture(),first=await f.client.upsertMemberPlan(f.args);assert.equal(first.status,'ready');
 assert.equal(f.writes[0].start.dateTime,'2026-10-20T14:00:00.000Z');assert.equal(f.writes[0].end.dateTime,'2026-10-20T16:00:00.000Z');
 const read=await f.client.readEvent({eventId:first.eventId,principal});assert.equal(read.events[0].memberPlan.participation.personId,receipt.personId);
 assert.equal((await f.client.upsertMemberPlan(f.args)).outcome,'unchanged');assert.equal(f.writes.length,1);
 assert.equal((await f.client.cancelMemberPlan(f.args)).outcome,'cancelled');assert.equal((await f.client.cancelMemberPlan(f.args)).outcome,'unchanged');
});
test('personal plans require start, preserve explicit end on edits, reject identity forgery and human edits',async()=>{
 const f=fixture();assert.equal((await f.client.upsertMemberPlan({...f.args,activityKind:'personal_plan'})).status,'invalid_request');
 const args={...f.args,activityKind:'personal_plan',start:{dateTime:'2026-10-25T15:00:00Z',timeZone:'America/New_York'},end:{dateTime:'2026-10-25T20:00:00Z',timeZone:'America/New_York'}};
 const created=await f.client.upsertMemberPlan(args);assert.equal(created.status,'ready');
 assert.equal((await f.client.upsertMemberPlan({...f.args,activityKind:'personal_plan',title:'Updated study plan'})).status,'ready');assert.equal(f.writes.at(-1).end.dateTime,'2026-10-25T20:00:00.000Z');
 assert.equal((await f.client.upsertMemberPlan({...f.args,trustedParticipation:{...receipt,personId:sourceId}})).status,'forbidden_source');
 f.events.get(created.eventId).extendedProperties.private.memberPlan+=' ';assert.equal((await f.client.upsertMemberPlan(f.args)).status,'human_modified');
});
test('helper reauthorizes receipt and source before minting derived per-action principal',async()=>{
 let allowed=false,calls=0;const client={configured:true,calendarId,upsertMemberPlan:async args=>{calls++;assert.deepEqual(args.principal.memberPlanReceipts,[receipt]);return {status:'ready'};}};
 const helper=createMemberPlansTools({client,sourceId:memberSource,authorizeParticipation:async()=>allowed});
 assert.equal((await helper.upsert({sourceUrl:receipt.sourceUrl},{principal,receipt})).status,'forbidden_source');assert.equal(calls,0);
 allowed=true;assert.equal((await helper.upsert({sourceUrl:receipt.sourceUrl},{principal,receipt})).status,'ready');assert.equal(calls,1);
});
test('member helper rejects revocation during Calendar processing before mutation',async()=>{
 const f=fixture();let checks=0;const helper=createMemberPlansTools({client:f.client,sourceId:memberSource,authorizeParticipation:async()=>++checks<3});
 const {principal:_,trustedParticipation:__,...args}=f.args;
 assert.equal((await helper.upsert(args,{principal,receipt})).status,'forbidden_source');assert.equal(f.writes.length,0);
});
test('current-presence inputs cannot move source time forward, and forged metadata cannot be resealed',async()=>{
 const f=fixture();assert.equal((await f.client.upsertMemberPlan({...f.args,start:{dateTime:'2026-10-21T14:00:00Z',timeZone:'America/New_York'}})).status,'invalid_request');
 const created=await f.client.upsertMemberPlan(f.args);f.events.get(created.eventId).extendedProperties.private.memberPlanSignature='0'.repeat(64);
 assert.equal((await f.client.upsertMemberPlan(f.args)).status,'human_modified');assert.equal(f.writes.length,1);
});

test('actual helper cancels existing or absent Member Plans with schema fields only',async()=>{
 for(const exists of [false,true]){
  const f=fixture();let created;if(exists)created=await f.client.upsertMemberPlan(f.args);
  const helper=createMemberPlansTools({client:f.client,sourceId:memberSource,authorizeParticipation:async()=>true});
  const args={sourceKey:f.args.sourceKey,sourceUrl:f.args.sourceUrl};
  const cancelled=await helper.cancel(args,{principal,receipt});
  assert.equal(cancelled.status,'ready');assert.equal(cancelled.outcome,exists?'cancelled':'already_absent');
  if(exists){assert.equal(f.events.get(created.eventId).status,'cancelled');assert.equal((await helper.cancel(args,{principal,receipt})).outcome,'unchanged');}
  else assert.equal(f.writes.length,0);
 }
});
test('future personal plan needs supported end and retains saved bounds for partial edits',async()=>{
 const f=fixture(),args={...f.args,activityKind:'personal_plan',start:{dateTime:'2026-10-25T15:00:00Z',timeZone:'America/New_York'}};
 assert.equal((await f.client.upsertMemberPlan(args)).status,'invalid_request');assert.equal(f.writes.length,0);
 assert.equal((await f.client.upsertMemberPlan({...args,end:{dateTime:'2026-10-25T18:00:00Z',timeZone:'America/New_York'}})).status,'ready');
 assert.equal((await f.client.upsertMemberPlan({...f.args,activityKind:'personal_plan',title:'New label'})).status,'ready');
 assert.equal(f.writes.at(-1).start.dateTime,'2026-10-25T15:00:00.000Z');assert.equal(f.writes.at(-1).end.dateTime,'2026-10-25T18:00:00.000Z');
});
