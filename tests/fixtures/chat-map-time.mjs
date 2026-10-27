import assert from 'node:assert/strict';
import {createChatRunner} from '../../server/chat/runner.js';
import {createMapEventService,validateSnapshot} from '../../server/map/events.js';
import {CHAT_MAP_SOURCE_ID,chatMapEventUrl,createMapSourceAuthorizer,withChatMapSource} from '../../server/map/source-access.js';
import {createMapTools} from '../../tools/map/index.js';
import {createChatMapTools} from '../../tools/map/chat.js';
import {createTimeContext} from '../../server/shared/time-zone.js';

export const zone='America/New_York',origin='https://synthetic-flock.example.test';
export const ids={event:'21000000-0000-4000-8000-000000000001',second:'21000000-0000-4000-8000-000000000002',
  yuyang:'31000000-0000-4000-8000-000000000001',jennifer:'31000000-0000-4000-8000-000000000002',
  charice:'31000000-0000-4000-8000-000000000003',pope:'31000000-0000-4000-8000-000000000004'};
export const requestContext={transport:'discord',actor:{provider:'discord',userId:'400',guildId:'100',username:'synthetic-yuyang',displayName:'Yuyang Hu'},
  channelId:'200',threadId:null,requestId:'300',sourceProfileId:'synthetic-time-test'};
export const discordUsers={complete:true,reason:null,users:[{discordUserId:'400',name:'Yuyang Hu'}]};
export const principal={id:'synthetic-member',allowedSourceIds:[]};
export const withoutMetadata=row=>Object.fromEntries(Object.entries(row).filter(([key,value])=>!['event_id','created_at','updated_at','local_display','effective_local_display'].includes(key)&&value!==null));
const clone=value=>structuredClone(value);

export function snapshot({empty=false,attendance=false}={}) {
  const stamp='2026-10-23T20:00:00.123456Z',sourceUrl=chatMapEventUrl(ids.event,origin);
  const event={id:ids.event,name:attendance?'GoGreek':'Stern presence',notes:'Keep these human notes.',kind:attendance?'scheduled_event':'presence',
    type_id:attendance?'social':'study',status:'confirmed',time_kind:'timed',starts_at:stamp,ends_at:'2026-10-24T03:00:00.000Z',
    starts_on:null,ends_on:null,time_zone:zone,source_id:CHAT_MAP_SOURCE_ID,source_url:sourceUrl,source_record_id:'chat:synthetic-stern-record',url:sourceUrl,
    reported_at:stamp,created_at:stamp,updated_at:stamp};
  const data={buildings:[{id:'stern-school-of-business',name:'Stern School of Business'},{id:'bobst-library',name:'Bobst Library'}],
    people:Object.entries(ids).filter(([key])=>!['event','second'].includes(key)).map(([key,id],index)=>({id,display_name:({yuyang:'Yuyang Hu',jennifer:'Jennifer Example',charice:'Charice Example',pope:'Pope Example'})[key],is_trackable:true,discord_user_id:String(400+index)})),
    event_types:['study','social','other'].map((code,index)=>({code,name:code,description:'',icon_key:code,sort_order:index})),
    events:empty?[]:[event],event_buildings:empty?[]:[{event_id:ids.event,building_id:'stern-school-of-business',location_notes:'Fourth floor study lounge'}],
    event_people:empty?[]:[ids.yuyang,ids.jennifer,ids.charice,ids.pope].map((person_id,index)=>({event_id:ids.event,person_id,attendance_status:'going',presence_basis:'reported',label:['Writing code','Reviewing notes','Studying calculus','Working on a portfolio'][index],starts_at:null,ends_at:null,source_id:CHAT_MAP_SOURCE_ID,source_url:sourceUrl,reported_at:stamp}))};
  if(attendance){
    data.event_people=data.event_people.filter(row=>row.person_id!==ids.yuyang);
    Object.assign(data.event_people[0],{starts_at:'2026-10-23T20:15:00.234567Z',ends_at:'2026-10-23T22:15:00.345678Z',presence_basis:'planned'});
  }
  return validateSnapshot(data);
}

