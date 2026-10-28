import { promptText } from '../prompt-loader/index.js';
import {canonicalJson,plainObject,validUuid} from './validation.js';
const readTools=new Set(['read_discord_messages','read_discord_window','search_discord',
  'read_gmail','search_gmail','read_calendar_event','list_calendar_events','read_member_plan',
  'list_member_plans','read_map_events','lookup_map_person','find_map_attendance_targets',
  'read_drive','search_drive','read_pending_task','read_context_fragment']);
const size=value=>Buffer.byteLength(JSON.stringify(value));
const parse=value=>{try{return typeof value==='string'?JSON.parse(value):null;}catch{return null;}};
const marker='runner_context_compaction';
const managed=message=>message?.role==='user'&&parse(message.content)?.conversationContext?.origin===marker;
const resultKey=row=>plainObject(row?.arguments)?canonicalJson([row.tool,row.arguments]):null;
const successfulRead=result=>['ready','ok','success','succeeded','completed'].includes(result?.status)
  &&(result.sourceStatus===undefined||['ready','ok','success','succeeded','completed','empty'].includes(result.sourceStatus))&&result.partial!==true;
const notice=promptText("agents/update/context#retirement.summary");

function retired(result,reason,extra={}) {
  return {status:'context_retired',contextRetired:true,originalStatus:result?.status??'unknown',reason,...extra,
    notice:promptText("agents/update/context#retirement.result")};
}

function slimCatalogue(payload,active) {
  if(!plainObject(payload?.context)||!Array.isArray(payload.context.tasks))return payload;
  const result=structuredClone(payload);
  result.context.tasks=result.context.tasks.map(task=>{
    if(!plainObject(task)||active.has(task.uuid))return task;
    return {uuid:task.uuid,...(typeof task.currentCycle==='boolean'?{currentCycle:task.currentCycle}:{}),
      ...(typeof task.request?.operation==='string'?{request:{operation:task.request.operation}}:{}),
      selectionDetailRetired:true};
  });
  result.context.catalogueNotice=promptText("agents/update/context#retirement.catalogue");
  return result;
}

