import { promptText } from '../prompt-loader/index.js';
import {createHash,randomUUID} from 'node:crypto';
import {canonicalJson,plainObject,validUuid} from './validation.js';
import {sourceMailbox} from '../google/mailbox.js';
const taskId=value=>{const hash=createHash('sha256').update(value).digest('hex');return `${hash.slice(0,8)}-${hash.slice(8,12)}-5${hash.slice(13,16)}-a${hash.slice(17,20)}-${hash.slice(20,32)}`;};
const definition=(name,description,properties,required,readOnly=false)=>({name,description,phases:name==='defer_task'?['initial','followup']:['followup'],
  ...(readOnly?{readOnly:true}:{idempotent:true}),parameters:{type:'object',additionalProperties:false,properties,required}});
const modelTask=task=>['participation','location','source_review'].includes(task?.info?.request?.operation);
const HISTORY_PAGE_CHARS=12000,HISTORY_PAGE_BYTES=16384,OLD_TASK_RETRY_MS=300000;
const taskProperties={taskId:{type:'string',minLength:36,maxLength:36},summary:{type:'string',minLength:1,maxLength:2000},operation:{type:'string',enum:['participation','location','source_review']},
  calendarEventId:{type:'string',minLength:5,maxLength:1024,description:promptText("tools/worker/tasks#field.calendar-event-id")},calendarKind:{type:'string',enum:['club','member']},personId:{type:'string',minLength:36,maxLength:36,description:promptText("tools/worker/tasks#field.person-id")},buildingId:{type:'string',maxLength:120}};
