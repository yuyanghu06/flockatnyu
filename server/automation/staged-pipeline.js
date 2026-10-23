import {createHash,randomUUID} from 'node:crypto';
import {canonicalJson,plainObject,validUuid} from './validation.js';
import {sourceMailbox} from '../google/mailbox.js';

const taskId=value=>{const hash=createHash('sha256').update(value).digest('hex');return `${hash.slice(0,8)}-${hash.slice(8,12)}-5${hash.slice(13,16)}-a${hash.slice(17,20)}-${hash.slice(20,32)}`;};
const definition=(name,description,properties,required,readOnly=false)=>({name,description,phases:name==='defer_task'?['initial','followup']:['followup'],
  ...(readOnly?{readOnly:true}:{idempotent:true}),parameters:{type:'object',additionalProperties:false,properties,required}});
const modelTask=task=>['participation','location','source_review'].includes(task?.info?.request?.operation);
const taskProperties={taskId:{type:'string',minLength:36,maxLength:36},summary:{type:'string',minLength:1,maxLength:2000},operation:{type:'string',enum:['participation','location','source_review']},
  calendarEventId:{type:'string',minLength:5,maxLength:1024,description:'Exact provider occurrence ID: copy map event.source_record_id or Calendar result.eventId. Never copy the map event.id UUID; no automatic ID conversion.'},calendarKind:{type:'string',enum:['club','member']},personId:{type:'string',minLength:36,maxLength:36,description:'Copy the complete exact person.id from this speaker\'s successful lookup_map_person. Never shorten/rebuild it or use a queue/task ref.'},buildingId:{type:'string',maxLength:120}};