// Compare returned identifiers only. Source text/titles are never interpreted.
function readIdentities(value,{tool,calendarKind,calendarSources}={}) {
  const keys=new Set(),calendar=new Map(),add=(prefix,value)=>{if(typeof value==='string'&&value)keys.add(`${prefix}:${value}`);};
  const event=(kind,id)=>{if(typeof id!=='string'||!id)return;const kinds=calendar.get(id)||new Set();kinds.add(kind||'*');calendar.set(id,kinds);};
  const visit=(node,parent='',provider=tool?.includes('discord')?'discord':tool?.includes('gmail')?'gmail':undefined)=>{
    if(Array.isArray(node)){for(const row of node)visit(row,parent,provider);return;}
    if(!plainObject(node))return;
    provider=node.provider||node.kind||node.source||provider;
    for(const key of ['sourceUrl','source_url','url','htmlLink'])if(typeof node[key]==='string') {
      add('url',node[key]);const match=/^https:\/\/discord\.com\/channels\/\d+\/(\d+)\/(\d+)$/.exec(node[key]);
      if(match)add('discord-message',`${match[1]}:${match[2]}`);
    }
    const channel=node.channelId||node.channel_id,message=node.messageId||(parent==='payload'?node.id:undefined);
    if(typeof channel==='string'&&typeof message==='string')add('discord-message',`${channel}:${message}`);
    if(['gmail','email'].includes(provider))add('gmail-message',node.messageId||node.externalId||(parent==='payload'?node.id:undefined));
    add('person',node.personId||node.person_id);if(parent==='person'||parent==='people')add('person',node.id);
    add('discord-user',node.discord_user_id);if(parent==='author'&&provider==='discord')add('discord-user',node.id);
    if(provider==='discord')add('discord-user',node.providerUserId||node.authorId);
    if(['email','gmail'].includes(provider))add('email-user',node.providerUserId);
    add('map',node.mapEventId);
    const sourceId=node.sourceId||node.source_id,recordId=node.sourceRecordId||node.source_record_id;
    if(typeof sourceId==='string'&&typeof recordId==='string') {add('record',canonicalJson([sourceId,recordId]));event(calendarSources?.get(sourceId),recordId);if(node.source_record_id)add('map',node.id);}
    event(node.calendarKind||calendarKind,node.calendarEventId);
    if(['read_calendar_event','list_calendar_events','read_member_plan','list_member_plans'].includes(tool))event(calendarKind,node.eventId);
    if(tool==='read_map_events')add('map',node.eventId);
    for(const [key,row]of Object.entries(node))if(row&&typeof row==='object')visit(row,key,provider);
  };
  visit(value);return {keys,calendar};
}
function sharedIdentities(left,right) {
  if([...left.keys].some(key=>right.keys.has(key)))return true;
  for(const [id,kinds]of left.calendar) {
    const other=right.calendar.get(id);if(other&&(kinds.has('*')||other.has('*')||[...kinds].some(kind=>other.has(kind))))return true;
  }
  return false;
}
function resolvedReadRetirement({entries,snapshot,referenceBindings,phase,tasks,includeTaskViews=false}) {
  if(phase!=='followup'||snapshot?.status!=='ready'||snapshot.phase!=='followup'||!Array.isArray(snapshot.catalogue)||!Array.isArray(snapshot.tasks)
    ||referenceBindings?.phase!=='followup'||!Array.isArray(referenceBindings.inputIds))return ()=>false;
  const queueIds=new Set((referenceBindings.handledInputIds||[]).map(row=>row.uuid));
  const phaseIds=new Set((referenceBindings.inputIds||[]).filter(row=>typeof row.ref==='string'&&row.ref.startsWith('t_')&&validUuid(row.uuid)&&!queueIds.has(row.uuid)).map(row=>row.uuid));
  const currentRows=[...snapshot.catalogue,...snapshot.tasks,...(snapshot.fragments||[]),...(snapshot.historyPages||[])];
  if(currentRows.some(row=>!plainObject(row)||!validUuid(row.taskId)))return ()=>false;
  const current=new Set(currentRows.map(row=>row.taskId));
  const closedAt=new Map(),positions=new Map();
  entries.forEach((row,index)=>{
    positions.set(row,index);
    if(row?.kind==='tool_result'&&row.stage==='followup'&&row.tool==='resolve_pending_task'&&row.result?.status==='ready'
      &&phaseIds.has(row.arguments?.taskId)&&Array.isArray(row.inputIds)&&row.inputIds.includes(row.arguments.taskId)&&!current.has(row.arguments.taskId)&&!closedAt.has(row.arguments.taskId))closedAt.set(row.arguments.taskId,index);
  });
  const calendarSources=new Map();
  for(const row of tasks.values())for(const [field,kind]of [['calendarMap','club'],['memberPlans','member']]) {
    const source=row.compact?.task?.info?.batchContext?.[field]?.sourceId;
    if(typeof source==='string')calendarSources.set(source,calendarSources.has(source)&&calendarSources.get(source)!==kind?'*':kind);
  }
  const undisclosed=new Map();
  for(const row of currentRows)if(!tasks.has(row.taskId)) {
    if(!undisclosed.has(row.taskId)||plainObject(row.request))undisclosed.set(row.taskId,row);
  }
  const unfinished=[...tasks.values()].map(row=>({request:row.compact?.task?.info?.request,
    identities:readIdentities(row.compact,{calendarKind:row.compact?.task?.info?.request?.calendarKind,calendarSources})}));
  for(const row of undisclosed.values())unfinished.push({request:row.request,
    identities:readIdentities(row.request,{calendarKind:row.request?.calendarKind,calendarSources})});
  return row=>{
    if(row?.kind!=='tool_result'||row.stage!=='followup'||!readTools.has(row.tool)||row.tool==='read_context_fragment'||!includeTaskViews&&row.tool==='read_pending_task'
      ||!successfulRead(row.result)||row.result.fragment||row.result.historyPage||!plainObject(row.arguments)||!Array.isArray(row.inputIds)||!row.inputIds.length
      ||!row.inputIds.every(id=>phaseIds.has(id)&&closedAt.has(id)&&positions.get(row)<closedAt.get(id)))return false;
    const calendarKind=['read_calendar_event','list_calendar_events'].includes(row.tool)?'club':['read_member_plan','list_member_plans'].includes(row.tool)?'member':undefined;
    const identities=readIdentities({arguments:row.arguments,result:row.result},{tool:row.tool,calendarKind,calendarSources});
    if(unfinished.some(task=>sharedIdentities(identities,task.identities)))return false;
    // Catalogue entries are pending work even before their originals have been
    // disclosed. Their target hints can prove narrow Calendar independence, but
    // cannot establish that source bodies, broad reads or unknown targets are
    // irrelevant. Preserve those facts until the pending task is actually read.
    if(undisclosed.size) {
      const exactCalendar=['read_calendar_event','read_member_plan'].includes(row.tool)
        &&typeof row.arguments.eventId==='string'&&row.arguments.eventId.length>0;
      if(!exactCalendar||[...undisclosed.values()].some(task=>!['club','member'].includes(task.request?.calendarKind)
        ||typeof task.request.calendarEventId!=='string'||!task.request.calendarEventId.length))return false;
    }
    if(unfinished.length&&(['read_calendar_event','list_calendar_events','read_member_plan','list_member_plans','read_map_events','find_map_attendance_targets'].includes(row.tool))) {
      const broad=row.tool.startsWith('list_')||row.tool==='find_map_attendance_targets'||row.tool==='read_map_events'&&!(row.arguments.sourceId&&row.arguments.sourceRecordId||row.result.events?.some(event=>event.source_id&&event.source_record_id));
      if(broad||unfinished.some(task=>!task.request?.calendarEventId))return false;
    }
    return true;
  };
}

