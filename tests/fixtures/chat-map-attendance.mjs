import assert from 'node:assert/strict';
import {createMapEventStore,createMapEventService} from '../../server/map/events.js';
import {createMapSourceAuthorizer,withChatMapSource,CHAT_MAP_SOURCE_ID} from '../../server/map/source-access.js';
import {createMapPresenceService} from '../../server/map/presence.js';
import {createMapTools} from '../../tools/map/index.js';
import {createChatMapTools} from '../../tools/map/chat.js';
import {createChatRunner} from '../../server/chat/runner.js';
import {readConfig} from '../../server/shared/config.js';

export const ids={source:'10000000-0000-4000-8000-000000000001',event:'20000000-0000-4000-8000-000000000001',person:'30000000-0000-4000-8000-000000000001',other:'30000000-0000-4000-8000-000000000002'};
export const now='2026-10-22T20:00:00.000Z',updated='2026-10-22T19:00:00.000Z',origin='https://club.example.test',calendarId='club@example.test',providerId='gogreek20261023';
export const eventUrl=`https://calendar.google.com/calendar/event?eid=${Buffer.from(`${providerId} ${calendarId}`).toString('base64url')}`;
export const exactSentence='ill be going to gogreek tomorrow';
export const principal={id:'synthetic-member',allowedSourceIds:[ids.source],googleAccess:true};
export const requestContext={transport:'discord',actor:{provider:'discord',userId:'400',guildId:'100',username:'synthetic-tony',displayName:'Synthetic Tony'},channelId:'200',threadId:null,requestId:'300',sourceProfileId:'synthetic-test'};
export const discordUsers={complete:true,reason:null,users:[{discordUserId:'400',name:'Tony Example'}]};
export const plain=row=>Object.fromEntries(Object.entries(row).filter(([key,value])=>!['event_id','created_at','updated_at'].includes(key)&&value!==null));
export function snapshot(){return {buildings:[{id:'stern-school-of-business',name:'Stern School of Business'}],people:[{id:ids.person,display_name:'Tony Example',is_trackable:true,discord_user_id:'400'},{id:ids.other,display_name:'Alex Example',is_trackable:true,discord_user_id:'500'}],event_types:[{code:'social',name:'Social',description:'',icon_key:'social',sort_order:0},{code:'other',name:'Other',description:'',icon_key:'other',sort_order:1}],
  events:[{id:ids.event,name:'GoGreek',notes:'Human event notes: welcome gathering',kind:'scheduled_event',type_id:'social',status:'confirmed',time_kind:'timed',starts_at:'2026-10-23T22:00:00.000Z',ends_at:'2026-10-24T00:00:00.000Z',starts_on:null,ends_on:null,time_zone:'America/New_York',source_id:ids.source,source_url:eventUrl,source_record_id:providerId,url:eventUrl,reported_at:updated,created_at:updated,updated_at:updated}],
  event_buildings:[{event_id:ids.event,building_id:'stern-school-of-business',location_notes:'Room 101'}],event_people:[{event_id:ids.event,person_id:ids.other,attendance_status:'going',presence_basis:'planned',label:'Existing helper',starts_at:'2026-10-23T22:15:00.000Z',ends_at:'2026-10-23T23:00:00.000Z',source_id:ids.source,source_url:eventUrl,reported_at:updated}]};}
