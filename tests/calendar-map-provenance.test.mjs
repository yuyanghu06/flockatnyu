import test from 'node:test';
import assert from 'node:assert/strict';
import {createMapSourceAuthorizer} from '../server/map/source-access.js';
import {readCalendarConfig} from '../server/google/calendar-config.js';
import {createChatCalendarTools} from '../tools/calendar/chat.js';

const sourceId='10000000-0000-4000-8000-000000000001';
const otherId='20000000-0000-4000-8000-000000000002';
const calendarId='club@group.calendar.google.com',eventId='recurring_20261020T220000Z';
const link=(id=eventId,target=calendarId)=>`https://calendar.google.com/calendar/event?eid=${Buffer.from(`${id} ${target}`).toString('base64url')}`;
const principal={id:'chat',googleAccess:true,allowedSourceIds:[sourceId]};
function fixture() {
  const calls=[];
  let status='ready',events=[{eventId,url:link(),status:'confirmed'}];
  const client={configured:true,calendarId,readEvent:async args=>{calls.push(args);return {status,events};}};
  const authorize=createMapSourceAuthorizer({calendarClient:client,calendarSourceId:sourceId});
  return {client,calls,authorize,revoke:()=>{status='permission_denied';},changeEvents:rows=>{events=rows;}};
}
test('Calendar map access validates exact configured source, canonical event identity and current live read',async()=>{
  const f=fixture();
  for(const actor of [principal,{id:'update-agent',calendarAccess:true,calendarId,allowedSourceIds:[sourceId]}]) {
    assert.equal(await f.authorize({principal:actor,sourceId,sourceUrl:link()}),true);
    assert.deepEqual(f.calls.at(-1).principal,{id:actor.id,calendarAccess:true,calendarId});
    assert.equal(f.calls.at(-1).eventId,eventId);
  }
  f.revoke();assert.equal(await f.authorize({principal,sourceId,sourceUrl:link()}),false);
});
test('forged Calendar targets, links, source IDs and grants fail before provider read',async()=>{
  const f=fixture();
  for(const sourceUrl of [link(eventId,'other@example.com'),link()+'&extra=1',link()+'&eid=x',link()+'#details',link()+'=',link().replace('https:','http:'),link().replace('/calendar/event','/calendar/other'),link('bad/id'),link().replace('calendar.google.com','user@calendar.google.com')])
    assert.equal(await f.authorize({principal,sourceId,sourceUrl}),false,sourceUrl);
  for(const actor of [{...principal,googleAccess:false},{...principal,allowedSourceIds:[]},{id:'worker',calendarAccess:true,calendarId:'other@example.com',allowedSourceIds:[sourceId]},null])
    assert.equal(await f.authorize({principal:actor,sourceId,sourceUrl:link()}),false);
  assert.equal(await f.authorize({principal:{...principal,allowedSourceIds:[sourceId,otherId]},sourceId:otherId,sourceUrl:link()}),false);
  assert.equal(await createMapSourceAuthorizer({calendarClient:f.client})({principal,sourceId,sourceUrl:link()}),false);
  assert.equal(f.calls.length,0);
});
test('current Calendar mismatch, missing event, failure or aborted read cannot authorize map visibility',async()=>{
  for(const rows of [[],[{eventId:'another',url:link()}],[{eventId,url:link(eventId,'other@example.com')}]]) {
    const f=fixture();f.changeEvents(rows);assert.equal(await f.authorize({principal,sourceId,sourceUrl:link()}),false);
  }
  const f=fixture();f.client.readEvent=async()=>{throw Error('private');};
  assert.equal(await f.authorize({principal,sourceId,sourceUrl:link()}),false);
  const controller=new AbortController();controller.abort();
  assert.equal(await fixture().authorize({principal,sourceId,sourceUrl:link(),signal:controller.signal}),false);
  const during=fixture(),duringController=new AbortController();during.client.readEvent=async()=>{duringController.abort();return {status:'ready',events:[{eventId,url:link()}]};};
  assert.equal(await during.authorize({principal,sourceId,sourceUrl:link(),signal:duringController.signal}),false);
});
test('Calendar source configuration is optional and chat provenance is attached only from server config plus allowlist',async()=>{
  assert.equal(readCalendarConfig({}).sourceId,'');
  assert.equal(readCalendarConfig({AGENT_CALENDAR_SOURCE_ID:` ${sourceId} `}).sourceId,sourceId);
  for(const [configuredId,actor,expected] of [[sourceId,principal,sourceId],[otherId,principal,undefined],['not-uuid',principal,undefined],[undefined,principal,undefined]]) {
    const f=fixture();
    const tools=createChatCalendarTools({client:f.client,sourceId:configuredId});
    const result=await tools.execute({name:'read_calendar_event',arguments:{eventId},principal:actor});
    assert.equal(result.status,'ready');assert.equal(result.sources[0].sourceId,expected);
    assert.equal(result.sources[0].externalId,eventId);assert.equal(result.sources[0].url,link());
  }
});