function retireClosedTaskCopies(messages,entries,canRetire,taskRefs,beforeBytes) {
  const byCall=new Map(entries.filter(row=>typeof row?.callId==='string').map(row=>[row.callId,row]));
  let retiredResults=0;
  const copied=messages.map(message=>{
    if(message?.role!=='tool')return message;
    const row=byCall.get(message.toolCallId),result=parse(message.content);
    if(!plainObject(result)||result.contextRetired===true||!canRetire(row)
      ||canonicalJson(result)!==canonicalJson(row.result))return message;
    const replacement=retired(result,'resolved_task_read',{taskRefs:row.inputIds.map(id=>taskRefs.get(id)??id),
      ...Object.fromEntries(['sourceStatus','outcome','coverage','partial','warnings'].filter(key=>Object.hasOwn(result,key)).map(key=>[key,structuredClone(result[key])]))});
    if(size(replacement)>=size(result))return message;
    retiredResults++;
    return {...message,content:JSON.stringify(replacement)};
  });
  const afterBytes=size(copied);
  return {messages:retiredResults?copied:messages,compacted:retiredResults>0,beforeBytes,afterBytes,retiredResults};
}

/** Retire copied model-visible logs only. Never mutate private execution history,
 * snapshots, read receipts, source observations or tool-call/result identities. */