export function fixture({data=snapshot(),writeStatus='applied',readFailure=false,beforeWrite,linked=true,rpc=false}={}){
  let state=structuredClone(data),allowed=true;const calls=[],writes=[],attempts=[];
  const memoryStore={configured:true,read:async()=>{calls.push({name:'store.read'});if(readFailure)throw Error('Synthetic map read failure');return structuredClone(state);},lookup:async args=>{calls.push({name:'store.lookup',args:{provider:args.provider,providerUserId:args.providerUserId}});return linked&&args.provider==='discord'?structuredClone(state.people.find(person=>person.discord_user_id===args.providerUserId)??null):null;},upsert:async args=>{
    attempts.push(structuredClone({...args,signal:undefined}));beforeWrite?.(state,args);const existing=state.events.find(row=>row.id===args.event.id);if(existing&&existing.updated_at!==args.expectedUpdatedAt)return {status:'conflict'};
    if(writeStatus!=='applied')return writeStatus==='missing_receipt'?{status:'applied'}:{status:writeStatus};
    writes.push(structuredClone({...args,signal:undefined}));const event={...args.event,created_at:existing?.created_at??now,updated_at:'2026-10-22T20:00:00.001Z'};state.events=[...state.events.filter(row=>row.id!==event.id),event];state.event_people=[...state.event_people.filter(row=>row.event_id!==event.id),...args.people.map(row=>({...row,event_id:event.id}))];state.event_buildings=[...state.event_buildings.filter(row=>row.event_id!==event.id),...args.buildings.map(row=>({...row,event_id:event.id}))];return {status:'applied',event_id:event.id,updated_at:event.updated_at};}};
  const store=rpc?createMapEventStore({env:{SUPABASE_URL:'https://synthetic-map.example.test',SUPABASE_SERVICE_ROLE_KEY:'fixture-only'},fetchImpl:async(value,options={})=>{
    const endpoint=new URL(value),body=options.body?JSON.parse(options.body):null;calls.push({name:'rpc',path:endpoint.pathname,body});
    if(endpoint.pathname.endsWith('/map_read_events'))return Response.json(await memoryStore.read());
    if(endpoint.pathname.endsWith('/map_upsert_event'))return Response.json(await memoryStore.upsert({event:body.p_event,buildings:body.p_buildings,people:body.p_people,expectedUpdatedAt:body.p_expected_updated_at}));
    assert(endpoint.pathname.endsWith('/map_people'));const id=endpoint.searchParams.get('discord_user_id')?.replace(/^eq\./,'');const found=await memoryStore.lookup({provider:'discord',providerUserId:id});return Response.json(found?[found]:[]);
  }}):memoryStore;
  const authorizeSource=createMapSourceAuthorizer({store,publicOrigin:origin,allowChatMapUpdates:true,calendarSourceId:ids.source,calendarClient:{configured:true,calendarId,readEvent:async({eventId})=>allowed?{status:'ready',events:state.events.filter(row=>row.source_record_id===eventId).map(row=>({eventId:row.source_record_id,url:row.source_url}))}:{status:'forbidden'}}});
  const service=createMapEventService({store,authorizeSource,now:()=>new Date(now)}),chatService={configured:true,...Object.fromEntries(['read','lookup','upsert'].map(name=>[name,args=>service[name]({...args,principal:withChatMapSource(args.principal)})]))};
  const rawTools=createChatMapTools({mapTools:createMapTools({service:chatService}),store,publicOrigin:origin,now:()=>new Date(now)});
  function tracked(adapter){return {...adapter,execute:async options=>{const result=await adapter.execute(options);calls.push({name:options.name,arguments:structuredClone(options.arguments),result:structuredClone(result)});return result;}};}
  const mapTools={...tracked(rawTools),createRequest:context=>tracked(rawTools.createRequest(context))};
  return {store,mapTools,service,authorizeSource,calls,writes,attempts,get state(){return state;},revoke(){allowed=false;},
    projection:()=>createMapPresenceService({store,authorizeSource,production:true,now:()=>new Date(now)}).read({principal:withChatMapSource(principal)}),
    run:async(provider,{messages=[{role:'user',content:exactSentence}],actor=requestContext,users=discordUsers,bugReportTools,memoryTools,liveDiscordTools,signal}={})=>{
      const records=[],runner=createChatRunner({config:readConfig({LLM_PROVIDER:'openai-compatible',LLM_MODEL:'fixture-only',LLM_API_KEY:'synthetic-key'}),provider,mapTools,bugReportTools,memoryTools,liveDiscordTools,now:()=>new Date(now)});
      const result=await runner.run({conversation:{messages,timeZone:'America/New_York'},principal,requestContext:actor,discordUsers:users,signal,onRecord:record=>records.push(record)});return {result,records,text:records.filter(row=>row.type==='delta').map(row=>row.text).join('')};},
  };
}
export function attendanceArguments(data=snapshot(),personId=ids.person){const event=data.events.find(row=>row.id===ids.event);return {event:plain(event),expectedUpdatedAt:event.updated_at,buildings:data.event_buildings.filter(row=>row.event_id===event.id).map(plain),people:[...data.event_people.filter(row=>row.event_id===event.id).map(plain),{person_id:personId,attendance_status:'going',presence_basis:'planned',label:''}]};}
export function scriptedProvider(steps,{answer='Synthetic answer.'}={}){let index=0;const requests=[],errors=[];return {requests,errors,planTools:async request=>{requests.push(request);try{const step=steps[index++];assert(step!==undefined,'Unexpected planning call');return typeof step==='function'?await step(request):step;}catch(error){errors.push(error);throw error;}},async *stream(request){requests.push(request);yield typeof answer==='function'?answer(request):answer;}};}
export function assertAttendance(f,before=snapshot()){
  assert.equal(f.writes.length,1,'Expected one confirmed existing-event update');assert.equal(f.state.events.length,before.events.length);assert.equal(f.writes[0].event.id,ids.event);assert.equal(f.writes[0].expectedUpdatedAt,before.events[0].updated_at);
  assert.deepEqual(plain(f.state.events[0]),plain(before.events[0]));assert.deepEqual(f.state.event_buildings,before.event_buildings);assert.deepEqual(f.state.event_people.find(row=>row.person_id===ids.other),before.event_people.find(row=>row.person_id===ids.other));
  const person=f.state.event_people.find(row=>row.person_id===ids.person);assert(person);assert.equal(person.attendance_status,'going');assert.equal(person.presence_basis,'planned');assert.equal(person.source_id,CHAT_MAP_SOURCE_ID);assert.equal(person.source_url,`${origin}/?event=${ids.event}#chat-map`);
}
