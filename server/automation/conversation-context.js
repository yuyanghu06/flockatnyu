import {canonicalJson,plainObject} from './validation.js';

const readTools=new Set(['read_discord_messages','read_discord_window','search_discord',
  'read_gmail','search_gmail','read_calendar_event','list_calendar_events','read_member_plan',
  'list_member_plans','read_map_events','lookup_map_person','find_map_attendance_targets',
  'read_drive','search_drive','read_pending_task','read_context_fragment']);
const size=value=>Buffer.byteLength(JSON.stringify(value));
const parse=value=>{try{return typeof value==='string'?JSON.parse(value):null;}catch{return null;}};
const marker='runner_context_compaction';
const managed=message=>message?.role==='user'&&parse(message.content)?.conversationContext?.origin===marker;
const resultKey=row=>plainObject(row?.arguments)?canonicalJson([row.tool,row.arguments]):null;
const notice='Only model-visible old or redundant logs were retired. Full execution evidence, source permissions and exact task versions are unchanged. These copied task views and result cursors are earlier disclosures, not fresh reads or new action proof. Optional history pages whose bodies were retired are NOT jointly present or a reconstructed complete JSON value. Use the complete compact task intent below; read a particular historical fact again only if needed. Other saved tasks remain stored and can be selected with a compact read.';

function retired(result,reason,extra={}) {
  return {status:'context_retired',contextRetired:true,originalStatus:result?.status??'unknown',reason,...extra,
    notice:'Earlier model-visible body retired; it is not a new source result, absence check or successful action. Full execution evidence is retained privately.'};
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
  result.context.catalogueNotice='Unselected task descriptions were retired from this conversation only. IDs, order and current-cycle priority remain; read a selected task compactly for its complete intent.';
  return result;
}

/** Retire copied model-visible logs only. Never mutate private execution history,
 * snapshots, read receipts, source observations or tool-call/result identities. */
export function compactConversation({messages,executionLog=[],snapshot,referenceBindings,phase,
  maxBytes=262144,triggerBytes=196608}={}) {
  if(!Array.isArray(messages))throw new TypeError('messages must be an array');
  const beforeBytes=size(messages),hasManaged=messages.some(managed);
  if(beforeBytes<=Math.min(triggerBytes,maxBytes)&&!hasManaged)
    return {messages,compacted:false,beforeBytes,afterBytes:beforeBytes,retiredResults:0};
  const copied=structuredClone(messages).filter(message=>!managed(message));
  const entries=Array.isArray(executionLog)?executionLog:[];
  const taskRows=snapshot?.status==='ready'&&Array.isArray(snapshot.tasks)?snapshot.tasks:[];
  const tasks=new Map(taskRows.filter(row=>row?.compactDisclosed===true&&typeof row.taskId==='string'
    &&plainObject(row.compact)).map(row=>[row.taskId,row]));
  const taskRefs=new Map((referenceBindings?.inputIds||[]).filter(row=>typeof row?.uuid==='string'
    &&typeof row.ref==='string').map(row=>[row.uuid,row.ref]));
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
      notice:'This cursor is an earlier issued result ID, not a new read receipt. Retired optional prefix bodies are not jointly parseable.'}));
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