export function compactConversation({messages,executionLog=[],snapshot,referenceBindings,phase,
  maxBytes=262144,triggerBytes=196608}={}) {
  if(!Array.isArray(messages))throw new TypeError('messages must be an array');
  const beforeBytes=size(messages),hasManaged=messages.some(managed);
  const entries=Array.isArray(executionLog)?executionLog:[];
  const taskRows=snapshot?.status==='ready'&&Array.isArray(snapshot.tasks)?snapshot.tasks:[];
  const tasks=new Map(taskRows.filter(row=>row?.compactDisclosed===true&&typeof row.taskId==='string'
    &&plainObject(row.compact)).map(row=>[row.taskId,row]));
  const taskRefs=new Map((referenceBindings?.inputIds||[]).filter(row=>typeof row?.uuid==='string'
    &&typeof row.ref==='string').map(row=>[row.uuid,row.ref]));
  // A confirmed closed task no longer needs unique read-body copies. Retire
  // only those copies immediately; keep the rest of a small conversation
  // byte-for-byte stable so useful cached prefixes and unfinished facts survive.
  if(beforeBytes<=Math.min(triggerBytes,maxBytes)&&!hasManaged)return retireClosedTaskCopies(messages,entries,
    resolvedReadRetirement({entries,snapshot,referenceBindings,phase,tasks,includeTaskViews:true}),taskRefs,beforeBytes);
  const copied=structuredClone(messages).filter(message=>!managed(message));
  const resolved=new Set();
  for(const row of entries)if(row?.kind==='tool_result'&&row.tool==='resolve_pending_task'
    &&row.result?.status==='ready'&&typeof row.arguments?.taskId==='string')resolved.add(row.arguments.taskId);
  const active=[];
  for(let i=entries.length-1;i>=0&&active.length<2;i--)for(const id of [...(entries[i]?.inputIds||[])].reverse()) {
    if(tasks.has(id)&&!resolved.has(id)&&!active.includes(id))active.push(id);
    if(active.length===2)break;
  }
  // A disclosed task still needs its compact intent when its first read is the
  // newest operation but an injected log omits inputIds.
  if(!active.length)for(const id of [...tasks.keys()].reverse())if(!resolved.has(id)) {
    active.push(id);if(active.length===2)break;
  }
  const activeIds=new Set(active),rowByCall=new Map(),latestByKey=new Map();
  for(const row of entries)if(row?.kind==='tool_result'&&typeof row.callId==='string') {
    rowByCall.set(row.callId,row);
    if(readTools.has(row.tool)&&row.result?.alreadyRead!==true) {
      const key=resultKey(row);if(key)latestByKey.set(key,row.callId);
    }
  }
  const retireResolvedRead=resolvedReadRetirement({entries,snapshot,referenceBindings,phase,tasks});
  const chains=new Map((Array.isArray(snapshot?.fragments)?snapshot.fragments:[])
    .filter(row=>typeof row?.id==='string').map(row=>[row.id,row]));
  const latestFragment=new Map(),latestHistoryPage=new Map();
  for(const message of copied)if(message?.role==='tool') {
    const result=parse(message.content);
    if(typeof result?.fragment?.data==='string')latestFragment.set(result.fragment.id,message.toolCallId);
    const page=result?.historyPage;
    if(typeof page?.data==='string')latestHistoryPage.set(canonicalJson([page.taskId,page.updatedAt,page.section]),message.toolCallId);
  }
  let retiredResults=0;
  const retire=(message,result,reason,extra)=>{
    const replacement=retired(result,reason,extra);
    if(size(replacement)>=size(result))return false;
    message.content=JSON.stringify(replacement);retiredResults++;return true;
  };
  for(const message of copied) {
    if(message?.role==='user') {
      const payload=parse(message.content);
      if(plainObject(payload)) {
        const visible=slimCatalogue(payload,activeIds),handoff=visible.currentCycleObservations;
        if(plainObject(handoff)&&Array.isArray(handoff.observations)) {
          const kept=handoff.observations.filter(row=>{
            const original=rowByCall.get(row.callId);
            // Handoff bodies are copies, not authority to invent provenance.
            if(!original||row.tool!==original.tool||!plainObject(row.arguments)||!plainObject(row.result)
              ||!plainObject(original.arguments)||!plainObject(original.result)||canonicalJson(row.arguments)!==canonicalJson(original.arguments)
              ||canonicalJson(row.result)!==canonicalJson(original.result))return true;
            if(retireResolvedRead(original))return false;
            const key=resultKey(row),latest=key&&latestByKey.get(key);
            return !latest||typeof row.callId!=='string'||latest===row.callId;
          });
          const omitted=handoff.observations.length-kept.length;
          if(omitted) {
            handoff.observations=kept;
            handoff.retiredObservationCount=(handoff.retiredObservationCount||0)+omitted;
            retiredResults+=omitted;
          }
        }
        message.content=JSON.stringify(visible);
      }
      continue;
    }
    if(message?.role!=='tool')continue;
    const result=parse(message.content),row=rowByCall.get(message.toolCallId);
    if(!plainObject(result)||result.contextRetired===true||!row)continue;
    const fragment=result.fragment,chain=chains.get(fragment?.id),task=tasks.get(chain?.taskId);
    const optionalChain=chain?.compactDisclosed===true&&task?.updatedAt===chain.updatedAt;
    // A complete compact view replaces optional history. The newest body is
    // retained so a just-requested historical fact remains visible, while the
    // old prefix is explicitly no longer a complete concatenated JSON value.
    if(optionalChain&&typeof fragment?.data==='string'
      &&latestFragment.get(fragment.id)!==message.toolCallId) {
      retire(message,result,'optional_task_history_page',{
        taskRef:taskRefs.get(chain.taskId)??chain.taskId,updatedAt:chain.updatedAt,
        sourceStatus:result.sourceStatus,coverage:{...result.coverage,complete:false,reason:'optional_history_prefix_retired'},
        fragment:{...Object.fromEntries(Object.entries(fragment).filter(([key])=>key!=='data')),
          retiredDataChars:fragment.data.length,bodyRetired:true},
      });continue;
    }
    const page=result.historyPage,pageTask=tasks.get(page?.taskId);
    if(pageTask&&pageTask.updatedAt===page.updatedAt&&typeof page.data==='string'
      &&latestHistoryPage.get(canonicalJson([page.taskId,page.updatedAt,page.section]))!==message.toolCallId) {
      retire(message,result,'optional_task_history_page',{taskRef:taskRefs.get(page.taskId)??page.taskId,
        updatedAt:page.updatedAt,historyPage:{...Object.fromEntries(Object.entries(page).filter(([key])=>key!=='data')),
          retiredDataChars:page.data.length,bodyRetired:true},coverage:{complete:false,reason:'optional_history_prefix_retired'}});continue;
    }
    // A repeated root read can issue a different fragment ID. Its older prefix
    // is not interchangeable with that newer chain, so ordinary read dedup must
    // never clear a mandatory chain (or the newest optional page body).
    if(typeof fragment?.data==='string'||typeof page?.data==='string')continue;
    if(retireResolvedRead(row)) {
      retire(message,result,'resolved_task_read',{taskRefs:row.inputIds.map(id=>taskRefs.get(id)??id),
        ...Object.fromEntries(['sourceStatus','outcome','coverage','partial','warnings'].filter(key=>Object.hasOwn(result,key)).map(key=>[key,structuredClone(result[key])]))});continue;
    }
    if(row.tool==='read_pending_task'&&!fragment&&!page) {
      const id=row.arguments?.taskId;
      if(tasks.has(id)||resolved.has(id)) {
        retire(message,result,resolved.has(id)?'resolved_task_view':'compact_task_view_transferred',{
          taskRef:taskRefs.get(id)??id,updatedAt:tasks.get(id)?.updatedAt??result.updated_at,
        });continue;
      }
    }
    if(readTools.has(row.tool)&&result.alreadyRead!==true) {
      const key=resultKey(row),latest=key&&latestByKey.get(key);
      if(latest&&latest!==message.toolCallId)retire(message,result,'superseded_read_result',{supersededByCallId:latest});
    }
  }
  const retiredCalls=new Set(copied.filter(message=>message?.role==='tool'&&parse(message.content)?.contextRetired===true)
    .map(message=>message.toolCallId));
  for(const message of copied)if(message?.role==='assistant'&&Array.isArray(message.toolCalls)
    &&message.toolCalls.length&&message.toolCalls.every(call=>retiredCalls.has(call.id)))message.content='';
  const compactTasks=active.map(id=>{
    const row=tasks.get(id);
    return {taskRef:taskRefs.get(id)??id,taskId:id,updatedAt:row.updatedAt,compactDisclosed:true,compact:structuredClone(row.compact)};
  });
  const fragments=[...chains.values()].filter(row=>activeIds.has(row.taskId)&&row.compactDisclosed===true)
    .map(row=>({id:row.id,taskRef:taskRefs.get(row.taskId)??row.taskId,updatedAt:row.updatedAt,detail:row.detail,
      nextOffset:row.nextOffset,totalChars:row.totalChars,complete:row.complete===true,
      notice:promptText("agents/update/context#retirement.cursor")}));
  const historyPages=(Array.isArray(snapshot?.historyPages)?snapshot.historyPages:[])
    .filter(row=>activeIds.has(row.taskId)&&row.compactDisclosed===true)
    .map(row=>({taskRef:taskRefs.get(row.taskId)??row.taskId,updatedAt:row.updatedAt,section:row.section,
      offset:row.offset,nextOffset:row.nextOffset,totalChars:row.totalChars}));
  if(retiredResults||hasManaged)copied.push({role:'user',content:JSON.stringify({conversationContext:{
    version:1,origin:marker,phase:phase??snapshot?.phase,notice,tasks:compactTasks,fragments,historyPages,
    ...(referenceBindings?{referenceBindings:structuredClone(referenceBindings)}:{}),
  }})});
  const afterBytes=size(copied),compacted=canonicalJson(copied)!==canonicalJson(messages);
  // Never spend more context merely to describe compaction. Retain the original
  // honest hard-limit path when required current data cannot safely fit.
  if(afterBytes>beforeBytes&&!hasManaged)return {messages,compacted:false,beforeBytes,afterBytes:beforeBytes,retiredResults:0};
  return {messages:copied,compacted,beforeBytes,afterBytes,retiredResults};
}
