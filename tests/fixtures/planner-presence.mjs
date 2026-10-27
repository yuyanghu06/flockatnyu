import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createAutomationAdapters} from '../../server/automation/adapters.js';
import {createAutomationHandler} from '../../server/automation/handler.js';
import {readAutomationConfig} from '../../server/automation/config.js';
import {createCalendarClient} from '../../server/google/calendar-client.js';
import {readCalendarConfig,readMemberPlansConfig,CALENDAR_REQUIRED_SCOPES} from '../../server/google/calendar-config.js';
import {createLiveRetrievalTools} from '../../tools/discord/index.js';
import {attachTaskReads} from './planner-followup.mjs';
export const source='10000000-0000-4000-8000-000000000001',clubSource='10000000-0000-4000-8000-000000000002',memberSource='10000000-0000-4000-8000-000000000003',personId='30000000-0000-4000-8000-000000000001',lease='60000000-0000-4000-8000-000000000001';
export const clubId='club@group.calendar.google.com',memberId='members@group.calendar.google.com',stamp='2026-10-27T14:44:18.202Z',now='2026-10-27T15:00:00.000Z';
export const buildings=[{id:'nyu-leslie-elab-building',name:'Leslie eLab building',aliases:['Leslie Entrepreneurs Lab','Leslie eLab','16 Washington Place']},{id:'bobst-library',name:'Bobst Library',aliases:['Bobst']}];
export const originalUrl=row=>`https://discord.com/channels/100/200/${row.raw_response.payload.id}`;
export function presenceInputs(texts=["I'm at elab",'If anyone wants to pu','Probably until like 3']){return texts.map((content,i)=>({uuid:`40000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`,raw_response:{source:'discord',source_id:source,event_type:'message_created',event_id:String(300+i),revision:'1',received_at:stamp,payload:{id:String(300+i),guild_id:'100',channel_id:'200',timestamp:new Date(Date.parse(stamp)+i*1000).toISOString(),author:{id:'400',username:'taylor_example'},content}}}));}
export function presenceTask(){return {uuid:'50000000-0000-4000-8000-000000000001',created_at:stamp,updated_at:stamp,expires_at:'2026-10-28T15:00:00.000Z',info:{version:1,sourceIds:[source],inputs:presenceInputs(),request:{summary:'The matched speaker reported current presence at eLab at10:44AM. Determine whether an existing club event is involved or this is independent presence. Nearby same-speaker messages offer others to join and say probably until like3.',operation:'participation',calendarKind:'member',personId},batchContext:{memberPlans:{configured:true,sourceId:memberSource,calendarId:memberId}},executionHistory:[{kind:'tool_result',tool:'read_map_events',stage:'initial',result:{status:'ready',events:[],irrelevantHistoricalDetail:'Previously reviewed unrelated event. '.repeat(2600)}}]}};}
export function createPresenceFixture({pending=[],inputs=presenceInputs(),staged=true,mapWriteFailureAfter,originalUnavailable=false,calendarControl={},unmatched=false,unavailableIds=[],processNow=now}={}) {
  const currentInput=inputs[0],gmail=false;
  const chronology=[],calendarEvents=new Map([[clubId,new Map()],[memberId,new Map()]]),mapRows=new Map(),tasks=new Map(pending.map(row=>[row.uuid,structuredClone(row)])),modelRequests=[],lookups=[],modelErrors=[],taskExecution=[],toolCalls=[];
  let revoked=false,version=0,finished=false,liveAuthorId='400';
  const env={...(gmail?{AGENT_GMAIL_SOURCE_ID:source}:{}),AGENT_AUTOMATION_STAGED_ENABLED:String(staged),ASSISTANT_ALLOWED_SOURCE_IDS:[source,clubSource,memberSource].join(','),
    GOOGLE_CLIENT_ID:'client',GOOGLE_CLIENT_SECRET:'synthetic-secret',GOOGLE_REFRESH_TOKEN:'refresh',GOOGLE_EXPECTED_ACCOUNT_EMAIL:'club@example.test',
    GOOGLE_CALENDAR_ID:clubId,AGENT_CALENDAR_SOURCE_ID:clubSource,GOOGLE_MEMBER_PLANS_CALENDAR_ID:memberId,AGENT_MEMBER_PLANS_SOURCE_ID:memberSource,AGENT_MEMBER_PLANS_SIGNING_KEY:'synthetic-member-signing-key-32-characters'};
  const oauth={setCredentials:()=>{},getAccessToken:async()=>({token:'synthetic'}),getTokenInfo:async()=>({scopes:CALENDAR_REQUIRED_SCOPES})};
  const fetchImpl=async(value,options={})=>{
    const endpoint=new URL(value);assert(['www.googleapis.com','gmail.googleapis.com'].includes(endpoint.hostname),`Unexpected endpoint ${endpoint.origin}`);
    if(endpoint.hostname==='gmail.googleapis.com')return Response.json({emailAddress:'club@example.test'});
    if(endpoint.pathname.includes('/calendarList/')){const id=decodeURIComponent(endpoint.pathname.split('/calendarList/')[1]);return Response.json({id,accessRole:'owner'});}
    const match=/\/calendars\/([^/]+)\/events(?:\/([^/]+))?$/.exec(endpoint.pathname);assert(match,`Unexpected API path ${endpoint.pathname}`);
    const calendarId=decodeURIComponent(match[1]),eventId=match[2]&&decodeURIComponent(match[2]),rows=calendarEvents.get(calendarId);assert(rows,'Calendar target must be pinned');
    if(!options.method||options.method==='GET'){
      if(eventId){chronology.push({kind:'calendar_read',calendarId,eventId});
        if(calendarControl.readback==='unavailable')return Response.json({}, {status:503});
        if(calendarControl.readback==='empty')return Response.json({}, {status:404});
        const saved=rows.get(eventId);if(!saved)return Response.json({}, {status:404});
        const row=structuredClone(saved);
        if(calendarControl.readback==='active')row.status='confirmed';
        if(calendarControl.readback==='wrong_source')row.source={url:'https://discord.com/channels/100/200/999'};
        if(calendarControl.readback==='wrong_target')row.id='different_exact_event';
        return Response.json(row);
      }return Response.json({items:[...rows.values()]});
    }
    const body=JSON.parse(options.body);assert(!body.attendees);assert.equal(endpoint.searchParams.get('sendUpdates'),'none');
    if(calendarControl.writeFailure)return Response.json({}, {status:calendarControl.writeFailure==='conflict'?412:503});
    const id=eventId||body.id,saved={...rows.get(id),...body,id,etag:`"${++version}"`,created:stamp,updated:stamp};rows.set(id,saved);chronology.push({kind:'calendar_write',calendarId,eventId:id,body});return Response.json(saved);
  };
  const calendarConfig=readCalendarConfig(env),memberConfig=readMemberPlansConfig(env);
  const calendarClient=createCalendarClient({config:calendarConfig,oauthClient:oauth,fetchImpl}),memberClient=createCalendarClient({config:memberConfig,oauthClient:oauth,fetchImpl});
  const policy={guildId:'100',revision:1,paused:false,discoveryEnabled:true,excludedCategoryIds:[],excludedChannelIds:[]},channel={id:'200',guild_id:'100',type:0,parent_id:null};
  const sourceRows=[...inputs,...pending.flatMap(row=>row.info.inputs)];
  const sourceFor=row=>({kind:'discord',retrieval:'live',sourceId:source,url:originalUrl(row),guildId:'100',channelId:'200',messageId:row.raw_response.payload.id,authorId:row.raw_response.payload.author.id,content:row.raw_response.payload.content,excerpt:row.raw_response.payload.content,sourceUpdatedAt:row.raw_response.payload.timestamp,createdAt:row.raw_response.payload.timestamp});
  const sourceResult=args=>{const target=args?.messageId||(args?.url?.split('/').at(-1)),unavailable=originalUnavailable||unavailableIds.includes(target);return {status:revoked?'forbidden':unavailable?'unavailable':'ready',coverage:{complete:!unavailable,textTruncated:false},sources:revoked||unavailable?[]:sourceRows.filter(row=>!unavailableIds.includes(row.raw_response.payload.id)&&(args?.context||!target||row.raw_response.payload.id===target)).map(sourceFor)};};
  const liveDiscordService={configured:true,readMessages:async args=>{chronology.push({kind:'discord_original',args});return sourceResult(args);},readWindow:async args=>sourceResult({...args,context:true}),search:async args=>sourceResult({...args,context:true}),getCatalogue:async()=>({status:'ready',channels:[{id:'200',sourceId:source,name:'general'}],coverage:{complete:true}})};
  const mapEventService={configured:true,
    lookup:async args=>{lookups.push(args);return {status:revoked?'forbidden':'ok',person:!unmatched&&args.providerUserId==='400'?{id:personId,display_name:'Taylor Example',discord_user_id:'400'}:null};},
    read:async args=>{
      const rows=[...mapRows.values()].filter(row=>(!args.eventId||row.event.id===args.eventId)&&(!args.sourceId||row.event.source_id===args.sourceId)&&(!args.sourceRecordId||row.event.source_record_id===args.sourceRecordId));
      return {status:'ok',events:rows.map(row=>structuredClone(row.event)),event_buildings:rows.flatMap(row=>row.buildings.map(building=>({...building,event_id:row.event.id}))),event_people:rows.flatMap(row=>row.people.map(person=>({...person,event_id:row.event.id}))),buildings:structuredClone(buildings),people:[{id:personId,display_name:'Taylor Example',is_trackable:true,discord_user_id:'400'}],event_types:[{id:'study'},{id:'other'}]};
    },
    upsert:async args=>{
      if(mapWriteFailureAfter!==undefined&&chronology.filter(row=>row.kind==='map_write').length>=mapWriteFailureAfter)return {status:'conflict'};
      const old=mapRows.get(args.event.id);if(old&&old.event.updated_at!==args.expectedUpdatedAt)return {status:'conflict'};
      const row={event:{...structuredClone(args.event),updated_at:`2026-10-27T15:00:${String(++version).padStart(2,'0')}.000Z`},buildings:structuredClone(args.buildings),people:structuredClone(args.people)};
      mapRows.set(args.event.id,row);chronology.push({kind:'map_write',...structuredClone(row)});return {status:'applied',event_id:row.event.id,updated_at:row.event.updated_at};
    },
  };
  const taskStore={configured:true,prune:async()=>({status:'ready',pruned:0}),list:async()=>({status:'ready',tasks:structuredClone([...tasks.values()])}),
    save:async args=>{const old=tasks.get(args.task.uuid);if(old&&old.updated_at!==args.expectedUpdatedAt)return {status:'conflict'};const row={...args.task,created_at:old?.created_at||stamp,updated_at:`2026-10-27T15:00:${String(++version).padStart(2,'0')}.000Z`,expires_at:old?.expires_at||'2026-10-28T15:00:00.000Z'};tasks.set(row.uuid,structuredClone(row));return {status:'ready',task:row};},
    resolve:async args=>{chronology.push({kind:'task_resolve',taskId:args.taskId,expectedUpdatedAt:args.expectedUpdatedAt});if(tasks.get(args.taskId)?.updated_at!==args.expectedUpdatedAt)return {status:'conflict'};tasks.delete(args.taskId);return {status:'ready'};},
  };
  attachTaskReads(taskStore,tasks);
  const config=readAutomationConfig({AGENT_AUTOMATION_ENABLED:'true'});
  const adapters=createAutomationAdapters({env,config,now:()=>new Date(processNow),fetchImpl:async()=>{throw Error('Unexpected runtime HTTP');},dependencies:{
    googleConfig:{configured:gmail},googleClient:{configured:gmail,readGmail:async({messageId})=>({status:revoked?'forbidden':'ready',sources:revoked?[]:[{kind:'gmail',externalId:messageId,url:`https://mail.google.com/mail/u/0/#all/${messageId}`,from:'Organizer <host@example.test>',title:'Study plan',date:stamp,excerpt:currentInput.raw_response.payload.content,contentStatus:'text_only_bounded'}]})},calendarConfig,memberConfig,calendarClient,memberClient,
    discordConfig:{configured:true,guildId:'100'},discordStore:{getPolicy:async()=>({status:'ready',policy:{...policy,paused:revoked}}),listSyncChannels:async()=>({status:'ready',channels:[{enabled:true,guildId:'100',channelId:'200',sourceId:source}]})},discordClient:{getGuildChannels:async()=>[channel],getChannel:async()=>channel},
    liveDiscordService,discordTools:createLiveRetrievalTools({service:liveDiscordService,guildId:'100'}),
    mapEventService,mapSourceAuthorizer:async()=>!revoked,taskStore,loadBuildings:async()=>structuredClone(buildings),
  }});
  const context={principal:adapters.principal,inputIds:inputs.map(row=>row.uuid)};
  const store={configured:true,claim:async()=>({status:'ready',leaseToken:lease,inputs:structuredClone(inputs)}),renew:async()=>({status:'ready'}),release:async()=>{},fail:async()=>{},action:async({complete})=>({status:complete?'completed':'execute'}),finish:async()=>{finished=true;return {status:'ready'};}};
  const human={event:{id:'70000000-0000-4000-8000-000000000001',name:'Human edited unrelated event',notes:'Keep this exact human note',kind:'scheduled_event',source_id:source,source_record_id:'399',source_url:'https://discord.com/channels/100/200/399',starts_at:'2026-10-28T16:00:00.000Z',ends_at:'2026-10-28T17:00:00.000Z',updated_at:stamp},buildings:[{building_id:'bobst-library',location_notes:'Human room'}],people:[]};
  mapRows.set(human.event.id,structuredClone(human));
  const humanBefore=structuredClone(human);
  return {humanBefore,adapters,context,calendarEvents,calendarControl,mapRows,tasks,chronology,lookups,modelRequests,toolCalls,inputs,calendarClient,memberClient,config,mapEventService,revoke:()=>{revoked=true;},setCurrentSpeaker:id=>{liveAuthorId=id;},finished:()=>finished,
    prepare:async()=>{await adapters.prepareBatch({...context,inputs:structuredClone(inputs)});await adapters.pipeline.beginCycle({leaseToken:lease,inputs:structuredClone(inputs),getExecutionLog:()=>structuredClone(taskExecution),recordExecution:async row=>taskExecution.push(structuredClone(row))});},
    execute:async(name,args,ids=context.inputIds)=>{const tool=adapters.tools.find(tool=>tool.name===name);assert(tool,`Tool ${name} exists`);const result=await tool.execute(args,{...context,inputIds:ids});taskExecution.push({kind:'tool_result',stage:adapters.pipeline.phase,tool:name,arguments:structuredClone(args),inputIds:[...ids],result:structuredClone(result)});return result;},
    run:async provider=>{const handler=createAutomationHandler({...adapters,tools:adapters.tools.map(tool=>({...tool,execute:async(args,context)=>{const row={name:tool.name,args:structuredClone(args),inputIds:[...context.inputIds]};const result=await tool.execute(args,context);toolCalls.push({...row,result:structuredClone(result)});return result;}})),config,store,now:()=>new Date(processNow),provider:{toolTurn:async request=>{modelRequests.push(request);chronology.push({kind:'model'});try{return await provider.toolTurn(request);}catch(error){modelErrors.push(error);throw error;}}}});const result=await handler.tick();if(modelErrors.length)throw modelErrors[0];return result;},
  };
}
