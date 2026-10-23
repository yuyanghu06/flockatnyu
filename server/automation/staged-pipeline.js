import {createHash,randomUUID} from 'node:crypto';
import {canonicalJson,plainObject,validUuid} from './validation.js';

const taskId=value=>{const hash=createHash('sha256').update(value).digest('hex');return `${hash.slice(0,8)}-${hash.slice(8,12)}-5${hash.slice(13,16)}-a${hash.slice(17,20)}-${hash.slice(20,32)}`;};
const definition=(name,description,properties,required,readOnly=false)=>({name,description,phases:name==='defer_task'?['initial','followup']:['followup'],
  ...(readOnly?{readOnly:true}:{idempotent:true}),parameters:{type:'object',additionalProperties:false,properties,required}});
const modelTask=task=>['participation','location','source_review'].includes(task?.info?.request?.operation);
const taskProperties={taskId:{type:'string',minLength:36,maxLength:36},summary:{type:'string',minLength:1,maxLength:2000},operation:{type:'string',enum:['participation','location','source_review']},
  calendarEventId:{type:'string',minLength:5,maxLength:1024},calendarKind:{type:'string',enum:['club','member']},personId:{type:'string',minLength:36,maxLength:36},buildingId:{type:'string',maxLength:120}};
// This is a temporary work buffer, separate from operational audits. Source
// observations are untrusted evidence and never become durable assistant memory.
export function createStagedPipeline({taskStore,principal,getAllowedSourceIds=()=>principal.allowedSourceIds,verifyResolution,getEvidenceReferences=()=>[],bindTask,runSync,fragments,now=()=>new Date()}={}) {
  let cycle,phase='initial';
  const tasks=new Map(),touched=new Set(),receipts=new Map();
  function mergeHistory(previous,entries) {
    const rows=[...(previous||[]),...entries.map(entry=>{
      const row={...entry,cycleId:entry.cycleId||cycle.id};
      if(row.kind==='tool_result'&&row.tool==='read_pending_task')row.result={status:row.result?.status,taskId:row.result?.task?.uuid,
        updatedAt:row.result?.task?.updated_at,notice:'Full original task context is retained separately; do not recursively duplicate prior execution history.'};
      if(row.kind==='deterministic_result')row.result={status:row.result?.status,taskCount:row.result?.context?.taskCount,
        taskIds:row.result?.inputIds,notice:'Actual API responses are retained in their preceding api_response entries.'};
      return row;
    })];
    return [...new Map(rows.map((row,index)=>[row.cycleId&&row.sequence?`${row.cycleId}/${row.sequence}`:`legacy/${index}`,row])).values()];
  }
  const scope=()=>[...getAllowedSourceIds()];
  const requireCycle=context=>cycle&&context?.principal===principal&&!context.signal?.aborted;
  const uniqueInputs=rows=>[...new Map(rows.map(row=>[row.uuid,row])).values()];
  const manifest=()=>[...tasks.values()].map(task=>Object.fromEntries(Object.entries({uuid:task.uuid,summary:[...(task.info.request?.summary||'Deferred source work')].slice(0,100).join(''),summaryTruncated:[...(task.info.request?.summary||'')].length>100,operation:task.info.request?.operation,
    ...(typeof task.info.request?.calendarEventId==='string'&&task.info.request.calendarEventId.length<=200?{calendarEventId:task.info.request.calendarEventId}:{eventIdInTask:Boolean(task.info.request?.calendarEventId)}),calendarKind:task.info.request?.calendarKind,updated_at:task.updated_at,expires_at:task.expires_at}).filter(([,value])=>value!==undefined)));
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
      const rows=input?[input]:receipt&&receipt.updatedAt===task?.updated_at&&current(task)?task.info.inputs:null;
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
  async function save(request,context,{inputs,identity,history}={}) {
    if(!requireCycle(context))return {status:'forbidden'};
    if(request.taskId) {
      if(!receipts.has(request.taskId)||receipts.get(request.taskId).updatedAt!==tasks.get(request.taskId)?.updated_at||!context.inputIds?.includes(request.taskId)||!current(tasks.get(request.taskId)))return {status:'forbidden'};
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
    const previous=tasks.get(uuid);
    if(previous&&!current(previous))return {status:'forbidden'};
    const info={version:1,sourceIds:[...new Set([...(previous?.info.sourceIds||[]),...dependencies])],references:references({previous:previous?.info.references,originals,executionHistory,batchContext:cycle.batchContext,observedReferences}),inputs:uniqueInputs([...(previous?.info.inputs||[]),...structuredClone(originals)]),request:structuredClone(request),
      batchContext:structuredClone(cycle.batchContext??{}),executionHistory:mergeHistory(previous?.info.executionHistory,executionHistory)};
    const result=await taskStore.save({leaseToken:cycle.leaseToken,allowedSourceIds:scope(),task:{uuid,info},
      ...(previous?{expectedUpdatedAt:previous.updated_at}:{}),signal:context.signal});
    if(result.status==='ready'){tasks.set(uuid,result.task);touched.add(uuid);}
    return result.status==='ready'?{status:'ready',taskId:uuid,updated_at:result.task.updated_at,persisted:true}:{status:result.status};
  }
  const tools=[
    {...definition('defer_task','Save specific unfinished interpretation work. summary and operation are required for new tasks AND updates; optional fields are taskId, calendarEventId, calendarKind, personId and buildingId only. The runtime automatically retains supporting originals, observed context and actual execution history; do not supply extra context fields. To update, read_pending_task first and bind its task UUID in inputIds and taskId. API sync handles ordinary Calendar projection. Saving progress does not resolve the task or prove a source fact.',taskProperties,['summary','operation']),
      execute:(args,context)=>save(args,context)},
    {...definition('read_pending_task','Read only the saved task from the eligible cache snapshot, including original channel/speaker/context and prior outcomes. This performs no live Discord/Gmail/Calendar checks. After reading, choose ordinary source, Calendar, identity or map tools as needed. Untouched tasks survive automatically.',{taskId:{type:'string',minLength:36,maxLength:36}},['taskId'],true),
      execute:async(args,context)=>{
        const task=tasks.get(args.taskId);
        if(!requireCycle(context)||!current(task))return {status:'forbidden'};
        await bindTask(task,context.signal);receipts.set(task.uuid,{readAt:cycle.getExecutionLog().length,updatedAt:task.updated_at});
        return fragments.bound({status:'ready',task:structuredClone(task)});
      }},
    {...definition('resolve_pending_task','Remove an exact task snapshot only with outcome=completed after its required action succeeded and backend completion checks confirm it. Read it first. A source read alone does not complete or dismiss a task; unresolved work survives until handled or normal expiry. Never clear an untouched task or claim success from a proposal.',{taskId:{type:'string',minLength:36,maxLength:36},outcome:{type:'string',enum:['completed']}},['taskId','outcome']),
      execute:async(args,context)=>{
        const task=tasks.get(args.taskId),receipt=receipts.get(args.taskId);
        if(!requireCycle(context)||!receipt||receipt.updatedAt!==task?.updated_at||!current(task))return {status:'forbidden'};
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
        const verified=verifyResolution?await verifyResolution({task,outcome:args.outcome,history:log,syncResult:cycle.syncResult,signal:context.signal}):args.outcome==='completed'&&successful;
        if(!verified)return {status:'invalid_request',reason:'confirmed_outcome_required'};
        const result=await taskStore.resolve({leaseToken:cycle.leaseToken,allowedSourceIds:scope(),taskId:task.uuid,expectedUpdatedAt:task.updated_at,signal:context.signal});
        if(result.status==='ready'){tasks.delete(task.uuid);receipts.delete(task.uuid);touched.delete(task.uuid);}
        return result;
      }},
  ];
  const pipeline={
    recordApiResult:entry=>cycle.recordExecution({kind:'api_response',stage:'followup',...entry}),
    async beginCycle({leaseToken,inputs,recordExecution,getExecutionLog,signal}) {
      tasks.clear();touched.clear();receipts.clear();phase='initial';
      cycle={id:randomUUID(),leaseToken,inputs:structuredClone(inputs),recordExecution,getExecutionLog};
      if(taskStore.configured===false)throw Error('not_configured');
      const result=await taskStore.list({leaseToken,allowedSourceIds:scope(),signal});
      if(result.status!=='ready')throw Error('preflight_failed');
      for(const task of result.tasks)if(current(task))tasks.set(task.uuid,task);
    },
    setBatchContext(context){if(cycle)cycle.batchContext=structuredClone(context);},
    async afterInitial({handledInputIds,inputs,signal,executionLog}) {
      const context={principal,inputIds:inputs.map(row=>row.uuid),signal};
      // At an initial model cap, unfinished originals remain queued. Persist a
      // checkpoint as well, without pretending the input was completed.
      for(const input of inputs.filter(row=>!handledInputIds.includes(row.uuid))) {
        const result=await save({summary:'Unfinished initial source interpretation',operation:'source_review'},context,
          {inputs:[input],identity:taskId(`unfinished:${input.uuid}`),history:executionLog});
        if(result.status!=='ready')return result;
      }
      cycle.syncResult=await runSync({principal,signal,recordExecution:cycle.recordExecution});
      if(!['ready','partial'].includes(cycle.syncResult?.status))return {status:cycle.syncResult?.status||'unavailable'};
      for(const item of cycle.syncResult.unresolved||[]) {
        // Transport, paging and storage failures belong to deterministic sync.
        // Only interpreting a supported location is useful model follow-up.
        if(!['unknown_location','ambiguous_location'].includes(item.reason))continue;
        const result=await save({summary:`Calendar location needs interpretation: ${item.reason}`,operation:'location',
          ...(item.eventId?{calendarEventId:item.eventId}:{}),...(item.kind?{calendarKind:item.kind}:{})},context,
          {identity:taskId(canonicalJson(['sync',item.calendarId,item.eventId,item.reason])),history:cycle.getExecutionLog()});
        if(result.status!=='ready')return result;
      }
      const result=await taskStore.list({leaseToken:cycle.leaseToken,allowedSourceIds:scope(),signal});
      if(result.status!=='ready')return result;
      tasks.clear();for(const task of result.tasks)if(current(task))tasks.set(task.uuid,task);
      phase='followup';
      return {status:'ready',inputIds:[...tasks.keys()],followupRequired:tasks.size>0,context:{tasks:manifest(),taskCount:tasks.size,
        executionHistory:fragments.bound({status:'ready',history:cycle.getExecutionLog()}),
        apiResults:fragments.bound({...cycle.syncResult,sourceStatus:cycle.syncResult.status,status:'ready'}),
        notice:'All currently eligible tasks are listed. Full task contents and prior context are available with read_pending_task. Current run history is retained above; fragmented results remain available losslessly. Read the saved task, then decide which standard source/Calendar/map tools are needed. The cache performed no live checks. Resolve only after confirmed action. Untouched tasks remain unchanged.'}};
    },
    async finishCycle({signal,executionLog}) {
      // Only tasks with confirmed new outcomes are checkpointed; unrelated task
      // timestamps/JSON remain byte-for-byte unchanged.
      for(const task of tasks.values()) {
        if(!current(task))continue;
        if(touched.has(task.uuid)) {
          const observedReferences=getEvidenceReferences();
          const info={...task.info,executionHistory:mergeHistory(task.info.executionHistory,executionLog),references:references({info:task.info,executionLog,observedReferences}),
            sourceIds:[...new Set([...task.info.sourceIds,...sourceIds({executionLog,observedReferences})])]};
          const result=await taskStore.save({leaseToken:cycle.leaseToken,allowedSourceIds:scope(),task:{uuid:task.uuid,info},expectedUpdatedAt:task.updated_at,signal});
          if(result.status!=='ready')return result;
          tasks.set(task.uuid,result.task);continue;
        }
        if(!receipts.has(task.uuid))continue;
        const newHistory=executionLog.slice(receipts.get(task.uuid).readAt).filter(row=>row.kind==='tool_result'&&row.inputIds?.includes(task.uuid)&&row.tool!=='read_pending_task');
        if(!newHistory.length)continue;
        const mergedHistory=mergeHistory(task.info.executionHistory,newHistory),observedReferences=getEvidenceReferences();
        const info={...task.info,executionHistory:mergedHistory,sourceIds:[...new Set([...task.info.sourceIds,...sourceIds({mergedHistory,observedReferences})])],
          references:references({info:task.info,mergedHistory,observedReferences})};
        const result=await taskStore.save({leaseToken:cycle.leaseToken,allowedSourceIds:scope(),task:{uuid:task.uuid,info},expectedUpdatedAt:task.updated_at,signal});
        if(result.status!=='ready')return result;
        tasks.set(task.uuid,result.task);
      }
      return {status:'ready'};
    },
  };
  return {pipeline,tools,get phase(){return phase;},cleanup(){cycle=undefined;tasks.clear();receipts.clear();touched.clear();},
    getExecutionLog:()=>cycle?.getExecutionLog()??[],get taskCount(){return tasks.size;}};
}