// The production service and request-local chat adapter run unchanged. Only the
// persistence boundary is simulated, with real complete-snapshot application and
// byte-exact optimistic version checks. No business-service client is created.
export function fixture({data=snapshot(),now='2026-10-23T21:45:00.000Z',readFailure=false,beforeWrite}={}) {
  let state=clone(data),writeVersion=0;
  const calls=[],attempts=[],writes=[];
  const store={configured:true,read:async()=>{calls.push({name:'store.read'});if(readFailure)throw Error('Synthetic storage unavailable');return clone(state);},
    lookup:async({provider,providerUserId})=>{calls.push({name:'store.lookup',provider,providerUserId});return clone(provider==='discord'?state.people.find(row=>row.discord_user_id===providerUserId)??null:null);},
    upsert:async({event,buildings,people,expectedUpdatedAt})=>{
      const attempt=clone({event,buildings,people,expectedUpdatedAt});attempts.push(attempt);beforeWrite?.(state,attempt);
      const old=state.events.find(row=>row.id===event.id);
      if(old?old.updated_at!==expectedUpdatedAt:expectedUpdatedAt!==null&&expectedUpdatedAt!==undefined)return {status:'conflict'};
      const updated_at=new Date(Date.parse(now)+ ++writeVersion).toISOString();
      if(buildings.some(row=>!state.buildings.some(known=>known.id===row.building_id))
        ||people.some(row=>!state.people.some(known=>known.id===row.person_id&&known.is_trackable))
        ||!state.event_types.some(known=>known.code===event.type_id)
        ||state.events.some(row=>row.id!==event.id&&row.source_id===event.source_id&&row.source_record_id===event.source_record_id))return {status:'invalid'};
      const saved={...event,created_at:old?.created_at??now,updated_at};
      const next={...state,events:[...state.events.filter(row=>row.id!==saved.id),saved],
        event_buildings:[...state.event_buildings.filter(row=>row.event_id!==saved.id),...buildings.map(row=>({...row,event_id:saved.id}))],
        event_people:[...state.event_people.filter(row=>row.event_id!==saved.id),...people.map(row=>({...row,event_id:saved.id}))]};
      validateSnapshot(next);state=next;writes.push(attempt);
      return {status:'applied',event_id:saved.id,updated_at};
    }};
  const authorizeSource=createMapSourceAuthorizer({allowChatMapUpdates:true,publicOrigin:origin});
  const service=createMapEventService({store,authorizeSource,now:()=>new Date(now)});
  const chatService={configured:true,...Object.fromEntries(['read','lookup','upsert'].map(name=>[name,args=>service[name]({...args,principal:withChatMapSource(args.principal)})]))};
  const raw=createChatMapTools({mapTools:createMapTools({service:chatService}),store,publicOrigin:origin,now:()=>new Date(now)});
  const tracked=adapter=>({...adapter,execute:async options=>{
    const result=await adapter.execute(options);calls.push({name:options.name,arguments:clone(options.arguments),result:clone(result)});return result;
  }});
  const mapTools={...tracked(raw),createRequest:context=>tracked(raw.createRequest(context))};
  return {store,mapTools,service,calls,attempts,writes,now,get state(){return clone(state);},
    request:()=>mapTools.createRequest({principal,requestContext,discordUsers,timeContext:createTimeContext({timeZone:zone,now}),messages:[{role:'user',content:'Synthetic adapter verification.'}]}),
    run:async(provider,config,messages,{signal}={})=>{
      const records=[],runner=createChatRunner({config,provider,mapTools,now:()=>new Date(now)});
      const result=await runner.run({conversation:{messages,timeZone:zone},principal,requestContext,discordUsers,signal,onRecord:record=>records.push(record)});
      return {result,records,text:records.filter(row=>row.type==='delta').map(row=>row.text).join('')};
    }};
}

export function currentUpdate(data=snapshot()) {
  const event=data.events[0];
  return {event:withoutMetadata(event),expectedUpdatedAt:event.updated_at,buildings:data.event_buildings.map(withoutMetadata),people:data.event_people.map(withoutMetadata)};
}
export function assertNoStorageHints(data){
  assert(!JSON.stringify(data).includes('_local"'),'Local input clocks must not be persisted');
  for(const row of [...data.events,...data.event_people])assert(!row.local_display&&!row.effective_local_display,'Derived display hints must not be persisted');
}
export function assertSternCorrection(f,before=snapshot()){
  assert.equal(f.writes.length,1,'Expected one confirmed correction');
  const saved=f.state.events.find(row=>row.id===ids.event),old=before.events[0];
  assert.equal(new Date(saved.ends_at).toISOString(),'2026-10-23T23:00:00.000Z','7 PM New York on October 23 is 23:00Z');
  assert.deepEqual({...saved,ends_at:old.ends_at,updated_at:old.updated_at},old,'Only the requested end and storage revision may change');
  assert.equal(f.writes[0].expectedUpdatedAt,old.updated_at);
  assert.deepEqual(f.state.event_people,before.event_people,'Keep all four people, labels and individual facts');
  assert.deepEqual(f.state.event_buildings,before.event_buildings,'Keep building and room');
  assert.equal(f.state.events.length,before.events.length,'Correct the existing event without duplicates');assertNoStorageHints(f.state);
}
