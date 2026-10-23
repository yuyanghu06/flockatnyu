import test from 'node:test';
import assert from 'node:assert/strict';
import {createCalendarMapSync} from '../server/automation/calendar-sync.js';
import {CHAT_MAP_SOURCE_ID,chatMapEventUrl} from '../server/map/source-access.js';
import {fixture,snapshot,ids,principal,calendarId,providerId,eventUrl,origin,now} from './fixtures/chat-map-attendance.mjs';

for(const conflict of [false,true])test(`separately named Calendar sync preserves private chat attendance${conflict?' and rejects a concurrent edit':''}`,async()=>{
  const data=snapshot();
  data.event_people[0].source_id=CHAT_MAP_SOURCE_ID;
  data.event_people[0].source_url=chatMapEventUrl(ids.event,origin);
  const prior=structuredClone(data.event_people[0]);
  const f=fixture({data,beforeWrite:conflict?state=>{state.events[0].updated_at='2026-10-22T20:00:00.100Z';state.events[0].notes='Concurrent human change';}:undefined});
  const providerEvent={eventId:providerId,url:eventUrl,title:'Revised gathering',description:'Calendar notes',location:'Stern School of Business',
    status:'confirmed',start:{dateTime:data.events[0].starts_at,timeZone:'America/New_York'},end:{dateTime:data.events[0].ends_at,timeZone:'America/New_York'},updatedAt:now,createdAt:data.events[0].created_at};
  const operations=[];
  const client={configured:true,calendarId,listEvents:async()=>{operations.push('calendar.list');return {status:'ready',events:[providerEvent],coverage:{complete:true}};},
    readEvent:async()=>{operations.push('calendar.read');return {status:'ready',events:[providerEvent]};}};
  const sync=createCalendarMapSync({targets:[{client,sourceId:ids.source,kind:'club'}],mapService:f.service,now:()=>new Date(now)});
  const result=await sync.sync({principal,window:{timeMin:'2026-10-22T00:00:00Z',timeMax:'2026-10-25T00:00:00Z'}});
  assert.deepEqual(f.state.event_people.find(row=>row.person_id===ids.other),prior);
  assert.equal(JSON.stringify(result).includes('Existing helper'),false,'Private relationship facts stay out of returned sync results');
  assert(operations.includes('calendar.list'));
  if(conflict){assert.equal(result.status,'partial');assert.equal(f.writes.length,0);assert.equal(f.state.events[0].notes,'Concurrent human change');}
  else{assert.equal(result.status,'ready');assert.equal(f.writes.length,1);assert.equal(f.state.events[0].name,'Revised gathering');assert.deepEqual(f.writes[0].people.find(row=>row.person_id===ids.other),Object.fromEntries(Object.entries(prior).filter(([key])=>key!=='event_id')));}
});

test('separate sync includes an explicitly changed occurrence outside its rolling window',async()=>{
 const data=snapshot(),f=fixture({data});
 const providerEvent={eventId:providerId,url:eventUrl,title:'Future gathering',description:'Future plan',location:'Stern School of Business',status:'confirmed',
  start:{dateTime:'2027-04-23T19:00:00Z',timeZone:'America/New_York'},end:{dateTime:'2027-04-23T21:00:00Z',timeZone:'America/New_York'},updatedAt:now};
 const reads=[];
 const client={configured:true,calendarId,listEvents:async()=>({status:'ready',events:[],coverage:{complete:true}}),readEvent:async({eventId})=>{reads.push(eventId);return {status:'ready',events:[providerEvent]};}};
 const sync=createCalendarMapSync({targets:[{client,sourceId:ids.source,kind:'club'}],mapService:f.service,now:()=>new Date(now)});
 const result=await sync.sync({principal,window:{timeMin:'2026-10-22T00:00:00Z',timeMax:'2026-10-25T00:00:00Z'},extraEventIds:{club:[providerId]}});
 assert.equal(result.status,'partial','Existing independent attendance outside the new event interval blocks destructive projection');
 assert(reads.includes(providerId));assert.equal(f.writes.length,0);assert.deepEqual(f.state.event_people,data.event_people);
 // A Calendar-owned occurrence without independent attendance can move normally.
 const empty=snapshot();empty.event_people=[];const g=fixture({data:empty});
 const second=createCalendarMapSync({targets:[{client,sourceId:ids.source,kind:'club'}],mapService:g.service,now:()=>new Date(now)});
 const applied=await second.sync({principal,window:{timeMin:'2026-10-22T00:00:00Z',timeMax:'2026-10-25T00:00:00Z'},extraEventIds:{club:[providerId]}});
 assert.equal(applied.status,'ready');assert.equal(g.writes.length,1);assert.equal(g.state.events[0].starts_at,'2027-04-23T19:00:00.000Z');
});