// This is a temporary work buffer, separate from operational audits. Source
// observations are untrusted evidence and never become durable assistant memory.
export function createStagedPipeline({taskStore,principal,getAllowedSourceIds=()=>principal.allowedSourceIds,verifyResolution,verifyMissingInput,getEvidenceReferences=()=>[],getInitialWriteCoverage=()=>[],bindTask,fragments,now=()=>new Date()}={}) {
  let cycle,phase='initial';
  // Catalogue entries select work. Only complete saved rows can establish
  // original coverage, model read receipts, action bindings or completion.
  const catalogue=new Map(),tasks=new Map(),touched=new Set(),receipts=new Map(),taskFragmentOrigins=new Map(),disclosures=new Map(),obligations=new Set(),stopWitnesses=new Map(),createdTaskIds=new Set(),initialTaskIds=new Set(),historyPageOrigins=new Map(),attemptedTasks=new Set();
  // Selection hints only: they retain no source facts and grant no access. The
  // exact saved version, current originals and normal scope checks still win.
  const oldTaskRetries=new Map();
  let followupScope=new Set();
  const mapPersonId=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
  function persistedTaskFragment(row) {
    if(row?.kind!=='tool_result'||!['read_pending_task','read_context_fragment'].includes(row.tool))return null;
    const marker=row.pendingTaskFragment,fragment=row.result?.fragment;
    return plainObject(marker)&&marker.version===1&&validUuid(marker.chainId)&&validUuid(marker.taskId)
      &&typeof marker.updatedAt==='string'&&Number.isFinite(Date.parse(marker.updatedAt))
      &&fragment?.id===marker.chainId?marker:null;
  }
  function historyCopy(entry,currentEntry=false,ownedInputs) {
    const row={...entry};
    if(currentEntry&&ownedInputs&&row.kind==='batch_context'&&row.cycleId===cycle.id&&Array.isArray(row.inputs)
      &&row.inputs.every(input=>plainObject(input)&&validUuid(input.uuid)&&plainObject(input.raw_response))) {
      // Only the exact worker intake record is eligible. Keep owned native rows
      // whole; source-tool results and genuine surrounding context are separate.
      try {
        if(canonicalJson(row.inputs)===canonicalJson(cycle.inputs)) {
          const ids=new Set(ownedInputs.map(input=>input.uuid));
          row.inputs=row.inputs.filter(input=>ids.has(input.uuid));
        }
      } catch { /* Preserve malformed/unknown history unchanged. */ }
    }
    if(row.kind!=='tool_result'||!['read_pending_task','read_context_fragment'].includes(row.tool))return row;
    const historyPage=row.result?.historyPage;
    if(row.tool==='read_pending_task'&&currentEntry&&plainObject(historyPage)&&typeof historyPage.data==='string') {
      const key=canonicalJson([historyPage.taskId,historyPage.updatedAt,historyPage.section,historyPage.offset]);
      const origin=historyPageOrigins.get(key);
      if(origin&&origin.totalChars===historyPage.totalChars&&origin.nextOffset===historyPage.nextOffset
        &&origin.hash===createHash('sha256').update(historyPage.data).digest('hex')) {
        const {data,...metadata}=historyPage;
        row.pendingTaskHistoryPage={version:1,taskId:historyPage.taskId,updatedAt:historyPage.updatedAt,section:historyPage.section,offset:historyPage.offset};
        row.result={...row.result,historyPage:{...metadata,dataChars:data.length,dataBytes:Buffer.byteLength(data,'utf8')},
          notice:promptText("agents/update/context#saved-history-page")};
        return row;
      }
    }
    const fragment=row.result?.fragment;
    // Current origins are captured at the actual task read, before its row can
    // change. Persisted markers are server-owned history, never parsed bodies.
    const origin=currentEntry&&taskFragmentOrigins.get(fragment?.id)||persistedTaskFragment(row);
    if(origin&&plainObject(fragment)&&typeof fragment.data==='string') {
      const {data,...metadata}=fragment;
      row.pendingTaskFragment={version:1,chainId:fragment.id,taskId:origin.taskId,updatedAt:origin.updatedAt};
      row.result={...row.result,fragment:{...metadata,dataChars:data.length,dataBytes:Buffer.byteLength(data,'utf8')},
        notice:promptText("agents/update/context#saved-task-fragment")};
    } else if(row.tool==='read_pending_task'&&!fragment&&row.result?.alreadyRead!==true)row.result={status:row.result?.status,
      ...(row.result?.task?.uuid||row.result?.taskId?{taskId:row.result?.task?.uuid??row.result.taskId}:{}),
      ...(row.result?.task?.updated_at||row.result?.updated_at?{updatedAt:row.result?.task?.updated_at??row.result.updated_at}:{}),
      notice:promptText("agents/update/context#saved-task-context")};
    return row;
  }
  function mergeHistory(previous,entries,ownedInputs) {
    const rows=[...(previous||[]).map(entry=>persistedTaskFragment(entry)?historyCopy(entry):entry),...entries.map(entry=>{
      const row=historyCopy({...entry,cycleId:entry.cycleId||cycle.id},true,ownedInputs);
      if(row.kind==='deterministic_result')row.result={status:row.result?.status,taskCount:row.result?.context?.taskCount,
        taskIds:row.result?.inputIds,notice:promptText("agents/update/context#saved-api-response")};
      return row;
    })];
    return [...new Map(rows.map((row,index)=>[row.cycleId&&row.sequence?`${row.cycleId}/${row.sequence}`:`legacy/${index}`,row])).values()];
  }
  const scope=()=>[...getAllowedSourceIds()];
  const requireCycle=context=>cycle&&context?.principal===principal&&!context.signal?.aborted;
  const uniqueInputs=rows=>[...new Map(rows.map(row=>[row.uuid,row])).values()];
  const requestOf=task=>task?.info?.request??task?.request;
  const currentCycleTask=task=>touched.has(task.uuid)||(task.info?.inputs?.map(input=>input.uuid)??task.inputIds??[]).some(id=>cycle.inputs.some(row=>row.uuid===id));
  const knownParticipation=task=>requestOf(task)?.operation==='participation'&&mapPersonId(requestOf(task).personId)
    &&['club','member'].includes(requestOf(task).calendarKind)&&typeof requestOf(task).calendarEventId==='string'
    &&requestOf(task).calendarEventId.length>=5&&requestOf(task).calendarEventId.length<=1024;
  const latch=task=>{if(currentCycleTask(task)&&knownParticipation(task))obligations.add(task.uuid);};
  const hasRead=task=>Boolean(task&&receipts.get(task.uuid)?.updatedAt===task.updated_at
    &&receipts.get(task.uuid)?.snapshot===canonicalJson(task));
  const resolutionOptions=task=>[
    {taskId:task.uuid,outcome:'completed'},
    {taskId:task.uuid,outcome:'no_change_needed',reason:'already_correct'},
    {taskId:task.uuid,outcome:'no_change_needed',reason:'no_actionable_request'},
    {taskId:task.uuid,outcome:'source_missing'},
  ];
  const resolutionNotice=promptText("tools/worker/tasks#resolution-notice");
  function sourceCalls(task) {
    return task.info.inputs.flatMap(({uuid,raw_response:event})=>{
      const p=event?.payload;
      if(event?.source==='discord'&&p&&typeof p.guild_id==='string'&&typeof p.channel_id==='string'&&typeof p.id==='string') {
        const url=`https://discord.com/channels/${p.guild_id}/${p.channel_id}/${p.id}`;
        return [{originalInputId:uuid,sourceId:event.source_id,sourceUrl:url,provider:'discord',...(typeof p.author?.id==='string'?{providerUserId:p.author.id}:{}),
          read:{tool:'read_discord_messages',arguments:{url,context:false}},
          ...(typeof p.author?.id==='string'?{lookup:{tool:'lookup_map_person',arguments:{sourceId:event.source_id,sourceUrl:url,provider:'discord',providerUserId:p.author.id}}}:{}),
          notice:promptText("agents/update/context#task-discord-hints")}];
      }
      if(event?.source==='gmail'&&typeof p?.id==='string') {
        const url=`https://mail.google.com/mail/u/0/#all/${p.id}`,from=Array.isArray(p.payload?.headers)?p.payload.headers.filter(row=>typeof row?.name==='string'&&row.name.toLowerCase()==='from'):[],sender=from.length===1?sourceMailbox(from[0].value):null;
        return [{originalInputId:uuid,sourceId:event.source_id,provider:'email',sourceUrl:url,read:{tool:'read_gmail',arguments:{messageId:p.id}},
          ...(sender?{providerUserId:sender,lookup:{tool:'lookup_map_person',arguments:{sourceId:event.source_id,sourceUrl:url,provider:'email',providerUserId:sender}}}:{}),
          notice:promptText("agents/update/context#task-gmail-hints")}];
      }
      return [];
    });
  }
  function compactTaskResult(task) {
    const context=task.info.batchContext,smallString=value=>typeof value==='string'&&value.length<=1024;
    const batchContext={};
    if(plainObject(context)) {
      if(context.status==='ready')batchContext.status=context.status;
      if(smallString(context.calendarId))batchContext.calendarId=context.calendarId;
      for(const key of ['calendarMap','memberPlans'])if(plainObject(context[key])) {
        const routing={};
        if(typeof context[key].configured==='boolean')routing.configured=context[key].configured;
        if(validUuid(context[key].sourceId))routing.sourceId=context[key].sourceId;
        if(key==='memberPlans'&&smallString(context[key].calendarId))routing.calendarId=context[key].calendarId;
        batchContext[key]=routing;
      }
      if(plainObject(context.reconciliationWindow)) {
        const window=Object.fromEntries(['timeMin','timeMax'].filter(key=>smallString(context.reconciliationWindow[key])).map(key=>[key,context.reconciliationWindow[key]]));
        if(Object.keys(window).length)batchContext.reconciliationWindow=window;
      }
    }
    const info=Object.fromEntries(['version','sourceIds','references','request','inputs'].filter(key=>Object.hasOwn(task.info,key)).map(key=>[key,structuredClone(task.info[key])]));
    const metadata=Object.fromEntries(Object.entries(task).filter(([key])=>key!=='info').map(([key,value])=>[key,structuredClone(value)]));
    return {status:'ready',detail:'compact',task:{...metadata,info:{...info,batchContext}},sourceHints:sourceCalls(task),resolutionOptions:resolutionOptions(task),resolutionNotice,
      retainedContext:{detail:'full',executionHistoryEntries:Array.isArray(task.info.executionHistory)?task.info.executionHistory.length:0,
        notice:promptText("tools/worker/tasks#compact-context")}};
  }
  function historyPageResult(task,args) {
    const offset=args.historyOffset??0;
    if(!Number.isSafeInteger(offset)||offset<0||offset>0&&args.expectedUpdatedAt===undefined)return {status:'invalid_request'};
    const section=args.historySection??'executionHistory',history=task.info.executionHistory??[];
    if(!['executionHistory','task'].includes(section))return {status:'invalid_request'};
    if(!Array.isArray(history))return {status:'invalid_request'};
    const serialized=canonicalJson(section==='task'?task:history);
    if(offset>=serialized.length||offset>0&&/[\uDC00-\uDFFF]/.test(serialized[offset])&&/[\uD800-\uDBFF]/.test(serialized[offset-1]))return {status:'invalid_request'};
    const response=data=>({status:'ready',detail:'history',taskId:task.uuid,updated_at:task.updated_at,
      historyPage:{taskId:task.uuid,updatedAt:task.updated_at,section,encoding:section==='task'?'json-task-page':'json-history-page',offset,
        nextOffset:offset+data.length<serialized.length?offset+data.length:null,totalChars:serialized.length,data}});
    let low=0,high=Math.min(HISTORY_PAGE_CHARS,serialized.length-offset);
    while(low<high) {const mid=Math.ceil((low+high)/2);if(Buffer.byteLength(canonicalJson(response(serialized.slice(offset,offset+mid))))<=HISTORY_PAGE_BYTES)low=mid;else high=mid-1;}
    if(low&&/[\uD800-\uDBFF]/.test(serialized[offset+low-1])&&/[\uDC00-\uDFFF]/.test(serialized[offset+low]||''))low--;
    if(!low)return {status:'invalid_request'};
    const result=response(serialized.slice(offset,offset+low)),page=result.historyPage;
    historyPageOrigins.set(canonicalJson([task.uuid,task.updated_at,section,offset]),{totalChars:page.totalChars,nextOffset:page.nextOffset,hash:createHash('sha256').update(page.data).digest('hex')});
    return result;
  }
  const historyPaginationRequired=task=>({status:'ready',detail:'full',reason:'history_pagination_required',historyPaginationRequired:true,
    taskId:task.uuid,updated_at:task.updated_at,historyPage:{taskId:task.uuid,updatedAt:task.updated_at,section:'task',encoding:'json-task-page',
      offset:0,nextOffset:0,totalChars:canonicalJson(task).length},
    notice:promptText("tools/worker/tasks#full-pagination-required")});
  const grantRead=async(task,signal)=>{
    await bindTask(task,signal);
    if(!hasRead(task))receipts.set(task.uuid,{readAt:cycle.getExecutionLog().length,updatedAt:task.updated_at,snapshot:canonicalJson(task)});
  };
  const disclose=(task,readAt,fragmentId,detail,serialized)=>{
    const modes=disclosures.get(task.uuid)||new Map();
    modes.set(detail,{cycleId:cycle.id,phase,principal,snapshot:canonicalJson(task),readAt,fragmentId,serialized});
    disclosures.set(task.uuid,modes);
  };
  const disclosed=(task,detail)=>{
    const modes=disclosures.get(task.uuid),previous=modes?.get(detail);
    if(previous?.cycleId!==cycle.id||previous.phase!==phase||previous.principal!==principal
      ||previous.snapshot!==canonicalJson(task))return false;
    // Generated data and bind receipts alone do not establish that the model
    // received it. Require its exact successful result in this phase's log.
    const history=cycle.getExecutionLog().slice(previous.readAt),serialized=previous.serialized;
    let offset=0;
    try {
      for(const row of history) {
        if(row.kind!=='tool_result'||row.stage!==phase||!row.inputIds?.includes(task.uuid)||row.result?.status!=='ready')continue;
        if(!previous.fragmentId) {
          if(row.tool==='read_pending_task'&&row.arguments?.taskId===task.uuid&&canonicalJson(row.result)===serialized)return true;
          continue;
        }
        const part=row.result.fragment;
        if(part?.id!==previous.fragmentId||part.encoding!=='json-fragment')continue;
        if(offset===0?row.tool!=='read_pending_task'||row.arguments?.taskId!==task.uuid
          :row.tool!=='read_context_fragment'||row.arguments?.id!==part.id||row.arguments?.offset!==part.offset)continue;
        if(part.totalChars!==serialized.length||typeof part.data!=='string'||!Number.isSafeInteger(part.offset)
          ||part.offset<0||part.data!==serialized.slice(part.offset,part.offset+part.data.length)
          ||(part.nextOffset===null?part.offset+part.data.length!==serialized.length:part.nextOffset!==part.offset+part.data.length))return false;
        if(part.offset<offset)continue; // A valid retransmission adds no new coverage.
        if(part.offset!==offset)return false;
        offset+=part.data.length;
        if(part.nextOffset===null)return true;
      }
    } catch { /* Unknown or malformed log rows cannot establish disclosure. */ }
    return false;
  };
  const eligibleCatalogue=task=>task?.modelEligible===true&&Date.parse(task.expires_at)>new Date(now()).getTime()
    &&task.sourceIds?.length>0&&task.sourceIds.every(id=>scope().includes(id));
  function availableForFollowup(task) {
    const retry=oldTaskRetries.get(task.uuid),time=new Date(now()).getTime();
    if(!retry)return true;
    if(retry.updatedAt!==task.updated_at||retry.until<=time||Date.parse(task.expires_at)<=time||currentCycleTask(task)) {
      oldTaskRetries.delete(task.uuid);return true;
    }
    return false;
  }
  const catalogueEntry=task=>{
    const request=task.info.request,summary=typeof request.summary==='string'?request.summary:promptText("tools/worker/tasks#default-summary");
    return {uuid:task.uuid,created_at:task.created_at,updated_at:task.updated_at,expires_at:task.expires_at,
      sourceIds:[...task.info.sourceIds],inputIds:task.info.inputs.map(input=>input.uuid),modelEligible:true,
      summaryTruncated:[...summary].length>100,request:{...Object.fromEntries(['operation','calendarKind','calendarEventId','personId','buildingId']
        .filter(key=>typeof request[key]==='string'&&(key!=='calendarEventId'||[...request[key]].length<=1024)).map(key=>[key,request[key]])),summary:[...summary].slice(0,100).join('')}};
  };
  const forgetTask=id=>{tasks.delete(id);receipts.delete(id);disclosures.delete(id);stopWitnesses.delete(id);oldTaskRetries.delete(id);};
  const rememberTask=task=>{
    const previous=tasks.get(task.uuid);
    if(previous&&canonicalJson(previous)!==canonicalJson(task)) {
      receipts.delete(task.uuid);disclosures.delete(task.uuid);stopWitnesses.delete(task.uuid);
    }
    tasks.set(task.uuid,task);catalogue.set(task.uuid,catalogueEntry(task));
  };
  const storageFailure=result=>{const error=new Error('preflight_failed');if(plainObject(result?.diagnostics))error.diagnostics=result.diagnostics;throw error;};
  async function refreshCatalogue(signal) {
    const result=await taskStore.catalogue({leaseToken:cycle.leaseToken,allowedSourceIds:scope(),signal});
    if(result?.status!=='ready'||!Array.isArray(result.tasks))return result??{status:'unavailable'};
    catalogue.clear();for(const task of result.tasks)catalogue.set(task.uuid,task);
    return {status:'ready'};
  }
  async function loadCoverageCandidates(inputs,signal) {
    const ids=new Set(inputs.map(input=>input.uuid));
    for(const entry of catalogue.values()) {
      if(!eligibleCatalogue(entry)||!entry.inputIds.some(id=>ids.has(id)))continue;
      const result=await taskStore.read({leaseToken:cycle.leaseToken,allowedSourceIds:scope(),taskId:entry.uuid,signal});
      if(result?.status==='not_found'){forgetTask(entry.uuid);continue;}
      if(result?.status!=='ready')return result??{status:'unavailable'};
      if(current(result.task))rememberTask(result.task);else forgetTask(entry.uuid);
    }
    return {status:'ready'};
  }
  const manifest=()=>[...catalogue.values()].filter(task=>followupScope.has(task.uuid)&&eligibleCatalogue(task)).sort((a,b)=>Number(currentCycleTask(b))-Number(currentCycleTask(a))
    ||Number(b.request?.operation==='participation')-Number(a.request?.operation==='participation'))
    .map(task=>Object.fromEntries(Object.entries({uuid:task.uuid,currentCycle:currentCycleTask(task),summary:task.request.summary,summaryTruncated:task.summaryTruncated,operation:task.request.operation,
    ...(typeof task.request.calendarEventId==='string'&&task.request.calendarEventId.length<=200?{calendarEventId:task.request.calendarEventId}:{eventIdInTask:Boolean(task.request.calendarEventId)}),calendarKind:task.request.calendarKind,updated_at:task.updated_at,expires_at:task.expires_at}).filter(([,value])=>value!==undefined)));
  function sourceIds(value,found=new Set()) {
    if(Array.isArray(value)){for(const item of value)sourceIds(item,found);}
    else if(plainObject(value))for(const [key,item] of Object.entries(value)) {
      if(['sourceId','source_id'].includes(key)&&validUuid(item))found.add(item);
      else sourceIds(item,found);
    }
    return [...found];
  }
  function references(value,found=new Map()) {
    if(Array.isArray(value)){for(const item of value)references(item,found);}
    else if(plainObject(value)) {
      const sourceId=value.sourceId||value.source_id;
      const sourceUrl=value.sourceUrl||value.source_url||value.url
        ||(value.source==='discord'&&value.payload?.guild_id&&value.payload?.channel_id&&value.payload?.id?`https://discord.com/channels/${value.payload.guild_id}/${value.payload.channel_id}/${value.payload.id}`:null)
        ||(value.source==='gmail'&&value.payload?.id?`https://mail.google.com/mail/u/0/#all/${value.payload.id}`:null);
      if(validUuid(sourceId)&&typeof sourceUrl==='string'&&/^https:\/\/(?:discord\.com|miro\.com|mail\.google\.com|calendar\.google\.com)\//.test(sourceUrl))
        found.set(`${sourceId}/${sourceUrl}`,{sourceId,sourceUrl});
      for(const item of Object.values(value))references(item,found);
    }
    return [...found.values()];
  }
  function validInput(row,sourceScope) {
    return plainObject(row)&&validUuid(row.uuid)&&plainObject(row.raw_response)
      &&['discord','gmail'].includes(row.raw_response.source)&&validUuid(row.raw_response.source_id)
      &&sourceScope.includes(row.raw_response.source_id)&&plainObject(row.raw_response.payload);
  }
  function current(task) {
    // Cache eligibility uses stored data and current worker scope only. It does
    // not fetch originals, authorize provider reads or establish observations.
    try {
      const info=task?.info,allowed=scope();
      return plainObject(task)&&validUuid(task.uuid)&&plainObject(info)&&info.version===1&&modelTask(task)
        &&[task.created_at,task.updated_at,task.expires_at].every(value=>typeof value==='string'&&Number.isFinite(Date.parse(value)))
        &&Date.parse(task.updated_at)>=Date.parse(task.created_at)&&Date.parse(task.expires_at)>new Date(now()).getTime()
        &&Array.isArray(info.sourceIds)&&info.sourceIds.length>0&&info.sourceIds.every(id=>validUuid(id)&&allowed.includes(id))
        &&new Set(info.sourceIds).size===info.sourceIds.length&&plainObject(info.request)
        &&Array.isArray(info.inputs)&&info.inputs.length>0&&info.inputs.every(row=>validInput(row,info.sourceIds))
        &&new Set(info.inputs.map(row=>row.uuid)).size===info.inputs.length
        &&sourceIds(info.references).every(id=>info.sourceIds.includes(id));
    } catch {return false;}
  }
  function contextInputs(ids) {
    if(!Array.isArray(ids)||!ids.length||new Set(ids).size!==ids.length)return null;
    const originals=new Map(),allowed=scope();
    for(const id of ids) {
      const input=cycle.inputs.find(row=>row.uuid===id);
      const task=tasks.get(id),receipt=receipts.get(id);
      const rows=input?[input]:receipt&&hasRead(task)&&current(task)?task.info.inputs:null;
      if(!rows)return null;
      for(const row of rows) {
        if(!validInput(row,allowed))return null;
        const previous=originals.get(row.uuid);
        if(previous&&canonicalJson(previous)!==canonicalJson(row))return null;
        originals.set(row.uuid,row);
      }
    }
    return [...originals.values()];
  }
  function selectParticipationTasks({context,calendarKind,calendarEventId,changes},requireRead=true) {
    if(!requireCycle(context)||phase!=='followup'||!Array.isArray(context.inputIds)||!Array.isArray(changes)
      ||context.inputIds.length!==changes.length||!changes.length||new Set(context.inputIds).size!==context.inputIds.length
      ||new Set(changes.map(change=>change.personId)).size!==changes.length)return null;
    const selected=[];
    for(const taskId of context.inputIds) {
      const task=tasks.get(taskId),request=task?.info?.request;
      if(!current(task)||!knownParticipation(task)||requireRead&&!hasRead(task)
        ||calendarKind!==undefined&&request.calendarKind!==calendarKind
        ||calendarEventId!==undefined&&request.calendarEventId!==calendarEventId)return null;
      const change=changes.find(row=>row.personId===request.personId);
      if(!change||selected.some(row=>row.personId===request.personId))return null;
      const originals=task.info.inputs.filter(({raw_response:event})=>{
        const p=event.payload;
        return event.source==='discord'&&change.sourceUrl===`https://discord.com/channels/${p.guild_id}/${p.channel_id}/${p.id}`
          ||event.source==='gmail'&&change.sourceUrl===`https://mail.google.com/mail/u/0/#all/${p.id}`;
      });
      if(!originals.length)return null;
      let immutable,identity;
      for(const {raw_response:event} of originals) {
        const p=event.payload,native={provider:event.source,sourceId:event.source_id,messageId:p.id};
        if(p.id!==event.event_id)return null;
        if(event.source==='discord') {
          if(!['message_created','message_updated'].includes(event.event_type)
            ||![p.guild_id,p.channel_id,p.id,p.author?.id].every(value=>typeof value==='string'&&/^[0-9]{1,20}$/.test(value)))return null;
          Object.assign(native,{guildId:p.guild_id,channelId:p.channel_id,authorId:p.author.id});
          identity={provider:'discord',providerUserId:p.author.id};
        } else {
          if(!['email_received','email_received_metadata'].includes(event.event_type)||!/^[a-fA-F0-9]{1,64}$/.test(p.id))return null;
          identity??={provider:'email'};
          const headers=p.payload?.headers;
          if(headers!==undefined) {
            if(!Array.isArray(headers))return null;
            const from=headers.filter(header=>typeof header?.name==='string'&&header.name.toLowerCase()==='from');
            const sender=from.length===1?sourceMailbox(from[0].value):null;
            if(!sender||identity.providerUserId!==undefined&&identity.providerUserId!==sender)return null;
            identity.providerUserId=sender;
          }
        }
        const key=canonicalJson(native);
        if(immutable!==undefined&&immutable!==key)return null;
        immutable=key;
      }
      selected.push({taskId,updatedAt:task.updated_at,personId:request.personId,sourceUrl:change.sourceUrl,
        original:structuredClone(originals[0]),identity,task:structuredClone(task)});
    }
    return selected;
  }
  const participationTasks=args=>selectParticipationTasks(args);
  function pendingTaskRead(task) {
    if(hasRead(task))return null;
    const history=cycle.getExecutionLog();
    const chains=[...taskFragmentOrigins].filter(([id,chain])=>chain.taskId===task.uuid&&chain.updatedAt===task.updated_at
      &&chain.complete===false&&Number.isSafeInteger(chain.nextOffset)&&chain.nextOffset>0&&chain.nextOffset<chain.totalChars
      &&history.some(row=>row.kind==='tool_result'&&['read_pending_task','read_context_fragment'].includes(row.tool)
        &&row.inputIds?.includes(task.uuid)&&row.result?.status==='ready'&&row.result.fragment?.id===id
        &&row.result.fragment.totalChars===chain.totalChars&&row.result.fragment.nextOffset===chain.nextOffset
        &&chain.offsets.has(row.result.fragment.offset)
        &&(row.tool==='read_pending_task'?row.arguments?.taskId===task.uuid:row.arguments?.id===id)))
      .sort((a,b)=>b[1].nextOffset-a[1].nextOffset);
    return {taskId:task.uuid,updatedAt:task.updated_at,...(chains.length?{fragment:{id:chains[0][0],nextOffset:chains[0][1].nextOffset}}:{})};
  }
  async function verifyParticipationTasks(args,selected) {
    const currentSelection=participationTasks(args);
    if(!currentSelection||canonicalJson(currentSelection)!==canonicalJson(selected))return false;
    return requireCycle(args.context)&&selected.every(binding=>{
      const task=tasks.get(binding.taskId);
      return current(task)&&task.updated_at===binding.updatedAt&&task.created_at===binding.task.created_at
        &&task.expires_at===binding.task.expires_at&&canonicalJson(task.info)===canonicalJson(binding.task.info);
    });
  }

  async function save(request,context,{inputs,identity,history}={}) {
    if(!requireCycle(context))return {status:'forbidden'};
    const updatingTaskId=request.taskId;
    if(request.taskId) {
      if(!hasRead(tasks.get(request.taskId))||!context.inputIds?.includes(request.taskId)||!current(tasks.get(request.taskId)))return {status:'forbidden'};
      identity=request.taskId;request=Object.fromEntries(Object.entries(request).filter(([key])=>key!=='taskId'));
    }
    const boundInputs=contextInputs(context.inputIds);
    if(!boundInputs)return {status:'forbidden'};
    const originals=uniqueInputs(inputs??boundInputs);
    if(!originals.length||originals.some(row=>!boundInputs.some(bound=>canonicalJson(bound)===canonicalJson(row))))return {status:'forbidden'};
    const executionHistory=history??cycle.getExecutionLog();
    const observedReferences=getEvidenceReferences();
    const dependencies=sourceIds({originals,executionHistory,batchContext:cycle.batchContext,observedReferences});
    if(!dependencies.length||dependencies.some(id=>!scope().includes(id)))return {status:'forbidden'};
    const uuid=identity??taskId(canonicalJson([originals.map(row=>row.uuid).sort(),request]));
    if(phase==='followup'&&!identity&&request.operation==='participation'
      &&['club','member'].includes(request.calendarKind)&&typeof request.calendarEventId==='string'&&request.calendarEventId.length>=5) {
      // A summary rewrite is not a second participation task. Check only tasks
      // actually read/bound by this call, with exact evidence and known targets;
      // do not merge distinct work or silently repair an omitted update ID.
      const snapshot=rows=>canonicalJson([...rows].sort((a,b)=>a.uuid.localeCompare(b.uuid)));
      const originalsSnapshot=snapshot(originals);
      for(const id of context.inputIds) {
        const task=tasks.get(id),prior=task?.info?.request;
        if(task?.uuid!==uuid&&hasRead(task)&&current(task)
          &&prior.operation==='participation'&&prior.calendarKind===request.calendarKind
          &&prior.calendarEventId===request.calendarEventId&&prior.personId===request.personId
          &&prior.buildingId===request.buildingId&&snapshot(task.info.inputs)===originalsSnapshot)
          return {status:'invalid_request',reason:'existing_task_requires_update'};
      }
    }
    // Stable generated IDs may already belong to old or mechanical work that
    // was intentionally absent from the model catalogue. Never overwrite it
    // using only a metadata hint, or omit its retained originals/history.
    const existing=await taskStore.read({leaseToken:cycle.leaseToken,allowedSourceIds:scope(),taskId:uuid,signal:context.signal});
    if(existing?.status!=='ready'&&existing?.status!=='not_found')return existing??{status:'unavailable'};
    const previous=existing.status==='ready'?existing.task:undefined;
    if(!previous&&(initialTaskIds.has(uuid)||tasks.has(uuid)||catalogue.has(uuid)))return {status:'conflict'};
    if(previous&&!current(previous)){forgetTask(uuid);return {status:'forbidden'};}
    if(previous&&updatingTaskId&&canonicalJson(previous)!==canonicalJson(tasks.get(uuid))) {
      rememberTask(previous);return {status:'conflict'};
    }
    const taskInputs=uniqueInputs([...(previous?.info.inputs||[]),...structuredClone(originals)]);
    const newThisCycle=createdTaskIds.has(uuid)||!previous&&!initialTaskIds.has(uuid);
    const info={version:1,sourceIds:[...new Set([...(previous?.info.sourceIds||[]),...dependencies])],references:references({previous:previous?.info.references,originals,executionHistory,batchContext:cycle.batchContext,observedReferences}),inputs:taskInputs,request:structuredClone(request),
      batchContext:structuredClone(cycle.batchContext??{}),executionHistory:mergeHistory(previous?.info.executionHistory,executionHistory,newThisCycle?taskInputs:undefined)};
    const result=await taskStore.save({leaseToken:cycle.leaseToken,allowedSourceIds:scope(),task:{uuid,info},
      ...(previous?{expectedUpdatedAt:previous.updated_at}:{}),signal:context.signal});
    if(result.status==='ready'){if(newThisCycle)createdTaskIds.add(uuid);rememberTask(result.task);disclosures.delete(uuid);touched.add(uuid);stopWitnesses.delete(uuid);latch(result.task);}
    return result.status==='ready'?{status:'ready',taskId:uuid,updated_at:result.task.updated_at,persisted:true}
      :{status:result.status,...(result.diagnostics?{diagnostics:result.diagnostics}:{})};
  }
  const tools=[
    {...definition('defer_task',promptText("tools/worker/tasks#defer.description"),taskProperties,['summary','operation']),
      execute:(args,context)=>save(args,context)},
    {...definition('read_pending_task',promptText("tools/worker/tasks#read.description"),{taskId:{type:'string',minLength:36,maxLength:36},detail:{type:'string',enum:['compact','full','history'],description:promptText("tools/worker/tasks#read.detail")},historySection:{type:'string',enum:['executionHistory','task'],description:promptText("tools/worker/tasks#read.history-section")},historyOffset:{type:'integer',minimum:0,maximum:56623104,description:promptText("tools/worker/tasks#read.history-offset")},expectedUpdatedAt:{type:'string',minLength:1,maxLength:64,description:promptText("tools/worker/tasks#read.expected-version")}},['taskId'],true),
      execute:async(args,context)=>{
        if(!requireCycle(context)||!eligibleCatalogue(catalogue.get(args.taskId)))return {status:'forbidden'};
        const detail=args.detail??'compact';
        if(!['compact','full','history'].includes(detail)||detail!=='history'&&(args.historyOffset!==undefined||args.historySection!==undefined)
          ||args.expectedUpdatedAt!==undefined&&(typeof args.expectedUpdatedAt!=='string'||args.expectedUpdatedAt.length>64||!Number.isFinite(Date.parse(args.expectedUpdatedAt))))return {status:'invalid_request'};
        if(!context.inputIds?.includes(args.taskId))return {status:'invalid_request',reason:'pending_task_fragment_scope',taskId:args.taskId,
          message:promptText("tools/worker/tasks#read.scope")};
        const selected=await taskStore.read({leaseToken:cycle.leaseToken,allowedSourceIds:scope(),taskId:args.taskId,signal:context.signal});
        if(selected?.status!=='ready'){if(selected?.status==='not_found')forgetTask(args.taskId);return selected??{status:'unavailable'};}
        const task=selected.task;if(!current(task)){forgetTask(args.taskId);return {status:'forbidden'};}
        rememberTask(task);
        if(args.expectedUpdatedAt!==undefined&&args.expectedUpdatedAt!==task.updated_at)return {status:'conflict'};
        if(detail==='history') {
          const result=historyPageResult(task,args);
          if(result.status==='ready')attemptedTasks.add(task.uuid);
          return result;
        }
        // Reuse only complete disclosure of this entire exact cache snapshot in
        // this phase. This does not bind a task again or refresh any read proof.
        if(disclosed(task,detail))return {status:'ready',alreadyRead:true,detail,taskId:task.uuid,updated_at:task.updated_at,resolutionOptions:resolutionOptions(task),resolutionNotice,
          request:Object.fromEntries(['operation','calendarKind','calendarEventId','personId','buildingId'].filter(key=>Object.hasOwn(task.info.request,key)).map(key=>[key,structuredClone(task.info.request[key])])),notice:promptText("tools/worker/tasks#read.already-read")};
        const readAt=cycle.getExecutionLog().length,projection=detail==='full'?{status:'ready',task:structuredClone(task)}:compactTaskResult(task),serialized=canonicalJson(projection);
        let result;
        try {result=fragments.bound(projection);}
        catch(error) {if(detail!=='full'||error?.message!=='context_limit')throw error;attemptedTasks.add(task.uuid);return historyPaginationRequired(task);}
        attemptedTasks.add(task.uuid);
        if(result.fragment?.encoding==='json-fragment'&&validUuid(result.fragment.id)) {
          // Optional history never revokes or refreshes a valid compact read of
          // this same private canonical snapshot, even if it stays fragmented.
          if(!hasRead(task))receipts.delete(task.uuid);
          taskFragmentOrigins.set(result.fragment.id,{taskId:task.uuid,updatedAt:task.updated_at,cycleId:cycle.id,phase,snapshot:canonicalJson(task),readAt,nextOffset:result.fragment.nextOffset,
            detail,serialized,totalChars:result.fragment.totalChars,offsets:new Set([0]),complete:false});
        } else {await grantRead(task,context.signal);disclose(task,readAt,undefined,detail,serialized);}
        return result;
      }},
    {...definition('resolve_pending_task',promptText("tools/worker/tasks#resolve.description"),{taskId:{type:'string',minLength:36,maxLength:36},outcome:{type:'string',enum:['completed','no_change_needed','source_missing']},reason:{type:'string',enum:['already_correct','no_actionable_request']}},['taskId','outcome']),
      execute:async(args,context)=>{
        const task=tasks.get(args.taskId),receipt=receipts.get(args.taskId);
        if(!requireCycle(context)||!receipt||!hasRead(task)||!current(task)||!context.inputIds?.includes(task.uuid))return {status:'forbidden'};
        if(args.outcome==='no_change_needed'?!['already_correct','no_actionable_request'].includes(args.reason):args.reason!==undefined)return {status:'invalid_request',reason:'invalid_resolution_reason'};
        const log=cycle.getExecutionLog().slice(receipt.readAt);
        const request=task.info.request||{};
        const successful=args.outcome==='completed'&&log.some(row=>{
          if(row.kind!=='tool_result'||!row.inputIds?.includes(task.uuid)
            ||!['upsert_map_event','upsert_calendar_event','upsert_member_plan','cancel_calendar_event','cancel_member_plan'].includes(row.tool)
            ||!['ready','ok','applied','completed','already_succeeded'].includes(row.result?.status))return false;
          const event=row.arguments?.event;
          if(request.calendarEventId&&event?.source_record_id!==request.calendarEventId&&row.result?.eventId!==request.calendarEventId)return false;
          if(request.personId&&!row.arguments?.people?.some(person=>person.person_id===request.personId))return false;
          if(request.buildingId&&!row.arguments?.buildings?.some(building=>building.building_id===request.buildingId))return false;
          if(request.calendarKind&&row.tool.includes('member')!== (request.calendarKind==='member')&&row.tool!=='upsert_map_event')return false;
          return Boolean(event||row.result?.eventId);
        });
        const verified=verifyResolution?await verifyResolution({task,outcome:args.outcome,reason:args.reason,history:log,signal:context.signal}):args.outcome==='completed'&&successful;
        if(!verified)return {status:'invalid_request',reason:'confirmed_outcome_required'};
        const latest=await taskStore.read({leaseToken:cycle.leaseToken,allowedSourceIds:scope(),taskId:task.uuid,signal:context.signal});
        if(latest?.status!=='ready'){if(latest?.status==='not_found')forgetTask(task.uuid);return latest??{status:'unavailable'};}
        if(!current(latest.task)||canonicalJson(latest.task)!==canonicalJson(task)) {
          if(current(latest.task))rememberTask(latest.task);else forgetTask(task.uuid);
          return {status:'conflict'};
        }
        const result=await taskStore.resolve({leaseToken:cycle.leaseToken,allowedSourceIds:scope(),taskId:task.uuid,expectedUpdatedAt:task.updated_at,signal:context.signal});
        if(result.status==='ready'){tasks.delete(task.uuid);catalogue.delete(task.uuid);receipts.delete(task.uuid);disclosures.delete(task.uuid);touched.delete(task.uuid);obligations.delete(task.uuid);stopWitnesses.delete(task.uuid);createdTaskIds.delete(task.uuid);oldTaskRetries.delete(task.uuid);}
        return result.status==='ready'?{...result,resolutionOutcome:args.outcome,...(args.reason?{reason:args.reason}:{})}:result;
      }},
  ];
  function participationDependencies(context) {
    if(!requireCycle(context)||phase!=='followup')return [];
    const selected=[];
    for(const id of context.inputIds||[]) {
      const task=tasks.get(id);if(!knownParticipation(task))continue;
      const original=task.info.inputs[0]?.raw_response,p=original?.payload;
      const sourceUrl=original?.source==='discord'?`https://discord.com/channels/${p?.guild_id}/${p?.channel_id}/${p?.id}`
        :original?.source==='gmail'?`https://mail.google.com/mail/u/0/#all/${p?.id}`:null;
      if(!sourceUrl)continue;
      const one=participationTasks({context:{...context,inputIds:[id]},calendarKind:task.info.request.calendarKind,
        calendarEventId:task.info.request.calendarEventId,changes:[{personId:task.info.request.personId,sourceUrl}]});
      if(one)selected.push(...one);
    }
    return selected;
  }
  function invalidateParticipationOutcome({context,dependency}) {
    if(!requireCycle(context)||phase!=='followup'||typeof dependency!=='string'||dependency.length>2500)return false;
    // Invalidation can only remove stop permission. An authorized peer read
    // need not acquire this task's read/action proof to prove recovery.
    for(const witnesses of stopWitnesses.values())witnesses.delete(dependency);
    return true;
  }
  async function recordParticipationOutcome({context,binding,dependency,reason=null}) {
    if(!requireCycle(context)||phase!=='followup'||typeof dependency!=='string'||dependency.length>2500)return false;
    const live=participationDependencies(context).find(row=>row.taskId===binding?.taskId);
    if(!live||canonicalJson(live)!==canonicalJson(binding))return false;
    const task=tasks.get(binding.taskId);
    if(reason===null)return invalidateParticipationOutcome({context,dependency});
    if(!['identity_unavailable','source_unavailable','source_changed','calendar_unavailable','calendar_cancelled',
      'map_unavailable','map_missing','human_modified','map_changed_after_read','unchanged_participation'].includes(reason))return false;
    const selection={context:{...context,inputIds:[task.uuid]},calendarKind:task.info.request.calendarKind,
      calendarEventId:task.info.request.calendarEventId,changes:[{personId:binding.personId,sourceUrl:binding.sourceUrl}]};
    if(!await verifyParticipationTasks(selection,[binding]))return false;
    const witnesses=stopWitnesses.get(task.uuid)||new Map();
    witnesses.set(dependency,{updatedAt:task.updated_at,info:canonicalJson(task.info),reason});stopWitnesses.set(task.uuid,witnesses);return true;
  }
  async function readTaskFragment(args,context,read) {
    const chain=taskFragmentOrigins.get(args.id);if(!chain)return read(args,context);
    const task=tasks.get(chain.taskId);
    if(!requireCycle(context)||!current(task)||task.updated_at!==chain.updatedAt||chain.cycleId!==cycle.id||chain.phase!==phase
      ||chain.snapshot!==canonicalJson(task))return {status:'invalid_request',reason:'pending_task_fragment_stale',taskId:chain.taskId};
    if(!context.inputIds?.includes(chain.taskId))return {status:'invalid_request',reason:'pending_task_fragment_scope',taskId:chain.taskId,
      message:promptText("tools/worker/tasks#fragment.scope")};
    if(args.offset!==chain.nextOffset&&!chain.offsets.has(args.offset))return {status:'invalid_request',reason:'pending_task_fragment_offset',taskId:chain.taskId,
      nextOffset:chain.nextOffset,message:promptText("tools/worker/tasks#fragment.next-offset")};
    const result=await read(args,context),part=result?.fragment;
    if(result?.status!=='ready'||part?.id!==args.id||part.encoding!=='json-fragment'||part.offset!==args.offset||part.totalChars!==chain.totalChars
      ||typeof part.data!=='string'||part.data!==chain.serialized.slice(part.offset,part.offset+part.data.length)
      ||(part.nextOffset===null?part.offset+part.data.length!==part.totalChars:part.nextOffset!==part.offset+part.data.length))return {status:'invalid_request'};
    if(args.offset===chain.nextOffset) {
      chain.offsets.add(args.offset);chain.nextOffset=part.nextOffset;
      if(part.nextOffset===null) {await grantRead(task,context.signal);chain.complete=true;disclose(task,chain.readAt,args.id,chain.detail,chain.serialized);}
    }
    return result;
  }
  const pipeline={
    async validateInitialFinish({principal:actor,signal,handledInputIds,noChangeInputIds=[],missingInputIds=[]}) {
      if(!requireCycle({principal:actor,signal})||phase!=='initial')return {status:'forbidden'};
      const claimed=new Map(cycle.inputs.map(input=>[input.uuid,input]));
      if(!Array.isArray(handledInputIds)||!Array.isArray(noChangeInputIds)||!Array.isArray(missingInputIds)
        ||new Set(handledInputIds).size!==handledInputIds.length||new Set(noChangeInputIds).size!==noChangeInputIds.length||new Set(missingInputIds).size!==missingInputIds.length
        ||handledInputIds.some(id=>!claimed.has(id))||noChangeInputIds.some(id=>!handledInputIds.includes(id))
        ||missingInputIds.some(id=>!handledInputIds.includes(id)||noChangeInputIds.includes(id)))
        return {status:'invalid_request',reason:'invalid_completion_disposition'};
      for(const id of missingInputIds)if(typeof verifyMissingInput!=='function'||!await verifyMissingInput({input:claimed.get(id),signal}))
        return {status:'invalid_request',reason:'confirmed_missing_original_required'};
      const covered=new Set();
      for(const input of getInitialWriteCoverage())if(claimed.has(input?.uuid)
        &&canonicalJson(input)===canonicalJson(claimed.get(input.uuid)))covered.add(input.uuid);
      for(const [id,task] of tasks) {
        if(!task.info.inputs.some(input=>claimed.has(input.uuid)))continue;
        const latest=await taskStore.read({leaseToken:cycle.leaseToken,allowedSourceIds:scope(),taskId:id,signal});
        if(latest?.status==='not_found')continue;
        if(latest?.status!=='ready')return latest??{status:'unavailable'};
        const fresh=latest.task;
        if(!current(fresh)||!current(task)||canonicalJson(fresh)!==canonicalJson(task))continue;
        for(const input of fresh.info.inputs)if(claimed.has(input.uuid)
          &&canonicalJson(input)===canonicalJson(claimed.get(input.uuid)))covered.add(input.uuid);
      }
      if(noChangeInputIds.some(id=>covered.has(id)))return {status:'invalid_request',reason:'invalid_completion_disposition'};
      const missing=handledInputIds.filter(id=>!covered.has(id)&&!noChangeInputIds.includes(id)&&!missingInputIds.includes(id));
      return missing.length?{status:'pending',reason:'uncovered_inputs',uncoveredInputIds:missing.slice(0,20)}:{status:'ready'};
    },
    preflightParticipation({context,changes}) {
      const selected=selectParticipationTasks({context,changes},false);
      // This is a read-prerequisite diagnostic only. The actual adapter still
      // independently verifies map/provider targets and every mutation guard.
      if(!selected||new Set(selected.map(row=>canonicalJson([row.task.info.request.calendarKind,row.task.info.request.calendarEventId]))).size!==1)return {status:'ready'};
      const requiredTaskReads=selected.map(row=>pendingTaskRead(tasks.get(row.taskId))).filter(Boolean);
      return requiredTaskReads.length?{status:'read_required',requiredTaskReads}:{status:'ready'};
    },
    async validateFinish(context) {
      if(!requireCycle(context)||phase!=='followup')return {status:'forbidden'};
      const alreadyCorrect=[...tasks.values()].filter(task=>followupScope.has(task.uuid)&&current(task)&&hasRead(task)).filter(task=>{
        const witnesses=[...(stopWitnesses.get(task.uuid)?.values()||[])].filter(witness=>witness.updatedAt===task.updated_at&&witness.info===canonicalJson(task.info));
        return witnesses.length>0&&witnesses.every(witness=>witness.reason==='unchanged_participation');
      });
      if(alreadyCorrect.length)return {status:'pending',reason:'no_change_resolution_required',taskIds:alreadyCorrect.slice(0,20).map(task=>task.uuid),remainingCount:alreadyCorrect.length,
        resolutionOptions:alreadyCorrect.slice(0,20).map(task=>({taskId:task.uuid,outcome:'no_change_needed',reason:'already_correct'})),
        message:promptText("tools/map/participation#already-correct-tasks")};
      const candidates=[...obligations].filter(id=>followupScope.has(id));
      if(!candidates.length)return {status:'ready'};
      // Saved-cache freshness only: this check never reads a source/provider.
      const remaining=[];
      for(const id of candidates) {
        const latest=await taskStore.read({leaseToken:cycle.leaseToken,allowedSourceIds:scope(),taskId:id,signal:context.signal});
        if(latest?.status!=='ready'&&latest?.status!=='not_found')return latest??{status:'unavailable'};
        let task=tasks.get(id);const fresh=latest.task;
        if(!fresh||!current(fresh)) {forgetTask(id);remaining.push(id);continue;}
        rememberTask(fresh);task=fresh;
        if(!hasRead(task)||![...(stopWitnesses.get(id)?.values()||[])].some(witness=>witness.updatedAt===task.updated_at&&witness.info===canonicalJson(task.info)))remaining.push(id);
      }
      return remaining.length?{status:'pending',reason:'unfinished_participation',taskIds:remaining.slice(0,20),remainingCount:remaining.length,
        message:promptText("tools/worker/tasks#finish.current-cycle-incomplete")}:{status:'ready'};
    },
    recordApiResult:entry=>cycle.recordExecution({kind:'api_response',stage:'followup',...entry}),
    async beginCycle({leaseToken,inputs,recordExecution,getExecutionLog,signal}) {
      catalogue.clear();tasks.clear();touched.clear();receipts.clear();taskFragmentOrigins.clear();disclosures.clear();obligations.clear();stopWitnesses.clear();createdTaskIds.clear();initialTaskIds.clear();historyPageOrigins.clear();attemptedTasks.clear();followupScope.clear();phase='initial';
      cycle={id:randomUUID(),leaseToken,inputs:structuredClone(inputs),recordExecution,getExecutionLog};
      if(taskStore.configured===false||typeof taskStore.catalogue!=='function'||typeof taskStore.read!=='function')throw Error('not_configured');
      const result=await refreshCatalogue(signal);
      if(result?.status!=='ready')storageFailure(result);
      for(const [id,retry]of oldTaskRetries) {
        const entry=catalogue.get(id);
        if(!eligibleCatalogue(entry)||retry.updatedAt!==entry.updated_at||retry.until<=new Date(now()).getTime())oldTaskRetries.delete(id);
      }
      for(const id of catalogue.keys())initialTaskIds.add(id);
      const candidates=await loadCoverageCandidates(cycle.inputs,signal);
      if(candidates.status!=='ready')storageFailure(candidates);
    },
    getInitialTaskCoverage() {
      if(!cycle||phase!=='initial')return [];
      return cycle.inputs.map(input=>({inputId:input.uuid,taskCount:[...tasks.values()].filter(task=>current(task)
        &&task.info.inputs.some(saved=>canonicalJson(saved)===canonicalJson(input))).length})).filter(row=>row.taskCount>0);
    },
    getConversationSnapshot() {
      if(!cycle)return {status:'not_configured',phase,tasks:[],fragments:[],historyPages:[],catalogue:[]};
      const compactIds=new Set([...tasks.values()].filter(task=>current(task)&&hasRead(task)&&disclosed(task,'compact')).map(task=>task.uuid));
      return {status:'ready',phase,
        tasks:[...compactIds].map(id=>({taskId:id,updatedAt:tasks.get(id).updated_at,compactDisclosed:true,compact:compactTaskResult(tasks.get(id))})),
        fragments:[...taskFragmentOrigins].filter(([,chain])=>chain.cycleId===cycle.id&&chain.phase===phase&&current(tasks.get(chain.taskId))&&tasks.get(chain.taskId).updated_at===chain.updatedAt)
          .map(([id,chain])=>({id,taskId:chain.taskId,updatedAt:chain.updatedAt,detail:chain.detail,nextOffset:chain.nextOffset,totalChars:chain.totalChars,complete:chain.complete,offsets:[...chain.offsets],compactDisclosed:compactIds.has(chain.taskId)})),
        historyPages:[...historyPageOrigins].map(([key,value])=>{const [taskId,updatedAt,section,offset]=JSON.parse(key);return {taskId,updatedAt,section,offset,totalChars:value.totalChars,nextOffset:value.nextOffset,compactDisclosed:compactIds.has(taskId)};})
          .filter(page=>current(tasks.get(page.taskId))&&tasks.get(page.taskId).updated_at===page.updatedAt),
        catalogue:manifest().map(({uuid,updated_at,request,currentCycle})=>({taskId:uuid,updatedAt:updated_at,request:structuredClone(request),currentCycle}))};
    },
    setBatchContext(context){if(cycle)cycle.batchContext=structuredClone(context);},
    async afterInitial({handledInputIds,inputs,signal,executionLog}) {
      const context={principal,inputIds:inputs.map(row=>row.uuid),signal};
      const latest=await refreshCatalogue(signal);
      if(latest.status!=='ready')return latest;
      const unfinished=inputs.filter(row=>!handledInputIds.includes(row.uuid));
      const candidates=await loadCoverageCandidates(unfinished,signal);
      if(candidates.status!=='ready')return candidates;
      // At an initial model cap, unfinished originals remain queued. Persist a
      // checkpoint only when no current task already retains that exact original.
      // Reusing saved work never marks an omitted queue input completed.
      for(const input of unfinished) {
        if([...tasks.values()].some(task=>eligibleCatalogue(catalogue.get(task.uuid))&&catalogue.get(task.uuid).inputIds.includes(input.uuid)
          &&current(task)&&task.info.inputs.some(saved=>canonicalJson(saved)===canonicalJson(input))))continue;
        const result=await save({summary:promptText("tools/worker/tasks#unfinished-initial-summary"),operation:'source_review'},context,
          {inputs:[input],identity:taskId(`unfinished:${input.uuid}`),history:executionLog});
        if(result.status!=='ready')return result;
      }
      const result=await refreshCatalogue(signal);
      if(result.status!=='ready')return result;
      const eligible=[...catalogue.values()].filter(eligibleCatalogue),deferred=[];
      followupScope=new Set(eligible.filter(task=>{if(availableForFollowup(task))return true;deferred.push(task);return false;}).map(task=>task.uuid));
      for(const task of catalogue.values())if(followupScope.has(task.uuid))latch(task);
      phase='followup';disclosures.clear();
      const orderedTasks=manifest();
      return {status:'ready',inputIds:orderedTasks.map(task=>task.uuid),followupRequired:orderedTasks.length>0,context:{tasks:orderedTasks,taskCount:orderedTasks.length,
        deferredTaskCount:deferred.length,nextTaskRetryAt:deferred.length?new Date(Math.min(...deferred.map(task=>oldTaskRetries.get(task.uuid).until))).toISOString():null,
        executionHistory:fragments.bound({status:'ready',history:cycle.getExecutionLog().filter(row=>['api_response','api_result'].includes(row.kind)),
          notice:promptText("agents/update/context#followup.execution-history")}),
        apiResults:{status:'ready',notice:promptText("agents/update/context#followup.sync-result")},
        notice:promptText("agents/update/context#followup.task-catalogue")}};
    },
    async finishCycle({signal,executionLog}) {
      // Only tasks with confirmed new outcomes are checkpointed; unrelated task
      // timestamps/JSON remain byte-for-byte unchanged.
      for(const task of tasks.values()) {
        if(!current(task))continue;
        if(touched.has(task.uuid)) {
          const latest=await taskStore.read({leaseToken:cycle.leaseToken,allowedSourceIds:scope(),taskId:task.uuid,signal});
          if(latest?.status!=='ready')return latest??{status:'unavailable'};
          if(!current(latest.task)||canonicalJson(latest.task)!==canonicalJson(task))return {status:'conflict'};
          const observedReferences=getEvidenceReferences();
          const info={...task.info,executionHistory:mergeHistory(task.info.executionHistory,executionLog,createdTaskIds.has(task.uuid)?task.info.inputs:undefined),references:references({info:task.info,executionLog,observedReferences}),
            sourceIds:[...new Set([...task.info.sourceIds,...sourceIds({executionLog,observedReferences})])]};
          const result=await taskStore.save({leaseToken:cycle.leaseToken,allowedSourceIds:scope(),task:{uuid:task.uuid,info},expectedUpdatedAt:task.updated_at,signal});
          if(result.status!=='ready')return result;
          tasks.set(task.uuid,result.task);continue;
        }
        if(!hasRead(task))continue;
        const newHistory=executionLog.slice(receipts.get(task.uuid).readAt).filter(row=>row.kind==='tool_result'&&row.inputIds?.includes(task.uuid)&&row.tool!=='read_pending_task');
        if(!newHistory.length)continue;
        const latest=await taskStore.read({leaseToken:cycle.leaseToken,allowedSourceIds:scope(),taskId:task.uuid,signal});
        if(latest?.status!=='ready')return latest??{status:'unavailable'};
        if(!current(latest.task)||canonicalJson(latest.task)!==canonicalJson(task))return {status:'conflict'};
        const mergedHistory=mergeHistory(task.info.executionHistory,newHistory,createdTaskIds.has(task.uuid)?task.info.inputs:undefined),observedReferences=getEvidenceReferences();
        const info={...task.info,executionHistory:mergedHistory,sourceIds:[...new Set([...task.info.sourceIds,...sourceIds({mergedHistory,observedReferences})])],
          references:references({info:task.info,mergedHistory,observedReferences})};
        const result=await taskStore.save({leaseToken:cycle.leaseToken,allowedSourceIds:scope(),task:{uuid:task.uuid,info},expectedUpdatedAt:task.updated_at,signal});
        if(result.status!=='ready')return result;
        tasks.set(task.uuid,result.task);
      }
      // Do not delay anything after a partial/failed checkpoint. Only a fully
      // saved cycle may defer an actually inspected, still-unresolved old row.
      const time=new Date(now()).getTime();
      for(const id of attemptedTasks) {
        const task=tasks.get(id);
        if(!task||!current(task)||currentCycleTask(task)){oldTaskRetries.delete(id);continue;}
        oldTaskRetries.set(id,{updatedAt:task.updated_at,until:Math.min(time+OLD_TASK_RETRY_MS,Date.parse(task.expires_at))});
        while(oldTaskRetries.size>200)oldTaskRetries.delete(oldTaskRetries.keys().next().value);
      }
      return {status:'ready'};
    },
  };
  return {pipeline,tools,participationTasks,verifyParticipationTasks,participationDependencies,recordParticipationOutcome,invalidateParticipationOutcome,readTaskFragment,
    getBoundOriginals:context=>requireCycle(context)&&Array.isArray(context.inputIds)
      &&context.inputIds.every(id=>phase==='initial'?cycle.inputs.some(row=>row.uuid===id):followupScope.has(id))
      ?structuredClone(contextInputs(context.inputIds)):null,
    get phase(){return phase;},cleanup(){cycle=undefined;catalogue.clear();tasks.clear();receipts.clear();touched.clear();taskFragmentOrigins.clear();disclosures.clear();obligations.clear();stopWitnesses.clear();createdTaskIds.clear();initialTaskIds.clear();historyPageOrigins.clear();attemptedTasks.clear();followupScope.clear();},
    getExecutionLog:()=>cycle?.getExecutionLog()??[],get taskCount(){return [...catalogue.values()].filter(eligibleCatalogue).length;}};
}