// This is a temporary work buffer, separate from operational audits. Source
// observations are untrusted evidence and never become durable assistant memory.
export function createStagedPipeline({taskStore,principal,getAllowedSourceIds=()=>principal.allowedSourceIds,verifyResolution,getEvidenceReferences=()=>[],getInitialWriteCoverage=()=>[],bindTask,fragments,now=()=>new Date()}={}) {
  let cycle,phase='initial';
  const tasks=new Map(),touched=new Set(),receipts=new Map(),taskFragmentOrigins=new Map(),disclosures=new Map(),obligations=new Set(),stopWitnesses=new Map(),createdTaskIds=new Set(),initialTaskIds=new Set();
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
    const fragment=row.result?.fragment;
    // Current origins are captured at the actual task read, before its row can
    // change. Persisted markers are server-owned history, never parsed bodies.
    const origin=currentEntry&&taskFragmentOrigins.get(fragment?.id)||persistedTaskFragment(row);
    if(origin&&plainObject(fragment)&&typeof fragment.data==='string') {
      const {data,...metadata}=fragment;
      row.pendingTaskFragment={version:1,chainId:fragment.id,taskId:origin.taskId,updatedAt:origin.updatedAt};
      row.result={...row.result,fragment:{...metadata,dataChars:data.length,dataBytes:Buffer.byteLength(data,'utf8')},
        notice:'Pending-task fragment body is not repeated in saved execution history. Full task intent, originals and source context remain retained separately.'};
    } else if(row.tool==='read_pending_task'&&!fragment&&row.result?.alreadyRead!==true)row.result={status:row.result?.status,taskId:row.result?.task?.uuid,
      updatedAt:row.result?.task?.updated_at,notice:'Full original task context is retained separately; do not recursively duplicate prior execution history.'};
    return row;
  }
  function mergeHistory(previous,entries,ownedInputs) {
    const rows=[...(previous||[]).map(entry=>persistedTaskFragment(entry)?historyCopy(entry):entry),...entries.map(entry=>{
      const row=historyCopy({...entry,cycleId:entry.cycleId||cycle.id},true,ownedInputs);
      if(row.kind==='deterministic_result')row.result={status:row.result?.status,taskCount:row.result?.context?.taskCount,
        taskIds:row.result?.inputIds,notice:'Actual API responses are retained in their preceding api_response entries.'};
      return row;
    })];
    return [...new Map(rows.map((row,index)=>[row.cycleId&&row.sequence?`${row.cycleId}/${row.sequence}`:`legacy/${index}`,row])).values()];
  }
  const scope=()=>[...getAllowedSourceIds()];
  const requireCycle=context=>cycle&&context?.principal===principal&&!context.signal?.aborted;
  const uniqueInputs=rows=>[...new Map(rows.map(row=>[row.uuid,row])).values()];
  const currentCycleTask=task=>touched.has(task.uuid)||task.info.inputs.some(input=>cycle.inputs.some(row=>row.uuid===input.uuid));
  const knownParticipation=task=>task?.info?.request?.operation==='participation'&&mapPersonId(task.info.request.personId)
    &&['club','member'].includes(task.info.request.calendarKind)&&typeof task.info.request.calendarEventId==='string'
    &&task.info.request.calendarEventId.length>=5&&task.info.request.calendarEventId.length<=1024;
  const latch=task=>{if(currentCycleTask(task)&&knownParticipation(task))obligations.add(task.uuid);};
  const grantRead=async(task,signal)=>{
    await bindTask(task,signal);
    if(receipts.get(task.uuid)?.updatedAt!==task.updated_at)receipts.set(task.uuid,{readAt:cycle.getExecutionLog().length,updatedAt:task.updated_at});
  };
  const disclose=(task,readAt,fragmentId)=>disclosures.set(task.uuid,{cycleId:cycle.id,phase,principal,snapshot:canonicalJson(task),readAt,fragmentId});
  const disclosed=task=>{
    const previous=disclosures.get(task.uuid);
    if(previous?.cycleId!==cycle.id||previous.phase!==phase||previous.principal!==principal
      ||previous.snapshot!==canonicalJson(task))return false;
    // Generated data and bind receipts alone do not establish that the model
    // received it. Require its exact successful result in this phase's log.
    const history=cycle.getExecutionLog().slice(previous.readAt),serialized=canonicalJson({status:'ready',task});
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
  const manifest=()=>[...tasks.values()].sort((a,b)=>Number(currentCycleTask(b))-Number(currentCycleTask(a))
    ||Number(b.info.request?.operation==='participation')-Number(a.info.request?.operation==='participation'))
    .map(task=>Object.fromEntries(Object.entries({uuid:task.uuid,currentCycle:currentCycleTask(task),summary:[...(task.info.request?.summary||'Deferred source work')].slice(0,100).join(''),summaryTruncated:[...(task.info.request?.summary||'')].length>100,operation:task.info.request?.operation,
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
  function selectParticipationTasks({context,calendarKind,calendarEventId,changes},requireRead=true) {
    if(!requireCycle(context)||phase!=='followup'||!Array.isArray(context.inputIds)||!Array.isArray(changes)
      ||context.inputIds.length!==changes.length||!changes.length||new Set(context.inputIds).size!==context.inputIds.length
      ||new Set(changes.map(change=>change.personId)).size!==changes.length)return null;
    const selected=[];
    for(const taskId of context.inputIds) {
      const task=tasks.get(taskId),receipt=receipts.get(taskId),request=task?.info?.request;
      if(!current(task)||!knownParticipation(task)||requireRead&&receipt?.updatedAt!==task.updated_at
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
    if(receipts.get(task.uuid)?.updatedAt===task.updated_at)return null;
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
    if(phase==='followup'&&!identity&&request.operation==='participation'
      &&['club','member'].includes(request.calendarKind)&&typeof request.calendarEventId==='string'&&request.calendarEventId.length>=5) {
      // A summary rewrite is not a second participation task. Check only tasks
      // actually read/bound by this call, with exact evidence and known targets;
      // do not merge distinct work or silently repair an omitted update ID.
      const snapshot=rows=>canonicalJson([...rows].sort((a,b)=>a.uuid.localeCompare(b.uuid)));
      const originalsSnapshot=snapshot(originals);
      for(const id of context.inputIds) {
        const task=tasks.get(id),receipt=receipts.get(id),prior=task?.info?.request;
        if(task?.uuid!==uuid&&receipt?.updatedAt===task?.updated_at&&current(task)
          &&prior.operation==='participation'&&prior.calendarKind===request.calendarKind
          &&prior.calendarEventId===request.calendarEventId&&prior.personId===request.personId
          &&prior.buildingId===request.buildingId&&snapshot(task.info.inputs)===originalsSnapshot)
          return {status:'invalid_request',reason:'existing_task_requires_update'};
      }
    }
    const previous=tasks.get(uuid);
    if(previous&&!current(previous))return {status:'forbidden'};
    const taskInputs=uniqueInputs([...(previous?.info.inputs||[]),...structuredClone(originals)]);
    const newThisCycle=createdTaskIds.has(uuid)||!previous&&!initialTaskIds.has(uuid);
    const info={version:1,sourceIds:[...new Set([...(previous?.info.sourceIds||[]),...dependencies])],references:references({previous:previous?.info.references,originals,executionHistory,batchContext:cycle.batchContext,observedReferences}),inputs:taskInputs,request:structuredClone(request),
      batchContext:structuredClone(cycle.batchContext??{}),executionHistory:mergeHistory(previous?.info.executionHistory,executionHistory,newThisCycle?taskInputs:undefined)};
    const result=await taskStore.save({leaseToken:cycle.leaseToken,allowedSourceIds:scope(),task:{uuid,info},
      ...(previous?{expectedUpdatedAt:previous.updated_at}:{}),signal:context.signal});
    if(result.status==='ready'){if(newThisCycle)createdTaskIds.add(uuid);tasks.set(uuid,result.task);disclosures.delete(uuid);touched.add(uuid);stopWitnesses.delete(uuid);latch(result.task);}
    return result.status==='ready'?{status:'ready',taskId:uuid,updated_at:result.task.updated_at,persisted:true}:{status:result.status};
  }
  const tools=[
    {...definition('defer_task','Save only a genuine unfinished source-supported action or essential unresolved interpretation needed for one. Confirmed no-change/already-satisfied inputs are directly handled: never create a NEW task as a processing receipt, audit/archive or record of a handled decision. summary and operation are required for new tasks AND updates; optional fields are taskId, calendarEventId, calendarKind, personId and buildingId only. The runtime retains supporting originals, observed context and actual execution history; do not supply extra context fields. To update, read_pending_task first and bind its current task ref or exact UUID in inputIds and taskId. Saving progress does not resolve the task or prove a source fact.',taskProperties,['summary','operation']),
      execute:(args,context)=>save(args,context)},
    {...definition('read_pending_task','Read only the saved task from the eligible cache snapshot, including original channel/speaker/context and prior outcomes. Bind its own task ref or UUID in inputIds for this read and every fragment continuation; read every piece before acting. This performs no live Discord/Gmail/Calendar checks. After reading, choose ordinary source, Calendar, identity or map tools as needed. Untouched tasks survive automatically.',{taskId:{type:'string',minLength:36,maxLength:36}},['taskId'],true),
      execute:async(args,context)=>{
        const task=tasks.get(args.taskId);
        if(!requireCycle(context)||!current(task))return {status:'forbidden'};
        if(!context.inputIds?.includes(task.uuid))return {status:'invalid_request',reason:'pending_task_fragment_scope',taskId:task.uuid,
          message:'Read this saved task using its own task ID in inputIds.'};
        // Reuse only complete disclosure of this entire exact cache snapshot in
        // this phase. This does not bind a task again or refresh any read proof.
        if(disclosed(task))return {status:'ready',alreadyRead:true,taskId:task.uuid,updated_at:task.updated_at,
          request:Object.fromEntries(['operation','calendarKind','calendarEventId','personId','buildingId'].filter(key=>Object.hasOwn(task.info.request,key)).map(key=>[key,structuredClone(task.info.request[key])])),notice:'This exact task snapshot was fully read earlier in this phase. Reuse its earlier full data; no new read/action proof.'};
        const readAt=cycle.getExecutionLog().length,result=fragments.bound({status:'ready',task:structuredClone(task)});
        if(result.fragment?.encoding==='json-fragment'&&validUuid(result.fragment.id)) {
          if(receipts.get(task.uuid)?.updatedAt!==task.updated_at)receipts.delete(task.uuid);
          taskFragmentOrigins.set(result.fragment.id,{taskId:task.uuid,updatedAt:task.updated_at,cycleId:cycle.id,phase,snapshot:canonicalJson(task),readAt,nextOffset:result.fragment.nextOffset,
            totalChars:result.fragment.totalChars,offsets:new Set([0]),complete:false});
        } else {await grantRead(task,context.signal);disclose(task,readAt);}
        return result;
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
        const verified=verifyResolution?await verifyResolution({task,outcome:args.outcome,history:log,signal:context.signal}):args.outcome==='completed'&&successful;
        if(!verified)return {status:'invalid_request',reason:'confirmed_outcome_required'};
        const result=await taskStore.resolve({leaseToken:cycle.leaseToken,allowedSourceIds:scope(),taskId:task.uuid,expectedUpdatedAt:task.updated_at,signal:context.signal});
        if(result.status==='ready'){tasks.delete(task.uuid);receipts.delete(task.uuid);disclosures.delete(task.uuid);touched.delete(task.uuid);obligations.delete(task.uuid);stopWitnesses.delete(task.uuid);createdTaskIds.delete(task.uuid);}
        return result;
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
      message:'Continue this saved task fragment using its owner task ID in inputIds.'};
    if(args.offset!==chain.nextOffset&&!chain.offsets.has(args.offset))return {status:'invalid_request',reason:'pending_task_fragment_offset',taskId:chain.taskId,
      nextOffset:chain.nextOffset,message:'Continue with the returned nextOffset for this task.'};
    const result=await read(args,context),part=result?.fragment;
    if(result?.status!=='ready'||part?.id!==args.id||part.offset!==args.offset||part.totalChars!==chain.totalChars
      ||typeof part.data!=='string'||(part.nextOffset===null?part.offset+part.data.length!==part.totalChars:part.nextOffset!==part.offset+part.data.length))return {status:'invalid_request'};
    if(args.offset===chain.nextOffset) {
      chain.offsets.add(args.offset);chain.nextOffset=part.nextOffset;
      if(part.nextOffset===null) {await grantRead(task,context.signal);chain.complete=true;disclose(task,chain.readAt,args.id);}
    }
    return result;
  }
  const pipeline={
    async validateInitialFinish({principal:actor,signal,handledInputIds,noChangeInputIds=[]}) {
      if(!requireCycle({principal:actor,signal})||phase!=='initial')return {status:'forbidden'};
      const claimed=new Map(cycle.inputs.map(input=>[input.uuid,input]));
      if(!Array.isArray(handledInputIds)||!Array.isArray(noChangeInputIds)
        ||new Set(handledInputIds).size!==handledInputIds.length||new Set(noChangeInputIds).size!==noChangeInputIds.length
        ||handledInputIds.some(id=>!claimed.has(id))||noChangeInputIds.some(id=>!handledInputIds.includes(id)))
        return {status:'invalid_request',reason:'invalid_completion_disposition'};
      const covered=new Set();
      for(const input of getInitialWriteCoverage())if(claimed.has(input?.uuid)
        &&canonicalJson(input)===canonicalJson(claimed.get(input.uuid)))covered.add(input.uuid);
      if(tasks.size) {
        const latest=await taskStore.list({leaseToken:cycle.leaseToken,allowedSourceIds:scope(),signal});
        if(latest?.status!=='ready'||!Array.isArray(latest.tasks))return {status:'unavailable'};
        for(const [id,task] of tasks) {
          const matches=latest.tasks.filter(row=>row.uuid===id),fresh=matches[0];
          if(matches.length!==1||!current(fresh)||!current(task)||fresh.updated_at!==task.updated_at
            ||fresh.created_at!==task.created_at||fresh.expires_at!==task.expires_at||canonicalJson(fresh.info)!==canonicalJson(task.info))continue;
          for(const input of fresh.info.inputs)if(claimed.has(input.uuid)
            &&canonicalJson(input)===canonicalJson(claimed.get(input.uuid)))covered.add(input.uuid);
        }
      }
      if(noChangeInputIds.some(id=>covered.has(id)))return {status:'invalid_request',reason:'invalid_completion_disposition'};
      const missing=handledInputIds.filter(id=>!covered.has(id)&&!noChangeInputIds.includes(id));
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
      const candidates=[...obligations].filter(id=>followupScope.has(id)&&tasks.has(id));
      if(!candidates.length)return {status:'ready'};
      // Saved-cache freshness only: this check never reads a source/provider.
      const latest=await taskStore.list({leaseToken:cycle.leaseToken,allowedSourceIds:scope(),signal:context.signal});
      if(latest?.status!=='ready'||!Array.isArray(latest.tasks))return {status:'unavailable'};
      const remaining=[];
      for(const id of candidates) {
        let task=tasks.get(id);const fresh=latest.tasks.find(row=>row.uuid===id);
        if(!fresh||!current(fresh)) {remaining.push(id);continue;}
        if(task.updated_at!==fresh.updated_at||canonicalJson(task.info)!==canonicalJson(fresh.info)) {
          tasks.set(id,fresh);receipts.delete(id);stopWitnesses.delete(id);task=fresh;
        }
        if(receipts.get(id)?.updatedAt!==task.updated_at||![...(stopWitnesses.get(id)?.values()||[])].some(witness=>witness.updatedAt===task.updated_at&&witness.info===canonicalJson(task.info)))remaining.push(id);
      }
      return remaining.length?{status:'pending',reason:'unfinished_participation',taskIds:remaining.slice(0,20),remainingCount:remaining.length,
        message:'Current-cycle participation work still needs its complete current task read and action/resolution, or an actual verified dependency blocker. Continue these tasks before finish_batch.'}:{status:'ready'};
    },
    recordApiResult:entry=>cycle.recordExecution({kind:'api_response',stage:'followup',...entry}),
    async beginCycle({leaseToken,inputs,recordExecution,getExecutionLog,signal}) {
      tasks.clear();touched.clear();receipts.clear();taskFragmentOrigins.clear();disclosures.clear();obligations.clear();stopWitnesses.clear();createdTaskIds.clear();initialTaskIds.clear();followupScope.clear();phase='initial';
      cycle={id:randomUUID(),leaseToken,inputs:structuredClone(inputs),recordExecution,getExecutionLog};
      if(taskStore.configured===false)throw Error('not_configured');
      const result=await taskStore.list({leaseToken,allowedSourceIds:scope(),signal});
      if(result.status!=='ready')throw Error('preflight_failed');
      for(const task of result.tasks){initialTaskIds.add(task.uuid);if(current(task))tasks.set(task.uuid,task);}
    },
    getInitialTaskCoverage() {
      if(!cycle||phase!=='initial')return [];
      return cycle.inputs.map(input=>({inputId:input.uuid,taskCount:[...tasks.values()].filter(task=>current(task)
        &&task.info.inputs.some(saved=>canonicalJson(saved)===canonicalJson(input))).length})).filter(row=>row.taskCount>0);
    },
    setBatchContext(context){if(cycle)cycle.batchContext=structuredClone(context);},
    async afterInitial({handledInputIds,inputs,signal,executionLog}) {
      const context={principal,inputIds:inputs.map(row=>row.uuid),signal};
      const latest=await taskStore.list({leaseToken:cycle.leaseToken,allowedSourceIds:scope(),signal});
      if(latest.status!=='ready')return latest;
      tasks.clear();for(const task of latest.tasks)if(current(task))tasks.set(task.uuid,task);
      // At an initial model cap, unfinished originals remain queued. Persist a
      // checkpoint only when no current task already retains that exact original.
      // Reusing saved work never marks an omitted queue input completed.
      for(const input of inputs.filter(row=>!handledInputIds.includes(row.uuid))) {
        if([...tasks.values()].some(task=>current(task)&&task.info.inputs.some(saved=>canonicalJson(saved)===canonicalJson(input))))continue;
        const result=await save({summary:'Unfinished initial source interpretation',operation:'source_review'},context,
          {inputs:[input],identity:taskId(`unfinished:${input.uuid}`),history:executionLog});
        if(result.status!=='ready')return result;
      }
      const result=await taskStore.list({leaseToken:cycle.leaseToken,allowedSourceIds:scope(),signal});
      if(result.status!=='ready')return result;
      tasks.clear();for(const task of result.tasks)if(current(task))tasks.set(task.uuid,task);
      followupScope=new Set(tasks.keys());for(const task of tasks.values())latch(task);
      phase='followup';disclosures.clear();
      return {status:'ready',inputIds:[...tasks.keys()],followupRequired:tasks.size>0,context:{tasks:manifest(),taskCount:tasks.size,
        executionHistory:fragments.bound({status:'ready',history:cycle.getExecutionLog().filter(row=>['api_response','api_result'].includes(row.kind)),
          notice:'Only deterministic API execution evidence is included here. Fully read selected saved tasks for original intent and retained initial source/tool context; the initial transcript may not remain in this model conversation.'}),
        apiResults:{status:'ready',notice:'See the separately recorded sync_calendars_to_map tool result; phase transition performs no business calls.'},
        notice:'All eligible tasks are listed: current-cycle work first, participation first within each group. Use fully read saved task originals/context and the actual API results; the initial transcript may not be visible. Read selected tasks with read_pending_task; full saved evidence and fragments remain available losslessly. Do not load unrelated task histories. Cache reads performed no live checks. Resolve only after confirmed action; untouched tasks remain unchanged.'}};
    },
    async finishCycle({signal,executionLog}) {
      // Only tasks with confirmed new outcomes are checkpointed; unrelated task
      // timestamps/JSON remain byte-for-byte unchanged.
      for(const task of tasks.values()) {
        if(!current(task))continue;
        if(touched.has(task.uuid)) {
          const observedReferences=getEvidenceReferences();
          const info={...task.info,executionHistory:mergeHistory(task.info.executionHistory,executionLog,createdTaskIds.has(task.uuid)?task.info.inputs:undefined),references:references({info:task.info,executionLog,observedReferences}),
            sourceIds:[...new Set([...task.info.sourceIds,...sourceIds({executionLog,observedReferences})])]};
          const result=await taskStore.save({leaseToken:cycle.leaseToken,allowedSourceIds:scope(),task:{uuid:task.uuid,info},expectedUpdatedAt:task.updated_at,signal});
          if(result.status!=='ready')return result;
          tasks.set(task.uuid,result.task);continue;
        }
        if(!receipts.has(task.uuid))continue;
        const newHistory=executionLog.slice(receipts.get(task.uuid).readAt).filter(row=>row.kind==='tool_result'&&row.inputIds?.includes(task.uuid)&&row.tool!=='read_pending_task');
        if(!newHistory.length)continue;
        const mergedHistory=mergeHistory(task.info.executionHistory,newHistory,createdTaskIds.has(task.uuid)?task.info.inputs:undefined),observedReferences=getEvidenceReferences();
        const info={...task.info,executionHistory:mergedHistory,sourceIds:[...new Set([...task.info.sourceIds,...sourceIds({mergedHistory,observedReferences})])],
          references:references({info:task.info,mergedHistory,observedReferences})};
        const result=await taskStore.save({leaseToken:cycle.leaseToken,allowedSourceIds:scope(),task:{uuid:task.uuid,info},expectedUpdatedAt:task.updated_at,signal});
        if(result.status!=='ready')return result;
        tasks.set(task.uuid,result.task);
      }
      return {status:'ready'};
    },
  };
  return {pipeline,tools,participationTasks,verifyParticipationTasks,participationDependencies,recordParticipationOutcome,invalidateParticipationOutcome,readTaskFragment,
    getBoundOriginals:context=>requireCycle(context)&&Array.isArray(context.inputIds)
      &&context.inputIds.every(id=>phase==='initial'?cycle.inputs.some(row=>row.uuid===id):followupScope.has(id))
      ?structuredClone(contextInputs(context.inputIds)):null,
    get phase(){return phase;},cleanup(){cycle=undefined;tasks.clear();receipts.clear();touched.clear();taskFragmentOrigins.clear();disclosures.clear();obligations.clear();stopWitnesses.clear();createdTaskIds.clear();initialTaskIds.clear();followupScope.clear();},
    getExecutionLog:()=>cycle?.getExecutionLog()??[],get taskCount(){return tasks.size;}};
}
