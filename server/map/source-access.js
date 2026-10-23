// Map source checks use only server-owned grants and saved snapshot facts.
// Provider originals are read through their separate tools, never from here.
import {validateSnapshot,validEvent,text} from './events.js';
import {chatAttendanceOrigin,chatAttendanceReference} from './chat-attendance.js';
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export const CHAT_MAP_SOURCE_ID='f7ecf134-d11d-45b0-b933-4b9cff102606';
export function withChatMapSource(principal) {
  if(typeof principal?.id!=='string'||!principal.id||!Array.isArray(principal.allowedSourceIds))return principal;
  return {...principal,allowedSourceIds:[...new Set([...principal.allowedSourceIds,CHAT_MAP_SOURCE_ID])]};
}
export function chatMapEventUrl(eventId,publicOrigin=process.env.PUBLIC_ORIGIN) {
  const origin=chatAttendanceOrigin(publicOrigin);
  return origin&&uuid(eventId)?`${origin}/?event=${eventId.toLowerCase()}#chat-map`:null;
}
export function createMapSourceAuthorizer({gmailSourceId,calendarClient,calendarSourceId,calendarTargets=[],miroStore,
  allowChatMapUpdates=false,env=process.env,publicOrigin=env.PUBLIC_ORIGIN,miroTeamId=env.MIRO_TEAM_ID?.trim()||null}={}) {
  // Client identities are configuration only. No client method is called.
  const targets=[...(calendarClient?[{sourceId:calendarSourceId,calendarId:calendarClient.calendarId}]:[]),
    ...calendarTargets.map(row=>({sourceId:row.sourceId,calendarId:row.client?.calendarId??row.calendarId}))];
  const origin=chatAttendanceOrigin(publicOrigin);
  const bindings=principal=>Array.isArray(principal?.mapSourceBindings)?principal.mapSourceBindings:[];
  const sameSource=(row,sourceId)=>typeof row?.sourceId==='string'&&row.sourceId.toLowerCase()===sourceId.toLowerCase();
  function familyMatches(principal,sourceId,provider) {
    const families=new Set(bindings(principal).filter(row=>sameSource(row,sourceId)).map(row=>row.provider));
    if(targets.some(row=>sameSource(row,sourceId)))families.add('calendar');
    if(typeof gmailSourceId==='string'&&gmailSourceId.toLowerCase()===sourceId.toLowerCase())families.add('gmail');
    return families.size===0||families.size===1&&families.has(provider);
  }
  function miroReference(sourceUrl) {
    try {
      const url=new URL(sourceUrl),match=/^\/app\/board\/([A-Za-z0-9_=%-]+)\/$/.exec(url.pathname);
      if(url.origin!=='https://miro.com'||!match||url.hash)return null;
      const boardId=decodeURIComponent(match[1]),itemId=url.searchParams.get('moveToWidget');
      return /^[A-Za-z0-9_=-]{1,200}$/.test(boardId)&&(itemId===null||/^[A-Za-z0-9_=-]{1,200}$/.test(itemId))
        &&sourceUrl===`https://miro.com/app/board/${encodeURIComponent(boardId)}/${itemId===null?'':`?moveToWidget=${encodeURIComponent(itemId)}`}`?{boardId}:null;
    }catch{return null;}
  }
  const miroBinding=(principal,sourceId,boardId)=>bindings(principal).find(row=>sameSource(row,sourceId)&&row.provider==='miro'
    &&row.boardId===boardId&&row.enabled===true&&(!miroTeamId||row.teamId===miroTeamId));
  function authorize({principal,sourceId,sourceUrl,eventId,personId,signal}={},snapshot=null,boards=new Map()) {
    if(signal?.aborted||typeof principal?.id!=='string'||!principal.id||!uuid(sourceId)
      ||!Array.isArray(principal.allowedSourceIds)||!principal.allowedSourceIds.some(id=>typeof id==='string'&&id.toLowerCase()===sourceId.toLowerCase())
      ||typeof sourceUrl!=='string'||sourceUrl.length>2048||/[\s\x00-\x1f\x7f]/u.test(sourceUrl))return false;
    try {
      const url=new URL(sourceUrl);
      if(url.protocol!=='https:'||url.username||url.password)return false;
      if(sourceId===CHAT_MAP_SOURCE_ID)return allowChatMapUpdates&&sourceUrl===chatMapEventUrl(eventId,origin);
      if(origin&&url.origin===origin) {
        const reference=chatAttendanceReference(sourceUrl,origin);
        if(!reference||reference.eventId!==eventId||reference.personId!==personId||!snapshot)return false;
        const event=snapshot.events.find(row=>row.id===eventId),person=snapshot.people.find(row=>row.id===personId);
        return Boolean(event&&validEvent(event)&&event.kind==='scheduled_event'&&event.source_id===sourceId
          &&person?.is_trackable===true&&text(person.display_name,200,1)&&event.source_url!==sourceUrl
          &&authorize({principal,sourceId,sourceUrl:event.source_url,signal},snapshot,boards));
      }
      if(url.origin==='https://calendar.google.com') {
        if(!familyMatches(principal,sourceId,'calendar'))return false;
        const target=targets.find(row=>row.sourceId===sourceId),calendarId=target?.calendarId;
        if(typeof calendarId!=='string'||!calendarId||calendarId==='primary'
          ||!(principal.googleAccess===true||principal.calendarAccess===true&&principal.calendarId===calendarId
            ||principal.calendarTargets?.some(row=>row.calendarId===calendarId&&row.sourceId===sourceId))
          ||url.pathname!=='/calendar/event'||url.hash||[...url.searchParams.keys()].join(',')!=='eid')return false;
        const encoded=url.searchParams.get('eid');
        if(!encoded||!/^[-_A-Za-z0-9]+$/.test(encoded))return false;
        const decoded=Buffer.from(encoded,'base64url').toString('utf8'),suffix=` ${calendarId}`;
        const providerId=decoded.endsWith(suffix)?decoded.slice(0,-suffix.length):'';
        return /^[a-zA-Z0-9_-]{5,1024}$/.test(providerId)
          &&sourceUrl===`https://calendar.google.com/calendar/event?eid=${Buffer.from(`${providerId}${suffix}`).toString('base64url')}`;
      }
      if(url.origin==='https://discord.com') {
        const match=/^\/channels\/([0-9]{1,20})\/([0-9]{1,20})\/([0-9]{1,20})$/.exec(url.pathname);
        return Boolean(match&&!url.search&&!url.hash&&sourceUrl===`https://discord.com${url.pathname}`
          &&principal.liveDiscord?.guildId===match[1]&&familyMatches(principal,sourceId,'discord')
          &&bindings(principal).some(row=>sameSource(row,sourceId)&&row.provider==='discord'&&row.guildId===match[1]&&row.channelId===match[2]));
      }
      if(url.origin==='https://miro.com') {
        const reference=miroReference(sourceUrl);
        if(!reference||!familyMatches(principal,sourceId,'miro'))return false;
        return Boolean(miroBinding(principal,sourceId,reference.boardId)||boards.get(reference.boardId)?.sourceId===sourceId);
      }
      if(url.origin==='https://mail.google.com')return familyMatches(principal,sourceId,'gmail')&&sourceId===gmailSourceId&&principal.googleAccess===true
        &&/^#all\/[a-fA-F0-9]{1,64}$/.test(url.hash)&&url.pathname==='/mail/u/0/'&&!url.search
        &&sourceUrl===`https://mail.google.com/mail/u/0/${url.hash}`;
      return false;
    } catch {return false;}
  }
  const authorizer=args=>authorize(args);
  authorizer.localOnly=true;
  authorizer.createReadScope=async({principal,snapshot,signal}={})=>{
    const data=validateSnapshot(snapshot),boards=new Map(),boardIds=new Set();
    for(const row of [...data.events,...data.event_people]) {
      const reference=miroReference(row.source_url);
      if(reference&&uuid(row.source_id)&&principal.allowedSourceIds?.includes(row.source_id)
        &&familyMatches(principal,row.source_id,'miro')&&!miroBinding(principal,row.source_id,reference.boardId))boardIds.add(reference.boardId);
    }
    // This is the service-only Supabase registry RPC, never Miro content or MCP.
    // The resulting metadata is retained only in this read's private checker.
    for(const boardId of boardIds) {
      if(signal?.aborted)break;
      if(miroStore?.configured!==true||typeof miroStore.authorizedBoard!=='function')continue;
      const result=await miroStore.authorizedBoard({principal,boardId,signal}),row=result?.data;
      if(!signal?.aborted&&result?.status==='ready'&&row?.enabled===true&&row.board_id===boardId&&uuid(row.source_id)
        &&principal.allowedSourceIds.includes(row.source_id)&&familyMatches(principal,row.source_id,'miro')
        &&(!miroTeamId||row.team_id===miroTeamId))boards.set(boardId,{sourceId:row.source_id,teamId:row.team_id??null});
    }
    const checker=(actor,active)=>{
      const check=args=>args?.principal===actor&&args?.signal===active&&!active?.aborted&&authorize(args,data,boards);
      check.localOnly=true;
      // Writes may change cancellation scope, but reuse the exact metadata read.
      check.forContext=({principal:nextPrincipal,signal:nextSignal}={})=>checker(nextPrincipal,nextSignal);
      return check;
    };
    return checker(principal,signal);
  };
  authorizer.canPreserveChatParticipation=({event,person}={})=>{
    const target=targets.find(row=>row.sourceId===event?.source_id);
    return Boolean(origin&&event?.kind==='scheduled_event'&&typeof target?.calendarId==='string'&&target.calendarId!=='primary'
      &&event.source_url===`https://calendar.google.com/calendar/event?eid=${Buffer.from(`${event.source_record_id} ${target.calendarId}`).toString('base64url')}`
      &&person?.event_id===event.id&&person.source_id===CHAT_MAP_SOURCE_ID&&person.source_url===chatMapEventUrl(event.id,origin));
  };
  return authorizer;
}
